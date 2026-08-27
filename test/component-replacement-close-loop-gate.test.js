"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  evaluateCloseLoopGate,
  normalizeEmbeddedDecisionGate,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-close-loop-gate");

test("close loop gate parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-close-loop-gate.js",
    "--report",
    "close-loop.json",
    "--out",
    "gate.json",
    "--quality-matrix",
    "quality.json",
    "--apply-quality-gate",
    "apply-quality.json",
    "--allow-needs-harvest",
    "--allow-decision-gate-failure",
    "--min-applied-count",
    "2"
  ]);

  assert.equal(args.report, "close-loop.json");
  assert.equal(args.out, "gate.json");
  assert.equal(args.qualityMatrix, "quality.json");
  assert.equal(args.applyQualityGate, "apply-quality.json");
  assert.equal(args.allowNeedsHarvest, true);
  assert.equal(args.allowDecisionGateFailure, true);
  assert.equal(args.minAppliedCount, 2);
  assert.throws(() => parseArgs(["node", "script"]), /--report is required/);
});

test("close loop gate fails missing samples by default", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-"));
  const report = writeReport(tmp, {
    status: "needs_harvest",
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 1, canApplyAll: false }
    }
  });

  const gate = evaluateCloseLoopGate({ report });

  assert.equal(gate.status, "failed");
  assert.match(gate.findings[0], /missing 1 component sample/);
});

test("close loop gate can allow needs-harvest for exploratory runs", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-allow-"));
  const report = writeReport(tmp, {
    status: "needs_harvest",
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 1, canApplyAll: false }
    }
  });

  const gate = evaluateCloseLoopGate({ report, allowNeedsHarvest: true });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.missingComponents, 1);
});

test("close loop gate enforces failures and applied thresholds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-threshold-"));
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 1, appliedCount: 1, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });

  const gate = evaluateCloseLoopGate({ report, minAppliedCount: 2 });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.includes("failed file")));
  assert.ok(gate.findings.some((item) => item.includes("below required 2")));
});

test("close loop gate passes complete replacement evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-pass-"));
  const out = path.join(tmp, "gate.json");
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 0, appliedCount: 3, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });

  const gate = evaluateCloseLoopGate({ report, out, minAppliedCount: 2 });

  assert.equal(gate.status, "passed");
  assert.deepEqual(gate.findings, []);
  assert.equal(fs.existsSync(out), true);
});

test("close loop gate treats protected non-semantic targets as a completed safe skip", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-protected-"));
  const report = writeReport(tmp, {
    status: "protected_non_semantic_targets",
    totals: {
      irPlan: { ready: 0, blockedNonSemanticTarget: 2 },
      gaps: { missingComponents: 0, canApplyAll: false }
    }
  });

  const gate = evaluateCloseLoopGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.protectedNonSemanticTargets, 2);
  assert.equal(gate.summary.protectedOnly, true);
  assert.equal(gate.summary.canApplyAll, true);
  assert.deepEqual(gate.findings, []);
});

test("close loop gate still enforces applied thresholds for protected-only reports", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-protected-threshold-"));
  const report = writeReport(tmp, {
    status: "protected_non_semantic_targets",
    totals: {
      irPlan: { ready: 0, blockedNonSemanticTarget: 1 },
      gaps: { missingComponents: 0, canApplyAll: false }
    }
  });

  const gate = evaluateCloseLoopGate({ report, minAppliedCount: 1 });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.protectedOnly, true);
  assert.ok(gate.findings.some((item) => item.includes("appliedCount 0 is below required 1")));
});

test("close loop gate fails embedded graphic decision gate failures by default", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-decision-"));
  const report = writeReport(tmp, {
    status: "needs_harvest",
    decisionGate: {
      status: "failed",
      gate: {
        findings: ["actionable native gaps 2 exceeds max 0"]
      }
    },
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 1, canApplyAll: false },
      decisionGate: {
        status: "failed",
        findings: ["actionable native gaps 2 exceeds max 0"]
      }
    }
  });

  const gate = evaluateCloseLoopGate({ report, allowNeedsHarvest: true });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.decisionGateStatus, "failed");
  assert.equal(gate.summary.decisionGatePassed, false);
  assert.ok(gate.findings.some((item) => item.includes("graphic reconstruction decision gate failed")));
});

test("close loop gate can explicitly allow embedded graphic decision gate failures", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-decision-allow-"));
  const report = writeReport(tmp, {
    status: "needs_harvest",
    decisionGate: {
      status: "failed",
      findings: ["plugin targets below threshold"]
    },
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 1, canApplyAll: false }
    }
  });

  const gate = evaluateCloseLoopGate({
    report,
    allowNeedsHarvest: true,
    allowDecisionGateFailure: true
  });

  assert.equal(gate.status, "passed");
  assert.equal(gate.allowDecisionGateFailure, true);
  assert.equal(gate.summary.decisionGateStatus, "failed");
});

