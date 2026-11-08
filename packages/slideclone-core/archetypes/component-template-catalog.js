// @ts-check
"use strict";


/**
 * @typedef {import("./component-template-harvester").ComponentTemplate} ComponentTemplate
 */

/**
 * @typedef {Object} TemplateQueryCriteria
 * @property {string} [archetype]
 * @property {string} [category]
 * @property {number} [slotCount]
 * @property {number} [aspectRatio]
 * @property {readonly string[]} [tags]
 */

/**
 * Validate that an object conforms to the ComponentTemplate contract.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {ComponentTemplate}
 */
function validateComponentTemplate(value, label = "component template") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  if (typeof candidate.id !== "string" || !candidate.id.trim()) {
    throw new TypeError(`${label}.id must be a non-empty string`);
  }
  if (typeof candidate.archetype !== "string" || !candidate.archetype.trim()) {
    throw new TypeError(`${label}.archetype must be a non-empty string`);
  }
  if (typeof candidate.category !== "string" || !candidate.category.trim()) {
    throw new TypeError(`${label}.category must be a non-empty string`);
  }
  if (!candidate.envelope || typeof candidate.envelope !== "object" || Array.isArray(candidate.envelope)) {
    throw new TypeError(`${label}.envelope must be an object`);
  }
  const env = /** @type {Record<string, unknown>} */ (candidate.envelope);
  const ew = Number(env.w);
  const eh = Number(env.h);
  if (!Number.isFinite(ew) || !Number.isFinite(eh) || ew <= 0 || eh <= 0) {
    throw new TypeError(`${label}.envelope dimensions must be positive finite numbers`);
  }
  if (!Array.isArray(candidate.shapes)) {
    throw new TypeError(`${label}.shapes must be an array`);
  }
  if (!Array.isArray(candidate.slots)) {
    throw new TypeError(`${label}.slots must be an array`);
  }
  validateTemplatePalette(candidate.palette, `${label}.palette`);
  validateTemplateTags(candidate.tags, `${label}.tags`);
  const shapeIds = new Set();
  candidate.shapes.forEach((shape, index) => validateTemplateShape(shape, `${label}.shapes[${index}]`));
  for (const [index, shape] of candidate.shapes.entries()) {
    const id = /** @type {{id: string}} */ (shape).id.trim();
    if (shapeIds.has(id)) throw new Error(`${label}.shapes[${index}].id must be unique`);
    shapeIds.add(id);
  }
  const slotNames = new Set();
  candidate.slots.forEach((slot, index) => validateTemplateSlot(slot, `${label}.slots[${index}]`));
  for (const [index, slot] of candidate.slots.entries()) {
    const name = /** @type {{name: string}} */ (slot).name.trim();
    if (slotNames.has(name)) throw new Error(`${label}.slots[${index}].name must be unique`);
    slotNames.add(name);
  }
  return /** @type {ComponentTemplate} */ (value);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateTemplateShape(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (typeof raw.id !== "string" || !raw.id.trim()) throw new TypeError(`${label}.id must be a non-empty string`);
  if (typeof raw.type !== "string" || !raw.type.trim()) throw new TypeError(`${label}.type must be a non-empty string`);
  validateRelativeBox(raw, label);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateTemplateSlot(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const raw = /** @type {Record<string, unknown>} */ (value);
  if (typeof raw.name !== "string" || !raw.name.trim()) throw new TypeError(`${label}.name must be a non-empty string`);
  if (typeof raw.role !== "string" || !raw.role.trim()) throw new TypeError(`${label}.role must be a non-empty string`);
  if (typeof raw.defaultText !== "string") throw new TypeError(`${label}.defaultText must be a string`);
  validateRelativeBox(raw, label);
}

/**
 * @param {Record<string, unknown>} raw
 * @param {string} label
 */
function validateRelativeBox(raw, label) {
  /** @type {Record<string, number>} */
  const box = {};
  for (const key of ["relX", "relY", "relW", "relH"]) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(`${label}.${key} must be a finite number`);
    box[key] = value;
  }
  if (box.relW <= 0 || box.relH <= 0) throw new TypeError(`${label}.relW and relH must be positive`);
  if (box.relX < 0 || box.relY < 0 || box.relX > 1 || box.relY > 1 || box.relX + box.relW > 1.0001 || box.relY + box.relH > 1.0001) {
    throw new TypeError(`${label} relative box must stay within the template envelope`);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateTemplatePalette(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const raw = /** @type {Record<string, unknown>} */ (value);
  validateStringArray(raw.fills, `${label}.fills`);
  validateStringArray(raw.strokes, `${label}.strokes`);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateTemplateTags(value, label) {
  validateStringArray(value, label);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function validateStringArray(value, label) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length > 100) throw new RangeError(`${label} cannot contain more than 100 entries`);
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || !item.trim() || item.length > 128 || /[\r\n\0]/u.test(item)) {
      throw new TypeError(`${label}[${index}] must be a bounded single-line string`);
    }
  }
}

