// @ts-check
"use strict";

const { computeEnvelope } = require("./layout-constraint-solver");
const { assertBox } = require("./layout-constraint-solver");
const { validateComponentTemplate } = require("./component-template-catalog");

const MAX_TEXT_LENGTH = 500;
const MAX_IDENTIFIER_LENGTH = 128;
const SIMPLE_IDENTIFIER_RE = /^[a-zA-Z0-9_.:-]{1,128}$/;

/**
 * @typedef {Object} TemplateSlot
 * @property {string} name
 * @property {string} role
 * @property {string} defaultText
 * @property {number} relX
 * @property {number} relY
 * @property {number} relW
 * @property {number} relH
 * @property {Record<string, unknown>} [font]
 */

/**
 * @typedef {Object} TemplateShape
 * @property {string} id
 * @property {string} type
 * @property {number} relX
 * @property {number} relY
 * @property {number} relW
 * @property {number} relH
 * @property {unknown} [fill]
 * @property {unknown} [stroke]
 * @property {Record<string, unknown>} [extra]
 */

/**
 * @typedef {Object} ComponentTemplate
 * @property {string} id
 * @property {string} archetype
 * @property {string} category
 * @property {{ w: number, h: number }} envelope
 * @property {readonly TemplateShape[]} shapes
 * @property {readonly TemplateSlot[]} slots
 * @property {{ fills: readonly string[], strokes: readonly string[] }} palette
 * @property {readonly string[]} tags
 */

/**
 * Extract a reusable, desensitized component template from reconstructed slide elements.
 * @param {readonly unknown[]} shapes
 * @param {readonly unknown[]} textBoxes
 * @param {{ id?: string, archetype?: string, category?: string, tags?: readonly string[], preserveText?: boolean }} [options]
 * @returns {ComponentTemplate}
 */
