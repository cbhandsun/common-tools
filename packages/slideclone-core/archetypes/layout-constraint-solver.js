// @ts-check
"use strict";

/**
 * @typedef {Object} Box
 * @property {number} x
 * @property {number} y
 * @property {number} w
 * @property {number} h
 */

/**
 * @typedef {"left" | "center" | "right" | "top" | "middle" | "bottom"} AlignmentMode
 * @typedef {"horizontal" | "vertical"} DistributionAxis
 */

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {Record<string, unknown>}
 */
function optionalRecord(value, label) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return /** @type {Record<string, unknown>} */ (value);
}

/**
 * Assert that a value is a valid bounding box with finite numbers.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {Box}
 */
function assertBox(value, label = "box") {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const candidate = /** @type {Record<string, unknown>} */ (value);
  const x = coerceFiniteNumber(candidate.x);
  const y = coerceFiniteNumber(candidate.y);
  const w = coerceFiniteNumber(candidate.w);
  const h = coerceFiniteNumber(candidate.h);

  if (![x, y, w, h].every(Number.isFinite)) {
    throw new TypeError(`${label} coordinates and dimensions must be finite numbers`);
  }
  if (w < 0 || h < 0) {
    throw new TypeError(`${label} width and height must be non-negative`);
  }
  return { x, y, w, h };
}

/**
 * Compute the bounding envelope that encloses all provided boxes.
 * @param {readonly unknown[]} boxes
 * @returns {Box}
 */
function computeEnvelope(boxes) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new TypeError("boxes must be a non-empty array");
  }
  const validated = boxes.map((box, idx) => assertBox(box, `boxes[${idx}]`));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const box of validated) {
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.w);
    maxY = Math.max(maxY, box.y + box.h);
  }

  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

/**
 * Align an array of boxes along a specified alignment edge or center.
 * @param {readonly unknown[]} boxes
 * @param {AlignmentMode} alignment
 * @param {unknown} [referenceBox]
 * @returns {Box[]}
 */
function alignBoxes(boxes, alignment, referenceBox = null) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new TypeError("boxes must be a non-empty array");
  }
  const validModes = new Set(["left", "center", "right", "top", "middle", "bottom"]);
  if (!validModes.has(alignment)) {
    throw new TypeError("invalid alignment mode");
  }

  const validated = boxes.map((b, i) => assertBox(b, `boxes[${i}]`));
  const ref = referenceBox != null ? assertBox(referenceBox, "referenceBox") : computeEnvelope(validated);

  return validated.map((box) => {
    let nx = box.x;
    let ny = box.y;
    switch (alignment) {
      case "left":
        nx = ref.x;
        break;
      case "center":
        nx = ref.x + (ref.w - box.w) / 2;
        break;
      case "right":
        nx = ref.x + ref.w - box.w;
        break;
      case "top":
        ny = ref.y;
        break;
      case "middle":
        ny = ref.y + (ref.h - box.h) / 2;
        break;
      case "bottom":
        ny = ref.y + ref.h - box.h;
        break;
    }
    return { x: nx, y: ny, w: box.w, h: box.h };
  });
}

/**
 * Distribute boxes evenly along an axis.
 * @param {readonly unknown[]} boxes
 * @param {DistributionAxis} axis
 * @param {{ gap?: number, bounds?: unknown }} [options]
 * @returns {Box[]}
 */
function distributeBoxes(boxes, axis, options = {}) {
  if (!Array.isArray(boxes) || boxes.length === 0) {
    throw new TypeError("boxes must be a non-empty array");
  }
  if (axis !== "horizontal" && axis !== "vertical") {
    throw new TypeError("invalid distribution axis");
  }
  const rawOptions = optionalRecord(options, "options");
  const validated = boxes.map((b, i) => assertBox(b, `boxes[${i}]`));
  if (validated.length === 1) {
    return [{ ...validated[0] }];
  }

  const container = rawOptions.bounds != null ? assertBox(rawOptions.bounds, "options.bounds") : computeEnvelope(validated);

  if (axis === "horizontal") {
    const totalItemWidth = validated.reduce((sum, b) => sum + b.w, 0);
    const availableSpace = container.w - totalItemWidth;
    const gap = rawOptions.gap != null
      ? coerceNonNegativeNumber(rawOptions.gap, "options.gap")
      : Math.max(0, availableSpace / (validated.length - 1));

    let currentX = container.x;
    return validated.map((box) => {
      const placed = { x: currentX, y: box.y, w: box.w, h: box.h };
      currentX += box.w + gap;
      return placed;
    });
  } else {
    const totalItemHeight = validated.reduce((sum, b) => sum + b.h, 0);
    const availableSpace = container.h - totalItemHeight;
    const gap = rawOptions.gap != null
      ? coerceNonNegativeNumber(rawOptions.gap, "options.gap")
      : Math.max(0, availableSpace / (validated.length - 1));

    let currentY = container.y;
    return validated.map((box) => {
      const placed = { x: box.x, y: currentY, w: box.w, h: box.h };
      currentY += box.h + gap;
      return placed;
    });
  }
}

