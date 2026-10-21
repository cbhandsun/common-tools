"use strict";
// @ts-check

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{widthPt:number,heightPt:number}} SlideSize */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{id?: unknown, box?: unknown, text?: unknown, font?: unknown, style?: unknown, source?: unknown}} TextBox */
/** @typedef {{id?: unknown,type?: unknown,box?: unknown,style?: unknown,source?: unknown}} Shape */
/** @typedef {{r:number,g:number,b:number,a:number}} Rgba */
/** @typedef {{axis:"h"|"v",a:number,start:number,end:number,style:Record<string, unknown>,source:Record<string, unknown>}} AxisLine */
/** @typedef {AxisLine & {members: AxisLine[]}} AxisLineCluster */
/** @typedef {{fill:Rgba,stroke:{r:number,g:number,b:number},strokeWidthPt:number,distance:number,fitBox?:Box}} PanelColorEvidence */
/** @typedef {{count:number,minX:number,minY:number,maxX:number,maxY:number,width:number,height:number}} ColorComponent */
/** @typedef {{x0:number,y0:number,width:number,height:number,startX:number,startY:number,visited:Uint8Array,fill:Rgba}} FloodColorOptions */

const MAX_COMPONENT_SHAPES = 160;
const POSITION_TOLERANCE_PT = 7;
const { fitSourceTextBand } = require("./source-text-band-evidence");
const { colorPanelOwnsText, hasSourceTextGeometry } = require("./color-panel-text-ownership");
const {
  expandPanelFromColorRun,
  fitPanelFromConnectedColorRegion,
  samplePanelColorEvidence,
  sampleNearbyPanelColorEvidence,
  sampleDominantColor,
  sampleDominantRingColor,
  isDistinctPanelColor,
  darken,
  normalizeLine,
  clusterAxisLines,
  groupLinesBySpan,
  clusterTextRows,
  splitTextRowByHorizontalGaps,
  clusterCenteredStacks,
  clusterTextPanelRows,
  clusterMatrixRows,
  createLeadingIconSwatches,
  inferMatrixColumns,
  inferRowBounds,
  matrixStrokeColor,
  dominantTextColor,
  rowSpan,
  mergeSpan
} = require("./line-text-native-analysis");
const {
  brightness,
  saturationProxy,
  intersectionArea,
  colorDistance,
  nativeRect,
  nativeLine,
  sampleBoxFill,
  samplePanelBackgroundFill,
  panelFillMatchesInterior,
  pixel,
  ptToPxBox,
  centerInside,
  overlapRatio,
  similarBoxOverlap,
  boxArea,
  uniquePositions,
  cardStrokeColor,
  cardStrokeWidth,
  textColor,
  isBlueLikeHex,
  parseHexColor,
  dedupeShapes,
  clampBox,
  roundBox,
  median,
  rgbToHex,
  isRecord,
  isBox,
  isTextBox,
  isAxisLine,
  isRaster,
  parseSlideSize
} = require("./line-text-native-primitives");

/** @param {{lines?: unknown,textBoxes?: unknown,slideSize?: unknown,image?: unknown}} input @returns {{shapes: Shape[], textBoxes: TextBox[]}} */
function createLineTextNativeComponentObjects(input = {}) {
  const slideSize = parseSlideSize(input.slideSize);
  if (!slideSize) return { shapes: [], textBoxes: [] };
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const textBoxes = Array.isArray(input.textBoxes) ? input.textBoxes.filter(isTextBox) : [];
  if (lines.length < 2 || textBoxes.length < 3) return { shapes: [], textBoxes: [] };
  const image = isRaster(input.image) ? input.image : null;
  const normalized = lines.map(normalizeLine).filter(isAxisLine);
  const horizontal = clusterAxisLines(normalized.filter((line) => line.axis === "h"));
  const vertical = clusterAxisLines(normalized.filter((line) => line.axis === "v"));
  /** @type {Shape[]} */
  const shapes = [];
  const timelineStepBadges = createTimelineStepBadgeObjects(textBoxes, slideSize);
  const singleDigitBadges = createSingleDigitNumberBadgeObjects(textBoxes, slideSize, image);
  shapes.push(...timelineStepBadges.shapes);
  shapes.push(...singleDigitBadges.shapes);
  shapes.push(...createNumberedSectionPanels(horizontal, textBoxes, slideSize, image, shapes));
  shapes.push(...createNumberedTextBandPanels(textBoxes, slideSize, image, shapes));
  shapes.push(...createTitleAnchoredTextBandPanels(textBoxes, slideSize, image, shapes));
  shapes.push(...createBorderedCards(horizontal, vertical, textBoxes, slideSize, image, shapes));
  shapes.push(...createBoundedGridCells(horizontal, vertical, textBoxes, slideSize, image));
  shapes.push(...createHorizontalSectionPanels(horizontal, textBoxes, slideSize, image, shapes));
  shapes.push(...createCenteredStackBars(textBoxes, slideSize, image, shapes));
  const colorPanels = createTextAnchoredColorPanelObjects(textBoxes, slideSize, image, shapes);
  shapes.push(...colorPanels.shapes);
  shapes.push(...createTextGroupContainerPanels(textBoxes, slideSize, image, shapes));
  shapes.push(...createTextMatrixCells(textBoxes, slideSize, image, shapes));
  shapes.push(...createHorizontalCardRows(textBoxes, slideSize, image, shapes, horizontal));
  shapes.push(...createLeadingIconSwatches(textBoxes, slideSize, image, shapes));
  return {
    shapes: orderLineTextShapesForRendering(shapes).slice(0, MAX_COMPONENT_SHAPES),
    textBoxes: [...timelineStepBadges.textBoxes, ...singleDigitBadges.textBoxes, ...colorPanels.textBoxes]
  };
}

/** @param {{lines?: unknown,textBoxes?: unknown,slideSize?: unknown,image?: unknown}} input @returns {Shape[]} */
function createLineTextNativeComponents(input = {}) {
  return createLineTextNativeComponentObjects(input).shapes;
}

/** @param {Shape[]} shapes */
function orderLineTextShapesForRendering(shapes) {
  const background = [];
  const foreground = [];
  for (const shape of shapes) {
    if (isLineTextBackgroundShape(shape)) background.push(shape);
    else foreground.push(shape);
  }
  return [...background, ...foreground];
}

/** @param {Shape} shape */
function isLineTextBackgroundShape(shape) {
  const detector = String(shape?.source && isRecord(shape.source) ? shape.source.detector || "" : "");
  return /^line-text-native-(?:title-band-panel|numbered-section-panel|numbered-band-panel|section-panel|group-panel)$/u.test(detector);
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createTitleAnchoredTextBandPanels(textBoxes, slideSize, image, existing) {
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const text = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return text.length >= 2
        && text.length <= 36
        && !isLowerPageInlineStepDetailLabel(text, box, slideSize)
        && box.x <= slideSize.widthPt * 0.18
        && box.y >= slideSize.heightPt * 0.08
        && box.y <= slideSize.heightPt * 0.9
        && box.w >= 34
        && box.w <= slideSize.widthPt * 0.18
        && box.h >= 8
        && box.h <= 26;
    })
    .map((textBox) => titleBandAnchor(textBox, textBoxes, slideSize))
    .filter(Boolean)
    .map((anchor) => /** @type {NonNullable<ReturnType<typeof titleBandAnchor>>} */ (anchor))
    .sort((a, b) => a.center - b.center || b.textCount - a.textCount);
  if (candidates.length < 2) return [];
  /** @type {Array<NonNullable<ReturnType<typeof titleBandAnchor>>>} */
  const anchors = [];
  for (const candidate of candidates) {
    const nearby = anchors.find((anchor) => Math.abs(anchor.center - candidate.center) <= 26);
    if (!nearby) anchors.push(candidate);
    else if (candidate.textCount > nearby.textCount || candidate.span.w > nearby.span.w) {
      Object.assign(nearby, candidate);
    }
  }
  if (anchors.length < 2) return [];
  /** @type {Shape[]} */
  const shapes = [];
  for (let index = 0; index < anchors.length; index += 1) {
    const anchor = anchors[index];
    if (!anchor) continue;
    const previous = anchors[index - 1];
    const next = anchors[index + 1];
    const rowTop = Math.min(...anchor.bandTexts.map((textBox) => /** @type {Box} */ (textBox.box).y));
    const rowBottom = Math.max(...anchor.bandTexts.map((textBox) => {
      const box = /** @type {Box} */ (textBox.box);
      return box.y + box.h;
    }));
    const naturalTop = rowTop - Math.max(12, anchor.anchorBox.h * 0.85);
    const naturalBottom = rowBottom + Math.max(14, anchor.anchorBox.h * 1.1);
    const previousLimit = previous ? (previous.center + anchor.center) / 2 : 0;
    const nextLimit = next ? (anchor.center + next.center) / 2 : slideSize.heightPt;
    const top = Math.max(previousLimit + 2, naturalTop);
    const bottom = Math.min(nextLimit - 2, naturalBottom);
    const horizontalPad = 20;
    const proposedPanel = clampBox({
      x: Math.max(0, anchor.span.x - horizontalPad),
      y: top,
      w: Math.min(slideSize.widthPt, anchor.span.x + anchor.span.w + horizontalPad) - Math.max(0, anchor.span.x - horizontalPad),
      h: bottom - top
    }, slideSize);
    if (!proposedPanel || proposedPanel.w < slideSize.widthPt * 0.44 || proposedPanel.h < 38 || proposedPanel.h > slideSize.heightPt * 0.16) continue;
    const perimeter = fitSourceTextBand({ image, slideSize, box: proposedPanel });
    if (!perimeter) continue;
    const panel = perimeter.box;
    if (anchor.bandTexts.some(item => !isBox(item.box) || item.box.x < panel.x - 2 || item.box.y < panel.y - 2
      || item.box.x + item.box.w > panel.x + panel.w + 2 || item.box.y + item.box.h > panel.y + panel.h + 2)) continue;
    if (existing.some((shape) => similarBoxOverlap(shape.box, panel, 0.58, 0.32)) || shapes.some((shape) => similarBoxOverlap(shape.box, panel, 0.58, 0.32))) continue;
    const fill = samplePanelBackgroundFill(image, panel, slideSize, "#FFFFFF");
    if (!panelFillMatchesInterior(image, panel, slideSize, fill)) continue;
    if (isOverextendedSaturatedBand(fill, panel, anchor.anchorBox)) continue;
    shapes.push(nativeRect(`line-text-title-band-panel-${shapes.length + 1}`, panel, "line-text-native-title-band-panel", {
      fill,
      stroke: perimeter.strokeSupported ? textColor(anchor.textBox) || "#CBD5E1" : fill,
      strokeWidthPt: perimeter.strokeSupported ? 0.7 : 0,
      radiusPt: Math.min(7, Math.max(2, panel.h * 0.055)),
      opacity: 1
    }, { textCount: anchor.bandTexts.length, anchorText: String(anchor.textBox.text || "").trim(),
      sourcePerimeterSupport: perimeter.support }));
    if (shapes.length >= 16) return dedupeShapes(shapes);
  }
  return dedupeShapes(shapes);
}

