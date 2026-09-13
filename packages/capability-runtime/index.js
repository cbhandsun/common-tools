"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { assertJob, assertJobRepository, assertNonEmptyString, assertTransition, TERMINAL_JOB_STATUSES, validateJobListFilter } = require("../capability-contracts");
const {
  CAPABILITY_MANIFESTS,
  RUNTIME_VERSION,
  assertManifestDependencyGraph,
  canonicalManifest,
  compareManifestVersions,
  compareVersions,
  loadCapabilityManifests,
  parseManifestVersion,
  parseRuntimeRange,
  runtimeSatisfiesRange,
  validateCapabilityManifest,
  validateDependencies,
  validateDeprecation,
  validateModuleSource
} = require("../capability-manifests");
const executionMode = require("./execution-mode");
const { SqliteJobRepository, isSqliteJobRepositoryAvailable } = require("./sqlite-job-repository");

function insideRoot(root, candidate) {
  const resolvedRoot = fs.realpathSync.native(root);
  const resolvedCandidate = resolveFromRealAncestor(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);
  if (relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) return resolvedCandidate;
  throw new Error("path is outside the approved root");
}

function resolveFromRealAncestor(candidate) {
  let cursor = path.resolve(candidate);
  const missingSegments = [];
  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error("path has no resolvable ancestor");
    missingSegments.unshift(path.basename(cursor));
    cursor = parent;
  }
  return path.resolve(fs.realpathSync.native(cursor), ...missingSegments);
}

function sha256File(file) {
  const digest = crypto.createHash("sha256");
  digest.update(fs.readFileSync(file));
  return digest.digest("hex");
}

const SUPPORTED_CAPABILITIES = Object.freeze([...CAPABILITY_MANIFESTS.keys()].sort());
const LOCAL_CAPABILITIES = Object.freeze(SUPPORTED_CAPABILITIES.filter((capability) => CAPABILITY_MANIFESTS.get(capability).execution.localSupported));
const DEFAULT_CAPABILITIES = Object.freeze(["image-to-editable"]);
const TEAM_CAPABILITY_DEFINITIONS = Object.freeze(Object.fromEntries(SUPPORTED_CAPABILITIES.map((capability) => [capability, CAPABILITY_MANIFESTS.get(capability).team])));
function manifestSummary(capability) { const manifest = CAPABILITY_MANIFESTS.get(capability); if (!manifest) throw new Error("capability is not installed"); return { version: manifest.version, contentSha256: manifest.contentSha256, requiredWorkerProfile: manifest.requiredWorkerProfile, execution: manifest.execution, dependencies: manifest.dependencies, deprecation: manifest.deprecation }; }
function resolveExecutionRoute(options = {}) {
  return executionMode.resolveExecutionRoute({ ...options, localCapabilities: options.localCapabilities || LOCAL_CAPABILITIES });
}

function replaceAtomically(temporaryFile, destination) {
  let lastError;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      fs.renameSync(temporaryFile, destination);
      return;
    } catch (error) {
      lastError = error;
      if (!(error && (error.code === "EPERM" || error.code === "EBUSY")) || attempt === 5) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20 * (attempt + 1));
    }
  }
  throw lastError;
}

