"use strict";

const METRICS = Object.freeze({
  pixelDiffRatio: Object.freeze({ direction: "lower", maximumDelta: 0.02, maximumValue: 1 }),
  foregroundMissingRatio: Object.freeze({ direction: "lower", maximumDelta: 0.03, maximumValue: 1 }),
  editableObjectRatio: Object.freeze({ direction: "higher", maximumDelta: 0.02, maximumValue: 1 }),
  largestResidualAreaRatio: Object.freeze({ direction: "lower", maximumDelta: 0.03, maximumValue: 1 }),
  elapsedMs: Object.freeze({ direction: "lower", maximumDelta: 60000, maximumValue: 10000000, optional: true })
});

function extractQualitySnapshot(report, metadata = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("quality report must be an object");
  const id = safeId(metadata.id || report.snapshotId || report.generatedAt || new Date().toISOString(), "snapshot id", 160);
  const createdAt = validIsoDate(metadata.createdAt || report.generatedAt || new Date().toISOString());
  const environmentFingerprint = optionalFingerprint(
    metadata.environmentFingerprint
      || report.environmentFingerprint
      || report.environment?.fingerprint
  );
  const targets = {};
  if (report.provider === "real-pptx-corpus-runner" && Array.isArray(report.cases)) {
    for (const item of report.cases) {
      const targetId = safeId(item.id, "corpus target id", 128);
      targets[targetId] = normalizeTargetMetrics(item.metrics || {}, {
        category: item.corpusCategory || null,
        passed: item.passed === true
      });
    }
  } else if (Array.isArray(report.decks)) {
    for (const item of report.decks) {
      const targetId = safeId(item.deck, "matrix deck id", 128);
      targets[targetId] = normalizeTargetMetrics(item, { passed: item.passed === true });
    }
  } else {
    const targetId = safeId(metadata.targetId || deckTargetId(report), "quality target id", 128);
    targets[targetId] = normalizeTargetMetrics({
      ...(report.deckMetrics || {}),
      ...(report.editabilityProfile || {}),
      largestResidualAreaRatio: report.layerProfile?.totals?.largestUnexplainedCropAreaRatio
        ?? report.reconstructionBudget?.maxLargestResidualAreaRatio
    }, { passed: report.passed === true || report.gate?.passed === true });
  }
  if (Object.keys(targets).length === 0) throw new Error("quality report contains no trend targets");
  return Object.freeze({ id, createdAt, environmentFingerprint, targets });
}

function evaluateQualityTrend(current, history = {}, options = {}) {
  const snapshot = validateSnapshot(current);
  const snapshots = validateHistory(history).snapshots;
  const compatibleSnapshots = snapshots.filter((item) => sameEnvironment(snapshot, item));
  const windowSize = boundedInteger(options.windowSize ?? 5, "windowSize", 1, 100);
  const minimumHistory = boundedInteger(options.minimumHistory ?? 1, "minimumHistory", 0, windowSize);
  const requiredTargetRatio = boundedRatio(options.requiredTargetRatio ?? 1, "requiredTargetRatio");
  const thresholds = normalizeThresholds(options.thresholds || {});
  const targetResults = [];
  let comparedTargets = 0;
  for (const [targetId, target] of Object.entries(snapshot.targets)) {
    const baselines = compatibleSnapshots
      .filter((item) => item.targets[targetId])
      .slice(-windowSize)
      .map((item) => ({ id: item.id, createdAt: item.createdAt, target: item.targets[targetId] }));
    if (baselines.length < minimumHistory) {
      targetResults.push({ targetId, status: "insufficient-history", passed: minimumHistory === 0, historyCount: baselines.length, checks: [] });
      continue;
    }
    if (baselines.length === 0) {
      targetResults.push({
        targetId,
        category: target.category,
        status: "baseline-bootstrap",
        passed: target.passed !== false,
        historyCount: 0,
        checks: []
      });
      continue;
    }
    comparedTargets += 1;
    const checks = Object.entries(METRICS)
      .filter(([metric, policy]) => !policy.optional
        || Number.isFinite(target.metrics[metric])
        || baselines.some((item) => Number.isFinite(item.target.metrics[metric])))
      .map(([metric, policy]) => evaluateMetric(metric, policy, target.metrics[metric], baselines, thresholds[metric]));
    targetResults.push({
      targetId,
      category: target.category,
      status: "compared",
      passed: target.passed !== false && checks.every((check) => check.passed),
      historyCount: baselines.length,
      checks
    });
  }
  const targetCount = Object.keys(snapshot.targets).length;
  const comparedTargetRatio = targetCount ? comparedTargets / targetCount : 0;
  const failures = targetResults.filter((item) => !item.passed);
  return Object.freeze({
    passed: failures.length === 0 && comparedTargetRatio >= requiredTargetRatio,
    snapshotId: snapshot.id,
    environmentFingerprint: snapshot.environmentFingerprint,
    historySnapshots: snapshots.length,
    compatibleHistorySnapshots: compatibleSnapshots.length,
    incompatibleHistorySnapshots: snapshots.length - compatibleSnapshots.length,
    windowSize,
    minimumHistory,
    targetCount,
    comparedTargets,
    comparedTargetRatio: round(comparedTargetRatio),
    requiredTargetRatio,
    failureCount: failures.length + (comparedTargetRatio < requiredTargetRatio ? 1 : 0),
    targets: targetResults
  });
}

