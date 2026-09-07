// @ts-check
"use strict";

const { parseSlideSize } = require("./slide-size");

/** @typedef {Record<string, unknown>} Item */
/** @param {unknown} value @returns {value is Item} */
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {Item[]} */
function items(value) {
  if (!Array.isArray(value) || value.length > 100000) {
    throw new TypeError("page graphics collection is invalid");
  }
  for (const item of value) if (!isRecord(item)) throw new TypeError("page graphics collection item is invalid");
  return value;
}

/** The stage owns detector precedence; pixel and file operations remain injected.
 * @param {unknown} operations
 */
function createPageGraphicsStage(operations) {
  if (!isRecord(operations)) throw new TypeError("page graphics operations are invalid");
  const services = operations;
  /** @param {string} name @returns {(...args: unknown[]) => unknown} */
  function operation(name) {
    const value = services[name];
    if (typeof value !== "function") throw new TypeError(`page graphics operation ${name} is required`);
    return (...args) => value(...args);
  }
  const detectLongLines = operation("detectLongLines");
  const createKpiEvidenceCrops = operation("createKpiEvidenceCrops");
  const createKpiEvidenceShapes = operation("createKpiEvidenceShapes");
  const shouldFullyObjectifyEntropyChallenge = operation("shouldFullyObjectifyEntropyChallenge");
  const createTitleChromeShapes = operation("createTitleChromeShapes");
  const keepStructuralLines = operation("keepStructuralLines");
  const createGraphicUnderlayCrop = operation("createGraphicUnderlayCrop");
  const decorativeBackgroundMode = operation("decorativeBackgroundMode");
  const normalizeDecorativeCoverTextBoxes = operation("normalizeDecorativeCoverTextBoxes");
  const createDecorativeCoverBackground = operation("createDecorativeCoverBackground");
  const createGraphicCrops = operation("createGraphicCrops");

  /** @param {unknown} input */
  function preparePageGraphics(input) {
    if (!isRecord(input)) throw new TypeError("page graphics input is invalid");
    const { image = null, pageIndex, options = {} } = input;
    const slideSize = parseSlideSize(input.slideSize);
    if (image !== null && !isRecord(image)) throw new TypeError("page graphics image is invalid");
    if (!slideSize) {
      throw new TypeError("page graphics slide size is invalid");
    }
    if (typeof pageIndex !== "number" || !Number.isSafeInteger(pageIndex) || pageIndex < 0 || pageIndex > 100000) throw new TypeError("page graphics page index is invalid");
    if (!isRecord(options)) throw new TypeError("page graphics options are invalid");
    const textBoxes = items(input.textBoxes);
    for (const field of ["assetDir", "irDir", "deckName"]) {
      const value = options[field];
      if (value !== undefined && (typeof value !== "string" || value.length > 32768 || value.includes("\0"))) throw new TypeError("page graphics output context is invalid");
    }
    const cropContext = { assetDir: options.assetDir, irDir: options.irDir, deckName: options.deckName, pageIndex };
    const preserve = image !== null && options.preserveGraphics === true;
    const detectedLines = image ? items(detectLongLines(image, slideSize)) : [];
    const kpiEvidenceCrops = preserve ? items(createKpiEvidenceCrops(image, textBoxes, slideSize, { ...cropContext })) : [];
    const kpiEvidenceShapes = items(createKpiEvidenceShapes(textBoxes, slideSize));
    const useNativeKpiEvidence = kpiEvidenceShapes.length > 0;
    const entropy = image ? shouldFullyObjectifyEntropyChallenge(textBoxes, slideSize) : false;
    if (typeof entropy !== "boolean") throw new TypeError("page graphics entropy decision is invalid");
    const titleChromeShapes = useNativeKpiEvidence || entropy ? [] : items(createTitleChromeShapes(textBoxes, slideSize, image));
    const lines = useNativeKpiEvidence || kpiEvidenceCrops.length > 0 || entropy ? [] : items(keepStructuralLines(detectedLines, textBoxes));
    const graphicUnderlay = preserve && !useNativeKpiEvidence && kpiEvidenceCrops.length === 0
      ? items(createGraphicUnderlayCrop(image, textBoxes, slideSize, { ...cropContext, structuralLines: lines, detectedLines, detectedLineCount: detectedLines.length })) : [];
    const useUnderlay = graphicUnderlay.length > 0 || kpiEvidenceCrops.length > 0;
    const mode = preserve ? decorativeBackgroundMode({ image, textBoxes, detectedLineCount: detectedLines.length }) : null;
    if (mode !== null && mode !== "cover" && mode !== "page-chrome") throw new TypeError("page graphics decorative mode is invalid");
    normalizeDecorativeCoverTextBoxes(textBoxes, mode === "cover");
    const decorativeBackground = preserve
      ? items(createDecorativeCoverBackground(image, textBoxes, slideSize, { ...cropContext, detectedLineCount: detectedLines.length, mode })) : [];
    const graphicCrops = preserve && !useUnderlay && !useNativeKpiEvidence && decorativeBackground.length === 0
      ? items(createGraphicCrops(image, textBoxes, slideSize, { ...cropContext })) : [];
    return {
      kpiEvidenceShapes, titleChromeShapes, lines, useUnderlay, decorativeBackground,
      images: [...decorativeBackground, ...kpiEvidenceCrops, ...graphicUnderlay, ...graphicCrops]
    };
  }
  return Object.freeze({ preparePageGraphics });
}

module.exports = { createPageGraphicsStage };
