'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoundedRouteFixture}=require('./helpers/source-rounded-route.cjs');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {compileExistingSceneRoutes:single}=require('../packages/slideclone-core/scene-plan/source-scene-route-stage');
const {compileSharedSceneRoutes:shared}=require('../packages/slideclone-core/scene-plan/source-scene-shared-route-stage');
const {compileSceneRelationFallbacks:fallback}=require('../packages/slideclone-core/scene-plan/source-scene-relation-fallbacks');

function request(f,nodes,relations){
 return {image:f.image,budget:f.budget,textMasks:[],slideSize:{widthPt:f.image.width,heightPt:f.image.height},
  plan:{sourceHash:'a'.repeat(64),relationObservationUnit:'logical-relations-v1',
   regions:[{id:'root',parentId:null,kind:'section',box:{x:0,y:0,w:f.image.width,h:f.image.height}}],
   objects:nodes.map(n=>({id:n.endpointId??n.id,kind:'container',regionId:'root',box:n.box})),relations},
  nodes:new Map(nodes.map(n=>[n.endpointId??n.id,n])),
  shapes:nodes.map(n=>({id:n.id,type:'rect',box:n.box,source:{sceneInventoryId:n.endpointId??n.id}})),
  images:[],existing:new Map(),endpoints:[],unresolved:relations.map(r=>({id:r.id,reason:'relation-source-evidence'}))};
}
function singleRequest(options={}){
 const f=sourceRoundedRouteFixture(options);
 return request(f,[f.from,f.to],[{id:'edge',regionId:'root',fromId:f.from.id,toId:f.to.id,direction:'forward',shaftBox:f.shaftBox}]);
}
function sharedRequest(){
 const f=sourceSharedTreeFixture();
 const relations=['left','right'].map(side=>({id:'edge-'+side,regionId:'root',fromId:'region-source',toId:'object-'+side,
  direction:'forward',shaftBox:f.window}));
 return request(f,f.nodes,relations);
}
function nativeParts(result){
 const lines=result.parts.filter(p=>p.source?.nativeComponentRole==='relationship');assert.ok(lines.length);
 assert.ok(lines.every(p=>p.type==='line'&&!p.style.freeformPath));
 for(const line of lines)if(line.source.routeSegmentIndex===undefined)assert.equal(line.source.nativeConnectorRoute,true);
 const ids=new Set(result.parts.map(p=>p.id));
 for(const line of lines)for(const end of ['startAnchor','endAnchor']){
  const id=line.style[end]?.elementId;assert.equal(typeof id,'string');
  assert.ok(ids.has(id)||['a','b','native-source','native-left','native-right'].includes(id));
 }
}

test('direct single-route and relation-fallback stages default to native bound connectors',()=>{
 for(const compile of [single,fallback])for(const options of [{},{gradient:true},{gradient:true,reverse:true},{gradient:'path'}]){
  const expected=compile({...singleRequest(options),connectorCornerMode:'reroutable-elbow'});nativeParts(expected);
  for(const controls of [{},{connectorCornerMode:undefined}]){
   const input=singleRequest(options),pixels=Buffer.from(input.image.rgba),used=input.budget.used;
   const out=compile({...input,...controls});assert.deepEqual(out,expected);nativeParts(out);
   assert.deepEqual(input.image.rgba,pixels);assert.ok(input.budget.used>=used&&input.budget.used<=4000000);
  }
 }
});

