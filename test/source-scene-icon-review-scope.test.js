'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneIconReviewScope:scope}=require('../packages/slideclone-core/scene-plan/source-scene-icon-review-scope');
const {selectStructuralReviewTargets:select,applyStructuralReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-structural-review');
const {sourceSceneReviewCrop:crop,allocateSourceSceneReview:allocate}=require('../packages/slideclone-core/scene-plan/source-scene-review-allocation');
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

test('partly misplaced unique icons receive an exact bounded search without changing source identity',()=>{
 const f=fixture();f.object.box={x:100,y:160,w:40,h:20};
 const before=structuredClone(f.plan),expected={x:30,y:20,w:180,h:160},[selected]=select(f.plan,32);
 assert.deepEqual(scope(f.plan,f.object),expected);assert.deepEqual(selected.contextBox,expected);
 assert.deepEqual(selected.ownerCandidates,[{id:f.owner.id,parentId:null}]);assert.equal(selected.compileProbe,false);
 const target={...selected,index:0,role:'structure',optional:false,textKnown:false};
 assert.deepEqual(allocate({width:240,height:200,targets:[target]}).indices,[0]);
 for(const ratio of [0,.7]){const b=crop(target,ratio,240,200);assert.ok(b.x<=30&&b.y<=20&&b.x+b.w>=210&&b.y+b.h>=180);}
 const a={index:0,kind:'icon',confidence:.97,regionId:f.owner.id,box:{x:100,y:60,w:40,h:40}},b={...a,confidence:.96,box:{x:100.2,y:60,w:40,h:40}};
 const result=apply(f.plan,[target],[[a],[b]]);
 assert.deepEqual(result.evidence.rejected,[]);assert.equal(result.evidence.corrected.length,1);
 assert.deepEqual(result.plan.objects[0],{...f.object,box:a.box});
 assert.deepEqual(result.plan.observedInventory,f.plan.observedInventory);assert.deepEqual(result.plan.relations,f.plan.relations);
 assert.equal(result.plan.sourceHash,f.plan.sourceHash);assert.deepEqual(f.plan,before);
});

test('a boundary seed requires positive overlap and cannot exceed source or unchanged search budget',()=>{
 const f=fixture();
 for(const candidate of [{x:100,y:170,w:40,h:20},{x:211,y:100,w:20,h:20},{x:10,y:20,w:20,h:20}]){
  const p=structuredClone(f.plan);p.objects[0].box=candidate;
  assert.equal(scope(p,p.objects[0]),null);assert.equal(select(p,32)[0].contextBox,undefined);
 }
 const large=structuredClone(f.plan);large.widthPx=700;large.heightPx=700;
 large.regions[0].box={x:0,y:0,w:512,h:512};large.objects[0].box={x:500,y:500,w:13,h:13};
 assert.equal(scope(large,large.objects[0]),null,'the union, not just the owner, must meet the original cap');
 large.objects[0].box={x:500,y:500,w:12,h:12};assert.deepEqual(scope(large,large.objects[0]),large.regions[0].box);
 const escaping=structuredClone(f.plan);escaping.objects[0].box={x:100,y:160,w:40,h:41};assert.equal(scope(escaping,escaping.objects[0]),null);
 escaping.objects[0].box={x:100,y:160,w:40,h:40};assert.ok(scope(escaping,escaping.objects[0]));
 for(const invalid of [{x:NaN,y:20,w:40,h:20},{x:100,y:160,w:Infinity,h:20},{x:-1,y:20,w:40,h:20},{x:100,y:160,w:0,h:20}])
  assert.equal(scope(f.plan,{...f.object,box:invalid}),null);
 let invoked=0;const accessor={get x(){invoked++;throw Error('private');},y:160,w:40,h:20};
 assert.equal(scope(f.plan,{...f.object,box:accessor}),null);
 assert.equal(scope(f.plan,{...f.object,box:new Proxy(f.object.box,{get(){invoked++;throw Error('private');}})}),null);assert.equal(invoked,0);
});

test('boundary relocation cannot use unknown census, multiple icons, a different owner or loose context',()=>{
 const f=fixture();f.object.box={x:100,y:160,w:40,h:20};const [selected]=select(f.plan,32),target={...selected,index:0};
 const row={index:0,kind:'icon',confidence:.99,regionId:f.owner.id,box:{x:100,y:60,w:40,h:40}};
 for(const icons of [null,0,2]){const p=structuredClone(f.plan);p.observedInventory[0].icons=icons;
  assert.equal(select(p,32)[0].contextBox,undefined);assert.equal(apply(p,[target],[[row],[row]]).evidence.rejected[0].reason,'source-seed');}
 const absent=structuredClone(f.plan);delete absent.observedInventory;assert.equal(select(absent,32)[0].contextBox,undefined);
 const duplicate=structuredClone(f.plan);duplicate.objects.push({...duplicate.objects[0],id:'object-second'});
 assert.equal(apply(duplicate,[target],[[row],[row]]).evidence.rejected[0].reason,'source-seed');
 const nested=structuredClone(f.plan);nested.regions.unshift({id:'region-root',parentId:null,kind:'section',box:{x:0,y:0,w:240,h:200}});
 nested.regions[1].parentId='region-root';const other={...row,regionId:'region-root'};
 assert.equal(apply(nested,[target],[[other],[other]]).evidence.rejected[0].reason,'source-seed');
 for(const contextBox of [undefined,{x:0,y:0,w:240,h:200},{x:30,y:20,w:180,h:161}])
  assert.equal(apply(f.plan,[{...target,contextBox}],[[row],[row]]).evidence.rejected[0].reason,'source-seed');
 const edge={...row,box:{x:100,y:20,w:40,h:40}},outside={...edge,box:{x:100,y:19,w:40,h:40}};
 assert.equal(apply(f.plan,[target],[[edge],[outside]]).evidence.rejected[0].reason,'source-seed');
 assert.equal(apply(f.plan,[target],[[row],[{...row,confidence:.89}]]).evidence.rejected[0].reason,'confidence');
 assert.equal(apply(f.plan,[target],[[row],[{...row,box:{x:150,y:60,w:40,h:40}}]]).evidence.rejected[0].reason,'geometry-consensus');
});

test('clipped and fringe failures cannot acquire relocation rights from a cross-boundary seed',()=>{
 const f=fixture();f.object.box={x:100,y:160,w:40,h:20};
 const row={index:0,kind:'icon',confidence:.99,regionId:f.owner.id,box:{x:100,y:60,w:40,h:40}};
 for(const detailCode of ['icon-source-clipped-component','icon-source-fringe-boundary']){
  const [selected]=select(f.plan,32,{unresolved:[{id:f.object.id,reason:'icon-isolation',detailCode}]});
  assert.equal(selected.contextBox,undefined);assert.equal(selected.compileProbe,false);
  assert.equal(apply(f.plan,[{...selected,index:0,contextBox:scope(f.plan,f.object)}],[[row],[row]]).evidence.rejected[0].reason,'source-seed');
 }
});
