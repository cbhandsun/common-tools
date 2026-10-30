"use strict";
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const {fitSceneFillGeometryBatch}=require('../packages/slideclone-core/scene-plan/source-scene-fill-geometry-batch');
const {fitSceneFillGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-fill-geometry');
const deadline=()=>({deadlineMs:Date.now()+10000});
function fixture(offset=0){
 const points=[];for(let x=0;x<160;x++)for(let y=2+(Math.floor(x/2)%2)*2;y<22;y++)points.push({x:x+offset,y});
 return {points,box:{x:offset,y:2,w:160,h:20},wide:true,bridged:false,compound:false};
}
function batchWithWorker(Worker){
 const threads=require('node:worker_threads'),file=require.resolve('../packages/slideclone-core/scene-plan/source-scene-fill-geometry-batch');
 const original=threads.Worker,cached=require.cache[file];
 try{threads.Worker=Worker;delete require.cache[file];return require(file).fitSceneFillGeometryBatch;}
 finally{threads.Worker=original;require.cache[file]=cached;}
}
test('two real worker threads solve independent region geometry and retain input order',async()=>{
 const inputs=[fixture(0),fixture(200),fixture(400),fixture(600)],before=structuredClone(inputs);
 const expected=inputs.map(fitSceneFillGeometry),actual=await fitSceneFillGeometryBatch(inputs,deadline());
 assert.deepEqual(actual.results,expected);assert.deepEqual(inputs,before);
 assert.equal(new Set(actual.execution.map(r=>r.threadId)).size,2);
 assert.deepEqual(actual.execution.map(r=>r.index),[0,1,2,3]);
 assert.ok(actual.execution.some(a=>actual.execution.some(b=>a.threadId!==b.threadId&&a.startedAt<b.finishedAt&&b.startedAt<a.finishedAt)));
});
test('empty batches, source control sanitization and malformed inputs retain their boundary',async()=>{
 assert.deepEqual(await fitSceneFillGeometryBatch([],deadline()),{results:[],execution:[]});
 for(const inputs of [null,Array(2),new Proxy([],{}),Array(33).fill(fixture()),[null],[{...fixture(),bridged:'yes'}]])
  await assert.rejects(fitSceneFillGeometryBatch(inputs,deadline()),TypeError);
 const input=fixture(),before=structuredClone(input);input.secret='must not cross the boundary';
 const {parseSceneFillGeometry}=require('../packages/slideclone-core/scene-plan/source-scene-fill-geometry');
 assert.deepEqual(parseSceneFillGeometry(input),before);
 let evaluated=0;Object.defineProperty(input,'points',{get(){evaluated++;throw Error('private content');}});
 await assert.rejects(fitSceneFillGeometryBatch([input],deadline()),TypeError);assert.equal(evaluated,0);
});
test('caller mutation after dispatch cannot alter an unscheduled region observation',async()=>{
 const inputs=[fixture(),fixture(200),fixture(400)],expected=inputs.map(fitSceneFillGeometry);
 const pending=fitSceneFillGeometryBatch(inputs,deadline());
 inputs[2].points.length=0;inputs[2].box.w=1;inputs.reverse();
 assert.deepEqual((await pending).results,expected);
});
test('abort and the original absolute deadline terminate pending work without a successful result',async()=>{
 const controller=new AbortController();controller.abort();
 await assert.rejects(fitSceneFillGeometryBatch([fixture()],{...deadline(),signal:controller.signal}),/cancelled/);
 await assert.rejects(fitSceneFillGeometryBatch([fixture()],{deadlineMs:Date.now()-1}),/deadline exceeded/);
 await assert.rejects(fitSceneFillGeometryBatch([fixture()],{deadlineMs:Infinity}),TypeError);
 await assert.rejects(fitSceneFillGeometryBatch([fixture()],{deadlineMs:Date.now()+600000}),TypeError);
 const active=new AbortController(),pending=fitSceneFillGeometryBatch([fixture(),fixture(200)],{...deadline(),signal:active.signal});
 active.abort();await assert.rejects(pending,/cancelled/);
});
test('worker failure, early exit, malformed geometry and late replies fail closed and join every worker',async t=>{
 for(const mode of ['error','exit','shape','wrong-task','deadline','abort']){
  // This case exercises failure after dispatch. A busy CI machine may spend
  // the 50ms constructing/parsing fixtures before it creates any worker;
  // control the clock so that distinct pre-dispatch failure is not conflated.
  t.mock.timers.enable({apis:['Date','setTimeout'],now:10000});
  const workers=[];
  class Stub extends EventEmitter{
   constructor(){super();workers.push(this);this.terminated=false;}
   postMessage(task){
    if(mode==='deadline'||mode==='abort')return;
    queueMicrotask(()=>{
     if(mode==='error')this.emit('error',new Error('sensitive source content'));
     else if(mode==='exit')this.emit('exit',0);
     else this.emit('message',{ok:true,index:mode==='wrong-task'?31:task.index,threadId:1,startedAt:1,finishedAt:2,
      geometry:{segments:[{type:'moveTo',points:[{x:2,y:0}]}]}});
    });
   }
   async terminate(){this.terminated=true;this.emit('exit',0);return 0;}
  }
  const batch=batchWithWorker(Stub),controller=new AbortController();
  const pending=batch([fixture(),fixture(200)],{deadlineMs:Date.now()+(mode==='deadline'?50:10000),signal:controller.signal});
  if(mode==='abort')controller.abort();
  if(mode==='deadline')t.mock.timers.tick(50);
  await assert.rejects(pending,error=>!error.message.includes('sensitive source content'));
  assert.equal(workers.length,2);assert.ok(workers.every(w=>w.terminated));
  t.mock.timers.reset();
 }
});
test('worker startup failure joins the earlier thread and never retries with a fresh deadline',async()=>{
 let made=0,joined=0;
 class Stub extends EventEmitter{
  constructor(){super();if(++made===2)throw Error('startup failed');}
  postMessage(){}
  async terminate(){joined++;return 0;}
 }
 await assert.rejects(batchWithWorker(Stub)([fixture(),fixture(200)],deadline()),/startup failed/);
 assert.equal(made,2);assert.equal(joined,1);
});
test('aggregate observations cannot exceed the batch ceiling before workers or geometry allocation',async()=>{
 let made=0;class Stub extends EventEmitter{constructor(){super();made++;}}
 const points=Array(262144).fill({x:0,y:0}),input={points,box:{x:0,y:0,w:512,h:512},wide:false,bridged:false,compound:false};
 await assert.rejects(batchWithWorker(Stub)(Array(16).fill(input),deadline()),RangeError);
 assert.equal(made,0);
});
test('the unified CI suites include the worker lifecycle and cancellation regressions',()=>{
 const {includesSuite}=require('../scripts/test-suites');
 assert.ok(includesSuite(__filename,'unit'));assert.ok(includesSuite(__filename,'all'));
});
