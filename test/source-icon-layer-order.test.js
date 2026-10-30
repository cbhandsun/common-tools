"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { orderSourceIconLayers: orderLayers } = require("../packages/slideclone-core/scene-plan/source-icon-layer-order");
const orderSourceIconLayers = shapes => orderLayers(shapes, { widthPt: 300, heightPt: 200 });
const { removeFullSlideResidualImages } = require("../packages/slideclone-worker-adapter/team-worker");
function fixture() {
  const iconBox = { x: 20, y: 20, w: 30, h: 30 };
  const glyph = { id: "glyph", type: "freeform", box: iconBox, source: {
    sourceTextBoxId: "ocr-1", pageImage: "assets/source.png", sourceIconBox: iconBox, iconPart: "outline-contour"
  } };
  const panel = { id: "panel", type: "roundRect", box: { x: 0, y: 0, w: 100, h: 100 }, style: { fill: "#EEEEEE" },
    source: { pageImage: "assets/source.png", preserveResidualInterior: true } };
  return { glyph, panel };
}
test("source contours move together behind no foreground and above containing panel", () => {
  const { glyph, panel } = fixture();
  const interior = { ...glyph, id: "interior", source: { ...glyph.source, iconPart: "interior-contour" } };
  const unrelated = { id: "other", box: { x: 150, y: 150, w: 20, h: 20 } };
  const shapes = [interior, glyph, unrelated, panel], before = structuredClone(shapes);
  const result = orderSourceIconLayers(shapes);
  assert.deepEqual(result.shapes, [unrelated, panel, interior, glyph]);
  assert.equal(result.movedShapes, 2);
  assert.deepEqual(shapes, before);
  assert.equal(orderSourceIconLayers(result.shapes).movedShapes, 0);
});
test("intentional foreground occlusion and unknown geometry prevent reordering", () => {
  const { glyph, panel } = fixture();
  for (const foreground of [{ id: "overlay", box: glyph.box }, { id: "unknown" }, null]) {
    const shapes = [glyph, foreground, panel];
    assert.deepEqual(orderSourceIconLayers(shapes), { shapes, movedShapes: 0 });
  }
  assert.deepEqual(orderSourceIconLayers([glyph, panel, { id: "overlay", box: glyph.box }]).shapes,
    [panel, glyph, { id: "overlay", box: glyph.box }]);
});
test("interleaved icon parts and nested backgrounds retain contour paint order", () => {
  const { glyph, panel } = fixture();
  const interior = { ...glyph, id: "interior", source: { ...glyph.source, iconPart: "interior-contour" } };
  const innerPanel = { ...panel, id: "inner", box: { x: 10, y: 10, w: 60, h: 60 } };
  assert.deepEqual(orderSourceIconLayers([interior, panel, glyph]).shapes, [panel, interior, glyph]);
  const nested = [interior, panel, innerPanel, glyph];
  assert.deepEqual(orderSourceIconLayers(nested).shapes, nested);
});
test("intersecting source owners are stable across repeated calls", () => {
  const { glyph, panel } = fixture();
  const second = { ...glyph, id: "second", source: { ...glyph.source, sourceTextBoxId: "ocr-2" } };
  const shapes = [glyph, second, panel];
  assert.equal(orderSourceIconLayers(shapes).movedShapes, 0);
  assert.deepEqual(orderSourceIconLayers(orderSourceIconLayers(shapes).shapes).shapes, shapes);
});
test("foreign nested panels, missing identity, opacity and out-of-slide geometry fail closed", () => {
  const { glyph, panel } = fixture();
  for (const changed of [
    { ...panel, id: undefined }, { ...panel, box: { x: 0, y: 0, w: 100000, h: 100000 } },
    { ...panel, style: { ...panel.style, fillOpacity: 0.25 } },
    { ...panel, style: { ...panel.style, fillTransparency: 0.75 } }
  ]) assert.equal(orderSourceIconLayers([glyph, changed]).movedShapes, 0);
  assert.throws(() => orderLayers([glyph, panel], {}), TypeError);
  const owned = { ...glyph, source: { ...glyph.source, containerId: "panel" } };
  const foreign = { ...panel, id: "foreign" };
  assert.equal(orderSourceIconLayers([owned, foreign, panel]).movedShapes, 0);
  assert.deepEqual(orderSourceIconLayers([owned, panel]).shapes, [panel, owned]);
});
test("unverified guesses, unsafe provenance and noncontaining or transparent panels stay unchanged", () => {
  const { glyph, panel } = fixture();
  for (const changed of [
    { ...glyph, source: {} }, { ...glyph, source: { ...glyph.source, pageImage: "assets/../secret.png" } },
    { ...glyph, box: { ...glyph.box, x: Infinity } }, { ...glyph, hidden: true },
    { ...glyph, source: { ...glyph.source, sourceIconBox: { ...glyph.box, w: -1 } } }
  ]) assert.equal(orderSourceIconLayers([changed, panel]).movedShapes, 0);
  for (const changed of [
    { ...panel, style: { fill: "url(secret)" } }, { ...panel, style: { ...panel.style, opacity: 0.5 } },
    { ...panel, source: { ...panel.source, pageImage: "assets/other.png" } },
    { ...panel, box: { x: 0, y: 0, w: 25, h: 25 } }, { ...panel, source: {} }
  ]) assert.equal(orderSourceIconLayers([glyph, changed]).movedShapes, 0);
});
test("empty, invalid, excessive and ambiguous inputs are bounded", () => {
  assert.deepEqual(orderSourceIconLayers([]), { shapes: [], movedShapes: 0 });
  for (const input of [null, {}, Array(10001).fill(null)]) assert.throws(() => orderSourceIconLayers(input), TypeError);
  const { glyph, panel } = fixture();
  assert.equal(orderSourceIconLayers([glyph, glyph, panel]).movedShapes, 0);
  const many = Array.from({ length: 129 }, (_, index) => ({ ...panel, id: `panel-${index}` }));
  assert.equal(orderSourceIconLayers([glyph, ...many]).movedShapes, 0);
});
test("Worker residual removal preserves source contours independent of large-image presence", () => {
  const { glyph, panel } = fixture();
  for (const images of [[], [{ id: "residual", box: { x: 0, y: 0, w: 100, h: 100 }, source: { fullSlideResidual: true } }]]) {
    const deck = { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ shapes: [glyph, panel], images }] };
    const result = removeFullSlideResidualImages(deck);
    assert.deepEqual(result.deck.pages[0].shapes, [panel, glyph]);
    assert.deepEqual(deck.pages[0].shapes, [glyph, panel]);
  }
});
