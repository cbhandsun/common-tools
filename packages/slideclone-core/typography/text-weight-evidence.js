// @ts-check
"use strict";

const { measureTextInkGeometry } = require("./text-ink-geometry");
const { planMeasuredSingleLineTextFit } = require("./measured-text-fit");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */

/** @param {Raster} image @param {Box} box @param {number[]} color @param {{widthPt:number,heightPt:number}} size */
function coverage(image, box, color, size) {
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  const left = Math.max(0, Math.floor(box.x * sx)), right = Math.min(image.width, Math.ceil((box.x + box.w) * sx));
  const top = Math.max(0, Math.floor(box.y * sy)), bottom = Math.min(image.height, Math.ceil((box.y + box.h) * sy));
  let pixels = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = (y * image.width + x) * 4;
    if ((image.rgba[offset + 3] ?? 0) >= 160 && color.every((c, i) => Math.abs((image.rgba[offset + i] ?? 255) - c) <= 65)) pixels++;
  }
  return { pixels, area: (right - left) * (bottom - top) };
}

/** Candidate evidence only: density cannot establish a font weight without a re-render.
 * @param {unknown} input
 */
function measureTextWeightEvidence(input) {
  const geometry = measureTextInkGeometry(input);
  if (!record(input) || !record(input.slideSize) || !Array.isArray(input.textBoxes)) throw new TypeError("text weight evidence is invalid");
  const source = /** @type {Raster} */ (input.sourceImage), rendered = /** @type {Raster} */ (input.renderedImage);
  const size = /** @type {{widthPt:number,heightPt:number}} */ (input.slideSize);
  const texts = new Map(input.textBoxes.filter(record).map(t => [t.id, t]));
  const evidence = [];
  let samples = 0;
  for (const measurement of geometry.measurements) {
    const text = texts.get(measurement.id);
    if (!text || !record(text.font) || typeof text.font.color !== "string") continue;
    const hex = text.font.color;
    const color = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
    if (Math.min(...color) > 160) continue;
    // Bound the extra density scan by the already validated geometry windows.
    samples += Math.ceil(measurement.source.w * source.width / size.widthPt + 2) * Math.ceil(measurement.source.h * source.height / size.heightPt + 2)
      + Math.ceil(measurement.rendered.w * rendered.width / size.widthPt + 2) * Math.ceil(measurement.rendered.h * rendered.height / size.heightPt + 2);
    if (samples > 20_000_000) throw new RangeError("text weight sampling exceeds the processing boundary");
    const frameA = Array.isArray(text.positionedRuns) && record(text.box) ? /** @type {Box} */ (text.box) : measurement.source;
    const frameB = Array.isArray(text.positionedRuns) && record(text.box) ? /** @type {Box} */ (text.box) : measurement.rendered;
    const a = coverage(source, frameA, color, size), b = coverage(rendered, frameB, color, size);
    if (a.pixels < 40 || b.pixels < 40 || a.area <= 0 || b.area <= 0) continue;
    const ratio = (a.pixels / a.area) / (b.pixels / b.area);
    if (!Number.isFinite(ratio) || ratio <= 0 || ratio > 4) continue;
    evidence.push({ ...measurement, coverageRatio: ratio });
  }
  return evidence;
}

/** @param {unknown} input */
function planEvidenceTextWeightFit(input) {
  if (!record(input) || !Array.isArray(input.textBoxes) || input.textBoxes.length > 2000 ||
      !Array.isArray(input.evidence) || input.evidence.length > 2000) throw new TypeError("text weight plan is invalid");
  if (input.fitGeometry !== undefined && typeof input.fitGeometry !== "boolean") throw new TypeError("text weight geometry mode is invalid");
  planMeasuredSingleLineTextFit({ slideSize: input.slideSize, textBoxes: input.textBoxes, measurements: input.evidence });
  /** @type {Map<string, Record<string, unknown> & {coverageRatio:number}>} */
  const byId = new Map();
  for (const item of input.evidence) {
    if (!record(item) || typeof item.id !== "string" || [...item.id].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) || typeof item.coverageRatio !== "number" || !Number.isFinite(item.coverageRatio)) throw new TypeError("text weight evidence row is invalid");
    if (byId.has(item.id)) throw new TypeError("text weight evidence ids are ambiguous");
    byId.set(item.id, { ...item, coverageRatio: item.coverageRatio });
  }
  /** @type {string[]} */
  const targetIds = [];
  const weighted = input.textBoxes.map(text => {
    if (!record(text) || typeof text.id !== "string" || !record(text.font) || !record(text.source) || !record(text.style)) return text;
    const item = byId.get(text.id);
    const bold = ["bold", "700", "800", "900"].includes(String(text.font.weight));
    const regular = text.font.weight === undefined || ["regular", "normal", "400"].includes(String(text.font.weight));
    // OCR starts without a weight claim. The same measured density mismatch
    // must work in both directions; regular text previously had no candidate
    // even when the actual source strokes were substantially denser. This is
    // a proposal only: the existing render, local rollback and global gates
    // still decide whether the change can be retained.
    const cjkCount = (String(text.text || "").match(/[\u3400-\u9fff]/gu) || []).length;
    const maxRatio = bold ? (cjkCount >= 6 ? 0.84 : 0.78) : (cjkCount >= 8 && Number(text.font.sizePt) < 17 ? 0.65 : 0.75);
    const densityRatio = item && (bold ? item.coverageRatio : regular ? 1 / item.coverageRatio : 0);
    if (!item || !densityRatio || densityRatio < 0.35 || densityRatio > maxRatio || Array.isArray(text.runs) || text.source.textWeightEvidenceFit ||
        text.source.editable !== true || text.style.visibility !== "visible" || text.style.opacity === 0 || text.font.opacity === 0 ||
        typeof text.source.confidence !== "number" || !Number.isFinite(text.source.confidence) || text.source.confidence < 0.8 || text.source.confidence > 1 ||
        typeof text.text !== "string" || !text.text || text.text.length > 512 || /[\r\n]/u.test(text.text) || text.style.wrap !== false ||
        typeof text.font.sizePt !== "number" || !Number.isFinite(text.font.sizePt) || text.font.sizePt < 6 || text.font.sizePt > 96) return text;
    targetIds.push(String(text.id));
    const nextWeight = bold ? "regular" : "bold";
    const positionedRuns = Array.isArray(text.positionedRuns)
      ? text.positionedRuns.map(r => record(r) && record(r.fontOverride) && "weight" in r.fontOverride ? { ...r, fontOverride: { ...r.fontOverride, weight: nextWeight } } : r)
      : undefined;
    return { ...text, font: { ...text.font, weight: nextWeight }, ...(positionedRuns ? { positionedRuns } : {}), source: { ...text.source,
      textWeightEvidenceFit: { provider: "source-rendered-ink-density-v1", coverageRatio: item.coverageRatio } } };
  });
  const measured = input.fitGeometry === true && targetIds.length
    ? planMeasuredSingleLineTextFit({ slideSize: input.slideSize, textBoxes: weighted, measurements: input.evidence, targetIds })
    : { textBoxes: weighted };
  return { textBoxes: measured.textBoxes, changedTextBoxes: targetIds.length, targetIds };
}

module.exports = { measureTextWeightEvidence, planEvidenceTextWeightFit };
