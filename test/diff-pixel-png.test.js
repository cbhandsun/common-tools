"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  compareImages,
  resolveDiffConcurrency
} = require("../skills/pd-hifi-slideclone/scripts/adapters/diff-pixel-png");

test("pixel diff concurrency is bounded and can be forced to serial", () => {
  assert.equal(resolveDiffConcurrency(11, { SLIDECLONE_DIFF_CONCURRENCY: "1" }), 1);
  assert.equal(resolveDiffConcurrency(2, { SLIDECLONE_DIFF_CONCURRENCY: "8" }), 2);
  assert.ok(resolveDiffConcurrency(20, {}) >= 1);
  assert.ok(resolveDiffConcurrency(20, {}) <= 4);
});

test("parallel pixel diff preserves exact comparison semantics", () => {
  const source = { width: 1, height: 1, rgba: Buffer.from([0, 0, 0, 255]) };
  const generated = { width: 1, height: 1, rgba: Buffer.from([255, 255, 255, 255]) };
  const metric = compareImages(0, source, generated, {
    threshold: 24,
    foregroundTolerancePx: 0,
    foregroundToleranceDelta: 54
  }, "render.png", require("node:path").join(require("node:os").tmpdir(), `slideclone-diff-${process.pid}.png`));
  assert.equal(metric.pixelDiffRatio, 1);
  assert.equal(metric.foregroundMissingRatio, 1);
});
