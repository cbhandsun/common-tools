"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildRerunCommand,
  buildPendingFindings,
  buildProtectedFindings,
  discoverInventoryFiles,
  mergeInventoryFiles,
  parseArgs,
  renderPendingHarvestGuide,
  resolveInventoryInput,
  runComponentIrReplacementCloseLoop
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-replacement-close-loop");

test("component IR replacement close loop parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "component-ir-replacement-close-loop.js",
    "--harvest-queue",
    "queue.json",
    "--ir-dir",
    "ir",
    "--inventory",
    "inventory.json",
    "--pptx-dir",
    "pptx",
    "--out",
    "out",
    "--concurrency",
    "2",
    "--dry-run",
    "--allow-pending-samples",
    "--min-applied-count",
    "3",
    "--min-removed-shape-count",
    "2",
    "--max-fallback-without-removal",
    "1",
    "--min-bounds-iou",
    "0.91",
    "--max-center-offset-pt",
    "6",
    "--strict-geometry",
    "--object-audit",
    "--min-object-picture-reduction",
    "4",
    "--min-object-native-increase",
    "5",
    "--visual-audit",
    "--visual-target-region-audit",
    "--visual-renderer",
    "libreoffice",
    "--visual-reuse-render",
    "--visual-review-assets",
    "--visual-max-decks",
    "1",
    "--visual-max-pages-per-deck",
    "2",
    "--visual-page-budget",
    "5",
    "--visual-max-pixel-diff-ratio",
    "0.5",
    "--visual-max-foreground-missing-ratio",
    "0.6",
    "--visual-max-mean-delta",
    "80",
    "--visual-max-target-pixel-diff-ratio",
    "0.2",
    "--visual-max-target-foreground-missing-ratio",
    "0.3",
    "--visual-max-target-mean-delta",
    "40"
  ]);

  assert.equal(args.harvestQueue, "queue.json");
  assert.equal(args.irDir, "ir");
  assert.equal(args.inventory, "inventory.json");
  assert.equal(args.pptxDir, "pptx");
  assert.equal(args.out, "out");
  assert.equal(args.concurrency, 2);
  assert.equal(args.dryRun, true);
  assert.equal(args.allowPendingSamples, true);
  assert.equal(args.minAppliedCount, 3);
  assert.equal(args.minRemovedShapeCount, 2);
  assert.equal(args.maxFallbackWithoutRemoval, 1);
  assert.equal(args.minBoundsIoU, 0.91);
  assert.equal(args.maxCenterOffsetPt, 6);
  assert.equal(args.strictGeometry, true);
  assert.equal(args.objectAudit, true);
  assert.equal(args.minObjectPictureReduction, 4);
  assert.equal(args.minObjectNativeIncrease, 5);
  assert.equal(args.visualAudit, true);
  assert.equal(args.visualTargetRegionAudit, true);
  assert.equal(args.visualRenderer, "libreoffice");
  assert.equal(args.visualReuseRender, true);
  assert.equal(args.visualReviewAssets, true);
  assert.equal(args.visualMaxDecks, 1);
  assert.equal(args.visualMaxPagesPerDeck, 2);
  assert.equal(args.visualPageBudget, 5);
  assert.equal(args.visualMaxPixelDiffRatio, 0.5);
  assert.equal(args.visualMaxForegroundMissingRatio, 0.6);
  assert.equal(args.visualMaxMeanDelta, 80);
  assert.equal(args.visualMaxTargetPixelDiffRatio, 0.2);
  assert.equal(args.visualMaxTargetForegroundMissingRatio, 0.3);
  assert.equal(args.visualMaxTargetMeanDelta, 40);
  assert.throws(() => parseArgs(["node", "script"]), /--harvest-queue is required/);
});

