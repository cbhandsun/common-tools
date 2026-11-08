"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {selectInventoryReviewTargets:select,readInventoryObservations:read,applyInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-review');
function fixture(){
 const box={x:10,y:10,w:50,h:50},plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'object-a',kind:'container',regionId:'region-root',box},{id:'object-b',kind:'container',regionId:'region-root',box:{x:65,y:10,w:30,h:50}}],
  relations:[{id:'relation-ab',regionId:'region-root',fromId:'object-a',toId:'object-b',direction:'forward'}]};
 const target={index:2,objectId:'object-a',regionId:'region-root',box:{...box}};
 const observation={index:2,kind:'icon',confidence:.99,regionId:'region-root',box:{x:25,y:35,w:20,h:20}};
 return {plan,target,observation};
}

test('semantic presence ranks missing children ahead of text-only nodes without granting source authority',()=>{
 const f=fixture();f.plan.objects[0].pictorialContent='absent';f.plan.objects[1].pictorialContent='present';
 assert.deepEqual(select(f.plan,1).map(t=>t.objectId),['object-b']);
 assert.deepEqual(select(f.plan,32).map(t=>t.objectId),['object-b','object-a']);
 assert.equal(select(f.plan,1)[0].nativePictorial,undefined);
 f.plan.objects[1].pictorialContent='unknown';assert.equal(select(f.plan,1)[0].objectId,'object-b');
 delete f.plan.objects[0].pictorialContent;delete f.plan.objects[1].pictorialContent;
 assert.deepEqual(select(f.plan,2).map(t=>t.objectId),['object-a','object-b']);
});

test('observed standalone illustrations remain discoverable when no connector references their parent',()=>{
 const f=fixture();f.plan.objects[0].pictorialContent='present';f.plan.relations=[];
 assert.deepEqual(select(f.plan,1).map(t=>t.objectId),['object-a']);
 f.plan.objects[0].pictorialContent='absent';assert.deepEqual(select(f.plan,32),[]);
 f.plan.objects[0].pictorialContent='unknown';assert.deepEqual(select(f.plan,32),[]);
 f.plan.objects[0].pictorialContent='present';assert.deepEqual(select(f.plan,32,['object-a']),[]);
 f.plan.objects.push({id:'child',kind:'icon',regionId:'region-root',box:{x:25,y:35,w:20,h:20}});
 assert.deepEqual(select(f.plan,32),[]);
});

test('missing child proposals preserve identities and topology and require native pictorial output',()=>{
 const {plan,target,observation}=fixture(),before=structuredClone(plan),result=apply(plan,[target],[[observation],[structuredClone(observation)]]);
 assert.deepEqual(plan,before);assert.equal(result.plan.objects.length,3);assert.deepEqual(result.plan.relations,plan.relations);
 assert.deepEqual(result.plan.objects[2],{id:'object-local-icon-2',kind:'icon',regionId:'region-root',parentObjectId:'object-a',nativePictorial:true,box:observation.box});
 assert.deepEqual(result.evidence.added,['object-local-icon-2']);
});
test('selection shares the original 64 objects and 32 targets with fair region allocation',()=>{
 const {plan}=fixture();plan.regions.push({id:'region-second',parentId:'region-root',kind:'diagram',box:{x:0,y:0,w:100,h:100}});
 plan.objects.push({...plan.objects[1],id:'object-c',regionId:'region-second'});plan.relations.push({...plan.relations[0],id:'relation-ac',toId:'object-c'});
 assert.deepEqual(select(plan,2).map(t=>t.objectId),['object-a','object-c']);
 assert.deepEqual(select(plan,2,['object-a']).map(t=>t.objectId),['object-b','object-c']);
 plan.objects.push({id:'object-icon',kind:'icon',regionId:'region-root',box:{x:20,y:20,w:10,h:10}});
 assert.equal(select(plan,32).some(t=>t.objectId==='object-a'),false);
 while(plan.objects.length<64)plan.objects.push({...plan.objects[0],id:'object-extra-'+plan.objects.length});
 assert.deepEqual(select(plan,32),[]);assert.deepEqual(select(undefined,32),[]);assert.deepEqual(select(plan,0),[]);
 for(const n of [-1,33,Infinity,NaN,1.5])assert.throws(()=>select(plan,n),RangeError);
});
test('source-bound sheet coordinates are mapped once and cannot acquire neighboring units',()=>{
 const {target}=fixture(),frame={width:100,height:100,sourceTargets:[{index:2,cropBox:{x:5,y:5,w:70,h:70}}],sheetTargets:[{index:2,cropBox:{x:10,y:10,w:70,h:70}}]};
 const raw={index:2,kind:'icon',confidence:.99,regionId:'region-root',box_2d:[300,300,500,500]};
 assert.deepEqual(read({inventories:[raw]},[target],frame)[0].box,{x:25,y:25,w:20,h:20});
 const outside=read({inventories:[{...raw,box_2d:[0,0,500,500]}]},[target],frame);assert.equal(outside[0].rejection,'source-window');
 for(const rows of [[raw,raw],[],[{...raw,index:3}]])assert.throws(()=>read({inventories:rows},[target],frame),TypeError);
 const invalid=read({inventories:[{...raw,box_2d:[300,300,250,500]}]},[target],frame);
 assert.equal(invalid[0].rejection,'geometry-contract');assert.equal(invalid[0].box,null);
 const original=fixture().plan,declined=apply(original,[target],[invalid,invalid]);
 assert.deepEqual(declined.plan.objects,original.objects);
 assert.deepEqual(declined.evidence.rejected,[{id:target.objectId,reason:'geometry-contract'}]);
 assert.deepEqual(read({},[],undefined),[]);
 let calls=0;for(const value of [null,[],new Proxy({},{}),{get inventories(){calls++;throw Error('private');}}])assert.throws(()=>read(value,[],undefined),TypeError);assert.equal(calls,0);
});
test('two observations reject uncertainty, clipped units, stale parents and contradictory geometry',()=>{
 const mutations=[o=>o.kind='unknown',o=>o.confidence=.89,o=>o.regionId='region-other',o=>o.box=null,o=>o.box.x=58,o=>o.box.x=31,o=>o.rejection='source-window'];
 for(const mutate of mutations){const {plan,target,observation}=fixture(),other=structuredClone(observation);mutate(other);
  const result=apply(plan,[target],[[observation],[other]]);assert.deepEqual(result.plan.objects,plan.objects);assert.equal(result.evidence.rejected.length,1);}
 const f=fixture();f.target.box.x++;assert.equal(apply(f.plan,[f.target],[[f.observation],[f.observation]]).evidence.rejected[0].reason,'parent-binding');
 const g=fixture();assert.throws(()=>apply(g.plan,[g.target,g.target],[[g.observation,g.observation],[g.observation,g.observation]]),TypeError);
 assert.throws(()=>apply(g.plan,[g.target],[[g.observation]]),TypeError);
});
test('duplicate units, identity collisions and exhausted capacity never evict existing objects',()=>{
 for(const kind of ['duplicate','identity','capacity']){const {plan,target,observation}=fixture();
  if(kind==='duplicate')plan.objects.push({id:'object-existing',kind:'icon',regionId:'region-root',box:{...observation.box}});
  if(kind==='identity')plan.objects.push({...plan.objects[1],id:'object-local-icon-2'});
  if(kind==='capacity')while(plan.objects.length<64)plan.objects.push({...plan.objects[1],id:'object-extra-'+plan.objects.length});
  const result=apply(plan,[target],[[observation],[observation]]);assert.deepEqual(result.plan.objects,plan.objects);assert.equal(result.evidence.added.length,0);
 }
});
