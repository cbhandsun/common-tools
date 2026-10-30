'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readRegionalRelationAnchor:read,regionalRelationAnchorsAgree:agree}=require('../packages/slideclone-core/scene-plan/source-scene-regional-relation-anchor');
function fixture(){
 const target={index:7,regionId:'root',box:{x:50,y:20,w:100,h:80}};
 const frame={width:200,height:100,sourceTargets:[{index:7,cropBox:{...target.box}}],sheetTargets:[{index:7,cropBox:{x:10,y:10,w:100,h:80}}]};
 return {target,frame};
}
test('regional shaft locations map independently from each atlas into one original source frame',()=>{
 const f=fixture(),a=read([300,200,500,400],f.target,f.frame);
 assert.deepEqual(a,{shaftBox:{x:80,y:40,w:40,h:20}});
 const second={...f.frame,width:400,height:200,sheetTargets:[{index:7,cropBox:{x:100,y:30,w:100,h:80}}]};
 const b=read([250,325,350,425],f.target,second);assert.deepEqual(a,b);assert.equal(agree(a,b),true);
 assert.deepEqual(read(null,f.target,f.frame),{});assert.deepEqual(read(undefined,f.target,f.frame),{});
});
test('unsafe, empty, foreign, invalid and conflicting shaft proposals cannot manufacture consensus',()=>{
 const f=fixture(),good=read([300,200,500,400],f.target,f.frame);
 for(const raw of [[0,0,1,1],[500,400,300,200],[300,200,500],[-1,200,500,400]]){
  const failed=read(raw,f.target,f.frame);assert.equal(failed.rejection,'relation-anchor-window');assert.equal(agree(good,failed),false);
 }
 assert.equal(agree(good,{}),false);assert.equal(agree({},good),false);assert.equal(agree({},{}),true);
 assert.equal(agree(good,{shaftBox:{...good.shaftBox,x:110}}),false);
 let reads=0;const hostile=[300,200,500,400];Object.defineProperty(hostile,0,{get(){reads++;return 300;}});
 assert.throws(()=>read(hostile,f.target,f.frame),TypeError);assert.equal(reads,0);
 assert.throws(()=>read([300,200,500,400],f.target,undefined),TypeError);
 assert.throws(()=>read(Array(5).fill(0),f.target,f.frame),TypeError);
});
test('new regional relation boundary is included in unified CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-scene-regional-relation-anchor.test.js'));
});

test('two-view regional admission retains the original shaft, rejects conflicts and charges failed proposals',()=>{
 const f=fixture(),{readRegionalInventoryObservations:decode,applyRegionalInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
 const objects=[{id:'left',regionId:'root',kind:'container',box:{x:60,y:40,w:20,h:20}},
  {id:'right',regionId:'root',kind:'container',box:{x:120,y:40,w:20,h:20}}];
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:200,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{...f.target.box}}],objects,relations:[]};
 const target={...f.target,endpoints:objects.map(o=>({id:o.id,box:{...o.box}}))};
 const response={regionInventories:[{index:7,units:[],relations:[{from:'left',to:'right',direction:'forward',shaftBox_2d:[300,200,500,400]}]}]};
 const a=decode(response,[target],f.frame,{objects:0,relations:1}),before=structuredClone(plan);
 const out=apply(plan,[target],[a,structuredClone(a)]);
 assert.deepEqual(out.plan.relations[0].shaftBox,{x:80,y:40,w:40,h:20});assert.deepEqual(plan,before);
 const conflict=structuredClone(a);conflict[0].relations[0].shaftBox.x+=20;
 const failed=apply(plan,[target],[a,conflict]);assert.equal(failed.plan.relations.length,0);
 assert.equal(failed.evidence.rejectedRelations[0].reason,'relation-consensus');
 assert.equal(require('../packages/slideclone-core/scene-plan/source-scene-relation-batches').sceneLocalRelationCapacity(failed.plan),23);
});
