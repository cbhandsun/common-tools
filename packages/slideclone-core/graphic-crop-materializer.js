"use strict";

const path = require("node:path");
const { cropPng, writePng } = require("./png");
const { refineStandaloneIconCrop } = require("./icon-crop-refiner");
const { admitTightGraphicCrop, buildMinimumUnitCropEvidence, shouldProtectSmallForegroundGraphicCrop } = require("./graphic-crop-policy");
const { materializeLeadingIconCrops } = require("./leading-icon-crop-materializer");

// Own crop refinement and its evidence together; detection remains an injected stage.
function refineGraphicCrop(image, pixelBox) {
  return refineStandaloneIconCrop(cropPng(image, pixelBox));
}

function materializeGraphicCrops(image, textBoxes, slideSize, options, operations) {
  const { shouldFullyObjectifyEntropyChallenge, ensureDir, ptToPxBox, foregroundComponents,
    mergeCloseComponent, isUsefulGraphicComponent, mergeGraphicComponents, aggregateForegroundComponent,
    shouldAddAggregateComponent, pxToPtBox, classifyGraphicCropExpression,
    splitSparseLargeGraphicComponents } = operations;
  if (!options.assetDir) return [];
  if (shouldFullyObjectifyEntropyChallenge(textBoxes, slideSize)) return [];
  ensureDir(options.assetDir);
  const masks = textBoxes.map((item) => ptToPxBox(item.box, image, slideSize, 8));
  const components = foregroundComponents(image, masks)
    .map((component) => mergeCloseComponent(component, image))
    .filter((component) => isUsefulGraphicComponent(component, image));
  const merged = typeof splitSparseLargeGraphicComponents === "function"
    ? splitSparseLargeGraphicComponents(mergeGraphicComponents(components, image), image)
    : mergeGraphicComponents(components, image);
  const aggregate = aggregateForegroundComponent(image, masks);
  if (shouldAddAggregateComponent(aggregate, merged, image)) {
    merged.push({ ...aggregate, aggregate: true });
  }
  return merged.slice(0, 12).map((component, index) => {
    const slideBox = pxToPtBox(component.box, image, slideSize, 0);
    const expression = classifyGraphicCropExpression(slideBox, textBoxes);
    const detector = expression?.detector || (component.aggregate ? "foreground-aggregate-crop" : "foreground-graphic-crop");
    const reason = expression?.reason || (component.aggregate
      ? "dispersed-thin-graphics-preserved-as-movable-crop"
      : "complex-graphic-preserved-as-movable-crop");
    const minimumUnitCandidate = shouldProtectSmallForegroundGraphicCrop({ detector, box: slideBox, slideSize, component, textBoxes });
    const originalCrop = cropPng(image, component.box);
    const candidateRefinement = minimumUnitCandidate ? refineStandaloneIconCrop(originalCrop) : null;
    const cropAdmission = candidateRefinement ? admitTightGraphicCrop({ detector, box: slideBox, slideSize, component, textBoxes,
      sourceWidth: image.width, sourceHeight: image.height, originalPixelBox: component.box, refinement: candidateRefinement }) : null;
    const protectedMinimumUnit = cropAdmission !== null;
    const refinement = protectedMinimumUnit ? candidateRefinement : null;
    const crop = refinement?.image || originalCrop;
    const finalPixelBox = refinement
      ? { x: component.box.x + refinement.box.x, y: component.box.y + refinement.box.y, w: refinement.box.w, h: refinement.box.h }
      : component.box;
    const finalSlideBox = pxToPtBox(finalPixelBox, image, slideSize, 0);
    const cropEvidence = protectedMinimumUnit ? buildMinimumUnitCropEvidence({ sourceWidth: image.width, sourceHeight: image.height, originalPixelBox: component.box, refinement }) : null;
    const file = path.join(options.assetDir, `${options.deckName || "deck"}-p${String(options.pageIndex + 1).padStart(2, "0")}-g${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, crop);
    return {
      id: `native-graphic-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: finalSlideBox,
      source: {
        editable: false,
        nativeRebuild: true,
        detector,
        reason,
        ...(protectedMinimumUnit ? {
          expressionForm: "icon-or-illustration",
          expressionSubtype: "protected-complex-visual-unit",
          recommendedAction: "preserve-local-crop",
          protectedMinimumUnit: true,
          ...cropAdmission,
          ...cropEvidence,
          nonEditableReason: `${reason}; small icon-heavy visual unit preserved as a local crop`
        } : {})
      }
    };
  });
}

function createLeadingIconCrops(image, textBoxes, slideSize, options) {
  return materializeLeadingIconCrops(image, textBoxes, slideSize, options, { refineGraphicCrop });
}

module.exports = { createLeadingIconCrops, materializeGraphicCrops, refineGraphicCrop, shouldProtectSmallForegroundGraphicCrop };
