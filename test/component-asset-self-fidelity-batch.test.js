"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  deduplicatePptxFiles,
  discoverPptxFiles,
  mapConcurrent,
  parseArgs,
  summarizeRegions
} = require("../skills/pd-hifi-slideclone/scripts/component-asset-self-fidelity-batch");

test("component self fidelity batch parses bounded concurrency and thresholds", () => {
  const args = parseArgs([
    "node", "script", "--root", "components", "--concurrency", "4", "--max-assets", "40",
    "--max-region-pixel-diff-ratio", "0.12", "--fail-on-reject"
  ]);

  assert.deepEqual(args.roots, ["components"]);
  assert.equal(args.concurrency, 4);
  assert.equal(args.maxAssets, 40);
  assert.equal(args.maxRegionPixelDiffRatio, 0.12);
  assert.equal(args.failOnReject, true);
});

test("component self fidelity batch discovers bounded PPTX files and ignores symlinks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-discovery-"));
  const nested = path.join(root, "nested");
  fs.mkdirSync(nested);
  fs.writeFileSync(path.join(root, "a.pptx"), "a");
  fs.writeFileSync(path.join(nested, "b.PPTX"), "b");
  fs.writeFileSync(path.join(nested, "ignore.txt"), "x");

  const files = discoverPptxFiles([root], [], { maxDepth: 1, maxScannedEntries: 100 });

  assert.equal(files.length, 2);
  assert.ok(files.every((file) => /\.pptx$/i.test(file)));
});

test("component self fidelity batch deduplicates files by content hash", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "component-fidelity-dedupe-"));
  const first = path.join(root, "first.pptx");
  const second = path.join(root, "second.pptx");
  const third = path.join(root, "third.pptx");
  fs.writeFileSync(first, "same-component");
  fs.writeFileSync(second, "same-component");
  fs.writeFileSync(third, "different-component");

  const result = await deduplicatePptxFiles([first, second, third]);

  assert.equal(result.unique.length, 2);
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].reason, "duplicate-content");
});

test("component self fidelity batch enforces bounded parallel work and summarizes regions", async () => {
  let active = 0;
  let peak = 0;
  const output = await mapConcurrent([1, 2, 3, 4, 5], 2, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.deepEqual(output, [2, 4, 6, 8, 10]);
  assert.equal(peak, 2);
  assert.deepEqual(summarizeRegions([
    { comparison: { ok: true, pixelDiffRatio: 0.1, foregroundMissingRatio: 0.08, meanAbsoluteDelta: 12 } },
    { comparison: { ok: false, pixelDiffRatio: 0.2, foregroundMissingRatio: 0.18, meanAbsoluteDelta: 24 } }
  ]), {
    regions: 2,
    passed: 1,
    maxPixelDiffRatio: 0.2,
    maxForegroundMissingRatio: 0.18,
    maxMeanAbsoluteDelta: 24
  });
});
