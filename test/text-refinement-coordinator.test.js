"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { refineRenderedTextOnce } = require("../packages/slideclone-core/text-refinement-coordinator");
const { writePng } = require("../packages/slideclone-core/png");

function quality(passed, metrics = { "pixel-diff-ratio": 0.2, "foreground-missing-ratio": 0.2, "mean-absolute-delta": 20 }) {
  return { passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }], metrics };
}

function textBox() {
  return { id: "body", text: "Editable body", box: { x: 10, y: 20, w: 30, h: 15 }, font: { color: "#141e28", family: "Arial", sizePt: 16, align: "left", valign: "middle" }, style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95 } };
}

function png(file, ink) {
  const width = 100, height = 100, rgba = Buffer.alloc(width * height * 4, 255);
  if (ink) for (let y = ink.y; y < ink.y + ink.h; y += 1) for (let x = ink.x; x < ink.x + ink.w; x += 1) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
  writePng(file, { width, height, rgba });
}

function fixture({ sourceInk = { x: 12, y: 22, w: 20, h: 9 }, renderedInk = { x: 12, y: 22, w: 16, h: 7 } } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-refinement-"));
  const deckFile = path.join(root, "deck.json"), pptxFile = path.join(root, "deck.pptx");
  const source = path.join(root, "source.png"), rendered = path.join(root, "rendered.png");
  const deck = { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ textBoxes: [textBox()], retained: { marker: true } }], retained: { marker: true } };
  fs.writeFileSync(deckFile, `${JSON.stringify(deck)}\n`); fs.writeFileSync(pptxFile, "original");
  png(source, sourceInk); png(rendered, renderedInk);
  return { root, deckFile, pptxFile, source, rendered, deck };
}

function request(value, overrides = {}) {
  return {
    root: value.root, deckFile: value.deckFile, pptxFile: value.pptxFile, deck: value.deck, sourceImages: [value.source], renderedImages: [value.rendered], initialQuality: quality(false),
    isCancellationRequested: async () => false,
    buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "candidate"); },
    verifyCandidate: async () => quality(true, { "pixel-diff-ratio": 0.1, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 }),
    ...overrides
  };
}

function cleanup(root) { fs.rmSync(root, { recursive: true, force: true }); }
function candidates(root) { return fs.readdirSync(root).filter((name) => name.startsWith("text-refinement-")); }

test("accepts one measured text refinement only after all visual metrics strictly improve", async () => {
  const value = fixture();
  try {
    const original = structuredClone(value.deck);
    const result = await refineRenderedTextOnce(request(value));
    assert.equal(result.accepted, true); assert.equal(result.changedTextBoxes, 1);
    assert.notEqual(result.deck, value.deck); assert.notEqual(result.deck.pages[0], value.deck.pages[0]);
    assert.equal(result.deck.pages[0].retained, value.deck.pages[0].retained);
    assert.equal(result.deck.pages[0].textBoxes[0].font.sizePt > 16, true);
    assert.deepEqual(value.deck, original);
    assert.equal(fs.existsSync(result.deckFile), true); assert.equal(fs.existsSync(result.pptxFile), true);
  } finally { cleanup(value.root); }
});

test("skips an already passing baseline without building or verifying another candidate", async () => {
  const value = fixture();
  try {
    let built = 0, verified = 0;
    const initialQuality = quality(true, { "pixel-diff-ratio": 0.01, "foreground-missing-ratio": 0.01, "mean-absolute-delta": 1 });
    const result = await refineRenderedTextOnce(request(value, { initialQuality, buildCandidate: async () => { built += 1; }, verifyCandidate: async () => { verified += 1; return initialQuality; } }));
    assert.deepEqual(result, { deck: value.deck, deckFile: value.deckFile, pptxFile: value.pptxFile, quality: initialQuality, accepted: false, changedTextBoxes: 0, skippedPixelBudget: 0 });
    assert.equal(built, 0); assert.equal(verified, 0);
  } finally { cleanup(value.root); }
});

