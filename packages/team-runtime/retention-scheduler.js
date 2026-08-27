"use strict";

function retentionScheduleSettings(environment = process.env) {
  const intervalSeconds = Number(environment.COMMON_TOOLS_RETENTION_INTERVAL_SECONDS || 86400);
  if (!Number.isSafeInteger(intervalSeconds) || intervalSeconds < 300 || intervalSeconds > 604800) {
    throw new Error("COMMON_TOOLS_RETENTION_INTERVAL_SECONDS must be between 300 and 604800");
  }
  return Object.freeze({ intervalMs: intervalSeconds * 1000, intervalSeconds });
}

function waitForNextRun(intervalMs, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve(false);
      return;
    }
    let timer;
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(false);
    };
    timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve(true);
    }, intervalMs);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function runRetentionSchedule({ runOnce, intervalMs, signal, wait = waitForNextRun, maxRuns } = {}) {
  if (typeof runOnce !== "function") throw new TypeError("retention scheduler runOnce must be a function");
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 300000 || intervalMs > 604800000) throw new RangeError("retention scheduler intervalMs is invalid");
  if (typeof wait !== "function") throw new TypeError("retention scheduler wait must be a function");
  if (maxRuns !== undefined && (!Number.isSafeInteger(maxRuns) || maxRuns < 1 || maxRuns > 1000000)) throw new RangeError("retention scheduler maxRuns is invalid");

  let runs = 0;
  while (!signal?.aborted && (maxRuns === undefined || runs < maxRuns)) {
    await runOnce();
    runs += 1;
    if (signal?.aborted || (maxRuns !== undefined && runs >= maxRuns)) break;
    if (!await wait(intervalMs, signal)) break;
  }
  return Object.freeze({ runs, stopped: signal?.aborted === true });
}

module.exports = { retentionScheduleSettings, runRetentionSchedule, waitForNextRun };
