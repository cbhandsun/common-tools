'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneVisionClient}=require('../packages/remote-mcp-server/source-scene-client');
const {sceneExecutionPolicy}=require('../packages/remote-mcp-server/scene-execution-policy');
const options={endpoint:'http://127.0.0.1:3084/v1/chat/completions',model:'vision-test',token:'test-token'};
const request={prompt:'observe',images:[{bytes:Buffer.alloc(8),label:'source'}],isCancellationRequested:async()=>false};

test('global deadline override leaves local, unspecified task, tokens and transport bounds unchanged',async t=>{
 const delays=[];
 const realTimeout=globalThis.setTimeout;
 t.mock.method(globalThis,'setTimeout',(fn,delay,...args)=>{
  delays.push(delay);return realTimeout(fn,delay,...args);
 });
 for(const [override,task,expected] of [[undefined,'structure',60000],[90000,'structure',90000],
  [120000,'structure',120000],[60000,'structure',60000],[90000,'classify-ocr',60000],[90000,undefined,60000],
  [120000,'classify-ocr',60000],[120000,undefined,60000]]){
  const client=createSceneVisionClient({...options,globalTimeoutMs:override,fetchImpl:async(_url,init)=>{
   assert.equal(JSON.parse(init.body).max_tokens,6000);
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
  }});
  const before=delays.length;
  assert.deepEqual(await client({...request,task}),{});
  assert.equal(delays[before],expected);
 }
 assert.deepEqual(sceneExecutionPolicy(),{timeoutMs:60000,outputTokens:6000,wireBytes:1048576,contentBytes:1048576,eventBytes:1048576});
});

test('global deadline accepts only explicit bounded numeric overrides in standard profile',()=>{
 for(const globalTimeoutMs of [null,'90000','120000',0,-1,60001,89999,90001,119999,120001,Infinity,NaN,{},[]])
  assert.throws(()=>createSceneVisionClient({...options,globalTimeoutMs}),/global timeout configuration/);
 assert.throws(()=>createSceneVisionClient({...options,globalTimeoutMs:90000,executionProfile:'quality'}),/global timeout configuration/);
 assert.throws(()=>createSceneVisionClient({...options,globalTimeoutMs:120000,executionProfile:'quality'}),/global timeout configuration/);
});

test('global deadline aborts a stalled provider once and sanitizes the failure',async t=>{
 for(const globalTimeoutMs of [90000,120000]){
 let expire,calls=0,signal;
 const timer=t.mock.method(globalThis,'setTimeout',(fn,delay)=>{
  assert.equal(delay,globalTimeoutMs);expire=fn;return undefined;
 });
 const client=createSceneVisionClient({...options,globalTimeoutMs,fetchImpl:async(_url,init)=>{
  calls++;signal=init.signal;
  queueMicrotask(()=>expire());
  return new Promise((resolve,reject)=>init.signal.addEventListener('abort',()=>reject(Error('private provider content')),{once:true}));
 }});
 await assert.rejects(client({...request,task:'structure'}),error=>error.code==='SCENE_PROVIDER_TIMEOUT'&&error.message==='Scene provider recognition failed');
 assert.equal(calls,1);assert.equal(signal.aborted,true);
 timer.mock.restore();
 }
});

test('elapsed deadline enforcement uses the same global or local limit even before timer delivery',async t=>{
 let now=0;
 t.mock.method(performance,'now',()=>now);
 for(const [globalTimeoutMs,task,elapsed,passes] of [[90000,'structure',89999,true],[90000,'structure',90000,false],
  [120000,'structure',119999,true],[120000,'structure',120000,false],[120000,'classify-ocr',60000,false]]){
  now=0;
  const client=createSceneVisionClient({...options,globalTimeoutMs,fetchImpl:async()=>{
   now=elapsed;
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
  }});
  if(passes)assert.deepEqual(await client({...request,task}),{});
  else await assert.rejects(client({...request,task}),error=>error.code==='SCENE_PROVIDER_TIMEOUT');
 }
});
