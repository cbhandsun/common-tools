"use strict";

const { traceDiagonalConnectorFromRaster } = require("../slideclone-core/routing/diagonal-connector-contours");
const { brightness, colorDistance, hexColor, isFiniteBox, pixelColor, rgbToHex, round, saturationProxy } = require('./worker-primitives');
const { isFiniteLineBox } = require('./worker-graphic-evidence');

function candidateMissingTargetDisappearedWithGlobalImprovement({ baselineQuality, candidateQuality }) {
  const before = baselineQuality?.metrics || {};
  const after = candidateQuality?.metrics || {};
  const pixelBefore = Number(before["pixel-diff-ratio"]);
  const pixelAfter = Number(after["pixel-diff-ratio"]);
  const missingBefore = Number(before["foreground-missing-ratio"]);
  const missingAfter = Number(after["foreground-missing-ratio"]);
  const deltaBefore = Number(before["mean-absolute-delta"]);
  const deltaAfter = Number(after["mean-absolute-delta"]);
  if (![pixelBefore, pixelAfter, missingBefore, missingAfter, deltaBefore, deltaAfter].every(Number.isFinite)) return false;
  if (pixelAfter >= pixelBefore - 0.00005) return false;
  if (missingAfter > missingBefore + 0.0002) return false;
  if (deltaAfter > deltaBefore + 0.02) return false;
  const attentionBefore = Number(before["component-regions-attention"]);
  const attentionAfter = Number(after["component-regions-attention"]);
  if (Number.isFinite(attentionBefore) && Number.isFinite(attentionAfter) && attentionAfter > attentionBefore) return false;
  return true;
}

function isReliableMissingNativeVisualAtom(atom) {
  const kind = String(atom?.kind || "");
  const confidence = Number(atom?.density ?? atom?.confidence);
  if (!Number.isFinite(confidence)) return false;
  if (kind === "connector-arrow-candidate") return confidence >= 0.58;
  if (kind === "connector-line-candidate") return confidence >= 0.58;
  if (kind === "grid-line-candidate") return confidence >= 0.68;
  return confidence >= 0.62;
}

function missingNativeTargetDiagonalShapes(target, source, slideSize) {
  const boxes = Array.isArray(target.sourceBoxes) && target.sourceBoxes.length ? target.sourceBoxes : [{ id: target.id, box: target.box }];
  return boxes.map(item => missingNativeSingleDiagonalShape({ ...target, id: item.id, sourceIds: [item.id] }, item.box, source, slideSize)).filter(Boolean);
}

function missingNativeSingleDiagonalShape(target, box, image, slideSize) {
  const contour = traceDiagonalConnectorFromRaster({ image, box, slideSize });
  if (!contour) return null;
  return { type: "freeform", box: contour.box,
    style: { fill: contour.color, stroke: "none", strokeWidthPt: 0, freeformSegments: contour.segments },
    source: { editable: true, nativeRebuild: true, detector: "missing-native-diagonal-connector-contour",
      componentQualityRole: "connector-straight", semanticNativeStructure: true,
      missingNativeComponentId: target.id, sourceMissingNativeComponentIds: target.sourceIds,
      diagonalConnectorEvidence: contour.evidence }
  };
}

function isSparseCurveEvidence(evidence) {
  if (!evidence || !isFiniteBox(evidence.box)) return false;
  const width = Number(evidence.box.w);
  const height = Number(evidence.box.h);
  const area = width * height;
  if (!Number.isFinite(area) || area < 800 || area > 25000) return false;
  if (width < 22 || height < 18) return false;
  const aspect = width / Math.max(1e-6, height);
  if (aspect < 0.45 || aspect > 2.8) return false;
  const density = Number(evidence.density);
  if (!Number.isFinite(density) || density < 0.025 || density > 0.18) return false;
  if (Number(evidence.pixelCount || 0) < 45) return false;
  const parsed = hexColor(evidence.color);
  return parsed && brightness(parsed) < 245 && saturationProxy(parsed) >= 28;
}

