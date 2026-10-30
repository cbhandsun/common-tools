"use strict";

const { blockLateVisualRefinementForNativeOnlyResidualGap, nativeOnlyResidualQualityAcceptable, nativeOnlyResidualRejectionMetrics, shouldTryFinalVisualRefinement } = require('./worker-quality-policy');
const { largeRasterEditability, nativeObjectMetrics } = require("./worker-output-services");
const { runWorkerStage } = require("./worker-budget-runner");
const { tryBuildFinalLowContrastFooterMarkCandidate, tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildFinalWorstConnectorStyleCandidate, tryBuildNativeOnlyResidualCandidate } = require('./worker-native-candidates');
const { allPagesHaveNativeGraphics, assessStrictNativeCandidate, runBuilder, searchProvisionalNativeCandidate } = require('./worker-job-support');
const { validateDeckIr } = require("./worker-input-services");
const { tryBuildFinalLightCardGeometryCandidate, tryBuildFinalLightCardSourceStrokeCandidate, tryBuildFinalSaturatedColorPanelCandidate } = require('./worker-surface-candidates');
const { tryBuildFinalLineTextCoveredCropDropCandidate } = require('./worker-text-candidates');
const { refineNativeOnlyResidualCandidateText } = require('./worker-text-evidence');
const { refineNativeOnlyResidualCandidateMissingNativeLines } = require('./worker-missing-graphics-2');
const { adoptNativeOnlyResidualCandidate, refineNativeOnlyStrokes } = require('./worker-native-recovery-2');