class JobStore {
  constructor({ root, ownerId }) {
    const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
    fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
    this.root = insideRoot(requestedRoot, requestedRoot);
    this.ownerId = assertNonEmptyString(ownerId, "ownerId");
    this.jobsDir = path.join(this.root, "jobs");
    fs.mkdirSync(this.jobsDir, { recursive: true });
  }
  jobPath(id) { return insideRoot(this.jobsDir, path.join(this.jobsDir, `${assertNonEmptyString(id, "job id")}.json`)); }
  readOwnedJob(file) {
    const job = assertJob(JSON.parse(fs.readFileSync(file, "utf8")));
    return job.ownerId === this.ownerId ? job : null;
  }
  create({ id, capability, idempotencyKey, expiresAt }) {
    const existing = this.findByIdempotency(capability, idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const job = { id, capability, ownerId: this.ownerId, idempotencyKey, status: "queued", attempt: 0, maxAttempts: 1, createdAt: now, updatedAt: now, expiresAt, artifacts: [] };
    this.write(job);
    return job;
  }
  get(id) { const file = this.jobPath(id); if (!fs.existsSync(file)) return null; return this.readOwnedJob(file); }
  findByIdempotency(capability, idempotencyKey) {
    for (const entry of fs.readdirSync(this.jobsDir)) {
      if (!entry.endsWith(".json")) continue;
      const job = this.readOwnedJob(path.join(this.jobsDir, entry));
      if (!job) continue;
      if (job.capability === capability && job.idempotencyKey === idempotencyKey && !TERMINAL_JOB_STATUSES.has(job.status)) return job;
    }
    return null;
  }
  transition(id, status, extra = {}) {
    const job = this.get(id);
    if (!job) throw new Error("job not found");
    assertTransition(job.status, status);
    const next = { ...job, ...extra, status, updatedAt: new Date().toISOString() };
    this.write(next);
    return next;
  }
  list(filter = {}) {
    const { capability, status, limit } = validateJobListFilter(filter);
    const results = [];
    const entries = fs.readdirSync(this.jobsDir).sort();
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const file = path.join(this.jobsDir, entry);
        const job = this.readOwnedJob(file);
        if (!job) continue;
        if (capability && job.capability !== capability) continue;
        if (status && job.status !== status) continue;
        results.push(Object.freeze(job));
        if (limit != null && results.length >= limit) break;
      } catch {
        // Skip unparseable files
      }
    }
    return Object.freeze(results);
  }
  asJobRepository() {
    assertJobRepository(this, "JobStore");
    return this;
  }
  write(job) {
    const validated = assertJob(job);
    if (validated.ownerId !== this.ownerId) throw new Error("job owner does not match repository owner");
    const target = this.jobPath(validated.id);
    if (fs.existsSync(target)) {
      const existing = assertJob(JSON.parse(fs.readFileSync(target, "utf8")));
      if (existing.ownerId !== this.ownerId) throw new Error("job owner does not match repository owner");
    }
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(validated, null, 2), { encoding: "utf8", mode: 0o600 });
    replaceAtomically(temporary, target);
  }
}

