"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildComponentIrReplacementApplyPlans,
  compareVersionNames,
  discoverOfficePlusTemplatePaths,
  groupReadyOperationsByDeck,
  parseArgs,
  resolveDeckPptx,
  resolveSampleFile,
  sanitizeMetadataValue,
  toApplyOperation
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-replacement-apply-plan");

test("component IR replacement apply plan parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-ir-replacement-apply-plan.js",
    "--ir-plan",
    "ir-plan.json",
    "--pptx-dir",
    "pptx",
    "--out-dir",
    "out",
    "--manifest-out",
    "manifest.json",
    "--require-ready",
    "--allow-missing-pptx"
  ]);

  assert.equal(args.irPlan, "ir-plan.json");
  assert.equal(args.pptxDir, "pptx");
  assert.equal(args.outDir, "out");
  assert.equal(args.manifestOut, "manifest.json");
  assert.equal(args.requireReady, true);
  assert.equal(args.allowMissingPptx, true);
  assert.throws(() => parseArgs(["node", "script"]), /--ir-plan is required/);
});

test("component IR replacement apply plan converts ready operations into per-deck apply plans", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-"));
  const pptxDir = path.join(tmp, "pptx");
  const outDir = path.join(tmp, "out");
  const samplePath = path.join(tmp, "component.pptx");
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.writeFileSync(path.join(pptxDir, "Deck_A.native-editable.pptx"), "mock pptx");
  fs.writeFileSync(samplePath, "mock component");
  const irPlan = path.join(tmp, "ir-plan.json");
  fs.writeFileSync(irPlan, `${JSON.stringify({
    operations: [
      readyOperation({ deck: "Deck_A", imageId: "native-flow-a", slide: 2, samplePath }),
      readyOperation({ deck: "Deck_A", imageId: "native-flow-b", slide: 3, samplePath }),
      { ...readyOperation({ deck: "Deck_A", imageId: "pending", slide: 4 }), status: "pending_sample", sample: null }
    ]
  }, null, 2)}\n`, "utf8");

  const manifest = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir,
    outDir
  });

  assert.equal(manifest.status, "ready");
  assert.equal(manifest.summary.sourceOperations, 3);
  assert.equal(manifest.summary.readySourceOperations, 2);
  assert.equal(manifest.summary.pendingSourceOperations, 1);
  assert.equal(manifest.summary.decks, 1);
  assert.equal(manifest.decks[0].operationCount, 2);

  const applyPlan = JSON.parse(fs.readFileSync(manifest.decks[0].planFile, "utf8"));
  assert.equal(applyPlan.pptx, path.join(pptxDir, "Deck_A.native-editable.pptx"));
  assert.equal(applyPlan.operations.length, 2);
  assert.deepEqual(applyPlan.operations[0].drawingNames, ["native-flow-a"]);
  assert.equal(applyPlan.operations[0].layer, "Deck_A:p2:native-flow-a");
  assert.equal(applyPlan.operations[0].sample.path, samplePath);
  assert.equal(applyPlan.operations[0].sample.recommendedGroup.id, "slide1-process-group");
  assert.equal(applyPlan.operations[0].sample.manifestLayerKey, "Deck_A:p2:native-flow-a");
});

test("component IR replacement apply plan blocks ready operations whose component sample file is missing", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-missing-sample-"));
  const pptxDir = path.join(tmp, "pptx");
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.writeFileSync(path.join(pptxDir, "Deck_A.native-editable.pptx"), "mock pptx");
  const irPlan = path.join(tmp, "ir-plan.json");
  fs.writeFileSync(irPlan, `${JSON.stringify({
    operations: [
      readyOperation({
        deck: "Deck_A",
        imageId: "semantic-flow",
        samplePath: path.join(tmp, "missing-component.pptx")
      })
    ]
  })}\n`, "utf8");

  const manifest = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir,
    outDir: path.join(tmp, "out")
  });

  assert.equal(manifest.status, "blocked");
  assert.equal(manifest.summary.decks, 0);
  assert.equal(manifest.summary.readySourceOperations, 1);
  assert.ok(manifest.findings.some((item) => item.code === "component-sample-file-not-found"));
});

