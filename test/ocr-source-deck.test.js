"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { boundedOcrSourceDeck } = require("../packages/slideclone-core/team-native-rebuild");
const { expandPositionedMixedColorTextSegments, ocrFontScale } = require("../packages/slideclone-core/ocr-source-deck");

test('source-backed color cuts follow unequal OCR word widths and retain exact text',()=>{
 const width=240,height=48,rgba=Buffer.alloc(width*height*4,255);
 const units=[{text:'Agent ',box:{x:10,y:12,w:50,h:24}},
  {text:'默认化后，',box:{x:65,y:12,w:90,h:24}},{text:'控制面补齐',box:{x:160,y:12,w:70,h:24}}];
 for(const [i,u]of units.entries())for(let y=17;y<30;y++)for(let x=u.box.x+2;x<u.box.x+u.box.w-2;x++)
  rgba.set(i<2?[17,17,17,255]:[180,40,15,255],(y*width+x)*4);
 const line={text:units.map(u=>u.text).join(''),box:{x:10,y:12,w:220,h:24},confidence:.99,wordPositionHints:units};
 const {detectMixedColorTextSegments}=require('../packages/slideclone-core/ocr-source-deck');
 const segments=detectMixedColorTextSegments({width,height,rgba},line);
 assert.equal(segments.length,2);assert.equal(segments[0].text,'Agent 默认化后，');assert.equal(segments[1].text,'控制面补齐');
 assert.deepEqual(segments.map(s=>s.color),[{r:17,g:17,b:17},{r:180,g:40,b:15}]);
 assert.ok(segments[0].pixelEnd<segments[1].pixelStart);
 // Touching paint intervals are not a source-proven color split.
 for(let y=17;y<30;y++)for(let x=150;x<164;x++)rgba.set([180,40,15,255],(y*width+x)*4);
 assert.equal(detectMixedColorTextSegments({width,height,rgba},line),null);
});

test('mixed paint follows native horizontal geometry despite slight OCR quadrilateral jitter',()=>{
 const {applySourceWordLayouts}=require('../packages/slideclone-core/source-word-layout-registry');
 for(const skew of [0,.6,-.6]){
  const width=240,height=48,rgba=Buffer.alloc(width*height*4,255);
  for(let i=0;i<12;i++)for(let y=18;y<28;y++)for(let x=17+i*16;x<28+i*16;x++)
   rgba.set(i<6?[17,17,17,255]:[180,40,15,255],(y*width+x)*4);
  const box={x:16,y:14,w:192,h:18};
  const polygon=[[16,14+Math.max(0,skew)],[208,14+Math.max(0,-skew)],
   [208,32-Math.max(0,skew)],[16,32-Math.max(0,-skew)]];
  const deck=boundedOcrSourceDeck({metadata:{dimensions:{widthPx:width,heightPx:height}},sourceImage:'assets/source.png',
   sourceRaster:{width,height,rgba},ocr:{lines:[{text:'ABCDEFGHIJKL',confidence:.99,box,polygon}]}});
  const t=deck.pages[0].textBoxes[0];assert.equal(t.source.mixedColorTextSegments,2);
  assert.ok(hexDistance(t.runs[0].font.color,'#111111')<4);
  assert.ok(hexDistance(t.runs[1].font.color,'#B4280F')<4);
  const page=applySourceWordLayouts(structuredClone(deck.pages[0]),deck.pages[0].textBoxes);
  assert.equal(page.layouts,0);assert.deepEqual(page.page.textBoxes[0].runs,t.runs);
  const segments=expandPositionedMixedColorTextSegments(page.page.textBoxes);
  assert.equal(segments.length,2);assert.equal(segments.map(s=>s.text).join(''),t.text);
  assert.ok(segments.every(s=>s.source.segmentedOcrLinePolygonPt&&!s.source.ocrPolygonPt));
 }
});

