"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const iconEvidence = require("../packages/slideclone-core/ocr-source-icon-evidence");
const { hasSourceIconEvidence } = iconEvidence;
const { sourceGraphicEvidence } = require("../packages/slideclone-core/ocr-source-graphic-evidence");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/ocr-source-deck");

function fixture({ size = 96, x = 24, y = 24, ink = [25, 25, 25], fill = [215, 230, 242], text = "G", confidence = 0.57 } = {}) {
  const width = x + size * 3, height = y + size * 3;
  const image = { width, height, rgba: Buffer.alloc(width * height * 4, 255) };
  const paint = (px, py, color) => image.rgba.set([...color, 255], (py * width + px) * 4);
  for (let py = y; py < y + size; py += 1) for (let px = x; px < x + size; px += 1) {
    const u = (px - x) / size, v = (py - y) / size;
    const head = ((u - 0.43) / 0.18) ** 2 + ((v - 0.26) / 0.18) ** 2;
    const body = ((u - 0.43) / 0.34) ** 2 + ((v - 0.79) / 0.33) ** 2;
    if (head <= 1 || (body <= 1 && v <= 0.85)) {
      paint(px, py, head > 0.76 && head <= 1 || body > 0.76 && body <= 1 || v >= 0.82 ? ink : fill);
    }
    const side = ((u - 0.76) / 0.17) ** 2 + ((v - 0.73) / 0.17) ** 2;
    if (side <= 1) paint(px, py, side > 0.72 ? ink : fill);
  }
  const line = { text, confidence, box: { x, y, w: size, h: size } };
  const lines = Array.from({ length: 4 }, (_, index) => ({ text: `Reference ${index}`, confidence: 0.99,
    box: { x: x + size * 1.8, y: y + size * 1.6 + index * size * 0.28, w: size, h: size / 5 } })).concat([line]);
  return { image, line, lines, referenceHeight: size / 5 };
}

function deckInput(input) {
  return { metadata: { dimensions: { widthPx: input.image.width, heightPx: input.image.height } },
    sourceImage: "assets/source.png", sourceRaster: input.image, preserveUncertainGlyphs: true, ocr: { lines: input.lines } };
}

function candidateCrop(input) {
  const { x, y, w, h } = input.line.box;
  const rgba = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row += 1) {
    const start = ((y + row) * input.image.width + x) * 4;
    rgba.set(input.image.rgba.subarray(start, start + w * 4), row * w * 4);
  }
  return { width: w, height: h, rgba };
}

test("a closed multipart outline icon routes arbitrary single OCR characters with bounded evidence", () => {
  for (const options of [{}, { size: 64, x: 7, y: 11, text: "7" },
    { size: 128, x: 35, y: 13, text: "\u4e2d", ink: [80, 15, 75], fill: [228, 220, 226] }]) {
    const input = fixture(options), before = structuredClone(input);
    const evidence = sourceGraphicEvidence(input);
    assert.ok(evidence, JSON.stringify(options));
    assert.ok(evidence.reasons.includes("isolated-multipart-source-ink"));
    assert.ok(evidence.scannedPixels <= 262144);
    assert.ok(evidence.tightenedPixelBox.w < input.line.box.w || evidence.tightenedPixelBox.h < input.line.box.h);
    assert.deepEqual(input.image.rgba, Buffer.from(before.image.rgba));
    assert.deepEqual(input.lines, before.lines);
    const deck = boundedOcrSourceDeck(deckInput(input));
    assert.equal(deck.meta.ocrAdmission.rasterFallbackGlyphs, 1);
    assert.equal(deck.pages[0].textBoxes.some(item => item.text === input.line.text), false);
    assert.equal(deck.pages[0].textBoxes.length, input.lines.length - 1);
    assert.equal(boundedOcrSourceDeck({ ...deckInput(input), preserveUncertainGlyphs: false }).pages[0].textBoxes.length, input.lines.length);
    const serialized = JSON.stringify(evidence);
    assert.equal(serialized.includes('"text"'), false);
    assert.equal(serialized.includes("provider"), false);
    assert.equal(serialized.includes("color"), false);
  }
});

test("native topology does not bypass confidence, text rows, candidate size, or empty source", () => {
  const base = fixture();
  for (const text of ["", " ", "GG", ".", "\u0007", "\u007f"]) {
    assert.equal(sourceGraphicEvidence({ ...base, line: { ...base.line, text } }), null);
  }
  for (const confidence of [0.72, 0.9, 1]) assert.equal(sourceGraphicEvidence({ ...base, line: { ...base.line, confidence } }), null);
  const sameRow = { text: "Label", confidence: 0.99, box: { x: base.line.box.x + base.line.box.w + 3,
    y: base.line.box.y + base.line.box.h / 2 - 9, w: 60, h: 18 } };
  for (const text of ["Label", "5", "Z"]) {
    assert.equal(sourceGraphicEvidence({ ...base, lines: base.lines.concat([{ ...sameRow, text }]) }), null);
  }
  assert.equal(sourceGraphicEvidence({ ...base, referenceHeight: base.line.box.h }), null);
  assert.equal(sourceGraphicEvidence({ ...base, image: { ...base.image, rgba: Buffer.alloc(base.image.rgba.length, 255) } }), null);
  assert.equal(sourceGraphicEvidence({ ...base, image: { ...base.image, rgba: Buffer.alloc(base.image.rgba.length) } }), null);
});

