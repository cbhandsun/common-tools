'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneIconReviewScope:scope}=require('../packages/slideclone-core/source-scene-icon-review-scope');
const {selectStructuralReviewTargets:select,applyStructuralReview:apply}=require('../packages/slideclone-core/source-scene-structural-review');
const {sourceSceneReviewCrop:crop,allocateSourceSceneReview:allocate}=require('../packages/slideclone-core/source-scene-review-allocation');
function fixture(){
 const owner={id:'region-card',parentId:null,kind:'card',box:{x:30,y:20,w:180,h:150}};
 const object={id:'object-icon',regionId:owner.id,kind:'icon',box:{x:100,y:120,w:40,h:16}};
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:240,heightPx:200,regions:[owner],objects:[object],relations:[],
  observedInventory:[{regionId:owner.id,containers:0,icons:1,relations:0}]};
 const evidence={unresolved:[{id:object.id,reason:'icon-isolation',detailCode:'icon-source-text'}]};
 return {plan,object,owner,evidence};
}
test('source text conflicts show the complete independently counted icon owner in both charged views',()=>{
 const f=fixture(),before=structuredClone(f.plan),[selected]=select(f.plan,32,f.evidence);
 assert.deepEqual(selected.contextBox,f.owner.box);
 const target={...selected,index:0,role:'structure',optional:false,textKnown:false};
 const charged=allocate({width:240,height:200,targets:[target]});assert.deepEqual(charged.structureFocusIndices,[0]);
 for(const ratio of [0,.7]){
  const b=crop({...selected,index:0,role:'structure',optional:false,textKnown:false},ratio,240,200);
  assert.ok(b.x<=f.owner.box.x&&b.y<=f.owner.box.y&&b.x+b.w>=210&&b.y+b.h>=170);
 }
 assert.deepEqual(f.plan,before);
 for(const contextBox of [{x:0,y:0,w:1,h:1},{x:0,y:0,w:241,h:200},{x:NaN,y:0,w:240,h:200}])
  assert.throws(()=>allocate({width:240,height:200,targets:[{...target,contextBox}]}),TypeError);
 assert.throws(()=>allocate({width:240,height:200,targets:[{...target,role:'probe',optional:true}]}),TypeError);
 for(const detailCode of ['icon-source-clipped-component','icon-source-fringe-boundary']){
  const [clipped]=select(f.plan,32,{unresolved:[{id:f.object.id,reason:'icon-isolation',detailCode}]});
  assert.equal(clipped.contextBox,undefined);
  assert.equal(clipped.compileProbe,false,'clipped units retain mandatory geometry review');
  const relocated={index:0,kind:'icon',confidence:.99,regionId:f.owner.id,box:{x:100,y:60,w:40,h:40}};
  assert.equal(apply(f.plan,[{...clipped,index:0}],[[relocated],[relocated]]).evidence.rejected[0].reason,'source-seed');
 }
});
test('paired relocation preserves icon identity, inventory and the later source compiler obligation',()=>{
 const f=fixture(),[selected]=select(f.plan,32,f.evidence),target={...selected,index:0};
 const row={index:0,kind:'icon',confidence:.99,regionId:f.owner.id,box:{x:100,y:60,w:40,h:40}};
 const result=apply(f.plan,[target],[[row],[row]]);
 assert.equal(result.evidence.corrected.length,1);assert.deepEqual(result.plan.objects[0].box,row.box);
 assert.equal(result.plan.objects[0].id,f.object.id);assert.deepEqual(result.plan.observedInventory,f.plan.observedInventory);
 assert.deepEqual(result.plan.relations,[]);
 for(const change of [{contextBox:undefined},{contextBox:{x:0,y:0,w:240,h:200}}])
  assert.equal(apply(f.plan,[{...target,...change}],[[row],[row]]).evidence.rejected[0].reason,'source-seed');
 assert.equal(apply(f.plan,[target],[[row],[{...row,box:{x:140,y:60,w:40,h:40}}]]).evidence.rejected[0].reason,'geometry-consensus');
 assert.equal(apply(f.plan,[target],[[row],[{...row,confidence:.89}]]).evidence.rejected[0].reason,'confidence');
});
test('unknown, empty, multiple, out-of-owner and oversized inventories cannot expand identity',()=>{
 const f=fixture();
 for(const icons of [null,0,2]){const p=structuredClone(f.plan);p.observedInventory[0].icons=icons;assert.equal(scope(p,p.objects[0]),null);}
 const absent=structuredClone(f.plan);delete absent.observedInventory;assert.equal(scope(absent,absent.objects[0]),null);
 const multiple=structuredClone(f.plan);multiple.objects.push({...f.object,id:'object-other'});assert.equal(scope(multiple,multiple.objects[0]),null);
 assert.equal(scope(f.plan,{...f.object,kind:'container'}),null);
 assert.equal(scope(f.plan,{...f.object,box:{x:0,y:0,w:4,h:4}}),null);
 const large=structuredClone(f.plan);large.regions[0].box={x:0,y:0,w:1000,h:1000};assert.equal(scope(large,large.objects[0]),null);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});
