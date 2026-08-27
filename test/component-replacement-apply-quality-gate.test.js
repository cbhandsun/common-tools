"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  collectApplyOperations,
  evaluateApplyQualityGate,
  normalizeOperation,
  parseArgs,
  summarizeOperations
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-apply-quality-gate");

test("component replacement apply quality gate parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "component-replacement-apply-quality-gate.js",
    "--report",
    "apply.json",
    "--out",
    "gate.json",
    "--min-applied-count",
    "2",
    "--min-removed-shape-count",
    "1",
    "--max-fallback-without-removal",
    "3",
    "--min-bounds-iou",
    "0.92",
    "--max-center-offset-pt",
    "4",
    "--allow-skipped"
  ]);

  assert.equal(args.report, "apply.json");
  assert.equal(args.out, "gate.json");
  assert.equal(args.minAppliedCount, 2);
  assert.equal(args.minRemovedShapeCount, 1);
  assert.equal(args.maxFallbackWithoutRemoval, 3);
  assert.equal(args.minBoundsIoU, 0.92);
  assert.equal(args.maxCenterOffsetPt, 4);
  assert.equal(args.requireNoSkipped, false);
  assert.throws(() => parseArgs(["node", "script"]), /--report is required/);
});

test("component replacement apply quality gate passes real replacement fallback with crop removal", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-pass-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:source-crop",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 1,
      Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
    }]
  });
  const out = path.join(tmp, "gate.json");

  const gate = evaluateApplyQualityGate({
    report,
    out,
    minAppliedCount: 1,
    minRemovedShapeCount: 1
  });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.fallbackCount, 1);
  assert.equal(gate.summary.fallbackRemovedCrop, 1);
  assert.equal(gate.summary.fallbackWithoutCropRemoval, 0);
  assert.equal(fs.existsSync(out), true);
});

test("component replacement apply quality gate fails fallback overlays that did not remove crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-overlay-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:source-crop",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 0,
      ClonedShapeCount: 1,
      Reason: "applied_with_ir_target_box_fallback_without_crop_removal"
    }]
  });

  const gate = evaluateApplyQualityGate({
    report,
    minAppliedCount: 1,
    minRemovedShapeCount: 1
  });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "fallback-without-crop-removal"));
  assert.ok(gate.findings.some((item) => item.code === "removed-shape-count-below-threshold"));
});

test("component replacement apply quality gate allows fallback when shared crop was already removed", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-shared-crop-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:source-crop-a",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 1,
      Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
    }, {
      GroupKey: "Deck:p1:source-crop-b",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 0,
      ClonedShapeCount: 1,
      Reason: "applied_with_ir_target_box_fallback_shared_crop_already_removed"
    }]
  });

  const gate = evaluateApplyQualityGate({
    report,
    minAppliedCount: 2,
    minRemovedShapeCount: 1
  });

  assert.equal(gate.status, "passed");
  assert.equal(gate.summary.fallbackSharedCropAlreadyRemoved, 1);
  assert.equal(gate.summary.fallbackWithoutCropRemoval, 0);
});

test("component replacement apply quality gate fails skipped operations by default", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-skipped-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:missing",
      Status: "missing_sample",
      Applied: false,
      RemovedShapeCount: 0,
      ClonedShapeCount: 0,
      Reason: "operation_not_ready"
    }]
  });

  const gate = evaluateApplyQualityGate({ report });

  assert.equal(gate.status, "failed");
  assert.ok(gate.findings.some((item) => item.code === "skipped-replacements-remain"));
});

test("component replacement apply quality gate reads orchestrator and batch report shapes", () => {
  const orchestrator = {
    report: {
      operations: [{
        groupKey: "Deck:p1:anchor",
        status: "ready",
        applied: true,
        removedShapeCount: 1,
        clonedShapeCount: 2,
        reason: ""
      }]
    }
  };
  const batch = {
    results: [{
      operations: [{
        GroupKey: "Deck:p2:fallback",
        Status: "ready",
        Applied: true,
        RemovedShapeCount: 1,
        ClonedShapeCount: 1,
        Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
      }]
    }]
  };

  assert.equal(collectApplyOperations(orchestrator).length, 1);
  assert.equal(collectApplyOperations(batch).length, 1);
  assert.equal(summarizeOperations(collectApplyOperations(batch)).fallbackRemovedCrop, 1);
});

