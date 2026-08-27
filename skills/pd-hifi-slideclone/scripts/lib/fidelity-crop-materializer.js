"use strict";

const path = require("path");

function materializeFidelityCrop(input = {}, operations = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("fidelity crop input must be an object");
  const required = ["ptToPxBox", "pxToPtBox", "cropPng", "writePng", "ensureDir"];
  for (const name of required) if (typeof operations[name] !== "function") throw new TypeError(`fidelity crop operation ${name} must be a function`);
  validateImage(input.sourceImage);
  validateBox(input.cropBox);
  validateSlide(input.slideSize);
  const assetDir = path.resolve(safePath(input.assetDir, "assetDir"));
  const irDir = path.resolve(safePath(input.irDir, "irDir"));
  const fileName = safeFileName(input.fileName);
  const outputFile = path.resolve(assetDir, fileName);
  if (path.dirname(outputFile) !== assetDir) throw new Error("fidelity crop output must remain inside assetDir");
  operations.ensureDir(assetDir);
  const pixelBox = operations.ptToPxBox(input.cropBox, input.sourceImage, input.slideSize, 0);
  validatePixelBox(pixelBox, input.sourceImage);
  operations.writePng(outputFile, operations.cropPng(input.sourceImage, pixelBox));
  return Object.freeze({
    id: safeId(input.id, "fidelity crop id"),
    type: "fidelity-crop",
    assetPath: path.relative(irDir, outputFile).replace(/\\/g, "/"),
    box: operations.pxToPtBox(pixelBox, input.sourceImage, input.slideSize, 0),
    source: Object.freeze({ ...(input.source || {}), editable: false, strategy: input.source?.strategy || "local-fidelity-crop" })
  });
}

function validateImage(image) {
  if (!image || typeof image !== "object" || !Number.isSafeInteger(image.width) || !Number.isSafeInteger(image.height) || image.width < 1 || image.height < 1 || image.width > 100000 || image.height > 100000) {
    throw new TypeError("sourceImage must contain bounded integer width and height");
  }
}

function validateBox(box) {
  if (!box || typeof box !== "object" || [box.x, box.y, box.w, box.h].some((value) => !Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) throw new TypeError("cropBox must be a positive finite box");
}

function validateSlide(slide) {
  if (!slide || !Number.isFinite(Number(slide.widthPt)) || !Number.isFinite(Number(slide.heightPt)) || Number(slide.widthPt) <= 0 || Number(slide.heightPt) <= 0) throw new TypeError("slideSize must contain positive widthPt and heightPt");
}

function validatePixelBox(box, image) {
  if (!box || [box.x, box.y, box.w, box.h].some((value) => !Number.isFinite(Number(value))) || Number(box.w) <= 0 || Number(box.h) <= 0) throw new Error("projected fidelity crop box is invalid");
  if (Number(box.x) < 0 || Number(box.y) < 0 || Number(box.x) + Number(box.w) > image.width + 1 || Number(box.y) + Number(box.h) > image.height + 1) throw new RangeError("projected fidelity crop box exceeds source image bounds");
}

function safePath(value, label) {
  const text = String(value || "").trim();
  if (!text || text.includes("\0")) throw new TypeError(`${label} must be a non-empty path`);
  return text;
}

function safeFileName(value) {
  const text = String(value || "").trim();
  if (!text || text !== path.basename(text) || !/^[\w.-]+\.png$/iu.test(text)) throw new TypeError("fileName must be a safe PNG basename");
  return text;
}

function safeId(value, label) {
  const text = String(value || "").trim();
  if (!text || text.length > 256 || /[\u0000-\u001F\u007F]/u.test(text)) throw new TypeError(`${label} is invalid`);
  return text;
}

module.exports = { materializeFidelityCrop };