test("classifier work stays inside the scan budget and failures remain visible", (t) => {
  const input = fixture(), evidence = sourceGraphicEvidence(input);
  assert.ok(evidence);
  assert.equal(sourceGraphicEvidence({ ...input, maxScanPixels: evidence.scannedPixels - 1 }), null);
  assert.ok(sourceGraphicEvidence({ ...input, maxScanPixels: evidence.scannedPixels }));
  let calls = 0;
  t.mock.method(iconEvidence, "hasSourceIconEvidence", () => { calls += 1; throw new Error("detector failed"); });
  assert.equal(sourceGraphicEvidence({ ...input, maxScanPixels: 1 }), null);
  assert.equal(calls, 0);
  assert.throws(() => sourceGraphicEvidence(input), /detector failed/u);
  assert.equal(calls, 1);
});

test("aggregate source routing admits only the candidates covered by its pixel budget", () => {
  const input = fixture(), evidence = sourceGraphicEvidence(input);
  assert.ok(evidence);
  const count = 180;
  const value = deckInput({ ...input, lines: input.lines.slice(0, 4).concat(Array.from({ length: count }, () => ({ ...input.line }))) });
  const deck = boundedOcrSourceDeck(value);
  const covered = Math.min(count, Math.floor(4_000_000 / evidence.scannedPixels));
  assert.equal(deck.meta.ocrAdmission.rasterFallbackGlyphs, covered);
  assert.equal(deck.pages[0].textBoxes.length, count + 4 - covered);
});

test("negative topology scans consume the same aggregate budget as positive scans", (t) => {
  const input = fixture();
  const positive = sourceGraphicEvidence(input);
  assert.ok(positive);
  // Two equal rounded counters have no head/torso topology. They stay text,
  // but proving that still reads the candidate's source pixels.
  const { x, y, w, h } = input.line.box;
  input.image.rgba.fill(255);
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) {
    const radius = Math.min(...[0.25, 0.75].map(center =>
      ((col - x - w / 2) / (w * 0.2)) ** 2 + ((row - y - h * center) / (h * 0.18)) ** 2));
    if (radius <= 1) input.image.rgba.set(radius > 0.75 ? [25, 25, 25, 255] : [225, 225, 225, 255], (row * input.image.width + col) * 4);
  }
  assert.equal(sourceGraphicEvidence(input), null);
  const detector = iconEvidence.hasSourceIconEvidence;
  let calls = 0;
  t.mock.method(iconEvidence, "hasSourceIconEvidence", (crop) => { calls++; return detector(crop); });
  const count = 400;
  const output = boundedOcrSourceDeck(deckInput({ ...input,
    lines: input.lines.slice(0, 4).concat(Array.from({ length: count }, () => ({ ...input.line }))) }));
  assert.equal(calls, Math.min(count, Math.floor(4_000_000 / positive.scannedPixels)));
  assert.equal(output.meta.ocrAdmission.rasterFallbackGlyphs, 0);
  assert.equal(output.pages[0].textBoxes.length, count + 4);
});

test("only source geometry supplies evidence and a clipped or missing outline remains ambiguous", () => {
  const image = candidateCrop(fixture());
  assert.equal(hasSourceIconEvidence(image), true);
  assert.equal(hasSourceIconEvidence({ ...image, evidence: { kind: "team", hasPerson: true } }), true);
  const blank = { ...image, rgba: Buffer.alloc(image.rgba.length, 255), evidence: { kind: "team", hasPerson: true } };
  assert.equal(hasSourceIconEvidence(blank), false);
  for (const x of [0, Math.floor(image.width * 0.43)]) {
    const broken = { ...image, rgba: Buffer.from(image.rgba) };
    for (let y = 0; y < image.height / 2; y += 1) broken.rgba.fill(255, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
    if (x > 0) assert.equal(hasSourceIconEvidence(broken), false);
  }
  const open = { ...image, rgba: Buffer.from(image.rgba) };
  for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
    if (y >= image.height * 0.8 && y <= image.height * 0.86) open.rgba.fill(255, (y * image.width + x) * 4, (y * image.width + x) * 4 + 4);
  }
  assert.equal(hasSourceIconEvidence(open), false);
});

