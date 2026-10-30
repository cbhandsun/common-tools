'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoutePolyline:compile}=require('../packages/slideclone-core/routing/source-route-polyline');
const {decodeNativeFreeformPath}=require('../packages/slideclone-core/scene-plan/native-freeform-path');

test('one open native polyline preserves every measured vertex under scaling and reverse traversal',()=>{
 const points=[{x:2,y:4},{x:7,y:4},{x:9,y:5},{x:10,y:8},{x:10,y:12}];
 for(const ps of [points,[...points].reverse()]){
  const input={points:ps,sx:1.3,sy:.7},before=structuredClone(input),result=compile(input);assert.ok(result);
  const segments=decodeNativeFreeformPath(result.style.freeformPath);assert.equal(segments.length,points.length);
  assert.equal(segments[0].type,'moveTo');assert.ok(segments.slice(1).every(s=>s.type==='lnTo'));
  assert.equal(result.style.closed,false);
  for(const [i,s]of segments.entries()){
   assert.ok(Math.abs(result.box.x+s.points[0].x*result.box.w-ps[i].x*input.sx)<1e-9);
   assert.ok(Math.abs(result.box.y+s.points[0].y*result.box.h-ps[i].y*input.sy)<1e-9);
  }
  assert.deepEqual(input,before);
 }
 for(const points of [[{x:0,y:1},{x:3,y:1}],[{x:1,y:0},{x:1,y:3}],[{x:1,y:1},{x:2,y:2},{x:1,y:1}]])assert.equal(compile({points,sx:1,sy:1}),null);
});

test('polyline input rejects hostile, empty, nonfinite and oversized controls without executing user code',()=>{
 let calls=0;const point={x:1,y:2},valid={points:[point,{x:3,y:4}],sx:1,sy:1};
 for(const input of [null,{}, {...valid,points:[]},{...valid,points:[point]},
  {...valid,points:[point,{x:NaN,y:1}]},{...valid,sx:0},{...valid,sy:Infinity},{...valid,sx:100001},
  {...valid,points:Array.from({length:121},()=>point)},
  {...valid,points:new Proxy(valid.points,{get(){calls++;throw Error('private');}})},
  {...valid,points:[point,Object.defineProperty({y:4},'x',{get(){calls++;throw Error('private');}})]},
  new Proxy(valid,{get(){calls++;throw Error('private');}})])assert.throws(()=>compile(input),TypeError);
 assert.equal(calls,0);
 const extreme=compile({points:[{x:-100000,y:-100000},{x:100000,y:100000}],sx:1,sy:1});assert.ok(extreme);
 const {IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/routing/source-route-polyline.js'));
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit').some(row=>row.file.replaceAll('\\','/')==='test/source-route-polyline.test.js'));
});

test('explicit auto compacts source edges with exact endpoint geometry while default output retains rerouting',()=>{
 const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const {isNativeRelationshipPath}=require('../packages/slideclone-core/quality/native-relationship-path');
 const f=sourceSharedNetworkFixture(),result=measureSharedSourceRoute(f);assert.ok(result.fit,result.reason);
 const request={fit:result.fit,image:f.image,relations:networkRelations,id:'network',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}};
 const compact=compileSharedSourceRoute({...request,connectorCornerMode:'auto'}),elbow=compileSharedSourceRoute({...request,connectorCornerMode:'reroutable-elbow'});
 assert.deepEqual(compileSharedSourceRoute(request),elbow);
 const paths=compact.parts.filter(p=>p.source.nativePathGeometry==='source-cubic-v1');assert.ok(paths.length>0);
 assert.ok(compact.parts.length<elbow.parts.length);
 const objects=new Map([...f.nodes.map(n=>({id:n.id,box:n.box})),...compact.parts].map(p=>[p.id,[p]]));
 for(const p of paths){
  assert.ok(isNativeRelationshipPath(p,objects));assert.equal(p.source.nativeConnectorRoute,false);
  const commands=decodeNativeFreeformPath(p.style.freeformPath);assert.equal(commands[0].type,'moveTo');
  assert.ok(commands.slice(1).every(s=>['lnTo','cubicBezTo'].includes(s.type)));assert.ok(commands.some(s=>s.type==='cubicBezTo'));
  assert.equal(p.source.nativeRoutePoints.length,4);
  const start=commands[0].points[0],end=commands.at(-1).points.at(-1);
  assert.ok(Math.hypot(p.box.x+start.x*p.box.w-p.source.nativeRoutePoints[0].x,p.box.y+start.y*p.box.h-p.source.nativeRoutePoints[0].y)<1e-9);
  assert.ok(Math.hypot(p.box.x+end.x*p.box.w-p.source.nativeRoutePoints.at(-1).x,p.box.y+end.y*p.box.h-p.source.nativeRoutePoints.at(-1).y)<1e-9);
 }
 assert.ok(elbow.parts.every(p=>p.type!=='freeform'));
 const {auditSemanticEditability:audit}=require('../packages/slideclone-core/quality/semantic-editability-quality');
 const deck={slideSize:request.slideSize,pages:[{shapes:[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box})),...compact.parts],images:[]}]};
 assert.equal(audit(deck).passed,false,'a compact native path does not grant node rerouting');
 assert.equal(audit(deck,{relationshipEditing:'native-path'}).passed,true);
 assert.equal(compact.graph.paths.length,networkRelations.length);
 assert.ok(compact.parts.length<=Math.max(32,networkRelations.length*20));
});

test('source-backed curved networks fit native capacity while a reroutable path must still retain its source anchor',()=>{
 const {sourceCurvedNetworkFixture}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const {compileSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
 const f=sourceCurvedNetworkFixture(),before=Buffer.from(f.image.rgba),result=measureSharedSourceRoute(f);assert.ok(result.fit,result.reason);
 const legacyParts=result.fit.edges.reduce((n,e)=>n+(e.points.length-1)*2-1,0)
  +new Set(result.fit.edges.flatMap(e=>[e.from,e.to]).filter(n=>!result.fit.cuts.includes(n))).size;
 assert.ok(legacyParts>40,'segmented controls overflow the original two-relation capacity');
 const relations=[{id:'left',regionId:'root',fromId:'region-source',toId:'object-left',direction:'forward',shaftBox:{x:140,y:99,w:4,h:4}},
  {id:'right',regionId:'root',fromId:'region-source',toId:'object-right',direction:'forward',shaftBox:{x:145,y:121,w:10,h:3}}];
 const request={fit:result.fit,image:f.image,relations,id:'curved',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}};
 const output=compileSharedSourceRoute({...request,connectorCornerMode:'auto'});assert.equal(output.parts.length,9);assert.ok(output.parts.length<=40);
 assert.equal(output.graph.paths.length,2);assert.equal(output.graph.edges.length,output.graph.nodes.length);
 const faithful=compileSharedSourceRoute({...request,connectorCornerMode:'reroutable-elbow'});
 assert.deepEqual(compileSharedSourceRoute(request),faithful);
 assert.equal(faithful.graph.paths.length,2);assert.ok(faithful.parts.length<=40);
 assert.ok(faithful.parts.filter(p=>p.type==='line').every(p=>p.source.nativeConnectorRoute===true));
 assert.deepEqual(f.image.rgba,before);assert.ok(result.fit.workChecks<=4000000);
});
