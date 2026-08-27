"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  allowedDecisionKinds,
  evaluateDecisionGate,
  parseArgs
} = require("../skills/pd-hifi-slideclone/scripts/graphic-reconstruction-decision-gate");

function writeReport(tmp, payload) {
  const file = path.join(tmp, "decision-report.json");
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}

function baseReport(overrides = {}) {
  const summary = {
    total: 10,
    byDecision: {
      "preserve-local-crop": 2,
      "harvest-or-apply-plugin-template": 8
    },
    protectedCrops: 2,
    pluginTemplateTargets: 8,
    actionableNativeGaps: 0,
    ...(overrides.summary || {})
  };
  return {
    ok: true,
    summary,
    decisions: [
      {
        decision: "preserve-local-crop",
        detector: "decorative-icon-crop",
        layerType: "illustration-zone",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "图标",
        recommendedAction: "preserve-local-crop",
        areaRatio: 0.03,
        reasons: ["protected-icon-illustration-or-screenshot"]
      },
      {
        decision: "preserve-local-crop",
        detector: "screenshot-process-underlay-crop",
        layerType: "screenshot-zone",
        expressionForm: "screenshot-or-document",
        expressionSubtype: "product-screenshot",
        recommendedAction: "preserve-local-crop",
        areaRatio: 0.56,
        reasons: ["protected-icon-illustration-or-screenshot"]
      },
      { decision: "harvest-or-apply-plugin-template" }
    ],
    ...overrides,
    summary
  };
}

test("graphic reconstruction decision gate parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "graphic-reconstruction-decision-gate.js",
    "--report",
    "decision.json",
    "--out",
    "gate.json",
    "--max-actionable-gaps",
    "1",
    "--min-plugin-targets",
    "3",
    "--min-protected-crops",
    "2",
    "--max-protected-crop-area-ratio",
    "0.2",
    "--allow-defer"
  ]);

  assert.equal(args.report, "decision.json");
  assert.equal(args.out, "gate.json");
  assert.equal(args.maxActionableGaps, 1);
  assert.equal(args.minPluginTargets, 3);
  assert.equal(args.minProtectedCrops, 2);
  assert.equal(args.maxProtectedCropAreaRatio, 0.2);
  assert.equal(args.requireNoDefer, false);
  assert.throws(() => parseArgs(["node", "script"]), /--report is required/);
});

test("graphic reconstruction decision gate passes complete evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-pass-"));
  const out = path.join(tmp, "gate.json");
  const report = writeReport(tmp, baseReport());

  const gate = evaluateDecisionGate({
    report,
    out,
    minPluginTargets: 8,
    minProtectedCrops: 2
  });

  assert.equal(gate.status, "passed");
  assert.deepEqual(gate.findings, []);
  assert.equal(fs.existsSync(out), true);
});

test("graphic reconstruction decision gate fails actionable gaps and report ok flag", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-gap-"));
  const report = writeReport(tmp, baseReport({
    ok: false,
    summary: {
      actionableNativeGaps: 2,
      byDecision: { "rebuild-native-gap": 2 }
    },
    decisions: [
      { decision: "rebuild-native-gap" },
      { decision: "rebuild-native-gap" }
    ]
  }));

  const gate = evaluateDecisionGate({ report, maxActionableGaps: 0 });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((finding) => finding.includes("ok flag")));
  assert.ok(gate.findings.some((finding) => finding.includes("actionableNativeGaps 2")));
});

test("graphic reconstruction decision gate enforces plugin and protected crop thresholds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-threshold-"));
  const report = writeReport(tmp, baseReport({
    summary: {
      pluginTemplateTargets: 1,
      protectedCrops: 0
    }
  }));

  const gate = evaluateDecisionGate({
    report,
    minPluginTargets: 2,
    minProtectedCrops: 1
  });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((finding) => finding.includes("pluginTemplateTargets 1")));
  assert.ok(gate.findings.some((finding) => finding.includes("protectedCrops 0")));
});

test("graphic reconstruction decision gate fails defer and unknown decision kinds", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-defer-"));
  const report = writeReport(tmp, baseReport({
    decisions: [
      { decision: "defer-low-confidence" },
      { decision: "mystery-decision" }
    ]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((finding) => finding.includes("defer-low-confidence")));
  assert.ok(gate.findings.some((finding) => finding.includes("mystery-decision")));
});

test("graphic reconstruction decision gate fails oversized unexplained protected crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-large-crop-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "foreground-graphic-crop",
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: "process-flow",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.46,
      reasons: ["protected-icon-illustration-or-screenshot"]
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.oversizedProtectedCrops, 1);
  assert.ok(gate.findings.some((finding) => finding.includes("oversized protected crops")));
  assert.equal(gate.examples.oversizedProtectedCrops[0].imageId, "");
});

