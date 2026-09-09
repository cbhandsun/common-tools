"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { runMigrationCommand, migrationFailureCode } = require("../remote-mcp-server/bin/common-tools-team-migrate");
const { runProductionPreflight } = require("./production-preflight");

const REQUIRED_DIRECT_CREDENTIALS = Object.freeze([
  "COMMON_TOOLS_DATABASE_USER",
  "COMMON_TOOLS_DATABASE_PASSWORD",
  "COMMON_TOOLS_REDIS_USERNAME",
  "COMMON_TOOLS_REDIS_PASSWORD",
  "COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID",
  "COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY"
]);

const REQUIRED_FILE_CREDENTIALS = Object.freeze(REQUIRED_DIRECT_CREDENTIALS.map((name) => `${name}_FILE`));

const REQUIRED_CONFIGURATION = Object.freeze([
  "COMMON_TOOLS_DATABASE_URL",
  "COMMON_TOOLS_REDIS_URL",
  "COMMON_TOOLS_OBJECT_STORE_ENDPOINT",
  "COMMON_TOOLS_OBJECT_STORE_BUCKET",
  "COMMON_TOOLS_REMOTE_PUBLIC_URL",
  "COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS",
  "COMMON_TOOLS_OIDC_ISSUER",
  "COMMON_TOOLS_OIDC_JWKS_URL",
  "COMMON_TOOLS_OIDC_AUDIENCE",
  "COMMON_TOOLS_REMOTE_IMAGE",
  "COMMON_TOOLS_RELEASE_EVIDENCE_FILE",
  "COMMON_TOOLS_RELEASE_REVISION"
]);

const OPTIONAL_CONFIGURATION = Object.freeze([
  "COMMON_TOOLS_IMAGE_WORKER_IMAGE",
  "COMMON_TOOLS_TEAM_CAPABILITIES",
  "COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE",
  "COMMON_TOOLS_RELEASE_SIGNATURE_FILE",
  "COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE",
  "COMMON_TOOLS_SIYUAN_TOKEN_FILE"
]);

function isSet(environment, name) {
  return typeof environment?.[name] === "string" && Boolean(environment[name].trim());
}

function redactStatus(environment, names) {
  return Object.freeze(Object.fromEntries(names.map((name) => [name, isSet(environment, name) ? "set" : "missing"])));
}

function credentialMode(environment) {
  const direct = REQUIRED_DIRECT_CREDENTIALS.filter((name) => isSet(environment, name));
  const files = REQUIRED_FILE_CREDENTIALS.filter((name) => isSet(environment, name));
  if (direct.length === REQUIRED_DIRECT_CREDENTIALS.length && files.length === 0) return "direct";
  if (files.length === REQUIRED_FILE_CREDENTIALS.length && direct.length === 0) return "files";
  if (direct.length === 0 && files.length === 0) return "missing";
  return "incomplete-or-mixed";
}

function missingCredentialNames(environment) {
  const mode = credentialMode(environment);
  if (mode === "direct" || mode === "files") return Object.freeze([]);
  if (mode === "missing") return REQUIRED_DIRECT_CREDENTIALS;
  return Object.freeze([...REQUIRED_DIRECT_CREDENTIALS.filter((name) => !isSet(environment, name)), ...REQUIRED_FILE_CREDENTIALS.filter((name) => !isSet(environment, name))]);
}

function productionAcceptancePlan(environment = process.env) {
  if (!environment || typeof environment !== "object") throw new TypeError("production acceptance environment is invalid");
  const missingConfiguration = REQUIRED_CONFIGURATION.filter((name) => !isSet(environment, name));
  const missingCredentials = missingCredentialNames(environment);
  const blockers = Object.freeze([
    ...missingConfiguration.map((name) => `missing ${name}`),
    ...(credentialMode(environment) === "incomplete-or-mixed" ? ["production credentials must use exactly one complete direct or file source set"] : []),
    ...(credentialMode(environment) === "missing" ? ["missing production credential source set"] : [])
  ]);
  return Object.freeze({
    status: blockers.length === 0 ? "ready-for-production-preflight" : "blocked-by-configuration",
    credentialMode: credentialMode(environment),
    requiredConfiguration: redactStatus(environment, REQUIRED_CONFIGURATION),
    optionalConfiguration: redactStatus(environment, OPTIONAL_CONFIGURATION),
    missingConfiguration: Object.freeze(missingConfiguration),
    missingCredentials,
    commands: Object.freeze([
      "common-tools team production-preflight",
      "common-tools team migration-status",
      ".\\scripts\\team-runtime-production-deploy.ps1 -Mode Plan -Project common-tools",
      ".\\scripts\\team-runtime-production-deploy.ps1 -Mode Apply -Project common-tools -WaitTimeoutSeconds 300"
    ]),
    evidence: Object.freeze([
      "redacted production-preflight JSON bound to the approved release revision and image digests",
      "redacted migration-status JSON from the target production environment",
      "managed PostgreSQL backup and restore-target approval before applying migrations",
      "post-apply /healthz and /readyz results from the production ingress",
      "remote image-to-editable upload, job, download, PPTX validation, and cleanup evidence",
      "remote ppt-create JSON/spec/template archive flow evidence when that capability is enabled",
      "authorization negative canary evidence for audience, scope, disabled capability, and owner/project isolation",
      "worker heartbeat, backlog, retention, telemetry, and rollback evidence tied to immutable release material",
      "Office/OCR quality evidence on an independent PDF or image sample, not only the historical development fixture"
    ]),
    blockers
  });
}

