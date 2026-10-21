"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectLeadingIconCropCandidates: detect, LEADING_ICON_CROP_LIMITS: limits } = require("../packages/slideclone-core/leading-icon-crop-evidence");
const primitiveEvidence = require("../packages/slideclone-core/source-icon-primitive-evidence");
const { discoverTestFiles } = require("../scripts/test-sharded");
const path = require("node:path");

function fill(image, box, rgba) {
  for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) {
    if (x >= 0 && y >= 0 && x < image.width && y < image.height) image.rgba.set(rgba, (y * image.width + x) * 4);
  }
}
function icon(image, x, y, scale = 1, ink = [24, 70, 120, 255], detail = [170, 45, 80, 255]) {
  fill(image, { x: x + 10 * scale, y, w: 10 * scale, h: 30 * scale }, ink);
  fill(image, { x, y: y + 10 * scale, w: 30 * scale, h: 10 * scale }, ink);
  fill(image, { x: x + 3 * scale, y: y + 4 * scale, w: 3 * scale, h: 3 * scale }, detail);
  fill(image, { x: x + 24 * scale, y: y + 24 * scale, w: 3 * scale, h: 3 * scale }, detail);
}
function fixture(options = {}) {
  const { scale = 1, x = 100 * scale, y = 90 * scale, background = [255, 255, 255, 255], ink, detail } = options;
  const image = { width: 480 * scale, height: 320 * scale, rgba: Buffer.alloc(480 * 320 * scale * scale * 4) };
  fill(image, { x: 0, y: 0, w: image.width, h: image.height }, background);
  icon(image, x, y, scale, ink, detail);
  const textBoxes = [{ text: "private-user-label", box: { x: x + 48 * scale, y: y + 6 * scale, w: 140 * scale, h: 20 * scale } }];
  return { image, textBoxes, slideSize: { widthPt: image.width, heightPt: image.height }, x, y, scale, background };
}

test("leading icon detection expands real source ink and encloses all independent interior details", () => {
  const input = fixture(), before = Buffer.from(input.image.rgba), result = detect(input);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].pixelBox, { x: input.x - 1, y: input.y - 1, w: 32, h: 32 });
  assert.deepEqual(result[0].box, result[0].pixelBox);
  assert.equal(result[0].sourceEvidence.connectedComponents, 3);
  assert.equal(result[0].sourceEvidence.foregroundPixels, 518);
  assert.equal(result[0].sourceEvidence.independentSourceROI, true);
  assert.equal(result[0].sourceEvidence.cropEvidenceRequired, true);
  assert.equal(result[0].sourceEvidence.backgroundAgreement, 1);
  assert.deepEqual(result[0].sourceEvidence.mappedPixelBox, result[0].pixelBox);
  assert.equal(JSON.stringify(result).includes("private-user-label"), false);
  assert.deepEqual(input.image.rgba, before);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result[0]));
  assert.ok(Object.isFrozen(result[0].box)); assert.ok(Object.isFrozen(result[0].sourceEvidence));
  assert.throws(() => { result[0].pixelBox.x = 0; }, TypeError);
});

test("geometry, resolution, label wording and arbitrary source colors do not specialize the detector", () => {
  for (const options of [{}, { x: 240, y: 190 }, { scale: 2 }, { scale: 4 },
    { background: [26, 32, 48, 255], ink: [225, 160, 70, 255], detail: [140, 240, 170, 255] },
    { background: [160, 165, 170, 255], ink: [20, 25, 30, 255], detail: [225, 30, 95, 255] },
    { background: [0, 0, 0, 0], ink: [30, 150, 90, 180], detail: [230, 60, 120, 170] }]) {
    const input = fixture(options);
    for (const text of ["1", "Anything", "任意文字"]) {
      input.textBoxes[0].text = text;
      const result = detect(input);
      assert.equal(result.length, 1, JSON.stringify(options));
      assert.deepEqual(result[0].pixelBox, { x: input.x - 1, y: input.y - 1, w: input.scale * 30 + 2, h: input.scale * 30 + 2 });
    }
  }
  const input = fixture(); input.slideSize = { widthPt: 960, heightPt: 640 };
  input.textBoxes[0].box = { x: 296, y: 192, w: 280, h: 40 };
  assert.deepEqual(detect(input)[0].box, { x: 198, y: 178, w: 64, h: 64 });
});

