'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fixture=require('./fixtures/source-whole-route-transition.json');
const {fitAdaptiveGradientPaint}=require('../packages/slideclone-core/routing/source-adaptive-gradient-paint');
const {fitWholeRoutePaint}=require('../packages/slideclone-core/routing/source-whole-route-paint');
const {sourceRoutePaintColor}=require('../packages/slideclone-core/routing/source-route-paint-fit');
function input(){
 const angle=87.5*Math.PI/180,values=fixture.points.map(p=>p.x*Math.cos(angle)+p.y*Math.sin(angle));
 const lo=Math.min(...values),span=Math.max(...values)-lo,order=values.map((v,i)=>({v,i})).sort((a,b)=>a.v-b.v);
 return {colors:order.map(p=>fixture.colors[p.i].slice()),positions:order.map(p=>(p.v-lo)/span),work:{checks:0}};
}
test('short source transitions fit six whole-stroke stops while checking every original observation',()=>{
 const f=input(),before=structuredClone(f),fit=fitAdaptiveGradientPaint(f.colors,f.positions,f.work);assert.ok(fit);
 assert.equal(fit.stops.length,6);assert.ok(f.work.checks<400000);
 const support=f.colors.filter((color,i)=>sourceRoutePaintColor(fit.stops,f.positions[i]).every((v,c)=>Math.abs(v-color[c])<=18)).length/f.colors.length;
 assert.equal(support,fit.support);assert.ok(support>=.9);assert.deepEqual(f.colors,before.colors);assert.deepEqual(f.positions,before.positions);
 const whole=fitWholeRoutePaint({...structuredClone(fixture),bounds:{x:494,y:713,w:93,h:101},work:{checks:0}});assert.ok(whole);assert.ok(whole.support>=.9);
});
test('incompatible colors, repeated projections and exhausted ledgers never grant source paint',()=>{
 const f=input();f.colors=f.colors.map((_,i)=>i%2?[255,0,255]:[0,255,0]);assert.equal(fitAdaptiveGradientPaint(f.colors,f.positions,f.work),null);
 const g=input();assert.equal(fitAdaptiveGradientPaint(g.colors,g.positions.map(()=>.5),g.work),null);
 const h=input();h.work.checks=4000000;assert.throws(()=>fitAdaptiveGradientPaint(h.colors,h.positions,h.work),/shared-geometry-budget/u);
});
test('adaptive controls reject empty, invalid, extreme and unordered source input',()=>{
 for(const edit of [f=>f.colors=[],f=>f.colors=new Array(8),f=>f.positions.pop(),f=>f.colors=Array(513).fill([0,0,0]),
  f=>f.colors[0][0]=NaN,f=>f.colors[0][0]=256,f=>f.positions[0]=-1,f=>f.positions[0]=Infinity,
  f=>f.positions.reverse(),f=>f.work.checks=-1]){
  const f=input();edit(f);assert.throws(()=>fitAdaptiveGradientPaint(f.colors,f.positions,f.work),TypeError);
 }
});
test('adaptive controls reject hostile accessors and proxies without executing them or logging contents',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-content');},proxy=new Proxy([],{get:trap,ownKeys:trap,getPrototypeOf:trap});
 for(const edit of [f=>f.colors=proxy,f=>f.positions=proxy,f=>f.colors[0]=proxy,
  f=>f.work={get checks(){return trap();}},f=>Object.defineProperty(f.positions,'0',{get:trap})]){
  const f=input();edit(f);assert.throws(()=>fitAdaptiveGradientPaint(f.colors,f.positions,f.work),TypeError);
 }
 assert.equal(calls,0);
});
test('adaptive source regression is included in typed, packaged and unified CI entrypoints',()=>{
 const file='packages/slideclone-core/routing/source-adaptive-gradient-paint.js';assert.ok(require('../tsconfig.boundaries.json').include.includes(file));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes(file));
 for(const suite of ['unit','all'])assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),suite)
  .some(r=>r.file.replaceAll('\\','/')==='test/source-adaptive-gradient-paint.test.js'));
});
