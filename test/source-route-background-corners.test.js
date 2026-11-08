'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {searchCoreBackgroundCorners:search}=require('../packages/slideclone-core/routing/source-route-background-corners');
function fixture(){return {pending:new Set([42*80+42,42*80+43]),width:80,height:80,work:{checks:0},covered:new Map(),patch:()=>[235,248,241],measure:()=>null,include:()=>{throw new Error('Unproved frame was included');}};}

test('candidate frames have four available corners, intact context, unique tile queries and bounded physical coordinates',()=>{
 const f=fixture(),queries=[],patches=new Set();f.patch=(x,y)=>{patches.add(x+','+y);return [235,248,241];};
 f.measure=(...q)=>{queries.push(q);return null;};const pending=[...f.pending];assert.equal(search(f),true);assert.ok(queries.length>0);
 assert.equal(queries.length,new Set(queries.map(q=>q.join(','))).size);
 for(const [cx,cy,rx,ry]of queries){
  assert.ok([cx,cy,rx,ry].every(Number.isSafeInteger));assert.ok(cx-rx>=0&&cy-ry>=0&&cx+rx<80&&cy+ry<80);
  for(const n of pending)assert.ok(Math.abs(n%80-cx)<=rx-8&&Math.abs(Math.floor(n/80)-cy)<=ry-8);
  for(const [dx,dy]of [[-rx+2,-ry+2],[rx-2,-ry+2],[-rx+2,ry-2],[rx-2,ry-2]])assert.ok(patches.has((cx+dx)+','+(cy+dy)));
 }
 assert.deepEqual([...f.pending],pending);assert.equal(f.covered.size,0);
});

test('unavailable or refused patches cannot reach full measurement; covered and conflicted targets grant no new authority',()=>{
 for(const patch of [null,'refused']){const f=fixture();f.patch=()=>patch;f.measure=()=>{throw new Error('Invalid source frame reached measurement');};assert.equal(search(f),true);}
 const f=fixture();let calls=0;f.measure=(cx,cy,rx,ry)=>{calls++;return {cx,cy,flank:rx-2,verticalFlank:ry-2,corners:Array.from({length:4},()=>[235,248,241])};};
 f.include=()=>{for(const n of f.pending)f.covered.set(n,n%2?null:[235,248,241]);return true;};assert.equal(search(f),true);assert.equal(calls,1);
 assert.equal(search(f),true);assert.equal(calls,1);const empty=fixture();empty.pending.clear();assert.equal(search(empty),true);assert.equal(empty.work.checks,0);
});

test('invalid cells, unsafe dimensions, budget failure and dependency failures fail closed',()=>{
 for(const invalid of [{width:0},{height:NaN},{width:Number.MAX_SAFE_INTEGER,height:2},{pending:new Set([-1])},{pending:new Set([6400])},{pending:new Set(['1'])}])assert.throws(()=>search({...fixture(),...invalid}),RangeError);
 for(const checks of [-1,NaN,4000001,3999999]){const f=fixture();f.work.checks=checks;f.patch=()=>{throw new Error('Invalid budget reached source');};assert.equal(search(f),false);}
 const f=fixture();f.patch=()=>{f.work.checks=4000001;return null;};assert.equal(search(f),false);
 for(const where of ['patch','measure','include']){const f=fixture();f.measure=(cx,cy,rx,ry)=>({cx,cy,flank:rx-2,verticalFlank:ry-2,corners:[]});f.include=()=>true;f[where]=()=>{throw new Error('Controlled source proof failure');};assert.throws(()=>search(f),/Controlled source proof failure/);}
 const refused=fixture();refused.measure=(cx,cy,rx,ry)=>({cx,cy,flank:rx-2,verticalFlank:ry-2,corners:[]});refused.include=()=>false;assert.equal(search(refused),false);
});

test('asymmetric source frame regressions run in both unified CI suites',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-route-background-corners.test.js'));
});
