"use strict";

function waitForWorkersToClose(engines, timeoutMs = 5000) {
  if (!Array.isArray(engines) || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 10000) {
    throw new TypeError("PaddleOCR shutdown bounds are invalid");
  }
  return Promise.allSettled(engines.map((engine) => new Promise((resolve, reject) => {
    const child = engine.child;
    let timer;
    const finish = (error) => {
      clearTimeout(timer);
      child.off("close", onClose);
      if (error) reject(error);
      else resolve();
    };
    const onClose = () => finish();
    child.once("close", onClose);
    timer = setTimeout(() => finish(new Error("PaddleOCR worker shutdown timed out")), timeoutMs);
    try {
      engine.close();
      if (child.exitCode !== null || child.signalCode != null) finish();
    } catch {
      finish(new Error("PaddleOCR worker shutdown failed"));
    }
  }))).then((results) => {
    const errors = results.filter((result) => result.status === "rejected").map((result) => result.reason);
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "PaddleOCR workers failed to shut down");
  });
}

module.exports = { waitForWorkersToClose };
