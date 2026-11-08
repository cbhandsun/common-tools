'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRoundedRouteFixture}=require('./helpers/source-rounded-route.cjs');
const {sourceFilledFringeFixture}=require('./helpers/source-filled-fringe.cjs');
const {measureSourceSceneRoute,isMeasuredSourceRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route');
const {compileSourceSceneRoute}=require('../packages/slideclone-core/scene-plan/source-scene-route-compiler');
const {compileFilledSourceRoute}=require('../packages/slideclone-core/routing/source-filled-route-compiler');
function measured(factory=sourceRoundedRouteFixture){
 const f=factory(),result=measureSourceSceneRoute(f);assert.ok(result.fit,result.reason);
 const request={fit:result.fit,relation:{id:'identity',regionId:'root',fromId:'a',toId:'b',direction:f.direction},
  fromId:f.from.id,toId:f.to.id,direction:f.direction,widthPx:f.image.width,heightPx:f.image.height,slideSize:{widthPt:240,heightPt:180}};
 return {...f,fit:result.fit,request};
}

test('single-route proofs reject changed shaft, arrow, node and exterior bytes in every writer mode',()=>{
 for(const factory of [sourceRoundedRouteFixture,()=>sourceRoundedRouteFixture({gradient:true}),()=>sourceRoundedRouteFixture({gradient:'path'}),sourceFilledFringeFixture]){
  const f=measured(factory),modes=['auto','rounded-freeform','reroutable-elbow'];
  const original=modes.map(connectorCornerMode=>compileSourceSceneRoute({...f.request,connectorCornerMode}));
  for(const [name,x,y,channel]of [['shaft',50,80,0],['arrow',175,114,1],['node',40,30,2],['exterior',1,1,3]]){
   const index=(y*f.image.width+x)*4+channel,value=f.image.rgba[index];
   assert.equal(isMeasuredSourceRoute(f.fit,f.request),true,name);
   f.image.rgba[index]=value^1;
   assert.equal(isMeasuredSourceRoute(f.fit,f.request),false,name);
   for(const connectorCornerMode of modes)assert.throws(()=>compileSourceSceneRoute({...f.request,connectorCornerMode}),/proof/,name);
   if(f.fit.filledBody)assert.throws(()=>compileFilledSourceRoute(f.request),/proof/,name);
   f.image.rgba[index]=value;
   assert.equal(isMeasuredSourceRoute(f.fit,f.request),true,name);
   assert.deepEqual(modes.map(connectorCornerMode=>compileSourceSceneRoute({...f.request,connectorCornerMode})),original,name);
  }
 }
});

test('a write through a source alias invalidates a filled footprint without losing its pale fringe',()=>{
 const f=measured(sourceFilledFringeFixture);assert.ok(f.fit.filledBody);
 const source=Buffer.from(f.image.rgba),parts=compileFilledSourceRoute(f.request),budget=f.budget.used;
 const alias=new Uint8Array(f.image.rgba.buffer,f.image.rgba.byteOffset,f.image.rgba.byteLength);
 alias[(50*f.image.width+46)*4]^=1;
 assert.equal(isMeasuredSourceRoute(f.fit,f.request),false);
 assert.throws(()=>compileSourceSceneRoute(f.request),/proof/);
 assert.throws(()=>compileFilledSourceRoute(f.request),/proof/);
 source.copy(f.image.rgba);
 assert.deepEqual(compileFilledSourceRoute(f.request),parts);
 assert.equal(parts.filter(p=>p.type==='freeform').length,2);
 assert.equal(parts.filter(p=>p.type==='line').length,2);
 assert.equal(f.budget.used,budget);assert.deepEqual(f.image.rgba,source);
});

test('proof readers reject copied capabilities and hostile or mismatched controls without executing accessors',()=>{
 const f=measured();let calls=0;const hostile=()=>{calls++;throw Error('private-content');};
 const proxy=new Proxy({},{get:hostile,ownKeys:hostile,getPrototypeOf:hostile});
 const getter={...f.request};Object.defineProperty(getter,'fromId',{get:hostile,enumerable:true});
 for(const fit of [null,{},proxy,structuredClone(f.fit)])assert.equal(isMeasuredSourceRoute(fit,f.request),false);
 for(const controls of [null,{},proxy,getter,{...f.request,fromId:'other'},{...f.request,toId:''},
  {...f.request,direction:'backward'},{...f.request,widthPx:'240'},{...f.request,heightPx:181},
  {...f.request,widthPx:NaN},{...f.request,heightPx:Infinity}])assert.equal(isMeasuredSourceRoute(f.fit,controls),false);
 assert.equal(calls,0);assert.equal(isMeasuredSourceRoute(f.fit,f.request),true);
});

test('identity hashing uses canonical bytes and ignores custom typed-array properties',()=>{
 const f=measured();let calls=0;
 for(const key of ['length','byteLength','byteOffset','buffer','toString','valueOf'])Object.defineProperty(f.image.rgba,key,{get(){calls++;throw Error('private-content');}});
 assert.equal(isMeasuredSourceRoute(f.fit,f.request),true);
 assert.ok(compileSourceSceneRoute(f.request).length>0);
 f.image.rgba[0]^=1;assert.equal(isMeasuredSourceRoute(f.fit,f.request),false);
 assert.throws(()=>compileSourceSceneRoute(f.request),/proof/);
 assert.equal(calls,0);
});

test('a detached source buffer cannot retain an admitted single-route proof',()=>{
 for(const factory of [sourceRoundedRouteFixture,sourceFilledFringeFixture]){
  const f=measured(factory);assert.equal(isMeasuredSourceRoute(f.fit,f.request),true);
  const buffer=f.image.rgba.buffer;structuredClone(buffer,{transfer:[buffer]});
  assert.equal(buffer.byteLength,0);
  assert.equal(isMeasuredSourceRoute(f.fit,f.request),false);
  assert.throws(()=>compileSourceSceneRoute(f.request),/proof/);
  if(f.fit.filledBody)assert.throws(()=>compileFilledSourceRoute(f.request),/proof/);
 }
});

test('the source identity hashes exactly the admitted image view including its nonzero byte offset',()=>{
 const f=measured(()=>{
  const row=sourceRoundedRouteFixture(),original=row.image.rgba,storage=Buffer.alloc(original.length+32,127);
  row.image.rgba=storage.subarray(16,16+original.length);original.copy(row.image.rgba);
  const cache=require('../packages/slideclone-core/scene-plan/source-scene-measurement-cache').createSceneMeasurementCache(row.image,[],row.budget);
  for(const node of [row.from,row.to]){assert.ok(cache.fill(node.box));node.portFrame=cache.portFrame(node.box);}
  return row;
 });
 const view=f.image.rgba,alias=new Uint8Array(view.buffer),before=compileSourceSceneRoute(f.request);
 alias[view.byteOffset-1]^=1;alias[view.byteOffset+view.byteLength]^=1;
 assert.equal(isMeasuredSourceRoute(f.fit,f.request),true);assert.deepEqual(compileSourceSceneRoute(f.request),before);
 alias[view.byteOffset]^=1;
 assert.equal(isMeasuredSourceRoute(f.fit,f.request),false);assert.throws(()=>compileSourceSceneRoute(f.request),/proof/);
 alias[view.byteOffset]^=1;assert.deepEqual(compileSourceSceneRoute(f.request),before);
});

test('single-route identity regressions enter the unified unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(row=>row.file.replaceAll('\\','/')==='test/source-scene-route-source-identity.test.js'));
});