test("OCR admission snapshots valid output and rejects accessors, proxies, sparse and oversized arrays", () => {
  const { admitOcrResult } = require("../packages/slideclone-core/ocr-result-admission");
  const size = { widthPx: 960, heightPx: 540 };
  const source = { lines: [{ text: " Al Agent ", box: { x: 1, y: 2, w: 20, h: 10 } }] };
  const admitted = admitOcrResult(source, size);
  assert.equal(admitted.lines[0].confidence, 1);
  assert.equal(admitted.lines[0].text, " Al Agent ");
  source.lines[0].box.x = 99;
  assert.equal(admitted.lines[0].box.x, 1);
  assert.ok(Object.isFrozen(admitted.lines[0].box));
  assert.deepEqual(admitOcrResult({ lines: [] }, size), { lines: [] });
  let calls = 0;
  const getter = { get lines() { calls++; return []; } };
  const proxy = new Proxy({}, { getOwnPropertyDescriptor() { calls++; throw new Error("secret"); } });
  const indexed = [];
  Object.defineProperty(indexed, "0", { get() { calls++; return {}; } });
  for (const value of [getter, proxy, { lines: indexed }, { lines: new Array(1) }, { lines: new Array(10001) }, { lines: new Proxy([], {}) }]) {
    assert.throws(() => admitOcrResult(value, size), /OCR/);
  }
  assert.equal(calls, 0);
  for (const text of ["", "x".repeat(513), "secret\0"]) {
    assert.throws(() => admitOcrResult({ lines: [{ ...admitted.lines[0], text }] }, size), error => !error.message.includes("secret"));
  }
  assert.throws(() => admitOcrResult({ lines: [{ ...admitted.lines[0], box: { x: 959, y: 0, w: 2, h: 2 } }] }, size), /box/);
});

function input() {
  return { metadata: { dimensions: { widthPx: 960, heightPx: 540 } }, sourceImage: "assets/source.png", ocr: { lines: [{ text: " Example ", box: { x: 10, y: 20, w: 100, h: 30 }, confidence: 0.9 }] } };
}

function denseLine(index, text = `文字${index}`) {
  return { text, box: { x: 10, y: 10 + index * 2, w: 80, h: 10 }, confidence: 0.99 };
}

test("OCR source IR rejects zero, negative, excessive and non-numeric dimensions before projection", () => {
  for (const [widthPx, heightPx] of [[0, 10], [-1, 10], [10, 0], [16385, 1], [10000, 10000], [Infinity, 10], ["960", 540]]) {
    const value = input(); value.metadata.dimensions = { widthPx, heightPx }; value.ocr.lines = [];
    assert.throws(() => boundedOcrSourceDeck(value), /dimensions/);
  }
});

test("OCR source IR rejects traversal and cross-platform absolute paths without echoing them", () => {
  for (const sourceImage of ["../fixture-private.png", "assets/../fixture-private.png", "/fixture-private.png", "C:\\fixture-private.png", "C:fixture-private.png", "\\\\server\\fixture-private.png", "assets\\fixture-private.png", "assets//fixture-private.png", "assets/file\n.png"]) {
    assert.throws(() => boundedOcrSourceDeck({ ...input(), sourceImage }), (error) => /source path/.test(error.message) && !error.message.includes("fixture-private"));
  }
});

test("OCR source IR accepts an empty OCR result but rejects malformed payloads and confidence", () => {
  assert.deepEqual(boundedOcrSourceDeck({ ...input(), ocr: { lines: [] } }).pages[0].textBoxes, []);
  for (const ocr of [null, [], {}, { lines: "invalid" }, { lines: [null] }, { lines: new Array(10001).fill(input().ocr.lines[0]) }]) {
    assert.throws(() => boundedOcrSourceDeck({ ...input(), ocr }), /OCR/);
  }
  for (const confidence of [-1, 1.1, Infinity, NaN, "0.9", null]) {
    const value = input(); value.ocr.lines[0].confidence = confidence;
    assert.throws(() => boundedOcrSourceDeck(value), /OCR/);
  }
});

test("OCR source IR preserves text, editable hidden overlays, confidence and exact coordinates", () => {
  const value = input(); const before = structuredClone(value);
  const deck = boundedOcrSourceDeck(value); const text = deck.pages[0].textBoxes[0];
  assert.equal(deck.version, "1.0");
  assert.deepEqual(deck.slideSize, { widthPt: 960, heightPt: 540 });
  assert.equal(text.text, "Example");
  assert.deepEqual(text.box, value.ocr.lines[0].box);
  assert.deepEqual(text.source.evidenceBox, text.box);
  assert.equal(text.source.confidence, 0.9);
  assert.equal(text.source.editable, true);
  assert.equal(text.font.opacity, 0);
  assert.equal(Object.hasOwn(text.font, "weight"), false, "unknown OCR weight must not masquerade as confirmed regular");
  assert.equal(text.style.visibility, "hidden");
  assert.deepEqual(value, before);
});

