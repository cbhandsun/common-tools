// @ts-check
"use strict";
const {reframePositionedText}=require('./positioned-text-reframe');

const MAX_ITEMS = 2000;
const MAX_SLIDE_DIMENSION = 100000;
const MAX_ID_LENGTH = 256;
const MAX_TEXT_LENGTH = 512;
const MAX_CANDIDATE_LIMIT = 2000;
const SEGMENTED_OCR_MAX_FONT_TO_EVIDENCE_RATIO = 0.82;
const SEGMENTED_OCR_MAX_FONT_GROWTH_RATIO = 1.08;

/** @typedef {{x: number, y: number, w: number, h: number}} Bounds */
/** @typedef {{source: Bounds, rendered: Bounds}} Measurement */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

/** @param {unknown} value @param {string} message @returns {Record<string, unknown>} */
function requiredRecord(value, message) {
  if (!record(value)) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message @returns {unknown[]} */
function boundedList(value, message) {
  if (!Array.isArray(value) || value.length > MAX_ITEMS) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message */
function finite(value, message) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {string} message @returns {number | null} */
function optionalCount(value, message) {
  if (value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > MAX_CANDIDATE_LIMIT) throw new RangeError(message);
  return value;
}

/** @param {unknown} value @returns {Set<string> | null} */
function optionalTargetIds(value) {
  if (value === undefined) return null;
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_CANDIDATE_LIMIT) throw new TypeError("measured text fit target ids are invalid");
  const result = new Set();
  for (const item of value) result.add(identifier(item, "measured text fit target id is invalid"));
  if (result.size !== value.length) throw new TypeError("measured text fit target ids are ambiguous");
  return result;
}

/** @param {unknown} value @param {string} message */
function identifier(value, message) {
  if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH) throw new TypeError(message);
  return value;
}

/** @param {unknown} value @param {{widthPt: number, heightPt: number}} slideSize @param {string} message @returns {Bounds} */
function box(value, slideSize, message) {
  const entry = requiredRecord(value, message);
  const x = finite(entry.x, message), y = finite(entry.y, message), w = finite(entry.w, message), h = finite(entry.h, message);
  if (x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > slideSize.widthPt || y + h > slideSize.heightPt) throw new RangeError(message);
  return { x, y, w, h };
}

/** @param {unknown} value */
function slide(value) {
  const entry = requiredRecord(value, "measured text fit slide size is invalid");
  const widthPt = finite(entry.widthPt, "measured text fit slide size is invalid");
  const heightPt = finite(entry.heightPt, "measured text fit slide size is invalid");
  if (widthPt <= 0 || heightPt <= 0 || widthPt > MAX_SLIDE_DIMENSION || heightPt > MAX_SLIDE_DIMENSION) throw new RangeError("measured text fit slide size is invalid");
  return { widthPt, heightPt };
}

/** @param {unknown} value @param {{widthPt: number, heightPt: number}} slideSize */
function measurements(value, slideSize) {
  /** @type {Map<string, Measurement>} */
  const result = new Map();
  for (const item of boundedList(value, "measured text fit measurements are invalid")) {
    const entry = requiredRecord(item, "measured text fit measurement is invalid");
    const id = identifier(entry.id, "measured text fit measurement id is invalid");
    if (result.has(id)) throw new TypeError("measured text fit measurement ids are ambiguous");
    result.set(id, { source: box(entry.source, slideSize, "measured text fit source bounds are invalid"), rendered: box(entry.rendered, slideSize, "measured text fit rendered bounds are invalid") });
  }
  return result;
}