function missingNativeCurveFreeformShape(target, evidence, index) {
  const contour = evidence.connectorContour;
  if (!contour) return null;
  const color = evidence.color;
  return {
    type: "freeform",
    box: {
      x: round(Number(evidence.box.x)),
      y: round(Number(evidence.box.y)),
      w: round(Number(evidence.box.w)),
      h: round(Number(evidence.box.h))
    },
    points: contour.segments.flatMap((segment) => segment.points),
    style: {
      fill: color,
      stroke: "none",
      strokeWidthPt: 0,
      closePath: true,
      freeformSegments: contour.segments
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-curve-freeform-component",
      missingNativeComponentId: target.id,
      sourceMissingNativeComponentIds: Array.isArray(target.sourceIds) ? target.sourceIds.slice(0, 20) : [target.id].filter(Boolean),
      bundledVisualAtomCount: 1,
      componentQualityRole: "connector-curve",
      semanticNativeStructure: true,
      sourceContourTolerancePx: contour.tolerancePx,
      sourceContourPixels: contour.pixelCount,
      contourIndex: index + 1
    }
  };
}

function isMissingNativeBlobForeground(color, renderedColor = null) {
  const bright = brightness(color);
  const sat = saturationProxy(color);
  if (bright >= 248) return false;
  if (sat < 28) return false;
  if (renderedColor && colorDistance(color, renderedColor) < 28) return false;
  return bright < 242 || sat >= 40;
}

function averageBand(points, predicate) {
  return averagePoint(points.filter(predicate));
}

function averagePoint(points) {
  if (!Array.isArray(points) || points.length < 1) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function minBy(points, score) {
  return points.reduce((best, point) => !best || score(point) < score(best) ? point : best, null);
}

function maxBy(points, score) {
  return points.reduce((best, point) => !best || score(point) > score(best) ? point : best, null);
}

function convexHull(points) {
  const unique = [...new Map(points.map((point) => [`${round(point.x)}:${round(point.y)}`, { x: point.x, y: point.y }])).values()]
    .sort((left, right) => left.x - right.x || left.y - right.y);
  if (unique.length <= 3) return unique;
  const cross = (origin, left, right) => (left.x - origin.x) * (right.y - origin.y) - (left.y - origin.y) * (right.x - origin.x);
  const lower = [];
  for (const point of unique) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
    lower.push(point);
  }
  const upper = [];
  for (const point of unique.slice().reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
    upper.push(point);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function simplifyHullPoints(points, limit) {
  if (!Array.isArray(points) || points.length <= limit) return points || [];
  const cx = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const cy = points.reduce((sum, point) => sum + point.y, 0) / points.length;
  return points
    .map((point, index) => ({ point, index, distance: Math.hypot(point.x - cx, point.y - cy) }))
    .sort((left, right) => right.distance - left.distance)
    .slice(0, limit)
    .sort((left, right) => left.index - right.index)
    .map((entry) => entry.point);
}

function sampleMissingNativeLineColor(source, box, slideSize) {
  if (!source || !Buffer.isBuffer(source.rgba) || !isFiniteBox(box) || !slideSize) return null;
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return null;
  const left = Math.max(0, Math.floor((Number(box.x) - 0.5) * scaleX));
  const top = Math.max(0, Math.floor((Number(box.y) - 0.5) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(box.x) + Number(box.w) + 0.5) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(box.y) + Number(box.h) + 0.5) * scaleY));
  let r = 0; let g = 0; let b = 0; let count = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const offset = (y * source.width + x) * 4;
      const color = { r: source.rgba[offset], g: source.rgba[offset + 1], b: source.rgba[offset + 2] };
      const bright = brightness(color);
      const sat = saturationProxy(color);
      if (bright >= 245 && sat <= 18) continue;
      r += color.r; g += color.g; b += color.b; count += 1;
    }
  }
  if (count < 1) return null;
  return rgbToHex({ r: r / count, g: g / count, b: b / count });
}

function normalizedVisualAtomColor(color) {
  const value = typeof color === "string" && /^#[0-9a-fA-F]{6}$/u.test(color) ? color.toUpperCase() : "#6B7280";
  return value;
}

function similarVisualAtomColor(left, right) {
  if (left === right) return true;
  const leftColor = hexColor(left);
  const rightColor = hexColor(right);
  if (!leftColor || !rightColor) return false;
  return colorDistance(leftColor, rightColor) <= 48;
}

function curveBundleArea(shape) {
  return Math.abs(Number(shape?.box?.w || 0) * Number(shape?.box?.h || 0));
}

function isFiniteVisualAtomShapeBox(shape) {
  if (shape?.type === "line") return isFiniteLineBox(shape.box);
  return isFiniteBox(shape?.box);
}