function appendQualitySnapshot(history = {}, snapshot, options = {}) {
  const validatedHistory = validateHistory(history);
  const current = validateSnapshot(snapshot);
  const maximumSnapshots = boundedInteger(options.maximumSnapshots ?? 50, "maximumSnapshots", 1, 1000);
  const existing = validatedHistory.snapshots.filter((item) => item.id !== current.id);
  return Object.freeze({ version: 1, snapshots: [...existing, current].slice(-maximumSnapshots) });
}

function evaluateMetric(metric, policy, currentValue, baselines, configuredThreshold) {
  const values = baselines.map((item) => item.target.metrics[metric]).filter(Number.isFinite);
  if (!Number.isFinite(currentValue) || values.length === 0) {
    return { metric, passed: false, reason: "missing-evidence", current: numberOrNull(currentValue), baseline: null, delta: null, cumulativeDelta: null };
  }
  const baseline = median(values);
  const earliest = values[0];
  const signedDelta = policy.direction === "higher" ? baseline - currentValue : currentValue - baseline;
  const cumulativeDelta = policy.direction === "higher" ? earliest - currentValue : currentValue - earliest;
  const threshold = configuredThreshold ?? policy.maximumDelta;
  const windowPassed = signedDelta <= threshold;
  const cumulativePassed = cumulativeDelta <= threshold * 1.5;
  return {
    metric,
    direction: policy.direction,
    passed: windowPassed && cumulativePassed,
    reason: !windowPassed ? "window-regression" : (!cumulativePassed ? "cumulative-regression" : "within-budget"),
    current: round(currentValue),
    baseline: round(baseline),
    earliest: round(earliest),
    delta: round(signedDelta),
    cumulativeDelta: round(cumulativeDelta),
    threshold: round(threshold)
  };
}

function normalizeTargetMetrics(source, metadata = {}) {
  const metrics = source || {};
  return Object.freeze({
    category: metadata.category ? safeId(metadata.category, "target category", 128) : null,
    passed: metadata.passed !== false,
    metrics: Object.freeze({
      pixelDiffRatio: firstNumber(metrics.pixelDiffRatio, metrics.pixelDiff, metrics.compare?.pixelDiffRatio),
      foregroundMissingRatio: firstNumber(metrics.foregroundMissingRatio, metrics.foregroundMissing),
      editableObjectRatio: firstNumber(metrics.editableObjectRatio, metrics.actionableEditableObjectRatio, metrics.editableRatio),
      largestResidualAreaRatio: firstNumber(metrics.largestResidualAreaRatio, metrics.largestUnexplainedCropAreaRatio, metrics.maxLargestResidualAreaRatio),
      elapsedMs: boundedMetricNumber("elapsedMs", metrics.elapsedMs, source.elapsedMs)
    })
  });
}

