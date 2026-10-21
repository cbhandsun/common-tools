"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { cropPng, writePng } = require("../packages/slideclone-core/png");
const { eraseObjectifiedLayerPrimitives } = require("../packages/slideclone-core/residual-primitive-erasure");
const { filterTextBoxesForGraphicUnderlays } = require("../packages/slideclone-core/page-text-rules");
const { createErasedCropTextRecovery } = require("../packages/slideclone-core/erased-crop-text-recovery");

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "erased-text-recovery-"));
  const sourceImage = { width: 420, height: 220, rgba: Buffer.alloc(420 * 220 * 4, 255) };
  const text = { id: "source-title", text: "Title", box: { x: 80, y: 78, w: 70, h: 26 }, font: { hidden: false }, source: { labelRef: "source-label" } };
  const image = { id: "crop", assetPath: path.join(root, "crop.png"), box: { x: 50, y: 50, w: 280, h: 120 }, source: { detector: "foreground-graphic-crop" } };
  writePng(image.assetPath, cropPng(sourceImage, image.box));
  return { root, sourceImage, text, image, page: { images: [image] }, shapes: [{ type: "rect", box: { x: 170, y: 90, w: 110, h: 44 }, source: { detector: "line-text-native-bordered-card", editable: true } }] };
}
function erase(f, recovery, texts = [f.text]) {
  eraseObjectifiedLayerPrimitives({ page: f.page, sourceImage: f.sourceImage, textBoxes: texts, primitiveShapes: f.shapes,
    slideSize: { widthPt: 420, heightPt: 220 }, irDir: f.root, onTextErased: recovery.record });
}
test("early-filtered text is recovered only after its crop write commits", () => {
  const f = fixture();
  try {
    const retained = filterTextBoxesForGraphicUnderlays([f.text], f.page.images);
    assert.deepEqual(retained, []);
    const recovery = createErasedCropTextRecovery(f.page, [f.text]);
    erase(f, recovery);
    assert.deepEqual(recovery.recover(retained), [f.text]);
    assert.deepEqual(recovery.recover(retained), [], "receipts are consumed once");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test("failed asset writes and shape-only writes cannot authorize text recovery", () => {
  const f = fixture();
  try {
    const recovery = createErasedCropTextRecovery(f.page, [f.text]);
    f.image.assetPath = f.root;
    assert.throws(() => erase(f, recovery));
    assert.deepEqual(recovery.recover([]), []);
    assert.equal(f.image.source.textErasedFromCrop, undefined);
    f.image.assetPath = path.join(f.root, "shape-only.png");
    const shapeOnly = createErasedCropTextRecovery(f.page, [f.text]);
    erase(f, shapeOnly, []);
    assert.deepEqual(shapeOnly.recover([]), []);
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test("only exact unchanged source objects and surviving erased crops can be restored", () => {
  const f = fixture();
  try {
    for (const change of [() => { f.text.text = "changed"; }, () => { f.text.box.x++; }, () => { f.text.source.labelRef = "other"; }, () => { f.text.source.ocrLabelRef = "other"; }, () => { f.page.images = []; }]) {
      f.text.text = "Title"; f.text.box.x = 80; f.text.source.labelRef = "source-label"; f.page.images = [f.image];
      delete f.text.source.ocrLabelRef;
      const recovery = createErasedCropTextRecovery(f.page, [f.text]); erase(f, recovery); change();
      assert.deepEqual(recovery.recover([]), []);
    }
    f.page.images = [f.image];
    const recovery = createErasedCropTextRecovery(f.page, [f.text]);
    erase(f, recovery, [structuredClone(f.text)]);
    assert.deepEqual(recovery.recover([]), [], "copied input is not a source receipt");
    const noWrite = createErasedCropTextRecovery(f.page, [f.text]);
    assert.deepEqual(noWrite.recover([]), [], "metadata alone does not authorize recovery");
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test("existing native counterparts including split status labels are not duplicated", () => {
  const f = fixture();
  try {
    for (const retained of [[f.text], [structuredClone(f.text)], [{ ...structuredClone(f.text), id: "split-label", source: { splitFromTextBoxId: f.text.id } }]]) {
      const recovery = createErasedCropTextRecovery(f.page, [f.text]); erase(f, recovery);
      assert.deepEqual(recovery.recover(retained), []);
    }
    for (const retained of [[{ id: f.text.id }], [{ ...structuredClone(f.text), font: { hidden: true } }], [{ ...structuredClone(f.text), style: { visibility: "hidden" } }]]) {
      const recovery = createErasedCropTextRecovery(f.page, [f.text]); erase(f, recovery);
      assert.deepEqual(recovery.recover(retained), [f.text], "an invalid or hidden ID is not a visible native counterpart");
    }
  } finally { fs.rmSync(f.root, { recursive: true, force: true }); }
});
test("empty invalid excessive and accessor inputs cannot acquire receipts", () => {
  const page = { images: [] };
  assert.deepEqual(createErasedCropTextRecovery(page, []).recover([]), []);
  for (const texts of [null, {}, Array(30001).fill({}), [{ text: "\u0000", box: { x: 1, y: 1, w: 2, h: 2 } }], [{ text: "x", box: { x: Infinity, y: 1, w: 2, h: 2 } }]]) {
    assert.deepEqual(createErasedCropTextRecovery(page, texts).recover([]), []);
  }
  let reads = 0;
  const accessor = { get text() { reads++; throw new Error("must not execute"); } };
  const recovery = createErasedCropTextRecovery(page, [accessor]);
  recovery.record(accessor, [accessor]);
  assert.deepEqual(recovery.recover([]), []);
  assert.equal(reads, 0);
  const iterable = [];
  iterable[Symbol.iterator] = () => { throw new Error("must not execute"); };
  assert.deepEqual(createErasedCropTextRecovery(page, iterable).recover([]), []);
});
