// @ts-check
"use strict";

const { buildHorizontalStepsLayout, buildMetricCardsLayout } = require("./declarative-layout-rebuilder");
const { applyBrandKitStyling } = require("./brand-kit-styler");
const { runTwoStageQualityGate } = require("./two-stage-quality-gate");
const { synthesizeSemanticLayoutTree } = require("./dla-layout-adapter");
const { createTemplateCatalog } = require("./component-template-catalog");
const { instantiateComponentTemplate } = require("./component-template-harvester");
const { assertNonEmptyString } = require("../capability-contracts");

/**
 * @typedef {Object} PageContext
 * @property {number} [pageIndex]
 * @property {{ widthPt?: number, heightPt?: number }} [slideSize]
 * @property {readonly unknown[]} [textBoxes]
 * @property {readonly unknown[]} [shapes]
 * @property {readonly unknown[]} [dlaRegions]
 * @property {readonly unknown[]} [items]
 * @property {string} [archetype]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @typedef {Object} PipelinePlugin
 * @property {string} id
 * @property {number} priority
 * @property {(context: PageContext) => boolean} canHandle
 * @property {(context: PageContext, helpers: Record<string, unknown>) => { shapes: Array<Record<string, unknown>>, textBoxes: Array<Record<string, unknown>> }} rebuild
 */

/**
 * @typedef {Object} PipelineOptions
 * @property {unknown} [brandKit]
 * @property {number} [gridSnap]
 * @property {boolean} [autoFitText]
 * @property {boolean} [enforceQualityGate]
 */
const DEFAULT_SLIDE_SIZE = Object.freeze({ widthPt: 960, heightPt: 540 });
const MAX_SLIDE_DIMENSION_PT = 100000;
const MAX_PIPELINE_ITEMS = 100;
const MAX_PIPELINE_TEXT_BOXES = 2000;
const MAX_PIPELINE_SHAPES = 5000;
const MAX_PIPELINE_METADATA_KEYS = 100;
const MAX_PIPELINE_STRING_LENGTH = 1000;
const MAX_SAFE_SNAPSHOT_DEPTH = 4;
const SIMPLE_IDENTIFIER_RE = /^[a-zA-Z0-9_.:-]{1,128}$/;

class DeclarativeRebuilderPipeline {
  /**
   * @param {{ includeBuiltins?: boolean }} [options]
   */
  constructor(options = {}) {
    /** @type {PipelinePlugin[]} */
    this.plugins = [];
    this.catalog = createTemplateCatalog();

    if (options.includeBuiltins !== false) {
      this._registerBuiltins();
    }
  }