/** @param {string} text @param {Box} box @param {SlideSize} slideSize */
function isLowerPageInlineStepDetailLabel(text, box, slideSize) {
  return box.y >= slideSize.heightPt * 0.72
    && /^\d{1,2}[\p{L}\p{N}]/u.test(text)
    && text.length >= 8;
}

/** @param {TextBox} textBox @param {TextBox[]} textBoxes @param {SlideSize} slideSize */
function titleBandAnchor(textBox, textBoxes, slideSize) {
  if (!isBox(textBox.box)) return null;
  const anchorBox = textBox.box;
  const center = anchorBox.y + anchorBox.h / 2;
  const sameRow = textBoxes
    .filter((item) => isBox(item.box))
    .filter((item) => {
      const box = /** @type {Box} */ (item.box);
      const cy = box.y + box.h / 2;
      return Math.abs(cy - center) <= Math.max(12, anchorBox.h * 1.2);
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).x - (/** @type {Box} */ (b.box)).x);
  const mainRow = sameRow.filter((item) => {
    const box = /** @type {Box} */ (item.box);
    return box.x + box.w / 2 <= slideSize.widthPt * 0.74;
  });
  if (!mainRow.includes(textBox) || mainRow.length < 3) return null;
  const rowSpanBox = rowSpan(mainRow);
  if (!rowSpanBox || rowSpanBox.w < slideSize.widthPt * 0.44 || rowSpanBox.x > slideSize.widthPt * 0.14) return null;
  const x1 = Math.max(0, rowSpanBox.x - 24);
  const x2 = Math.min(slideSize.widthPt, rowSpanBox.x + rowSpanBox.w + 24);
  const bandTexts = textBoxes
    .filter((item) => isBox(item.box))
    .filter((item) => {
      const box = /** @type {Box} */ (item.box);
      const cx = box.x + box.w / 2;
      const cy = box.y + box.h / 2;
      return cx >= x1 && cx <= x2 && Math.abs(cy - center) <= 62;
    });
  if (bandTexts.length < 5) return null;
  const span = rowSpan(bandTexts);
  if (!span || span.w < slideSize.widthPt * 0.46 || span.w > slideSize.widthPt * 0.82) return null;
  return { textBox, anchorBox, center, span, bandTexts, textCount: bandTexts.length };
}

/** @param {string} fill @param {Box} panel @param {Box} anchorBox */
function isOverextendedSaturatedBand(fill, panel, anchorBox) {
  const color = parseHexColor(fill);
  if (!color) return false;
  const max = Math.max(color.r, color.g, color.b);
  const min = Math.min(color.r, color.g, color.b);
  const saturation = max <= 0 ? 0 : (max - min) / max;
  const brightness = (color.r + color.g + color.b) / 3;
  return saturation >= 0.42
    && brightness <= 225
    && panel.h >= Math.max(42, anchorBox.h * 3.2);
}

/** @param {AxisLineCluster[]} horizontal @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createNumberedSectionPanels(horizontal, textBoxes, slideSize, image, existing) {
  const wideLines = horizontal
    .filter((line) => line.end - line.start >= slideSize.widthPt * 0.36)
    .sort((a, b) => a.a - b.a);
  if (wideLines.length < 2) return [];
  const numbered = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const value = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return /^[1-9]$/u.test(value)
        && box.x <= slideSize.widthPt * 0.2
        && box.y <= slideSize.heightPt * 0.88
        && box.w >= 6 && box.w <= 28
        && box.h >= 8 && box.h <= 28;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  /** @type {Shape[]} */
  const shapes = [];
  for (const item of numbered) {
    if (!isBox(item.box)) continue;
    const box = item.box;
    const cy = box.y + box.h / 2;
    const topLine = [...wideLines].reverse().find((line) => line.a <= cy + 8);
    const bottomLine = wideLines.find((line) => line.a > cy + Math.max(28, box.h * 1.8));
    if (!topLine || !bottomLine) continue;
    const anchorX = box.x + box.w / 2;
    const topSpan = lineSpanForAnchorColumn(topLine, anchorX);
    const bottomSpan = lineSpanForAnchorColumn(bottomLine, anchorX);
    if (!topSpan || !bottomSpan) continue;
    const panel = clampBox({
      x: Math.max(0, Math.min(topSpan.start, bottomSpan.start)),
      y: topLine.a,
      w: Math.min(slideSize.widthPt, Math.max(topSpan.end, bottomSpan.end)) - Math.max(0, Math.min(topSpan.start, bottomSpan.start)),
      h: bottomLine.a - topLine.a
    }, slideSize);
    if (!panel || panel.w < slideSize.widthPt * 0.36 || panel.h < 34 || panel.h > slideSize.heightPt * 0.22) continue;
    const panelTexts = textBoxes.filter((textBox) => centerInside(textBox.box, panel));
    if (panelTexts.length < 3) continue;
    if (existing.some((shape) => overlapRatio(shape.box, panel) > 0.76) || shapes.some((shape) => overlapRatio(shape.box, panel) > 0.76)) continue;
    const stroke = textColor(item) || cardStrokeColor([topLine, bottomLine]);
    shapes.push(nativeRect(`line-text-numbered-section-panel-${shapes.length + 1}`, panel, "line-text-native-numbered-section-panel", {
      fill: samplePanelBackgroundFill(image, panel, slideSize, "#FFFFFF"),
      stroke,
      strokeWidthPt: Math.max(0.6, Math.min(1.4, cardStrokeWidth([topLine, bottomLine]))),
      radiusPt: Math.min(7, Math.max(2, panel.h * 0.06)),
      opacity: 1
    }, { textCount: panelTexts.length, sectionNumber: String(item.text || "").trim() }));
    if (shapes.length >= 16) return dedupeShapes(shapes);
  }
  return dedupeShapes(shapes);
}

