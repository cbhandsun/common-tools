// @ts-check
"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { performance } = require("node:perf_hooks");
/** @typedef {Readonly<{code: WorkerFailureCode, startedAt: number, endedAt: number, durationMs: number, status: "succeeded" | "failed"}>} WorkerStageEvent */
/** @type {AsyncLocalStorage<(event: WorkerStageEvent) => void | Promise<void>>} */
const stageObservers = new AsyncLocalStorage();

/** @template T @param {(event: WorkerStageEvent) => void | Promise<void>} observer @param {() => T} operation @returns {T} */
function withWorkerStageObserver(observer, operation) {
  if (typeof observer !== "function" || typeof operation !== "function") throw new TypeError("worker stage observer is invalid");
  return stageObservers.run(observer, operation);
}

const FAILURE_DEFINITIONS = Object.freeze({
  IMAGE_INPUT_READ_FAILED: Object.freeze({ message: "image input read failed", retryable: false }),
  IMAGE_NORMALIZATION_FAILED: Object.freeze({ message: "image document normalization failed", retryable: false }),
  IMAGE_OCR_FAILED: Object.freeze({ message: "image OCR failed", retryable: false }),
  IMAGE_REBUILD_FAILED: Object.freeze({ message: "image native reconstruction failed", retryable: false }),
  IMAGE_BUILD_FAILED: Object.freeze({ message: "image presentation build failed", retryable: false }),
  IMAGE_QUALITY_FAILED: Object.freeze({ message: "image quality verification failed", retryable: false }),
  IMAGE_UPLOAD_FAILED: Object.freeze({ message: "image artifact upload failed", retryable: false }),
  INPUT_NOT_READY: Object.freeze({ message: "uploaded input is not ready", retryable: true }),
  IMAGE_ASSET_NAMESPACE_FAILED: Object.freeze({ message: "image asset namespace processing failed", retryable: false }),
  IMAGE_DELIVERY_FAILED: Object.freeze({ message: "image delivery artifact processing failed", retryable: false })
});
const GENERIC_FAILURE = Object.freeze({ code: "WORKER_FAILED", message: "capability worker failed", retryable: false });
const STORED_ONLY_FAILURES = Object.freeze({
  WORKER_LEASE_EXPIRED: Object.freeze({ message: "worker lease expired", retryable: false }),
  QUALITY_GATE_FAILED: Object.freeze({ message: "capability output did not pass required quality gates", retryable: false }),
  NO_CAPABILITY_HANDLER: Object.freeze({ message: "worker does not support this capability", retryable: false })
});

/** Read historical JSON without trusting stored messages, retry flags or extra fields.
 * @param {unknown} value */
function readStoredWorkerFailure(value) {
  if (value == null) return null;
  try {
    if (typeof value === "string") {
      if (value.length > 8192) return GENERIC_FAILURE;
      value = /** @type {unknown} */ (JSON.parse(value));
    }
    if (value == null) return null;
    if (typeof value !== "object" || Array.isArray(value) || !Object.hasOwn(value, "code")) return GENERIC_FAILURE;
    const code = /** @type {{code: unknown}} */ (value).code;
    if (isFailureCode(code)) return Object.freeze({ code, ...FAILURE_DEFINITIONS[code] });
    if (code === "QUALITY_GATE_FAILED" || code === "NO_CAPABILITY_HANDLER" || code === "WORKER_LEASE_EXPIRED") return Object.freeze({ code, ...STORED_ONLY_FAILURES[code] });
    return GENERIC_FAILURE;
  } catch { return GENERIC_FAILURE; }
}

/** @typedef {keyof typeof FAILURE_DEFINITIONS} WorkerFailureCode */
/** @typedef {Readonly<{ code: WorkerFailureCode | "WORKER_FAILED", message: string, retryable: boolean }>} StoredWorkerFailure */

/** @param {unknown} value @returns {value is WorkerFailureCode} */
function isFailureCode(value) {
  return typeof value === "string" && Object.hasOwn(FAILURE_DEFINITIONS, value);
}

class WorkerFailure extends Error {
  /** @param {WorkerFailureCode} code @param {unknown} options */
  constructor(code, options = {}) {
    if (!isFailureCode(code)) throw new Error("worker failure code is invalid");
    const definition = FAILURE_DEFINITIONS[code];
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => key !== "cause")) throw new TypeError("worker failure options are invalid");
    const cause = Object.hasOwn(options, "cause") && "cause" in options ? options.cause : undefined;
    super(definition.message, cause === undefined ? undefined : { cause });
    this.name = "WorkerFailure";
    /** @readonly */
    this.code = code;
    Object.defineProperty(this, "code", { writable: false, configurable: false });
  }
}

/** @param {unknown} error @returns {StoredWorkerFailure} */
function storedWorkerFailure(error) {
  if (!(error instanceof WorkerFailure) || !isFailureCode(error.code)) return GENERIC_FAILURE;
  const definition = FAILURE_DEFINITIONS[error.code];
  return Object.freeze({ code: error.code, message: definition.message, retryable: definition.retryable });
}

/**
 * Run one external stage without exposing provider messages to persisted failures.
 * Existing registered failures retain their established retry classification.
 * @template T
 * @param {WorkerFailureCode} code
 * @param {() => T | Promise<T>} operation
 * @returns {Promise<T>}
 */
async function runWorkerStage(code, operation) {
  if (!isFailureCode(code) || typeof operation !== "function") throw new TypeError("worker stage is invalid");
  const observer = stageObservers.getStore();
  const startedAt = Date.now();
  const monotonicStart = performance.now();
  /** @type {"succeeded" | "failed"} */
  let status = "succeeded";
  try { return await operation(); }
  catch (error) {
    status = "failed";
    if (error instanceof WorkerFailure && isFailureCode(error.code)) throw error;
    throw new WorkerFailure(code, { cause: error });
  } finally {
    if (observer) {
      const durationMs = Math.max(0, Math.min(86400000, performance.now() - monotonicStart));
      const event = Object.freeze({ code, status, startedAt, endedAt: startedAt + durationMs, durationMs });
      try { void Promise.resolve(observer(event)).catch(() => {}); }
      catch { /* Diagnostic transport failure must not change the stage outcome. */ }
    }
  }
}

module.exports = { WorkerFailure, storedWorkerFailure, readStoredWorkerFailure, runWorkerStage, withWorkerStageObserver, isFailureCode };
