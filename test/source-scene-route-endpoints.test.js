'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sharedRouteInventoryFixture}=require('./helpers/scene-shared-route-inventory.cjs');
const {prepareSceneRouteEndpoints,readSceneRouteEndpoints,sceneRouteEndpointSurvives}=require('../packages/slideclone-core/scene-plan/source-scene-route-endpoints');
const {initializeSceneObjectBatches,sceneHeaderObjectCapacity}=require('../packages/slideclone-core/scene-plan/source-scene-object-batches');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache');
const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/scene-plan/source-scene-observed-inventory');
const {packSceneInventoryMembers:pack,unpackSceneInventoryMembers:unpack}=require('../packages/slideclone-core/scene-plan/source-scene-inventory-codec');
const {sourceLabelIdentity}=require('../packages/slideclone-core/scene-plan/source-label-identity');
function fixture(kind='region'){
 const f=sharedRouteInventoryFixture(),body=f.shapes.find(s=>s.id==='node-source'),box={...body.box};
 const image={width:600,height:340,rgba:Buffer.alloc(600*340*4,255)},budget={used:0};
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)image.rgba.set([210,230,245,255],(y*600+x)*4);
 f.plan.objects.shift();delete f.plan.objectBatches;const nodes=new Map(),objects=new Map(),textBoxes=[];
 const endpointId=kind==='region'?'region-source':'text-'+sourceLabelIdentity(box,{widthPx:600,heightPx:340}).slice(6);
 for(const relation of f.plan.relations)relation.fromId=endpointId;
 f.graph.nodes[0].endpointId=endpointId;
 f.plan.observedInventory[0].containers=2;
 if(kind==='region'){
  f.plan.regions.push({id:endpointId,parentId:'region',kind:'container',box});
  f.plan.observedInventory.push({regionId:endpointId,containers:0,icons:0,relations:0});
  body.source={sceneRegionId:endpointId};
  const cache=createSceneMeasurementCache(image,[],budget);assert.ok(cache.fill(box));
  nodes.set(endpointId,{id:body.id,box,portFrame:cache.portFrame(box)});objects.set(endpointId,[body.id]);
 }else{
  const labelRef=sourceLabelIdentity(box,{widthPx:600,heightPx:340});
  f.plan.textEndpoints=[{id:endpointId,regionId:'region',labelRef,box}];
  textBoxes.push({id:body.id,text:'label-private-do-not-serialize',box,source:{sceneRegionId:'region',ocrLabelRef:labelRef,evidenceBox:box,ocrLabelBox:box}});
  f.shapes=f.shapes.filter(s=>s!==body);
 }
 f.plan=initializeSceneObjectBatches(f.plan);
 const stage=prepareSceneRouteEndpoints({image,plan:f.plan,nodes,objects,textBoxes,slideSize:{widthPt:600,heightPt:340}});
 const endpoints=stage.capture(f.shapes,textBoxes);
 return {...f,image,nodes,objects,textBoxes,endpoints,stage,endpointId};
}
const evidence=f=>build(f.plan,f.shapes,[],[],[f.graph],{endpoints:f.endpoints,textBoxes:f.textBoxes});

// Same measured body as both a region boundary and a direct inventory unit,
// matching the region-n9 / object-n119 conflict in fresh Worker v15.
function ownedRegionFixture(){
 const f=fixture(),body=f.shapes.find(s=>s.id==='node-source');
 body.source.sceneInventoryId='object-source';
 const outline=structuredClone(body);outline.id='node-source-outline';outline.type='rect';outline.style={fill:'none',stroke:'#234567',strokeWidthPt:1};
 f.shapes.push(outline);f.objects.set(f.endpointId,[body.id,outline.id]);
 f.plan.objects.unshift({id:'object-source',kind:'container',regionId:f.endpointId,box:{...body.box}});
 f.plan.observedInventory.find(r=>r.regionId===f.endpointId).containers=1;
 delete f.plan.objectBatches;f.plan=initializeSceneObjectBatches(f.plan);
 f.stage=prepareSceneRouteEndpoints({image:f.image,plan:f.plan,nodes:f.nodes,objects:f.objects,textBoxes:[],slideSize:{widthPt:600,heightPt:340}});
 f.endpoints=f.stage.capture(f.shapes,[]);return f;
}

