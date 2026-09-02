"use strict";

const FAILURE_DEFINITIONS = Object.freeze({
  IMAGE_ASSET_NAMESPACE_FAILED: Object.freeze({ message: "image asset namespace processing failed", retryable: false }),
  IMAGE_DELIVERY_FAILED: Object.freeze({ message: "image delivery artifact processing failed", retryable: false })
});
const GENERIC_FAILURE = Object.freeze({ code: "WORKER_FAILED", message: "capability worker failed", retryable: false });

class WorkerFailure extends Error {
  constructor(code, options = {}) {
    const definition = FAILURE_DEFINITIONS[code];
    if (!definition) throw new Error("worker failure code is invalid");
    if (!options || typeof options !== "object" || Array.isArray(options) || Object.keys(options).some((key) => key !== "cause")) throw new TypeError("worker failure options are invalid");
    super(definition.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "WorkerFailure";
    this.code = code;
  }
}

function storedWorkerFailure(error) {
  if (!(error instanceof WorkerFailure)) return GENERIC_FAILURE;
  const definition = FAILURE_DEFINITIONS[error.code];
  return Object.freeze({ code: error.code, message: definition.message, retryable: definition.retryable });
}

module.exports = { WorkerFailure, storedWorkerFailure };