test("component IR replacement close loop reports needs_harvest without samples", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-pending-"));
  const fixture = writeFixture(tmp, { withInventory: false });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out")
  });

  assert.equal(report.status, "needs_harvest");
  assert.equal(report.totals.irPlan.operationCount, 1);
  assert.equal(report.totals.irPlan.pendingSample, 1);
  assert.ok(report.findings.some((item) => item.code === "pending-component-samples"));
  assert.equal(fs.existsSync(report.artifacts.irReplacementPlan), true);
  assert.equal(fs.existsSync(report.artifacts.harvestGuide), true);
  const guide = fs.readFileSync(report.artifacts.harvestGuide, "utf8");
  assert.match(guide, /Real Component Harvest Guide/);
  assert.match(guide, /node harvest/);
  assert.match(guide, /Rerun Close Loop/);
});

test("component IR replacement close loop runs ready plans and gates quality", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-ready-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    return {
      stdout: JSON.stringify({
        provider: "powerpoint-component-replacement-apply-v1",
        sourcePptx: fixture.pptx,
        outFile: path.join(tmp, "out.pptx"),
        operations: [{
          GroupKey: "Deck_A:p1:native-flow",
          Status: "ready",
          Applied: true,
          RemovedShapeCount: 1,
          ClonedShapeCount: 1,
          Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
        }],
        summary: {
          operationCount: 1,
          appliedCount: 1,
          skippedCount: 0,
          removedShapeCount: 1,
          clonedShapeCount: 1
        }
      })
    };
  };

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(calls.length, 1);
  assert.equal(report.status, "applied");
  assert.equal(report.totals.irPlan.ready, 1);
  assert.equal(report.totals.batch.appliedCount, 1);
  assert.equal(report.totals.applyQualityGate.fallbackWithoutCropRemoval, 0);
  assert.equal(report.totals.closeLoopGate.applyQualityGatePassed, true);
  assert.equal(fs.existsSync(report.artifacts.closeLoopGate), true);
});

test("component IR replacement close loop fails when component geometry gate fails", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-geometry-fail-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const runner = async () => ({
    stdout: JSON.stringify({
      provider: "powerpoint-component-replacement-apply-v1",
      sourcePptx: fixture.pptx,
      outFile: path.join(tmp, "out.pptx"),
      operations: [{
        GroupKey: "Deck_A:p1:native-flow",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 1,
        ClonedShapeCount: 1,
        TargetBounds: { X: 100, Y: 100, W: 300, H: 160 },
        AppliedBounds: { X: 240, Y: 185, W: 100, H: 60 },
        Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
      }],
      summary: {
        operationCount: 1,
        appliedCount: 1,
        skippedCount: 0,
        removedShapeCount: 1,
        clonedShapeCount: 1
      }
    })
  });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    minBoundsIoU: 0.9,
    maxCenterOffsetPt: 8,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "failed");
  assert.equal(report.totals.closeLoopGate.applyQualityGatePassed, false);
  assert.ok(report.findings.some((item) => item.code === "component-bounds-iou-below-threshold"));
  assert.ok(report.findings.some((item) => item.code === "component-center-offset-above-threshold"));
});

test("component IR replacement close loop strict geometry requires placement evidence", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-strict-geometry-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const runner = async () => ({
    stdout: JSON.stringify({
      provider: "powerpoint-component-replacement-apply-v1",
      sourcePptx: fixture.pptx,
      outFile: path.join(tmp, "out.pptx"),
      operations: [{
        GroupKey: "Deck_A:p1:native-flow",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 1,
        ClonedShapeCount: 1,
        Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
      }],
      summary: {
        operationCount: 1,
        appliedCount: 1,
        skippedCount: 0,
        removedShapeCount: 1,
        clonedShapeCount: 1
      }
    })
  });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    strictGeometry: true,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "failed");
  assert.deepEqual(report.geometryPolicy, {
    mode: "strict",
    requireGeometryEvidence: true,
    minBoundsIoU: 0.92,
    maxCenterOffsetPt: 6
  });
  assert.equal(report.totals.applyQualityGate.geometryMissingCount, 1);
  assert.ok(report.findings.some((item) => item.code === "component-bounds-iou-missing"));
  assert.ok(report.findings.some((item) => item.code === "component-center-offset-missing"));
});

