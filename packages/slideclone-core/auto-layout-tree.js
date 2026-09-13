// @ts-check
"use strict";

const { coerceFiniteNumber } = require("./layout-constraint-solver");

const MAX_DEPTH = 20;
const MAX_NODES = 1000;
const MAX_NODE_ID_LENGTH = 120;
const MAX_LAYOUT_DIMENSION = 100000;

/**
 * @typedef {Object} Padding
 * @property {number} top
 * @property {number} right
 * @property {number} bottom
 * @property {number} left
 */

/**
 * @typedef {"horizontal" | "vertical"} Direction
 * @typedef {"start" | "center" | "end" | "stretch"} AlignItems
 * @typedef {"start" | "center" | "end" | "space-between" | "space-around"} JustifyContent
 */

/**
 * @typedef {Object} LayoutBox
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {Object} ResolvedNode
 * @property {string} id
 * @property {"container" | "item"} type
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 * @property {unknown} [payload]
 */

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function assertFiniteNumber(value, label) {
  const n = coerceFiniteNumber(value);
  if (!Number.isFinite(n)) throw new TypeError(`${label} must be a finite number`);
  return n;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {number} [max]
 * @returns {number}
 */
function assertNonNegativeFiniteNumber(value, label, max = MAX_LAYOUT_DIMENSION) {
  const number = assertFiniteNumber(value, label);
  if (number < 0 || number > max) throw new TypeError(`${label} must be a number between 0 and ${max}`);
  return number;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {readonly string[]} allowed
 * @returns {string}
 */
function assertStringEnum(value, label, allowed) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new TypeError(`${label} must be one of: ${allowed.join(", ")}`);
  }
  return value;
}

/**
 * @param {unknown} value
 * @param {string} fallback
 * @param {string} label
 * @returns {string}
 */
function optionalNodeId(value, fallback, label) {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const id = value.trim();
  if (!id) throw new TypeError(`${label} must not be empty`);
  if (id.length > MAX_NODE_ID_LENGTH) throw new TypeError(`${label} must be at most ${MAX_NODE_ID_LENGTH} characters`);
  for (let index = 0; index < id.length; index += 1) {
    const code = id.charCodeAt(index);
    if (code === 0 || code === 10 || code === 13) throw new TypeError(`${label} must be a single-line string`);
  }
  return id;
}

/**
 * @param {unknown} value
 * @returns {Padding}
 */
function parsePadding(value) {
  if (value == null) return { top: 0, right: 0, bottom: 0, left: 0 };
  if (typeof value === "number") {
    const p = assertNonNegativeFiniteNumber(value, "padding");
    return { top: p, right: p, bottom: p, left: p };
  }
  if (isPlainObject(value)) {
    const raw = /** @type {Record<string, unknown>} */ (value);
    return {
      top: raw.top != null ? assertNonNegativeFiniteNumber(raw.top, "padding.top") : 0,
      right: raw.right != null ? assertNonNegativeFiniteNumber(raw.right, "padding.right") : 0,
      bottom: raw.bottom != null ? assertNonNegativeFiniteNumber(raw.bottom, "padding.bottom") : 0,
      left: raw.left != null ? assertNonNegativeFiniteNumber(raw.left, "padding.left") : 0
    };
  }
  throw new TypeError("padding must be a number or an object with top/right/bottom/left");
}

/**
 * @param {unknown} node
 * @param {LayoutBox} bounds
 * @param {number} depth
 * @param {{ count: number }} counter
 * @returns {{ resolved: ResolvedNode, children: readonly LayoutTree[] }}
 */