test("component IR replacement apply plan relocates a stale OfficePLUS installed template path", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-officeplus-relocation-"));
  const pptxDir = path.join(tmp, "pptx");
  const officePlusRoot = path.join(tmp, "Microsoft OfficePLUS");
  const currentTemplate = path.join(officePlusRoot, "4.0.0.61410", "addin", "officeplus.pptx");
  fs.mkdirSync(path.dirname(currentTemplate), { recursive: true });
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.writeFileSync(path.join(pptxDir, "Deck_A.native-editable.pptx"), "mock pptx");
  fs.writeFileSync(currentTemplate, "mock OfficePLUS template");
  const staleTemplate = path.join(officePlusRoot, "4.0.0.59913", "addin", "officeplus.pptx");
  const irPlan = path.join(tmp, "ir-plan.json");
  const operation = readyOperation({ deck: "Deck_A", samplePath: staleTemplate });
  operation.sample.name = "officeplus.pptx";
  operation.sample.roleTags = ["generic-installed-template"];
  fs.writeFileSync(irPlan, `${JSON.stringify({ operations: [operation] })}\n`, "utf8");

  const manifest = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir,
    outDir: path.join(tmp, "out"),
    officePlusInstallRoot: officePlusRoot
  });

  assert.equal(manifest.status, "ready");
  assert.equal(manifest.summary.reconciledSamplePaths, 1);
  assert.equal(manifest.samplePathResolutions[0].originalPath, staleTemplate);
  assert.equal(manifest.samplePathResolutions[0].resolvedPath, currentTemplate);
  const applyPlan = JSON.parse(fs.readFileSync(manifest.decks[0].planFile, "utf8"));
  assert.equal(applyPlan.operations[0].sample.path, currentTemplate);
  assert.equal(applyPlan.operations[0].sample.pathResolution.strategy, "officeplus-installed-template-relocation");
  assert.equal(resolveSampleFile(operation.sample, { officePlusInstallRoot: officePlusRoot }).path, currentTemplate);
  assert.deepEqual(discoverOfficePlusTemplatePaths(officePlusRoot, "officeplus.pptx"), [currentTemplate]);
  assert.ok(compareVersionNames("4.0.0.61410", "4.0.0.59913") > 0);
});

test("component IR replacement apply plan can require all source operations to be ready", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-pending-"));
  const pptxDir = path.join(tmp, "pptx");
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.writeFileSync(path.join(pptxDir, "Deck_A.native-editable.pptx"), "mock pptx");
  const irPlan = path.join(tmp, "ir-plan.json");
  fs.writeFileSync(irPlan, `${JSON.stringify({
    operations: [
      readyOperation({ deck: "Deck_A" }),
      { ...readyOperation({ deck: "Deck_A", imageId: "pending" }), status: "pending_sample", sample: null }
    ]
  })}\n`, "utf8");

  const manifest = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir,
    outDir: path.join(tmp, "out"),
    requireReady: true
  });

  assert.equal(manifest.status, "blocked");
  assert.ok(manifest.findings.some((item) => item.code === "pending-ir-replacement-operations"));
});

test("component IR replacement apply plan reports blocked non-semantic source operations without applying them", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-non-semantic-"));
  const pptxDir = path.join(tmp, "pptx");
  fs.mkdirSync(pptxDir, { recursive: true });
  fs.writeFileSync(path.join(pptxDir, "Deck_A.native-editable.pptx"), "mock pptx");
  const irPlan = path.join(tmp, "ir-plan.json");
  fs.writeFileSync(irPlan, `${JSON.stringify({
    operations: [
      readyOperation({ deck: "Deck_A", imageId: "semantic-flow" }),
      {
        ...readyOperation({ deck: "Deck_A", imageId: "plugin-arrow-preview" }),
        status: "blocked_non_semantic_target",
        missing: ["non-semantic-target:intentional-visual-crop"]
      }
    ]
  })}\n`, "utf8");

  const manifest = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir,
    outDir: path.join(tmp, "out"),
    requireReady: true
  });
  const applyPlan = JSON.parse(fs.readFileSync(manifest.decks[0].planFile, "utf8"));

  assert.equal(manifest.status, "blocked");
  assert.equal(manifest.summary.readySourceOperations, 1);
  assert.equal(manifest.summary.pendingSourceOperations, 1);
  assert.equal(manifest.summary.blockedNonSemanticSourceOperations, 1);
  assert.equal(applyPlan.operations.length, 1);
  assert.equal(applyPlan.operations[0].target.imageId, "semantic-flow");
});

