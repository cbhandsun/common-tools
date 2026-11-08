"use strict";

const { shouldTryFinalAttentionTextRefinement, shouldTryFinalComponentFidelityPrimitiveRefinement, shouldTryFinalVisualRefinement, shouldTryFinalWorstTextRefinement } = require('./worker-quality-policy');
const { runWorkerStage } = require("./worker-budget-runner");
const { tryBuildFinalLateTextSourceBudgetCompactionCandidate, tryBuildFinalTextFidelityPrimitiveCandidate, tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate, tryBuildFinalWorstTextBoxNudgeCandidate, tryBuildFinalWorstTextColorCandidate, tryBuildFinalWorstTextInkBoxCandidate, tryBuildFinalWorstTextWeightCandidate } = require('./worker-text-candidates');
const { allPagesHaveNativeGraphics, runBuilder } = require('./worker-job-support');
const { validateDeckIr } = require("./worker-input-services");
const { nativeObjectMetrics } = require("./worker-output-services");
const { tryBuildFinalLightCardSideAccentCandidate, tryBuildFinalLightCardStrokeCandidate, tryBuildFinalLightCardStrokeColorCandidate, tryBuildFinalNativeShapeThinStrokeCandidate } = require('./worker-surface-candidates');
const { tryBuildFinalLateShapeSourceBudgetCompactionCandidate, tryBuildFinalShapeSourceProvenanceCompactionCandidate, tryBuildFinalWorstComponentFidelityPrimitiveCandidate } = require('./worker-native-candidates');