function harvestComponentTemplate(shapes, textBoxes, options = {}) {
  if (!Array.isArray(shapes)) throw new TypeError("shapes must be an array");
  if (!Array.isArray(textBoxes)) throw new TypeError("textBoxes must be an array");
  const opts = normalizeOptions(options);

  const validShapes = shapes.filter((s) => s && typeof s === "object" && !Array.isArray(s));
  const validBoxes = textBoxes.filter((t) => t && typeof t === "object" && !Array.isArray(t));

  if (validShapes.length === 0 && validBoxes.length === 0) {
    throw new TypeError("cannot harvest template from empty shapes and textBoxes");
  }

  // Collect all geometric boxes to determine composite envelope
  /** @type {Array<{ x: number, y: number, w: number, h: number }>} */
  const allBoxes = [];
  for (const item of [...validShapes, ...validBoxes]) {
    const raw = /** @type {Record<string, unknown>} */ (item);
    const box = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
      allBoxes.push({ x, y, w, h });
    }
  }

  if (allBoxes.length === 0) {
    throw new TypeError("no valid bounding boxes found in shapes or textBoxes");
  }

  const envelope = computeEnvelope(allBoxes);
  const envW = Math.max(1, envelope.w);
  const envH = Math.max(1, envelope.h);

  const fills = new Set();
  const strokes = new Set();

  // Normalize shapes
  /** @type {TemplateShape[]} */
  const templateShapes = [];
  validShapes.forEach((s, idx) => {
    const raw = /** @type {Record<string, unknown>} */ (s);
    const box = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
    const shapeBox = coercePositiveBox(box, `shape[${idx}]`);

    const fill = normalizeOptionalSingleLineText(raw.fill, `shape[${idx}].fill`, MAX_IDENTIFIER_LENGTH);
    const stroke = normalizeOptionalSingleLineText(raw.stroke, `shape[${idx}].stroke`, MAX_IDENTIFIER_LENGTH);
    if (fill !== null) fills.add(fill);
    if (stroke !== null) strokes.add(stroke);

    templateShapes.push({
      id: normalizeIdentifier(raw.id, `shape_${idx + 1}`, `shape[${idx}].id`),
      type: normalizeIdentifier(raw.type, "rectangle", `shape[${idx}].type`),
      relX: Math.round(((shapeBox.x - envelope.x) / envW) * 10000) / 10000,
      relY: Math.round(((shapeBox.y - envelope.y) / envH) * 10000) / 10000,
      relW: Math.round((shapeBox.w / envW) * 10000) / 10000,
      relH: Math.round((shapeBox.h / envH) * 10000) / 10000,
      fill,
      stroke
    });
  });

  // Normalize text boxes into desensitized slots
  /** @type {TemplateSlot[]} */
  const templateSlots = [];
  validBoxes.forEach((t, idx) => {
    const raw = /** @type {Record<string, unknown>} */ (t);
    const box = raw.box && typeof raw.box === "object" ? /** @type {Record<string, unknown>} */ (raw.box) : raw;
    const textBox = coercePositiveBox(box, `textBox[${idx}]`);
    const role = normalizeIdentifier(raw.role, idx === 0 ? "title" : "body", `textBox[${idx}].role`);
    const name = `${role}_${idx + 1}`;
    const sourceText = normalizeOptionalSingleLineText(raw.text, `textBox[${idx}].text`, MAX_TEXT_LENGTH);
    const defaultText = opts.preserveText === true && sourceText !== null ? sourceText : `[${role}]`;

    templateSlots.push({
      name,
      role,
      defaultText,
      relX: Math.round(((textBox.x - envelope.x) / envW) * 10000) / 10000,
      relY: Math.round(((textBox.y - envelope.y) / envH) * 10000) / 10000,
      relW: Math.round((textBox.w / envW) * 10000) / 10000,
      relH: Math.round((textBox.h / envH) * 10000) / 10000,
      font: raw.font && typeof raw.font === "object" ? { .../** @type {Record<string, unknown>} */ (raw.font) } : undefined
    });
  });

  const template = {
    id: normalizeIdentifier(opts.id, `template_${Date.now()}`, "options.id"),
    archetype: normalizeIdentifier(opts.archetype, "generic_component", "options.archetype"),
    category: normalizeIdentifier(opts.category, "diagram", "options.category"),
    envelope: Object.freeze({ w: Math.round(envW * 100) / 100, h: Math.round(envH * 100) / 100 }),
    shapes: Object.freeze(templateShapes.map((s) => Object.freeze(s))),
    slots: Object.freeze(templateSlots.map((s) => Object.freeze(s))),
    palette: Object.freeze({
      fills: Object.freeze([...fills]),
      strokes: Object.freeze([...strokes])
    }),
    tags: Object.freeze(normalizeTags(opts.tags))
  };

  return Object.freeze(validateComponentTemplate(template));
}

/**
 * Instantiate a component template into concrete shapes and text boxes scaled to target bounds.
 * @param {ComponentTemplate} template
 * @param {Record<string, string>} [slotValues]
 * @param {{ x: number, y: number, w: number, h: number }} [targetBounds]
 * @returns {Readonly<{ shapes: readonly Record<string, unknown>[], textBoxes: readonly Record<string, unknown>[], envelope: Readonly<{ x: number, y: number, w: number, h: number }> }>}
 */
