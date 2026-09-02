"use strict";

const { WorkerFailure } = require("../team-runtime/worker-failure");

const DEFAULT_RETRY_DELAYS_MS = Object.freeze([250, 500, 1000, 2000, 4000, 8000, 16000]);
const NOT_READY_CODES = new Set(["NoSuchKey", "NotFound", "NoSuchObject", "INPUT_NOT_READY"]);

function isInputNotReadyError(error) {
  if (!error || typeof error !== "object") return false;
  const code = typeof error.code === "string" ? error.code : typeof error.name === "string" ? error.name : "";
  return NOT_READY_CODES.has(code);
}

function retrySettings({ retryDelaysMs = DEFAULT_RETRY_DELAYS_MS, sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)) } = {}) {
  if (!Array.isArray(retryDelaysMs) || retryDelaysMs.length > 10 || retryDelaysMs.some((value) => !Number.isSafeInteger(value) || value < 0 || value > 30000) || retryDelaysMs.reduce((sum, value) => sum + value, 0) > 60000) throw new TypeError("object readiness retry delays are invalid");
  if (typeof sleep !== "function") throw new TypeError("object readiness sleep is invalid");
  return { retryDelaysMs, sleep };
}

async function withInputReadinessRetry(operation, options) {
  if (typeof operation !== "function") throw new TypeError("object readiness operation is invalid");
  const { retryDelaysMs, sleep } = retrySettings(options);
  for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
    try { return await operation(); }
    catch (error) {
      if (!isInputNotReadyError(error)) throw error;
      if (attempt === retryDelaysMs.length) throw new WorkerFailure("INPUT_NOT_READY", { cause: error });
      await sleep(retryDelaysMs[attempt]);
    }
  }
  throw new WorkerFailure("INPUT_NOT_READY");
}

module.exports = { DEFAULT_RETRY_DELAYS_MS, isInputNotReadyError, withInputReadinessRetry };
