"use strict";

const { createFinalRefinementQualityPolicy } = require("./candidate-quality-policy");
const { recordWorkerCandidateDecision } = require("./worker-budget-runner");
const { isSpatialMissingComponent, sharedMissingComponentRegression } = require("./missing-component-regression");
const { candidateMissingTargetDisappearedWithGlobalImprovement } = require('./worker-missing-graphics');
const { auditNativeComponentQuality, largeRasterEditability, qualityRendered } = require("./worker-output-services");
const { isFiniteBox } = require('./worker-primitives');
const { isFiniteLineBox, visualFidelityPassed } = require('./worker-graphic-evidence');
const { auditSemanticEditability } = require("./worker-output-services");

const finalRefinementQualityAcceptable = createFinalRefinementQualityPolicy({ sharedWorstComponentRegression, recordDecision: recordWorkerCandidateDecision });

function componentWorstPriority(quality, { role, kind } = {}) {
  const priorities = new Map();
  const rows = Array.isArray(quality?.componentWorst) ? quality.componentWorst : [];
  for (const item of rows) {
    if (!Number.isSafeInteger(item?.pageIndex) || typeof item.id !== "string" || !item.id) continue;
    if (role && item.role !== role) continue;
    if (kind && item.kind !== kind) continue;
    const key = `${item.pageIndex}:${item.id}`;
    if (!priorities.has(key)) priorities.set(key, priorities.size);
  }
  return priorities;
}

function sharedWorstComponentRegression({ baselineQuality, candidateQuality }) {
  const before = componentSeverityByKey(baselineQuality);
  if (before.size === 0) return 0;
  let regression = sharedMissingComponentRegression(baselineQuality?.componentWorst, candidateQuality?.componentWorst,
    candidateQuality?.componentReferenceMetrics, baselineQuality?.componentReferenceMetrics);
  for (const item of Array.isArray(candidateQuality?.componentWorst) ? candidateQuality.componentWorst : []) {
    if (isSpatialMissingComponent(item)) continue;
    const key = componentWorstKey(item);
    if (!key || !before.has(key) || !Number.isFinite(item.severity)) continue;
    regression = Math.max(regression, item.severity - before.get(key));
  }
  return regression;
}

function componentWorstByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentWorst) ? quality.componentWorst : []) {
    const key = componentWorstKey(item);
    if (!key) continue;
    const current = result.get(key);
    if (!current || Number(item.severity || 0) > Number(current.severity || 0)) result.set(key, item);
  }
  return result;
}

function componentLocalByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentLocalMetrics) ? quality.componentLocalMetrics : []) {
    const key = componentWorstKey(item);
    if (!key) continue;
    const current = result.get(key);
    if (!current || Number(item.severity || 0) > Number(current.severity || 0)) result.set(key, item);
  }
  return result;
}

function componentQualityByKey(quality) {
  const result = componentWorstByKey(quality);
  for (const [key, item] of componentLocalByKey(quality)) result.set(key, item);
  return result;
}

function componentSeverityByKey(quality) {
  const result = new Map();
  for (const item of Array.isArray(quality?.componentWorst) ? quality.componentWorst : []) {
    const key = componentWorstKey(item);
    if (!key || !Number.isFinite(item.severity)) continue;
    const current = result.get(key);
    result.set(key, Number.isFinite(current) ? Math.max(current, item.severity) : item.severity);
  }
  return result;
}

function componentWorstKey(item) {
  if (!Number.isSafeInteger(item?.pageIndex) || typeof item.id !== "string" || !item.id) return null;
  return `${item.pageIndex}:${item.id}`;
}

function componentMetric(value, name) {
  if (!value || typeof value !== "object") return Number.NaN;
  if (Number.isFinite(value[name])) return value[name];
  if (name === "pixelDiffRatio" && Number.isFinite(value.pixelDiff)) return value.pixelDiff;
  if (name === "foregroundMissingRatio" && Number.isFinite(value.foregroundMissing)) return value.foregroundMissing;
  return Number.NaN;
}

