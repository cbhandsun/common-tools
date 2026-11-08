'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sharedRouteOutputSnapshot:snapshot}=require('../packages/slideclone-core/routing/source-shared-route-output-snapshot');
const item=value=>({id:'shape',type:'freeform',box:{x:0,y:0,w:10,h:10},source:{detector:'source-shared-route',value}});
const exact=row=>JSON.stringify(Object.fromEntries(['id','type','box','rotation','style','font','text','runs','positionedRuns','source'].map(key=>[key,row[key]])));

test('bounded snapshots preserve exact JSON with ASCII, control escapes, quotes and every UTF-16 surrogate case',()=>{
 const controls=Array.from({length:128},(_,i)=>String.fromCharCode(i)).join('');
 for(const text of ['',controls,'正常文本😀','\uD800','\uDC00','\uD800a\uDC00','\uD800\uDC00\uDC00','\u2028\u2029','"\\'.repeat(100)]){
  const row=item(text),before=structuredClone(row),work={checks:0},actual=snapshot(row,work);
  assert.equal(actual,exact(row));assert.deepEqual(JSON.parse(actual).source.value,text);assert.deepEqual(row,before);assert.ok(work.checks>0);
 }
});

test('the original output character and work caps remain hard limits after exact escape accounting',()=>{
 for(const value of ['a'.repeat(263000),'\u0000'.repeat(45000),'\uD800'.repeat(45000)])assert.equal(snapshot(item(value),{checks:0}),null);
 // A numeric native command stream requires no extra escaping. Its exact
 // output fits the same cap; a sixfold bound used to reject it needlessly.
 const row=item('x');row.style={freeformPath:'['+'[1,0.125,0.375],'.repeat(3000)+'[1,1,1]]'};
 const work={checks:0},output=snapshot(row,work);assert.equal(output,exact(row));assert.ok(output.length<262144);
 const exactWork={checks:4000000-work.checks};assert.equal(snapshot(row,exactWork),output);assert.equal(exactWork.checks,4000000);
 const short={checks:4000001-work.checks};assert.equal(snapshot(row,short),null);assert.equal(short.checks,4000001);
});

test('snapshots never execute hostile accessors or proxies and CI discovers the regression suite',()=>{
 let calls=0;const hostile=()=>{calls++;throw Error('private');},getter=item('x');Object.defineProperty(getter.source,'value',{get:hostile});
 const proxy=new Proxy(item('x'),{get:hostile,ownKeys:hostile,getPrototypeOf:hostile});
 assert.equal(snapshot(getter,{checks:0}),null);assert.equal(snapshot(proxy,{checks:0}),null);assert.equal(calls,0);
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-shared-output-snapshot.test.js'));
});