test("empty, invisible, background-only and detached-from-label source regions produce no candidates", () => {
  const input = fixture();
  assert.deepEqual(detect({ ...input, textBoxes: [] }), []);
  assert.deepEqual(detect({ ...input, textBoxes: [{ ...input.textBoxes[0], text: "  " }] }), []);
  assert.deepEqual(detect({ ...input, textBoxes: [{ ...input.textBoxes[0], visible: false }] }), []);
  fill(input.image, { x: 0, y: 0, w: input.image.width, h: input.image.height }, input.background);
  assert.deepEqual(detect(input), []);
  icon(input.image, 20, 250);
  assert.deepEqual(detect(input), []);
});
test("isolated punctuation and list bullets remain text marks under translation, scale and noise",()=>{
  for(const scale of [1,2,4]) for(const label of ["Anything","任意正文"]) {
    const input=fixture({scale,x:120*scale,y:100*scale});
    fill(input.image,{x:0,y:0,w:input.image.width,h:input.image.height},input.background);
    fill(input.image,{x:input.x,y:input.y+6*scale,w:8*scale,h:7*scale},[24,70,120,255]);
    fill(input.image,{x:input.x+1*scale,y:input.y+7*scale,w:2*scale,h:2*scale},[250,250,250,255]);
    input.textBoxes[0].text=label;
    assert.deepEqual(detect(input),[]);
  }
});

test("source attachment to body text, other text, connectors or large containers is rejected", () => {
  for (const kind of ["body", "other-text", "thin-tail", "container", "window-edge"]) {
    const input = fixture();
    if (kind === "body") fill(input.image, { x: 120, y: 103, w: 110, h: 2 }, [24, 70, 120, 255]);
    if (kind === "other-text") input.textBoxes.push({ text: "Owned", box: { x: 105, y: 91, w: 20, h: 12 } });
    if (kind === "thin-tail") fill(input.image, { x: 129, y: 104, w: 14, h: 1 }, [24, 70, 120, 255]);
    if (kind === "container") fill(input.image, { x: 50, y: 65, w: 110, h: 90 }, [24, 70, 120, 255]);
    if (kind === "window-edge") fill(input.image, { x: 48, y: 103, w: 60, h: 1 }, [24, 70, 120, 255]);
    assert.deepEqual(detect(input), [], kind);
  }
});

test("truncated outlines, image-edge ink and ambiguous neighboring contours are never cropped", () => {
  const clipped = fixture();
  fill(clipped.image, { x: 110, y: 0, w: 10, h: 105 }, [24, 70, 120, 255]);
  assert.deepEqual(detect(clipped), []);
  const edge = fixture({ x: 0 });
  assert.deepEqual(detect(edge), []);
  const touchingText = fixture();
  fill(touchingText.image, { x: 131, y: 104, w: 16, h: 3 }, [80, 100, 130, 255]);
  assert.deepEqual(detect(touchingText), []);
});

test("only actual small overlapping primitives suppress duplication; page containers and metadata lines do not", () => {
  const input = fixture();
  const iconBox = { x: input.x, y: input.y, w: 30, h: 30 };
  for (const type of ["rect", "ellipse"]) assert.deepEqual(detect({ ...input, existingShapes: [{ type, box: iconBox }] }), []);
  for (const shape of [{ type: "rect", box: { x: 0, y: 0, w: 480, h: 320 } },
    { type: "rect", box: { x: 50, y: 65, w: 160, h: 90 } },
    { type: "rect", box: { x: 250, y: 90, w: 30, h: 30 } },
    { type: "line", box: { x: 85, y: 105, w: 80, h: 0 } }])
    assert.equal(detect({ ...input, existingShapes: [shape] }).length, 1);
});

test("source-proven rect and ellipse regions remain on the native primitive path", () => {
  for (const type of ["rect", "ellipse"]) {
    const input = fixture();
    fill(input.image, { x: 0, y: 0, w: input.image.width, h: input.image.height }, input.background);
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
      if (type === "ellipse" && ((x + 0.5 - 15) / 15) ** 2 + ((y + 0.5 - 15) / 15) ** 2 > 1) continue;
      fill(input.image, { x: input.x + x, y: input.y + y, w: 1, h: 1 }, [24, 70, 120, 255]);
    }
    assert.deepEqual(detect(input), [], type);
  }
});

