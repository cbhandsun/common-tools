// @ts-check
"use strict";

const { types } = require("node:util");
const primitiveEvidence = require("./source-icon-primitive-evidence");
const { shouldProtectSmallForegroundGraphicCrop } = require("./graphic-crop-policy");

/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{box:Box,text:string,index:number}} Text */
/** @typedef {{box:Box,type:string}} Shape */
/** @typedef {{id:number,box:Box,pixels:number,strong:number,edge:boolean,color:number[]}} Part */
/** @typedef {Readonly<{pixelBox:Readonly<Box>,box:Readonly<Box>,sourceEvidence:Readonly<{
 * detector:"leading-icon-crop-evidence",independentSourceROI:true,cropEvidenceRequired:true,
 * coordinateReferenceSizePx:Readonly<{width:number,height:number}>,mappedPixelBox:Readonly<Box>,
 * searchPixelBox:Readonly<Box>,textNeighborIndex:number,foregroundPixels:number,foregroundDensity:number,
 * connectedComponents:number,backgroundAgreement:number,scannedPixels:number}>}>} Candidate */

const LEADING_ICON_CROP_LIMITS = Object.freeze({ imagePixels: 40000000, scanPixels: 4000000,
  textBoxes: 2000, existingShapes: 4000, windowPixels: 262144, windowSide: 512, components: 256, candidates: 128 });
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value)
    || ![null, Object.prototype].includes(Object.getPrototypeOf(value))) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length <= 128 && keys.every(key => typeof key === "string" && "value" in (Object.getOwnPropertyDescriptor(value, key) ?? {}));
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @param {number} maximum @returns {unknown[] | null} */
function array(value, maximum) {
  if (types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > maximum) return null;
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) return null;
  /** @type {unknown[]} */ const result = [];
  for (let index = 0; index < value.length; index++) {
    const item = Object.getOwnPropertyDescriptor(value, String(index));
    if (!item || !("value" in item)) return null;
    result.push(/** @type {unknown} */ (item.value));
  }
  return result;
}
/** @param {unknown} value @returns {Raster | null} */
function raster(value) {
  if (!record(value) || !finite(value.width) || !finite(value.height)
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1
    || value.width > 16384 || value.height > 16384 || value.width * value.height > LEADING_ICON_CROP_LIMITS.imagePixels
    || types.isProxy(value.rgba) || !types.isUint8Array(value.rgba)) return null;
  for (const key of ["length", "buffer", "byteOffset", "byteLength", "subarray", "slice"]) {
    const property = Object.getOwnPropertyDescriptor(value.rgba, key);
    if (property && !("value" in property)) return null;
  }
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer = /** @type {unknown} */ (Reflect.get(prototype, "buffer", value.rgba));
  const length = /** @type {unknown} */ (Reflect.get(prototype, "length", value.rgba));
  const offset = /** @type {unknown} */ (Reflect.get(prototype, "byteOffset", value.rgba));
  if (!types.isArrayBuffer(buffer) || length !== value.width * value.height * 4 || !finite(offset)) return null;
  return { width: value.width, height: value.height, rgba: new Uint8Array(buffer, offset, /** @type {number} */ (length)) };
}
/** @param {unknown} value @param {number} width @param {number} height @param {boolean} [line] @returns {Box | null} */
function box(value, width, height, line = false) {
  if (!record(value) || !finite(value.x) || !finite(value.y) || !finite(value.w) || !finite(value.h)
    || value.x < 0 || value.y < 0 || value.w < 0 || value.h < 0 || value.w + value.h <= 0
    || (!line && (value.w === 0 || value.h === 0)) || value.x + value.w > width || value.y + value.h > height) return null;
  return { x: value.x, y: value.y, w: value.w, h: value.h };
}
/** @param {Box} value @param {number} sx @param {number} sy */
function scale(value, sx, sy) { return { x: value.x * sx, y: value.y * sy, w: value.w * sx, h: value.h * sy }; }
/** @param {Box} a @param {Box} b @param {number} [gap] */
function touches(a, b, gap = 0) {
  return a.x <= b.x + b.w + gap && a.x + a.w + gap >= b.x && a.y <= b.y + b.h + gap && a.y + a.h + gap >= b.y;
}
/** @param {Box} a @param {Box} b */
function union(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}
/** @param {Raster} image @param {number} x @param {number} y */
function color(image, x, y) {
  const offset = (y * image.width + x) * 4, alpha = (image.rgba[offset + 3] ?? 0) / 255;
  return [Math.round((image.rgba[offset] ?? 0) * alpha), Math.round((image.rgba[offset + 1] ?? 0) * alpha),
    Math.round((image.rgba[offset + 2] ?? 0) * alpha), image.rgba[offset + 3] ?? 0];
}
/** @param {number[]} a @param {number[]} b */
function distance(a, b) { return Math.max(...a.map((value, index) => Math.abs(value - (b[index] ?? 0)))); }
/** @param {Raster} image @param {Box} window */
function background(image, window) {
  const histograms = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
  let count = 0;
  /** @param {number} x @param {number} y */
  const sample = (x, y) => {
    count++;
    const pixel = color(image, x, y);
    for (let channel = 0; channel < 4; channel++) {
      const histogram = histograms[channel], value = pixel[channel] ?? 0;
      if (histogram) histogram[value] = (histogram[value] ?? 0) + 1;
    }
  };
  for (let x = window.x; x < window.x + window.w; x++) { sample(x, window.y); sample(x, window.y + window.h - 1); }
  for (let y = window.y + 1; y < window.y + window.h - 1; y++) { sample(window.x, y); sample(window.x + window.w - 1, y); }
  return histograms.map(histogram => {
    let sum = 0;
    for (let value = 0; value < 256; value++) { sum += histogram[value] ?? 0; if (sum >= count / 2) return value; }
    return 0;
  });
}
/** Scan the label-facing band exactly; empty and text-owned neighborhoods need no full mask.
 * @param {Raster} image @param {Box} window @param {number[]} backdrop @param {Text} text
 * @param {Text[]} texts @param {number} remaining */
