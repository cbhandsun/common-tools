"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { vectorizeDensePictorialIcon } = require("../packages/slideclone-core/pictorial-icon-native-vectorization");

test("a saturated dark outline and its pale same-hue interior retain independent source colors", () => {
  const image = makeTransparentImage(64, 64);
  fillRect(image, 6, 6, 52, 52, "#A4C5F2");
  fillRect(image, 10, 10, 44, 4, "#1644A0");
  fillRect(image, 10, 50, 44, 4, "#1644A0");
  fillRect(image, 10, 14, 4, 36, "#1644A0");
  fillRect(image, 50, 14, 4, 36, "#1644A0");
  const original = Buffer.from(image.rgba);
  const shapes = vectorizeDensePictorialIcon({ image, box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "same-hue" });
  assert.equal(shapes.length, 2);
  assert.equal(shapes[0].style.fill, "#A4C5F2");
  assert.equal(shapes[1].style.fill, "#1644A0");
  assert.equal(shapes[1].style.freeformSegments.filter(segment => segment.type === "close").length, 2);
  assert.ok(shapes.every(shape => shape.style.freeformSegments.length <= 120));
  assert.deepEqual(image.rgba, original);
});

test("an omitted source stroke cannot make a partial dense pictorial icon look complete", () => {
  const image = makeTransparentImage(64, 64);
  fillRect(image, 6, 6, 36, 36, "#1644A0");
  fillRect(image, 48, 20, 2, 10, "#1644A0");
  assert.deepEqual(vectorizeDensePictorialIcon({ image, box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "incomplete" }), []);
});

test("dense pictorial icon vectorization converts simple filled icons into editable freeform shapes", () => {
  const image = makeImage(100, 90, "#FFFFFF");
  fillDiamond(image, 50, 45, 42, 34, "#1473E6");
  drawLine(image, 28, 30, 52, 42, "#F8FBFF", 4);
  drawLine(image, 52, 42, 76, 28, "#F8FBFF", 4);

  const shapes = vectorizeDensePictorialIcon({
    image,
    box: { x: 320, y: 180, w: 50, h: 45 },
    idPrefix: "vector-icon",
    sourceImageId: "icon-crop"
  });

  assert.ok(shapes.length >= 1);
  assert.equal(shapes[0].type, "freeform");
  assert.equal(shapes[0].source.pictorialVectorized, true);
  assert.ok(shapes.every((shape) => shape.source.detector === "dense-pictorial-icon-native-vector"));
});

test("dense pictorial icon vectorization rejects sparse line art", () => {
  const image = makeImage(100, 90, "#FFFFFF");
  drawLine(image, 10, 10, 90, 80, "#202124", 4);

  const shapes = vectorizeDensePictorialIcon({
    image,
    box: { x: 0, y: 0, w: 100, h: 90 },
    idPrefix: "line-art",
    sourceImageId: "line-crop"
  });

  assert.deepEqual(shapes, []);
});

test("dense pictorial vectorization preserves cutouts as native compound paths", () => {
  const image = makeTransparentImage(60, 60);
  fillRect(image, 5, 5, 50, 50, "#1473E6");
  for (let y = 20; y < 40; y += 1) for (let x = 20; x < 40; x += 1) image.rgba[(y * image.width + x) * 4 + 3] = 0;
  const shapes = vectorizeDensePictorialIcon({ image, box: { x: 0, y: 0, w: 60, h: 60 }, idPrefix: "ring" });
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].style.freeformSegments.filter((segment) => segment.type === "close").length, 2);
  assert.equal(shapes[0].style.stroke, "none");
});

test("dense pictorial vectorization rejects invalid and oversized raster buffers", () => {
  const box = { x: 0, y: 0, w: 60, h: 60 };
  for (const image of [{ width: 2, height: 2, rgba: Buffer.alloc(3) }, { width: -1, height: 2, rgba: Buffer.alloc(0) },
    { width: 1.5, height: 2, rgba: Buffer.alloc(12) }, { width: 2049, height: 1, rgba: Buffer.alloc(8196) }]) {
    assert.throws(() => vectorizeDensePictorialIcon({ image, box, idPrefix: "invalid" }), TypeError);
  }
});

test("dense pictorial icon vectorization preserves dense multicolor pictorial components", () => {
  const image = makeTransparentImage(96, 80);
  fillRect(image, 12, 12, 58, 44, "#2D73E6");
  fillRect(image, 50, 28, 28, 34, "#30333A");
  fillRect(image, 20, 50, 42, 12, "#8D929D");

  const shapes = vectorizeDensePictorialIcon({
    image,
    box: { x: 300, y: 160, w: 48, h: 40 },
    idPrefix: "multicolor-icon",
    sourceImageId: "icon-crop"
  });

  const fills = shapes.filter((shape) => shape.type === "freeform");
  assert.ok(fills.length >= 3);
  assert.ok(new Set(fills.map((shape) => shape.source.colorClass)).has("blue"));
  assert.ok(new Set(fills.map((shape) => shape.source.colorClass)).has("dark"));
  assert.ok(new Set(fills.map((shape) => shape.source.colorClass)).has("neutral"));
});

