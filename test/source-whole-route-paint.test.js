'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/source-whole-route-paint.json');
const {fitWholeRoutePaint}=require('../packages/slideclone-core/routing/source-whole-route-paint');
const {measureSourceSpatialPaint}=require('../packages/slideclone-core/routing/source-route-spatial-paint');
const {sourceRoutePaintColor}=require('../packages/slideclone-core/routing/source-route-paint-fit');
function input(){return {points:structuredClone(fixture.points),colors:structuredClone(fixture.colors),bounds:{x:359,y:713,w:137,h:100},work:{checks:0}};}
test('whole source gradient uses one diagonal native stroke without relaxing the original sample gate',()=>{
 const f=input(),before=structuredClone(f);assert.equal(measureSourceSpatialPaint(f.points,f.colors,{checks:0}),undefined);
 const result=fitWholeRoutePaint(f);assert.ok(result);assert.ok(result.support>=.9);assert.ok(result.gradient.stops.length<=8);
 const angle=result.gradient.angleDeg*Math.PI/180,x=Math.cos(angle),y=Math.sin(angle),b=f.bounds;
 const corners=[[b.x,b.y],[b.x+b.w,b.y],[b.x,b.y+b.h],[b.x+b.w,b.y+b.h]].map(([a,b])=>a*x+b*y),lo=Math.min(...corners),span=Math.max(...corners)-lo;
 const support=f.points.filter((p,i)=>sourceRoutePaintColor(result.gradient.stops,(p.x*x+p.y*y-lo)/span)
  .every((c,k)=>Math.abs(c-f.colors[i][k])<=18)).length/f.points.length;
 assert.ok(support>=.9);assert.equal(support,result.support);assert.ok(f.work.checks<=4000000);
 assert.deepEqual(f.points,before.points);assert.deepEqual(f.colors,before.colors);
 const moved=input();moved.points=moved.points.map(p=>({x:p.x+1000,y:p.y-500}));moved.bounds.x+=1000;moved.bounds.y-=500;
 const translated=fitWholeRoutePaint(moved);assert.ok(translated);assert.ok(Math.abs(translated.gradient.angleDeg-result.gradient.angleDeg)<1e-8);
 assert.equal(translated.support,result.support);
});
test('unrepresentable colors, degenerate geometry and exhausted work do not become paint approval',()=>{
 const f=input();f.colors=f.colors.map((_,i)=>i%2?[0,255,0]:[255,0,255]);assert.equal(fitWholeRoutePaint(f),null);
 const g=input();g.points=g.points.map((_,i)=>({x:i,y:i}));assert.equal(fitWholeRoutePaint(g),null);
 const h=input();h.work.checks=4000000;assert.throws(()=>fitWholeRoutePaint(h),/shared-geometry-budget/u);
});
test('empty, illegal and extreme paint controls reject at the typed boundary',()=>{
 for(const edit of [f=>f.points=[],f=>f.points=new Array(8),f=>f.colors.pop(),f=>f.points=Array(513).fill({x:0,y:0}),
  f=>f.points[0].x=NaN,f=>f.points[0].y=100001,f=>f.colors[0][0]=-1,f=>f.colors[0][1]=Infinity,
  f=>f.bounds.w=-1,f=>f.bounds.h=100001,f=>f.work.checks=-1]){
  const f=input();edit(f);assert.throws(()=>fitWholeRoutePaint(f),TypeError);
 }
});
test('paint fitting does not invoke provider accessors, proxies or coercion hooks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy({},{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const edit of [f=>f.points=proxy,f=>f.colors[0]=proxy,f=>f.bounds=proxy,f=>f.work=proxy,f=>f.points[0]={get x(){return trap();},y:0}]){
  const f=input();edit(f);assert.throws(()=>fitWholeRoutePaint(f),TypeError);
 }
 assert.equal(calls,0);
});
test('source paint regression is included in typed, packaged and unified CI entrypoints',()=>{
 const file='packages/slideclone-core/routing/source-whole-route-paint.js';assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-whole-route-paint.test.js'));
});
