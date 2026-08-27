"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { deriveComponentRegions, parseArgs, projectBox } = require("../skills/pd-hifi-slideclone/scripts/component-asset-self-fidelity");

test("component self fidelity parses bounded thresholds", () => {
  const args = parseArgs([
    "node", "script", "--pptx", "fixture.pptx", "--out", "runs/fixture",
    "--max-pixel-diff-ratio", "0.2", "--max-foreground-missing-ratio", "0.3",
    "--max-mean-delta", "42", "--fail-on-threshold"
  ]);
  assert.equal(args.pptx, "fixture.pptx");
  assert.equal(args.maxPixelDiffRatio, 0.2);
  assert.equal(args.maxForegroundMissingRatio, 0.3);
  assert.equal(args.maxMeanDelta, 42);
  assert.equal(args.failOnThreshold, true);
  assert.throws(() => parseArgs(["node", "script", "--unknown"]), /Unknown/);
});

test("component self fidelity projects bounded slide regions to raster pixels", () => {
  assert.deepEqual(projectBox(
    { x: 96, y: 54, w: 480, h: 270 },
    { widthPt: 960, heightPt: 540 },
    { width: 1920, height: 1080 }
  ), { x: 188, y: 104, w: 968, h: 548 });
});

test("component self fidelity derives per-card regions from learned gradient cards", () => {
  const children = [];
  for (const x of [0.2, 0.73]) {
    for (const y of [0, 0.36, 0.72]) {
      children.push({ kind: "shape", box: { x, y, w: 0.26, h: 0.28 }, style: { gradient: { type: "linear", stops: [{}, {}] } } });
    }
  }

  const regions = deriveComponentRegions({ replayChildLayout: { children } }, { width: 1200, height: 600 });

  assert.equal(regions.length, 6);
  assert.deepEqual(regions.map((region) => region.id), [
    "region-r1-c1", "region-r1-c2", "region-r2-c1",
    "region-r2-c2", "region-r3-c1", "region-r3-c2"
  ]);
  assert.ok(regions.every((region) => region.box.w > 0 && region.box.h > 0));
});
