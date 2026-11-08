'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
const {applyBatchedSceneReview}=require('../packages/slideclone-core/scene-plan/source-scene-ocr-batches');
const {sourceSceneReviewCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-review');
const {allocateSourceSceneReview}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
const {writePng}=require('../packages/slideclone-core/png');
const hash='a'.repeat(64);
function fixture(t,count=38){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ocr-batches-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 return {root,sourceFile,dimensions:{widthPx:100,heightPx:100},isCancellationRequested:async()=>false,
  ocr:{lines:Array.from({length:count},(_,i)=>({text:'label'+i,confidence:.8,box:{x:10,y:10,w:30,h:10}}))}};
}
test('38 mandatory OCR targets receive exactly two independent observations in disjoint bounded batches',async t=>{
 const f=fixture(t),seen=[],before=JSON.stringify(f.ocr);let calls=0;
 const result=await createSourceScenePlanner({maxReviewBatches:2,recognize:async request=>{
  calls++;if(request.task==='structure'){assert.match(request.prompt,/of 64 authorized/);return {reviews:[],missingText:[]};}
  const indices=request.localTargets.reviews;assert.ok(indices.length<=32);seen.push(indices.slice());
  return {reviews:indices.map(index=>({index,kind:'text'})),recoveredText:[]};
 }})(f);
 assert.equal(calls,5);assert.equal(result.evidence.reviewed,38);assert.equal(result.ocr.lines.length,38);
 assert.deepEqual(seen.map(rows=>rows.length),[32,32,6,6]);
 assert.deepEqual(seen[0],seen[1]);assert.deepEqual(seen[2],seen[3]);
 assert.deepEqual([...seen[0],...seen[2]],Array.from({length:38},(_,i)=>i));
 assert.equal(JSON.stringify(f.ocr),before);assert.equal(result.evidence.reviewAllocation.batchCount,2);
 const directory=path.join(f.root,fs.readdirSync(f.root).find(n=>n.startsWith('scene-review-')));
 const allocations=[JSON.parse(fs.readFileSync(path.join(directory,'allocation.json'))),JSON.parse(fs.readFileSync(path.join(directory,'ocr-batch-01','allocation.json')))];
 const charge=allocations.reduce((sum,a)=>sum+a.sheetPixels+a.reservedPixels+(a.focusPixels??0),0);
 const evidence=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.ok(charge<=4000000);assert.ok(evidence.cropPixels<=charge);
});
test('a failed or unsolicited first-batch response cannot dispatch later batches',async t=>{
 for(const unsolicited of [false,true]){
  const f=fixture(t);let calls=0;
  await assert.rejects(createSourceScenePlanner({maxReviewBatches:2,recognize:async request=>{
   calls++;if(request.task==='structure')return {reviews:[],missingText:[]};
   if(!unsolicited)throw new Error('provider failure');
   return {reviews:request.localTargets.reviews.map((index,i)=>({index:i===0?37:index,kind:'text'})),recoveredText:[]};
  }})(f));
  assert.ok(calls<=3);assert.ok(calls>=2);
 }
});
test('authorized maximum covers all 512 original indices without resetting the pixel or call ledger',async t=>{
 const f=fixture(t,512);let calls=0;
 const result=await createSourceScenePlanner({maxReviewBatches:16,recognize:async request=>{
  calls++;if(request.task==='structure')return {reviews:[],missingText:[]};
  assert.equal(request.localTargets.reviews.length,32);
  return {reviews:request.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
 }})(f);
 assert.equal(calls,33);assert.equal(result.evidence.reviewed,512);assert.equal(result.ocr.lines.length,512);
 assert.equal(result.evidence.reviewAllocation.batchCount,16);
});
test('cancellation or changed source during a batch prevents subsequent dispatch',async t=>{
 for(const mutate of [false,true]){
  const f=fixture(t);let cancelled=false,calls=0;f.isCancellationRequested=async()=>cancelled;
  await assert.rejects(createSourceScenePlanner({maxReviewBatches:2,recognize:async request=>{
   calls++;if(request.task==='structure')return {reviews:[],missingText:[]};
   if(mutate)fs.appendFileSync(f.sourceFile,Buffer.from([0]));else cancelled=true;
   return {reviews:request.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
  }})(f));
  assert.ok(calls<=3);
 }
});
test('batch authorization has a fixed maximum and spent pixels cannot reset across batches',()=>{
 const reviews=Array.from({length:38},(_,index)=>({index,kind:'uncertain'}));
 assert.equal(sourceSceneReviewCapacity(reviews,0,2).remaining,26);
 assert.throws(()=>sourceSceneReviewCapacity(reviews),/exceeds boundary/);
 assert.throws(()=>sourceSceneReviewCapacity(reviews,0,17),/batch budget/);
 const target={index:0,box:{x:10,y:10,w:10,h:10},role:'review',optional:false,textKnown:false};
 assert.throws(()=>allocateSourceSceneReview({width:100,height:100,targets:[target],spentPixels:4000000}),/pixel budget/);
 for(const spentPixels of [-1,4000001,NaN,'0'])assert.throws(()=>allocateSourceSceneReview({width:100,height:100,targets:[],spentPixels}),/spent pixel budget/);
 assert.equal(allocateSourceSceneReview({width:100,height:100,targets:[],spentPixels:4000000}).indices.length,0);
 const {createNativeRebuilder}=require('../packages/remote-mcp-server/image-native-rebuilder');
 for(const sceneReviewBatches of [null,'2',0,17,Infinity,1.5])assert.throws(()=>createNativeRebuilder({}, {sceneReviewBatches,sceneVision:async()=>{}}),/batch budget/);
});
function mergeFixture(){
 const ocr={lines:Array.from({length:38},(_,i)=>({text:'label'+i,confidence:.99,box:{x:10,y:10,w:30,h:10}}))};
 const global={sourceHash:hash,reviews:ocr.lines.map((_,index)=>({index,kind:'uncertain'}))};
 const batches=[Array.from({length:32},(_,i)=>i),Array.from({length:6},(_,i)=>i+32)].map(targets=>({targets,
  local:{sourceHash:hash,reviews:targets.map(index=>({index,kind:index===35?'graphic':'text'}))},
  context:{sourceHash:hash,reviews:targets.map(index=>({index,kind:index===35?'graphic':'text'}))}}));
 return {ocr,dimensions:{widthPx:100,heightPx:100},sourceHash:hash,global,batches};
}
test('batch merging preserves original indices, requires dual agreement and complete non-overlapping coverage',()=>{
 const f=mergeFixture(),result=applyBatchedSceneReview(f);
 assert.equal(result.ocr.lines.length,37);assert.equal(result.ocr.lines[35].text,'label36');
 assert.deepEqual(result.evidence.rejectedOcr.map(row=>row.index),[35]);assert.equal(result.evidence.reviewed,38);
 f.batches[1].context.reviews.find(row=>row.index===35).kind='mixed';assert.equal(applyBatchedSceneReview(f).ocr.lines.length,38);
 for(const mutate of [g=>g.batches.pop(),g=>g.batches.push(g.batches[0]),g=>g.batches[1].local.reviews.pop(),g=>g.batches[1].local.sourceHash='b'.repeat(64)]){
  const g=mergeFixture();mutate(g);assert.throws(()=>applyBatchedSceneReview(g));
 }
});
test('hostile batch envelopes or target accessors cannot execute, and empty OCR remains valid',()=>{
 let touched=false;const f=mergeFixture();
 for(const batches of [null,[],new Array(1),new Proxy([],{}),[{get targets(){touched=true;throw Error('private');}}]])assert.throws(()=>applyBatchedSceneReview({...f,batches}));
 const targets=[];Object.defineProperty(targets,0,{get(){touched=true;return 0;}});
 assert.throws(()=>applyBatchedSceneReview({...f,batches:[{targets,local:{},context:{}}]}));assert.equal(touched,false);
 const empty={sourceHash:hash,reviews:[]};
 assert.deepEqual(applyBatchedSceneReview({ocr:{lines:[]},dimensions:f.dimensions,sourceHash:hash,global:empty,batches:[{targets:[],local:empty,context:empty}]}).ocr.lines,[]);
 assert.equal(require('../scripts/test-suites').classifyTestFile(__filename),'integration');
});
test('more than 32 unresolved reviewed graphics still fail the unchanged completion quality gate',()=>{
 const {unresolvedReviewedGraphicCount}=require('../packages/slideclone-core/scene-plan/source-scene-reviewed-graphics');
 const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
 const evidence={unresolvedReviewedGraphics:Array.from({length:38},(_,i)=>i)};
 assert.equal(unresolvedReviewedGraphicCount(evidence),38);
 const result=auditNativeComponentQuality({pages:[{shapes:[],images:[],textBoxes:[]}],meta:{sourceSceneReview:evidence}});
 assert.equal(result.passed,false);assert.equal(result.metrics.unresolvedSceneComponents,38);
});
