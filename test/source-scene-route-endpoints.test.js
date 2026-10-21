'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sharedRouteInventoryFixture}=require('./helpers/scene-shared-route-inventory.cjs');
const {prepareSceneRouteEndpoints,readSceneRouteEndpoints}=require('../packages/slideclone-core/source-scene-route-endpoints');
const {initializeSceneObjectBatches,sceneHeaderObjectCapacity}=require('../packages/slideclone-core/source-scene-object-batches');
const {createSceneMeasurementCache}=require('../packages/slideclone-core/source-scene-measurement-cache');
const {buildSceneInventoryEvidence:build,auditSceneInventory:audit}=require('../packages/slideclone-core/source-scene-observed-inventory');
const {packSceneInventoryMembers:pack,unpackSceneInventoryMembers:unpack}=require('../packages/slideclone-core/source-scene-inventory-codec');
const {sourceLabelIdentity}=require('../packages/slideclone-core/source-label-identity');
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
 const {auditNativeComponentQuality}=require('../packages/slideclone-core/native-component-quality');
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