  /**
   * Register a custom rebuilder plugin.
   * @param {PipelinePlugin} plugin
   */
  registerPlugin(plugin) {
    if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) throw new TypeError("PipelinePlugin must be an object");
    const id = normalizeOptionalIdentifier(readOwnDataValue(plugin, "id", "plugin.id"), "plugin.id");
    if (id === null) throw new TypeError("plugin.id must be a string");
    const priority = readOwnDataValue(plugin, "priority", "plugin.priority");
    if (typeof priority !== "number" || !Number.isFinite(priority)) {
      throw new TypeError("plugin.priority must be a finite number");
    }
    const canHandle = readOwnDataValue(plugin, "canHandle", "plugin.canHandle");
    if (typeof canHandle !== "function") {
      throw new TypeError("plugin.canHandle must be a function");
    }
    const rebuild = readOwnDataValue(plugin, "rebuild", "plugin.rebuild");
    if (typeof rebuild !== "function") {
      throw new TypeError("plugin.rebuild must be a function");
    }
    const normalizedPlugin = Object.freeze({
      id: assertNonEmptyString(id, "plugin.id"),
      priority,
      canHandle: /** @type {PipelinePlugin["canHandle"]} */ (canHandle),
      rebuild: /** @type {PipelinePlugin["rebuild"]} */ (rebuild)
    });
    this.plugins.push(normalizedPlugin);
    // Sort descending by priority (higher priority runs first)
    this.plugins.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Run the declarative pipeline on a slide page context.
   * @param {PageContext} pageContext
   * @param {PipelineOptions} [options]
   * @returns {{
   *   status: "matched" | "unhandled",
   *   matchedPlugin: string | null,
   *   shapes: readonly Record<string, unknown>[],
   *   textBoxes: readonly Record<string, unknown>[],
   *   qualityReport: ReturnType<typeof runTwoStageQualityGate>["qualityReport"] | null,
   *   semanticTree?: readonly unknown[]
   * }}
   */
  run(pageContext, options = {}) {
    if (!pageContext || typeof pageContext !== "object" || Array.isArray(pageContext)) throw new TypeError("pageContext must be an object");
    const pipelineOptions = normalizePipelineOptions(options);
    const normalizedContext = normalizePipelinePageContext(pageContext);
    const derived = deriveContextFromDla(normalizedContext);
    const effectiveContext = derived.context;

    const helpers = {
      catalog: this.catalog,
      instantiateComponentTemplate,
      layoutOptions: pipelineOptions.layoutOptions,
      synthesizeSemanticLayoutTree
    };

    let matchedPlugin = null;
    let rebuildResult = null;

    for (const plugin of this.plugins) {
      if (plugin.canHandle(effectiveContext)) {
        matchedPlugin = plugin.id;
        rebuildResult = plugin.rebuild(effectiveContext, helpers);
        break;
      }
    }

    if (!rebuildResult) {
      return Object.freeze({
        status: "unhandled",
        matchedPlugin: null,
        shapes: Object.freeze([]),
        textBoxes: Object.freeze([]),
        qualityReport: null,
        ...(derived.semanticTree ? { semanticTree: derived.semanticTree } : {})
      });
    }

    let shapes = Array.isArray(rebuildResult.shapes) ? rebuildResult.shapes : [];
    let textBoxes = Array.isArray(rebuildResult.textBoxes) ? rebuildResult.textBoxes : [];

    // Optional Brand Kit Styling Retargeting
    if (pipelineOptions.brandKit) {
      const styled = applyBrandKitStyling(shapes, textBoxes, pipelineOptions.brandKit);
      shapes = [...styled.shapes];
      textBoxes = [...styled.textBoxes];
    }

    // Two-stage Quality Assessment
    const slideSize = effectiveContext.slideSize || DEFAULT_SLIDE_SIZE;
    const qualityGateResult = runTwoStageQualityGate({ shapes, textBoxes }, { slideSize });

    if (pipelineOptions.enforceQualityGate && !qualityGateResult.passed) {
      throw new Error(`declarative rebuilder failed quality gate: ${matchedPlugin}`);
    }

    return Object.freeze({
      status: "matched",
      matchedPlugin,
      shapes: Object.freeze(shapes),
      textBoxes: Object.freeze(textBoxes),
      qualityReport: qualityGateResult.qualityReport,
      ...(derived.semanticTree ? { semanticTree: derived.semanticTree } : {})
    });
  }