test("a primitive inside a complex icon cannot reject its complete source ROI; helper failures propagate", t => {
  const input = fixture();
  t.mock.method(primitiveEvidence, "sourceIconPrimitiveEvidence", () => ({ type: "rect", outlineAgreement: 1,
    pixelBox: { x: 110, y: 100, w: 10, h: 10 } }));
  assert.equal(detect(input).length, 1);
  t.mock.restoreAll();
  t.mock.method(primitiveEvidence, "sourceIconPrimitiveEvidence", () => { throw new Error("primitive detector failed"); });
  assert.throws(() => detect(input), /primitive detector failed/);
});

test("duplicate label neighborhoods do not split icons, and independently isolated icons remain separate", () => {
  const input = fixture(); input.textBoxes.push(structuredClone(input.textBoxes[0]));
  assert.equal(detect(input).length, 1);
  icon(input.image, 280, 210, 1, [90, 40, 150, 255]);
  input.textBoxes.push({ text: "Another", box: { x: 328, y: 216, w: 100, h: 20 } });
  const result = detect(input);
  assert.equal(result.length, 2);
  assert.deepEqual(result.map(candidate => candidate.pixelBox), [
    { x: 99, y: 89, w: 32, h: 32 }, { x: 279, y: 209, w: 32, h: 32 }
  ]);
});

test("scan budgets reject the entire request rather than silently returning incomplete candidates", () => {
  const input = fixture(), result = detect(input), scanned = result[0].sourceEvidence.scannedPixels;
  assert.deepEqual(detect({ ...input, maxScanPixels: scanned - 1 }), []);
  assert.equal(detect({ ...input, maxScanPixels: scanned }).length, 1);
  for (const maxScanPixels of [null, 0, -1, NaN, Infinity, "100", 1.5, limits.scanPixels + 1])
    assert.deepEqual(detect({ ...input, maxScanPixels }), []);
  assert.deepEqual(detect({ ...input, textBoxes: Array.from({ length: limits.textBoxes + 1 }, () => input.textBoxes[0]) }), []);
  assert.deepEqual(detect({ ...input, existingShapes: new Array(limits.existingShapes + 1) }), []);
  const oversized = fixture({ scale: 4 });
  oversized.textBoxes[0].box.h = 200;
  assert.deepEqual(detect(oversized), []);
  const second = fixture(); icon(second.image, 280, 210);
  second.textBoxes.push({ text: "Another", box: { x: 328, y: 216, w: 100, h: 20 } });
  assert.deepEqual(detect({ ...second, maxScanPixels: scanned }), []);
});

test("oversized title neighborhoods do not invalidate smaller icons or lose text ownership", () => {
  const input = fixture();
  const title = { text: "Title", box: { x: 300, y: 20, w: 150, h: 100 } };
  for (const textBoxes of [[title, ...input.textBoxes], [...input.textBoxes, title]]) {
    const result = detect({ ...input, textBoxes });
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].pixelBox, { x: 99, y: 89, w: 32, h: 32 });
  }
  assert.deepEqual(detect({ ...input, textBoxes: [title] }), []);
  assert.deepEqual(detect({ ...input, textBoxes: [
    { ...title, box: { x: 90, y: 20, w: 55, h: 130 } }, ...input.textBoxes
  ] }), []);
});

