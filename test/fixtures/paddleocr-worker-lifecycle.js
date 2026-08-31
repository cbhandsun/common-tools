"use strict";

const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const path = require("node:path");
const children = [];
const originalSpawn = childProcess.spawn;
childProcess.spawn = (...args) => {
  const child = originalSpawn(...args);
  children.push(child);
  return child;
};
const adapter = require("../../skills/pd-hifi-slideclone/scripts/adapters/ocr-paddleocr-local");
childProcess.spawn = originalSpawn;
const skillRoot = path.resolve(__dirname, "../../skills/pd-hifi-slideclone");
const input = { sourceImage: path.join(skillRoot, "examples/ocr-text-smoke.source.png"), pageIndex: 0 };
const context = (lang) => ({ skillRoot, config: { paddleOcr: {
  pythonBin: process.execPath, workerScript: path.join(__dirname, "fake-paddleocr-worker.js"),
  lang, cache: false, idleTimeoutMs: 1000, initTimeoutMs: 5000, timeoutMs: 5000
} } });

async function main() {
  try {
    await assert.rejects(() => adapter(input, context("protocol-noise")), /returned invalid output/);
    await adapter._private.runLocalRaw(input, context("ch"));
    // The failed engine's old idle timer must not clear a replacement engine.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await adapter._private.runLocalRaw(input, context("ch"));
    if (children.length !== 2) process.stderr.write(`worker-start-count:${children.length}\n`);
    assert.equal(children.length, 2, "recovery must reuse one replacement worker without orphaning it");
    process.stdout.write("worker-lifecycle-passed\n");
  } finally {
    adapter.closeActiveEngine();
    await Promise.all(children.map((child) => new Promise((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once("exit", resolve);
      child.kill();
    })));
  }
}

main().catch(() => { process.stderr.write("worker-lifecycle-failed\n"); process.exitCode = 1; });
