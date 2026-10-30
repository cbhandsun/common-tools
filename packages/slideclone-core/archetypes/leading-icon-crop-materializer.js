// @ts-check
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { types } = require("node:util");
const { detectLeadingIconCropCandidates } = require("./leading-icon-crop-evidence");
const { writePng } = require("../png");
const { admitTightGraphicCrop, buildMinimumUnitCropEvidence } = require("../quality/graphic-crop-policy");

/** @typedef {Record<string, unknown>} Item */
/** @param {unknown} value @returns {value is Item} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [null, Object.prototype].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is string} */
function directory(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 32768 && !value.includes("\0") && path.isAbsolute(value);
}
/** @param {string} root @param {string} target */
function within(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** @param {string} irDir @param {string} assetDir */
function prepareDirectory(irDir, assetDir) {
  const rootInfo = fs.lstatSync(irDir);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new TypeError("leading icon crop output directory is invalid");
  const realRoot = fs.realpathSync(irDir);
  let current = irDir;
  for (const segment of path.relative(irDir, assetDir).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    if (!fs.existsSync(current)) fs.mkdirSync(current);
    const info = fs.lstatSync(current);
    if (!info.isDirectory() || info.isSymbolicLink() || !within(realRoot, fs.realpathSync(current))) {
      throw new TypeError("leading icon crop output directory is invalid");
    }
  }
}

/** @param {unknown} value @returns {import("../png").PngImage} */
function trustedImage(value) {
  if (!record(value) || !finite(value.width) || !finite(value.height) || !Number.isSafeInteger(value.width)
    || !Number.isSafeInteger(value.height) || value.width < 1 || value.height < 1 || value.width > 16384
    || value.height > 16384 || value.width * value.height > 40000000 || types.isProxy(value.rgba)
    || !types.isUint8Array(value.rgba)) throw new TypeError("leading icon crop pixels are invalid");
  const prototype = Object.getPrototypeOf(Uint8Array.prototype);
  const buffer = /** @type {unknown} */ (Reflect.get(prototype, "buffer", value.rgba));
  const offset = /** @type {unknown} */ (Reflect.get(prototype, "byteOffset", value.rgba));
  const length = /** @type {unknown} */ (Reflect.get(prototype, "length", value.rgba));
  if (!types.isArrayBuffer(buffer) || !finite(offset) || !finite(length) || length !== value.width * value.height * 4) {
    throw new TypeError("leading icon crop pixels are invalid");
  }
  return { width: value.width, height: value.height, rgba: Buffer.from(new Uint8Array(buffer, offset, length)) };
}

/** @param {unknown} value */
function trustedRefinement(value) {
  if (!record(value) || !record(value.box) || typeof value.refined !== "boolean"
    || !finite(value.box.x) || !finite(value.box.y) || !finite(value.box.w) || !finite(value.box.h)
    || !finite(value.removedNeighborPixels) || !finite(value.retainedDetailComponents)) {
    throw new TypeError("leading icon crop refinement is invalid");
  }
  return { image: trustedImage(value.image), box: { x: value.box.x, y: value.box.y, w: value.box.w, h: value.box.h },
    refined: value.refined, removedNeighborPixels: value.removedNeighborPixels, retainedDetailComponents: value.retainedDetailComponents };
}

/** Materialize only independently isolated, text-free source graphics. Rejected
 * candidates remain on the ordinary fidelity path and cannot claim protection.
 * @param {unknown} imageInput @param {unknown} textBoxes @param {unknown} sizeInput
 * @param {unknown} optionsInput @param {unknown} operations @returns {Item[]} */
function materializeLeadingIconCrops(imageInput, textBoxes, sizeInput, optionsInput, operations) {
  if (!record(optionsInput)) throw new TypeError("leading icon crop options are invalid");
  if (optionsInput.assetDir === undefined) return [];
  const assetDir = optionsInput.assetDir, irDir = optionsInput.irDir ?? assetDir, pageIndex = optionsInput.pageIndex;
  if (!directory(assetDir) || !directory(irDir) || !finite(pageIndex) || !Number.isSafeInteger(pageIndex)
    || pageIndex < 0 || pageIndex > 100000 || !within(irDir, assetDir)) throw new TypeError("leading icon crop output context is invalid");
  const candidates = detectLeadingIconCropCandidates({ image: imageInput, textBoxes, slideSize: sizeInput, existingShapes: optionsInput.existingShapes ?? [] });
  if (candidates.length === 0) return [];
  if (!record(imageInput) || !record(sizeInput) || !finite(imageInput.width) || !finite(imageInput.height)
    || !finite(sizeInput.widthPt) || !finite(sizeInput.heightPt) || !types.isUint8Array(imageInput.rgba)) {
    throw new TypeError("leading icon crop source is invalid");
  }
  if (!record(operations) || typeof operations.refineGraphicCrop !== "function") throw new TypeError("leading icon crop refinement operation is required");
  const refineGraphicCrop = operations.refineGraphicCrop;
  const image = trustedImage(imageInput);
  const slideSize = { widthPt: sizeInput.widthPt, heightPt: sizeInput.heightPt };
  /** @type {Item[]} */ const result = [];
  let prepared = false;
  for (const candidate of candidates) {
    const refinement = trustedRefinement(/** @type {unknown} */ (refineGraphicCrop(image, candidate.pixelBox)));
    const admission = admitTightGraphicCrop({ detector: "foreground-graphic-crop", box: candidate.box,
      slideSize, component: {}, textBoxes, sourceWidth: image.width, sourceHeight: image.height,
      originalPixelBox: candidate.pixelBox, refinement });
    if (!admission) continue;
    if (!prepared) {
      prepareDirectory(irDir, assetDir);
      prepared = true;
    }
    const pixelBox = { x: candidate.pixelBox.x + refinement.box.x, y: candidate.pixelBox.y + refinement.box.y,
      w: refinement.box.w, h: refinement.box.h };
    const file = path.join(assetDir, `native-leading-icon-p${pageIndex + 1}-i${result.length + 1}.png`);
    if (fs.existsSync(file) && (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())) {
      throw new TypeError("leading icon crop output file is invalid");
    }
    writePng(file, refinement.image);
    result.push({ id: `native-leading-icon-p${pageIndex + 1}-i${result.length + 1}`, type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: { x: pixelBox.x * slideSize.widthPt / image.width, y: pixelBox.y * slideSize.heightPt / image.height,
        w: pixelBox.w * slideSize.widthPt / image.width, h: pixelBox.h * slideSize.heightPt / image.height },
      source: { editable: false, nativeRebuild: true, detector: "foreground-graphic-crop",
        reason: "source-isolated-leading-icon", expressionForm: "icon-or-illustration",
        expressionSubtype: "protected-complex-visual-unit", recommendedAction: "preserve-local-crop",
        protectedMinimumUnit: true, sourceIconEvidence: candidate.sourceEvidence,
        ...admission, ...buildMinimumUnitCropEvidence({ sourceWidth: image.width, sourceHeight: image.height,
          originalPixelBox: candidate.pixelBox, refinement }),
        nonEditableReason: "Independent pictorial icon preserved as a source-isolated tight crop." }
    });
  }
  return result;
}

module.exports = { materializeLeadingIconCrops };
