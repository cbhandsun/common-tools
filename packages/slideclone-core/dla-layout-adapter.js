// @ts-check
"use strict";

const { ptBoxOverlapAreaValue, boxCenterInside } = require("./diagram-geometry");
const { assertBox, computeEnvelope } = require("./layout-constraint-solver");

/**
 * Supported standard DLA semantic region labels.
 */
const DLA_REGION_LABELS = Object.freeze([
  "title",
  "subtitle",
  "header",
  "table",
  "process_flow",
  "metric_card",
  "matrix",
  "diagram",
  "image",
  "footer",
  "paragraph",
  "unknown"
]);
const MAX_DLA_REGIONS = 200;

/**
 * @typedef {Object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} DlaRegion
 * @property {string} id
 * @property {string} label
 * @property {number} confidence
 * @property {Box} box
 */

/**
 * @typedef {Object} SemanticLayoutNode
 * @property {string} id
 * @property {string} role
 * @property {Box} box
 * @property {readonly unknown[]} items
 */

/**
 * Validate and normalize a DLA predicted region.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {DlaRegion}
 */
function assertDlaRegion(value, label = "DLA region") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "dla_region";
  const rawLabel = typeof raw.label === "string" ? raw.label.trim().toLowerCase() : "unknown";
  const regionLabel = DLA_REGION_LABELS.includes(rawLabel) ? rawLabel : "unknown";
  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new TypeError(`${label}.confidence must be a number between 0 and 1`);
  }

  const rawBox = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
  const x = Number(rawBox.x);
  const y = Number(rawBox.y);
  const w = Number(rawBox.w);
  const h = Number(rawBox.h);

  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
    throw new TypeError(`${label}.box coordinates and dimensions must be positive finite numbers`);
  }

  return Object.freeze({
    id,
    label: regionLabel,
    confidence: Math.round(confidence * 1000) / 1000,
    box: Object.freeze({ x, y, w, h })
  });
}

/**
 * Normalize a list of DLA regions and enforce IDs that are safe to use as map keys.
 * @param {readonly unknown[]} value
 * @returns {readonly DlaRegion[]}
 */
function normalizeDlaRegions(value) {
  if (!Array.isArray(value)) throw new TypeError("dlaRegions must be an array");
  if (value.length > MAX_DLA_REGIONS) throw new RangeError(`dlaRegions cannot contain more than ${MAX_DLA_REGIONS} regions`);
  const seen = new Set();
  return Object.freeze(value.map((item, index) => {
    const region = assertDlaRegion(withDefaultRegionId(item, index), `dlaRegions[${index}]`);
    if (!/^[a-zA-Z0-9_.:-]{1,128}$/.test(region.id)) throw new TypeError(`dlaRegions[${index}].id must be a simple identifier`);
    if (seen.has(region.id)) throw new Error("duplicate DLA region id");
    seen.add(region.id);
    return region;
  }));
}

/**
 * @param {unknown} value
 * @param {number} index
 * @returns {unknown}
 */
function withDefaultRegionId(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (typeof raw.id === "string" && raw.id.trim()) return value;
  return Object.freeze({ ...raw, id: `dla_region_${index + 1}` });
}

/**
 * Associate OCR text boxes with DLA regions using geometric overlap and center containment.
 * @param {readonly unknown[]} dlaRegions
 * @param {readonly unknown[]} textBoxes
 * @returns {{ assigned: Map<string, unknown[]>, unassigned: unknown[] }}
 */
function associateTextWithDlaRegions(dlaRegions, textBoxes) {
  if (!Array.isArray(textBoxes)) throw new TypeError("textBoxes must be an array");

  const regions = normalizeDlaRegions(dlaRegions);
  const assigned = new Map();
  for (const r of regions) {
    assigned.set(r.id, []);
  }

  /** @type {unknown[]} */
  const unassigned = [];

  for (const tb of textBoxes) {
    if (!tb || typeof tb !== "object" || Array.isArray(tb)) continue;
    const raw = /** @type {Record<string, unknown>} */ (tb);
    const box = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) continue;

    let bestRegionId = null;
    let maxOverlap = 0;

    for (const region of regions) {
      // 1. Center inside check
      if (boxCenterInside({ x, y, w, h }, region.box)) {
        bestRegionId = region.id;
        break;
      }

      // 2. Overlap area check
      const overlap = ptBoxOverlapAreaValue({ x, y, w, h }, region.box);
      const textArea = w * h;
      const overlapRatio = overlap / Math.max(1, textArea);

      if (overlapRatio > 0.4 && overlapRatio > maxOverlap) {
        maxOverlap = overlapRatio;
        bestRegionId = region.id;
      }
    }

    if (bestRegionId) {
      const list = assigned.get(bestRegionId);
      if (list) list.push(tb);
    } else {
      unassigned.push(tb);
    }
  }

  return { assigned, unassigned };
}

/**
 * Synthesize a reading-order sorted semantic AST from DLA regions and associated text items.
 * @param {readonly unknown[]} dlaRegions
 * @param {readonly unknown[]} textBoxes
 * @returns {readonly SemanticLayoutNode[]}
 */
function synthesizeSemanticLayoutTree(dlaRegions, textBoxes) {
  const { assigned, unassigned } = associateTextWithDlaRegions(dlaRegions, textBoxes);
  const regions = normalizeDlaRegions(dlaRegions);

  // Sort regions by reading order: primarily vertical (Y), then horizontal (X)
  const sortedRegions = [...regions].sort((a, b) => {
    const yDiff = a.box.y - b.box.y;
    if (Math.abs(yDiff) > 20) return yDiff;
    return a.box.x - b.box.x;
  });

  /** @type {SemanticLayoutNode[]} */
  const tree = sortedRegions.map((r) => {
    const items = assigned.get(r.id) || [];
    return Object.freeze({
      id: r.id,
      role: r.label,
      box: r.box,
      items: Object.freeze([...items])
    });
  });

  // If there are unassigned items, group them into a synthetic body/fallback node
  if (unassigned.length > 0) {
    const unassignedBoxes = [];
    for (const item of unassigned) {
      const raw = /** @type {Record<string, unknown>} */ (item);
      const box = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
      try {
        const normalized = assertBox(box, "unassigned text box");
        if (normalized.w > 0 && normalized.h > 0) unassignedBoxes.push(normalized);
      } catch {
        // Invalid text boxes were deliberately not assigned; do not synthesize geometry for them.
      }
    }
    if (unassignedBoxes.length > 0) {
      const envelope = computeEnvelope(unassignedBoxes);
      tree.push(Object.freeze({
        id: "unassigned_region",
        role: "unknown",
        box: Object.freeze(envelope),
        items: Object.freeze([...unassigned])
      }));
    }
  }

  return Object.freeze(tree);
}

module.exports = {
  DLA_REGION_LABELS,
  MAX_DLA_REGIONS,
  assertDlaRegion,
  associateTextWithDlaRegions,
  normalizeDlaRegions,
  synthesizeSemanticLayoutTree
};