function foregroundSeed(image, window, backdrop, text, texts, remaining) {
  const left = Math.max(window.x, Math.floor(text.box.x - text.box.h * 3));
  const right = Math.min(window.x + window.w, Math.ceil(text.box.x - 2));
  const top = Math.max(window.y, Math.floor(text.box.y)), bottom = Math.min(window.y + window.h, Math.ceil(text.box.y + text.box.h));
  const band = { x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) };
  const owners = texts.filter(item => touches(band, item.box, 1));
  let scanned = 0;
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    if (owners.some(item => x >= item.box.x - 1 && x < item.box.x + item.box.w + 1
      && y >= item.box.y - 1 && y < item.box.y + item.box.h + 1)) continue;
    if (++scanned > remaining) return { found: false, scanned, exceeded: true };
    if (distance(color(image, x, y), backdrop) >= 24) return { found: true, scanned, exceeded: false };
  }
  return { found: false, scanned, exceeded: false };
}
/** Lazy pixel admission retains full connected ink, without scanning every unrelated glyph.
 * @param {Raster} image @param {Box} window @param {number[]} backdrop @param {Text} text
 * @param {Text[]} texts @param {number} remaining */
function components(image, window, backdrop, text, texts, remaining) {
  const area = window.w * window.h, mask = new Uint8Array(area), labels = new Int32Array(area);
  const queue = new Int32Array(area);
  /** @type {Part[]} */ const parts = [];
  const owners = texts.filter(text => touches(window, text.box, 1));
  let sequence = 0, scanned = 0, exceeded = false;
  /** @param {number} local */
  function sample(local) {
    const cached = mask[local] ?? 0;
    if (cached) return cached;
    if (++scanned > remaining) { exceeded = true; return 1; }
    const delta = distance(color(image, window.x + local % window.w, window.y + Math.floor(local / window.w)), backdrop);
    return mask[local] = delta >= 24 ? 3 : delta >= 12 ? 2 : 1;
  }
  /** @param {number} seed */
  function flood(seed) {
    if (labels[seed] || sample(seed) < 2 || exceeded) return;
    const id = ++sequence;
    let head = 0, tail = 1, minX = window.w, minY = window.h, maxX = 0, maxY = 0, strongPixels = 0, edge = false, rejected = false;
    const sums = [0, 0, 0]; queue[0] = seed; labels[seed] = id;
    while (head < tail && !exceeded) {
      if (++scanned > remaining) { exceeded = true; break; }
      const local = queue[head++] ?? 0, x = local % window.w, y = Math.floor(local / window.w);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      strongPixels += Number(mask[local] === 3);
      edge ||= x < 2 || y < 2 || x >= window.w - 2 || y >= window.h - 2;
      if (edge || owners.some(item => window.x + x >= item.box.x - 1 && window.x + x < item.box.x + item.box.w + 1
        && window.y + y >= item.box.y - 1 && window.y + y < item.box.y + item.box.h + 1)) { rejected = true; break; }
      const offset = ((window.y + y) * image.width + window.x + x) * 4;
      for (let channel = 0; channel < 3; channel++) sums[channel] = (sums[channel] ?? 0) + (image.rgba[offset + channel] ?? 0);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, next = ny * window.w + nx;
        if (nx < 0 || ny < 0 || nx >= window.w || ny >= window.h) continue;
        if ((labels[next] ?? 0) < 0) { rejected = true; continue; }
        if (labels[next] || sample(next) < 2 || exceeded) continue;
        labels[next] = id; queue[tail++] = next;
      }
      if (rejected) break;
    }
    // Propagate proven text/boundary rejection through later seeds; never turn an unfinished flood into a crop.
    if (rejected) {
      for (let index = 0; index < tail; index++) {
        if (++scanned > remaining) { exceeded = true; break; }
        labels[queue[index] ?? 0] = -1;
      }
      return;
    }
    const bounds = { x: window.x + minX, y: window.y + minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    // Flood all source ink first: excluding text from the mask could sever a connected icon.
    // Only supported, unowned parts consume candidate storage; discarded ink still blocks the moat.
    if (exceeded || strongPixels < 6 || tail < 6 || owners.some(text => touches(bounds, text.box, 1))) return;
    if (parts.length >= LEADING_ICON_CROP_LIMITS.components) { exceeded = true; return; }
    parts.push({ id, box: bounds,
      pixels: tail, strong: strongPixels, edge, color: sums.map(sum => Math.round(sum / tail)) });
  }
  /** @param {Box} region @param {boolean} [protectOwners] */
  function scan(region, protectOwners = false) {
    const left = Math.max(window.x, region.x), right = Math.min(window.x + window.w, region.x + region.w);
    const top = Math.max(window.y, region.y), bottom = Math.min(window.y + window.h, region.y + region.h);
    for (let y = top; y < bottom && !exceeded; y++) for (let x = left; x < right && !exceeded; x++) {
      if (++scanned > remaining) { exceeded = true; break; }
      if (protectOwners && owners.some(item => x >= item.box.x - 1 && x < item.box.x + item.box.w + 1
        && y >= item.box.y - 1 && y < item.box.y + item.box.h + 1)) continue;
      flood((y - window.y) * window.w + x - window.x);
    }
  }
  const left = Math.max(window.x, Math.floor(text.box.x - text.box.h * 3));
  const right = Math.min(window.x + window.w, Math.ceil(text.box.x - 2));
  const top = Math.max(window.y, Math.floor(text.box.y)), bottom = Math.min(window.y + window.h, Math.ceil(text.box.y + text.box.h));
  scan({ x: left, y: top, w: Math.max(0, right - left), h: Math.max(0, bottom - top) }, true);
  // Scan enclosed details and nearby disconnected strokes, not the rest of the expansion window.
  const expanded = new Set();
  for (let index = 0; index < parts.length && !exceeded; index++) {
    const part = parts[index];
    if (!part || part.edge || part.box.w < 6 || part.box.h < 6 || part.box.x + part.box.w >= text.box.x - 1
      || !touches(part.box, { ...text.box, x: part.box.x, w: part.box.w })) continue;
    let roi = part.box, changed = true;
    while (changed && !exceeded) {
      const key = `${roi.x}:${roi.y}:${roi.w}:${roi.h}`;
      if (!expanded.has(key)) {
        expanded.add(key);
        scan({ x: roi.x - 2, y: roi.y - 2, w: roi.w + 4, h: roi.h + 4 });
      }
      const previous = roi;
      for (const neighbor of parts) if (touches(roi, neighbor.box, 2)) roi = union(roi, neighbor.box);
      changed = roi.x !== previous.x || roi.y !== previous.y || roi.w !== previous.w || roi.h !== previous.h;
    }
  }
  return exceeded ? null : { labels, parts, scanned };
}
/** Thin runs protruding from an otherwise compact region are connector evidence.
 * @param {Int32Array} labels @param {Box} window @param {Box} roi @param {Set<number>} ids */
