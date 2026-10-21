// @ts-check
"use strict";
/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
/** Propose jointly removing a reconstruction underlay alongside the full-page
 * residual. This is NOT an ownership receipt or a publication decision: the
 * caller must build, render and pass the unchanged strict native candidate gate.
 * Leaf icons, ordinary pictures and unknown crop provenance remain untouched.
 * @param {{largeRasterEditability: (deck: {slideSize: Record<string,unknown>, pages: {images: Record<string,unknown>[]}[]}) => {passed:boolean}}} dependencies */
function createNativeUnderlayRemovalProposal({ largeRasterEditability }) {
  if (typeof largeRasterEditability !== "function") throw new TypeError("underlay raster gate is invalid");
  /** @param {unknown} image @param {unknown} slideSize @returns {boolean} */
  return function proposeNativeUnderlayRemoval(image, slideSize) {
    if (!record(image) || !record(slideSize) || !record(image.source) || !record(image.box)) return false;
    const source = image.source, box = image.box;
    if (source.semanticSplitOwnsLayer !== true || source.residualCrop !== true
      || typeof source.detector !== "string" || !/^[a-z0-9-]{1,128}-underlay-crop$/u.test(source.detector)) return false;
    const dimensions = [slideSize.widthPt, slideSize.heightPt, box.w, box.h];
    if (!dimensions.every(value => typeof value === "number" && Number.isFinite(value) && value > 0)
      || ![box.x, box.y].every(value => typeof value === "number" && Number.isFinite(value))) return false;
    // Share the actual gate's threshold and raster classification.
    return !largeRasterEditability({ slideSize, pages: [{ images: [image] }] }).passed;
  };
}
module.exports = { createNativeUnderlayRemovalProposal };
