"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { measureTextInkGeometry, measureSourceTextInkGeometry } = require("../packages/slideclone-core/typography/text-ink-geometry");

function fixture() {
  const image = scale => {
    const width = 100 * scale, height = 100 * scale, rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 22 * scale; y < 30 * scale; y++) for (let x = 12 * scale; x < 32 * scale; x++) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
    return { width, height, rgba };
  };
  return { slideSize: { widthPt: 100, heightPt: 100 }, sourceImage: image(1), renderedImage: image(2),
    textBoxes: [{ id: "text", box: { x: 10, y: 20, w: 30, h: 15 }, font: { color: "#141e28" } }] };
}

test("measures equivalent ink in slide coordinates across raster resolutions without mutation", () => {
  const input = fixture(), bytes = Buffer.from(input.sourceImage.rgba), before = structuredClone(input.textBoxes);
  const result = measureTextInkGeometry(input);
  assert.deepEqual(result.measurements, [{ id: "text", source: { x: 12, y: 22, w: 20, h: 8 }, rendered: { x: 12, y: 22, w: 20, h: 8 } }]);
  assert.ok(result.samples > 0);
  assert.deepEqual(input.sourceImage.rgba, bytes); assert.deepEqual(input.textBoxes, before);
});

test("empty, absent, transparent and nonmatching ink produces no proposed measurement", () => {
  const input = fixture();
  assert.deepEqual(measureTextInkGeometry({ ...input, textBoxes: [] }), { measurements: [], samples: 0 });
  input.renderedImage.rgba.fill(255);
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
  input.renderedImage.rgba.fill(0);
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
  input.textBoxes[0].font.color = "#FFFFFF";
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
});

test("measures light text on a dark host without treating a white page as ink", () => {
  const width = 100, height = 100;
  const image = () => {
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 20; y < 40; y += 1) for (let x = 10; x < 45; x += 1) rgba.set([20, 40, 90, 255], (y * width + x) * 4);
    for (let y = 24; y < 32; y += 1) for (let x = 16; x < 34; x += 1) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
    return { width, height, rgba };
  };
  const result = measureTextInkGeometry({
    slideSize: { widthPt: 100, heightPt: 100 },
    sourceImage: image(),
    renderedImage: image(),
    textBoxes: [{ id: "white", box: { x: 10, y: 20, w: 35, h: 20 }, font: { color: "#FFFFFF" } }]
  });

  assert.deepEqual(result.measurements, [{ id: "white", source: { x: 16, y: 24, w: 18, h: 8 }, rendered: { x: 16, y: 24, w: 18, h: 8 } }]);
});

test("keeps strict source light-ink filtering but reports dense rendered light ink for validation", () => {
  const width = 100, height = 100;
  const source = (() => {
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 20; y < 40; y += 1) for (let x = 10; x < 45; x += 1) rgba.set([20, 40, 90, 255], (y * width + x) * 4);
    for (let y = 24; y < 32; y += 1) for (let x = 16; x < 34; x += 1) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
    return { width, height, rgba };
  })();
  const rendered = (() => {
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rgba.set([20, 40, 90, 255], (y * width + x) * 4);
    for (let y = 20; y < 40; y += 1) for (let x = 10; x < 45; x += 1) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
    return { width, height, rgba };
  })();
  const textBox = { id: "white", box: { x: 10, y: 20, w: 35, h: 20 }, font: { color: "#FFFFFF" } };
  const result = measureTextInkGeometry({
    slideSize: { widthPt: 100, heightPt: 100 },
    sourceImage: source,
    renderedImage: rendered,
    textBoxes: [textBox]
  });
  assert.deepEqual(result.measurements, [{ id: "white", source: { x: 16, y: 24, w: 18, h: 8 }, rendered: { x: 10, y: 20, w: 35, h: 20 } }]);

  assert.deepEqual(measureTextInkGeometry({
    slideSize: { widthPt: 100, heightPt: 100 },
    sourceImage: rendered,
    renderedImage: rendered,
    textBoxes: [textBox]
  }).measurements, []);
});

