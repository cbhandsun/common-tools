#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function parseArgs(argv = process.argv) {
  const args = {
    report: "",
    out: "",
    minAppliedCount: 0,
    minRemovedShapeCount: 0,
    maxFallbackWithoutRemoval: 0,
    minBoundsIoU: null,
    maxCenterOffsetPt: null,
    requireNoSkipped: true
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--report" || arg === "--apply-report") && next) {
      args.report = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--min-applied-count" && next) {
      args.minAppliedCount = Number(next);
      index += 1;
    } else if (arg === "--min-removed-shape-count" && next) {
      args.minRemovedShapeCount = Number(next);
      index += 1;
    } else if (arg === "--max-fallback-without-removal" && next) {
      args.maxFallbackWithoutRemoval = Number(next);
      index += 1;
    } else if (arg === "--min-bounds-iou" && next) {
      args.minBoundsIoU = Number(next);
      index += 1;
    } else if (arg === "--max-center-offset-pt" && next) {
      args.maxCenterOffsetPt = Number(next);
      index += 1;
    } else if (arg === "--allow-skipped") {
      args.requireNoSkipped = false;
    } else {
      throw new Error(`Unknown component-replacement-apply-quality-gate argument: ${arg}`);
    }
  }
  if (!args.report) throw new Error("--report is required.");
  return args;
}

