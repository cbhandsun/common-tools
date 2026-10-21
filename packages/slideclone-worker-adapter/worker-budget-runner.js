// @ts-check
"use strict";

const { AsyncLocalStorage } = require("node:async_hooks");
const { WorkerFailure, runWorkerStage: runStage } = require("../team-runtime/worker-failure");
const { createWorkerExecutionBudget } = require("./worker-execution-budget");
const { createWorkerDiagnosticCandidate } = require("./worker-diagnostic-candidate");
const { createCandidateDecisionJournal } = require("./candidate-decision-journal");
const { isSceneInventoryCapacityError } = require("../slideclone-core/source-scene-capacity");
/** @typedef {ReturnType<typeof createWorkerExecutionBudget>} Budget */
/** @typedef {ReturnType<typeof createWorkerDiagnosticCandidate>} Diagnostic */
/** @type {AsyncLocalStorage<{budget: Budget, diagnostic: Diagnostic, journal: ReturnType<typeof createCandidateDecisionJournal>}>} */
const executions = new AsyncLocalStorage();

/** @template T @param {import("../team-runtime/worker-failure").WorkerFailureCode} code
 * @param {() => T | Promise<T>} operation @returns {Promise<T>} */
function runWorkerStage(code, operation) {
  const execution = executions.getStore();
  return runStage(code, async () => {
    try { return await (execution ? execution.budget.run(operation) : operation()); }
    catch (error) {
      if (code === "IMAGE_REBUILD_FAILED" && isSceneInventoryCapacityError(error))
        throw new WorkerFailure("IMAGE_SCENE_CAPACITY_CONFLICT", { cause: error });
      throw error;
    }
  });
}
/** @param {number} timeoutMs */
function remainingWorkerTimeout(timeoutMs) {
  return executions.getStore()?.budget.processTimeout(timeoutMs) ?? timeoutMs;
}
/** @template T @param {(request: T) => unknown | Promise<unknown>} verify */
function budgetedQualityVerifier(verify) {
  return async (/** @type {T} */ request) => {
    const execution = executions.getStore();
    const started = performance.now();
    const quality = execution ? await execution.budget.run(() => verify(request)) : await verify(request);
    execution?.diagnostic.remember(request, quality);
    execution?.journal.remember(request, quality, performance.now() - started);
    return quality;
  };
}
/** @template T @param {(input: {job: unknown, isCancellationRequested: () => Promise<boolean>}) => Promise<T>} handler
 * @param {{timeoutMs: number, temporaryRoot: string}} settings */
function createBudgetedWorkerHandler(handler, settings) {
  if (typeof handler !== "function") throw new TypeError("budgeted worker handler is invalid");
  return async (/** @type {{job: unknown, isCancellationRequested: () => unknown | Promise<unknown>}} */ input) => {
    const budget = createWorkerExecutionBudget({ timeoutMs: settings.timeoutMs, isCancellationRequested: input?.isCancellationRequested });
    const diagnostic = createWorkerDiagnosticCandidate(settings.temporaryRoot);
    const journal = createCandidateDecisionJournal(settings.temporaryRoot);
    let retained = false;
    try {
      return await executions.run({ budget, diagnostic, journal }, async () => {
        await budget.assertActive();
        const result = await handler({ job: input.job, isCancellationRequested: budget.isCancellationRequested });
        await budget.assertActive();
        return result;
      });
    } catch (error) {
      const snapshot = budget.snapshot();
      if (!snapshot.timedOut) throw error;
      const failure = error instanceof WorkerFailure ? error : new WorkerFailure("IMAGE_QUALITY_FAILED", { cause: error });
      const candidate = diagnostic.retain(snapshot);
      retained = candidate !== null;
      Object.defineProperty(failure, "executionBudget", { value: Object.freeze({ ...snapshot, diagnosticCandidate: candidate }), enumerable: false });
      throw failure;
    } finally { if (!retained) diagnostic.close(); }
  };
}

/** @param {unknown} input */
function recordWorkerCandidateDecision(input) { executions.getStore()?.journal.decide(input); }
/** @param {unknown} input */
function recordWorkerSearchDecision(input) { executions.getStore()?.journal.search(input); }
module.exports = { createBudgetedWorkerHandler, budgetedQualityVerifier, remainingWorkerTimeout, runWorkerStage, recordWorkerCandidateDecision, recordWorkerSearchDecision };
