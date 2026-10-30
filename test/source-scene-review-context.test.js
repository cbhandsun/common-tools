"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sourceSceneReviewContext}=require('../packages/slideclone-core/scene-plan/source-scene-review');
function object(id,box,regionId='r',kind='container'){return {id,box,regionId,kind};}
test('gap reviews retain complete endpoints without needing a proposed relation',()=>{
 for(const vertical of [false,true]){
  const transpose=b=>vertical?{x:b.y,y:b.x,w:b.h,h:b.w}:b;
  const a=object('a',transpose({x:10,y:20,w:50,h:90}));
  const b=object('b',transpose({x:85,y:25,w:70,h:70}),'r','icon');
  const target=transpose({x:59,y:50,w:25,h:15}),plan={objects:[a,b]};
  const before=JSON.stringify({target,plan});
  assert.deepEqual(sourceSceneReviewContext(target,plan),transpose({x:10,y:20,w:145,h:90}));
  assert.deepEqual(sourceSceneReviewContext(target,{objects:[b,a]}),sourceSceneReviewContext(target,plan));
  assert.equal(JSON.stringify({target,plan}),before);
 }
});
test('no context is invented from overlap, different owners, unrelated labels or excessive envelopes',()=>{
 const target={x:60,y:40,w:10,h:10},a=object('a',{x:10,y:20,w:40,h:60});
 for(const b of [object('b',{x:70,y:20,w:40,h:60},'other'),object('b',{x:40,y:20,w:40,h:60}),
  object('b',{x:70,y:100,w:40,h:60}),object('b',{x:70,y:0,w:16300,h:16000})])
  assert.equal(sourceSceneReviewContext(target,{objects:[a,b]}),undefined);
 assert.equal(sourceSceneReviewContext(target,{objects:[]}),undefined);
 assert.equal(sourceSceneReviewContext({x:20,y:40,w:10,h:10},{objects:[a,object('b',{x:70,y:20,w:40,h:60})]}),undefined);
});
test('enclosing icons retain priority and nearest complete gap is deterministic at the original object limit',()=>{
 const target={x:55,y:45,w:10,h:10};
 const a=object('a',{x:10,y:20,w:40,h:60}),b=object('b',{x:70,y:20,w:40,h:60});
 const far=Array.from({length:62},(_,i)=>object('far'+i,{x:200+i*10,y:200,w:8,h:8}));
 assert.deepEqual(sourceSceneReviewContext(target,{objects:[...far,a,b]}),{x:10,y:20,w:100,h:60});
 const icon=object('icon',{x:50,y:40,w:20,h:20},'r','icon');
 assert.deepEqual(sourceSceneReviewContext(target,{objects:[a,b,icon]}),icon.box);
});
