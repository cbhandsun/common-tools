'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {readSceneResponseContent,sceneResponseFailureCode}=require('../packages/remote-mcp-server/scene-response-content');
const {createSceneVisionClient}=require('../packages/remote-mcp-server/source-scene-client');
const options={endpoint:'http://127.0.0.1:3084/v1/chat/completions',model:'codex/gpt-6-sol',token:'private-test-token',streaming:true};
const request={prompt:'Classify source',task:'structure',images:[{bytes:Buffer.alloc(8),label:'original'}],isCancellationRequested:async()=>false};
const frame=(content,finish=null)=>'data: '+JSON.stringify({choices:[{index:0,delta:{content},finish_reason:finish}]})+'\n\n';
const complete=text=>frame(text)+frame(null,'stop')+'data: [DONE]\n\n';
function response(source,chunkSize=source.length||1){
 const bytes=typeof source==='string'?Buffer.from(source):source;
 return new Response(new ReadableStream({start(controller){for(let i=0;i<bytes.length;i+=chunkSize)controller.enqueue(bytes.subarray(i,i+chunkSize));controller.close();}}),{headers:{'content-type':'text/event-stream; charset=utf-8'}});
}
test('streamed JSON survives byte-split UTF8, CRLF, CR, comments, metadata and a final usage frame',async()=>{
 const text=JSON.stringify({label:'节点😀',reviews:[]});
 const stream=': heartbeat\n\nevent: message\n'+frame(text)+frame(null,'stop')+'data: {"choices":[],"usage":{"completion_tokens":12}}\n\ndata: [DONE]\n\n';
 for(const newline of ['\n','\r\n','\r']){
  const transport=response(stream.replace(/\n/gu,newline),1);
  assert.equal(await readSceneResponseContent(transport,true),text);assert.equal(transport.body.locked,false);
 }
});
test('complete nonstream envelopes and gateways returning complete JSON keep their validated result',async()=>{
 for(const streaming of [false,true]){
  const text='{"reviews":[]}',transport=new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:text}}]}));
  assert.equal(await readSceneResponseContent(transport,streaming),text);assert.equal(transport.body.locked,false);
 }
});
test('partial, empty, failed, multi-choice, duplicate-terminal and malformed streams fail without provider content',async()=>{
 const cases=[['','SCENE_INCOMPLETE_RESPONSE'],[frame('partial'),'SCENE_INCOMPLETE_RESPONSE'],
  [frame('partial')+'data: [DONE]\n\n','SCENE_INCOMPLETE_RESPONSE'],[frame('partial')+frame(null,'stop'),'SCENE_INCOMPLETE_RESPONSE'],
  [frame('partial')+frame(null,'length')+'data: [DONE]\n\n','SCENE_INCOMPLETE_RESPONSE'],
  [frame('partial')+frame(null,'tool_calls')+'data: [DONE]\n\n','SCENE_INCOMPLETE_RESPONSE'],
  [frame(null,'stop')+'data: [DONE]\n\n','SCENE_INCOMPLETE_RESPONSE'],
  [complete('{}')+frame('extra'),'SCENE_INVALID_STREAM'],[complete('{}')+'data: [DONE]\n\n','SCENE_INCOMPLETE_RESPONSE'],
  [frame('{}')+frame(null,'stop')+frame(null,'stop')+'data: [DONE]\n\n','SCENE_INVALID_STREAM'],
  ['data: {bad-json}\n\n','SCENE_INVALID_ENVELOPE_JSON'],
  ['data: {"choices":[{"index":1,"delta":{"content":"private-test-token"}}]}\n\n','SCENE_INVALID_STREAM'],
  ['data: {"choices":[{},{}]}\n\n','SCENE_INVALID_STREAM'],
  ['data: {"choices":[{"index":0,"delta":{"content":{}}}]}\n\n','SCENE_INVALID_STREAM'],
  ['event: error\ndata: {"message":"private-test-token"}\n\n','SCENE_PROVIDER_STREAM_FAILED'],
  ['data: {"error":{"message":"private-test-token"}}\n\n','SCENE_PROVIDER_STREAM_FAILED']];
 for(const [source,code]of cases){const transport=response(source,11);
  await assert.rejects(readSceneResponseContent(transport,true),error=>sceneResponseFailureCode(error)===code&&!error.message.includes(options.token));
  assert.equal(transport.body.locked,false);
 }
});
test('invalid UTF8 and oversized raw stream bytes obey the original 1MiB response boundary',async()=>{
 const invalid=Buffer.concat([Buffer.from('data: "'),Buffer.from([0xff]),Buffer.from('"\n\n')]);
 await assert.rejects(readSceneResponseContent(response(invalid,1),true),error=>sceneResponseFailureCode(error)==='SCENE_INVALID_ENVELOPE_JSON');
 const tail=complete('{}'),exact=':'+ ' '.repeat(1024*1024-Buffer.byteLength(tail)-3)+'\n\n'+tail;
 assert.equal(Buffer.byteLength(exact),1024*1024);assert.equal(await readSceneResponseContent(response(exact,4096),true),'{}');
 await assert.rejects(readSceneResponseContent(response(exact+' ',4096),true),error=>sceneResponseFailureCode(error)==='SCENE_RESPONSE_TOO_LARGE');
});
test('complete HTTP JSON still requires an unambiguous successful terminal choice',async()=>{
 for(const envelope of [{},null,{choices:[]},{choices:[{message:{content:'private-test-token'}}]},
  {choices:[{finish_reason:'length',message:{content:'partial'}}]},
  {choices:[{finish_reason:'stop',message:{content:'{}'}},{finish_reason:'stop',message:{content:'{}'}}]}])
  await assert.rejects(readSceneResponseContent(new Response(JSON.stringify(envelope)),false),error=>sceneResponseFailureCode(error)==='SCENE_INCOMPLETE_RESPONSE');
});
test('provider exceptions and hostile objects cannot forge internal safe error identities',()=>{
 let reads=0;for(const error of [{code:'SCENE_INVALID_STREAM'},new Proxy({},{get(){reads++;throw Error(options.token);}}),null,'private-test-token'])
  assert.equal(sceneResponseFailureCode(error),undefined);assert.equal(reads,0);
});
test('a provider error cannot impersonate a successful terminal marker or JSON choice',async()=>{
 for(const streaming of [true,false]){
  const transport=streaming?response(frame('{}')+frame(null,'stop')+'event: error\ndata: [DONE]\n\n'):
   new Response(JSON.stringify({error:{message:options.token},choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
  await assert.rejects(readSceneResponseContent(transport,streaming),error=>sceneResponseFailureCode(error)==='SCENE_PROVIDER_STREAM_FAILED'&&!error.message.includes(options.token));
  assert.equal(transport.body.locked,false);
 }
});
test('the real client makes one streamed request with the same token limit and exact local target binding',async()=>{
 let calls=0;const client=createSceneVisionClient({...options,enforceLocalSchema:true,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.stream,true);assert.equal(body.max_tokens,6000);assert.equal(body.reasoning_effort,'low');
  assert.equal(init.redirect,'error');assert.deepEqual(body.response_format.json_schema.schema.properties.reviewsByIndex.required,['2']);
  return response(complete(JSON.stringify({reviewsByIndex:{2:'graphic'},recoveredByIndex:{}})),1);
 }});
 assert.deepEqual(await client({...request,task:'classify-ocr',localTargets:{reviews:[2],missing:[]}}),{reviews:[{index:2,kind:'graphic'}],recoveredText:[]});
 assert.equal(calls,1);
 const wrong=createSceneVisionClient({...options,fetchImpl:async()=>response(complete('{"reviewsByIndex":{},"recoveredByIndex":{}}'))});
 await assert.rejects(wrong({...request,task:'classify-ocr',localTargets:{reviews:[2],missing:[]}}),error=>error.code==='SCENE_LOCAL_TARGET_BINDING_FAILED');
});
test('streaming client sanitizes HTTP, stream and network failures and never retries',async()=>{
 for(const [fetchImpl,code]of [[async()=>new Response(options.token,{status:502}),'SCENE_HTTP_FAILED'],
  [async()=>response('event: error\ndata: {"message":"'+options.token+'"}\n\n'),'SCENE_PROVIDER_STREAM_FAILED'],
  [async()=>response(frame('{"reviews":[]}')),'SCENE_INCOMPLETE_RESPONSE'],
  [async()=>{throw Object.assign(Error(options.token),{code:'SCENE_INVALID_STREAM'});},'SCENE_TRANSPORT_FAILED']]){
  let calls=0;const client=createSceneVisionClient({...options,fetchImpl:async(...args)=>{calls++;return fetchImpl(...args);}});
  await assert.rejects(client(request),error=>error.code===code&&error.message==='Scene provider recognition failed');assert.equal(calls,1);
 }
 assert.throws(()=>createSceneVisionClient({...options,streaming:'true'}),/configuration/);
});
test('streaming retains the 60000ms absolute deadline and 250ms cancellation poll',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 for(const cancelled of [false,true]){
  let aborted=false,cancel=false,calls=0;
  const client=createSceneVisionClient({...options,fetchImpl:async(_url,init)=>{
   calls++;return new Response(new ReadableStream({start(controller){init.signal.addEventListener('abort',()=>{aborted=true;controller.error(Error(options.token));},{once:true});}}),{headers:{'content-type':'text/event-stream'}});
  }});
  const pending=client({...request,isCancellationRequested:async()=>cancel});
  for(let i=0;i<8;i++)await Promise.resolve();
  const rejected=assert.rejects(pending,error=>error.code===(cancelled?'SCENE_CANCELLED':'SCENE_PROVIDER_TIMEOUT')&&error.message==='Scene provider recognition failed');
  if(cancelled){cancel=true;t.mock.timers.tick(250);}else{t.mock.timers.tick(59999);assert.equal(aborted,false);t.mock.timers.tick(1);}
  await rejected;assert.equal(aborted,true);assert.equal(calls,1);
 }
});
test('stream transport regressions are discovered by unified unit and all CI suites',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert(discoverTestFiles(process.cwd(),suite).some(file=>path.normalize(file.file)===path.normalize('test/scene-response-content.test.js')));
});
test('the absolute deadline and cancellation settle even when transport ignores AbortSignal',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 for(const phase of ['fetch','body'])for(const cancelled of [false,true]){
  let cancel=false,calls=0,bodyCancelled=false;
  const client=createSceneVisionClient({...options,fetchImpl:async()=>{
   calls++;if(phase==='fetch')return new Promise(()=>{});
   return new Response(new ReadableStream({cancel(){bodyCancelled=true;}}),{headers:{'content-type':'text/event-stream'}});
  }});
  const pending=client({...request,isCancellationRequested:async()=>cancel});
  for(let i=0;i<8;i++)await Promise.resolve();
  const rejected=assert.rejects(pending,error=>error.code===(cancelled?'SCENE_CANCELLED':'SCENE_PROVIDER_TIMEOUT')&&error.message==='Scene provider recognition failed');
  if(cancelled){cancel=true;t.mock.timers.tick(250);}else t.mock.timers.tick(60000);
  await rejected;assert.equal(calls,1);if(phase==='body')assert.equal(bodyCancelled,true);
 }
});
test('a late successful envelope cannot pass when the timer callback was delayed',async t=>{
 let reads=0;t.mock.method(performance,'now',()=>reads++?60001:0);
 const client=createSceneVisionClient({...options,fetchImpl:async()=>response(complete('{}'))});
 await assert.rejects(client(request),error=>error.code==='SCENE_PROVIDER_TIMEOUT'&&error.message==='Scene provider recognition failed');
});