/** @param {AxisLineCluster} line @param {number} anchorX */
function lineSpanForAnchorColumn(line, anchorX) {
  const members = Array.isArray(line.members) && line.members.length > 0 ? line.members : [line];
  const containing = members
    .filter((member) => member.start <= anchorX + 4 && member.end >= anchorX - 4)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  if (containing) return containing;
  const leftAnchored = members
    .filter((member) => member.start <= anchorX + 24 && member.end > anchorX)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start))[0];
  return leftAnchored || null;
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createNumberedTextBandPanels(textBoxes, slideSize, image, existing) {
  const numbered = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const value = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return /^[1-9]$/u.test(value)
        && box.x <= slideSize.widthPt * 0.2
        && box.y <= slideSize.heightPt * 0.9
        && box.w >= 6 && box.w <= 32
        && box.h >= 8 && box.h <= 30;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  if (numbered.length < 3) return [];
  /** @type {Shape[]} */
  const shapes = [];
  const centers = numbered.map((item) => {
    const box = /** @type {Box} */ (item.box);
    return box.y + box.h / 2;
  });
  for (let index = 0; index < numbered.length; index += 1) {
    const item = numbered[index];
    if (!item || !isBox(item.box)) continue;
    const center = centers[index];
    if (center === undefined) continue;
    const previousCenter = centers[index - 1];
    const nextCenter = centers[index + 1];
    const top = previousCenter === undefined
      ? Math.max(0, item.box.y - Math.max(18, item.box.h * 1.8))
      : (previousCenter + center) / 2;
    const bottom = nextCenter === undefined
      ? Math.min(slideSize.heightPt, item.box.y + item.box.h + Math.max(52, item.box.h * 5))
      : (center + nextCenter) / 2;
    const band = { x: 0, y: top, w: slideSize.widthPt, h: bottom - top };
    if (band.h < 38 || band.h > slideSize.heightPt * 0.18) continue;
    const bandTexts = textBoxes.filter((textBox) => centerInside(textBox.box, band));
    if (bandTexts.length < 4) continue;
    const span = rowSpan(bandTexts.filter((textBox) => isBox(textBox.box)));
    if (!span || span.w < slideSize.widthPt * 0.28) continue;
    const panel = clampBox({
      x: Math.max(0, Math.min(item.box.x - 18, span.x - 24)),
      y: top + 2,
      w: Math.min(slideSize.widthPt, Math.max(span.x + span.w + 24, slideSize.widthPt * 0.62)) - Math.max(0, Math.min(item.box.x - 18, span.x - 24)),
      h: Math.max(1, bottom - top - 4)
    }, slideSize);
    if (!panel || panel.w < slideSize.widthPt * 0.42) continue;
    if (existing.some((shape) => overlapRatio(shape.box, panel) > 0.58) || shapes.some((shape) => overlapRatio(shape.box, panel) > 0.58)) continue;
    const stroke = textColor(item) || "#CBD5E1";
    shapes.push(nativeRect(`line-text-numbered-band-panel-${shapes.length + 1}`, panel, "line-text-native-numbered-band-panel", {
      fill: samplePanelBackgroundFill(image, panel, slideSize, "#FFFFFF"),
      stroke,
      strokeWidthPt: 0.8,
      radiusPt: Math.min(7, Math.max(2, panel.h * 0.06)),
      opacity: 1
    }, { textCount: bandTexts.length, sectionNumber: String(item.text || "").trim() }));
    if (shapes.length >= 16) return dedupeShapes(shapes);
  }
  return dedupeShapes(shapes);
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing @param {AxisLineCluster[]} horizontal */
function createHorizontalCardRows(textBoxes, slideSize, image, existing, horizontal = []) {
  /** @type {Shape[]} */
  const shapes = [];
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const text = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return text.length >= 2 && text.length <= 18 && box.h >= 7 && box.h <= 20 && box.w >= 18 && box.w <= 130;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  const rows = clusterTextRows(candidates, 9)
    .map((row) => row.slice().sort((a, b) => (/** @type {Box} */ (a.box)).x - (/** @type {Box} */ (b.box)).x))
    .flatMap((row) => splitTextRowByHorizontalGaps(row, Math.max(96, slideSize.widthPt * 0.10)))
    .filter((row) => row.length >= 3);
  for (const row of rows) {
    const ordered = contentCardRowItems(row, slideSize);
    const span = rowSpan(ordered);
    if (!span || span.w < slideSize.widthPt * 0.22) continue;
    if (span.x >= slideSize.widthPt * 0.68 && span.w <= slideSize.widthPt * 0.28) continue;
    const gaps = [];
    for (let index = 1; index < ordered.length; index += 1) {
      const prevItem = ordered[index - 1];
      const currentItem = ordered[index];
      if (!prevItem || !currentItem || !isBox(prevItem.box) || !isBox(currentItem.box)) continue;
      const prev = prevItem.box;
      const current = currentItem.box;
      gaps.push(current.x - (prev.x + prev.w));
    }
    if (gaps.filter((gap) => gap >= 18).length < ordered.length - 2) continue;
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      if (!item || !isBox(item.box)) continue;
      const box = item.box;
      const prevItem = ordered[index - 1];
      const nextItem = ordered[index + 1];
      const leftLimit = index === 0
        ? Math.max(0, box.x - Math.min(22, box.w * 0.42))
        : prevItem && isBox(prevItem.box)
          ? (prevItem.box.x + prevItem.box.w + box.x) / 2
          : box.x;
      const rightLimit = index === ordered.length - 1
        ? Math.min(slideSize.widthPt, box.x + box.w + Math.min(42, box.w * 0.8))
        : nextItem && isBox(nextItem.box)
          ? (box.x + box.w + nextItem.box.x) / 2
          : box.x + box.w;
      const boundary = nearestLowerHorizontalBoundary(horizontal, { x: leftLimit, y: box.y, w: Math.max(1, rightLimit - leftLimit), h: box.h });
      const laneBottom = boundary === null ? box.y + 68 : Math.min(box.y + 68, boundary - 2);
      const lane = { x: leftLimit, y: box.y - 4, w: Math.max(1, rightLimit - leftLimit), h: Math.max(1, laneBottom - (box.y - 4)) };
      const laneTexts = contiguousCardLaneTexts(textBoxes.filter((text) => centerInside(text.box, lane)), box).slice(0, 4);
      if (laneTexts.length < 1 || laneTexts.length > 4) continue;
      const naturalBottom = Math.max(...laneTexts.map((text) => {
        const textBox = /** @type {Box} */ (text.box);
        return textBox.y + textBox.h;
      }));
      const compactMultiColumnCard = laneTexts.length <= 3 && ordered.length >= 3;
      const bottomPadding = compactMultiColumnCard ? 8 : 22;
      const cappedBottom = boundary === null ? naturalBottom + bottomPadding : Math.min(naturalBottom + bottomPadding, boundary - 3);
      const cardTop = box.y - 10;
      let card = clampBox({ x: leftLimit + 4, y: cardTop, w: rightLimit - leftLimit - 8, h: Math.max(1, cappedBottom - cardTop) }, slideSize);
      if (!card || card.w < 38 || card.h < 24 || card.h > 92) continue;
      const checkedCard = card;
      if (isTimelineStepDescriptionCard(existing, textBoxes, slideSize, checkedCard)) continue;
      if (existing.some((shape) => blocksCardRowShape(shape, checkedCard)) || shapes.some((shape) => blocksCardRowShape(shape, checkedCard))) continue;
      const compactHeader = compactMultiColumnCard ? compactSaturatedHeaderCard(image, card, box, slideSize) : null;
      if (compactHeader) card = compactHeader.card;
      const perimeter = hasSourceTextGeometry(item) ? fitSourceTextBand({ image, box: card, slideSize }) : null;
      const sourceFill = hasSourceTextGeometry(item) && image ? sampleDominantColor(image, box, slideSize, 3, 0.18, 0.18) : null;
      const connected = !perimeter && sourceFill && image ? fitPanelFromConnectedColorRegion(image, box, slideSize, sourceFill) : null;
      if (hasSourceTextGeometry(item)) {
        const measured = perimeter?.box || connected;
        if (!measured || !laneTexts.every(text => colorPanelOwnsText(text, measured))) continue;
        card = measured;
      }
      const fill = compactHeader?.fill || sampleBoxFill(image, card, slideSize, "#FFFFFF");
      shapes.push(nativeRect(`line-text-card-row-${shapes.length + 1}`, card, "line-text-native-card-row", {
        fill,
        stroke: sampleCardStroke(image, card, slideSize, fill),
        strokeWidthPt: connected || (perimeter && !perimeter.strokeSupported) ? 0 : 0.55,
        radiusPt: Math.min(6, Math.max(2, card.h * 0.11)),
        opacity: 1
      }, { textCount: laneTexts.length, rowSize: ordered.length, ...(perimeter ? {sourcePerimeterSupport:perimeter.support} : {}) }));
      if (shapes.length >= 48) return dedupeShapes(shapes);
    }
  }
  return dedupeShapes(shapes);
}

/** @param {TextBox[]} texts @param {Box} anchor */
function contiguousCardLaneTexts(texts, anchor) {
  const ordered = texts
    .filter((text) => isBox(text.box))
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  /** @type {TextBox[]} */
  const result = [];
  let bottom = anchor.y + anchor.h;
  const maxGap = Math.max(10, anchor.h * 0.95);
  for (const text of ordered) {
    const box = /** @type {Box} */ (text.box);
    if (box.y + box.h < anchor.y - 1) continue;
    if (result.length > 0 && box.y - bottom > maxGap) break;
    result.push(text);
    bottom = Math.max(bottom, box.y + box.h);
  }
  return result;
}

/** @param {Shape} shape @param {Box} card */
function blocksCardRowShape(shape, card) {
  if (isBroadLineTextBackgroundContainer(shape, card)) return false;
  return overlapRatio(shape.box, card) > 0.58;
}

/** @param {Shape[]} existing @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Box} card */
function isTimelineStepDescriptionCard(existing, textBoxes, slideSize, card) {
  const blockedByShape = existing.some((shape) => {
    const detector = String(shape?.source && isRecord(shape.source) ? shape.source.detector || "" : "");
    if (detector !== "line-text-native-timeline-step-badge" || !isBox(shape.box)) return false;
    const badge = shape.box;
    const badgeCenterX = badge.x + badge.w / 2;
    const cardCenterX = card.x + card.w / 2;
    return Math.abs(badgeCenterX - cardCenterX) <= Math.max(36, card.w * 0.55)
      && card.y >= badge.y + badge.h * 0.45
      && card.y <= badge.y + badge.h + 80;
  });
  if (blockedByShape) return true;
  return timelineNumberTextBoxes(textBoxes, slideSize).some((item) => {
    if (!isBox(item.textBox.box)) return false;
    const box = item.textBox.box;
    const numberCenterX = box.x + box.w / 2;
    const cardCenterX = card.x + card.w / 2;
    return Math.abs(numberCenterX - cardCenterX) <= Math.max(36, card.w * 0.55)
      && card.y >= box.y + box.h * 0.45
      && card.y <= box.y + box.h + 90;
  });
}

