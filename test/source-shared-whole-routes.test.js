'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {sourceCurvedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute,measuredSharedSceneRoutePaintGroups}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {summarizeSceneRouteRepresentations}=require('../packages/slideclone-core/scene-plan/source-scene-route-representation');
const {joinWholeRouteGeometry,wholeRouteCurves}=require('../packages/slideclone-core/routing/source-whole-route-geometry');
const {encodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
function compile(f,relations,mode='reroutable-elbow'){
 const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 return compileSharedSourceRoute({fit:measured.fit,image:f.image,relations,id:'test-whole',sourceHash:'a'.repeat(64),
  slideSize:{widthPt:f.image.width,heightPt:f.image.height},wholeRelations:true,connectorCornerMode:mode});
}
function line(id,a,b){return {id,type:'line',box:{x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y},style:{fill:'none'}};}
test('shared source tree emits one attached native object per logical relation with private paint retained',()=>{
 const f=sourceSharedTreeFixture(),relations=[
  {id:'left',regionId:'root',fromId:'region-source',toId:'object-left',direction:'forward'},
  {id:'right',regionId:'root',fromId:'region-source',toId:'object-right',direction:'forward'}];
 const pixels=Buffer.from(f.image.rgba),out=compile(f,relations);
 assert.equal(out.parts.length,2);assert.ok(out.parts.every(p=>p.type==='line'));assert.equal(out.wholeRelations.size,2);
 const nodes=f.nodes.map(n=>({...n,type:'rect',source:{sceneInventoryId:n.endpointId}})),page={shapes:[...nodes,...out.parts],images:[],textBoxes:[]};
 const report=summarizeSceneRouteRepresentations({page,relations:[...out.wholeRelations].map(([relationId,memberIds])=>({relationId,memberIds}))});
 assert.deepEqual(report.wholeObjectUnmetRelationIds,[]);assert.deepEqual(report.nativeModeUnmetRelationIds,[]);
 for(const part of out.parts){assert.equal(part.style.startAnchor.elementId,'native-source');assert.equal(part.style.endArrow,'triangle');assert.equal(part.source.sourceRouteParts,1);}
 assert.equal(measuredSharedSceneRoutePaintGroups(f.image,page.shapes,{checks:0}).length,1);
 const missing=page.shapes.filter(p=>p!==out.parts[0]);assert.deepEqual(measuredSharedSceneRoutePaintGroups(f.image,missing,{checks:0}),[]);
 out.parts[0].style.stroke='#FFFFFF';assert.deepEqual(measuredSharedSceneRoutePaintGroups(f.image,page.shapes,{checks:0}),[]);
 assert.deepEqual(f.image.rgba,pixels);
});
test('curved source network preserves both complete logical paths and its unclaimed physical arm',()=>{
 const f=sourceCurvedNetworkFixture(),out=compile(f,networkRelations,'rounded-freeform');
 assert.equal(out.wholeRelations.size,2);
 const page={shapes:[...f.nodes.map(n=>({...n,type:'rect'})),...out.parts],images:[],textBoxes:[]};
 const report=summarizeSceneRouteRepresentations({page,connectorCornerMode:'rounded-freeform',relations:[...out.wholeRelations].map(([relationId,memberIds])=>({relationId,memberIds}))});
 assert.deepEqual(report.wholeObjectUnmetRelationIds,[]);
 assert.ok(out.parts.some(p=>p.type==='freeform'&&wholeRouteCurves(p).some(c=>c.length===4)));
 assert.ok(out.graph.edges.length>=out.graph.nodes.length);
 for(const id of out.unusedPhysicalEdges){const edge=out.graph.edges.find(e=>e.id===id);assert.ok(out.parts.some(p=>p.id===edge.memberId));}
 assert.equal(measuredSharedSceneRoutePaintGroups(f.image,page.shapes,{checks:0}).length,1);
});
test('cubic reversal keeps the whole curve and refuses a fabricated bridge',()=>{
 const p={id:'curve',type:'freeform',box:{x:10,y:20,w:30,h:40},style:{fill:'none',closed:false,
  freeformPath:encodeNativeFreeformPath([{type:'moveTo',points:[{x:0,y:0}]},{type:'cubicBezTo',points:[{x:.2,y:.8},{x:.9,y:.1},{x:1,y:1}]}])}};
 const before=structuredClone(p),original=wholeRouteCurves(p),out=joinWholeRouteGeometry([{part:p,reversed:true}]);
 assert.deepEqual(out.curves,[original[0].slice().reverse()]);assert.deepEqual(p,before);
 assert.throws(()=>joinWholeRouteGeometry([{part:p,reversed:false},{part:line('gap',{x:41,y:60},{x:50,y:80}),reversed:false}]),/disconnected/u);
});
test('whole geometry boundaries reject empty, invalid, extreme and conflicting representations',()=>{
 const p=line('line',{x:0,y:0},{x:20,y:30});
 for(const members of [[],new Array(2),Array(129).fill({part:p,reversed:false}),[{part:p,reversed:1}]])assert.throws(()=>joinWholeRouteGeometry(members),TypeError);
 for(const edit of [q=>q.box.w=NaN,q=>q.style.connectorPath='private',q=>q.style.connectorType='curved-5',
  q=>q.style.connectorFrame={x:0,y:0,w:20,h:30,rotationDeg:45,flipH:false,flipV:false},q=>q.box.w=100001]){
  const q=structuredClone(p);edit(q);assert.throws(()=>joinWholeRouteGeometry([{part:q,reversed:false}]),TypeError);
 }
 assert.throws(()=>joinWholeRouteGeometry(Array.from({length:120},(_,i)=>({part:line('p'+i,{x:i,y:i},{x:i+1,y:i+1}),reversed:false}))),/budget/u);
});
test('hostile accessors, proxies and coercion hooks do not execute at the whole-route boundary',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 const p=line('line',{x:0,y:0},{x:20,y:30});
 for(const members of [new Proxy([],{get:trap}),[{part:proxy,reversed:false}],[{get part(){return trap();},reversed:false}]])assert.throws(()=>joinWholeRouteGeometry(members),TypeError);
 for(const value of [proxy,{toString:trap},{get rotationDeg(){return trap();}}]){
  p.style.connectorFrame=value;assert.throws(()=>joinWholeRouteGeometry([{part:p,reversed:false}]),TypeError);
 }
 p.style={fill:'none',connectorType:{toString:trap}};assert.throws(()=>joinWholeRouteGeometry([{part:p,reversed:false}]),TypeError);assert.equal(calls,0);
});
test('whole relationship modules and regressions are typed, packaged, and discovered by unified CI',()=>{
 for(const name of ['source-whole-route-geometry','source-shared-whole-routes']){
  const file='packages/slideclone-core/routing/'+name+'.js';assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
  assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 }
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-whole-routes.test.js'));
});