/**
 * Curated built-in component templates providing instant foundation for common slide archetypes.
 * @type {readonly ComponentTemplate[]}
 */
const BUILTIN_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "builtin-kpi-card-v1",
    archetype: "kpi_card",
    category: "metrics",
    envelope: Object.freeze({ w: 240, h: 140 }),
    shapes: Object.freeze([
      Object.freeze({ id: "bg", type: "round_rect", relX: 0, relY: 0, relW: 1, relH: 1, fill: "#F4F6F9", stroke: "#D0D7DE" })
    ]),
    slots: Object.freeze([
      Object.freeze({ name: "metric_label", role: "title", defaultText: "核心指标", relX: 0.08, relY: 0.12, relW: 0.84, relH: 0.22 }),
      Object.freeze({ name: "metric_value", role: "metric", defaultText: "98.5%", relX: 0.08, relY: 0.38, relW: 0.84, relH: 0.36 }),
      Object.freeze({ name: "metric_trend", role: "body", defaultText: "同比提升 12.4%", relX: 0.08, relY: 0.74, relW: 0.84, relH: 0.18 })
    ]),
    palette: Object.freeze({ fills: Object.freeze(["#F4F6F9"]), strokes: Object.freeze(["#D0D7DE"]) }),
    tags: Object.freeze(["kpi", "metric", "card"])
  }),
  Object.freeze({
    id: "builtin-process-step-v1",
    archetype: "process_step",
    category: "process",
    envelope: Object.freeze({ w: 200, h: 220 }),
    shapes: Object.freeze([
      Object.freeze({ id: "card_base", type: "round_rect", relX: 0, relY: 0, relW: 1, relH: 1, fill: "#FFFFFF", stroke: "#0066CC" }),
      Object.freeze({ id: "badge_circle", type: "circle", relX: 0.38, relY: 0.08, relW: 0.24, relH: 0.22, fill: "#0066CC", stroke: "#FFFFFF" })
    ]),
    slots: Object.freeze([
      Object.freeze({ name: "step_number", role: "badge", defaultText: "01", relX: 0.38, relY: 0.08, relW: 0.24, relH: 0.22 }),
      Object.freeze({ name: "step_title", role: "title", defaultText: "阶段规划", relX: 0.1, relY: 0.36, relW: 0.8, relH: 0.2 }),
      Object.freeze({ name: "step_desc", role: "body", defaultText: "明确目标里程碑与关键交付物", relX: 0.1, relY: 0.6, relW: 0.8, relH: 0.32 })
    ]),
    palette: Object.freeze({ fills: Object.freeze(["#FFFFFF", "#0066CC"]), strokes: Object.freeze(["#0066CC", "#FFFFFF"]) }),
    tags: Object.freeze(["process", "step", "timeline"])
  }),
  Object.freeze({
    id: "builtin-comparison-column-v1",
    archetype: "comparison_column",
    category: "comparison",
    envelope: Object.freeze({ w: 320, h: 360 }),
    shapes: Object.freeze([
      Object.freeze({ id: "col_panel", type: "rectangle", relX: 0, relY: 0, relW: 1, relH: 1, fill: "#FAFAFA", stroke: "#E0E0E0" }),
      Object.freeze({ id: "col_header", type: "rectangle", relX: 0, relY: 0, relW: 1, relH: 0.18, fill: "#003366", stroke: "#003366" })
    ]),
    slots: Object.freeze([
      Object.freeze({ name: "col_title", role: "title", defaultText: "方案对比", relX: 0.08, relY: 0.04, relW: 0.84, relH: 0.1 }),
      Object.freeze({ name: "item_1", role: "body", defaultText: "• 优势一：高效落地", relX: 0.08, relY: 0.25, relW: 0.84, relH: 0.18 }),
      Object.freeze({ name: "item_2", role: "body", defaultText: "• 优势二：成本节约", relX: 0.08, relY: 0.48, relW: 0.84, relH: 0.18 }),
      Object.freeze({ name: "item_3", role: "body", defaultText: "• 优势三：跨端兼容", relX: 0.08, relY: 0.71, relW: 0.84, relH: 0.18 })
    ]),
    palette: Object.freeze({ fills: Object.freeze(["#FAFAFA", "#003366"]), strokes: Object.freeze(["#E0E0E0", "#003366"]) }),
    tags: Object.freeze(["comparison", "column", "matrix"])
  })
]);

