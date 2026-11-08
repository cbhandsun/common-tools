"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {parseSourceScenePlan,admitSourceScenePlan,SCENE_PLAN_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {buildSceneInventoryEvidence,auditSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
const source={sourceHash:'a'.repeat(64),widthPx:100,heightPx:100};
function proposal(){return {format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[[0,null,'section',[0,0,1000,1000]],[1,0,'card',[100,100,900,900]]],
 objects:[[0,1,'container',[200,200,400,400],'present'],[1,1,'icon',[230,230,330,330],'unknown']],relations:[],
 inventory:[[0,0,0,0],[1,1,1,2]]};}
const item=id=>({id:'native-'+id,source:{sceneInventoryId:id}});
function compiled(plan,items){return buildSceneInventoryEvidence(plan,items,[]);}
test('observed inventory preserves counts beyond slots without inventing objects or changing legacy parsing',()=>{
 const raw=proposal(),before=JSON.stringify(raw),plan=parseSourceScenePlan(raw,source);
 assert.deepEqual(plan.observedInventory,[{regionId:'region-n0',containers:0,icons:0,relations:0},{regionId:'region-n1',containers:1,icons:1,relations:2}]);
 assert.deepEqual(admitSourceScenePlan(raw,source).observedInventory,plan.observedInventory);
 assert.equal(plan.objects.length,2);assert.equal(plan.relations.length,0);assert.equal(JSON.stringify(raw),before);
 const old=proposal();old.format='compact-v4';delete old.inventory;
 assert.equal(parseSourceScenePlan(old,source).observedInventory,undefined);
 assert.match(SCENE_PLAN_PROMPT,/compact-v5/);assert.match(SCENE_PLAN_PROMPT,/inventory/);
 raw.inventory[1][3]=31;assert.equal(parseSourceScenePlan(raw,source).observedInventory[1].relations,31);
 raw.relations=Array.from({length:25},(_,id)=>[id,1,0,1,'forward',[340,340,360,360]]);
 assert.throws(()=>parseSourceScenePlan(raw,source),/collection/);
});
test('observations are independent of admission probes and survive rejected units and owner coercion',()=>{
 const raw=proposal();raw.objects[1][1]=0;raw.objects[0][2]='bad-kind';
 const plan=admitSourceScenePlan(raw,source);
 assert.equal(plan.objects.length,1);assert.equal(plan.admission.complete,false);assert.equal(plan.observedInventory[1].containers,1);
 const parent=proposal();parent.objects[1][1]=0;parent.objects[1][0]=2;
 // The numeric object owner is coalesced only when its region identity is absent.
 parent.objects[0][0]=10;parent.objects[1][1]=10;
 const coerced=admitSourceScenePlan(parent,source);
 assert.equal(coerced.objects[1].parentObjectId,'object-n10');assert.equal(coerced.observedInventory.length,2);
});
test('missing proposals, compilation losses and uncertainty remain separate and cannot be canceled by other regions',()=>{
 const plan=parseSourceScenePlan(proposal(),source),evidence=compiled(plan,[item('object-n0')]);
 assert.deepEqual(evidence.regions[1].proposed,{containers:1,icons:1,relations:0});
 const findings=auditSceneInventory(evidence,[item('object-n0')],[],source.sourceHash);
 assert.ok(findings.some(f=>f.regionId==='region-n1'&&f.kind==='relations'&&f.reason==='proposal-missing'&&f.count===2));
 assert.ok(findings.some(f=>f.kind==='icons'&&f.reason==='compile-missing'&&f.count===1));
 const uncertain=proposal();uncertain.inventory[1][1]=null;
 assert.ok(auditSceneInventory(compiled(parseSourceScenePlan(uncertain,source),[]),[],[],source.sourceHash).some(f=>f.reason==='observation-unknown'));
});
test('source completion audits actual surviving materialized identities, not persisted counts or path-part totals',()=>{
 const raw=proposal();raw.inventory[1][3]=0;const plan=parseSourceScenePlan(raw,source);
 const parts=[item('object-n0'),{...item('object-n0'),id:'native-object-n0-part-b'},item('object-n1')],evidence=compiled(plan,parts);
 assert.equal(auditSceneInventory(evidence,parts,[],source.sourceHash).length,0);
 const deck={pages:[{shapes:parts,images:[],source:{sourceScene:{version:1,sourceHash:source.sourceHash,unresolved:[],observedInventory:evidence}}}]};
 assert.equal(auditNativeComponentQuality(deck).passed,true);
 const fragment=parts.slice(1);
 assert.ok(auditSceneInventory(evidence,fragment,[],source.sourceHash).some(f=>f.kind==='containers'&&f.reason==='compile-missing'));
 deck.pages[0].shapes=parts.slice(0,2);
 assert.equal(auditNativeComponentQuality(deck).checks.find(c=>c.name==='source-scene-completion').passed,false);
 assert.ok(auditNativeComponentQuality(deck).findings.some(f=>f.code==='source-scene-inventory-incomplete'));
});

