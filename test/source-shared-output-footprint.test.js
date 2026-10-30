'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const {sourceSharedNetworkFixture,networkRelations}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute,sharedSourceCurveFootprint:coverage}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
function fixture(){const f=sourceSharedNetworkFixture(),m=measureSharedSourceRoute(f);assert.ok(m.fit,m.reason);return {...f,fit:m.fit};}
function rows(f){return f.fit.edges.map(e=>({widthPx:e.widthPx,curves:e.points.slice(1).map((p,i)=>[{...e.points[i]},{...p}])}));}
function compiler(kind,legacy=false){
 const filename=path.resolve(__dirname,'../packages/slideclone-core/routing/source-shared-route-compiler.js'),instance=new Module(filename,module),local=Module.createRequire(filename);
 instance.filename=filename;instance.paths=Module._nodeModulePaths(path.dirname(filename));instance.require=id=>{
  const original=local(id);
  if(legacy&&id==='./source-shared-route-output'){
   const target=local.resolve(id),facade=new Module(target,module),relative=Module.createRequire(target);facade.filename=target;facade.paths=Module._nodeModulePaths(path.dirname(target));
   facade.require=name=>name==='./source-shared-output-footprint'?{assertSharedOutputFootprint(){}}:relative(name);
   facade._compile(fs.readFileSync(target,'utf8'),target);return facade.exports;
  }
  if(kind==='freeform'&&id==='./source-route-polyline')return {...original,sourceRoutePolyline(input){const result=original.sourceRoutePolyline(input);if(result)result.box.x+=25;return result;}};
  if(kind==='freeform'&&id==='./source-shared-route-curves')return {...original,compileSharedSourceCurves(input){const result=original.compileSharedSourceCurves(input);for(const row of result.values())row.box.x+=25;return result;}};
  if(kind==='connector'&&id==='./source-route-native-chain')return {...original,fitNativeSourceRouteChain(input){const result=original.fitNativeSourceRouteChain(input);
   for(const piece of result.pieces)piece.connector.connectorFrame.x+=25;return result;}};
  return original;
 };
 instance._compile(fs.readFileSync(filename,'utf8'),filename);return instance.exports;
}
function compile(api,f,mode){return api.compileSharedSourceRoute({fit:f.fit,image:f.image,relations:networkRelations,id:'footprint-network',sourceHash:'a'.repeat(64),
 slideSize:{widthPt:300,heightPt:230},connectorCornerMode:mode});}
test('actual generated freeform and connector drift is rejected before either private output registry',()=>{
 for(const [kind,mode]of [['freeform','auto'],['connector','reroutable-elbow']]){
  const f=fixture(),legacy=compiler(kind,true),before=Buffer.from(f.image.rgba),result=compile(legacy,f,mode);
  // Independent pre-fix witness: unchanged source samples/topology/metadata
  // allowed actual geometry drift to acquire the complete original paint.
  const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box})),...result.parts];
  assert.equal(legacy.measuredSharedSceneRoutePaintGroups(f.image,shapes,{checks:0}).length,1);
  assert.throws(()=>compile(compiler(kind),f,mode),/output footprint/u);assert.deepEqual(f.image.rgba,before);
 }
});
test('live complete-source coverage keeps every physical edge and never mints source/output credentials',()=>{
 const f=fixture(),before=Buffer.from(f.image.rgba),r=rows(f),work={checks:f.fit.workChecks};
 assert.equal(coverage(f.fit,f.image,r,work),true);assert.ok(work.checks>f.fit.workChecks);assert.deepEqual(f.image.rgba,before);
 assert.equal(coverage(structuredClone(f.fit),f.image,r,{checks:0}),false);
 assert.equal(coverage(f.fit,{...f.image,rgba:Buffer.from(f.image.rgba)},r,{checks:0}),false);
 assert.equal(coverage(f.fit,f.image,r.slice(1),{checks:0}),false);
 const shifted=structuredClone(r);for(const row of shifted)for(const curve of row.curves)for(const p of curve)p.x+=25;
 assert.equal(coverage(f.fit,f.image,shifted,{checks:0}),false);
 // Public rows cannot replace the private complete-ink roster with a subset.
 for(const row of shifted)row.sourceCells=[];
 assert.equal(coverage(f.fit,f.image,shifted,{checks:0}),false);
 const subset=structuredClone(f.fit);subset.shaftCells=[];assert.equal(coverage(subset,f.image,r,{checks:0}),false);
 const forged=structuredClone(f.fit);forged.workChecks=0;assert.equal(coverage(forged,f.image,r,{checks:0}),false);
 f.image.rgba[0]^=1;assert.equal(coverage(f.fit,f.image,r,{checks:0}),false);
});
test('private footprint boundary rejects getters, proxies, empty, invalid, nonfinite and excessive output geometry',()=>{
 const f=fixture();let calls=0;
 const getter={get x(){calls++;throw Error('private');},y:0},proxy=new Proxy([],{get(){calls++;throw Error('private');}});
 for(const mutate of [r=>r[0].curves=[],r=>r[0].widthPx=0,r=>r[0].widthPx=Infinity,r=>r[0].curves[0].push({x:0,y:0}),
  r=>r[0].curves=Array(121).fill([]),r=>r[0].curves[0][0]={x:NaN,y:0},r=>r[0].curves[0][0]=getter,r=>r[0].curves=proxy,
  r=>Object.defineProperty(r[0],'widthPx',{get(){calls++;throw Error('private');}}),r=>delete r[0].curves[0][0]]){
  const r=rows(f);mutate(r);assert.equal(coverage(f.fit,f.image,r,{checks:0}),false);
 }
 assert.equal(coverage(f.fit,f.image,proxy,{checks:0}),false);assert.equal(calls,0);
 assert.throws(()=>coverage(f.fit,f.image,rows(f),{checks:-1}),TypeError);
 const work={checks:3999999};assert.equal(coverage(f.fit,f.image,rows(f),work),false);assert.equal(work.checks,4000001);
});
test('default and native-path output still bind complete unchanged graphs after actual footprint inspection',()=>{
 const f=fixture(),api=compiler('control');
 for(const mode of ['auto','rounded-freeform','reroutable-elbow']){
  const result=compile(api,f,mode);assert.equal(result.graph.paths.length,networkRelations.length);
  const shapes=[...f.nodes.map(n=>({id:n.id,type:'rect',box:n.box})),...result.parts];
  assert.equal(api.measuredSharedSceneRoutePaintGroups(f.image,shapes,{checks:0}).length,1);
  assert.deepEqual(api.measuredSharedSceneRoutePaintGroups(f.image,structuredClone(shapes),{checks:0}),[]);
 }
});
test('actual footprint regressions enter both unified CI discovery suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-output-footprint.test.js'));
});
