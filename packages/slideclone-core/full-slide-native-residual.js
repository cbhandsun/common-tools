"use strict";

const path = require("node:path");
const { publishResidual } = require("./residual-publication");
const { createArcResidualMasks } = require("./arc-residual-masks");

const MAX_PIXELS = 40000000;
const MAX_ERASE_OBJECTS = 30000;
const MAX_ERASE_MASKS = 30000;

function finiteBox(value) {
  return value && ["x", "y", "w", "h"].every((key) => Number.isFinite(value[key])) && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0;
}

function pixelMask(box, image, slideSize, expand = true) {
  const scaleX = image.width / slideSize.widthPt;
  const scaleY = image.height / slideSize.heightPt;
  const paddingX = expand ? Math.max(4, Math.round(image.width / 216)) : 0;
  const paddingY = expand ? Math.max(3, Math.round(image.height / 216)) : 0;
  const left = Math.max(0, Math.floor(box.x * scaleX) - paddingX);
  const top = Math.max(0, Math.floor(box.y * scaleY) - paddingY);
  const right = Math.min(image.width, Math.ceil((box.x + box.w) * scaleX) + paddingX);
  const bottom = Math.min(image.height, Math.ceil((box.y + box.h) * scaleY) + paddingY);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function eraseObjectMask(item, image, slideSize) {
  const box = item?.box;
  const arc = item?.type === "arc";
  const line = item?.type === "line" || item?.type === "connector" || item?.source?.connector === true;
  const finite = box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key]));
  const endX = finite ? box.x + box.w : Number.NaN; const endY = finite ? box.y + box.h : Number.NaN;
  const validLine = line && finite && Math.hypot(box.w, box.h) > 0
    && box.x >= 0 && box.x <= slideSize.w && box.y >= 0 && box.y <= slideSize.h
    && endX >= 0 && endX <= slideSize.w && endY >= 0 && endY <= slideSize.h;
  const validBox = !line && finite && box.x >= 0 && box.y >= 0 && box.w > 0 && box.h > 0
    && endX <= slideSize.w && endY <= slideSize.h;
  const valid = validLine || validBox;
  if (!valid) throw new Error("full-slide residual object geometry is invalid");
  // A fidelity crop replaces only its own footprint. Text-style padding would
  // erase adjacent content that the replacement image cannot restore.
  if (!line && !arc) return pixelMask(box, image, { widthPt: slideSize.w, heightPt: slideSize.h }, item.type !== "fidelity-crop");
  const scaleX = image.width / slideSize.w;
  const scaleY = image.height / slideSize.h;
  const padding = Math.max(4, Math.round(Math.max(image.width, image.height) / 216));
  if (arc) return createArcResidualMasks(box, item?.style?.adjustments ?? [], image, padding * 2, item?.style, { x: scaleX, y: scaleY });
  return {
    kind: "line",
    x1: box.x * scaleX,
    y1: box.y * scaleY,
    x2: endX * scaleX,
    y2: endY * scaleY,
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
    const masks = [];
    for (const item of eraseObjects) {
      const objectMasks = eraseObjectMask(item, source, slideSize);
      const entries = Array.isArray(objectMasks) ? objectMasks : [objectMasks];
      if (masks.length + entries.length > MAX_ERASE_MASKS) throw new RangeError("full-slide residual mask count exceeds the safety limit");
      masks.push(...entries);
    }
    const residual = masks.length > 0 ? eraseMasks(source, masks) : source;
    await publishResidual({ sourceFile, outputFile, write: (file) => writePng(file, residual), isCancellationRequested });
    return Object.freeze({ erasedObjects: eraseObjects.length, erasedTextBoxes: objects === undefined ? eraseObjects.length : 0, widthPx: source.width, heightPx: source.height });
  };
}

module.exports = { createFullSlideResidualBuilder, eraseObjectMask, pixelMask };