function pluginConfigPath(root) { return insideRoot(root, path.join(root, "plugins.json")); }
function pluginHistoryDir(root) { const history = insideRoot(root, path.join(root, "plugins.history")); fs.mkdirSync(history, { recursive: true, mode: 0o700 }); return history; }
function readProjectCapabilityScope(workspaceRoot) {
  const root = path.resolve(assertNonEmptyString(workspaceRoot, "workspace root"));
  if (!fs.existsSync(root)) return null;
  const rootStat = fs.lstatSync(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error("project workspace is invalid");
  const runtimeDir = path.join(root, ".common-tools");
  if (!fs.existsSync(runtimeDir)) return null;
  const runtimeDirStat = fs.lstatSync(runtimeDir);
  if (runtimeDirStat.isSymbolicLink() || !runtimeDirStat.isDirectory()) throw new Error("project runtime directory is invalid");
  const file = path.join(runtimeDir, "runtime.json");
  if (!fs.existsSync(file)) return null;
  const stat = fs.lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || stat.size > 64 * 1024) throw new Error("project runtime configuration is invalid");
  let value;
  try { value = JSON.parse(fs.readFileSync(file, "utf8")); } catch { throw new Error("project runtime configuration is invalid"); }
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).length !== 1 || !Array.isArray(value.allowedCapabilities) || value.allowedCapabilities.some((capability) => typeof capability !== "string" || !SUPPORTED_CAPABILITIES.includes(capability)) || new Set(value.allowedCapabilities).size !== value.allowedCapabilities.length) throw new Error("project runtime configuration is invalid");
  return resolvedCapabilityDependencies(value.allowedCapabilities);
}
function effectivePluginConfig(stateRoot, workspaceRoot) {
  const config = readPluginConfig(stateRoot);
  const projectScope = readProjectCapabilityScope(workspaceRoot);
  const effectiveCapabilities = Object.freeze(projectScope === null ? [...config.enabledCapabilities] : config.enabledCapabilities.filter((capability) => projectScope.includes(capability)));
  return Object.freeze({ ...config, projectScope, effectiveCapabilities });
}
function resolvedCapabilityDependencies(capabilities, manifests = CAPABILITY_MANIFESTS) {
  if (!Array.isArray(capabilities) || !(manifests instanceof Map) || capabilities.some((capability) => typeof capability !== "string" || !manifests.has(capability))) throw new Error("capability dependencies are invalid");
  const resolved = new Set(capabilities);
  const pending = [...resolved];
  while (pending.length) {
    const capability = pending.pop();
    const manifest = manifests.get(capability);
    if (!manifest) throw new Error("capability dependency is not installed");
    for (const dependency of manifest.dependencies || []) if (!resolved.has(dependency)) { resolved.add(dependency); pending.push(dependency); }
  }
  return Object.freeze([...resolved].sort());
}
function manifestIdentityMatches(recorded, current) {
  const recordedDependencies = Array.isArray(recorded?.dependencies) ? [...recorded.dependencies].sort() : [];
  return recorded?.version === current.version && recorded?.contentSha256 === current.contentSha256 && recorded?.requiredWorkerProfile === current.requiredWorkerProfile && JSON.stringify(recordedDependencies) === JSON.stringify(current.dependencies);
}
function normalizePluginConfig(value, { upgradeCapabilities } = {}) {
  const enabledCapabilities = value?.enabledCapabilities;
  if (!Array.isArray(enabledCapabilities) || enabledCapabilities.some((item) => typeof item !== "string" || !SUPPORTED_CAPABILITIES.includes(item))) throw new Error("plugin config is invalid");
  if (upgradeCapabilities !== undefined && (!(upgradeCapabilities instanceof Set) || [...upgradeCapabilities].some((capability) => !SUPPORTED_CAPABILITIES.includes(capability)))) throw new Error("plugin upgrade capabilities are invalid");
  const enabled = resolvedCapabilityDependencies([...new Set(enabledCapabilities)]);
  const persisted = value.manifests && typeof value.manifests === "object" && !Array.isArray(value.manifests) ? value.manifests : {};
  const manifests = {};
  for (const capability of enabled) {
    const current = manifestSummary(capability);
    const recorded = persisted[capability];
    if (recorded && !manifestIdentityMatches(recorded, current)) {
      const allowed = upgradeCapabilities?.has(capability) === true && compareManifestVersions(current.version, recorded.version) === 1;
      if (!allowed) throw new Error(`installed capability manifest changed: ${capability}`);
    }
    manifests[capability] = current;
  }
  return { configVersion: 1, generation: Number.isSafeInteger(value.generation) && value.generation >= 0 ? value.generation : 0, enabledCapabilities: enabled, manifests };
}
function loadPluginConfig(root) {
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const file = pluginConfigPath(requestedRoot);
  if (!fs.existsSync(file)) return normalizePluginConfig({ enabledCapabilities: [...DEFAULT_CAPABILITIES] });
  return normalizePluginConfig(JSON.parse(fs.readFileSync(file, "utf8")));
}
function readPluginConfig(root) {
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  if (!fs.existsSync(requestedRoot)) return normalizePluginConfig({ enabledCapabilities: [...DEFAULT_CAPABILITIES] });
  if (!fs.statSync(requestedRoot).isDirectory()) throw new Error("plugin configuration root is invalid");
  const file = pluginConfigPath(requestedRoot);
  if (!fs.existsSync(file)) return normalizePluginConfig({ enabledCapabilities: [...DEFAULT_CAPABILITIES] });
  return normalizePluginConfig(JSON.parse(fs.readFileSync(file, "utf8")));
}
function writePluginConfig(root, config) {
  const file = pluginConfigPath(root);
  if (fs.existsSync(file)) { const history = pluginHistoryDir(root); fs.copyFileSync(file, insideRoot(history, path.join(history, `${config.generation - 1}.json`))); }
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  replaceAtomically(temporary, file);
  return loadPluginConfig(root);
}
function setCapabilityEnabled(root, capability, enabled, options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options) || (options.exclusive !== undefined && typeof options.exclusive !== "boolean")) throw new Error("capability enable options are invalid");
  if (typeof enabled !== "boolean") throw new Error("capability enabled state is invalid");
  const exclusive = options.exclusive === true;
  if (exclusive && !enabled) throw new Error("exclusive capability mode is only valid when enabling a capability");
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const config = loadPluginConfig(requestedRoot);
  const normalizedCapability = assertNonEmptyString(capability, "capability");
  if (!SUPPORTED_CAPABILITIES.includes(normalizedCapability)) throw new Error("capability is not installed");
  const next = exclusive ? new Set(resolvedCapabilityDependencies([normalizedCapability])) : new Set(config.enabledCapabilities);
  if (!exclusive && next.has(normalizedCapability) === enabled) return config;
  if (!enabled) {
    const dependent = config.enabledCapabilities.find((candidate) => candidate !== normalizedCapability && resolvedCapabilityDependencies([candidate]).includes(normalizedCapability));
    if (dependent) throw new Error(`capability is required by an enabled capability: ${dependent}`);
  }
  if (enabled) next.add(normalizedCapability); else next.delete(normalizedCapability);
  const normalized = normalizePluginConfig({ generation: config.generation + 1, enabledCapabilities: [...next] });
  if (JSON.stringify(normalized.enabledCapabilities) === JSON.stringify(config.enabledCapabilities)) return config;
  return writePluginConfig(requestedRoot, normalized);
}
function setEnabledCapabilities(root, capabilities) {
  if (!Array.isArray(capabilities) || capabilities.length === 0 || capabilities.some((capability) => typeof capability !== "string" || !capability.trim()) || new Set(capabilities).size !== capabilities.length) throw new Error("capability set is invalid");
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const config = loadPluginConfig(requestedRoot);
  const enabledCapabilities = resolvedCapabilityDependencies(capabilities);
  if (JSON.stringify(enabledCapabilities) === JSON.stringify(config.enabledCapabilities)) return config;
  return writePluginConfig(requestedRoot, normalizePluginConfig({ generation: config.generation + 1, enabledCapabilities }));
}
function upgradePluginConfig(root, capability) {
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  fs.mkdirSync(requestedRoot, { recursive: true, mode: 0o700 });
  const file = pluginConfigPath(requestedRoot);
  if (!fs.existsSync(file)) return loadPluginConfig(requestedRoot);
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const enabled = Array.isArray(raw?.enabledCapabilities) ? raw.enabledCapabilities : [];
  const targets = capability === undefined ? new Set(enabled) : new Set([assertNonEmptyString(capability, "capability")]);
  if ([...targets].some((item) => !SUPPORTED_CAPABILITIES.includes(item))) throw new Error("capability is not installed");
  if ([...targets].some((item) => !enabled.includes(item))) throw new Error("capability is not enabled");
  const next = normalizePluginConfig(raw, { upgradeCapabilities: targets });
  const persisted = raw.manifests && typeof raw.manifests === "object" && !Array.isArray(raw.manifests) ? raw.manifests : {};
  const changed = next.enabledCapabilities.some((item) => persisted[item]?.contentSha256 !== next.manifests[item].contentSha256);
  if (!changed) return normalizePluginConfig(raw);
  return writePluginConfig(requestedRoot, { ...next, generation: next.generation + 1 });
}
function rollbackPluginConfig(root) {
  const requestedRoot = path.resolve(assertNonEmptyString(root, "root"));
  const config = loadPluginConfig(requestedRoot);
  const history = pluginHistoryDir(requestedRoot);
  const historyFile = insideRoot(history, path.join(history, `${config.generation - 1}.json`));
  if (!fs.existsSync(historyFile)) throw new Error("no plugin configuration revision is available for rollback");
  const previous = normalizePluginConfig(JSON.parse(fs.readFileSync(historyFile, "utf8")));
  return writePluginConfig(requestedRoot, normalizePluginConfig({ ...previous, generation: config.generation + 1 }));
}

module.exports = { ...executionMode, CAPABILITY_MANIFESTS, DEFAULT_CAPABILITIES, LOCAL_CAPABILITIES, RUNTIME_VERSION, SUPPORTED_CAPABILITIES, TEAM_CAPABILITY_DEFINITIONS, JobStore, SqliteJobRepository, assertJobRepository, assertManifestDependencyGraph, canonicalManifest, compareManifestVersions, compareVersions, effectivePluginConfig, insideRoot, isSqliteJobRepositoryAvailable, loadCapabilityManifests, loadPluginConfig, manifestIdentityMatches, parseManifestVersion, parseRuntimeRange, readPluginConfig, readProjectCapabilityScope, resolvedCapabilityDependencies, resolveExecutionRoute, rollbackPluginConfig, runtimeSatisfiesRange, setCapabilityEnabled, setEnabledCapabilities, sha256File, upgradePluginConfig, validateCapabilityManifest, validateDependencies, validateDeprecation, validateModuleSource };
