'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedNetworkFixture,sourceCurvedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {compileSharedSourceRoute,measuredSharedSceneRoutePaintGroups}=require('../packages/slideclone-core/routing/source-shared-route-compiler');
function compile(f,fit,mode){
 const relations=networkRelations.map((r,i)=>({...r,...(f.curved&&i===0?{shaftBox:{x:140,y:99,w:4,h:4}}:{})}));
 return compileSharedSourceRoute({fit,image:f.image,relations,id:'chain-network',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230},connectorCornerMode:mode});
}
test('cyclic reroutable output uses a continuous native chain, retains every source arm and private paint identity',()=>{
 for(const fixture of [sourceSharedNetworkFixture]){
  const f=fixture();f.curved=fixture===sourceCurvedNetworkFixture;
  const before=Buffer.from(f.image.rgba),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
  const result=compile(f,measured.fit,'reroutable-elbow'),lines=result.parts.filter(p=>p.type==='line');
  assert.ok(lines.length);assert.ok(lines.every(p=>p.source.nativeConnectorRoute===true));
  assert.equal(result.graph.paths.length,networkRelations.length);assert.equal(result.graph.topology,'source-network-v1');
  for(const p of result.graph.paths){assert.ok(p.edges.length<=15);let last;
   for(const ref of p.edges){const edge=result.graph.edges.find(e=>e.id===ref.id);assert.ok(edge);
    const from=ref.reversed?edge.to:edge.from,to=ref.reversed?edge.from:edge.to;if(last)assert.equal(from,last);last=to;
   }
  }
  const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box,source:{sceneInventoryId:n.endpointId}})),...result.parts];
  assert.equal(measuredSharedSceneRoutePaintGroups(f.image,shapes,{checks:0}).length,1);
  assert.deepEqual(measuredSharedSceneRoutePaintGroups(f.image,structuredClone(shapes),{checks:0}),[]);
  assert.deepEqual(f.image.rgba,before);assert.throws(()=>compile(f,structuredClone(measured.fit),'reroutable-elbow'),/proof/u);
  assert.deepEqual(compile(f,measured.fit,'auto'),compile(f,measured.fit,'auto'));
 }
});
test('faithful curved native chains now retain their actual source identity anchor',()=>{
 const f=sourceCurvedNetworkFixture();f.curved=true;const measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const result=compile(f,measured.fit,'reroutable-elbow');assert.equal(result.graph.paths.length,2);
 const points=result.pathPoints.get(networkRelations[0].id);assert.ok(points&&points.length>1);
 const anchor={x:140,y:99,w:4,h:4};let crosses=false;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)*8));
  for(let k=0;k<=steps;k++){const x=a.x+(b.x-a.x)*k/steps,y=a.y+(b.y-a.y)*k/steps;if(x>=anchor.x&&x<=anchor.x+anchor.w&&y>=anchor.y&&y<=anchor.y+anchor.h)crosses=true;}
 }
 assert.equal(crosses,true);
});

test('Worker and unconfigured core defaults retain native bound chains when the curve candidate is unavailable',()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const {workerSettings}=require('../packages/remote-mcp-server/bin/common-tools-team-image-worker');
 const mode=workerSettings({OPENXML_BUILDER_EXE:process.execPath}).connectorCornerMode;
 assert.equal(mode,'reroutable-elbow');
 const filename=path.resolve(__dirname,'../packages/slideclone-core/routing/source-shared-route-compiler.js');
 const isolated=new Module(filename,module),local=Module.createRequire(filename);let curveCalls=0;
 isolated.filename=filename;isolated.paths=Module._nodeModulePaths(path.dirname(filename));
 isolated.require=id=>id==='./source-shared-route-curves'
  ?{compileSharedSourceCurves(){curveCalls++;throw new Error('curve candidate unavailable');}}:local(id);
 isolated._compile(fs.readFileSync(filename,'utf8'),filename);
 const f=sourceSharedNetworkFixture(),measured=measureSharedSourceRoute(f);assert.ok(measured.fit,measured.reason);
 const request={fit:measured.fit,image:f.image,relations:networkRelations,
  id:'chain-network',sourceHash:'a'.repeat(64),slideSize:{widthPt:300,heightPt:230}};
 const expected=compile(f,measured.fit,mode);
 for(const controls of [{},{connectorCornerMode:undefined},{connectorCornerMode:mode}]){
  const actual=isolated.exports.compileSharedSourceRoute({...request,...controls});
  assert.equal(curveCalls,0);assert.deepEqual(actual,expected);
 }
 const result=expected;
 const ids=new Set([...f.nodes.map(n=>n.id),...result.parts.map(p=>p.id)]);
 assert.equal(result.graph.paths.length,networkRelations.length);
 for(const edge of result.graph.edges){
  const part=result.parts.find(p=>p.id===edge.memberId);assert.ok(part);
  assert.equal(part.type,'line');assert.equal(part.source.nativeConnectorRoute,true);
  assert.equal(part.style.freeformPath,undefined);
  for(const end of ['startAnchor','endAnchor'])assert.ok(ids.has(part.style[end]?.elementId));
 }
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-shared-native-chain.test.js'));
});