  /**
   * @private
   */
  _registerBuiltins() {
    // 1. Step Chain Rebuilder Plugin
    this.registerPlugin({
      id: "builtin-step-chain",
      priority: 100,
      canHandle: (ctx) => {
        if (ctx.archetype === "step_chain" || ctx.archetype === "process_flow") return true;
        if (Array.isArray(ctx.items) && ctx.items.length >= 2 && ctx.items.some((item) => Boolean(readStringProperty(item, "badge")))) return true;
        return false;
      },
      rebuild: (ctx, helpers) => {
        const bounds = { x: 50, y: 120, w: (ctx.slideSize?.widthPt || 960) - 100, h: 320 };
        const rawItems = Array.isArray(ctx.items) ? ctx.items : [];
        const items = rawItems.map((item, idx) => {
          return {
            title: readStringProperty(item, "title") || `步骤 ${idx + 1}`,
            body: readStringProperty(item, "body") || readStringProperty(item, "text") || "",
            badge: readStringProperty(item, "badge") || String(idx + 1).padStart(2, "0")
          };
        });
        return buildHorizontalStepsLayout(items, bounds, readLayoutOptions(helpers));
      }
    });

    // 2. Metric Cards Rebuilder Plugin
    this.registerPlugin({
      id: "builtin-metric-cards",
      priority: 90,
      canHandle: (ctx) => {
        if (ctx.archetype === "metrics" || ctx.archetype === "kpi_grid") return true;
        if (Array.isArray(ctx.items) && ctx.items.length >= 2 && ctx.items.some((item) => Boolean(readStringProperty(item, "metric")))) return true;
        return false;
      },
      rebuild: (ctx, helpers) => {
        const bounds = { x: 50, y: 150, w: (ctx.slideSize?.widthPt || 960) - 100, h: 260 };
        const rawItems = Array.isArray(ctx.items) ? ctx.items : [];
        const items = rawItems.map((item, idx) => {
          return {
            title: readStringProperty(item, "title") || `指标 ${idx + 1}`,
            body: readStringProperty(item, "body") || readStringProperty(item, "metric") || "100%",
            subtitle: readStringProperty(item, "subtitle") || readStringProperty(item, "trend") || ""
          };
        });
        return buildMetricCardsLayout(items, bounds, readLayoutOptions(helpers));
      }
    });

    // 3. Catalog Template Matcher Plugin
    this.registerPlugin({
      id: "builtin-template-matcher",
      priority: 50,
      canHandle: (ctx) => {
        if (typeof ctx.archetype === "string" && this.catalog.get(ctx.archetype)) return true;
        if (typeof ctx.archetype === "string" && this.catalog.matchBest({ archetype: ctx.archetype })) return true;
        return false;
      },
      rebuild: (ctx, _helpers) => {
        const cat = this.catalog;
        const tpl = cat.get(String(ctx.archetype)) || cat.matchBest({ archetype: ctx.archetype });
        if (!tpl) throw new Error("no template matched");
        const bounds = { x: 60, y: 100, w: (ctx.slideSize?.widthPt || 960) - 120, h: (ctx.slideSize?.heightPt || 540) - 160 };
        const slotValues = ctx.metadata && isStringRecord(ctx.metadata.slotValues) ? ctx.metadata.slotValues : {};
        const inst = instantiateComponentTemplate(tpl, slotValues, bounds);
        return {
          shapes: [...inst.shapes],
          textBoxes: [...inst.textBoxes]
        };
      }
    });
  }
}

/**
 * @param {unknown} value
 * @param {string} property
 * @returns {string}
 */
function readStringProperty(value, property) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const item = readOwnDataValue(value, property, `${property}`);
  return typeof item === "string" && item.trim() ? item.trim() : "";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, string>}
 */
function isStringRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(safeObjectSnapshot(value, "string record", 1)).every((item) => typeof item === "string");
}

/**
 * @param {unknown} value
 * @returns {Readonly<{ brandKit: unknown, enforceQualityGate: boolean, layoutOptions: Readonly<{ gridSnap?: number, autoFitText?: boolean }> }>}
 */
function normalizePipelineOptions(value) {
  const raw = optionalRecord(value, "pipeline options");
  const layoutOptions = {};
  if (raw.gridSnap !== undefined) Object.assign(layoutOptions, { gridSnap: positiveFinite(raw.gridSnap, "gridSnap", 1000) });
  if (raw.autoFitText !== undefined) {
    if (typeof raw.autoFitText !== "boolean") throw new TypeError("autoFitText must be a boolean");
    Object.assign(layoutOptions, { autoFitText: raw.autoFitText });
  }
  if (raw.enforceQualityGate !== undefined && typeof raw.enforceQualityGate !== "boolean") throw new TypeError("enforceQualityGate must be a boolean");
  return Object.freeze({
    brandKit: raw.brandKit,
    enforceQualityGate: raw.enforceQualityGate === true,
    layoutOptions: Object.freeze(layoutOptions)
  });
}