test("component IR replacement close loop treats non-semantic replacement targets as protected skips", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-protected-only-"));
  const fixture = writeFixture(tmp, { withInventory: true, protectedOnly: true });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    runner: async () => {
      throw new Error("protected-only target should not run apply batch");
    },
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "protected_non_semantic_targets");
  assert.equal(report.totals.irPlan.ready, 0);
  assert.equal(report.totals.irPlan.blockedNonSemanticTarget, 1);
  assert.ok(report.findings.some((item) => item.code === "protected-non-semantic-targets"));
  assert.equal(report.artifacts.applyManifest, undefined);
});

test("component IR replacement close loop applies ready structures while reporting protected visual crops", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-ready-plus-protected-"));
  const fixture = writeFixture(tmp, { withInventory: true, includeProtectedTarget: true });
  const runner = successfulApplyRunner(tmp, fixture);

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "applied");
  assert.equal(report.totals.irPlan.ready, 1);
  assert.equal(report.totals.irPlan.blockedNonSemanticTarget, 1);
  assert.equal(report.totals.applyManifest.blockedNonSemanticSourceOperations, 1);
  assert.ok(report.findings.some((item) => item.code === "protected-non-semantic-targets"));
});


test("component IR replacement close loop can run visual regression audit", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-visual-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const runner = successfulApplyRunner(tmp, fixture);
  const visualCalls = [];
  const visualAuditRunner = async (options) => {
    visualCalls.push(options);
    return {
      reportFile: path.join(tmp, "visual.json"),
      totals: {
        decks: 1,
        passedDecks: 1,
        failedDecks: 0,
        targetSlides: 1,
        comparedPages: 1,
        failedPages: 0
      }
    };
  };

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    visualAudit: true,
    visualTargetRegionAudit: true,
    visualReuseRender: true,
    visualReviewAssets: true,
    visualMaxDecks: 1,
    visualMaxPagesPerDeck: 1,
    visualPageBudget: 1,
    engine: "powerpoint",
    runner,
    visualAuditRunner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(visualCalls.length, 1);
  assert.match(visualCalls[0].report, /component-ir-replacement-apply-batch-report\.json$/);
  assert.equal(visualCalls[0].maxDecks, 1);
  assert.equal(visualCalls[0].maxPagesPerDeck, 1);
  assert.equal(visualCalls[0].pageBudget, 1);
  assert.equal(visualCalls[0].reuseRender, true);
  assert.equal(visualCalls[0].reviewAssets, true);
  assert.equal(visualCalls[0].targetRegionAudit, true);
  assert.equal(report.status, "applied");
  assert.equal(report.artifacts.visualAudit, path.join(tmp, "visual.json"));
  assert.equal(report.totals.visualAudit.failedDecks, 0);
});

test("component IR replacement close loop fails when visual regression audit fails", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-visual-fail-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const runner = successfulApplyRunner(tmp, fixture);
  const visualAuditRunner = async () => ({
    reportFile: path.join(tmp, "visual-failed.json"),
    totals: {
      decks: 1,
      passedDecks: 0,
      failedDecks: 1,
      targetSlides: 1,
      comparedPages: 1,
      failedPages: 1
    }
  });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    visualAudit: true,
    engine: "powerpoint",
    runner,
    visualAuditRunner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "failed");
  assert.equal(report.totals.visualAudit.failedDecks, 1);
  assert.ok(report.findings.some((item) => item.code === "visual-regression-audit-failed"));
});

test("component IR replacement close loop fails when apply quality gate fails", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-overlay-"));
  const fixture = writeFixture(tmp, { withInventory: true });
  const runner = async () => ({
    stdout: JSON.stringify({
      operations: [{
        GroupKey: "Deck_A:p1:native-flow",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 0,
        ClonedShapeCount: 1,
        Reason: "applied_with_ir_target_box_fallback_without_crop_removal"
      }],
      summary: {
        operationCount: 1,
        appliedCount: 1,
        skippedCount: 0,
        removedShapeCount: 0,
        clonedShapeCount: 1
      }
    })
  });

  const report = await runComponentIrReplacementCloseLoop({
    harvestQueue: fixture.queue,
    irDir: fixture.irDir,
    inventory: fixture.inventory,
    pptxDir: fixture.pptxDir,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "failed");
  assert.ok(report.findings.some((item) => String(item.message || item).includes("fallbackWithoutCropRemoval")));
});

