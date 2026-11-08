"use strict";

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} shape @param {unknown} slideSize */
function admitsSemanticPanelFill(shape, slideSize) {
  if (!record(shape) || !record(slideSize) || !record(shape.source) || !record(shape.box) || !record(shape.style)) return false;
  if (shape.type !== "rect" && shape.type !== "roundRect") return false;
  const source = shape.source;
  if (source.editable !== true || source.nativeRebuild !== true || source.semanticNativeStructure !== true || source.preserveResidualInterior !== true) return false;
  if (shape.hidden === true || source.hidden === true || shape.visible === false) return false;
  const style = shape.style;
  if ((style.opacity !== undefined && style.opacity !== 1) || (style.fillOpacity !== undefined && style.fillOpacity !== 1)) return false;
  const { x, y, w, h } = shape.box;
  const { widthPt, heightPt } = slideSize;
  if (typeof x !== "number" || typeof y !== "number" || typeof w !== "number" || typeof h !== "number" ||
      typeof widthPt !== "number" || typeof heightPt !== "number" ||
      ![x, y, w, h, widthPt, heightPt].every(Number.isFinite)) return false;
  if (widthPt <= 0 || heightPt <= 0 || x < 0 || y < 0 || w < 24 || h < 24 ||
      x + w > widthPt || y + h > heightPt || w * h < widthPt * heightPt * 0.01) return false;
  const fill = style.fill;
  if (typeof fill !== "string" || !/^#[0-9a-f]{6}$/i.test(fill)) return false;
  const channels = [1, 3, 5].map(offset => parseInt(fill.slice(offset, offset + 2), 16));
  return Math.min(...channels) >= 160 && Math.max(...channels) - Math.min(...channels) <= 70;
}

module.exports = { admitsSemanticPanelFill };
