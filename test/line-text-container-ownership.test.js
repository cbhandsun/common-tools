"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLineTextNativeComponentObjects } = require("../packages/slideclone-core/line-text-native-components");

function raster(width = 960, height = 540) {
  return { width, height, rgba: new Uint8Array(width * height * 4).fill(255) };
}
function paint(image, x, y, w, h, color) {
  for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) {
    image.rgba.set([...color, 255], (cy * image.width + cx) * 4);
  }
}
function text(id, x, y, w = 60, h = 12) {
  return { id, text: id, box: { x, y, w, h }, font: { sizePt: 9, color: "#222222", align: "left" } };
}
function components(image, textBoxes) {
  return createLineTextNativeComponentObjects({ image, textBoxes,
    slideSize: { widthPt: image.width, heightPt: image.height },
    lines: [20, 44].map(y => ({ box: { x: 20, y, w: 220, h: 0 }, style: {} })) });
}

test("line text reconstruction does not invent a shared container for independent columns", () => {
  const image = raster();
  for (const x of [30, 300, 570]) paint(image, x, 70, 240, 160, [242, 248, 251]);
  const texts = [];
  for (const y of [100, 180]) for (const x of [55, 325, 595]) {
    texts.push(text(`Heading ${x}-${y}`, x, y), text(`Detail ${x}-${y}`, x, y + 16));
  }
  const result = components(image, texts);
  assert.equal(result.shapes.filter(shape => shape.source.detector === "line-text-native-title-band-panel").length, 0);
});

test("line text reconstruction keeps genuine full-row owners supported by the source", () => {
  const image = raster();
  const texts = [];
  for (const y of [100, 200]) {
    paint(image, 30, y - 22, 650, 66, [240, 253, 248]);
    for (const x of [55, 190, 325, 460, 595]) {
      texts.push(text(`Heading ${x}-${y}`, x, y), text(`Detail ${x}-${y}`, x, y + 16));
    }
  }
  const result = components(image, texts);
  const owners = result.shapes.filter(shape => shape.source.detector === "line-text-native-title-band-panel");
  assert.equal(owners.length, 2);
  assert.ok(owners.every(shape => shape.source.sourcePerimeterSupport >= 0.8));
});

test("source-backed label cannot be moved into a nearby unrelated colored glyph", () => {
  const image = raster();
  paint(image, 115, 80, 20, 20, [15, 145, 150]);
  const label = text("Measured label", 106, 110, 70, 13);
  label.source = { evidenceBox: { ...label.box }, confidence: 0.96 };
  const result = components(image, [label, text("Plain text", 300, 110), text("Another label", 420, 110)]);
  assert.equal(result.textBoxes.some(item => item.id === label.id), false);
  assert.equal(result.shapes.some(shape => shape.source.detector === "line-text-native-color-panel"), false);
  assert.deepEqual(label.box, label.source.evidenceBox);
  assert.equal(label.font.color, "#222222");
});
