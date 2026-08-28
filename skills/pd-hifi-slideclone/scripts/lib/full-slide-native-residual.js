"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_PIXELS = 40000000;
const MAX_ERASE_OBJECTS = 30000;

function finiteBox(value) {
  return value && ["x", "y", "w", "h"].every((key) => Number.isFinite(value[key])) && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0;
}

function pixelMask(box, image, slideSize) {
  const scaleX = image.width / slideSize.widthPt;
  const scaleY = image.height / slideSize.heightPt;
  const paddingX = Math.max(4, Math.round(image.width / 216));
  const paddingY = Math.max(3, Math.round(image.height / 216));
  const left = Math.max(0, Math.floor(box.x * scaleX) - paddingX);
  const top = Math.max(0, Math.floor(box.y * scaleY) - paddingY);
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX) + paddingX);
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY) + paddingY);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function eraseObjectMask(item, image, slideSize) {
  const box = item?.box;
  const line = item?.type === "line" || item?.type === "connector" || item?.source?.connector === true;
  const valid = box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]))
    && box.x >= 0 && box.y >= 0 && box.w >= 0 && box.h >= 0
    && (line ? box.w + box.h > 0 : box.w > 0 && box.h > 0)
    && box.x + box.w <= slideSize.w && box.y + box.h <= slideSize.h;
  if (!valid) throw new Error("full-slide residual object geometry is invalid");
  if (!line) return pixelMask(box, image, { widthPt: slideSize.w, heightPt: slideSize.h });
  const scaleX = image.width / slideSize.w;
  const scaleY = image.height / slideSize.h;
  const padding = Math.max(4, Math.round(Math.max(image.width, image.height) / 216));
  return {
    kind: "line",
    x1: box.x * scaleX,
    y1: box.y * scaleY,
    x2: (box.x + box.w) * scaleX,
    y2: (box.y + box.h) * scaleY,
    width: padding * 2
  };
}

function createFullSlideResidualBuilder({ eraseMasks, readPng, writePng } = {}) {
  if (![eraseMasks, readPng, writePng].every((value) => typeof value === "function")) throw new TypeError("full-slide residual image adapters are required");
  return async ({ sourceFile, outputFile, objects, textBoxes, slideSize, isCancellationRequested }) => {
    const eraseObjects = objects === undefined ? textBoxes : objects;
    if (![sourceFile, outputFile].every((file) => typeof file === "string" && path.isAbsolute(file))
      || !Array.isArray(eraseObjects) || eraseObjects.length > MAX_ERASE_OBJECTS || !finiteBox(slideSize)
      || slideSize.x !== 0 || slideSize.y !== 0) throw new TypeError("full-slide residual request is invalid");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const source = readPng(sourceFile);
    if (!Number.isSafeInteger(source?.width) || !Number.isSafeInteger(source?.height)
      || source.width < 1 || source.height < 1 || source.width * source.height > MAX_PIXELS) throw new Error("full-slide residual source is invalid");
    const masks = eraseObjects.map((item) => eraseObjectMask(item, source, slideSize));
    const residual = masks.length > 0 ? eraseMasks(source, masks) : source;
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    writePng(outputFile, residual);
    const info = fs.lstatSync(outputFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 24) throw new Error("full-slide residual output is invalid");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    return Object.freeze({ erasedObjects: masks.length, erasedTextBoxes: objects === undefined ? masks.length : 0, widthPx: source.width, heightPx: source.height });
  };
}

module.exports = { createFullSlideResidualBuilder, eraseObjectMask, pixelMask };
