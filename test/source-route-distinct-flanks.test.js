'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceRouteCoverageWidth:measure}=require('../packages/slideclone-core/routing/source-route-coverage-width');
function fixture(gap,reverse=false){
 const width=80,height=80,rgba=Buffer.alloc(width*height*4,255),background=[255,255,255];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const across=y-x;
  if(across===0||across>=2*(gap+1)&&across<=16)rgba.set([30,60,90,255],(y*width+x)*4);
 }
 const path=Array.from({length:21},(_,i)=>({x:30+i,y:30+i}));if(reverse)path.reverse();
 return {width,height,rgba,background,path,work:{checks:0},cache:new Map()};
}

test('two normal steps through one diagonal background pixel cannot certify two source flanks',()=>{
 for(const reverse of [false,true]){
  const f=fixture(1,reverse),before=Buffer.from(f.rgba),path=structuredClone(f.path);
  // At 45 degrees, distances 1 and 2 round to the SAME pixel. The next
  // distinct pixel and every later sample within 12px belong to other ink.
  assert.equal(measure(f),null);assert.equal(measure({...f,complete:true,cache:new Map()}),null);
  assert.deepEqual(f.rgba,before);assert.deepEqual(f.path,path);assert.ok(f.work.checks<=4000000);
 }
});

test('two distinct source background cells retain a diagonal shaft, traversal and cache invariance',()=>{
 for(const reverse of [false,true]){
  const f=fixture(2,reverse),before=Buffer.from(f.rgba),width=measure(f);
  assert.equal(width,1);assert.equal(measure(f),width);
  assert.equal(measure({...f,complete:true}),width);assert.deepEqual(f.rgba,before);
  const capped={...fixture(2,reverse),work:{checks:4000000}};assert.equal(measure(capped),null);
 }
});

test('distinct source flank regressions are included in unified unit CI',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(row=>row.file.replaceAll('\\','/')==='test/source-route-distinct-flanks.test.js'));
});
