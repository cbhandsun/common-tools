"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { credentialSourceMode, immutableImageReference, inspectProductionRelease, releaseSignatureRequired, runProductionPreflight, validateResolvedProductionCompose } = require("../packages/cli/production-preflight");

const DIGEST = "a".repeat(64);
function productionEnvironment(overrides = {}) {
  return {
    COMMON_TOOLS_REMOTE_IMAGE: `registry.example.test/common-tools/remote@sha256:${DIGEST}`,
    COMMON_TOOLS_IMAGE_WORKER_IMAGE: `registry.example.test/common-tools/image-worker@sha256:${DIGEST}`,
    COMMON_TOOLS_REMOTE_PUBLIC_URL: "https://tools.example.test",
    COMMON_TOOLS_REMOTE_ALLOWED_ORIGINS: "https://codex.example.test,https://claude.example.test",
    COMMON_TOOLS_OIDC_ISSUER: "https://identity.example.test/tenant",
    COMMON_TOOLS_OIDC_JWKS_URL: "https://identity.example.test/tenant/keys",
    COMMON_TOOLS_OIDC_AUDIENCE: "common-tools-mcp",
    COMMON_TOOLS_DATABASE_URL: "postgresql://database.example.test/common-tools?sslmode=verify-full",
    COMMON_TOOLS_REDIS_URL: "rediss://redis.example.test:6380",
    COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "https://objects.example.test",
    COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts",
    COMMON_TOOLS_DATABASE_USER: "common-tools-api",
    COMMON_TOOLS_DATABASE_PASSWORD: "not-a-real-secret",
    COMMON_TOOLS_REDIS_USERNAME: "common-tools-api",
    COMMON_TOOLS_REDIS_PASSWORD: "not-a-real-secret",
    COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID: "not-a-real-key",
    COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY: "not-a-real-secret",
    COMMON_TOOLS_RELEASE_EVIDENCE_FILE: "C:\\release\\common-tools.release.json",
    ...overrides
  };
}

function verifiedEvidence(environment, overrides = {}) {
  return () => ({
    deployable: true,
    evidence: {
      source: { revision: "b".repeat(40) },
      images: [environment.COMMON_TOOLS_REMOTE_IMAGE, environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE],
      rawImageOcrProfiles: [],
      ...overrides
    }
  });
}

test("production preflight validates only immutable images and a complete single credential source", () => {
  const report = inspectProductionRelease(productionEnvironment());
  assert.deepEqual(report, {
    production: true,
    credentialSource: "direct",
    enabledCapabilities: ["image-to-editable", "project-audit"],
    composeFiles: ["deploy/compose.team-api.yaml", "deploy/compose.team-production.yaml"]
  });
  assert.throws(() => immutableImageReference("registry.example.test/common-tools:latest", "IMAGE"), /sha256 digest/);
  assert.throws(() => inspectProductionRelease(productionEnvironment({ COMMON_TOOLS_REMOTE_IMAGE: "registry.example.test/common-tools:v1.2.3" })), /REMOTE_IMAGE.*sha256 digest/);
  assert.throws(() => credentialSourceMode(productionEnvironment({ COMMON_TOOLS_REDIS_PASSWORD_FILE: "C:\\secure\\redis-password" })), /mutually exclusive/);
  assert.throws(() => credentialSourceMode(productionEnvironment({ COMMON_TOOLS_REDIS_PASSWORD: undefined })), /complete direct or file source set/);
});

test("production preflight supports a complete Compose file-secret source without reading secret contents", () => {
  const environment = productionEnvironment();
  for (const name of ["COMMON_TOOLS_DATABASE_USER", "COMMON_TOOLS_DATABASE_PASSWORD", "COMMON_TOOLS_REDIS_USERNAME", "COMMON_TOOLS_REDIS_PASSWORD", "COMMON_TOOLS_OBJECT_STORE_ACCESS_KEY_ID", "COMMON_TOOLS_OBJECT_STORE_SECRET_ACCESS_KEY"]) {
    delete environment[name];
    environment[`${name}_FILE`] = `C:\\secure\\${name.toLowerCase()}`;
  }
  let checked = null;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator(root, files) { checked = { root, files }; },
    evidenceVerifier: verifiedEvidence(environment)
  });
  assert.equal(result.credentialSource, "files");
  assert.equal(result.composeValidated, true);
  assert.equal(result.releaseEvidence.revision, "b".repeat(40));
  assert.deepEqual(checked.files, ["deploy/compose.team-api.yaml", "deploy/compose.team-production.yaml", "deploy/compose.team-production-secrets.yaml"]);
});