function evaluateApplyQualityGate(options = {}) {
  const reportFile = path.resolve(String(options.report || ""));
  if (!fs.existsSync(reportFile)) throw new Error(`Apply report was not found: ${reportFile}`);
  const report = readJson(reportFile);
  const operations = collectApplyOperations(report);
  const thresholds = {
    minAppliedCount: normalizeNonNegativeInt(options.minAppliedCount, 0),
    minRemovedShapeCount: normalizeNonNegativeInt(options.minRemovedShapeCount, 0),
    maxFallbackWithoutRemoval: normalizeNonNegativeInt(options.maxFallbackWithoutRemoval, 0),
    minBoundsIoU: normalizeOptionalNonNegativeNumber(options.minBoundsIoU),
    maxCenterOffsetPt: normalizeOptionalNonNegativeNumber(options.maxCenterOffsetPt),
    requireNoSkipped: options.requireNoSkipped !== false
  };
  const summary = summarizeOperations(operations);
  const findings = [];

  if (summary.appliedCount < thresholds.minAppliedCount) {
    findings.push(finding("applied-count-below-threshold", `appliedCount ${summary.appliedCount} is below required ${thresholds.minAppliedCount}`));
  }
  if (summary.removedShapeCount < thresholds.minRemovedShapeCount) {
    findings.push(finding("removed-shape-count-below-threshold", `removedShapeCount ${summary.removedShapeCount} is below required ${thresholds.minRemovedShapeCount}`));
  }
  if (summary.fallbackWithoutCropRemoval > thresholds.maxFallbackWithoutRemoval) {
    findings.push(finding(
      "fallback-without-crop-removal",
      `fallbackWithoutCropRemoval ${summary.fallbackWithoutCropRemoval} exceeds allowed ${thresholds.maxFallbackWithoutRemoval}`
    ));
  }
  if (thresholds.requireNoSkipped && summary.skippedCount > 0) {
    findings.push(finding("skipped-replacements-remain", `skipped replacement operation(s) remain: ${summary.skippedCount}`));
  }
  if (thresholds.minBoundsIoU !== null) {
    const missing = operations.filter((operation) => operation.applied && operation.boundsIoU === null).length;
    if (missing > 0) {
      findings.push(finding("component-bounds-iou-missing", `applied replacement operation(s) missing bounds IoU: ${missing}`));
    }
    const below = operations.filter((operation) => operation.applied && operation.boundsIoU !== null && operation.boundsIoU < thresholds.minBoundsIoU);
    if (below.length > 0) {
      findings.push(finding(
        "component-bounds-iou-below-threshold",
        `component replacement bounds IoU below ${thresholds.minBoundsIoU}: ${below.map((operation) => `${operation.groupKey || "unknown"}=${round(operation.boundsIoU)}`).join(", ")}`
      ));
    }
  }
  if (thresholds.maxCenterOffsetPt !== null) {
    const missing = operations.filter((operation) => operation.applied && operation.centerOffsetPt === null).length;
    if (missing > 0) {
      findings.push(finding("component-center-offset-missing", `applied replacement operation(s) missing center offset: ${missing}`));
    }
    const above = operations.filter((operation) => operation.applied && operation.centerOffsetPt !== null && operation.centerOffsetPt > thresholds.maxCenterOffsetPt);
    if (above.length > 0) {
      findings.push(finding(
        "component-center-offset-above-threshold",
        `component replacement center offset above ${thresholds.maxCenterOffsetPt}pt: ${above.map((operation) => `${operation.groupKey || "unknown"}=${round(operation.centerOffsetPt)}`).join(", ")}`
      ));
    }
  }
  if (summary.operationCount === 0) {
    findings.push(finding("no-operations-found", "apply report contains no replacement operations"));
  }

  const gate = {
    provider: "component-replacement-apply-quality-gate-v1",
    createdAt: new Date().toISOString(),
    report: reportFile,
    status: findings.length === 0 ? "passed" : "failed",
    thresholds,
    summary,
    findings
  };
  if (options.out) {
    const out = path.resolve(String(options.out));
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(gate, null, 2)}\n`, "utf8");
  }
  return gate;
}

function collectApplyOperations(report = {}) {
  const operations = [];
  if (Array.isArray(report.operations)) {
    operations.push(...report.operations.map((operation) => normalizeOperation(operation, report)));
  }
  if (Array.isArray(report.report?.operations)) {
    operations.push(...report.report.operations.map((operation) => normalizeOperation(operation, report.report)));
  }
  for (const result of safeArray(report.results)) {
    for (const operation of safeArray(result.operations || result.report?.operations)) {
      operations.push(normalizeOperation(operation, result));
    }
  }
  return operations;
}

function normalizeOperation(operation = {}, owner = {}) {
  const reason = safeString(operation.Reason ?? operation.reason);
  const applied = booleanValue(operation.Applied ?? operation.applied);
  const removed = numberOrZero(operation.RemovedShapeCount ?? operation.removedShapeCount);
  const cloned = numberOrZero(operation.ClonedShapeCount ?? operation.clonedShapeCount);
  const status = safeString(operation.Status ?? operation.status);
  const sampleGroupId = safeString(operation.SampleGroupId ?? operation.sampleGroupId);
  const sampleSelectionMode = safeString(operation.SampleSelectionMode ?? operation.sampleSelectionMode);
  const targetBounds = normalizeBounds(operation.TargetBounds ?? operation.targetBounds ?? operation.TargetBox ?? operation.targetBox);
  const appliedBounds = normalizeBounds(operation.AppliedBounds ?? operation.appliedBounds ?? operation.PlacedBounds ?? operation.placedBounds);
  const explicitBoundsIoU = numberOrNull(operation.BoundsIoU ?? operation.boundsIoU ?? operation.BoundsIou ?? operation.boundsIou);
  const explicitCenterOffset = numberOrNull(operation.CenterOffsetPt ?? operation.centerOffsetPt ?? operation.CenterOffset ?? operation.centerOffset);
  const boundsIoU = explicitBoundsIoU ?? (targetBounds && appliedBounds ? boundsIntersectionOverUnion(targetBounds, appliedBounds) : null);
  const centerOffsetPt = explicitCenterOffset ?? (targetBounds && appliedBounds ? centerOffset(targetBounds, appliedBounds) : null);
  return {
    groupKey: safeString(operation.GroupKey ?? operation.groupKey ?? owner.groupKey),
    status,
    applied,
    removedShapeCount: removed,
    clonedShapeCount: cloned,
    samplePath: safeString(operation.SamplePath ?? operation.samplePath),
    sampleGroupId,
    sampleSelectionMode,
    targetBounds,
    appliedBounds,
    boundsIoU,
    centerOffsetPt,
    reason,
    recommendedGroupSelection: sampleSelectionMode === "recommended-group",
    recommendedGroupFallback: sampleSelectionMode.includes("fallback"),
    fallback: reason.includes("ir_target_box_fallback"),
    fallbackSharedCropAlreadyRemoved: reason.includes("fallback_shared_crop_already_removed"),
    fallbackWithoutCropRemoval: reason.includes("fallback_without_crop_removal"),
    fallbackRemovedOverlapCrop: reason.includes("fallback_removed_overlap_crop")
      || reason.includes("fallback_removed_overlap")
      || reason.includes("fallback_removed")
  };
}

function summarizeOperations(operations = []) {
  const applied = operations.filter((operation) => operation.applied);
  const boundsIoUValues = applied.map((operation) => operation.boundsIoU).filter((value) => value !== null);
  const centerOffsetValues = applied.map((operation) => operation.centerOffsetPt).filter((value) => value !== null);
  return {
    operationCount: operations.length,
    appliedCount: applied.length,
    skippedCount: operations.filter((operation) => !operation.applied).length,
    removedShapeCount: operations.reduce((sum, operation) => sum + operation.removedShapeCount, 0),
    clonedShapeCount: operations.reduce((sum, operation) => sum + operation.clonedShapeCount, 0),
    fallbackCount: operations.filter((operation) => operation.fallback).length,
    fallbackRemovedCrop: operations.filter((operation) => operation.fallbackRemovedOverlapCrop).length,
    fallbackSharedCropAlreadyRemoved: operations.filter((operation) => operation.fallbackSharedCropAlreadyRemoved).length,
    fallbackWithoutCropRemoval: operations.filter((operation) => operation.fallbackWithoutCropRemoval).length,
    recommendedGroupSelectionCount: operations.filter((operation) => operation.recommendedGroupSelection).length,
    recommendedGroupFallbackCount: operations.filter((operation) => operation.recommendedGroupFallback).length,
    geometryCheckedCount: applied.filter((operation) => operation.boundsIoU !== null || operation.centerOffsetPt !== null).length,
    geometryMissingCount: applied.filter((operation) => operation.boundsIoU === null && operation.centerOffsetPt === null).length,
    minBoundsIoU: boundsIoUValues.length > 0 ? Math.min(...boundsIoUValues) : null,
    maxCenterOffsetPt: centerOffsetValues.length > 0 ? Math.max(...centerOffsetValues) : null,
    byReason: operations.reduce((acc, operation) => {
      const key = operation.reason || "none";
      acc[key] = Number(acc[key] || 0) + 1;
      return acc;
    }, {})
  };
}

function finding(code, message) {
  return { code, message };
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : fallback;
}

function normalizeOptionalNonNegativeNumber(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeBounds(value) {
  if (!value || typeof value !== "object") return null;
  const x = numberOrNull(value.X ?? value.x);
  const y = numberOrNull(value.Y ?? value.y);
  const w = numberOrNull(value.W ?? value.w ?? value.Width ?? value.width);
  const h = numberOrNull(value.H ?? value.h ?? value.Height ?? value.height);
  if ([x, y, w, h].some((part) => part === null) || w <= 0 || h <= 0) return null;
  return { x, y, w, h };
}

function boundsIntersectionOverUnion(a, b) {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  if (intersection <= 0) return 0;
  const union = Math.max(0.1, (a.w * a.h) + (b.w * b.h) - intersection);
  return intersection / union;
}

function centerOffset(a, b) {
  const ax = a.x + (a.w / 2);
  const ay = a.y + (a.h / 2);
  const bx = b.x + (b.w / 2);
  const by = b.y + (b.h / 2);
  return Math.hypot(ax - bx, ay - by);
}

function round(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function booleanValue(value) {
  return value === true || value === "true" || value === 1 || value === "1";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const gate = evaluateApplyQualityGate(args);
    console.log(JSON.stringify(gate, null, 2));
    if (gate.status !== "passed") process.exitCode = 1;
  } catch (error) {
    console.error(String(error?.message || error));
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  collectApplyOperations,
  evaluateApplyQualityGate,
  normalizeOperation,
  parseArgs,
  summarizeOperations
};
