"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { summarizeCloseout, validateChecklist } = require("../scripts/verify-architecture-closeout");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function writeText(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, value);
}

function repeatedLines(count) {
  return `${Array.from({ length: count }, (_, index) => `module.exports.value${index} = ${index};`).join("\n")}\n`;
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("architecture closeout checklist validates configured and dynamic evidence boundaries", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const strictFiles = Array.from({ length: 8 }, (_, index) => `packages/strict-boundary-${index}.js`);
  const recoveryFiles = Array.from({ length: 6 }, (_, index) => `packages/recovery-${index}.js`);
  const editableFiles = Array.from({ length: 8 }, (_, index) => `packages/editable-quality-${index}.js`);
  const editableArtifacts = Array.from({ length: 3 }, (_, index) => `.codex-tmp/editable-artifact-${index}.json`);
  for (const file of [
    "config/workspace-package-policy.json",
    "config/layer-policy.json",
    "config/architecture-budgets.json",
    ".codex-tmp/architecture-current-consolidated-ci-evidence.json",
    "config/skill-source-migration-budget.json",
    ".codex-tmp/auxiliary-runtime-package-evidence.json",
    ".codex-tmp/registry-callback-delivery-evidence.json",
    "docs/architecture-current-status.md",
    "docs/architecture-closeout-plan.md",
    "scripts/team-runtime-local-closeout.ps1",
    "scripts/team-runtime-local-acceptance.ps1",
    "scripts/verify-local-acceptance-evidence.js",
    "scripts/prepare-production-env.ps1",
    "scripts/team-runtime-production-deploy.ps1",
    "packages/cli/production-acceptance-plan.js",
    "docs/stage-recovery-acceptance.md",
    ".codex-tmp/architecture-recovery-consolidated-ci-evidence.json",
    ".codex-tmp/relationship-worker-delivery-evidence.json",
    ".codex-tmp/ppt-create-acceptance-LMJ7Mz/evidence.json",
    ".codex-tmp/image-office-9161d475/independent-evidence.json"
  ]) {
    writeText(path.join(workspace, file), "{}\n");
  }
  writeText(path.join(workspace, "packages", "slideclone-native-engine", "scripts", "rebuild-real-pptx-native.js"), repeatedLines(1600));
  writeText(path.join(workspace, "packages", "slideclone-native-engine", "scripts", "lib", "native-rebuild-focused-domain.js"), repeatedLines(12));
  for (const [index, file] of [...strictFiles, ...recoveryFiles, ...editableFiles, ...editableArtifacts].entries()) {
    writeText(path.join(workspace, file), `{"index":${index}}\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "strict-input-boundaries-current-evidence.json"), {
    schemaVersion: 1,
    files: strictFiles.map((file, index) => ({ file, sha256: sha256(`{"index":${index}}\n`) })),
    checks: {
      targetedTests: { exitCode: 0, passed: 46, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, ".codex-tmp", "recovery-retention-current-evidence.json"), {
    schemaVersion: 1,
    files: recoveryFiles.map((file, index) => ({ file, sha256: sha256(`{"index":${strictFiles.length + index}}\n`) })),
    checks: {
      postgresRecovery: { exitCode: 0, passed: 1, failed: 0 },
      s3Retention: { exitCode: 0, passed: 1, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, ".codex-tmp", "editable-output-quality-current-evidence.json"), {
    schemaVersion: 1,
    files: editableFiles.map((file, index) => ({ file, sha256: sha256(`{"index":${strictFiles.length + recoveryFiles.length + index}}\n`) })),
    artifacts: editableArtifacts.map((file, index) => ({ file, sha256: sha256(`{"index":${strictFiles.length + recoveryFiles.length + editableFiles.length + index}}\n`) })),
    checks: {
      pptCreateOfficeSmoke: { exitCode: 0, passed: true, mainRoundTripCases: 2, independentRoundTripCases: 5, independentDeckCount: 5, independentPageCount: 33 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [
      {
        id: "platform-capability-boundary",
        area: "A",
        status: "verified",
        summary: "Static platform capability evidence is present.",
        evidenceFiles: ["config/workspace-package-policy.json", "config/layer-policy.json", "config/architecture-budgets.json", ".codex-tmp/architecture-current-consolidated-ci-evidence.json"],
        verificationCommands: ["npm run common-tools:verify-capabilities"]
      },
      {
        id: "skill-production-decoupling",
        area: "B",
        status: "verified",
        summary: "Static skill production decoupling evidence is present.",
        evidenceFiles: ["config/skill-source-migration-budget.json", ".codex-tmp/auxiliary-runtime-package-evidence.json", ".codex-tmp/registry-callback-delivery-evidence.json"],
        verificationCommands: ["node scripts/verify-slideclone-profiles.js"]
      },
      {
        id: "native-engine-core-modularization",
        area: "B",
        status: "verified",
        summary: "Native engine modularization is dynamically verified.",
        evidenceFiles: ["docs/architecture-current-status.md", "docs/architecture-closeout-plan.md"],
        verificationCommands: ["node scripts/verify-architecture-budgets.js"]
      },
      {
        id: "strict-input-boundaries",
        area: "C",
        status: "verified",
        summary: "Strict input boundary evidence is current.",
        evidenceFiles: [".codex-tmp/strict-input-boundaries-current-evidence.json"],
        verificationCommands: ["node --test test/strict-boundaries.test.js"]
      },
      {
        id: "local-authenticated-acceptance",
        area: "D",
        status: "open",
        summary: "Local acceptance stays open until runtime evidence exists.",
        evidenceFiles: ["scripts/team-runtime-local-closeout.ps1", "scripts/team-runtime-local-acceptance.ps1", "scripts/verify-local-acceptance-evidence.js"],
        verificationCommands: ["npm run common-tools:team-local-closeout"],
        remaining: ["Run local acceptance evidence."]
      },
      {
        id: "production-remote-acceptance",
        area: "D",
        status: "not-applicable",
        summary: "Production remote acceptance is outside the current local-only scope.",
        evidenceFiles: ["scripts/prepare-production-env.ps1", "scripts/team-runtime-production-deploy.ps1", "packages/cli/production-acceptance-plan.js"],
        verificationCommands: ["npm run common-tools:production-acceptance-evidence"],
        remaining: []
      },
      {
        id: "recovery-and-retention",
        area: "E",
        status: "verified",
        summary: "Recovery and retention evidence is current.",
        evidenceFiles: ["docs/stage-recovery-acceptance.md", ".codex-tmp/architecture-recovery-consolidated-ci-evidence.json", ".codex-tmp/recovery-retention-current-evidence.json"],
        verificationCommands: ["npm run test:postgres-recovery", "npm run test:s3-retention"]
      },
      {
        id: "editable-output-quality",
        area: "F",
        status: "verified",
        summary: "Editable output quality evidence is current.",
        evidenceFiles: [".codex-tmp/relationship-worker-delivery-evidence.json", ".codex-tmp/ppt-create-acceptance-LMJ7Mz/evidence.json", ".codex-tmp/image-office-9161d475/independent-evidence.json", ".codex-tmp/editable-output-quality-current-evidence.json"],
        verificationCommands: ["node scripts/ppt-create-office-smoke.js --out .codex-tmp/ppt-create-office-smoke-current"]
      }
    ]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.failures.length, 0);
  assert.ok(result.counts.verified >= 6);
  assert.equal(result.counts.partial, 0);
  assert.equal(result.counts.notApplicable, 1);
  const localAcceptance = result.items.find((item) => item.id === "local-authenticated-acceptance");
  assert.equal(localAcceptance.configuredStatus, "open");
  assert.equal(localAcceptance.status, localAcceptance.evidenceCheck.passed === true ? "verified" : "open");
  assert.equal(result.counts.open, localAcceptance.status === "open" ? 1 : 0);
  assert.equal(result.complete, localAcceptance.status === "verified");
  const productionAcceptance = result.items.find((item) => item.id === "production-remote-acceptance");
  assert.equal(productionAcceptance.configuredStatus, "not-applicable");
  assert.equal(productionAcceptance.status, "not-applicable");
  const nativeEngine = result.items.find((item) => item.id === "native-engine-core-modularization");
  assert.equal(nativeEngine.configuredStatus, "verified");
  assert.equal(nativeEngine.status, "verified");
  assert.equal(nativeEngine.evidenceCheck.available, true);
  assert.equal(nativeEngine.evidenceCheck.oversizedCount, 0);
  assert.equal(nativeEngine.evidenceCheck.oversizedDomainModuleCount, 0);
  assert.equal(nativeEngine.evidenceCheck.compositionRootMaxLines, 4100);
  assert.ok(nativeEngine.evidenceCheck.largestFiles[0].file.startsWith("packages/slideclone-native-engine/scripts/"));
});

test("architecture closeout checklist keeps local acceptance open until runtime evidence exists", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  fs.mkdirSync(path.join(workspace, "marker"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "marker", "local-script.txt"), "placeholder");
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "local-authenticated-acceptance",
      area: "D",
      status: "open",
      summary: "This item stays open until real local acceptance evidence exists.",
      evidenceFiles: ["marker/local-script.txt"],
      verificationCommands: ["npm run common-tools:verify-local-acceptance"],
      remaining: ["Run real acceptance evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.open, 1);
  assert.equal(result.counts.verified, 0);
  assert.equal(result.complete, false);
  assert.equal(result.items[0].configuredStatus, "open");
  assert.equal(result.items[0].status, "open");
  assert.equal(result.items[0].evidenceCheck.available, false);
  assert.equal(result.items[0].evidenceCheck.passed, false);
});

test("architecture closeout checklist treats not-applicable scope as complete-neutral", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  fs.writeFileSync(path.join(workspace, "evidence.json"), "{}");
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "future-production-scope",
      area: "D",
      status: "not-applicable",
      summary: "This future production scope is intentionally outside the current local-only closeout.",
      evidenceFiles: ["evidence.json"],
      verificationCommands: ["npm run future-production-check"],
      remaining: []
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace, requireComplete: true });
  assert.equal(result.complete, true);
  assert.equal(result.counts.notApplicable, 1);
  assert.deepEqual(result.failures, []);
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

test("architecture closeout checklist verifies native engine modularization with a bounded composition root", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const payloadRoot = path.join(workspace, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(payloadRoot, { recursive: true });
  fs.writeFileSync(path.join(payloadRoot, "rebuild-real-pptx-native.js"), repeatedLines(1600));
  fs.writeFileSync(path.join(payloadRoot, "native-rebuild-focused-domain.js"), repeatedLines(12));
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
  assert.equal(result.items[0].evidenceCheck.oversizedDomainModuleCount, 0);
  assert.deepEqual(result.items[0].evidenceCheck.compositionRoots, [
    "packages/slideclone-native-engine/scripts/rebuild-real-pptx-native.js"
  ]);
});

test("architecture closeout checklist verifies strict input boundaries with current evidence", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 8 }, (_, index) => `packages/strict-boundary-${index}.js`);
  for (const [index, file] of files.entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `module.exports = ${index};\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "strict-input-boundaries-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file, index) => ({ file, sha256: sha256(`module.exports = ${index};\n`) })),
    checks: {
      targetedTests: { exitCode: 0, passed: 46, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "strict-input-boundaries",
      area: "C",
      status: "partial",
      summary: "This item is dynamically verified by current strict boundary evidence.",
      evidenceFiles: [".codex-tmp/strict-input-boundaries-current-evidence.json"],
      verificationCommands: ["node --test test/strict-boundaries.test.js"],
      remaining: ["Refresh strict boundary evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.verified, 1);
  assert.equal(result.items[0].configuredStatus, "partial");
  assert.equal(result.items[0].status, "verified");
  assert.equal(result.items[0].evidenceCheck.passed, true);
});

test("architecture closeout checklist keeps strict input boundaries partial when evidence is stale", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 8 }, (_, index) => `packages/strict-boundary-${index}.js`);
  for (const [index, file] of files.entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `module.exports = ${index};\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "strict-input-boundaries-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file) => ({ file, sha256: sha256("old evidence\n") })),
    checks: {
      targetedTests: { exitCode: 0, passed: 46, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "strict-input-boundaries",
      area: "C",
      status: "partial",
      summary: "This item stays partial when strict boundary evidence is stale.",
      evidenceFiles: [".codex-tmp/strict-input-boundaries-current-evidence.json"],
      verificationCommands: ["node --test test/strict-boundaries.test.js"],
      remaining: ["Refresh strict boundary evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.items[0].status, "partial");
  assert.equal(result.items[0].evidenceCheck.passed, false);
  assert.match(result.items[0].evidenceCheck.failures.join("\n"), /stale/u);
});

test("architecture closeout checklist reports current recovery and retention evidence without closing production scope", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 6 }, (_, index) => `packages/recovery-${index}.js`);
  for (const [index, file] of files.entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `module.exports = ${index};\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "recovery-retention-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file, index) => ({ file, sha256: sha256(`module.exports = ${index};\n`) })),
    checks: {
      postgresRecovery: { exitCode: 0, passed: 1, failed: 0 },
      s3Retention: { exitCode: 0, passed: 1, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "recovery-and-retention",
      area: "E",
      status: "partial",
      summary: "This item stays partial until production recovery and observability are verified.",
      evidenceFiles: [".codex-tmp/recovery-retention-current-evidence.json"],
      verificationCommands: ["npm run test:postgres-recovery", "npm run test:s3-retention"],
      remaining: ["Verify production OCR release binding and online observability."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.items[0].status, "partial");
  assert.equal(result.items[0].remainingCount, 1);
  assert.equal(result.items[0].evidenceCheck.passed, true);
});

test("architecture closeout checklist flags stale recovery and retention evidence", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 6 }, (_, index) => `packages/recovery-${index}.js`);
  for (const [index, file] of files.entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `module.exports = ${index};\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "recovery-retention-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file) => ({ file, sha256: sha256("old recovery evidence\n") })),
    checks: {
      postgresRecovery: { exitCode: 0, passed: 1, failed: 0 },
      s3Retention: { exitCode: 0, passed: 1, failed: 0 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "recovery-and-retention",
      area: "E",
      status: "partial",
      summary: "This item reports stale local recovery evidence.",
      evidenceFiles: [".codex-tmp/recovery-retention-current-evidence.json"],
      verificationCommands: ["npm run test:postgres-recovery", "npm run test:s3-retention"],
      remaining: ["Refresh recovery evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.items[0].evidenceCheck.passed, false);
  assert.match(result.items[0].evidenceCheck.failures.join("\n"), /stale/u);
});

test("architecture closeout checklist reports editable output quality evidence without closing remote scope", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 8 }, (_, index) => `packages/editable-quality-${index}.js`);
  const artifacts = Array.from({ length: 3 }, (_, index) => `.codex-tmp/editable-artifact-${index}.json`);
  for (const [index, file] of [...files, ...artifacts].entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `{"index":${index}}\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "editable-output-quality-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file, index) => ({ file, sha256: sha256(`{"index":${index}}\n`) })),
    artifacts: artifacts.map((file, offset) => ({ file, sha256: sha256(`{"index":${files.length + offset}}\n`) })),
    checks: {
      pptCreateOfficeSmoke: { exitCode: 0, passed: true, mainRoundTripCases: 2, independentRoundTripCases: 5, independentDeckCount: 5, independentPageCount: 33 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "editable-output-quality",
      area: "F",
      status: "partial",
      summary: "This item stays partial until independent PDF and remote output quality are verified.",
      evidenceFiles: [".codex-tmp/editable-output-quality-current-evidence.json"],
      verificationCommands: ["node scripts/ppt-create-office-smoke.js --out .codex-tmp/ppt-create-office-smoke-current"],
      remaining: ["Verify independent PDF and remote output quality."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.items[0].status, "partial");
  assert.equal(result.items[0].remainingCount, 1);
  assert.equal(result.items[0].evidenceCheck.passed, true);
});

test("architecture closeout checklist flags stale editable output quality evidence", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const files = Array.from({ length: 8 }, (_, index) => `packages/editable-quality-${index}.js`);
  const artifacts = Array.from({ length: 3 }, (_, index) => `.codex-tmp/editable-artifact-${index}.json`);
  for (const [index, file] of [...files, ...artifacts].entries()) {
    fs.mkdirSync(path.dirname(path.join(workspace, file)), { recursive: true });
    fs.writeFileSync(path.join(workspace, file), `{"index":${index}}\n`);
  }
  writeJson(path.join(workspace, ".codex-tmp", "editable-output-quality-current-evidence.json"), {
    schemaVersion: 1,
    files: files.map((file) => ({ file, sha256: sha256("old editable evidence\n") })),
    artifacts: artifacts.map((file) => ({ file, sha256: sha256("old editable evidence\n") })),
    checks: {
      pptCreateOfficeSmoke: { exitCode: 0, passed: true, mainRoundTripCases: 2, independentRoundTripCases: 5, independentDeckCount: 5, independentPageCount: 33 },
      typecheck: { exitCode: 0 },
      workspaceBoundaries: { exitCode: 0 },
      architectureBudgets: { exitCode: 0 }
    }
  });
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "editable-output-quality",
      area: "F",
      status: "partial",
      summary: "This item reports stale editable output evidence.",
      evidenceFiles: [".codex-tmp/editable-output-quality-current-evidence.json"],
      verificationCommands: ["node scripts/ppt-create-office-smoke.js --out .codex-tmp/ppt-create-office-smoke-current"],
      remaining: ["Refresh editable output evidence."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.partial, 1);
  assert.equal(result.items[0].evidenceCheck.passed, false);
  assert.match(result.items[0].evidenceCheck.failures.join("\n"), /stale/u);
});

test("architecture closeout checklist keeps native engine open when a domain module exceeds target", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const payloadRoot = path.join(workspace, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(payloadRoot, { recursive: true });
  fs.writeFileSync(path.join(payloadRoot, "rebuild-real-pptx-native.js"), repeatedLines(1600));
  fs.writeFileSync(path.join(payloadRoot, "native-rebuild-bloated-domain.js"), repeatedLines(1501));
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "native-engine-core-modularization",
      area: "B",
      status: "open",
      summary: "This item remains open when native engine domain modules are oversized.",
      evidenceFiles: ["config/architecture-closeout-checklist.json"],
      verificationCommands: ["node scripts/verify-architecture-budgets.js"],
      remaining: ["Split oversized native engine domain modules."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.open, 1);
  assert.equal(result.items[0].status, "open");
  assert.equal(result.items[0].evidenceCheck.oversizedCount, 1);
  assert.equal(result.items[0].evidenceCheck.oversizedDomainModuleCount, 1);
  assert.equal(result.items[0].evidenceCheck.oversizedFiles[0].file, "packages/slideclone-native-engine/scripts/native-rebuild-bloated-domain.js");
});

test("architecture closeout checklist keeps native engine open when composition root exceeds its cap", () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-closeout-"));
  const payloadRoot = path.join(workspace, "packages", "slideclone-native-engine", "scripts");
  fs.mkdirSync(payloadRoot, { recursive: true });
  fs.writeFileSync(path.join(payloadRoot, "rebuild-real-pptx-native.js"), repeatedLines(4101));
  writeJson(path.join(workspace, "config", "architecture-closeout-checklist.json"), {
    version: 1,
    objective: "verify architecture closeout boundaries",
    items: [{
      id: "native-engine-core-modularization",
      area: "B",
      status: "open",
      summary: "This item remains open when the native engine composition root grows too large.",
      evidenceFiles: ["config/architecture-closeout-checklist.json"],
      verificationCommands: ["node scripts/verify-architecture-budgets.js"],
      remaining: ["Split oversized native engine composition root logic."]
    }]
  });

  const result = summarizeCloseout({ repositoryRoot: workspace });
  assert.equal(result.counts.open, 1);
  assert.equal(result.items[0].status, "open");
  assert.equal(result.items[0].evidenceCheck.oversizedCount, 1);
  assert.equal(result.items[0].evidenceCheck.oversizedDomainModuleCount, 0);
  assert.equal(result.items[0].evidenceCheck.oversizedFiles[0].file, "packages/slideclone-native-engine/scripts/rebuild-real-pptx-native.js");
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
