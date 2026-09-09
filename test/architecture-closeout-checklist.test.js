"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCloseout, validateChecklist } = require("../scripts/verify-architecture-closeout");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

test("architecture closeout checklist validates current open and verified evidence boundaries", () => {
  const result = summarizeCloseout({ repositoryRoot: path.resolve(__dirname, "..") });
  assert.equal(result.failures.length, 0);
  assert.equal(result.complete, false);
  assert.ok(result.counts.verified >= 2);
  assert.ok(result.counts.partial >= 1);
  assert.ok(result.counts.open >= 1);
  assert.ok(result.items.some((item) => item.id === "local-authenticated-acceptance" && item.status === "open"));
  const localAcceptance = result.items.find((item) => item.id === "local-authenticated-acceptance");
  assert.equal(localAcceptance.configuredStatus, "open");
  assert.equal(localAcceptance.evidenceCheck.passed, false);
  const nativeEngine = result.items.find((item) => item.id === "native-engine-core-modularization");
  assert.equal(nativeEngine.configuredStatus, "open");
  assert.equal(nativeEngine.evidenceCheck.available, true);
  assert.ok(nativeEngine.evidenceCheck.oversizedCount >= 1);
  assert.ok(nativeEngine.evidenceCheck.largestFiles[0].file.startsWith("packages/slideclone-native-engine/scripts/"));
});

test("architecture closeout checklist cannot mark missing evidence as verified", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const checklist = {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "missing-proof",
      area: "A",
      status: "verified",
      summary: "This item intentionally points at missing evidence.",
      evidenceFiles: ["missing.json"],
      verificationCommands: ["node scripts/verify-example.js"]
    }]
  };
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), checklist);
  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0], /marked verified but evidence is missing/u);
});

test("architecture closeout checklist require-complete mode rejects open work", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const evidence = path.join(workspace, "evidence.json");
  fs.writeFileSync(evidence, "{}");
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "still-open",
      area: "D",
      status: "open",
      summary: "This item remains open until real runtime evidence exists.",
      evidenceFiles: ["evidence.json"],
      verificationCommands: ["npm run verify"],
      remaining: ["Run real acceptance evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace, requireComplete: true });
  assert.equal(result.complete, false);
  assert.match(result.failures.join("\n"), /still-open is not verified/u);
});

