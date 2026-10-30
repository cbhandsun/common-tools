'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {allocateSourceSceneReview:allocate,sourceSceneReviewCrop}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
const {prepareSceneReviewImages}=require('../packages/slideclone-core/scene-plan/source-scene-local-observations');
const {readPngBuffer}=require('../packages/slideclone-core/png');
const {sourceSceneLocalPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-local-prompt');

test('a source-clipped icon review requests explicit whole-unit geometry without granting pixel ownership',()=>{
 const input={rules:'',targets:[],missing:[],focused:[],sheetTargets:[],inventories:[],relationPrompt:'',regionalPrompt:'',extraKeys:[],
  structures:[{index:7,objectId:'object-symbol',ownerCandidates:[{id:'region-owner',parentId:null}],
   compileFailures:['icon-isolation:icon-source-clipped-component']}]};
 const prompt=sourceSceneLocalPrompt(input);
 assert.match(prompt,/containing the icon is insufficient/);
 assert.match(prompt,/explicit tight box_2d for that WHOLE pictogram/);
 assert.match(prompt,/including detached details/);
 assert.match(prompt,/never use null to reconfirm the failed envelope/);
 assert.match(prompt,/unchanged source-component and boundary checks/);
 assert.match(prompt,/unknown,0,null,null,null/);
 assert.match(prompt,/box_2d:null if the current box already bounds it/,'ordinary structural reviews retain their geometry contract');
 assert.doesNotMatch(sourceSceneLocalPrompt({...input,structures:[]}),/current envelope has FAILED source isolation/);
});
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {writePng}=require('../packages/slideclone-core/png');
function target(index,role='structure'){return {index,role,box:{x:25+index,y:40,w:18,h:20},optional:role==='probe',textKnown:false};}
test('structural contradictions receive paired native source views without borrowing reserved work or OCR slots',()=>{
 const input={width:180,height:140,targets:[target(0,'review'),target(1),target(2,'relation'),target(3,'probe')]},before=JSON.stringify(input),result=allocate(input);
 assert.deepEqual(result.indices,[0,1,2,3]);assert.deepEqual(result.focusIndices,[0]);assert.deepEqual(result.structureFocusIndices,[1,2,3]);
 const spent=input.targets.flatMap(t=>[0,.7].map(r=>sourceSceneReviewCrop(t,r,input.width,input.height))).reduce((sum,b)=>sum+b.w*b.h,0);
 assert.equal(result.focusPixels,spent);assert.ok(result.sheetPixels+result.reservedPixels+spent<=4000000);assert.equal(JSON.stringify(input),before);
});
test('structural views retain original source bytes, target frame and distinct task label in both observations',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'structural-focus-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const image={width:180,height:140,rgba:Buffer.alloc(180*140*4)};
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)image.rgba.set([x,y,(3*x+y)%255,255],(y*image.width+x)*4);
 const targets=[target(0,'review'),target(1)],allocation=allocate({width:image.width,height:image.height,targets});let pixels=0;
 for(const ratio of [0,.7]){
  const cropTargets=targets.map(t=>{const cropBox=sourceSceneReviewCrop(t,ratio,image.width,image.height);return {index:t.index,cropBox,candidateBox:{...t.box,x:t.box.x-cropBox.x,y:t.box.y-cropBox.y}};});
  const result=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:allocation.focusIndices??[],structureFocusIndices:allocation.structureFocusIndices??[],reservedPixels:allocation.reservedPixels,pixels,paddingRatio:ratio});pixels=result.pixels;
  assert.equal(result.images.length,3);assert.match(result.images[1].label,/OCR index 0;/);assert.match(result.images[2].label,/structural index 1;/);
  const source=cropTargets[1].cropBox,observed=readPngBuffer(result.images[2].bytes);
  assert.equal(observed.width,source.w);assert.equal(observed.height,source.h);
  for(let y=0;y<source.h;y++){const start=((y+source.y)*image.width+source.x)*4;assert.deepEqual(observed.rgba.subarray(y*source.w*4,(y+1)*source.w*4),image.rgba.subarray(start,start+source.w*4));}
 }
 assert.equal(pixels,allocation.sheetPixels+allocation.focusPixels);
 const prompt=sourceSceneLocalPrompt({rules:'',targets:[0],missing:[],focused:[0],focusedStructures:[1],sheetTargets:[],structures:[],inventories:[],relationPrompt:'',regionalPrompt:'',extraKeys:[]});
 assert.match(prompt,/OCR indices \[0\]/);assert.match(prompt,/structural indices \[1\]/);assert.match(prompt,/never for returned geometry/);
});
test('focus images remain optional under source-window, shared pixel and transport limits',()=>{
 const targets=Array.from({length:32},(_,i)=>target(i)),result=allocate({width:180,height:140,targets});
 assert.equal(result.indices.length,32);assert.equal(result.structureFocusIndices.length,31);
 const large=allocate({width:2000,height:2000,targets:[{...target(0),box:{x:300,y:300,w:600,h:600}}]});
 assert.equal(large.indices.length,1);assert.equal(large.structureFocusIndices,undefined);
 assert.deepEqual(allocate({width:1,height:1,targets:[]}),{indices:[],sheetPixels:0,reservedPixels:0,deferred:[]});
});
test('unknown, duplicate, sparse, over-limit and hostile focus controls fail before any files are written',()=>{
 const request={image:{width:2,height:2,rgba:Buffer.alloc(16)},directory:'unused',cropTargets:[{index:0,cropBox:{x:0,y:0,w:1,h:1},candidateBox:{x:0,y:0,w:1,h:1}}],focusIndices:[],reservedPixels:0,pixels:0,paddingRatio:0};
 let calls=0;const getter=[];Object.defineProperty(getter,'0',{enumerable:true,get(){calls++;throw Error('private');}});getter.length=1;
 for(const structureFocusIndices of [null,[1],[0,0],new Array(1),getter,new Proxy([0],{}),Array.from({length:32},(_,i)=>i)])assert.throws(()=>prepareSceneReviewImages({...request,structureFocusIndices}),/focus/);
 assert.throws(()=>prepareSceneReviewImages({...request,focusIndices:[0],structureFocusIndices:[0]}),/focus/);assert.equal(calls,0);
 const hostile={...request.cropTargets[0]};Object.defineProperty(hostile,'index',{enumerable:true,get(){calls++;throw Error('private');}});
 assert.throws(()=>prepareSceneReviewImages({...request,cropTargets:[hostile],structureFocusIndices:[0]}),/Scene/);
 assert.throws(()=>prepareSceneReviewImages({...request,cropTargets:new Proxy(request.cropTargets,{}),structureFocusIndices:[0]}),/Scene/);
 assert.equal(calls,0);
 assert.throws(()=>prepareSceneReviewImages({...request,reservedPixels:4000000,structureFocusIndices:[0]}),/pixel budget/);
});
test('planner wires both focused structural observations into unchanged independent owner consensus',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'structural-focus-planner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:140,height:120,rgba:Buffer.alloc(140*120*4,255)});let calls=0,initialPlan;
 const result=await createSourceScenePlanner({recognize:async request=>{
  if(++calls===1)return {scene:{coordinateSpace:'normalized-1000',regions:[
   {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:1000}},
   {id:'left',parentId:'root',kind:'card',box:{x:0,y:0,w:300,h:400}},
   {id:'right',parentId:'root',kind:'card',box:{x:500,y:400,w:400,h:500}}],
   objects:[{id:'unit',kind:'icon',regionId:'left',box:{x:600,y:500,w:100,h:100}}],relations:[]},reviews:[],missingText:[]};
  initialPlan??=JSON.parse(fs.readFileSync(path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')),'plan.json')));
  const ids=request.localTargets.structures;assert.equal(ids.length,1);
  assert.ok(request.images.some(view=>view.label.includes(`structural index ${ids[0]};`)));
  assert.match(request.prompt,/independent original contexts for structural indices/);
  return {reviews:[],recoveredText:request.localTargets.missing.map(index=>({index,text:null,confidence:0})),
   structures:ids.map(index=>({index,kind:'icon',confidence:.99,regionId:'region-right',box_2d:null}))};
 }})({root,sourceFile,dimensions:{widthPx:140,heightPx:120},ocr:{lines:[{text:'label',confidence:.99,box:{x:2,y:2,w:20,h:10}}]},isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.plan.objects[0].regionId,'region-right');
 assert.deepEqual(result.plan.objects[0].box,{x:84,y:60,w:14,h:12});assert.equal(result.evidence.structuralReview.corrected.length,1);
 assert.equal(result.ocr.lines[0].text,'label');
 const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-')));
 const captured=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.ok(captured.cropPixels<=4000000);
 assert.deepEqual(captured.structuralObservations,Array.from({length:2},()=>[
  {index:captured.structuralObservations[0][0].index,kind:'icon',confidence:.99,regionId:'region-right',box:null}
 ]));
 const original=initialPlan;
 const replay=require('../packages/slideclone-core/scene-plan/source-scene-structural-review').applyStructuralReview(original,
  [{index:captured.structuralObservations[0][0].index,objectId:'object-unit',box:original.objects[0].box}],captured.structuralObservations);
 assert.deepEqual(replay.plan,result.plan);assert.deepEqual(replay.evidence,result.evidence.structuralReview);
});
