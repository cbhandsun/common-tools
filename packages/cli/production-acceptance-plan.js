"use strict";

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

module.exports = {
  OPTIONAL_CONFIGURATION,
  REQUIRED_CONFIGURATION,
  REQUIRED_DIRECT_CREDENTIALS,
  REQUIRED_FILE_CREDENTIALS,
  credentialMode,
  productionAcceptancePlan,
  redactStatus
};
