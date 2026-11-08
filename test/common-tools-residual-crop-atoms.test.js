"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { scopeResidualCropAtoms } = require("../packages/slideclone-core/archetypes/residual-crop-atoms");
const { splitResidualLayerSource } = require("../packages/slideclone-core/archetypes/structured-residual-splitting");
const { validateDeckIrEnvelope } = require("../packages/slideclone-core/deck-ir-tree");

const crop = { x: 10, y: 10, w: 20, h: 20 };
const atom = (x, y, w = 5, h = 5) => ({ box: { x, y, w, h } });

test("residual crops retain intersecting, enclosing and boundary atoms without changing parent evidence", () => {
  const kept = [atom(12, 12), atom(0, 0, 100, 100), atom(30, 20), atom(5, 10), atom(10, 5)];
  const outside = [atom(40, 10), atom(10, 40), atom(-10, 10), atom(10, -10)];
  const diagramUnderstanding = { visualAtoms: [...kept, ...outside] };
  const layer = { visualAtoms: [...kept, ...outside], diagramUnderstanding, nativeConfidence: 0.9 };
  const snapshot = structuredClone(layer);
  const result = scopeResidualCropAtoms(layer, crop);
  assert.deepEqual(result.visualAtoms, kept);
  assert.equal(result.diagramUnderstanding, diagramUnderstanding);
  assert.deepEqual(layer, snapshot);
  assert.notEqual(result.visualAtoms, layer.visualAtoms);
});

test("invalid or uncertain geometry cannot silently discard evidence", () => {
  const uncertain = [null, {}, { box: null }, atom(0, 0, 0), atom(0, 0, -1), atom(NaN, 0), atom(Infinity, 0), atom(Number.MAX_VALUE, 0, Number.MAX_VALUE)];
  const layer = { visualAtoms: uncertain };
  assert.deepEqual(scopeResidualCropAtoms(layer, crop).visualAtoms, uncertain);
  for (const box of [null, [], {}, { x: "10", y: 10, w: 20, h: 20 }, { ...crop, w: 0 }, { ...crop, x: Infinity }, { ...crop, x: Symbol("invalid") }]) {
    assert.equal(scopeResidualCropAtoms(layer, box), layer);
  }
  for (const input of [null, undefined, {}, { visualAtoms: null }]) assert.equal(scopeResidualCropAtoms(input, crop), input);
  assert.deepEqual(scopeResidualCropAtoms({ visualAtoms: [] }, crop).visualAtoms, []);
  const failure = new Error("fixture invalid internal accessor");
  assert.throws(() => scopeResidualCropAtoms({ visualAtoms: [{ get box() { throw failure; } }] }, crop), error => error === failure);
});

test("split layer integration prevents repeated whole-page atoms from exhausting the unchanged 30000-node gate", () => {
  const atoms = Array.from({ length: 400 }, (_, index) => ({ ...atom(index, 10), evidence: Array(12).fill(1) }));
  const layer = { visualAtoms: atoms, layerType: "diagram-zone", diagramUnderstanding: { confidence: 0.8 } };
  const boxes = Array.from({ length: 7 }, (_, index) => ({ x: index * 50, y: 0, w: 50, h: 40 }));
  const images = boxes.map(box => ({ source: { layer: splitResidualLayerSource(layer, box) } }));
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ images }] };
  const bloated = structuredClone(deck);
  for (const image of bloated.pages[0].images) image.source.layer.visualAtoms = atoms;
  assert.throws(() => validateDeckIrEnvelope(bloated), /safe limits/);
  assert.doesNotThrow(() => validateDeckIrEnvelope(deck));
  assert.equal(layer.visualAtoms.length, 400);
  for (const image of images) assert.equal(image.source.layer.diagramUnderstanding, layer.diagramUnderstanding);
});
