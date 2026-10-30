'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {admitSourceScenePlan:admit}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {selectTopologyReviewTargets:select,applyTopologyReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-topology-review');
const {sceneAdmissionHistory:history,recordSceneAdmissionRepairs:recordRepairs}=require('../packages/slideclone-core/scene-plan/source-scene-admission-history');
const {sceneRelationSlotsUsed:slots,sceneLocalRelationCapacity:capacity}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
const {buildSceneInventoryEvidence:inventory,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {packSceneInventoryMembers:pack,unpackSceneInventoryMembers:unpack}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
const {writeSceneInventoryArtifact:artifact}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-artifact');
const source={sourceHash:'a'.repeat(64),widthPx:200,heightPx:100};
function fixture(count=2,alias=false){
 const plan=admit({coordinateSpace:'source-pixels',regions:[
  {id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:200,h:100}},
  {id:'left',parentId:'root',kind:'diagram',box:{x:0,y:0,w:90,h:100}},
  {id:'right',parentId:'root',kind:'diagram',box:{x:110,y:0,w:90,h:100}}],
  objects:[{id:'a',regionId:'left',kind:'container',box:{x:10,y:20,w:60,h:60}},
   {id:'b',regionId:'right',kind:'container',box:{x:120,y:20,w:60,h:60}},
   ...(alias?[{id:'alias',regionId:'left',kind:'container',box:{x:10,y:20,w:60,h:60}}]:[])],
  inventory:[['root',0,0,count],['left',1,0,0],['right',1,0,0]],
  relations:Array.from({length:count},(_,i)=>({id:'edge'+i,regionId:'left',fromId:alias?'alias':'a',toId:'b',direction:'forward',shaftBox:{x:72,y:32+i*20,w:46,h:6}}))},source);
 const targets=select(plan,32).map((row,index)=>({...row,index:20+index}));
 const observations=targets.map(row=>({index:row.index,fromId:alias?'object-alias':'object-a',toId:'object-b',direction:'forward',confidence:.99}));
 const repaired=apply(plan,targets,[observations,structuredClone(observations)]).plan;
 const shapes=[...repaired.objects,...repaired.relations].map((row,index)=>({id:'native-'+index,source:{sceneInventoryId:row.id}}));
 return {plan,repaired,targets,observations,shapes};
}

test('original failure snapshot survives real two-view repairs while active errors and local/global charging remain separate',()=>{
 const {plan,repaired}=fixture(),before=structuredClone(plan),saved=history(repaired);
 assert.deepEqual(saved.rejections,plan.admission.rejections);assert.equal(saved.relations.length,2);
 assert.equal(repaired.admission.complete,true);assert.deepEqual(repaired.admission.rejections,[]);
 assert.equal(slots(repaired),slots(plan));assert.equal(capacity(repaired),capacity(plan)-2);
 assert.deepEqual(history(JSON.parse(JSON.stringify(repaired))),saved);assert.deepEqual(plan,before);
 assert.notEqual(saved.rejections,plan.admission.rejections);assert.notEqual(saved.rejections[0],plan.admission.rejections[0]);
});

test('unselected/disagreeing repairs keep their failures and later repair appends without replacing earlier history',()=>{
 const {plan,targets,observations}=fixture(),first=apply(plan,targets.slice(0,1),[observations.slice(0,1),observations.slice(0,1)]).plan;
 assert.equal(history(first).relations.length,1);assert.equal(first.admission.rejections.length,1);
 const second=apply(first,targets.slice(1),[observations.slice(1),observations.slice(1)]).plan;
 assert.equal(history(second).relations.length,2);assert.deepEqual(history(second).rejections,plan.admission.rejections);
 assert.deepEqual(history(first).relations,history(second).relations.slice(0,1));assert.equal(capacity(second),22);
 assert.deepEqual(apply(plan,[],[[],[]]).plan,plan);assert.equal(plan.admission.history,undefined);
 const disagree=observations.map(row=>({...row,direction:'backward'}));
 assert.equal(apply(plan,targets,[observations,disagree]).plan.admission.history,undefined);
});

test('final inventory, lossless transport and content-addressed artifact preserve repairs and recheck actual output members',t=>{
 const {repaired,shapes}=fixture(),evidence=inventory(repaired,shapes,[]),packed=pack(evidence);
 assert.deepEqual(evidence.admissionHistory,history(repaired));assert.deepEqual(audit(evidence,shapes,[],source.sourceHash),[]);
 assert.deepEqual(unpack(packed),evidence);assert.deepEqual(audit(packed,shapes,[],source.sourceHash),[]);
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-history-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const receipt=artifact(root,evidence),loaded=JSON.parse(fs.readFileSync(path.join(root,receipt.assetPath)));
 assert.deepEqual(audit(loaded,shapes,[],source.sourceHash),[]);assert.deepEqual(loaded.admissionHistory,evidence.admissionHistory);
 assert(audit(loaded,shapes.slice(0,-1),[],source.sourceHash).some(row=>row.reason==='compile-missing'));
 const duplicate=[...shapes,structuredClone(shapes.at(-1))];assert.deepEqual(audit(loaded,duplicate,[],source.sourceHash),[{reason:'evidence-invalid',detail:'output-members-invalid'}]);
});

