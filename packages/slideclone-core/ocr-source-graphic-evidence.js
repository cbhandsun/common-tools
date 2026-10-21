// @ts-check
"use strict";

const { types } = require("node:util");
const { makeEdgeConnectedBackgroundTransparent } = require("./edge-background-alpha");
const { admitOcrGraphicEvidence } = require("./ocr-graphic-evidence-admission");
const iconEvidence = require("./ocr-source-icon-evidence");
const {hasSourceArrowTerminal}=require('./ocr-source-arrow-evidence');

const MAX_SCAN_PIXELS = 262144;

/** @typedef {{x:number,y:number,w:number,h:number}} PixelBox */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{text:string,confidence:number,box:{x:number,y:number,w:number,h:number}}} OcrLine */

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every((property) => "value" in property);
}

/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }

/** @param {string} text */
function hasControlCharacters(text) {
  for (const character of text) {
    const code = character.charCodeAt(0);
    if (code < 32 || code === 127) return true;
  }
  return false;
}

/** @param {unknown} value @returns {Raster | null} */
function raster(value) {
  if (!record(value)) return null;
  const { width, height, rgba } = value;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || width > 16384 || height < 1 || height > 16384
    || width * height > 40000000 || types.isProxy(rgba) || !types.isUint8Array(rgba)) return null;
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const length = Reflect.get(prototype, "length", rgba);
  const buffer = Reflect.get(prototype, "buffer", rgba);
  const offset = Reflect.get(prototype, "byteOffset", rgba);
  if (length !== width * height * 4 || !types.isArrayBuffer(buffer)) return null;
  return { width, height, rgba: new Uint8Array(buffer, offset, length) };
}

/** @param {unknown} value @param {Raster} image @returns {OcrLine | null} */
function line(value, image) {
  if (!record(value) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 512 || hasControlCharacters(value.text)
    || !finite(value.confidence) || value.confidence < 0 || value.confidence > 1 || !record(value.box)) return null;
  const { x, y, w, h } = value.box;
  if (!finite(x) || !finite(y) || !finite(w) || !finite(h)
    || x < 0 || y < 0 || w <= 0 || h <= 0 || x + w > image.width || y + h > image.height) return null;
  return { text: value.text, confidence: value.confidence,
    box: { x, y, w, h } };
}

/** @param {{x:number,y:number,w:number,h:number}} box @param {Raster} image @returns {PixelBox} */
function boundedPixelBox(box, image) {
  const x = Math.max(0, Math.floor(box.x)); const y = Math.max(0, Math.floor(box.y));
  const right = Math.min(image.width, Math.ceil(box.x + box.w)); const bottom = Math.min(image.height, Math.ceil(box.y + box.h));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

/** @param {Raster} image @param {PixelBox} box */
function crop(image, box) {
  const rgba = Buffer.alloc(box.w * box.h * 4);
  for (let row = 0; row < box.h; row += 1) {
    const sourceStart = ((box.y + row) * image.width + box.x) * 4;
    rgba.set(image.rgba.subarray(sourceStart, sourceStart + box.w * 4), row * box.w * 4);
  }
  return { width: box.w, height: box.h, rgba };
}

/** @param {OcrLine} candidate @param {OcrLine[]} lines @param {number} referenceHeight */
function hasTextRowSupport(candidate, lines, referenceHeight) {
  const center = candidate.box.y + candidate.box.h / 2;
  for (const other of lines) {
    const sameCandidate = other.text === candidate.text && other.box.x === candidate.box.x && other.box.y === candidate.box.y
      && other.box.w === candidate.box.w && other.box.h === candidate.box.h;
    if (sameCandidate || other.confidence < 0.65) continue;
    const otherCenter = other.box.y + other.box.h / 2;
    const verticalTolerance = Math.max(2, Math.min(candidate.box.h, other.box.h) * 0.42);
    if (Math.abs(center - otherCenter) > verticalTolerance) continue;
    const gap = other.box.x >= candidate.box.x + candidate.box.w
      ? other.box.x - candidate.box.x - candidate.box.w
      : candidate.box.x >= other.box.x + other.box.w ? candidate.box.x - other.box.x - other.box.w : 0;
    if (gap <= Math.max(referenceHeight * 1.6, candidate.box.h * 1.25)) return true;
  }
  return false;
}

/** @param {{width:number,height:number,rgba:Buffer}} image @param {{x:number,y:number,w:number,h:number}} original */
function foregroundComponents(image, original) {
  const visited = new Uint8Array(image.width * image.height); const components = [];
  for (let seed = 0; seed < visited.length; seed += 1) {
    const seedAlpha = image.rgba[seed * 4 + 3];
    if (visited[seed] || seedAlpha === undefined || seedAlpha < 32) continue;
    const stack = [seed]; visited[seed] = 1; const members = [];
    let minX = image.width, minY = image.height, maxX = -1, maxY = -1, originalHits = 0;
    while (stack.length) {
      const pixel = stack.pop(); if (pixel === undefined) break;
      const x = pixel % image.width, y = Math.floor(pixel / image.width); members.push(pixel);
      minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
      if (x >= original.x && x < original.x + original.w && y >= original.y && y < original.y + original.h) originalHits += 1;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
        const next = ny * image.width + nx;
        const nextAlpha = image.rgba[next * 4 + 3];
        if (!visited[next] && nextAlpha !== undefined && nextAlpha >= 32) { visited[next] = 1; stack.push(next); }
      }
    }
    if (originalHits > 0) components.push({ members, originalHits, box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 } });
    if (components.length > 64) return [];
  }
  return components;
}

