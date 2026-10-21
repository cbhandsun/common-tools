"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSceneCompileFeedback:feedback}=require('../packages/slideclone-core/source-scene-compile-feedback');
const {selectRegionalInventoryTargets:select,readRegionalInventoryObservations:read,regionalInventoryPrompt:prompt}=require('../packages/slideclone-core/source-scene-regional-inventory');
const {parseLocalTargets,localResponseFormat,decodeLocalResponse}=require('../packages/slideclone-core/source-scene-local-response');
const {applySceneRegionBoundaryReview:apply}=require('../packages/slideclone-core/source-scene-region-boundary-review');

function fixture(){
 const plan={version:1,sourceHash:'a'.repeat(64),widthPx:200,heightPx:200,
  regions:[{id:'root',kind:'section',parentId:null,box:{x:0,y:0,w:200,h:200}},
   {id:'panel',kind:'container',parentId:'root',box:{x:20,y:20,w:160,h:160}},
   {id:'child',kind:'card',parentId:'panel',box:{x:30,y:40,w:50,h:40}}],
  objects:[{id:'node',regionId:'panel',kind:'container',box:{x:100,y:40,w:50,h:40}}],relations:[],
  observedInventory:[{regionId:'root',containers:0,icons:0,relations:0},{regionId:'panel',containers:1,icons:0,relations:0},{regionId:'child',containers:0,icons:0,relations:0}]};
 const failures={unresolved:[{id:'panel',reason:'container-perimeter',detailCode:'outline-no-closed-component'}]};
 const target={index:4,regionId:'panel',box:{...plan.regions[1].box},boundaryReview:true};
 const frame={width:200,height:200,sourceTargets:[{index:4,cropBox:{x:0,y:0,w:200,h:200}}],sheetTargets:[{index:4,cropBox:{x:0,y:0,w:200,h:200}}]};
 const response={regionInventories:[{index:4,units:[],relations:[],boundary:{confidence:.99,box_2d:[100,100,500,900]}}]};
 return {plan,failures,target,frame,response,capacity:{objects:0,relations:0}};
}

test('boundary review crops retain a declared member outside the proposed owner envelope without changing ownership or census',()=>{
 const {sourceSceneReviewCrop,allocateSourceSceneReview}=require('../packages/slideclone-core/source-scene-review-allocation');
 const f=fixture();f.plan.regions[2].box={x:170,y:185,w:20,h:10};
 const before=structuredClone(f.plan),target=select(f.plan,32,0,undefined,f.failures).find(row=>row.regionId==='panel');
 assert.deepEqual(target.contextBox,{x:20,y:20,w:170,h:175});
 const descriptor={...target,index:4,role:'region-inventory',optional:true,textKnown:false};
 const allocation=allocateSourceSceneReview({width:200,height:200,targets:[descriptor]});
 assert.deepEqual(allocation.indices,[4]);
 const crop=sourceSceneReviewCrop(descriptor,0,200,200);
 const frame={width:crop.w,height:crop.h,sourceTargets:[{index:4,cropBox:crop}],sheetTargets:[{index:4,cropBox:{x:0,y:0,w:crop.w,h:crop.h}}]};
 assert.doesNotThrow(()=>prompt([{...target,index:4}],f.capacity,frame));
 assert.deepEqual(f.plan,before);
});

test('a boundary member cannot be projected into an unrelated atlas tile outside its own source crop',()=>{
 const f=fixture();f.target.boundaryMembers=[{id:'remote-child',box:{x:170,y:185,w:20,h:10}}];
 const frame={width:500,height:500,sourceTargets:[{index:4,cropBox:{x:20,y:20,w:160,h:160}}],sheetTargets:[{index:4,cropBox:{x:0,y:0,w:160,h:160}}]};
 assert.throws(()=>prompt([f.target],f.capacity,frame),/endpoint crop/);
});

