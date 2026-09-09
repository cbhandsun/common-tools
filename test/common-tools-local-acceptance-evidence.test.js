"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  validateEvidence,
  verifyLocalAcceptanceEvidence,
  walkForSecrets
} = require("../scripts/verify-local-acceptance-evidence");

const expectedCapabilities = Object.freeze(["image-to-editable", "ppt-create", "ppt-quality", "ppt-improve", "project-audit"]);

function validEvidence() {
  return {
    schemaVersion: 1,
    capturedAt: "2026-09-09T00:00:00.000Z",
    startedAt: "2026-09-09T00:00:00.000Z",
    project: "deploy",
    capability: "image-to-editable",
    capabilities: [...expectedCapabilities],
    username: "local-tester",
    projectId: "deploy",
    role: "editor",
    localSmoke: {
      runtimeOk: true,
      identityProviderVerified: true,
      unauthorizedChallengeVerified: true,
      metadataScopesVerified: expectedCapabilities.length
    },
    testUser: {
      status: "current",
      changed: false
    },
    authenticatedJobSmoke: {
      passed: true,
      capability: "image-to-editable",
      jobId: "job_123",
      status: "succeeded"
    },
    passed: true
  };
}

test("local acceptance evidence verifier accepts a complete sanitized local proof", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-local-acceptance-"));
  const evidenceDirectory = path.join(workspace, "artifacts", "local-acceptance");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  const evidenceFile = path.join(evidenceDirectory, "local-acceptance-20260909T010203-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json");
  fs.writeFileSync(evidenceFile, JSON.stringify(validEvidence(), null, 2));

  const result = verifyLocalAcceptanceEvidence({ repositoryRoot: workspace });
  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
  assert.equal(result.evidenceFile, evidenceFile);
});

test("local acceptance evidence verifier rejects missing gates and secret-shaped content", () => {
  const evidence = validEvidence();
  evidence.localSmoke.identityProviderVerified = false;
  evidence.authenticatedJobSmoke.passed = false;
  evidence.authenticatedJobSmoke.token = "Bearer abcdefghijklmnopqrstuvwxyz";

  const result = validateEvidence(evidence, expectedCapabilities);
  assert.equal(result.passed, false);
  assert.match(result.failures.join("\n"), /local identity provider was not verified/u);
  assert.match(result.failures.join("\n"), /authenticated job smoke did not pass/u);
  assert.match(result.failures.join("\n"), /secret-shaped fields/u);
});

test("local acceptance evidence secret scanner catches signed URLs and credential URLs", () => {
  const findings = walkForSecrets({
    nested: {
      signedUrl: "https://example.invalid/download?signature=hidden",
      database: "postgresql://user:password@example.invalid/common_tools"
    }
  });
  assert.deepEqual(findings.sort(), ["nested.database", "nested.signedUrl"]);
});
