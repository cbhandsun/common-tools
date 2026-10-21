"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {runPairedSceneReview}=require('../packages/slideclone-core/source-scene-paired-review');
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const base=work=>({work,isCancellationRequested:async()=>false,verifySource:()=>{}});

test('paired scene observations overlap and retain declared order',async()=>{
 const a=deferred(),b=deferred(),started=deferred();let count=0,active=0,peak=0;
 const run=runPairedSceneReview(base([a,b].map((gate,index)=>async()=>{
  active++;peak=Math.max(peak,active);if(++count===2)started.resolve();await gate.promise;active--;return index;
 })));
 await started.promise;b.resolve();a.resolve();assert.deepEqual(await run,[0,1]);assert.equal(peak,2);assert.equal(active,0);
});
test('paired observations retain empty successful responses',async()=>{
 assert.deepEqual(await runPairedSceneReview(base([async()=>null,async()=>({reviews:[]})])),[null,{reviews:[]}]);
});
test('paired observations reject invalid, sparse, extra or accessor work without invoking it',async()=>{
 let called=0;const task=async()=>called++;
 const accessor=[task,task];Object.defineProperty(accessor,0,{get(){throw Error('must not read');}});
 const extra=[task,task];extra.extra=true;
 for(const work of [null,[],[task],[task,task,task],new Array(2),[task,1],accessor,extra,new Proxy([task,task],{})])
  await assert.rejects(runPairedSceneReview(base(work)),TypeError);
 await assert.rejects(runPairedSceneReview(new Proxy(base([task,task]),{})),TypeError);assert.equal(called,0);
});
test('cancelled before dispatch performs no provider work',async()=>{
 let called=0;await assert.rejects(runPairedSceneReview({...base([async()=>called++,async()=>called++]),isCancellationRequested:async()=>true}),/cancelled/);assert.equal(called,0);
});
test('caller cannot add or replace work while the first cancellation check awaits',async()=>{
 const entered=deferred(),release=deferred();let checks=0,extra=0;const work=[async()=>0,async()=>1];
 const run=runPairedSceneReview({...base(work),isCancellationRequested:async()=>{if(++checks===1){entered.resolve();await release.promise;}return false;}});
 await entered.promise;work.splice(0,2,async()=>extra++,async()=>extra++,async()=>extra++);release.resolve();
 assert.deepEqual(await run,[0,1]);assert.equal(extra,0);
});
test('invalid cancellation result fails before provider work',async()=>{
 let called=0;await assert.rejects(runPairedSceneReview({...base([async()=>called++,async()=>called++]),isCancellationRequested:async()=>1}),TypeError);assert.equal(called,0);
});
test('source mutation before dispatch fails closed',async()=>{
 let called=0;await assert.rejects(runPairedSceneReview({...base([async()=>called++,async()=>called++]),verifySource:()=>{throw Error('source changed');}}),/source changed/);assert.equal(called,0);
});
test('one failed observation cancels and drains its sibling preserving first failure',async()=>{
 const failure=Object.assign(new Error('Scene provider recognition failed'),{code:'SCENE_PROVIDER_TIMEOUT'}),both=deferred();let started=0,drained=false;
 const run=runPairedSceneReview(base([
  async()=>{if(++started===2)both.resolve();await both.promise;throw failure;},
  async cancel=>{if(++started===2)both.resolve();await both.promise;while(!await cancel())await new Promise(setImmediate);drained=true;throw Error('sibling cancelled');}
 ]));
 await assert.rejects(run,e=>e===failure);assert.equal(drained,true);
});
test('source mutation after a response cancels outstanding observation',async()=>{
 const ready=deferred();let changed=false,drained=false;
 const run=runPairedSceneReview({...base([
  async()=>{await ready.promise;changed=true;return 'first';},
  async cancel=>{ready.resolve();while(!await cancel())await new Promise(setImmediate);drained=true;return 'second';}
 ]),verifySource:()=>{if(changed)throw Error('source changed');}});
 await assert.rejects(run,/source changed/);assert.equal(drained,true);
});
test('caller cancellation during both observations drains them without results',async()=>{
 let cancel=false,started=0,drained=0;const ready=deferred();
 const run=runPairedSceneReview({...base([0,1].map(()=>async check=>{if(++started===2)ready.resolve();while(!await check())await new Promise(setImmediate);drained++;return null;})),isCancellationRequested:async()=>cancel});
 await ready.promise;cancel=true;await assert.rejects(run,/cancelled/);assert.equal(drained,2);
});
test('cancellation callback failure cannot leave provider work running',async()=>{
 let broken=false,finished=0;const ready=deferred();
 const task=async check=>{ready.resolve();await new Promise(setImmediate);try{await check();}finally{finished++;}return null;};
 const run=runPairedSceneReview({...base([task,task]),isCancellationRequested:async()=>{if(broken)throw Error('cancel check failed');return false;}});
 await ready.promise;broken=true;await assert.rejects(run,/cancel check failed/);assert.equal(finished,2);
});
test('paired provider transport aborts the remaining request and keeps errors content-safe',async()=>{
 const {createSceneVisionClient}=require('../packages/remote-mcp-server/source-scene-client');
 const both=deferred();let started=0,active=0,aborted=0;
 const recognize=createSceneVisionClient({endpoint:'http://127.0.0.1/v1/chat/completions',model:'test',token:'private-test-token',fetchImpl:async(_url,options)=>{
  const call=++started;active++;if(started===2)both.resolve();
  if(call===1){await both.promise;active--;return {ok:false,body:{}};}
  return new Promise((_resolve,reject)=>options.signal.addEventListener('abort',()=>{active--;aborted++;reject(Error('private-test-token provider body'));},{once:true}));
 }});
 const work=[0,1].map(()=>cancel=>recognize({prompt:'private image text',images:[{bytes:Buffer.alloc(8),label:'source'}],isCancellationRequested:cancel,task:'classify-ocr'}));
 await assert.rejects(runPairedSceneReview(base(work)),error=>error.code==='SCENE_HTTP_FAILED'&&!/private/.test(error.message));
 assert.equal(started,2);assert.equal(active,0);assert.equal(aborted,1);
});
