"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  collectRows,
  evaluateMinimumUnitPolicyGate,
  findTruncatedDeckExamples,
  hasSemanticStructureEvidence,
  parseArgs,
  PROTECTED_POLICY_KINDS
} = require("../skills/pd-hifi-slideclone/scripts/minimum-unit-policy-gate");

function writeReport(tmp, report) {
  const file = path.join(tmp, "target-audit.json");
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return file;
}

function baseReport(overrides = {}) {
  return {
    ok: true,
    totals: {
      decks: 1,
      pages: 1,
      images: 2,
      embeddedPluginTargets: 2,
      executableTargets: 1,
      protectedCropTargets: 1,
      unsafeRejectedTargets: 0,
      deferTargets: 0
    },
    decks: [{
      deck: "Deck_A",
      summary: {
        executableTargets: 1,
        protectedCropTargets: 1
      },
      executableTargets: [{
        deck: "Deck_A",
        slide: 1,
        imageId: "relationship",
        decision: "executable-plugin-target",
        detector: "foreground-diagram-crop",
        layerType: "diagram-zone",
        expressionForm: "complex-diagram",
        expressionSubtype: "relationship-flow",
        expressionPolicy: { kind: "structured-native", reasons: ["structured-expression-with-semantic-atoms"] },
        structural: {
          executable: true,
          nodeCount: 4,
          connectorCount: 3,
          reasons: ["diagram-flow-relationship-minimum-unit", "semantic-structure-evidence"]
        },
        reasons: ["structured-expression-safe-for-plugin-component"]
      }],
      protectedCropTargets: [{
        deck: "Deck_A",
        slide: 1,
        imageId: "icon",
        decision: "preserve-local-crop",
        detector: "decorative-icon-crop",
        layerType: "illustration-zone",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "图标",
        expressionPolicy: { kind: "standalone-visual-asset" },
        structural: { executable: false, reasons: ["obvious-icon-screenshot-or-decorative-asset"] },
        reasons: ["expression-policy-protects-crop"]
      }]
    }],
    ...overrides
  };
}

test("minimum unit policy gate parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "minimum-unit-policy-gate.js",
    "--target-audit",
    "audit.json",
    "--out",
    "gate.json",
    "--markdown-out",
    "gate.md",
    "--min-executable-targets",
    "3",
    "--min-protected-crops",
    "2",
    "--allow-unsafe",
    "--allow-defer",
    "--allow-truncated-examples"
  ]);

  assert.equal(args.report, "audit.json");
  assert.equal(args.out, "gate.json");
  assert.equal(args.markdownOut, "gate.md");
  assert.equal(args.minExecutableTargets, 3);
  assert.equal(args.minProtectedCrops, 2);
  assert.equal(args.requireNoUnsafe, false);
  assert.equal(args.requireNoDefer, false);
  assert.equal(args.requireCompleteExamples, false);
  assert.throws(() => parseArgs(["node", "script"]), /--report is required/);
});

test("minimum unit policy gate passes semantic structure and protected crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gate-pass-"));
  const report = writeReport(tmp, baseReport());
  const out = path.join(tmp, "gate.json");
  const md = path.join(tmp, "gate.md");

  const gate = evaluateMinimumUnitPolicyGate({
    report,
    out,
    markdownOut: md,
    minExecutableTargets: 1,
    minProtectedCrops: 1
  });

  assert.equal(gate.status, "passed");
  assert.deepEqual(gate.findings, []);
  assert.equal(fs.existsSync(out), true);
  assert.match(fs.readFileSync(md, "utf8"), /semantic charts, tables, matrices/);
});

test("minimum unit policy gate fails when protected asset enters rebuild", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gate-protected-"));
  const bad = baseReport();
  bad.decks[0].executableTargets[0].detector = "decorative-icon-crop";
  bad.decks[0].executableTargets[0].layerType = "illustration-zone";
  bad.decks[0].executableTargets[0].expressionForm = "icon-or-illustration";
  bad.decks[0].executableTargets[0].expressionSubtype = "图标";
  bad.decks[0].executableTargets[0].expressionPolicy = { kind: "standalone-visual-asset" };
  const report = writeReport(tmp, bad);

  const gate = evaluateMinimumUnitPolicyGate({ report });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "protected-asset-entered-rebuild"));
});