/** @param {Shape} shape @param {Box} card */
function isBroadLineTextBackgroundContainer(shape, card) {
  const detector = String(shape?.source && isRecord(shape.source) ? shape.source.detector || "" : "");
  if (!/^line-text-native-(?:title-band-panel|numbered-section-panel|numbered-band-panel|section-panel|group-panel)$/u.test(detector)) return false;
  if (!isBox(shape.box)) return false;
  const shapeArea = boxArea(shape.box);
  const cardArea = boxArea(card);
  if (shapeArea < cardArea * 2.2) return false;
  const intersection = intersectionArea(shape.box, card);
  return intersection / Math.max(1, cardArea) >= 0.72;
}

/** @param {Raster|null} image @param {Box} card @param {Box} anchor @param {SlideSize} slideSize */
function compactSaturatedHeaderCard(image, card, anchor, slideSize) {
  if (!image) return null;
  const header = clampBox({
    x: card.x,
    y: Math.max(0, anchor.y - Math.max(12, anchor.h * 1.2)),
    w: card.w,
    h: Math.max(28, Math.min(card.h, anchor.h + Math.max(24, anchor.h * 1.8)))
  }, slideSize);
  if (!header || header.h >= card.h - 4) return null;
  const fill = sampleBoxFill(image, header, slideSize, "#FFFFFF");
  const color = parseHexColor(fill);
  if (!color) return null;
  if (saturationProxy(color) < 38 || brightness(color) > 238 || brightness(color) < 42) return null;
  return { card: header, fill };
}

/** @param {Raster|null} image @param {Box} card @param {SlideSize} slideSize @param {string} fill */
function sampleCardStroke(image, card, slideSize, fill) {
  const fillColor = parseHexColor(fill) || { r: 255, g: 255, b: 255, a: 255 };
  const fillBrightness = brightness(fillColor);
  const fillSaturation = saturationProxy(fillColor);
  if (fillSaturation >= 42 && fillBrightness <= 235) return fill;
  if (!image) return "#D7DEE8";
  const px = ptToPxBox(card, image, slideSize, 0);
  /** @type {Map<string, {count:number,r:number,g:number,b:number}>} */
  const buckets = new Map();
  const edge = Math.max(1, Math.min(3, Math.floor(Math.min(px.w, px.h) * 0.08)));
  const step = Math.max(1, Math.ceil(Math.sqrt((px.w * px.h) / 1800)));
  for (let y = px.y; y < px.y + px.h; y += step) {
    for (let x = px.x; x < px.x + px.w; x += step) {
      const dx = Math.min(x - px.x, px.x + px.w - 1 - x);
      const dy = Math.min(y - px.y, px.y + px.h - 1 - y);
      if (Math.min(dx, dy) > edge) continue;
      const color = pixel(image, x, y);
      if (!color || color.a < 128) continue;
      if (colorDistance(color, fillColor) < 18) continue;
      const colorBrightness = brightness(color);
      if (colorBrightness < 35 || colorBrightness > 248) continue;
      const key = `${Math.round(color.r / 16)},${Math.round(color.g / 16)},${Math.round(color.b / 16)}`;
      const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      item.count += 1;
      item.r += color.r;
      item.g += color.g;
      item.b += color.b;
      buckets.set(key, item);
    }
  }
  const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  if (!dominant || dominant.count < 3) return fillBrightness > 245 ? "#D7DEE8" : fill;
  return rgbToHex({
    r: Math.round(dominant.r / dominant.count),
    g: Math.round(dominant.g / dominant.count),
    b: Math.round(dominant.b / dominant.count)
  });
}


/** @param {TextBox[]} ordered @param {SlideSize} slideSize */
function contentCardRowItems(ordered, slideSize) {
  if (ordered.length < 4) return ordered;
  const firstContentIndex = ordered.findIndex((item) => isBox(item.box) && item.box.x >= slideSize.widthPt * 0.17);
  let items = ordered;
  if (firstContentIndex > 0) {
    const contentItems = ordered.slice(firstContentIndex);
    if (contentItems.length >= 3) {
      const leadingItems = ordered.slice(0, firstContentIndex);
      const leadingSpan = rowSpan(leadingItems);
      const contentSpan = rowSpan(contentItems);
      if (leadingSpan && contentSpan) {
        const gap = contentSpan.x - (leadingSpan.x + leadingSpan.w);
        if (leadingSpan.x <= slideSize.widthPt * 0.13 && gap >= 18 && contentSpan.w >= slideSize.widthPt * 0.22) {
          items = contentItems;
        }
      }
    }
  }
  if (items.length < 4) return items;
  const firstSideSegmentIndex = items.findIndex((item, index) => index >= 1 && isBox(item.box) && item.box.x >= slideSize.widthPt * 0.72);
  if (firstSideSegmentIndex > 0 && firstSideSegmentIndex < 3 && items.length - firstSideSegmentIndex >= 3) {
    const previous = items[firstSideSegmentIndex - 1];
    const side = items[firstSideSegmentIndex];
    if (previous && side && isBox(previous.box) && isBox(side.box)) {
      const gap = side.box.x - (previous.box.x + previous.box.w);
      if (previous.box.x >= slideSize.widthPt * 0.55 && gap >= 44) return items.slice(firstSideSegmentIndex);
    }
  }
  const firstSideIndex = items.findIndex((item, index) => index >= 3 && isBox(item.box) && item.box.x >= slideSize.widthPt * 0.72);
  if (firstSideIndex > 0) {
    const previous = items[firstSideIndex - 1];
    const side = items[firstSideIndex];
    if (previous && side && isBox(previous.box) && isBox(side.box)) {
      const gap = side.box.x - (previous.box.x + previous.box.w);
      const mainItems = items.slice(0, firstSideIndex);
      const mainSpan = rowSpan(mainItems);
      if (gap >= 48 && mainSpan && mainSpan.w >= slideSize.widthPt * 0.22) return mainItems;
    }
  }
  return items;
}

/** @param {AxisLineCluster[]} horizontal @param {Box} box */
function nearestLowerHorizontalBoundary(horizontal, box) {
  const candidates = horizontal
    .filter((line) => line.a > box.y + box.h + 3 && line.a <= box.y + 96)
    .filter((line) => {
      const overlap = Math.max(0, Math.min(line.end, box.x + box.w) - Math.max(line.start, box.x));
      return overlap / Math.max(1, box.w) >= 0.22 || overlap >= 28;
    })
    .sort((a, b) => a.a - b.a);
  return candidates[0]?.a ?? null;
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createCenteredStackBars(textBoxes, slideSize, image, existing) {
  if (!image) return [];
  /** @type {Shape[]} */
  const shapes = [];
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const box = /** @type {Box} */ (textBox.box);
      const value = String(textBox.text || "").trim();
      return value.length >= 2 && value.length <= 22 && box.h >= 8 && box.h <= 20 && box.w >= 22 && box.w <= 150;
    })
    .filter((textBox) => !isSecondaryStackBarLabel(textBox, textBoxes))
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  const stacks = clusterCenteredStacks(candidates);
  for (const stack of stacks) {
    if (stack.length < 3 || stack.length > 6) continue;
    const ordered = stack.slice().sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index];
      if (!item || !isBox(item.box)) continue;
      const box = item.box;
      const seed = clampBox({ x: box.x - box.h * 0.9, y: box.y - box.h * 0.45, w: box.w + box.h * 1.8, h: box.h * 1.9 }, slideSize);
      if (!seed) continue;
      const fill = sampleDominantColor(image, seed, slideSize, 3, 0.18, 0.18);
      if (!fill || fill.count < 8 || !isDistinctPanelColor(fill)) continue;
      const expanded = expandPanelFromColorRun(image, box, seed, slideSize, fill);
      const evidenceBox = expanded && expanded.w >= seed.w * 1.04 && expanded.h >= seed.h * 0.65 ? expanded : seed;
      const outer = sampleDominantRingColor(image, {
        x: evidenceBox.x - Math.max(6, evidenceBox.w * 0.05),
        y: evidenceBox.y - Math.max(4, evidenceBox.h * 0.18),
        w: evidenceBox.w + Math.max(12, evidenceBox.w * 0.1),
        h: evidenceBox.h + Math.max(8, evidenceBox.h * 0.36)
      }, evidenceBox, slideSize);
      if (outer && colorDistance(fill, outer) < 22 && !isDenseStackBarColorRun(ordered, fill)) continue;
      const labels = stackBarLabelsForAnchor(item, textBoxes);
      // Stack semantics nominate a component; only measured source boundaries
      // determine its geometry. Rank and label lengths must not redraw it.
      const bar = fitSourceTextBand({ image, box: expanded || seed, slideSize })?.box
        || fitPanelFromConnectedColorRegion(image, seed, slideSize, fill);
      if (!bar || labels.some(label => !isBox(label.box) || label.box.x < bar.x - 2 || label.box.y < bar.y - 2
        || label.box.x + label.box.w > bar.x + bar.w + 2 || label.box.y + label.box.h > bar.y + bar.h + 2)) continue;
      if (!bar || existing.some((shape) => similarBoxOverlap(shape.box, bar, 0.86, 0.42)) || shapes.some((shape) => overlapRatio(shape.box, bar) > 0.72)) continue;
      shapes.push(nativeRect(`line-text-stack-bar-${shapes.length + 1}`, bar, "line-text-native-stack-bar", {
        fill: rgbToHex(fill),
        stroke: rgbToHex(darken(fill, 0.88)),
        strokeWidthPt: colorDistance(fill, { r: 255, g: 255, b: 255, a: 255 }) < 42 ? 0.6 : 0,
        radiusPt: Math.min(5, Math.max(2, bar.h * 0.14)),
        opacity: 1
      }, { stackSize: ordered.length, stackIndex: index, textCount: 1 }));
      if (shapes.length >= 24) return dedupeShapes(shapes);
    }
  }
  return dedupeShapes(shapes);
}