function missingNativeVisualAtomOpenCurveShape(sourceLayer, atom, index) {
  if (!isFiniteBox(atom?.box)) return null;
  const kind = String(atom.kind || "");
  if (kind !== "connector-line-candidate" && kind !== "connector-arrow-candidate") return null;
  if (String(atom.shapeHint || "") !== "line-diagonal") return null;
  const box = atom.box;
  const width = Number(box.w);
  const height = Number(box.h);
  const density = Number(atom.density);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 18 || height < 12 || !Number.isFinite(density) || density > 0.22) return null;
  const color = atom.color || "#6B7280";
  const strokeWidthPt = Math.max(1.2, Math.min(4, Math.min(width, height) * Math.max(0.035, density * 0.18)));
  const upward = String(atom.curveDirection || "") === "up" || atom.lineEndpoints?.from?.y > atom.lineEndpoints?.to?.y;
  const bendY = upward ? 0.15 : 0.85;
  return {
    id: `${sourceLayer.id || "missing-native"}-visual-atom-open-curve-${index}`,
    type: "freeform",
    box: {
      x: round(Number(box.x)),
      y: round(Number(box.y)),
      w: round(width),
      h: round(height)
    },
    points: [
      { x: 0, y: upward ? 0.85 : 0.15 },
      { x: 0.32, y: bendY },
      { x: 0.68, y: bendY },
      { x: 1, y: upward ? 0.15 : 0.85 }
    ],
    style: {
      fill: "none",
      stroke: color,
      strokeWidthPt,
      closePath: false,
      lineCap: "round",
      ...(kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {}),
      freeformSegments: [
        { type: "moveTo", points: [{ x: 0, y: upward ? 0.85 : 0.15 }] },
        { type: "cubicBezTo", points: [{ x: 0.32, y: bendY }, { x: 0.68, y: bendY }, { x: 1, y: upward ? 0.15 : 0.85 }] }
      ]
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "missing-native-open-curve-component",
      layerSourceId: sourceLayer.id || null,
      layerType: sourceLayer.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      componentQualityRole: "connector-curve",
      semanticNativeStructure: true
    }
  };
}

function isLineLikeVisualAtom(atom) {
  const kind = String(atom?.kind || "");
  return kind === "grid-line-candidate" || kind === "connector-line-candidate" || kind === "connector-arrow-candidate";
}

function visualAtomMissingInRendered(atom, source, rendered, slideSize) {
  if (!isFiniteBox(atom?.box) || !source || !rendered || source.width !== rendered.width || source.height !== rendered.height || !slideSize) return true;
  const scaleX = source.width / Number(slideSize.widthPt);
  const scaleY = source.height / Number(slideSize.heightPt);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) return true;
  const left = Math.max(0, Math.floor(Number(atom.box.x) * scaleX));
  const top = Math.max(0, Math.floor(Number(atom.box.y) * scaleY));
  const right = Math.min(source.width, Math.ceil((Number(atom.box.x) + Number(atom.box.w)) * scaleX));
  const bottom = Math.min(source.height, Math.ceil((Number(atom.box.y) + Number(atom.box.h)) * scaleY));
  if (right <= left || bottom <= top) return true;
  let foreground = 0;
  let missing = 0;
  const stride = Math.max(1, Math.floor(Math.max(right - left, bottom - top) / 48));
  for (let y = top; y < bottom; y += stride) {
    for (let x = left; x < right; x += stride) {
      const sourceColor = pixelColor(source, x, y);
      if (brightness(sourceColor) >= 248 || saturationProxy(sourceColor) < 24) continue;
      foreground += 1;
      if (colorDistance(sourceColor, pixelColor(rendered, x, y)) >= 28) missing += 1;
    }
  }
  if (foreground < 4) return true;
  return missing / foreground >= 0.18;
}

function nativeOnlyMissingNativeTargetBudgets(targetCount) {
  const total = Number.isSafeInteger(targetCount) && targetCount > 0 ? targetCount : 24;
  return [...new Set([1, 2, 3, 4, 5, 6, 8, 12, total].filter((value) => value > 0 && value <= total))];
}

module.exports = { candidateMissingTargetDisappearedWithGlobalImprovement, isReliableMissingNativeVisualAtom, missingNativeTargetDiagonalShapes, missingNativeSingleDiagonalShape, isSparseCurveEvidence, missingNativeCurveFreeformShape, isMissingNativeBlobForeground, averageBand, averagePoint, minBy, maxBy, convexHull, simplifyHullPoints, sampleMissingNativeLineColor, normalizedVisualAtomColor, similarVisualAtomColor, curveBundleArea, isFiniteVisualAtomShapeBox, missingNativeVisualAtomOpenCurveShape, isLineLikeVisualAtom, visualAtomMissingInRendered, nativeOnlyMissingNativeTargetBudgets };
