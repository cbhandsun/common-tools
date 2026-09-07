#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { TeamWorker, TeamWorkerRunner, loadTeamConfig, recoverWorkerLeases } = require("../../team-runtime");
const { createImageToEditableArchiveHandler } = require("../../slideclone-core/team-worker");
const { createTeamDocumentNormalizer } = require("../../slideclone-core/team-document-normalizer");
const { createImageDeliveryArtifacts } = require("../../ppt-create-core/image-delivery");
const { buildPdfWithLibreOffice } = require("../../ppt-create-core/libreoffice-pdf");
const { createPinnedRawImageOcr, readPinnedRawImageOcrProfile, verifyPinnedRawImageOcrProfile } = require("../../slideclone-core/team-ocr-profile");
const { createRawImageNativeRebuilder } = require("../../slideclone-core/team-native-rebuild");
const { refineRenderedTextOnce } = require("../../slideclone-core/text-refinement-coordinator");
const { PRODUCTION_PROFILE_NAME } = require("../../slideclone-core/native-rebuild-profile");
const { PROFILE_NAME: PADDLE_PROFILE_NAME, createPinnedPaddleImageNormalizer, createPinnedPaddleRawImageOcr, readPinnedPaddleOcrProfile, verifyPinnedPaddleOcrProfile } = require("../../slideclone-core/team-paddleocr-profile");
const { createTeamProviderBundle, loadTeamSecrets, startWorkerHeartbeat } = require("../team-providers");
const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig } = require("../telemetry");
const { createImageWorkerSettings, pathIsFile } = require("../image-worker-settings");

