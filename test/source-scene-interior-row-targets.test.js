'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneInteriorRowTargets}=require('../packages/slideclone-core/scene-plan/source-scene-interior-row-targets');
const parent={x:20,y:20,w:160,h:180};
test('original row geometry preserves left and right pictorial space without changing controls',()=>{
 for(const x of [100,22]){
  const labels=[50,100,150].map(y=>({x,y,w:60,h:24})),before=structuredClone(labels);
  const targets=sceneInteriorRowTargets(parent,labels);
  assert.equal(targets.length,3);
  for(const {seed}of targets){
   assert.ok(seed.x>parent.x&&seed.y>parent.y&&seed.x+seed.w<parent.x+parent.w&&seed.y+seed.h<parent.y+parent.h);
   for(const label of labels)assert.ok(seed.x+seed.w<=label.x||seed.x>=label.x+label.w||seed.y+seed.h<=label.y||seed.y>=label.y+label.h);
  }
  assert.deepEqual(labels,before);assert.deepEqual(sceneInteriorRowTargets(parent,labels.toReversed()),targets);
 }
});
test('overlapping fragments form one source row and the original full-width text remains excluded',()=>{
 const labels=[{x:110,y:80,w:40,h:20},{x:90,y:88,w:20,h:18}];
 const targets=sceneInteriorRowTargets(parent,labels);assert.equal(targets.length,1);assert.ok(targets[0].seed.x+targets[0].seed.w<90);
 assert.deepEqual(sceneInteriorRowTargets(parent,[{x:20,y:80,w:160,h:24}]),[]);
 assert.deepEqual(sceneInteriorRowTargets(parent,[]),[]);
 assert.deepEqual(sceneInteriorRowTargets(parent,[{x:300,y:50,w:60,h:24}]),[]);
 assert.deepEqual(sceneInteriorRowTargets({x:20,y:20,w:5,h:5},[{x:20,y:20,w:5,h:5}]),[]);
});
test('extreme source rows remain bounded and never add a target allowance',()=>{
 const b={x:0,y:0,w:16384,h:16384},labels=Array.from({length:10000},(_,i)=>({x:8000,y:i,w:200,h:.5}));
 const targets=sceneInteriorRowTargets(b,labels);assert.ok(targets.length<=32);
 for(const {seed}of targets)assert.ok(seed.x>=0&&seed.y>=0&&seed.x+seed.w<=16384&&seed.y+seed.h<=16384);
 assert.throws(()=>sceneInteriorRowTargets(b,[...labels,{x:0,y:12000,w:1,h:1}]),/controls are invalid/);
});
test('invalid and hostile geometry cannot execute accessors or disclose their errors',()=>{
 let reads=0;const trap=()=>{reads++;throw Error('private-token');};
 const hostileBox={...parent};Object.defineProperty(hostileBox,'x',{get:trap});
 const hostileList=[];Object.defineProperty(hostileList,0,{get:trap,enumerable:true});hostileList.length=1;
 for(const b of [null,{}, {...parent,w:0},{...parent,x:NaN},{...parent,x:Infinity},{...parent,w:16384},hostileBox,new Proxy(parent,{get:trap,ownKeys:trap})])
  assert.throws(()=>sceneInteriorRowTargets(b,[]),e=>e.message==='Scene interior row controls are invalid');
 for(const labels of [null,{},[null],[{...parent,w:-1}],Array(1),hostileList,new Proxy([],{get:trap,ownKeys:trap})])
  assert.throws(()=>sceneInteriorRowTargets(parent,labels),e=>e.message==='Scene interior row controls are invalid');
 assert.equal(reads,0);
});
test('row recovery is included in the unified CI suite and runtime package contract',()=>{
 assert.equal(require('../scripts/test-suites').includesSuite('test/source-scene-interior-row-targets.test.js','unit'),true);
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-scene-interior-row-targets.js'));
});
