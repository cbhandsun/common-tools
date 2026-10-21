"use strict";
// @ts-check

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} SlideSize */
/** @typedef {{id?: unknown,text?: unknown,box?: unknown,font?: unknown,style?: unknown,source?: unknown}} TextBox */
/** @typedef {{id:string,type:string,box:Box,style:Record<string, unknown>,source:Record<string, unknown>}} Shape */

const STATUS_PREFIX = /^\s*([✓✔√×✕✖])\s*/u;
const MAX_STATUS_COMPONENTS = 96;

/** @param {unknown} textBoxes @param {unknown} slideSize */
function createOcrStatusNativeComponents(textBoxes = [], slideSize = {}) {
  const parsedSlideSize = parseSlideSize(slideSize);
  const sourceTextBoxes = Array.isArray(textBoxes) ? textBoxes.filter(isTextBox) : [];
  if (!parsedSlideSize || sourceTextBoxes.length < 2) {
    return { shapes: [], textBoxes: sourceTextBoxes };
  }
  /** @type {Shape[]} */
  const shapes = [];
  /** @type {TextBox[]} */
  const rewritten = [];
  for (const textBox of sourceTextBoxes) {
    const text = String(textBox.text || "");
    const match = STATUS_PREFIX.exec(text);
    if (!match || shapes.length >= MAX_STATUS_COMPONENTS) {
      rewritten.push(textBox);
      continue;
    }
    const mark = match[1] || "";
    const remainder = text.slice(match[0].length).trimStart();
    const box = textBox.box;
    if (!isBox(box) || remainder.length < 1 || box.w < 12 || box.h < 5) {
      rewritten.push(textBox);
      continue;
    }
    const iconBox = statusIconBox(box, parsedSlideSize);
    const textShift = Math.min(Math.max(iconBox.w + 1.2, box.h * 0.72), Math.max(2, box.w * 0.36));
    const textBoxReplacement = clampBox({ x: box.x + textShift, y: box.y, w: box.w - textShift, h: box.h }, parsedSlideSize);
    if (!textBoxReplacement || textBoxReplacement.w < 4) {
      rewritten.push(textBox);
      continue;
    }
    const idBase = safeId(textBox.id || `ocr-status-${shapes.length + 1}`);
    shapes.push(...statusGlyphShapes(idBase, mark, iconBox));
    rewritten.push({
      ...textBox,
      id: `${idBase}-label`,
      text: remainder,
      box: roundBox(textBoxReplacement),
      source: {
        ...(isRecord(textBox.source) ? textBox.source : {}),
        editable: true,
        nativeRebuild: true,
        detector: "ocr-status-native-label",
        componentQualityBox: roundBox(textBoxReplacement),
        splitFromTextBoxId: String(textBox.id || "")
      }
    });
  }
  return { shapes, textBoxes: rewritten };
}

/** @param {string} idBase @param {string} mark @param {Box} box @returns {Shape[]} */
function statusGlyphShapes(idBase, mark, box) {
  const positive = mark !== "×" && mark !== "✕" && mark !== "✖";
  const color = positive ? "#16A34A" : "#E11D48";
  const strokeWidthPt = Math.max(0.8, Math.min(1.8, box.h * 0.16));
  const source = {
    editable: true,
    nativeRebuild: true,
    detector: "ocr-status-native-glyph",
    semanticNativeStructure: true,
    nativeComponentArchetype: "status-prefix",
    nativeComponentRole: positive ? "positive-status" : "negative-status"
  };
  if (positive) {
    return [
      lineShape(`${idBase}-status-check-a`, {
        x: box.x + box.w * 0.16,
        y: box.y + box.h * 0.55,
        w: box.w * 0.25,
        h: box.h * 0.24
      }, color, strokeWidthPt, source),
      lineShape(`${idBase}-status-check-b`, {
        x: box.x + box.w * 0.38,
        y: box.y + box.h * 0.78,
        w: box.w * 0.48,
        h: -box.h * 0.58
      }, color, strokeWidthPt, source)
    ];
  }
  return [
    lineShape(`${idBase}-status-cross-a`, {
      x: box.x + box.w * 0.18,
      y: box.y + box.h * 0.2,
      w: box.w * 0.64,
      h: box.h * 0.6
    }, color, strokeWidthPt, source),
    lineShape(`${idBase}-status-cross-b`, {
      x: box.x + box.w * 0.18,
      y: box.y + box.h * 0.8,
      w: box.w * 0.64,
      h: -box.h * 0.6
    }, color, strokeWidthPt, source)
  ];
}

/** @param {string} id @param {Box} box @param {string} color @param {number} strokeWidthPt @param {Record<string, unknown>} source @returns {Shape} */
function lineShape(id, box, color, strokeWidthPt, source) {
  return {
    id,
    type: "line",
    box: roundBox(box),
    style: {
      stroke: color,
      strokeWidthPt,
      connectorType: "straight"
    },
    source
  };
}

/** @param {Box} box @param {SlideSize} slideSize */
function statusIconBox(box, slideSize) {
  const size = Math.min(Math.max(5.5, box.h * 0.92), Math.max(5.5, box.w * 0.32));
  return roundBox(clampBox({
    x: box.x + Math.min(1, box.w * 0.04),
    y: box.y + Math.max(0, (box.h - size) / 2),
    w: size,
    h: size
  }, slideSize) || { x: box.x, y: box.y, w: size, h: size });
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {value is Box} */
function isBox(value) {
  if (!isRecord(value)) return false;
  return ["x", "y", "w", "h"].every((key) => Number.isFinite(Number(value[key])));
}

/** @param {unknown} value @returns {value is TextBox} */
function isTextBox(value) {
  return isRecord(value) && isBox(value.box);
}

/** @param {unknown} value @returns {SlideSize|null} */
function parseSlideSize(value) {
  if (!isRecord(value)) return null;
  const widthPt = Number(value.widthPt);
  const heightPt = Number(value.heightPt);
  if (!Number.isFinite(widthPt) || !Number.isFinite(heightPt) || widthPt < 100 || heightPt < 100) return null;
  return { widthPt, heightPt };
}

/** @param {Box} box @param {SlideSize} slideSize */
function clampBox(box, slideSize) {
  const x = clamp(box.x, 0, slideSize.widthPt);
  const y = clamp(box.y, 0, slideSize.heightPt);
  const x2 = clamp(box.x + box.w, x + 0.1, slideSize.widthPt);
  const y2 = clamp(box.y + box.h, y + 0.1, slideSize.heightPt);
  return { x, y, w: x2 - x, h: y2 - y };
}

/** @param {Box} box */
function roundBox(box) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/** @param {number} value */
function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

/** @param {unknown} value */
function safeId(value) {
  const id = String(value || "ocr-status").replace(/[^a-z0-9_-]+/giu, "-").replace(/^-+|-+$/gu, "");
  return id || "ocr-status";
}

module.exports = { createOcrStatusNativeComponents };
