'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
const {sharedRouteInventoryFixture}=require('./helpers/scene-shared-route-inventory.cjs');
function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'region',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}}],
  objects:[{id:'from',regionId:'region',kind:'container'},{id:'to',regionId:'region',kind:'container'}],
  relations:[{id:'relation',regionId:'region',fromId:'from',toId:'to',direction:'forward'}],
  observedInventory:[{regionId:'region',containers:2,icons:0,relations:1}]};
 const part=(id,owner)=>({id,type:'rect',source:{sceneInventoryId:owner}});
 const shapes=[part('from-native','from'),part('to-native','to'),...Array.from({length:4},(_,i)=>part('original-'+i,'relation'))];
 const evidence=build(plan,shapes,[]);
 return {plan,shapes,evidence,part,audit:(rows,images=[],texts=[])=>audit(evidence,rows,images,plan.sourceHash,texts)};
}
test('replacement membership reports the changed unit and counts without granting strict source equivalence',()=>{
 const f=fixture(),before=JSON.stringify(f.evidence);
 const shapes=[...f.shapes.slice(0,2),...Array.from({length:25},(_,i)=>({...f.part('replacement-'+i,'relation'),
  source:{sceneInventoryId:'relation',strictSourceEquivalent:false,approximationApprovalId:'approval'}}))];
 const findings=f.audit(shapes);
 assert.deepEqual(findings,[{reason:'evidence-invalid',detail:'unit-members-unexpected',unitId:'relation',expectedMembers:4,actualMembers:25}]);
 const deck={pages:[{shapes,images:[],source:{sourceScene:{version:1,sourceHash:f.plan.sourceHash,unresolved:[],observedInventory:f.evidence}}}],
  meta:{approvedNativeRoute:{strictBaselineUnchanged:true,strictSourceEquivalent:false}}};
 const quality=auditNativeComponentQuality(deck);
 assert.equal(quality.passed,false);
 assert.ok(quality.findings.some(row=>row.code==='source-scene-inventory-invalid'&&row.detail==='unit-members-unexpected'&&row.unitId==='relation'));
 assert.equal(JSON.stringify(f.evidence),before);
});
test('valid and deleted members keep their existing success and compile-missing behavior',()=>{
 const f=fixture();assert.deepEqual(f.audit(f.shapes),[]);
 assert.deepEqual(f.audit(f.shapes.slice(0,2)),[{regionId:'region',kind:'relations',reason:'compile-missing',count:1}]);
 assert.deepEqual(f.audit(f.shapes.slice(0,-1)),[{regionId:'region',kind:'relations',reason:'compile-missing',count:1}]);
 assert.deepEqual(audit(undefined,[],[],f.plan.sourceHash),[]);
});
test('unexpected ownership is separated from invalid member collections',()=>{
 const f=fixture();
 assert.deepEqual(f.audit([...f.shapes,f.part('foreign-part','foreign')]),[{reason:'evidence-invalid',detail:'output-owner-unexpected'}]);
 for(const shapes of [[...f.shapes,f.shapes[0]],new Array(1),Array(10001).fill(f.shapes[0])])
  assert.deepEqual(f.audit(shapes),[{reason:'evidence-invalid',detail:'output-members-invalid'}]);
});
test('shape and image types remain distinct even with the same member ID',()=>{
 const f=fixture(),removed=f.shapes.at(-1);
 assert.deepEqual(f.audit(f.shapes.slice(0,-1),[removed]),[{reason:'evidence-invalid',detail:'unit-members-unexpected',
  unitId:'relation',expectedMembers:4,actualMembers:4}]);
});
test('unsafe output is rejected without executing hooks or copying user content into diagnostics',()=>{
 const f=fixture();let calls=0;
 const getter={id:'private-user-content'};Object.defineProperty(getter,'source',{get(){calls++;throw Error('private-secret');}});
 const proxy=new Proxy({},{get(){calls++;throw Error('private-secret');},ownKeys(){calls++;throw Error('private-secret');}});
 for(const shapes of [[getter],[proxy],new Proxy([],{get(){calls++;throw Error('private-secret');}})]){
  const findings=f.audit(shapes);
  assert.deepEqual(findings,[{reason:'evidence-invalid',detail:'output-members-invalid'}]);
  assert.doesNotMatch(JSON.stringify(findings),/private-/u);
 }
 assert.equal(calls,0);
 assert.deepEqual(audit({...f.evidence,sourceHash:'b'.repeat(64)},f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
});
test('shared graph additions remain invalid and identify the physical graph',()=>{
 const f=sharedRouteInventoryFixture(),evidence=build(f.plan,f.shapes,[],[],[f.graph]);
 const extra={...f.shapes.find(s=>s.source.sceneInventoryId===f.graph.id),id:'unlisted-part'};
 assert.deepEqual(audit(evidence,[...f.shapes,extra],[],f.plan.sourceHash),[{reason:'evidence-invalid',detail:'graph-members-unexpected',
  unitId:f.graph.id,expectedMembers:8,actualMembers:9}]);
});
test('invalid shared output controls keep the gate closed with a fixed diagnostic',()=>{
 const f=fixture();
 assert.deepEqual(f.audit(f.shapes,[],new Array(1)),[{reason:'evidence-invalid',detail:'route-output-invalid'}]);
});
