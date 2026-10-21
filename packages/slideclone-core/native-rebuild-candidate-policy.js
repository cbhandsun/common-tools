"use strict";

function createNativeRebuildCandidatePolicy({largeRasterEditability,nativeObjectMetrics}) {
const STRICT_VISUAL_QUALITY_METRICS = Object.freeze(["pixel-diff-ratio", "foreground-missing-ratio", "mean-absolute-delta"]);
const OPTIONAL_VISUAL_QUALITY_METRICS = Object.freeze([
  "component-regions-attention", "worst-component-normalized-severity",
  "worst-component-pixel-diff-ratio", "worst-component-foreground-missing-ratio"
]);

function qualityRendered(quality) {
  return quality?.checks?.some((check) => check.name === "quality-rendered" && check.passed === true) === true;
}

function visualQualityDoesNotRegress({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  for (const name of STRICT_VISUAL_QUALITY_METRICS) {
    const before = baselineQuality.metrics?.[name];
    const after = candidateQuality.metrics?.[name];
    if (!Number.isFinite(before) || !Number.isFinite(after) || after > before + 1e-9) return false;
  }
  for (const name of OPTIONAL_VISUAL_QUALITY_METRICS) {
    const before = baselineQuality.metrics?.[name];
    const after = candidateQuality.metrics?.[name];
    if (before !== undefined && (!Number.isFinite(after) || after > before + 1e-9)) return false;
  }
  return true;
}

function rasterEditabilityDoesNotRegress({ baseline, candidate }) {
  const originalRaster = largeRasterEditability(baseline.deck);
  const recoveredRaster = largeRasterEditability(candidate.deck);
  if (recoveredRaster.largeRasterCount > originalRaster.largeRasterCount
    || recoveredRaster.largestAreaRatio > originalRaster.largestAreaRatio) return false;
  return true;
}

function rasterEditabilityImproves({ baseline, candidate }) {
  const originalRaster = largeRasterEditability(baseline.deck);
  const recoveredRaster = largeRasterEditability(candidate.deck);
  return recoveredRaster.largeRasterCount < originalRaster.largeRasterCount
    || recoveredRaster.largestAreaRatio <= originalRaster.largestAreaRatio - 0.08;
}

function selectNativeRebuildCandidate({ baseline, candidate, baselineQuality, candidateQuality, improves, allowFailedQualityTolerance = false }) {
  if (!baseline?.deck || !candidate?.deck) return false;
  if (!allowFailedQualityTolerance && !visualQualityDoesNotRegress({ baselineQuality, candidateQuality })) return false;
  if (allowFailedQualityTolerance && (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality))) return false;
  if (!rasterEditabilityDoesNotRegress({ baseline, candidate })) return false;
  if (baseline.nativeComponentQuality?.passed && !candidate.nativeComponentQuality?.passed) return false;
  if (improves !== undefined && typeof improves !== "function") throw new TypeError("native rebuild candidate improvement predicate is invalid");
  if (improves && improves({ baseline, candidate }) !== true) return false;
  return true;
}

function selectOcrRecovery({ baseline, candidate, baselineQuality, candidateQuality }) {
  const baselinePixelDiff = baselineQuality?.metrics?.["pixel-diff-ratio"];
  const candidatePixelDiff = candidateQuality?.metrics?.["pixel-diff-ratio"];
  if (!Number.isFinite(baselinePixelDiff) || !Number.isFinite(candidatePixelDiff)) return false;
  const failedBaselineTolerance = baselineQuality?.passed === false
    && candidateQuality?.passed === false
    && ocrRecoveryFailedQualityTolerance({ baselineQuality, candidateQuality });
  const failedEditabilityTolerance = baselineQuality?.passed === false
    && candidateQuality?.passed === false
    && rasterEditabilityImproves({ baseline, candidate })
    && ocrRecoveryFailedEditabilityTolerance({ baselineQuality, candidateQuality });
  if (candidatePixelDiff >= baselinePixelDiff - 1e-9 && !failedBaselineTolerance && !failedEditabilityTolerance) return false;
  return selectNativeRebuildCandidate({
    baseline, candidate, baselineQuality, candidateQuality,
    allowFailedQualityTolerance: failedBaselineTolerance || failedEditabilityTolerance,
    improves: ({ baseline: current, candidate: proposed }) => {
      if (!Number.isSafeInteger(proposed?.ocrCropRecovery?.recovered)
        || proposed.ocrCropRecovery.recovered <= (current?.ocrCropRecovery?.recovered || 0)) return false;
      return nativeObjectMetrics(proposed.deck).textBoxes > nativeObjectMetrics(current.deck).textBoxes;
    }
  });
}

function shouldStopOcrRecoverySearch({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  const baselineMetrics = baselineQuality.metrics || {};
  const metrics = candidateQuality.metrics || {};
  const pixelDelta = Number(metrics["pixel-diff-ratio"]) - Number(baselineMetrics["pixel-diff-ratio"]);
  const foregroundDelta = Number(metrics["foreground-missing-ratio"]) - Number(baselineMetrics["foreground-missing-ratio"]);
  const attentionDelta = Number(metrics["component-regions-attention"] || 0) - Number(baselineMetrics["component-regions-attention"] || 0);
  const baselineSeverity = Number(baselineMetrics["worst-component-normalized-severity"]);
  const candidateSeverity = Number(metrics["worst-component-normalized-severity"]);
  const severityDelta = Number.isFinite(baselineSeverity) && Number.isFinite(candidateSeverity)
    ? candidateSeverity - baselineSeverity
    : 0;
  if (!Number.isFinite(pixelDelta) || !Number.isFinite(foregroundDelta)) return false;
  return pixelDelta >= 0.02
    && foregroundDelta >= 0.03
    && (attentionDelta >= 8 || severityDelta >= 0.4);
}

function assessOcrRecovery(input) {
  const passed = selectOcrRecovery(input);
  if (passed) return Object.freeze({ passed, reasons: [] });
  const { baseline, candidate, baselineQuality, candidateQuality } = input;
  const reasons = [];
  if (!baseline?.deck || !candidate?.deck) reasons.push("native-deck-missing");
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) reasons.push("quality-not-rendered");
  const tolerance = baselineQuality?.passed === false && candidateQuality?.passed === false
    && (ocrRecoveryFailedQualityTolerance({ baselineQuality, candidateQuality })
      || (baseline?.deck && candidate?.deck && rasterEditabilityImproves({ baseline, candidate })
        && ocrRecoveryFailedEditabilityTolerance({ baselineQuality, candidateQuality })));
  if (!tolerance) {
    for (const name of STRICT_VISUAL_QUALITY_METRICS) {
      const before = baselineQuality?.metrics?.[name], after = candidateQuality?.metrics?.[name];
      if (!Number.isFinite(before) || !Number.isFinite(after) || after > before + 1e-9) { reasons.push("global-visual-regression"); break; }
    }
    for (const name of OPTIONAL_VISUAL_QUALITY_METRICS) {
      const before = baselineQuality?.metrics?.[name], after = candidateQuality?.metrics?.[name];
      if (before !== undefined && (!Number.isFinite(after) || after > before + 1e-9)) { reasons.push("optional-visual-regression"); break; }
    }
  }
  if (baseline?.deck && candidate?.deck) {
    if (!rasterEditabilityDoesNotRegress({ baseline, candidate })) reasons.push("large-raster-regression");
    if (baseline.nativeComponentQuality?.passed && !candidate.nativeComponentQuality?.passed) reasons.push("native-component-regression");
    if (nativeObjectMetrics(candidate.deck).textBoxes <= nativeObjectMetrics(baseline.deck).textBoxes) reasons.push("native-text-not-improved");
  }
  if (!Number.isSafeInteger(candidate?.ocrCropRecovery?.recovered) || candidate.ocrCropRecovery.recovered <= (baseline?.ocrCropRecovery?.recovered || 0)) reasons.push("ocr-recovery-not-improved");
  if (!tolerance && !(candidateQuality?.metrics?.["pixel-diff-ratio"] < baselineQuality?.metrics?.["pixel-diff-ratio"] - 1e-9)) reasons.push("pixel-diff-not-improved");
  return Object.freeze({ passed, reasons: Object.freeze(reasons.length ? reasons : ["ocr-recovery-policy"]) });
}

function ocrRecoveryFailedEditabilityTolerance({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  const metrics = candidateQuality.metrics || {};
  const baselineMetrics = baselineQuality.metrics || {};
  const pixelDiff = Number(metrics["pixel-diff-ratio"]);
  const foregroundMissing = Number(metrics["foreground-missing-ratio"]);
  const meanDelta = Number(metrics["mean-absolute-delta"]);
  const attention = Number(metrics["component-regions-attention"] || 0);
  const baselineWorstSeverity = Number(baselineMetrics["worst-component-normalized-severity"]);
  const candidateWorstSeverity = Number(metrics["worst-component-normalized-severity"]);
  if (!Number.isFinite(pixelDiff) || pixelDiff > 0.22) return false;
  if (!Number.isFinite(foregroundMissing) || foregroundMissing > 0.33) return false;
  if (!Number.isFinite(meanDelta) || meanDelta > 20) return false;
  if (!Number.isFinite(attention) || attention > 125) return false;
  if (Number.isFinite(baselineWorstSeverity)
    && Number.isFinite(candidateWorstSeverity)
    && candidateWorstSeverity > baselineWorstSeverity + 0.5) return false;
  return true;
}

function ocrRecoveryFailedQualityTolerance({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  const limits = {
    "pixel-diff-ratio": 0.004,
    "foreground-missing-ratio": 0.02,
    "mean-absolute-delta": 1.5,
    "component-regions-attention": 2,
    "worst-component-normalized-severity": 0.08,
    "worst-component-pixel-diff-ratio": 0.04,
    "worst-component-foreground-missing-ratio": 0.04
  };
  for (const [name, tolerance] of Object.entries(limits)) {
    const before = baselineQuality.metrics?.[name];
    const after = candidateQuality.metrics?.[name];
    if (before === undefined && after === undefined) continue;
    if (!Number.isFinite(before) || !Number.isFinite(after) || after > before + tolerance) return false;
  }
  return true;
}


return {qualityRendered,visualQualityDoesNotRegress,rasterEditabilityDoesNotRegress,selectNativeRebuildCandidate,selectOcrRecovery,assessOcrRecovery,shouldStopOcrRecoverySearch};
}
module.exports={createNativeRebuildCandidatePolicy};