test("uses component quality boxes to avoid same-color decoration in the wider text box", () => {
  const width = 100, height = 100;
  const image = () => {
    const rgba = Buffer.alloc(width * height * 4, 255);
    for (let y = 20; y < 38; y += 1) for (let x = 10; x < 70; x += 1) rgba.set([20, 30, 40, 255], (y * width + x) * 4);
    for (let y = 24; y < 32; y += 1) for (let x = 16; x < 34; x += 1) rgba.set([255, 255, 255, 255], (y * width + x) * 4);
    return { width, height, rgba };
  };
  const result = measureTextInkGeometry({
    slideSize: { widthPt: 100, heightPt: 100 },
    sourceImage: image(),
    renderedImage: image(),
    textBoxes: [{
      id: "label",
      box: { x: 10, y: 20, w: 60, h: 18 },
      font: { color: "#FFFFFF" },
      source: { componentQualityBox: { x: 14, y: 22, w: 24, h: 12 } }
    }]
  });

  assert.deepEqual(result.measurements, [{ id: "label", source: { x: 16, y: 24, w: 18, h: 8 }, rendered: { x: 16, y: 24, w: 18, h: 8 } }]);
});

test("invalid rasters, mismatched aspect ratio and ambiguous ids are rejected", () => {
  const input = fixture();
  for (const sourceImage of [null, { width: 100, height: 100, rgba: Buffer.alloc(3) }, { width: Infinity, height: 1, rgba: Buffer.alloc(4) }]) {
    assert.throws(() => measureTextInkGeometry({ ...input, sourceImage }), /raster is invalid/u);
  }
  assert.throws(() => measureTextInkGeometry(null), /request is invalid/u);
  assert.throws(() => measureTextInkGeometry({ ...input, renderedImage: { width: 10, height: 1, rgba: Buffer.alloc(40) } }), /aspect ratios/u);
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes: [input.textBoxes[0], input.textBoxes[0]] }), /ambiguous/u);
});

test("unsafe color, invalid and out-of-slide boxes are ignored rather than sampled", () => {
  const input = fixture(), original = input.textBoxes[0];
  const textBoxes = [null, { ...original, font: { color: "#000000; arbitrary" } }, { ...original, box: { x: -1, y: 0, w: 3, h: 3 } }, { ...original, box: { x: 99, y: 99, w: 3, h: 3 } }];
  assert.deepEqual(measureTextInkGeometry({ ...input, textBoxes }), { measurements: [], samples: 0 });
});

test("aggregate sampling and object-count limits reject extreme input before pixel traversal", () => {
  const input = fixture();
  const textBoxes = Array.from({ length: 500 }, (_, index) => ({ id: `text-${index}`, box: { x: 0, y: 0, w: 100, h: 100 }, font: { color: "#141e28" } }));
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes }), /sampling exceeds/u);
  assert.throws(() => measureTextInkGeometry({ ...input, textBoxes: Array(2001).fill(null) }), /request is invalid/u);
});

for (const side of ["left", "right", "top", "bottom"]) {
  for (const target of ["sourceImage", "renderedImage"]) {
    test(`rejects ${target} ink censored at the ${side} OCR window boundary`, () => {
      const input = fixture();
      const image = input[target];
      const scale = target === "sourceImage" ? 1 : 2;
      image.rgba.fill(255);
      const bounds = { left: 12, right: 32, top: 22, bottom: 30 };
      if (side === "left") bounds.left = 6;
      if (side === "right") bounds.right = 44;
      if (side === "top") bounds.top = 16;
      if (side === "bottom") bounds.bottom = 40;
      for (let y = bounds.top * scale; y < bounds.bottom * scale; y++) {
        for (let x = bounds.left * scale; x < bounds.right * scale; x++) {
          image.rgba.set([20, 30, 40, 255], (y * image.width + x) * 4);
        }
      }
      const before = Buffer.from(image.rgba);
      const result = measureTextInkGeometry(input);
      assert.deepEqual(result.measurements, []);
      assert.ok(result.samples > 0);
      assert.deepEqual(image.rgba, before);
    });
  }
}

test("rejects ink truncated by the slide edge instead of claiming complete geometry", () => {
  const input = fixture();
  input.textBoxes[0].box = { x: 0, y: 20, w: 40, h: 15 };
  for (let y = 22; y < 30; y++) for (let x = 0; x < 32; x++) {
    input.sourceImage.rgba.set([20, 30, 40, 255], (y * 100 + x) * 4);
  }
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
});

test("keeps complete ink one pixel inside the sampling boundary eligible", () => {
  const input = fixture();
  input.sourceImage.rgba.fill(255);
  for (let y = 22; y < 30; y++) for (let x = 9; x < 41; x++) {
    input.sourceImage.rgba.set([20, 30, 40, 255], (y * 100 + x) * 4);
  }
  assert.deepEqual(measureTextInkGeometry(input).measurements[0].source, { x: 9, y: 22, w: 32, h: 8 });
});

