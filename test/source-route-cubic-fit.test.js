'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fitSourceRouteCubics:fit}=require('../packages/slideclone-core/routing/source-route-cubic-fit');
const {certifySourceRouteCurveGeometry:geometry}=require('../packages/slideclone-core/routing/source-route-curve-geometry');
const {certifySourceRouteCurveTopology:topology}=require('../packages/slideclone-core/routing/source-route-curve-topology');
const p=(x,y)=>({x,y}),line=[p(0,0),p(10,0),p(20,0)],simple=()=>({edges:[{from:'a',to:'b',curves:[[p(0,0),p(20,0)]]}]}),geo=()=>({points:line,curves:[[line[0],line.at(-1)]]});

test('bounded cubic fitter retains both endpoints, every source index and fixed observation tolerance',()=>{
 for(const points of [line,Array.from({length:49},(_,i)=>{const t=i/48;return p(80*t,30*Math.sin(t*Math.PI/2));})]){
  const before=structuredClone(points),work={checks:0},rows=fit({points,work});assert.ok(rows?.length);assert.deepEqual(points,before);
  assert.deepEqual(rows[0].controls[0],points[0]);assert.deepEqual(rows.at(-1).controls.at(-1),points.at(-1));
  let index=0;for(const row of rows){assert.equal(row.low,index);index=row.high;assert.ok(row.maxObservationError<=1/16);assert.ok([2,4].includes(row.controls.length));}
  assert.equal(index,points.length-1);assert.ok(geometry({points,curves:rows.map(r=>r.controls),work}).passed);
  rows[0].controls[0].x=999;assert.deepEqual(points,before);
 }
 assert.deepEqual(fit({points:[p(0,0),p(1,1)],work:{checks:0}})[0].controls,[p(0,0),p(1,1)]);
 assert.equal(fit({points:[p(0,0),p(1,0),p(0,0)],work:{checks:0}}),null);
});

test('continuous geometry rejects missing endpoints, disconnected spans and excursions between source observations',()=>{
 assert.ok(geometry({...geo(),work:{checks:0}}).passed);
 for(const curves of [[[p(0,0),p(0,20),p(20,20),p(20,0)]],[[p(0,1),p(20,0)]],[[p(0,0),p(5,0)],[p(6,0),p(20,0)]]])assert.equal(geometry({points:line,curves,work:{checks:0}}).passed,false);
 // A flatness allowance cannot hide a finite-segment overshoot at an end.
 assert.equal(geometry({points:line,curves:[[p(0,0),p(-10,0),p(30,0),p(20,0)]],work:{checks:0}}).passed,false);
});

test('complete curve topology accepts a cycle and a common endpoint while rejecting crossings and overlapping branches',()=>{
 const triangle={edges:[{from:'a',to:'b',curves:[[p(0,0),p(10,0)]]},{from:'b',to:'c',curves:[[p(10,0),p(5,10)]]},{from:'c',to:'a',curves:[[p(5,10),p(0,0)]]}]};
 assert.ok(topology({...triangle,work:{checks:0}}).passed);
 for(const edge of [{from:'c',to:'d',curves:[[p(10,-5),p(10,5)]]},{from:'a',to:'d',curves:[[p(0,0),p(10,0)]]}]){
  assert.equal(topology({edges:[...simple().edges,edge],work:{checks:0}}).passed,false);
 }
 const disconnected=simple();disconnected.edges.push({from:'b',to:'c',curves:[[p(20.01,0),p(30,0)]]});assert.equal(topology({...disconnected,work:{checks:0}}).reason,'curve-vertex-discontinuity');
 assert.equal(topology({edges:[{from:'a',to:'b',curves:[[p(0,0),p(10,10),p(-10,10),p(0,0)]]}],work:{checks:0}}).passed,false);
});

test('hull subdivision proves disjoint full curves even when their unsplit bounds overlap',()=>{
 const result=topology({edges:[{from:'a',to:'b',curves:[[p(0,0),p(0,10),p(10,10),p(10,0)]]},{from:'c',to:'d',curves:[[p(5,0),p(5,6)]]}],work:{checks:0}});
 assert.equal(result.passed,true);assert.ok(result.maximumDepth>0);
});

test('normalization roundoff has a bounded machine error and cannot admit a physical endpoint gap',()=>{
 const make=dx=>({edges:[{from:'a',to:'b',curves:[[p(0,0),p(100,0)]]},{from:'b',to:'c',curves:[[p(100+dx,0),p(100,50)]]}]});
 const input=make(2e-13),before=structuredClone(input),result=topology({...input,work:{checks:0}});
 assert.ok(result.passed);assert.ok(result.maximumEndpointRoundoffPx>0);assert.ok(result.maximumEndpointRoundoffPx<=8*Number.EPSILON*100000);
 assert.deepEqual(input,before);assert.equal(topology({...make(1e-8),work:{checks:0}}).passed,false);
});

test('all curve stages reject hostile controls, empty or invalid data before invoking accessors',()=>{
 let calls=0;const hostile=()=>{calls++;throw Error('private');},proxy=new Proxy({},{get:hostile,ownKeys:hostile,getPrototypeOf:hostile});
 const getter={};Object.defineProperty(getter,'points',{enumerable:true,get:hostile});
 for(const fn of [fit,geometry,topology])for(const value of [null,{},proxy,getter,{work:proxy},{work:Object.freeze({checks:0})}])assert.throws(()=>fn(value),TypeError);
 for(const points of [[],[p(0,0)],[p(0,0),p(NaN,0)],[p(0,0),p(100001,0)],[p(0,0),p(0,0)],Array(1025).fill(p(0,0)),[proxy,p(1,1)]])assert.throws(()=>fit({points,work:{checks:0}}),TypeError);
 assert.throws(()=>geometry({points:line,curves:[[p(0,0),p(1,1),p(20,0)]],work:{checks:0}}),TypeError);
 assert.throws(()=>topology({edges:[{from:'bad\nlabel',to:'b',curves:[[p(0,0),p(1,1)]]}],work:{checks:0}}),TypeError);
 assert.equal(calls,0);
});

test('fitting, continuous bounds and complete topology reserve the same finite ledger and fail without a prefix',()=>{
 for(const [fn,input]of [[fit,()=>({points:line})],[geometry,geo],[topology,simple]]){
  const work={checks:0};fn({...input(),work});const cost=work.checks;
  const exact={checks:4000000-cost};fn({...input(),work:exact});assert.equal(exact.checks,4000000);
  const short={checks:4000001-cost};assert.throws(()=>fn({...input(),work:short}),/shared-geometry-budget/u);assert.equal(short.checks,4000001);
 }
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-route-cubic-fit.test.js'));
});
