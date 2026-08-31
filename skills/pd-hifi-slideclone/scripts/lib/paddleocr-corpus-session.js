"use strict";

const path = require("node:path");
const { runCases } = require("../golden-set-runner");
const adapter = require("../adapters/ocr-paddleocr-local");
const { startPaddleOcrBatchBroker } = require("./paddleocr-batch-broker");
const { readPaddleOcrConfig } = require("./ocr-provider-config");

const URL_KEY = "SLIDECLONE_PADDLE_OCR_BROKER_URL";
const TOKEN_KEY = "SLIDECLONE_PADDLE_OCR_BROKER_TOKEN";
const GOLDEN_SCRIPT = path.resolve(__dirname, "../complex-graphic-golden-smoke.js");

function brokerEnabled(value) {
  if (value === undefined || value === false || value === "false") return false;
  if (value === true || value === "true") return true;
  throw new TypeError("paddle-ocr-broker must be true or false");
}

function eligibleForBroker(entry) {
  const command = entry?.command;
  if (!Array.isArray(command) || !command.every((value) => typeof value === "string")) return false;
  if (command[0] !== "node" && command[0] !== process.execPath) return false;
  if (!command[1] || path.resolve(command[1]) !== GOLDEN_SCRIPT) return false;
  const ocrIndex = command.lastIndexOf("--ocr");
  return ocrIndex >= 0 && command[ocrIndex + 1] === "true";
}

function cleanEnvironment(environment) {
  const result = { ...environment };
  delete result[URL_KEY];
  delete result[TOKEN_KEY];
  return result;
}

// Consume before starting rebuild/Office tools; only the quality child gets it.
function takeBrokerEnvironment(environment) {
  const rawUrl = environment[URL_KEY];
  const token = environment[TOKEN_KEY];
  delete environment[URL_KEY];
  delete environment[TOKEN_KEY];
  if (rawUrl === undefined && token === undefined) return Object.freeze({});
  if (typeof rawUrl !== "string" || !rawUrl || typeof token !== "string" || !token) {
    throw new Error("PaddleOCR corpus broker configuration is invalid");
  }
  const broker = adapter._private.resolveBroker({ config: { paddleOcr: { brokerUrl: rawUrl, brokerToken: token } } });
  if (!broker) throw new Error("PaddleOCR corpus broker configuration is invalid");
  if (rawUrl !== broker.url && rawUrl !== `${broker.url}/`) throw new Error("PaddleOCR corpus broker URL is invalid");
  return Object.freeze({ [URL_KEY]: broker.url, [TOKEN_KEY]: broker.token });
}

function safeMetrics(metrics, eligibleCases) {
  const result = { enabled: true, eligibleCases };
  for (const key of ["requests", "completed", "failed", "queueWaitMs", "serviceMs"]) {
    const value = metrics?.[key];
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("PaddleOCR corpus broker metrics are invalid");
    result[key] = value;
  }
  return Object.freeze(result);
}

async function runCorpusCases(cases, options = {}, dependencies = {}) {
  if (!Array.isArray(cases) || cases.length > 512) throw new TypeError("corpus cases must be a bounded array");
  const enabled = brokerEnabled(options.sharedOcr);
  if (enabled && options.concurrency !== 1) throw new Error("Shared corpus OCR requires serialized cases");
  const execute = dependencies.runCases || runCases;
  const environment = cleanEnvironment(options.environment || process.env);
  const runOptions = { ...options, environmentForCase: () => environment };
  const eligibleCases = cases.filter(eligibleForBroker).length;
  if (!enabled || eligibleCases < 2) {
    return { results: await execute(cases, runOptions), ocrSession: Object.freeze({ enabled: false, eligibleCases }) };
  }
  const start = dependencies.startBroker || startPaddleOcrBatchBroker;
  const broker = await start({
    adapter,
    context: {
      skillRoot: path.resolve(__dirname, "../.."),
      config: { paddleOcr: { ...readPaddleOcrConfig({}), cache: false } },
      disablePaddleOcrBroker: true
    }
  });
  let results;
  let executionError;
  let metrics;
  try {
    const scoped = { ...environment, ...takeBrokerEnvironment({ ...broker.env }) };
    runOptions.environmentForCase = (entry) => eligibleForBroker(entry) ? scoped : environment;
    results = await execute(cases, runOptions);
  } catch (error) {
    executionError = error;
  }
  try {
    metrics = await broker.close();
  } catch (error) {
    if (executionError) throw new AggregateError([executionError, error], "Corpus execution and OCR cleanup failed", { cause: error });
    throw new Error("Corpus OCR cleanup failed", { cause: error });
  }
  if (executionError) throw executionError;
  return { results, ocrSession: safeMetrics(metrics, eligibleCases) };
}

module.exports = { brokerEnabled, eligibleForBroker, runCorpusCases, takeBrokerEnvironment };
