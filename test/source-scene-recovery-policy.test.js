'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {admitSourceScenePlan}=require('../packages/slideclone-core/source-scene-plan');
const {sourceSceneRecoveryState,sourceSceneRejectedTupleShapes}=require('../packages/slideclone-core/source-scene-recovery-policy');
const source={sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,labelRefs:[]};
function proposal(){return {format:'compact-v6',coordinateSpace:'normalized-1000',boxFormat:'ymin-xmin-ymax-xmax',
 regions:[['root',null,'diagram',[0,0,1000,1000]]],inventory:[['root',2,0,1]],
 objects:[['a','root','container',[200,100,400,300],'absent'],['b','root','container',[200,700,400,900],'absent']],
 relations:[['lost','root','a','b','forward',[250,300,350],null]],
 programs:[{regionId:'root',objects:['a','b'],relations:['lost'],labels:[]}]};}

test('an unrecoverable rejected dependency yields an explicit source revision requirement without clearing obligations',()=>{
 const raw=proposal();raw.relations[0][4]='invalid';
 const plan=admitSourceScenePlan(raw,source),before=structuredClone(plan),state=sourceSceneRecoveryState(plan);
 assert.equal(state.requiresNewRevision,true);assert.equal(state.owners.length,1);
 assert.deepEqual(state.owners[0],{regionId:'region-root',mode:'source-revision-required',missingObjects:[],missingRelations:['relation-lost']});
 assert.deepEqual(plan,before);assert.equal(plan.admission.rejections.length,2);assert.equal(plan.pendingRegionPrograms.length,1);
 assert.deepEqual(sourceSceneRecoveryState(JSON.parse(JSON.stringify(plan))),state);
});

test('retained valid relation cores route through their existing two-view repair rather than whole-source regeneration',()=>{
 const raw=proposal();raw.relations[0][5]=[250,300,350,700];raw.relations[0][6]=[[300]];
 const plan=admitSourceScenePlan(raw,source),state=sourceSceneRecoveryState(plan);
 assert.equal(plan.admission.relationCandidates.length,1);assert.equal(state.requiresNewRevision,false);
 assert.equal(state.owners[0].mode,'review-retained-relations');
});

test('missing programs remain generation work, complete programs and legacy plans acquire no recovery obligations',()=>{
 const raw=proposal();raw.relations[0][5]=[250,300,350,700];raw.programs=[];
 const plan=admitSourceScenePlan(raw,source);
 assert.equal(sourceSceneRecoveryState(plan).owners[0].mode,'program-generation');
 const complete=proposal();complete.relations[0][5]=[250,300,350,700];
 assert.deepEqual(sourceSceneRecoveryState(admitSourceScenePlan(complete,source)).owners,[]);
 delete plan.regionPrograms;assert.deepEqual(sourceSceneRecoveryState(plan).owners,[]);
 assert.deepEqual(sourceSceneRecoveryState(undefined),{requiresNewRevision:false,owners:[]});
});

test('tuple diagnostics retain only numeric shape information and fixed format codes',()=>{
 const raw=proposal(),plan=admitSourceScenePlan(raw,source),diagnostics=sourceSceneRejectedTupleShapes(raw,plan);
 assert.deepEqual(diagnostics,[{index:0,format:'compact-v6',tupleLength:7,arrays:[{index:5,length:3,children:[]}]}]);
 const packed={format:'packed-v1',relations:[[0,'private-source-content',100,[0,1,2]]]};
 const encoded=JSON.stringify(sourceSceneRejectedTupleShapes(packed,plan));
 assert.equal(encoded.includes('private-source-content'),false);assert.ok(encoded.includes('packed-v1'));
 assert.deepEqual(sourceSceneRejectedTupleShapes(undefined,plan),[]);
});

test('hostile sparse empty malformed and extreme recovery inputs fail with safe errors and no accessor execution',()=>{
 const plan=admitSourceScenePlan(proposal(),source);let traps=0;const trap=()=>{traps++;throw Error('private-content');};
 for(const change of [p=>p.regions=new Array(1),p=>p.sourceHash='bad',p=>p.widthPx=Infinity,
  p=>p.pendingRegionPrograms[0].program.relations=['bad id'],p=>p.pendingRegionPrograms=new Proxy([],{}),
  p=>Object.defineProperty(p,'regions',{get:trap,enumerable:true})]){
  const bad=structuredClone(plan);change(bad);assert.throws(()=>sourceSceneRecoveryState(bad),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 for(const raw of [new Proxy({},{}),Object.defineProperty({},'relations',{get:trap,enumerable:true}),{relations:new Array(1)}])
  assert.throws(()=>sourceSceneRejectedTupleShapes(raw,plan),e=>e instanceof TypeError&&!e.message.includes('private'));
 assert.equal(traps,0);
});

test('recovery policy regression suite is discovered by unified unit CI',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').map(row=>row.file.replaceAll('\\','/'));
 assert.ok(files.includes('test/source-scene-recovery-policy.test.js'));
});