test("dense pictorial vectorization works across hue families and target coordinates", () => {
  for (const color of ["#D62432", "#20AD46", "#DACA20", "#18ABBC", "#AC25B8"]) {
    const image = makeTransparentImage(60, 60);
    fillRect(image, 5, 5, 50, 50, color);
    const shapes = vectorizeDensePictorialIcon({ image, box: { x: 210, y: 75, w: 30, h: 90 }, idPrefix: "hue" });
    assert.equal(shapes.length, 1);
    assert.equal(shapes[0].style.fill, color);
    assert.deepEqual(shapes[0].box, { x: 212.5, y: 82.5, w: 25, h: 75 });
  }
});

test("dark chromatic detail is not merged into a brighter component of the same hue", () => {
  // A low-luminance blue outline still satisfies the old blue hue predicate.
  // Its separate paint must survive before the enclosing color is averaged.
  for (const ink of ["#302860", "#55333F", "#365540"]) {
    const image = makeTransparentImage(64, 64);
    fillRect(image, 6, 6, 52, 52, "#8179D8");
    fillRect(image, 12, 29, 40, 4, ink);
    const before = Buffer.from(image.rgba);
    const shapes = vectorizeDensePictorialIcon({ image, box: { x: 10, y: 20, w: 64, h: 64 }, idPrefix: "chromatic-ink" });
    const detail = shapes.find(shape => shape.source.colorClass === "dark");
    assert.ok(detail, `missing separate dark paint for ${ink}`);
    assert.equal(detail.style.fill, ink);
    assert.deepEqual(detail.box, { x: 22, y: 49, w: 40, h: 4 });
    assert.deepEqual(image.rgba, before);
  }
});

test("dark detail priority preserves saturated color and ignores transparent RGB", () => {
  const image = makeTransparentImage(64, 64);
  fillRect(image, 6, 6, 52, 52, "#0000FF");
  // RGB outside the alpha mask must not contribute a dark detail component.
  for (let x = 0; x < 64; x += 1) image.rgba.set([48, 40, 96, 0], x * 4);
  const shapes = vectorizeDensePictorialIcon({ image, box: { x: 0, y: 0, w: 64, h: 64 }, idPrefix: "vivid-fill" });
  assert.equal(shapes.length, 1);
  assert.equal(shapes[0].source.colorClass, "blue");
  assert.equal(shapes[0].style.fill, "#0000FF");
});

test("chromatic ink overlays retain the original base paths and original 32-part bound", () => {
  const { _private: internals } = require("../packages/slideclone-core/pictorial-icon-native-vectorization");
  for (const count of [1, 32]) {
    const image = makeTransparentImage(count === 1 ? 64 : 128, count === 1 ? 64 : 64);
    if (count === 1) {
      fillRect(image, 6, 6, 52, 52, "#8179D8");
      fillRect(image, 12, 29, 40, 4, "#302860");
    } else {
      for (let i = 0; i < count; i += 1) {
        const x = i % 8 * 16 + 2, y = Math.floor(i / 8) * 16 + 2;
        fillRect(image, x, y, 12, 12, "#8179D8");
        fillRect(image, x + 2, y + 3, 8, 6, "#302860");
      }
    }
    const analysis = internals.analyzeDenseIcon(image);
    assert.equal(analysis.accepted, true);
    const base = internals.densePictorialColorComponents(image, analysis);
    const shapes = vectorizeDensePictorialIcon({ image, box: { x: 0, y: 0, w: image.width, h: image.height }, idPrefix: "bounded-overlay" });
    assert.equal(shapes.length, count === 1 ? 2 : 32);
    for (const [index, component] of base.entries()) {
      assert.deepEqual(shapes[index].style.freeformSegments, component.segments);
      assert.equal(shapes[index].style.fill, component.color);
      assert.deepEqual(shapes[index].box, component.box);
    }
  }
});

function makeImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const [r, g, b] = parseHex(color);
  for (let index = 0; index < width * height; index += 1) {
    rgba[index * 4] = r;
    rgba[index * 4 + 1] = g;
    rgba[index * 4 + 2] = b;
    rgba[index * 4 + 3] = 255;
  }
  return { width, height, rgba };
}

function makeTransparentImage(width, height) {
  return { width, height, rgba: Buffer.alloc(width * height * 4, 0) };
}

function fillRect(image, x, y, w, h, color) {
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) setPixel(image, xx, yy, color);
  }
}

function fillDiamond(image, cx, cy, rx, ry, color) {
  for (let y = cy - ry; y <= cy + ry; y += 1) {
    for (let x = cx - rx; x <= cx + rx; x += 1) {
      if (Math.abs((x - cx) / rx) + Math.abs((y - cy) / ry) <= 1) setPixel(image, x, y, color);
    }
  }
}

function drawLine(image, x1, y1, x2, y2, color, width = 3) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1)));
  const radius = Math.max(1, Math.floor(width / 2));
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = Math.round(x1 + (x2 - x1) * t);
    const y = Math.round(y1 + (y2 - y1) * t);
    for (let yy = y - radius; yy <= y + radius; yy += 1) {
      for (let xx = x - radius; xx <= x + radius; xx += 1) {
        if ((xx - x) ** 2 + (yy - y) ** 2 <= radius ** 2) setPixel(image, xx, yy, color);
      }
    }
  }
}

function setPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const [r, g, b] = parseHex(color);
  const offset = (Math.round(y) * image.width + Math.round(x)) * 4;
  image.rgba[offset] = r;
  image.rgba[offset + 1] = g;
  image.rgba[offset + 2] = b;
  image.rgba[offset + 3] = 255;
}

function parseHex(color) {
  const text = color.replace("#", "");
  return [0, 2, 4].map((offset) => Number.parseInt(text.slice(offset, offset + 2), 16));
}
