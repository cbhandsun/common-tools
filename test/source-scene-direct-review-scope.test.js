'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSceneDirectReviewScope:scope}=require('../packages/slideclone-core/scene-plan/source-scene-direct-review-scope');
const {selectRegionalInventoryTargets:select,applyRegionalInventoryReview:apply,regionalInventoryPrompt:prompt}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {initializeSceneObjectBatches,sceneLocalObjectCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
function fixture(){
 const root={id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:800}},child={id:'card',parentId:'root',kind:'card',box:{x:0,y:150,w:1000,h:650}};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:1000,heightPx:800,regions:[root,child],objects:[],relations:[],
  observedInventory:[{regionId:'root',containers:3,icons:4,relations:0},{regionId:'card',containers:4,icons:2,relations:1}]};
 const labels=[{box:{x:200,y:20,w:300,h:30}},{box:{x:650,y:25,w:150,h:25}},{box:{x:20,y:500,w:500,h:30}}];
 return {plan,labels};
}
test('page-owned source labels create a bounded view without inheriting descendant endpoints or census',()=>{
 const {plan,labels}=fixture(),before=structuredClone({plan,labels}),window=scope(plan,'root',labels);
 assert.deepEqual(window,{x:191,y:11,w:618,h:48});
 const chosen=select(plan,32,0,undefined,undefined,0,labels);
 assert.equal(chosen[0].regionId,'root');assert.deepEqual(chosen[0].box,window);assert.deepEqual(chosen[0].ownerBox,plan.regions[0].box);
 assert.equal(chosen[0].endpoints,undefined);assert.equal(chosen[0].addObjects,true);
 assert.deepEqual(chosen[0].inventoryMissing,{containers:3,icons:4,relations:0});
 assert.deepEqual({plan,labels},before);chosen[0].ownerBox.w=1;chosen[0].box.x=999;
 assert.deepEqual(scope(plan,'root',labels),window);
});
test('unknown or present direct relations and legacy calls retain full source endpoint context',()=>{
 for(const relations of [null,1]){const {plan,labels}=fixture();plan.observedInventory[0].relations=relations;
  assert.equal(scope(plan,'root',labels),null);assert.deepEqual(select(plan,32,0,undefined,undefined,0,labels),select(plan,32,0));}
 const {plan}=fixture();assert.equal(scope(plan,'root',undefined),null);
 assert.equal(scope(plan,'card',[]),null);assert.equal(scope(plan,'root',[]),null);
 assert.equal(select(plan,0,0,undefined,undefined,0,[]).length,0);
});
test('a bounded review preserves existing direct source objects and clips only page context',()=>{
 const {plan,labels}=fixture();plan.objects.push({id:'mark',regionId:'root',kind:'icon',box:{x:10,y:100,w:20,h:20}});
 const result=scope(plan,'root',labels);assert.deepEqual(result,{x:1,y:11,w:808,h:118});
 const atEdge=fixture();atEdge.labels=[{box:{x:0,y:0,w:20,h:10}}];assert.deepEqual(scope(atEdge.plan,'root',atEdge.labels),{x:0,y:0,w:23,h:13});
 const whole=fixture();whole.labels=[{box:{x:0,y:0,w:1000,h:800}}];assert.equal(scope(whole.plan,'root',whole.labels),null);
});
test('bounded observations remain attached to the immutable owner and charge rejected child or out-of-scope units',()=>{
 const f=fixture();f.plan=initializeSceneObjectBatches(f.plan);
 const target={...select(f.plan,32,0,undefined,undefined,0,f.labels)[0],index:5},before=structuredClone(f.plan);
 const rows=[{index:5,units:[{kind:'container',confidence:.99,box:{x:220,y:15,w:260,h:40}}],relations:[]}];
 const good=apply(f.plan,[target],[rows,rows]);assert.equal(good.plan.objects.length,1);assert.equal(good.plan.objects[0].regionId,'root');
 assert.equal(sceneLocalObjectCapacity(good.plan),31);assert.deepEqual(good.plan.regions,f.plan.regions);assert.deepEqual(good.plan.observedInventory,f.plan.observedInventory);
 for(const box of [{x:20,y:500,w:50,h:30},{x:100,y:15,w:30,h:20}]){
  const bad=structuredClone(rows);bad[0].units[0].box=box;
  const rejected=apply(f.plan,[target],[bad,bad]);assert.equal(rejected.plan.objects.length,0);assert.equal(sceneLocalObjectCapacity(rejected.plan),31);
  assert.equal(rejected.evidence.rejected[0].reason,'direct-owner-scope');
 }
 const stale=structuredClone(f.plan);stale.regions[0].box.w=999;
 assert.throws(()=>apply(stale,[target],[rows,rows]),/owner binding/);
 for(const change of [t=>{t.endpoints=[{id:'card',box:f.plan.regions[1].box}];},t=>{t.boundaryReview=true;},t=>{t.ownerBox.w=999;},t=>{t.box.x=-1;}]){
  const bad=structuredClone(target);change(bad);assert.throws(()=>apply(f.plan,[bad],[rows,rows]),/owner binding/);
 }
 assert.deepEqual(f.plan,before);assert.match(prompt([target],{objects:32,relations:24},undefined),/directOwnerWindow/);
});
test('local slot exhaustion cannot make a bounded root claim another batch or hidden capacity',()=>{
 const f=fixture();f.plan=initializeSceneObjectBatches(f.plan);
 f.plan.objectBatches.batches.push({id:'local-consensus',members:[],reviewed:[],rejected:32});
 assert.equal(sceneLocalObjectCapacity(f.plan),0);
 const selected=select(f.plan,32,0,undefined,undefined,0,f.labels);
 assert.ok(selected.every(t=>!t.ownerBox&&!t.addObjects));
});
test('empty, extreme, malformed and hostile source controls fail without getters or content exposure',()=>{
 const {plan}=fixture();let calls=0;const hostile={};Object.defineProperty(hostile,'box',{enumerable:true,get(){calls++;throw Error('private-user-content');}});
 const frames=[null,{},new Array(1),new Proxy([],{}),[hostile],[new Proxy({box:{x:1,y:1,w:1,h:1}}, {})],
  [{box:{x:NaN,y:1,w:1,h:1}}],[{box:{x:1,y:1,w:Infinity,h:1}}],[{box:{x:-1,y:1,w:1,h:1}}],
  [{box:{x:1000,y:1,w:1,h:1}}],Array(513).fill({box:{x:1,y:1,w:1,h:1}})];
 for(const value of frames)assert.throws(()=>scope(plan,'root',value),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(calls,0);assert.equal(scope(plan,'root',[]),null);
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-direct-review-scope.test.js','unit'),true);
});
