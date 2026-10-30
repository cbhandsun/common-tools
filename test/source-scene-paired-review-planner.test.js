"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {writePng}=require('../packages/slideclone-core/png');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {prepareSceneReviewImages}=require('../packages/slideclone-core/scene-plan/source-scene-local-observations');
test('view preparation keeps empty input bounded and rejects invalid budgets before I/O',()=>{
 const request={image:{width:10,height:10,rgba:Buffer.alloc(400,255)},directory:'unused',cropTargets:[],focusIndices:[],reservedPixels:0,pixels:4000000,paddingRatio:0};
 const out=prepareSceneReviewImages(request);assert.deepEqual(out.images,[]);assert.equal(out.pixels,4000000);
 for(const pixels of [-1,NaN,Infinity,4000001])assert.throws(()=>prepareSceneReviewImages({...request,pixels}),TypeError);
 assert.throws(()=>prepareSceneReviewImages({...request,paddingRatio:1}),TypeError);
});
test('view preparation refuses exhausted shared pixels and hostile crop geometry without writing',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-pair-budget-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const target={index:0,cropBox:{x:0,y:0,w:10,h:10},candidateBox:{x:1,y:1,w:5,h:5}};
 const request={image:{width:10,height:10,rgba:Buffer.alloc(400,255)},directory:root,cropTargets:[target],focusIndices:[],reservedPixels:0,pixels:3999999,paddingRatio:0};
 assert.throws(()=>prepareSceneReviewImages(request),RangeError);assert.deepEqual(fs.readdirSync(root),[]);
 let touched=false;Object.defineProperty(target.cropBox,'x',{get(){touched=true;return 0;}});
 assert.throws(()=>prepareSceneReviewImages({...request,pixels:0}),TypeError);assert.equal(touched,false);assert.deepEqual(fs.readdirSync(root),[]);
});
test('planner prepares both charged views before concurrent dispatch and merges in view order',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-pair-'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 let release;const secondStarted=new Promise(resolve=>{release=resolve;});let calls=0,active=0,peak=0;const completion=[];
 const result=await createSourceScenePlanner({recognize:async request=>{
  const call=++calls;if(call===1)return {reviews:[{index:0,kind:'mixed'}]};
  active++;peak=Math.max(peak,active);
  const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')));
  for(const ratio of [0,.7])assert(fs.existsSync(path.join(directory,`sheet-${ratio}.png`)));
  assert.deepEqual(request.localTargets.reviews,[0]);
  if(call===2)await secondStarted;else release();
  completion.push(call);active--;
  return {reviews:[{index:0,kind:call===2?'mixed':'graphic'}],recoveredText:[]};
 }})({root,sourceFile,dimensions:{widthPx:100,heightPx:100},isCancellationRequested:async()=>false,
  ocr:{lines:[{text:'Q',confidence:.4,box:{x:20,y:20,w:10,h:10}}]}});
 assert.equal(calls,3);assert.equal(peak,2);assert.equal(active,0);assert.deepEqual(completion,[3,2]);
 assert.equal(result.ocr.lines.length,1,'disagreement must preserve original text');
 const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-'))),evidence=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.deepEqual(evidence.observations.map(o=>o.reviews[0].kind),['mixed','graphic']);
 assert(evidence.cropPixels<=4000000);
});