test("close loop gate surfaces passed embedded graphic decision gate status", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-decision-pass-"));
  const report = writeReport(tmp, {
    status: "needs_harvest",
    decisionGate: { status: "passed" },
    totals: {
      batch: { failed: 0, appliedCount: 0, canApplyAll: false },
      gaps: { missingComponents: 1, canApplyAll: false },
      decisionGate: { status: "passed" }
    }
  });

  const gate = evaluateCloseLoopGate({ report, allowNeedsHarvest: true });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.decisionGateStatus, "passed");
  assert.equal(gate.summary.decisionGatePassed, true);
});

test("close loop gate fails when quality matrix reports structure-fit regression", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-quality-"));
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 0, appliedCount: 3, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });
  const qualityMatrix = writeQualityMatrix(tmp, {
    passed: false,
    regression: {
      passed: false,
      failedDecks: ["Deck_A"],
      comparisons: [{
        deck: "Deck_A",
        reasons: ["component-template-structure-fit-ratio-regressed"]
      }]
    }
  });

  const gate = evaluateCloseLoopGate({ report, qualityMatrix, minAppliedCount: 2 });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.qualityMatrixPassed, false);
  assert.equal(gate.summary.qualityRegressionPassed, false);
  assert.ok(gate.findings.some((item) => item.includes("quality matrix failed: Deck_A")));
  assert.ok(gate.findings.some((item) => item.includes("component-template-structure-fit-ratio-regressed")));
});

test("close loop gate passes when replacement and quality evidence both pass", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-quality-pass-"));
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 0, appliedCount: 3, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });
  const qualityMatrix = writeQualityMatrix(tmp, {
    passed: true,
    totals: {
      protectedNonSemanticSkips: 4
    },
    regression: {
      passed: true,
      failedDecks: [],
      comparisons: []
    }
  });

  const gate = evaluateCloseLoopGate({ report, qualityMatrix, minAppliedCount: 2 });

  assert.equal(gate.status, "passed");
  assert.deepEqual(gate.findings, []);
  assert.equal(gate.summary.qualityMatrixPassed, true);
  assert.equal(gate.summary.qualityRegressionPassed, true);
  assert.equal(gate.summary.qualityMatrixProtectedNonSemanticSkips, 4);
});

test("close loop gate fails when apply quality gate reports overlay risk", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-apply-quality-"));
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 0, appliedCount: 3, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });
  const applyQualityGate = writeApplyQualityGate(tmp, {
    status: "failed",
    findings: [{
      code: "fallback-without-crop-removal",
      message: "fallbackWithoutCropRemoval 1 exceeds allowed 0"
    }]
  });

  const gate = evaluateCloseLoopGate({ report, applyQualityGate, minAppliedCount: 2 });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.applyQualityGateStatus, "failed");
  assert.equal(gate.summary.applyQualityGatePassed, false);
  assert.ok(gate.findings.some((item) => item.includes("fallbackWithoutCropRemoval 1")));
});

test("close loop gate passes when apply quality gate passes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-gate-apply-quality-pass-"));
  const report = writeReport(tmp, {
    status: "applied",
    totals: {
      batch: { failed: 0, appliedCount: 3, canApplyAll: true },
      gaps: { missingComponents: 0, canApplyAll: true }
    }
  });
  const applyQualityGate = writeApplyQualityGate(tmp, {
    status: "passed",
    findings: []
  });

  const gate = evaluateCloseLoopGate({ report, applyQualityGate, minAppliedCount: 2 });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.applyQualityGateStatus, "passed");
  assert.equal(gate.summary.applyQualityGatePassed, true);
});

test("normalizeEmbeddedDecisionGate reads status and findings from supported report shapes", () => {
  assert.deepEqual(
    normalizeEmbeddedDecisionGate({
      decisionGate: {
        status: "failed",
        gate: { findings: ["gap"] }
      }
    }),
    { present: true, status: "failed", findings: ["gap"] }
  );
  assert.deepEqual(
    normalizeEmbeddedDecisionGate({ totals: { decisionGate: { status: "passed" } } }),
    { present: true, status: "passed", findings: [] }
  );
  assert.deepEqual(
    normalizeEmbeddedDecisionGate({}),
    { present: false, status: "", findings: [] }
  );
});

function writeReport(tmp, payload) {
  const file = path.join(tmp, "close-loop.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function writeQualityMatrix(tmp, payload) {
  const file = path.join(tmp, "quality-matrix.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}

function writeApplyQualityGate(tmp, payload) {
  const file = path.join(tmp, "apply-quality-gate.json");
  fs.writeFileSync(file, JSON.stringify(payload, null, 2));
  return file;
}
