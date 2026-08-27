"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildJobsFromManifest,
  parseArgs,
  runComponentIrReplacementApplyBatch,
  summarizeResults
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-replacement-apply-batch");

test("component IR replacement apply batch parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "component-ir-replacement-apply-batch.js",
    "--manifest",
    "manifest.json",
    "--out",
    "out",
    "--concurrency",
    "2",
    "--allow-missing",
    "--dry-run",
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
    "--object-audit",
    "--min-object-picture-reduction",
    "4",
    "--min-object-native-increase",
    "5"
  ]);

  assert.equal(args.manifest, "manifest.json");
  assert.equal(args.out, "out");
  assert.equal(args.concurrency, 2);
  assert.equal(args.allowMissing, true);
  assert.equal(args.dryRun, true);
  assert.equal(args.minAppliedCount, 3);
  assert.equal(args.minRemovedShapeCount, 2);
  assert.equal(args.maxFallbackWithoutRemoval, 1);
  assert.equal(args.minBoundsIoU, 0.91);
  assert.equal(args.maxCenterOffsetPt, 6);
  assert.equal(args.objectAudit, true);
  assert.equal(args.minObjectPictureReduction, 4);
  assert.equal(args.minObjectNativeIncrease, 5);
  assert.throws(() => parseArgs(["node", "script"]), /--manifest is required/);
});

test("component IR replacement apply batch builds jobs from ready manifest", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-jobs-"));
  const plan = path.join(tmp, "Deck_A.plan.json");
  fs.writeFileSync(plan, "{}");

  const jobs = buildJobsFromManifest({
    status: "ready",
    decks: [{
      deck: "Deck_A",
      pptx: path.join(tmp, "Deck_A.pptx"),
      planFile: plan,
      operationCount: 2
    }]
  }, { out: path.join(tmp, "out") });

  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].deck, "Deck_A");
  assert.equal(jobs[0].expectedOperations, 2);
  assert.match(jobs[0].outPptx, /Deck_A\.ir-component-replaced\.pptx$/);
  assert.throws(
    () => buildJobsFromManifest({ status: "blocked", decks: [] }, { out: tmp }),
    /not ready/
  );
});

