// @ts-check
"use strict";
const crypto = require("node:crypto");
const { types } = require("node:util");
const { planMeasuredSingleLineTextFit } = require("./measured-text-fit");
const { isSimpleOwnedText, isOwnedTextEligible } = require("./owned-text-eligibility");
const { parseOwnedTextResiduals, hasOwnedTextInternalResidual } = require("./owned-text-residual");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value */
function profile(value) {
  if (!record(value) || typeof value.rendererId !== "string" || !["render-libreoffice", "render-powerpoint-com"].includes(value.rendererId)
    || typeof value.version !== "string" || !value.version || value.version.length > 128
    || !finite(value.dpi) || value.dpi < 16 || value.dpi > 600
    || !Number.isSafeInteger(value.pixelWidth) || !Number.isSafeInteger(value.pixelHeight)
    || !finite(value.pixelWidth) || !finite(value.pixelHeight) || value.pixelWidth < 1 || value.pixelHeight < 1
    || value.pixelWidth > 16384 || value.pixelHeight > 16384 || value.pixelWidth * value.pixelHeight > 40_000_000
    || typeof value.runtimeHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.runtimeHash)
    || typeof value.sourceHash !== "string" || !/^[a-f0-9]{64}$/u.test(value.sourceHash)) throw new TypeError("owned text renderer profile is invalid");
  return { rendererId: value.rendererId, version: value.version, dpi: value.dpi, pixelWidth: value.pixelWidth,
    pixelHeight: value.pixelHeight, runtimeHash: value.runtimeHash, sourceHash: value.sourceHash };
}

/** Bind complete target metadata, not just the text string, to an isolated render.
 * @param {unknown} text
 */
function textProbeRevision(text) {
  if (!record(text)) throw new TypeError("owned text revision is invalid");
  const encoded = JSON.stringify({ id: text.id, text: text.text, role: text.role, box: text.box, font: text.font,
    style: text.style, source: text.source, runs: text.runs, rotation: text.rotation, wrap: text.wrap });
  if (encoded.length > 131072) throw new RangeError("owned text revision exceeds the processing boundary");
  return crypto.createHash("sha256").update(encoded).digest("hex");
}

/** @param {unknown} value @param {{widthPt:number,heightPt:number}} size @returns {Box} */
function bounds(value, size) {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w <= 0 || value.h <= 0 || value.x + value.w > size.widthPt || value.y + value.h > size.heightPt)
    throw new TypeError("owned text ink bounds are invalid");
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}

/** @param {unknown} input */
function ownedRequest(input) {
  if (!record(input) || !Array.isArray(input.textBoxes) || input.textBoxes.length > 2000
    || !Array.isArray(input.measurements) || input.measurements.length > 2000 || !record(input.slideSize)
    || !finite(input.slideSize.widthPt) || !finite(input.slideSize.heightPt)) throw new TypeError("owned text advance request is invalid");
  const size = { widthPt: input.slideSize.widthPt, heightPt: input.slideSize.heightPt };
  // Reuse identity, frame and slide admission, without suggesting frame-based width corrections.
  planMeasuredSingleLineTextFit({ slideSize: size, textBoxes: input.textBoxes, measurements: [] });
  const expectedProfile = profile(input.renderProfile);
  if (Math.abs((expectedProfile.pixelWidth / expectedProfile.pixelHeight) / (size.widthPt / size.heightPt) - 1) > 0.01)
    throw new TypeError("owned text renderer aspect ratio is invalid");
  /** @type {Map<string,{source:Box,rendered:Box,revision:string,eligible:boolean}>} */
  const evidence = new Map();
  for (const row of input.measurements) {
    if (!record(row) || typeof row.id !== "string" || !row.id || row.id.length > 256
      || typeof row.textRevision !== "string" || !/^[a-f0-9]{64}$/u.test(row.textRevision)) throw new TypeError("owned text evidence is invalid");
    if (evidence.has(row.id)) throw new TypeError("owned text evidence ids are ambiguous");
    const observedProfile = profile(row.renderProfile);
    evidence.set(row.id, { source: bounds(row.source, size), rendered: bounds(row.rendered, size), revision: row.textRevision,
      eligible: row.sourceComplete === true && row.renderedComplete === true && row.renderedOwnership === "isolated"
        && JSON.stringify(expectedProfile) === JSON.stringify(observedProfile) });
  }
  return { size, evidence, textBoxes: input.textBoxes, residuals: parseOwnedTextResiduals(input.residualEvidence), sourceHash: expectedProfile.sourceHash };
}


