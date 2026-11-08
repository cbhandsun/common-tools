"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {sceneInventoryCapacity:capacity}=require('../packages/slideclone-core/scene-plan/source-scene-capacity');
function plan(counts){return {regions:counts.map((_,i)=>({id:'region-'+i})),
 observedInventory:counts.map((relations,i)=>({regionId:'region-'+i,containers:0,icons:0,relations}))};}
const objectEvidence={objectLimit:64,interiorTargetLimit:32,knownContainerMinimum:0,knownIconMinimum:0,
 knownProposalObjectMinimum:0,unknownContainerRegions:0,unknownIconRegions:0};

test('known container requirements cannot exceed the shared object and recovered-header allowance',()=>{
 const input=plan([12,12]);input.observedInventory[0].containers=33;input.observedInventory[1].containers=32;
 const before=structuredClone(input),result=capacity(input);
 assert.equal(result.feasible,false);
 assert.equal(result.objectLimit,64);assert.equal(result.knownContainerMinimum,65);
 assert.equal(result.knownProposalObjectMinimum,65);assert.deepEqual(input,before);
 input.observedInventory[1].containers=31;assert.equal(capacity(input).feasible,true);
 input.observedInventory[0].containers=null;
 assert.equal(capacity(input).unknownContainerRegions,1);assert.equal(capacity(input).knownContainerMinimum,31);
});

test('explicit icons and implicit interiors obey the unchanged shared 32-target recovery contract',()=>{
 const input=plan([0]),row=input.observedInventory[0];row.containers=64;row.icons=32;
 assert.equal(capacity(input).feasible,true,'64 source objects plus 32 internal recoveries remain potentially expressible');
 row.icons=33;assert.equal(capacity(input).feasible,false,'more than 32 icons need explicit proposals, not an implicit 33rd recovery');
 row.containers=31;assert.equal(capacity(input).feasible,true);assert.equal(capacity(input).knownProposalObjectMinimum,64);
 row.containers=32;assert.equal(capacity(input).feasible,false);
 row.icons=null;assert.equal(capacity(input).unknownIconRegions,1);assert.equal(capacity(input).knownIconMinimum,0);
 row.containers=65;assert.equal(capacity(input).feasible,false,'unknown icons cannot conceal a known container conflict');
});

test('all reported object conflicts are impossible under the actual native recovery admission',()=>{
 const {admitSceneRecoveries,recoveryId}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-materialization');
 for(const [containers,icons]of [[65,0],[64,33],[32,33],[68,42],[0,65]]){
  const census=plan([0]);Object.assign(census.observedInventory[0],{containers,icons});assert.equal(capacity(census).feasible,false);
  for(let proposedIcons=0;proposedIcons<=Math.min(64,icons);proposedIcons++){
   const objects=[...Array.from({length:containers},(_,i)=>({id:'container-'+i,regionId:'region-0',kind:'container'})),
    ...Array.from({length:proposedIcons},(_,i)=>({id:'icon-'+i,regionId:'region-0',kind:'icon'}))];
   if(objects.length>64)continue;
   const recoveries=Array.from({length:icons-proposedIcons},(_,i)=>{const key='interior-'+i;
    return {id:recoveryId('interior',key),key,origin:'interior',kind:'icon',regionId:'region-0',parentObjectId:'container-0',members:[{type:'shape',id:'part-'+i}]};});
   assert.throws(()=>admitSceneRecoveries(recoveries,{regions:census.regions,objects}));
  }
 }
 const extreme=plan(Array(24).fill(0));for(const row of extreme.observedInventory){row.containers=10000;row.icons=10000;}
 assert.equal(capacity(extreme).knownContainerMinimum,240000);assert.equal(capacity(extreme).knownIconMinimum,240000);
 assert.equal(capacity(extreme).knownProposalObjectMinimum,480000);assert.equal(capacity(extreme).feasible,false);
 for(const field of ['containers','icons'])for(const value of [-1,0.5,NaN,Infinity,'1',10001]){
  const invalid=plan([0]);invalid.observedInventory[0][field]=value;assert.throws(()=>capacity(invalid),TypeError);
 }
});

