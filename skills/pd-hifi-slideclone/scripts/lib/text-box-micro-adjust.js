"use strict";

const fs = require("fs");
const { readPng } = require("./png");

function suggestTextBoxMicroAdjustments(options = {}) {
  const page = options.page || {};
  const textCoveragePage = options.textCoveragePage || {};
  const paddingPt = Number(options.paddingPt ?? 16);
  const maxMovePt = Number(options.maxMovePt ?? 3);
  const maxHeightAdjustPt = Number(options.maxHeightAdjustPt ?? 2.5);
  const maxWidthAdjustPt = Number(options.maxWidthAdjustPt ?? 3);
  const minCoverage = Number(options.minCoverage ?? 0.995);
  const minDeltaPt = Number(options.minDeltaPt ?? 0.15);
  const inspectAligned = options.inspectAligned === true;
  const readPngImpl = options.readPng || readPng;
  const boxes = Array.isArray(textCoveragePage.boxes) ? textCoveragePage.boxes : [];
  const textBoxes = new Map((page.textBoxes || []).map((item) => [item.id, item]));
  const suggestions = [];

  for (const result of boxes) {
    const textBox = textBoxes.get(result.elementId);
    if (!textBox || result.ok !== true) continue;
    if (!shouldInspect(result, { minCoverage, inspectAligned })) continue;
    if (!result.sourceCropImage || !result.renderedCropImage) continue;
    if (!fs.existsSync(result.sourceCropImage) || !fs.existsSync(result.renderedCropImage)) continue;

    let sourceImage;
    let renderedImage;
    try {
      sourceImage = readPngImpl(result.sourceCropImage);
      renderedImage = readPngImpl(result.renderedCropImage);
    } catch {
      continue;
    }

    const sourceInk = findInkBounds(sourceImage);
    const renderedInk = findInkBounds(renderedImage);
    if (!sourceInk || !renderedInk) continue;

    const sourceCenter = centerRatio(sourceInk, sourceImage);
    const renderedCenter = centerRatio(renderedInk, renderedImage);
    const evidenceBox = isBox(result.evidenceBox) ? result.evidenceBox : textBox.source?.evidenceBox;
    const referenceBox = isBox(evidenceBox) ? evidenceBox : textBox.box;
    const cropWidthPt = Math.max(1, referenceBox.w + paddingPt * 2);
    const cropHeightPt = Math.max(1, referenceBox.h + paddingPt * 2);
    const dx = clamp(round((sourceCenter.x - renderedCenter.x) * cropWidthPt), -maxMovePt, maxMovePt);
    const dy = clamp(round((sourceCenter.y - renderedCenter.y) * cropHeightPt), -maxMovePt, maxMovePt);

    const sourceHeightRatio = sourceInk.h / Math.max(1, sourceImage.height);
    const renderedHeightRatio = renderedInk.h / Math.max(1, renderedImage.height);
    const sourceWidthRatio = sourceInk.w / Math.max(1, sourceImage.width);
    const renderedWidthRatio = renderedInk.w / Math.max(1, renderedImage.width);
    const heightScale = renderedHeightRatio > 0 ? sourceHeightRatio / renderedHeightRatio : 1;
    const widthScale = renderedWidthRatio > 0 ? sourceWidthRatio / renderedWidthRatio : 1;
    const currentSizePt = Number(textBox.font?.sizePt);
    const suggestedFontSizePt = Number.isFinite(currentSizePt)
      ? clamp(round(currentSizePt * clamp(heightScale, 0.94, 1.06)), currentSizePt - 1.5, currentSizePt + 1.5)
      : null;
    const fontSizePt = Number.isFinite(suggestedFontSizePt) && Number.isFinite(currentSizePt)
      ? Math.max(currentSizePt, suggestedFontSizePt)
      : suggestedFontSizePt;
    const suggestedBoxHeightPt = clamp(
      round(textBox.box.h + (sourceHeightRatio - renderedHeightRatio) * cropHeightPt * 0.65),
      textBox.box.h - maxHeightAdjustPt,
      textBox.box.h + maxHeightAdjustPt
    );
    const boxHeightPt = Math.max(textBox.box.h, suggestedBoxHeightPt);
    const suggestedBoxWidthPt = clamp(
      round(textBox.box.w + (sourceWidthRatio - renderedWidthRatio) * cropWidthPt * 0.65),
      textBox.box.w - maxWidthAdjustPt,
      textBox.box.w + maxWidthAdjustPt
    );
    const boxWidthPt = Math.max(textBox.box.w, suggestedBoxWidthPt);
    const lineHeightMultiple = shouldAdjustLineHeight(textBox, sourceHeightRatio, renderedHeightRatio)
      ? suggestedLineHeightMultiple(textBox, heightScale)
      : null;
    const valign = shouldUseMiddleValign(textBox, sourceCenter, renderedCenter, minDeltaPt)
      ? "middle"
      : null;

    const reasons = [];
    if (Math.abs(dx) >= minDeltaPt) reasons.push(`x offset ${dx}pt`);
    if (Math.abs(dy) >= minDeltaPt) reasons.push(`y offset ${dy}pt`);
    if (fontSizePt !== null && Math.abs(fontSizePt - currentSizePt) >= 0.1) {
      reasons.push(`font ${round(fontSizePt - currentSizePt)}pt`);
    }
    if (Math.abs(boxHeightPt - textBox.box.h) >= minDeltaPt) {
      reasons.push(`height ${round(boxHeightPt - textBox.box.h)}pt`);
    }
    if (Math.abs(boxWidthPt - textBox.box.w) >= minDeltaPt) {
      reasons.push(`width ${round(boxWidthPt - textBox.box.w)}pt`);
    }
    if (lineHeightMultiple !== null) {
      reasons.push(`line height ${lineHeightMultiple}`);
    }
    if (valign) {
      reasons.push(`vertical ${valign}`);
    }
    if (reasons.length === 0) continue;

    suggestions.push({
      elementId: textBox.id,
      dx,
      dy,
      fontSizePt,
      boxHeightPt,
      boxWidthPt,
      lineHeightMultiple,
      valign,
      reason: `Auto micro-adjust from OCR crop alignment (${reasons.join(", ")}).`,
      metrics: {
        textCoverage: result.textCoverage ?? null,
        expectedCoverage: result.expectedCoverage ?? null,
        sourceHeightRatio: round(sourceHeightRatio),
        renderedHeightRatio: round(renderedHeightRatio),
        sourceWidthRatio: round(sourceWidthRatio),
        renderedWidthRatio: round(renderedWidthRatio)
      }
    });
  }

  return suggestions;
}