/** @param {{x:number,y:number,w:number,h:number}[]} boxes */
function union(boxes) {
  const x = Math.min(...boxes.map((box) => box.x)); const y = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w)); const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x, y, w: right - x, h: bottom - y };
}

/** @param {number} value @param {number} min @param {number} max */
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

/**
 * Returns positive source-geometry evidence only. OCR confidence is a trigger,
 * never sufficient evidence on its own.
 * @param {unknown} input @param {{scannedPixels:number}} work
 * @returns {import("./ocr-graphic-evidence-admission").OcrGraphicEvidence | null}
 */
function collectSourceGraphicEvidence(input, work) {
  if (!record(input)) return null;
  const image = raster(input.image); if (!image) return null;
  const candidate = line(input.line, image); if (!candidate || !Array.isArray(input.lines) || types.isProxy(input.lines) || input.lines.length > 10000) return null;
  /** @type {OcrLine[]} */
  const parsedLines = [];
  for (let index = 0; index < input.lines.length; index += 1) {
    const property = Object.getOwnPropertyDescriptor(input.lines, String(index));
    if (!property || !("value" in property)) return null;
    const parsed = line(property.value, image); if (!parsed) return null;
    parsedLines.push(parsed);
  }
  if (!finite(input.referenceHeight) || input.referenceHeight < 1 || input.referenceHeight > image.height) return null;
  const referenceHeight = input.referenceHeight;
  const text = candidate.text.trim();
  if (Array.from(text).length !== 1 || /^[\p{P}\p{S}\s]+$/u.test(text) || candidate.confidence >= 0.72
    || hasTextRowSupport(candidate, parsedLines, referenceHeight)) return null;
  const outlier = candidate.box.h >= referenceHeight * 1.15 && candidate.box.w >= referenceHeight * 0.45;
  const strongOutlier = candidate.box.h >= referenceHeight * 1.5 && candidate.box.w >= referenceHeight * 0.55;
  const candidatePixelBox = boundedPixelBox(candidate.box, image);
  const padding = outlier
    ? Math.max(4, Math.min(48, Math.ceil(Math.min(Math.max(candidatePixelBox.w, candidatePixelBox.h) * 0.45, referenceHeight * 0.8))))
    : Math.min(48,Math.max(candidatePixelBox.w,candidatePixelBox.h));
  const scan = boundedPixelBox({ x: candidatePixelBox.x - padding, y: candidatePixelBox.y - padding,
    w: candidatePixelBox.w + padding * 2, h: candidatePixelBox.h + padding * 2 }, image);
  const requestedBudget = input.maxScanPixels === undefined ? MAX_SCAN_PIXELS : input.maxScanPixels;
  if (!finite(requestedBudget) || !Number.isSafeInteger(requestedBudget)
    || requestedBudget < 1 || scan.w * scan.h > Math.min(MAX_SCAN_PIXELS, requestedBudget)) return null;
  work.scannedPixels = scan.w * scan.h;
  const sourceCrop=crop(image, scan);
  const original = { x: candidatePixelBox.x - scan.x, y: candidatePixelBox.y - scan.y, w: candidatePixelBox.w, h: candidatePixelBox.h };
  const sourceArrow=!outlier&&hasSourceArrowTerminal({image:sourceCrop,box:original});
  if(!outlier&&!sourceArrow)return null;
  const prepared = makeEdgeConnectedBackgroundTransparent(sourceCrop);
  const components = foregroundComponents(prepared, original); if (!components.length) return null;
  const total = components.reduce((sum, component) => sum + component.members.length, 0);
  const bounds = union(components.map((component) => component.box));
  const significant = components.filter((component) => component.members.length >= Math.max(3, total * 0.025));
  const multipartSourceInk = significant.some((left, index) => significant.slice(index + 1).some((right) => {
    const vertical = Math.min(left.box.y + left.box.h, right.box.y + right.box.h) - Math.max(left.box.y, right.box.y);
    const horizontal = Math.min(left.box.x + left.box.w, right.box.x + right.box.w) - Math.max(left.box.x, right.box.x);
    return vertical >= Math.min(left.box.h, right.box.h) * 0.4 && horizontal <= Math.min(left.box.w, right.box.w) * 0.2;
  }));
  const largestComponentRatio = Math.max(...components.map((component) => component.members.length)) / Math.max(1, total);
  let outside = 0, chromatic = 0, minX = original.x + original.w, minY = original.y + original.h, maxX = original.x - 1, maxY = original.y - 1;
  for (const component of components) for (const pixel of component.members) {
    const x = pixel % prepared.width, y = Math.floor(pixel / prepared.width);
    const inside = x >= original.x && x < original.x + original.w && y >= original.y && y < original.y + original.h;
    if (!inside) { outside += 1; continue; }
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
    const offset = pixel * 4;
    const red = prepared.rgba[offset], green = prepared.rgba[offset + 1], blue = prepared.rgba[offset + 2];
    if (red === undefined || green === undefined || blue === undefined) return null;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    if (maximum > 0 && (maximum - minimum) / maximum >= 0.28) chromatic += 1;
  }
  if (maxX < minX || maxY < minY) return null;
  const density = total / Math.max(1, bounds.w * bounds.h), outsideRatio = outside / Math.max(1, total), chromaticRatio = chromatic / Math.max(1, total - outside);
  const extendsOriginal = bounds.x < original.x - 1 || bounds.y < original.y - 1
    || bounds.x + bounds.w > original.x + original.w + 1 || bounds.y + bounds.h > original.y + original.h + 1;
  const reasons = [];
  if (sourceArrow || outsideRatio >= 0.08 && extendsOriginal && density >= 0.025 && density <= 0.72) reasons.push("connected-source-overflow");
  if (candidate.confidence < 0.58 && chromaticRatio >= 0.14 && multipartSourceInk
    && largestComponentRatio <= 0.92 && density >= 0.035 && density <= 0.72) reasons.push("chromatic-source-ink");
  if (candidate.confidence < 0.35 && strongOutlier && multipartSourceInk && significant.length <= 12
    && largestComponentRatio <= 0.92 && density >= 0.035 && density <= 0.68) reasons.push("isolated-multipart-source-ink");
  // Closed icon parts can share one alpha component. Reuse the prepared
  // candidate pixels, keeping source sampling and crop geometry inside this scan.
  if (!reasons.length && strongOutlier && outsideRatio <= 0.04 && density >= 0.035 && density <= 0.72
    && iconEvidence.hasSourceIconEvidence(crop(prepared, original))) reasons.push("isolated-multipart-source-ink");
  if (!reasons.length) return null;
  const localLeft = clamp(minX - 2, original.x, original.x + original.w - 1);
  const localTop = clamp(minY - 2, original.y, original.y + original.h - 1);
  const localRight = clamp(maxX + 3, localLeft + 1, original.x + original.w);
  const localBottom = clamp(maxY + 3, localTop + 1, original.y + original.h);
  return admitOcrGraphicEvidence({
    operation: "source-geometry-graphic", version: 1, kind: "pictorial-icon", candidatePixelBox,
    tightenedPixelBox: { x: scan.x + localLeft, y: scan.y + localTop, w: localRight - localLeft, h: localBottom - localTop },
    scannedPixels: scan.w * scan.h, reasons,
    metrics: { density, outsideRatio, chromaticRatio, significantComponents: significant.length, largestComponentRatio }
  }, { sourceWidth: image.width, sourceHeight: image.height, candidatePixelBox });
}

/** Keep scan cost even when the measured pixels do not establish a graphic.
 * The ledger is internal; callers cannot supply or mutate it during scanning.
 * @param {unknown} input */
function inspectSourceGraphicEvidence(input) {
  const work = { scannedPixels: 0 };
  const evidence = collectSourceGraphicEvidence(input, work);
  return Object.freeze({ evidence, scannedPixels: work.scannedPixels });
}

/** @param {unknown} input */
function sourceGraphicEvidence(input) { return inspectSourceGraphicEvidence(input).evidence; }

module.exports = { sourceGraphicEvidence, inspectSourceGraphicEvidence };
