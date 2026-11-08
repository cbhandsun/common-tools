'use strict';
const assert=require('node:assert/strict'),test=require('node:test');
const {nativeNetworkPage}=require('./helpers/native-network-page.cjs');
const {reflowNativeNetworkPage:reflow}=require('../packages/slideclone-core/routing/native-network-page-reflow');
const {applyIrEditorPatch}=require('../packages/ppt-create-core/ir-editor');
const {deckIrFingerprint}=require('../packages/ppt-create-core/export');
const edited=require('./fixtures/whole-native-network-edited-ports.json');
const {createNativeNetworkEditModel,readNativeNetworkEditModel}=require('../packages/slideclone-core/routing/native-network-edit-model');
function move(input){for(const pin of edited.endpointPins){const node=input.page.shapes.find(s=>s.id==='node-'+pin.nodeId);assert.ok(node);node.box.x=pin.point.x-10;node.box.y=pin.point.y-5;}return input;}
function operation(f){return {type:'reflow-native-network',pageIndex:0,graph:f.graph,parts:f.parts,relations:f.relations,arms:f.arms,approximation:'semantic-native'};}
function deck(f){return {version:'1.0',slideSize:{widthPt:1000,heightPt:1000},pages:[f.page]};}
function patch(ir,operations){return {version:'1.0',expectedRevision:deckIrFingerprint(ir),operations};}
test('actual edited terminal coordinates reflow every complete relation and move only private arm controls',()=>{
 const input=move(nativeNetworkPage()),before=structuredClone(input),out=reflow(input);assert.ok(out);
 assert.equal(out.report.relations,5);assert.equal(out.report.arms,1);assert.equal(out.report.controls,2);
 assert.equal(out.report.topology.cycles,1);assert.equal(out.report.topology.connectedComponents,1);assert.equal(out.report.correspondence.orderedPathsVerified,true);
 assert.deepEqual(input.page,before.page);assert.deepEqual(input.graph,before.graph);assert.deepEqual(input.parts,before.parts);
 assert.equal(out.page.images,input.page.images);assert.equal(out.page.source,input.page.source);
 for(const binding of input.relations){const old=input.page.shapes.find(s=>s.id===binding.elementId),next=out.page.shapes.find(s=>s.id===binding.elementId);
  for(const k of ['startAnchor','endAnchor','endArrow','strokeDash','strokeWidthPt'])assert.deepEqual(next.style[k],old.style[k]);
  assert.deepEqual(next.style.strokeGradient.stops,old.style.strokeGradient.stops);assert.equal(next.source.sourceFootprintVerified,false);
 }
 for(const key of ['sourceOwnershipGranted','sourceFootprintVerified','fullActualTopologyVerified','automaticOfficeFollowingVerified'])assert.equal(out.report[key],false);
 assert.equal(out.page.shapes.length,input.page.shapes.length);
 for(const p of input.page.shapes.filter(p=>p.id.startsWith('node-')))assert.equal(out.page.shapes.find(s=>s.id===p.id),p);
});
test('tree, cycle and repeat explicit reflows retain their complete output rosters',()=>{
 for(const index of [0,1]){const input=nativeNetworkPage(index),out=reflow(input);assert.ok(out);assert.equal(out.report.topology.cycles,index);
  const second=reflow({...input,page:out.page,work:{checks:0}});assert.ok(second);assert.deepEqual(second.page,out.page);}
});
test('incomplete, duplicate, swapped or unknown business mappings reject the whole transaction',()=>{
 for(const edit of [f=>f.relations.pop(),f=>f.relations.push({...f.relations[0]}),f=>f.relations[0].elementId='absent',
  f=>{const a=f.relations[0],b=f.relations[1];[a.elementId,b.elementId]=[b.elementId,a.elementId];},f=>f.arms.pop(),
  f=>f.arms[0].edgeIds=['unknown'],f=>f.arms.push({...f.arms[0]})]){
  const f=nativeNetworkPage();edit(f);const before=structuredClone(f.page);assert.throws(()=>reflow(f),TypeError);assert.deepEqual(f.page,before);
 }
});
test('unsafe, malformed, extreme and empty inputs execute no caller accessors and leak no content',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 for(const bad of [null,[],{},new Proxy({},{get:trap,ownKeys:trap}),{get page(){return trap();}}])assert.throws(()=>reflow(bad),TypeError);
 for(const edit of [f=>f.page.shapes.push({...f.page.shapes[0]}),f=>f.relations=[],f=>f.arms=[],
  f=>f.relations[0]={get elementId(){return trap();}},f=>f.page.shapes[0].box.x=Infinity,
  f=>f.relations=new Proxy([],{get:trap}),f=>f.page.shapes=new Proxy([],{get:trap}),
  f=>f.page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor.side={toString:trap},
  f=>f.page.shapes.find(s=>s.source?.routeControl).source=new Proxy({},{get:trap}),
  f=>f.page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor=new Proxy({},{get:trap}),
  f=>f.page.shapes.find(s=>s.source?.sceneRelationId).style.strokeGradient={get angleDeg(){return trap();}}]){
  const f=nativeNetworkPage();edit(f);assert.throws(()=>reflow(f),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(calls,0);
});
test('missing, rotated, dangling and incoherent current anchors never publish guessed pins',()=>{
 for(const edit of [f=>delete f.page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor,
  f=>f.page.shapes[0].rotation=90,f=>f.page.shapes[0].type='ellipse',
  f=>f.page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor.position=2,
  f=>f.page.shapes.find(s=>s.source?.sceneRelationId).style.startAnchor.elementId='absent',
  f=>f.page.shapes.filter(s=>s.source?.sceneRelationId)[1].style.startAnchor.dxPt=1]){
  const f=nativeNetworkPage();edit(f);assert.throws(()=>reflow(f),TypeError);
 }
});
test('visible or externally referenced route controls cannot be moved as private controls',()=>{
 for(const edit of [f=>f.page.shapes.find(s=>s.source?.routeControl).style.fill='#FFFFFF',
  f=>f.page.shapes.find(s=>s.source?.routeControl).source.routeControl=false,
  f=>{const part=f.page.shapes.find(s=>s.source?.role==='source-network-arm');f.page.shapes.push({...structuredClone(part),id:'outside-network',source:{}});}]){
  const f=nativeNetworkPage();edit(f);const before=structuredClone(f.page);assert.throws(()=>reflow(f),TypeError);assert.deepEqual(f.page,before);
 }
});
test('crossing edits and exhausted budgets retain the original page without a partial replacement',()=>{
 const f=nativeNetworkPage();f.page.shapes.find(s=>s.id==='node-vertex-4').box.x=790;
 const before=structuredClone(f.page);assert.equal(reflow(f),null);assert.deepEqual(f.page,before);
 const g=nativeNetworkPage();g.work.checks=3999999;assert.throws(()=>reflow(g),/shared-geometry-budget/u);assert.equal(g.work.checks,4000001);
});
test('reversed unused arm retains its endpoint roles and actual paint claims remain separate',()=>{
 const f=move(nativeNetworkPage()),arm=f.page.shapes.find(p=>p.source?.role==='source-network-arm');
 [arm.style.startAnchor,arm.style.endAnchor]=[arm.style.endAnchor,arm.style.startAnchor];f.arms[0].reversed=true;
 const out=reflow(f);assert.ok(out);assert.equal(out.report.topology.cycles,1);assert.equal(out.report.topologyScope,'continuous-connector-geometry');
 assert.equal(out.report.actualPaintTopologyVerified,false);
 assert.deepEqual(out.page.shapes.find(p=>p.id===arm.id).style.startAnchor,arm.style.startAnchor);
});
test('elbow-to-straight reflow removes obsolete native preset and adjustment fields',()=>{
 const {nativeElbowConnector}=require('../packages/slideclone-core/routing/source-route-native-elbow');
 const g={nodes:[{id:'a',endpointId:'start'},{id:'b',endpointId:'end'}],edges:[{id:'e',from:'a',to:'b',memberId:'p'}],paths:[{relationId:'relation',edges:[{id:'e',reversed:false}]}]};
 const f={graph:g,parts:[{id:'p',type:'line',box:{x:50,y:50,w:100,h:0},style:{strokeWidthPt:2,fill:'none'}}],approximation:'semantic-native',work:{checks:0},relations:[{relationId:'relation',elementId:'relation-output'}],arms:[],
  page:{shapes:[{id:'start',type:'rect',box:{x:40,y:45,w:20,h:10}},{id:'end',type:'rect',box:{x:140,y:45,w:20,h:10}},
   {id:'relation-output',type:'line',box:{x:50,y:50,w:100,h:0},style:{...nativeElbowConnector([{x:50,y:50},{x:150,y:50}]),connectorType:'elbow-3',connectorAdjustments:[50000],
    fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',startAnchor:{elementId:'start',side:'top',position:.5,dyPt:5},endAnchor:{elementId:'end',side:'top',position:.5,dyPt:5}},source:{sceneRelationId:'relation'}}]}};
 const out=reflow(f);assert.ok(out);const style=out.page.shapes.at(-1).style;
 assert.equal(Object.hasOwn(style,'connectorType'),false);assert.equal(Object.hasOwn(style,'connectorAdjustments'),false);
});
test('revision-bound IR editing invokes reflow after node changes and preserves the caller deck',()=>{
 const f=nativeNetworkPage(),ir=deck(f),before=structuredClone(ir),moved=move(nativeNetworkPage());
 const moves=moved.page.shapes.filter(s=>s.id.startsWith('node-')).map(s=>({type:'set-box',pageIndex:0,objectId:s.id,box:s.box}));
 const result=applyIrEditorPatch(ir,patch(ir,[...moves,operation(f)]));
 assert.equal(result.networkReflows.length,1);assert.equal(result.networkReflows[0].topology.cycles,1);
 assert.deepEqual(ir,before);assert.notEqual(result.revision,deckIrFingerprint(ir));
 assert.throws(()=>applyIrEditorPatch(ir,{...patch(ir,[operation(f)]),expectedRevision:'a'.repeat(64)}),/revision/u);
});
test('a later failed edit cannot publish an earlier successful network reflow',()=>{
 const f=move(nativeNetworkPage()),ir=deck(f),before=structuredClone(ir);
 assert.throws(()=>applyIrEditorPatch(ir,patch(ir,[operation(f),{type:'set-box',pageIndex:0,objectId:'missing',box:{x:1,y:1,w:2,h:2}}])),TypeError);
 assert.deepEqual(ir,before);
 const op=operation(f);op.endpointPins=edited.endpointPins;assert.throws(()=>applyIrEditorPatch(ir,patch(ir,[op])),TypeError);
});
test('multiple network operations share the host budget and cannot reset it',()=>{
 const f=nativeNetworkPage(),ir=deck(f),before=structuredClone(ir);
 assert.throws(()=>applyIrEditorPatch(ir,patch(ir,Array.from({length:40},()=>operation(f)))),/shared-geometry-budget/u);
 assert.deepEqual(ir,before);
});
test('portable edit data is independent, revision bound and cannot grant source authority',()=>{
 const f=move(nativeNetworkPage());f.graph.id='sample-network';
 const model=createNativeNetworkEditModel({...f,work:{checks:0}});f.page.source={nativeNetworkEditModels:[model]};
 assert.notEqual(model.graph,f.graph);assert.notEqual(model.parts,f.parts);
 const ir=deck(f),op={type:'reflow-native-network',pageIndex:0,networkId:model.id,approximation:'semantic-native'};
 const result=applyIrEditorPatch(ir,patch(ir,[op]));assert.equal(result.networkReflows[0].topology.cycles,1);
 assert.equal(result.networkReflows[0].sourceOwnershipGranted,false);
 assert.throws(()=>applyIrEditorPatch(ir,patch(ir,[{...op,networkId:'absent'}])),TypeError);
 assert.throws(()=>applyIrEditorPatch(ir,patch(ir,[{...op,graph:f.graph}])),TypeError);
});
test('portable model parsing rejects getters, proxies, duplicate IDs, oversized and exhausted snapshots',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');};
 for(const bad of [null,[],{},new Proxy({},{get:trap}),{get source(){return trap();}}])assert.throws(()=>readNativeNetworkEditModel(bad,'sample'),TypeError);
 for(const models of [new Proxy([],{get:trap}),[{get id(){return trap();}}],[{id:'sample'},{id:'sample'}],Array.from({length:25},(_,i)=>({id:'n'+i}))])
  assert.throws(()=>readNativeNetworkEditModel({source:{nativeNetworkEditModels:models}},'sample'),TypeError);
 const f=nativeNetworkPage();f.graph.id='sample';f.parts[0].style={get fill(){return trap();}};
 assert.throws(()=>createNativeNetworkEditModel(f),TypeError);assert.equal(calls,0);
 const g=nativeNetworkPage();g.graph.id='sample';g.work.checks=4000000;assert.throws(()=>createNativeNetworkEditModel(g),/shared-geometry-budget/u);
});
test('new editor boundary is typed, packaged, declared and discovered by unified CI',()=>{
 for(const file of ['packages/slideclone-core/routing/native-network-page-reflow.js','packages/slideclone-core/routing/native-network-edit-model.js','packages/ppt-create-core/ir-network-reflow.js']){
  assert.ok(require('../tsconfig.boundaries.json').include.includes(file));const releases=require('../scripts/verify-runtime-package');
  assert.ok([...releases.IMAGE_EDITABLE_RELEASE_FILES,...releases.PPT_CREATE_RELEASE_FILES].includes(file));
 }
 assert.equal(require('../packages/ppt-create-core/package.json').dependencies['@common-tools/slideclone-core'],'0.1.0');
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/native-network-page-reflow.test.js'));
});
