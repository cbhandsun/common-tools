"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { excludeOcrGlyphAtoms } = require("../packages/slideclone-core/visual-atom-native-policy");
const { createVisualAtomNativeShapes } = require("../packages/slideclone-core/visual-atom-native-reconstruction");
const {createOcrAtomConflictFilter}=require('../packages/slideclone-core/visual-atom-ocr-conflict');

const slideSize = { widthPt: 960, heightPt: 540 };
const glyph = { id: "glyph", kind: "native-rect-candidate", box: { x: 200, y: 100, w: 13, h: 14 } };
const card = { id: "card", kind: "native-rect-candidate", box: { x: 180, y: 80, w: 130, h: 70 } };
const icon = { id: "icon", kind: "native-rect-candidate", box: { x: 320, y: 100, w: 16, h: 16 } };
const line = { id: "line", kind: "grid-line-candidate", box: { x: 200, y: 100, w: 13, h: 14 } };
const ocr = [{ text: "Text", box: { x: 198, y: 99, w: 72, h: 16 }, source: { confidence: 0.94 } }];
test('titles, ellipses and strokes obey immutable source text geometry at every scale',()=>{
 for(const scale of [1,4,16]){
  const b={x:10*scale,y:20*scale,w:100*scale,h:50*scale},source={confidence:.99,evidenceBox:b};
  const reject=createOcrAtomConflictFilter([{text:'Title',box:{x:0,y:0,w:1,h:1},source}]);
  for(const kind of ['native-rect-candidate','native-ellipse-candidate','connector-line-candidate','grid-line-candidate']){
   assert.equal(reject({kind,box:{x:20*scale,y:25*scale,w:30*scale,h:40*scale}}),true);
   assert.equal(reject({kind,box:{x:5*scale,y:25*scale,w:30*scale,h:40*scale}}),false);
  }
  assert.equal(reject({kind:'native-rect-candidate',box:{x:0,y:0,w:150*scale,h:100*scale}}),false);
  b.x=50000;assert.equal(reject({kind:'native-ellipse-candidate',box:{x:20*scale,y:25*scale,w:30*scale,h:40*scale}}),true);
 }
});
test('unknown, empty and hostile OCR cannot reserve speculative geometry or invoke getters',()=>{
 for(const source of [{confidence:.2},{confidence:NaN},{confidence:1.01},{confidence:.9,evidenceBox:{x:0,y:0,w:Infinity,h:3}}]){
  assert.equal(createOcrAtomConflictFilter([{...ocr[0],source}])(glyph),false);
 }
 assert.equal(createOcrAtomConflictFilter([{...ocr[0],text:' '}])(glyph),false);
 let accessed=false;const getter={get text(){accessed=true;throw Error('unsafe');}};
 assert.equal(createOcrAtomConflictFilter([getter])(glyph),false);
 const sparse=new Array(1),proxy=new Proxy([],{get(){accessed=true;throw Error('unsafe');}});
 for(const invalid of [null,{},sparse,proxy,Array.from({length:10001},()=>({}))])assert.throws(()=>createOcrAtomConflictFilter(invalid),TypeError);
 const reject=createOcrAtomConflictFilter(ocr);
 assert.equal(reject(new Proxy({},{get(){accessed=true;throw Error('unsafe');}})),false);
 assert.equal(accessed,false);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});

test("source OCR reservation rejects contained speculative paint while retaining cards and independent icons", () => {
  assert.deepEqual(excludeOcrGlyphAtoms([glyph, card, icon, line], ocr, slideSize), [card, icon]);
  assert.deepEqual(excludeOcrGlyphAtoms([glyph, card], [], slideSize), [glyph, card]);
});

test("low-confidence and malformed OCR cannot suppress native candidates", () => {
  assert.deepEqual(excludeOcrGlyphAtoms([glyph], [{ ...ocr[0], source: { confidence: 0.2 } }], slideSize), [glyph]);
  assert.deepEqual(excludeOcrGlyphAtoms([glyph], [{ text: "Text", box: ocr[0].box }], slideSize), [glyph]);
  assert.deepEqual(excludeOcrGlyphAtoms([glyph], [{ text: "Text", box: { x: NaN, y: 100, w: 20, h: 15 } }], slideSize), [glyph]);
  assert.deepEqual(excludeOcrGlyphAtoms([glyph], ocr, { widthPt: 0, heightPt: 540 }), [glyph]);
  assert.deepEqual(excludeOcrGlyphAtoms([glyph], null, slideSize), [glyph]);
});

test("native visual atom stage retains a card while excluding an OCR glyph", () => {
  const image = { id: "layer", source: { detector: "diagram-underlay", layer: {
    layerType: "diagram-zone", recommendedAction: "attempt-native-reconstruction",
    diagramUnderstanding: { archetype: "generic-node-diagram", confidence: 0.9, nativeReadiness: "native-rebuild",
      visualAtoms: [
        { ...glyph, nativeCandidate: true, color: "#D6456B", density: 0.9 },
        { ...card, nativeCandidate: true, color: "#D6456B", density: 0.9 }
      ] }
  } } };
  const shapes = createVisualAtomNativeShapes([image], null, slideSize, ocr);
  assert.ok(shapes.some((shape) => shape.source?.atomId === "card"));
  assert.equal(shapes.some((shape) => shape.source?.atomId === "glyph"), false);
});
