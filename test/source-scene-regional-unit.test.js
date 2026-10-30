'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readRegionalInventoryObservations:read,applyRegionalInventoryReview:apply}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {initializeSceneObjectBatches,sceneLocalObjectCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
const {sceneLocalRelationCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-relation-batches');
function fixture(){
 const box={x:10,y:10,w:80,h:80},target={index:5,regionId:'card',box};
 const plan=initializeSceneObjectBatches({version:1,sourceHash:'a'.repeat(64),widthPx:100,heightPx:100,
  regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:100,h:100}},{id:'card',parentId:'root',kind:'card',box}],objects:[],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'card',containers:3,icons:0,relations:2}]});
 const frame={width:100,height:100,sourceTargets:[{index:5,cropBox:{x:0,y:0,w:100,h:100},candidateBox:box}],sheetTargets:[{index:5,cropBox:{x:0,y:0,w:100,h:100},candidateBox:box}]};
 const units=[[200,200,400,400],[200,600,400,800],[700,200,500,400]].map(box_2d=>({kind:'container',confidence:.99,box_2d}));
 const response={regionInventories:[{index:5,units,relations:[{from:0,to:1,direction:'forward'},{from:0,to:2,direction:'forward'}]}]};
 return {plan,target,frame,response,capacity:{objects:3,relations:2}};
}
test('one inverted regional box rejects and charges that proposal while independent nodes and relation survive',()=>{
 const f=fixture(),before=structuredClone(f.plan),rows=read(f.response,[f.target],f.frame,f.capacity);
 assert.equal(rows[0].units.length,3);assert.equal(rows[0].units[2].box,null);assert.equal(rows[0].units[2].rejection,'unit-coordinates');
 const out=apply(f.plan,[f.target],[rows,rows]);
 assert.equal(out.plan.objects.length,2);assert.equal(out.plan.relations.length,1);
 assert.equal(sceneLocalObjectCapacity(out.plan),29);assert.equal(sceneLocalRelationCapacity(out.plan),22);
 assert.deepEqual(out.evidence.rejected,[{index:5,unit:2,reason:'source-observation'}]);
 assert.deepEqual(out.evidence.rejectedRelations,[{index:5,relation:1,reason:'endpoint-observation'}]);
 assert.deepEqual(out.plan.observedInventory,f.plan.observedInventory);assert.deepEqual(f.plan,before);
});
test('malformed ordinary coordinates remain positional failed proposals and are never guessed or reordered',()=>{
 const f=fixture();
 for(const box of [[700,200,500,400],[200,800,400,600],[200,200,200,400],[0,0,1001,400],[-1,0,200,300],[.5,0,200,300],[NaN,0,200,300]]){
  const r=structuredClone(f.response);r.regionInventories[0].units[2].box_2d=box;
  const rows=read(r,[f.target],f.frame,f.capacity);
  assert.equal(rows[0].units[2].box,null);assert.equal(rows[0].units[2].rejection,'unit-coordinates');
  assert.deepEqual(rows[0].units[0].box,{x:20,y:20,w:20,h:20});
 }
});
test('empty responses and null observations preserve failed census and cannot exceed the batch allowance',()=>{
 const f=fixture(),r={regionInventories:[{index:5,units:[],relations:[]}]};
 const rows=read(r,[f.target],f.frame,{objects:0,relations:0}),out=apply(f.plan,[f.target],[rows,rows]);
 assert.equal(out.plan.objects.length,0);assert.deepEqual(out.plan.observedInventory,f.plan.observedInventory);
 assert.throws(()=>read(f.response,[f.target],f.frame,{objects:2,relations:2}),TypeError);
 const nullBox=structuredClone(f.response);nullBox.regionInventories[0].units[2].box_2d=null;
 assert.equal(read(nullBox,[f.target],f.frame,f.capacity)[0].units[2].rejection,'region-window');
});
test('unsafe payloads, invalid control fields and broken source mappings still fail closed without getters',()=>{
 const f=fixture();let touched=false;
 const hostile=Object.defineProperty([],'0',{get(){touched=true;throw Error('private');}});
 const proxy=new Proxy([0,0,10,10],{get(){touched=true;throw Error('private');}});
 for(const box of [hostile,proxy,[0,0,100,100,100],new Array(4),'[0,0,1,1]']){
  const r=structuredClone(f.response);r.regionInventories[0].units[2].box_2d=box;
  assert.throws(()=>read(r,[f.target],f.frame,f.capacity),TypeError);
 }
 assert.equal(touched,false);
 for(const confidence of [-1,2,NaN,'0.99']){
  const r=structuredClone(f.response);r.regionInventories[0].units[2].confidence=confidence;
  assert.throws(()=>read(r,[f.target],f.frame,f.capacity),TypeError);
 }
 for(const frame of [undefined,{...f.frame,sourceTargets:[]},{...f.frame,sheetTargets:[]}])
  assert.throws(()=>read(f.response,[f.target],frame,f.capacity),TypeError);
});
test('regional unit regression and runtime helper use unified CI and package verification',()=>{
 const suites=require('../scripts/test-suites'),runtime=require('../scripts/verify-runtime-package');
 assert.equal(suites.includesSuite(__filename,'unit'),true);assert.equal(suites.includesSuite(__filename,'all'),true);
 assert.ok(runtime.REQUIRED_FILES.includes('packages/slideclone-core/scene-plan/source-scene-regional-unit.js'));
});