test('legacy inventory evidence remains readable but does not claim complete-member verification',()=>{
 const raw=proposal();raw.inventory[1][3]=0;const plan=parseSourceScenePlan(raw,source),parts=[item('object-n0'),item('object-n1')];
 const current=compiled(plan,parts),legacy={...current,version:1,units:current.units.map(({id,regionId,kind})=>({id,regionId,kind})),
  regions:current.regions.map(({regionId,observed,proposed,materialized})=>({regionId,observed,proposed,materialized}))};
 assert.deepEqual(auditSceneInventory(legacy,parts,[],source.sourceHash),[]);
 assert.deepEqual(auditSceneInventory({...legacy,version:'1'},parts,[],source.sourceHash),[{reason:'evidence-invalid'}]);
});
test('unknown, incomplete, foreign, duplicated, fractional and extreme census rows fail without executing provider code',()=>{
 let calls=0;const getter=[1,1,1,2];Object.defineProperty(getter,1,{get(){calls++;throw Error('secret-key');}});
 const hostile=new Proxy([1,1,1,2],{get(){calls++;throw Error('secret-key');}});
 for(const inventory of [undefined,[],[[0,0,0,0]],[[0,0,0,0],[2,1,1,2]],[[0,0,0,0],[0,1,1,2]],
  [[0,0,0,0],[1,-1,1,2]],[[0,0,0,0],[1,.5,1,2]],[[0,0,0,0],[1,10001,1,2]],
  [[0,0,0,0],[1,'1',1,2]],[[0,0,0,0],[1,1,Infinity,2]],[[0,0,0,0],getter],[[0,0,0,0],hostile],new Array(2)]){
  const raw=proposal();raw.inventory=inventory;
  for(const parse of [parseSourceScenePlan,admitSourceScenePlan])assert.throws(()=>parse(raw,source),e=>e instanceof TypeError&&!e.message.includes('secret-key'));
 }
 assert.equal(calls,0);
});
test('audit fails closed on hostile evidence and source changes while legacy absence remains explicitly unaudited',()=>{
 assert.deepEqual(auditSceneInventory(undefined,[],[],source.sourceHash),[]);
 const plan=parseSourceScenePlan(proposal(),source),evidence=compiled(plan,[]);let calls=0;
 const getter={};Object.defineProperty(getter,'version',{get(){calls++;throw Error('secret-key');}});
 for(const value of [null,{},getter,new Proxy(evidence,{get(){calls++;throw Error('secret-key');}}),
  {...evidence,regions:new Array(2)},{...evidence,units:Array(89).fill({})},{...evidence,sourceHash:'b'.repeat(64)}]){
  assert.deepEqual(auditSceneInventory(value,[],[],source.sourceHash),[{reason:'evidence-invalid'}]);
 }
 assert.equal(calls,0);
});

test('observed omissions schedule complete nonempty regions within original target and object capacity',()=>{
 const {selectRegionalInventoryTargets:select}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
 const raw=proposal();raw.objects.push([2,1,'container',[500,500,700,700],'absent']);
 raw.relations=[[0,1,0,2,'forward',[410,410,490,490]]];raw.inventory[1]=[1,3,2,1];
 const p=parseSourceScenePlan(raw,source),before=JSON.stringify(p),targets=select(p,32,0);
 assert.equal(targets.length,1);assert.equal(targets[0].addObjects,true);assert.equal(targets[0].endpoints.length,3);
 assert.equal(targets[0].endpoints.filter(e=>p.objects.some(o=>o.id===e.id&&o.kind==='icon')).length,1);
 assert.deepEqual(targets[0].inventoryMissing,{containers:1,icons:1,relations:0});
 const old=structuredClone(p);delete old.observedInventory;assert.equal(select(old,32,0).length,0);
 assert.deepEqual(select(p,0,0),[]);assert.equal(JSON.stringify(p),before);
 const full=structuredClone(p);full.objects=Array.from({length:64},(_,i)=>({...p.objects[0],id:'object-'+i}));full.observedInventory[1].containers=100;
 full.relations=Array.from({length:24},(_,i)=>({...p.relations[0],id:'relation-'+i}));
 const {recordSceneLocalRelationBatch}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
 const exhausted=recordSceneLocalRelationBatch(full,full,[],full.relations.map(r=>r.id));assert.deepEqual(select(exhausted,32,0),[]);
});