test('direct shared-route stage normalizes the mode before calling the complete compiler',()=>{
 const fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
 const filename=path.resolve(__dirname,'../packages/slideclone-core/scene-plan/source-scene-shared-route-stage.js');
 const local=Module.createRequire(filename),isolated=new Module(filename,module),received=[];
 isolated.filename=filename;isolated.paths=Module._nodeModulePaths(path.dirname(filename));
 isolated.require=id=>id==='../routing/source-shared-route-compiler'
  ?{compileSharedSourceRoute(input){received.push({mode:input.connectorCornerMode,wholeRelations:input.wholeRelations});return local(id).compileSharedSourceRoute(input);}}:local(id);
 isolated._compile(fs.readFileSync(filename,'utf8'),filename);
 const expected=shared({...sharedRequest(),connectorCornerMode:'reroutable-elbow'});nativeParts(expected);
 assert.equal(expected.graphs.length,1);assert.equal(expected.graphs[0].paths.length,2);assert.equal(expected.rejected.length,0);
 for(const controls of [{},{connectorCornerMode:undefined}]){
  const input=sharedRequest(),pixels=Buffer.from(input.image.rgba),out=isolated.exports.compileSharedSceneRoutes({...input,...controls});
  assert.deepEqual(out,expected);nativeParts(out);assert.deepEqual(input.image.rgba,pixels);
 }
 assert.deepEqual(received,Array.from({length:2},()=>({mode:'reroutable-elbow',wholeRelations:true})));
});

test('direct shared-route stage preserves one whole native object per logical relation in every mode',()=>{
 for(const mode of [undefined,'auto','rounded-freeform','reroutable-elbow']){
  const input=sharedRequest(),before=Buffer.from(input.image.rgba);
  const out=shared({...input,connectorCornerMode:mode});
  assert.equal(out.rejected.length,0);assert.equal(out.pending.size,0);
  assert.equal(out.wholeResolved.size,input.plan.relations.length);
  assert.equal(out.parts.length,input.plan.relations.length);
  for(const relation of input.plan.relations){
   const members=out.resolved.get(relation.id);assert.ok(members);assert.equal(members.length,1);
   assert.equal(out.wholeResolved.has(relation.id),true);
   const parts=out.parts.filter(part=>part.id===members[0]);assert.equal(parts.length,1);
   assert.ok(['line','freeform'].includes(parts[0].type));
   assert.equal(parts[0].source.sourceRouteParts,1);
   assert.notEqual(parts[0].source.routeControl,true);
  }
  assert.deepEqual(input.image.rgba,before);assert.ok(input.budget.used<=4000000);
 }
});

test('explicit visual modes remain available through both direct stage entrypoints',()=>{
 for(const mode of ['auto','rounded-freeform']){
  const out=single({...singleRequest(),connectorCornerMode:mode});assert.equal(out.resolved.size,1);
  assert.ok(out.parts.some(p=>p.type==='freeform'));assert.ok(out.parts.every(p=>p.source.connectorCornerMode==='rounded-freeform'));
 }
 const out=shared({...sharedRequest(),connectorCornerMode:'rounded-freeform'});
 assert.equal(out.graphs.length,1);assert.equal(out.graphs[0].paths.length,2);assert.ok(out.parts.some(p=>p.type==='freeform'));
});

test('invalid mode is rejected before empty input, source scanning or hostile mode coercion',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-mode-content');};
 const hostile=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const compile of [single,shared])for(const value of [null,'',1,'AUTO','x'.repeat(100000),{},[],hostile]){
  const input=compile===single?singleRequest():sharedRequest();input.plan.relations=[];
  const before=Buffer.from(input.image.rgba),used=input.budget.used;
  assert.throws(()=>compile({...input,connectorCornerMode:value}),{name:'TypeError',message:'Connector corner mode is invalid'});
  assert.equal(input.budget.used,used);assert.deepEqual(input.image.rgba,before);
 }
 assert.equal(calls,0);
});

test('empty and unmeasured stages retain unresolved source failures without inventing connectors',()=>{
 for(const compile of [single,shared]){
  const empty=compile===single?singleRequest():sharedRequest();empty.plan.relations=[];
  assert.deepEqual(compile(empty).parts,[]);
  const input=compile===single?singleRequest():sharedRequest();input.nodes=new Map();
  const out=compile(input);assert.deepEqual(out.parts,[]);
  if(compile===single)assert.deepEqual(out.unresolved,input.unresolved);
  else assert.ok(out.rejected.some(r=>r.reason==='shared-native-endpoint'));
 }
});

test('stage default regressions are discovered by unified unit and all CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-scene-route-stage-defaults.test.js'));
});
