#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { TeamWorker, TeamWorkerRunner, loadTeamConfig, recoverWorkerLeases } = require("../../team-runtime");
const { createImageToEditableArchiveHandler } = require("../../slideclone-core/team-worker");
const { createPinnedRawImageOcr, readPinnedRawImageOcrProfile, verifyPinnedRawImageOcrProfile } = require("../../slideclone-core/team-ocr-profile");
const { createRawImageNativeRebuilder } = require("../../slideclone-core/team-native-rebuild");
const { PROFILE_NAME: PADDLE_PROFILE_NAME, createPinnedPaddleImageNormalizer, createPinnedPaddleRawImageOcr, readPinnedPaddleOcrProfile, verifyPinnedPaddleOcrProfile } = require("../../slideclone-core/team-paddleocr-profile");
const { createTeamProviderBundle, loadTeamSecrets, startWorkerHeartbeat } = require("../team-providers");
const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig } = require("../telemetry");

function workerSettings(environment = process.env) {
  if (environment.COMMON_TOOLS_WORKER_CAPABILITIES && environment.COMMON_TOOLS_WORKER_CAPABILITIES !== "image-to-editable") throw new Error("image worker supports only image-to-editable");
  const pollSeconds = Number(environment.COMMON_TOOLS_WORKER_POLL_SECONDS || 5);
  if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 60) throw new Error("COMMON_TOOLS_WORKER_POLL_SECONDS must be between 1 and 60");
  const workerId = environment.COMMON_TOOLS_WORKER_ID || `team-image-worker-${crypto.randomUUID()}`;
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(workerId)) throw new Error("COMMON_TOOLS_WORKER_ID is invalid");
  const builderExecutable = environment.OPENXML_BUILDER_EXE || "/opt/openxml/OpenXmlDeckBuilder";
  if (!pathIsFile(builderExecutable)) throw new Error("OPENXML_BUILDER_EXE is unavailable");
  const rawImageOcrProfile = environment.COMMON_TOOLS_IMAGE_RAW_OCR_PROFILE === PADDLE_PROFILE_NAME
    ? readPinnedPaddleOcrProfile(environment)
    : readPinnedRawImageOcrProfile(environment);
  return Object.freeze({ pollSeconds, workerId, builderExecutable, rawImageOcrProfile });
}
function pathIsFile(file) { try { return path.isAbsolute(file) && fs.statSync(file).isFile(); } catch { return false; } }
function startupFailureCode(error) {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("OPENXML_BUILDER_EXE")) return "invalid-builder";
  if (message.includes("raw image OCR") || message.includes("PaddleOCR") || message.includes("COMMON_TOOLS_IMAGE_RAW_OCR") || message.includes("COMMON_TOOLS_IMAGE_PADDLEOCR")) return "invalid-raw-ocr-profile";
  if (message.includes("COMMON_TOOLS_") || message.includes("image worker supports only")) return "invalid-configuration";
  return "provider-initialization";
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function createNativeRebuilder(settings, { loadImplementation = () => require("../../../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native") } = {}) {
  const implementation = loadImplementation();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") throw new Error("native image rebuild implementation is unavailable");
  const normalizeImageFile = settings.rawImageOcrProfile.kind === "paddleocr" ? createPinnedPaddleImageNormalizer(settings.rawImageOcrProfile) : undefined;
  return createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: implementation.rebuildDeckFromWorkDir, normalizeImageFile });
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
  const rawImageRebuilder = settings.rawImageOcrProfile.enabled ? createNativeRebuilder(settings) : undefined;
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
      handlers: { "image-to-editable": createTracedWorkerHandler(createImageToEditableArchiveHandler({ objectStore: bundle.objectStore, builderExecutable: settings.builderExecutable, rawImageOcr, rawImageRebuilder }), { exporter: traceExporter, capability: "image-to-editable" }) },
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

module.exports = { createNativeRebuilder, main, pathIsFile, startupFailureCode, workerSettings };