function successfulApplyRunner(tmp, fixture) {
  return async () => ({
    stdout: JSON.stringify({
      provider: "powerpoint-component-replacement-apply-v1",
      sourcePptx: fixture.pptx,
      outFile: path.join(tmp, "out.pptx"),
      operations: [{
        GroupKey: "Deck_A:p1:native-flow",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 1,
        ClonedShapeCount: 1,
        Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
      }],
      summary: {
        operationCount: 1,
        appliedCount: 1,
        skippedCount: 0,
        removedShapeCount: 1,
        clonedShapeCount: 1
      }
    })
  });
}

test("component IR replacement close loop pending findings summarize missing evidence", () => {
  const findings = buildPendingFindings({ pendingSample: 2, missingTarget: 1 });

  assert.deepEqual(findings.map((item) => item.code), [
    "pending-component-samples",
    "missing-ir-targets"
  ]);
});

test("component IR replacement close loop protected findings summarize safe skips", () => {
  assert.deepEqual(buildProtectedFindings({ blockedNonSemanticTarget: 2 }), [{
    code: "protected-non-semantic-targets",
    message: "2 component replacement target(s) were skipped because they are protected non-semantic visual units"
  }]);
  assert.deepEqual(buildProtectedFindings({ blockedNonSemanticTarget: 0 }), []);
});

test("component IR replacement close loop harvest guide renders rerun command", () => {
  const guide = renderPendingHarvestGuide({
    args: {
      harvestQueue: "queue.json",
      irDir: "ir dir",
      pptxDir: "pptx dir",
      out: "runs/out",
      concurrency: 2,
      minAppliedCount: 1,
      maxFallbackWithoutRemoval: 0
    },
    irPlan: { summary: { pendingSample: 1, missingTarget: 0 } },
    harvestQueue: {
      createdAt: "now",
      sourceKind: "apply-session",
      summary: { taskCount: 1, affectedFiles: 0, totalAnchorCount: 1, totalAffectedTargets: 1 },
      tasks: [{
        priority: 1,
        provider: "officeplus",
        kind: "component",
        componentId: "MatlComponentContent-11617",
        status: "needs_harvest",
        title: "渐变6项流程",
        searchKeywords: ["流程 箭头 组件"],
        targetMotifs: ["linear-arrow-chain"],
        affectedFileCount: 0,
        totalAnchorCount: 1,
        harvestCommand: "node harvest",
        workflow: ["apply"],
        affectedFiles: [],
        affectedTargets: []
      }]
    }
  });

  assert.match(guide, /MatlComponentContent-11617/);
  assert.match(guide, /runs\\plugin-component-inventory/);
  assert.match(buildRerunCommand({
    harvestQueue: "queue.json",
    irDir: "ir dir",
    pptxDir: "pptx dir",
    out: "runs/out",
    concurrency: 2,
    minAppliedCount: 1,
    maxFallbackWithoutRemoval: 0
  }), /--inventory runs\\plugin-component-inventory/);
});