function targetComponentQualityImproves({ baselineQuality, candidateQuality, targetKeys }) {
  const targets = targetKeys instanceof Set ? targetKeys : new Set(Array.isArray(targetKeys) ? targetKeys : []);
  if (targets.size < 1) return false;
  const before = componentQualityByKey(baselineQuality);
  if (before.size < 1) return false;
  const after = componentQualityByKey(candidateQuality);
  let evaluated = 0;
  let improved = false;
  for (const key of targets) {
    const baseline = before.get(key);
    if (!baseline) continue;
    evaluated += 1;
    const candidate = after.get(key);
    if (!candidate) {
      return false;
    }
    const beforeSeverity = componentMetric(baseline, "severity");
    const afterSeverity = componentMetric(candidate, "severity");
    if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity)) {
      if (afterSeverity > beforeSeverity + 0.02) return false;
      if (afterSeverity < beforeSeverity - 0.08) improved = true;
    }
    const beforePixel = componentMetric(baseline, "pixelDiffRatio");
    const afterPixel = componentMetric(candidate, "pixelDiffRatio");
    if (Number.isFinite(beforePixel) && Number.isFinite(afterPixel)) {
      if (afterPixel > beforePixel + 0.005) return false;
      if (afterPixel < beforePixel - 0.005) improved = true;
    }
    const beforeMissing = componentMetric(baseline, "foregroundMissingRatio");
    const afterMissing = componentMetric(candidate, "foregroundMissingRatio");
    if (Number.isFinite(beforeMissing) && Number.isFinite(afterMissing)) {
      if (afterMissing > beforeMissing + 0.005) return false;
      if (afterMissing < beforeMissing - 0.005) improved = true;
    }
    if (baseline.attention === true && candidate.attention !== true) improved = true;
  }
  return evaluated > 0 && improved;
}

function targetMissingNativeComponentQualityImproves({ baselineQuality, candidateQuality, targetKeys }) {
  const targets = targetKeys instanceof Set ? targetKeys : new Set(Array.isArray(targetKeys) ? targetKeys : []);
  if (targets.size < 1) return false;
  const before = componentQualityByKey(baselineQuality);
  if (before.size < 1) return false;
  const after = componentQualityByKey(candidateQuality);
  let evaluated = 0;
  let improved = false;
  for (const key of targets) {
    const baseline = before.get(key);
    if (!baseline || baseline.kind !== "missing" || baseline.role !== "missing-native-component") continue;
    evaluated += 1;
    const candidate = after.get(key);
    if (!candidate) {
      if (!candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality })) return false;
      improved = true;
      continue;
    }
    if (candidate.kind !== "missing" || candidate.role !== "missing-native-component") {
      if (!candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality })) return false;
      improved = true;
      continue;
    }
    const beforeSeverity = componentMetric(baseline, "severity");
    const afterSeverity = componentMetric(candidate, "severity");
    if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity)) {
      if (afterSeverity > beforeSeverity + 0.02) return false;
      if (afterSeverity < beforeSeverity - 0.08) improved = true;
    }
    const beforePixel = componentMetric(baseline, "pixelDiffRatio");
    const afterPixel = componentMetric(candidate, "pixelDiffRatio");
    if (Number.isFinite(beforePixel) && Number.isFinite(afterPixel)) {
      if (afterPixel > beforePixel + 0.005) return false;
      if (afterPixel < beforePixel - 0.005) improved = true;
    }
    const beforeMissing = componentMetric(baseline, "foregroundMissingRatio");
    const afterMissing = componentMetric(candidate, "foregroundMissingRatio");
    if (Number.isFinite(beforeMissing) && Number.isFinite(afterMissing)) {
      if (afterMissing > beforeMissing + 0.005) return false;
      if (afterMissing < beforeMissing - 0.005) improved = true;
    }
    if (baseline.attention === true && candidate.attention !== true) improved = true;
  }
  return evaluated > 0 && improved;
}

function nativeShapeThinStrokeQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  if (![beforePixel, afterPixel, beforeMean, afterMean, beforeForeground, afterForeground].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel - 0.0015) return false;
  if (afterMean > beforeMean - 0.04) return false;
  if (afterForeground > beforeForeground + 0.025) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention + 6) return false;
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity > beforeSeverity + 0.08) return false;
  return true;
}

function editableTextFontFamilyQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.24) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  if (![beforePixel, afterPixel, beforeMean, afterMean, beforeForeground, afterForeground].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel - 0.0025) return false;
  if (afterMean > beforeMean - 0.04) return false;
  if (afterForeground > beforeForeground + 0.025) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention + 8) return false;
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (Number.isFinite(beforeSeverity) && Number.isFinite(afterSeverity) && afterSeverity > beforeSeverity + 0.25) return false;
  return true;
}

function compactDeckFinalQualitySourceProvenance(deck) {
  const next = structuredClone(deck);
  let changedElements = 0;
  let removedFields = 0;
  const removedFieldNames = new Set();
  const keepFields = new Set([
    // Classification and lineage are audit evidence, not disposable debug data.
    "detector", "fullSlideResidual", "residualCrop", "tiledLargeRaster",
    "visualFallbackSource", "strategy", "lineageId", "parentRasterId",
    "parentLargeRasterId", "sourceAssetSha256",
    "componentQualityBox",
    "componentQualityIgnore",
    "componentQualityRole",
    "componentRenderStrategy",
    "coordinateReferenceSizePx",
    "crop",
    "cropEvidenceRequired",
    "cropRect",
    "layer",
    "mappedPixelBox",
    "nativeComponentGroupId",
    "ocrProvider",
    "originalPixelBox",
    "pageImage",
    "protectedMinimumUnit",
    "removedNeighborPixels",
    "retainedDetailComponents",
    "tableOverlay",
    "tightenedPixelBox",
  ]);
  function compactElementSource(element) {
    if (!element?.source || typeof element.source !== "object" || Array.isArray(element.source)) return;
    let changed = false;
    for (const field of Object.keys(element.source)) {
      if (field === "nativeRebuild" && typeof element.source[field] === "boolean") continue;
      if (keepFields.has(field)) continue;
      delete element.source[field];
      removedFields += 1;
      removedFieldNames.add(field);
      changed = true;
    }
    if (Object.keys(element.source).length < 1) {
      delete element.source;
      changed = true;
    }
    if (changed) changedElements += 1;
  }
  function removeField(record, field, owner) {
    if (!record || typeof record !== "object" || Array.isArray(record) || !Object.prototype.hasOwnProperty.call(record, field)) return false;
    delete record[field];
    removedFields += 1;
    removedFieldNames.add(`${owner}.${field}`);
    return true;
  }
  function compactTextBoxDefaults(textBox) {
    let changed = false;
    if (textBox?.style && typeof textBox.style === "object" && !Array.isArray(textBox.style)) {
      if (textBox.style.visibility === "visible") changed = removeField(textBox.style, "visibility", "textStyle") || changed;
      if (textBox.style.opacity === 1) changed = removeField(textBox.style, "opacity", "textStyle") || changed;
      if (textBox.style.marginLeftPt === 0) changed = removeField(textBox.style, "marginLeftPt", "textStyle") || changed;
      if (textBox.style.marginRightPt === 0) changed = removeField(textBox.style, "marginRightPt", "textStyle") || changed;
      if (textBox.style.marginTopPt === 0) changed = removeField(textBox.style, "marginTopPt", "textStyle") || changed;
      if (textBox.style.marginBottomPt === 0) changed = removeField(textBox.style, "marginBottomPt", "textStyle") || changed;
      if (textBox.style.fit === "shrink") changed = removeField(textBox.style, "fit", "textStyle") || changed;
      if (Object.keys(textBox.style).length < 1) changed = removeField(textBox, "style", "textBox") || changed;
    }
    if (textBox?.font && typeof textBox.font === "object" && !Array.isArray(textBox.font)) {
      if (textBox.font.opacity === 1) changed = removeField(textBox.font, "opacity", "textFont") || changed;
      if (String(textBox.font.weight || "").toLowerCase() === "regular") changed = removeField(textBox.font, "weight", "textFont") || changed;
      if (String(textBox.font.align || "").toLowerCase() === "left") changed = removeField(textBox.font, "align", "textFont") || changed;
    }
    if (changed) changedElements += 1;
  }
  function compactShapeDefaults(shape) {
    if (!shape?.style || typeof shape.style !== "object" || Array.isArray(shape.style)) return;
    let changed = false;
    if (shape.style.opacity === 1) changed = removeField(shape.style, "opacity", "shapeStyle") || changed;
    if (Number(shape.style.strokeWidthPt) === 0) {
      changed = removeField(shape.style, "strokeWidthPt", "shapeStyle") || changed;
      if (typeof shape.style.stroke === "string") changed = removeField(shape.style, "stroke", "shapeStyle") || changed;
    }
    if (changed) changedElements += 1;
  }
  for (const page of Array.isArray(next?.pages) ? next.pages : []) {
    for (const key of ["shapes", "textBoxes", "images", "tables", "charts", "icons"]) {
      for (const element of Array.isArray(page?.[key]) ? page[key] : []) compactElementSource(element);
    }
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) compactShapeDefaults(shape);
    for (const textBox of Array.isArray(page?.textBoxes) ? page.textBoxes : []) compactTextBoxDefaults(textBox);
  }
  if (removedFields > 0) {
    next.meta = {
      ...(next.meta || {}),
      finalQualitySourceProvenanceCompaction: {
        provider: "worker-final-quality-source-provenance-compaction-v1",
        changedElements,
        removedFields,
        removedFieldNames: [...removedFieldNames].sort()
      }
    };
  }
  return { deck: next, changedElements, removedFields, removedFieldNames: [...removedFieldNames].sort() };
}

