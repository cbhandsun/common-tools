"use strict";

const os = require("node:os");
const { allPagesHaveNativeGraphics, assertObjectStore, assessStrictNativeCandidate, rebuildRawImages, runBuilder, searchProvisionalNativeCandidate, sha256, validatePackage } = require('./worker-job-support');
const { createOcrCheckpoint } = require("./ocr-checkpoint");
const path = require("node:path");
const { createBudgetedWorkerHandler, budgetedQualityVerifier, runWorkerStage } = require("./worker-budget-runner");
const fs = require("node:fs");
const { createNativeOnlyShadowSession } = require("./native-only-shadow-session");
const { hasMeasuredVisualGain } = require("./candidate-quality-policy");
const { validateDeckIr } = require("./worker-input-services");
const { MAX_ARCHIVE_BYTES, extractProjectArchive } = require("./worker-input-services");
const { MAX_ARTIFACT_BYTES: MAX_PPTX_BYTES, prepareDeliveryArtifacts, readDeliveryArtifact } = require("./worker-output-services");
const { auditNativeComponentQuality, largeRasterEditability, nativeObjectMetrics, ocrRecoveryCandidateScopes, qualityRendered, shouldStopOcrRecoverySearch, visualQualityDoesNotRegress } = require("./worker-output-services");
const { blockLateVisualRefinementForLargeRaster, blockLateVisualRefinementForNativeOnlyResidualGap, nativeOnlyResidualQualityAcceptable, nativeOnlyResidualRejectionMetrics, shouldTryFinalAttentionTextRefinement, shouldTryFinalEditableTextFontFamilyRefinement, shouldTryFinalVisualRefinement, shouldTryFinalWorstTextInkBoxRefinement, shouldTryFinalWorstTextRefinement, topWorstComponentIsMissingNative, topWorstComponentNeedsNativeShapeRefinement, trimQualityMetrics } = require('./worker-quality-policy');
const { runWorkerTextRefinement } = require('./worker-refinement-stages');
const { runWorkerSurfaceRefinement } = require('./worker-refinement-stages');
const { runWorkerVisualRefinement } = require('./worker-refinement-stages');
const { auditSemanticEditability, withWorkerRelationshipPolicy } = require("./worker-output-services");
const { assertQualityReport } = require("./worker-output-services");
const { QUALITY_GATE_REQUIRED } = require("./worker-output-services");
const { admitNormalizedPages } = require("./worker-input-services");
const { WorkerFailure } = require("./worker-output-services");
const { residualDeduplicationStatus } = require('./worker-native-recovery');
const { adoptOcrRecovery, assertTextRefinementResult, countRecoveredOcrTextBoxes, deckHasRecoveredOcrText, mergeRecoveredOcrTextForFallback, refineNativeOnlyResidualCandidateText, selectOcrRecovery } = require('./worker-text-evidence');
const { tryBuildFinalMissingNativeVisualAtomCandidate, tryBuildNativeOnlyPictorialIconCandidate, tryBuildNativeOnlyResidualCandidate, tryBuildVisualFallback } = require('./worker-candidate-api');
const { refineNativeOnlyResidualCandidateMissingNativeLines } = require('./worker-missing-graphics-2');
const { adoptNativeOnlyResidualCandidate, refineNativeOnlyStrokes } = require('./worker-native-recovery-2');
const { tryBuildFinalEditableTextFontFamilyCandidate, tryBuildFinalOcrEvidenceFitCandidate, tryBuildFinalWorstTextInkBoxCandidate, tryBuildFinalWorstTextScaleCandidate, tryBuildFinalWorstTextWeightCandidate } = require('./worker-candidate-api');
const { tryBuildFinalSaturatedColorPanelCandidate } = require('./worker-candidate-api');