test("component replacement apply quality helpers normalize operation shapes", () => {
  const operation = normalizeOperation({
    groupKey: "g",
    applied: "true",
    removedShapeCount: 2,
    clonedShapeCount: 3,
    sampleGroupId: "public-arrows:group-2",
    sampleSelectionMode: "recommended-group",
    reason: "applied_with_ir_target_box_fallback_without_crop_removal",
    TargetBounds: { X: 10, Y: 20, W: 100, H: 50 },
    AppliedBounds: { X: 11, Y: 21, W: 98, H: 48 }
  });

  assert.equal(operation.applied, true);
  assert.equal(operation.removedShapeCount, 2);
  assert.equal(operation.clonedShapeCount, 3);
  assert.equal(operation.sampleGroupId, "public-arrows:group-2");
  assert.equal(operation.recommendedGroupSelection, true);
  assert.equal(operation.fallback, true);
  assert.equal(operation.fallbackWithoutCropRemoval, true);
  assert.deepEqual(operation.targetBounds, { x: 10, y: 20, w: 100, h: 50 });
  assert.ok(operation.boundsIoU > 0.9);
  assert.ok(operation.centerOffsetPt < 2);
});

test("component replacement apply quality summarizes recommended sample group selection", () => {
  const operations = [
    normalizeOperation({
      GroupKey: "Deck:p1:cycle",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 6,
      SampleGroupId: "islide:cycle-arrow:g1",
      SampleSelectionMode: "recommended-group"
    }),
    normalizeOperation({
      GroupKey: "Deck:p2:banner",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 3,
      SampleSelectionMode: "slide-fallback"
    })
  ];
  const summary = summarizeOperations(operations);

  assert.equal(summary.recommendedGroupSelectionCount, 1);
  assert.equal(summary.recommendedGroupFallbackCount, 1);
});

test("component replacement apply quality gate fails badly misaligned component geometry", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-geometry-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:cycle-arrow",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 1,
      TargetBounds: { X: 100, Y: 100, W: 300, H: 160 },
      AppliedBounds: { X: 250, Y: 180, W: 120, H: 80 },
      Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
    }]
  });

  const gate = evaluateApplyQualityGate({
    report,
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    minBoundsIoU: 0.9,
    maxCenterOffsetPt: 8
  });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.geometryCheckedCount, 1);
  assert.ok(gate.summary.minBoundsIoU < 0.9);
  assert.ok(gate.summary.maxCenterOffsetPt > 8);
  assert.ok(gate.findings.some((item) => item.code === "component-bounds-iou-below-threshold"));
  assert.ok(gate.findings.some((item) => item.code === "component-center-offset-above-threshold"));
});

test("component replacement apply quality gate requires geometry when thresholds are configured", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "apply-quality-gate-geometry-missing-"));
  const report = writeReport(tmp, {
    operations: [{
      GroupKey: "Deck:p1:shape",
      Status: "ready",
      Applied: true,
      RemovedShapeCount: 1,
      ClonedShapeCount: 1,
      Reason: "applied_with_ir_target_box_fallback_removed_overlap_crop"
    }]
  });

  const gate = evaluateApplyQualityGate({
    report,
    minAppliedCount: 1,
    minRemovedShapeCount: 1,
    minBoundsIoU: 0.9,
    maxCenterOffsetPt: 8
  });

  assert.equal(gate.status, "failed");
  assert.equal(gate.summary.geometryMissingCount, 1);
  assert.ok(gate.findings.some((item) => item.code === "component-bounds-iou-missing"));
  assert.ok(gate.findings.some((item) => item.code === "component-center-offset-missing"));
});

function writeReport(tmp, payload) {
  const file = path.join(tmp, "apply-report.json");
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return file;
}