function sourceFixture(right = 44) {
  const input = fixture();
  input.textBoxes[0].source = { evidenceBox: { ...input.textBoxes[0].box } };
  input.sourceImage.rgba.fill(255);
  for (let y = 22; y < 30; y++) for (let x = 12; x < right; x++) {
    input.sourceImage.rgba.set([20, 30, 40, 255], (y * 100 + x) * 4);
  }
  return input;
}

test("source-only measurement recovers clipped OCR ink with one bounded disjoint retry", () => {
  const input = sourceFixture(), before = Buffer.from(input.sourceImage.rgba), texts = structuredClone(input.textBoxes);
  assert.deepEqual(measureTextInkGeometry(input).measurements, []);
  const result = measureSourceTextInkGeometry(input);
  assert.deepEqual(result.measurements, [{ id: "text", source: { x: 12, y: 22, w: 32, h: 8 } }]);
  assert.equal(result.samples, 34 * 19 + 40 * 19);
  assert.deepEqual(input.sourceImage.rgba, before);
  assert.deepEqual(input.textBoxes, texts);
});

test("source-only measurement leaves complete ink on its original bounded window", () => {
  const input = fixture();
  input.textBoxes[0].source = { evidenceBox: { ...input.textBoxes[0].box } };
  const result = measureSourceTextInkGeometry(input);
  assert.equal(result.samples, 34 * 19);
  assert.deepEqual(result.measurements, [{ id: "text", source: { x: 12, y: 22, w: 20, h: 8 } }]);
});

test("source expansion refuses neighboring ownership even for unmeasurable or differently colored text", () => {
  for (const font of [undefined, { color: "#abcdef" }, { color: "invalid" }]) {
    const input = sourceFixture();
    input.textBoxes.push({ id: "neighbor", box: { x: 47, y: 20, w: 12, h: 15 }, font });
    assert.deepEqual(measureSourceTextInkGeometry(input).measurements.filter(row => row.id === "text"), []);
  }
});

test("source expansion never crosses the retry boundary or trusts a frame without OCR evidence", () => {
  const input = sourceFixture(55);
  assert.deepEqual(measureSourceTextInkGeometry(input).measurements, []);
  const frameOnly = sourceFixture();
  delete frameOnly.textBoxes[0].source;
  assert.deepEqual(measureSourceTextInkGeometry(frameOnly).measurements, []);
});

test("source ownership rejects overlapping seeds even when the color union does not touch an edge", () => {
  const input = fixture();
  input.textBoxes.push({ id: "neighbor", box: { x: 25, y: 20, w: 15, h: 15 }, font: { color: "#141e28" } });
  assert.deepEqual(measureSourceTextInkGeometry(input).measurements, []);
});

test("disjoint OCR seeds share background padding without losing independent source measurements", () => {
  for (const vertical of [false, true]) for (const scale of [1, 2, 3]) for (const gapPx of [0, 0.5, 1, 1.99, 2]) {
    const input = fixture();
    const first = { x: 10, y: 20, w: 30, h: 15 };
    const gap = gapPx / scale;
    const second = vertical ? { x: 10, y: 35 + gap, w: 30, h: 15 } : { x: 40 + gap, y: 20, w: 30, h: 15 };
    input.sourceImage = { width: 100 * scale, height: 100 * scale, rgba: Buffer.alloc(40000 * scale * scale, 255) };
    input.textBoxes = [first, second].map((box, i) => ({ id: `text-${i}`, box: { ...box }, source: { evidenceBox: { ...box } }, font: { color: "#141e28" } }));
    for (const b of [first, second]) for (let y = Math.ceil((b.y + 2) * scale); y < Math.ceil((b.y + 10) * scale); y++) for (let x = Math.ceil((b.x + 2) * scale); x < Math.ceil((b.x + 22) * scale); x++) {
      input.sourceImage.rgba.set([20, 30, 40, 255], (y * input.sourceImage.width + x) * 4);
    }
    const bytes = Buffer.from(input.sourceImage.rgba), texts = structuredClone(input.textBoxes);
    const result = measureSourceTextInkGeometry(input);
    assert.deepEqual(result.measurements.map(row => row.source), [first, second].map(b => ({ x: Math.ceil((b.x + 2) * scale) / scale, y: Math.ceil((b.y + 2) * scale) / scale, w: 20, h: 8 })));
    assert.deepEqual(measureSourceTextInkGeometry({ ...input, textBoxes: [...input.textBoxes].reverse() }).measurements, [...result.measurements].reverse());
    assert.deepEqual(input.sourceImage.rgba, bytes); assert.deepEqual(input.textBoxes, texts);
  }
});