function hasThinTail(labels, window, roi, ids) {
  const rows = new Uint32Array(roi.h), columns = new Uint32Array(roi.w);
  for (let y = 0; y < roi.h; y++) for (let x = 0; x < roi.w; x++) {
    if (!ids.has(labels[(roi.y + y - window.y) * window.w + roi.x + x - window.x] ?? 0)) continue;
    rows[y] = (rows[y] ?? 0) + 1; columns[x] = (columns[x] ?? 0) + 1;
  }
  const thin = Math.max(2, Math.floor(Math.min(roi.w, roi.h) * 0.08));
  for (const counts of [rows, columns]) for (const reverse of [false, true]) {
    let run = 0;
    while (run < counts.length && (counts[reverse ? counts.length - run - 1 : run] ?? 0) <= thin) run++;
    if (run >= Math.max(3, Math.ceil(Math.min(roi.w, roi.h) * 0.2))) return true;
  }
  return false;
}
/** @param {Box} roi @param {Shape[]} shapes @param {Text[]} texts @param {Raster} image */
function alreadyOwned(roi, shapes, texts, image) {
  return shapes.some(shape => {
    const b = shape.box;
    if (!["rect", "ellipse"].includes(shape.type) || b.w * b.h > roi.w * roi.h * 4
      || b.w * b.h / (image.width * image.height) > 0.035 || b.w / image.width > 0.18 || b.h / image.height > 0.22
      || texts.some(text => touches(b, text.box)) || !touches(roi, b)) return false;
    const overlap = Math.max(0, Math.min(roi.x + roi.w, b.x + b.w) - Math.max(roi.x, b.x))
      * Math.max(0, Math.min(roi.y + roi.h, b.y + b.h) - Math.max(roi.y, b.y));
    return overlap >= roi.w * roi.h * 0.8;
  });
}

