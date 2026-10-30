"use strict";
// @ts-check
/** @typedef {{[key: string]: unknown, text?: unknown, source?: {detector?: unknown}}} Item */
/** @typedef {{shapes: Item[], textBoxes: Item[], images: Item[], source?: Record<string, unknown>}} Page */
/** @typedef {{embeddedExpertScreenshotActive: boolean, embeddedExpertScreenshot: {shapes:Item[],textBoxes:Item[]}, slideSize:unknown, options:{irDir?:string}, allowEntropyNativeApproximation:boolean, autoObjectifyEntropyIsland:boolean, image:unknown, assetOsFragmentedAssetChainActive:boolean, assetOsFragmentedAssetChain:{textBoxes:Item[]}}} Inputs */
/** @typedef {{
 * sanitizeNativeShapes: (...args: unknown[]) => Item[],
 * dropResidualsCoveredByNativeTableText: (...args: unknown[]) => void,
 * dropTableMatrixResidualObjectifiedCrops: (...args: unknown[]) => void,
 * dropMostlyBlankCoveredResidualCrops: (...args: unknown[]) => void,
 * dropPluginTemplateCoveredStructuralUnderlays: (...args: unknown[]) => void,
 * dropPluginTemplateCoveredSmallResidualCrops: (...args: unknown[]) => void,
 * dropWmsObjectifiedValuePanelResidualCrops: (...args: unknown[]) => void,
 * dropWmsObjectifiedTopRouteUnderlay: (...args: unknown[]) => void,
 * suppressRedundantTableGridScaffoldCoveredByVisualAtoms: (...args: unknown[]) => Item[],
 * suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels: (...args: unknown[]) => Item[],
 * applyPrototypeValidationScreenshotPolicy: (...args: unknown[]) => void,
 * materializePrototypeValidationResidualCrops: (...args: unknown[]) => void,
 * dropPrototypeValidationResidualCropsWhenNativeCoverage: (...args: unknown[]) => void,
 * dropDemandUnderstandingResidualCropsWhenNativeCoverage: (...args: unknown[]) => void,
 * dropEntropyChallengeCropsWhenNativeCoverage: (...args: unknown[]) => void,
 * dropDecorativeCoverDuplicateForegroundCrops: (...args: unknown[]) => void,
 * finalizePrdSegmentedFlowComponents: (...args: unknown[]) => void,
 * normalizeCjkText: (...args: unknown[]) => string
 * }} Operations */

/** Applies ordered page cleanup and materialization before persistence.
 * Operations are synchronous internal services; failures propagate to the caller.
 * @param {Operations} operations */
function createPageOutputFinalizer(operations) {
  const {
    sanitizeNativeShapes, dropResidualsCoveredByNativeTableText, dropTableMatrixResidualObjectifiedCrops,
    dropMostlyBlankCoveredResidualCrops, dropPluginTemplateCoveredStructuralUnderlays, dropPluginTemplateCoveredSmallResidualCrops,
    dropWmsObjectifiedValuePanelResidualCrops, dropWmsObjectifiedTopRouteUnderlay, suppressRedundantTableGridScaffoldCoveredByVisualAtoms,
    suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels, applyPrototypeValidationScreenshotPolicy, materializePrototypeValidationResidualCrops,
    dropPrototypeValidationResidualCropsWhenNativeCoverage, dropDemandUnderstandingResidualCropsWhenNativeCoverage, dropEntropyChallengeCropsWhenNativeCoverage,
    dropDecorativeCoverDuplicateForegroundCrops, finalizePrdSegmentedFlowComponents, normalizeCjkText
  } = operations;
  const required = [
    sanitizeNativeShapes, dropResidualsCoveredByNativeTableText, dropTableMatrixResidualObjectifiedCrops,
    dropMostlyBlankCoveredResidualCrops, dropPluginTemplateCoveredStructuralUnderlays, dropPluginTemplateCoveredSmallResidualCrops,
    dropWmsObjectifiedValuePanelResidualCrops, dropWmsObjectifiedTopRouteUnderlay, suppressRedundantTableGridScaffoldCoveredByVisualAtoms,
    suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels, applyPrototypeValidationScreenshotPolicy, materializePrototypeValidationResidualCrops,
    dropPrototypeValidationResidualCropsWhenNativeCoverage, dropDemandUnderstandingResidualCropsWhenNativeCoverage, dropEntropyChallengeCropsWhenNativeCoverage,
    dropDecorativeCoverDuplicateForegroundCrops, finalizePrdSegmentedFlowComponents, normalizeCjkText
  ];
  if (required.some(operation => typeof operation !== "function")) throw new TypeError("page output finalizer operations are incomplete");
  /** @param {Page} pageDraft @param {Inputs} inputs */
  return function finalizePageOutput(pageDraft, inputs) {
    const {
      embeddedExpertScreenshotActive, embeddedExpertScreenshot, slideSize,
      options, allowEntropyNativeApproximation, autoObjectifyEntropyIsland,
      image, assetOsFragmentedAssetChainActive, assetOsFragmentedAssetChain
    } = inputs;
    if (embeddedExpertScreenshotActive) {
      pageDraft.shapes = sanitizeNativeShapes(embeddedExpertScreenshot.shapes, slideSize);
      pageDraft.textBoxes = [...embeddedExpertScreenshot.textBoxes];
    }
    dropResidualsCoveredByNativeTableText(pageDraft);
    dropTableMatrixResidualObjectifiedCrops(pageDraft);
    dropMostlyBlankCoveredResidualCrops(pageDraft, options.irDir);
    dropPluginTemplateCoveredStructuralUnderlays(pageDraft);
    dropPluginTemplateCoveredSmallResidualCrops(pageDraft);
    dropWmsObjectifiedValuePanelResidualCrops(pageDraft);
    dropWmsObjectifiedTopRouteUnderlay(pageDraft);
    pageDraft.shapes = suppressRedundantTableGridScaffoldCoveredByVisualAtoms(pageDraft.shapes, slideSize);
    pageDraft.shapes = suppressSmallVisualAtomsCoveredByAnchoredSemanticLabels(pageDraft.shapes, pageDraft.textBoxes);
    applyPrototypeValidationScreenshotPolicy(pageDraft);
    materializePrototypeValidationResidualCrops(pageDraft, options.irDir);
    applyPrototypeValidationScreenshotPolicy(pageDraft);
    dropPrototypeValidationResidualCropsWhenNativeCoverage(pageDraft, pageDraft.shapes);
    dropDemandUnderstandingResidualCropsWhenNativeCoverage(pageDraft, pageDraft.shapes);
    dropEntropyChallengeCropsWhenNativeCoverage(pageDraft, pageDraft.shapes, {
      allowNativeApproximation: allowEntropyNativeApproximation,
      allowIslandOnly: autoObjectifyEntropyIsland
    });
    dropDecorativeCoverDuplicateForegroundCrops(pageDraft, slideSize);
    finalizePrdSegmentedFlowComponents(pageDraft, {
      sourceImage: image,
      slideSize,
      irDir: options.irDir
    });
    if (assetOsFragmentedAssetChainActive) {
      const specialistText = new Set(assetOsFragmentedAssetChain.textBoxes.map((item) => normalizeCjkText(item?.text)));
      pageDraft.textBoxes = pageDraft.textBoxes.filter((item) =>
        String(item?.source?.detector || "").startsWith("asset-os-fragmented-chain-native-")
        || !specialistText.has(normalizeCjkText(item?.text))
      );
    }
    return pageDraft;
  };
}
module.exports = { createPageOutputFinalizer };