test("partitioned windows retain rejection for censored ink, overlapping seeds and absent source evidence", () => {
  const input = fixture();
  input.textBoxes[0].source = { evidenceBox: { ...input.textBoxes[0].box } };
  const neighbor = { id: "neighbor", box: { x: 42, y: 20, w: 30, h: 15 }, source: { evidenceBox: { x: 42, y: 20, w: 30, h: 15 } }, font: { color: "#141e28" } };
  input.textBoxes.push(neighbor);
  for (let x = 32; x < 45; x++) input.sourceImage.rgba.set([20, 30, 40, 255], (24 * 100 + x) * 4);
  assert.deepEqual(measureSourceTextInkGeometry(input).measurements, [], "crossing ink touches the partition and cannot gain ownership");
  input.sourceImage = fixture().sourceImage;
  delete neighbor.source;
  assert.deepEqual(measureSourceTextInkGeometry(input).measurements, [], "a frame alone cannot authorize padding partition");
  neighbor.source = { evidenceBox: { x: 39, y: 20, w: 30, h: 15 } };
  assert.deepEqual(measureSourceTextInkGeometry(input).measurements, [], "overlapping source seeds remain ambiguous");
});

test("subpixel seed overlap and ink crossing a zero-gap partition remain ambiguous", () => {
  for (const vertical of [false, true]) for (const scale of [1, 2, 3]) {
    const first = { x: 10, y: 20, w: 30, h: 15 };
    for (const overlap of [0.01, 0.5, 1]) {
      const second = vertical ? { x: 10, y: 35 - overlap / scale, w: 30, h: 15 }
        : { x: 40 - overlap / scale, y: 20, w: 30, h: 15 };
      const input = fixture();
      input.sourceImage = { width: 100 * scale, height: 100 * scale, rgba: Buffer.alloc(40000 * scale * scale, 255) };
      input.textBoxes = [first, second].map((box, i) => ({ id: `text-${i}`, box, source: { evidenceBox: { ...box } }, font: { color: "#141e28" } }));
      assert.deepEqual(measureSourceTextInkGeometry(input).measurements, []);
    }
    const second = vertical ? { x: 10, y: 35, w: 30, h: 15 } : { x: 40, y: 20, w: 30, h: 15 };
    const input = fixture();
    input.sourceImage = { width: 100 * scale, height: 100 * scale, rgba: Buffer.alloc(40000 * scale * scale, 255) };
    input.textBoxes = [first, second].map((box, i) => ({ id: `text-${i}`, box, source: { evidenceBox: { ...box } }, font: { color: "#141e28" } }));
    for (let along = 30 * scale; along < 45 * scale; along++) for (let across = 22 * scale; across < 25 * scale; across++) {
      const x = vertical ? across : along, y = vertical ? along : across;
      input.sourceImage.rgba.set([20, 30, 40, 255], (y * input.sourceImage.width + x) * 4);
    }
    assert.deepEqual(measureSourceTextInkGeometry(input).measurements, []);
  }
});

test("source-only measurement rejects ambiguous, malformed and oversized inputs", () => {
  const input = sourceFixture();
  assert.throws(() => measureSourceTextInkGeometry(null), /request is invalid/u);
  assert.throws(() => measureSourceTextInkGeometry({ ...input, sourceImage: null }), /raster is invalid/u);
  assert.throws(() => measureSourceTextInkGeometry({ ...input, textBoxes: [input.textBoxes[0], input.textBoxes[0]] }), /ambiguous/u);
  assert.throws(() => measureSourceTextInkGeometry({ ...input, textBoxes: Array(2001).fill(null) }), /request is invalid/u);
  const big = { width: 1000, height: 1000, rgba: Buffer.alloc(4_000_000, 255) };
  const boxes = Array.from({ length: 21 }, (_, index) => ({ id: String(index), box: { x: 0, y: 0, w: 100, h: 100 }, font: { color: "#141e28" } }));
  assert.throws(() => measureSourceTextInkGeometry({ ...input, sourceImage: big, textBoxes: boxes }), /processing boundary/u);
  assert.deepEqual(measureSourceTextInkGeometry({ ...input, textBoxes: [] }), { measurements: [], samples: 0 });
});