/** Detect only isolated source ROIs; no assets, masks, text values or publication decisions are produced.
 * Invalid or over-budget requests fail closed with an empty array.
 * @param {unknown} input @returns {readonly Candidate[]} */
function detectLeadingIconCropCandidates(input) {
  if (!record(input) || !record(input.slideSize)) return Object.freeze([]);
  const image = raster(input.image), size = input.slideSize;
  const rawTexts = array(input.textBoxes, LEADING_ICON_CROP_LIMITS.textBoxes);
  const rawShapes = array(input.existingShapes === undefined ? [] : input.existingShapes, LEADING_ICON_CROP_LIMITS.existingShapes);
  const scanLimit = input.maxScanPixels === undefined ? LEADING_ICON_CROP_LIMITS.scanPixels : input.maxScanPixels;
  if (!image || !rawTexts || !rawShapes || !finite(size.widthPt) || !finite(size.heightPt)
    || size.widthPt < 1 || size.heightPt < 1 || size.widthPt > 100000 || size.heightPt > 100000
    || !finite(scanLimit) || !Number.isSafeInteger(scanLimit) || scanLimit < 1 || scanLimit > LEADING_ICON_CROP_LIMITS.scanPixels) return Object.freeze([]);
  const sx = image.width / size.widthPt, sy = image.height / size.heightPt;
  /** @type {Text[]} */ const texts = [];
  /** @type {Shape[]} */ const shapes = [];
  for (let index = 0; index < rawTexts.length; index++) {
    const item = rawTexts[index];
    if (!record(item) || typeof item.text !== "string" || item.text.length > 65536
      || (item.visible !== undefined && typeof item.visible !== "boolean")) return Object.freeze([]);
    const bounds = box(item.box, size.widthPt, size.heightPt);
    if (!bounds) return Object.freeze([]);
    if (item.visible !== false && item.text.trim()) texts.push({ box: scale(bounds, sx, sy), text: item.text, index });
  }
  for (const item of rawShapes) {
    if (!record(item) || typeof item.type !== "string" || item.type.length > 64) return Object.freeze([]);
    const bounds = box(item.box, size.widthPt, size.heightPt, item.type === "line");
    if (!bounds) return Object.freeze([]);
    shapes.push({ box: scale(bounds, sx, sy), type: item.type });
  }
  let scanned = 0;
  /** @type {Candidate[]} */ const candidates = [];
  const scannedWindows = new Set();
  for (const text of texts) {
    const h = text.box.h, cy = text.box.y + h / 2;
    const left = Math.max(0, Math.floor(text.box.x - h * 5)), right = Math.min(image.width, Math.ceil(text.box.x + h));
    const top = Math.max(0, Math.floor(cy - h * 3)), bottom = Math.min(image.height, Math.ceil(cy + h * 3));
    const window = { x: left, y: top, w: right - left, h: bottom - top };
    if (window.w < 8 || window.h < 8) continue;
    if (window.w > LEADING_ICON_CROP_LIMITS.windowSide || window.h > LEADING_ICON_CROP_LIMITS.windowSide
      || window.w * window.h > LEADING_ICON_CROP_LIMITS.windowPixels) continue;
    const key = `${left}:${top}:${right}:${bottom}`;
    if (scannedWindows.has(key)) continue;
    scannedWindows.add(key);
    scanned += (window.w + window.h) * 2;
    if (scanned > scanLimit) return Object.freeze([]);
    const backdrop = background(image, window), seed = foregroundSeed(image, window, backdrop, text, texts, scanLimit - scanned);
    scanned += seed.scanned;
    if (seed.exceeded) return Object.freeze([]);
    if (!seed.found) continue;
    const found = components(image, window, backdrop, text, texts, scanLimit - scanned);
    if (!found) return Object.freeze([]);
    scanned += found.scanned;
    const consumed = new Set();
    for (const part of [...found.parts].sort((a, b) => b.pixels - a.pixels || a.id - b.id)) {
      if (consumed.has(part.id) || part.box.w < 6 || part.box.h < 6 || part.strong < 6 || part.edge
        || part.box.x + part.box.w >= text.box.x - 1 || !touches(part.box, { ...text.box, x: part.box.x, w: part.box.w })) continue;
      let roi = part.box;
      const ids = new Set([part.id]);
      // Include enclosed details and nearby disconnected contour parts before testing the outer moat.
      let changed = true;
      while (changed) {
        changed = false;
        for (const neighbor of found.parts) if (!ids.has(neighbor.id) && touches(roi, neighbor.box, 2)) {
          ids.add(neighbor.id); roi = union(roi, neighbor.box); changed = true;
        }
      }
      for (const id of ids) consumed.add(id);
      const group = found.parts.filter(item => ids.has(item.id));
      const pixels = group.reduce((sum, item) => sum + item.pixels, 0), density = pixels / (roi.w * roi.h);
      const gap = text.box.x - roi.x - roi.w;
      // Tiny isolated marks beside a line are often bullets or punctuation.
      // Source isolation alone cannot make them an independent pictorial unit.
      if (roi.w < h * 0.7 && roi.h < h * 0.7) continue;
      if (group.some(item => item.edge) || gap < 2 || gap > Math.max(h * 1.5, roi.h)
        || density < 0.06 || texts.some(item => touches(roi, item.box, 1))
        || alreadyOwned(roi, shapes, texts, image) || hasThinTail(found.labels, window, roi, ids)) continue;
      const pixelBox = { x: roi.x - 1, y: roi.y - 1, w: roi.w + 2, h: roi.h + 2 };
      if (pixelBox.x < 2 || pixelBox.y < 2 || pixelBox.x + pixelBox.w + 2 > image.width || pixelBox.y + pixelBox.h + 2 > image.height) continue;
      const slideBox = scale(pixelBox, 1 / sx, 1 / sy);
      const areaRatio = pixelBox.w * pixelBox.h / (image.width * image.height), aspect = pixelBox.w / pixelBox.h;
      if (areaRatio > 0.035 || pixelBox.w / image.width > 0.18 || pixelBox.h / image.height > 0.22 || aspect < 0.5 || aspect > 3.25
        || !shouldProtectSmallForegroundGraphicCrop({ detector: "foreground-graphic-crop", box: slideBox,
          slideSize: { widthPt: size.widthPt, heightPt: size.heightPt }, textBoxes: texts.map(item => ({ text: item.text, box: scale(item.box, 1 / sx, 1 / sy) })) })) continue;
      let clear = 0, total = 0;
      for (let y = pixelBox.y - 1; y <= pixelBox.y + pixelBox.h; y++) for (let x = pixelBox.x - 1; x <= pixelBox.x + pixelBox.w; x++) {
        if (x !== pixelBox.x - 1 && x !== pixelBox.x + pixelBox.w && y !== pixelBox.y - 1 && y !== pixelBox.y + pixelBox.h) continue;
        total++; clear += Number(distance(color(image, x, y), backdrop) < 12);
      }
      scanned += total + Math.min(262144, roi.w * roi.h * 9) + roi.w * roi.h + (roi.w + roi.h) * 8;
      if (scanned > scanLimit) return Object.freeze([]);
      const agreement = clear / total;
      if (agreement !== 1) continue;
      const fill = `#${part.color.map(value => value.toString(16).padStart(2, "0")).join("")}`;
      const primitive = primitiveEvidence.sourceIconPrimitiveEvidence({ image, pixelBox: roi, fill });
      if (primitive && ["x", "y", "w", "h"].every(key =>
        primitive.pixelBox[/** @type {keyof Box} */ (key)] === roi[/** @type {keyof Box} */ (key)])) continue;
      if (density > 0.92) continue;
      if (candidates.some(candidate => touches(candidate.pixelBox, pixelBox, 2))) continue;
      if (candidates.length >= LEADING_ICON_CROP_LIMITS.candidates) return Object.freeze([]);
      candidates.push(Object.freeze({ pixelBox: Object.freeze(pixelBox), box: Object.freeze(slideBox), sourceEvidence: Object.freeze({
        detector: "leading-icon-crop-evidence", independentSourceROI: true, cropEvidenceRequired: true,
        coordinateReferenceSizePx: Object.freeze({ width: image.width, height: image.height }), mappedPixelBox: Object.freeze({ ...pixelBox }),
        searchPixelBox: Object.freeze(window), textNeighborIndex: text.index, foregroundPixels: pixels, foregroundDensity: density,
        connectedComponents: ids.size, backgroundAgreement: agreement, scannedPixels: scanned
      }) }));
    }
  }
  return Object.freeze(candidates);
}

module.exports = { detectLeadingIconCropCandidates, LEADING_ICON_CROP_LIMITS };