/** Width-only native advance correction requires complete, revision-bound isolated glyph evidence.
 * This never changes font size, frame dimensions, content, or glyph representation.
 * @param {unknown} input
 */
function planOwnedTextAdvanceFit(input) {
  const { size, evidence, textBoxes: originals } = ownedRequest(input);
  /** @type {{id:string,characterSpacingPt:number,dx:number,dy:number}[]} */
  const changes = [];
  const textBoxes = originals.map(item => {
    const text = /** @type {Record<string,unknown>} */ (item);
    const measured = evidence.get(/** @type {string} */ (text.id));
    if (!measured?.eligible || measured.revision !== textProbeRevision(text) || !isOwnedTextEligible(text) || !record(text.font) || !record(text.style) || !record(text.source)) return item;
    const font = text.font, style = text.style, source = text.source, content = text.text;
    if (!isSimpleOwnedText(content)
      || content.includes("\n") || content.includes("\r") || Array.isArray(text.runs) || (text.rotation !== undefined && text.rotation !== 0)
      || style.visibility !== "visible" || style.wrap !== false || (text.wrap !== undefined && text.wrap !== false)
      || style.textWarp !== undefined || String(style.fit || "").toLowerCase() === "shrink" || source.editable !== true
      || !finite(source.confidence) || source.confidence < 0.9 || source.confidence > 1
      || typeof source.ocrProvider !== "string" || !source.ocrProvider || source.ocrProvider.length > 256
      || source.segmentedOcrLineId !== undefined || !finite(font.sizePt) || font.sizePt < 6 || font.sizePt > 96
      || font.valign !== "middle" || !["left", "center", "right"].includes(String(font.align || "left"))
      || (style.opacity !== undefined && (!finite(style.opacity) || style.opacity <= 0))
      || (font.opacity !== undefined && (!finite(font.opacity) || font.opacity <= 0))) return item;
    const count = Array.from(content).length;
    if (count < 3 || count > 128) return item;
    const heightRatio = measured.source.h / measured.rendered.h;
    if (heightRatio < 0.94 || heightRatio > 1.06) return item;
    const current = font.characterSpacingPt ?? 0;
    if (!finite(current) || Math.abs(current) > 12) return item;
    const delta = (measured.source.w - measured.rendered.w) / (count - 1);
    const characterSpacingPt = Math.round((current + delta) * 100) / 100;
    if (Math.abs(delta) > Math.min(4, font.sizePt * 0.18) || Math.abs(characterSpacingPt) > 12 || Math.abs(delta) < 0.025) return item;
    const widthDelta = delta * (count - 1);
    const alignShift = font.align === "center" ? -widthDelta / 2 : font.align === "right" ? -widthDelta : 0;
    const dx = measured.source.x - measured.rendered.x - alignShift, dy = measured.source.y - measured.rendered.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 6) return item;
    const box = bounds(text.box, size), next = { ...box, x: box.x + dx, y: box.y + dy };
    if (next.x < 0 || next.y < 0 || next.x + next.w > size.widthPt || next.y + next.h > size.heightPt) return item;
    changes.push({ id: /** @type {string} */ (text.id), characterSpacingPt, dx, dy });
    return { ...text, box: next, font: { ...font, characterSpacingPt } };
  });
  return { textBoxes, changes };
}

/** Native editable text geometry, never a picture or glyph outline. Always requires a real render and local rollback.
 * @param {unknown} input
 */
