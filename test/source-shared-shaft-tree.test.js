'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {inspectSourceSharedShaftTree:inspect,sourceSharedShaftTree:measure}=require('../packages/slideclone-core/routing/source-shared-shaft-tree');
const {sourceSharedTreeFixture}=require('./helpers/source-shared-tree.cjs');
const {measureSharedSourceRoute}=require('../packages/slideclone-core/routing/source-shared-route-measurement');

function fixture(radius){
 const width=80,height=80,mask=new Uint8Array(width*height),at=(x,y)=>y*width+x;
 for(let n=10;n<=70;n++)mask[at(n,40)]=1;
 for(let n=10;n<=40;n++)mask[at(40,n)]=1;
 if(radius){
  // Three exits join the ring. Cutting any arc leaves a plausible T tree,
  // but discards source ink and arbitrarily chooses one physical route.
  for(let n=40-radius;n<=40+radius;n++){
   mask[at(n,40-radius)]=mask[at(n,40+radius)]=1;
   mask[at(40-radius,n)]=mask[at(40+radius,n)]=1;
  }
  for(let y=40-radius+1;y<40+radius;y++)for(let x=40-radius+1;x<40+radius;x++)mask[at(x,y)]=0;
 }
 return {mask,width,height,terminals:[at(10,40),at(70,40),at(40,10)],work:{checks:0}};
}

test('a measured acyclic shaft retains every skeleton cell and its complete terminal tree',()=>{
 const input=fixture(),before=input.mask.slice(),result=inspect(input);
 assert.ok(result.tree,result.reason);
 assert.equal(result.reason,'shared-shaft-confirmed');
 const represented=new Set(result.tree.edges.flatMap(e=>e.cells));
 for(let n=0;n<result.tree.skeleton.length;n++)if(result.tree.skeleton[n])assert.ok(represented.has(n));
 assert.equal(result.tree.edges.length,result.tree.joints.length-1);
 assert.deepEqual(input.mask,before);assert.ok(input.work.checks<4000000);
 assert.ok(measure(fixture()));
});

test('small and large real cycles never become trees by deleting the longest source arc',()=>{
 for(const radius of [3,5,8,12])for(const permutation of [[0,1,2],[2,0,1],[1,2,0]]){
  const input=fixture(radius),before=input.mask.slice();
  input.terminals=permutation.map(i=>input.terminals[i]);
  const result=inspect(input);
  assert.equal(result.tree,null,`${radius}: ${permutation}`);
  assert.equal(result.reason,'shared-shaft-cycle');
  assert.deepEqual(input.mask,before);assert.ok(input.work.checks<4000000);
  assert.equal(measure(fixture(radius)),null);
 }
});

test('the production source measurer reports the physical cycle before paint coverage can absorb it',()=>{
 const input=sourceSharedTreeFixture();
 for(let x=140;x<=160;x++)for(let d=-1;d<=1;d++){input.put(x,70+d);input.put(x,90+d);}
 for(let y=70;y<=90;y++)for(let d=-1;d<=1;d++){input.put(140+d,y);input.put(160+d,y);}
 const before=Buffer.from(input.image.rgba),result=measureSharedSourceRoute(input);
 assert.equal(result.fit,null);assert.equal(result.reason,'shared-shaft-cycle');
 assert.deepEqual(input.image.rgba,before);assert.ok(input.budget.used<=4000000);
});

test('empty, disconnected, out-of-frame and exhausted shafts remain closed failures',()=>{
 for(const mutate of [f=>f.mask.fill(0),f=>f.mask.fill(0,39*f.width,40*f.width),
  f=>f.terminals.push(f.terminals[0]),f=>f.work.checks=4000000,f=>f.mask=new Uint8Array(3)]){
  const input=fixture();mutate(input);assert.equal(inspect(input).tree,null);
 }
 const bounded=fixture();bounded.work.checks=3999990;
 assert.equal(inspect(bounded).tree,null);assert.ok(bounded.work.checks<=4000001);
});

test('cycle safety regressions are included by the unified CI unit test discovery',()=>{
 assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(row=>row.file.replaceAll('\\','/')==='test/source-shared-shaft-tree.test.js'));
});
