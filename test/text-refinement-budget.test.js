"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {refineRenderedTextOnce} = require("../packages/slideclone-core/text-refinement-coordinator");

function pngHeader(file, width, height) {
  const header = Buffer.alloc(24);
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]).copy(header);
  header.writeUInt32BE(13, 8); header.write("IHDR", 12); header.writeUInt32BE(width, 16); header.writeUInt32BE(height, 20);
  fs.writeFileSync(file, header);
}

function quality() {
  return {
    passed: false,
    checks: [{name: "quality-rendered", passed: true}, {name: "visual-fidelity", passed: false}],
    metrics: {"pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20}
  };
}

function request(root, sourceImages, renderedImages) {
  const deck = {slideSize: {widthPt: 960, heightPt: 540}, pages: sourceImages.map(() => ({textBoxes: []}))};
  const deckFile = path.join(root, "deck.json"), pptxFile = path.join(root, "deck.pptx");
  fs.writeFileSync(deckFile, JSON.stringify(deck)); fs.writeFileSync(pptxFile, "original");
  return {
    root, deck, deckFile, pptxFile, sourceImages, renderedImages, initialQuality: quality(),
    isCancellationRequested: async () => false,
    buildCandidate: async () => { throw new Error("candidate builder must not run"); },
    verifyCandidate: async () => { throw new Error("candidate verifier must not run"); }
  };
}

test("text refinement skips an admitted 16-page image pair set above its fixed pixel budget", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-refinement-budget-"));
  try {
    const sources = [], rendered = [];
    for (let index = 0; index < 16; index += 1) {
      const source = path.join(root, `source-${index}.png`), output = path.join(root, `rendered-${index}.png`);
      pngHeader(source, 2752, 1536); pngHeader(output, 2752, 1536); sources.push(source); rendered.push(output);
    }
    const input = request(root, sources, rendered);
    const result = await refineRenderedTextOnce(input);

    assert.equal(result.deck, input.deck); assert.equal(result.deckFile, input.deckFile); assert.equal(result.pptxFile, input.pptxFile);
    assert.equal(result.accepted, false); assert.equal(result.changedTextBoxes, 0); assert.equal(result.quality.passed, false);
    assert.equal(result.skippedPixelBudget, 16 * 2 * 2752 * 1536);
    assert.equal(result.quality.metrics["text-refinement-skipped-pixel-budget"], undefined);
    assert.equal(fs.readFileSync(input.pptxFile, "utf8"), "original");
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});

test("text refinement still rejects invalid image geometry before budget skipping", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-refinement-geometry-"));
  try {
    const source = path.join(root, "source.png"), rendered = path.join(root, "rendered.png");
    pngHeader(source, 0, 1536); pngHeader(rendered, 2752, 1536);
    await assert.rejects(refineRenderedTextOnce(request(root, [source], [rendered])), /dimensions exceed/u);
  } finally { fs.rmSync(root, {recursive: true, force: true}); }
});
