'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {rebindRegionProgramMembers,prepareRegionProgramLabels}=require('../packages/slideclone-core/scene-plan/source-scene-region-program');
const {applyRegionalInventoryReview}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {applyInventoryReview}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-review');
const {applyStructuralReview}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
const {compactPhysicalSceneInventory}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},
   {id:'card',parentId:'root',kind:'card',box:{x:10,y:10,w:80,h:80}}],
  objects:[{id:'left',regionId:'card',kind:'container',box:{x:20,y:20,w:20,h:20}},
   {id:'right',regionId:'card',kind:'container',box:{x:60,y:20,w:20,h:20}}],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:2,icons:0,relations:1}],
  admission:{complete:false,rejections:[{collection:'program',index:7,reason:'program-contract'}]},
  regionPrograms:[{regionId:'root',objects:[],relations:[],labels:[]},{regionId:'card',objects:['left','right'],relations:[],labels:[]}]};
 return plan;
}
const bind=plan=>prepareRegionProgramLabels({textBoxes:[]},plan,{widthPt:100,heightPt:100});
test('paired regional additions update program membership without hiding census or rejected programs',()=>{
 const plan=fixture(),before=structuredClone(plan),target={index:5,regionId:'card',box:{...plan.regions[1].box},
  endpoints:plan.objects.map(o=>({id:o.id,box:{...o.box}}))};
 const row={index:5,units:[],relations:[{from:'left',to:'right',direction:'forward'}]};
 const result=applyRegionalInventoryReview(plan,[target],[[row],[row]]);
 const stale={...result.plan,regionPrograms:plan.regionPrograms};
 assert.throws(()=>bind(stale),/inventory is incomplete/);
 assert.doesNotThrow(()=>bind(result.plan));
 assert.deepEqual(result.plan.regionPrograms[1].relations,result.plan.relations.map(r=>r.id));
 assert.deepEqual(result.plan.observedInventory,before.observedInventory);assert.deepEqual(result.plan.admission,before.admission);
 assert.equal(result.plan.relationBatches.length,2);assert.equal(result.plan.relationBatches[1].members.length,1);
 assert.deepEqual(plan,before);assert.equal(result.evidence.addedRelations,1);
});
test('new embedded icons and accepted structural owner changes rebind actual owning programs',()=>{
 const plan=fixture(),target={index:4,objectId:'left',regionId:'card',box:{...plan.objects[0].box}};
 const row={index:4,kind:'icon',regionId:'card',confidence:.99,box:{x:23,y:23,w:5,h:5}};
 const added=applyInventoryReview(plan,[target],[[row],[row]]).plan;
 assert.deepEqual(added.regionPrograms[1].objects,['left','right','object-local-icon-4']);assert.doesNotThrow(()=>bind(added));
 const moved=fixture();moved.objects[0].regionId='root';moved.regionPrograms[0].objects=['left'];moved.regionPrograms[1].objects=['right'];
 const observation={index:3,kind:'container',confidence:.99,regionId:'card',box:{...moved.objects[0].box}};
 const revised=applyStructuralReview(moved,[{index:3,objectId:'left',box:{...moved.objects[0].box}}],[[observation],[observation]]).plan;
 assert.deepEqual(revised.regionPrograms[0].objects,[]);assert.deepEqual(revised.regionPrograms[1].objects,['left','right']);
 assert.doesNotThrow(()=>bind(revised));assert.equal(moved.objects[0].regionId,'root');
});
test('source-proven aliases rebind programs by retained ownership while keeping rejected hypotheses',()=>{
 const plan=fixture();plan.objects.push({...plan.objects[0],id:'alias'});plan.regionPrograms[1].objects.push('alias');
 const next=compactPhysicalSceneInventory(plan,[{id:'alias',canonicalId:'left'}]).plan;
 assert.deepEqual(next.regionPrograms[1].objects,['left','right']);assert.deepEqual(next.admission,plan.admission);
 assert.deepEqual(next.observedInventory,plan.observedInventory);assert.doesNotThrow(()=>bind(next));
});
test('transitions preserve unsupported legacy and empty programs without synthesizing missing regions',()=>{
 const legacy=fixture();delete legacy.regionPrograms;const next={...legacy,objects:[]};assert.equal(rebindRegionProgramMembers(legacy,next),next);
 const empty=fixture();empty.regionPrograms=[];assert.deepEqual(rebindRegionProgramMembers(empty,empty).regionPrograms,[]);
 const partial=fixture();partial.regionPrograms.pop();const out=rebindRegionProgramMembers(partial,partial);
 assert.equal(out.regionPrograms.length,1);assert.equal(out.regionPrograms[0].regionId,'root');
});
test('incomplete, duplicate, foreign and oversized inventories cannot be made complete by rebinding',()=>{
 const plan=fixture();
 for(const mutate of [p=>p.regionPrograms[1].objects.pop(),p=>p.regionPrograms[1].objects.push('left'),
  p=>p.regionPrograms[1].objects.push('foreign'),p=>p.regionPrograms[1].relations.push('missing')]){
  const bad=structuredClone(plan);mutate(bad);assert.throws(()=>rebindRegionProgramMembers(bad,plan),TypeError);
 }
 for(const mutate of [p=>p.objects.push({...p.objects[0]}),p=>p.objects=Array(65).fill(p.objects[0]),
  p=>p.relations=Array(49).fill({id:'edge',regionId:'card'}),p=>p.widthPx++,p=>p.sourceHash='b'.repeat(64),
  p=>p.regions[1].box.x++,p=>p.regionPrograms[1].labels=[{refs:['not-a-label']}],p=>p.objects[0].regionId='unknown']){
  const bad=structuredClone(plan);mutate(bad);
  // Modified program controls are not an authorized membership transition.
  if(bad.regionPrograms[1].labels.length)assert.throws(()=>rebindRegionProgramMembers(bad,bad),TypeError);
  else assert.throws(()=>rebindRegionProgramMembers(plan,bad),TypeError);
 }
});
test('hostile getters, proxies, holes and changed native label controls cannot execute or bypass binding',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-token');},plan=fixture();
 for(const bad of [new Proxy(plan,{get:trap,ownKeys:trap}),{get regionPrograms(){return trap();}}])
  assert.throws(()=>rebindRegionProgramMembers(bad,plan),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 for(const objects of [new Array(2),new Proxy([],{get:trap,ownKeys:trap}),[{get id(){return trap();}}]])
  assert.throws(()=>rebindRegionProgramMembers(plan,{...plan,objects}),TypeError);
 assert.equal(calls,0);
});
test('program transition regressions are included in the unified unit and all suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/source-scene-program-transition.test.js')));
});