async function runWorkerSurfaceRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, outputFile, raw, rawImageQualityVerifier, root, timeoutMs, verificationDeck, visualQuality }) {
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
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalWorstTextBoxNudgeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextBoxNudgeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstTextBoxNudgeFit?.accepted) {
          validateDeckIr(finalWorstTextBoxNudgeFit.deck, root);
          metadata.generatedDeck = finalWorstTextBoxNudgeFit.deck; metadata.deckFile = finalWorstTextBoxNudgeFit.deckFile; outputFile = finalWorstTextBoxNudgeFit.pptxFile; verificationDeck = finalWorstTextBoxNudgeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstTextBoxNudgeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstTextBoxNudgeFit.deck);
          const validated = validateDeckIr(finalWorstTextBoxNudgeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstTextBoxNudgeFit.quality;
        }
        if (finalWorstTextBoxNudgeFit && finalWorstTextBoxNudgeFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-text-box-nudge-fit-accepted": Number(finalWorstTextBoxNudgeFit.accepted === true),
              "final-worst-text-box-nudge-fit-text-boxes": finalWorstTextBoxNudgeFit.changedTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
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
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalNativeShapeThinStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalNativeShapeThinStrokeCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalNativeShapeThinStrokeFit?.accepted) {
          validateDeckIr(finalNativeShapeThinStrokeFit.deck, root);
          metadata.generatedDeck = finalNativeShapeThinStrokeFit.deck; metadata.deckFile = finalNativeShapeThinStrokeFit.deckFile; outputFile = finalNativeShapeThinStrokeFit.pptxFile; verificationDeck = finalNativeShapeThinStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalNativeShapeThinStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalNativeShapeThinStrokeFit.deck);
          const validated = validateDeckIr(finalNativeShapeThinStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalNativeShapeThinStrokeFit.quality;
        }
        if (finalNativeShapeThinStrokeFit && finalNativeShapeThinStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-native-shape-thin-stroke-fit-accepted": Number(finalNativeShapeThinStrokeFit.accepted === true),
              "final-native-shape-thin-stroke-fit-shapes": finalNativeShapeThinStrokeFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalShapeSourceProvenanceCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalShapeSourceProvenanceCompactionCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalShapeSourceProvenanceCompaction?.accepted) {
          validateDeckIr(finalShapeSourceProvenanceCompaction.deck, root);
          metadata.generatedDeck = finalShapeSourceProvenanceCompaction.deck; metadata.deckFile = finalShapeSourceProvenanceCompaction.deckFile; outputFile = finalShapeSourceProvenanceCompaction.pptxFile; verificationDeck = finalShapeSourceProvenanceCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalShapeSourceProvenanceCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalShapeSourceProvenanceCompaction.deck);
          const validated = validateDeckIr(finalShapeSourceProvenanceCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalShapeSourceProvenanceCompaction.quality;
        }
        if (finalShapeSourceProvenanceCompaction && finalShapeSourceProvenanceCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-shape-source-provenance-compaction-accepted": Number(finalShapeSourceProvenanceCompaction.accepted === true),
              "final-shape-source-provenance-compaction-shapes": finalShapeSourceProvenanceCompaction.changedShapes,
              "final-shape-source-provenance-compaction-fields": finalShapeSourceProvenanceCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalTextFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalTextFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalTextFidelityPrimitives?.accepted) {
          validateDeckIr(finalTextFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalTextFidelityPrimitives.deck; metadata.deckFile = finalTextFidelityPrimitives.deckFile; outputFile = finalTextFidelityPrimitives.pptxFile; verificationDeck = finalTextFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalTextFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalTextFidelityPrimitives.deck);
          const validated = validateDeckIr(finalTextFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalTextFidelityPrimitives.quality;
        }
        if (finalTextFidelityPrimitives && finalTextFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-text-fidelity-primitives-accepted": Number(finalTextFidelityPrimitives.accepted === true),
              "final-text-fidelity-primitives-shapes": finalTextFidelityPrimitives.addedShapes,
              "final-text-fidelity-primitives-text-boxes": finalTextFidelityPrimitives.candidateTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardStrokeColorFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeColorCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardStrokeColorFit?.accepted) {
          validateDeckIr(finalLightCardStrokeColorFit.deck, root);
          metadata.generatedDeck = finalLightCardStrokeColorFit.deck; metadata.deckFile = finalLightCardStrokeColorFit.deckFile; outputFile = finalLightCardStrokeColorFit.pptxFile; verificationDeck = finalLightCardStrokeColorFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardStrokeColorFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardStrokeColorFit.deck);
          const validated = validateDeckIr(finalLightCardStrokeColorFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardStrokeColorFit.quality;
        }
        if (finalLightCardStrokeColorFit && finalLightCardStrokeColorFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-stroke-color-fit-accepted": Number(finalLightCardStrokeColorFit.accepted === true),
              "final-light-card-stroke-color-fit-shapes": finalLightCardStrokeColorFit.changedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardSideAccentFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardSideAccentCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardSideAccentFit?.accepted) {
          validateDeckIr(finalLightCardSideAccentFit.deck, root);
          metadata.generatedDeck = finalLightCardSideAccentFit.deck; metadata.deckFile = finalLightCardSideAccentFit.deckFile; outputFile = finalLightCardSideAccentFit.pptxFile; verificationDeck = finalLightCardSideAccentFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardSideAccentFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardSideAccentFit.deck);
          const validated = validateDeckIr(finalLightCardSideAccentFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardSideAccentFit.quality;
        }
        if (finalLightCardSideAccentFit && finalLightCardSideAccentFit.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-side-accent-fit-accepted": Number(finalLightCardSideAccentFit.accepted === true),
              "final-light-card-side-accent-fit-shapes": finalLightCardSideAccentFit.addedShapes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLightCardStrokeFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLightCardStrokeCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLightCardStrokeFit?.accepted) {
          validateDeckIr(finalLightCardStrokeFit.deck, root);
          metadata.generatedDeck = finalLightCardStrokeFit.deck; metadata.deckFile = finalLightCardStrokeFit.deckFile; outputFile = finalLightCardStrokeFit.pptxFile; verificationDeck = finalLightCardStrokeFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLightCardStrokeFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLightCardStrokeFit.deck);
          const validated = validateDeckIr(finalLightCardStrokeFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLightCardStrokeFit.quality;
        }
        if (finalLightCardStrokeFit && finalLightCardStrokeFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-light-card-stroke-fit-accepted": Number(finalLightCardStrokeFit.accepted === true),
              "final-light-card-stroke-fit-shapes": finalLightCardStrokeFit.changedShapes
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
      if (raw && rawImageQualityVerifier && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalLateShapeSourceBudgetCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLateShapeSourceBudgetCompactionCandidate({
          root,
          metadata,
          visualQuality,
          isCancellationRequested
        }));
        if (finalLateShapeSourceBudgetCompaction?.accepted) {
          validateDeckIr(finalLateShapeSourceBudgetCompaction.deck, root);
          metadata.generatedDeck = finalLateShapeSourceBudgetCompaction.deck; metadata.deckFile = finalLateShapeSourceBudgetCompaction.deckFile; verificationDeck = finalLateShapeSourceBudgetCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateShapeSourceBudgetCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateShapeSourceBudgetCompaction.deck);
          const validated = validateDeckIr(finalLateShapeSourceBudgetCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateShapeSourceBudgetCompaction.quality;
        }
        if (finalLateShapeSourceBudgetCompaction && finalLateShapeSourceBudgetCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-shape-source-budget-compaction-accepted": Number(finalLateShapeSourceBudgetCompaction.accepted === true),
              "final-late-shape-source-budget-compaction-shapes": finalLateShapeSourceBudgetCompaction.changedShapes,
              "final-late-shape-source-budget-compaction-fields": finalLateShapeSourceBudgetCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateTextSourceBudgetCompaction = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalLateTextSourceBudgetCompactionCandidate({
          root,
          metadata,
          visualQuality,
          isCancellationRequested
        }));
        if (finalLateTextSourceBudgetCompaction?.accepted) {
          validateDeckIr(finalLateTextSourceBudgetCompaction.deck, root);
          metadata.generatedDeck = finalLateTextSourceBudgetCompaction.deck; metadata.deckFile = finalLateTextSourceBudgetCompaction.deckFile; verificationDeck = finalLateTextSourceBudgetCompaction.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateTextSourceBudgetCompaction.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateTextSourceBudgetCompaction.deck);
          const validated = validateDeckIr(finalLateTextSourceBudgetCompaction.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateTextSourceBudgetCompaction.quality;
        }
        if (finalLateTextSourceBudgetCompaction && finalLateTextSourceBudgetCompaction.removedFields > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-text-source-budget-compaction-accepted": Number(finalLateTextSourceBudgetCompaction.accepted === true),
              "final-late-text-source-budget-compaction-text-boxes": finalLateTextSourceBudgetCompaction.changedTextBoxes,
              "final-late-text-source-budget-compaction-fields": finalLateTextSourceBudgetCompaction.removedFields
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalComponentFidelityPrimitiveRefinement(visualQuality)) {
        const finalWorstComponentFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstComponentFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalWorstComponentFidelityPrimitives?.accepted) {
          validateDeckIr(finalWorstComponentFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalWorstComponentFidelityPrimitives.deck; metadata.deckFile = finalWorstComponentFidelityPrimitives.deckFile; outputFile = finalWorstComponentFidelityPrimitives.pptxFile; verificationDeck = finalWorstComponentFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalWorstComponentFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalWorstComponentFidelityPrimitives.deck);
          const validated = validateDeckIr(finalWorstComponentFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalWorstComponentFidelityPrimitives.quality;
        }
        if (finalWorstComponentFidelityPrimitives && finalWorstComponentFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-worst-component-fidelity-primitives-accepted": Number(finalWorstComponentFidelityPrimitives.accepted === true),
              "final-worst-component-fidelity-primitives-shapes": finalWorstComponentFidelityPrimitives.addedShapes,
              "final-worst-component-fidelity-primitives-components": finalWorstComponentFidelityPrimitives.candidateComponents
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateTextFidelityPrimitives = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalTextFidelityPrimitiveCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateTextFidelityPrimitives?.accepted) {
          validateDeckIr(finalLateTextFidelityPrimitives.deck, root);
          metadata.generatedDeck = finalLateTextFidelityPrimitives.deck; metadata.deckFile = finalLateTextFidelityPrimitives.deckFile; outputFile = finalLateTextFidelityPrimitives.pptxFile; verificationDeck = finalLateTextFidelityPrimitives.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateTextFidelityPrimitives.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateTextFidelityPrimitives.deck);
          const validated = validateDeckIr(finalLateTextFidelityPrimitives.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateTextFidelityPrimitives.quality;
        }
        if (finalLateTextFidelityPrimitives && finalLateTextFidelityPrimitives.addedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-text-fidelity-primitives-accepted": Number(finalLateTextFidelityPrimitives.accepted === true),
              "final-late-text-fidelity-primitives-shapes": finalLateTextFidelityPrimitives.addedShapes,
              "final-late-text-fidelity-primitives-text-boxes": finalLateTextFidelityPrimitives.candidateTextBoxes
            }
          };
        }
      }
      if (raw && rawImageQualityVerifier && shouldTryFinalWorstTextRefinement(visualQuality)) {
        const finalLateArrowTextFidelity = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextArrowGlyphWithTextFidelityCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalLateArrowTextFidelity?.accepted) {
          validateDeckIr(finalLateArrowTextFidelity.deck, root);
          metadata.generatedDeck = finalLateArrowTextFidelity.deck; metadata.deckFile = finalLateArrowTextFidelity.deckFile; outputFile = finalLateArrowTextFidelity.pptxFile; verificationDeck = finalLateArrowTextFidelity.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalLateArrowTextFidelity.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalLateArrowTextFidelity.deck);
          const validated = validateDeckIr(finalLateArrowTextFidelity.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalLateArrowTextFidelity.quality;
        }
        if (finalLateArrowTextFidelity && (finalLateArrowTextFidelity.changedTextBoxes > 0 || finalLateArrowTextFidelity.addedShapes > 0)) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-late-arrow-text-fidelity-accepted": Number(finalLateArrowTextFidelity.accepted === true),
              "final-late-arrow-text-fidelity-text-boxes": finalLateArrowTextFidelity.changedTextBoxes,
              "final-late-arrow-text-fidelity-shapes": finalLateArrowTextFidelity.addedShapes,
              "final-late-arrow-text-fidelity-primitive-text-boxes": finalLateArrowTextFidelity.candidateTextBoxesWithPrimitives
            }
          };
        }
      }
 return { outputFile, verificationDeck, visualQuality };
}

module.exports = { runWorkerSurfaceRefinement };
