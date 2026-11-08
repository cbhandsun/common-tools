'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {nativeElbowConnector}=require('../packages/slideclone-core/routing/source-route-native-elbow');
// The finalizer consumes a verified private registry result. Stub that one
// dependency in an isolated module; geometry, topology and transactions stay real.
// This fixture grants no actual compiler receipt or source pixel authority.
function fixture(reversed=false){
 const points=[[20,40],[60,40],[120,40],[120,100],[60,100],[160,100],[60,160]];
 const pairs=[[0,1],[1,2],[2,3],[3,4],[4,1],[3,5],[4,6]];
 if(reversed)pairs[6]=[6,4];
 const nodes=points.map((_,i)=>({id:'v'+i,endpointId:[0,5,6].includes(i)?'endpoint'+i:null,nativeId:'node'+i}));
 const graph={id:'terminal-arm-network',regionId:'root',sourceHash:'a'.repeat(64),nodes,
  edges:pairs.map(([a,b],i)=>({id:'e'+i,from:'v'+a,to:'v'+b,memberId:'edge'+i})),
  paths:[{relationId:'top',edges:[{id:'e0',reversed:false},{id:'e1',reversed:false},{id:'e2',reversed:false},{id:'e5',reversed:false}]},
   {relationId:'bottom',edges:[{id:'e0',reversed:false},{id:'e4',reversed:true},{id:'e3',reversed:true},{id:'e5',reversed:false}]}],
  renderedPaths:[{relationId:'top',memberId:'business-top'},{relationId:'bottom',memberId:'business-bottom'}]};
 const anchor=id=>({elementId:'node'+id,side:'top',position:.5,dyPt:.05});
 const parts=pairs.map(([a,b],i)=>({id:'edge'+i,type:'line',box:{x:points[a][0],y:points[a][1],w:points[b][0]-points[a][0],h:points[b][1]-points[a][1]},
  style:{fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',startAnchor:anchor(a),endAnchor:anchor(b)},source:{role:'source-network-arm'}}));
 const targets=nodes.map((n,i)=>({id:n.nativeId,type:'rect',box:n.endpointId===null?{x:points[i][0]-.05,y:points[i][1]-.05,w:.1,h:.1}:
  {x:points[i][0]-10,y:points[i][1],w:20,h:20},style:{fill:n.endpointId===null?'none':'#EEEEEE',stroke:'none',strokeWidthPt:0},
  source:n.endpointId===null?{routeControl:true}:{sceneInventoryId:n.endpointId}}));
 for(const i of [0,5,6]){parts.filter(p=>p.style.startAnchor.elementId==='node'+i).forEach(p=>p.style.startAnchor.dyPt=0);
  parts.filter(p=>p.style.endAnchor.elementId==='node'+i).forEach(p=>p.style.endAnchor.dyPt=0);}
 const members=graph.paths.map((p,i)=>({id:'business-'+p.relationId,type:'line',box:{x:20,y:40,w:140,h:60},
  style:{fill:'none',stroke:'#123456',strokeWidthPt:2,lineCap:'round',startAnchor:{...anchor(0),dyPt:0},endAnchor:{...anchor(5),dyPt:0},
   ...nativeElbowConnector((i?[[20,40],[60,40],[60,100],[160,100]]:[[20,40],[120,40],[120,100],[160,100]]).map(([x,y])=>({x,y})))},
  source:{sceneRelationId:p.relationId,sceneInventoryId:graph.id}}));
 members.push(parts[6],...targets.filter(t=>t.source.routeControl));
 const page={shapes:[...targets.filter(t=>!t.source.routeControl),...members],images:[],textBoxes:[],source:{sourceScene:{sourceHash:graph.sourceHash}}};
 const file=path.resolve(__dirname,'../packages/slideclone-core/routing/source-native-route-finalization.js');
 const isolated=new Module(file,module);isolated.filename=file;isolated.paths=Module._nodeModulePaths(path.dirname(file));
 const originalRequire=isolated.require.bind(isolated);
 isolated.require=name=>name==='./source-shared-route-compiler'?{
  readSourceNativeNetworks:()=>({status:'verified',groups:[{graph,parts,members}]}),
  readSourceNativeFilledRoutes:()=>({status:'absent',groups:[]})}:originalRequire(name);
 isolated._compile(fs.readFileSync(file,'utf8'),file);
 return {input:{page,slideSize:{widthPt:200,heightPt:200},connectorCornerMode:'reroutable-elbow',work:{checks:0}},finalize:isolated.exports.finalizeNativeRouteRepresentations};
}
test('a verified retained arm can terminate at a real node without relocating or replacing that node',()=>{
 for(const reversed of [false,true]){const {input,finalize}=fixture(reversed),before=structuredClone(input.page),result=finalize(input);
 assert.equal(result.report.status,'applied',JSON.stringify(result.report.rejected));assert.deepEqual(input.page,before);
 assert.deepEqual(result.page.shapes.find(p=>p.id==='node6'),before.shapes.find(p=>p.id==='node6'));
 const arm=result.page.shapes.find(p=>p.id==='edge6'),prior=before.shapes.find(p=>p.id==='edge6');
 assert.equal(arm.type,'line');assert.deepEqual(arm.style.startAnchor,prior.style.startAnchor);assert.deepEqual(arm.style.endAnchor,prior.style.endAnchor);
 assert.equal(result.page.source.nativeNetworkEditModels[0].arms.length,1);
 }
});
test('an arm terminal participates in explicit reflow and keeps the edited node fixed in either orientation',()=>{
 const {reflowNativeNetworkPage}=require('../packages/slideclone-core/routing/native-network-page-reflow');
 const {readNativeNetworkEditModel}=require('../packages/slideclone-core/routing/native-network-edit-model');
 for(const reversed of [false,true]){
  const {input,finalize}=fixture(reversed),page=finalize(input).page;
  page.shapes.find(p=>p.id==='node6').box.y+=10;const before=structuredClone(page);
  const model=readNativeNetworkEditModel(page,page.source.nativeNetworkEditModels[0].id);
  const result=reflowNativeNetworkPage({...model,page,work:{checks:0},approximation:'semantic-native'});
  assert.ok(result);assert.equal(result.report.topology.cycles,1);assert.equal(result.report.topology.connectedComponents,1);
  assert.deepEqual(page,before);assert.deepEqual(result.page.shapes.find(p=>p.id==='node6'),before.shapes.find(p=>p.id==='node6'));
  const arm=result.page.shapes.find(p=>p.id==='edge6');
  const points=require('../packages/slideclone-core/routing/source-route-native-elbow').nativeElbowVertices(arm.style);
  assert.deepEqual(reversed?points[0]:points.at(-1),{x:60,y:170});
  assert.equal(result.report.sourceOwnershipGranted,false);assert.equal(result.report.automaticOfficeFollowingVerified,false);
 }
});
test('retained terminals cannot be redirected to another real node and failures do not publish edits',()=>{
 const {input,finalize}=fixture();input.page.shapes.find(p=>p.id==='edge6').style.endAnchor.elementId='node5';
 const before=structuredClone(input.page);assert.throws(()=>finalize(input),/Native route finalization is invalid/u);assert.deepEqual(input.page,before);
});
test('terminal-arm regressions are discovered by the unchanged unit CI',()=>{
 const files=require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').map(r=>r.file.replaceAll('\\','/'));
 assert.ok(files.includes('test/source-native-terminal-arm.test.js'));
});
test('missing, redirected, unsafe or extreme terminal anchors reject atomically and never run accessors',()=>{
 const {reflowNativeNetworkPage}=require('../packages/slideclone-core/routing/native-network-page-reflow');
 const {readNativeNetworkEditModel}=require('../packages/slideclone-core/routing/native-network-edit-model');
 let calls=0;const trap=()=>{calls++;throw Error('private-source-content');};
 for(const edit of [p=>p.shapes.splice(p.shapes.findIndex(s=>s.id==='node6'),1),
  p=>p.shapes.find(s=>s.id==='node6').source={},p=>p.shapes.find(s=>s.id==='node6').box.y=Infinity,
  p=>p.shapes.find(s=>s.id==='edge6').style.endAnchor.elementId='node5',
  p=>p.shapes.find(s=>s.id==='node6').source=new Proxy({},{get:trap}),
  p=>Object.defineProperty(p.shapes.find(s=>s.id==='node6'),'source',{get:trap,enumerable:true})]){
  const {input,finalize}=fixture(),page=finalize(input).page,model=readNativeNetworkEditModel(page,page.source.nativeNetworkEditModels[0].id);
  edit(page);const shapes=page.shapes,arm=shapes.find(s=>s.id==='edge6'),box={...arm.box};
  assert.throws(()=>reflowNativeNetworkPage({...model,page,work:{checks:0},approximation:'semantic-native'}),e=>e instanceof TypeError&&!e.message.includes('private'));
  assert.equal(page.shapes,shapes);assert.deepEqual(arm.box,box);
 }
 assert.equal(calls,0);
 const {input,finalize}=fixture(),page=finalize(input).page,model=readNativeNetworkEditModel(page,page.source.nativeNetworkEditModels[0].id),before=structuredClone(page);
 assert.throws(()=>reflowNativeNetworkPage({...model,page,work:{checks:3999999},approximation:'semantic-native'}),/shared-geometry-budget/u);
 assert.deepEqual(page,before);
});
