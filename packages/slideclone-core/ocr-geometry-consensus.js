// @ts-check
"use strict";
const { boundedOcrSourceDeck } = require("./ocr-source-deck");
const { sourceTextEraseMask } = require("./residual-source-text-evidence");
const { residualTextPlans } = require("./residual-text-erasure");
const { admitOcrWordPositionHints } = require("./ocr-word-position-hints");
const { projectSourceWordRuns } = require("./source-word-layout-projection");
/** @typedef {import("./ocr-result-admission").OcrLine} Line */
/** @typedef {{width:number,height:number,rgba:Buffer}} Raster */
/** @typedef {{index:number,x:number,y:number,scale:number,box:{x:number,y:number,w:number,h:number}}} Placement */
/** @param {Raster} image @param {{lines:readonly Line[]}} ocr */
function geometryReviewTargets(image, ocr) {
  const deck = boundedOcrSourceDeck({ metadata: { dimensions: { widthPx: image.width, heightPx: image.height } }, ocr, sourceImage: "source.png", sourceRaster: image });
  const entries = (deck.pages[0]?.textBoxes || []).map(text => ({ text, mask: sourceTextEraseMask(text, image, deck.slideSize) }))
    .filter(({ mask }) => mask.w * mask.h <= 262144);
  const texts = entries.map(entry => entry.text), masks = entries.map(entry => entry.mask);
  const plans = residualTextPlans(image, masks);
  return plans.flatMap((plan, index) => {
    const unresolved = plan.core.some((core, pixel) => core && !plan.owned[pixel]);
    const id = texts[index]?.id.match(/^p0-ocr-(\d+)$/u);
    return unresolved && id ? [Number(id[1]) - 1] : [];
  }).slice(0, 32);
}
/** Pack crops with an exact source transform. Balanced shelves avoid forcing
 * OCR detectors to downsample a tall strip of otherwise readable small text.
 * @param {Raster} image @param {readonly Line[]} lines @param {number[]} targets @param {number} padding @param {number} [scale] */