class ComponentTemplateCatalog {
  /**
   * @param {{ includeBuiltins?: boolean }} [options]
   */
  constructor(options = {}) {
    /** @type {Map<string, ComponentTemplate>} */
    this.templates = new Map();

    if (options.includeBuiltins !== false) {
      for (const tpl of BUILTIN_TEMPLATES) {
        this.templates.set(tpl.id, tpl);
      }
    }
  }

  /**
   * Register a component template into the catalog.
   * @param {ComponentTemplate} template
   */
  register(template) {
    const validated = validateComponentTemplate(template);
    if (this.templates.has(validated.id)) {
      throw new Error(`template with id "${validated.id}" is already registered`);
    }
    this.templates.set(validated.id, Object.freeze(validated));
  }

  /**
   * Get template by ID.
   * @param {string} id
   * @returns {ComponentTemplate | null}
   */
  get(id) {
    if (typeof id !== "string" || !id.trim()) return null;
    return this.templates.get(id.trim()) || null;
  }

  /**
   * List all registered templates matching optional category/archetype.
   * @param {{ category?: string, archetype?: string }} [filter]
   * @returns {readonly ComponentTemplate[]}
   */
  list(filter = {}) {
    const category = filter && filter.category ? filter.category.trim() : null;
    const archetype = filter && filter.archetype ? filter.archetype.trim() : null;

    const result = [];
    for (const tpl of this.templates.values()) {
      if (category && tpl.category !== category) continue;
      if (archetype && tpl.archetype !== archetype) continue;
      result.push(tpl);
    }
    return Object.freeze(result);
  }

  /**
   * Find and score the best matching template for given requirements.
   * @param {TemplateQueryCriteria} criteria
   * @returns {ComponentTemplate | null}
   */
  matchBest(criteria = {}) {
    if (!criteria || typeof criteria !== "object") return null;
    const candidates = [...this.templates.values()];
    if (candidates.length === 0) return null;

    let bestScore = 0;
    let bestMatch = null;

    for (const candidate of candidates) {
      let score = 0;

      // Category match (+50)
      if (criteria.category && candidate.category === criteria.category.trim()) {
        score += 50;
      }

      // Archetype match (+100)
      if (criteria.archetype && candidate.archetype === criteria.archetype.trim()) {
        score += 100;
      }

      // Tag match (+10 per tag)
      if (Array.isArray(criteria.tags) && criteria.tags.length > 0) {
        for (const tag of criteria.tags) {
          if (candidate.tags.includes(String(tag))) {
            score += 10;
          }
        }
      }

      // Slot count proximity (+30 max)
      if (Number.isInteger(criteria.slotCount) && criteria.slotCount != null && criteria.slotCount > 0) {
        const diff = Math.abs(candidate.slots.length - criteria.slotCount);
        score += Math.max(0, 30 - diff * 10);
      }

      // Aspect ratio proximity (+20 max)
      if (Number.isFinite(criteria.aspectRatio) && criteria.aspectRatio != null && criteria.aspectRatio > 0) {
        const candidateRatio = candidate.envelope.w / candidate.envelope.h;
        const ratioDiff = Math.abs(candidateRatio - criteria.aspectRatio);
        score += Math.max(0, 20 - ratioDiff * 10);
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = candidate;
      }
    }

    return bestMatch;
  }

  /**
   * Export all templates as JSON string.
   * @returns {string}
   */
  exportJson() {
    return JSON.stringify([...this.templates.values()], null, 2);
  }

  /**
   * Import templates from a JSON string.
   * @param {string} jsonString
   * @returns {number} count of newly imported templates
   */
  importJson(jsonString) {
    if (typeof jsonString !== "string" || !jsonString.trim()) {
      throw new TypeError("jsonString must be a non-empty string");
    }
    const parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) {
      throw new TypeError("imported templates must be a JSON array");
    }
    let count = 0;
    for (const item of parsed) {
      const validated = validateComponentTemplate(item);
      if (!this.templates.has(validated.id)) {
        this.templates.set(validated.id, Object.freeze(validated));
        count += 1;
      }
    }
    return count;
  }
}

/**
 * Create a new ComponentTemplateCatalog instance.
 * @param {{ includeBuiltins?: boolean }} [options]
 * @returns {ComponentTemplateCatalog}
 */
function createTemplateCatalog(options) {
  return new ComponentTemplateCatalog(options);
}

module.exports = {
  BUILTIN_TEMPLATES,
  ComponentTemplateCatalog,
  createTemplateCatalog,
  validateComponentTemplate,
  validateStringArray,
  validateTemplateShape,
  validateTemplatePalette,
  validateTemplateSlot
};