/**
 * @param {PageContext} pageContext
 * @returns {PageContext}
 */
function normalizePipelinePageContext(pageContext) {
  if (!pageContext || typeof pageContext !== "object" || Array.isArray(pageContext)) throw new TypeError("pageContext must be an object");
  const normalized = {};
  const pageIndex = readOwnDataValue(pageContext, "pageIndex", "pageIndex");
  if (pageIndex !== undefined) {
    if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0) throw new TypeError("pageIndex must be a non-negative integer");
    Object.assign(normalized, { pageIndex });
  }
  const slideSize = readOwnDataValue(pageContext, "slideSize", "slideSize");
  if (slideSize !== undefined && slideSize !== null) Object.assign(normalized, { slideSize: normalizeSlideSize(slideSize) });
  const archetype = normalizeOptionalIdentifier(readOwnDataValue(pageContext, "archetype", "archetype"), "archetype");
  if (archetype !== null) Object.assign(normalized, { archetype });
  const items = readOwnDataValue(pageContext, "items", "items");
  if (items !== undefined) Object.assign(normalized, { items: normalizePipelineItems(items) });
  const textBoxes = readOwnDataValue(pageContext, "textBoxes", "textBoxes");
  if (textBoxes !== undefined) Object.assign(normalized, { textBoxes: normalizePipelineArray(textBoxes, "textBoxes", MAX_PIPELINE_TEXT_BOXES) });
  const shapes = readOwnDataValue(pageContext, "shapes", "shapes");
  if (shapes !== undefined) Object.assign(normalized, { shapes: normalizePipelineArray(shapes, "shapes", MAX_PIPELINE_SHAPES) });
  const dlaRegions = readOwnDataValue(pageContext, "dlaRegions", "dlaRegions");
  if (dlaRegions !== undefined) Object.assign(normalized, { dlaRegions: normalizePipelineArray(dlaRegions, "dlaRegions", MAX_PIPELINE_ITEMS * 2) });
  const metadata = readOwnDataValue(pageContext, "metadata", "metadata");
  if (metadata !== undefined) Object.assign(normalized, { metadata: normalizePipelineMetadata(metadata) });
  return Object.freeze(normalized);
}

/**
 * @param {unknown} value
 * @returns {{ widthPt: number, heightPt: number }}
 */
function normalizeSlideSize(value) {
  const raw = optionalRecord(value, "slideSize");
  return Object.freeze({
    widthPt: raw.widthPt === undefined ? DEFAULT_SLIDE_SIZE.widthPt : positiveFinite(raw.widthPt, "slideSize.widthPt", MAX_SLIDE_DIMENSION_PT),
    heightPt: raw.heightPt === undefined ? DEFAULT_SLIDE_SIZE.heightPt : positiveFinite(raw.heightPt, "slideSize.heightPt", MAX_SLIDE_DIMENSION_PT)
  });
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function optionalRecord(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return safeObjectSnapshot(value, label, 1);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} max
 * @returns {number}
 */
function positiveFinite(value, label, max) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > max) {
    throw new TypeError(`${label} must be a positive finite number no greater than ${max}`);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} helpers
 * @returns {{ gridSnap?: number, autoFitText?: boolean }}
 */
function readLayoutOptions(helpers) {
  const layoutOptions = helpers.layoutOptions;
  return layoutOptions && typeof layoutOptions === "object" && !Array.isArray(layoutOptions)
    ? /** @type {{ gridSnap?: number, autoFitText?: boolean }} */ (layoutOptions)
    : {};
}

