'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/source-scene-physical-inventory');
function fixture(){return {version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
 regions:[{id:'root',kind:'section',parentId:null,box:{x:0,y:0,w:100,h:100}}],objects:[
  {id:'alias',kind:'container',regionId:'root',box:{x:10,y:10,w:30,h:40}},
  {id:'node',kind:'container',regionId:'root',box:{x:12,y:11,w:28,h:39}},
  {id:'child',kind:'icon',regionId:'root',parentObjectId:'alias',box:{x:20,y:20,w:5,h:5}}],
 relations:[{id:'edge',regionId:'root',fromId:'alias',toId:'node',direction:'both'}],
 admission:{complete:false,rejections:[{collection:'object',index:9,reason:'object-contract'}]}};}
test('source-proven aliases release only shared object slots and rebind children and every relation',()=>{
 const f=fixture(),before=JSON.stringify(f),out=compact(f,[{id:'alias',canonicalId:'node'}]);
 assert.deepEqual(out.plan.objects.map(o=>o.id),['node','child']);assert.equal(out.plan.objects[1].parentObjectId,'node');
 assert.deepEqual(out.plan.relations,[{...f.relations[0],fromId:'node'}]);assert.deepEqual(out.plan.admission,f.admission);
 assert.equal(out.plan.admission.complete,false);assert.equal(out.evidence.releasedObjectSlots,1);assert.equal(JSON.stringify(f),before);
 out.plan.objects[0].box.x=99;out.plan.regions[0].box.x=99;assert.equal(JSON.stringify(f),before);
});
test('source-proven aliases rebind complete program membership without new units or clearing failures',()=>{
 const f=fixture();f.regionPrograms=[{regionId:'root',objects:['alias','node','child'],relations:['edge'],labels:[]}];
 const before=JSON.stringify(f),result=compact(f,[{id:'alias',canonicalId:'node'}]);
 assert.deepEqual(result.plan.regionPrograms[0].objects,['node','child']);assert.deepEqual(result.plan.regionPrograms[0].relations,['edge']);
 assert.deepEqual(result.plan.admission,f.admission);assert.equal(JSON.stringify(f),before);
});
test('empty observations never consolidate coincident provider rectangles or drop failed hypotheses',()=>{
 const f=fixture();f.objects[1].box={...f.objects[0].box};const out=compact(f,[]);
 assert.deepEqual(out.plan,f);assert.equal(out.evidence.releasedObjectSlots,0);
});
test('alias chains rebind transitively and cannot increase the original 64-object capacity',()=>{
 const f=fixture();f.objects.push({id:'alias2',kind:'container',regionId:'root',box:{x:10,y:10,w:30,h:40}});
 f.objects.push(...Array.from({length:60},(_,i)=>({id:'extra-'+i,kind:'icon',regionId:'root',box:{x:60,y:60,w:2,h:2}})));
 const out=compact(f,[{id:'alias2',canonicalId:'alias'},{id:'alias',canonicalId:'node'}]);
 assert.equal(out.plan.objects.length,62);assert.equal(out.evidence.releasedObjectSlots,2);
 assert.deepEqual(out.evidence.aliases,[{id:'alias2',canonicalId:'node'},{id:'alias',canonicalId:'node'}]);
 f.objects.push({id:'overflow',kind:'icon',regionId:'root',box:{x:60,y:60,w:2,h:2}});assert.throws(()=>compact(f,[]),TypeError);
});
test('unknown, duplicate, self, cyclic, cross-owner and non-container alias bindings fail closed',()=>{
 const f=fixture();for(const rows of [[{id:'missing',canonicalId:'node'}],[{id:'alias',canonicalId:'missing'}],
  [{id:'alias',canonicalId:'alias'}],[{id:'alias',canonicalId:'node'},{id:'alias',canonicalId:'node'}],
  [{id:'alias',canonicalId:'node'},{id:'node',canonicalId:'alias'}],[{id:'child',canonicalId:'node'}],
  [{id:'alias',canonicalId:'node',extra:true}],[{id:7,canonicalId:'node'}]])assert.throws(()=>compact(f,rows),TypeError);
 f.objects[1].regionId='other';assert.throws(()=>compact(f,[{id:'alias',canonicalId:'node'}]),TypeError);
 f.objects[1].regionId='root';f.objects[1].parentObjectId='parent';assert.throws(()=>compact(f,[{id:'alias',canonicalId:'node'}]),TypeError);
});
test('hostile and extreme alias inputs never invoke getters or expose exception contents',()=>{
 const f=fixture();let calls=0;const hostile={get id(){calls++;throw Error('private-secret');},canonicalId:'node'};
 const list=[];Object.defineProperty(list,'0',{get(){calls++;throw Error('private-secret');}});
 for(const rows of [null,{},new Proxy([],{}),new Array(1),list,[hostile],[new Proxy({id:'alias',canonicalId:'node'}, {})],
  Array(65).fill({id:'alias',canonicalId:'node'})])assert.throws(()=>compact(f,rows),e=>e instanceof TypeError&&!e.message.includes('private-secret'));
 assert.equal(calls,0);
});
