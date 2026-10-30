'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedOutputFixture}=require('./helpers/source-shared-output.cjs');
const {hasSharedSourceRoute,sharedSourcePaintCells}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute,measuredSharedSceneRoutePaintGroups:read}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
const {createSharedRouteOutputPaintRegistry}=require('../packages/slideclone-core/routing/source-shared-route-output-paint');
const {replaceMeasuredSceneConnectors}=require('../packages/slideclone-core/scene-plan/source-scene-replaced-connectors');
function request(f){return {fit:f.fit,image:f.image,relations:f.nodes.slice(1).map((node,i)=>({id:'relation-'+i,regionId:'root',
 fromId:f.nodes[0].endpointId,toId:node.endpointId,direction:'forward'})),id:'shared-identity',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}};}

test('shared source proofs bind immutable source bytes including shaft, head, endpoint and exterior pixels',()=>{
 for(const [name,x,y,channel]of [['shaft',150,80,0],['head',50,168,2],['endpoint',140,30,1],['exterior',1,1,3]]){
  const f=sourceSharedOutputFixture(),at=(y*f.image.width+x)*4+channel,original=f.image.rgba[at];
  assert.equal(hasSharedSourceRoute(f.fit,f.image),true);assert.equal(read(f.image,f.shapes,{checks:0}).length,1);
  f.image.rgba[at]=original^1;
  assert.equal(hasSharedSourceRoute(f.fit,f.image),false,name);
  assert.equal(sharedSourcePaintCells(f.fit,f.image,{checks:0}),null,name);
  assert.deepEqual(read(f.image,f.shapes,{checks:0}),[],name);
  assert.throws(()=>compileSharedSourceRoute(request(f)),/source proof/,name);
  const registry=createSharedRouteOutputPaintRegistry();
  assert.throws(()=>registry.capture({fit:f.fit,image:f.image,parts:f.built.parts,slideSize:request(f).slideSize,work:{checks:0}}),/paint output/,name);
  f.image.rgba[at]=original;
  assert.equal(hasSharedSourceRoute(f.fit,f.image),true,name);
  assert.equal(read(f.image,f.shapes,{checks:0}).length,1,name);
 }
});

test('alias writes cannot reuse a shared source receipt to retire earlier relationship paint',()=>{
 const f=sourceSharedOutputFixture(),old=structuredClone(f.built.parts.find(p=>p.style.endArrow));old.id='prior-arrow';
 delete old.style.startAnchor;delete old.style.endAnchor;
 const points=old.source.nativeRoutePoints;
 if(points?.length>2){const a=points.at(-2),b=points.at(-1);old.box={x:a.x,y:a.y,w:b.x-a.x,h:b.y-a.y};
  for(const key of ['connectorType','connectorFrame','connectorAdjustments'])delete old.style[key];delete old.source.nativeRoutePoints;}
 f.shapes.push(old);const before=f.shapes.slice(),pixels=Buffer.from(f.image.rgba);
 const alias=new Uint8Array(f.image.rgba.buffer,f.image.rgba.byteOffset,f.image.rgba.byteLength);
 alias[(80*f.image.width+150)*4]^=1;
 const result=replaceMeasuredSceneConnectors({image:f.image,slideSize:request(f).slideSize,shapes:f.shapes,previous:[old],protectedMembers:new Set()});
 assert.deepEqual(result.removed,[]);assert.deepEqual(f.shapes,before);
 assert.equal(sharedSourcePaintCells(f.fit,f.image,{checks:0}),null);
 pixels.copy(f.image.rgba);assert.equal(sharedSourcePaintCells(f.fit,f.image,{checks:0}).size>0,true);
 const restored=replaceMeasuredSceneConnectors({image:f.image,slideSize:request(f).slideSize,shapes:f.shapes,previous:[old],protectedMembers:new Set()});
 assert.equal(restored.removed.length,1,'the same actual old line is removable with the original source');
});

test('source identity checks preserve a complete cycle and its bound paths while rejecting mutated network paint',()=>{
 const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
 const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
 const f=sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const input={...request({...f,fit:measured.fit}),relations:networkRelations};
 const first=compileSharedSourceRoute(input),original=Buffer.from(f.image.rgba);
 assert.equal(measured.fit.cycleCount,1);assert.equal(first.graph.paths.length,2);
 f.image.rgba[0]^=1;
 assert.throws(()=>compileSharedSourceRoute(input),/source proof/);
 assert.equal(sharedSourcePaintCells(measured.fit,f.image,{checks:0}),null);
 original.copy(f.image.rgba);
 const next=compileSharedSourceRoute(input);assert.deepEqual(next,first);
 assert.equal(next.graph.edges.length,next.graph.nodes.length);
 assert.deepEqual(f.image.rgba,original);
});

test('shared identity rejects invalid dimensions, copied pixels and untrusted image controls without coercion',()=>{
 const f=sourceSharedOutputFixture();let calls=0;
 const hostile=()=>{calls++;throw Error('private-content');};
 const getter={};Object.defineProperty(getter,'rgba',{get:hostile,enumerable:true});
 const proxy=new Proxy({},{get:hostile,ownKeys:hostile,getPrototypeOf:hostile});
 for(const image of [null,{},getter,proxy,{...f.image,width:'300'},{...f.image,width:301},{...f.image,height:231},
  {...f.image,rgba:Buffer.from(f.image.rgba)},{...f.image,rgba:proxy}]){
  assert.equal(hasSharedSourceRoute(f.fit,image),false);
  assert.equal(sharedSourcePaintCells(f.fit,image,{checks:0}),null);
 }
 for(const fit of [null,{},proxy,structuredClone(f.fit)])assert.equal(hasSharedSourceRoute(fit,f.image),false);
 assert.equal(calls,0);assert.equal(hasSharedSourceRoute(f.fit,{...f.image}),true);
});

test('shared identity hashing uses bounded canonical bytes without reading typed-array accessors',()=>{
 const f=sourceSharedOutputFixture();let calls=0;
 for(const key of ['length','byteLength','byteOffset','buffer'])Object.defineProperty(f.image.rgba,key,{get(){calls++;throw Error('private-content');}});
 assert.equal(hasSharedSourceRoute(f.fit,f.image),true);
 assert.ok(sharedSourcePaintCells(f.fit,f.image,{checks:0}).size>0);
 assert.equal(calls,0);
});

test('shared source identity regressions enter unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-shared-route-source-identity.test.js'));
});
