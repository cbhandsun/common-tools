"use strict";

const { shouldTryFinalAttentionTextRefinement, shouldTryFinalEditableTextFontFamilyRefinement, shouldTryFinalVisualRefinement, shouldTryFinalWorstTextInkBoxRefinement, shouldTryFinalWorstTextRefinement } = require('./worker-quality-policy');
const { runWorkerStage } = require("./worker-budget-runner");
const { tryBuildFinalLightCardGeometryCandidate, tryBuildFinalLightCardStrokeCandidate, tryBuildFinalLowSaturationPanelFillCandidate, tryBuildFinalSourceVerticalLineCandidate } = require('./worker-surface-candidates');
const { allPagesHaveNativeGraphics, runBuilder } = require('./worker-job-support');
const { validateDeckIr } = require("./worker-input-services");
const { nativeObjectMetrics } = require("./worker-output-services");
const { tryBuildFinalEditableTextFontFamilyCandidate, tryBuildFinalWorstRichOcrTextLayoutCandidate, tryBuildFinalWorstTextArrowGlyphCandidate, tryBuildFinalWorstTextColorCandidate, tryBuildFinalWorstTextCompositeCandidate, tryBuildFinalWorstTextInkBoxCandidate, tryBuildFinalWorstTextScaleCandidate, tryBuildFinalWorstTextWeightCandidate } = require('./worker-text-candidates');
const { tryBuildFinalLowContrastFooterMarkCandidate, tryBuildFinalLowContrastFooterPrimitiveCandidate } = require('./worker-native-candidates');