test("OCR source IR rejects invalid and out-of-bounds text boxes without leaking user text", () => {
  for (const box of [{ x: -1, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 0, h: 1 }, { x: 959, y: 0, w: 2, h: 1 }, { x: 0, y: 0, w: Infinity, h: 1 }, { x: "0", y: 0, w: 1, h: 1 }]) {
    const value = input(); value.ocr.lines[0] = { text: "fixture-private-content", box };
    assert.throws(() => boundedOcrSourceDeck(value), (error) => /OCR/.test(error.message) && !error.message.includes("fixture-private-content"));
  }
  for (const text of ["", " ", "x".repeat(513), "private\0content"]) {
    const value = input(); value.ocr.lines[0].text = text;
    assert.throws(() => boundedOcrSourceDeck(value), /OCR/);
  }
});

test("OCR source IR keeps canonical contextual correction and the one-pixel boundary", () => {
  const value = input(); value.ocr.lines = [{ text: "Al Agent", box: { x: 0, y: 0, w: 1, h: 1 } }, { text: "AI Agent", box: { x: 0, y: 0, w: 1, h: 1 } }];
  value.metadata.dimensions = { widthPx: 1, heightPx: 1 };
  const deck = boundedOcrSourceDeck(value);
  assert.equal(deck.pages[0].textBoxes[0].text, "AI Agent");
  assert.equal(deck.pages[0].textBoxes[0].source.confidence, 1);
  assert.deepEqual(deck.pages[0].textBoxes[0].box, { x: 0, y: 0, w: 960, h: 960 });
});

test("OCR source deck uses the standard font scale for sparse pages", () => {
  const lines = [denseLine(0), denseLine(1), denseLine(2)];
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: 1000, heightPx: 1000 } },
    sourceImage: "assets/source.png",
    ocr: { lines }
  });

  assert.equal(ocrFontScale(lines), 0.72);
  assert.equal(deck.pages[0].textBoxes[0].font.sizePt, 6.912);
});

test("OCR source headings retain sizes above 36pt within native renderer capacity",()=>{
 const deck=boundedOcrSourceDeck({metadata:{dimensions:{widthPx:1000,heightPx:1000}},sourceImage:"assets/source.png",
   ocr:{lines:[{text:"Heading",box:{x:10,y:10,w:300,h:100}}]}});
 assert.ok(deck.pages[0].textBoxes[0].font.sizePt>36);
 assert.ok(deck.pages[0].textBoxes[0].font.sizePt<=400);
});

test("OCR source deck shrinks dense infographic text", () => {
  const lines = Array.from({ length: 180 }, (_, index) => denseLine(index));
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: 1000, heightPx: 1000 } },
    sourceImage: "assets/source.png",
    ocr: { lines }
  });

  assert.equal(ocrFontScale(lines), 0.62);
  assert.equal(deck.pages[0].textBoxes[0].font.sizePt, 6);
});

test("OCR source deck preserves confident mixed-color single-line text as editable runs", () => {
  const width = 240, height = 48;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const colors = [
    { start: 0, end: 5, rgb: [84, 91, 110] },
    { start: 5, end: 14, rgb: [48, 82, 186] },
    { start: 14, end: 18, rgb: [84, 91, 110] }
  ];
  for (const band of colors) {
    for (let char = band.start; char < band.end; char += 1) {
      const left = 16 + char * 10;
      for (let y = 18; y < 28; y += 1) {
        for (let x = left + 1; x < left + 8; x += 1) {
          const offset = (y * width + x) * 4;
          rgba[offset] = band.rgb[0];
          rgba[offset + 1] = band.rgb[1];
          rgba[offset + 2] = band.rgb[2];
          rgba[offset + 3] = 255;
        }
      }
    }
  }
  const text = "ABCDE123456789尾缀";
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: width, heightPx: height } },
    sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba },
    ocr: { lines: [{ text, box: { x: 16, y: 14, w: 180, h: 18 }, confidence: 0.98 }] }
  });
  const textBox = deck.pages[0].textBoxes[0];

  assert.equal(textBox.runs.map((run) => run.text).join(""), text);
  assert.equal(textBox.runs.length, 3);
  assert.ok(hexDistance(textBox.runs[0].font.color, "#545B6E") < 4);
  assert.ok(hexDistance(textBox.runs[1].font.color, "#3052BA") < 8);
  assert.ok(hexDistance(textBox.runs[2].font.color, "#545B6E") < 8);
  assert.equal(textBox.source.mixedColorTextRuns, 3);
});

