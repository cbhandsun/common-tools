#!/usr/bin/env node
"use strict";

const { loadTeamConfig, runTeamRetention } = require("../../team-runtime");
const { runRetentionSchedule } = require("../../team-runtime/retention-scheduler");
const { createTeamProviderBundle, loadTeamSecrets } = require("../team-providers");

function retentionSettings(environment = process.env) {
  const limit = Number(environment.COMMON_TOOLS_RETENTION_BATCH_SIZE || 100);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error("COMMON_TOOLS_RETENTION_BATCH_SIZE must be between 1 and 1000");
  const actorId = environment.COMMON_TOOLS_RETENTION_ACTOR_ID || "team-retention";
  if (!/^[a-zA-Z0-9._-]{3,128}$/.test(actorId)) throw new Error("COMMON_TOOLS_RETENTION_ACTOR_ID is invalid");
  return Object.freeze({ actorId, limit });
}

async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  const settings = retentionSettings(environment);
  const bundle = await createTeamProviderBundle({ config, secrets: loadTeamSecrets(environment), allowCreateBucket: false });
  try {
    const result = await runTeamRetention({ repository: bundle.repository, objectStore: bundle.objectStore, actorId: settings.actorId, retentionDays: config.artifactRetentionDays, limit: settings.limit });
    await bundle.maintenanceHeartbeat.beat();
    process.stdout.write(`team retention completed: expired=${result.expired} cleaned=${result.cleaned}\n`);
  } finally { await bundle.close(); }
}

async function schedulerMain(environment = process.env, runtime = {}) {
  const processRef = runtime.processRef || process;
  if (!processRef || typeof processRef.once !== "function" || typeof processRef.removeListener !== "function") throw new TypeError("retention scheduler process is invalid");
  const config = loadTeamConfig(environment);
  const settings = retentionSettings(environment);
  const bundle = await createTeamProviderBundle({ config, secrets: loadTeamSecrets(environment), allowCreateBucket: false });
  const controller = new AbortController();
  const stop = () => controller.abort();
  processRef.once("SIGTERM", stop);
  processRef.once("SIGINT", stop);
  try {
    return await runRetentionSchedule({
      runOnce: async () => {
        const result = await runTeamRetention({ repository: bundle.repository, objectStore: bundle.objectStore, actorId: settings.actorId, retentionDays: config.artifactRetentionDays, limit: settings.limit });
        await bundle.maintenanceHeartbeat.beat();
        processRef.stdout.write(`team retention completed: expired=${result.expired} cleaned=${result.cleaned}\n`);
      },
      intervalMs: config.retentionIntervalSeconds * 1000,
      signal: controller.signal,
      ...(runtime.maxRuns === undefined ? {} : { maxRuns: runtime.maxRuns }),
      ...(runtime.wait === undefined ? {} : { wait: runtime.wait })
    });
  } finally {
    processRef.removeListener("SIGTERM", stop);
    processRef.removeListener("SIGINT", stop);
    await bundle.close();
  }
}

if (require.main === module) main().catch(() => { process.stderr.write("team retention maintenance failed\n"); process.exitCode = 1; });

module.exports = { main, retentionSettings, schedulerMain };