function applyTextBoxMicroAdjustments(ir, compareTextCoverage, options = {}) {
  const nextIr = JSON.parse(JSON.stringify(ir || {}));
  const textCoverageByPage = new Map((compareTextCoverage?.pages || []).map((page) => [page.pageIndex, page]));
  const enabled = options.enabled !== false;
  if (!enabled) {
    return { ir: nextIr, changes: [], changed: false, perPage: [] };
  }

  const perPage = [];
  for (const page of nextIr.pages || []) {
    const suggestions = suggestTextBoxMicroAdjustments({
      ...options,
      page,
      textCoveragePage: textCoverageByPage.get(page.pageIndex)
    });
    const pageChanges = [];
    for (const adjustment of suggestions) {
      const textBox = (page.textBoxes || []).find((item) => item.id === adjustment.elementId);
      if (!textBox) continue;
      if (Math.abs(adjustment.dx) >= (options.minDeltaPt ?? 0.15)
        || Math.abs(adjustment.dy) >= (options.minDeltaPt ?? 0.15)) {
        const before = { ...textBox.box };
        textBox.box.x = round(textBox.box.x + adjustment.dx);
        textBox.box.y = round(textBox.box.y + adjustment.dy);
        pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
      }
      if (typeof adjustment.fontSizePt === "number") {
        const before = textBox.font?.sizePt;
        textBox.font = textBox.font || {};
        if (before !== adjustment.fontSizePt) {
          textBox.font.sizePt = adjustment.fontSizePt;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.sizePt", before, adjustment.fontSizePt, adjustment.reason));
        }
      }
      if (typeof adjustment.boxHeightPt === "number") {
        const before = { ...textBox.box };
        if (before.h !== adjustment.boxHeightPt) {
          textBox.box.h = adjustment.boxHeightPt;
          pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
        }
      }
      if (typeof adjustment.boxWidthPt === "number") {
        const before = { ...textBox.box };
        if (before.w !== adjustment.boxWidthPt) {
          textBox.box.w = adjustment.boxWidthPt;
          pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
        }
      }
      if (typeof adjustment.lineHeightMultiple === "number") {
        const before = textBox.font?.lineHeightMultiple;
        textBox.font = textBox.font || {};
        if (before !== adjustment.lineHeightMultiple) {
          textBox.font.lineHeightMultiple = adjustment.lineHeightMultiple;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.lineHeightMultiple", before, adjustment.lineHeightMultiple, adjustment.reason));
        }
      }
      if (adjustment.valign) {
        const before = textBox.font?.valign;
        textBox.font = textBox.font || {};
        if (before !== adjustment.valign) {
          textBox.font.valign = adjustment.valign;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.valign", before, adjustment.valign, adjustment.reason));
        }
      }
    }
    perPage.push({
      pageIndex: page.pageIndex,
      suggestions,
      changes: pageChanges
    });
  }

  return applyTextBoxSuggestionSet(ir, perPage, {
    minDeltaPt: options.minDeltaPt ?? 0.15
  });
}

