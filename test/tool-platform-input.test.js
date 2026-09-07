"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createToolGapPlatformDiagramObjects:create,shouldObjectifyToolGapPlatformDiagram:eligible,toolGapPlatformNativeTextBoxes:textBoxes}=require("../packages/slideclone-core/tool-platform-reconstruction");
const slide={widthPt:960,heightPt:540};
const raster={width:960,height:540,rgba:Buffer.alloc(960*540*4,255)};
const labels="跨越工具孤岛 传统协作模式 普通AI工具 PM Portal Platform";
function image(){return {id:"tool-platform",box:{x:39,y:106,w:886,h:375},source:{detector:"mixed-diagram-graphic-underlay-crop",privateTag:"retained"}};}
test("tool platform accepts ordinary input and preserves no-source and empty behavior",()=>{
  assert.deepEqual(create(undefined,undefined,null),{shapes:[],textBoxes:[]});
  assert.deepEqual(create([],[],raster),{shapes:[],textBoxes:[]});
  assert.equal(eligible(image(),[{text:labels}],slide),true);
  const target=image();
  const result=create([target],[{text:labels,box:{x:60,y:150,w:100,h:20},font:{sizePt:14,weight:700}}],raster,slide);
  assert.ok(result.shapes.length>0);
  assert.equal(result.textBoxes[0].font.weight,700);
  assert.equal(target.source.privateTag,"retained");
  assert.equal(target.source.toolGapPlatformObjectified,true);
  assert.equal(eligible({...image(),box:{x:0,y:0,w:0,h:0}},[],slide),false);
});
test("tool platform rejects accessor and coercion inputs without executing them",()=>{
  let calls=0;
  const target=image();
  Object.defineProperty(target,"box",{get(){calls++;return {x:0,y:0,w:900,h:400};}});
  assert.throws(()=>eligible(target,[{text:labels}],slide),{message:"Invalid tool platform input"});
  assert.throws(()=>eligible(image(),[{text:{toString(){calls++;return labels;}}}],slide),{message:"Invalid tool platform input"});
  const inputs=[];Object.defineProperty(inputs,"0",{get(){calls++;return image();},enumerable:true});
  assert.throws(()=>create(inputs,[],raster),/Invalid tool platform input/);
  const badFont={};Object.defineProperty(badFont,"sizePt",{get(){calls++;return 14;}});
  assert.throws(()=>textBoxes(image(),[{text:"text",font:badFont}]),/Invalid tool platform input/);
  assert.equal(calls,0);
  const list=[{text:labels}];
  list.map=()=>{calls++;throw new Error("private");};
  assert.equal(eligible(image(),list,slide),true);
  assert.equal(calls,0);
});
test("tool platform rejects malformed and excessive inputs before mutating selected metadata",()=>{
  for(const bad of [null,{},[],{...image(),box:{x:Infinity,y:0,w:800,h:400}},{...image(),box:{x:0,y:0,w:-1,h:400}},{...image(),box:{x:0,y:0,w:100001,h:400}}]){
    const target=image(),before=JSON.stringify(target);
    assert.throws(()=>create([target,bad],[{text:labels}],raster),/Invalid tool platform input/);
    assert.equal(JSON.stringify(target),before);
  }
  assert.throws(()=>create(Array(30001).fill(image()),[],raster),/Invalid tool platform input/);
  assert.throws(()=>eligible(image(),Array(30001).fill({text:""})),/Invalid tool platform input/);
  assert.throws(()=>eligible(image(),[{text:"x".repeat(32769)}]),/Invalid tool platform input/);
  assert.throws(()=>eligible(image(),[],{widthPt:0,heightPt:540}),/Invalid tool platform input/);
  assert.throws(()=>textBoxes(image(),[{text:"x",fontSizePt:Infinity}]),/Invalid tool platform input/);
  assert.doesNotThrow(()=>eligible(image(),Array(30000).fill({text:""})));
  assert.doesNotThrow(()=>eligible(image(),[{text:"x".repeat(32768)}]));
});
test("tool platform rejects unsafe metadata fields without exposing content",()=>{
  const target=image();target.source.reason={toString(){throw new Error("private-token");}};
  assert.throws(()=>create([target],[{text:labels}],raster),{message:"Invalid tool platform input"});
  const badText={text:"private-token",font:{sizePt:NaN}};
  assert.throws(()=>textBoxes(image(),[badText]),{message:"Invalid tool platform input"});
  assert.equal(target.source.toolGapPlatformObjectified,undefined);
});