test("production preflight rejects credential-bearing identity and public URLs before Compose is called", () => {
  let composeCalled = false;
  assert.throws(() => runProductionPreflight(productionEnvironment({ COMMON_TOOLS_OIDC_JWKS_URL: "https://credential@identity.example.test/keys" }), {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator() { composeCalled = true; }
  }), /OIDC_JWKS_URL must not embed credentials/);
  assert.equal(composeCalled, false);
});

test("production preflight requires verified evidence for exactly the deployment image digests", () => {
  const environment = productionEnvironment();
  let composeCalled = false;
  assert.throws(() => runProductionPreflight({ ...environment, COMMON_TOOLS_RELEASE_EVIDENCE_FILE: "" }, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator() { composeCalled = true; },
    evidenceVerifier: verifiedEvidence(environment)
  }), /RELEASE_EVIDENCE_FILE/);
  assert.equal(composeCalled, false);
  assert.throws(() => runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator() { composeCalled = true; },
    evidenceVerifier: verifiedEvidence(environment, { images: [environment.COMMON_TOOLS_REMOTE_IMAGE] })
  }), /does not match deployment images/);
  assert.equal(composeCalled, false);
});

test("production preflight can require a Cosign-verified evidence and image set before Compose", () => {
  const environment = productionEnvironment({
    COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE: "true",
    COMMON_TOOLS_RELEASE_SIGNATURE_FILE: "C:\\release\\common-tools.release.sig",
    COMMON_TOOLS_COSIGN_PUBLIC_KEY_FILE: "C:\\release\\common-tools.pub"
  });
  let composeCalled = false;
  let signatureInput = null;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    evidenceVerifier: verifiedEvidence(environment),
    signatureVerifier(input) { signatureInput = input; return { verified: true, images: [...input.images].sort() }; },
    composeValidator() { composeCalled = true; }
  });
  assert.equal(composeCalled, true);
  assert.deepEqual(result.releaseSignature, { required: true, verified: true, images: [environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, environment.COMMON_TOOLS_REMOTE_IMAGE].sort() });
  assert.deepEqual(signatureInput.images, [environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, environment.COMMON_TOOLS_REMOTE_IMAGE].sort());
  assert.equal(releaseSignatureRequired(environment), true);
  assert.equal(releaseSignatureRequired(productionEnvironment()), false);
  assert.throws(() => runProductionPreflight({ ...environment, COMMON_TOOLS_RELEASE_SIGNATURE_FILE: undefined }, {
    repositoryRoot: path.resolve(__dirname, ".."),
    evidenceVerifier: verifiedEvidence(environment),
    signatureVerifier() { return { verified: true, images: [] }; },
    composeValidator() { composeCalled = true; }
  }), /RELEASE_SIGNATURE_FILE/);
  assert.throws(() => releaseSignatureRequired({ COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE: "yes" }), /must be true or false/);
});

test("production preflight rejects unrequested release signature paths before Compose", () => {
  let composeCalled = false;
  const environment = productionEnvironment({ COMMON_TOOLS_RELEASE_SIGNATURE_FILE: "C:\\release\\common-tools.release.sig" });
  assert.throws(() => runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    evidenceVerifier: verifiedEvidence(environment),
    composeValidator() { composeCalled = true; }
  }), /require COMMON_TOOLS_REQUIRE_RELEASE_SIGNATURE/);
  assert.equal(composeCalled, false);
});

test("production preflight supports the ppt-quality-only Worker without requiring an unused image Worker image", () => {
  const environment = productionEnvironment({ COMMON_TOOLS_TEAM_CAPABILITIES: "ppt-quality" });
  delete environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE;
  let composeInput = null;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator(_root, _files, input) { composeInput = input; },
    evidenceVerifier: verifiedEvidence(environment, { images: [environment.COMMON_TOOLS_REMOTE_IMAGE] })
  });
  assert.deepEqual(result.enabledCapabilities, ["ppt-quality"]);
  assert.deepEqual(result.releaseEvidence.images, [environment.COMMON_TOOLS_REMOTE_IMAGE]);
  assert.deepEqual(composeInput, { remoteImage: environment.COMMON_TOOLS_REMOTE_IMAGE, imageWorkerImage: undefined, enabledCapabilities: ["ppt-quality"] });
});