function applyTextBoxEvidenceFit(ir, compareTextCoverage, options = {}) {
  const nextIr = JSON.parse(JSON.stringify(ir || {}));
  const paddingPt = Number(options.paddingPt ?? 1);
  const minDeltaPt = Number(options.minDeltaPt ?? 0.15);
  const coverageByPage = new Map((compareTextCoverage?.pages || []).map((page) => [page.pageIndex, page]));
  const changes = [];
  const perPage = [];

  for (const page of nextIr.pages || []) {
    const pageChanges = [];
    const boxes = coverageByPage.get(page.pageIndex)?.boxes || [];
    const byId = new Map(boxes.map((item) => [item.elementId, item]));
    for (const textBox of page.textBoxes || []) {
      const result = byId.get(textBox.id);
      const evidence = result?.evidenceBox || textBox.source?.evidenceBox;
      if (!isEvidenceFitCandidate(textBox, evidence)) continue;
      const before = { ...textBox.box };
      const target = {
        x: round(Math.max(0, evidence.x - paddingPt)),
        y: round(Math.max(0, evidence.y - paddingPt)),
        w: round(Math.max(1, evidence.w + paddingPt * 2)),
        h: round(Math.max(1, evidence.h + paddingPt * 2))
      };
      if (!boxChanged(before, target, minDeltaPt)) continue;
      textBox.box = target;
      const reason = "Evidence-box fit for a single-line editable text box; visual gate must confirm no clipping.";
      const entry = change(page.pageIndex, textBox.id, "box", before, target, reason);
      pageChanges.push(entry);
      changes.push(entry);
    }
    perPage.push({ pageIndex: page.pageIndex, changes: pageChanges });
  }
  return { ir: nextIr, changes, changed: changes.length > 0, perPage };
}

function fitHighConfidenceSingleLineOcrToEvidence(textBoxes = [], options = {}) {
  const minConfidence = Number(options.minConfidence ?? 0.9);
  const paddingPt = Number(options.paddingPt ?? 0);
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => {
    const evidence = textBox?.source?.evidenceBox;
    const confidence = Number(textBox?.source?.confidence);
    const currentSizePt = Number(textBox?.font?.sizePt);
    const hasCurrentSize = Number.isFinite(currentSizePt) && currentSizePt >= 6 && currentSizePt <= 60;
    const family = String(textBox?.font?.family || "");
    const text = String(textBox?.text || "");
    if (!isEvidenceFitCandidate(textBox, evidence)
      || !textBox?.source?.ocrProvider
      || textBox?.source?.overlayVisibility !== "visible"
      || textBox?.source?.detector
      || !Number.isFinite(confidence) || confidence < minConfidence
      || (family && !/Microsoft YaHei|SimHei|DengXian/i.test(family))) return textBox;

    const widthRatio = evidence.w / Math.max(1, textBox.box.w);
    if (widthRatio > 1.25 || widthRatio < 0.65) return textBox;
    const units = estimatedTextWidthUnits(text);
    if (units <= 0) return textBox;
    const weight = String(textBox?.font?.weight || "").toLowerCase();
    // LibreOffice does not consistently honor DrawingML shrink-to-fit. Keep a
    // measured safety edge for mixed CJK/Latin runs so an explicit no-wrap box
    // remains single-line in both PowerPoint and LibreOffice.
    const metricFactor = weight === "bold" || Number(weight) >= 600 ? 1.18 : 1.15;
    const evidenceSizePt = clamp(Math.min(
      evidence.w / (units * metricFactor),
      evidence.h * 1.1
    ), 6, 60);
    const fittedSizePt = hasCurrentSize
      ? clamp(round(evidenceSizePt), currentSizePt * 0.75, currentSizePt * 1.02)
      : round(evidenceSizePt);
    const geometryNeedsFit = widthRatio <= 0.97;
    const fontNeedsFit = !hasCurrentSize || fittedSizePt < currentSizePt * 0.98;
    if (!geometryNeedsFit && !fontNeedsFit) return textBox;
    return {
      ...textBox,
      box: {
        x: round(Math.max(0, evidence.x - paddingPt)),
        y: round(Math.max(0, evidence.y - paddingPt)),
        w: round(Math.max(1, evidence.w + paddingPt * 2)),
        h: round(Math.max(1, evidence.h + paddingPt * 2))
      },
      font: {
        ...(textBox.font || {}),
        family: family || "Microsoft YaHei",
        sizePt: fittedSizePt,
        valign: "middle"
      },
      style: { ...(textBox.style || {}), wrap: false, fit: "shrink" },
      source: {
        ...(textBox.source || {}),
        ocrEvidenceFit: {
          provider: "single-line-ocr-evidence-fit-v1",
          originalBox: { ...textBox.box },
          originalSizePt: hasCurrentSize ? currentSizePt : null,
          fittedSizePt
        }
      }
    };
  });
}

