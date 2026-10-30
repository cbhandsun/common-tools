#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createPinnedRawImageOcr, readPinnedRawImageOcrProfile, verifyPinnedRawImageOcrProfile } = require("../../slideclone-core/ocr/team-ocr-profile");
const { createNativeRebuilder } = require("../image-native-rebuilder");
const { PROFILE_NAME: PADDLE_PROFILE_NAME, createPinnedPaddleRawImageOcr, readPinnedPaddleOcrProfile, verifyPinnedPaddleOcrProfile } = require("../../slideclone-core/ocr/team-paddleocr-profile");
const { createImageWorkerSettings, pathIsFile } = require("../image-worker-settings");

const workerSettings = createImageWorkerSettings({ paddleProfileName: PADDLE_PROFILE_NAME, readPaddleProfile: readPinnedPaddleOcrProfile, readRawProfile: readPinnedRawImageOcrProfile });
function startupFailureCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENXML_BUILDER_EXE")) return "invalid-builder";
  if (["Connector corner mode is invalid", "native-output-policy-invalid", "worker environment is invalid"].includes(message)) return "invalid-configuration";
  if (message.includes("raw image OCR") || message.includes("PaddleOCR") || message.includes("COMMON_TOOLS_IMAGE_RAW_OCR") || message.includes("COMMON_TOOLS_IMAGE_PADDLEOCR")) return "invalid-raw-ocr-profile";
  if (message.includes("COMMON_TOOLS_") || message.includes("image worker supports only")) return "invalid-configuration";
  return "provider-initialization";
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function createRenderQualityVerifier() {
  const renderPresentation = require("../../slideclone-core/render-libreoffice");
  const { comparePageFiles } = require("../../slideclone-core/diff-pixel-png");
  const { createRawImageRenderQualityVerifier } = require("../../slideclone-worker-adapter/team-render-quality");
  const { verifyRenderedTypography } = require("../../slideclone-core/typography/rendered-typography-audit");
  return createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles, auditRenderedText: verifyRenderedTypography });
}
function createTeamImageDelivery({ root, irFile, pptxFile, typographySearchFile }) {
  const { createImageDeliveryArtifacts } = require("../../ppt-create-core/image-delivery");
  const { buildPdfWithLibreOffice } = require("../../ppt-create-core/libreoffice-pdf");
  const reports = path.join(root, "reports"); fs.mkdirSync(reports, { recursive: false });
  fs.writeFileSync(path.join(reports, "pipeline-result.json"), `${JSON.stringify({ ok: true, irFile, pptx: { pptxFile } })}\n`, { flag: "wx", mode: 0o600 });
  const result = createImageDeliveryArtifacts({ outputDir: root, buildPdf: buildPdfWithLibreOffice });
  const descriptors = [
    ["deck.ir.json", result.files.irFile, "application/json"], ["deck.preview.html", result.files.previewFile, "text/html"],
    ["deck.html", result.files.htmlFile, "text/html"], ["deck.pptx", result.files.pptxFile, "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
    ["deck.pdf", result.files.pdfFile, "application/pdf"], ["deck.preservation-plan.json", result.files.planFile, "application/json"],
    ...(typographySearchFile ? [["deck.typography-search.json", typographySearchFile, "application/json"]] : [])
  ];
  return Object.freeze({ artifacts: Object.freeze(descriptors.map(([name, file, mediaType]) => Object.freeze({ name, file, mediaType }))), checks: result.checks });
}
async function main(environment = process.env) {
  // Service startup owns these dependencies. Importing the reconstruction
  // factory must not initialize delivery, providers or the full job runner.
  const { TeamWorker, TeamWorkerRunner, loadTeamConfig, recoverWorkerLeases } = require("../../team-runtime");
  const { createImageToEditableArchiveHandler, validateDeckIr } = require("../../slideclone-worker-adapter/team-worker");
  const { createTeamDocumentNormalizer } = require("../../slideclone-worker-adapter/team-document-normalizer");
  const { refineRenderedTextOnce } = require("../../slideclone-core/typography/text-refinement-coordinator");
  const { createParagraphTypographyRefiner } = require("../../slideclone-worker-adapter/typography-reconstruction");
  const { auditNativeComponentQuality } = require("../../slideclone-core/quality/native-component-quality");
  const { auditWorkerSemanticEditability: auditSemanticEditability } = require("../../slideclone-worker-adapter/worker-relationship-policy");
  const { recordWorkerSearchDecision } = require("../../slideclone-worker-adapter/worker-budget-runner");
  const { createWorkerOwnedTextRefiner } = require("../owned-text-refiner");
  const { PRODUCTION_PROFILE_NAME } = require("../../slideclone-core/native-rebuild-profile");
  const { createTeamProviderBundle, loadTeamSecrets, startWorkerHeartbeat } = require("../team-providers");
  const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig } = require("../telemetry");
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
  const rawImageRebuilder = settings.rawImageOcrProfile.enabled ? createNativeRebuilder(settings, { componentCatalogRoot: environment.COMMON_TOOLS_IMAGE_COMPONENT_ASSET_ROOT, rawImageOcr, environment, connectorCornerMode: settings.connectorCornerMode }) : undefined;
  const rawImageOwnedTextRefiner = settings.rawImageOcrProfile.enabled ? createWorkerOwnedTextRefiner({ builderExecutable: settings.builderExecutable }) : undefined;
  const rawImageTypographyRefiner = createParagraphTypographyRefiner({ validateDeck: validateDeckIr,
    auditComponents: auditNativeComponentQuality, auditSemantic: auditSemanticEditability, recordSearch: recordWorkerSearchDecision });
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
      handlers: { "image-to-editable": createTracedWorkerHandler(createImageToEditableArchiveHandler({ objectStore: bundle.objectStore, builderExecutable: settings.builderExecutable, documentNormalizer: createTeamDocumentNormalizer(), rawImageOcr, rawImageRebuilder, rawImageQualityVerifier: createRenderQualityVerifier(), rawImageTextRefiner: request => refineRenderedTextOnce({ ...request, searchControl: true, onSearchDecision: recordWorkerSearchDecision }), rawImageOwnedTextRefiner, rawImageTypographyRefiner, createDelivery: createTeamImageDelivery, requiredReconstructionProfile: PRODUCTION_PROFILE_NAME, ocrCheckpointFingerprint: settings.ocrCheckpointFingerprint, connectorCornerMode: settings.connectorCornerMode }), { exporter: traceExporter, capability: "image-to-editable" }) },
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