/** @param {Record<string, unknown>} text @param {{widthPt: number, heightPt: number}} slideSize */
function eligible(text, slideSize) {
  if (typeof text.text !== "string" || text.text.length < 1 || text.text.length > MAX_TEXT_LENGTH || /[\r\n]/u.test(text.text)) return null;
  if (text.rotation !== undefined && (typeof text.rotation !== "number" || !Number.isFinite(text.rotation) || text.rotation !== 0)) return null;
  const style = record(text.style) ? text.style : null;
  const source = record(text.source) ? text.source : null;
  const font = record(text.font) ? text.font : null;
  const measuredEvidenceFit = record(source?.ocrEvidenceFit);
  const measuredOcrText = source?.ocrProvider !== undefined
    || source?.ocrRecoveredFromLineTextCrop === true
    || source?.ocrRecoveredFromNativeLineTextShape === true;
  if (!style || !source || !font || style.visibility !== "visible" || style.wrap !== false
    || (style.fit === "shrink" && !measuredEvidenceFit && !measuredOcrText)
    || (style.opacity !== undefined && (typeof style.opacity !== "number" || !Number.isFinite(style.opacity) || style.opacity <= 0))
    || (font.opacity !== undefined && (typeof font.opacity !== "number" || !Number.isFinite(font.opacity) || font.opacity <= 0))
    || source.editable !== true || typeof source.confidence !== "number" || !Number.isFinite(source.confidence) || source.confidence < 0.8 || source.confidence > 1
    || !["left", "center", "right"].includes(String(font.align || "left")) || font.valign !== "middle") return null;
  const sizePt = font.sizePt;
  if (typeof sizePt !== "number" || !Number.isFinite(sizePt) || sizePt < 6 || sizePt > 96) return null;
  try {
    return {
      box: box(text.box, slideSize, "measured text fit text box is invalid"),
      sizePt,
      maxSizePt: segmentedOcrMaxSizePt(source, sizePt),
      segmentGroupId: segmentedOcrGroupId(source),
      align: String(font.align || "left"),
      highConfidenceOcrShrink: style.fit === "shrink" && (measuredEvidenceFit || measuredOcrText),
      measuredOcrText
    };
  }
  catch { return null; }
}

/** @param {Record<string, unknown> | null} source @param {number} currentSizePt */
function segmentedOcrMaxSizePt(source, currentSizePt) {
  if (!source || typeof source.segmentedOcrLineId !== "string" || !source.segmentedOcrLineId) return null;
  if (!record(source.evidenceBox)) return null;
  const evidenceHeight = source.evidenceBox.h;
  if (typeof evidenceHeight !== "number" || !Number.isFinite(evidenceHeight) || evidenceHeight <= 0) return null;
  return Math.max(6, round(Math.min(
    evidenceHeight * SEGMENTED_OCR_MAX_FONT_TO_EVIDENCE_RATIO,
    currentSizePt * SEGMENTED_OCR_MAX_FONT_GROWTH_RATIO
  )));
}

/** @param {Record<string, unknown> | null} source */
function segmentedOcrGroupId(source) {
  const value = source?.segmentedOcrLineId;
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null;
}

/** @param {Bounds} textBox @param {string} align */
function horizontalAnchor(textBox, align) {
  if (align === "center") return textBox.x + textBox.w / 2;
  if (align === "right") return textBox.x + textBox.w;
  return textBox.x;
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }

/** @param {number} value */
function round(value) { return Math.round(value * 100) / 100; }

/** @param {Bounds} value */
function center(value) { return { x: value.x + value.w / 2, y: value.y + value.h / 2 }; }

/** @param {number} value */
function safeLogDelta(value) { return Number.isFinite(value) && value > 0 ? Math.abs(Math.log(value)) : 0; }

/** @param {Bounds} source @param {Bounds} rendered */
function localMismatchEvidence(source, rendered) {
  const sourceCenter = center(source);
  const renderedCenter = center(rendered);
  const sourceDiagonal = Math.sqrt(Math.max(1, source.w * source.w + source.h * source.h));
  const centerDeltaX = sourceCenter.x - renderedCenter.x;
  const centerDeltaY = sourceCenter.y - renderedCenter.y;
  const centerDeltaRatio = Math.sqrt(centerDeltaX * centerDeltaX + centerDeltaY * centerDeltaY) / sourceDiagonal;
  const widthRatio = source.w / rendered.w;
  const heightRatio = source.h / rendered.h;
  const areaRatio = (source.w * source.h) / (rendered.w * rendered.h);
  const ratioDelta = safeLogDelta(widthRatio) * 0.55 + safeLogDelta(heightRatio) * 0.35 + safeLogDelta(areaRatio) * 0.10;
  return {
    sourceCenter,
    renderedCenter,
    centerDeltaX: round(centerDeltaX),
    centerDeltaY: round(centerDeltaY),
    centerDeltaRatio,
    widthRatio,
    heightRatio,
    areaRatio,
    localMismatchScore: ratioDelta + centerDeltaRatio
  };
}

/**
 * Keeps positioned segments from one OCR line atomic when a ranked candidate
 * limit is used. Partial line updates can improve one local box while making
 * the reconstructed sentence discontinuous.
 * @param {{index:number,score:number,segmentGroupId:string|null}[]} planned
 * @param {number | null} candidateLimit
 */