const workerSettings = createImageWorkerSettings({ paddleProfileName: PADDLE_PROFILE_NAME, readPaddleProfile: readPinnedPaddleOcrProfile, readRawProfile: readPinnedRawImageOcrProfile });
function startupFailureCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENXML_BUILDER_EXE")) return "invalid-builder";
  if (message.includes("raw image OCR") || message.includes("PaddleOCR") || message.includes("COMMON_TOOLS_IMAGE_RAW_OCR") || message.includes("COMMON_TOOLS_IMAGE_PADDLEOCR")) return "invalid-raw-ocr-profile";
  if (message.includes("COMMON_TOOLS_") || message.includes("image worker supports only")) return "invalid-configuration";
  return "provider-initialization";
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function createNativeRebuilder(settings, { loadImplementation = () => require("../../../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native"), componentCatalogRoot } = {}) {
  const implementation = loadImplementation();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") throw new Error("native image rebuild implementation is unavailable");
  const { createImageComponentResolver } = require("../image-component-analysis");
  const resolveComponentIndexes = createImageComponentResolver({ root: componentCatalogRoot, implementation });
  const { readPng, writePng } = require("../../slideclone-core/png");
  const { eraseMasks } = require("../../slideclone-core/residual-primitive-erasure");
  const { createFullSlideResidualBuilder } = require("../../slideclone-core/full-slide-native-residual");
  const { refineKnowledgeGraphIconCrops } = require("../../slideclone-core/knowledge-graph-icon-crops");
  const { admitSemanticArcs } = require("../../slideclone-core/semantic-arc-admission");
  const { fitSourceHorizontalConnectors } = require("../../slideclone-core/source-horizontal-connector-fit");
  const { restoreOcrGlyphResiduals } = require("../../slideclone-core/ocr-glyph-residual");
  const { refineGrayBorderResiduals } = require("../../slideclone-core/gray-border-residual");
  const { fitKnowledgeGraphRelations } = require("../../slideclone-core/knowledge-graph-relation-fit");
  const normalizeImageFile = settings.rawImageOcrProfile.kind === "paddleocr" ? createPinnedPaddleImageNormalizer(settings.rawImageOcrProfile) : undefined;
  const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });
  const admitSemanticShapes = ({ page, slideSize, sourceFile }) => {
    const image = readPng(sourceFile);
    const fitted = fitSourceHorizontalConnectors({ shapes: page.shapes, slideSize, image });
    page.shapes = fitted.shapes;
    const relations = fitKnowledgeGraphRelations({ shapes: page.shapes, slideSize, image });
    page.shapes = relations.shapes;
    const admission = admitSemanticArcs({ page, slideSize, image });
    const relationFit = { upperAccepted: relations.evidence.upperAccepted, lowerAccepted: relations.evidence.lowerAccepted };
    return { ...admission, evidence: { ...admission.evidence, horizontalConnectorFit: fitted.evidence, relationFit } };
  };
  return createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: implementation.rebuildDeckFromWorkDir, resolveComponentIndexes, normalizeImageFile, createFullSlideResidual, refineSemanticImages: refineKnowledgeGraphIconCrops, admitSemanticShapes, restoreOcrGlyphs: restoreOcrGlyphResiduals, refineGrayBorders: refineGrayBorderResiduals, preserveLocalFidelityImages: true });
}
function createRenderQualityVerifier() {
  const renderPresentation = require("../../slideclone-core/render-libreoffice");
  const { comparePageFiles } = require("../../slideclone-core/diff-pixel-png");
  const { createRawImageRenderQualityVerifier } = require("../../slideclone-core/team-render-quality");
  return createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles });
}
function createTeamImageDelivery({ root, irFile, pptxFile }) {
  const reports = path.join(root, "reports"); fs.mkdirSync(reports, { recursive: false });
  fs.writeFileSync(path.join(reports, "pipeline-result.json"), `${JSON.stringify({ ok: true, irFile, pptx: { pptxFile } })}\n`, { flag: "wx", mode: 0o600 });
  const result = createImageDeliveryArtifacts({ outputDir: root, buildPdf: buildPdfWithLibreOffice });
  const descriptors = [
    ["deck.ir.json", result.files.irFile, "application/json"], ["deck.preview.html", result.files.previewFile, "text/html"],
    ["deck.html", result.files.htmlFile, "text/html"], ["deck.pptx", result.files.pptxFile, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["deck.pdf", result.files.pdfFile, "application/pdf"], ["deck.preservation-plan.json", result.files.planFile, "application/json"]
  ];
  return Object.freeze({ artifacts: Object.freeze(descriptors.map(([name, file, mediaType]) => Object.freeze({ name, file, mediaType }))), checks: result.checks });
}
async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  if (!config.enabledCapabilities.includes("image-to-editable")) throw new Error("image-to-editable is not enabled for this team deployment");
  const settings = workerSettings(environment);
  let rawImageOcr;
  if (settings.rawImageOcrProfile.enabled && settings.rawImageOcrProfile.kind === "paddleocr") {
    rawImageOcr = createPinnedPaddleRawImageOcr(settings.rawImageOcrProfile);
    await verifyPinnedPaddleOcrProfile(settings.rawImageOcrProfile, rawImageOcr);
  } else if (settings.rawImageOcrProfile.enabled) {
    await verifyPinnedRawImageOcrProfile(settings.rawImageOcrProfile);
    rawImageOcr = createPinnedRawImageOcr(settings.rawImageOcrProfile);
  }
  const rawImageRebuilder = settings.rawImageOcrProfile.enabled ? createNativeRebuilder(settings, { componentCatalogRoot: environment.COMMON_TOOLS_IMAGE_COMPONENT_ASSET_ROOT }) : undefined;
  const bundle = await createTeamProviderBundle({ config, secrets: loadTeamSecrets(environment), allowCreateBucket: config.mode === "development" });
  const telemetryConfig = loadOtlpTraceConfig(environment);
  const traceExporter = telemetryConfig ? createOtlpTraceExporter(telemetryConfig) : undefined;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let workerHeartbeat;
  try {
    workerHeartbeat = startWorkerHeartbeat({ heartbeats: bundle.workerHeartbeats, capability: "image-to-editable", workerId: settings.workerId, intervalMs: Math.min(30000, Math.max(5000, settings.pollSeconds * 1000)), reportFailure: () => { process.stderr.write("team image worker availability heartbeat failed\n"); } });
    await workerHeartbeat.ready;
    const worker = new TeamWorker({
      repository: bundle.repository,
      handlers: { "image-to-editable": createTracedWorkerHandler(createImageToEditableArchiveHandler({ objectStore: bundle.objectStore, builderExecutable: settings.builderExecutable, documentNormalizer: createTeamDocumentNormalizer(), rawImageOcr, rawImageRebuilder, rawImageQualityVerifier: createRenderQualityVerifier(), rawImageTextRefiner: refineRenderedTextOnce, createDelivery: createTeamImageDelivery, requiredReconstructionProfile: PRODUCTION_PROFILE_NAME, ocrCheckpointFingerprint: settings.ocrCheckpointFingerprint }), { exporter: traceExporter, capability: "image-to-editable" }) },
      leaseSeconds: config.workerLeaseSeconds
    });
    const runner = new TeamWorkerRunner({ queue: bundle.queue, worker, workerId: settings.workerId, capability: "image-to-editable", pollSeconds: settings.pollSeconds });
    let lastRecovery = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastRecovery >= config.workerLeaseSeconds * 1000) {
          await recoverWorkerLeases({ repository: bundle.repository, queue: bundle.queue, actorId: settings.workerId, capability: "image-to-editable" });
          lastRecovery = Date.now();
        }
        await runner.processOne();
      } catch { process.stderr.write("team image worker delivery failed\n"); await delay(1000); }
    }
  } finally { rawImageOcr?.close?.(); await workerHeartbeat?.stop(); await bundle.close(); }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`team image worker could not start (${startupFailureCode(error)})\n`); process.exitCode = 1; });

module.exports = { createNativeRebuilder, createRenderQualityVerifier, createTeamImageDelivery, main, pathIsFile, startupFailureCode, workerSettings };