function layoutNode(node, bounds, depth, counter) {
  if (depth > MAX_DEPTH) throw new RangeError(`maximum layout nesting depth of ${MAX_DEPTH} exceeded`);
  counter.count += 1;
  if (counter.count > MAX_NODES) throw new RangeError(`maximum layout node count of ${MAX_NODES} exceeded`);

  if (!isPlainObject(node)) {
    throw new TypeError("layout node must be an object");
  }

  const raw = /** @type {Record<string, unknown>} */ (node);
  const type = raw.type == null
    ? "container"
    : /** @type {"container" | "item"} */ (assertStringEnum(raw.type, "node.type", ["container", "item"]));
  const id = optionalNodeId(raw.id, `node_${counter.count}`, "node.id");

  const currentBox = {
    id,
    type,
    x: bounds.x,
    y: bounds.y,
    w: Math.max(0, bounds.w),
    h: Math.max(0, bounds.h),
    payload: raw.payload
  };

  if (type === "item") {
    return { resolved: Object.freeze(currentBox), children: [] };
  }

  // Container layout
  if (raw.children != null && !Array.isArray(raw.children)) {
    throw new TypeError("node.children must be an array");
  }
  const rawChildren = Array.isArray(raw.children) ? raw.children : [];
  if (rawChildren.length === 0) {
    return { resolved: Object.freeze(currentBox), children: [] };
  }

  const direction = raw.direction == null
    ? "horizontal"
    : /** @type {Direction} */ (assertStringEnum(raw.direction, "direction", ["horizontal", "vertical"]));
  const gap = raw.gap != null ? assertNonNegativeFiniteNumber(raw.gap, "gap") : 0;
  const padding = parsePadding(raw.padding);
  const alignItems = raw.alignItems == null
    ? "stretch"
    : /** @type {AlignItems} */ (assertStringEnum(raw.alignItems, "alignItems", ["start", "center", "end", "stretch"]));
  const justifyContent = raw.justifyContent == null
    ? "start"
    : /** @type {JustifyContent} */ (assertStringEnum(raw.justifyContent, "justifyContent", ["start", "center", "end", "space-between", "space-around"]));

  const innerX = bounds.x + padding.left;
  const innerY = bounds.y + padding.top;
  const innerW = Math.max(0, bounds.w - padding.left - padding.right);
  const innerH = Math.max(0, bounds.h - padding.top - padding.bottom);

  const isH = direction === "horizontal";
  const primarySpace = isH ? innerW : innerH;

  const totalGaps = gap * Math.max(0, rawChildren.length - 1);

  // Compute fixed sizes vs flex weights
  let totalFixed = 0;
  let totalFlex = 0;
  const childMetrics = rawChildren.map((child, idx) => {
    if (!isPlainObject(child)) {
      throw new TypeError(`child at index ${idx} must be an object`);
    }
    const c = /** @type {Record<string, unknown>} */ (child);
    const flex = c.flex != null ? assertNonNegativeFiniteNumber(c.flex, `child[${idx}].flex`) : 0;
    const fixedPrimary = isH
      ? (c.width != null ? assertNonNegativeFiniteNumber(c.width, `child[${idx}].width`) : null)
      : (c.height != null ? assertNonNegativeFiniteNumber(c.height, `child[${idx}].height`) : null);
    const fixedCross = isH
      ? (c.height != null ? assertNonNegativeFiniteNumber(c.height, `child[${idx}].height`) : null)
      : (c.width != null ? assertNonNegativeFiniteNumber(c.width, `child[${idx}].width`) : null);

    if (flex > 0) {
      totalFlex += flex;
    } else {
      totalFixed += fixedPrimary != null ? fixedPrimary : 0;
    }
    return { child, flex, fixedPrimary, fixedCross };
  });

  const remainingSpace = Math.max(0, primarySpace - totalGaps - totalFixed);
  const spacePerFlex = totalFlex > 0 ? remainingSpace / totalFlex : 0;

  // Allocate primary sizes
  const allocated = childMetrics.map((metric) => {
    const primarySize = metric.flex > 0
      ? metric.flex * spacePerFlex
      : (metric.fixedPrimary != null ? metric.fixedPrimary : 0);
    return { ...metric, primarySize };
  });

  // Handle justifyContent when totalFlex === 0
  let primaryOffset = isH ? innerX : innerY;
  let dynamicGap = gap;
  if (totalFlex === 0 && rawChildren.length > 0) {
    const unallocated = primarySpace - (totalFixed + totalGaps);
    if (unallocated > 0) {
      if (justifyContent === "center") {
        primaryOffset += unallocated / 2;
      } else if (justifyContent === "end") {
        primaryOffset += unallocated;
      } else if (justifyContent === "space-between" && rawChildren.length > 1) {
        dynamicGap = gap + unallocated / (rawChildren.length - 1);
      } else if (justifyContent === "space-around") {
        const extraPerEdge = unallocated / (rawChildren.length * 2);
        primaryOffset += extraPerEdge;
        dynamicGap = gap + unallocated / rawChildren.length;
      }
    }
  }

  // Resolve positions and recurse
  const children = [];
  for (const item of allocated) {
    const childPrimary = Math.round(item.primarySize * 100) / 100;
    let childCross = item.fixedCross != null ? item.fixedCross : (isH ? innerH : innerW);

    let crossPos = isH ? innerY : innerX;
    const maxCross = isH ? innerH : innerW;

    if (alignItems === "start") {
      childCross = item.fixedCross != null ? item.fixedCross : childCross;
    } else if (alignItems === "center") {
      crossPos += Math.max(0, (maxCross - childCross) / 2);
    } else if (alignItems === "end") {
      crossPos += Math.max(0, maxCross - childCross);
    } else if (alignItems === "stretch" && item.fixedCross == null) {
      childCross = maxCross;
    }

    const childBounds = isH
      ? { x: primaryOffset, y: crossPos, w: childPrimary, h: childCross }
      : { x: crossPos, y: primaryOffset, w: childCross, h: childPrimary };

    primaryOffset += childPrimary + dynamicGap;

    const childResult = layoutNode(item.child, childBounds, depth + 1, counter);
    children.push(childResult);
  }

  return {
    resolved: Object.freeze(currentBox),
    children: Object.freeze(children)
  };
}

