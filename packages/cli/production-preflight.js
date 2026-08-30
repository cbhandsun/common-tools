"use strict";

const childProcess = require("node:child_process");
const path = require("node:path");
const { loadRemoteConfig } = require("../remote-mcp-server");
const { TEAM_DEPLOYMENT_CAPABILITIES, loadTeamConfig } = require("../team-runtime");
const { TEAM_CAPABILITY_DEFINITIONS } = require("../capability-runtime");
const { verifyReleaseEvidenceFile } = require("../../scripts/release-evidence");
const { verifyReleaseSignature } = require("../../scripts/verify-release-signature");
const { parsePinnedRawImageOcrProfile } = require("../slideclone-core/team-ocr-profile");

const REQUIRED_CREDENTIALS = Object.freeze([
  "COMMON_TOOLS_DATABASE_USER",
  "COMMON_TOOLS_DATABASE_PASSWORD",
  "COMMON_TOOLS_REDIS_USERNAME",
  "COMMON_TOOLS_REDIS_PASSWORD",
  "COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID",
  "COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY"
]);

const PRODUCTION_COMPOSE_FILES = Object.freeze([
  "deploy/compose.team-api.yaml",
  "deploy/compose.team-production.yaml"
]);
const WORKER_PROFILES = Object.freeze(Object.fromEntries(Object.entries(TEAM_DEPLOYMENT_CAPABILITIES).map(([capability, definition]) => [capability, definition.workerProfile])));
const WORKER_SERVICES = Object.freeze(Object.fromEntries(Object.entries(TEAM_DEPLOYMENT_CAPABILITIES).map(([capability, definition]) => [capability, definition.workerService])));
const REMOTE_CAPABILITIES = Object.freeze(Object.keys(TEAM_CAPABILITY_DEFINITIONS));
const SIYUAN_SECRET_COMPOSE_FILE = "deploy/compose.team-siyuan-secret.yaml";

function deployedWorkerCapabilities(capabilities) {
  return capabilities.filter((capability) => Object.hasOwn(TEAM_DEPLOYMENT_CAPABILITIES, capability));
}

function siyuanSecretConfiguration(environment, capabilities) {
  if (!capabilities.includes("siyuan-note")) return Object.freeze({ composeFiles: Object.freeze([]) });
  nonEmpty(environment.COMMON_TOOLS_SIYUAN_URL, "COMMON_TOOLS_SIYUAN_URL");
  const direct = typeof environment.COMMON_TOOLS_SIYUAN_TOKEN === "string" && Boolean(environment.COMMON_TOOLS_SIYUAN_TOKEN.trim());
  const file = typeof environment.COMMON_TOOLS_SIYUAN_TOKEN_FILE === "string" && Boolean(environment.COMMON_TOOLS_SIYUAN_TOKEN_FILE.trim());
  if (direct === file) throw new Error("exactly one SiYuan token source is required");
  return Object.freeze({ composeFiles: Object.freeze(file ? [SIYUAN_SECRET_COMPOSE_FILE] : []) });
}

function nonEmpty(value, name) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function immutableImageReference(value, name) {
  const image = nonEmpty(value, name);
  // Tags can be moved by a registry administrator. A digest is the only image
  // reference that the deployment process itself can prove immutable.
  if (!/^[a-z0-9][a-z0-9._/:-]*@sha256:[a-f0-9]{64}$/.test(image)) {
    throw new Error(`${name} must be an image reference pinned by sha256 digest`);
  }
  return image;
}

function credentialSourceMode(environment) {
  if (!environment || typeof environment !== "object") throw new TypeError("production preflight environment is invalid");
  let direct = 0;
  let files = 0;
  for (const name of REQUIRED_CREDENTIALS) {
    const directValue = environment[name];
    const fileValue = environment[`${name}_FILE`];
    if (directValue !== undefined && (typeof directValue !== "string" || !directValue.trim())) throw new Error(`${name} is invalid`);
    if (fileValue !== undefined && (typeof fileValue !== "string" || !fileValue.trim())) throw new Error(`${name}_FILE is invalid`);
    if (directValue !== undefined && fileValue !== undefined) throw new Error(`${name} and ${name}_FILE are mutually exclusive`);
    direct += directValue === undefined ? 0 : 1;
    files += fileValue === undefined ? 0 : 1;
  }
  if (direct === REQUIRED_CREDENTIALS.length && files === 0) return "direct";
  if (files === REQUIRED_CREDENTIALS.length && direct === 0) return "files";
  throw new Error("production credentials must use exactly one complete direct or file source set");
}