async function runWorkerTextRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, outputFile, raw, rawImageQualityVerifier, root, timeoutMs, verificationDeck, visualQuality }) {
if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardGeometryFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardGeometryCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardGeometryFit?.accepted) {
          validateDeckIr(finalLightCardGeometryFit.deck, root);
          metadata.generatedDeck = finalLightCardGeometryFit.deck; metadata.deckFile = finalLightCardGeometryFit.deckFile; outputFile = finalLightCardGeometryFit.pptxFile; verificationDeck = finalLightCardGeometryFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardGeometryFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardGeometryFit.deck);
          const validated = validateDeckIr(finalLightCardGeometryFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardGeometryFit.quality;
        }
        if (finalLightCardGeometryFit && finalLightCardGeometryFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-geometry-fit-accepted": Number(finalLightCardGeometryFit.accepted === true),
              "final-light-card-geometry-fit-shapes": finalLightCardGeometryFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowSaturationPanelFillFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowSaturationPanelFillCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowSaturationPanelFillFit?.accepted) {
          validateDeckIr(finalLowSaturationPanelFillFit.deck, root);
          metadata.generatedDeck = finalLowSaturationPanelFillFit.deck; metadata.deckFile = finalLowSaturationPanelFillFit.deckFile; outputFile = finalLowSaturationPanelFillFit.pptxFile; verificationDeck = finalLowSaturationPanelFillFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowSaturationPanelFillFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowSaturationPanelFillFit.deck);
          const validated = validateDeckIr(finalLowSaturationPanelFillFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowSaturationPanelFillFit.quality;
        }
        if (finalLowSaturationPanelFillFit && finalLowSaturationPanelFillFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-saturation-panel-fill-fit-accepted": Number(finalLowSaturationPanelFillFit.accepted === true),
              "final-low-saturation-panel-fill-fit-shapes": finalLowSaturationPanelFillFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextInkBoxRefinement(visualQuality)) {
        const finalWorstTextInkBoxFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextInkBoxCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextInkBoxFit?.accepted) {
          validateDeckIr(finalWorstTextInkBoxFit.deck, root);
          metadata.generatedDeck = finalWorstTextInkBoxFit.deck; metadata.deckFile = finalWorstTextInkBoxFit.deckFile; outputFile = finalWorstTextInkBoxFit.pptxFile; verificationDeck = finalWorstTextInkBoxFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextInkBoxFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextInkBoxFit.deck);
          const validated = validateDeckIr(finalWorstTextInkBoxFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextInkBoxFit.quality;
        }
        if (finalWorstTextInkBoxFit && finalWorstTextInkBoxFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-ink-box-fit-accepted": Number(finalWorstTextInkBoxFit.accepted === true),
              "final-worst-text-ink-box-fit-text-boxes": finalWorstTextInkBoxFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextInkBoxRefinement(visualQuality)) {
        const finalWorstRichOcrTextLayoutFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstRichOcrTextLayoutCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstRichOcrTextLayoutFit?.accepted) {
          validateDeckIr(finalWorstRichOcrTextLayoutFit.deck, root);
          metadata.generatedDeck = finalWorstRichOcrTextLayoutFit.deck; metadata.deckFile = finalWorstRichOcrTextLayoutFit.deckFile; outputFile = finalWorstRichOcrTextLayoutFit.pptxFile; verificationDeck = finalWorstRichOcrTextLayoutFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstRichOcrTextLayoutFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstRichOcrTextLayoutFit.deck);
          const validated = validateDeckIr(finalWorstRichOcrTextLayoutFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstRichOcrTextLayoutFit.quality;
        }
        if (finalWorstRichOcrTextLayoutFit && finalWorstRichOcrTextLayoutFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-rich-ocr-text-layout-fit-accepted": Number(finalWorstRichOcrTextLayoutFit.accepted === true),
              "final-worst-rich-ocr-text-layout-fit-text-boxes": finalWorstRichOcrTextLayoutFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-ink-box-fit-accepted"] !== 1 && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextCompositeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextCompositeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextCompositeFit?.accepted) {
          validateDeckIr(finalWorstTextCompositeFit.deck, root);
          metadata.generatedDeck = finalWorstTextCompositeFit.deck; metadata.deckFile = finalWorstTextCompositeFit.deckFile; outputFile = finalWorstTextCompositeFit.pptxFile; verificationDeck = finalWorstTextCompositeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextCompositeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextCompositeFit.deck);
          const validated = validateDeckIr(finalWorstTextCompositeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextCompositeFit.quality;
        }
        if (finalWorstTextCompositeFit && finalWorstTextCompositeFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-composite-fit-accepted": Number(finalWorstTextCompositeFit.accepted === true),
              "final-worst-text-composite-fit-text-boxes": finalWorstTextCompositeFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextScaleFit?.accepted) {
          validateDeckIr(finalWorstTextScaleFit.deck, root);
          metadata.generatedDeck = finalWorstTextScaleFit.deck; metadata.deckFile = finalWorstTextScaleFit.deckFile; outputFile = finalWorstTextScaleFit.pptxFile; verificationDeck = finalWorstTextScaleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextScaleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextScaleFit.deck);
          const validated = validateDeckIr(finalWorstTextScaleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextScaleFit.quality;
        }
        if (finalWorstTextScaleFit && finalWorstTextScaleFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-scale-fit-accepted": Number(finalWorstTextScaleFit.accepted === true),
              "final-worst-text-scale-fit-text-boxes": finalWorstTextScaleFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-weight-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextWeightFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextWeightCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextWeightFit?.accepted) {
          validateDeckIr(finalWorstTextWeightFit.deck, root);
          metadata.generatedDeck = finalWorstTextWeightFit.deck; metadata.deckFile = finalWorstTextWeightFit.deckFile; outputFile = finalWorstTextWeightFit.pptxFile; verificationDeck = finalWorstTextWeightFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextWeightFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextWeightFit.deck);
          const validated = validateDeckIr(finalWorstTextWeightFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextWeightFit.quality;
        }
        if (finalWorstTextWeightFit && finalWorstTextWeightFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-weight-fit-accepted": Number(finalWorstTextWeightFit.accepted === true),
              "final-worst-text-weight-fit-text-boxes": finalWorstTextWeightFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalEarlyLightCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalEarlyLightCardStrokeFit?.accepted) {
          validateDeckIr(finalEarlyLightCardStrokeFit.deck, root);
          metadata.generatedDeck = finalEarlyLightCardStrokeFit.deck; metadata.deckFile = finalEarlyLightCardStrokeFit.deckFile; outputFile = finalEarlyLightCardStrokeFit.pptxFile; verificationDeck = finalEarlyLightCardStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalEarlyLightCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalEarlyLightCardStrokeFit.deck);
          const validated = validateDeckIr(finalEarlyLightCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalEarlyLightCardStrokeFit.quality;
        }
        if (finalEarlyLightCardStrokeFit && finalEarlyLightCardStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-early-light-card-stroke-fit-accepted": Number(finalEarlyLightCardStrokeFit.accepted === true),
              "final-early-light-card-stroke-fit-shapes": finalEarlyLightCardStrokeFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalSourceVerticalLineFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSourceVerticalLineCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalSourceVerticalLineFit?.accepted) {
          validateDeckIr(finalSourceVerticalLineFit.deck, root);
          metadata.generatedDeck = finalSourceVerticalLineFit.deck; metadata.deckFile = finalSourceVerticalLineFit.deckFile; outputFile = finalSourceVerticalLineFit.pptxFile; verificationDeck = finalSourceVerticalLineFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalSourceVerticalLineFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalSourceVerticalLineFit.deck);
          const validated = validateDeckIr(finalSourceVerticalLineFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalSourceVerticalLineFit.quality;
        }
        if (finalSourceVerticalLineFit && finalSourceVerticalLineFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-source-vertical-line-fit-accepted": Number(finalSourceVerticalLineFit.accepted === true),
              "final-source-vertical-line-fit-shapes": finalSourceVerticalLineFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowContrastFooterMarkFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterMarkCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowContrastFooterMarkFit?.accepted) {
          validateDeckIr(finalLowContrastFooterMarkFit.deck, root);
          metadata.generatedDeck = finalLowContrastFooterMarkFit.deck; metadata.deckFile = finalLowContrastFooterMarkFit.deckFile; outputFile = finalLowContrastFooterMarkFit.pptxFile; verificationDeck = finalLowContrastFooterMarkFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowContrastFooterMarkFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowContrastFooterMarkFit.deck);
          const validated = validateDeckIr(finalLowContrastFooterMarkFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowContrastFooterMarkFit.quality;
        }
        if (finalLowContrastFooterMarkFit && finalLowContrastFooterMarkFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-contrast-footer-mark-fit-accepted": Number(finalLowContrastFooterMarkFit.accepted === true),
              "final-low-contrast-footer-mark-fit-shapes": finalLowContrastFooterMarkFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLowContrastFooterPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLowContrastFooterPrimitiveCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLowContrastFooterPrimitives?.accepted) {
          validateDeckIr(finalLowContrastFooterPrimitives.deck, root);
          metadata.generatedDeck = finalLowContrastFooterPrimitives.deck; metadata.deckFile = finalLowContrastFooterPrimitives.deckFile; outputFile = finalLowContrastFooterPrimitives.pptxFile; verificationDeck = finalLowContrastFooterPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLowContrastFooterPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLowContrastFooterPrimitives.deck);
          const validated = validateDeckIr(finalLowContrastFooterPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLowContrastFooterPrimitives.quality;
        }
        if (finalLowContrastFooterPrimitives && finalLowContrastFooterPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-low-contrast-footer-primitives-accepted": Number(finalLowContrastFooterPrimitives.accepted === true),
              "final-low-contrast-footer-primitives-shapes": finalLowContrastFooterPrimitives.addedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-editable-text-font-family-fit-accepted"] === undefined && shouldTryFinalEditableTextFontFamilyRefinement(visualQuality)) {
        const finalEditableTextFontFamilyFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalEditableTextFontFamilyCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalEditableTextFontFamilyFit?.accepted) {
          validateDeckIr(finalEditableTextFontFamilyFit.deck, root);
          metadata.generatedDeck = finalEditableTextFontFamilyFit.deck; metadata.deckFile = finalEditableTextFontFamilyFit.deckFile; outputFile = finalEditableTextFontFamilyFit.pptxFile; verificationDeck = finalEditableTextFontFamilyFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalEditableTextFontFamilyFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalEditableTextFontFamilyFit.deck);
          const validated = validateDeckIr(finalEditableTextFontFamilyFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalEditableTextFontFamilyFit.quality;
        }
        if (finalEditableTextFontFamilyFit && finalEditableTextFontFamilyFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-editable-text-font-family-fit-accepted": Number(finalEditableTextFontFamilyFit.accepted === true),
              "final-editable-text-font-family-fit-text-boxes": finalEditableTextFontFamilyFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextColorFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextColorCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextColorFit?.accepted) {
          validateDeckIr(finalWorstTextColorFit.deck, root);
          metadata.generatedDeck = finalWorstTextColorFit.deck; metadata.deckFile = finalWorstTextColorFit.deckFile; outputFile = finalWorstTextColorFit.pptxFile; verificationDeck = finalWorstTextColorFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextColorFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextColorFit.deck);
          const validated = validateDeckIr(finalWorstTextColorFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextColorFit.quality;
        }
        if (finalWorstTextColorFit && finalWorstTextColorFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-color-fit-accepted": Number(finalWorstTextColorFit.accepted === true),
              "final-worst-text-color-fit-text-boxes": finalWorstTextColorFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextArrowGlyphFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextArrowGlyphCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextArrowGlyphFit?.accepted) {
          validateDeckIr(finalWorstTextArrowGlyphFit.deck, root);
          metadata.generatedDeck = finalWorstTextArrowGlyphFit.deck; metadata.deckFile = finalWorstTextArrowGlyphFit.deckFile; outputFile = finalWorstTextArrowGlyphFit.pptxFile; verificationDeck = finalWorstTextArrowGlyphFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextArrowGlyphFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextArrowGlyphFit.deck);
          const validated = validateDeckIr(finalWorstTextArrowGlyphFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextArrowGlyphFit.quality;
        }
        if (finalWorstTextArrowGlyphFit && finalWorstTextArrowGlyphFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-arrow-glyph-fit-accepted": Number(finalWorstTextArrowGlyphFit.accepted === true),
              "final-worst-text-arrow-glyph-fit-text-boxes": finalWorstTextArrowGlyphFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextScaleFit?.accepted) {
          validateDeckIr(finalWorstTextScaleFit.deck, root);
          metadata.generatedDeck = finalWorstTextScaleFit.deck; metadata.deckFile = finalWorstTextScaleFit.deckFile; outputFile = finalWorstTextScaleFit.pptxFile; verificationDeck = finalWorstTextScaleFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextScaleFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextScaleFit.deck);
          const validated = validateDeckIr(finalWorstTextScaleFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextScaleFit.quality;
        }
        if (finalWorstTextScaleFit && finalWorstTextScaleFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-scale-fit-accepted": Number(finalWorstTextScaleFit.accepted === true),
              "final-worst-text-scale-fit-text-boxes": finalWorstTextScaleFit.changedTextBoxes
            }
          };
        }
      }
 return { outputFile, verificationDeck, visualQuality };
}

module.exports = { runWorkerTextRefinement };
