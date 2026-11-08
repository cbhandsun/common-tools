'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedNetworkFixture,sourceCurvedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute,sealSourceNativeNetworks,readSourceNativeNetworks}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {createSourceNativeNetworkRegistry}=require('../packages/slideclone-core/routing/source-native-network-registry');
const {finalizeNativeRouteRepresentations:finalize}=require('../packages/slideclone-core/routing/source-native-route-finalization');
const {encodeNativeFreeformPath,readNativeFreeformSegments}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
const {inspectWholeRouteNetworkTopology}=require('../packages/slideclone-core/routing/whole-route-network-topology');
function fixture(kind='network',controls={}){
 const f=kind==='curved'?sourceCurvedNetworkFixture():kind==='tree'?sourceSharedTreeFixture():sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const slideSize={widthPt:f.image.width,heightPt:f.image.height};
 const relations=kind==='tree'?networkRelations.map(({shaftBox,...relation})=>relation):networkRelations;
 const out=compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'test-native-network',sourceHash:'a'.repeat(64),
  slideSize,wholeRelations:true,connectorCornerMode:'reroutable-elbow',...controls});
 const nodes=f.nodes.map(n=>({id:n.id,type:'rect',box:{...n.box},style:{fill:'#D2E6F5'},source:{sceneInventoryId:n.endpointId}}));
 const page={shapes:[...nodes,...out.parts],images:[],textBoxes:[],source:{sourceScene:{sourceHash:'a'.repeat(64)}}};
 return {page,slideSize,receipt:sealSourceNativeNetworks(page),connectorCornerMode:'reroutable-elbow',work:{checks:0}};
}
test('genuine measured network is read atomically and private tokens cannot be copied or transferred',()=>{
 const input=fixture(),before=structuredClone(input.page),read=readSourceNativeNetworks(input);
 assert.equal(read.status,'verified');assert.equal(read.groups.length,1);assert.ok(Object.isFrozen(read.groups[0].graph));
 assert.ok(read.groups[0].parts.length);read.groups[0].parts[0].box.x+=1;
 assert.equal(readSourceNativeNetworks({...input,work:{checks:0}}).status,'verified');assert.deepEqual(input.page,before);
 for(const receipt of [undefined,{},JSON.parse(JSON.stringify(input.receipt)),structuredClone(input.receipt)])
  assert.equal(readSourceNativeNetworks({...input,receipt,work:{checks:0}}).status,'absent');
 assert.equal(createSourceNativeNetworkRegistry().read({...input,work:{checks:0}}).status,'absent');
});
test('deferred native selection retains a private binding while source consumers use the exact rounded representation',()=>{
 const input=fixture('tree',{connectorCornerMode:'rounded-freeform',prepareNativeGeometry:true}),before=structuredClone(input.page);
 assert.equal(readSourceNativeNetworks(input).status,'verified');input.work={checks:0};const out=finalize(input);
 assert.equal(out.report.status,'applied');assert.deepEqual(out.report.unmetRelationIds,[]);assert.deepEqual(input.page,before);
});
test('member, endpoint, source and slide edits invalidate the entire original group',()=>{
 for(const edit of [x=>x.page.shapes[0].box.x++,x=>x.page.shapes.push({...x.page.shapes[0]}),x=>x.slideSize.widthPt++,
  x=>x.page.source.sourceScene.sourceHash='b'.repeat(64),x=>x.page.shapes.pop(),
  x=>x.page.shapes.find(s=>s.type==='freeform').style.stroke='#FFFFFF',
  x=>{const s=x.page.shapes.find(s=>s.style.fill==='none'&&s.type==='rect');assert.ok(s);s.box.x++;}]){
  const input=fixture();edit(input);const read=readSourceNativeNetworks(input);assert.equal(read.status,'invalid');assert.deepEqual(read.groups,[]);}
});
test('metadata compaction and equivalent freeform encoding retain original output binding',()=>{
 const input=fixture();
 for(const s of input.page.shapes.filter(s=>s.type==='freeform')){
  s.style.freeformSegments=readNativeFreeformSegments(s.style);
  delete s.style.freeformPath;s.style.freeformPath=encodeNativeFreeformPath(s.style.freeformSegments);
  delete s.style.freeformSegments;s.style.opacity=1;s.source={...s.source,groupIds:['compact-group'],portableNote:'metadata-only'};
 }
 assert.equal(readSourceNativeNetworks(input).status,'verified');
});
test('normal finalization preserves the measured tree as complete attached standard connectors',()=>{
 const input=fixture('tree'),before=structuredClone(input.page),result=finalize(input);
 assert.equal(result.report.status,'applied',JSON.stringify(result.report));assert.equal(result.report.networks.length,1);assert.deepEqual(result.report.unmetRelationIds,[]);
 assert.deepEqual(input.page,before);assert.equal(result.page.images,input.page.images);assert.equal(result.page.textBoxes,input.page.textBoxes);
 const parts=result.page.shapes.filter(s=>s.source?.sceneRelationId||s.source?.role==='source-network-arm');
 assert.equal(parts.length,2);assert.ok(parts.every(s=>s.type==='line'&&!s.style.freeformSegments&&!s.style.freeformPath));
 for(const p of parts){const original=before.shapes.find(s=>s.id===p.id);assert.ok(original);
  assert.deepEqual(p.style.startAnchor,original.style.startAnchor);assert.deepEqual(p.style.endAnchor,original.style.endAnchor);
  assert.equal(p.style.endArrow,original.style.endArrow);assert.equal(p.source.sourceFootprintVerified,false);}
 const topology=inspectWholeRouteNetworkTopology({parts,work:{checks:0}});assert.ok(topology);assert.equal(topology.connectedComponents,1);assert.equal(topology.cycles,0);
 assert.equal(result.report.nodeFollowingVerification,'not-assessed');assert.equal(result.report.fullActualTopologyVerified,false);
 assert.equal(result.page.source.nativeNetworkEditModels.length,1);
 const editModel=result.page.source.nativeNetworkEditModels[0];assert.equal(editModel.kind,'output-native-network-edit-v1');
 assert.equal(editModel.sourceOwnershipGranted,false);assert.equal(editModel.relations.length,2);assert.equal(editModel.arms.length,0);
});