test("OCR source deck merges adjacent same-emphasis color fragments in a long line", () => {
  const width = 420, height = 48;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const text = "ABCDEFGHIJKL1234567890尾部文字";
  const bands = [
    { start: 0, end: 12, rgb: [142, 149, 161] },
    { start: 12, end: 18, rgb: [101, 131, 233] },
    { start: 18, end: 19, rgb: [136, 159, 238] },
    { start: 19, end: 23, rgb: [117, 144, 235] },
    { start: 23, end: 27, rgb: [107, 134, 228] },
    { start: 27, end: 31, rgb: [141, 148, 160] }
  ];
  for (const band of bands) {
    for (let char = band.start; char < band.end; char += 1) {
      const left = 20 + char * 12;
      for (let y = 18; y < 28; y += 1) {
        for (let x = left + 1; x < left + 9; x += 1) {
          const offset = (y * width + x) * 4;
          rgba[offset] = band.rgb[0];
          rgba[offset + 1] = band.rgb[1];
          rgba[offset + 2] = band.rgb[2];
          rgba[offset + 3] = 255;
        }
      }
    }
  }
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: width, heightPx: height } },
    sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba },
    ocr: { lines: [{ text, box: { x: 20, y: 14, w: 372, h: 18 }, confidence: 0.99 }] }
  });
  const runs = deck.pages[0].textBoxes[0].runs;

  assert.equal(runs.map((run) => run.text).join(""), text);
  assert.ok(runs.length >= 2 && runs.length <= 4);
  assert.ok(runs.some((run) => hexDistance(run.font.color, "#758FEB") < 24));
});

test("OCR source deck keeps medium mixed-color lines as rich text with positioned segment geometry", () => {
  const width = 640, height = 48;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const text = "ABCDEFGHIJKLMNOPQRST1234567890岗位级AI组件能力";
  const colors = [
    { start: 0, end: 20, rgb: [120, 128, 140] },
    { start: 20, end: 34, rgb: [82, 120, 230] },
    { start: 34, end: Array.from(text).length, rgb: [120, 128, 140] }
  ];
  for (const band of colors) {
    for (let char = band.start; char < band.end; char += 1) {
      const left = 16 + char * 10;
      for (let y = 18; y < 28; y += 1) for (let x = left + 1; x < left + 8; x += 1) {
        const offset = (y * width + x) * 4;
        rgba[offset] = band.rgb[0];
        rgba[offset + 1] = band.rgb[1];
        rgba[offset + 2] = band.rgb[2];
        rgba[offset + 3] = 255;
      }
    }
  }
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: width, heightPx: height } },
    sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba },
    ocr: { lines: [{ text, box: { x: 16, y: 14, w: 390, h: 18 }, confidence: 0.99 }] }
  });
  const textBox = deck.pages[0].textBoxes[0];

  assert.equal(Array.from(text).length > 32, true);
  assert.equal(Array.from(text).length <= 72, true);
  assert.equal(deck.pages[0].textBoxes.length, 1);
  assert.equal(textBox.runs.map((run) => run.text).join(""), text);
  assert.equal(textBox.source.mixedColorTextRuns, 3);
  assert.equal(textBox.source.mixedColorTextSegments, 3);
  assert.equal(textBox.source.positionedMixedColorTextSegments.length, 3);
  const textBoxes = expandPositionedMixedColorTextSegments(deck.pages[0].textBoxes);
  assert.equal(textBoxes.length, 3);
  assert.equal(textBoxes.map((segment) => segment.text).join(""), text);
  assert.equal(textBoxes.every((segment) => segment.runs === undefined), true);
  assert.equal(textBoxes.every((segment) => segment.source.segmentedOcrLineId === "p0-ocr-001"), true);
  assert.equal(textBoxes[0].source.segmentStartIndex, 0);
  assert.equal(textBoxes[0].source.segmentEndIndex, textBoxes[1].source.segmentStartIndex);
  assert.equal(textBoxes[1].source.segmentEndIndex, textBoxes[2].source.segmentStartIndex);
  assert.equal(textBoxes[2].source.segmentEndIndex, Array.from(text).length);
  assert.ok(textBoxes.every((segment) => segment.source.sourceInkPixelBox.y === 14));
  assert.ok(textBoxes.every((segment) => segment.source.sourceInkPixelBox.h === 18));
  assert.ok(textBoxes[0].box.x < textBoxes[1].box.x);
  assert.ok(textBoxes[1].box.x < textBoxes[2].box.x);
});

