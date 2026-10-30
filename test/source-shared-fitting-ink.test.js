'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSharedNetworkFixture,sourceCurvedNetworkFixture}=require('./helpers/source-shared-network.cjs');
const {measureSharedSourceRoute,sharedSourceRouteFittingInk:ink,sharedSourcePaintCells}=require('../packages/slideclone-core/routing/source-shared-route-measurement');
function fixture(make=sourceSharedNetworkFixture){const f=make(),m=measureSharedSourceRoute(f);assert.ok(m.fit,m.reason);return {...f,fit:m.fit};}
test('fitting observations are complete-source interior pixels attached to their actual original path samples',()=>{
 for(const make of [sourceSharedNetworkFixture,sourceCurvedNetworkFixture]){
  const f=fixture(make),before=Buffer.from(f.image.rgba),work={checks:f.fit.workChecks},rows=ink(f.fit,f.image,work),cells=sharedSourcePaintCells(f.fit,f.image,{checks:0});
  assert.equal(rows.length,f.fit.edges.length);assert.ok(rows.some(r=>r.length));assert.ok(work.checks>f.fit.workChecks);
  for(const [ordinal,row]of rows.entries())for(const p of row){
   assert.ok(Number.isSafeInteger(p.index));const edge=f.fit.edges[ordinal],original=edge.path[p.index];assert.ok(original);
   assert.ok(Math.hypot(p.x-original.x,p.y-original.y)<=edge.widthPx/2+.75);
   assert.ok(cells.has((p.y+f.fit.window.y)*f.image.width+p.x+f.fit.window.x));
  }
  assert.deepEqual(f.image.rgba,before);
  const frozen=structuredClone(rows);rows.find(r=>r.length)[0].x+=100;assert.deepEqual(ink(f.fit,f.image,{checks:0}),frozen);
 }
});
test('copied fits, source-buffer replacements and mutated source cannot provide fitting observations',()=>{
 const f=fixture();assert.throws(()=>ink(structuredClone(f.fit),f.image,{checks:0}),/source proof/u);
 assert.throws(()=>ink(f.fit,{...f.image,rgba:Buffer.from(f.image.rgba)},{checks:0}),/source proof/u);
 f.image.rgba[0]^=1;assert.throws(()=>ink(f.fit,f.image,{checks:0}),/source proof/u);
});
test('fitting observations use the original ledger, reject hostile work and never grant an exhausted prefix',()=>{
 const f=fixture(),work={checks:0};ink(f.fit,f.image,work);const cost=work.checks,exact={checks:4000000-cost};assert.ok(ink(f.fit,f.image,exact));assert.equal(exact.checks,4000000);
 const short={checks:4000000-cost+1};assert.throws(()=>ink(f.fit,f.image,short),/shared-geometry-budget/u);assert.equal(short.checks,4000001);
 let calls=0;const getter=Object.defineProperty({},'checks',{get(){calls++;throw Error('private');}}),proxy=new Proxy({},{get(){calls++;throw Error('private');}});
 for(const bad of [getter,proxy,null,{checks:-1},{checks:Infinity},Object.freeze({checks:0})])assert.throws(()=>ink(f.fit,f.image,bad),TypeError);
 assert.equal(calls,0);
});
test('fitting-observation boundary tests enter both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-shared-fitting-ink.test.js'));
});