/**
 * Flatten resolved layout tree into an array of items and containers.
 * @typedef {Object} LayoutTree
 * @property {ResolvedNode} resolved
 * @property {readonly LayoutTree[]} children
 */

/**
 * Flatten resolved layout tree into an array of items and containers.
 * @param {LayoutTree} layoutResult
 * @returns {readonly ResolvedNode[]}
 */
function flattenLayout(layoutResult) {
  const result = [layoutResult.resolved];
  for (const child of layoutResult.children) {
    result.push(...flattenLayout(child));
  }
  return Object.freeze(result);
}

/**
 * Solve an auto-layout tree and return all resolved nodes with absolute coordinates.
 * @param {unknown} rootNode
 * @param {LayoutBox} bounds
 * @returns {Readonly<{ tree: LayoutTree, flat: readonly ResolvedNode[], items: readonly ResolvedNode[], containers: readonly ResolvedNode[] }>}
 */
function resolveAutoLayout(rootNode, bounds) {
  if (!isPlainObject(bounds)) {
    throw new TypeError("bounds must be an object with x, y, w, h");
  }
  const x = assertFiniteNumber(bounds.x, "bounds.x");
  const y = assertFiniteNumber(bounds.y, "bounds.y");
  const w = assertNonNegativeFiniteNumber(bounds.w, "bounds.w");
  const h = assertNonNegativeFiniteNumber(bounds.h, "bounds.h");

  const counter = { count: 0 };
  const tree = layoutNode(rootNode, { x, y, w, h }, 0, counter);
  const flat = flattenLayout(tree);
  const items = Object.freeze(flat.filter((node) => node.type === "item"));
  const containers = Object.freeze(flat.filter((node) => node.type === "container"));

  return Object.freeze({
    tree,
    flat,
    items,
    containers
  });
}

module.exports = {
  flattenLayout,
  resolveAutoLayout
};
