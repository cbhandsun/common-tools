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

test("quality verification exposes rendered pages only to its optional internal collector", async (t) => {
  const files = fixture(); t.after(() => fs.rmSync(files.root, { recursive: true, force: true }));
  let pages;
  const verify = verifier({ pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 2 });
  const result = await verify({ ...files, collectRenderedPages: captured => { pages = captured; } });
  assert.deepEqual(pages, [path.join(files.root, "quality-render", "page-1.png")]);
  assert.equal(Object.isFrozen(pages), true);
  assert.equal(result.passed, true);
  assert.equal(JSON.stringify(result).includes(files.root), false);
  await assert.rejects(verify({ ...files, collectRenderedPages: {} }), /collector is invalid/u);
});

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
    const pixelRegression = await verifier({ pixelDiffRatio: 0.085, foregroundMissingRatio: 0.11, meanAbsoluteDelta: 11 })({ ...files, isCancellationRequested: async () => false });
    assert.equal(pixelRegression.passed, false);
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

test("raw image visual quality compares every batch page and reports worst-case metrics", async () => {
  const files = fixture(); const second = path.join(files.root, "source-2.png"); fs.writeFileSync(second, "png2");
  const compared = [];
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }, { image: path.join(context.outputDir, "page-2.png") }] } }),
    comparePageFiles: ({ pageIndex, sourceImage }) => { compared.push([pageIndex, path.basename(sourceImage)]); return { ok: true, pixelDiffRatio: pageIndex ? 0.1 : 0.02, foregroundMissingRatio: 0.01, meanAbsoluteDelta: 3 }; }
  });
  try {
    const result = await verify({ root: files.root, pptxFile: files.pptxFile, sourceImages: [files.sourceImage, second], isCancellationRequested: async () => false });
    assert.deepEqual(compared, [[0, "source.png"], [1, "source-2.png"]]);
    assert.equal(result.passed, false); assert.equal(result.metrics["pixel-diff-ratio"], 0.1); assert.equal(result.metrics["quality-pages-compared"], 2);
  } finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});

test("raw image visual quality forwards bounded component regions and reports their worst diagnostics", async () => {
  const files = fixture(); let received;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => ({ ok: true, data: { renderedPages: [{ image: path.join(context.outputDir, "page-1.png") }] } }),
    comparePageFiles: (input) => { received = input.options.componentRegions; return { ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 2, componentQuality: { audited: 2, evaluated: 1, attentionCount: 1, worstSeverity: 1.25, worstPixelDiffRatio: 0.3, worstForegroundMissingRatio: 0.4 } }; },
  });
  try {
    const deck = { slideSize: { widthPt: 100, heightPt: 50 }, pages: [{ textBoxes: [{ id: "title", box: { x: 1, y: 1, w: 20, h: 5 } }], shapes: [{ id: "node", box: { x: 30, y: 10, w: 20, h: 20 } }] }] };
    const result = await verify({ ...files, deck, isCancellationRequested: async () => false });
    assert.deepEqual(received.map((item) => item.id), ["title", "node"]);
    assert.equal(result.metrics["component-regions-audited"], 2);
    assert.equal(result.metrics["component-regions-evaluated"], 1);
    assert.equal(result.metrics["component-regions-attention"], 1);
    assert.equal(result.metrics["worst-component-normalized-severity"], 1.25);
    assert.equal(result.metrics["worst-component-foreground-missing-ratio"], 0.4);
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


test("quality forwards live cancellation into the renderer", async () => {
  const files = fixture();
  const check = async () => false;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async (_input, context) => {
      assert.equal(context.isCancellationRequested, check);
      throw new Error("editable job was cancelled");
    },
    comparePageFiles: () => { throw new Error("must not compare after cancellation"); }
  });
  try { await assert.rejects(verify({ ...files, isCancellationRequested: check }), /cancelled/); }
  finally { fs.rmSync(files.root, { recursive: true, force: true }); }
});