function geometryReviewSheet(image, lines, targets, padding, scale = 1) {
  if (![0, 8].includes(padding) || ![1, 2].includes(scale) || targets.length > 32 || new Set(targets).size !== targets.length) throw new TypeError("OCR geometry sheet request is invalid");
  let height = 20, width = 40;
  /** @type {Placement[]} */ const placements = [];
  for (const index of targets) {
    const line = lines[index]; if (!Number.isSafeInteger(index) || !line) throw new TypeError("OCR geometry target is invalid");
    const x = Math.max(0, Math.floor(line.box.x) - padding), y = Math.max(0, Math.floor(line.box.y) - padding);
    const box = { x, y, w: Math.min(image.width, Math.ceil(line.box.x + line.box.w) + padding) - x,
      h: Math.min(image.height, Math.ceil(line.box.y + line.box.h) + padding) - y };
    if (box.w <= 0 || box.h <= 0) throw new TypeError("OCR geometry crop is invalid");
    placements.push({ index, x: 20, y: 20, scale, box });
  }
  const shelfWidth = Math.max(40, ...placements.map(p => p.box.w * scale + 40),
    Math.ceil(Math.sqrt(placements.reduce((sum,p) => sum + (p.box.w * scale + 40) * (p.box.h * scale + 40), 0))));
  let left = 20, top = 20, rowHeight = 0;
  for (const p of placements) {
    if (left > 20 && left + p.box.w * scale + 20 > shelfWidth) { top += rowHeight + 40; left = 20; rowHeight = 0; }
    p.x = left; p.y = top;
    left += p.box.w * scale + 40; rowHeight = Math.max(rowHeight, p.box.h * scale);
    width = Math.max(width, left - 20); height = Math.max(height, top + rowHeight + 20);
  }
  if (width > 16384 || height > 16384 || width * height > 2000000) throw new RangeError("OCR geometry sheet exceeds pixel budget");
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (const p of placements) for (let row = 0; row < p.box.h * scale; row++) for (let col = 0; col < p.box.w * scale; col++) {
    const offset = ((p.box.y + Math.floor(row / scale)) * image.width + p.box.x + Math.floor(col / scale)) * 4;
    image.rgba.copy(rgba, ((p.y + row) * width + p.x + col) * 4, offset, offset + 4);
  }
  return { image: { width, height, rgba }, placements };
}
/** @param {Line} original @param {Placement} placement @param {readonly Line[]} lines */
function matchingGeometry(original, placement, lines) {
  const matches = lines.filter(line => line.text.replace(/\s/gu, "") === original.text.replace(/\s/gu, "")
    && line.box.x >= placement.x - 2 && line.box.y >= placement.y - 2
    && line.box.x + line.box.w <= placement.x + placement.box.w * placement.scale + 2
    && line.box.y + line.box.h <= placement.y + placement.box.h * placement.scale + 2);
  if (matches.length !== 1 || !matches[0]) return null;
  const line = matches[0];
  const polygon = line.polygon || [[line.box.x, line.box.y], [line.box.x + line.box.w, line.box.y], [line.box.x + line.box.w, line.box.y + line.box.h], [line.box.x, line.box.y + line.box.h]];
  const sourcePolygon=polygon.map(p => /** @type {[number,number]} */ ([(p[0] - placement.x) / placement.scale + placement.box.x, (p[1] - placement.y) / placement.scale + placement.box.y]));
  const x=Math.min(...sourcePolygon.map(p=>p[0])),y=Math.min(...sourcePolygon.map(p=>p[1]));
  const sourceBox={x,y,w:Math.max(...sourcePolygon.map(p=>p[0]))-x,h:Math.max(...sourcePolygon.map(p=>p[1]))-y};
  // Contextual recognition proposes word positions in its own crop frame.
  // Keep only that exact sequence, map it with the accepted line transform,
  // then re-admit it. Old positions cannot survive a changed quadrilateral.
  const hints=line.text.trim()===original.text.trim()?admitOcrWordPositionHints(line.wordPositionHints,line):undefined;
  const wordPositionHints=hints?admitOcrWordPositionHints(projectSourceWordRuns(hints,line.box,sourceBox),{text:original.text,box:sourceBox}):undefined;
  return { confidence: line.confidence, polygon:sourcePolygon,...(wordPositionHints?{wordPositionHints}:{}) };
}
/** @param {{lines:readonly Line[]}} ocr @param {{placements:Placement[],ocr:{lines:readonly Line[]}}[]} observations @param {{widthPx:number,heightPx:number}} dimensions */
function applyGeometryConsensus(ocr, observations, dimensions) {
  if (observations.length !== 2) throw new TypeError("OCR geometry requires two observations");
  let revised = 0;
  const lines = ocr.lines.map((line, index) => {
    const matches = observations.map(observation => {
      const placements = observation.placements.filter(p => p.index === index);
      return placements.length === 1 && placements[0] ? matchingGeometry(line, placements[0], observation.ocr.lines) : null;
    });
    const a = matches[0], b = matches[1]; if (!a || !b) return line;
    // Require both independent measurements to agree before changing geometry.
    const bounds = (/** @type {[number,number][]} */ polygon) => ({ x: Math.min(...polygon.map(p => p[0])), y: Math.min(...polygon.map(p => p[1])), r: Math.max(...polygon.map(p => p[0])), b: Math.max(...polygon.map(p => p[1])) });
    const first = bounds(a.polygon), second = bounds(b.polygon);
    if ([first.x-second.x, first.y-second.y, first.r-second.r, first.b-second.b].some(delta => Math.abs(delta) > Math.max(3, line.box.h * 0.25))) return line;
    const merged = bounds(b.polygon);
    const box = { x: merged.x, y: merged.y, w: merged.r - merged.x, h: merged.b - merged.y };
    if (box.x < 0 || box.y < 0 || merged.r > dimensions.widthPx || merged.b > dimensions.heightPx
      || box.w <= 0 || box.h <= 0 || box.w < line.box.w * 0.5 || box.h < line.box.h * 0.5
      || box.w > line.box.w * 1.25 || box.h > line.box.h * 1.25) return line;
    // Keep the contextual polygon and its exact envelope together. Text
    // content and original confidence never increase.
    revised++;
    return { text: line.text, confidence: Math.min(line.confidence, a.confidence, b.confidence), box, polygon: b.polygon,
      ...(b.wordPositionHints?{wordPositionHints:b.wordPositionHints}:{}) };
  });
  return { ocr: { lines }, revised };
}
module.exports = { geometryReviewTargets, geometryReviewSheet, applyGeometryConsensus };
