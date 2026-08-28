"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { createRawImageRenderQualityVerifier } = require("../packages/slideclone-core/team-render-quality");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-image-quality-"));
  const pptxFile = path.join(root, "deck.pptx");
  const sourceImage = path.join(root, "source.png");
  fs.writeFileSync(pptxFile, "pptx");
  fs.writeFileSync(sourceImage, "png");
  return { root, pptxFile, sourceImage };
}
function verifier(metric, renderPresentation = async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } })) {
  return createRawImageRenderQualityVerifier({ renderPresentation, comparePageFiles: () => ({ ok: true, ...metric }) });
}

test("raw image visual quality passes only within every bounded render threshold", async () => {
  const files = fixture();
  try {
    const passing = await verifier({ pixelDiffRatio: 0.08, foregroundMissingRatio: 0.11, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(passing.passed, true);
    assert.deepEqual(passing.checks, [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }]);
    assert.equal(passing.metrics["foreground-missing-ratio"], 0.11);
    const failing = await verifier({ pixelDiffRatio: 0.08, foregroundMissingRatio: 0.13, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(failing.passed, false);
    assert.equal(failing.checks[1].passed, false);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality fails closed for renderer failure without exposing its message", async () => {
  const files = fixture();
  try {
    const result = await verifier({}, async () => { throw new Error("secret renderer output"); })({ ...files, isCancellationRequested: async () => false });
    assert.deepEqual(result.checks, [{ name: "quality-rendered", passed: false }]);
    assert.equal(JSON.stringify(result).includes("secret renderer output"), false);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality rejects invalid boundaries and preserves cancellation", async () => {
  assert.throws(() => createRawImageRenderQualityVerifier({ renderPresentation: async () => ({}), comparePageFiles: () => ({}), thresholds: { maximumPixelDiffRatio: 2 } }), /threshold/);
  const files = fixture();
  try {
    const verify = verifier({ pixelDiffRatio: 0, foregroundMissingRatio: 0, meanAbsoluteDelta: 0 });
    await assert.rejects(() => verify({ ...files, sourceImage: path.join(files.root, "..", "outside.png") }), /request/);
    await assert.rejects(() => verify({ ...files, isCancellationRequested: async () => true }), /cancelled/);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});
