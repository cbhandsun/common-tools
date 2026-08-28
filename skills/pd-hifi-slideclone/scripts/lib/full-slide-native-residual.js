"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_PIXELS = 40000000;

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

function createFullSlideResidualBuilder({ eraseMasks, readPng, writePng } = {}) {
  if (![eraseMasks, readPng, writePng].every((value) => typeof value === "function")) throw new TypeError("full-slide residual image adapters are required");
  return async ({ sourceFile, outputFile, textBoxes, slideSize, isCancellationRequested }) => {
    if (![sourceFile, outputFile].every((file) => typeof file === "string" && path.isAbsolute(file))
      || !Array.isArray(textBoxes) || !finiteBox(slideSize)
      || slideSize.x !== 0 || slideSize.y !== 0) throw new TypeError("full-slide residual request is invalid");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    const source = readPng(sourceFile);
    if (!Number.isSafeInteger(source?.width) || !Number.isSafeInteger(source?.height)
      || source.width < 1 || source.height < 1 || source.width * source.height > MAX_PIXELS) throw new Error("full-slide residual source is invalid");
    const masks = textBoxes.map((textBox) => {
      if (!finiteBox(textBox?.box) || textBox.box.x + textBox.box.w > slideSize.w || textBox.box.y + textBox.box.h > slideSize.h) throw new Error("full-slide residual text geometry is invalid");
      return pixelMask(textBox.box, source, { widthPt: slideSize.w, heightPt: slideSize.h });
    });
    const residual = masks.length > 0 ? eraseMasks(source, masks) : source;
    fs.mkdirSync(path.dirname(outputFile), { recursive: true });
    writePng(outputFile, residual);
    const info = fs.lstatSync(outputFile);
    if (!info.isFile() || info.isSymbolicLink() || info.size < 24) throw new Error("full-slide residual output is invalid");
    if (await isCancellationRequested?.()) throw new Error("editable job was cancelled");
    return Object.freeze({ erasedTextBoxes: masks.length, widthPx: source.width, heightPx: source.height });
  };
}

module.exports = { createFullSlideResidualBuilder, pixelMask };
