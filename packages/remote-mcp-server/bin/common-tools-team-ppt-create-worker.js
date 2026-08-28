#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { TeamWorker, TeamWorkerRunner, loadTeamConfig, recoverWorkerLeases } = require("../../team-runtime");
const { createPptCreateHandler } = require("../../ppt-create-core/team-worker");
const { buildPdfWithLibreOffice } = require("../../ppt-create-core/libreoffice-pdf");
const { buildOpenXmlDecksSync } = require("../../../skills/pd-hifi-slideclone/scripts/adapters/pptx-openxml-dotnet");
const { createTeamProviderBundle, loadTeamSecrets, startWorkerHeartbeat } = require("../team-providers");
const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig } = require("../telemetry");

function workerSettings(environment = process.env) {
  if (environment.COMMON_TOOLS_WORKER_CAPABILITIES && environment.COMMON_TOOLS_WORKER_CAPABILITIES !== "ppt-create") throw new Error("PPT creation worker supports only ppt-create");
  const pollSeconds = Number(environment.COMMON_TOOLS_WORKER_POLL_SECONDS || 5);
  if (!Number.isSafeInteger(pollSeconds) || pollSeconds < 1 || pollSeconds > 60) throw new Error("COMMON_TOOLS_WORKER_POLL_SECONDS must be between 1 and 60");
  const workerId = environment.COMMON_TOOLS_WORKER_ID || `team-ppt-create-worker-${crypto.randomUUID()}`;
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(workerId)) throw new Error("COMMON_TOOLS_WORKER_ID is invalid");
  return Object.freeze({ pollSeconds, workerId });
}
function buildPptx({ irFile, outFile }) {
  const skillRoot = path.resolve(__dirname, "../../../skills/pd-hifi-slideclone");
  buildOpenXmlDecksSync([{ irFile, outFile }], { skillRoot, config: { openXmlBuilder: { cache: false, configuration: "Release", targetFramework: "net8.0" } }, metrics: {} }, path.join(skillRoot, "dotnet", "OpenXmlDeckBuilder"), { powerPointSafe: true });
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  if (!config.enabledCapabilities.includes("ppt-create")) throw new Error("ppt-create is not enabled for this team deployment");
  const settings = workerSettings(environment);
  const bundle = await createTeamProviderBundle({ config, secrets: loadTeamSecrets(environment), allowCreateBucket: config.mode === "development" });
  const telemetryConfig = loadOtlpTraceConfig(environment);
  const traceExporter = telemetryConfig ? createOtlpTraceExporter(telemetryConfig) : undefined;
  let stopping = false;
  const stop = () => { stopping = true; };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  let workerHeartbeat;
  try {
    workerHeartbeat = startWorkerHeartbeat({ heartbeats: bundle.workerHeartbeats, capability: "ppt-create", workerId: settings.workerId, intervalMs: Math.min(30000, Math.max(5000, settings.pollSeconds * 1000)), reportFailure: () => { process.stderr.write("team PPT creation worker availability heartbeat failed\n"); } });
    await workerHeartbeat.ready;
    const handler = createPptCreateHandler({ objectStore: bundle.objectStore, buildPptx, buildPdf: buildPdfWithLibreOffice });
    const worker = new TeamWorker({ repository: bundle.repository, handlers: { "ppt-create": createTracedWorkerHandler(handler, { exporter: traceExporter, capability: "ppt-create" }) }, leaseSeconds: config.workerLeaseSeconds });
    const runner = new TeamWorkerRunner({ queue: bundle.queue, worker, workerId: settings.workerId, capability: "ppt-create", pollSeconds: settings.pollSeconds });
    let lastRecovery = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastRecovery >= config.workerLeaseSeconds * 1000) {
          await recoverWorkerLeases({ repository: bundle.repository, queue: bundle.queue, actorId: settings.workerId, capability: "ppt-create" });
          lastRecovery = Date.now();
        }
        await runner.processOne();
      } catch { process.stderr.write("team PPT creation worker delivery failed\n"); await delay(1000); }
    }
  } finally { await workerHeartbeat?.stop(); await bundle.close(); }
}

if (require.main === module) main().catch(() => { process.stderr.write("team PPT creation worker could not start\n"); process.exitCode = 1; });

module.exports = { buildPptx, main, workerSettings };
