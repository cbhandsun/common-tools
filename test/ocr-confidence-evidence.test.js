"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { ocrLineRevision } = require("../packages/slideclone-core/ocr-line-consensus");
const { admitOcrConfidenceEvidence } = require("../packages/slideclone-core/ocr-confidence-evidence");
const { admitOcrResult } = require("../packages/slideclone-core/ocr-result-admission");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr-source-deck");
function fixture() {
  const original = { text: "GraphGraph", confidence: 0.89, box: { x: 40, y: 50, w: 100, h: 20 } };
  const dimensions = { widthPx: 300, heightPx: 180 }, line = { ...original, confidence: 0.939 };
  const evidence = { operation: "same-text-confidence", sourceHash: "a".repeat(64), revision: ocrLineRevision(original),
    originalConfidence: original.confidence, provider: "test-ocr", crops: [8, 16].map((padding, index) => ({
      hash: String(index + 1).repeat(64), confidence: index === 0 ? 0.99 : 0.939,
      box: { x: 40 - padding, y: 50 - padding, w: 100 + padding * 2, h: 20 + padding * 2 } })) };
  return { original, line, evidence, dimensions };
}
test("same-text evidence snapshots raw confidence and survives OCR admission and native IR projection", () => {
  const f = fixture(), before = structuredClone(f);
  const evidence = admitOcrConfidenceEvidence(f.evidence, f.line, f.dimensions);
  assert.deepEqual(evidence, f.evidence); assert.notEqual(evidence.crops, f.evidence.crops);
  const ocr = admitOcrResult({ lines: [{ ...f.line, confidenceEvidence: f.evidence }] }, f.dimensions);
  const deck = boundedOcrSourceDeck({ metadata: { dimensions: f.dimensions }, ocr, sourceImage: "assets/source.png" });
  const text = deck.pages[0].textBoxes[0];
  assert.equal(text.text, f.original.text); assert.equal(text.source.confidence, 0.939);
  assert.equal(text.source.ocrOriginalConfidence, 0.89);
  assert.deepEqual(text.source.ocrConfidenceEvidence, f.evidence); assert.deepEqual(f, before);
  f.evidence.crops[0].box.x = 0;
  assert.equal(text.source.ocrConfidenceEvidence.crops[0].box.x, 32);
  assert.equal(admitOcrConfidenceEvidence(undefined, f.line, f.dimensions), undefined);
});
test("same-text evidence rejects stale text, geometry, confidence, incomplete and duplicate observations", () => {
  for (const mode of ["text", "box", "original", "source-hash", "revision", "weak", "confidence", "same-hash", "same-box", "outside", "partial", "sparse", "oversized", "provider", "operation"]) {
    const f = fixture();
    if (mode === "text") f.line.text = "Graph";
    if (mode === "box") f.line.box.x++;
    if (mode === "original") f.evidence.originalConfidence = 0.88;
    if (mode === "source-hash") f.evidence.sourceHash = "invalid";
    if (mode === "revision") f.evidence.revision = "b".repeat(64);
    if (mode === "weak") f.evidence.crops[1].confidence = 0.899;
    if (mode === "confidence") f.line.confidence = 0.99;
    if (mode === "same-hash") f.evidence.crops[1].hash = f.evidence.crops[0].hash;
    if (mode === "same-box") f.evidence.crops[1].box = { ...f.evidence.crops[0].box };
    if (mode === "outside") f.evidence.crops[0].box.w = 400;
    if (mode === "partial") f.evidence.crops[0].box.x = 45;
    if (mode === "sparse") f.evidence.crops = new Array(2);
    if (mode === "oversized") f.evidence.crops.push(f.evidence.crops[0]);
    if (mode === "provider") f.evidence.provider = "bad\nprovider";
    if (mode === "operation") f.evidence.operation = "change-text";
    assert.throws(() => admitOcrConfidenceEvidence(f.evidence, f.line, f.dimensions), TypeError, mode);
  }
});
test("evidence accessors, inherited fields and proxies cannot execute user code", () => {
  const f = fixture(); let invoked = false;
  const getter = { ...f.evidence, get sourceHash() { invoked = true; return "a".repeat(64); } };
  const inherited = Object.create({ get operation() { invoked = true; return "same-text-confidence"; } });
  const nested = structuredClone(f.evidence);
  Object.defineProperty(nested.crops[0].box, "x", { get() { invoked = true; return 32; } });
  const array = { ...f.evidence, crops: new Array(2) };
  Object.defineProperty(array.crops, "0", { get() { invoked = true; return f.evidence.crops[0]; } });
  for (const value of [null, {}, getter, inherited, nested, array, new Proxy(f.evidence, { get() { invoked = true; return undefined; } })]) {
    assert.throws(() => admitOcrConfidenceEvidence(value, f.line, f.dimensions), TypeError);
  }
  assert.equal(invoked, false);
});
