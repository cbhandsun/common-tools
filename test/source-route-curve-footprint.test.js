'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceCurveFootprint:check}=require('../packages/slideclone-core/routing/source-route-curve-footprint');
function fixture(){const width=200,height=50,mask=new Uint8Array(width*height),cells=Array.from({length:100},(_,i)=>20*width+i+10);
 for(const n of cells)mask[n]=1;
 return {mask,width,height,edges:[{curves:[[{x:10,y:20},{x:109,y:20}]],widthPx:2,cells,from:cells[0],to:cells.at(-1),fromHead:false,toHead:false}],joints:[],work:{checks:0}};}
test('complete curved geometry covers original shaft without adding a second displacement allowance',()=>{
 const f=fixture(),before=f.mask.slice();assert.equal(check(f),true);assert.deepEqual(f.mask,before);
 f.work.checks=0;f.edges[0].curves=[[{x:10,y:20},{x:40,y:20},{x:80,y:20},{x:109,y:20}]];assert.equal(check(f),true);
 f.work.checks=0;f.edges[0].curves[0][1].y=-10;f.edges[0].curves[0][2].y=-10;assert.equal(check(f),false);
 const shifted=fixture();shifted.edges[0].curves=shifted.edges[0].curves.map(c=>c.map(p=>({...p,y:p.y+3.1})));assert.equal(check(shifted),false);
});
test('the original two-percent halo cap, empty shafts and missing branches stay fail closed',()=>{
 for(const halos of [2,3]){const f=fixture();for(let i=0;i<halos;i++)f.mask[23*f.width+20+i*10]=1;assert.equal(check(f),halos===2);}
 const empty=fixture();empty.mask.fill(0);assert.equal(check(empty),false);
 const spur=fixture();spur.mask[40*spur.width+80]=1;assert.equal(check(spur),false);
 const missing=fixture();missing.edges=[];assert.equal(check(missing),false);
});
test('head flares require original head flags and joints retain only their original bounded wedges',()=>{
 const f=fixture();f.mask[27*f.width+10]=1;assert.equal(check(f),false);
 f.work.checks=0;f.edges[0].fromHead=true;assert.equal(check(f),true);
 const joint=fixture();joint.mask[27*joint.width+10]=1;joint.joints=[joint.edges[0].from];assert.equal(check(joint),true);
 const far=fixture();far.mask[38*far.width+10]=1;far.joints=[far.edges[0].from];assert.equal(check(far),false);
});
test('actual geometry work uses the caller ledger and exhaustion never grants a prefix',()=>{
 const measured=fixture();assert.equal(check(measured),true);const cost=measured.work.checks;
 const exact=fixture();exact.work.checks=4000000-cost;assert.equal(check(exact),true);assert.equal(exact.work.checks,4000000);
 const short=fixture();short.work.checks=4000000-cost+1;assert.throws(()=>check(short),/shared-geometry-budget/u);assert.equal(short.work.checks,4000001);
 const huge=fixture();huge.edges[0].curves=[[{x:-100000,y:-100000},{x:100000,y:100000}]];assert.throws(()=>check(huge),/shared-geometry-budget/u);
 const dimensions=fixture();dimensions.height=0;assert.throws(()=>check(dimensions),TypeError);
});

test('an ordered roster from a complete source scan checks the same ink, halo and missing branches without rescanning empty cells',()=>{
 for(const halos of [0,2,3]){
  const dense=fixture();for(let i=0;i<halos;i++)dense.mask[23*dense.width+20+i*10]=1;
  const sparse={...dense,work:{checks:0},sourceCells:Array.from(dense.mask.entries()).filter(([,v])=>v).map(([i])=>i)};
  assert.equal(check(sparse),check(dense));assert.ok(sparse.work.checks<dense.work.checks);
  const actualInk=Array.from(dense.mask).reduce((sum,v)=>sum+v,0);assert.equal(sparse.sourceCells.length,actualInk);
 }
});
