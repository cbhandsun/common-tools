"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { assertJob, assertNonEmptyString, assertTransition, containsControlCharacter, TERMINAL_JOB_STATUSES } = require("../capability-contracts");

const RUNTIME_VERSION = "0.1.0";
const MANIFEST_ROOT = path.resolve(__dirname, "..", "capability-manifests");
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const RUNTIME_RANGE_PATTERN = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/;
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

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

function canonicalManifest(value) { return JSON.stringify(Object.fromEntries(Object.keys(value).filter((key) => key !== "contentSha256" && !(key === "deprecation" && value[key] == null)).sort().map((key) => [key, value[key]]))); }
function manifestDigest(value) { return crypto.createHash("sha256").update(canonicalManifest(value)).digest("hex"); }
function validateTeamDefinition(value, capability) {
  const keys = value && typeof value === "object" && !Array.isArray(value) ? Object.keys(value).sort() : [];
  if (!value || typeof value !== "object" || Array.isArray(value) || !["acceptedUploadMediaTypes,oauthScope", "acceptedUploadMediaTypes,deployment,oauthScope"].includes(keys.join(",")) || typeof value.oauthScope !== "string" || value.oauthScope !== `common-tools:capability:${capability}` || !Array.isArray(value.acceptedUploadMediaTypes) || !value.acceptedUploadMediaTypes.length || value.acceptedUploadMediaTypes.some((mediaType) => typeof mediaType !== "string" || !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(mediaType)) || new Set(value.acceptedUploadMediaTypes).size !== value.acceptedUploadMediaTypes.length) throw new Error("capability team definition is invalid");
  let deployment;
  if (value.deployment !== undefined) {
    const candidate = value.deployment;
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || Object.keys(candidate).sort().join(",") !== "imageKind,workerCommand,workerProfile,workerService" || !/^team-worker-[a-z0-9-]+$/.test(candidate.workerProfile || "") || !/^[a-z][a-z0-9-]*-worker$/.test(candidate.workerService || "") || !["remote-mcp", "image-worker"].includes(candidate.imageKind) || !/^packages\/remote-mcp-server\/bin\/common-tools-team(?:-[a-z0-9-]+)?-worker\.js$/.test(candidate.workerCommand || "")) throw new Error("capability team deployment is invalid");
    deployment = Object.freeze({ workerProfile: candidate.workerProfile, workerService: candidate.workerService, imageKind: candidate.imageKind, workerCommand: candidate.workerCommand });
  }
  return Object.freeze({ oauthScope: value.oauthScope, acceptedUploadMediaTypes: Object.freeze([...value.acceptedUploadMediaTypes]), ...(deployment ? { deployment } : {}) });
}
function parseManifestVersion(value) {
  const match = SEMVER_PATTERN.exec(value || "");
  return match ? match[0].split(".").map(Number) : null;
}
function compareVersions(left, right) {
  const leftParts = Array.isArray(left) ? left : parseManifestVersion(left);
  const rightParts = Array.isArray(right) ? right : parseManifestVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}