test("production preflight supports direct SiYuan access without requiring a Worker image", () => {
  const environment = productionEnvironment({
    COMMON_TOOLS_TEAM_CAPABILITIES: "siyuan-note",
    COMMON_TOOLS_SIYUAN_URL: "http://host.docker.internal:6806",
    COMMON_TOOLS_SIYUAN_TOKEN: "local-token-kept-out-of-reports"
  });
  delete environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE;
  const report = inspectProductionRelease(environment);
  assert.deepEqual(report.enabledCapabilities, ["siyuan-note"]);
  assert.deepEqual(report.composeFiles, ["deploy/compose.team-api.yaml", "deploy/compose.team-production.yaml"]);
  assert.equal(JSON.stringify(report).includes(environment.COMMON_TOOLS_SIYUAN_TOKEN), false);

  const fileReport = inspectProductionRelease({
    ...environment,
    COMMON_TOOLS_SIYUAN_TOKEN: undefined,
    COMMON_TOOLS_SIYUAN_TOKEN_FILE: "C:\\secure\\siyuan-token"
  });
  assert.deepEqual(fileReport.composeFiles, ["deploy/compose.team-api.yaml", "deploy/compose.team-production.yaml", "deploy/compose.team-siyuan-secret.yaml"]);
  assert.throws(() => inspectProductionRelease({ ...environment, COMMON_TOOLS_SIYUAN_TOKEN: undefined }), /exactly one SiYuan token source/);
  assert.throws(() => inspectProductionRelease({ ...environment, COMMON_TOOLS_SIYUAN_TOKEN_FILE: "C:\\secure\\siyuan-token" }), /exactly one SiYuan token source/);
  assert.throws(() => inspectProductionRelease({ ...environment, COMMON_TOOLS_SIYUAN_URL: "" }), /COMMON_TOOLS_SIYUAN_URL/);
});

test("production preflight supports the PPT improve pipeline without requiring an unused image Worker image", () => {
  const environment = productionEnvironment({ COMMON_TOOLS_TEAM_CAPABILITIES: "ppt-improve" });
  delete environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE;
  let composeInput = null;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator(_root, _files, input) { composeInput = input; },
    evidenceVerifier: verifiedEvidence(environment, { images: [environment.COMMON_TOOLS_REMOTE_IMAGE] })
  });
  assert.deepEqual(result.enabledCapabilities, ["ppt-improve"]);
  assert.deepEqual(composeInput, { remoteImage: environment.COMMON_TOOLS_REMOTE_IMAGE, imageWorkerImage: undefined, enabledCapabilities: ["ppt-improve"] });
});

test("production preflight binds ppt-create to the immutable image Worker", () => {
  const environment = productionEnvironment({ COMMON_TOOLS_TEAM_CAPABILITIES: "ppt-create" });
  let composeInput = null;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator(_root, _files, input) { composeInput = input; },
    evidenceVerifier: verifiedEvidence(environment)
  });
  assert.deepEqual(result.enabledCapabilities, ["ppt-create"]);
  assert.deepEqual(result.releaseEvidence.images, [environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, environment.COMMON_TOOLS_REMOTE_IMAGE].sort());
  assert.deepEqual(composeInput, { remoteImage: environment.COMMON_TOOLS_REMOTE_IMAGE, imageWorkerImage: environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, enabledCapabilities: ["ppt-create"] });
  assert.throws(() => runProductionPreflight({ ...environment, COMMON_TOOLS_IMAGE_WORKER_IMAGE: undefined }, {
    repositoryRoot: path.resolve(__dirname, ".."),
    composeValidator() { assert.fail("must not parse Compose"); },
    evidenceVerifier: verifiedEvidence(environment)
  }), /IMAGE_WORKER_IMAGE/);
});

test("production preflight binds an enabled raw image OCR profile to signed release evidence", () => {
  const environment = productionEnvironment({
    COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE: "tesseract-tsv-v1",
    COMMON_TOOLS_IMAGE_RAW_OCR_EXECUTABLE: "/usr/bin/tesseract",
    COMMON_TOOLS_IMAGE_RAW_OCR_SHA256: "c".repeat(64),
    COMMON_TOOLS_IMAGE_RAW_OCR_LANGUAGES: "eng,chi_sim"
  });
  const rawImageOcrProfiles = [{ name: "tesseract-tsv-v1", image: environment.COMMON_TOOLS_IMAGE_WORKER_IMAGE, executable: "/usr/bin/tesseract", executableSha256: "c".repeat(64), languages: ["eng", "chi_sim"], license: "Apache-2.0" }];
  let composeCalled = false;
  const result = runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    evidenceVerifier: verifiedEvidence(environment, { rawImageOcrProfiles }),
    composeValidator() { composeCalled = true; }
  });
  assert.equal(result.composeValidated, true);
  assert.equal(composeCalled, true);
  assert.throws(() => runProductionPreflight(environment, {
    repositoryRoot: path.resolve(__dirname, ".."),
    evidenceVerifier: verifiedEvidence(environment),
    composeValidator() { assert.fail("must not parse Compose") }
  }), /raw image OCR profile/);
});