test("crop admission rejects empty, malformed, extreme, proxy, and accessor inputs without user code", () => {
  let executed = false;
  const image = { width: 48, height: 48, rgba: Buffer.alloc(48 * 48 * 4, 255) };
  const accessor = Object.defineProperty({}, "width", { get() { executed = true; return 48; } });
  const proxy = new Proxy(image, { get() { executed = true; throw new Error("unsafe"); } });
  for (const value of [null, {}, [], accessor, proxy, { ...image, width: 0 }, { ...image, width: NaN },
    { ...image, width: 513 }, { ...image, height: 23 }, { ...image, rgba: Buffer.alloc(4) },
    { ...image, rgba: new Proxy(image.rgba, {}) }]) {
    assert.equal(hasSourceIconEvidence(value), false);
  }
  assert.equal(executed, false);
  const crop = candidateCrop(fixture());
  Object.defineProperty(crop.rgba, "length", { get() { executed = true; throw new Error("unsafe"); } });
  crop.rgba.subarray = () => { executed = true; throw new Error("unsafe"); };
  assert.equal(hasSourceIconEvidence(crop), true);
  assert.equal(executed, false);
});

test("real alphabet and digit strokes stay text across low confidence and monochrome or chromatic ink", () => {
  const glyphs = {
    A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
    D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
    G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
    J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
    M: [17, 27, 21, 21, 17, 17, 17], N: [17, 25, 21, 19, 17, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
    P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
    S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
    V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
    Y: [17, 17, 10, 4, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
    0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
    3: [30, 1, 1, 14, 1, 1, 30], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 16, 30, 1, 1, 30],
    6: [14, 16, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
    9: [14, 17, 17, 15, 1, 1, 14], i: [4, 0, 12, 4, 4, 4, 14], j: [2, 0, 6, 2, 2, 18, 12],
    g: [0, 14, 17, 17, 15, 1, 14]
  };
  for (const [text, rows] of Object.entries(glyphs)) for (const ink of [[20, 20, 20], [15, 95, 190]]) {
    const input = fixture({ text });
    input.image.rgba.fill(255);
    for (let y = 0; y < 7; y += 1) for (let x = 0; x < 5; x += 1) {
      if (!(rows[y] & (1 << (4 - x)))) continue;
      for (let dy = 0; dy < 8; dy += 1) for (let dx = 0; dx < 8; dx += 1) {
        const offset = ((input.line.box.y + 16 + y * 8 + dy) * input.image.width + input.line.box.x + 24 + x * 8 + dx) * 4;
        input.image.rgba.set([...ink, 255], offset);
      }
    }
    assert.equal(hasSourceIconEvidence(candidateCrop(input)), false, text);
    for (const confidence of [0.24, 0.57]) {
      input.line.confidence = confidence;
      assert.equal(sourceGraphicEvidence(input), null, `${text}: ${confidence}: ${ink}`);
    }
    assert.equal(boundedOcrSourceDeck(deckInput(input)).meta.ocrAdmission.rasterFallbackGlyphs, 0, text);
  }
});

test("rounded stacked counters do not supply a flat torso, including a wider lower loop", () => {
  const image = { width: 160, height: 160, rgba: Buffer.alloc(160 * 160 * 4, 255) };
  for (const lowerWidth of [25, 40]) {
    image.rgba.fill(255);
    for (let y = 0; y < image.height; y += 1) for (let x = 0; x < image.width; x += 1) {
      const upper = ((x - 80) / 25) ** 2 + ((y - 42) / 25) ** 2;
      const lower = ((x - 80) / lowerWidth) ** 2 + ((y - 102) / 28) ** 2;
      if (upper <= 1 && upper >= 0.65 || lower <= 1 && lower >= 0.65) image.rgba.set([25, 25, 25, 255], (y * image.width + x) * 4);
    }
    assert.equal(hasSourceIconEvidence(image), false);
  }
});

test("excessive closed details and low-contrast outlines fail closed", () => {
  const image = { width: 512, height: 512, rgba: Buffer.alloc(512 * 512 * 4, 255) };
  for (let y = 12; y < 490; y += 20) for (let x = 12; x < 490; x += 20) {
    for (let dy = 0; dy < 12; dy += 1) for (let dx = 0; dx < 12; dx += 1) {
      if (dx === 0 || dy === 0 || dx === 11 || dy === 11) image.rgba.set([25, 25, 25, 255], ((y + dy) * 512 + x + dx) * 4);
    }
  }
  assert.equal(hasSourceIconEvidence(image), false);
  const lowContrast = candidateCrop(fixture({ ink: [230, 230, 230], fill: [245, 245, 245] }));
  assert.equal(hasSourceIconEvidence(lowContrast), false);
});
