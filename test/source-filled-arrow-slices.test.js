'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFilledArrowSlices:slices}=require('../packages/slideclone-core/routing/source-filled-arrow-slices');

test('axis slabs contain only cells with positive area in that slab',()=>{
 for(const horizontal of [true,false]){
  const width=20,coordinates=[[2,4],[2,5],[2,6],[3,5]],cells=coordinates.map(([a,c])=>horizontal?c*width+a:a*width+c);
  const input={cells,width,horizontal,slope:0,intercept:5,work:{checks:0}},before=[...cells];
  assert.deepEqual(slices(input),[
   {t:2,lo:-1.5,hi:1.5,gaps:0,complete:true},
   {t:3,lo:-.5,hi:.5,gaps:0,complete:true}
  ]);
  assert.deepEqual(cells,before);assert.ok(input.work.checks<=4000000);
 }
});

test('a shared cell edge cannot widen a neighboring taper or fill its gap',()=>{
 const width=20,cells=[2*width+5,4*width+5,3*width+6];
 const result=slices({cells,width,horizontal:true,slope:0,intercept:3,work:{checks:0}});
 assert.deepEqual(result,[
  {t:5,lo:-1.5,hi:1.5,gaps:1,complete:true},
  {t:6,lo:-.5,hi:.5,gaps:0,complete:true}
 ]);
});

test('oblique slabs retain positive corner area and the original cell footprint',()=>{
 const work={checks:0},result=slices({cells:[0],width:20,horizontal:true,slope:1,intercept:0,work});
 assert.ok(result);assert.deepEqual(result.map(s=>s.t),[-1,0,1]);
 for(const s of result){
  const half=Math.SQRT1_2-(s.t===0?0:.5);
  assert.ok(Math.abs(s.hi-half)<1e-12);assert.ok(Math.abs(s.lo+half)<1e-12);
  assert.equal(s.gaps,0);assert.equal(s.complete,s.t===0);
 }
 assert.ok(work.checks<=4000000);
});

test('empty observations stay empty and exhausted work cannot return a certificate',()=>{
 const input={cells:[],width:20,horizontal:true,slope:0,intercept:0,work:{checks:0}};
 assert.deepEqual(slices(input),[]);
 assert.equal(slices({...input,cells:[210],work:{checks:4000000}}),null);
 assert.equal(slices({...input,cells:[210],work:{checks:3999999}}),null);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 assert.ok(discoverTestFiles(process.cwd(),'unit').some(f=>f.file.replaceAll('\\','/')==='test/source-filled-arrow-slices.test.js'));
});

test('shared-ledger cell reuse retains exact slices, gaps and subset ownership',()=>{
 const width=48,cells=Array.from({length:90},(_,i)=>(4+Math.floor(i/15))*width+4+i%15),before=[...cells];
 for(const horizontal of [true,false])for(const slope of [-1,-.3,-0,0,.5,1])for(const intercept of [-0,0,4.2]){
  const work={checks:0},input={cells,width,horizontal,slope,intercept,work};
  const expected=slices({...input,work:{checks:0}}),first=slices(input),initial=work.checks;
  assert.deepEqual(first,expected);assert.deepEqual(slices(input),expected);
  assert.ok(work.checks-initial<initial/2,'reuse must skip actual cell intersections');
  const subset=cells.filter((_,i)=>i%3!==0),request={...input,cells:subset};
  assert.deepEqual(slices(request),slices({...request,work:{checks:0}}),'cached cells outside this subset confer no area');
  // Returned arrays and slice values cannot mutate the private cell cache.
  first[0].lo=-999;first.length=0;assert.deepEqual(slices(input),expected);
  assert.deepEqual(slices({...input,cells:[]}),[]);assert.deepEqual(cells,before);
  work.checks=4000000;assert.equal(slices(input),null);assert.equal(work.checks,4000001);
 }
});

test('width, direction, slope and intercept remain independent cache identities',()=>{
 const cells=[24,25,26,44,45,46],work={checks:0};
 for(const width of [20,24])for(const horizontal of [true,false])for(const slope of [-0,0,.25,.75])for(const intercept of [-0,0,2,3]){
  const input={cells,width,horizontal,slope,intercept,work};
  assert.deepEqual(slices(input),slices({...input,work:{checks:0}}));
 }
});

test('distinct observed head hypotheses retain their results within the original shared geometry cap',()=>{
 const path=require('node:path'),fixture=require('./fixtures/source-compound-budget/geometry.json');
 const {readPng}=require('../packages/slideclone-core/png');
 const {partitionSourceCompoundRoute:partition}=require('../packages/slideclone-core/routing/source-compound-route-partition');
 const image=readPng(path.join(__dirname,'fixtures/source-compound-budget/source.png')),mask=new Uint8Array(fixture.width*fixture.height);
 for(const n of fixture.cells)mask[n]=1;
 const pixels=Buffer.from(image.rgba),before=mask.slice(),work={checks:1000000};
 const results=fixture.paths.slice(0,3).map(path=>!!partition({...fixture,rgba:image.rgba,mask,path,work}));
 assert.deepEqual(results,[false,true,false]);
 assert.ok(work.checks<4000000,'no candidate may exhaust the shared budget by repeating pure cell intersections');
 assert.deepEqual(mask,before);assert.deepEqual(image.rgba,pixels);
 const exhausted={checks:4000000};assert.equal(partition({...fixture,rgba:image.rgba,mask,path:fixture.paths[1],work:exhausted}),null);
});