test("OCR source deck splits very long mixed-color lines into positioned editable text boxes", () => {
  const width = 1280, height = 48;
  const rgba = Buffer.alloc(width * height * 4, 255);
  const text = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789尾".repeat(3);
  for (let char = 0; char < Array.from(text).length; char += 1) {
    const blue = char >= 28 && char < 72;
    const rgb = blue ? [82, 120, 230] : [120, 128, 140];
    const left = 16 + char * 7;
    for (let y = 18; y < 28; y += 1) for (let x = left + 1; x < left + 6; x += 1) {
      const offset = (y * width + x) * 4;
      rgba[offset] = rgb[0];
      rgba[offset + 1] = rgb[1];
      rgba[offset + 2] = rgb[2];
      rgba[offset + 3] = 255;
    }
  }
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: width, heightPx: height } },
    sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba },
    ocr: { lines: [{ text, box: { x: 16, y: 14, w: 756, h: 18 }, confidence: 0.99 }] }
  });

  assert.equal(Array.from(text).length > 72, true);
  assert.equal(deck.pages[0].textBoxes.length, 1);
  assert.equal(deck.pages[0].textBoxes[0].runs, undefined);
  assert.equal(deck.pages[0].textBoxes[0].source.mixedColorTextSegments, 3);
  const textBoxes = expandPositionedMixedColorTextSegments(deck.pages[0].textBoxes);
  assert.equal(textBoxes.length, 3);
  assert.equal(textBoxes.map((textBox) => textBox.text).join(""), text);
  assert.equal(textBoxes.every((textBox) => textBox.runs === undefined), true);
  assert.equal(textBoxes.every((textBox) => textBox.source.segmentedOcrLineId === "p0-ocr-001"), true);
  assert.equal(textBoxes.every((textBox) => textBox.source.mixedColorTextSegments === 3), true);
  assert.ok(textBoxes.every((textBox) => Number.isSafeInteger(textBox.source.segmentStartIndex)));
  assert.ok(textBoxes.every((textBox) => Number.isSafeInteger(textBox.source.segmentEndIndex)));
  assert.ok(textBoxes.every((textBox) => textBox.source.sourceInkPixelBox.y === 14));
  assert.ok(textBoxes.every((textBox) => textBox.source.sourceInkPixelBox.h === 18));
  assert.ok(textBoxes[0].box.x < textBoxes[1].box.x);
  assert.ok(textBoxes[1].box.x < textBoxes[2].box.x);
  assert.ok(textBoxes.some((textBox) => hexDistance(textBox.font.color, "#5278E6") < 12));
});

test("OCR source deck keeps uniform-color OCR as one editable text box", () => {
  const width = 160, height = 40;
  const rgba = Buffer.alloc(width * height * 4, 255);
  for (let y = 14; y < 24; y += 1) for (let x = 20; x < 120; x += 2) {
    const offset = (y * width + x) * 4;
    rgba[offset] = 40; rgba[offset + 1] = 50; rgba[offset + 2] = 60; rgba[offset + 3] = 255;
  }
  const deck = boundedOcrSourceDeck({
    metadata: { dimensions: { widthPx: width, heightPx: height } },
    sourceImage: "assets/source.png",
    sourceRaster: { width, height, rgba },
    ocr: { lines: [{ text: "Uniform line", box: { x: 18, y: 10, w: 110, h: 20 }, confidence: 0.99 }] }
  });

  assert.equal(deck.pages[0].textBoxes[0].runs, undefined);
});

function hexDistance(left, right) {
  const a = [1, 3, 5].map((offset) => Number.parseInt(left.slice(offset, offset + 2), 16));
  const b = [1, 3, 5].map((offset) => Number.parseInt(right.slice(offset, offset + 2), 16));
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
