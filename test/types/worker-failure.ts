import { WorkerFailure, storedWorkerFailure, readStoredWorkerFailure, runWorkerStage, withWorkerStageObserver } from "../../packages/team-runtime/worker-failure.js";

withWorkerStageObserver((event) => {
  const elapsed: number = event.durationMs;
  void elapsed;
  // @ts-expect-error diagnostic records cannot be mutated
  event.code = "IMAGE_OCR_FAILED";
  // @ts-expect-error records deliberately exclude original errors
  void event.cause;
}, () => null);

const result: Promise<number> = runWorkerStage("IMAGE_OCR_FAILED", async () => 1);
void result;
// @ts-expect-error stage identifiers must be registered
runWorkerStage("UNKNOWN", () => 1);
// @ts-expect-error result type must not be erased
const wrongResult: Promise<string> = runWorkerStage("IMAGE_BUILD_FAILED", () => 1);
void wrongResult;

const failure = new WorkerFailure("INPUT_NOT_READY", { cause: new Error("fixture") });
const stored: Readonly<{ code: string; message: string; retryable: boolean }> = storedWorkerFailure(failure);
storedWorkerFailure(null);
storedWorkerFailure({ arbitrary: "unknown external failure" });
void stored;

// Negative type assertions fail the gate if the public boundary becomes untyped.
// @ts-expect-error Unknown stage names must not enter production call sites.
new WorkerFailure("UNKNOWN_STAGE");
// @ts-expect-error Error codes cannot be mutated after construction.
failure.code = "IMAGE_DELIVERY_FAILED";
// @ts-expect-error The sanitized failure projection is immutable.
stored.retryable = true;

const historicFailure = readStoredWorkerFailure({ code: "IMAGE_OCR_FAILED", message: "untrusted" });
if (historicFailure) {
  const retryable: boolean = historicFailure.retryable;
  void retryable;
  // @ts-expect-error stored projections deliberately exclude arbitrary payloads
  void historicFailure.cause;
  // @ts-expect-error stored projections are immutable
  historicFailure.retryable = true;
}
