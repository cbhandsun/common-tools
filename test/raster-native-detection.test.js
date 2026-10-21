"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const detection = require("../packages/slideclone-core/raster-native-detection");

const slideSize = { widthPt: 960, heightPt: 540 };

function image(width, height, color = [255, 255, 255, 255]) {
  const rgba = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < rgba.length; offset += 4) rgba.set(color, offset);
  return { width, height, rgba };
}

function paintRect(target, x, y, width, height, color) {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      target.rgba.set(color, (row * target.width + column) * 4);
    }
  }
}

test("raster detection exports isolated pixel primitives and preserves empty-image fallbacks", () => {
  assert.equal(typeof detection.detectLongLines, "function");
  assert.equal(typeof detection.detectEntropyMicroComponents, "function");
  assert.deepEqual(detection.detectLongLines(image(100, 100), slideSize), []);
  assert.equal(
    detection.sampleInkColor(image(4, 4, [0, 0, 0, 0]), { x: 0, y: 0, w: 1, h: 1 }, slideSize, "#abc123"),
    "#ABC123"
  );
  assert.deepEqual(detection.detectEntropyMicroComponents(null, slideSize), []);
});

test("raster detection identifies structural lines and respects text/icon suppression", () => {
  const lineImage = image(100, 100);
  paintRect(lineImage, 10, 50, 80, 1, [120, 120, 120, 255]);
  const lines = detection.detectLongLines(lineImage, slideSize);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].source.detector, "long-axis-line");
  assert.equal(lines[0].style.stroke, "#787878");

  const iconImage = image(60, 60, [255, 255, 255, 255]);
  paintRect(iconImage, 10, 10, 40, 40, [40, 150, 210, 255]);
  const visible = detection.detectSimpleStatusIcons(iconImage, { widthPt: 60, heightPt: 60 });
  assert.equal(visible.shapes.length, 1);
  assert.equal(visible.shapes[0].source.component, "positive");
  assert.equal(visible.textBoxes.length, 0);
  const suppressed = detection.detectSimpleStatusIcons(iconImage, { widthPt: 60, heightPt: 60 }, [{ box: { x: 0, y: 0, w: 60, h: 60 } }]);
  assert.deepEqual(suppressed, { shapes: [], textBoxes: [] });
});

test("raster detection emits native line marks instead of font glyphs for status icons", () => {
  const box = { x: 20, y: 10, w: 32, h: 32 };
  const positive = detection.createSimpleStatusIconMarkShapes("status-good", { name: "positive", shape: "ellipse", mark: "✓" }, box);
  assert.equal(positive.length, 2);
  assert.deepEqual(positive.map((shape) => shape.type), ["line", "line"]);
  assert.equal(positive.every((shape) => shape.style.stroke === "#FFFFFF"), true);
  assert.equal(positive.every((shape) => shape.style.lineCap === "round"), true);
  assert.equal(positive.every((shape) => shape.source.detector === "simple-status-icon-checkmark"), true);

  const negative = detection.createSimpleStatusIconMarkShapes("status-bad", { name: "negative", shape: "ellipse", mark: "×" }, box);
  assert.equal(negative.length, 2);
  assert.equal(negative.every((shape) => shape.source.detector === "simple-status-icon-cross"), true);

  assert.deepEqual(
    detection.createSimpleStatusIconMarkShapes("status-warning", { name: "warning", shape: "triangle", mark: "!" }, box),
    []
  );
});

test("raster detection returns bounded entropy micro-components outside text boxes", () => {
  const source = image(40, 40);
  paintRect(source, 10, 10, 2, 2, [255, 128, 0, 255]);
  const options = {
    region: { x: 0, y: 0, w: 40, h: 40 },
    predicate: detection.isEntropyOrangePixel,
    minAreaPx: 4,
    maxAreaPx: 4,
    maxWPt: 4,
    maxHPt: 4,
    padPt: 0
  };
  const components = detection.detectEntropyMicroComponents(source, { widthPt: 40, heightPt: 40 }, options);
  assert.equal(components.length, 1);
  assert.equal(components[0].fill, "#FF8000");
  assert.equal(components[0].imageEvidence, true);
  assert.deepEqual(
    detection.detectEntropyMicroComponents(source, { widthPt: 40, heightPt: 40 }, { ...options, textBoxes: [{ box: { x: 9, y: 9, w: 4, h: 4 } }] }),
    []
  );
});

test("wide solid panels and adjoining colored fills do not turn their last rows into long strokes", () => {
  for (const size of [18, 29, 47]) {
    const source = image(240, 160);
    paintRect(source, 20, 40, 200, size, [190, 205, 230, 255]);
    assert.deepEqual(detection.detectLongLines(source, { widthPt: 240, heightPt: 160 }), []);
    const columns = image(240, 160);
    paintRect(columns, 20, 40, 95, size, [180, 215, 235, 255]);
    paintRect(columns, 115, 40, 105, size, [230, 190, 215, 255]);
    assert.deepEqual(detection.detectLongLines(columns, { widthPt: 240, heightPt: 160 }), []);
  }
});

test("isolated horizontal and vertical strokes retain independent two-sided source contrast", () => {
  for (const thickness of [1, 3, 7]) {
    const source = image(240, 180, [225, 240, 230, 255]);
    paintRect(source, 20, 40, 190, thickness, [110, 90, 155, 255]);
    paintRect(source, 25, 70, thickness, 95, [70, 135, 110, 255]);
    const lines = detection.detectLongLines(source, { widthPt: 240, heightPt: 180 });
    assert.equal(lines.length, 2);
    assert.equal(lines.some(line => line.box.w === 190 && line.box.h === 0), true);
    assert.equal(lines.some(line => line.box.w === 0 && line.box.h === 95), true);
  }
});