test('the structural prompt distinguishes complete pictorial units and audited nested physical regions within approved batches',()=>{
 const {SCENE_PLAN_PROMPT}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
 assert.match(SCENE_PLAN_PROMPT,/physically enclosed labeled subpanels/u);
 assert.match(SCENE_PLAN_PROMPT,/colored patches, holes, strokes or path primitives/u);
 assert.match(SCENE_PLAN_PROMPT,/never reduce counts to fit/u);
 assert.match(SCENE_PLAN_PROMPT,/64 object proposals in THIS global batch/u);
 assert.match(SCENE_PLAN_PROMPT,/at most 32 object proposals and 24 relation proposals/u);
 assert.match(SCENE_PLAN_PROMPT,/bounded by 96 explicit objects and 48 relations/u);
});

test('planner persists an impossible object census and rejects before source scans or either local call',async t=>{
 const {writePng}=require('../packages/slideclone-core/png');
 const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-object-capacity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 let calls=0,scans=0;
 const review=createSourceScenePlanner({recognize:async()=>{calls++;return {
  scene:{format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
   regions:[['root',null,'section',[0,0,1000,1000]]],objects:[],relations:[],inventory:[['root',68,42,34]]},reviews:[],missingText:[]};}});
 await assert.rejects(review({root,sourceFile,dimensions:{widthPx:100,heightPx:100},ocr:{lines:[]},
  isCancellationRequested:async()=>false,preflightSourceScene:()=>{scans++;throw Error('must not scan');}}),error=>error.code==='SCENE_INVENTORY_CAPACITY_CONFLICT');
 assert.equal(calls,1);assert.equal(scans,0);
 const directory=fs.readdirSync(root).find(name=>name.startsWith('scene-review-'));
 const saved=JSON.parse(fs.readFileSync(path.join(root,directory,'plan.json'))),report=JSON.parse(fs.readFileSync(path.join(root,directory,'capacity.json')));
 assert.deepEqual(saved.observedInventory[0],{regionId:'region-root',containers:68,icons:42,relations:34});
 assert.equal(report.feasible,false);assert.equal(report.knownProposalObjectMinimum,110);
 assert.equal(report.wholePageRelationCapacity,48,'relation capacity alone cannot make this plan feasible');
});
test('observed relations share two bounded proposal stages across all regions without duplicating the paired local allowance',()=>{
 assert.deepEqual(capacity(plan([])),{assessed:true,feasible:true,relationLimit:24,maxRelationBatches:2,wholePageRelationCapacity:48,knownRelationMinimum:0,unknownRelationRegions:0,...objectEvidence});
 assert.equal(capacity(plan([8,8,8])).feasible,true);
 assert.deepEqual(capacity(plan([4,3,4,6,2,5,4,3,2])),{assessed:true,feasible:true,relationLimit:24,maxRelationBatches:2,wholePageRelationCapacity:48,knownRelationMinimum:33,unknownRelationRegions:0,...objectEvidence});
 assert.equal(capacity(plan([24,24])).feasible,true);assert.equal(capacity(plan([24,25])).feasible,false);
 assert.equal(capacity(plan([null,49])).feasible,false);
 assert.equal(capacity(plan([null,24])).unknownRelationRegions,1);
 assert.equal(capacity(plan(Array(24).fill(10000))).knownRelationMinimum,240000);
});
test('legacy absence and unknown counts do not become complete observations',()=>{
 assert.deepEqual(capacity({regions:[{id:'region'}]}),{assessed:false,feasible:true,relationLimit:24,maxRelationBatches:2,wholePageRelationCapacity:48,knownRelationMinimum:0,unknownRelationRegions:1,
  ...objectEvidence,unknownContainerRegions:1,unknownIconRegions:1});
 const input=plan([null,null]),before=structuredClone(input),result=capacity(input);
 assert.equal(result.feasible,true);assert.equal(result.unknownRelationRegions,2);assert.deepEqual(input,before);
});
test('invalid, duplicate, foreign, sparse and oversized observations fail closed',()=>{
 for(const input of [null,{},plan(Array(25).fill(0)),plan([-1]),plan([.5]),plan([Infinity]),plan(['2']),plan([10001]),
  {...plan([0]),observedInventory:[]},{...plan([0]),observedInventory:new Array(1)},
  {...plan([0]),observedInventory:[{regionId:'other',containers:0,icons:0,relations:0}]},
  {regions:[{id:'region'},{id:'region'}]},
  {...plan([0,0]),observedInventory:[plan([0]).observedInventory[0],plan([0]).observedInventory[0]]}])
  assert.throws(()=>capacity(input),TypeError);
});
test('getters, proxies and coercion cannot execute or leak private data',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-token');},coercion={valueOf:trap};
 const getter={get regions(){return trap();}},proxy=new Proxy(plan([0]),{get:trap,ownKeys:trap}),row={get regionId(){return trap();}};
 const values=[getter,proxy,{regions:new Proxy([],{get:trap,ownKeys:trap})},
  {...plan([0]),observedInventory:[row]},plan([coercion]),{...plan([0]),observedInventory:new Proxy([],{get:trap,ownKeys:trap})}];
 for(const value of values)assert.throws(()=>capacity(value),error=>error instanceof TypeError&&!error.message.includes('private-token'));
 assert.equal(calls,0);
});
test('planner preserves the admitted plan and fails before scans, local calls and rendering on impossible inventory',async t=>{
 const {writePng}=require('../packages/slideclone-core/png');
 const {createSourceScenePlanner}=require('../packages/slideclone-core/scene-plan/source-scene-planner');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-capacity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 let calls=0,scans=0;
 const review=createSourceScenePlanner({recognize:async()=>{calls++;return {
  scene:{format:'compact-v5',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
   regions:[[0,null,'section',[0,0,1000,1000]]],objects:[],relations:[],inventory:[[0,0,0,49]]},reviews:[],missingText:[]};}});
 await assert.rejects(review({root,sourceFile,dimensions:{widthPx:100,heightPx:100},ocr:{lines:[]},
  isCancellationRequested:async()=>false,preflightSourceScene:()=>{scans++;throw Error('must not scan');}}),error=>error.code==='SCENE_INVENTORY_CAPACITY_CONFLICT');
 assert.equal(calls,1);assert.equal(scans,0);
 const directories=fs.readdirSync(root).filter(name=>name.startsWith('scene-review-'));assert.equal(directories.length,1);
 const saved=JSON.parse(fs.readFileSync(path.join(root,directories[0],'plan.json'))),report=JSON.parse(fs.readFileSync(path.join(root,directories[0],'capacity.json')));
 assert.equal(saved.observedInventory[0].relations,49);assert.equal(report.feasible,false);assert.equal(report.relationLimit,24);assert.equal(report.wholePageRelationCapacity,48);
});
test('the regression runs in the unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/source-scene-capacity.test.js')));
});

test('capacity error identity is private, immutable and does not trust forged codes or hostile inputs',()=>{
 const {sceneInventoryCapacityError,isSceneInventoryCapacityError}=require('../packages/slideclone-core/scene-plan/source-scene-capacity');
 const error=sceneInventoryCapacityError();assert.equal(isSceneInventoryCapacityError(error),true);
 assert.throws(()=>{error.code='SCENE_PROVIDER_TIMEOUT';},TypeError);
 let calls=0;const forged=new Proxy({code:'SCENE_INVENTORY_CAPACITY_CONFLICT'},{get(){calls++;throw Error('private');}});
 for(const value of [null,undefined,'SCENE_INVENTORY_CAPACITY_CONFLICT',{code:'SCENE_INVENTORY_CAPACITY_CONFLICT'},new RangeError(),forged])
  assert.equal(isSceneInventoryCapacityError(value),false);
 assert.equal(calls,0);
 const symbol=plan([0]);symbol.observedInventory[0][Symbol('extra')]='private';assert.throws(()=>capacity(symbol),TypeError);
});