test('a measured region references one complete existing container without claiming its physical members twice',()=>{
 const f=ownedRegionFixture(),slots=sceneHeaderObjectCapacity(f.plan),value=evidence(f);
 assert.equal(f.endpoints[0].ownerUnitId,'object-source');
 assert.equal(value.units.length,5);assert.equal(value.units.filter(u=>u.id==='object-source').length,1);
 assert.deepEqual(value.units.find(u=>u.id==='object-source').members.map(m=>m.id),['node-source','node-source-outline']);
 assert.equal(sceneHeaderObjectCapacity(f.plan),slots);
 assert.deepEqual(audit(value,f.shapes,[],f.plan.sourceHash),[]);
 assert.deepEqual(audit(pack(value),f.shapes,[],f.plan.sourceHash),[]);
 assert.deepEqual(unpack(JSON.parse(JSON.stringify(pack(value)))),value);
 const noReference=structuredClone(f.endpoints);delete noReference[0].ownerUnitId;
 assert.throws(()=>readSceneRouteEndpoints(noReference,value.units,f.plan.regions.map(r=>r.id)),/member is invalid/u);
 for(const member of f.endpoints[0].members){
  assert.ok(audit(value,f.shapes.filter(s=>s.id!==member.id),[],f.plan.sourceHash).some(r=>r.kind==='relations'&&r.count===2));
  for(const mutate of [s=>s.box.x++,s=>s.style={...s.style,fill:'#123456'},s=>s.source.sceneInventoryId='object-left']){
   const shapes=structuredClone(f.shapes);mutate(shapes.find(s=>s.id===member.id));
   assert.equal(sceneRouteEndpointSurvives(f.endpoints[0],shapes,[]),false);
   assert.ok(audit(value,shapes,[],f.plan.sourceHash).length>0);
  }
 }
});