test("graphic reconstruction decision gate fails semantic protected crops without fidelity exemption", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-semantic-crop-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "foreground-graphic-crop",
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: "process-flow",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.08,
      reasons: ["bounded-structural-area"]
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.semanticProtectedCropsWithoutEvidence, 1);
  assert.ok(gate.findings.some((finding) => finding.includes("semantic protected crops")));
  assert.equal(gate.examples.semanticProtectedCropsWithoutEvidence[0].expressionSubtype, "process-flow");
});

test("graphic reconstruction decision gate allows semantic-looking visual examples with explicit asset policy", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-semantic-example-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "asset-os-demand-understanding-protected-diagram-crop",
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: "asset-os-demand-understanding-diagram",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.12,
      reasons: [
        "minimum-unit:preserve-as-single-crop",
        "expression-policy:standalone-visual-asset",
        "expression-policy-reason:asset-dominated-diagram-example-preserved"
      ]
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.semanticProtectedCropsWithoutEvidence, 0);
});

test("graphic reconstruction decision gate allows large screenshot/document fidelity crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-large-screenshot-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "screenshot-process-underlay-crop",
      layerType: "screenshot-zone",
      expressionForm: "screenshot-or-document",
      expressionSubtype: "product-screenshot",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.62,
      reasons: ["protected-icon-illustration-or-screenshot"]
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.oversizedProtectedCrops, 0);
});

test("graphic reconstruction decision gate allows large decorative cover crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-large-cover-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "decorative-cover-background-underlay",
      layerType: "decorative-background",
      expressionForm: "decorative-cover-visual",
      expressionSubtype: "cover-decoration",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.9,
      reasons: ["protected-icon-illustration-or-screenshot"]
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.oversizedProtectedCrops, 0);
});

test("graphic reconstruction decision gate allows an explicitly approved fidelity exception", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-approved-fidelity-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "closed-loop-diagram-fidelity-crop",
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: "closed-loop-diagram-with-custom-routes",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      areaRatio: 0.54,
      reasons: ["protected-icon-illustration-or-screenshot"],
      fidelityException: {
        approved: true,
        preserveLocalCrop: true,
        reason: "native closed-loop reconstruction did not meet the source visual fidelity threshold"
      }
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.oversizedProtectedCrops, 0);
  assert.equal(gate.summary.semanticProtectedCropsWithoutEvidence, 0);
});

test("graphic reconstruction decision gate rejects incomplete fidelity exceptions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-incomplete-fidelity-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      detector: "closed-loop-diagram-fidelity-crop",
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: "closed-loop-diagram-with-custom-routes",
      recommendedAction: "preserve-local-crop",
      areaRatio: 0.54,
      reasons: ["protected-icon-illustration-or-screenshot"],
      fidelityException: { approved: true, preserveLocalCrop: false, reason: "short" }
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.oversizedProtectedCrops, 1);
  assert.equal(gate.summary.semanticProtectedCropsWithoutEvidence, 1);
});

test("graphic reconstruction decision gate fails protected crops without classifier evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-missing-evidence-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{ decision: "preserve-local-crop", areaRatio: 0.02 }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.missingProtectedCropEvidence, 1);
  assert.ok(gate.findings.some((finding) => finding.includes("missing explicit classifier evidence")));
});

test("graphic reconstruction decision gate accepts expression family as protected crop evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-family-evidence-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{
      decision: "preserve-local-crop",
      expressionFamily: "pictorial-asset",
      areaRatio: 0.72
    }]
  }));

  const gate = evaluateDecisionGate({ report });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.missingProtectedCropEvidence, 0);
  assert.equal(gate.summary.oversizedProtectedCrops, 0);
});

test("graphic reconstruction decision gate can allow deferred decisions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "graphic-decision-gate-allow-defer-"));
  const report = writeReport(tmp, baseReport({
    decisions: [{ decision: "defer-low-confidence" }]
  }));

  const gate = evaluateDecisionGate({ report, requireNoDefer: false });

  assert.equal(gate.status, "passed");
});

test("allowedDecisionKinds includes expected lifecycle decisions", () => {
  const kinds = allowedDecisionKinds();

  assert.equal(kinds.has("harvest-or-apply-plugin-template"), true);
  assert.equal(kinds.has("preserve-local-crop"), true);
  assert.equal(kinds.has("rebuild-native-gap"), true);
});