test("does not write or build when raster evidence yields no text adjustment", async () => {
  const value = fixture({ sourceInk: null, renderedInk: null });
  try {
    let built = 0;
    const result = await refineRenderedTextOnce(request(value, { buildCandidate: async () => { built += 1; } }));
    assert.equal(result.accepted, false); assert.equal(result.changedTextBoxes, 0); assert.equal(built, 0); assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("rejects a candidate that worsens visual quality and removes only its candidate artifacts", async () => {
  const value = fixture();
  try {
    const result = await refineRenderedTextOnce(request(value, { verifyCandidate: async () => quality(true, { "pixel-diff-ratio": 0.21, "foreground-missing-ratio": 0.1, "mean-absolute-delta": 10 }) }));
    assert.equal(result.accepted, false); assert.equal(result.deck, value.deck); assert.equal(result.pptxFile, value.pptxFile);
    assert.equal(result.changedTextBoxes, 1);
    assert.deepEqual(candidates(value.root), []); assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("rejects malformed initial visual evidence before candidate work", async () => {
  const value = fixture();
  try {
    const invalid = { passed: false, checks: [{ name: "quality-rendered", passed: false }], metrics: {} };
    await assert.rejects(refineRenderedTextOnce(request(value, { initialQuality: invalid })), /initial quality is invalid/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("cleans partial candidate files after a builder failure", async () => {
  const value = fixture();
  try {
    await assert.rejects(refineRenderedTextOnce(request(value, { buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "partial"); throw new Error("build failed"); } })), /build failed/);
    assert.deepEqual(candidates(value.root), []); assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("cleans the reserved candidate after cancellation immediately after build", async () => {
  const value = fixture();
  try {
    let built = false;
    await assert.rejects(refineRenderedTextOnce(request(value, {
      buildCandidate: async ({ pptxFile }) => { fs.writeFileSync(pptxFile, "candidate"); built = true; },
      isCancellationRequested: async () => built
    })), /cancelled/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});

test("rejects traversal and symbolic-link image inputs before decoding", async () => {
  const value = fixture();
  const outside = path.join(path.dirname(value.root), `outside-${crypto.randomUUID()}.png`);
  png(outside, { x: 1, y: 1, w: 8, h: 8 });
  try {
    await assert.rejects(refineRenderedTextOnce(request(value, { sourceImages: [outside] })), /outside the root/);
    const link = path.join(value.root, "linked.png");
    fs.symlinkSync(value.source, link, "file");
    await assert.rejects(refineRenderedTextOnce(request(value, { sourceImages: [link] })), /source image is invalid/);
  } finally { fs.rmSync(outside, { force: true }); cleanup(value.root); }
});

test("preserves a preexisting UUID-collision target instead of clobbering it", async () => {
  const value = fixture();
  const original = crypto.randomUUID;
  crypto.randomUUID = () => "known-collision";
  const collision = path.join(value.root, "text-refinement-known-collision.pptx");
  try {
    fs.writeFileSync(collision, "do-not-touch");
    await assert.rejects(refineRenderedTextOnce(request(value)), /EEXIST/);
    assert.equal(fs.readFileSync(collision, "utf8"), "do-not-touch");
  } finally { crypto.randomUUID = original; cleanup(value.root); }
});

test("invalid candidate reports and verifier failures propagate after candidate cleanup", async () => {
  const value = fixture();
  try {
    const inconsistent = quality(true); inconsistent.checks[1].passed = false;
    await assert.rejects(refineRenderedTextOnce(request(value, { verifyCandidate: async () => inconsistent })), /candidate quality is invalid/);
    assert.deepEqual(candidates(value.root), []);
    await assert.rejects(refineRenderedTextOnce(request(value, { verifyCandidate: async () => { throw new Error("verification failed"); } })), /verification failed/);
    assert.deepEqual(candidates(value.root), []);
    assert.equal(fs.readFileSync(value.pptxFile, "utf8"), "original");
  } finally { cleanup(value.root); }
});

test("empty, excessive and mismatched page sets fail before building", async () => {
  const value = fixture();
  try {
    for (const pages of [[], Array(21).fill(value.deck.pages[0]), [{ textBoxes: Array(2001).fill(null) }]]) {
      await assert.rejects(refineRenderedTextOnce(request(value, { deck: { ...value.deck, pages } })), /deck page/);
    }
    await assert.rejects(refineRenderedTextOnce(request(value, { renderedImages: [value.rendered, value.rendered] })), /page counts/);
    assert.deepEqual(candidates(value.root), []);
  } finally { cleanup(value.root); }
});