/**
 * @param {unknown} value
 * @returns {readonly Record<string, unknown>[]}
 */
function normalizePipelineItems(value) {
  if (!Array.isArray(value)) throw new TypeError("items must be an array");
  if (value.length > MAX_PIPELINE_ITEMS) throw new RangeError(`items cannot contain more than ${MAX_PIPELINE_ITEMS} entries`);
  assertDenseArray(value, "items");
  return Object.freeze(value.map((item, index) => safeObjectSnapshot(item, `items[${index}]`, 2)));
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} maximum
 * @returns {readonly unknown[]}
 */
function normalizePipelineArray(value, label, maximum) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  if (value.length > maximum) throw new RangeError(`${label} cannot contain more than ${maximum} entries`);
  assertDenseArray(value, label);
  return Object.freeze(value.map((item, index) => safeSnapshot(item, `${label}[${index}]`, 0)));
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function normalizePipelineMetadata(value) {
  const metadata = safeObjectSnapshot(value, "metadata", 2);
  if (Object.keys(metadata).length > MAX_PIPELINE_METADATA_KEYS) throw new RangeError(`metadata cannot contain more than ${MAX_PIPELINE_METADATA_KEYS} keys`);
  return Object.freeze(metadata);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {string | null}
 */
function normalizeOptionalIdentifier(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if (!text) return null;
  if (!SIMPLE_IDENTIFIER_RE.test(text)) throw new TypeError(`${label} must be a simple identifier`);
  return text;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} depth
 * @returns {unknown}
 */
function safeSnapshot(value, label, depth) {
  if (value === undefined || value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`${label} must be a finite number`);
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_PIPELINE_STRING_LENGTH || /[\r\n\0]/u.test(value)) throw new TypeError(`${label} must be a bounded single-line string`);
    return value.trim();
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_SAFE_SNAPSHOT_DEPTH) throw new RangeError(`${label} nesting is too deep`);
    if (value.length > MAX_PIPELINE_ITEMS) throw new RangeError(`${label} cannot contain more than ${MAX_PIPELINE_ITEMS} entries`);
    assertDenseArray(value, label);
    return Object.freeze(value.map((item, index) => safeSnapshot(item, `${label}[${index}]`, depth + 1)));
  }
  if (typeof value === "object") return safeObjectSnapshot(value, label, depth + 1);
  throw new TypeError(`${label} must be JSON-compatible data`);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} depth
 * @returns {Record<string, unknown>}
 */
function safeObjectSnapshot(value, label, depth) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  if (depth > MAX_SAFE_SNAPSHOT_DEPTH) throw new RangeError(`${label} nesting is too deep`);
  let prototype;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch {
    throw new TypeError(`${label} must be safe data`);
  }
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  let descriptors;
  try {
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    throw new TypeError(`${label} must be safe data`);
  }
  const entries = Object.entries(descriptors);
  if (entries.length > MAX_PIPELINE_METADATA_KEYS) throw new RangeError(`${label} has too many keys`);
  const output = {};
  for (const [key, descriptor] of entries) {
    if (!descriptor.enumerable) continue;
    if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new TypeError(`${label} must contain only data properties`);
    if (!SIMPLE_IDENTIFIER_RE.test(key)) throw new TypeError(`${label} keys must be simple identifiers`);
    Object.assign(output, { [key]: safeSnapshot(descriptor.value, `${label}.${key}`, depth) });
  }
  return Object.freeze(output);
}

/**
 * @param {unknown} value
 * @param {string} key
 * @param {string} label
 * @returns {unknown}
 */
function readOwnDataValue(value, key, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  let descriptor;
  try {
    descriptor = Object.getOwnPropertyDescriptor(value, key);
  } catch {
    throw new TypeError(`${label} must be safe data`);
  }
  if (!descriptor) return undefined;
  if (!Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new TypeError(`${label} must be a data property`);
  return descriptor.value;
}

/**
 * @param {readonly unknown[]} value
 * @param {string} label
 */
function assertDenseArray(value, label) {
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) throw new TypeError(`${label} must be a dense array`);
  }
}

