"use strict";

const path = require("node:path");
const { runCorpusCases } = require("./paddleocr-corpus-session");
const { startPowerPointSessionBroker } = require("./powerpoint-session-broker");
const { cleanPowerPointSessionEnvironment, takePowerPointSessionEnvironment } = require("./powerpoint-session-client");

const GOLDEN_SCRIPT = path.resolve(__dirname, "../complex-graphic-golden-smoke.js");

function powerPointSessionEnabled(value) {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new TypeError("powerpoint-session must be true or false");
}

function eligibleForPowerPointSession(entry) {
  const command = entry?.command;
  if (!Array.isArray(command) || !command.every((value) => typeof value === "string")) return false;
  if (command[0] !== "node" && command[0] !== process.execPath) return false;
  return Boolean(command[1]) && path.resolve(command[1]) === GOLDEN_SCRIPT;
}

function safeSessionMetrics(metrics, eligibleCases) {
  const result = { enabled: true, eligibleCases };
  for (const key of ["requests", "rejected", "createMs", "quitMs", "collectMs", "waitMs", "exitMs", "releaseRemaining", "stderrBytes"]) {
    const value = metrics?.[key];
    if (!Number.isSafeInteger(value) || value < 0 || value > 86400000) throw new Error("PowerPoint corpus session metrics are invalid");
    result[key] = value;
  }
  return Object.freeze(result);
}

async function runPowerPointCorpusSession(cases, options = {}, dependencies = {}) {
  if (!Array.isArray(cases) || cases.length > 512) throw new TypeError("corpus cases must be a bounded array");
  const enabled = powerPointSessionEnabled(options.sharedPowerPoint);
  if (enabled && options.concurrency !== 1) throw new Error("Shared corpus PowerPoint requires serialized cases");
  const execute = dependencies.runCorpusCases || runCorpusCases;
  const start = dependencies.startBroker || startPowerPointSessionBroker;
  const environment = cleanPowerPointSessionEnvironment(options.environment || process.env);
  const eligibleCases = cases.filter(eligibleForPowerPointSession).length;
  const baseOptions = { ...options, environment, environmentForCase: () => environment };
  if (!enabled || eligibleCases < 2) {
    const outcome = await execute(cases, baseOptions);
    return { ...outcome, officeSession: Object.freeze({ enabled: false, eligibleCases }) };
  }

  const broker = await start();
  let outcome;
  let executionError;
  let metrics;
  try {
    const scoped = { ...environment, ...takePowerPointSessionEnvironment({ ...broker.env }) };
    outcome = await execute(cases, {
      ...baseOptions,
      environmentForCase: (entry) => eligibleForPowerPointSession(entry) ? scoped : environment
    });
  } catch (error) {
    executionError = error;
  }
  try {
    metrics = await broker.close();
  } catch (error) {
    if (executionError) throw new AggregateError([executionError, error], "Corpus execution and PowerPoint cleanup failed", { cause: error });
    const diagnostic = safeCleanupDiagnostic(error);
    const suffix = diagnostic ? ` (phase=${diagnostic.phase}, hresult=${diagnostic.hresult || "none"})` : "";
    throw new Error(`Corpus PowerPoint cleanup failed${suffix}`, { cause: error });
  }
  if (executionError) throw executionError;
  return { ...outcome, officeSession: safeSessionMetrics(metrics, eligibleCases) };
}

function safeCleanupDiagnostic(error) {
  const phase = error?.diagnostic?.phase;
  const hresult = error?.diagnostic?.hresult;
  if (error?.code !== "POWERPOINT_KEEPER_CLEANUP" || !/^[a-z-]{1,32}$/u.test(phase || "")) return null;
  if (hresult !== null && !/^0x[0-9A-F]{8}$/u.test(hresult || "")) return null;
  return Object.freeze({ phase, hresult });
}

module.exports = { eligibleForPowerPointSession, powerPointSessionEnabled, runPowerPointCorpusSession, safeCleanupDiagnostic, safeSessionMetrics };
