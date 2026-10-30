'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {searchAdditionalCoreBackground:search}=require('../packages/slideclone-core/routing/source-route-background-search');
const field=()=>({corners:[[235,248,241],[235,248,241],[235,248,241],[235,248,241]],cx:44,cy:44,flank:30,verticalFlank:14});
function fixture(){return {pending:new Set([42*80+42,42*80+43]),width:80,height:80,work:{checks:0},covered:new Map(),measure:()=>null,include:()=>{throw new Error('Unavailable field was included');}};}

test('additional search shares exact field queries across pending targets and preserves the eight-cell context',()=>{
 const f=fixture(),calls=[],pending=[...f.pending];f.measure=(...query)=>{calls.push(query);return null;};
 assert.equal(search(f),true);assert.equal(calls.length,18);assert.equal(new Set(calls.map(q=>q.join(','))).size,18);
 for(const [cx,cy,rx,ry]of calls)assert.ok(pending.some(n=>Math.abs(n%80-cx)<=rx-8&&Math.abs(Math.floor(n/80)-cy)<=ry-8));
 assert.deepEqual([...f.pending],pending);assert.equal(f.covered.size,0);
});

test('observed and permanently conflicted targets stop search without creating ownership',()=>{
 const f=fixture(),keys=[...f.pending];let calls=0;f.measure=()=>{calls++;return field();};
 f.include=()=>{f.covered.set(keys[0],[235,248,241]);f.covered.set(keys[1],null);return true;};
 assert.equal(search(f),true);assert.equal(calls,1);assert.equal(f.covered.size,2);
 assert.equal(search(f),true);assert.equal(calls,1);
 const empty=fixture();empty.pending.clear();assert.equal(search(empty),true);assert.equal(empty.work.checks,0);
});

test('invalid input and exhausted budgets cannot call source measurement',()=>{
 for(const invalid of [{width:0},{height:NaN},{width:Number.MAX_SAFE_INTEGER,height:2},{pending:new Set([-1])},
  {pending:new Set([6400])},{pending:new Set([Infinity])},{pending:new Set([1.5])}]){
  const f={...fixture(),...invalid};f.measure=()=>{throw new Error('Invalid input reached source');};assert.throws(()=>search(f),RangeError);
 }
 for(const checks of [-1,NaN,4000001,3999999]){
  const f=fixture();f.work.checks=checks;f.measure=()=>{throw new Error('Exhausted budget reached source');};assert.equal(search(f),false);
 }
});

test('measurement and inclusion failures propagate without treating a partial search as evidence',()=>{
 const exhausted=fixture();exhausted.measure=()=>{exhausted.work.checks=4000001;return field();};assert.equal(search(exhausted),false);
 const refused=fixture();refused.measure=()=>field();refused.include=()=>false;assert.equal(search(refused),false);
 for(const where of ['measure','include']){
  const f=fixture();f.measure=()=>field();f.include=()=>true;f[where]=()=>{throw new Error('Controlled proof failure');};
  assert.throws(()=>search(f),/Controlled proof failure/);
 }
});

test('additional field search regressions are included in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-search.test.js'));
});