test('a freshly finalized measured network can be reflowed through the IR host using its stored model ID',()=>{
 const input=fixture('tree'),out=finalize(input),page={...out.page,pageIndex:0};
 const {applyIrEditorPatch}=require('../packages/ppt-create-core/ir-editor');
 const {deckIrFingerprint}=require('../packages/ppt-create-core/export');
 const ir={version:'1.0',slideSize:input.slideSize,pages:[page]},model=page.source.nativeNetworkEditModels[0];
 const result=applyIrEditorPatch(ir,{version:'1.0',expectedRevision:deckIrFingerprint(ir),operations:[{type:'reflow-native-network',pageIndex:0,networkId:model.id,approximation:'semantic-native'}]});
 assert.equal(result.networkReflows.length,1);assert.equal(result.networkReflows[0].relations,2);
 assert.equal(result.networkReflows[0].topology.cycles,0);assert.equal(result.networkReflows[0].sourceOwnershipGranted,false);
});
test('unrepresentable curved cycle retains the entire original network and reports unmet relations',()=>{
 const input=fixture('curved'),before=structuredClone(input.page),out=finalize(input);
 assert.equal(out.report.status,'partial');assert.equal(out.report.changed,0);assert.deepEqual(out.page.shapes,before.shapes);
 assert.deepEqual(out.report.rejected,[{id:'test-native-network',reason:'native-network-unrepresentable'}]);
 assert.deepEqual(out.report.unmetRelationIds,['left-route','right-route']);
 assert.equal(out.page,input.page);assert.equal(out.page.shapes,input.page.shapes);assert.equal(out.page.source,input.page.source);
 assert.deepEqual(out.page,before);
});

test('rejected native selection reports final unmet connector mode without rewriting the approved intermediate census',()=>{
 const input=fixture('curved',{connectorCornerMode:'rounded-freeform',prepareNativeGeometry:true});
 input.page.source.sourceScene.routeRepresentations={requestedMode:'rounded-freeform',nativeModeUnmetRelationIds:[]};
 const before=structuredClone(input.page),out=finalize(input);
 assert.equal(out.report.status,'partial');assert.equal(out.report.changed,0);
 assert.equal(out.report.requestedMode,'reroutable-elbow');
 assert.equal(out.report.routeRepresentations.requestedMode,'reroutable-elbow');
 assert.deepEqual(out.report.routeRepresentations.nativeModeUnmetRelationIds,['left-route','right-route']);
 assert.ok(out.report.routeRepresentations.relations.every(row=>row.requestedNativeModeUnmet&&row.objectStructure==='single-native-path'));
 assert.equal(out.page,input.page);assert.equal(out.page.source,input.page.source);assert.deepEqual(input.page,before);
});

test('an empty native transaction preserves approved array and source identities',()=>{
 const page={shapes:[{id:'card',type:'rect',box:{x:10,y:10,w:40,h:30},style:{fill:'#EEEEEE'}}],images:[],textBoxes:[],
  source:{sourceScene:{sourceHash:'a'.repeat(64)}}};
 const before=structuredClone(page),out=finalize({page,slideSize:{widthPt:100,heightPt:80},connectorCornerMode:'reroutable-elbow',work:{checks:0}});
 assert.equal(out.report.changed,0);assert.deepEqual(out.report.unmetRelationIds,[]);
 assert.equal(out.page,page);assert.equal(out.page.shapes,page.shapes);assert.equal(out.page.source,page.source);assert.deepEqual(page,before);
});
test('missing or invalid private receipt cannot trigger independent fitting of shared relations',()=>{
 for(const invalid of [false,true]){const input=fixture();if(invalid)input.page.shapes[0].box.x++;else delete input.receipt;
  const before=structuredClone(input.page),out=finalize(input);assert.equal(out.report.changed,0);assert.deepEqual(out.page.shapes,before.shapes);
  assert.ok(out.report.unmetRelationIds.length);assert.equal(out.report.status,'partial');}
 const input=fixture(),before=structuredClone(input.page);input.connectorCornerMode='rounded-freeform';
 const out=finalize(input);assert.equal(out.report.status,'not-requested');assert.equal(out.page,input.page);assert.deepEqual(out.page,before);
});
test('invalid input and exhausted output ledger never yield partial network replacements',()=>{
 for(const value of [null,{},[],{...fixture(),page:{shapes:[],images:[],textBoxes:[],get source(){throw Error('private-content');}}}])assert.throws(()=>finalize(value),TypeError);
 const input=fixture(),before=structuredClone(input.page);input.work.checks=3999999;assert.throws(()=>finalize(input),/shared-geometry-budget/u);
 assert.equal(input.work.checks,4000001);assert.deepEqual(input.page,before);
});
test('new production modules are typed, packaged and tests are discovered by unified CI',()=>{
 for(const name of ['whole-route-network-paths','source-native-network-registry','source-native-route-finalization']){
  const file='packages/slideclone-core/routing/'+name+'.js';assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
  assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));}
 for(const suite of ['unit','all'])for(const file of ['source-native-route-finalization','source-route-gradient-reframe','whole-route-network-paths'])
  assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')===`test/${file}.test.js`));
});