function createImageToEditableArchiveHandler({ objectStore, temporaryRoot = os.tmpdir(), builderExecutable = process.env.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder", builderArgs = [], documentNormalizer, rawImageOcr, rawImageRebuilder, rawImageQualityVerifier, rawImageTextRefiner, rawImageOwnedTextRefiner, rawImageTypographyRefiner, createDelivery, requiredReconstructionProfile, ocrCheckpointFingerprint, connectorCornerMode = 'reroutable-elbow', timeoutMs = 8 * 60 * 1000 } = {}) {
  withWorkerRelationshipPolicy(connectorCornerMode, () => undefined);
  const store = assertObjectStore(objectStore);
  const ocrCheckpoint = ocrCheckpointFingerprint === undefined ? undefined : createOcrCheckpoint({ objectStore: store, profileFingerprint: ocrCheckpointFingerprint });
  if (typeof temporaryRoot !== "string" || !path.isAbsolute(temporaryRoot)) throw new TypeError("temporaryRoot must be an absolute path");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 30000 || timeoutMs > 9 * 60 * 1000) throw new RangeError("editable worker timeout is invalid");
  if (documentNormalizer !== undefined && typeof documentNormalizer !== "function") throw new TypeError("documentNormalizer must be a function");
  if (rawImageQualityVerifier !== undefined && typeof rawImageQualityVerifier !== "function") throw new TypeError("rawImageQualityVerifier must be a function");
  if (rawImageTextRefiner !== undefined && typeof rawImageTextRefiner !== "function") throw new TypeError("rawImageTextRefiner must be a function");
  if (rawImageOwnedTextRefiner !== undefined && typeof rawImageOwnedTextRefiner !== "function") throw new TypeError("rawImageOwnedTextRefiner must be a function");
  if (rawImageTypographyRefiner !== undefined && typeof rawImageTypographyRefiner !== "function") throw new TypeError("rawImageTypographyRefiner must be a function");
  if (createDelivery !== undefined && typeof createDelivery !== "function") throw new TypeError("createDelivery must be a function");
  if (requiredReconstructionProfile !== undefined && (typeof requiredReconstructionProfile !== "string" || !/^[a-z0-9][a-z0-9.-]{2,63}$/u.test(requiredReconstructionProfile))) throw new TypeError("required reconstruction profile is invalid");
  if (rawImageQualityVerifier) rawImageQualityVerifier = budgetedQualityVerifier(rawImageQualityVerifier);
  const handler = createBudgetedWorkerHandler(async ({ job, isCancellationRequested }) => {
    if (!job || job.capability !== "image-to-editable" || typeof job.inputObjectKey !== "string" || typeof job.outputPrefix !== "string") throw new Error("editable worker job is invalid");
    if (await isCancellationRequested()) throw new Error("editable job was cancelled");
    const archive = await runWorkerStage("IMAGE_INPUT_READ_FAILED", () => store.readObject({ objectKey: job.inputObjectKey, maxBytes: MAX_ARCHIVE_BYTES }));
    const root = fs.mkdtempSync(path.join(temporaryRoot, "common-tools-editable-"));
    const nativeShadowSession = createNativeOnlyShadowSession({ assess: assessStrictNativeCandidate,
      hasMeasuredGain: hasMeasuredVisualGain, validateDeck: validateDeckIr });
    const nativeShadowPolicy = { builderExecutable, builderArgs, timeoutMs, requiredReconstructionProfile };
    try {
      extractProjectArchive(archive, root, { label: "editable" });
      const metadata = validatePackage(root);
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (metadata.kind === "raw-document") {
        if (typeof documentNormalizer !== "function") throw new Error("document editable normalization profile is not enabled for this worker");
        const normalized = await runWorkerStage("IMAGE_NORMALIZATION_FAILED", async () => admitNormalizedPages(await documentNormalizer({ root, metadata, isCancellationRequested }), root));
        metadata.sources = normalized.sources; metadata.pages = normalized.pages; metadata.assets = normalized.assets;
      }
      let ocrResults;
      let baselineRebuild;
      let deliveredOcrCropRecovery = null;
      if (metadata.kind === "raw-image" || metadata.kind === "raw-document") {
        if (typeof rawImageOcr !== "function") throw new WorkerFailure("IMAGE_OCR_NOT_CONFIGURED");
        if (typeof rawImageRebuilder !== "function") throw new Error("raw editable native rebuild profile is not enabled for this worker");
        ocrResults = new Map();
        const rebuilt = await rebuildRawImages({ root, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults });
        baselineRebuild = rebuilt;
        deliveredOcrCropRecovery = rebuilt.ocrCropRecovery;
        const generatedDeck = rebuilt?.deck;
        metadata.deckFile = path.join(root, "deck.json");
        fs.writeFileSync(metadata.deckFile, `${JSON.stringify(generatedDeck)}\n`, "utf8");
        const validated = validateDeckIr(generatedDeck, root);
        const nativeMetrics = nativeObjectMetrics(generatedDeck);
        const residualDeduplication = residualDeduplicationStatus(generatedDeck, rebuilt?.residual);
        metadata.pages = validated.pages; metadata.assets = validated.assets; metadata.nativeMetrics = nativeMetrics; metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(generatedDeck); metadata.normalizedSourceImages = rebuilt.sourceImages;
        metadata.residualDeduplication = residualDeduplication;
        metadata.reconstructionProfile = rebuilt.reconstructionProfile;
        metadata.nativeComponentQuality = rebuilt.nativeComponentQuality;
        metadata.ocrCropRecovery = rebuilt.ocrCropRecovery;
        metadata.generatedDeck = generatedDeck;
      }
      let outputFile = path.join(root, createDelivery ? "source.pptx" : "deck.pptx");
      await runWorkerStage("IMAGE_BUILD_FAILED", () => runBuilder({ executable: builderExecutable, builderArgs, deckFile: metadata.deckFile, outputFile, cwd: root, timeoutMs, isCancellationRequested }));
      if (!fs.existsSync(outputFile) || !fs.statSync(outputFile).isFile() || fs.statSync(outputFile).size < 1 || fs.statSync(outputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid artifact");
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      const raw = metadata.kind === "raw-image" || metadata.kind === "raw-document";
      let sourceImages = raw ? metadata.normalizedSourceImages : metadata.structuredSourceImages;
      const visualVerificationEnabled = Array.isArray(sourceImages);
      let verificationDeck = raw ? metadata.generatedDeck : metadata.structuredDeck;
      let renderedImages = [];
      let bestRejectedRecovery = null;
      let adoptedOcrRecovery = false;
      let adoptedNativeOnlyResidual = false;
      let textRefinementExplicitlyRejected = false;
      let visualQuality = visualVerificationEnabled && rawImageQualityVerifier
        ? await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageQualityVerifier({ root, pptxFile: outputFile, sourceImage: sourceImages[0], sourceImages, deck: verificationDeck, isCancellationRequested, collectRenderedPages: pages => { renderedImages = pages; } }))
        : null;
      if (raw && rawImageQualityVerifier && ocrRecoveryCandidateScopes(baselineRebuild).length > 0
        && qualityRendered(visualQuality)) {
        const recoveryScopes = ocrRecoveryCandidateScopes(baselineRebuild);
        for (let index = 0; index < recoveryScopes.length; index += 1) {
          const candidateRoot = path.join(root, `.ocr-recovery-candidate-${index + 1}`);
          fs.mkdirSync(candidateRoot, { recursive: true });
          const candidate = await rebuildRawImages({ root: candidateRoot, metadata, rawImageOcr, rawImageRebuilder, isCancellationRequested, ocrCheckpoint, job, ocrResults, recoverOcrCropText: true, recoveryScope: recoveryScopes[index] });
          if (candidate.ocrCropRecovery.recovered < 1) continue;
          const candidateDeckFile = path.join(candidateRoot, "deck.json");
          const candidateOutputFile = path.join(candidateRoot, "deck.pptx");
          fs.writeFileSync(candidateDeckFile, `${JSON.stringify(candidate.deck)}\n`, "utf8");
          validateDeckIr(candidate.deck, candidateRoot);
          await runWorkerStage("IMAGE_BUILD_FAILED", () => runBuilder({ executable: builderExecutable, builderArgs, deckFile: candidateDeckFile, outputFile: candidateOutputFile, cwd: candidateRoot, timeoutMs, isCancellationRequested }));
          if (!fs.existsSync(candidateOutputFile) || !fs.statSync(candidateOutputFile).isFile() || fs.statSync(candidateOutputFile).size < 1 || fs.statSync(candidateOutputFile).size > MAX_PPTX_BYTES) throw new Error("editable builder produced an invalid candidate artifact");
          let candidateRenderedImages = [];
          const candidateQuality = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageQualityVerifier({ root: candidateRoot, pptxFile: candidateOutputFile, sourceImage: candidate.sourceImages[0], sourceImages: candidate.sourceImages, deck: candidate.deck, isCancellationRequested, collectRenderedPages: pages => { candidateRenderedImages = pages; } }));
          if (selectOcrRecovery({ baseline: baselineRebuild, candidate, baselineQuality: visualQuality, candidateQuality })) {
            adoptOcrRecovery({ root, metadata, candidate, candidateRoot, candidateDeckFile, candidateOutputFile, outputFile });
            adoptedOcrRecovery = true;
            deliveredOcrCropRecovery = candidate.ocrCropRecovery;
            sourceImages = candidate.sourceImages; verificationDeck = candidate.deck;
            visualQuality = candidateQuality; renderedImages = candidateRenderedImages;
            break;
          }
          if (Number.isFinite(candidateQuality?.metrics?.["pixel-diff-ratio"])
            && (!bestRejectedRecovery || candidateQuality.metrics["pixel-diff-ratio"] < bestRejectedRecovery.quality.metrics["pixel-diff-ratio"])) {
            bestRejectedRecovery = { candidate, root: candidateRoot, deckFile: candidateDeckFile, pptxFile: candidateOutputFile, quality: candidateQuality, renderedImages: candidateRenderedImages };
          }
          if (shouldStopOcrRecoverySearch({ baselineQuality: visualQuality, candidateQuality })) break;
        }
      }
      // Resolve an uneditable page raster before spending typography candidates
      // on a representation that cannot pass the final publication gate.
      if (raw && rawImageQualityVerifier && rawImageTextRefiner && renderedImages.length && shouldTryFinalWorstTextRefinement(visualQuality)
        && largeRasterEditability(metadata.generatedDeck).passed) {
        const refinementStartedAt = Date.now();
        const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
          root, deckFile: metadata.deckFile, pptxFile: outputFile, deck: metadata.generatedDeck, acceptImprovedFailure: true,
          sourceImages: metadata.normalizedSourceImages, renderedImages, initialQuality: visualQuality, isCancellationRequested,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages: metadata.normalizedSourceImages, deck, isCancellationRequested })
        }));
        assertTextRefinementResult(refined);
        textRefinementExplicitlyRejected = refined.accepted !== true;
        if (refined.accepted) {
          validateDeckIr(refined.deck, root);
          metadata.generatedDeck = refined.deck; metadata.deckFile = refined.deckFile; outputFile = refined.pptxFile; verificationDeck = refined.deck; visualQuality = refined.quality;
        }
        visualQuality = { ...visualQuality, metrics: { ...visualQuality.metrics, "text-refinement-accepted": Number(refined.accepted), "text-refinement-proposed-boxes": refined.changedTextBoxes, "text-refinement-milliseconds": Date.now() - refinementStartedAt, ...(refined.skippedPixelBudget ? {"text-refinement-skipped-pixel-budget": refined.skippedPixelBudget} : {}) } };
      }
      if (raw && rawImageQualityVerifier && qualityRendered(visualQuality) && !largeRasterEditability(metadata.generatedDeck).passed) {
        let nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyResidualCandidate({
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
        if (nativeOnlyCandidate && nativeOnlyCandidate.rejected !== true) {
          const pictorialNativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildNativeOnlyPictorialIconCandidate({
            root,
            baseline: nativeOnlyCandidate,
            sourceImages: metadata.normalizedSourceImages,
            rawImageQualityVerifier,
            isCancellationRequested,
            runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
          }));
          nativeOnlyCandidate = pictorialNativeOnlyCandidate || nativeOnlyCandidate;
        }
        nativeOnlyCandidate = await runWorkerStage("IMAGE_QUALITY_FAILED", () => searchProvisionalNativeCandidate({
          root, candidate: nativeOnlyCandidate, baselineQuality: visualQuality, baselineDeck: metadata.generatedDeck, refineOwnedTexts: rawImageOwnedTextRefiner, refineNativeStrokes: refineNativeOnlyStrokes,
          sourceImages: metadata.normalizedSourceImages, rawImageQualityVerifier, isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        await runWorkerStage("IMAGE_QUALITY_FAILED", () => nativeShadowSession.checkpoint({ root,
          baselineDeck: metadata.generatedDeck, baselineQuality: visualQuality, candidate: nativeOnlyCandidate,
          sourceImages: metadata.normalizedSourceImages, policy: nativeShadowPolicy }));
        const nativeOnlyPolicy = nativeOnlyCandidate?.rejected === true ? null : assessStrictNativeCandidate({
          baselineQuality: visualQuality,
          baselineDeck: metadata.generatedDeck,
          candidateQuality: nativeOnlyCandidate?.quality,
          candidateDeck: nativeOnlyCandidate?.deck
        });
        if (nativeOnlyCandidate && nativeOnlyResidualQualityAcceptable({
          baselineQuality: visualQuality,
          candidateQuality: nativeOnlyCandidate.quality,
          baselineDeck: metadata.generatedDeck,
          candidateDeck: nativeOnlyCandidate.deck
        }) && nativeOnlyPolicy?.passed === true) {
          adoptNativeOnlyResidualCandidate({ metadata, nativeOnlyCandidate, root });
          outputFile = nativeOnlyCandidate.pptxFile; verificationDeck = nativeOnlyCandidate.deck;
          visualQuality = {
            ...nativeOnlyCandidate.quality,
            metrics: {
              ...nativeOnlyCandidate.quality.metrics,
              "native-only-residual-removed": nativeOnlyCandidate.removed,
              "native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
          visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(visualQuality);
          adoptedNativeOnlyResidual = true;
          if (rawImageTextRefiner && nativeOnlyCandidate.renderedImages?.length && shouldTryFinalWorstTextRefinement(visualQuality)) {
            const refinementStartedAt = Date.now();
            const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
              root,
              deckFile: metadata.deckFile,
              pptxFile: outputFile,
              deck: metadata.generatedDeck,
              sourceImages: metadata.normalizedSourceImages,
              renderedImages: nativeOnlyCandidate.renderedImages,
              initialQuality: visualQuality,
              isCancellationRequested,
              acceptImprovedFailure: true,
              buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
              verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages: metadata.normalizedSourceImages, deck, isCancellationRequested })
            }));
            assertTextRefinementResult(refined);
            if (refined.accepted) {
              validateDeckIr(refined.deck, root);
              metadata.generatedDeck = refined.deck; metadata.deckFile = refined.deckFile; outputFile = refined.pptxFile; verificationDeck = refined.deck;
              metadata.nativeMetrics = nativeObjectMetrics(refined.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(refined.deck);
              const validated = validateDeckIr(refined.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
              visualQuality = blockLateVisualRefinementForNativeOnlyResidualGap(refined.quality);
            }
            visualQuality = {
              ...visualQuality,
              metrics: {
                ...visualQuality.metrics,
                "native-only-text-refinement-accepted": Number(refined.accepted),
                "native-only-text-refinement-proposed-boxes": refined.changedTextBoxes,
                "native-only-text-refinement-milliseconds": Date.now() - refinementStartedAt,
                ...(refined.skippedPixelBudget ? { "native-only-text-refinement-skipped-pixel-budget": refined.skippedPixelBudget } : {})
              }
            };
          }
        } else if (nativeOnlyCandidate) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "native-only-residual-rejected": 1,
              ...(nativeOnlyCandidate.rejected === true ? { "native-only-residual-rejection-code": nativeOnlyCandidate.rejectionCode } : {}),
              ...(nativeOnlyPolicy && nativeOnlyPolicy.passed !== true ? { "native-only-residual-policy-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("semantic-editability") ? { "native-only-residual-semantic-rejected": 1 } : {}),
              ...(nativeOnlyPolicy?.reasons?.includes("native-component-quality") ? { "native-only-residual-component-rejected": 1 } : {}),
              ...nativeOnlyResidualRejectionMetrics(nativeOnlyCandidate, nativeOnlyPolicy),
              "native-only-residual-removed": nativeOnlyCandidate.removed,
              "native-residual-primitives": nativeOnlyCandidate.nativeResidualPrimitives || 0
            }
          };
        }
      }
      if (bestRejectedRecovery && metadata.ocrCropRecovery?.recovered === 0 && rawImageTextRefiner
        && bestRejectedRecovery.renderedImages.length && qualityRendered(visualQuality)
        && !shouldStopOcrRecoverySearch({ baselineQuality: visualQuality, candidateQuality: bestRejectedRecovery.quality })) {
        const prior = bestRejectedRecovery;
        const refined = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTextRefiner({
          root: prior.root, deckFile: prior.deckFile, pptxFile: prior.pptxFile, deck: prior.candidate.deck,
          sourceImages: prior.candidate.sourceImages, renderedImages: prior.renderedImages, initialQuality: prior.quality,
          isCancellationRequested, acceptImprovedFailure: true,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: prior.root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root: prior.root, pptxFile, sourceImages: prior.candidate.sourceImages, deck, isCancellationRequested })
        }));
        assertTextRefinementResult(refined);
        if (refined.accepted) {
          const candidate = { ...prior.candidate, deck: refined.deck };
          if (selectOcrRecovery({ baseline: baselineRebuild, candidate, baselineQuality: visualQuality, candidateQuality: refined.quality })) {
            adoptOcrRecovery({ root, metadata, candidate, candidateRoot: prior.root, candidateDeckFile: refined.deckFile, candidateOutputFile: refined.pptxFile, outputFile });
            adoptedOcrRecovery = true;
            deliveredOcrCropRecovery = candidate.ocrCropRecovery;
            sourceImages = candidate.sourceImages; verificationDeck = candidate.deck;
            visualQuality = { ...refined.quality, metrics: { ...refined.quality.metrics, "text-refinement-accepted": 1, "text-refinement-proposed-boxes": refined.changedTextBoxes } };
          }
        }
      }
      if (raw && !adoptedNativeOnlyResidual && !textRefinementExplicitlyRejected && qualityRendered(visualQuality)
        && !topWorstComponentNeedsNativeShapeRefinement(visualQuality)
        && (visualQuality?.passed !== true || !largeRasterEditability(metadata.generatedDeck).passed)) {
        let fallbackSource = null;
        if (bestRejectedRecovery?.candidate?.ocrCropRecovery?.recovered > (metadata.ocrCropRecovery?.recovered || 0)) {
          fallbackSource = {
            metadata: { ...metadata, generatedDeck: mergeRecoveredOcrTextForFallback(metadata.generatedDeck, bestRejectedRecovery.candidate.deck) },
            sourceImages: bestRejectedRecovery.candidate.sourceImages,
            ocrCropRecovery: bestRejectedRecovery.candidate.ocrCropRecovery
          };
        }
        const recoveredFallback = fallbackSource ? await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildVisualFallback({
          root, sourceImages: fallbackSource.sourceImages, metadata: fallbackSource.metadata, outputFile, rawImageQualityVerifier, isCancellationRequested,
          fallbackPrefix: "ocr-rich-",
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        })) : null;
        const baselineFallback = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildVisualFallback({
          root, sourceImages: metadata.normalizedSourceImages, metadata, outputFile, rawImageQualityVerifier, isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        const useRecoveredFallback = recoveredFallback && baselineFallback
          && deckHasRecoveredOcrText(recoveredFallback.deck)
          && visualQualityDoesNotRegress({ baselineQuality: baselineFallback.quality, candidateQuality: recoveredFallback.quality })
          && visualQualityDoesNotRegress({ baselineQuality: visualQuality, candidateQuality: recoveredFallback.quality });
        const fallback = useRecoveredFallback ? recoveredFallback : baselineFallback;
        if (!useRecoveredFallback) fallbackSource = null;
        if (fallback) {
          validateDeckIr(fallback.deck, root);
          metadata.generatedDeck = fallback.deck; metadata.deckFile = fallback.deckFile; outputFile = fallback.pptxFile; verificationDeck = fallback.deck;
          const fallbackNativeMetrics = nativeObjectMetrics(fallback.deck);
          metadata.nativeMetrics = fallbackNativeMetrics; metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(fallback.deck);
          metadata.nativeComponentQuality = fallback.nativeComponentQuality; metadata.residualDeduplication = residualDeduplicationStatus(fallback.deck, { candidateObjects: 0, erasedObjects: 0 });
          if (fallbackSource?.ocrCropRecovery) {
            metadata.ocrCropRecovery = fallbackSource.ocrCropRecovery;
            deliveredOcrCropRecovery = fallbackSource.ocrCropRecovery;
            metadata.normalizedSourceImages = fallbackSource.sourceImages;
          } else if (!deckHasRecoveredOcrText(fallback.deck)) {
            metadata.ocrCropRecovery = baselineRebuild?.ocrCropRecovery || fallback.deck?.meta?.ocrCropRecovery || metadata.ocrCropRecovery;
            deliveredOcrCropRecovery = metadata.ocrCropRecovery;
          } else {
            const keepAdoptedRecovery = adoptedOcrRecovery
              && visualQualityDoesNotRegress({ baselineQuality: fallback.quality, candidateQuality: visualQuality });
            metadata.ocrCropRecovery = keepAdoptedRecovery
              ? metadata.ocrCropRecovery
              : baselineRebuild?.ocrCropRecovery || fallback.deck?.meta?.ocrCropRecovery || metadata.ocrCropRecovery;
            deliveredOcrCropRecovery = metadata.ocrCropRecovery;
          }
          const recoveredTextBoxes = countRecoveredOcrTextBoxes(fallback.deck);
          if (recoveredTextBoxes > 0 && (deliveredOcrCropRecovery?.recovered || 0) > recoveredTextBoxes) {
            deliveredOcrCropRecovery = { ...deliveredOcrCropRecovery, recovered: recoveredTextBoxes };
            metadata.ocrCropRecovery = deliveredOcrCropRecovery;
          }
          const validated = validateDeckIr(fallback.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = fallback.quality;
        }
      }
      if (raw && qualityRendered(visualQuality)) {
        visualQuality = blockLateVisualRefinementForLargeRaster(visualQuality, metadata.generatedDeck);
      }
      if (raw && rawImageQualityVerifier
        && topWorstComponentIsMissingNative(visualQuality)
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
      if (raw && rawImageQualityVerifier
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalOcrEvidenceFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalOcrEvidenceFitCandidate({
          root,
          metadata,
          outputFile,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalOcrEvidenceFit?.accepted) {
          validateDeckIr(finalOcrEvidenceFit.deck, root);
          metadata.generatedDeck = finalOcrEvidenceFit.deck; metadata.deckFile = finalOcrEvidenceFit.deckFile; outputFile = finalOcrEvidenceFit.pptxFile; verificationDeck = finalOcrEvidenceFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalOcrEvidenceFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalOcrEvidenceFit.deck);
          const validated = validateDeckIr(finalOcrEvidenceFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalOcrEvidenceFit.quality;
        }
        if (finalOcrEvidenceFit && finalOcrEvidenceFit.changedTextBoxes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-ocr-evidence-fit-accepted": Number(finalOcrEvidenceFit.accepted === true),
              "final-ocr-evidence-fit-text-boxes": finalOcrEvidenceFit.changedTextBoxes
            }
          };
        }
      }
      if (raw
        && topWorstComponentIsMissingNative(visualQuality)
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === 0) {
        visualQuality = {
          ...visualQuality,
          metrics: {
            ...visualQuality.metrics,
            "missing-native-late-refinement-blocked": 1
          }
        };
      }
      if (raw && rawImageQualityVerifier && visualQuality?.metrics?.["final-worst-text-scale-fit-accepted"] !== 1 && shouldTryFinalAttentionTextRefinement(visualQuality)) {
        const finalWorstTextScaleFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalWorstTextScaleCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          targetScales: [0.94, 0.96, 1.04],
          candidateLimits: [1, 2],
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
      if (raw && rawImageQualityVerifier
        && visualQuality?.metrics?.["final-missing-native-visual-atom-fit-accepted"] === undefined
        && shouldTryFinalVisualRefinement(visualQuality)) {
        const finalSaturatedColorPanelFit = await runWorkerStage("IMAGE_QUALITY_FAILED", () => tryBuildFinalSaturatedColorPanelCandidate({
          root,
          metadata,
          sourceImages: metadata.normalizedSourceImages,
          visualQuality,
          rawImageQualityVerifier,
          isCancellationRequested,
          runBuild: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested })
        }));
        if (finalSaturatedColorPanelFit?.accepted) {
          validateDeckIr(finalSaturatedColorPanelFit.deck, root);
          metadata.generatedDeck = finalSaturatedColorPanelFit.deck; metadata.deckFile = finalSaturatedColorPanelFit.deckFile; outputFile = finalSaturatedColorPanelFit.pptxFile; verificationDeck = finalSaturatedColorPanelFit.deck;
          metadata.nativeMetrics = nativeObjectMetrics(finalSaturatedColorPanelFit.deck); metadata.nativeGraphicsRebuilt = allPagesHaveNativeGraphics(finalSaturatedColorPanelFit.deck);
          const validated = validateDeckIr(finalSaturatedColorPanelFit.deck, root); metadata.pages = validated.pages; metadata.assets = validated.assets;
          visualQuality = finalSaturatedColorPanelFit.quality;
        }
        if (finalSaturatedColorPanelFit && finalSaturatedColorPanelFit.changedShapes > 0) {
          visualQuality = {
            ...visualQuality,
            metrics: {
              ...visualQuality.metrics,
              "final-saturated-color-panel-fit-accepted": Number(finalSaturatedColorPanelFit.accepted === true),
              "final-saturated-color-panel-fit-shapes": finalSaturatedColorPanelFit.changedShapes
            }
          };
        }
      }
      ({ outputFile, verificationDeck, visualQuality } = await runWorkerTextRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, outputFile, raw, rawImageQualityVerifier, root, timeoutMs, verificationDeck, visualQuality }));
      ({ outputFile, verificationDeck, visualQuality } = await runWorkerSurfaceRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, outputFile, raw, rawImageQualityVerifier, root, timeoutMs, verificationDeck, visualQuality }));
      ({ outputFile, verificationDeck, visualQuality } = await runWorkerVisualRefinement({ builderArgs, builderExecutable, isCancellationRequested, metadata, nativeShadowPolicy, nativeShadowSession, outputFile, raw, rawImageOwnedTextRefiner, rawImageQualityVerifier, rawImageTextRefiner, root, timeoutMs, verificationDeck, visualQuality }));
      if (raw && rawImageTypographyRefiner && rawImageQualityVerifier && qualityRendered(visualQuality)) {
        const typography = await runWorkerStage("IMAGE_QUALITY_FAILED", () => rawImageTypographyRefiner({
          root, deck: verificationDeck, deckFile: metadata.deckFile, pptxFile: outputFile, initialQuality: visualQuality, isCancellationRequested,
          buildCandidate: ({ deckFile, pptxFile }) => runBuilder({ executable: builderExecutable, builderArgs, deckFile, outputFile: pptxFile, cwd: root, timeoutMs, isCancellationRequested }),
          verifyCandidate: ({ deck, pptxFile }) => rawImageQualityVerifier({ root, pptxFile, sourceImages, deck, isCancellationRequested })
        }));
        metadata.typographySearchFile = typography.searchFile;
        if (typography.accepted) {
          const validated = validateDeckIr(typography.deck, root);
          metadata.generatedDeck = typography.deck; metadata.deckFile = typography.deckFile; verificationDeck = typography.deck; outputFile = typography.pptxFile;
          metadata.nativeMetrics = nativeObjectMetrics(typography.deck); metadata.nativeComponentQuality = auditNativeComponentQuality(typography.deck);
          metadata.pages = validated.pages; metadata.assets = validated.assets; visualQuality = typography.quality;
        }
      }
      const rasterEditability = largeRasterEditability(verificationDeck);
      const semanticEditability = raw ? auditSemanticEditability(verificationDeck) : null;
      if (semanticEditability) metadata.semanticEditability = semanticEditability;
      const sourceCheck = metadata.kind === "raw-document" ? "document-pages-normalized" : metadata.kind === "raw-image" ? (metadata.pages > 1 ? "raw-image-batch-validated" : "raw-image-validated") : "deck-ir-validated";
      const checks = [{ name: sourceCheck, passed: true }, { name: "assets-resolved", passed: true }];
      if (raw) checks.push(
        { name: "native-graphics-rebuilt", passed: metadata.nativeGraphicsRebuilt === true },
        ...(metadata.nativeComponentQuality ? [{ name: "native-component-quality", passed: metadata.nativeComponentQuality.passed }] : []),
        ...(semanticEditability ? [{ name: "semantic-editability", passed: semanticEditability.passed }] : []),
        ...(requiredReconstructionProfile ? [{ name: "local-production-profile-aligned", passed: metadata.reconstructionProfile === requiredReconstructionProfile }] : []),
        ...(metadata.residualDeduplication?.required ? [{ name: "residual-native-duplicates-removed", passed: metadata.residualDeduplication.passed }] : []),
        ...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }])
      );
      if (!raw && visualVerificationEnabled) checks.push(...(visualQuality?.checks || [{ name: "quality-render-not-configured", passed: false }]));
      if (!raw && visualVerificationEnabled) for (const name of ["quality-rendered", "visual-fidelity"]) {
        if (!checks.some(check => check.name === name)) checks.push({ name, passed: false });
      }
      if (!rasterEditability.passed) checks.push({ name: "large-raster-editability", passed: false });
      checks.push({ name: "pptx-generated", passed: true });
      let delivered = null;
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (createDelivery) {
        delivered = await runWorkerStage("IMAGE_DELIVERY_FAILED", () => createDelivery({ root, irFile: metadata.deckFile, pptxFile: outputFile, isCancellationRequested,
          ...(metadata.typographySearchFile ? { typographySearchFile: metadata.typographySearchFile } : {}) }));
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      if (delivered && (!Array.isArray(delivered.artifacts) || !Array.isArray(delivered.checks))) throw new Error("editable delivery adapter returned an invalid result");
      if (delivered) checks.push(...delivered.checks);
      if (!delivered && path.dirname(outputFile) !== root) {
        const stagedOutputFile = path.join(root, "deck.pptx");
        fs.copyFileSync(outputFile, stagedOutputFile);
        outputFile = stagedOutputFile;
      }
      const qualityMetrics = trimQualityMetrics({ ...(metadata.semanticEditability?.relationshipEditing.required === 'native-path' ? { 'semantic-native-path-relationships': metadata.semanticEditability.metrics.nativePathRelationshipCount, 'semantic-non-reroutable-relationships': metadata.semanticEditability.metrics.nonReroutableRelationshipCount, 'semantic-node-rerouting-required': metadata.semanticEditability.relationshipEditing.required === 'node-rerouting' ? 1 : 0 } : {}), pages: metadata.pages, "referenced-assets": metadata.assets, "large-raster-count": rasterEditability.largeRasterCount, "largest-raster-area-ratio": rasterEditability.largestAreaRatio, ...(raw ? { "native-shapes": metadata.nativeMetrics?.shapes || 0, "native-connectors": metadata.nativeMetrics?.connectors || 0, "native-text-boxes": metadata.nativeMetrics?.textBoxes || 0, "native-tables": metadata.nativeMetrics?.tables || 0, "native-charts": metadata.nativeMetrics?.charts || 0, "residual-images": metadata.nativeMetrics?.images || 0, "residual-erased-native-objects": metadata.residualDeduplication?.erasedObjects || 0, ...(metadata.nativeComponentQuality ? { "component-quality-connectors": metadata.nativeComponentQuality.connectors, "component-quality-minimum-unit-crops": metadata.nativeComponentQuality.minimumUnitCrops, "component-quality-evidenced-crops": metadata.nativeComponentQuality.evidencedMinimumUnitCrops, "component-quality-unverified-crops": metadata.nativeComponentQuality.unverifiedMinimumUnitCrops, "component-quality-ignored-pixel-primitives": metadata.nativeComponentQuality.ignoredPixelPrimitives || 0 } : {}), ...(metadata.semanticEditability ? { "semantic-raster-derived-primitives": metadata.semanticEditability.metrics.rasterDerivedPrimitiveCount, "semantic-large-raster-lineages": metadata.semanticEditability.metrics.largeRasterLineageCount, "semantic-unverified-crops": metadata.semanticEditability.metrics.unverifiedCropCount, "semantic-raster-provenance-missing": metadata.semanticEditability.metrics.missingRasterProvenanceCount, "semantic-suspicious-raster-mosaic": metadata.semanticEditability.metrics.suspiciousMosaicCount } : {}), ...(requiredReconstructionProfile ? { "production-profile-aligned": metadata.reconstructionProfile === requiredReconstructionProfile ? 1 : 0 } : {}), ...(metadata.visualFallbackRejections || {}), ...(visualQuality?.metrics || {}), "ocr-crop-lines-recovered": deliveredOcrCropRecovery?.recovered || 0 } : {}), ...(!raw && visualVerificationEnabled ? (visualQuality?.metrics || {}) : {}), "pptx-bytes": fs.statSync(outputFile).size });
      const quality = assertQualityReport({ passed: checks.every((check) => check.passed), checks, metrics: qualityMetrics });
      const outputArtifacts = prepareDeliveryArtifacts(delivered?.artifacts || [{ name: "deck.pptx", file: outputFile, mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }], root);
      const artifacts = [];
      for (const item of outputArtifacts) {
        if (await isCancellationRequested()) throw new Error("editable job was cancelled");
        const artifactBody = readDeliveryArtifact(item, root); const objectKey = `${job.outputPrefix}${item.name}`;
        await runWorkerStage("IMAGE_UPLOAD_FAILED", () => store.putObject({ objectKey, body: artifactBody, contentType: item.mediaType }));
        artifacts.push({ name: item.name, objectKey, mediaType: item.mediaType, sha256: sha256(artifactBody) });
      }
      if (await isCancellationRequested()) throw new Error("editable job was cancelled");
      return { completionPolicy: QUALITY_GATE_REQUIRED, artifacts, quality };
    } finally {
      try { nativeShadowSession.close(); }
      finally { fs.rmSync(root, { recursive: true, force: true, maxRetries: 2 }); }
    }
  }, { timeoutMs, temporaryRoot });
  return request => withWorkerRelationshipPolicy(connectorCornerMode, () => handler(request));
}

module.exports = { createImageToEditableArchiveHandler };
