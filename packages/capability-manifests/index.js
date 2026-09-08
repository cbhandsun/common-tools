// @ts-check
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const RUNTIME_VERSION = "0.1.0";
const MANIFEST_ROOT = path.resolve(__dirname);
const SEMVER_PATTERN = /^\d+\.\d+\.\d+$/;
const RUNTIME_RANGE_PATTERN = /^>=(\d+\.\d+\.\d+) <(\d+\.\d+\.\d+)$/;
const CAPABILITY_ID_PATTERN = /^[a-z][a-z0-9-]{2,63}$/;

/** @typedef {Record<string, unknown>} JsonObject */
/** @typedef {Readonly<{lower: readonly number[], upper: readonly number[], value: string}>} RuntimeRange */

/** @param {unknown} value @param {string} label @returns {string} */
function assertNonEmptyString(value, label) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${label} must be a non-empty string`);
  return value.trim();
}

/** @param {unknown} value @param {string} label @returns {asserts value is JsonObject} */
function assertPlainObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
}

/** @param {unknown} value @returns {boolean} */
function containsControlCharacter(value) {
  if (typeof value !== "string") return false;
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code !== undefined && (code <= 0x1f || code === 0x7f)) return true;
  }
  return false;
}

/** @param {unknown} value @returns {boolean} */
function isValidMediaType(value) {
  return typeof value === "string" && /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(value);
}

/** @param {unknown} value @returns {boolean} */
function isNonEmptyString(value) {
  return typeof value === "string" && value.length > 0;
}

/** @param {JsonObject} value @returns {string} */
function canonicalManifest(value) {
  return JSON.stringify(Object.fromEntries(Object.keys(value).filter((key) => key !== "contentSha256" && !(key === "deprecation" && value[key] == null)).sort().map((key) => [key, value[key]])));
}

/** @param {JsonObject} value @returns {string} */
function manifestDigest(value) {
  return crypto.createHash("sha256").update(canonicalManifest(value)).digest("hex");
}

/** @param {unknown} value @param {string} capability */
function validateTeamDefinition(value, capability) {
  assertPlainObject(value, "capability team definition");
  const keys = Object.keys(value).sort();
  if (typeof value.oauthScope !== "string" || value.oauthScope !== `common-tools:capability:${capability}`) throw new Error("capability team definition is invalid");
  if (keys.join(",") === "mode,oauthScope") {
    if (value.mode !== "direct") throw new Error("capability team definition is invalid");
    return Object.freeze({ mode: "direct", oauthScope: value.oauthScope, acceptedUploadMediaTypes: Object.freeze([]) });
  }
  if (!["acceptedUploadMediaTypes,oauthScope", "acceptedUploadMediaTypes,deployment,oauthScope"].includes(keys.join(",")) || !Array.isArray(value.acceptedUploadMediaTypes) || !value.acceptedUploadMediaTypes.length || !value.acceptedUploadMediaTypes.every(isValidMediaType) || new Set(value.acceptedUploadMediaTypes).size !== value.acceptedUploadMediaTypes.length) throw new Error("capability team definition is invalid");
  const acceptedUploadMediaTypes = /** @type {string[]} */ (value.acceptedUploadMediaTypes);
  let deployment;
  if (value.deployment !== undefined) {
    const candidate = value.deployment;
    assertPlainObject(candidate, "capability team deployment");
    const workerProfile = candidate.workerProfile;
    const workerService = candidate.workerService;
    const imageKind = candidate.imageKind;
    const workerCommand = candidate.workerCommand;
    if (Object.keys(candidate).sort().join(",") !== "imageKind,workerCommand,workerProfile,workerService" || typeof workerProfile !== "string" || !/^team-worker-[a-z0-9-]+$/.test(workerProfile) || typeof workerService !== "string" || !/^[a-z][a-z0-9-]*-worker$/.test(workerService) || typeof imageKind !== "string" || !["remote-mcp", "image-worker"].includes(imageKind) || typeof workerCommand !== "string" || !/^packages\/remote-mcp-server\/bin\/common-tools-team(?:-[a-z0-9-]+)?-worker\.js$/.test(workerCommand)) throw new Error("capability team deployment is invalid");
    deployment = Object.freeze({ workerProfile, workerService, imageKind, workerCommand });
  }
  return Object.freeze({ oauthScope: value.oauthScope, acceptedUploadMediaTypes: Object.freeze([...acceptedUploadMediaTypes]), ...(deployment ? { deployment } : {}) });
}

/** @param {unknown} value @returns {number[] | null} */
function parseManifestVersion(value) {
  if (typeof value !== "string") return null;
  const match = SEMVER_PATTERN.exec(value);
  return match ? match[0].split(".").map(Number) : null;
}

/** @param {string | readonly number[]} left @param {string | readonly number[]} right @returns {number | null} */
function compareVersions(left, right) {
  const leftParts = Array.isArray(left) ? left : parseManifestVersion(left);
  const rightParts = Array.isArray(right) ? right : parseManifestVersion(right);
  if (!leftParts || !rightParts) return null;
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] > rightParts[index] ? 1 : -1;
  }
  return 0;
}

/** @param {unknown} value @returns {RuntimeRange | null} */
function parseRuntimeRange(value) {
  if (typeof value !== "string") return null;
  const match = RUNTIME_RANGE_PATTERN.exec(value);
  if (!match) return null;
  const lower = parseManifestVersion(match[1]);
  const upper = parseManifestVersion(match[2]);
  if (!lower || !upper || compareVersions(lower, upper) !== -1) return null;
  return Object.freeze({ lower: Object.freeze(lower), upper: Object.freeze(upper), value });
}

/** @param {string} runtimeVersion @param {string | RuntimeRange} range @returns {boolean} */
function runtimeSatisfiesRange(runtimeVersion, range) {
  const runtime = parseManifestVersion(runtimeVersion);
  const parsedRange = typeof range === "string" ? parseRuntimeRange(range) : range;
  if (!runtime || !parsedRange || !Array.isArray(parsedRange.lower) || !Array.isArray(parsedRange.upper)) return false;
  return compareVersions(runtime, parsedRange.lower) >= 0 && compareVersions(runtime, parsedRange.upper) === -1;
}

/** @param {string} left @param {string} right @returns {number | null} */
function compareManifestVersions(left, right) {
  return compareVersions(left, right);
}

/** @param {unknown} value @param {string} capability */
function validateDeprecation(value, capability) {
  if (value == null) return null;
  assertPlainObject(value, "capability deprecation");
  const keys = Object.keys(value).sort();
  const announcedIn = value.announcedIn;
  const removalAfter = value.removalAfter;
  const message = value.message;
  if ((keys.join(",") !== "announcedIn,message,removalAfter" && keys.join(",") !== "announcedIn,message,removalAfter,replacement") || typeof announcedIn !== "string" || !SEMVER_PATTERN.test(announcedIn) || typeof removalAfter !== "string" || !SEMVER_PATTERN.test(removalAfter) || !Array.isArray(parseManifestVersion(announcedIn)) || !Array.isArray(parseManifestVersion(removalAfter)) || compareManifestVersions(removalAfter, announcedIn) !== 1 || typeof message !== "string" || !message.trim() || message.length > 280 || containsControlCharacter(message)) throw new Error("capability deprecation is invalid");
  if (value.replacement !== undefined && (typeof value.replacement !== "string" || !CAPABILITY_ID_PATTERN.test(value.replacement) || value.replacement === capability)) throw new Error("capability deprecation is invalid");
  return Object.freeze({ announcedIn, removalAfter, message: message.trim(), ...(value.replacement === undefined ? {} : { replacement: value.replacement }) });
}

/** @param {unknown} value @param {string} capability @returns {readonly string[]} */
function validateDependencies(value, capability) {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 16 || value.some((dependency) => typeof dependency !== "string" || !CAPABILITY_ID_PATTERN.test(dependency) || dependency === capability) || new Set(value).size !== value.length) throw new Error("capability dependencies are invalid");
  return Object.freeze([...value].sort());
}

/** @param {unknown} value */
function validateExecutionDefinition(value) {
  assertPlainObject(value, "capability execution definition");
  if (Object.keys(value).sort().join(",") !== "localSupported" || typeof value.localSupported !== "boolean") throw new Error("capability execution definition is invalid");
  return Object.freeze({ localSupported: value.localSupported });
}

/** @param {unknown} value */
function validateModuleSource(value) {
  assertPlainObject(value, "capability module source");
  if (Object.keys(value).sort().join(",") !== "exportName,packageName,requirePath" || typeof value.packageName !== "string" || !/^@common-tools\/[a-z][a-z0-9-]*$/.test(value.packageName) || typeof value.requirePath !== "string" || !/^\.\.\/[a-z][a-z0-9-]*$/.test(value.requirePath) || typeof value.exportName !== "string" || !/^[A-Za-z][A-Za-z0-9_]*$/.test(value.exportName)) throw new Error("capability module source is invalid");
  return Object.freeze({ packageName: value.packageName, requirePath: value.requirePath, exportName: value.exportName });
}

/** @param {unknown} value @param {{runtimeVersion?: string}} [options] */
function validateCapabilityManifest(value, { runtimeVersion = RUNTIME_VERSION } = {}) {
  assertPlainObject(value, "capability manifest");
  const capability = assertNonEmptyString(value.capability, "manifest.capability");
  const expectedKeys = ["capability", "contentSha256", "execution", "manifestVersion", "minimumRuntimeVersion", "moduleSource", "requiredWorkerProfile", "team", "toolNames", "version"];
  if (Object.hasOwn(value, "deprecation")) expectedKeys.push("deprecation");
  if (Object.hasOwn(value, "dependencies")) expectedKeys.push("dependencies");
  const runtimeRange = parseRuntimeRange(value.minimumRuntimeVersion);
  if (Object.keys(value).sort().join(",") !== expectedKeys.sort().join(",") || !CAPABILITY_ID_PATTERN.test(capability) || value.manifestVersion !== 1 || typeof value.version !== "string" || !SEMVER_PATTERN.test(value.version) || !Array.isArray(value.toolNames) || !value.toolNames.every(isNonEmptyString) || !runtimeRange || typeof value.requiredWorkerProfile !== "string" || typeof value.contentSha256 !== "string" || !/^[a-f0-9]{64}$/.test(value.contentSha256)) throw new Error("capability manifest is invalid");
  const toolNames = /** @type {string[]} */ (value.toolNames);
  if (!runtimeSatisfiesRange(runtimeVersion, runtimeRange)) throw new Error(`capability manifest requires an incompatible Runtime version: ${capability}`);
  const team = validateTeamDefinition(value.team, capability);
  const execution = validateExecutionDefinition(value.execution);
  const moduleSource = validateModuleSource(value.moduleSource);
  const deprecation = validateDeprecation(value.deprecation, capability);
  const dependencies = validateDependencies(value.dependencies, capability);
  if (value.contentSha256 !== manifestDigest(/** @type {JsonObject} */ (value))) throw new Error(`capability manifest hash mismatch: ${capability}`);
  return Object.freeze({ manifestVersion: value.manifestVersion, capability, version: value.version, toolNames: Object.freeze([...toolNames]), minimumRuntimeVersion: value.minimumRuntimeVersion, requiredWorkerProfile: value.requiredWorkerProfile, execution, team, moduleSource, dependencies, deprecation, contentSha256: value.contentSha256 });
}

/** @param {Map<string, {dependencies?: readonly string[]}>} manifests */
function assertManifestDependencyGraph(manifests) {
  if (!(manifests instanceof Map)) throw new TypeError("capability manifests are invalid");
  const visited = new Set();
  const visiting = new Set();
  /** @param {string} capability */
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

/** @param {string} [root] */
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

module.exports = {
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
};