function estimatedTextWidthUnits(text) {
  let units = 0;
  for (const character of Array.from(String(text || ""))) {
    if (/\s/.test(character)) units += 0.3;
    else if (/[\x00-\x7f]/.test(character)) units += 0.55;
    else if (/[，。：“”‘’「」『』：；、（）()]/.test(character)) units += 0.65;
    else units += 1;
  }
  return units;
}

function applyTextBoxSuggestionSet(ir, perPage = [], options = {}) {
  const nextIr = JSON.parse(JSON.stringify(ir || {}));
  const moveScale = Number.isFinite(Number(options.moveScale)) ? Number(options.moveScale) : 1;
  const fontScale = Number.isFinite(Number(options.fontScale)) ? Number(options.fontScale) : 1;
  const heightScale = Number.isFinite(Number(options.heightScale)) ? Number(options.heightScale) : 1;
  const widthScale = Number.isFinite(Number(options.widthScale)) ? Number(options.widthScale) : 1;
  const lineHeightScale = Number.isFinite(Number(options.lineHeightScale)) ? Number(options.lineHeightScale) : 1;
  const valignEnabled = options.valignEnabled !== false;
  const minDeltaPt = Number(options.minDeltaPt ?? 0.15);
  const changes = [];
  const pagesByIndex = new Map((nextIr.pages || []).map((page) => [page.pageIndex, page]));
  const nextPerPage = [];

  for (const entry of perPage || []) {
    const page = pagesByIndex.get(entry.pageIndex);
    if (!page) continue;
    const pageChanges = [];
    for (const adjustment of entry.suggestions || []) {
      const textBox = (page.textBoxes || []).find((item) => item.id === adjustment.elementId);
      if (!textBox) continue;
      const scaledDx = round((adjustment.dx || 0) * moveScale);
      const scaledDy = round((adjustment.dy || 0) * moveScale);
      if (Math.abs(scaledDx) >= minDeltaPt || Math.abs(scaledDy) >= minDeltaPt) {
        const before = { ...textBox.box };
        textBox.box.x = round(textBox.box.x + scaledDx);
        textBox.box.y = round(textBox.box.y + scaledDy);
        pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
      }
      if (typeof adjustment.fontSizePt === "number" && textBox.font && typeof textBox.font.sizePt === "number") {
        const before = textBox.font.sizePt;
        const delta = adjustment.fontSizePt - before;
        const nextSizePt = Math.max(1, round(before + delta * fontScale));
        if (Math.abs(nextSizePt - before) >= 0.1) {
          textBox.font.sizePt = nextSizePt;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.sizePt", before, nextSizePt, adjustment.reason));
        }
      }
      if (typeof adjustment.boxHeightPt === "number") {
        const before = { ...textBox.box };
        const delta = adjustment.boxHeightPt - before.h;
        const nextHeightPt = Math.max(1, round(before.h + delta * heightScale));
        if (Math.abs(nextHeightPt - before.h) >= minDeltaPt) {
          textBox.box.h = nextHeightPt;
          pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
        }
      }
      if (typeof adjustment.boxWidthPt === "number") {
        const before = { ...textBox.box };
        const delta = adjustment.boxWidthPt - before.w;
        const nextWidthPt = Math.max(1, round(before.w + delta * widthScale));
        if (Math.abs(nextWidthPt - before.w) >= minDeltaPt) {
          textBox.box.w = nextWidthPt;
          pageChanges.push(change(page.pageIndex, textBox.id, "box", before, { ...textBox.box }, adjustment.reason));
        }
      }
      if (typeof adjustment.lineHeightMultiple === "number") {
        textBox.font = textBox.font || {};
        const before = Number(textBox.font.lineHeightMultiple || 1);
        const delta = adjustment.lineHeightMultiple - before;
        const nextLineHeight = clamp(round(before + delta * lineHeightScale), 0.75, 1.5);
        if (Math.abs(nextLineHeight - before) >= 0.01) {
          textBox.font.lineHeightMultiple = nextLineHeight;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.lineHeightMultiple", before, nextLineHeight, adjustment.reason));
        }
      }
      if (valignEnabled && adjustment.valign) {
        textBox.font = textBox.font || {};
        const before = textBox.font.valign;
        if (before !== adjustment.valign) {
          textBox.font.valign = adjustment.valign;
          pageChanges.push(change(page.pageIndex, textBox.id, "font.valign", before, adjustment.valign, adjustment.reason));
        }
      }
    }
    nextPerPage.push({
      pageIndex: entry.pageIndex,
      suggestions: entry.suggestions || [],
      changes: pageChanges
    });
    changes.push(...pageChanges);
  }

  return {
    ir: nextIr,
    changes,
    changed: changes.length > 0,
    perPage: nextPerPage
  };
}