function selectPlannedChanges(planned, candidateLimit) {
  if (candidateLimit === null) return planned;
  const grouped = new Map();
  const units = [];
  for (const change of planned) {
    if (change.segmentGroupId === null) {
      units.push({ changes: [change], score: change.score, index: change.index });
      continue;
    }
    let unit = grouped.get(change.segmentGroupId);
    if (!unit) {
      unit = { changes: [], score: 0, index: change.index };
      grouped.set(change.segmentGroupId, unit);
      units.push(unit);
    }
    unit.changes.push(change);
    unit.score = Math.max(unit.score, change.score);
    unit.index = Math.min(unit.index, change.index);
  }
  units.sort((left, right) => right.score - left.score || left.index - right.index);
  const selected = [];
  for (const unit of units) {
    if (unit.changes.length > candidateLimit - selected.length) continue;
    selected.push(...unit.changes);
    if (selected.length === candidateLimit) break;
  }
  return selected.sort((left, right) => left.index - right.index);
}

/**
 * Plans conservative, measurement-backed adjustments for visible editable single-line text.
 * Rejected text retains its identity; accepted frames also transform absolute positioned children.
 * @param {unknown} input
 */
function planMeasuredSingleLineTextFit(input) {
  const request = requiredRecord(input, "measured text fit request is invalid");
  const slideSize = slide(request.slideSize);
  const textBoxes = boundedList(request.textBoxes, "measured text fit text boxes are invalid");
  const byId = measurements(request.measurements, slideSize);
  const candidateLimit = optionalCount(request.candidateLimit, "measured text fit candidate limit is invalid");
  const targetIds = optionalTargetIds(request.targetIds);
  const ids = new Set();
  for (const item of textBoxes) {
    const text = requiredRecord(item, "measured text fit text box is invalid");
    const id = identifier(text.id, "measured text fit text box id is invalid");
    if (ids.has(id)) throw new TypeError("measured text fit text box ids are ambiguous");
    ids.add(id);
  }

  let candidates = 0;
  /** @type {{id: string, index: number, sizeRatio: number, measuredSizeRatio: number, widthScale: number, heightScale: number, dx: number, dy: number, dw: number, dh: number, sizePt: number, score: number, segmentGroupId: string|null, localMismatchScore: number, centerDeltaX: number, centerDeltaY: number, widthRatio: number, heightRatio: number, areaRatio: number}[]} */
  const planned = [];
  for (let index = 0; index < textBoxes.length; index += 1) {
    const item = textBoxes[index];
    const text = /** @type {Record<string, unknown>} */ (item);
    const admissible = eligible(text, slideSize);
    const measurement = byId.get(/** @type {string} */ (text.id));
    if (!admissible || !measurement) continue;
    candidates += 1;

    const widthRatio = measurement.source.w / measurement.rendered.w;
    const heightRatio = measurement.source.h / measurement.rendered.h;
    const mismatch = localMismatchEvidence(measurement.source, measurement.rendered);
    if (widthRatio < 0.45 || widthRatio > 2.5 || heightRatio < 0.45 || heightRatio > 2.5) continue;
    const growsToSource = widthRatio >= 1.08 && heightRatio >= 1.08 && Math.max(widthRatio, heightRatio) / Math.min(widthRatio, heightRatio) <= 1.7;
    const shrinksToSource = widthRatio <= 0.92 && heightRatio <= 0.92 && Math.max(widthRatio, heightRatio) / Math.min(widthRatio, heightRatio) <= 1.7;
    const mostlyHeightFit = heightRatio >= 0.72 && heightRatio <= 1.45 && (widthRatio <= 0.88 || widthRatio >= 1.12);
    const modestOcrHeightFit = (admissible.highConfidenceOcrShrink || admissible.measuredOcrText) && heightRatio >= 1.06 && heightRatio <= 1.45
      && widthRatio >= 0.96 && widthRatio <= 1.12 && mismatch.localMismatchScore >= 0.09;
    const modestOcrGrowth = admissible.measuredOcrText && widthRatio >= 1.025 && widthRatio < 1.08
      && heightRatio >= 1.06 && heightRatio <= 1.15 && heightRatio / widthRatio <= 1.1;
    const positionOnlyOcrFit = admissible.measuredOcrText && widthRatio >= 0.96 && widthRatio <= 1.04
      && heightRatio >= 0.94 && heightRatio <= 1.06
      && (Math.abs(mismatch.centerDeltaX) >= 0.5 || Math.abs(mismatch.centerDeltaY) >= 0.5);
    if (!growsToSource && !shrinksToSource && !mostlyHeightFit && !modestOcrHeightFit && !modestOcrGrowth && !positionOnlyOcrFit) continue;
    const measuredSizeRatio = positionOnlyOcrFit ? 1 : growsToSource || modestOcrGrowth ? Math.min(widthRatio, heightRatio)
      : shrinksToSource ? Math.max(widthRatio, heightRatio)
      : clamp(heightRatio, 0.72, 1.45);
    const uncappedSizePt = round(admissible.sizePt * measuredSizeRatio);
    const sizePt = admissible.maxSizePt === null ? uncappedSizePt : Math.min(uncappedSizePt, admissible.maxSizePt);
    const sizeRatio = sizePt / admissible.sizePt;
    const maxWidthScale = admissible.highConfidenceOcrShrink ? 2.1 : 1.45;
    const widthScale = positionOnlyOcrFit ? 1 : clamp(widthRatio / sizeRatio, 0.7, maxWidthScale);
    const heightScale = positionOnlyOcrFit ? 1 : clamp(heightRatio / sizeRatio, 0.82, 1.22);
    const anchorX = horizontalAnchor(admissible.box, admissible.align);
    const anchorY = admissible.box.y + admissible.box.h / 2;
    const nextW = admissible.box.w * widthScale;
    const nextH = admissible.box.h * heightScale;
    const nextLeft = admissible.align === "center" ? anchorX - nextW / 2 : admissible.align === "right" ? anchorX - nextW : anchorX;
    const nextTop = anchorY - nextH / 2;
    const inkDx = measurement.source.x - (anchorX + (measurement.rendered.x - anchorX) * sizeRatio);
    const inkDy = measurement.source.y - (anchorY + (measurement.rendered.y - anchorY) * sizeRatio);
    if (Math.abs(inkDx) > 8 || Math.abs(inkDy) > 6) continue;
    // Preserve alignment anchors when the frame changes; ink translation is separate.
    const dx = nextLeft - admissible.box.x + inkDx;
    const dy = nextTop - admissible.box.y + inkDy;
    const nextBox = { x: admissible.box.x + dx, y: admissible.box.y + dy, w: nextW, h: nextH };
    if (sizePt > 96 || nextBox.x < 0 || nextBox.y < 0 || nextBox.x + nextBox.w > slideSize.widthPt || nextBox.y + nextBox.h > slideSize.heightPt) continue;
    const changedGeometry = Math.abs(widthScale - 1) >= 0.025 || Math.abs(heightScale - 1) >= 0.025;
    const changedFont = Math.abs(sizeRatio - 1) >= 0.025;
    if (!changedGeometry && !changedFont && Math.abs(dx) < 0.35 && Math.abs(dy) < 0.35) continue;
    const score = (mismatch.localMismatchScore + Math.abs(Math.log(sizeRatio)) + Math.abs(Math.log(widthScale)) * 0.65 + Math.abs(Math.log(heightScale)) * 0.35)
      * Math.sqrt(Math.max(1, measurement.source.w * measurement.source.h));
    planned.push({
      id: /** @type {string} */ (text.id),
      index,
      sizeRatio,
      measuredSizeRatio,
      widthScale,
      heightScale,
      dx,
      dy,
      dw: nextW - admissible.box.w,
      dh: nextH - admissible.box.h,
      sizePt,
      score,
      segmentGroupId: admissible.segmentGroupId,
      localMismatchScore: round(mismatch.localMismatchScore),
      centerDeltaX: mismatch.centerDeltaX,
      centerDeltaY: mismatch.centerDeltaY,
      widthRatio: round(mismatch.widthRatio),
      heightRatio: round(mismatch.heightRatio),
      areaRatio: round(mismatch.areaRatio)
    });
  }
  const eligiblePlanned = targetIds === null ? planned : planned.filter((change) => targetIds.has(change.id));
  const selected = selectPlannedChanges(eligiblePlanned, candidateLimit);
  const selectedByIndex = new Map(selected.map((change) => [change.index, change]));
  const next = textBoxes.map((item, index) => {
    const change = selectedByIndex.get(index);
    if (!change) return item;
    const text = /** @type {Record<string, unknown>} */ (item);
    const currentBox = /** @type {Bounds} */ (text.box);
    return {
      ...reframePositionedText(text, { ...currentBox, x: currentBox.x + change.dx, y: currentBox.y + change.dy, w: currentBox.w + change.dw, h: currentBox.h + change.dh }),
      font: { .../** @type {Record<string, unknown>} */ (text.font), sizePt: change.sizePt }
    };
  });
  const changes = selected.map(({ score: _score, ...change }) => change);
  return { textBoxes: next, evidence: { candidates, accepted: changes.length }, changes };
}