/** @param {TextBox[]} ordered @param {Rgba} fill */
function isDenseStackBarColorRun(ordered, fill) {
  return ordered.length >= 4
    && saturationProxy(fill) >= 40
    && brightness(fill) >= 55
    && brightness(fill) <= 235;
}

/** @param {TextBox} textBox @param {TextBox[]} textBoxes */
function isSecondaryStackBarLabel(textBox, textBoxes) {
  if (!isBox(textBox.box)) return false;
  const box = textBox.box;
  const cx = box.x + box.w / 2;
  return textBoxes.some((candidate) => {
    if (candidate === textBox || !isBox(candidate.box)) return false;
    const other = candidate.box;
    if (other.y > box.y) return false;
    const verticalGap = box.y - (other.y + other.h);
    if (verticalGap < -3 || verticalGap > 7) return false;
    const otherCenter = other.x + other.w / 2;
    if (Math.abs(otherCenter - cx) > Math.max(18, box.w * 0.24)) return false;
    const text = String(textBox.text || "").trim();
    const otherText = String(candidate.text || "").trim();
    return otherText.length >= 2
      && otherText.length <= Math.max(12, text.length)
      && other.w <= box.w + 16;
  });
}

/** @param {TextBox} textBox @param {TextBox[]} textBoxes */
function stackBarLabelsForAnchor(textBox, textBoxes) {
  if (!isBox(textBox.box)) return [textBox];
  const box = textBox.box;
  const cx = box.x + box.w / 2;
  const labels = [textBox];
  for (const candidate of textBoxes) {
    if (candidate === textBox || !isBox(candidate.box)) continue;
    const other = candidate.box;
    if (other.y < box.y) continue;
    const verticalGap = other.y - (box.y + box.h);
    if (verticalGap < -3 || verticalGap > Math.max(12, box.h * 1.1)) continue;
    const otherCenter = other.x + other.w / 2;
    if (Math.abs(otherCenter - cx) > Math.max(24, other.w * 0.22)) continue;
    const text = String(candidate.text || "").trim();
    if (text.length < 2 || text.length > 32) continue;
    labels.push(candidate);
  }
  return labels;
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createTextMatrixCells(textBoxes, slideSize, image, existing) {
  /** @type {Shape[]} */
  const shapes = [];
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const box = /** @type {Box} */ (textBox.box);
      const value = String(textBox.text || "").trim();
      return value.length >= 1 && value.length <= 38 && box.h >= 6 && box.h <= 22 && box.w >= 6 && box.w <= slideSize.widthPt * 0.22;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  const textRows = clusterTextRows(candidates, 16)
    .map((row) => row.filter((item) => isBox(item.box)).sort((a, b) => (/** @type {Box} */ (a.box)).x - (/** @type {Box} */ (b.box)).x))
    .flatMap((row) => splitTextRowByHorizontalGaps(row, Math.max(58, slideSize.widthPt * 0.055)))
    .filter((row) => row.length >= 3);
  const groups = clusterMatrixRows(textRows, slideSize);
  for (const group of groups) {
    const columns = inferMatrixColumns(group, slideSize);
    if (columns.length < 3 || columns.length > 5) continue;
    const rowBounds = inferRowBounds(group, slideSize);
    if (rowBounds.length !== group.length) continue;
    for (let rowIndex = 0; rowIndex < group.length; rowIndex += 1) {
      const row = group[rowIndex];
      const rowBox = rowBounds[rowIndex];
      if (!row || !rowBox) continue;
      for (let columnIndex = 0; columnIndex < columns.length; columnIndex += 1) {
        const column = columns[columnIndex];
        if (!column) continue;
        const cell = clampBox({ x: column.x, y: rowBox.y, w: column.w, h: rowBox.h }, slideSize);
        if (!cell || cell.w < 28 || cell.h < 12) continue;
        const cellTexts = row.filter((textBox) => centerInside(textBox.box, cell));
        if (cellTexts.length === 0) continue;
        if (shapes.some((shape) => overlapRatio(shape.box, cell) > 0.84)) continue;
        shapes.push(nativeRect(`line-text-matrix-cell-${shapes.length + 1}`, cell, "line-text-native-matrix-cell", {
          fill: sampleBoxFill(image, cell, slideSize, "#FFFFFF"),
          stroke: matrixStrokeColor(row, columnIndex),
          strokeWidthPt: 0.55,
          radiusPt: rowIndex === 0 ? Math.min(4, cell.h * 0.14) : 0,
          opacity: 1
        }, { rowIndex, columnIndex, textCount: cellTexts.length, rowSize: row.length }));
        if (shapes.length >= 80) return dedupeShapes(shapes);
      }
    }
  }
  return dedupeShapes(shapes).filter((shape) => !existing.some((item) => similarBoxOverlap(item.box, shape.box, 0.96, 0.68)));
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createTextGroupContainerPanels(textBoxes, slideSize, image, existing) {
  if (!image) return [];
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const box = /** @type {Box} */ (textBox.box);
      const value = String(textBox.text || "").trim();
      return value.length >= 1
        && value.length <= 72
        && box.h >= 6
        && box.h <= 24
        && box.w >= 8
        && box.w <= slideSize.widthPt * 0.42;
    })
    .sort((a, b) => (/** @type {Box} */ (a.box)).y - (/** @type {Box} */ (b.box)).y);
  const rows = clusterTextRows(candidates, 12)
    .map((row) => row.filter((item) => isBox(item.box)).sort((a, b) => (/** @type {Box} */ (a.box)).x - (/** @type {Box} */ (b.box)).x))
    .flatMap((row) => splitTextRowByHorizontalGaps(row, Math.max(54, slideSize.widthPt * 0.055)))
    .filter((row) => row.length > 0);
  const groups = clusterTextPanelRows(rows, slideSize);
  /** @type {Shape[]} */
  const shapes = [];
  for (const group of groups) {
    const span = rowSpan(group.flat());
    if (!span) continue;
    const rowSpans = group.map((row) => rowSpan(row)).filter(Boolean).map((box) => /** @type {Box} */ (box));
    if (rowSpans.length < 3) continue;
    const medianRowWidth = median(rowSpans.map((box) => box.w));
    const padX = Math.max(8, Math.min(22, medianRowWidth * 0.16));
    const padY = Math.max(6, Math.min(18, median(rowSpans.map((box) => box.h)) * 0.9));
    const panel = clampBox({ x: span.x - padX, y: span.y - padY, w: span.w + padX * 2, h: span.h + padY * 2 }, slideSize);
    const isRightSideDenseList = (panel?.x || 0) >= slideSize.widthPt * 0.68
      && (panel?.h || 0) >= slideSize.heightPt * 0.18
      && group.length >= 7
      && group.flat().length >= 7;
    const isTallSidePanel = (panel?.x || 0) >= slideSize.widthPt * 0.58
      && (panel?.w || 0) >= slideSize.widthPt * 0.14
      && (panel?.w || 0) <= slideSize.widthPt * 0.32
      && (panel?.h || 0) <= slideSize.heightPt * 0.55
      && (
        ((panel?.h || 0) >= slideSize.heightPt * 0.18 && group.length >= 8 && group.flat().length >= 12)
        || isRightSideDenseList
      );
    if (!panel || panel.w < slideSize.widthPt * 0.11 || panel.w > slideSize.widthPt * 0.46 || panel.h < 34 || (!isTallSidePanel && panel.h > slideSize.heightPt * 0.36)) continue;
    if (group.flat().length < 5 && group.length < 4) continue;
    if (existing.some((shape) => similarBoxOverlap(shape.box, panel, 0.72, 0.52)) || shapes.some((shape) => similarBoxOverlap(shape.box, panel, 0.72, 0.52))) continue;
    const evidence = samplePanelColorEvidence(image, panel, slideSize);
    const fallbackFill = isTallSidePanel ? sampleDominantColor(image, panel, slideSize, 3, 0.08, 0.08) : null;
    if ((!evidence || evidence.distance < 28) && !fallbackFill) continue;
    const fill = evidence?.fill || fallbackFill;
    if (!fill) continue;
    const strokeColor = evidence?.stroke || darken(fill, 0.88);
    const stroke = dominantTextColor(group.flat()) || rgbToHex(strokeColor);
    shapes.push(nativeRect(`line-text-group-panel-${shapes.length + 1}`, panel, "line-text-native-group-panel", {
      fill: rgbToHex(fill),
      stroke,
      strokeWidthPt: evidence && evidence.strokeWidthPt > 0 ? evidence.strokeWidthPt : 0.65,
      radiusPt: Math.min(7, Math.max(2, panel.h * 0.055)),
      opacity: isTallSidePanel ? 0.86 : 1
    }, { textCount: group.flat().length, rowCount: group.length, colorDistance: Math.round(evidence?.distance || 0), tallSidePanel: isTallSidePanel }));
    if (shapes.length >= 24) return dedupeShapes(shapes);
  }
  return dedupeShapes(shapes);
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize */
function createTimelineStepBadgeObjects(textBoxes, slideSize) {
  /** @type {Shape[]} */
  const shapes = [];
  /** @type {TextBox[]} */
  const nativeTextBoxes = [];
  const detected = timelineNumberTextBoxes(textBoxes, slideSize);
  for (const item of detected) {
    shapes.push(timelineBadgeShape(`line-text-timeline-step-badge-${shapes.length + 1}`, item.textBox, item.text, item.color, slideSize, false));
    nativeTextBoxes.push(timelineBadgeTextBox(item.textBox, item.text, item.color, slideSize, false));
    if (shapes.length >= 32) return { shapes, textBoxes: nativeTextBoxes };
  }
  const inferred = inferMissingTimelineStepBadges(textBoxes, detected, slideSize);
  for (const item of inferred) {
    if (shapes.length >= 32) break;
    shapes.push(timelineBadgeShape(`line-text-timeline-step-badge-${shapes.length + 1}`, item.textBox, item.text, item.color, slideSize, true));
    nativeTextBoxes.push(timelineBadgeTextBox(item.textBox, item.text, item.color, slideSize, true));
  }
  return { shapes, textBoxes: nativeTextBoxes };
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image */
function createSingleDigitNumberBadgeObjects(textBoxes, slideSize, image) {
  if (!image) return { shapes: [], textBoxes: [] };
  /** @type {Shape[]} */
  const shapes = [];
  /** @type {TextBox[]} */
  const nativeTextBoxes = [];
  const candidates = textBoxes
    .filter((textBox) => isBox(textBox.box))
    .filter((textBox) => {
      const detector = String(textBox?.source && isRecord(textBox.source) ? textBox.source.detector || "" : "");
      if (detector === "line-text-native-single-digit-badge-text") return false;
      const text = String(textBox.text || "").trim();
      const box = /** @type {Box} */ (textBox.box);
      return /^[1-9]$/u.test(text)
        && box.w >= 6 && box.w <= 24
        && box.h >= 8 && box.h <= 24
        && hasNearbySectionTitle(textBox, textBoxes, slideSize);
    });
  for (const textBox of candidates) {
    if (!isBox(textBox.box) || shapes.length >= 24) continue;
    const badge = singleDigitBadgeBox(textBox.box, slideSize);
    const fill = sampleBoxFill(image, badge, slideSize, "#FFFFFF");
    const color = parseHexColor(fill);
    if (!color || saturationProxy(color) < 32 || brightness(color) > 232 || brightness(color) < 45) continue;
    const text = String(textBox.text || "").trim();
    const idBase = typeof textBox.id === "string" && textBox.id ? textBox.id : `line-text-single-digit-badge-${text}`;
    shapes.push(nativeRect(`${idBase}-badge`, badge, "line-text-native-single-digit-badge", {
      fill,
      stroke: fill,
      strokeWidthPt: 0.5,
      radiusPt: Math.max(3, Math.min(7, badge.h * 0.22)),
      opacity: 1
    }, { text }));
    nativeTextBoxes.push({
      ...textBox,
      id: idBase,
      text,
      box: roundBox(badge),
      font: {
        ...(isRecord(textBox.font) ? textBox.font : {}),
        color: "#FFFFFF",
        sizePt: Math.max(7, Math.min(12, badge.h * 0.52)),
        align: "center",
        valign: "middle",
        weight: "bold"
      },
      source: {
        ...(isRecord(textBox.source) ? textBox.source : {}),
        editable: true,
        nativeRebuild: true,
        detector: "line-text-native-single-digit-badge-text",
        semanticNativeStructure: true,
        nativeComponentArchetype: "line-text-layout",
        nativeComponentRole: "section-number-badge"
      }
    });
  }
  return { shapes, textBoxes: nativeTextBoxes };
}

/** @param {TextBox} textBox @param {TextBox[]} textBoxes @param {SlideSize} slideSize */
function hasNearbySectionTitle(textBox, textBoxes, slideSize) {
  if (!isBox(textBox.box)) return false;
  const box = textBox.box;
  const centerY = box.y + box.h / 2;
  return textBoxes.some((candidate) => {
    if (candidate === textBox || !isBox(candidate.box)) return false;
    const text = String(candidate.text || "").trim();
    if (text.length < 4 || text.length > 48) return false;
    const other = candidate.box;
    if (other.x <= box.x + box.w || other.x > slideSize.widthPt * 0.72) return false;
    if (other.x - (box.x + box.w) > Math.max(120, slideSize.widthPt * 0.16)) return false;
    const otherCenterY = other.y + other.h / 2;
    return Math.abs(otherCenterY - centerY) <= Math.max(18, box.h * 1.35);
  });
}

/** @param {Box} box @param {SlideSize} slideSize */
function singleDigitBadgeBox(box, slideSize) {
  const size = Math.max(20, Math.min(34, Math.max(box.w, box.h) + 8));
  return roundBox(clampBox({
    x: box.x + box.w / 2 - size / 2,
    y: box.y + box.h / 2 - size / 2,
    w: size,
    h: size
  }, slideSize) || { x: box.x, y: box.y, w: size, h: size });
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize */
function timelineNumberTextBoxes(textBoxes, slideSize) {
  return textBoxes
    .filter((textBox) => isBox(textBox.box))
    .map((textBox) => {
      const text = String(textBox.text || "").trim();
      const color = textColor(textBox);
      return { textBox, text, color };
    })
    .filter((item) => {
      const box = /** @type {Box} */ (item.textBox.box);
      if (!/^\d{2}$/u.test(item.text) || box.y < slideSize.heightPt * 0.52) return false;
      const detector = String(item.textBox?.source && isRecord(item.textBox.source) ? item.textBox.source.detector || "" : "");
      const isNativeTimelineBadgeText = detector === "line-text-native-timeline-step-badge-text"
        && box.h >= 16 && box.h <= 36
        && box.w >= 16 && box.w <= 36;
      const isOcrTimelineBadgeText = box.h >= 7 && box.h <= 18
        && box.w >= 8 && box.w <= 26
        && item.color && isBlueLikeHex(item.color);
      return isNativeTimelineBadgeText || isOcrTimelineBadgeText;
    });
}

/** @param {TextBox[]} textBoxes @param {Array<{textBox: TextBox, text: string, color: string}>} detected @param {SlideSize} slideSize */
function inferMissingTimelineStepBadges(textBoxes, detected, slideSize) {
  if (detected.length < 3) return [];
  const titleRows = clusterTextRows(textBoxes.filter((textBox) => isTimelineTitleCandidate(textBox, slideSize)), 10)
    .map((row) => row.slice().sort((a, b) => (/** @type {Box} */ (a.box)).x - (/** @type {Box} */ (b.box)).x))
    .filter((row) => row.length >= 5)
    .filter((row) => timelineRowIsRegular(row, slideSize))
    .sort((a, b) => b.length - a.length || (rowSpan(b)?.w || 0) - (rowSpan(a)?.w || 0));
  const titleRow = titleRows[0];
  if (!titleRow) return [];
  const titleCenters = titleRow.map((item) => {
    const box = /** @type {Box} */ (item.box);
    return box.x + box.w / 2;
  });
  const mappings = [];
  for (const item of detected) {
    const box = /** @type {Box} */ (item.textBox.box);
    const center = box.x + box.w / 2;
    const nearest = nearestIndex(titleCenters, center);
    if (nearest < 0 || Math.abs((titleCenters[nearest] || 0) - center) > Math.max(22, slideSize.widthPt * 0.035)) continue;
    const value = Number.parseInt(item.text, 10);
    if (!Number.isSafeInteger(value)) continue;
    mappings.push({ index: nearest, offset: value - (nearest + 1), item });
  }
  if (mappings.length < 3) return [];
  const offset = modeNumber(mappings.map((item) => item.offset));
  if (offset === null) return [];
  if (mappings.filter((item) => item.offset === offset).length < Math.max(3, Math.ceil(mappings.length * 0.72))) return [];
  const knownIndexes = new Set(mappings.filter((item) => item.offset === offset).map((item) => item.index));
  const knownBoxes = mappings.map((item) => /** @type {Box} */ (item.item.textBox.box));
  const textW = median(knownBoxes.map((box) => box.w));
  const textH = median(knownBoxes.map((box) => box.h));
  const numberCenterY = median(knownBoxes.map((box) => box.y + box.h / 2));
  const color = mappings.map((item) => item.item.color).filter(Boolean)[0] || "#3366FF";
  const sample = mappings[0]?.item.textBox;
  const sampleFont = isRecord(sample?.font) ? sample.font : {};
  /** @type {Array<{textBox: TextBox, text: string, color: string}>} */
  const inferred = [];
  for (let index = 0; index < titleCenters.length; index += 1) {
    if (knownIndexes.has(index)) continue;
    const value = index + 1 + offset;
    if (value < 1 || value > 99) continue;
    const text = String(value).padStart(2, "0");
    const centerX = titleCenters[index];
    if (centerX === undefined) continue;
    const box = roundBox({
      x: centerX - textW / 2,
      y: numberCenterY - textH / 2,
      w: textW,
      h: textH
    });
    if (textBoxes.some((existing) => isBox(existing.box) && intersectionArea(existing.box, box) / Math.max(1, boxArea(box)) >= 0.45)) continue;
    inferred.push({
      text,
      color,
      textBox: {
        id: `line-text-timeline-step-badge-text-${text}`,
        text,
        box,
        font: {
          ...sampleFont,
          family: String(typeof sampleFont.family === "string" ? sampleFont.family : "Microsoft YaHei"),
          sizePt: Number.isFinite(Number(sampleFont.sizePt)) ? Number(sampleFont.sizePt) : 7.7,
          color,
          opacity: 1,
          weight: "regular",
          align: "center",
          valign: "middle"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "line-text-native-timeline-step-badge-text",
          semanticNativeStructure: true,
          nativeComponentArchetype: "line-text-layout",
          nativeComponentRole: "timeline-step-badge-text",
          inferredFromRegularTimeline: true
        }
      }
    });
  }
  return inferred;
}

/** @param {TextBox} textBox @param {SlideSize} slideSize */
function isTimelineTitleCandidate(textBox, slideSize) {
  if (!isBox(textBox.box)) return false;
  const box = textBox.box;
  const text = String(textBox.text || "").trim();
  if (box.y < slideSize.heightPt * 0.55 || box.y > slideSize.heightPt * 0.92) return false;
  if (box.h < 8 || box.h > 20 || box.w < 18 || box.w > slideSize.widthPt * 0.13) return false;
  if (text.length < 2 || text.length > 14) return false;
  if (/^\d{2}$|^[-–—→]+$/u.test(text)) return false;
  return true;
}

/** @param {TextBox[]} row @param {SlideSize} slideSize */
function timelineRowIsRegular(row, slideSize) {
  const span = rowSpan(row);
  if (!span || span.w < slideSize.widthPt * 0.48) return false;
  const centers = row.map((item) => {
    const box = /** @type {Box} */ (item.box);
    return box.x + box.w / 2;
  });
  const gaps = [];
  for (let index = 1; index < centers.length; index += 1) {
    const left = centers[index - 1];
    const right = centers[index];
    if (left === undefined || right === undefined) continue;
    gaps.push(right - left);
  }
  if (gaps.length < 4) return false;
  const medianGap = median(gaps);
  if (medianGap < slideSize.widthPt * 0.055 || medianGap > slideSize.widthPt * 0.16) return false;
  const regular = gaps.filter((gap) => Math.abs(gap - medianGap) <= Math.max(18, medianGap * 0.32)).length;
  return regular >= Math.ceil(gaps.length * 0.72);
}

/** @param {string} id @param {TextBox} textBox @param {string} text @param {string} color @param {SlideSize} slideSize @param {boolean} inferred */
function timelineBadgeShape(id, textBox, text, color, slideSize, inferred) {
  const badge = timelineBadgeBox(textBox, slideSize);
  return {
    id,
    type: "ellipse",
    box: roundBox(badge),
    style: { fill: "#FFFFFF", stroke: color, strokeWidthPt: 1.1, opacity: 0.9 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "line-text-native-timeline-step-badge",
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: "timeline-step-badge",
      inferredFromRegularTimeline: inferred,
      text
    }
  };
}

/** @param {TextBox} textBox @param {string} text @param {string} color @param {SlideSize} slideSize @param {boolean} inferred */
function timelineBadgeTextBox(textBox, text, color, slideSize, inferred) {
  const badge = timelineBadgeBox(textBox, slideSize);
  const source = isRecord(textBox.source) ? textBox.source : {};
  const font = isRecord(textBox.font) ? textBox.font : {};
  return {
    ...textBox,
    id: typeof textBox.id === "string" && textBox.id ? textBox.id : `line-text-timeline-step-badge-text-${text}`,
    text,
    box: roundBox(badge),
    font: {
      ...font,
      family: String(typeof font.family === "string" ? font.family : "Microsoft YaHei"),
      sizePt: Number.isFinite(Number(font.sizePt)) ? Number(font.sizePt) : 7.7,
      color,
      opacity: 1,
      weight: String(font.weight || "regular"),
      align: "center",
      valign: "middle"
    },
    source: {
      ...source,
      editable: true,
      nativeRebuild: true,
      detector: "line-text-native-timeline-step-badge-text",
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: "timeline-step-badge-text",
      inferredFromRegularTimeline: inferred
    }
  };
}

/** @param {TextBox} textBox @param {SlideSize} slideSize */
function timelineBadgeBox(textBox, slideSize) {
  const box = /** @type {Box} */ (textBox.box);
  const size = Math.max(20, Math.min(30, Math.max(box.w, box.h) + 10));
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return clampBox({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, slideSize)
    || { x: cx - size / 2, y: cy - size / 2, w: size, h: size };
}

/** @param {number[]} values */
function modeNumber(values) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return best ? best[0] : null;
}

/** @param {number[]} values @param {number} target */
function nearestIndex(values, target) {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = 0; index < values.length; index += 1) {
    const distance = Math.abs((values[index] || 0) - target);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

/** @param {AxisLineCluster[]} horizontal @param {AxisLineCluster[]} vertical @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createBorderedCards(horizontal, vertical, textBoxes, slideSize, image, existing) {
  /** @type {Shape[]} */
  const shapes = [];
  const hLines = horizontal.filter((line) => line && line.end - line.start >= 28);
  const vLines = vertical.filter((line) => line && line.end - line.start >= 16);
  for (const left of vLines) {
    for (const right of vLines) {
      if (!left || !right || right.a <= left.a + 24 || right.a - left.a > slideSize.widthPt * 0.34) continue;
      const x1 = left.a;
      const x2 = right.a;
      const topCandidates = hLines.filter((line) => line.start <= x1 + POSITION_TOLERANCE_PT && line.end >= x2 - POSITION_TOLERANCE_PT);
      for (const top of topCandidates) {
        if (!top) continue;
        for (const bottom of topCandidates) {
          if (!bottom || bottom.a <= top.a + 14 || bottom.a - top.a > 88) continue;
          const y1 = top.a;
          const y2 = bottom.a;
          if (left.start > y1 + POSITION_TOLERANCE_PT || right.start > y1 + POSITION_TOLERANCE_PT) continue;
          if (left.end < y2 - POSITION_TOLERANCE_PT || right.end < y2 - POSITION_TOLERANCE_PT) continue;
          const box = clampBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, slideSize);
          if (!box || box.w < 32 || box.h < 16) continue;
          if (existing.some((shape) => overlapRatio(shape.box, box) > 0.68) || shapes.some((shape) => overlapRatio(shape.box, box) > 0.68)) continue;
          const insideTexts = textBoxes.filter((text) => centerInside(text.box, box));
          if (insideTexts.length < 1 || insideTexts.length > 4) continue;
          const fill = sampleBoxFill(image, box, slideSize, "#FFFFFF");
          const stroke = cardStrokeColor([left, right, top, bottom]);
          shapes.push(nativeRect(`line-text-bordered-card-${shapes.length + 1}`, box, "line-text-native-bordered-card", {
            fill,
            stroke,
            strokeWidthPt: cardStrokeWidth([left, right, top, bottom]),
            radiusPt: Math.min(6, Math.max(2, box.h * 0.10)),
            opacity: 1
          }, { textCount: insideTexts.length }));
          if (shapes.length >= 96) return dedupeShapes(shapes);
        }
      }
    }
  }
  return dedupeShapes(shapes);
}

/** @param {AxisLineCluster[]} horizontal @param {AxisLineCluster[]} vertical @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image */
function createBoundedGridCells(horizontal, vertical, textBoxes, slideSize, image) {
  /** @type {Shape[]} */
  const shapes = [];
  for (const left of vertical) {
    if (!left) continue;
    for (const right of vertical) {
      if (!right || right.a <= left.a + 40) continue;
      const x1 = left.a;
      const x2 = right.a;
      if (x2 - x1 > slideSize.widthPt * 0.72) continue;
      const yTop = Math.max(left.start, right.start);
      const yBottom = Math.min(left.end, right.end);
      if (yBottom - yTop < 80) continue;
      const rows = horizontal
        .filter((line) => line && line.a >= yTop - POSITION_TOLERANCE_PT && line.a <= yBottom + POSITION_TOLERANCE_PT)
        .filter((line) => line && line.start <= x1 + POSITION_TOLERANCE_PT && line.end >= x2 - POSITION_TOLERANCE_PT)
        .sort((a, b) => Number(a?.a || 0) - Number(b?.a || 0));
      if (rows.length < 2) continue;
      const uniqueRows = uniquePositions(rows.map((line) => Number(line?.a || 0)), POSITION_TOLERANCE_PT);
      // A single enclosing rectangle is panel evidence. Repeated measured
      // partitions are required before interpreting it as a table grid.
      if (uniqueRows.length < 3) continue;
      const firstRow = uniqueRows[0];
      const lastRow = uniqueRows[uniqueRows.length - 1];
      if (firstRow === undefined || lastRow === undefined) continue;
      const insideTexts = textBoxes.filter((text) => centerInside(text.box, { x: x1, y: firstRow, w: x2 - x1, h: lastRow - firstRow }));
      if (insideTexts.length < 3) continue;
      for (let index = 0; index < uniqueRows.length - 1; index += 1) {
        const y1 = uniqueRows[index];
        const y2 = uniqueRows[index + 1];
        if (y1 === undefined || y2 === undefined) continue;
        const box = clampBox({ x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, slideSize);
        if (!box || box.h < 14 || box.w < 48) continue;
        const rowTexts = textBoxes.filter((text) => centerInside(text.box, box));
        if (rowTexts.length === 0) continue;
        shapes.push(nativeRect(`line-text-grid-cell-${shapes.length + 1}`, box, "line-text-native-grid-cell", {
          fill: sampleBoxFill(image, box, slideSize, "#FFFFFF"),
          stroke: "none",
          strokeWidthPt: 0,
          opacity: 1
        }, { rowIndex: index, textCount: rowTexts.length, preserveResidualInterior: true, residualBackgroundFill: true }));
      }
      for (const line of [left, right]) {
        if (!line) continue;
        shapes.push(nativeLine(`line-text-grid-rule-${shapes.length + 1}`, {
          ...line,
          start: firstRow,
          end: lastRow
        }, "line-text-native-grid-rule"));
      }
      for (const line of rows) {
        if (!line) continue;
        shapes.push(nativeLine(`line-text-grid-rule-${shapes.length + 1}`, {
          ...line,
          start: x1,
          end: x2
        }, "line-text-native-grid-rule"));
      }
      if (shapes.length >= MAX_COMPONENT_SHAPES) return dedupeShapes(shapes);
    }
  }
  return dedupeShapes(shapes);
}

/** @param {AxisLineCluster[]} horizontal @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createHorizontalSectionPanels(horizontal, textBoxes, slideSize, image, existing) {
  const groups = groupLinesBySpan(horizontal.filter(Boolean), slideSize);
  /** @type {Shape[]} */
  const shapes = [];
  for (const group of groups) {
    const ys = uniquePositions(group.map((line) => line.a), POSITION_TOLERANCE_PT).sort((a, b) => a - b);
    if (ys.length < 2) continue;
    const span = mergeSpan(group);
    if (span.w < slideSize.widthPt * 0.32) continue;
    for (let index = 0; index < ys.length - 1; index += 1) {
      const y1 = ys[index];
      const y2 = ys[index + 1];
      if (y1 === undefined || y2 === undefined) continue;
      const box = clampBox({ x: span.x, y: y1, w: span.w, h: y2 - y1 }, slideSize);
      if (!box || box.h < 36 || box.h > slideSize.heightPt * 0.38) continue;
      if (existing.some((shape) => overlapRatio(shape.box, box) > 0.72)) continue;
      const insideTexts = textBoxes.filter((text) => centerInside(text.box, box));
      if (insideTexts.length < 2) continue;
      const fill = samplePanelBackgroundFill(image, box, slideSize, "#FFFFFF");
      // Pale card fills must remain distinguishable from white gaps between cards.
      if (!panelFillMatchesInterior(image, box, slideSize, fill, 18)) continue;
      shapes.push(nativeRect(`line-text-section-panel-${shapes.length + 1}`, box, "line-text-native-section-panel", {
        fill,
        stroke: "none",
        strokeWidthPt: 0,
        opacity: 1
      }, { rowIndex: index, textCount: insideTexts.length }));
      if (shapes.length >= MAX_COMPONENT_SHAPES) return shapes;
    }
  }
  return shapes;
}

/** @param {TextBox[]} textBoxes @param {SlideSize} slideSize @param {Raster|null} image @param {Shape[]} existing */
function createTextAnchoredColorPanelObjects(textBoxes, slideSize, image, existing) {
  if (!image) return { shapes: [], textBoxes: [] };
  /** @type {Shape[]} */
  const shapes = [];
  /** @type {TextBox[]} */
  const nativeTextBoxes = [];
  for (const textBox of textBoxes) {
    if (!isBox(textBox.box)) continue;
    if (isNativeColorPanelText(textBox)) continue;
    const text = String(textBox.text || "").trim();
    const box = textBox.box;
    if (text.length < 2 || text.length > 32) continue;
    if (box.h < 7 || box.h > 32 || box.w < 18 || box.w > slideSize.widthPt * 0.28) continue;
    const padX = Math.max(4, Math.min(18, box.h * 0.9));
    const padY = Math.max(2, Math.min(10, box.h * 0.42));
    const panel = clampBox({ x: box.x - padX, y: box.y - padY, w: box.w + padX * 2, h: box.h + padY * 2 }, slideSize);
    if (!panel || panel.w < 24 || panel.h < 12) continue;
    if (existing.some((shape) => overlapRatio(shape.box, panel) > 0.65)) continue;
    if (shapes.some((shape) => overlapRatio(shape.box, panel) > 0.72)) continue;
    const sample = samplePanelColorEvidence(image, panel, slideSize) || sampleNearbyPanelColorEvidence(image, panel, slideSize);
    if (!sample) continue;
    const fittedPanel = fitPanelFromConnectedColorRegion(image, sample.fitBox || panel, slideSize, sample.fill);
    if (!fittedPanel && hasSourceTextGeometry(textBox)) continue;
    const expandedPanel = fittedPanel || sample.fitBox || expandPanelFromColorRun(image, box, panel, slideSize, sample.fill) || panel;
    if (hasSourceTextGeometry(textBox) && !colorPanelOwnsText(textBox, expandedPanel)) continue;
    shapes.push(nativeRect(`line-text-color-panel-${shapes.length + 1}`, expandedPanel, "line-text-native-color-panel", {
      fill: rgbToHex(sample.fill),
      stroke: rgbToHex(sample.stroke),
      strokeWidthPt: sample.strokeWidthPt,
      radiusPt: Math.min(5, Math.max(1.5, expandedPanel.h * 0.16)),
      opacity: 1
    }, { textCount: 1, labelTextId: typeof textBox.id === "string" ? textBox.id : undefined,
      colorDistance: Math.round(sample.distance), expandedFromTextAnchor: expandedPanel !== panel }));
    nativeTextBoxes.push(colorPanelLabelTextBox(textBox, expandedPanel, sample.fill));
    if (shapes.length >= 48) return { shapes: dedupeShapes(shapes), textBoxes: nativeTextBoxes };
  }
  return { shapes: dedupeShapes(shapes), textBoxes: nativeTextBoxes };
}

/** @param {TextBox} textBox */
function isNativeColorPanelText(textBox) {
  const detector = String(textBox?.source && isRecord(textBox.source) ? textBox.source.detector || "" : "");
  return detector === "line-text-native-color-panel-text";
}

/** @param {TextBox} textBox @param {Box} panel @param {Rgba} fill */
function colorPanelLabelTextBox(textBox, panel, fill) {
  const text = String(textBox.text || "").trim();
  const source = isRecord(textBox.source) ? textBox.source : {};
  const font = isRecord(textBox.font) ? textBox.font : {};
  const id = typeof textBox.id === "string" && textBox.id ? textBox.id : `line-text-color-panel-text-${text}`;
  if (hasSourceTextGeometry(textBox)) {
    return { ...textBox, id, source: { ...source, nativeRebuild: true,
      detector: "line-text-native-color-panel-text", preservedSourceTextGeometry: true } };
  }
  const darkFill = brightness(fill) < 150;
  return {
    ...textBox,
    id,
    text,
    box: roundBox(panel),
    font: {
      ...font,
      family: String(typeof font.family === "string" ? font.family : "Microsoft YaHei"),
      sizePt: Math.max(6, Math.min(12, panel.h * 0.44)),
      color: darkFill ? "#FFFFFF" : "#111111",
      opacity: 1,
      weight: String(font.weight || "bold"),
      align: "center",
      valign: "middle"
    },
    style: {
      ...(isRecord(textBox.style) ? textBox.style : {}),
      visibility: "visible",
      opacity: 1,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0,
      wrap: false,
      fit: "shrink"
    },
    source: {
      ...source,
      editable: true,
      nativeRebuild: true,
      detector: "line-text-native-color-panel-text",
      semanticNativeStructure: true,
      nativeComponentArchetype: "line-text-layout",
      nativeComponentRole: "color-panel-label"
    }
  };
}

module.exports = { createLineTextNativeComponents, createLineTextNativeComponentObjects };