function planOwnedTextWarpFit(input) {
  const { size, evidence, textBoxes: originals, residuals, sourceHash } = ownedRequest(input);
  /** @type {{id:string,box:Box,textWarp:string}[]} */
  const changes = [];
  const textBoxes = originals.map(item => {
    const text = /** @type {Record<string,unknown>} */ (item), measured = evidence.get(/** @type {string} */ (text.id));
    if (!measured?.eligible || measured.revision !== textProbeRevision(text) || !isOwnedTextEligible(text) || !record(text.style) || !record(text.source) || !record(text.font)) return item;
    const style = text.style, source = text.source, font = text.font;
    if (typeof text.text !== "string" || text.text.length < 3 || text.text.length > 128
      || !isSimpleOwnedText(text.text) || /[\r\n]/u.test(text.text)
      || Array.isArray(text.runs) || (text.rotation !== undefined && text.rotation !== 0)
      || style.visibility !== "visible" || style.wrap !== false || (text.wrap !== undefined && text.wrap !== false)
      || style.textWarp !== undefined || String(style.fit || "").toLowerCase() === "shrink" || source.editable !== true
      || !finite(source.confidence) || source.confidence < 0.9 || source.confidence > 1
      || typeof source.ocrProvider !== "string" || !source.ocrProvider || source.ocrProvider.length > 256
      || source.segmentedOcrLineId !== undefined || !finite(font.sizePt) || font.sizePt < 6 || font.sizePt > 96
      || (font.characterSpacingPt !== undefined && font.characterSpacingPt !== 0)
      || (style.opacity !== undefined && (!finite(style.opacity) || style.opacity <= 0))
      || (font.opacity !== undefined && (!finite(font.opacity) || font.opacity <= 0))) return item;
    const sx = measured.source.w / measured.rendered.w, sy = measured.source.h / measured.rendered.h;
    const internalResidual = hasOwnedTextInternalResidual(residuals.get(/** @type {string} */ (text.id)), measured.revision, sourceHash);
    if (sx < 0.75 || sx > 1.4 || sy < 0.75 || sy > 1.4
      || (!internalResidual && Math.abs(sx - 1) < 0.06 && Math.abs(sy - 1) < 0.06)) return item;
    const box = bounds(text.box, size);
    if (Math.abs(measured.source.x - box.x) > 8 || Math.abs(measured.source.y - box.y) > 6) return item;
    const next = { ...measured.source };
    changes.push({ id: /** @type {string} */ (text.id), box: next, textWarp: "textPlain" });
    return { ...text, box: next, style: { ...style, textWarp: "textPlain" } };
  });
  return { textBoxes, changes };
}

/** Choose font or native warp from the same original revision, never from a modified proposal.
 * @param {unknown} input
 */
function planOwnedTextFit(input) {
  const { size, evidence, textBoxes } = ownedRequest(input);
  const trusted = [];
  for (const item of textBoxes) {
    const text = /** @type {Record<string,unknown>} */ (item), measured = evidence.get(/** @type {string} */ (text.id));
    if (!measured?.eligible || measured.revision !== textProbeRevision(text) || !isOwnedTextEligible(text) || !record(text.source) || !record(text.style)
      || !finite(text.source.confidence) || text.source.confidence < 0.9 || text.source.confidence > 1
      || typeof text.source.ocrProvider !== "string" || !text.source.ocrProvider
      || text.source.nativeComponentGroupId !== undefined || text.style.nativeComponentGroupId !== undefined
      || text.source.segmentedOcrLineId !== undefined || text.style.textWarp !== undefined || Array.isArray(text.runs)
      || !isSimpleOwnedText(text.text)) continue;
    const heightRatio = measured.source.h / measured.rendered.h;
    // A narrower frame does not change glyph advance. Reserve width-only mismatch for native text warp.
    if (heightRatio < 0.94 || heightRatio > 1.06) trusted.push({ id: text.id, source: measured.source, rendered: measured.rendered });
  }
  const geometry = planMeasuredSingleLineTextFit({ slideSize: size, textBoxes, measurements: trusted });
  const warp = planOwnedTextWarpFit(input);
  const warpIds = new Set(warp.changes.map(change => change.id));
  // Frame width cannot counteract font-driven glyph advance. Use an already bounded native warp instead.
  const geometryChanges = geometry.changes.filter(change => !warpIds.has(change.id) || Math.abs(change.widthScale - 1) < 0.12);
  const geometryIds = new Set(geometryChanges.map(change => change.id));
  const warpById = new Map(warp.textBoxes.map(text => [/** @type {Record<string,unknown>} */ (text).id, text]));
  return { textBoxes: geometry.textBoxes.map(text => geometryIds.has(/** @type {Record<string,unknown>} */ (text).id)
    ? text : warpById.get(/** @type {Record<string,unknown>} */ (text).id) || text),
  changes: [...geometryChanges, ...warp.changes.filter(change => !geometryIds.has(change.id))] };
}

module.exports = { planOwnedTextAdvanceFit, planOwnedTextWarpFit, planOwnedTextFit, textProbeRevision };
