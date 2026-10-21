// @ts-check
"use strict";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} row */
function isSpatialMissingComponent(row) {
  return record(row) && row.kind === "missing" && row.role === "missing-native-component"
    && record(row.source) && row.source.detector === "missing-native-component-quality";
}

/** @typedef {{pageIndex: number, severity: number, box: {x: number, y: number, w: number, h: number}}} Region */

/** @param {unknown} value @returns {Region | null} */
function parseRegion(value) {
  if (!record(value) || !record(value.box)) return null;
  const { pageIndex, severity } = value;
  const { x, y, w, h } = value.box;
  if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex >= 50
    || typeof severity !== "number" || !Number.isFinite(severity) || severity < 0 || severity > 10
    || typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number"
    || ![x, y, w, h].every(Number.isFinite) || x < 0 || y < 0 || w <= 0 || h <= 0
    || x + w > 100000 || y + h > 100000) return null;
  return { pageIndex, severity, box: { x, y, w, h } };
}

/** @param {unknown} rows @returns {Region[] | null} */
function parseRegions(rows) {
  if (rows === undefined) return [];
  if (!Array.isArray(rows) || rows.length > 20000) return null;
  /** @type {Region[]} */
  const result = [];
  for (const row of rows) {
    if (!isSpatialMissingComponent(row)) continue;
    const parsed = parseRegion(row);
    if (!parsed || result.length >= 80) return null;
    result.push(parsed);
  }
  return result;
}

/** @param {Region} before @param {Region} after */
function spatialOverlap(before, after) {
  if (before.pageIndex !== after.pageIndex) return 0;
  const a = before.box, b = after.box;
  const area = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x))
    * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return area / Math.max(1e-9, Math.min(a.w * a.h, b.w * b.h));
}

/** @param {unknown} quality @returns {(Region & {id:string,kind:string,role:string})[]} */
function missingReferenceRegions(quality) {
  if (!record(quality)) throw new TypeError("missing-component reference quality is invalid");
  const rows = quality.componentReferenceMetrics;
  const regions = rows === undefined ? parseRegions(quality.componentWorst)
    : Array.isArray(rows) && rows.length <= 80 ? rows.map(parseRegion) : null;
  if (!regions || regions.some(region => !region)) throw new TypeError("missing-component reference regions are invalid");
  return regions.map((region, index) => {
    if (!region) throw new TypeError("missing-component reference regions are invalid");
    return { ...region, id: `fixed-missing-reference-${index}`, kind: "missing", role: "missing-native-component" };
  });
}

/** @param {Region} a @param {Region} b */
function sameReference(a, b) {
  return a.pageIndex === b.pageIndex && a.box.x === b.box.x && a.box.y === b.box.y && a.box.w === b.box.w && a.box.h === b.box.h;
}

/** @param {unknown} beforeRows @param {unknown} afterRows @param {unknown} [referenceRows] @param {unknown} [beforeReferenceRows] */
function sharedMissingComponentRegression(beforeRows, afterRows, referenceRows, beforeReferenceRows) {
  const before = parseRegions(beforeRows), after = parseRegions(afterRows);
  if (!before || !after) return Number.POSITIVE_INFINITY;
  let regression = 0;
  if (referenceRows !== undefined) {
    if (!Array.isArray(referenceRows) || referenceRows.length > 80) return Infinity;
    const references = referenceRows.map(parseRegion);
    if (references.some(region => !region)) return Infinity;
    const fixedBefore = beforeReferenceRows === undefined ? before : Array.isArray(beforeReferenceRows) && beforeReferenceRows.length <= 80
      ? beforeReferenceRows.map(parseRegion) : null;
    if (!fixedBefore || fixedBefore.some(region => !region)) return Infinity;
    if (before.length > 0 && fixedBefore.length === 0) return Infinity;
    if (references.length !== fixedBefore.length) return Infinity;
    for (const baseline of fixedBefore) {
      if (!baseline) return Infinity;
      const matches = references.filter(region => region && sameReference(baseline, region));
      if (matches.length !== 1) return Infinity;
      const reference = matches[0];
      if (!reference) return Infinity;
      regression = Math.max(regression, reference.severity - baseline.severity);
    }
    return regression;
  }
  // These IDs are per-render size ranks, not persistent component identities.
  for (const candidate of after) {
    const matches = before.map(region => ({ region, overlap: spatialOverlap(region, candidate) }))
      .filter(match => match.overlap >= 0.6);
    if (matches.length === 0) continue;
    const strongestOverlap = Math.max(...matches.map(match => match.overlap));
    const sameRegion = matches.filter(match => match.overlap >= strongestOverlap - 1e-9);
    const baselineSeverity = Math.min(...sameRegion.map(match => match.region.severity));
    regression = Math.max(regression, candidate.severity - baselineSeverity);
  }
  return regression;
}

module.exports = { isSpatialMissingComponent, sharedMissingComponentRegression, missingReferenceRegions };
