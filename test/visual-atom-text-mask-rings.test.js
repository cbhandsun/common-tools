"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { blankImage, fillEllipse } = require("./helpers/visual-atoms-fixtures");
const { foregroundComponents, foregroundComponentsBySeedColor, mergeCloseComponents } = require("../packages/slideclone-core/scene-plan/visual-atom-components");
const { classifyAtom, inferShapeHint, looksLikeDonut } = require("../packages/slideclone-core/scene-plan/visual-atom-shape-recognition");
const { extractVisualAtoms } = require("../packages/slideclone-core/scene-plan/visual-atom-extractor");
const region = { x: 0, y: 0, w: 220, h: 220 };
const mask = { x: 52, y: 50, w: 36, h: 40 };
function disc() {
  const image = blankImage(220, 220, "#ffffff");
  fillEllipse(image, 30, 30, 80, 80, "#207341");
  return image;
}

for (const [label, components] of [["foreground", foregroundComponents], ["seed color", foregroundComponentsBySeedColor]]) {
  test(`${label}: an OCR cutout cannot prove a native ring`, () => {
    const image = disc();
    const component = components(image, region, [255, 255, 255], [mask])[0];
    assert.equal(looksLikeDonut(component), true, "mask creates an apparent ring in the density/profile evidence");
    assert.equal(component.sourceForegroundClippedByTextMask, true);
    assert.equal(inferShapeHint(component, region), "complex");
    assert.equal(classifyAtom(component, region), "complex-shape-crop-candidate");
  });

  test(`${label}: a text mask inside an existing empty hole does not invalidate a ring`, () => {
    const image = disc();
    fillEllipse(image, 50, 50, 40, 40, "#ffffff");
    const component = components(image, region, [255, 255, 255], [{ x: 63, y: 63, w: 14, h: 14 }])[0];
    assert.equal(component.sourceForegroundClippedByTextMask, undefined);
    assert.equal(looksLikeDonut(component), true);
    assert.equal(classifyAtom(component, region), "native-donut-candidate");
  });
}

test("public atom extraction retains clipped source evidence without objectifying a fabricated hole", () => {
  const image = disc(), before = Buffer.from(image.rgba);
  // Extraction expands OCR boxes by three source pixels.
  const atoms = extractVisualAtoms(image, region, { widthPt: 220, heightPt: 220 },
    { textBoxes: [{ box: { x: 55, y: 53, w: 30, h: 34 } }] });
  const target = atoms.find(atom => atom.box.w === 80 && atom.box.h === 80);
  assert.ok(target);
  assert.equal(target.sourceForegroundClippedByTextMask, true);
  assert.equal(target.nativeCandidate, false);
  assert.equal(target.residualCandidate, true);
  assert.ok(!["native-donut-candidate", "native-gear-candidate", "native-diamond-candidate"].includes(target.kind));
  assert.deepEqual(image.rgba, before);
});

test("component merging preserves text-mask clipping from either member", () => {
  const image = blankImage(80, 80, "#ffffff");
  const part = { box: { x: 10, y: 10, w: 20, h: 20 }, pixelCount: 100, color: "#207341",
    rowProfile: [], colProfile: [] };
  for (const first of [true, false]) {
    const a = { ...part, ...(first ? { sourceForegroundClippedByTextMask: true } : {}) };
    const b = { ...part, box: { x: 25, y: 10, w: 20, h: 20 }, ...(!first ? { sourceForegroundClippedByTextMask: true } : {}) };
    const merged = mergeCloseComponents([a, b], image);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].sourceForegroundClippedByTextMask, true);
  }
});