test("resolved production Compose cannot regain build paths, local ports, or local-infrastructure dependencies", () => {
  const remoteImage = `registry.example.test/common-tools/remote@sha256:${DIGEST}`;
  const imageWorkerImage = `registry.example.test/common-tools/image-worker@sha256:${DIGEST}`;
  const environment = { NODE_ENV: "production", COMMON_TOOLS_TEAM_MODE: "production" };
  const service = (image) => ({ image, environment, depends_on: { "team-migrate": { condition: "service_completed_successfully" } } });
  const valid = { services: {
    "team-migrate": { image: remoteImage, environment },
    "remote-mcp": { ...service(remoteImage), environment: { ...environment, COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3", COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true", COMMON_TOOLS_REMOTE_HOST: "0.0.0.0" } },
    "team-retention": service(remoteImage),
    "project-audit-worker": service(remoteImage),
    "image-to-editable-worker": service(imageWorkerImage)
  } };
  assert.equal(validateResolvedProductionCompose(valid, { remoteImage, imageWorkerImage }), true);
  assert.throws(() => validateResolvedProductionCompose({ services: { ...valid.services, "remote-mcp": { ...valid.services["remote-mcp"], build: { context: "." } } } }, { remoteImage, imageWorkerImage }), /image configuration/);
  assert.throws(() => validateResolvedProductionCompose({ services: { ...valid.services, "remote-mcp": { ...valid.services["remote-mcp"], ports: ["127.0.0.1:3000:3000"] } } }, { remoteImage, imageWorkerImage }), /must not publish ports/);
  assert.throws(() => validateResolvedProductionCompose({ services: { ...valid.services, "project-audit-worker": { ...valid.services["project-audit-worker"], depends_on: { postgres: { condition: "service_healthy" }, "team-migrate": { condition: "service_completed_successfully" } } } } }, { remoteImage, imageWorkerImage }), /dependency gate/);
  assert.throws(() => validateResolvedProductionCompose({ services: { ...valid.services, "remote-mcp": { ...valid.services["remote-mcp"], environment: { ...valid.services["remote-mcp"].environment, COMMON_TOOLS_TEAM_MODE: "development" } } } }, { remoteImage, imageWorkerImage }), /image configuration/);
  assert.throws(() => validateResolvedProductionCompose({ services: { ...valid.services, "remote-mcp": { ...valid.services["remote-mcp"], environment: { ...valid.services["remote-mcp"].environment, COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "false" } } } }, { remoteImage, imageWorkerImage }), /API environment/);
  const pptQualityOnly = { services: {
    "team-migrate": { image: remoteImage, environment },
    "remote-mcp": { ...service(remoteImage), environment: { ...environment, COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3", COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true", COMMON_TOOLS_REMOTE_HOST: "0.0.0.0" } },
    "team-retention": service(remoteImage),
    "ppt-quality-worker": service(remoteImage)
  } };
  assert.equal(validateResolvedProductionCompose(pptQualityOnly, { remoteImage, enabledCapabilities: ["ppt-quality"] }), true);
  const pptImproveOnly = { services: {
    "team-migrate": { image: remoteImage, environment },
    "remote-mcp": { ...service(remoteImage), environment: { ...environment, COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3", COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true", COMMON_TOOLS_REMOTE_HOST: "0.0.0.0" } },
    "team-retention": service(remoteImage),
    "ppt-improve-worker": service(remoteImage)
  } };
  assert.equal(validateResolvedProductionCompose(pptImproveOnly, { remoteImage, enabledCapabilities: ["ppt-improve"] }), true);
  const siyuanOnly = { services: {
    "team-migrate": { image: remoteImage, environment },
    "remote-mcp": { ...service(remoteImage), environment: { ...environment, COMMON_TOOLS_REMOTE_BACKEND: "postgres-redis-s3", COMMON_TOOLS_REQUIRE_PROJECT_RBAC: "true", COMMON_TOOLS_REMOTE_HOST: "0.0.0.0" } },
    "team-retention": service(remoteImage)
  } };
  assert.equal(validateResolvedProductionCompose(siyuanOnly, { remoteImage, enabledCapabilities: ["siyuan-note"] }), true);
});
