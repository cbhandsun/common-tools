"use strict";

const crypto = require("node:crypto");

const COLLECTIONS = new Set(["textBoxes", "shapes", "images", "tables", "charts", "icons"]);
const SAFE_ID = /^[A-Za-z0-9._:-]{1,160}$/;
const COLOR = /^(?:#[0-9A-Fa-f]{6}|#[0-9A-Fa-f]{8}|none|transparent)$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function applyReviewPatches(ir, patches, options = {}) {
  assertPlainObject(ir, "IR");
  if (!Array.isArray(patches) || patches.length === 0 || patches.length > 200) {
    throw new ReviewPatchError("patches must contain 1 to 200 operations");
  }
  rejectDangerousKeys(patches, "patches");
  const normalized = patches.map((patch, index) => validatePatch(patch, ir, index));
  rejectDuplicateOperations(normalized);

  const next = cloneJson(ir);
  for (const patch of normalized) applyPatch(next, patch);
  if (typeof options.validateIr === "function") {
    const result = options.validateIr(next, {
      ...(isPlainObject(options.validateOptions) ? options.validateOptions : {}),
      allowManualRequired: options.allowManualRequired === true
    });
    if (result && result.ok === false) throw new ReviewPatchError(`patched IR is invalid: ${(result.errors || []).slice(0, 5).join("; ")}`);
  }
  return {
    ir: next,
    audit: normalized.map((patch) => ({
      operationId: patch.operationId,
      pageIndex: patch.pageIndex,
      collection: patch.collection,
      elementId: patch.elementId,
      fields: Object.keys(patch.changes).sort()
    }))
  };
}

function validatePatch(value, ir, index) {
  const label = `patches[${index}]`;
  assertPlainObject(value, label);
  const allowed = new Set(["operationId", "pageIndex", "collection", "elementId", "changes"]);
  rejectUnknownKeys(value, allowed, label);
  const operationId = optionalSafeId(value.operationId, `${label}.operationId`) || crypto.randomUUID();
  if (!Number.isSafeInteger(value.pageIndex) || value.pageIndex < 0 || value.pageIndex > 100000) {
    throw new ReviewPatchError(`${label}.pageIndex must be a non-negative safe integer`);
  }
  if (!COLLECTIONS.has(value.collection)) throw new ReviewPatchError(`${label}.collection is not editable`);
  const elementId = requiredSafeId(value.elementId, `${label}.elementId`);
  const page = findPage(ir, value.pageIndex);
  const item = findItem(page, value.collection, elementId);
  const changes = validateChanges(value.changes, value.collection, ir.slideSize, label);
  if (!item) throw new ReviewPatchError(`${label} target does not exist`);
  return { operationId, pageIndex: value.pageIndex, collection: value.collection, elementId, changes };
}

function validateChanges(value, collection, slideSize, label) {
  assertPlainObject(value, `${label}.changes`);
  const allowed = new Set(["box", "text", "font", "style", "review"]);
  rejectUnknownKeys(value, allowed, `${label}.changes`);
  const keys = Object.keys(value);
  if (keys.length === 0) throw new ReviewPatchError(`${label}.changes must not be empty`);
  const changes = {};
  if (Object.hasOwn(value, "box")) changes.box = validateBox(value.box, slideSize, `${label}.changes.box`);
  if (Object.hasOwn(value, "text")) {
    if (collection !== "textBoxes") throw new ReviewPatchError(`${label}.changes.text is only valid for textBoxes`);
    changes.text = boundedText(value.text, 20000, `${label}.changes.text`);
  }
  if (Object.hasOwn(value, "font")) {
    if (collection !== "textBoxes") throw new ReviewPatchError(`${label}.changes.font is only valid for textBoxes`);
    changes.font = validateFont(value.font, `${label}.changes.font`);
  }
  if (Object.hasOwn(value, "style")) changes.style = validateStyle(value.style, `${label}.changes.style`);
  if (Object.hasOwn(value, "review")) changes.review = validateReview(value.review, `${label}.changes.review`);
  return changes;
}

function validateBox(value, slideSize, label) {
  assertPlainObject(value, label);
  rejectUnknownKeys(value, new Set(["x", "y", "w", "h"]), label);
  if (Object.keys(value).length === 0) throw new ReviewPatchError(`${label} must not be empty`);
  const width = positiveFinite(slideSize?.widthPt, 960);
  const height = positiveFinite(slideSize?.heightPt, 540);
  const out = {};
  for (const key of Object.keys(value)) {
    const number = value[key];
    if (!Number.isFinite(number)) throw new ReviewPatchError(`${label}.${key} must be finite`);
    if ((key === "w" || key === "h") && number <= 0) throw new ReviewPatchError(`${label}.${key} must be greater than zero`);
    const limit = key === "x" || key === "w" ? width * 4 : height * 4;
    if (number < -limit || number > limit) throw new ReviewPatchError(`${label}.${key} exceeds the safe canvas boundary`);
    out[key] = number;
  }
  return out;
}

function validateFont(value, label) {
  assertPlainObject(value, label);
  rejectUnknownKeys(value, new Set(["family", "sizePt", "weight", "color", "align"]), label);
  if (Object.keys(value).length === 0) throw new ReviewPatchError(`${label} must not be empty`);
  const out = {};
  if (Object.hasOwn(value, "family")) out.family = boundedText(value.family, 128, `${label}.family`, false);
  if (Object.hasOwn(value, "sizePt")) out.sizePt = boundedNumber(value.sizePt, 0.5, 400, `${label}.sizePt`);
  if (Object.hasOwn(value, "weight")) {
    const weight = String(value.weight);
    if (!/^(?:normal|bold|[1-9]00)$/.test(weight)) throw new ReviewPatchError(`${label}.weight is invalid`);
    out.weight = weight;
  }
  if (Object.hasOwn(value, "color")) out.color = validColor(value.color, `${label}.color`);
  if (Object.hasOwn(value, "align")) {
    if (!["left", "center", "right", "justify"].includes(value.align)) throw new ReviewPatchError(`${label}.align is invalid`);
    out.align = value.align;
  }
  return out;
}