function instantiateComponentTemplate(template, slotValues = {}, targetBounds) {
  if (!template || typeof template !== "object" || !Array.isArray(template.shapes) || !Array.isArray(template.slots)) {
    throw new TypeError("invalid component template");
  }
  const validTemplate = validateComponentTemplate(template);
  const slots = normalizeSlotValues(slotValues);

  const bounds = targetBounds != null
    ? coercePositiveBox(targetBounds, "targetBounds")
    : {
        x: 0,
        y: 0,
        w: validTemplate.envelope.w,
        h: validTemplate.envelope.h
      };

  const scaleX = bounds.w;
  const scaleY = bounds.h;

  const concreteShapes = validTemplate.shapes.map((s) => ({
    id: `${s.id}_instance`,
    type: s.type,
    x: Math.round((bounds.x + s.relX * scaleX) * 100) / 100,
    y: Math.round((bounds.y + s.relY * scaleY) * 100) / 100,
    w: Math.round((s.relW * scaleX) * 100) / 100,
    h: Math.round((s.relH * scaleY) * 100) / 100,
    fill: s.fill,
    stroke: s.stroke
  }));

  const concreteTextBoxes = validTemplate.slots.map((slot) => {
    const text = Object.hasOwn(slots, slot.name)
      ? slots[slot.name]
      : slot.defaultText;

    return {
      name: slot.name,
      role: slot.role,
      text,
      x: Math.round((bounds.x + slot.relX * scaleX) * 100) / 100,
      y: Math.round((bounds.y + slot.relY * scaleY) * 100) / 100,
      w: Math.round((slot.relW * scaleX) * 100) / 100,
      h: Math.round((slot.relH * scaleY) * 100) / 100,
      font: slot.font ? { ...slot.font } : undefined
    };
  });

  return Object.freeze({
    shapes: Object.freeze(concreteShapes),
    textBoxes: Object.freeze(concreteTextBoxes),
    envelope: Object.freeze(bounds)
  });
}

/**
 * @param {unknown} value
 * @returns {{ id?: unknown, archetype?: unknown, category?: unknown, tags?: unknown, preserveText?: unknown }}
 */
function normalizeOptions(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("options must be an object");
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (raw.preserveText !== undefined && typeof raw.preserveText !== "boolean") {
    throw new TypeError("options.preserveText must be a boolean");
  }
  return raw;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @param {string} label
 * @returns {string}
 */
function normalizeIdentifier(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if (!SIMPLE_IDENTIFIER_RE.test(text)) throw new TypeError(`${label} must be a simple identifier`);
  return text;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} maxLength
 * @returns {string | null}
 */
function normalizeOptionalSingleLineText(value, label, maxLength) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if (!text) return null;
  if (text.length > maxLength) throw new RangeError(`${label} must be at most ${maxLength} characters`);
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 0 || code === 10 || code === 13) throw new TypeError(`${label} must be a single-line string`);
  }
  return text;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeTags(value) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new TypeError("options.tags must be an array");
  if (value.length > 100) throw new RangeError("options.tags cannot contain more than 100 entries");
  return value.map((item, index) => {
    const text = normalizeOptionalSingleLineText(item, `options.tags[${index}]`, MAX_IDENTIFIER_LENGTH);
    if (text === null) throw new TypeError(`options.tags[${index}] must be a bounded single-line string`);
    return text;
  });
}

/**
 * @param {unknown} value
 * @returns {Record<string, string>}
 */
function normalizeSlotValues(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError("slotValues must be an object");
  const raw = /** @type {Record<string, unknown>} */ (value);
  /** @type {Record<string, string>} */
  const out = {};
  for (const [key, item] of Object.entries(raw)) {
    if (!SIMPLE_IDENTIFIER_RE.test(key)) throw new TypeError("slotValues keys must be simple identifiers");
    const text = normalizeOptionalSingleLineText(item, `slotValues.${key}`, MAX_TEXT_LENGTH);
    if (text !== null) out[key] = text;
  }
  return out;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {{ x: number, y: number, w: number, h: number }}
 */
function coercePositiveBox(value, label) {
  const box = assertBox(value, label);
  if (box.w <= 0 || box.h <= 0) throw new TypeError(`${label} width and height must be positive`);
  return box;
}

module.exports = {
  coercePositiveBox,
  harvestComponentTemplate,
  instantiateComponentTemplate,
  normalizeIdentifier,
  normalizeSlotValues,
  normalizeTags
};