/** Independent glyph-height and advance candidate for plain, non-autofit OCR text.
 * Actual rendering and whole-object local rollback are required before adoption.
 * @param {unknown} input
 */
function planMeasuredSingleLineTextSpacing(input) {
  const request = requiredRecord(input, "measured text spacing request is invalid");
  const slideSize = slide(request.slideSize);
  const textBoxes = boundedList(request.textBoxes, "measured text spacing text boxes are invalid");
  const byId = measurements(request.measurements, slideSize);
  const candidateLimit = optionalCount(request.candidateLimit, "measured text spacing candidate limit is invalid");
  const targetIds = optionalTargetIds(request.targetIds);
  // Reuse the public planner's identity and eligibility boundary, without its geometry.
  planMeasuredSingleLineTextFit({ slideSize, textBoxes, measurements: [] });
  const planned = [];
  for (const [index, item] of textBoxes.entries()) {
    const text = /** @type {Record<string, unknown>} */ (item), id = /** @type {string} */ (text.id);
    const admissible = eligible(text, slideSize), measured = byId.get(id);
    if (!admissible || !measured || !admissible.measuredOcrText || admissible.segmentGroupId !== null
      || (targetIds !== null && !targetIds.has(id)) || Array.isArray(text.runs)) continue;
    const style = /** @type {Record<string, unknown>} */ (text.style);
    const font = /** @type {Record<string, unknown>} */ (text.font);
    const source = /** @type {Record<string, unknown>} */ (text.source);
    if (String(style.fit || "").toLowerCase() === "shrink" || (text.wrap !== undefined && text.wrap !== false)
      || /** @type {number} */ (source.confidence) < 0.9) continue;
    const content = /** @type {string} */ (text.text);
    if (!/^[\p{Script=Han}\p{Punctuation}\x20-\x7E]+$/u.test(content)) continue;
    const glyphs = Array.from(content).length;
    if (glyphs < 3 || glyphs > 128) continue;
    const widthRatio = measured.source.w / measured.rendered.w, heightRatio = measured.source.h / measured.rendered.h;
    if (widthRatio < 0.94 || widthRatio > 1.06 || heightRatio < 0.75 || heightRatio > 1.3
      || (heightRatio > 0.94 && heightRatio < 1.06)) continue;
    const currentSpacing = font.characterSpacingPt ?? 0;
    if (typeof currentSpacing !== "number" || !Number.isFinite(currentSpacing) || Math.abs(currentSpacing) > 12) continue;
    const sizePt = round(admissible.sizePt * heightRatio), sizeRatio = sizePt / admissible.sizePt;
    if (sizePt < 6 || sizePt > 96) continue;
    const spacingDelta = (measured.source.w - measured.rendered.w * sizeRatio) / (glyphs - 1);
    const spacingPt = round(currentSpacing + spacingDelta);
    if (Math.abs(spacingDelta) > Math.min(4, sizePt * 0.18) || Math.abs(spacingPt) > 12) continue;
    const anchorX = horizontalAnchor(admissible.box, admissible.align), anchorY = admissible.box.y + admissible.box.h / 2;
    const spacingWidth = spacingDelta * (glyphs - 1);
    const alignmentShift = admissible.align === "center" ? -spacingWidth / 2 : admissible.align === "right" ? -spacingWidth : 0;
    const dx = measured.source.x - (anchorX + (measured.rendered.x - anchorX) * sizeRatio + alignmentShift);
    const dy = measured.source.y - (anchorY + (measured.rendered.y - anchorY) * sizeRatio);
    if (Math.abs(dx) > 8 || Math.abs(dy) > 6) continue;
    const nextBox = { ...admissible.box, x: admissible.box.x + dx, y: admissible.box.y + dy };
    if (nextBox.x < 0 || nextBox.y < 0 || nextBox.x + nextBox.w > slideSize.widthPt || nextBox.y + nextBox.h > slideSize.heightPt) continue;
    planned.push({ id, index, box: nextBox, sizePt, characterSpacingPt: spacingPt,
      score: Math.abs(Math.log(heightRatio)) * Math.sqrt(measured.source.w * measured.source.h), segmentGroupId: null });
  }
  const selected = selectPlannedChanges(planned, candidateLimit), byIndex = new Map(selected.map(change => [change.index, change]));
  return {
    textBoxes: textBoxes.map((item, index) => {
      const change = byIndex.get(index);
      if (!change) return item;
      const text = /** @type {Record<string, unknown>} */ (item);
      return { ...reframePositionedText(text,change.box), font: { .../** @type {Record<string, unknown>} */ (text.font), sizePt: change.sizePt, characterSpacingPt: change.characterSpacingPt } };
    }),
    changes: selected.map(({ score: _score, segmentGroupId: _group, ...change }) => change)
  };
}

module.exports = { planMeasuredSingleLineTextFit, planMeasuredSingleLineTextSpacing };
