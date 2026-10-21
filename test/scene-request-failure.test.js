'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneTransportFailureCode}=require('../packages/remote-mcp-server/scene-request-failure');
const {createSceneVisionClient}=require('../packages/remote-mcp-server/source-scene-client');
test('transport diagnostics admit only fixed own data codes, including native fetch causes',()=>{
 for(const code of ['ECONNRESET','ECONNREFUSED','EPIPE','ETIMEDOUT','UND_ERR_SOCKET','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT','ABORT_ERR']){
  assert.equal(sceneTransportFailureCode({code}),code);
  assert.equal(sceneTransportFailureCode(new TypeError('private text',{cause:{code}})),code);
 }
 for(const value of [null,undefined,{},'',[],{code:'secret'},{code:'x'.repeat(100000)},{cause:{code:1}},Object.create({code:'ECONNRESET'})])assert.equal(sceneTransportFailureCode(value),'UNKNOWN');
});
test('transport diagnostics do not execute provider getters, proxies or recursive causes',()=>{
 const getter={get code(){throw Error('getter executed');},get cause(){throw Error('getter executed');}};
 const proxy=new Proxy({},{get(){throw Error('proxy executed');},getOwnPropertyDescriptor(){throw Error('proxy executed');}});
 const cycle={};cycle.cause=cycle;
 for(const value of [getter,proxy,{cause:proxy},cycle])assert.equal(sceneTransportFailureCode(value),'UNKNOWN');
});
const request={prompt:'bounded task',images:[{bytes:Buffer.from('12345678'),label:'source'}],task:'classify-ocr',localTargets:{reviews:[0],missing:[]},isCancellationRequested:async()=>false};
const options={endpoint:'http://127.0.0.1:3084/v1/chat/completions',model:'codex/gpt-6-astra',token:'test-token'};
test('local fetch failures retain a safe phase and code without retrying or exposing provider data',async()=>{
 let calls=0;
 const client=createSceneVisionClient({...options,fetchImpl:async()=>{calls++;throw new TypeError('private bearer data',{cause:{code:'ECONNRESET',headers:'private'}});}});
 await assert.rejects(client(request),error=>{
  assert.equal(error.code,'SCENE_TRANSPORT_FAILED');assert.equal(error.phase,'fetch');assert.equal(error.transportCode,'ECONNRESET');
  assert.equal(error.message,'Scene provider recognition failed');assert.equal(error.cause,undefined);
  assert.ok(!JSON.stringify(error).includes('private'));return true;
 });assert.equal(calls,1);
});
test('local keyed request construction and response parsing remain bounded and distinct from fetch failure',async()=>{
 let calls=0;
 const client=createSceneVisionClient({...options,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);assert.equal(body.model,options.model);
  return new Response(JSON.stringify({choices:[{message:{content:'{"reviewsByIndex":{"0":"text"},"recoveredByIndex":{}}'},finish_reason:'stop'}]}));
 }});
 assert.deepEqual(await client(request),{reviews:[{index:0,kind:'text'}],recoveredText:[]});assert.equal(calls,1);
 const bad=createSceneVisionClient({...options,fetchImpl:async()=>new Response('invalid private response')});
 await assert.rejects(bad(request),error=>error.phase==='response'&&error.transportCode===undefined&&error.code==='SCENE_INVALID_ENVELOPE_JSON');
});
test('request construction failures cannot masquerade as a network dispatch',async()=>{
 const bytes=Buffer.from('12345678');bytes.toString=()=>{throw new Error('private source details');};
 let calls=0;
 const client=createSceneVisionClient({...options,fetchImpl:async()=>{calls++;throw Error('must not dispatch');}});
 await assert.rejects(client({...request,images:[{bytes,label:'source'}]}),error=>{
  assert.equal(error.code,'SCENE_TRANSPORT_FAILED');assert.equal(error.phase,'request-build');
  assert.equal(error.transportCode,undefined);assert.ok(!JSON.stringify(error).includes('private'));return true;
 });assert.equal(calls,0);
});
test('HTTP failures and unknown transport errors keep fixed safe diagnostics',async()=>{
 const unavailable=createSceneVisionClient({...options,fetchImpl:async()=>new Response('private upstream error',{status:503})});
 await assert.rejects(unavailable(request),error=>error.phase==='response'&&error.code==='SCENE_HTTP_FAILED'&&error.transportCode===undefined);
 const unknown=createSceneVisionClient({...options,fetchImpl:async()=>{throw {code:'private token',cause:new Proxy({},{get(){throw Error('trap');}})};}});
 await assert.rejects(unknown(request),error=>error.phase==='fetch'&&error.transportCode==='UNKNOWN'&&!JSON.stringify(error).includes('private'));
});
test('scene failure regressions are discovered by unified unit and all suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(entry=>entry.file.endsWith('scene-request-failure.test.js')));
});