test("minimum unit policy gate fails asset-like executable target without semantic proof", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gate-asset-"));
  const bad = baseReport();
  bad.decks[0].executableTargets[0].detector = "plugin-cycle-arrow-illustration-crop";
  bad.decks[0].executableTargets[0].layerType = "illustration-zone";
  bad.decks[0].executableTargets[0].expressionSubtype = "cycle-flow-icon";
  bad.decks[0].executableTargets[0].structural = { executable: true, atomCount: 12, reasons: [] };
  bad.decks[0].executableTargets[0].expressionPolicy = { kind: "structured-native", reasons: [] };
  bad.decks[0].executableTargets[0].reasons = ["structured-expression-safe-for-plugin-component"];
  const report = writeReport(tmp, bad);

  const gate = evaluateMinimumUnitPolicyGate({ report });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "asset-like-target-without-semantic-structure"));
  assert.ok(gate.findings.some((item) => item.code === "executable-target-missing-structure-proof"));
});

test("minimum unit policy gate uses expression family as structure and asset evidence", () => {
  const semantic = baseReport();
  semantic.decks[0].executableTargets[0].expressionPolicy = { kind: "structured-native", reasons: [] };
  semantic.decks[0].executableTargets[0].structural = { executable: true, reasons: [], expressionFamily: "layout-grid" };
  semantic.decks[0].executableTargets[0].reasons = [];
  assert.equal(hasSemanticStructureEvidence(collectRows(semantic).executableTargets[0]), true);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gate-family-asset-"));
  const bad = baseReport();
  bad.decks[0].executableTargets[0].expressionFamily = "pictorial-asset";
  bad.decks[0].executableTargets[0].expressionForm = "";
  bad.decks[0].executableTargets[0].expressionSubtype = "流程图示样例";
  bad.decks[0].executableTargets[0].structural = { executable: true, reasons: [] };
  bad.decks[0].executableTargets[0].expressionPolicy = { kind: "structured-native", reasons: [] };
  bad.decks[0].executableTargets[0].reasons = [];
  const report = writeReport(tmp, bad);

  const gate = evaluateMinimumUnitPolicyGate({ report });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "asset-like-target-without-semantic-structure"));
  assert.ok(gate.findings.some((item) => item.target?.expressionFamily === "pictorial-asset"));
});

test("minimum unit policy gate fails truncated examples and threshold regressions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gate-truncated-"));
  const report = writeReport(tmp, baseReport({
    totals: {
      executableTargets: 1,
      protectedCropTargets: 0,
      unsafeRejectedTargets: 1,
      deferTargets: 1
    },
    decks: [{
      deck: "Deck_A",
      summary: { executableTargets: 2, protectedCropTargets: 1 },
      executableTargets: [],
      protectedCropTargets: []
    }]
  }));

  const gate = evaluateMinimumUnitPolicyGate({
    report,
    minExecutableTargets: 2,
    minProtectedCrops: 1
  });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "too-few-executable-targets"));
  assert.ok(gate.findings.some((item) => item.code === "too-few-protected-crops"));
  assert.ok(gate.findings.some((item) => item.code === "unsafe-targets-remain"));
  assert.ok(gate.findings.some((item) => item.code === "deferred-targets-remain"));
  assert.ok(gate.findings.some((item) => item.code === "truncated-target-examples"));
});

test("minimum unit policy helpers expose checked rows and structure evidence", () => {
  const report = baseReport();
  const rows = collectRows(report);

  assert.equal(PROTECTED_POLICY_KINDS.has("fidelity-crop"), true);
  assert.equal(rows.executableTargets.length, 1);
  assert.equal(rows.protectedCropTargets.length, 1);
  assert.deepEqual(findTruncatedDeckExamples(report), []);
  assert.equal(hasSemanticStructureEvidence(rows.executableTargets[0]), true);
});
