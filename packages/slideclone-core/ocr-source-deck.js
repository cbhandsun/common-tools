// @ts-check
"use strict";

const MAX_OCR_LINES = 10000;
const MAX_IMAGE_DIMENSION = 16384;
const MAX_IMAGE_PIXELS = 40000000;
const GLYPH_MIN_CONFIDENCE = 0.8;
const GLYPH_HEIGHT_OUTLIER_RATIO = 2.5;

/** @typedef {{ x: number, y: number, w: number, h: number }} Box */
/** @typedef {{ text: string, box: Box, confidence: number }} OcrLine */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {string} value @param {boolean} allowTextWhitespace */
function hasControlCharacters(value, allowTextWhitespace = false) {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (allowTextWhitespace && [9, 10, 13].includes(code)) continue;
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** @template {{ text?: unknown }} T @param {T[]} lines @returns {T[]} */
function correctContextualOcrLines(lines) {
  if (!Array.isArray(lines) || lines.length > MAX_OCR_LINES) throw new TypeError("native image rebuild OCR lines are invalid");
  const hasCanonicalAiAgent = lines.some((line) => typeof line?.text === "string" && /\bAI\s*Agent\b/.test(line.text));
  if (!hasCanonicalAiAgent) return lines;
  return lines.map((line) => typeof line?.text === "string" && /\bAl\s+Agent\b/.test(line.text)
    ? { ...line, text: line.text.replace(/\bAl(?=\s+Agent\b)/g, "AI") }
    : line);
}

/** @param {unknown} value @returns {{widthPx: number, heightPx: number}} */
function parseDimensions(value) {
  if (!isRecord(value)) throw new TypeError("native image rebuild dimensions are invalid");
  const { widthPx, heightPx } = value;
  if (!finite(widthPx) || !finite(heightPx) || !Number.isSafeInteger(widthPx) || !Number.isSafeInteger(heightPx)
    || widthPx < 1 || heightPx < 1 || widthPx > MAX_IMAGE_DIMENSION || heightPx > MAX_IMAGE_DIMENSION || widthPx * heightPx > MAX_IMAGE_PIXELS) {
    throw new TypeError("native image rebuild dimensions are invalid");
  }
  return { widthPx, heightPx };
}

/** @param {unknown} value @returns {string} */
function parseSourcePath(value) {
  if (typeof value !== "string" || !value || value.length > 1024 || value.includes("\\") || value.includes(":") || hasControlCharacters(value)
    || value.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError("native image rebuild source path is invalid");
  }
  return value;
}

/** @param {unknown} value @param {{widthPx: number, heightPx: number}} dimensions @returns {OcrLine[]} */
function parseOcrLines(value, dimensions) {
  if (!isRecord(value) || !Array.isArray(value.lines)) throw new TypeError("native image rebuild OCR result is invalid");
  if (value.lines.length > MAX_OCR_LINES) throw new RangeError("native image rebuild OCR result exceeds limits");
  const lines = value.lines.map((line) => {
    if (!isRecord(line) || typeof line.text !== "string" || !line.text.trim() || line.text.length > 512
      || hasControlCharacters(line.text, true) || !isRecord(line.box)) {
      throw new TypeError("native image rebuild OCR result is invalid");
    }
    const { x, y, w, h } = line.box;
    if (!finite(x) || !finite(y) || !finite(w) || !finite(h) || x < 0 || y < 0 || w <= 0 || h <= 0
      || x + w > dimensions.widthPx || y + h > dimensions.heightPx) throw new RangeError("native image rebuild OCR box is invalid");
    const confidence = line.confidence === undefined ? 1 : line.confidence;
    if (!finite(confidence) || confidence < 0 || confidence > 1) throw new TypeError("native image rebuild OCR confidence is invalid");
    return { text: line.text, box: { x, y, w, h }, confidence };
  });
  return correctContextualOcrLines(lines);
}

/** @param {OcrLine[]} lines @returns {Set<OcrLine>} */
function uncertainOversizedGlyphs(lines) {
  const referenceHeights = lines.filter(line => line.confidence >= GLYPH_MIN_CONFIDENCE && Array.from(line.text.trim()).length > 1 && !/[\r\n]/u.test(line.text))
    .map(line => line.box.h).sort((left, right) => left - right);
  const median = referenceHeights[Math.floor(referenceHeights.length / 2)];
  if (referenceHeights.length < 4 || median === undefined) return new Set();
  return new Set(lines.filter(line => line.confidence < GLYPH_MIN_CONFIDENCE
    && Array.from(line.text.trim()).length === 1 && line.box.h > median * GLYPH_HEIGHT_OUTLIER_RATIO));
}

/** @param {unknown} input */
function boundedOcrSourceDeck(input) {
  if (!isRecord(input) || !isRecord(input.metadata)) throw new TypeError("native image rebuild dimensions are invalid");
  if (input.preserveUncertainGlyphs !== undefined && typeof input.preserveUncertainGlyphs !== "boolean") throw new TypeError("native image rebuild OCR glyph policy is invalid");
  const dimensions = parseDimensions(input.metadata.dimensions);
  const sourceImage = parseSourcePath(input.sourceImage);
  const lines = parseOcrLines(input.ocr, dimensions);
  const rasterGlyphs = input.preserveUncertainGlyphs === true ? uncertainOversizedGlyphs(lines) : new Set();
  const widthPt = 960;
  const heightPt = Math.max(72, Math.min(4000, Math.round(widthPt * dimensions.heightPx / dimensions.widthPx)));
  const scaleX = widthPt / dimensions.widthPx; const scaleY = heightPt / dimensions.heightPx;
  const textBoxes = lines.flatMap((line, index) => {
    if (rasterGlyphs.has(line)) return [];
    const box = { x: line.box.x * scaleX, y: line.box.y * scaleY, w: line.box.w * scaleX, h: line.box.h * scaleY };
    if (box.x + box.w > widthPt || box.y + box.h > heightPt) throw new RangeError("native image rebuild OCR box is invalid");
    return [{
      id: `p0-ocr-${String(index + 1).padStart(3, "0")}`,
      role: "body", text: line.text.trim(), box,
      font: { family: "Microsoft YaHei", sizePt: Math.max(6, Math.min(36, box.h * 0.72)), color: "#111111", opacity: 0, weight: "regular", align: "left", valign: "middle" },
      style: { visibility: "hidden", opacity: 0, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
      source: { pageImage: sourceImage, ocrProvider: "team-pinned-ocr", confidence: line.confidence, evidenceBox: box, editable: true, overlayVisibility: "hidden" }
    }];
  });
  return {
    version: "1.0",
    meta: { source: "team-raw-image", reconstructionMode: "native-hybrid", ocrAdmission: { inputLines: lines.length, editableLines: textBoxes.length, rasterFallbackGlyphs: rasterGlyphs.size } },
    slideSize: { widthPt, heightPt },
    pages: [{ pageIndex: 0, sourceImage, background: { fill: "#FFFFFF" }, textBoxes,
      shapes: emptyObjects(), images: emptyObjects(), tables: emptyObjects(), charts: emptyObjects(), icons: emptyObjects() }]
  };
}

/** @returns {unknown[]} */
function emptyObjects() { return []; }

module.exports = { boundedOcrSourceDeck, correctContextualOcrLines };
