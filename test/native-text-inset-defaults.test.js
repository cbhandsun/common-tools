"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compactNativeTextInsetDefaults:compact}=require("../packages/slideclone-core/typography/native-text-inset-defaults");
test("zero native insets omit losslessly while geometry, text, provenance and nondefaults survive",()=>{
 const text={text:"节点",box:{x:1,y:2,w:30,h:20},positionedRuns:[{text:"节点",box:{x:1,y:2,w:30,h:20}}],source:{marginLeftPt:0},
  style:{marginLeftPt:0,marginRightPt:0,marginTopPt:3.5,marginBottomPt:72,wrap:false,fit:"none"}};
 const before=structuredClone(text),deck={pages:[{textBoxes:[text]}]};assert.equal(compact(deck),deck);
 const expected=structuredClone(before);delete expected.style.marginLeftPt;delete expected.style.marginRightPt;
 assert.deepEqual(text,expected);assert.equal(compact(deck),deck);assert.deepEqual(text,expected);
});
test("empty controls, missing styles and values requiring later admission remain intact",()=>{
 for(const deck of [{pages:[]},{pages:[{}]},{pages:[{textBoxes:[{}, {style:{}}, {style:{marginLeftPt:"0",marginRightPt:null,marginTopPt:-1,marginBottomPt:1e20}}]}]}]){
  const before=structuredClone(deck);assert.equal(compact(deck),deck);assert.deepEqual(deck,before);
 }
});
test("sparse, proxy, accessor, oversized and immutable inputs fail atomically without reading hostile getters",()=>{
 let calls=0;const hostile={};Object.defineProperty(hostile,"marginLeftPt",{get(){calls++;throw Error("private-token");}});
 const valid={style:{marginLeftPt:0}};
 for(const value of [null,{},new Proxy({pages:[]},{}),{pages:new Array(1)},{pages:Array(10001).fill({})},
  {pages:[null]},{pages:[{textBoxes:new Proxy([],{})}]},{pages:[{textBoxes:[valid,{style:hostile}]}]},
  {pages:[{textBoxes:[valid,{style:Object.freeze({marginLeftPt:0})}]}]},
  {pages:[{textBoxes:[valid,{style:[]}]}]},{pages:[{textBoxes:[new Proxy({}, {})]}]}]){
  assert.throws(()=>compact(value),e=>e instanceof TypeError&&!e.message.includes("private-token"));assert.equal(valid.style.marginLeftPt,0);
 }
 assert.equal(calls,0);
});
test("unified evidence compaction and CI use the new inset regression",()=>{
 const {compactTeamComponentEvidence}=require("../packages/slideclone-core/archetypes/team-component-evidence");
 const deck={pages:[{textBoxes:[{style:{marginLeftPt:0,marginRightPt:0,marginTopPt:0,marginBottomPt:0}}]}]};
 compactTeamComponentEvidence(deck);assert.deepEqual(deck.pages[0].textBoxes[0].style,{});
 const fs=require("node:fs");assert.match(fs.readFileSync(require.resolve("../scripts/verify-runtime-package"),"utf8"),/native-text-inset-defaults\.js/u);
 const {includesSuite}=require("../scripts/test-suites");assert.equal(includesSuite(__filename,"unit"),true);
});