function productionEnvironment(environment) {
  if (!environment || typeof environment !== "object") throw new TypeError("production preflight environment is invalid");
  return {
    ...environment,
    NODE_ENV: "production",
    COMMON_TOOLS_TEAM_MODE: "production",
    COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3",
    COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true",
    COMMON_TOOLS_REMOTE_HOST: "0.0.0.0",
    COMMON_TOOLS_REMOTE_PORT: "3000",
    COMMON_TOOLS_TEAM_CAPABILITIES: environment.COMMON_TOOLS_TEAM_CAPABILITIES || "image-to-editable,project-audit"
  };
}

function inspectProductionRelease(environment = process.env) {
  const mode = credentialSourceMode(environment);
  immutableImageReference(environment.COMMON_TOOLS_REMOTE_IMAGE, "COMMON_TOOLS_REMOTE_IMAGE");
  nonEmpty(environment.COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS, "COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS");
  const resolved = productionEnvironment(environment);
  const remote = loadRemoteConfig(resolved);
  const team = loadTeamConfig(resolved);
  if (!remote.production || remote.backend !== "postgres-redis-s3" || !remote.requireProjectRbac || team.mode !== "production") {
    throw new Error("production runtime configuration is invalid");
  }
  if (deployedWorkerCapabilities(team.enabledCapabilities).some((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability].imageKind === "image-worker")) {
    immutableImageReference(environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, "COMMON_TOOLS_IMAGE_WORKER_IMAGE");
  }
  parsePinnedRawImageOcrProfile(environment);
  const siyuan = siyuanSecretConfiguration(environment, team.enabledCapabilities);
  return Object.freeze({
    production: true,
    credentialSource: mode,
    enabledCapabilities: team.enabledCapabilities,
    composeFiles: Object.freeze([...PRODUCTION_COMPOSE_FILES, ...(mode === "files" ? ["deploy/compose.team-production-secrets.yaml"] : []), ...siyuan.composeFiles])
  });
}

function verifyProductionReleaseEvidence(repositoryRoot, environment, { evidenceVerifier = verifyReleaseEvidenceFile } = {}) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw new TypeError("production preflight repository root is invalid");
  if (typeof evidenceVerifier !== "function") throw new TypeError("production evidence verifier is invalid");
  const evidenceFile = nonEmpty(environment.COMMON_TOOLS_RELEASE_EVIDENCE_FILE, "COMMON_TOOLS_RELEASE_EVIDENCE_FILE");
  const verified = evidenceVerifier({
    manifestPath: evidenceFile,
    packagePath: path.join(repositoryRoot, "package.json"),
    lockPath: path.join(repositoryRoot, "package-lock.json")
  });
  if (!verified || verified.deployable !== true || !verified.evidence || !Array.isArray(verified.evidence.images) || typeof verified.evidence.source?.revision !== "string") {
    throw new Error("production release evidence is invalid");
  }
  const resolved = productionEnvironment(environment);
  const enabledCapabilities = loadTeamConfig(resolved).enabledCapabilities;
  const expectedImages = new Set([immutableImageReference(environment.COMMON_TOOLS_REMOTE_IMAGE, "COMMON_TOOLS_REMOTE_IMAGE")]);
  if (deployedWorkerCapabilities(enabledCapabilities).some((capability) => TEAM_DEPLOYMENT_CAPABILITIES[capability].imageKind === "image-worker")) {
    expectedImages.add(immutableImageReference(environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, "COMMON_TOOLS_IMAGE_WORKER_IMAGE"));
  }
  const actualImages = new Set(verified.evidence.images);
  if (actualImages.size !== expectedImages.size || [...expectedImages].some((image) => !actualImages.has(image))) {
    throw new Error("production release evidence does not match deployment images");
  }
  const rawImageOcrProfile = parsePinnedRawImageOcrProfile(environment);
  if (rawImageOcrProfile.enabled) {
    const image = immutableImageReference(environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, "COMMON_TOOLS_IMAGE_WORKER_IMAGE");
    const matched = Array.isArray(verified.evidence.rawImageOcrProfiles) && verified.evidence.rawImageOcrProfiles.some((profile) => profile && profile.name === rawImageOcrProfile.name && profile.image === image && profile.executable === rawImageOcrProfile.executable && profile.executableSha256 === rawImageOcrProfile.sha256 && Array.isArray(profile.languages) && JSON.stringify(profile.languages) === JSON.stringify(rawImageOcrProfile.languages));
    if (!matched) throw new Error("production release evidence does not match raw image OCR profile");
  }
  return Object.freeze({ revision: verified.evidence.source.revision, images: Object.freeze([...actualImages].sort()) });
}

