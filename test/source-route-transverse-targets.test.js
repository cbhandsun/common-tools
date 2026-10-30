'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteTransverseTargets:observe}=require('../packages/slideclone-core/routing/source-route-transverse-targets');
const {sharedSourceRouteTransverseTargets:read}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
const {transverseFixture}=require('./helpers/source-transverse.cjs');
function result(f,work={checks:0}){return observe(f.fit,f.source,work)[0];}

test('original opaque single-paint first moments produce exact targets and retain every endpoint/contact sample',()=>{
 for(const reverse of [false,true]){
  const f=transverseFixture();if(reverse)f.fit.edges[0].path.reverse();
  const pixels=Buffer.from(f.source.pixels),path=structuredClone(f.fit),work={checks:0},row=result(f,work);
  assert.equal(row.samples,60);assert.equal(row.sections.length,60);assert.equal(row.targets.length,36);
  for(const t of row.targets){assert.equal(Math.abs(t.dx),0);assert.ok(Math.abs(t.dy-.25)<1e-12);assert.ok(t.index>=12&&t.index<48);}
  assert.equal(row.sections.filter(s=>s.flags.includes('endpoint-or-contact')).length,24);
  assert.deepEqual(f.source.pixels,new Uint8Array(pixels));assert.deepEqual(f.fit,path);assert.ok(work.checks>0);
  assert.equal(Object.hasOwn(row,'sourceAuthority'),false);
 }
});

test('another arm and a nonlocal part of the same edge cannot provide a clean section target',()=>{
 const f=transverseFixture();f.fit.edges.push({nativePolyline:false,path:[{x:50,y:45}]});
 const row=result(f);assert.ok(row.sections.find(s=>s.index===30).flags.includes('near-other-path-parts'));
 assert.ok(!row.targets.some(t=>t.index===30));assert.equal(row.sections.length,60);
 const other=observe(f.fit,f.source,{checks:0})[1];assert.equal(other.eligible,false);assert.deepEqual(other.targets,[]);
 const g=transverseFixture();g.fit.edges[0].path.push({x:50,y:45});
 assert.ok(result(g).sections.find(s=>s.index===30).flags.includes('near-other-path-parts'));
});

test('transparent, mixed, weak, flank-contaminated and multiple-paint sections retain their rejection flags',()=>{
 for(const [name,change,expected]of [
  ['transparent',f=>f.pixel(50,40,[40,80,120],239),'nonopaque'],
  ['weak',f=>{for(let y=28;y<=52;y++)f.pixel(50,y,[240,240,240]);f.pixel(50,40,[230,230,230]);},'low-contrast'],
  ['flank',f=>f.pixel(50,28,[100,100,100]),'flank-disagreement'],
  ['mixed',f=>f.pixel(50,44,[220,90,220]),'mixed-transverse-paint'],
  ['multiple',f=>f.pixel(50,46,[140,160,180]),'multiple-or-missing-runs'],
  ['channel',f=>f.pixel(50,42,[240,240,120]),'channel-center-disagreement']
 ]){
  const f=transverseFixture();change(f);const row=result(f),s=row.sections.find(s=>s.index===30);
  assert.ok(s.flags.includes(expected),name);assert.ok(!row.targets.some(t=>t.index===30),name);assert.equal(row.sections.length,60);
 }
});

test('source-image boundaries are classified without extrapolation and zero eligible edges return no targets',()=>{
 const f=transverseFixture();f.fit.edges[0].path=f.fit.edges[0].path.map(p=>({...p,y:5}));
 const row=result(f);assert.equal(row.targets.length,0);assert.equal(row.sections.filter(s=>s.flags.includes('section-out-of-bounds')).length,36);
 f.fit.edges[0].nativePolyline=false;assert.deepEqual(result(f).sections,[]);assert.deepEqual(observe({...f.fit,edges:[]},f.source,{checks:0}),[]);
});

test('source sections use the same geometry ledger and cannot publish a prefix after exhaustion',()=>{
 const f=transverseFixture(),work={checks:0};observe(f.fit,f.source,work);const cost=work.checks;
 const exact={checks:4000000-cost};observe(f.fit,f.source,exact);assert.equal(exact.checks,4000000);
 const short={checks:4000001-cost};assert.throws(()=>observe(f.fit,f.source,short),/shared-geometry-budget/u);assert.equal(short.checks,4000001);
 for(const work of [{checks:NaN},{checks:-1},Object.freeze({checks:0}),{checks:4000001}])assert.throws(()=>observe(f.fit,f.source,work),TypeError);
});

test('fused source passes preserve every original observation and rejection in the frozen RGB corpus',()=>{
 const crypto=require('node:crypto'),{transverseCorpus}=require('./helpers/source-transverse.cjs');
 const expected=require('./fixtures/source-transverse-original-contract.json');
 for(const [index,f]of transverseCorpus().entries()){
  const work={checks:0},rows=observe(f.fit,f.source,work),row=expected[index];
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex'),row.sha256,'case '+index);
  assert.equal(rows.reduce((sum,r)=>sum+r.targets.length,0),row.targets);
  assert.ok(work.checks<row.checks,'fused traversals reserve less work in case '+index);
 }
});

test('only a live source-bound fit can request observations; copies, mutations and hostile controls cannot acquire them',()=>{
 const {sourceSharedOutputFixture}=require('./helpers/source-shared-output.cjs'),f=sourceSharedOutputFixture(),pixels=Buffer.from(f.image.rgba);
 const rows=read(f.fit,f.image,{checks:0});assert.equal(rows.length,f.fit.edges.length);
 assert.deepEqual(read(f.fit,f.image,{checks:0}),rows);assert.deepEqual(f.image.rgba,pixels);
 let calls=0;const hostile=()=>{calls++;throw Error('private');},proxy=new Proxy({},{get:hostile,ownKeys:hostile,getPrototypeOf:hostile}),getter={};
 Object.defineProperty(getter,'rgba',{get:hostile});
 for(const fit of [null,{},proxy,structuredClone(f.fit)])assert.throws(()=>read(fit,f.image,{checks:0}),/source proof/u);
 for(const image of [null,{},proxy,getter,{...f.image,rgba:Buffer.from(f.image.rgba)}])assert.throws(()=>read(f.fit,image,{checks:0}),/source proof/u);
 f.image.rgba[0]^=1;assert.throws(()=>read(f.fit,f.image,{checks:0}),/source proof/u);pixels.copy(f.image.rgba);
 assert.throws(()=>read(f.fit,f.image,Object.freeze({checks:0})),TypeError);assert.equal(calls,0);
});

test('detached observations cannot mutate source fit or pixels and enter unit/all CI discovery',()=>{
 const f=transverseFixture(),before=structuredClone(f.fit),pixels=Buffer.from(f.source.pixels),row=result(f);
 row.targets[0].dy=999;row.sections[0].flags.length=0;row.sections.length=0;
 assert.deepEqual(f.fit,before);assert.deepEqual(f.source.pixels,new Uint8Array(pixels));assert.equal(result(f).sections.length,60);
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-route-transverse-targets.test.js'));
});