test("malformed geometry, raster sizes, collection entries and unsupported shared memory fail closed", () => {
  const input = fixture();
  for (const value of [null, [], {}, { ...input, image: null }, { ...input, textBoxes: null }, { ...input, existingShapes: null },
    { ...input, textBoxes: [null] }, { ...input, textBoxes: [{ ...input.textBoxes[0], text: 1 }] },
    { ...input, textBoxes: [{ ...input.textBoxes[0], visible: "true" }] },
    { ...input, slideSize: { widthPt: 0, heightPt: 320 } }, { ...input, slideSize: { widthPt: Infinity, heightPt: 320 } },
    { ...input, existingShapes: [{ type: "rect", box: { x: -1, y: 0, w: 20, h: 20 } }] }])
    assert.deepEqual(detect(value), []);
  for (const change of [{ width: 0 }, { width: 16385 }, { width: 1.5 }, { height: NaN }, { width: 10000, height: 10000 },
    { rgba: Buffer.alloc(4) }, { rgba: new Uint8Array(new SharedArrayBuffer(input.image.rgba.length)) }])
    assert.deepEqual(detect({ ...input, image: { ...input.image, ...change } }), []);
  for (const bounds of [{ x: -1, y: 20, w: 30, h: 20 }, { x: 470, y: 20, w: 30, h: 20 },
    { x: 100, y: 315, w: 30, h: 20 }, { x: 100, y: 20, w: 0, h: 20 }, { x: NaN, y: 20, w: 30, h: 20 }])
    assert.deepEqual(detect({ ...input, textBoxes: [{ ...input.textBoxes[0], box: bounds }] }), []);
});

test("getters, proxy traps, custom array iterators and hostile typed-array methods never execute", () => {
  const input = fixture(); let executed = false;
  const accessor = key => Object.defineProperty({}, key, { get() { executed = true; throw new Error("unsafe"); } });
  const proxy = value => new Proxy(value, { get() { executed = true; throw new Error("unsafe"); }, ownKeys() { executed = true; throw new Error("unsafe"); } });
  for (const value of [proxy(input), accessor("image"), { ...input, image: proxy(input.image) }, { ...input, image: accessor("width") },
    { ...input, slideSize: accessor("widthPt") }, { ...input, textBoxes: proxy(input.textBoxes) },
    { ...input, textBoxes: [accessor("text")] }, { ...input, textBoxes: [{ ...input.textBoxes[0], box: accessor("x") }] },
    { ...input, image: { ...input.image, rgba: proxy(input.image.rgba) } }, { ...input, existingShapes: [accessor("box")] }])
    assert.deepEqual(detect(value), []);
  const collection = [...input.textBoxes];
  Object.defineProperty(collection, Symbol.iterator, { get() { executed = true; throw new Error("unsafe"); } });
  assert.deepEqual(detect({ ...input, textBoxes: collection }), []);
  const sparse = new Array(1); assert.deepEqual(detect({ ...input, textBoxes: sparse }), []);
  Object.defineProperty(input.image.rgba, "length", { get() { executed = true; throw new Error("unsafe"); } });
  input.image.rgba.subarray = () => { executed = true; throw new Error("unsafe"); };
  assert.deepEqual(detect(input), []);
  assert.equal(executed, false);
});

test("the test is automatically included in the unified unit and CI inventories without registration changes", () => {
  const repository = path.resolve(__dirname, "..");
  for (const suite of ["unit", "all"]) assert.ok(discoverTestFiles(repository, suite).some(item => item.file.endsWith("leading-icon-crop-evidence.test.js")));
});

test("2304-pixel pages with 150 text neighborhoods retain isolated icons under the unchanged scan budget", t => {
  const image = { width: 2304, height: 1296, rgba: Buffer.alloc(2304 * 1296 * 4, 255) }, textBoxes = [];
  for (let row = 0; row < 10; row++) for (let column = 0; column < 15; column++) {
    const bounds = { x: 100 + column * 140, y: 100 + row * 100, w: 60, h: 32 };
    textBoxes.push({ text: "Label", box: bounds });
    fill(image, { ...bounds, h: 24 }, [25, 25, 25, 255]);
  }
  icon(image, 50, 100);
  const actual = primitiveEvidence.sourceIconPrimitiveEvidence;
  let calls = 0;
  t.mock.method(primitiveEvidence, "sourceIconPrimitiveEvidence", input => { calls++; return actual(input); });
  const input = { image, textBoxes, slideSize: { widthPt: image.width, heightPt: image.height } };
  const result = detect(input);
  assert.equal(limits.scanPixels, 4000000);
  assert.equal(result.length, 1);
  assert.equal(calls, 1);
  assert.deepEqual(result[0].pixelBox, { x: 49, y: 99, w: 32, h: 32 });
  assert.deepEqual(detect({ ...input, maxScanPixels: 100000 }), []);
});