test('region unit references reject foreign, partial, duplicate, missing and hostile ownership',()=>{
 const f=ownedRegionFixture(),value=evidence(f),regions=f.plan.regions.map(r=>r.id);
 for(const mutate of [e=>e.ownerUnitId='object-left',e=>e.ownerUnitId='unknown',e=>e.ownerUnitId='',
  e=>e.ownerUnitId=null,e=>e.members.pop(),e=>e.members.push({...e.members[0]}),
  e=>e.members[1].id='node-left',e=>e.kind='text',e=>e.extra=true]){
  const endpoints=structuredClone(f.endpoints);mutate(endpoints[0]);
  assert.throws(()=>readSceneRouteEndpoints(endpoints,value.units,regions),TypeError);
 }
 for(const mutate of [u=>u.kind='icon',u=>u.kind='relation',u=>u.regionId='region',u=>u.members.pop(),u=>u.members=[]]){
  const units=structuredClone(value.units);mutate(units.find(u=>u.id==='object-source'));
  assert.throws(()=>readSceneRouteEndpoints(f.endpoints,units,regions),TypeError);
 }
 let traps=0;const hostile=structuredClone(f.endpoints[0]);
 Object.defineProperty(hostile,'ownerUnitId',{enumerable:true,get(){traps++;throw Error('private');}});
 assert.throws(()=>readSceneRouteEndpoints([hostile],value.units,regions),TypeError);assert.equal(traps,0);
 assert.deepEqual(f.stage.capture([...f.shapes,{...structuredClone(f.shapes[0]),id:'unexpected-owner-member'}],[]),[]);
 const mixed=structuredClone(f.shapes);mixed.find(s=>s.id==='node-source-outline').source.sceneInventoryId='object-left';
 assert.deepEqual(f.stage.capture(mixed,[]),[]);
});
test('a measured region can be a shared endpoint without becoming another object or spending slots',()=>{
 const f=fixture(),slots=sceneHeaderObjectCapacity(f.plan),value=evidence(f);
 assert.equal(f.endpoints.length,1);assert.equal(value.endpointBindings[0].kind,'region');
 assert.equal(value.units.length,4);assert.equal(value.units.some(u=>u.id===f.endpointId),false);
 assert.equal(sceneHeaderObjectCapacity(f.plan),slots);assert.deepEqual(audit(value,f.shapes,[],f.plan.sourceHash),[]);
 assert.deepEqual(unpack(JSON.parse(JSON.stringify(pack(value)))),value);
 assert.deepEqual(audit(pack(value),f.shapes,[],f.plan.sourceHash),[]);
 assert.ok(audit(value,f.shapes.filter(s=>s.id!=='node-source'),[],f.plan.sourceHash).some(r=>r.kind==='relations'&&r.count===2));
 const moved=structuredClone(f.shapes);moved.find(s=>s.id==='node-source').box.x++;
 assert.ok(audit(value,moved,[],f.plan.sourceHash).some(r=>r.kind==='relations'&&r.count===2));
});
test('real text endpoints use actual text boxes and reach the final native-component audit',()=>{
 const f=fixture('text'),value=evidence(f);
 assert.equal(f.endpoints[0].kind,'text');assert.deepEqual(audit(value,f.shapes,[],f.plan.sourceHash,f.textBoxes),[]);
 assert.ok(audit(value,f.shapes,[],f.plan.sourceHash).some(r=>r.kind==='relations'&&r.count===2));
 const texts=structuredClone(f.textBoxes);texts[0].text+=' changed';
 assert.ok(audit(value,f.shapes,[],f.plan.sourceHash,texts).some(r=>r.kind==='relations'&&r.count===2));
 const {auditNativeComponentQuality}=require('../packages/slideclone-core/quality/native-component-quality');
 const deck={pages:[{shapes:f.shapes,images:[],textBoxes:f.textBoxes,source:{sourceScene:{version:1,sourceHash:f.plan.sourceHash,unresolved:[],observedInventory:value}}}]};
 assert.equal(auditNativeComponentQuality(deck).findings.some(r=>r.code==='source-scene-inventory-incomplete'),false);
 deck.pages[0].textBoxes=[];
 assert.equal(auditNativeComponentQuality(deck).findings.some(r=>r.code==='source-scene-inventory-incomplete'),true);
 assert.equal(JSON.stringify(value.endpointBindings).includes('label-private-do-not-serialize'),false);
 assert.equal(Object.keys(value.endpointBindings[0].members[0]).includes('text'),false);
});
test('region binding requires this source measured port and all actual native members',()=>{
 const f=fixture(),node=f.nodes.get(f.endpointId),input={image:f.image,plan:f.plan,nodes:f.nodes,objects:f.objects,textBoxes:[],slideSize:{widthPt:600,heightPt:340}};
 for(const token of [null,{},structuredClone(node.portFrame)]){
  f.nodes.set(f.endpointId,{...node,portFrame:token});assert.deepEqual(prepareSceneRouteEndpoints(input).capture(f.shapes,[]),[]);
 }
 f.nodes.set(f.endpointId,node);
 assert.deepEqual(prepareSceneRouteEndpoints({...input,image:{...f.image,rgba:Buffer.from(f.image.rgba)}}).capture(f.shapes,[]),[]);
 assert.deepEqual(f.stage.capture([...f.shapes,f.shapes[0]],[]),[]);
 assert.deepEqual(f.stage.capture(f.shapes.filter(s=>s.id!=='node-source'),[]),[]);
});
test('endpoint catalog cannot invent ownership, bypass old versions or survive wrong sources',()=>{
 const f=fixture(),value=evidence(f),regions=f.plan.regions.map(r=>r.id);
 for(const mutate of [e=>e.id='unknown',e=>e.regionId='unknown',e=>e.kind='container',e=>e.members[0].id='node-left',
  e=>e.members[0].snapshot='z'.repeat(64),e=>e.members.push({...e.members[0]})]){
  const bad=structuredClone(f.endpoints);mutate(bad[0]);assert.throws(()=>readSceneRouteEndpoints(bad,value.units,regions),TypeError);
 }
 for(const version of [1,2,3,4])assert.deepEqual(audit({...value,version},f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
 assert.deepEqual(audit(value,f.shapes,[],'b'.repeat(64)),[{reason:'evidence-invalid'}]);
 const missing=structuredClone(value);delete missing.endpointBindings;
 assert.deepEqual(audit(missing,f.shapes,[],f.plan.sourceHash),[{reason:'evidence-invalid'}]);
});
test('empty, illegal, extreme and hostile endpoint inputs fail without accessors or proxy traps',()=>{
 const f=fixture(),value=evidence(f);let traps=0;
 const hostile={};Object.defineProperty(hostile,'id',{enumerable:true,get(){traps++;throw Error('private');}});
 const proxy=new Proxy({},{get(){traps++;throw Error('private');},ownKeys(){traps++;throw Error('private');}});
 for(const bad of [null,{},[null],[hostile],[proxy],new Array(1),Array(97).fill(f.endpoints[0])])
  assert.throws(()=>readSceneRouteEndpoints(bad,value.units,['region',f.endpointId]),TypeError);
 assert.equal(traps,0);assert.deepEqual(readSceneRouteEndpoints([],[],[]),[]);
 for(const controls of [null,proxy,hostile])assert.throws(()=>build(f.plan,f.shapes,[],[],[f.graph],controls),TypeError);
 assert.equal(traps,0);
 const {includesSuite}=require('../scripts/test-suites');assert.ok(includesSuite(__filename,'unit'));
});

function freeformEndpoint(){
 const f=fixture(),body=f.shapes.find(s=>s.id==='node-source');
 body.type='freeform';body.style={fill:'#D2E6F5',stroke:'none',strokeWidthPt:0,opacity:1,
  freeformSegments:[{type:'moveTo',points:[{x:0,y:0}]},{type:'lnTo',points:[{x:1,y:0}]},
   {type:'lnTo',points:[{x:1,y:1}]},{type:'lnTo',points:[{x:0,y:1}]},{type:'close',points:[]}]};
 f.endpoints=f.stage.capture(f.shapes,f.textBoxes);return f;
}
test('lossless path compaction and explicit default opacity preserve region endpoint materialization',()=>{
 const {compactNativeFreeformPaths}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
 const f=freeformEndpoint(),value=evidence(f),before=structuredClone(f.endpoints);
 assert.deepEqual(audit(value,f.shapes,[],f.plan.sourceHash),[]);
 compactNativeFreeformPaths({pages:[{shapes:f.shapes}]});
 const body=f.shapes.find(s=>s.id==='node-source');delete body.style.opacity;
 body.style=Object.fromEntries(Object.entries(body.style).reverse());
 assert.deepEqual(audit(value,f.shapes,[],f.plan.sourceHash),[]);
 assert.deepEqual(f.endpoints,before,'the original evidence is not rewritten');
 const compactCapture=f.stage.capture(f.shapes,[]);assert.deepEqual(compactCapture,f.endpoints);
});
test('equivalent endpoint encodings retain complete rendering checks and reject changed output',()=>{
 const {compactNativeFreeformPaths}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
 for(const change of [s=>s.box.x++,s=>s.rotation=90,s=>s.style.fill='#102030',s=>s.style.opacity=.99,
  s=>s.style.freeformPath='[[0,0,0],[1,0.8,0],[1,1,1],[1,0,1],[4]]',
  s=>s.style.freeformPath='[[0,0,0],[1,0,1],[1,1,1],[1,1,0],[4]]',
  s=>s.style.freeformPath='[[0,0,0],[2,1,0,1,1,0,1],[4]]',s=>s.source.sceneRegionId='region']){
  const f=freeformEndpoint(),value=evidence(f);compactNativeFreeformPaths({pages:[{shapes:f.shapes}]});
  change(f.shapes.find(s=>s.id==='node-source'));
  assert.ok(audit(value,f.shapes,[],f.plan.sourceHash).some(r=>r.kind==='relations'&&r.count===2));
 }
});
test('endpoint geometry snapshots reject ambiguous, empty, oversized and hostile paths without reading getters',()=>{
 const {sceneRouteEndpointSurvives}=require('../packages/slideclone-core/scene-plan/source-scene-route-endpoints');
 const f=freeformEndpoint();let calls=0;
 const getter={};Object.defineProperty(getter,'x',{enumerable:true,get(){calls++;throw Error('private');}});
 const proxy=new Proxy({},{get(){calls++;throw Error('private');},ownKeys(){calls++;throw Error('private');}});
 for(const change of [s=>s.style.freeformPath='[[0,0,0],[1,1,1]]',s=>s.style.freeformSegments=[],
  s=>{delete s.style.freeformSegments;s.style.freeformPath='';},
  s=>{delete s.style.freeformSegments;s.style.freeformPath=' '.repeat(32769);},
  s=>s.style.freeformSegments=Array(121).fill({type:'close',points:[]}),
  s=>s.style.freeformSegments[1].points[0]=getter,s=>s.style.freeformSegments[1].points[0]=proxy]){
  const shapes=structuredClone(f.shapes);change(shapes.find(s=>s.id==='node-source'));
  assert.equal(sceneRouteEndpointSurvives(f.endpoints[0],shapes,[]),false);
  assert.deepEqual(f.stage.capture(shapes,[]),[]);
 }
 assert.equal(calls,0);
});
