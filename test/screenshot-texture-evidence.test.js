"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { hasRepeatedAlignedDensityRows, hasScatteredTextureEvidence, hasUnverifiedNativeGeometry, assertUnverifiedRegionTextPreserved } = require("../packages/slideclone-core/screenshot-texture-evidence");
const { understandDiagramLayer } = require("../packages/slideclone-core/diagram-understanding-entry");

function peak(x, y, size = 13.5) {
  return { box: { x, y, w: size, h: size } };
}

test("erased uncertain regions cannot silently lose admitted text even when pixel comparison passes", () => {
  const expected = ["heading", "body one", "body two"].map((text, index) => ({ text, box: { x: 10, y: 10 + 20 * index, w: 60, h: 12 } }));
  const region = { box: { x: 0, y: 0, w: 100, h: 100 }, source: { textObjectified: true, layer: { diagramUnderstanding: { evidence: { nativeGeometryUnverified: true } } } } };
  assert.doesNotThrow(() => assertUnverifiedRegionTextPreserved({ images: [region], textBoxes: expected }, expected));
  assert.throws(() => assertUnverifiedRegionTextPreserved({ images: [region], textBoxes: expected.slice(0, 2) }, expected), /^Error: objectified region lost admitted OCR text$/);
  assert.doesNotThrow(() => assertUnverifiedRegionTextPreserved({ images: [{ ...region, source: {} }], textBoxes: [] }, expected));
  assert.doesNotThrow(() => assertUnverifiedRegionTextPreserved({ images: [], textBoxes: [] }, []));
  assert.doesNotThrow(() => assertUnverifiedRegionTextPreserved({ images: [region], textBoxes: [{ text: "heading body one body two", box: expected[0].box }] }, expected));
});

function sparseAtoms() {
  const peaks = [[536,146],[520,160],[526,180],[539,194],[828,288],[746,288],[756,288],[769,289],[816,289],[844,289],[869,289],[706,289],[856,289],[469,297],[477,302],[564,348],[555,358],[533,361],[545,363],[567,367],[523,371],[545,376],[521,389],[524,399]];
  return [...peaks.map(([x, y]) => ({ ...peak(x, y, 8.2913), kind: "native-rect-candidate", color: "#3488e9", nativeCandidate: true, source: { detector: "dense-linked-node-visual-atom" } })),
    { kind: "grid-line-candidate", box: { x: 20, y: 280, w: 800, h: 2 } },
    { kind: "grid-line-candidate", box: { x: 20, y: 286, w: 800, h: 2 } }];
}

test("scattered glyph evidence marks geometry uncertainty without turning editable text into a screenshot", () => {
  const box = { x: 0, y: 0, w: 960, h: 540 };
  const atoms = sparseAtoms();
  assert.equal(hasScatteredTextureEvidence(atoms, box), true);
  const result = understandDiagramLayer({ box }, { textBoxes: [] }, undefined, { visualAtoms: atoms });
  assert.equal(result.evidence.nativeGeometryUnverified, true);
  assert.equal(result.visualAtomKindCounts["screenshot-crop-candidate"] || 0, 0);
  assert.equal(hasUnverifiedNativeGeometry({ source: { layer: { diagramUnderstanding: result } } }), true);
  for (const value of [undefined, null, {}, { source: { layer: { diagramUnderstanding: { evidence: { nativeGeometryUnverified: "true" } } } } }]) {
    assert.equal(hasUnverifiedNativeGeometry(value), false);
  }
});

test("scattered texture admission requires all geometric evidence and rejects invalid inputs", () => {
  const box = { x: 0, y: 0, w: 960, h: 540 };
  assert.equal(hasScatteredTextureEvidence(sparseAtoms().slice(0, -1), box), false);
  assert.equal(hasScatteredTextureEvidence(sparseAtoms().map(atom => ({ ...atom, color: "invalid" })), box), false);
  assert.equal(hasScatteredTextureEvidence(sparseAtoms(), { ...box, w: Infinity }), false);
  assert.equal(hasScatteredTextureEvidence(sparseAtoms(), { ...box, w: 100, h: 100 }), false);
  assert.equal(hasScatteredTextureEvidence([...sparseAtoms(), ...Array.from({ length: 3 }, () => ({ kind: "connector-arrow-candidate" }))], box), false);
  for (const value of [null, [], new Array(257).fill({})]) assert.equal(hasScatteredTextureEvidence(value, box), false);
});

test("screenshot texture evidence accepts repeated aligned density rows", () => {
  const peaks = [0, 28, 56, 84, 112].flatMap((x) => [peak(x, 20), peak(x, 54)]);
  assert.equal(hasRepeatedAlignedDensityRows(peaks), true);
});

test("screenshot texture evidence rejects scattered glyph and single-row peaks", () => {
  const scattered = [
    [536, 146], [520, 160], [526, 180], [539, 194], [828, 288], [746, 288],
    [756, 288], [769, 289], [816, 289], [844, 289], [869, 289], [706, 289],
    [856, 289], [469, 297], [477, 302], [564, 348], [555, 358], [533, 361],
    [545, 363], [567, 367], [523, 371], [545, 376], [521, 389], [524, 399]
  ].map(([x, y]) => peak(x, y, 8.2913));
  assert.equal(hasRepeatedAlignedDensityRows(scattered), false);
  assert.equal(hasRepeatedAlignedDensityRows([0, 28, 56, 84, 112, 140].map((x) => peak(x, 20))), false);
});

test("screenshot texture evidence rejects empty, invalid, extreme, and accessor-backed input safely", () => {
  assert.equal(hasRepeatedAlignedDensityRows([]), false);
  assert.equal(hasRepeatedAlignedDensityRows(null), false);
  assert.equal(hasRepeatedAlignedDensityRows([{}]), false);
  const valid = [0, 28, 56].flatMap(x => [peak(x, 20), peak(x, 54)]);
  assert.equal(hasRepeatedAlignedDensityRows(valid), true);
  for (const invalid of [{ box: { x: Infinity, y: 0, w: 1, h: 1 } }, peak(1000001, 0), peak(0, 0, 0), {}]) {
    assert.equal(hasRepeatedAlignedDensityRows([...valid.slice(0, 5), invalid]), false);
  }
  let invoked = false;
  const accessorPeak = Object.defineProperty({}, "box", {
    get() { invoked = true; throw new Error("must not read accessor"); }
  });
  assert.equal(hasRepeatedAlignedDensityRows([...valid.slice(0, 5), accessorPeak]), false);
  assert.equal(invoked, false);
  assert.equal(hasRepeatedAlignedDensityRows(new Array(257).fill(peak(0, 0))), false);
});