function releaseSignatureRequired(environment) {
  const value = environment?.COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE;
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE must be true or false");
}

function verifyProductionReleaseSignature(environment, releaseEvidence, { signatureVerifier = verifyReleaseSignature } = {}) {
  const required = releaseSignatureRequired(environment);
  const signaturePath = environment?.COMMON_TOOLS_RELEASE_SIGNATURE_FILE;
  const publicKeyPath = environment?.COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE;
  if (!required) {
    if (signaturePath !== undefined || publicKeyPath !== undefined) throw new Error("release signature paths require COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE=true");
    return Object.freeze({ required: false, verified: false });
  }
  if (typeof signatureVerifier !== "function") throw new TypeError("production signature verifier is invalid");
  const result = signatureVerifier({
    evidencePath: nonEmpty(environment.COMMON_TOOLS_RELEASE_EVIDENCE_FILE, "COMMON_TOOLS_RELEASE_EVIDENCE_FILE"),
    signaturePath: nonEmpty(signaturePath, "COMMON_TOOLS_RELEASE_SIGNATURE_FILE"),
    publicKeyPath: nonEmpty(publicKeyPath, "COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE"),
    images: releaseEvidence.images
  });
  if (!result || result.verified !== true || !Array.isArray(result.images) || JSON.stringify([...result.images].sort()) !== JSON.stringify(releaseEvidence.images)) {
    throw new Error("production release signature is invalid");
  }
  return Object.freeze({ required: true, verified: true, images: Object.freeze([...releaseEvidence.images]) });
}

function validateResolvedProductionCompose(configuration, { remoteImage, imageWorkerImage, enabledCapabilities = ["image-to-editable", "project-audit"] } = {}) {
  if (!configuration || typeof configuration !== "object" || Array.isArray(configuration) || !configuration.services || typeof configuration.services !== "object" || Array.isArray(configuration.services)) {
    throw new Error("Docker Compose production configuration is invalid");
  }
  const services = configuration.services;
  if (!Array.isArray(enabledCapabilities) || !enabledCapabilities.length || enabledCapabilities.some((capability) => !REMOTE_CAPABILITIES.includes(capability))) {
    throw new Error("Docker Compose production capabilities are invalid");
  }
  const expectedImages = {
    "team-migrate": remoteImage,
    "remote-mcp": remoteImage,
    "team-retention": remoteImage
  };
  const workerCapabilities = deployedWorkerCapabilities(enabledCapabilities);
  for (const capability of workerCapabilities) expectedImages[WORKER_SERVICES[capability]] = TEAM_DEPLOYMENT_CAPABILITIES[capability].imageKind === "image-worker" ? imageWorkerImage : remoteImage;
  for (const [name, image] of Object.entries(expectedImages)) {
    const service = services[name];
    if (!service || typeof service !== "object" || Array.isArray(service) || service.image !== image || Object.hasOwn(service, "build") || !service.environment || typeof service.environment !== "object" || Array.isArray(service.environment) || service.environment.NODE_ENV !== "production" || service.environment.COMMON_TOOLS_TEAM_MODE !== "production") {
      throw new Error("Docker Compose production image configuration is invalid");
    }
  }
  const api = services["remote-mcp"];
  if ((Array.isArray(api.ports) && api.ports.length > 0) || (api.ports && !Array.isArray(api.ports))) throw new Error("Docker Compose production API must not publish ports");
  if (api.environment.COMMON_TOOLS_REMOTE_BACKEND !== "postgres-redis-s3" || api.environment.COMMON_TOOLS_REQUIRE_PROJECT_RBAC !== "true" || api.environment.COMMON_TOOLS_REMOTE_HOST !== "0.0.0.0") {
    throw new Error("Docker Compose production API environment is invalid");
  }
  const migrationDependencies = services["team-migrate"].depends_on;
  if (migrationDependencies && (typeof migrationDependencies !== "object" || Array.isArray(migrationDependencies) || Object.keys(migrationDependencies).length !== 0)) {
    throw new Error("Docker Compose production migration dependencies are invalid");
  }
  for (const name of ["remote-mcp", "team-retention", ...workerCapabilities.map((capability) => WORKER_SERVICES[capability])]) {
    const dependencies = services[name].depends_on;
    if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies) || Object.keys(dependencies).length !== 1 || !Object.hasOwn(dependencies, "team-migrate")) {
      throw new Error("Docker Compose production dependency gate is invalid");
    }
  }
  return true;
}

