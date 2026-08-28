"use strict";

const { containsControlCharacter } = require("../capability-contracts");

const SPEC_VERSION = "1.0";
const MAX_SPEC_BYTES = 1024 * 1024;
const MAX_SLIDES = 100;
const MAX_ITEMS = 8;
const ROLES = Object.freeze(["cover", "section", "content", "metrics", "comparison", "process", "closing"]);
const THEMES = Object.freeze(["clean-light-v1", "executive-dark-v1"]);
const PLACEHOLDER_PATTERN = /(?:请输入|待补充|lorem ipsum|placeholder|todo|tbd)/iu;

function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, allowed, label) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new TypeError(`${label} contains unsupported fields`);
}
function boundedString(value, label, { maximum, optional = false } = {}) {
  if (value === undefined && optional) return undefined;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = value.replace(/\r\n?/gu, "\n").trim();
  if (!normalized || normalized.length > maximum || containsControlCharacter(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}
function optionalString(value, label, maximum) { return boundedString(value, label, { maximum, optional: true }); }
function normalizedId(value, fallback, label) {
  const id = value === undefined ? fallback : boundedString(value, label, { maximum: 80 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u.test(id)) throw new TypeError(`${label} is invalid`);
  return id;
}
function normalizedItem(value, slideIndex, itemIndex) {
  if (!plainObject(value)) throw new TypeError(`slide ${slideIndex + 1} item ${itemIndex + 1} must be an object`);
  exactKeys(value, ["id", "label", "value", "detail", "required"], `slide ${slideIndex + 1} item ${itemIndex + 1}`);
  return Object.freeze({
    id: normalizedId(value.id, `item-${itemIndex + 1}`, `slide ${slideIndex + 1} item id`),
    label: boundedString(value.label, `slide ${slideIndex + 1} item label`, { maximum: 80 }),
    ...(value.value === undefined ? {} : { value: boundedString(value.value, `slide ${slideIndex + 1} item value`, { maximum: 40 }) }),
    ...(value.detail === undefined ? {} : { detail: boundedString(value.detail, `slide ${slideIndex + 1} item detail`, { maximum: 240 }) }),
    required: value.required === undefined ? true : value.required === true
  });
}
function validateRoleCapacity(role, items, slideIndex) {
  const bounds = {
    cover: [0, 0], section: [0, 3], content: [1, 6], metrics: [2, 4],
    comparison: [2, 2], process: [2, 6], closing: [0, 3]
  }[role];
  if (!bounds || items.length < bounds[0] || items.length > bounds[1]) {
    throw new RangeError(`slide ${slideIndex + 1} item count is incompatible with role ${role}`);
  }
}
function normalizedSlide(value, index, seenIds) {
  if (!plainObject(value)) throw new TypeError(`slide ${index + 1} must be an object`);
  exactKeys(value, ["id", "role", "title", "summary", "items"], `slide ${index + 1}`);
  const id = normalizedId(value.id, `slide-${index + 1}`, `slide ${index + 1} id`);
  if (seenIds.has(id)) throw new TypeError("slide ids must be unique");
  seenIds.add(id);
  if (typeof value.role !== "string" || !ROLES.includes(value.role)) throw new TypeError(`slide ${index + 1} role is invalid`);
  const items = value.items === undefined ? [] : value.items;
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new TypeError(`slide ${index + 1} items are invalid`);
  const normalizedItems = items.map((item, itemIndex) => normalizedItem(item, index, itemIndex));
  if (new Set(normalizedItems.map((item) => item.id)).size !== normalizedItems.length) throw new TypeError(`slide ${index + 1} item ids must be unique`);
  validateRoleCapacity(value.role, normalizedItems, index);
  return Object.freeze({
    id,
    role: value.role,
    title: boundedString(value.title, `slide ${index + 1} title`, { maximum: 120 }),
    ...(value.summary === undefined ? {} : { summary: boundedString(value.summary, `slide ${index + 1} summary`, { maximum: 500 }) }),
    items: Object.freeze(normalizedItems)
  });
}
function assertNarrativeOrder(slides) {
  if (slides[0].role !== "cover") throw new TypeError("the first slide must use the cover role");
  if (slides.slice(1).some((slide) => slide.role === "cover")) throw new TypeError("a presentation may contain only one cover slide");
  if (slides.some((slide, index) => slide.role === "closing" && index !== slides.length - 1)) throw new TypeError("the closing slide must be last");
}
function validatePresentationSpec(value) {
  if (!plainObject(value)) throw new TypeError("presentation spec must be an object");
  exactKeys(value, ["version", "title", "subtitle", "audience", "language", "theme", "slides"], "presentation spec");
  if (value.version !== SPEC_VERSION) throw new TypeError("presentation spec version is unsupported");
  if (!Array.isArray(value.slides) || value.slides.length < 1 || value.slides.length > MAX_SLIDES) throw new RangeError("presentation spec slide count is invalid");
  const theme = value.theme === undefined ? THEMES[0] : value.theme;
  if (typeof theme !== "string" || !THEMES.includes(theme)) throw new TypeError("presentation theme is invalid");
  const seenIds = new Set();
  const slides = value.slides.map((slide, index) => normalizedSlide(slide, index, seenIds));
  assertNarrativeOrder(slides);
  const normalized = Object.freeze({
    version: SPEC_VERSION,
    title: boundedString(value.title, "presentation title", { maximum: 160 }),
    ...(value.subtitle === undefined ? {} : { subtitle: optionalString(value.subtitle, "presentation subtitle", 320) }),
    ...(value.audience === undefined ? {} : { audience: optionalString(value.audience, "presentation audience", 160) }),
    language: value.language === undefined ? "zh-CN" : boundedString(value.language, "presentation language", { maximum: 32 }),
    theme,
    slides: Object.freeze(slides)
  });
  assertNoPlaceholders(normalized);
  return normalized;
}
function assertNoPlaceholders(value) {
  const visit = (candidate) => {
    if (typeof candidate === "string" && PLACEHOLDER_PATTERN.test(candidate)) throw new TypeError("presentation spec contains placeholder content");
    if (Array.isArray(candidate)) for (const item of candidate) visit(item);
    else if (plainObject(candidate)) for (const item of Object.values(candidate)) visit(item);
  };
  visit(value);
}
function parsePresentationSpec(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 1 || buffer.length > MAX_SPEC_BYTES) throw new TypeError("presentation spec file size is invalid");
  let parsed;
  try { parsed = JSON.parse(buffer.toString("utf8")); }
  catch { throw new TypeError("presentation spec is invalid JSON"); }
  return validatePresentationSpec(parsed);
}

module.exports = { MAX_ITEMS, MAX_SLIDES, MAX_SPEC_BYTES, PLACEHOLDER_PATTERN, ROLES, SPEC_VERSION, THEMES, parsePresentationSpec, validatePresentationSpec };