function componentFidelityTargetBox(component) {
  if (!component || !component.box) return null;
  const qualityBox = componentQualityReferenceBox(component);
  if (qualityBox) return qualityBox;
  if (component.source?.evidenceBox && isFiniteBox(component.source.evidenceBox)) return component.source.evidenceBox;
  if (component.type === "line" && isFiniteLineBox(component.box)) return componentLineFidelityTargetBox(component);
  return isFiniteBox(component.box) ? component.box : null;
}

function componentQualityReferenceBox(component) {
  const qualityBox = component?.source?.componentQualityBox;
  return isFiniteBox(qualityBox) && Number(qualityBox.w) > 0 && Number(qualityBox.h) > 0 ? qualityBox : null;
}

function componentLineFidelityTargetBox(component) {
  const box = component.box;
  const strokeWidthPt = Number(component?.style?.strokeWidthPt);
  const perpendicularPad = Math.max(2.5, Math.min(10, (Number.isFinite(strokeWidthPt) && strokeWidthPt > 0 ? strokeWidthPt : 1) * 4));
  const endPad = Math.max(1.5, perpendicularPad * 0.5);
  const width = Math.abs(Number(box.w || 0));
  const height = Math.abs(Number(box.h || 0));
  if (height >= width) {
    const y1 = Math.min(Number(box.y), Number(box.y) + Number(box.h || 0));
    return { x: Number(box.x) - perpendicularPad, y: y1 - endPad, w: perpendicularPad * 2, h: height + endPad * 2 };
  }
  const x1 = Math.min(Number(box.x), Number(box.x) + Number(box.w || 0));
  return { x: x1 - endPad, y: Number(box.y) - perpendicularPad, w: width + endPad * 2, h: perpendicularPad * 2 };
}

function componentWorstRole(visualQuality, pageIndex, id) {
  const rows = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  const found = rows.find((item) => item?.pageIndex === pageIndex && item?.id === id);
  return typeof found?.role === "string" ? found.role : null;
}

function shouldPreserveMissingNativeLineAtom(atom) {
  if (!isFiniteBox(atom?.box)) return false;
  const endpoints = atom.lineEndpoints?.from && atom.lineEndpoints?.to ? atom.lineEndpoints : null;
  const hint = String(atom.shapeHint || "");
  if (endpoints) return true;
  if (hint === "line-diagonal" || hint === "arrow-diagonal") return true;
  const width = Number(atom.box.w);
  const height = Number(atom.box.h);
  if (![width, height].every(Number.isFinite) || width <= 0 || height <= 0) return false;
  const thinness = Math.min(width, height) / Math.max(width, height);
  const density = Number(atom.density);
  return thinness <= 0.08 && (!Number.isFinite(density) || density <= 0.42);
}