test('quality profile admits bounded SSE overhead without raising the generated-content limit',async()=>{
 const comment=':'+ ' '.repeat(32000)+'\n\n';
 const source=comment.repeat(40)+complete('{"regions":[]}');
 assert(Buffer.byteLength(source)>1024*1024);
 await assert.rejects(readSceneResponseContent(response(source,4096),true),error=>sceneResponseFailureCode(error)==='SCENE_RESPONSE_TOO_LARGE');
 assert.equal(await readSceneResponseContent(response(source,4096),true,undefined,'quality'),'{"regions":[]}');
 const large=frame('a'.repeat(600000))+frame('a'.repeat(448577))+frame(null,'stop')+'data: [DONE]\n\n';
 await assert.rejects(readSceneResponseContent(response(large,65536),true,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_CONTENT_TOO_LARGE');
});
test('quality wire, individual-event and UTF8 content boundaries remain finite',async()=>{
 const tail=complete('{}'),comment=':'+ ' '.repeat(65532)+'\n\n';
 const exact=comment.repeat(255)+':'+ ' '.repeat(16*1024*1024-255*Buffer.byteLength(comment)-Buffer.byteLength(tail)-3)+'\n\n'+tail;
 assert.equal(Buffer.byteLength(exact),16*1024*1024);
 assert.equal(await readSceneResponseContent(response(exact,65536),true,undefined,'quality'),'{}');
 await assert.rejects(readSceneResponseContent(response(exact+' ',65536),true,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_RESPONSE_TOO_LARGE');
 for(const oversized of [':'+ ' '.repeat(1024*1024)+'\n\n','data: '+JSON.stringify({ignored:'x'.repeat(1024*1024)})+'\n\n'])
  await assert.rejects(readSceneResponseContent(response(oversized,65536),true,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_EVENT_TOO_LARGE');
 const half='😀'.repeat(131072),unicode=frame(half)+frame(half)+frame(null,'stop')+'data: [DONE]\n\n';
 assert.equal(await readSceneResponseContent(response(unicode,65536),true,undefined,'quality'),half+half);
 await assert.rejects(readSceneResponseContent(response(frame(half)+frame(half+'a')+frame(null,'stop')+'data: [DONE]\n\n',65536),true,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_CONTENT_TOO_LARGE');
 assert.equal(await readSceneResponseContent(response(frame('\ud83d')+frame('\ude00')+frame(null,'stop')+'data: [DONE]\n\n',3),true,undefined,'quality'),'😀');
});
test('quality applies the same content boundary to full JSON and still rejects incomplete streams',async()=>{
 const envelope=content=>new Response(JSON.stringify({metadata:'x'.repeat(1100000),choices:[{finish_reason:'stop',message:{content}}]}));
 assert.equal(await readSceneResponseContent(envelope('{}'),false,undefined,'quality'),'{}');
 await assert.rejects(readSceneResponseContent(envelope('x'.repeat(1048577)),false,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_CONTENT_TOO_LARGE');
 await assert.rejects(readSceneResponseContent(response(frame('private-test-token')),true,undefined,'quality'),error=>sceneResponseFailureCode(error)==='SCENE_INCOMPLETE_RESPONSE'&&!error.message.includes(options.token));
});
test('quality client aligns token and time limits, cancels, sanitizes and never retries',async t=>{
 t.mock.timers.enable({apis:['setTimeout','setInterval']});
 for(const cancelled of [false,true]){
  let cancel=false,calls=0,aborted=false;
  const client=createSceneVisionClient({...options,executionProfile:'quality',fetchImpl:async(_url,init)=>{
   calls++;assert.equal(JSON.parse(init.body).max_tokens,16000);
   init.signal.addEventListener('abort',()=>{aborted=true;});return new Promise(()=>{});
  }});
  const pending=client({...request,isCancellationRequested:async()=>cancel});
  for(let i=0;i<8;i++)await Promise.resolve();
  const rejected=assert.rejects(pending,error=>error.code===(cancelled?'SCENE_CANCELLED':'SCENE_PROVIDER_TIMEOUT')&&error.message==='Scene provider recognition failed');
  if(cancelled){cancel=true;t.mock.timers.tick(250);}else{t.mock.timers.tick(179999);assert.equal(aborted,false);t.mock.timers.tick(1);}
  await rejected;assert.equal(calls,1);assert.equal(aborted,true);
 }
});
test('execution policy rejects unknown configuration without inspecting or exposing it',()=>{
 const {sceneExecutionPolicy}=require('../packages/remote-mcp-server/scene-execution-policy');
 assert(Object.isFrozen(sceneExecutionPolicy()));
 for(const value of [null,'',false,16000,'QUALITY','private-test-token',{},new Proxy({},{get(){throw Error(options.token);}})]){
  assert.throws(()=>sceneExecutionPolicy(value),error=>error.message==='Scene execution profile is invalid');
  assert.throws(()=>createSceneVisionClient({...options,executionProfile:value}),error=>error.message==='Scene execution profile is invalid');
 }
});