test("architecture closeout checklist verifies local acceptance dynamically when evidence exists", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  fs.mkdirSync(path.join(workspace, "marker"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "marker", "local-script.txt"), "placeholder");
  const evidenceDirectory = path.join(workspace, "artifacts", "local-acceptance");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  writeJson(path.join(evidenceDirectory, "local-acceptance-20260909T010203-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"), {
    schemaVersion: 1,
    capturedAt: "2026-09-09T00:00:00.000Z",
    startedAt: "2026-09-09T00:00:00.000Z",
    project: "deploy",
    capability: "image-to-editable",
    capabilities: ["image-to-editable", "ppt-create", "ppt-quality", "ppt-improve", "project-audit"],
    username: "local-tester",
    projectId: "deploy",
    role: "editor",
    localSmoke: {
      runtimeOk: true,
      identityProviderVerified: true,
      unauthorizedChallengeVerified: true,
      metadataScopesVerified: 5
    },
    testUser: { status: "current", changed: false },
    authenticatedJobSmoke: { passed: true, capability: "image-to-editable", jobId: "job_123", status: "succeeded" },
    passed: true
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "local-authenticated-acceptance",
      area: "D",
      status: "open",
      summary: "This item is dynamically verified when local acceptance evidence exists.",
      evidenceFiles: ["marker/local-script.txt"],
      verificationCommands: ["npm run common-tools:verify-local-acceptance"],
      remaining: ["Run real acceptance evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.verified, 1);
  assert.equal(result.counts.open, 0);
  assert.equal(result.complete, true);
  assert.equal(result.items[0].configuredStatus, "open");
  assert.equal(result.items[0].status, "verified");
  assert.equal(result.items[0].evidenceCheck.passed, true);
});

test("architecture closeout checklist verifies native engine modularization dynamically when files are below target", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const payloadRoot = path.join(workspace, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(payloadRoot, { recursive: true });
  fs.writeFileSync(path.join(payloadRoot, "rebuild-real-pptx-native.js"), "\"use strict\";\nmodule.exports = {};\n");
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "native-engine-core-modularization",
      area: "B",
      status: "open",
      summary: "This item is dynamically verified when native engine modules are small.",
      evidenceFiles: ["config/architecture-closeout-checklist.json"],
      verificationCommands: ["node scripts/verify-architecture-budgets.js"],
      remaining: ["Split oversized native engine files."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.verified, 1);
  assert.equal(result.items[0].configuredStatus, "open");
  assert.equal(result.items[0].status, "verified");
  assert.equal(result.items[0].evidenceCheck.oversizedCount, 0);
});

test("architecture closeout checklist keeps local acceptance open when evidence is unsafe or incomplete", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  fs.mkdirSync(path.join(workspace, "artifacts", "local-acceptance"), { recursive: true });
  writeJson(path.join(workspace, "artifacts", "local-acceptance", "local-acceptance-20260909T010203-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.json"), {
    schemaVersion: 1,
    project: "deploy",
    capability: "image-to-editable",
    capabilities: ["image-to-editable", "ppt-create", "ppt-quality", "ppt-improve", "project-audit"],
    localSmoke: { runtimeOk: true, identityProviderVerified: false, unauthorizedChallengeVerified: true, metadataScopesVerified: 5 },
    testUser: { status: "current", changed: false },
    authenticatedJobSmoke: { passed: true, jobId: "job_123", token: "Bearer abcdefghijklmnopqrstuvwxyz" },
    passed: false
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "local-authenticated-acceptance",
      area: "D",
      status: "open",
      summary: "This item stays open when the evidence verifier fails.",
      evidenceFiles: ["missing-until-verified.txt"],
      verificationCommands: ["npm run common-tools:verify-local-acceptance"],
      remaining: ["Run real acceptance evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.open, 1);
  assert.equal(result.items[0].status, "open");
  assert.equal(result.items[0].evidenceCheck.passed, false);
  assert.match(result.items[0].evidenceCheck.failures.join("\n"), /identity provider|secret-shaped/u);
});

test("architecture closeout checklist promotes production evidence only to partial after read-only gates", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const evidenceDirectory = path.join(workspace, ".codex-tmp", "production-acceptance-evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  writeJson(path.join(evidenceDirectory, "acceptance-summary.json"), {
    status: "ready-for-controlled-apply",
    credentialMode: "files",
    files: {
      plan: "acceptance-plan.json",
      productionPreflight: "production-preflight.json",
      migrationStatus: "migration-status.json"
    },
    checks: [
      { name: "production-preflight", status: "passed" },
      { name: "migration-status", status: "passed" }
    ],
    blockers: []
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "production-remote-acceptance",
      area: "D",
      status: "open",
      summary: "This item is only partially satisfied by read-only production evidence.",
      evidenceFiles: ["config/architecture-closeout-checklist.json"],
      verificationCommands: ["npm run common-tools:production-acceptance-evidence"],
      remaining: ["Run production preflight.", "Run remote jobs.", "Verify rollback."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.counts.open, 0);
  assert.equal(result.complete, false);
  assert.equal(result.items[0].configuredStatus, "open");
  assert.equal(result.items[0].status, "partial");
  assert.equal(result.items[0].remainingCount, 2);
  assert.equal(result.items[0].evidenceCheck.passed, true);
});

test("architecture closeout checklist keeps production evidence open when summary leaks secrets", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const evidenceDirectory = path.join(workspace, ".codex-tmp", "production-acceptance-evidence");
  fs.mkdirSync(evidenceDirectory, { recursive: true });
  writeJson(path.join(evidenceDirectory, "acceptance-summary.json"), {
    status: "ready-for-controlled-apply",
    checks: [
      { name: "production-preflight", status: "passed" },
      { name: "migration-status", status: "passed" }
    ],
    token: "Bearer abcdefghijklmnopqrstuvwxyz"
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "production-remote-acceptance",
      area: "D",
      status: "open",
      summary: "This item stays open when production evidence is unsafe.",
      evidenceFiles: ["config/architecture-closeout-checklist.json"],
      verificationCommands: ["npm run common-tools:production-acceptance-evidence"],
      remaining: ["Run safe production evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.open, 1);
  assert.equal(result.items[0].status, "open");
  assert.match(result.items[0].evidenceCheck.failures.join("\n"), /secret-shaped/u);
});

test("architecture closeout checklist rejects absolute or parent-relative evidence paths", () => {
  assert.throws(() => validateChecklist({
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "unsafe-path",
      area: "B",
      status: "partial",
      summary: "This item has an unsafe evidence path.",
      evidenceFiles: ["../secret.json"],
      verificationCommands: ["npm run verify"],
      remaining: ["Replace unsafe evidence path."]
    }]
  }), /repository-relative/u);
});
