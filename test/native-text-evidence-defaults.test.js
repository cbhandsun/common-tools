"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {compactNativeTextEvidenceDefaults:compact}=require("../packages/slideclone-core/native-text-evidence-defaults");
const bounds={x:20,y:20,w:40,h:10};
function text(){return {text:"visible",box:{...bounds},font:{family:"Arial",latinFamily:"Arial",eastAsianFamily:"Arial",complexScriptFamily:"Arial",align:"left"},
  source:{evidenceBox:{...bounds},ocrLabelBox:{...bounds},ocrLabelRef:"label-source",confidence:.9},
  positionedRuns:[{text:"visible",box:{...bounds},fontOverride:{weight:"bold"}}]};}
function deck(value){return {pages:[{textBoxes:[value]}]};}

test("text defaults and duplicate label envelopes compact without changing the resolved source or typography",()=>{
  const value=text(),before=structuredClone(value),input=deck(value);
  assert.equal(compact(input),input);
  assert.deepEqual(value.font,{family:"Arial"});
  assert.deepEqual(value.source.evidenceBox,before.source.ocrLabelBox);
  assert.equal(value.source.ocrLabelRef,before.source.ocrLabelRef);
  assert.deepEqual(value.positionedRuns,before.positionedRuns);
  assert.deepEqual(value.box,before.box);assert.equal(value.text,before.text);
  const once=structuredClone(input);compact(input);assert.deepEqual(input,once);
});

test("script inheritance remains explicit when rich or positioned runs change family",()=>{
  for(const mode of ["rich","positioned"]){
    const value=text();
    if(mode==="rich")value.runs=[{text:"visible",font:{family:"KaiTi",latinFamily:"Segoe UI"}}];
    else value.positionedRuns[0].fontOverride={family:"KaiTi",latinFamily:"Segoe UI"};
    compact(deck(value));
    assert.equal(value.font.latinFamily,undefined);
    assert.equal(value.font.eastAsianFamily,"Arial");
    assert.equal(value.font.complexScriptFamily,"Arial");
  }
});

test("distinct script fonts, nondefault alignment and segmented parent envelopes remain explicit",()=>{
  const value=text();value.font.eastAsianFamily="SimHei";value.font.align="center";
  value.source.segmentedOcrLineId="parent";value.source.ocrLabelBox={x:10,y:20,w:80,h:10};
  const before=structuredClone(value.source);
  compact(deck(value));assert.deepEqual(value.source,before);
  assert.equal(value.font.eastAsianFamily,"SimHei");assert.equal(value.font.align,"center");
  for(const replacement of [{...bounds,extra:1},{...bounds,w:0},{...bounds,x:NaN},{...bounds,w:"40"}]){
    const item=text();item.source.ocrLabelBox=replacement;compact(deck(item));
    assert.deepEqual(item.source.ocrLabelBox,replacement);
  }
});

test("hostile, sparse, oversized and immutable controls fail atomically without executing getters",()=>{
  let calls=0;const hostile={get family(){calls++;throw Error("private-content");}};
  const first=text();
  for(const bad of [null,{},new Proxy({pages:[]},{}),{pages:new Array(1)},{pages:Array(10001).fill({})},
    {pages:[{textBoxes:new Proxy([],{})}]},deck({font:hostile}),
    {pages:[{textBoxes:[first,{font:Object.freeze({align:"left"})}]}]},
    {pages:[{textBoxes:[first,{positionedRuns:[{fontOverride:hostile}]}]}]}]){
    assert.throws(()=>compact(bad),error=>error instanceof TypeError&&!error.message.includes("private-content"));
    assert.equal(first.font.latinFamily,"Arial");assert(first.source.ocrLabelBox);
  }
  assert.equal(calls,0);
  for(const input of [{pages:[]},{pages:[{}]},deck({}),deck({font:{family:"Arial",align:"right"}})]){
    const before=structuredClone(input);compact(input);assert.deepEqual(input,before);
  }
});

test("region label identity and proposals consume the canonical envelope after compaction",()=>{
  const {sourceLabelIdentity}=require("../packages/slideclone-core/source-label-identity");
  const {prepareRegionProgramLabels}=require("../packages/slideclone-core/source-scene-region-program");
  const ref=sourceLabelIdentity(bounds,{widthPx:100,heightPx:100}),value=text();value.source.ocrLabelRef=ref;
  const plan={version:1,sourceHash:"a".repeat(64),widthPx:100,heightPx:100,
    regions:[{id:"region-root",parentId:null,kind:"section",box:{x:0,y:0,w:100,h:100}}],objects:[],relations:[],
    regionPrograms:[{regionId:"region-root",objects:[],relations:[],labels:[{refs:[ref],family:"KaiTi",weight:"bold",sizePt:18}]}]};
  compact(deck(value));
  const result=prepareRegionProgramLabels({textBoxes:[value]},plan,{widthPt:100,heightPt:100});
  assert.equal(result.page.textBoxes[0].font.family,"KaiTi");
  assert.equal(result.page.textBoxes[0].source.ocrLabelRef,ref);
});

test("unified compaction, package admission and CI include the canonical text contract",()=>{
  const {compactTeamComponentEvidence}=require("../packages/slideclone-core/team-component-evidence");
  const input=deck(text());compactTeamComponentEvidence(input);
  assert.equal(input.pages[0].textBoxes[0].source.ocrLabelBox,undefined);
  const {REQUIRED_FILES}=require("../scripts/verify-runtime-package");
  assert(REQUIRED_FILES.includes("packages/slideclone-core/native-text-evidence-defaults.js"));
  const {includesSuite}=require("../scripts/test-suites");
  assert.equal(includesSuite(__filename,"all"),true);
});