function writeEvidenceJson(outputDirectory, name, value) {
  if (typeof outputDirectory !== "string" || !path.isAbsolute(outputDirectory)) throw new TypeError("production acceptance evidence output directory is invalid");
  if (typeof name !== "string" || !/^[a-z0-9-]+\.json$/.test(name)) throw new TypeError("production acceptance evidence file name is invalid");
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputFile = path.join(outputDirectory, name);
  fs.writeFileSync(outputFile, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return outputFile;
}

async function collectProductionAcceptanceEvidence(environment = process.env, options = {}) {
  if (!options || typeof options !== "object") throw new TypeError("production acceptance evidence options are invalid");
  const outputDirectory = options.outputDirectory;
  const repositoryRoot = options.repositoryRoot;
  if (typeof repositoryRoot !== "string" || !path.isAbsolute(repositoryRoot)) throw new TypeError("production acceptance evidence repository root is invalid");
  const plan = productionAcceptancePlan(environment);
  const files = { plan: writeEvidenceJson(outputDirectory, "acceptance-plan.json", plan) };
  const checks = [];
  if (plan.status !== "ready-for-production-preflight") {
    checks.push({ name: "production-preflight", status: "skipped", reason: "configuration is incomplete" });
    checks.push({ name: "migration-status", status: "skipped", reason: "configuration is incomplete" });
    return Object.freeze({ status: plan.status, files: Object.freeze(files), checks: Object.freeze(checks), blockers: plan.blockers });
  }

  const preflightRunner = options.runProductionPreflight || runProductionPreflight;
  const migrationRunner = options.runMigrationCommand || runMigrationCommand;
  try {
    const preflight = preflightRunner(environment, { repositoryRoot });
    files.productionPreflight = writeEvidenceJson(outputDirectory, "production-preflight.json", preflight);
    checks.push({ name: "production-preflight", status: "passed" });
  } catch {
    files.productionPreflight = writeEvidenceJson(outputDirectory, "production-preflight-error.json", { status: "failed", code: "production_preflight_failed" });
    checks.push({ name: "production-preflight", status: "failed", code: "production_preflight_failed" });
  }

  try {
    let migrationStatus = "";
    await migrationRunner(environment, ["--status"], { output: { write(chunk) { migrationStatus += String(chunk); } } });
    const parsed = JSON.parse(migrationStatus);
    files.migrationStatus = writeEvidenceJson(outputDirectory, "migration-status.json", parsed);
    checks.push({ name: "migration-status", status: "passed" });
  } catch (error) {
    const code = migrationFailureCode(error);
    files.migrationStatus = writeEvidenceJson(outputDirectory, "migration-status-error.json", { status: "failed", code });
    checks.push({ name: "migration-status", status: "failed", code });
  }

  const failed = checks.filter((check) => check.status === "failed");
  return Object.freeze({
    status: failed.length ? "evidence-incomplete" : "ready-for-controlled-apply",
    files: Object.freeze(files),
    checks: Object.freeze(checks),
    blockers: Object.freeze(failed.map((check) => `${check.name} ${check.code}`))
  });
}

module.exports = {
  OPTIONAL_CONFIGURATION,
  REQUIRED_CONFIGURATION,
  REQUIRED_DIRECT_CREDENTIALS,
  REQUIRED_FILE_CREDENTIALS,
  collectProductionAcceptanceEvidence,
  credentialMode,
  productionAcceptancePlan,
  redactStatus
};
