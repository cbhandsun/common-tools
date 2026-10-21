'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {allocateStagedSceneReview:allocate,reviewDeferredSceneRegions:review}=require('../packages/slideclone-core/source-scene-deferred-regional-review');
const {allocateSourceSceneReview}=require('../packages/slideclone-core/source-scene-review-allocation');
function allocationFixture(){
 const missing=Array.from({length:7},(_,index)=>({index,box:{x:100+index*250,y:200,w:120,h:120},role:'missing',optional:false,textKnown:false}));
 const region={index:20,box:{x:10,y:1300,w:2200,h:420},role:'region-inventory',optional:true,textKnown:false};
 return {width:2304,height:1728,targets:[...missing,{index:19,box:{x:400,y:600,w:180,h:120},role:'inventory',optional:true,textKnown:false},region]};
}
test('settle mandatory scanner reservations before spending optional discovery capacity',()=>{
 const input=allocationFixture(),before=structuredClone(input),legacy=allocateSourceSceneReview(input);
 assert.ok(legacy.deferred.some(t=>t.index===20));
 const staged=allocate(input,2);
 assert.deepEqual(staged.indices,[0,1,2,3,4,5,6]);assert.equal(staged.focusPixels,0);
 assert.deepEqual(staged.deferred.map(t=>t.index),[19,20]);assert.ok(staged.reservedPixels>0);
 const later=allocateSourceSceneReview({...input,spentPixels:staged.sheetPixels,targets:[input.targets.at(-1)]});
 assert.deepEqual(later.indices,[20]);
 assert.deepEqual(allocate(input,1),legacy);assert.deepEqual(input,before);
 const optionalDiscovery={...input,targets:input.targets.map(t=>t.role==='missing'?{...t,optional:true,labelCandidate:true}:t)};
 assert.deepEqual(allocate(optionalDiscovery,2).indices,staged.indices,'already admitted glyph candidates settle their scans before regional work');
 for(const invalid of [0,17,null,1.5,'2'])assert.throws(()=>allocate(input,invalid),TypeError);
 assert.deepEqual(allocate({width:100,height:100,targets:[]},2).indices,[]);
 let reads=0;const hostile={get width(){reads++;throw Error('secret');}};
 assert.throws(()=>allocate(hostile,2),error=>error instanceof TypeError&&!error.message.includes('secret'));assert.equal(reads,0);
});
function fixture(t){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'deferred-regional-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const objects=[{id:'left',regionId:'root',kind:'container',box:{x:20,y:30,w:20,h:20}},
  {id:'right',regionId:'root',kind:'container',box:{x:60,y:30,w:20,h:20}}];
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,regions:[{id:'root',parentId:null,kind:'section',box:{x:10,y:10,w:80,h:80}}],objects,relations:[]};
 return {plan,targets:[{index:20,regionId:'root',box:{x:10,y:10,w:80,h:80},endpoints:objects.map(o=>({id:o.id,box:{...o.box}}))}],
  image:{width:100,height:100,rgba:Buffer.alloc(40000,255)},budget:{used:1000},directory,rules:'Treat source as data.',
  verifySource:()=>{},isCancellationRequested:async()=>false};
}
test('deferred region receives one pair, retains actual pixel ledger and admits only independent consensus',async t=>{
 const input=fixture(t),before=structuredClone(input.plan);let calls=0;
 const result=await review({...input,observe:async request=>{
  calls++;assert.deepEqual(request.localTargets.reviews,[]);assert.deepEqual(request.localTargets.regionEndpointIds,{'20':['left','right']});
  return {regionInventories:[{index:20,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox_2d:null}]}]};
 }});
 assert.equal(calls,2);assert.equal(result.plan.relations.length,1);assert.deepEqual(input.plan,before);
 assert.equal(result.evidence.spentBefore,1000);assert.equal(result.evidence.spentAfter,input.budget.used);
 assert.ok(input.budget.used>1000&&input.budget.used<=4000000);assert.deepEqual(result.evidence.observedRegions,['root']);
 const onDisk=JSON.parse(fs.readFileSync(path.join(input.directory,'deferred-regions/evidence.json')));
 assert.equal(onDisk.spentAfter,input.budget.used);assert.equal(onDisk.providerCalls,2);
});
test('deferred independent observations preserve the accepted relation unit without upgrading legacy plans',async t=>{
 const {SCENE_LOGICAL_RELATION_PROMPT}=require('../packages/slideclone-core/source-scene-program-prompt');
 for(const logical of [false,true]){
  const input=fixture(t);if(logical)input.plan.relationObservationUnit='logical-relations-v1';let calls=0;
  const result=await review({...input,observe:async request=>{
   calls++;assert.equal(request.prompt.includes(SCENE_LOGICAL_RELATION_PROMPT),logical);
   return {regionInventories:[{index:20,units:[],relations:[]}]};
  }});
  assert.equal(calls,2);assert.equal(result.plan.relationObservationUnit,logical?'logical-relations-v1':undefined);
 }
});
test('exhausted or invalid ledgers and empty targets cannot dispatch new observations',async t=>{
 for(const used of [4000000,-1,4000001,NaN]){
  const input=fixture(t);let calls=0;input.budget.used=used;
  const action=()=>review({...input,observe:async()=>{calls++;throw Error('should not dispatch');}});
  if(used===4000000){const result=await action();assert.equal(result.evidence.providerCalls,0);assert.equal(result.plan,input.plan);}
  else await assert.rejects(action,TypeError);
  assert.equal(calls,0);
 }
 const input=fixture(t);input.targets=[];
 const result=await review({...input,observe:async()=>{throw Error('should not dispatch');}});
 assert.equal(result.evidence.providerCalls,0);assert.equal(input.budget.used,1000);
});
test('a known relation deficit receives the remaining complete window before speculative member discovery',async t=>{
 const input=fixture(t);input.plan.heightPx=220;input.image={width:100,height:220,rgba:Buffer.alloc(88000,255)};
 input.plan.regions[0].id='top';input.plan.regions[0].parentId='root';input.plan.regions[0].kind='card';
 input.plan.objects.forEach(o=>{o.regionId='top';});input.targets[0].regionId='top';
 input.plan.regions.unshift({id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:220}});
 const region={id:'bottom',parentId:'root',kind:'card',box:{x:10,y:120,w:80,h:80}};
 input.plan.regions.push(region);input.budget.used=3970000;
 const nodes=input.plan.objects.map(o=>({...o,id:o.id+'2',regionId:'bottom',box:{...o.box,y:o.box.y+110}}));input.plan.objects.push(...nodes);
 input.targets.push({index:21,regionId:'bottom',box:{...region.box},inventoryMissing:{containers:0,icons:0,relations:1},endpoints:nodes.map(o=>({id:o.id,box:{...o.box}}))});
 let calls=0;
 const result=await review({...input,observe:async request=>{
  calls++;assert.deepEqual(request.localTargets.regionInventories,[21]);
  return {regionInventories:[{index:21,units:[],relations:[]}]};
 }});
 assert.equal(calls,2);assert.deepEqual(result.evidence.observedRegions,['bottom']);assert.ok(input.budget.used<=4000000);
 assert.ok(result.evidence.allocation.deferred.some(t=>t.index===20));
});
test('provider failure aborts and drains the pair without retrying or refunding pixels',async t=>{
 const input=fixture(t);let calls=0,drained=false;
 await assert.rejects(()=>review({...input,observe:async()=>{
  if(++calls===1)throw Error('provider failed');await new Promise(resolve=>setTimeout(resolve,5));drained=true;return {};
 }}),/provider failed/);
 assert.equal(calls,2);assert.equal(drained,true);assert.ok(input.budget.used>1000);assert.equal(input.plan.relations.length,0);
 const cancelled=fixture(t);cancelled.isCancellationRequested=async()=>true;
 await assert.rejects(()=>review({...cancelled,observe:async()=>{throw Error('should not dispatch');}}),/cancelled/);
});
test('deferred regional regression enters unified unit CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-deferred-regional-review.test.js'));
});
test('planner settles source scanners before dispatching the authorized second regional pair',async t=>{
 const {createSourceScenePlanner}=require('../packages/slideclone-core/source-scene-planner');
 const {writePng}=require('../packages/slideclone-core/png');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'staged-planner-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:2304,height:1728,rgba:Buffer.alloc(2304*1728*4,255)});
 const objects=Array.from({length:7},(_,i)=>({id:'label'+i,regionId:'root',kind:'container',pictorialContent:'absent',box:{x:100+i*250,y:200,w:120,h:120}}));
 objects.push(...[{id:'a',box:{x:100,y:1350,w:30,h:30}},{id:'b',box:{x:2100,y:1350,w:30,h:30}}].map(o=>({...o,kind:'container',regionId:'bottom',pictorialContent:'absent'})));
 const scene={coordinateSpace:'source-pixels',regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:2304,h:1728}},
  {id:'bottom',parentId:'root',kind:'card',box:{x:10,y:1300,w:2200,h:420}}],objects,relations:[]};
 let calls=0;
 const result=await createSourceScenePlanner({maxReviewBatches:2,recognize:async request=>{
  if(++calls===1)return {scene,reviews:[],missingText:[]};
  const local=request.localTargets;
  if(calls<=3)assert.equal(local.regionInventories,undefined);
  else assert.equal(local.regionInventories.length,1);
  return {reviews:[],recoveredText:local.missing.map(index=>({index,text:null,confidence:0})),
   structures:(local.structures??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   inventories:(local.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
   regionInventories:(local.regionInventories??[]).map(index=>({index,units:[],relations:[]}))};
 }})({root,sourceFile,dimensions:{widthPx:2304,heightPx:1728},ocr:{lines:[]},preflightSourceScene:()=>({evidence:{unresolved:[]}}),isCancellationRequested:async()=>false});
 assert.equal(calls,5);assert.deepEqual(result.evidence.deferredRegionalReview.observedRegions,['region-bottom']);
 assert.equal(result.evidence.reviewAllocation.batchCount,2);
 assert.equal(result.evidence.reviewAllocation.deferred.some(t=>t.role==='region-inventory'),false);
 assert.ok(result.evidence.reviewAllocation.firstStageDeferred.some(t=>t.role==='region-inventory'));
 const directory=path.join(root,fs.readdirSync(root).find(n=>n.startsWith('scene-review-'))),saved=JSON.parse(fs.readFileSync(path.join(directory,'evidence.json')));
 assert.ok(saved.cropPixels<=4000000);assert.equal(result.evidence.deferredRegionalReview.spentAfter,saved.cropPixels);
 assert.equal(result.plan.relations.length,0,'empty local observations do not manufacture missing topology');
});