function parseRuntimeRange(value) {
  const match = RUNTIME_RANGE_PATTERN.exec(value || "");
  if (!match) return null;
  const lower = parseManifestVersion(match[1]);
  const upper = parseManifestVersion(match[2]);
  if (!lower || !upper || compareVersions(lower, upper) !== -1) return null;
  return Object.freeze({ lower: Object.freeze(lower), upper: Object.freeze(upper), value });
}
function runtimeSatisfiesRange(runtimeVersion, range) {
  const runtime = parseManifestVersion(runtimeVersion);
  const parsedRange = typeof range === "string" ? parseRuntimeRange(range) : range;
  if (!runtime || !parsedRange || !Array.isArray(parsedRange.lower) || !Array.isArray(parsedRange.upper)) return false;
  return compareVersions(runtime, parsedRange.lower) >= 0 && compareVersions(runtime, parsedRange.upper) === -1;
}
function validateDeprecation(value, capability) {
  if (value == null) return null;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("capability deprecation is invalid");
  const keys = Object.keys(value).sort();
  if ((keys.join(",") !== "announcedIn,message,removalAfter" && keys.join(",") !== "announcedIn,message,removalAfter,replacement") || !SEMVER_PATTERN.test(value.announcedIn || "") || !SEMVER_PATTERN.test(value.removalAfter || "") || !Array.isArray(parseManifestVersion(value.announcedIn)) || !Array.isArray(parseManifestVersion(value.removalAfter)) || compareManifestVersions(value.removalAfter, value.announcedIn) !== 1 || typeof value.message !== "string" || !value.message.trim() || value.message.length > 280 || containsControlCharacter(value.message)) throw new Error("capability deprecation is invalid");
  if (value.replacement !== undefined && (typeof value.replacement !== "string" || !CAPABILITY_ID_PATTERN.test(value.replacement) || value.replacement === capability)) throw new Error("capability deprecation is invalid");
  return Object.freeze({ announcedIn: value.announcedIn, removalAfter: value.removalAfter, message: value.message.trim(), ...(value.replacement === undefined ? {} : { replacement: value.replacement }) });
}
function validateDependencies(value, capability) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16 || value.some((dependency) => typeof dependency !== "string" || !CAPABILITY_ID_PATTERN.test(dependency) || dependency === capability) || new Set(value).size !== value.length) throw new Error("capability dependencies are invalid");
  return Object.freeze([...value].sort());
}
function validateCapabilityManifest(value, { runtimeVersion = RUNTIME_VERSION } = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("capability manifest is invalid");
  const capability = assertNonEmptyString(value.capability, "manifest.capability");
  const expectedKeys = ["capability", "contentSha256", "manifestVersion", "minimumRuntimeVersion", "requiredWorkerProfile", "team", "toolNames", "version"];
  if (Object.hasOwn(value, "deprecation")) expectedKeys.push("deprecation");
  if (Object.hasOwn(value, "dependencies")) expectedKeys.push("dependencies");
  const runtimeRange = parseRuntimeRange(value.minimumRuntimeVersion);
  if (Object.keys(value).sort().join(",") !== expectedKeys.sort().join(",") || !CAPABILITY_ID_PATTERN.test(capability) || value.manifestVersion !== 1 || !SEMVER_PATTERN.test(value.version || "") || !Array.isArray(value.toolNames) || value.toolNames.some((tool) => typeof tool !== "string" || !tool) || !runtimeRange || typeof value.requiredWorkerProfile !== "string" || !/^[a-f0-9]{64}$/.test(value.contentSha256 || "")) throw new Error("capability manifest is invalid");
  if (!runtimeSatisfiesRange(runtimeVersion, runtimeRange)) throw new Error(`capability manifest requires an incompatible Runtime version: ${capability}`);
  const team = validateTeamDefinition(value.team, capability);
  const deprecation = validateDeprecation(value.deprecation, capability);
  const dependencies = validateDependencies(value.dependencies, capability);
  if (value.contentSha256 !== manifestDigest(value)) throw new Error(`capability manifest hash mismatch: ${capability}`);
  return Object.freeze({ manifestVersion: value.manifestVersion, capability, version: value.version, toolNames: Object.freeze([...value.toolNames]), minimumRuntimeVersion: value.minimumRuntimeVersion, requiredWorkerProfile: value.requiredWorkerProfile, team, dependencies, deprecation, contentSha256: value.contentSha256 });
}
function assertManifestDependencyGraph(manifests) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  const visited = new Set();
  const visiting = new Set();
  const visit = (capability) => {
    if (visited.has(capability)) return;
    if (visiting.has(capability)) throw new Error("capability dependency cycle is invalid");
    const manifest = manifests.get(capability);
    if (!manifest) throw new Error("capability dependency is not installed");
    visiting.add(capability);
    for (const dependency of manifest.dependencies || []) {
      if (!manifests.has(dependency)) throw new Error("capability dependency is not installed");
      visit(dependency);
    }
    visiting.delete(capability);
    visited.add(capability);
  };
  for (const capability of manifests.keys()) visit(capability);
  return true;
}
function loadCapabilityManifests(root = MANIFEST_ROOT) {
  const manifests = new Map();
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "capability.manifest.json");
    if (!fs.existsSync(file)) continue;
    const manifest = validateCapabilityManifest(JSON.parse(fs.readFileSync(file, "utf8")));
    if (manifest.capability !== entry.name || manifests.has(manifest.capability)) throw new Error("capability manifest identity is invalid");
    manifests.set(manifest.capability, manifest);
  }
  if (!manifests.has("image-to-editable")) throw new Error("image-to-editable manifest is required");
  for (const manifest of manifests.values()) if (manifest.deprecation?.replacement && !manifests.has(manifest.deprecation.replacement)) throw new Error("capability deprecation replacement is not installed");
  assertManifestDependencyGraph(manifests);
  return manifests;
}
const CAPABILITY_MANIFESTS = loadCapabilityManifests();
const SUPPORTED_CAPABILITIES = Object.freeze([...CAPABILITY_MANIFESTS.keys()].sort());
const DEFAULT_CAPABILITIES = Object.freeze(["image-to-editable"]);
const TEAM_CAPABILITY_DEFINITIONS = Object.freeze(Object.fromEntries(SUPPORTED_CAPABILITIES.map((capability) => [capability, CAPABILITY_MANIFESTS.get(capability).team])));
function manifestSummary(capability) { const manifest = CAPABILITY_MANIFESTS.get(capability); if (!manifest) throw new Error("capability is not installed"); return { version: manifest.version, contentSha256: manifest.contentSha256, requiredWorkerProfile: manifest.requiredWorkerProfile, dependencies: manifest.dependencies, deprecation: manifest.deprecation }; }

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
  create({ id, capability, idempotencyKey, expiresAt }) {
    const existing = this.findByIdempotency(capability, idempotencyKey);
    if (existing) return existing;
    const now = new Date().toISOString();
    const job = { id, capability, ownerId: this.ownerId, idempotencyKey, status: "queued", attempt: 0, maxAttempts: 1, createdAt: now, updatedAt: now, expiresAt, artifacts: [] };
    this.write(job);
    return job;
  }
  get(id) { const file = this.jobPath(id); if (!fs.existsSync(file)) return null; return JSON.parse(fs.readFileSync(file, "utf8")); }
  findByIdempotency(capability, idempotencyKey) {
    for (const entry of fs.readdirSync(this.jobsDir)) {
      if (!entry.endsWith(".json")) continue;
      const job = JSON.parse(fs.readFileSync(path.join(this.jobsDir, entry), "utf8"));
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
  write(job) {
    assertJob(job);
    const target = this.jobPath(job.id);
    const temporary = `${target}.${process.pid}.${crypto.randomUUID()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(job, null, 2), { encoding: "utf8", mode: 0o600 });
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
function compareManifestVersions(left, right) {
  return compareVersions(left, right);
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

module.exports = { ...require("./execution-mode"), CAPABILITY_MANIFESTS, DEFAULT_CAPABILITIES, RUNTIME_VERSION, SUPPORTED_CAPABILITIES, TEAM_CAPABILITY_DEFINITIONS, JobStore, assertManifestDependencyGraph, canonicalManifest, compareManifestVersions, compareVersions, effectivePluginConfig, insideRoot, loadCapabilityManifests, loadPluginConfig, manifestIdentityMatches, parseManifestVersion, parseRuntimeRange, readPluginConfig, readProjectCapabilityScope, resolvedCapabilityDependencies, rollbackPluginConfig, runtimeSatisfiesRange, setCapabilityEnabled, setEnabledCapabilities, sha256File, upgradePluginConfig, validateCapabilityManifest, validateDependencies, validateDeprecation };