test("foreground prefilter cost is included even when every neighborhood is empty", () => {
  const input = fixture();
  fill(input.image, { x: 0, y: 0, w: input.image.width, h: input.image.height }, input.background);
  icon(input.image, 280, 210);
  input.textBoxes.push({ text: "Another", box: { x: 328, y: 216, w: 100, h: 20 } });
  const result = detect(input);
  assert.equal(result.length, 1);
  assert.equal(result[0].sourceEvidence.textNeighborIndex, 1);
  assert.equal(detect({ ...input, maxScanPixels: result[0].sourceEvidence.scannedPixels }).length, 1);
  assert.deepEqual(detect({ ...input, maxScanPixels: result[0].sourceEvidence.scannedPixels - 1 }), []);
});

test("owned glyph fragments do not exhaust the icon component budget", () => {
  const input = fixture();
  let fragments = 0;
  for (let y = 50; y < 84; y += 3) for (let x = 60; x < 145; x += 3) {
    fill(input.image, { x, y, w: 1, h: 1 }, [20, 20, 20, 255]); fragments++;
  }
  input.textBoxes.push({ text: "Owned glyphs", box: { x: 58, y: 49, w: 90, h: 37 } });
  assert.ok(fragments > limits.components);
  const result = detect(input);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].pixelBox, { x: 99, y: 89, w: 32, h: 32 });
  assert.equal(result[0].sourceEvidence.connectedComponents, 3);
});

test("weak compression specks and isolated subthreshold pixels do not count as icon components", () => {
  for (const noise of [[239, 239, 239, 255], [20, 20, 20, 255]]) {
    const input = fixture(); let fragments = 0;
    for (let y = 50; y < 84; y += 3) for (let x = 60; x < 145; x += 3) {
      fill(input.image, { x, y, w: 1, h: 1 }, noise); fragments++;
    }
    assert.ok(fragments > limits.components);
    const result = detect(input);
    assert.equal(result.length, 1);
    assert.deepEqual(result[0].pixelBox, { x: 99, y: 89, w: 32, h: 32 });
    assert.equal(result[0].sourceEvidence.foregroundPixels, 518);
    assert.equal(limits.components, 256);
  }
});

test("component admission keeps connected text ink intact and rejects an overfull eligible window", t => {
  const connected = fixture();
  fill(connected.image, { x: 129, y: 103, w: 100, h: 2 }, [24, 70, 120, 255]);
  assert.deepEqual(detect(connected), []);
  const image = { width: 1000, height: 800, rgba: Buffer.alloc(1000 * 800 * 4, 255) };
  let components = 0;
  for (let y = 320; y < 400; y += 8) for (let x = 240; x < 480; x += 8) {
    fill(image, { x, y, w: 6, h: 6 }, [20, 20, 20, 255]); components++;
  }
  assert.ok(components > limits.components);
  let primitiveCalls = 0;
  t.mock.method(primitiveEvidence, "sourceIconPrimitiveEvidence", () => { primitiveCalls++; return null; });
  assert.deepEqual(detect({ image, slideSize: { widthPt: 1000, heightPt: 800 },
    textBoxes: [{ text: "Label", box: { x: 480, y: 320, w: 120, h: 80 } }] }), []);
  assert.equal(primitiveCalls, 0);
});

test("dense structural neighborhoods do not force full-window scans for every label", () => {
  const image = { width: 2304, height: 1728, rgba: Buffer.alloc(2304 * 1728 * 4, 255) }, textBoxes = [];
  for (let row = 0; row < 10; row++) for (let column = 0; column < 12; column++) {
    const bounds = { x: 120 + column * 175, y: 120 + row * 150, w: 80, h: 32 };
    textBoxes.push({ text: "Label", box: bounds });
    fill(image, { ...bounds, h: 24 }, [25, 25, 25, 255]);
    if (row || column) fill(image, { x: bounds.x - 100, y: bounds.y + 12, w: 88, h: 1 }, [25, 25, 25, 255]);
  }
  icon(image, 70, 120);
  const result = detect({ image, textBoxes, slideSize: { widthPt: image.width, heightPt: image.height } });
  assert.equal(limits.scanPixels, 4000000);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].pixelBox, { x: 69, y: 119, w: 32, h: 32 });
});
