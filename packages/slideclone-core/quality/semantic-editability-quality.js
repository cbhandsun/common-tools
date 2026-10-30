"use strict";
const { record } = require('../scene-plan/source-scene-group-containment');
const { isNativeRelationshipPath } = require('./native-relationship-path');

const MAX_PAGES = 50;
const MAX_OBJECTS_PER_PAGE = 20000;
const MAX_LARGE_RASTER_AREA_RATIO = 0.08;
const MIN_MOSAIC_RECT_COUNT = 32;
const MAX_MOSAIC_RECT_AREA_RATIO = 0.0004;

function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function finiteBox(value) { return isRecord(value) && [value.x, value.y, value.w, value.h].every(Number.isFinite) && value.w > 0 && value.h > 0; }
function slideArea(deck) {
  const width = Number(deck?.slideSize?.widthPt);
  const height = Number(deck?.slideSize?.heightPt);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new TypeError("semantic editability slide size is invalid");
  return width * height;
}
function boxAreaRatio(box, area) { return finiteBox(box) ? Math.min(1, box.w * box.h / area) : 0; }
function boxRect(box) {
  return finiteBox(box) ? { x1: box.x, y1: box.y, x2: box.x + box.w, y2: box.y + box.h } : null;
}
function unionArea(rects) {
  const valid = rects.filter(Boolean).filter((rect) => rect.x2 > rect.x1 && rect.y2 > rect.y1);
  if (valid.length < 1) return 0;
  const xs = [...new Set(valid.flatMap((rect) => [rect.x1, rect.x2]))].sort((a, b) => a - b);
  let area = 0;
  for (let i = 0; i < xs.length - 1; i += 1) {
    const x1 = xs[i];
    const x2 = xs[i + 1];
    if (!(x2 > x1)) continue;
    const intervals = valid
      .filter((rect) => rect.x1 < x2 && rect.x2 > x1)
      .map((rect) => [rect.y1, rect.y2])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let covered = 0;
    let currentStart = null;
    let currentEnd = null;
    for (const [start, end] of intervals) {
      if (currentStart === null) {
        currentStart = start;
        currentEnd = end;
      } else if (start <= currentEnd) {
        currentEnd = Math.max(currentEnd, end);
      } else {
        covered += currentEnd - currentStart;
        currentStart = start;
        currentEnd = end;
      }
    }
    if (currentStart !== null) covered += currentEnd - currentStart;
    area += (x2 - x1) * covered;
  }
  return area;
}
function lineageKey(item) {
  const source = isRecord(item?.source) ? item.source : {};
  for (const key of ["lineageId", "parentRasterId", "parentLargeRasterId", "sourceAssetSha256", "pageImage"]) {
    if (typeof source[key] === "string" && source[key]) return `${key}:${source[key]}`;
  }
  if (typeof item?.assetPath === "string" && item.assetPath) return `asset:${item.assetPath}`;
  return typeof item?.id === "string" && item.id ? `id:${item.id}` : "unknown";
}
function isRasterDerivedPrimitive(shape) {
  const source = isRecord(shape?.source) ? shape.source : {};
  const detector = typeof source.detector === "string" ? source.detector : "";
  const id = typeof shape?.id === "string" ? shape.id : "";
  const qualityIgnored = source.componentQualityIgnore === true;
  return source.componentQualityIgnore === true
    && (detector === "native-residual-primitive-rect"
      || detector === "text-fidelity-native-primitive"
      || detector === "component-fidelity-native-primitive"
      || id.startsWith("native-residual-")
      || id.startsWith("text-fidelity-native-run-")
      || id.startsWith("component-fidelity-native-run-")
      || (qualityIgnored && detector === "" && shape?.type === "rect"));
}
function isSuspiciousRasterMosaicRect(shape, slideAreaValue) {
  if (!isRecord(shape) || shape.type !== "rect" || !finiteBox(shape.box)) return false;
  if (boxAreaRatio(shape.box, slideAreaValue) > MAX_MOSAIC_RECT_AREA_RATIO) return false;
  const source = isRecord(shape.source) ? shape.source : {};
  if (source.nativeRebuild === true && typeof source.detector === "string" && !/primitive|residual|fidelity|pixel/u.test(source.detector)) return false;
  const style = isRecord(shape.style) ? shape.style : {};
  const stroke = typeof style.stroke === "string" ? style.stroke.toLowerCase() : "";
  const strokeWidthPt = Number(style.strokeWidthPt);
  const fill = typeof style.fill === "string" ? style.fill : "";
  return fill.length > 0 && (stroke === "" || stroke === "none" || strokeWidthPt === 0);
}
function isReconstructionImage(image) {
  const source = isRecord(image?.source) ? image.source : {};
  return source.fullSlideResidual === true
    || source.residualCrop === true
    || source.tiledLargeRaster === true
    || source.visualFallbackSource === true
    || source.detector === "foreground-graphic-crop"
    || source.strategy === "local-fidelity-crop";
}
function isUnverifiedCrop(image) {
  const source = isRecord(image?.source) ? image.source : {};
  return source.protectedMinimumUnit === true && source.cropEvidenceRequired !== true;
}
function auditSemanticEditability(deck, options = {}) {
  if (!record(options) || Object.keys(options).some(key => key !== 'relationshipEditing')
    || options.relationshipEditing !== undefined && !['node-rerouting', 'native-path'].includes(options.relationshipEditing)) throw new TypeError('semantic relationship editing policy is invalid');
  const relationshipEditing = options.relationshipEditing ?? 'node-rerouting';
  if (!isRecord(deck) || !Array.isArray(deck.pages) || deck.pages.length < 1 || deck.pages.length > MAX_PAGES) throw new TypeError("semantic editability deck is invalid");
  const area = slideArea(deck);
  const findings = [];
  const rasterLineages = new Map();
  let rasterDerivedPrimitiveCount = 0;
  let unverifiedCropCount = 0;
  let largeRasterLineageCount = 0;
  let missingRasterProvenanceCount = 0;
  let suspiciousMosaicCount = 0;
  let duplicateObjectIdCount = 0;
  let fixedRelationshipPaintCount = 0;
  let nativePathRelationshipCount = 0;
  let nonReroutableRelationshipCount = 0;
  for (const [pageIndex, page] of deck.pages.entries()) {
    if (!isRecord(page)) throw new TypeError(`semantic editability page ${pageIndex + 1} is invalid`);
    const shapes = Array.isArray(page.shapes) ? page.shapes : [];
    const images = Array.isArray(page.images) ? page.images : [];
    const otherCollections = [page.textBoxes, page.tables, page.charts, page.icons].map(items => Array.isArray(items) ? items : []);
    if (shapes.length + images.length + otherCollections.reduce((sum, items) => sum + items.length, 0) > MAX_OBJECTS_PER_PAGE) throw new RangeError(`semantic editability page ${pageIndex + 1} exceeds the object limit`);
    const otherObjects = otherCollections.flat();
    const objectIds = new Set();
    const objects = new Map();
    for (const item of [...shapes, ...images, ...otherObjects]) {
      if (!isRecord(item) || typeof item.id !== "string" || !item.id) continue;
      const rows = objects.get(item.id) ?? []; rows.push(item); objects.set(item.id, rows);
      if (objectIds.has(item.id)) {
        duplicateObjectIdCount++;
        if (findings.length < 100) findings.push({ code: "duplicate-object-identity", pageIndex });
      }
      objectIds.add(item.id);
    }
    const mosaicRects = [];
    for (const shape of shapes) {
      if (!isRecord(shape)) throw new TypeError(`semantic editability shape on page ${pageIndex + 1} is invalid`);
      // A filled route contour stays fixed when an endpoint moves. Native short
      // links attached to that contour do not make its shaft or arrow editable.
      // The detector survives quality compaction; editable flags are not proof.
      // Approval permits a bounded approximation; its output still has to
      // satisfy the selected editing policy with actual geometry and anchors.
      if (shape.type === "freeform" && isRecord(shape.source) && ["source-scene-route", "source-shared-route", "approved-native-route-approximation"].includes(shape.source.detector)) {
        nonReroutableRelationshipCount++;
        if (relationshipEditing === 'native-path' && isNativeRelationshipPath(shape, objects)) nativePathRelationshipCount++;
        else {
          fixedRelationshipPaintCount++;
          if (findings.length < 100) findings.push({ code: "fixed-relationship-paint", pageIndex, elementId: shape.id ?? null });
        }
      }
      if (isRasterDerivedPrimitive(shape)) {
        rasterDerivedPrimitiveCount += 1;
        if (findings.length < 100) findings.push({ code: "raster-derived-primitive", pageIndex, elementId: shape.id ?? null });
      } else if (isSuspiciousRasterMosaicRect(shape, area)) {
        mosaicRects.push(shape);
      }
    }
    if (mosaicRects.length >= MIN_MOSAIC_RECT_COUNT) {
      suspiciousMosaicCount += mosaicRects.length;
      if (findings.length < 100) findings.push({ code: "suspicious-raster-mosaic", pageIndex, count: mosaicRects.length });
    }
    for (const image of images) {
      if (!isRecord(image)) throw new TypeError(`semantic editability image on page ${pageIndex + 1} is invalid`);
      if (isUnverifiedCrop(image)) {
        unverifiedCropCount += 1;
        if (findings.length < 100) findings.push({ code: "unverified-minimum-unit-crop", pageIndex, elementId: image.id ?? null });
      }
      if (!isReconstructionImage(image)) continue;
      const rect = boxRect(image.box);
      const key = `${pageIndex}:${lineageKey(image)}`;
      const lineage = rasterLineages.get(key) || [];
      lineage.push(rect);
      rasterLineages.set(key, lineage);
      const source = isRecord(image.source) ? image.source : {};
      if (!source.lineageId && !source.parentRasterId && !source.parentLargeRasterId && !source.sourceAssetSha256 && !source.pageImage && !image.assetPath) {
        missingRasterProvenanceCount += 1;
        if (findings.length < 100) findings.push({ code: "raster-provenance-missing", pageIndex, elementId: image.id ?? null });
      }
    }
  }
  for (const [key, rects] of rasterLineages.entries()) {
    const ratio = Math.min(1, unionArea(rects) / area);
    if (ratio < MAX_LARGE_RASTER_AREA_RATIO) continue;
    largeRasterLineageCount += 1;
    if (findings.length < 100) findings.push({ code: "large-raster-lineage", lineageId: key, areaRatio: Math.min(1, ratio) });
  }
  const checks = Object.freeze([
    Object.freeze({ name: "semantic-raster-derived-primitives", passed: rasterDerivedPrimitiveCount === 0 }),
    Object.freeze({ name: "semantic-unverified-crops", passed: unverifiedCropCount === 0 }),
    Object.freeze({ name: "semantic-large-raster-lineage", passed: largeRasterLineageCount === 0 }),
    Object.freeze({ name: "semantic-raster-provenance", passed: missingRasterProvenanceCount === 0 }),
    Object.freeze({ name: "semantic-suspicious-raster-mosaic", passed: suspiciousMosaicCount === 0 }),
    Object.freeze({ name: "semantic-object-identities", passed: duplicateObjectIdCount === 0 }),
    Object.freeze({ name: "semantic-fixed-relationship-paint", passed: fixedRelationshipPaintCount === 0 }),
  ]);
  return Object.freeze({
    passed: checks.every((check) => check.passed),
    checks,
    metrics: Object.freeze({ rasterDerivedPrimitiveCount, unverifiedCropCount, largeRasterLineageCount, missingRasterProvenanceCount, suspiciousMosaicCount, duplicateObjectIdCount, fixedRelationshipPaintCount, nativePathRelationshipCount, nonReroutableRelationshipCount, findings: findings.length }),
    // This audit reads IR only. An absent fixed path cannot prove that Office
    // moves complete nodes, reroutes their connectors, or preserves a reopen.
    relationshipEditing: Object.freeze({ required: relationshipEditing,
      basis: 'compiled-ir-structure-only',
      containsOnlyReroutableRepresentations: nonReroutableRelationshipCount === 0,
      nodeMoveRerouting: nonReroutableRelationshipCount === 0 ? null : false,
      nodeFollowingVerification: 'not-assessed' }),
    findings: Object.freeze(findings.map(Object.freeze)),
  });
}

module.exports = { auditSemanticEditability };
