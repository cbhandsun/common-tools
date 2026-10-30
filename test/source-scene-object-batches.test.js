'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initializeSceneObjectBatches:init,sceneObjectBatches:read,sceneObjectLimit:limit,sceneLocalObjectCapacity:remaining,
 sceneHeaderObjectCapacity:headers,recordSceneLocalObjectBatch:record,sceneInventoryObjectBatchesValid:valid}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
const {applyRegionalInventoryReview:regional,selectRegionalInventoryTargets:select}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {applyStructuralReview:structural}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
const {buildSceneInventoryEvidence:inventory,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
function fixture(n=64){return {version:1,sourceHash:'a'.repeat(64),widthPx:1000,heightPx:1000,
 regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:1000,h:1000}}],
 objects:Array.from({length:n},(_,i)=>({id:'object-'+i,regionId:'root',kind:'container',box:{x:i*5,y:0,w:3,h:3}})),relations:[]};}
function add(plan,n,offset=0){const objects=Array.from({length:n},(_,i)=>({id:'local-'+(i+offset),regionId:'root',kind:'container',box:{x:i*5,y:30+offset,w:3,h:3}}));
 return record(plan,{...plan,objects:[...plan.objects,...objects]},objects.map(o=>o.id));}
test('global64 and one shared local32 admit96; legacy plans and raw provider collections remain64',()=>{
 const old=fixture();assert.equal(limit(old),64);assert.equal(remaining(old),0);
 assert.throws(()=>add(old,1),TypeError);
 const first=init(old),before=structuredClone(first),second=add(first,16),final=add(second,16,16);
 assert.equal(final.objects.length,96);assert.equal(remaining(final),0);assert.equal(headers(final),0);
 assert.deepEqual(first,before);assert.throws(()=>add(final,1,32),RangeError);assert.throws(()=>init(final),TypeError);
 const wire={coordinateSpace:'source-pixels',regions:old.regions,objects:old.objects,relations:[]};
 assert.equal(admit(wire,old).objects.length,64);wire.objects=[...wire.objects,{...old.objects[0],id:'overflow'}];
 assert.throws(()=>admit(wire,old),TypeError);
 wire.objects=old.objects;wire.objectBatches=final.objectBatches;
 assert.equal(admit(wire,old).objectBatches.batches.length,1);
});
test('global rejected controls consume original slots; local rejection never refunds or refreshes',()=>{
 const f=fixture(63);f.admission={complete:false,rejections:[{collection:'object',index:63,reason:'object-contract'}]};
 const p=init(f);assert.equal(headers(p),0);assert.equal(remaining(p),32);
 const rejected=record(p,p,[],[],31);assert.equal(remaining(rejected),1);
 const repeated=record(rejected,rejected,[],[],1);assert.equal(remaining(repeated),0);
 assert.deepEqual(read(record(repeated,repeated,[])),read(repeated));assert.throws(()=>record(repeated,repeated,[],[],1),RangeError);
 assert.equal(valid(repeated.objectBatches,repeated.objects,repeated.sourceHash),true);
});
test('corrections including unchanged and repeated ones charge slots shared with later additions',()=>{
 const p=init(fixture());const once=record(p,p,[],['object-0']),twice=record(once,once,[],['object-0']);
 assert.equal(remaining(twice),30);assert.deepEqual(read(twice).batches[1].reviewed,['object-0','object-0']);
 const target={index:9,objectId:'object-1',box:p.objects[1].box};
 const row={index:9,kind:'container',confidence:.99,regionId:'root',box:null};
 const corrected=structural(twice,[target],[[row],[row]]).plan;assert.equal(remaining(corrected),29);
 assert.throws(()=>add(corrected,30),RangeError);assert.equal(add(corrected,29).objects.length,93);
});
test('source-proven aliases retain spent slots and complete serialized ownership',()=>{
 const p=init(fixture());const result=compact(p,[{id:'object-1',canonicalId:'object-0'}]).plan;
 assert.equal(result.objects.length,63);assert.equal(headers(result),0);assert.equal(remaining(result),32);
 assert.equal(valid(result.objectBatches,result.objects,result.sourceHash),true);
 const out=add(result,32);assert.equal(out.objects.length,95);assert.equal(remaining(out),0);
 assert.throws(()=>add(out,1,32),RangeError);assert.deepEqual(p.objects,fixture().objects);
});
test('a reviewed canonical owner correction preserves source alias ownership without refunding either batch',()=>{
 const f=fixture();f.regions.push({id:'child',parentId:'root',kind:'section',box:{x:0,y:0,w:500,h:500}});
 const p=compact(init(f),[{id:'object-1',canonicalId:'object-0'}]).plan;
 const changed={...p,objects:p.objects.map(o=>o.id==='object-0'?{...o,regionId:'child'}:o)};
 const out=record(p,changed,[],['object-0']);assert.equal(remaining(out),31);assert.equal(headers(out),0);
 assert.equal(valid(out.objectBatches,out.objects,out.sourceHash),true);
 assert.equal(read(out).batches[0].members.find(m=>m.id==='object-1').regionId,'child');
 const foreign={...out,objects:out.objects.map(o=>o.id==='object-0'?{...o,regionId:'foreign'}:o)};
 assert.throws(()=>record(out,foreign,[],['object-0']),TypeError);
});
test('two complete regional inventories can append32 objects after a full global batch and update programs',()=>{
 const f=fixture();f.regions.push({id:'left',parentId:'root',kind:'card',box:{x:0,y:100,w:400,h:400}},
  {id:'right',parentId:'root',kind:'card',box:{x:500,y:100,w:400,h:400}});
 f.observedInventory=[{regionId:'root',containers:64,icons:0,relations:0},{regionId:'left',containers:16,icons:0,relations:0},{regionId:'right',containers:16,icons:0,relations:0}];
 f.regionPrograms=f.regions.map(r=>({regionId:r.id,objects:f.objects.filter(o=>o.regionId===r.id).map(o=>o.id),relations:[],labels:[]}));
 const p=init(f);assert.equal(select(p,32,0).length,2);
 const targets=f.regions.slice(1).map((r,index)=>({index:70+index,regionId:r.id,box:r.box}));
 const rows=targets.map(t=>({index:t.index,units:Array.from({length:16},(_,i)=>({index:t.index,kind:'container',confidence:.99,regionId:t.regionId,
  box:{x:t.box.x+i*5,y:120,w:3,h:3}})),relations:[]}));
 const before=structuredClone(p),out=regional(p,targets,[rows,structuredClone(rows)]).plan;
 assert.equal(out.objects.length,96);assert.equal(remaining(out),0);
 assert.deepEqual(out.regionPrograms.map(r=>r.objects.length),[64,16,16]);assert.deepEqual(p,before);
 const shapes=out.objects.map(o=>({id:'native-'+o.id,source:{sceneInventoryId:o.id}}));
 const evidence=inventory(out,shapes,[]);assert.equal(evidence.version,4);assert.deepEqual(audit(evidence,shapes,[],out.sourceHash),[]);
 const tampered=structuredClone(evidence);tampered.objectBatches.batches[1].members[0].regionId='root';
 assert.deepEqual(audit(tampered,shapes,[],out.sourceHash),[{reason:'evidence-invalid'}]);
});
test('context-only and duplicate regional proposals consume local object slots even when none is emitted',()=>{
 const p=init(fixture()),target={index:70,regionId:'root',box:p.regions[0].box};
 const units=[{index:70,kind:'container',confidence:.99,regionId:'root',box:p.objects[0].box}];
 const row={index:70,units,relations:[]},empty={...row,units:[]};
 const duplicate=regional(p,[target],[[row],[row]]).plan;assert.equal(remaining(duplicate),31);assert.equal(duplicate.objects.length,64);
 const contextOnly=regional(duplicate,[target],[[empty],[row]]).plan;assert.equal(remaining(contextOnly),30);
 const extreme={...row,units:Array(31).fill(units[0])},before=structuredClone(contextOnly);
 assert.throws(()=>regional(contextOnly,[target],[[extreme],[extreme]]),RangeError);assert.deepEqual(contextOnly,before);
});
test('regional count follows complete-unit demand and shared reservations rather than a fixed two-region cap',()=>{
 const f=fixture(),gaps=[10,9,8,6,5,4];
 f.regions.push(...gaps.map((n,i)=>({id:'panel-'+i,parentId:'root',kind:'card',box:{x:i*140,y:100,w:120,h:120}})));
 f.observedInventory=f.regions.map((r,i)=>({regionId:r.id,containers:i?gaps[i-1]:64,icons:0,relations:0}));
 const p=init(f),before=structuredClone(p),targets=select(p,32,0);
 assert.deepEqual(targets.map(t=>t.regionId),['panel-0','panel-1','panel-2','panel-4']);
 assert.deepEqual(targets.map(t=>t.preferredObjectSlots),[10,9,8,5]);
 assert.equal(targets.reduce((n,t)=>n+t.preferredObjectSlots,0),32);assert.deepEqual(p,before);
 const reserved=select(p,32,0,undefined,undefined,5);assert.deepEqual(reserved.map(t=>t.preferredObjectSlots),[10,9,8]);
 assert.equal(select(p,1,0).length,1);assert.equal(select(p,0,0).length,0);
 const {allocateSourceSceneReview}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
 const allocation=allocateSourceSceneReview({width:1000,height:1000,targets:targets.map((t,index)=>({index,box:t.box,role:'region-inventory',optional:true,textKnown:false}))});
 assert.equal(allocation.indices.length,4);assert.ok(allocation.sheetPixels+allocation.reservedPixels+(allocation.focusPixels??0)<=4000000);
 for(const bad of [-1,33,1.1,Infinity,'4'])assert.throws(()=>select(p,32,0,undefined,undefined,bad),RangeError);
 const depleted=record(p,p,[],[],32);assert.equal(select(depleted,32,0).length,0);
 const limited=select(record(p,p,[],[],31),32,0);assert.equal(limited.length,1);assert.equal(limited[0].preferredObjectSlots,1);
 assert.equal(p.observedInventory[1].containers,10,'an incomplete reservation cannot lower the independent census');
});
test('missing, foreign, duplicated and forged batch/owner/source identities fail closed',()=>{
 const p=add(init(fixture()),1);
 for(const mutate of [v=>v.sourceHash='b'.repeat(64),v=>v.widthPx=999,v=>v.objectBatches.batches.push(v.objectBatches.batches[1]),
  v=>v.objectBatches.batches[1].members=[],v=>v.objectBatches.batches[1].members[0].id='object-0',
  v=>v.objectBatches.batches[1].members[0].regionId='foreign',v=>v.objectBatches.batches[1].reviewed=['foreign'],
  v=>v.objectBatches.batches[0].rejected=1,v=>v.objectBatches.extra=true]){
  const value=structuredClone(p);mutate(value);assert.throws(()=>read(value),TypeError);
 }
 assert.equal(valid(p.objectBatches,p.objects,'b'.repeat(64)),false);
 const result={...p,objects:p.objects.map((o,i)=>i?o:{...o,regionId:'foreign'})};
 assert.throws(()=>record(p,result,[]),TypeError);assert.throws(()=>record(p,{...p,sourceHash:'b'.repeat(64)},[]),TypeError);
});
test('empty, malformed, extreme, getter and proxy controls never execute user code or expose it',()=>{
 assert.equal(remaining(init(fixture(0))),32);let calls=0;
 const getter={get batches(){calls++;throw Error('secret-key');}},proxy=new Proxy({}, {get(){calls++;throw Error('secret-key');}});
 const rows=[];Object.defineProperty(rows,'0',{get(){calls++;throw Error('secret-key');}});
 const p=init(fixture());
 for(const value of [null,{},getter,proxy,{...p.objectBatches,batches:rows},{...p.objectBatches,batches:new Array(1)},
  {...p.objectBatches,batches:Array(3).fill(p.objectBatches.batches[0])}]){
  assert.throws(()=>read({...p,objectBatches:value}),e=>e instanceof TypeError&&!e.message.includes('secret-key'));
  assert.equal(valid(value,p.objects,p.sourceHash),false);
 }
 for(const rejected of [-1,33,Infinity,'1'])assert.throws(()=>record(p,p,[],[],rejected),TypeError);
 assert.throws(()=>record(p,p,new Proxy([],{})),TypeError);assert.equal(calls,0);
});
test('new regressions are discovered by the unified unit/all CI entry',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.equal(discoverTestFiles(process.cwd(),suite).some(r=>r.file==='test\\source-scene-object-batches.test.js'||r.file==='test/source-scene-object-batches.test.js'),true);
});
