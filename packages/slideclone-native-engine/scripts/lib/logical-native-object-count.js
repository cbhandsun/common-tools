"use strict";

function countLogicalNativeShapes(shapes) {
  if (!Array.isArray(shapes)) return 0;
  return shapes.reduce((total, shape) => {
    const source = shape && typeof shape === "object" ? shape.source : null;
    const count = source?.promotedOrthogonalSegmentCount;
    const ids = source?.promotedSegmentIds;
    const validPromotion = Number.isSafeInteger(count)
      && count >= 2
      && count <= 64
      && Array.isArray(ids)
      && ids.length === count
      && ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 256)
      && new Set(ids).size === count;
    return total + (validPromotion ? count : 1);
  }, 0);
}

function countLogicalNativeTextBoxes(textBoxes, shapes) {
  if (!Array.isArray(textBoxes)) return 0;
  const shapeIds = new Set((Array.isArray(shapes) ? shapes : [])
    .map((shape) => shape?.id)
    .filter((id) => typeof id === "string" && id.length > 0 && id.length <= 256));
  return textBoxes.reduce((total, textBox) => {
    const embeddedNativeShapeId = textBox?.source?.embeddedNativeShapeId;
    const embedded = typeof embeddedNativeShapeId === "string"
      && embeddedNativeShapeId.length > 0
      && embeddedNativeShapeId.length <= 256
      && shapeIds.has(embeddedNativeShapeId);
    return total + (embedded ? 0 : 1);
  }, 0);
}

function isAllowedDecorativeBackgroundImage(image) {
  return image?.type === "fidelity-background"
    && /^(?:decorative-cover-background-underlay|decorative-page-chrome-underlay)$/.test(String(image?.source?.detector || ""));
}

function isIntentionalRasterImage(image) {
  const detector = image?.source?.detector || "";
  if (image?.source?.intentionalBrandAsset === true) return true;
  if (image?.source?.specializedNativeHybridResidual === true && image?.source?.protectedMinimumUnit === true) return true;
  if (detector === "component-template-picture-residual-crop") return true;
  if (image?.source?.componentTemplateCropSplitIntoResiduals === true
    && image?.source?.expressionSubtype === "component-picture-residual") return true;
  if (isAllowedDecorativeBackgroundImage(image)) return true;
  return image?.type === "fidelity-crop"
    && /(?:graphic|diagram|underlay|crop|aggregate|screenshot|illustration|foreground|structured-case|mixed-diagram|sparse-diagram)/i.test(detector);
}

module.exports = { countLogicalNativeShapes, countLogicalNativeTextBoxes, isAllowedDecorativeBackgroundImage, isIntentionalRasterImage };