test("component IR replacement close loop resolves inventory directories", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-close-loop-inventory-"));
  const directDir = path.join(tmp, "direct");
  fs.mkdirSync(directDir, { recursive: true });
  const directInventory = path.join(directDir, "inventory.json");
  fs.writeFileSync(directInventory, JSON.stringify({ candidates: [{ id: "direct" }] }));

  assert.equal(resolveInventoryInput(directDir, tmp).inventory, directInventory);

  const mergeDir = path.join(tmp, "merge");
  fs.mkdirSync(path.join(mergeDir, "nested"), { recursive: true });
  fs.writeFileSync(path.join(mergeDir, "a-component-inventory.json"), JSON.stringify({ candidates: [{ id: "a" }] }));
  fs.writeFileSync(path.join(mergeDir, "nested", "b-harvest.json"), JSON.stringify({ components: [{ id: "b" }] }));
  const resolved = resolveInventoryInput(mergeDir, tmp);
  const merged = JSON.parse(fs.readFileSync(resolved.inventory, "utf8"));

  assert.equal(resolved.note, "merged-directory-inventories");
  assert.equal(merged.summary.candidates, 2);
  assert.equal(discoverInventoryFiles(mergeDir).length, 2);
  assert.equal(mergeInventoryFiles(discoverInventoryFiles(mergeDir).map((item) => item.file)).summary.candidates, 2);
});

function writeFixture(tmp, { withInventory, includeProtectedTarget = false, protectedOnly = false } = {}) {
  const irDir = path.join(tmp, "ir");
  const pptxDir = path.join(tmp, "pptx");
  fs.mkdirSync(irDir, { recursive: true });
  fs.mkdirSync(pptxDir, { recursive: true });
  const pptx = path.join(pptxDir, "Deck_A.native-editable.pptx");
  fs.writeFileSync(pptx, "mock pptx");
  const images = [];
  if (!protectedOnly) {
    images.push({
      id: "native-flow",
      box: { x: 10, y: 20, w: 300, h: 120 },
      source: {
        detector: "foreground-graphic-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "route-chain-diagram",
        componentRenderStrategy: {
          expressionPolicy: {
            kind: "structured-native",
            minimumUnitPolicy: "rebuild-semantic-structure",
            unitDisposition: "semantic-native-structure"
          }
        }
      }
    });
  }
  if (includeProtectedTarget || protectedOnly) {
    images.push({
      id: "plugin-arrow-preview",
      box: { x: 30, y: 40, w: 180, h: 120 },
      source: {
        detector: "component-preview-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "圆弧箭头 图示样例",
        componentRenderStrategy: {
          expressionPolicy: {
            kind: "standalone-visual-asset",
            minimumUnitPolicy: "preserve-as-single-crop",
            unitDisposition: "intentional-visual-crop"
          }
        }
      }
    });
  }
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify({
    pages: [{
      images
    }]
  })}\n`, "utf8");
  const affectedTargets = [];
  if (!protectedOnly) {
    affectedTargets.push({
      deck: "Deck_A",
      slide: 1,
      imageId: "native-flow",
      imageIndex: 0,
      layerKey: "Deck_A:p1:native-flow"
    });
  }
  if (includeProtectedTarget || protectedOnly) {
    affectedTargets.push({
      deck: "Deck_A",
      slide: 1,
      imageId: "plugin-arrow-preview",
      imageIndex: protectedOnly ? 0 : 1,
      layerKey: "Deck_A:p1:plugin-arrow-preview"
    });
  }
  const queue = path.join(tmp, "queue.json");
  fs.writeFileSync(queue, `${JSON.stringify({
    tasks: [{
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-11617",
      title: "渐变6项流程",
      targetMotifs: ["linear-arrow-chain"],
      searchKeywords: ["流程 箭头 组件"],
      harvestCommand: "node harvest",
      workflow: ["apply"],
      affectedTargets
    }]
  })}\n`, "utf8");

  let inventory = "";
  if (withInventory) {
    const sample = path.join(tmp, "MatlComponentContent-11617.pptx");
    fs.writeFileSync(sample, "mock sample");
    inventory = path.join(tmp, "inventory.json");
    fs.writeFileSync(inventory, `${JSON.stringify({
      candidates: [{
        id: "MatlComponentContent-11617",
        provider: "officeplus",
        path: sample,
        name: path.basename(sample),
        assetKind: "presentation-template",
        roleTags: ["applied-component"],
        structureSignature: { motifs: ["linear-arrow-chain"] }
      }]
    })}\n`, "utf8");
  }

  return { irDir, pptxDir, pptx, queue, inventory };
}
