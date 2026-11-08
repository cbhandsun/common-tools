'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {smoothSourceRouteSamples:smooth}=require('../packages/slideclone-core/routing/source-route-banded-smoothing');
const {denseSmooth}=require('./helpers/source-smoothing-dense.cjs');
const points=[{x:100,y:200},{x:101,y:200},{x:102,y:201},{x:103,y:201},{x:104,y:203},{x:105,y:204}];
const targets=[{index:2,dx:.1,dy:-.2},{index:3,dx:0,dy:.35}];
const input=()=>({points:structuredClone(points),targets:structuredClone(targets),work:{checks:0}});
test('the fixed banded solve matches independent dense equations without changing samples or ports',()=>{
 for(const t of [[],targets,[{index:1,dx:30,dy:-30},{index:4,dx:-32,dy:32}]]){
  const f=input();f.targets=t;const before=structuredClone(f),actual=smooth(f),expected=denseSmooth(f.points,f.targets);
  assert.ok(actual);assert.equal(actual.iterations,8);assert.ok(actual.maximumLinearSolveResidual<1e-8);
  for(let i=0;i<points.length;i++){
   assert.ok(Math.hypot(actual.points[i].x-expected[i].x,actual.points[i].y-expected[i].y)<1e-9);
   assert.ok(Math.hypot(actual.points[i].x-points[i].x,actual.points[i].y-points[i].y)<=.500000001);
  }
  assert.deepEqual(actual.points[0],points[0]);assert.deepEqual(actual.points.at(-1),points.at(-1));
  assert.deepEqual(f.points,before.points);assert.deepEqual(f.targets,before.targets);assert.ok(f.work.checks>0);
  assert.ok(f.work.checks<points.length*9*64+256,'vector sweeps eliminate duplicate matrix reads');
  assert.equal(Object.hasOwn(actual,'sourceAuthority'),false);
 }
});
test('minimum and bounded maximum samples handle empty targets and translation consistently',()=>{
 for(const n of [4,1024]){
  const p=Array.from({length:n},(_,i)=>({x:i,y:3})),work={checks:0},result=smooth({points:p,targets:[],work});
  assert.ok(result);assert.equal(result.points.length,n);assert.ok(result.points.every((q,i)=>Math.hypot(q.x-i,q.y-3)<1e-8));
 }
 const a=smooth(input()),f=input();f.points=f.points.map(p=>({x:p.x-100,y:p.y-200}));const b=smooth(f);
 assert.ok(a&&b);for(let i=0;i<points.length;i++)assert.ok(Math.hypot(a.points[i].x-b.points[i].x-100,a.points[i].y-b.points[i].y-200)<1e-9);
});
test('invalid, empty, duplicate, nonfinite and over-capacity controls reject with bounded messages',()=>{
 for(const mutate of [f=>f.points=[],f=>f.points=f.points.slice(0,3),f=>f.points[0]={x:NaN,y:0},f=>f.points[1]=f.points[0],
  f=>f.points[1]={x:1000001,y:0},f=>f.points=Array(1025).fill({x:0,y:0}),f=>f.targets.push(f.targets[0]),
  f=>f.targets[0].index=.1,f=>f.targets[0].index=6,f=>f.targets[0].dy=Infinity,f=>f.targets[0].dx=33,
  f=>f.targets=Array(7).fill({}),f=>delete f.points[1],f=>f.points.extra='private',f=>f.work.checks=-1]){
  const f=input();mutate(f);assert.throws(()=>smooth(f),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 for(const value of [null,[],{},'private',new Date()])assert.throws(()=>smooth(value),TypeError);
});
test('proxies, getters, array methods and work accessors never execute caller code',()=>{
 let calls=0;const getter={get x(){calls++;throw Error('private');},y:0};
 const proxy=new Proxy([], {get(){calls++;throw Error('private');}});
 for(const mutate of [f=>f.points[0]=getter,f=>f.points=proxy,f=>f.targets=proxy,
  f=>Object.defineProperty(f,'targets',{get(){calls++;throw Error('private');}}),
  f=>Object.defineProperty(f.work,'checks',{get(){calls++;throw Error('private');}}),
  f=>Object.defineProperty(f.points,'map',{value(){calls++;throw Error('private');}})]){
  const f=input();mutate(f);assert.throws(()=>smooth(f),TypeError);
 }
 assert.equal(calls,0);
});
test('one shared ledger is charged before each pass and cannot return a completed prefix on exhaustion',()=>{
 const f=input();smooth(f);const cost=f.work.checks;
 const exact=input();exact.work.checks=4000000-cost;assert.ok(smooth(exact));assert.equal(exact.work.checks,4000000);
 const short=input();short.work.checks=4000000-cost+1;assert.throws(()=>smooth(short),/shared-geometry-budget/u);assert.equal(short.work.checks,4000001);
 const a=input(),b=input();smooth(a);assert.equal(b.work.checks,0);smooth(b);assert.equal(a.work.checks,b.work.checks);
});
test('banded solver tests enter unified unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-route-banded-smoothing.test.js'));
});