/**
 * @param {PageContext} pageContext
 * @returns {{ context: PageContext, semanticTree: readonly unknown[] | null }}
 */
function deriveContextFromDla(pageContext) {
  if (!Array.isArray(pageContext.dlaRegions) || !Array.isArray(pageContext.textBoxes)) {
    return { context: pageContext, semanticTree: null };
  }
  const semanticTree = synthesizeSemanticLayoutTree(pageContext.dlaRegions, pageContext.textBoxes);
  const additions = semanticTreeToPipelineContext(semanticTree);
  if (!additions) return { context: Object.freeze({ ...pageContext }), semanticTree };
  return {
    context: Object.freeze({
      ...pageContext,
      archetype: pageContext.archetype || additions.archetype,
      items: Array.isArray(pageContext.items) && pageContext.items.length > 0 ? pageContext.items : additions.items,
      metadata: Object.freeze({
        ...(pageContext.metadata || {}),
        semanticTreeSource: "dla-layout"
      })
    }),
    semanticTree
  };
}

/**
 * @param {readonly unknown[]} semanticTree
 * @returns {{ archetype: string, items: readonly Record<string, string>[] } | null}
 */
function semanticTreeToPipelineContext(semanticTree) {
  const nodes = semanticTree.filter(isSemanticNode);
  const processNode = nodes.find((node) => node.role === "process_flow");
  if (processNode) {
    const items = nodeItemsToStepItems(processNode.items);
    if (items.length >= 2) return { archetype: "process_flow", items: Object.freeze(items) };
  }
  const metricNodes = nodes.filter((node) => node.role === "metric_card");
  if (metricNodes.length >= 2) {
    const items = metricNodes.map((node, index) => regionNodeToMetricItem(node, index));
    return { archetype: "metrics", items: Object.freeze(items) };
  }
  return null;
}

/**
 * @param {unknown} value
 * @returns {value is { role: string, items: readonly unknown[] }}
 */
function isSemanticNode(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value) && typeof /** @type {{role?: unknown}} */ (value).role === "string" && Array.isArray(/** @type {{items?: unknown}} */ (value).items));
}

/**
 * @param {readonly unknown[]} items
 * @returns {Record<string, string>[]}
 */
function nodeItemsToStepItems(items) {
  return items.map(readTextFromItem).filter(Boolean).map((text, index) => ({
    title: text,
    body: "",
    badge: String(index + 1).padStart(2, "0")
  }));
}

/**
 * @param {{ items: readonly unknown[] }} node
 * @param {number} index
 * @returns {Record<string, string>}
 */
function regionNodeToMetricItem(node, index) {
  const texts = node.items.map(readTextFromItem).filter(Boolean);
  return {
    title: texts[0] || `指标 ${index + 1}`,
    metric: texts[1] || texts[0] || "100%",
    trend: texts.slice(2).join(" ")
  };
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function readTextFromItem(value) {
  return readStringProperty(value, "text") || readStringProperty(value, "title") || readStringProperty(value, "body");
}

/**
 * Create a new DeclarativeRebuilderPipeline.
 * @param {{ includeBuiltins?: boolean }} [options]
 * @returns {DeclarativeRebuilderPipeline}
 */
function createDeclarativePipeline(options) {
  return new DeclarativeRebuilderPipeline(options);
}

module.exports = {
  DeclarativeRebuilderPipeline,
  createDeclarativePipeline,
  deriveContextFromDla,
  isStringRecord,
  normalizePipelineOptions,
  normalizePipelinePageContext,
  normalizePipelineArray,
  normalizePipelineItems,
  normalizePipelineMetadata,
  normalizeSlideSize,
  readStringProperty,
  safeObjectSnapshot,
  semanticTreeToPipelineContext
};