function validateStyle(value, label) {
  assertPlainObject(value, label);
  rejectUnknownKeys(value, new Set(["fill", "stroke", "strokeWidthPt", "opacity", "rotationDeg"]), label);
  if (Object.keys(value).length === 0) throw new ReviewPatchError(`${label} must not be empty`);
  const out = {};
  if (Object.hasOwn(value, "fill")) out.fill = validColor(value.fill, `${label}.fill`);
  if (Object.hasOwn(value, "stroke")) out.stroke = validColor(value.stroke, `${label}.stroke`);
  if (Object.hasOwn(value, "strokeWidthPt")) out.strokeWidthPt = boundedNumber(value.strokeWidthPt, 0, 100, `${label}.strokeWidthPt`);
  if (Object.hasOwn(value, "opacity")) out.opacity = boundedNumber(value.opacity, 0, 1, `${label}.opacity`);
  if (Object.hasOwn(value, "rotationDeg")) out.rotationDeg = boundedNumber(value.rotationDeg, -3600, 3600, `${label}.rotationDeg`);
  return out;
}

function validateReview(value, label) {
  assertPlainObject(value, label);
  rejectUnknownKeys(value, new Set(["note", "status"]), label);
  if (Object.keys(value).length === 0) throw new ReviewPatchError(`${label} must not be empty`);
  const out = {};
  if (Object.hasOwn(value, "note")) out.note = boundedText(value.note, 5000, `${label}.note`);
  if (Object.hasOwn(value, "status")) {
    if (!["open", "accepted", "needs-work", "resolved"].includes(value.status)) throw new ReviewPatchError(`${label}.status is invalid`);
    out.status = value.status;
  }
  return out;
}

function applyPatch(ir, patch) {
  const page = findPage(ir, patch.pageIndex);
  const item = findItem(page, patch.collection, patch.elementId);
  if (patch.changes.box) item.box = { ...item.box, ...patch.changes.box };
  if (Object.hasOwn(patch.changes, "text")) item.text = patch.changes.text;
  if (patch.changes.font) item.font = { ...(isPlainObject(item.font) ? item.font : {}), ...patch.changes.font };
  if (patch.changes.style) item.style = { ...(isPlainObject(item.style) ? item.style : {}), ...patch.changes.style };
  if (patch.changes.review) item.review = { ...(isPlainObject(item.review) ? item.review : {}), ...patch.changes.review };
}

function rejectDuplicateOperations(patches) {
  const operationIds = new Set();
  const targets = new Set();
  for (const patch of patches) {
    if (operationIds.has(patch.operationId)) throw new ReviewPatchError(`duplicate operationId: ${patch.operationId}`);
    operationIds.add(patch.operationId);
    for (const field of Object.keys(patch.changes)) {
      const key = `${patch.pageIndex}\u0000${patch.collection}\u0000${patch.elementId}\u0000${field}`;
      if (targets.has(key)) throw new ReviewPatchError(`duplicate patch target for ${patch.elementId}.${field}`);
      targets.add(key);
    }
  }
}

function rejectDangerousKeys(value, label, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) throw new ReviewPatchError(`${label} contains a forbidden key`);
    rejectDangerousKeys(value[key], `${label}.${key}`, seen);
  }
}

function rejectUnknownKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ReviewPatchError(`${label}.${key} is not editable`);
}

function findPage(ir, pageIndex) {
  return (Array.isArray(ir.pages) ? ir.pages : []).find((page) => page?.pageIndex === pageIndex);
}

function findItem(page, collection, elementId) {
  return (Array.isArray(page?.[collection]) ? page[collection] : []).find((item) => item?.id === elementId);
}

function assertPlainObject(value, label) {
  if (!isPlainObject(value)) throw new ReviewPatchError(`${label} must be a plain object`);
}

function requiredSafeId(value, label) {
  if (typeof value !== "string" || !SAFE_ID.test(value)) throw new ReviewPatchError(`${label} is invalid`);
  return value;
}

function optionalSafeId(value, label) {
  if (value === undefined) return "";
  return requiredSafeId(value, label);
}

function boundedText(value, maxLength, label, allowEmpty = true) {
  if (typeof value !== "string" || value.length > maxLength || (!allowEmpty && value.trim().length === 0) || /[\u0000\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(value)) {
    throw new ReviewPatchError(`${label} is invalid or exceeds ${maxLength} characters`);
  }
  return value;
}

function validColor(value, label) {
  if (typeof value !== "string" || !COLOR.test(value)) throw new ReviewPatchError(`${label} must be #RRGGBB, #RRGGBBAA, none, or transparent`);
  return value;
}

function boundedNumber(value, min, max, label) {
  if (!Number.isFinite(value) || value < min || value > max) throw new ReviewPatchError(`${label} must be between ${min} and ${max}`);
  return value;
}

function positiveFinite(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

class ReviewPatchError extends Error {
  constructor(message) {
    super(message);
    this.name = "ReviewPatchError";
  }
}

module.exports = {
  ReviewPatchError,
  applyReviewPatches,
  rejectDangerousKeys,
  validatePatch
};