/**
 * Solve a grid layout to position N items within a bounding container.
 * @param {unknown} container
 * @param {number} count
 * @param {{ cols?: number, rows?: number, gapX?: number, gapY?: number }} [options]
 * @returns {ReadonlyArray<Box & { index: number, row: number, col: number }>}
 */
function solveGridLayout(container, count, options = {}) {
  const bounds = assertBox(container, "container");
  const rawOptions = optionalRecord(options, "options");
  if (!Number.isInteger(count) || count < 1 || count > 500) {
    throw new TypeError("count must be an integer between 1 and 500");
  }

  let cols = rawOptions.cols != null ? coercePositiveInteger(rawOptions.cols, "grid cols") : 0;
  let rows = rawOptions.rows != null ? coercePositiveInteger(rawOptions.rows, "grid rows") : 0;

  if (cols > 0 && rows === 0) {
    rows = Math.ceil(count / cols);
  } else if (rows > 0 && cols === 0) {
    cols = Math.ceil(count / rows);
  } else if (cols === 0 && rows === 0) {
    cols = Math.ceil(Math.sqrt(count));
    rows = Math.ceil(count / cols);
  }

  if (cols < 1 || rows < 1) throw new TypeError("grid cols and rows must be positive integers");
  if (cols * rows < count) throw new TypeError("grid rows and cols must fit count");

  const gapX = rawOptions.gapX != null ? coerceNonNegativeNumber(rawOptions.gapX, "gapX") : 0;
  const gapY = rawOptions.gapY != null ? coerceNonNegativeNumber(rawOptions.gapY, "gapY") : 0;

  const totalGapX = gapX * Math.max(0, cols - 1);
  const totalGapY = gapY * Math.max(0, rows - 1);
  if (totalGapX > bounds.w) throw new TypeError("grid horizontal gaps must fit container width");
  if (totalGapY > bounds.h) throw new TypeError("grid vertical gaps must fit container height");

  const cellW = Math.max(0, (bounds.w - totalGapX) / cols);
  const cellH = Math.max(0, (bounds.h - totalGapY) / rows);

  /** @type {Array<Box & { index: number, row: number, col: number }>} */
  const cells = [];
  for (let idx = 0; idx < count; idx += 1) {
    const r = Math.floor(idx / cols);
    const c = idx % cols;
    const x = bounds.x + c * (cellW + gapX);
    const y = bounds.y + r * (cellH + gapY);
    cells.push({
      index: idx,
      row: r,
      col: c,
      x: Math.round(x * 100) / 100,
      y: Math.round(y * 100) / 100,
      w: Math.round(cellW * 100) / 100,
      h: Math.round(cellH * 100) / 100
    });
  }

  return Object.freeze(cells);
}

/**
 * Snap box coordinates and size to a discrete grid unit.
 * @param {unknown} box
 * @param {number} [gridSize]
 * @returns {Box}
 */
function snapBox(box, gridSize = 1) {
  const b = assertBox(box);
  const grid = coerceFiniteNumber(gridSize);
  if (!Number.isFinite(grid) || grid <= 0) {
    throw new TypeError("gridSize must be a positive number");
  }
  const snap = (/** @type {number} */ val) => Math.round(val / grid) * grid;
  return {
    x: snap(b.x),
    y: snap(b.y),
    w: Math.max(grid, snap(b.w)),
    h: Math.max(grid, snap(b.h))
  };
}

/**
 * @param {unknown} value
 * @returns {number}
 */
function coerceFiniteNumber(value) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return Number.NaN;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function coerceNonNegativeNumber(value, label) {
  const number = coerceFiniteNumber(value);
  if (!Number.isFinite(number) || number < 0) throw new TypeError(`${label} must be a non-negative finite number`);
  return number;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @returns {number}
 */
function coercePositiveInteger(value, label) {
  const number = coerceFiniteNumber(value);
  if (!Number.isInteger(number) || number < 1) throw new TypeError(`${label} must be a positive integer`);
  return number;
}

module.exports = {
  alignBoxes,
  assertBox,
  coerceFiniteNumber,
  computeEnvelope,
  distributeBoxes,
  optionalRecord,
  snapBox,
  solveGridLayout
};