function validateHistory(history) {
  if (history == null || (typeof history === "object" && !Array.isArray(history) && Object.keys(history).length === 0)) return { version: 1, snapshots: [] };
  if (!history || typeof history !== "object" || Array.isArray(history)) throw new TypeError("quality trend history must be an object");
  if (history.version !== 1 || !Array.isArray(history.snapshots) || history.snapshots.length > 1000) throw new TypeError("quality trend history must use version 1 and a bounded snapshots array");
  const ids = new Set();
  const snapshots = history.snapshots.map((item) => {
    const snapshot = validateSnapshot(item);
    if (ids.has(snapshot.id)) throw new Error(`Duplicate quality trend snapshot id: ${snapshot.id}`);
    ids.add(snapshot.id);
    return snapshot;
  });
  return { version: 1, snapshots };
}

function validateSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) throw new TypeError("quality trend snapshot must be an object");
  const id = safeId(snapshot.id, "snapshot id", 160);
  const createdAt = validIsoDate(snapshot.createdAt);
  if (!snapshot.targets || typeof snapshot.targets !== "object" || Array.isArray(snapshot.targets)) throw new TypeError("snapshot targets must be an object");
  const entries = Object.entries(snapshot.targets);
  if (entries.length === 0 || entries.length > 1000) throw new TypeError("snapshot must contain between 1 and 1000 targets");
  const targets = {};
  for (const [key, value] of entries) {
    const targetId = safeId(key, "snapshot target id", 128);
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`snapshot target ${targetId} must be an object`);
    targets[targetId] = normalizeTargetMetrics(value.metrics || value, { category: value.category, passed: value.passed });
  }
  return Object.freeze({
    id,
    createdAt,
    environmentFingerprint: optionalFingerprint(snapshot.environmentFingerprint),
    targets: Object.freeze(targets)
  });
}

function sameEnvironment(current, baseline) {
  return (current.environmentFingerprint || null) === (baseline.environmentFingerprint || null);
}

function optionalFingerprint(value) {
  if (value == null || value === "") return null;
  const text = String(value).trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(text)) throw new TypeError("environment fingerprint must be a SHA-256 hex digest");
  return text;
}

function normalizeThresholds(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("trend thresholds must be an object");
  const unknown = Object.keys(value).filter((key) => !METRICS[key]);
  if (unknown.length > 0) throw new Error(`Unknown trend threshold metrics: ${unknown.join(", ")}`);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, boundedMetricThreshold(key, item)]));
}

function boundedMetricNumber(metric, ...values) {
  const maximum = METRICS[metric]?.maximumValue;
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0 && number <= maximum) return number;
  }
  return null;
}

function boundedMetricThreshold(metric, value) {
  const number = Number(value);
  const maximum = METRICS[metric]?.maximumValue;
  if (!Number.isFinite(number) || number < 0 || number > maximum) throw new TypeError(`${metric} threshold is outside the supported range`);
  return number;
}

function deckTargetId(report) {
  const value = report.pptxFile || report.inputPptx || report.targetPptx || "quality-report";
  return String(value).replace(/\\/g, "/").split("/").pop().replace(/\.[^.]+$/u, "");
}

function validIsoDate(value) {
  const text = String(value || "");
  if (!text || !Number.isFinite(Date.parse(text))) throw new TypeError("snapshot createdAt must be an ISO-compatible date");
  return new Date(text).toISOString();
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number) && number >= 0 && number <= 1) return number;
  }
  return null;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function boundedInteger(value, label, minimum, maximum) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) throw new TypeError(`${label} must be an integer between ${minimum} and ${maximum}`);
  return number;
}

function boundedRatio(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new TypeError(`${label} must be a number between 0 and 1`);
  return number;
}

function safeId(value, label, maximum) {
  const text = String(value ?? "").trim();
  if (!text || text.length > maximum || /[\u0000-\u001F\u007F]/u.test(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

function numberOrNull(value) { return Number.isFinite(Number(value)) ? Number(value) : null; }
function round(value) { return Number.isFinite(value) ? Number(value.toFixed(6)) : null; }

module.exports = {
  METRICS,
  appendQualitySnapshot,
  evaluateQualityTrend,
  extractQualitySnapshot,
  normalizeTargetMetrics,
  validateHistory,
  validateSnapshot
};