function lightCardSourceStrokeQualityAcceptable({ baselineQuality, candidateQuality }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (sharedWorstComponentRegression({ baselineQuality, candidateQuality }) > 0.08) return false;
  const beforePixel = baselineQuality.metrics?.["pixel-diff-ratio"];
  const afterPixel = candidateQuality.metrics?.["pixel-diff-ratio"];
  const beforeForeground = baselineQuality.metrics?.["foreground-missing-ratio"];
  const afterForeground = candidateQuality.metrics?.["foreground-missing-ratio"];
  const beforeMean = baselineQuality.metrics?.["mean-absolute-delta"];
  const afterMean = candidateQuality.metrics?.["mean-absolute-delta"];
  const beforeSeverity = baselineQuality.metrics?.["worst-component-normalized-severity"];
  const afterSeverity = candidateQuality.metrics?.["worst-component-normalized-severity"];
  if (![beforePixel, afterPixel, beforeForeground, afterForeground, beforeMean, afterMean, beforeSeverity, afterSeverity].every(Number.isFinite)) return false;
  if (afterPixel > beforePixel + 0.00001) return false;
  if (afterForeground > beforeForeground + 0.00001) return false;
  if (afterMean > beforeMean + 0.02) return false;
  if (afterSeverity > beforeSeverity - 0.2) return false;
  const beforeAttention = baselineQuality.metrics?.["component-regions-attention"];
  const afterAttention = candidateQuality.metrics?.["component-regions-attention"];
  if (Number.isFinite(beforeAttention) && Number.isFinite(afterAttention) && afterAttention > beforeAttention) return false;
  return true;
}

function trimQualityMetrics(metrics) {
  const result = {};
  for (const [name, value] of Object.entries(metrics || {})) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) result[name] = value;
  }
  for (const name of [
    "text-refinement-milliseconds",
    "quality-render-milliseconds",
    "worst-component-foreground-missing-ratio",
    "worst-component-pixel-diff-ratio",
    "worst-component-normalized-severity",
    "component-regions-evaluated",
    "component-regions-audited",
    "component-regions-attention",
    "native-only-text-refinement-milliseconds",
    "native-only-text-refinement-skipped-pixel-budget",
    "native-only-text-refinement-proposed-boxes",
    "native-only-text-refinement-accepted",
    "text-refinement-skipped-pixel-budget",
    "final-ocr-evidence-fit-text-boxes",
    "final-ocr-evidence-fit-accepted",
    "final-saturated-color-panel-fit-shapes",
    "final-saturated-color-panel-fit-accepted",
    "final-low-saturation-panel-fill-fit-shapes",
    "final-low-saturation-panel-fill-fit-accepted",
    "final-source-vertical-line-fit-shapes",
    "final-source-vertical-line-fit-accepted",
    "final-worst-connector-style-fit-shapes",
    "final-worst-connector-style-fit-accepted",
    "final-low-contrast-footer-mark-fit-shapes",
    "final-low-contrast-footer-mark-fit-accepted",
    "final-worst-text-color-fit-text-boxes",
    "final-worst-text-color-fit-accepted",
    "final-editable-text-font-family-fit-text-boxes",
    "final-editable-text-font-family-fit-accepted",
    "final-worst-text-scale-fit-text-boxes",
    "final-worst-text-scale-fit-accepted",
    "final-worst-text-box-nudge-fit-text-boxes",
    "final-worst-text-box-nudge-fit-accepted",
    "final-worst-text-weight-fit-text-boxes",
    "final-worst-text-weight-fit-accepted",
    "final-worst-text-ink-box-fit-text-boxes",
    "final-worst-text-ink-box-fit-accepted",
    "final-light-card-geometry-fit-shapes",
    "final-light-card-geometry-fit-accepted",
    "final-light-card-stroke-fit-shapes",
    "final-light-card-stroke-fit-accepted",
    "final-light-card-stroke-color-fit-shapes",
    "final-light-card-stroke-color-fit-accepted",
    "final-line-text-covered-crop-drop-accepted",
    "final-line-text-covered-crop-drop-removed",
    "final-line-text-covered-crop-drop-large-raster-count",
    "final-line-text-covered-crop-drop-rejection-code",
    "semantic-raster-provenance-missing",
    "semantic-suspicious-raster-mosaic",
    "component-quality-ignored-pixel-primitives",
    "component-quality-unverified-crops",
    "component-quality-evidenced-crops",
    "component-quality-minimum-unit-crops",
    "component-quality-connectors",
    "native-charts",
    "native-tables",
    "native-connectors",
    "residual-erased-native-objects"
  ]) {
    if (Object.keys(result).length <= 32) break;
    delete result[name];
  }
  const protectedMetricNames = new Set([
    "pixel-diff-ratio",
    "foreground-missing-ratio",
    "mean-absolute-delta",
    "semantic-native-path-relationships",
    "semantic-non-reroutable-relationships",
    "semantic-node-rerouting-required",
    "native-shadow-resumed",
    "ocr-crop-lines-recovered",
    "native-only-residual-policy-rejected",
    "native-only-residual-semantic-rejected",
    "native-only-residual-component-rejected",
    "final-native-only-residual-policy-rejected",
    "final-native-only-residual-semantic-rejected",
    "final-native-only-residual-component-rejected",
    "semantic-raster-derived-primitives",
    "semantic-large-raster-lineages",
    "semantic-unverified-crops"
  ]);
  while (Object.keys(result).length > 32) {
    const removable = Object.keys(result).reverse().find((name) => !protectedMetricNames.has(name));
    if (!removable) break;
    delete result[removable];
  }
  return result;
}

