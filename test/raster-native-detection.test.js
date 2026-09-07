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
  const suppressed = detection.detectSimpleStatusIcons(iconImage, { widthPt: 60, heightPt: 60 }, [{ box: { x: 0, y: 0, w: 60, h: 60 } }]);
  assert.deepEqual(suppressed, { shapes: [], textBoxes: [] });
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