test('regional context validates empty malformed hostile and extreme references before inspecting their geometry',()=>{
 const {sceneRegionalReviewContext:context}=require('../packages/slideclone-core/source-scene-region-boundary-review');
 const f=fixture();assert.deepEqual(context(f.target),f.target.box);let traps=0;const trap=()=>{traps++;throw Error('private-content');};
 for(const change of [t=>t.boundaryMembers=new Array(1),t=>t.boundaryMembers=new Proxy([],{}),
  t=>t.boundaryMembers=[{box:{x:1,y:1,w:Infinity,h:1}}],t=>t.box.x=16384,
  t=>t.boundaryMembers=Array.from({length:65},()=>({box:f.target.box})),
  t=>t.programTask=Object.defineProperty({},'labels',{get:trap,enumerable:true}),
  t=>t.boundaryMembers=[Object.defineProperty({},'box',{get:trap,enumerable:true})]]){
  const bad=structuredClone(f.target);change(bad);assert.throws(()=>context(bad),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(traps,0);
});

test('failed physical regions reach the existing local inventory slots even without an object census gap',()=>{
 const f=fixture(),before=structuredClone(f.plan);
 assert.deepEqual(feedback(f.plan,f.failures).get('panel'),['container-perimeter:outline-no-closed-component']);
 const targets=select(f.plan,1,0,undefined,f.failures);
 assert.equal(targets.length,1);assert.equal(targets[0].regionId,'panel');assert.equal(targets[0].boundaryReview,true);
 assert.deepEqual(targets[0].boundaryMembers.map(e=>e.id),['node','child']);
 assert.deepEqual(targets[0].endpoints.map(e=>e.id),['node','child'],'existing physical child regions remain legal endpoints even without a relation census gap');
 const instruction=prompt([{...targets[0],index:4}],f.capacity,f.frame);
 assert.match(instruction,/"requiredBoundaryMembers":\[\{"id":"node","box_2d":\[200,500,400,750\]\},\{"id":"child"/);
 assert.deepEqual(select(f.plan,0,0,undefined,f.failures),[]);assert.deepEqual(select(f.plan,32,0,undefined,{unresolved:[]}),[]);
 assert.deepEqual(f.plan,before);
});

test('boundary anchors and endpoint identities share the original 64 reference allowance without granting extra object slots',()=>{
 const f=fixture();f.plan.objects=Array.from({length:64},(_,i)=>({...f.plan.objects[0],id:'node-'+i}));
 f.plan.observedInventory[1].containers=64;
 assert.deepEqual(select(f.plan,32,0,undefined,f.failures),[],'64 objects plus a distinct child exceed the original reference cap');
 f.plan.regions.pop();f.plan.observedInventory.pop();
 const target=select(f.plan,32,0,undefined,f.failures)[0];assert.equal(target.endpoints.length,64);assert.equal(target.boundaryMembers.length,64);
 assert.equal(target.addObjects,false);
});

test('a boundary observation reuses one original regional index, zero objects and the exact atlas mapping',()=>{
 const f=fixture(),targets={reviews:[],missing:[],regionInventories:[4],regionObjectCapacity:0,regionRelationCapacity:0,regionBoundaryIndices:[4]};
 assert.deepEqual(parseLocalTargets(targets),targets);
 const format=localResponseFormat(targets).json_schema.schema.properties.regionInventoriesByIndex.properties['4'];
 assert.ok(format.required.includes('boundary'));assert.equal(format.properties.units.maxItems,0);
 const decoded=decodeLocalResponse({reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{4:{units:[],relations:[],boundary:f.response.regionInventories[0].boundary}}},targets);
 const rows=read(decoded,[f.target],f.frame,f.capacity);
 assert.deepEqual(rows[0].boundary,{confidence:.99,box:{x:20,y:20,w:160,h:80}});
 assert.match(prompt([f.target],f.capacity,f.frame),/boundary/);
});

test('two matching views correct the physical region after object proposals while preserving every identity, census and program dependency',()=>{
 const f=fixture(),rows=read(f.response,[f.target],f.frame,f.capacity),before=structuredClone(f.plan);
 f.plan.regionPrograms=[{regionId:'panel',objects:['node'],relations:[],labels:[{refs:['label-'+'a'.repeat(24)],family:'Arial'}]}];
 const result=apply(f.plan,[f.target],[rows,structuredClone(rows)]);
 assert.deepEqual(result.plan.regions[1].box,{x:20,y:20,w:160,h:80});assert.equal(result.evidence.corrected.length,1);
 assert.deepEqual(result.plan.objects,f.plan.objects);assert.deepEqual(result.plan.relations,f.plan.relations);
 assert.deepEqual(result.plan.observedInventory,f.plan.observedInventory);assert.deepEqual(result.plan.regionPrograms,f.plan.regionPrograms);
 assert.deepEqual(f.plan.regions,before.regions);assert.equal(result.plan.sourceHash,f.plan.sourceHash);
 const added={id:'late-node',regionId:'panel',kind:'container',box:{x:40,y:150,w:20,h:20}};
 f.plan.objects.push(added);const failed=apply(f.plan,[f.target],[rows,rows]);assert.equal(failed.evidence.corrected.length,0);
 assert.deepEqual(failed.evidence.rejected,[{id:'panel',reason:'region-members'}]);assert.deepEqual(failed.plan.objects.at(-1),added);
});

test('confidence, independent envelope agreement, all members, route controls and source ownership remain mandatory',()=>{
 for(const change of [r=>r.boundary.confidence=.899,r=>r.boundary.box=null,r=>r.boundary.rejection='source-window',
  r=>r.boundary.box.x=100,r=>r.boundary.box.h=20,r=>r.boundary.box={x:0,y:0,w:210,h:100}]){
  const f=fixture(),a=read(f.response,[f.target],f.frame,f.capacity),b=structuredClone(a),before=structuredClone(f.plan);
  change(b[0]);assert.equal(apply(f.plan,[f.target],[a,b]).evidence.corrected.length,0);assert.deepEqual(f.plan,before);
 }
 for(const control of [{shaftBox:{x:40,y:130,w:50,h:10}},
  {visiblePath:{kind:'polyline',dash:'solid',vertices:[{x:40,y:60},{x:60,y:150}]}}]){
  const f=fixture(),rows=read(f.response,[f.target],f.frame,f.capacity);
  f.plan.relations.push({id:'edge',regionId:'panel',fromId:'child',toId:'node',direction:'forward',...control});
  assert.equal(apply(f.plan,[f.target],[rows,rows]).evidence.corrected.length,0);
 }
 const f=fixture(),rows=read(f.response,[f.target],f.frame,f.capacity);
 assert.deepEqual(apply(f.plan,[],[[],[]]).plan,f.plan);
 rows[0].boundary.box={...f.target.box};assert.equal(apply(f.plan,[f.target],[rows,rows]).evidence.corrected.length,0);
});

test('boundary transport rejects unrequested, sparse, hostile, duplicate and escaping observations before executing accessors',()=>{
 const f=fixture(),targets={reviews:[],missing:[],regionInventories:[4],regionObjectCapacity:0,regionRelationCapacity:0,regionBoundaryIndices:[4]};
 for(const indices of [[4,4],[5],new Array(1),new Proxy([4],{})])assert.throws(()=>parseLocalTargets({...targets,regionBoundaryIndices:indices}),TypeError);
 const unrequested={...targets};delete unrequested.regionBoundaryIndices;assert.throws(()=>parseLocalTargets(unrequested),TypeError);
 const outside=structuredClone(f.response);outside.regionInventories[0].boundary.box_2d=[0,0,1000,1000];
 const frame=structuredClone(f.frame);frame.sheetTargets[0].cropBox={x:10,y:10,w:180,h:180};
 assert.equal(read(outside,[f.target],frame,f.capacity)[0].boundary.rejection,'source-window');
 let calls=0;const hostile={get confidence(){calls++;throw Error('private-secret');},box_2d:null};
 const response=structuredClone(f.response);response.regionInventories[0].boundary=hostile;
 assert.throws(()=>read(response,[f.target],f.frame,f.capacity),e=>e instanceof TypeError&&!e.message.includes('private-secret'));
 const rows=read(f.response,[f.target],f.frame,f.capacity),getter={get x(){calls++;throw Error('private-secret');},y:20,w:160,h:80};
 const bad=structuredClone(rows);bad[0].boundary.box=getter;
 for(const observations of [[bad,bad],new Proxy([rows,rows],{}),[new Array(1),rows],[rows,[]]])assert.throws(()=>apply(f.plan,[f.target],observations),TypeError);
 const cyclic=structuredClone(f.plan);cyclic.regions[1].parentId='child';assert.throws(()=>apply(cyclic,[f.target],[rows,rows]),TypeError);
 assert.equal(calls,0);
});

test('the boundary regression is discovered by unit and all CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 const path=require('node:path');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(file=>file.file.endsWith('source-scene-region-boundary-review.test.js')));
});

test('an accepted model envelope still fails real source compilation when its panel pixels do not exist',t=>{
 const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),crypto=require('node:crypto');
 const {writePng}=require('../packages/slideclone-core/png'),{preflightSourceScene}=require('../packages/slideclone-core/source-scene-compiler');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-boundary-proof-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const sourceFile=path.join(root,'source.png');writePng(sourceFile,{width:200,height:200,rgba:Buffer.alloc(160000,255)});
 const f=fixture();f.plan.sourceHash=crypto.createHash('sha256').update(fs.readFileSync(sourceFile)).digest('hex');
 const rows=read(f.response,[f.target],f.frame,f.capacity),corrected=apply(f.plan,[f.target],[rows,rows]);
 assert.equal(corrected.evidence.corrected.length,1);
 const compiled=preflightSourceScene({plan:corrected.plan,root,sourceFile,slideSize:{widthPt:200,heightPt:200},page:{shapes:[],images:[],textBoxes:[]}});
 assert.equal(compiled.evidence.containers,0);assert.ok(compiled.evidence.unresolved.some(r=>r.id==='panel'&&r.reason==='container-perimeter'));
 assert.ok(compiled.evidence.sourceScanPixels<=4000000);
});