test('history cannot hide other rejected attempts or reserved relations in final inventory',()=>{
 const {plan,targets,observations,shapes}=fixture(),partial=apply(plan,targets.slice(0,1),[observations.slice(0,1),observations.slice(0,1)]).plan;
 const present=shapes.filter(row=>row.source.sceneInventoryId!=='relation-edge1');
 const evidence=inventory(partial,present,[]),findings=audit(evidence,present,[],source.sourceHash);
 assert(findings.some(row=>row.reason==='relation-reserved-missing'));assert(findings.some(row=>row.reason==='proposal-missing'));
 const forged=structuredClone(evidence);forged.relationBatches[0].reserved=[];
 assert.deepEqual(audit(forged,present,[],source.sourceHash),[{reason:'evidence-invalid'}]);
 const added=structuredClone(fixture(1).repaired);added.admission.rejections.push({collection:'missingText',index:0,reason:'glyph-source-unit'});
 assert.equal(history(added).relations.length,1,'later active failures remain allowed and blocking');
});

test('cross-source, stale, wrong-owner, changed anchors, repeated indices and removed active failures cannot reuse a repair history',()=>{
 const {repaired}=fixture();
 for(const mutate of [p=>p.admission.history.sourceHash='b'.repeat(64),p=>p.admission.history.widthPx++,
  p=>p.admission.history.relations[0].index=23,p=>p.admission.history.relations[0].relationId='relation-other',
  p=>p.admission.history.relations[0].regionId='region-left',p=>p.admission.history.relations[0].shaftBox.x++,
  p=>p.admission.history.relations[0].direction='unknown',p=>p.admission.history.relations.push(p.admission.history.relations[0]),
  p=>p.admission.history.rejections[0].detailCode='tuple',p=>p.relations[0].toId='object-other',
  p=>p.admission.rejections.push({...p.admission.history.rejections[0]}),
  p=>p.admission.history.rejections.push({collection:'object',index:3,reason:'object-contract'})]){
  const bad=structuredClone(repaired);mutate(bad);assert.throws(()=>history(bad),e=>e instanceof TypeError&&/^Scene admission history /u.test(e.message));
  assert.throws(()=>slots(bad),e=>e instanceof TypeError&&/^Scene admission history /u.test(e.message));
 }
});

test('malformed artifact mappings fail closed and cannot refund rejected global attempts',()=>{
 const {repaired,shapes}=fixture(),good=inventory(repaired,shapes,[]);
 for(const mutate of [e=>e.admissionHistory.sourceHash='b'.repeat(64),e=>e.admissionHistory.widthPx++,e=>e.admissionHistory.relations[0].relationId='relation-absent',
  e=>e.admissionHistory.relations[0].regionId='region-left',e=>e.admissionHistory.relations=[],
  e=>e.admissionHistory.rejections=[],e=>e.admissionHistory.relations.push(e.admissionHistory.relations[0]),
  e=>e.relationBatches[0].rejected=1]){
  const bad=structuredClone(good);mutate(bad);assert.deepEqual(audit(bad,shapes,[],source.sourceHash),[{reason:'evidence-invalid'}]);
 }
});

test('later source-proven physical compaction keeps the immutable repair snapshot and resolves only existing charged aliases',()=>{
 const {compactPhysicalSceneInventory:compact}=require('../packages/slideclone-core/scene-plan/source-scene-physical-inventory');
 const {repaired}=fixture(1,true),before=structuredClone(repaired.admission.history);
 const result=compact(repaired,[{id:'object-alias',canonicalId:'object-a'}]).plan;
 assert.equal(result.relations[0].fromId,'object-a');assert.deepEqual(history(result),before);
 assert.equal(history(result).relations[0].fromId,'object-alias');assert.equal(slots(result),slots(repaired));
 const shapes=[...result.objects,...result.relations].map((row,index)=>({id:'native-'+index,source:{sceneInventoryId:row.id}}));
 assert.deepEqual(audit(inventory(result,shapes,[]),shapes,[],source.sourceHash),[]);
 const forged=structuredClone(result);forged.objectBatches.aliases=[];
 assert.throws(()=>history(forged),/Scene object batch owner/);
});

test('empty legacy, invalid limits, proxies and accessors do not execute caller-controlled code',()=>{
 const {repaired,plan}=fixture();let traps=0;const trap=()=>{traps++;throw Error('private-content');};
 assert.equal(history({...plan,admission:undefined}),undefined);assert.equal(history(plan),undefined);
 assert.deepEqual(recordRepairs(plan,plan,[]),plan);
 for(const mutate of [p=>p.admission.history.relations=Array(25).fill(p.admission.history.relations[0]),
  p=>p.admission.history.rejections=new Array(257),p=>p.admission.history.widthPx=Infinity,
  p=>{p.sourceHash={toString:trap};p.admission.history.sourceHash=p.sourceHash;},
  p=>p.admission.history=new Proxy(p.admission.history,{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.admission.history.relations=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap}),
  p=>p.admission.history.relations[0].direction={toString:trap},
  p=>p.admission.history.relations[0].shaftBox=Object.defineProperty({},'x',{get:trap}),
  p=>p.admission.history.rejections[0]=Object.defineProperty({},'collection',{get:trap})]){
  const bad=structuredClone(repaired);mutate(bad);assert.throws(()=>history(bad),e=>e instanceof TypeError&&!e.message.includes('private-content'));
 }
 assert.equal(traps,0);assert.throws(()=>recordRepairs(plan,plan,[0,0]),/history/);
 assert.throws(()=>recordRepairs(repaired,{...repaired,admission:{...repaired.admission,history:undefined}},[]),/history transition/);
 assert.throws(()=>recordRepairs(plan,{...plan,admission:{...plan.admission,history:structuredClone(repaired.admission.history)}},[]),/history transition/);
 const hostile=structuredClone(plan);hostile.admission.relationCandidates=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap});
 assert.throws(()=>recordRepairs(hostile,hostile,[0]),e=>e instanceof TypeError&&!e.message.includes('private-content'));assert.equal(traps,0);
});

test('admission history regressions are discovered by unified unit and all suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(row=>path.normalize(row.file)===path.normalize('test/source-scene-admission-history.test.js')));
});