test("component IR replacement apply plan reports missing deck PPTX unless allowed", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-missing-pptx-"));
  const irPlan = path.join(tmp, "ir-plan.json");
  fs.writeFileSync(irPlan, `${JSON.stringify({ operations: [readyOperation({ deck: "Deck_Missing" })] })}\n`, "utf8");

  const blocked = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir: path.join(tmp, "pptx"),
    outDir: path.join(tmp, "out")
  });

  assert.equal(blocked.status, "blocked");
  assert.ok(blocked.findings.some((item) => item.code === "pptx-not-found"));

  const allowed = buildComponentIrReplacementApplyPlans({
    irPlan,
    pptxDir: path.join(tmp, "pptx"),
    outDir: path.join(tmp, "out-allowed"),
    allowMissingPptx: true
  });
  assert.equal(allowed.status, "ready");
  assert.equal(allowed.decks[0].pptx, "");
});

test("component IR replacement apply helpers preserve target granularity", () => {
  const operation = readyOperation({
    deck: "Deck_A",
    slide: 5,
    imageId: "same-component-target-1",
    layerKey: "Deck_A:p5:same-component-target-1-extra-long-value-that-will-be-truncated"
  });
  const applyOperation = toApplyOperation(operation);

  assert.equal(groupReadyOperationsByDeck([operation]).get("Deck_A").length, 1);
  assert.equal(applyOperation.groupKey, operation.layerKey);
  assert.deepEqual(applyOperation.slides, [5]);
  assert.deepEqual(applyOperation.drawingNames, ["same-component-target-1"]);
  assert.deepEqual(applyOperation.target, {
    deck: "Deck_A",
    slide: 5,
    imageId: "same-component-target-1",
    imageIndex: 0,
    layerKey: "Deck_A:p5:same-component-target-1-extra-long-value-that-will-be-truncated",
    box: { x: 10, y: 20, w: 300, h: 120 }
  });
  assert.equal(applyOperation.layer.length, 48);
  assert.equal(sanitizeMetadataValue("a b\tc", 20), "a_b_c");
});

test("component IR replacement apply plan resolves editable deck PPTX naming variants", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-apply-plan-resolve-"));
  const pptx = path.join(tmp, "Deck_A.editable.pptx");
  fs.writeFileSync(pptx, "mock pptx");

  assert.equal(resolveDeckPptx("Deck_A", tmp), pptx);
});

function readyOperation(overrides = {}) {
  const deck = overrides.deck || "Deck_A";
  const slide = overrides.slide || 1;
  const imageId = overrides.imageId || "native-flow";
  return {
    status: "ready",
    deck,
    slide,
    pageIndex: slide - 1,
    imageId,
    imageIndex: 0,
    layerKey: overrides.layerKey || `${deck}:p${slide}:${imageId}`,
    targetBox: { x: 10, y: 20, w: 300, h: 120 },
    component: {
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-11617",
      title: "渐变6项流程",
      targetMotifs: ["linear-arrow-chain"]
    },
    sample: {
      provider: "officeplus",
      path: overrides.samplePath || ensureSamplePath(),
      name: "component.pptx",
      assetKind: "presentation-template",
      roleTags: ["applied-component"],
      matchScore: 144,
      manifestLayerKey: `${deck}:p${slide}:${imageId}`,
      manifestTemplateFamily: "process-chain",
      manifestTargetMotifs: ["linear-arrow-chain"],
      recommendedGroup: {
        id: "slide1-process-group",
        name: "Process Group",
        slide: 1,
        groupIndex: 2,
        matchScore: 91,
        componentScore: 84,
        structure: {
          kind: "process-chain",
          motifs: ["linear-arrow-chain"]
        },
        reuseReadiness: { level: "high", score: 90 }
      }
    }
  };
}

function ensureSamplePath() {
  const file = path.join(os.tmpdir(), "slideclone-component-apply-plan-sample.pptx");
  if (!fs.existsSync(file)) fs.writeFileSync(file, "mock component");
  return file;
}
