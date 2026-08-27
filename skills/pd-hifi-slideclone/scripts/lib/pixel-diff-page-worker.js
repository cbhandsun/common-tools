"use strict";

const { parentPort, workerData } = require("worker_threads");
const { comparePageFiles } = require("../adapters/diff-pixel-png");

try {
  parentPort.postMessage({ ok: true, metric: comparePageFiles(workerData) });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.stack || error.message });
}