function shouldInspect(result, minCoverage) {
  const inspectAligned = minCoverage?.inspectAligned === true;
  const threshold = Number(minCoverage?.minCoverage ?? minCoverage);
  const textCoverage = Number(result.textCoverage);
  const expectedCoverage = Number(result.expectedCoverage);
  if (Number.isFinite(textCoverage) && textCoverage < threshold) return true;
  if (Number.isFinite(expectedCoverage) && expectedCoverage < threshold) return true;
  return inspectAligned;
}

function findInkBounds(image) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4;
      if (!isInkPixel(image.rgba, offset)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return {
    x: minX,
    y: minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}

function centerRatio(bounds, image) {
  return {
    x: (bounds.x + bounds.w / 2) / Math.max(1, image.width),
    y: (bounds.y + bounds.h / 2) / Math.max(1, image.height)
  };
}

function shouldAdjustLineHeight(textBox, sourceHeightRatio, renderedHeightRatio) {
  const lineCount = String(textBox.text || "").split(/\r?\n/).filter(Boolean).length;
  if (lineCount < 2 && typeof textBox.font?.lineHeightMultiple !== "number") return false;
  return Math.abs(sourceHeightRatio - renderedHeightRatio) >= 0.025;
}

function suggestedLineHeightMultiple(textBox, heightScale) {
  const current = Number(textBox.font?.lineHeightMultiple || 1);
  return clamp(round(current * clamp(heightScale, 0.9, 1.1)), 0.75, 1.5);
}

function shouldUseMiddleValign(textBox, sourceCenter, renderedCenter, minDeltaPt) {
  if (textBox.font?.valign === "middle") return false;
  const sourceNearMiddle = Math.abs(sourceCenter.y - 0.5) <= 0.08;
  const renderedOffset = Math.abs(sourceCenter.y - renderedCenter.y);
  return sourceNearMiddle && renderedOffset * Math.max(1, textBox.box?.h || 1) >= minDeltaPt;
}

function isInkPixel(rgba, offset) {
  const alpha = rgba[offset + 3];
  if (alpha < 24) return false;
  const r = rgba[offset];
  const g = rgba[offset + 1];
  const b = rgba[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  return brightness < 245 || max - min > 18;
}

function isBox(box) {
  return box && Number.isFinite(box.x) && Number.isFinite(box.y) && Number.isFinite(box.w) && Number.isFinite(box.h);
}

function isEvidenceFitCandidate(textBox, evidence) {
  if (!isBox(textBox?.box) || !isBox(evidence)) return false;
  if (String(textBox.text || "").includes("\n") || textBox.style?.wrap === true) return false;
  return evidence.x >= textBox.box.x - 3
    && evidence.y >= textBox.box.y - 3
    && evidence.x + evidence.w <= textBox.box.x + textBox.box.w + 3
    && evidence.y + evidence.h <= textBox.box.y + textBox.box.h + 3;
}

function boxChanged(before, after, minDeltaPt) {
  return ["x", "y", "w", "h"].some((key) => Math.abs(Number(before[key]) - Number(after[key])) >= minDeltaPt);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function change(pageIndex, elementId, field, before, after, reason) {
  return {
    pageIndex,
    elementId,
    field,
    before,
    after,
    reason
  };
}

module.exports = {
  applyTextBoxEvidenceFit,
  estimatedTextWidthUnits,
  fitHighConfidenceSingleLineOcrToEvidence,
  applyTextBoxSuggestionSet,
  suggestTextBoxMicroAdjustments,
  applyTextBoxMicroAdjustments,
  findInkBounds
};
