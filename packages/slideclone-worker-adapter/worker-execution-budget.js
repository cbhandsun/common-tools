// @ts-check
"use strict";

const { performance } = require("node:perf_hooks");
const { types } = require("node:util");

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !types.isProxy(value) && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(item => "value" in item);
}

class WorkerExecutionTimeout extends Error {
  constructor() {
    super("editable job was cancelled: execution budget exhausted");
    this.name = "WorkerExecutionTimeout";
    this.code = "IMAGE_EXECUTION_BUDGET_EXHAUSTED";
  }
}

/** One monotonic deadline per invocation, including cancellation-provider latency.
 * @param {unknown} input */
function createWorkerExecutionBudget(input) {
  if (!record(input) || typeof input.timeoutMs !== "number" || !Number.isSafeInteger(input.timeoutMs)
    || input.timeoutMs < 1 || input.timeoutMs > 540000 || typeof input.isCancellationRequested !== "function"
    || (input.now !== undefined && typeof input.now !== "function")) throw new TypeError("worker execution budget is invalid");
  const timeoutMs = input.timeoutMs;
  const provider = /** @type {() => unknown | Promise<unknown>} */ (input.isCancellationRequested);
  const clock = /** @type {() => unknown} */ (input.now ?? (() => performance.now()));
  let previous = 0;
  const now = () => {
    const value = clock();
    if (typeof value !== "number" || !Number.isFinite(value) || value < previous || value > Number.MAX_SAFE_INTEGER)
      throw new TypeError("worker execution clock is invalid");
    previous = value;
    return value;
  };
  const startedAt = now();
  /** @type {"active" | "cancelled" | "timed-out"} */
  let state = "active";
  /** @type {Promise<boolean> | null} */
  let pending = null;
  const remainingMs = () => {
    const remaining = Math.max(0, timeoutMs - (now() - startedAt));
    if (remaining === 0 && state === "active") state = "timed-out";
    return remaining;
  };
  const failure = () => state === "timed-out" ? new WorkerExecutionTimeout() : new Error("editable job was cancelled");
  const isCancellationRequested = async () => {
    const remaining = remainingMs();
    if (state !== "active") return true;
    if (pending) return pending;
    pending = (async () => {
      /** @type {NodeJS.Timeout | undefined} */ let timer;
      try {
        const value = await Promise.race([
          Promise.resolve().then(provider),
          new Promise(resolve => { timer = setTimeout(() => { state = "timed-out"; resolve(true); }, Math.ceil(remaining)); })
        ]);
        remainingMs();
        if (state === "active" && value !== false) state = "cancelled";
      } catch {
        remainingMs();
        if (state === "active") state = "cancelled";
      } finally { clearTimeout(timer); }
      return state !== "active";
    })();
    try { return await pending; }
    finally { pending = null; }
  };
  const assertActive = async () => { if (await isCancellationRequested()) throw failure(); };
  return Object.freeze({
    isCancellationRequested,
    assertActive,
    remainingMs,
    /** @param {number} limit */
    processTimeout(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 540000) throw new TypeError("worker process budget is invalid");
      const remaining = remainingMs();
      if (state !== "active") throw failure();
      return Math.max(1, Math.ceil(Math.min(limit, remaining)));
    },
    /** @template T @param {() => T | Promise<T>} operation @returns {Promise<T>} */
    async run(operation) {
      if (typeof operation !== "function") throw new TypeError("worker budget operation is invalid");
      await assertActive();
      let result;
      // Await cooperative adapters through termination, so scratch cleanup cannot race a live renderer.
      try { result = await operation(); }
      catch (error) { remainingMs(); if (state !== "active") throw failure(); throw error; }
      remainingMs();
      if (state !== "active") throw failure();
      return result;
    },
    snapshot() {
      const remaining = remainingMs();
      return Object.freeze({ timeoutMs, elapsedMs: Math.max(0, now() - startedAt), remainingMs: remaining, timedOut: state === "timed-out" });
    }
  });
}

module.exports = { createWorkerExecutionBudget, WorkerExecutionTimeout };
