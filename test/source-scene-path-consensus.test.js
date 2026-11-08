'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scenePathPolylinesAgree:agree}=require('../packages/slideclone-core/scene-plan/source-scene-path-consensus');
const ps=rows=>rows.map(([x,y])=>({x,y}));
test('ordered continuous consensus accepts different collinear subdivisions at the unchanged source tolerance',()=>{
 const a=ps([[0,0],[4,0],[4,8]]),b=ps([[0,0],[2,0],[4,0],[4,2],[4,4],[4,8]]),before=structuredClone([a,b]);
 assert.equal(agree(a,b),true);assert.equal(agree(b,a),true);assert.deepEqual([a,b],before);
 assert.equal(agree(ps([[0,0],[10,0]]),ps([[0,1.5],[10,1.5]])),true);
 assert.equal(agree(ps([[0,0],[10,0]]),ps([[0,1.500001],[10,1.500001]])),false);
 assert.equal(agree(ps([[0,0],[2,1],[4,0]]),ps([[0,0],[4,0]])),true);
 assert.equal(agree(ps([[0,0],[2,2],[4,0]]),ps([[0,0],[4,0]])),false);
});
test('source agreement checks segment interiors, both endpoints and traversal order rather than a vertex set',()=>{
 const a=ps([[0,0],[10,0],[10,10]]);
 for(const b of [ps([[0,0],[10,10]]),[...a].reverse(),ps([[2,0],[10,0],[10,10]]),ps([[0,0],[10,0],[10,12]])]){
  assert.equal(agree(a,b),false);assert.equal(agree(b,a),false);
 }
 const x=ps([[0,0],[10,0],[0,0],[0,10],[0,0]]),y=ps([[0,0],[0,10],[0,0],[10,0],[0,0]]);
 assert.equal(agree(x,y),false);assert.equal(agree(y,x),false);
 const z=ps(Array.from({length:16},(_,i)=>[i*1000,i*1000]));assert.equal(agree(z,z),true);
});
test('empty, extreme, malformed and hostile consensus input is rejected without executing provider code',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('private-user-content');},valid=ps([[0,0],[10,10]]);
 for(const value of [undefined,null,[],[valid[0]],new Array(2),Array.from({length:17},()=>valid[0]),
  [{x:NaN,y:0},valid[1]],[{x:0,y:Infinity},valid[1]],[{x:-1,y:0},valid[1]],[{x:16385,y:0},valid[1]],
  new Proxy(valid,{get:trap}),[{get x(){return trap();},y:0},valid[1]],[{...valid[0],extra:1},valid[1]]]){
  assert.throws(()=>agree(value,valid),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
 assert.equal(calls,0);assert.ok(require('../scripts/test-sharded').discoverTestFiles(process.cwd(),'unit')
  .some(row=>row.file.replaceAll('\\','/')==='test/source-scene-path-consensus.test.js'));
});