async function runWorkerVisualRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, nativeShadowPolicy, nativeShadowSession, outputFile, raw, rawImageOwnedTextRefiner, rawImageQualityVerifier, rawImageTextRefiner, root, timeoutMs, verificationDeck, visualQuality }) {
if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLateLowContrastFooterMarkFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterMarkCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateLowContrastFooterMarkFit?.accepted) {
          validateDeckIr(finalLateLowContrastFooterMarkFit.deck, root);
          metadata.generatedDeck = finalLateLowContrastFooterMarkFit.deck; metadata.deckFile = finalLateLowContrastFooterMarkFit.deckFile; outputFile = finalLateLowContrastFooterMarkFit.pptxFile; verificationDeck = finalLateLowContrastFooterMarkFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateLowContrastFooterMarkFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateLowContrastFooterMarkFit.deck);
          const validated = validateDeckIr(finalLateLowContrastFooterMarkFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateLowContrastFooterMarkFit.quality;
        }
        if (finalLateLowContrastFooterMarkFit && finalLateLowContrastFooterMarkFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-low-contrast-footer-mark-fit-accepted": Number(finalLateLowContrastFooterMarkFit.accepted === true),
              "final-late-low-contrast-footer-mark-fit-shapes": finalLateLowContrastFooterMarkFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalWorstConnectorStyleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstConnectorStyleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstConnectorStyleFit?.accepted) {
          validateDeckIr(finalWorstConnectorStyleFit.deck, root);
          metadata.generatedDeck = finalWorstConnectorStyleFit.deck; metadata.deckFile = finalWorstConnectorStyleFit.deckFile; outputFile = finalWorstConnectorStyleFit.pptxFile; verificationDeck = finalWorstConnectorStyleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstConnectorStyleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstConnectorStyleFit.deck);
          const validated = validateDeckIr(finalWorstConnectorStyleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstConnectorStyleFit.quality;
        }
        if (finalWorstConnectorStyleFit && finalWorstConnectorStyleFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-connector-style-fit-accepted": Number(finalWorstConnectorStyleFit.accepted === true),
              "final-worst-connector-style-fit-shapes": finalWorstConnectorStyleFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality) && visualQuality?.metrics?.["final-light-card-geometry-fit-shapes"] === undefined) {
        const finalLateLightCardGeometryFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardGeometryCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateLightCardGeometryFit?.accepted) {
          validateDeckIr(finalLateLightCardGeometryFit.deck, root);
          metadata.generatedDeck = finalLateLightCardGeometryFit.deck; metadata.deckFile = finalLateLightCardGeometryFit.deckFile; outputFile = finalLateLightCardGeometryFit.pptxFile; verificationDeck = finalLateLightCardGeometryFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateLightCardGeometryFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateLightCardGeometryFit.deck);
          const validated = validateDeckIr(finalLateLightCardGeometryFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateLightCardGeometryFit.quality;
        }
        if (finalLateLightCardGeometryFit && finalLateLightCardGeometryFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-light-card-geometry-fit-accepted": Number(finalLateLightCardGeometryFit.accepted === true),
              "final-late-light-card-geometry-fit-shapes": finalLateLightCardGeometryFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && !largeRasterEditability(verificationDeck).passed) {
        const finalLineTextCoveredCropDrop = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLineTextCoveredCropDropCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLineTextCoveredCropDrop?.accepted) {
          validateDeckIr(finalLineTextCoveredCropDrop.deck, root);
          metadata.generatedDeck = finalLineTextCoveredCropDrop.deck; metadata.deckFile = finalLineTextCoveredCropDrop.deckFile; outputFile = finalLineTextCoveredCropDrop.pptxFile; verificationDeck = finalLineTextCoveredCropDrop.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLineTextCoveredCropDrop.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLineTextCoveredCropDrop.deck);
          const validated = validateDeckIr(finalLineTextCoveredCropDrop.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = {
            ...finalLineTextCoveredCropDrop.quality,
            metrics: {
              ...finalLineTextCoveredCropDrop.quality.metrics,
              "final-line-text-covered-crop-drop-accepted": 1,
              "final-line-text-covered-crop-drop-removed": finalLineTextCoveredCropDrop.removedImages,
              "final-line-text-covered-crop-drop-large-raster-count": finalLineTextCoveredCropDrop.candidateRaster.largeRasterCount
            }
          };
        } else if (finalLineTextCoveredCropDrop && finalLineTextCoveredCropDrop.removedImages > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-line-text-covered-crop-drop-accepted": 0,
              "final-line-text-covered-crop-drop-removed": finalLineTextCoveredCropDrop.removedImages,
              ...(finalLineTextCoveredCropDrop.rejectionCode ? { "final-line-text-covered-crop-drop-rejection-code": finalLineTextCoveredCropDrop.rejectionCode } : {})
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && !largeRasterEditability(verificationDeck).passed) {
        let nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => nativeShadowSession.resume({ root,
          baselineDeck: metadata.generatedDeck, baselineQuality: visualQuality, sourceImages: metadata.normalizedSourceImages,
          policy: nativeShadowPolicy }));
        const resumedNativeShadow = nativeOnlyCandidate !== null;
        if (!resumedNativeShadow) {
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyResidualCandidate({
            root, metadata, outputFile, rawImageQualityVerifier, sourceImages: metadata.normalizedSourceImages, isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateText({
            nativeOnlyCandidate,
            root,
            rawImageTextRefiner,
            rawImageOwnedTextRefiner,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => refineNativeOnlyResidualCandidateMissingNativeLines({
            nativeOnlyCandidate,
            root,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => searchProvisionalNativeCandidate({
            root, candidate: nativeOnlyCandidate, baselineQuality: visualQuality, baselineDeck: verificationDeck, refineOwnedTexts: rawImageOwnedTextRefiner, refineNativeStrokes: refineNativeOnlyStrokes,
            sourceImages: metadata.normalizedSourceImages, rawImageQualityVerifier, isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
        }
        if (resumedNativeShadow) visualQuality = { ...visualQuality, metrics: { ...visualQuality.metrics, "native-shadow-resumed": 1 } };
        const nativeOnlyPolicy = nativeOnlyCandidate?.rejected === true ? null : assessStrictNativeCandidate({
          baselineQuality: visualQuality,
          baselineDeck: verificationDeck,
          candidateQuality: nativeOnlyCandidate?.quality,
          candidateDeck: nativeOnlyCandidate?.deck
        });
        const nativeOnlyQualityAcceptable = nativeOnlyCandidate && nativeOnlyResidualQualityAcceptable({
          baselineQuality: visualQuality,
          candidateQuality: nativeOnlyCandidate.quality,
          baselineDeck: verificationDeck,
          candidateDeck: nativeOnlyCandidate.deck
        }) && nativeOnlyPolicy?.passed === true;
        if (nativeOnlyQualityAcceptable) {
          adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root });
          outputFile = nativeOnlyCandidate.pptxFile; verificationDeck = nativeOnlyCandidate.deck;
          visualQuality = {
            ...nativeOnlyCandidate.quality,
            metrics: {
              ...nativeOnlyCandidate.quality.metrics,
              "final-native-only-residual-removed": nativeOnlyCandidate.removed,
              "final-native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
          visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality);
          let finalNativeOnlyCardStrokeFit = null;
          let finalNativeOnlyCardStrokeShapes = 0;
          let finalNativeOnlyCardStrokeIterations = 0;
          for (let sourceStrokeIteration = 0; sourceStrokeIteration < 3; sourceStrokeIteration += 1) {
            finalNativeOnlyCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardSourceStrokeCandidate({
              root,
              metadata,
              sourceImages: metadata.normalizedSourceImages,
              visualQuality,
              rawImageQualityVerifier,
              isCancellationRequested,
              candidateLimits: [1],
              runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
            }));
            if (!finalNativeOnlyCardStrokeFit?.accepted) break;
            validateDeckIr(finalNativeOnlyCardStrokeFit.deck, root);
            metadata.generatedDeck = finalNativeOnlyCardStrokeFit.deck; metadata.deckFile = finalNativeOnlyCardStrokeFit.deckFile; outputFile = finalNativeOnlyCardStrokeFit.pptxFile; verificationDeck = finalNativeOnlyCardStrokeFit.deck;
            metadata.nativeMetrics = nativeObjectMetrics(finalNativeOnlyCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeOnlyCardStrokeFit.deck);
            const validated = validateDeckIr(finalNativeOnlyCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
            finalNativeOnlyCardStrokeShapes += finalNativeOnlyCardStrokeFit.changedShapes;
            finalNativeOnlyCardStrokeIterations += 1;
            visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(finalNativeOnlyCardStrokeFit.quality);
          }
          if (finalNativeOnlyCardStrokeShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-light-card-source-stroke-accepted": 1,
                "final-native-only-light-card-source-stroke-shapes": finalNativeOnlyCardStrokeShapes,
                "final-native-only-light-card-source-stroke-iterations": finalNativeOnlyCardStrokeIterations
              }
            };
          } else if (finalNativeOnlyCardStrokeFit && finalNativeOnlyCardStrokeFit.changedShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-light-card-source-stroke-accepted": 0,
                "final-native-only-light-card-source-stroke-shapes": finalNativeOnlyCardStrokeFit.changedShapes
              }
            };
          }
          const finalNativeOnlySaturatedColorPanelFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSaturatedColorPanelCandidate({
            root,
            metadata,
            sourceImages: metadata.normalizedSourceImages,
            visualQuality,
            rawImageQualityVerifier,
            isCancellationRequested,
            candidateLimits: [1, 2, 3],
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          if (finalNativeOnlySaturatedColorPanelFit?.accepted) {
            validateDeckIr(finalNativeOnlySaturatedColorPanelFit.deck, root);
            metadata.generatedDeck = finalNativeOnlySaturatedColorPanelFit.deck; metadata.deckFile = finalNativeOnlySaturatedColorPanelFit.deckFile; outputFile = finalNativeOnlySaturatedColorPanelFit.pptxFile; verificationDeck = finalNativeOnlySaturatedColorPanelFit.deck;
            metadata.nativeMetrics = nativeObjectMetrics(finalNativeOnlySaturatedColorPanelFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeOnlySaturatedColorPanelFit.deck);
            const validated = validateDeckIr(finalNativeOnlySaturatedColorPanelFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
            visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap({
              ...finalNativeOnlySaturatedColorPanelFit.quality,
              metrics: {
                ...visualQuality.metrics,
                ...finalNativeOnlySaturatedColorPanelFit.quality.metrics,
                "final-native-only-saturated-color-panel-fit-accepted": 1,
                "final-native-only-saturated-color-panel-fit-shapes": finalNativeOnlySaturatedColorPanelFit.changedShapes
              }
            });
          } else if (finalNativeOnlySaturatedColorPanelFit && finalNativeOnlySaturatedColorPanelFit.changedShapes > 0) {
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "final-native-only-saturated-color-panel-fit-accepted": 0,
                "final-native-only-saturated-color-panel-fit-shapes": finalNativeOnlySaturatedColorPanelFit.changedShapes
              }
            };
          }
        } else if (nativeOnlyCandidate) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-native-only-residual-rejected": 1,
              ...(nativeOnlyCandidate.rejected === true ? { "final-native-only-residual-rejection-code": nativeOnlyCandidate.rejectionCode } : {}),
              ...(nativeOnlyPolicy && nativeOnlyPolicy.passed !== true ? { "final-native-only-residual-policy-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("semantic-editability") ? { "final-native-only-residual-semantic-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("native-component-quality") ? { "final-native-only-residual-component-rejected": 1 } : {}),
              ...nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy, "final-native-only-residual"),
              "final-native-only-residual-removed": nativeOnlyCandidate.removed,
              "final-native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === undefined
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalMissingNativeVisualAtomFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalMissingNativeVisualAtomCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalMissingNativeVisualAtomFit?.accepted) {
          validateDeckIr(finalMissingNativeVisualAtomFit.deck, root);
          metadata.generatedDeck = finalMissingNativeVisualAtomFit.deck; metadata.deckFile = finalMissingNativeVisualAtomFit.deckFile; outputFile = finalMissingNativeVisualAtomFit.pptxFile; verificationDeck = finalMissingNativeVisualAtomFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalMissingNativeVisualAtomFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalMissingNativeVisualAtomFit.deck);
          const validated = validateDeckIr(finalMissingNativeVisualAtomFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = {
            ...finalMissingNativeVisualAtomFit.quality,
            metrics: {
              ...finalMissingNativeVisualAtomFit.quality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 1,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms
            }
          };
        } else if (finalMissingNativeVisualAtomFit) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-missing-native-visual-atom-fit-accepted": 0,
              "final-missing-native-visual-atom-fit-shapes": finalMissingNativeVisualAtomFit.addedShapes || 0,
              "final-missing-native-visual-atom-fit-targets": finalMissingNativeVisualAtomFit.candidateTargets || 0,
              "final-missing-native-visual-atom-fit-atoms": finalMissingNativeVisualAtomFit.candidateAtoms || 0
            }
          };
        }
      }
 return { outputFile, verificationDeck, visualQuality };
}

module.exports = { runWorkerVisualRefinement };
