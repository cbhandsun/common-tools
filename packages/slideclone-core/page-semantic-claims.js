"use strict";
// @ts-check
const { parseSlideSize } = require("./slide-size");
/** @typedef {Record<string, unknown>} Item */
/** @typedef {{matched: boolean, sourceIds: (string|number)[], shapes: Item[], textBoxes: Item[], images: Item[]}} Claim */
/** @param {unknown} value @returns {value is Item} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** @param {unknown} value @returns {Item[]} */
function items(value) {
  if (!Array.isArray(value) || value.length > 100000) throw new TypeError("semantic claim collection is invalid");
  for (const item of value) if (!record(item)) throw new TypeError("semantic claim item is invalid");
  return value;
}
/** @param {Item} item */
function imageId(item) {
  const descriptor = Object.getOwnPropertyDescriptor(item, "id");
  if (descriptor && !("value" in descriptor)) throw new TypeError("semantic image id accessor is invalid");
  const value = descriptor?.value;
  if (value == null || value === "") return "";
  if (!(typeof value === "string" && value.length <= 32768) && !(typeof value === "number" && Number.isFinite(value))) throw new TypeError("semantic image id is invalid");
  return String(value || "");
}
/** @param {unknown} value @returns {Claim} */
function claim(value) {
  if (!record(value) || typeof value.matched !== "boolean" || !Array.isArray(value.sourceIds) || value.sourceIds.length > 100000) throw new TypeError("semantic claim result is invalid");
  for (const id of value.sourceIds) {
    if (!(typeof id === "string" && id.length <= 32768) && !(typeof id === "number" && Number.isFinite(id))) throw new TypeError("semantic claim source id is invalid");
  }
  return { matched: value.matched, sourceIds: value.sourceIds, shapes: items(value.shapes), textBoxes: items(value.textBoxes), images: items(value.images) };
}

/** Owns the ordered image claims. Detectors retain their geometry/pixel policies.
 * @param {unknown} operations */
function createPageSemanticClaims(operations) {
  if (!record(operations)) throw new TypeError("semantic claim operations are invalid");
  const services = operations;
  /** @param {string} name @returns {(...args: unknown[]) => unknown} */
  function operation(name) {
    const value = services[name];
    if (typeof value !== "function") throw new TypeError(`semantic claim operation ${name} is required`);
    return (...args) => value(...args);
  }
  const matrix = operation("createSkillsCapabilityMatrixObjects");
  const intake = operation("createDemandIntakeFunnelObjects");
  const review = operation("createSmartReviewBranchGateObjects");
  const chain = operation("createSkillChainOrchestrationObjects");
  const landing = operation("createAssetLandingTriadObjects");

  /** @param {unknown} input */
  function claimPageSemanticImages(input) {
    if (!record(input) || !record(input.page) || !record(input.options)) throw new TypeError("semantic claim input is invalid");
    const page = input.page, options = input.options;
    items(page.images).forEach(imageId);
    let candidateImages = items(input.candidateImages);
    candidateImages.forEach(imageId);
    const textBoxes = items(input.textBoxes);
    const slideSize = parseSlideSize(input.slideSize);
    if (!slideSize || !Number.isSafeInteger(input.pageIndex) || typeof input.pageIndex !== "number" || input.pageIndex < 0 || input.pageIndex > 100000) throw new TypeError("semantic claim page context is invalid");
    const pageIndex = input.pageIndex;
    const image = input.image;
    if (image != null && !record(image)) throw new TypeError("semantic claim image is invalid");
    for (const field of ["assetDir", "irDir", "deckName"]) {
      const value = options[field];
      if (value !== undefined && (typeof value !== "string" || value.length > 32768 || value.includes("\0"))) throw new TypeError("semantic claim output context is invalid");
    }
    /** @param {(...args: unknown[]) => unknown} detector */
    function apply(detector) {
      const result = image && options.objectifyLayerConnectors === true
        ? claim(detector(page, textBoxes, slideSize, { sourceImage: image, assetDir: options.assetDir, irDir: options.irDir, deckName: options.deckName, pageIndex }))
        : { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
      if (result.matched) {
        const ids = new Set(result.sourceIds.map(String));
        const retainedImages = items(page.images).filter((item) => !ids.has(imageId(item)));
        if (retainedImages.length + result.images.length > 100000) throw new TypeError("semantic claim merged images exceed the boundary");
        page.images = retainedImages.concat(result.images);
        candidateImages = candidateImages.filter((item) => !ids.has(imageId(item)));
      }
      return result;
    }
    const skillsCapabilityMatrix = apply(matrix);
    const demandIntakeFunnel = apply(intake);
    const smartReviewBranchGate = apply(review);
    const skillChainOrchestration = apply(chain);
    const assetLandingTriad = apply(landing);
    return { skillsCapabilityMatrix, demandIntakeFunnel, smartReviewBranchGate, skillChainOrchestration, assetLandingTriad, candidateImages };
  }
  return Object.freeze({ claimPageSemanticImages });
}
module.exports = { createPageSemanticClaims };
