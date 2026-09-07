#!/usr/bin/env node
"use strict";

const { TeamWorker, TeamWorkerRunner, loadTeamConfig, recoverWorkerLeases } = require("../../team-runtime");
const { createPptQualityHandler } = require("../../ppt-quality-core/team-worker");
const { createTeamProviderBundle, loadTeamSecrets, startWorkerHeartbeat } = require("../team-providers");
const { createOtlpTraceExporter, createTracedWorkerHandler, loadOtlpTraceConfig } = require("../telemetry");
const { readWorkerSettings } = require("../worker-settings");

function workerSettings(environment = process.env) {
  const { pollSeconds, workerId } = readWorkerSettings(environment, { capability: "ppt-quality", capabilityError: "PPT quality worker supports only ppt-quality", workerIdPrefix: "team-ppt-quality-worker-" });
  return Object.freeze({ pollSeconds, workerId });
}
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  if (!config.enabledCapabilities.includes("ppt-quality")) throw new Error("ppt-quality is not enabled for this team deployment");
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
    workerHeartbeat = startWorkerHeartbeat({ heartbeats: bundle.workerHeartbeats, capability: "ppt-quality", workerId: settings.workerId, intervalMs: Math.min(30000, Math.max(5000, settings.pollSeconds * 1000)), reportFailure: () => { process.stderr.write("team PPT quality worker availability heartbeat failed\n"); } });
    await workerHeartbeat.ready;
    const worker = new TeamWorker({ repository: bundle.repository, handlers: { "ppt-quality": createTracedWorkerHandler(createPptQualityHandler({ objectStore: bundle.objectStore }), { exporter: traceExporter, capability: "ppt-quality" }) }, leaseSeconds: config.workerLeaseSeconds });
    const runner = new TeamWorkerRunner({ queue: bundle.queue, worker, workerId: settings.workerId, capability: "ppt-quality", pollSeconds: settings.pollSeconds });
    let lastRecovery = 0;
    while (!stopping) {
      try {
        if (Date.now() - lastRecovery >= config.workerLeaseSeconds * 1000) {
          await recoverWorkerLeases({ repository: bundle.repository, queue: bundle.queue, actorId: settings.workerId, capability: "ppt-quality" });
          lastRecovery = Date.now();
        }
        await runner.processOne();
      } catch { process.stderr.write("team PPT quality worker delivery failed\n"); await delay(1000); }
    }
  } finally { await workerHeartbeat?.stop(); await bundle.close(); }
}

if (require.main === module) main().catch(() => { process.stderr.write("team PPT quality worker could not start\n"); process.exitCode = 1; });

module.exports = { main, workerSettings };