test("component IR replacement apply batch runs plans and writes aggregate quality gate", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-run-"));
  const manifest = writeManifest(tmp, [{
    deck: "Deck_A",
    operationCount: 1
  }, {
    deck: "Deck_B",
    operationCount: 1
  }]);
  const calls = [];
  const runner = async (command, args) => {
    calls.push({ command, args });
    const planIndex = args.findIndex((arg) => String(arg).endsWith(".plan.json"));
    const plan = planIndex >= 0 ? args[planIndex] : "";
    const deck = path.basename(plan).replace(".plan.json", "");
    return {
      stdout: JSON.stringify({
        provider: "powerpoint-component-replacement-apply-v1",
        sourcePptx: path.join(tmp, `${deck}.pptx`),
        outFile: path.join(tmp, `${deck}.out.pptx`),
        operations: [{
          GroupKey: `${deck}:p1:crop`,
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

  const report = await runComponentIrReplacementApplyBatch({
    manifest,
    out: path.join(tmp, "out"),
    engine: "powerpoint",
    concurrency: 2,
    minAppliedCount: 2,
    minRemovedShapeCount: 2,
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(calls.length, 2);
  assert.equal(report.totals.decks, 2);
  assert.equal(report.totals.appliedCount, 2);
  assert.equal(report.totals.removedShapeCount, 2);
  assert.equal(report.applyQualityGate.status, "passed");
  assert.equal(fs.existsSync(report.reportFile), true);
  assert.equal(fs.existsSync(report.applyQualityGateFile), true);
});

test("component IR replacement apply batch attaches object audit summaries", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-object-audit-"));
  const manifest = writeManifest(tmp, [{ deck: "Deck_A", operationCount: 1 }]);
  const runner = async () => ({
    stdout: JSON.stringify({
      sourcePptx: path.join(tmp, "Deck_A.pptx"),
      outFile: path.join(tmp, "Deck_A.out.pptx"),
      operations: [{
        GroupKey: "Deck_A:p1:crop",
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
  const audits = [];
  const objectAuditRunner = (options) => {
    audits.push(options);
    return {
      passed: true,
      targetSlideCount: 1,
      totals: { pictureReduction: 1, nativeIncrease: 3 },
      findings: []
    };
  };

  const report = await runComponentIrReplacementApplyBatch({
    manifest,
    out: path.join(tmp, "out"),
    objectAudit: true,
    engine: "powerpoint",
    runner,
    objectAuditRunner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(audits.length, 1);
  assert.equal(audits[0].before, path.join(tmp, "Deck_A.pptx"));
  assert.match(audits[0].after, /Deck_A\.ir-component-replaced\.pptx$/);
  assert.equal(report.results[0].objectAudit.passed, true);
  assert.equal(report.totals.objectAuditDecks, 1);
  assert.equal(report.totals.objectAuditPassedDecks, 1);
  assert.equal(report.totals.objectAuditPictureReduction, 1);
  assert.equal(report.totals.objectAuditNativeIncrease, 3);
});

test("component IR replacement apply batch fails deck when object audit fails", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-object-audit-fail-"));
  const manifest = writeManifest(tmp, [{ deck: "Deck_A", operationCount: 1 }]);
  const runner = async () => ({
    stdout: JSON.stringify({
      operations: [{
        GroupKey: "Deck_A:p1:crop",
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
  const objectAuditRunner = () => ({
    passed: false,
    targetSlideCount: 1,
    totals: { pictureReduction: 0, nativeIncrease: 0 },
    findings: [{ code: "insufficient-picture-reduction" }]
  });

  const report = await runComponentIrReplacementApplyBatch({
    manifest,
    out: path.join(tmp, "out"),
    objectAudit: true,
    engine: "powerpoint",
    runner,
    objectAuditRunner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.results[0].status, "failed");
  assert.equal(report.totals.failedDecks, 1);
  assert.equal(report.totals.objectAuditFailedDecks, 1);
  assert.equal(report.totals.canApplyAll, false);
});

test("component IR replacement apply batch fails quality gate on overlay-only fallback", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-overlay-"));
  const manifest = writeManifest(tmp, [{ deck: "Deck_A", operationCount: 1 }]);
  const runner = async () => ({
    stdout: JSON.stringify({
      operations: [{
        GroupKey: "Deck_A:p1:crop",
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

  const report = await runComponentIrReplacementApplyBatch({
    manifest,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.applyQualityGate.status, "failed");
  assert.ok(report.applyQualityGate.findings.some((item) => item.code === "fallback-without-crop-removal"));
});

test("component IR replacement apply batch fails quality gate on misaligned component geometry", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ir-apply-batch-geometry-"));
  const manifest = writeManifest(tmp, [{ deck: "Deck_A", operationCount: 1 }]);
  const runner = async () => ({
    stdout: JSON.stringify({
      operations: [{
        GroupKey: "Deck_A:p1:cycle-arrow",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 1,
        ClonedShapeCount: 1,
        TargetBounds: { X: 100, Y: 100, W: 300, H: 160 },
        AppliedBounds: { X: 230, Y: 180, W: 110, H: 70 },
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

  const report = await runComponentIrReplacementApplyBatch({
    manifest,
    out: path.join(tmp, "out"),
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    minBoundsIoU: 0.9,
    maxCenterOffsetPt: 8,
    engine: "powerpoint",
    runner,
    skillRoot: path.join("skills", "pd-hifi-slideclone")
  });

  assert.equal(report.applyQualityGate.status, "failed");
  assert.ok(report.applyQualityGate.findings.some((item) => item.code === "component-bounds-iou-below-threshold"));
  assert.ok(report.applyQualityGate.findings.some((item) => item.code === "component-center-offset-above-threshold"));
});

test("component IR replacement apply batch summarizes failed jobs", () => {
  const totals = summarizeResults([
    { status: "applied", operationCount: 2, appliedCount: 2, skippedCount: 0, removedShapeCount: 2, clonedShapeCount: 4 },
    { status: "failed", expectedOperations: 3, operationCount: 0, appliedCount: 0, skippedCount: 0, removedShapeCount: 0, clonedShapeCount: 0 }
  ]);

  assert.equal(totals.decks, 2);
  assert.equal(totals.appliedDecks, 1);
  assert.equal(totals.failedDecks, 1);
  assert.equal(totals.expectedOperations, 3);
  assert.equal(totals.canApplyAll, false);
});

function writeManifest(tmp, decks) {
  const manifestDecks = decks.map((deck) => {
    const planFile = path.join(tmp, `${deck.deck}.plan.json`);
    fs.writeFileSync(planFile, JSON.stringify({ provider: "component-replacement-apply-plan-v1" }));
    return {
      deck: deck.deck,
      pptx: path.join(tmp, `${deck.deck}.pptx`),
      planFile,
      operationCount: deck.operationCount
    };
  });
  const manifestFile = path.join(tmp, "manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    provider: "component-ir-replacement-apply-plan-v1",
    status: "ready",
    decks: manifestDecks
  }, null, 2)}\n`, "utf8");
  return manifestFile;
}