function shouldTryFinalVisualRefinement(visualQuality) {
  return qualityRendered(visualQuality) && visualQuality?.passed !== true
    && visualQuality?.metrics?.["large-raster-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["native-only-residual-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["missing-native-late-refinement-blocked"] !== 1;
}

function shouldTryFinalWorstTextRefinement(visualQuality) {
  return shouldTryFinalVisualRefinement(visualQuality)
    && (!visualFidelityPassed(visualQuality)||hasAttentionTextWorstComponent(visualQuality))
    && !topWorstComponentNeedsNativeShapeRefinement(visualQuality);
}

function shouldTryFinalComponentFidelityPrimitiveRefinement(visualQuality) {
  if (shouldTryFinalVisualRefinement(visualQuality) && !topWorstComponentNeedsNativeShapeRefinement(visualQuality)) return true;
  return qualityRendered(visualQuality) && visualQuality?.passed !== true
    && topWorstComponentIsMissingNative(visualQuality)
    && visualQuality?.metrics?.["large-raster-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["native-only-residual-late-refinement-blocked"] !== 1
    && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === 0;
}

function shouldTryFinalWorstTextInkBoxRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function shouldTryFinalEditableTextFontFamilyRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function shouldTryFinalAttentionTextRefinement(visualQuality) {
  return shouldTryFinalWorstTextRefinement(visualQuality) || (shouldTryFinalVisualRefinement(visualQuality) && hasAttentionTextWorstComponent(visualQuality));
}

function hasAttentionTextWorstComponent(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst : [];
  return worst.some((item) => item?.kind === "text" && item?.attention === true);
}

function topWorstComponentNeedsNativeShapeRefinement(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst[0] : null;
  const id = String(worst?.id || "");
  const kind = String(worst?.kind || "");
  const role = String(worst?.role || "");
  if (topWorstComponentIsMissingNative(visualQuality)) return worst?.textAdjacent !== true && String(worst?.repairHint || "") !== "text";
  return kind === "shape" && (role === "container-border" || /^line-text-(?:card-row|leading-icon-swatch|.*source-(?:left|right|top|bottom)-)/u.test(id));
}

function topWorstComponentIsMissingNative(visualQuality) {
  const worst = Array.isArray(visualQuality?.componentWorst) ? visualQuality.componentWorst[0] : null;
  return String(worst?.kind || "") === "missing" && String(worst?.role || "") === "missing-native-component";
}

function blockLateVisualRefinementForLargeRaster(visualQuality, deck) {
  if (!qualityRendered(visualQuality) || largeRasterEditability(deck).passed) return visualQuality;
  if (topWorstComponentNeedsNativeShapeRefinement(visualQuality)) return visualQuality;
  return {
    ...visualQuality,
    metrics: {
      ...(visualQuality.metrics || {}),
      "large-raster-late-refinement-blocked": 1
    }
  };
}

function blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality) {
  if (!qualityRendered(visualQuality)) return visualQuality;
  const metrics = visualQuality.metrics || {};
  const pixelDiff = Number(metrics["pixel-diff-ratio"]);
  const foregroundMissing = Number(metrics["foreground-missing-ratio"]);
  if (!Number.isFinite(pixelDiff) || !Number.isFinite(foregroundMissing)) return visualQuality;
  if (pixelDiff <= 0.12 && foregroundMissing <= 0.08) return visualQuality;
  return {
    ...visualQuality,
    metrics: {
      ...metrics,
      "native-only-residual-late-refinement-blocked": 1
    }
  };
}

function nativeOnlyResidualQualityAcceptable({ baselineQuality, candidateQuality, baselineDeck, candidateDeck }) {
  if (!qualityRendered(baselineQuality) || !qualityRendered(candidateQuality)) return false;
  if (!visualFidelityPassed(candidateQuality)) return false;
  const baselineRaster = largeRasterEditability(baselineDeck);
  const candidateRaster = largeRasterEditability(candidateDeck);
  if (baselineRaster.passed || !candidateRaster.passed) return false;
  const before = baselineQuality.metrics || {};
  const after = candidateQuality.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  return pixelAfter <= pixelBefore + 0.012
    && missingAfter <= missingBefore + 0.05
    && deltaAfter <= deltaBefore + 2.25;
}

function nativeOnlySemanticChecksPass(deck) {
  return largeRasterEditability(deck).passed
    && auditNativeComponentQuality(deck).passed
    && auditSemanticEditability(deck).passed;
}

function nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy, prefix = "native-only-residual") {
  if (!nativeOnlyCandidate || nativeOnlyCandidate.rejected === true) return {};
  const metrics = nativeOnlyCandidate.quality?.metrics || {};
  return {
    ...(Number.isFinite(Number(metrics["pixel-diff-ratio"])) ? { [`${prefix}-candidate-pixel-diff-ratio`]: Number(metrics["pixel-diff-ratio"]) } : {}),
    ...(Number.isFinite(Number(metrics["foreground-missing-ratio"])) ? { [`${prefix}-candidate-foreground-missing-ratio`]: Number(metrics["foreground-missing-ratio"]) } : {}),
    ...(Number.isFinite(Number(metrics["mean-absolute-delta"])) ? { [`${prefix}-candidate-mean-absolute-delta`]: Number(metrics["mean-absolute-delta"]) } : {}),
    ...(Number.isFinite(Number(metrics["component-regions-attention"])) ? { [`${prefix}-candidate-attention-components`]: Number(metrics["component-regions-attention"]) } : {}),
    ...(nativeOnlyPolicy?.reasons?.includes("visual-fidelity") ? { [`${prefix}-visual-fidelity-rejected`]: 1 } : {}),
    ...(nativeOnlyPolicy?.reasons?.includes("visual-regressed") ? { [`${prefix}-visual-regressed`]: 1 } : {}),
    ...(metrics["native-only-pre-policy-text-refinement-accepted"] !== undefined ? { [`${prefix}-text-refinement-accepted`]: metrics["native-only-pre-policy-text-refinement-accepted"] } : {}),
    ...(metrics["native-only-text-refinement-blocked-scene"] === 1 ? { [`${prefix}-text-refinement-blocked-scene`]: 1 } : {}),
    ...(metrics["native-only-pre-policy-text-refinement-proposed-boxes"] !== undefined ? { [`${prefix}-text-refinement-proposed-boxes`]: metrics["native-only-pre-policy-text-refinement-proposed-boxes"] } : {}),
    ...(metrics["native-only-missing-native-lines-accepted"] !== undefined ? { [`${prefix}-missing-native-lines-accepted`]: metrics["native-only-missing-native-lines-accepted"] } : {}),
    ...(metrics["native-only-missing-native-lines-shapes"] !== undefined ? { [`${prefix}-missing-native-lines-shapes`]: metrics["native-only-missing-native-lines-shapes"] } : {}),
    ...(metrics["native-only-missing-native-lines-targets"] !== undefined ? { [`${prefix}-missing-native-lines-targets`]: metrics["native-only-missing-native-lines-targets"] } : {}),
    ...(metrics["native-only-pictorial-icons-attempted"] !== undefined ? { [`${prefix}-pictorial-icons-attempted`]: metrics["native-only-pictorial-icons-attempted"] } : {}),
    ...(metrics["native-only-pictorial-icons-vectorized"] !== undefined ? { [`${prefix}-pictorial-icons-vectorized`]: metrics["native-only-pictorial-icons-vectorized"] } : {}),
    ...(metrics["native-only-pictorial-icons-shapes"] !== undefined ? { [`${prefix}-pictorial-icons-shapes`]: metrics["native-only-pictorial-icons-shapes"] } : {}),
    ...(metrics["native-only-pictorial-icons-accepted"] !== undefined ? { [`${prefix}-pictorial-icons-accepted`]: metrics["native-only-pictorial-icons-accepted"] } : {}),
    ...(metrics["native-only-pictorial-icons-rejected"] !== undefined ? { [`${prefix}-pictorial-icons-rejected`]: metrics["native-only-pictorial-icons-rejected"] } : {}),
    ...(metrics["native-only-pictorial-icons-semantic-rejected"] !== undefined ? { [`${prefix}-pictorial-icons-semantic-rejected`]: metrics["native-only-pictorial-icons-semantic-rejected"] } : {}),
    ...(metrics["native-only-pictorial-icons-visual-regressed"] !== undefined ? { [`${prefix}-pictorial-icons-visual-regressed`]: metrics["native-only-pictorial-icons-visual-regressed"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-pixel-diff-ratio"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-pixel-diff-ratio`]: metrics["native-only-pictorial-icons-candidate-pixel-diff-ratio"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-foreground-missing-ratio"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-foreground-missing-ratio`]: metrics["native-only-pictorial-icons-candidate-foreground-missing-ratio"] } : {}),
    ...(metrics["native-only-pictorial-icons-candidate-mean-absolute-delta"] !== undefined ? { [`${prefix}-pictorial-icons-candidate-mean-absolute-delta`]: metrics["native-only-pictorial-icons-candidate-mean-absolute-delta"] } : {})
  };
}

function shouldTryNativeOnlyPrePolicyTextRefinement(visualQuality) {
  return qualityRendered(visualQuality) && visualQuality?.passed !== true && hasAttentionTextWorstComponent(visualQuality);
}

module.exports = { finalRefinementQualityAcceptable, componentWorstPriority, sharedWorstComponentRegression, componentWorstByKey, componentLocalByKey, componentQualityByKey, componentSeverityByKey, componentWorstKey, componentMetric, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, nativeShapeThinStrokeQualityAcceptable, editableTextFontFamilyQualityAcceptable, compactDeckFinalQualitySourceProvenance, componentFidelityTargetBox, componentQualityReferenceBox, componentLineFidelityTargetBox, componentWorstRole, shouldPreserveMissingNativeLineAtom, lightCardSourceStrokeQualityAcceptable, trimQualityMetrics, shouldTryFinalVisualRefinement, shouldTryFinalWorstTextRefinement, shouldTryFinalComponentFidelityPrimitiveRefinement, shouldTryFinalWorstTextInkBoxRefinement, shouldTryFinalEditableTextFontFamilyRefinement, shouldTryFinalAttentionTextRefinement, hasAttentionTextWorstComponent, topWorstComponentNeedsNativeShapeRefinement, topWorstComponentIsMissingNative, blockLateVisualRefinementForLargeRaster, blockLateVisualRefinementForNativeOnlyResidualGap, nativeOnlyResidualQualityAcceptable, nativeOnlySemanticChecksPass, nativeOnlyResidualRejectionMetrics, shouldTryNativeOnlyPrePolicyTextRefinement };
