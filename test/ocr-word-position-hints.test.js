"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { admitOcrWordPositionHints } = require("../packages/slideclone-core/ocr/ocr-word-position-hints");
const { admitOcrResult } = require("../packages/slideclone-core/ocr/ocr-result-admission");
const { detectMixedColorTextSegments } = require("../packages/slideclone-core/ocr/ocr-source-deck");
const { correctContextualOcrLines } = require("../packages/slideclone-core/ocr/ocr-source-deck");
const { normalizeOcrItems } = require("../packages/slideclone-native-engine/scripts/lib/ocr-result-contract");
const line = { text: "AAAABBBB", confidence: .98, box: { x: 10, y: 5, w: 100, h: 20 } };
const hints = [{ text: "AAAA", box: { x: 10, y: 5, w: 80, h: 20 } }, { text: "BBBB", box: { x: 90, y: 5, w: 20, h: 20 } }];
test("initial OCR word positions survive normalization and core snapshot without becoming glyph ownership", () => {
  const polygon = [[10,5],[110,5],[110,25],[10,25]];
  const item = normalizeOcrItems([{ ...line, polygon, wordPositionHints: hints }], { imageWidth: 120, imageHeight: 30 })[0];
  const admitted = admitOcrResult({ lines: [{ ...item, box: line.box }] }, { widthPx: 120, heightPx: 30 }).lines[0];
  assert.deepEqual(admitted.wordPositionHints, hints);
  const pinned=require("../packages/slideclone-core/ocr/team-paddleocr-profile").normalizeLines([{...line,polygon,wordPositionHints:hints}],{widthPx:120,heightPx:30});
  assert.deepEqual(pinned.lines[0].wordPositionHints,hints);
  assert.ok(Object.isFrozen(admitted.wordPositionHints[0].box));
  assert.equal(admitted.glyphOwnership, undefined);
});
test("empty, stale, unbounded, out-of-frame and hostile word positions are rejected without executing accessors", () => {
  assert.equal(admitOcrWordPositionHints(undefined, line), undefined);
  let getterCalls = 0;
  const getter = Object.defineProperty({}, "text", { get() { getterCalls++; return "PRIVATE_TEXT"; } });
  for (const value of [[], Array(513).fill(hints[0]), [hints[1],hints[0]],
    [{...hints[0],text:"PRIVATE_TEXT"},hints[1]], [{...hints[0],box:{...hints[0].box,w:Infinity}},hints[1]],
    [{...hints[0],box:{...hints[0].box,x:-1}},hints[1]], new Proxy(hints,{}), [getter],
    [{...hints[0],text:"AAAA\u0000"},hints[1]], [{...hints[0],box:{...hints[0].box,w:0}},hints[1]]])
    assert.throws(() => admitOcrWordPositionHints(value,line), error => /OCR word position/.test(error.message) && !error.message.includes("PRIVATE_TEXT"));
  assert.equal(getterCalls, 0);
});
test("recognition position hints cannot alone change physical color segmentation or glyph geometry", () => {
  const width=120,height=30,rgba=new Uint8Array(width*height*4).fill(255);
  for(let y=8;y<22;y++) for(let x=12;x<108;x++)
    rgba.set(x<90 ? [170,35,50,255] : [35,60,180,255],(y*width+x)*4);
  const segments=detectMixedColorTextSegments({width,height,rgba},{...line,wordPositionHints:admitOcrWordPositionHints(hints,line)});
  assert.deepEqual(segments,detectMixedColorTextSegments({width,height,rgba},line));
});
test("normalization rejects invalid word geometry and sequences rather than coercing provider values", () => {
  const polygon=[[10,5],[110,5],[110,25],[10,25]];
  for(const wordPositionHints of [[{...hints[0],box:{...hints[0].box,w:"80"}},hints[1]],
    [{...hints[0],text:"AAAA\n"},hints[1]], [hints[1],hints[0]]])
    assert.throws(()=>normalizeOcrItems([{...line,polygon,wordPositionHints}]),/OCR word position/);
  let called=0;
  const hostile=Object.defineProperty({},"text",{get(){called++;return"PRIVATE_TEXT";}});
  assert.throws(()=>normalizeOcrItems([{...line,polygon,wordPositionHints:[hostile]}]),/OCR word position/);
  assert.throws(()=>normalizeOcrItems([{...line,polygon,wordPositionHints:new Proxy(hints,{})}]),/OCR word position/);
  assert.equal(called,0);
});
test("word-position admission regression is discovered by the unified CI integration suite", () => {
  const path=require("node:path");
  const files=require("../scripts/test-sharded").discoverTestFiles(path.resolve(__dirname,".."),"integration");
  assert.ok(files.some(({file})=>path.basename(file)===path.basename(__filename)));
  assert.match(require("../package.json").scripts["verify:ci"],/npm run test:integration/);
});
test("contextual spelling corrections revoke the original recognition position sequence",()=>{
 const original={text:"Al Agent",wordPositionHints:[{text:"Al Agent",box:{x:0,y:0,w:50,h:10}}]};
 const lines=correctContextualOcrLines([{text:"AI Agent"},original]);
 assert.equal(lines[1].text,"AI Agent");assert.equal(lines[1].wordPositionHints,undefined);
 assert.ok(original.wordPositionHints);assert.equal(original.text,"Al Agent");
});
