"use strict";

// Compatibility entry point; behavior lives in the job and evidence modules.
const { IMAGE_EXTENSIONS, MAX_DECK_BYTES } = require("./worker-input-services");
const { addNativeResidualPrimitives, refineNativeOnlyStrokes, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes } = require('./worker-native-recovery-2');
const { changedComponentKeysFromFit, nativeOnlyRefinementDoesNotMateriallyRegress, readRawImageDimensions, validateDocumentPackage, validatePackage } = require('./worker-job-support');
const { compactDeckFinalPrimitiveCandidate, compactDeckLateShapeSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance } = require('./worker-provenance');
const { compactDeckFinalQualitySourceProvenance, finalRefinementQualityAcceptable, lightCardSourceStrokeQualityAcceptable, nativeOnlyResidualQualityAcceptable, shouldTryFinalWorstTextRefinement, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves } = require('./worker-quality-policy');
const { compactDeckLateTextSourceBudgetProvenance, fitDeckEditableTextFontFamily, fitDeckOcrEvidenceToSource, fitDeckTextFidelityPrimitives, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates } = require('./worker-text-evidence');
const { createImageToEditableArchiveHandler } = require('./worker-job-runner');
const { fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowSaturationPanelFills, fitDeckSaturatedColorPanels, focusedLightCardStrokeWidthCandidates } = require('./worker-surface-evidence');
const { fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckSourceVerticalLines, fitDeckWorstComponentFidelityPrimitives } = require('./worker-graphic-evidence-2');
const { fitDeckMissingNativeVisualAtomShapes, missingNativeTargetInkRunShapes, missingNativeVisualAtomLineBundles, nativeOnlyMissingNativeLinesDoesNotRegress } = require('./worker-missing-graphics-2');
const { fitDeckNativeShapeThinStrokes, fitDeckWorstConnectorStyles } = require('./worker-graphic-evidence');
const { focusedCandidateLimits } = require('./worker-primitives');
const { isReliableMissingNativeVisualAtom } = require('./worker-missing-graphics');
const { residualDeduplicationStatus } = require('./worker-native-recovery');
const { safeAssetPath, validateDeckIr } = require("./worker-input-services");
const { tryBuildFinalEditableTextFontFamilyCandidate, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildFinalWorstTextScaleCandidate, tryBuildFinalWorstTextWeightCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate } = require("./worker-candidate-api");
const { tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildNativeOnlyPictorialIconCandidate } = require("./worker-candidate-api");
const { tryBuildFinalLowSaturationPanelFillCandidate } = require("./worker-candidate-api");

module.exports = { IMAGE_EXTENSIONS, MAX_DECK_BYTES, addNativeResidualPrimitives, changedComponentKeysFromFit, compactDeckFinalPrimitiveCandidate, compactDeckFinalQualitySourceProvenance, compactDeckLateShapeSourceBudgetProvenance, compactDeckLateTextSourceBudgetProvenance, compactDeckNativeShapeSourceProvenance, createImageToEditableArchiveHandler, finalRefinementQualityAcceptable, fitDeckEditableTextFontFamily, fitDeckLightCardGeometry, fitDeckLightCardSideAccents, fitDeckLightCardSourceStrokes, fitDeckLightCardStrokeColors, fitDeckLightCardStrokes, fitDeckLowContrastFooterMarks, fitDeckLowContrastFooterPrimitives, fitDeckLowSaturationPanelFills, fitDeckMissingNativeVisualAtomShapes, fitDeckNativeShapeThinStrokes, fitDeckOcrEvidenceToSource, fitDeckSaturatedColorPanels, fitDeckSourceVerticalLines, fitDeckTextFidelityPrimitives, fitDeckWorstComponentFidelityPrimitives, fitDeckWorstConnectorStyles, fitDeckWorstRichOcrTextLayout, fitDeckWorstTextArrowGlyphs, fitDeckWorstTextBoxNudge, fitDeckWorstTextColors, fitDeckWorstTextComposite, fitDeckWorstTextInkBoxes, fitDeckWorstTextScale, fitDeckWorstTextWeight, focusedCandidateLimits, focusedLightCardStrokeWidthCandidates, isReliableMissingNativeVisualAtom, lightCardSourceStrokeQualityAcceptable, missingNativeTargetInkRunShapes, nativeOnlyMissingNativeLinesDoesNotRegress, nativeOnlyRefinementDoesNotMateriallyRegress, nativeOnlyResidualQualityAcceptable, readRawImageDimensions, removeFullSlideResidualImages, replacePictorialIconCropsWithNativeShapes, residualDeduplicationStatus, safeAssetPath, targetComponentQualityImproves, targetMissingNativeComponentQualityImproves, tryBuildFinalLineTextCoveredCropDropCandidate, tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyRichOcrTextLayoutCandidate, validateDeckIr, validateDocumentPackage, validatePackage, worstTextBoxNudgeCandidates, worstTextCompositeScaleCandidates };
module.exports.missingNativeVisualAtomLineBundles = missingNativeVisualAtomLineBundles;
module.exports.tryBuildFinalWorstTextWeightCandidate = tryBuildFinalWorstTextWeightCandidate;
module.exports.tryBuildFinalEditableTextFontFamilyCandidate = tryBuildFinalEditableTextFontFamilyCandidate;
module.exports.tryBuildFinalWorstTextScaleCandidate = tryBuildFinalWorstTextScaleCandidate;
module.exports.tryBuildFinalLowSaturationPanelFillCandidate = tryBuildFinalLowSaturationPanelFillCandidate;
module.exports.refineNativeOnlyStrokes = refineNativeOnlyStrokes;
module.exports.shouldTryFinalWorstTextRefinement = shouldTryFinalWorstTextRefinement;