function validateProductionCompose(repositoryRoot, files, expectedImages) {
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw new TypeError("production preflight repository root is invalid");
  if (!Array.isArray(files) || !files.length || files.some((file) => typeof file !== "string" || !PRODUCTION_COMPOSE_FILES.includes(file) && file !== "deploy/compose.team-production-secrets.yaml" && file !== SIYUAN_SECRET_COMPOSE_FILE)) {
    throw new TypeError("production preflight Compose files are invalid");
  }
  const enabledCapabilities = expectedImages?.enabledCapabilities;
  if (!Array.isArray(enabledCapabilities) || !enabledCapabilities.length || enabledCapabilities.some((capability) => !REMOTE_CAPABILITIES.includes(capability))) {
    throw new TypeError("production preflight capabilities are invalid");
  }
  const args = ["compose", "--project-directory", repositoryRoot];
  for (const file of files) args.push("--file", path.join(repositoryRoot, file));
  args.push("--profile", "team-api");
  args.push("--profile", "team-maintenance");
  for (const capability of deployedWorkerCapabilities(enabledCapabilities)) args.push("--profile", WORKER_PROFILES[capability]);
  args.push("config", "--format", "json");
  const result = childProcess.spawnSync("docker", args, { encoding: "utf8", windowsHide: true, cwd: repositoryRoot });
  if (result.error || result.status !== 0) throw new Error("Docker Compose production configuration preflight failed");
  let configuration;
  try { configuration = JSON.parse(result.stdout); } catch { throw new Error("Docker Compose production configuration preflight failed"); }
  validateResolvedProductionCompose(configuration, expectedImages);
}

function runProductionPreflight(environment = process.env, { repositoryRoot, composeValidator = validateProductionCompose, evidenceVerifier = verifyReleaseEvidenceFile, signatureVerifier = verifyReleaseSignature } = {}) {
  const report = inspectProductionRelease(environment);
  if (typeof composeValidator !== "function") throw new TypeError("production preflight Compose validator is invalid");
  const releaseEvidence = verifyProductionReleaseEvidence(repositoryRoot, environment, { evidenceVerifier });
  const releaseSignature = verifyProductionReleaseSignature(environment, releaseEvidence, { signatureVerifier });
  composeValidator(repositoryRoot, report.composeFiles, {
    remoteImage: environment.COMMON_TOOLS_REMOTE_IMAGE.trim(),
    imageWorkerImage: environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE?.trim(),
    enabledCapabilities: report.enabledCapabilities
  });
  return Object.freeze({ ...report, releaseEvidence, releaseSignature, composeValidated: true });
}

module.exports = { PRODUCTION_COMPOSE_FILES, REQUIRED_CREDENTIALS, WORKER_PROFILES, WORKER_SERVICES, credentialSourceMode, immutableImageReference, inspectProductionRelease, releaseSignatureRequired, runProductionPreflight, validateProductionCompose, validateResolvedProductionCompose, verifyProductionReleaseEvidence, verifyProductionReleaseSignature };
