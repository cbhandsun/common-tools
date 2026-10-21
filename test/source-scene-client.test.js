"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createSceneVisionClient,sceneVisionFromEnvironment}=require("../packages/remote-mcp-server/source-scene-client");

test('structural transport requests the executable geometry required by its schema and preserves it for source review',async()=>{
 const {readStructuralObservations}=require('../packages/slideclone-core/source-scene-structural-review');
 const geometry={kind:'cylinder',capRatio:.2,radiusRatio:null,seams:[.4,.7],corners:null};
 for(const enforceLocalSchema of [false,true]){
  let calls=0;const client=createSceneVisionClient({...options,enforceLocalSchema,fetchImpl:async(_url,init)=>{
   calls++;const body=JSON.parse(init.body),prompt=body.messages[0].content[0].text;
   assert.match(prompt,/Each value is \{kind,confidence,regionId,box_2d,nativeGeometry\}/u);
   assert.doesNotMatch(prompt,/Each value is \{kind,confidence,regionId,box_2d\}/u);
   assert.match(prompt,/nativeGeometry:null/u);
   assert.equal(body.max_tokens,6000);
   if(enforceLocalSchema)assert.deepEqual(body.response_format.json_schema.schema.properties.structuresByIndex.properties['10'].required,
    ['kind','confidence','regionId','box_2d','nativeGeometry']);
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reviewsByIndex:{},recoveredByIndex:{},
    structuresByIndex:{10:{kind:'container',confidence:.99,regionId:'region-root',box_2d:null,nativeGeometry:geometry}}})}}]}));
  }});
  const result=await client({...request,task:'classify-ocr',localTargets:{reviews:[],missing:[],structures:[10]}});
  assert.equal(calls,1);assert.deepEqual(result.structures[0].nativeGeometry,geometry);
  const admitted=readStructuralObservations(result,[{index:10,objectId:'object-unit',box:{x:10,y:10,w:20,h:20}}],undefined);
  assert.equal(admitted[0].nativeGeometry.kind,'cylinder');assert.deepEqual(admitted[0].nativeGeometry.seams,[.4,.7]);
 }
});

test('explicit JSON transport preserves budgets and never replaces local target schemas',async()=>{
 const seen=[];
 const client=createSceneVisionClient({...options,enforceJsonOutput:true,enforceLocalSchema:true,fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);seen.push(body);
  const content=body.response_format.type==='json_object'?{scene:{}}:{reviewsByIndex:{},recoveredByIndex:{}};
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));
 }});
 assert.deepEqual(await client({...request,task:'structure'}),{scene:{}});
 await client({...request,task:'classify-ocr',localTargets:{reviews:[],missing:[]}});
 assert.deepEqual(seen[0].response_format,{type:'json_object'});
 assert.equal(seen[1].response_format.type,'json_schema');
 assert.ok(seen.every(body=>body.max_tokens===6000&&body.stream===false));
 for(const value of [null,'true',0,{},new Proxy({}, {get(){throw Error('private');}})])
  assert.throws(()=>createSceneVisionClient({...options,enforceJsonOutput:value}),/configuration/);
 const local=createSceneVisionClient({...options,enforceJsonOutput:true,fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.max_tokens,6000);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reviewsByIndex":{},"recoveredByIndex":{}}'}}]}));
 }});
 await local({...request,task:'classify-ocr',localTargets:{reviews:[],missing:[]}});
});

test('global JSON configuration is explicit and cannot repair invalid provider output or buy a retry',async t=>{
 const environment={COMMON_TOOLS_IMAGE_SCENE_ENDPOINT:options.endpoint,COMMON_TOOLS_IMAGE_SCENE_MODEL:options.model,COMMON_TOOLS_IMAGE_SCENE_TOKEN:options.token};
 assert.equal(sceneVisionFromEnvironment({}),undefined);
 for(const value of ['', 'TRUE',' true ','0','null','true'.repeat(10000)])
  assert.throws(()=>sceneVisionFromEnvironment({...environment,COMMON_TOOLS_IMAGE_SCENE_JSON_OUTPUT:value}),/configuration is invalid/);
 assert.throws(()=>sceneVisionFromEnvironment({COMMON_TOOLS_IMAGE_SCENE_JSON_OUTPUT:'true'}),/configuration is incomplete/);
 let calls=0;
 t.mock.method(globalThis,'fetch',async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);
  assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(body.max_tokens,6000);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'invalid private provider output'}}]}));
 });
 const client=sceneVisionFromEnvironment({...environment,COMMON_TOOLS_IMAGE_SCENE_JSON_OUTPUT:'true'});
 await assert.rejects(client({...request,task:'structure'}),error=>error.code==='SCENE_INVALID_OUTPUT_JSON'&&error.message==='Scene provider recognition failed');
 assert.equal(calls,1);
});
const options={endpoint:"http://127.0.0.1:3084/v1/chat/completions",model:"vision-test",token:"private-test-token"};
const request={prompt:"classify",images:[{bytes:Buffer.alloc(8),label:"source"}],isCancellationRequested:async()=>false};

test('relation transport binds exact endpoint observations within the unchanged local token and call budget',async()=>{
 let calls=0;const client=createSceneVisionClient({...options,enforceLocalSchema:true,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);assert.equal(body.stream,false);
  assert.deepEqual(body.response_format.json_schema.schema.properties.relationsByIndex.required,['10']);
  assert.match(body.messages[0].content[0].text,/relationsByIndex MUST have EXACT keys \["10"\]/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reviewsByIndex:{},recoveredByIndex:{},
   relationsByIndex:{10:{fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}}})}}]}));
 }});
 const result=await client({...request,task:'classify-ocr',localTargets:{reviews:[],missing:[],relations:[10]}});
 assert.equal(calls,1);assert.deepEqual(result.relations,[{index:10,fromId:'object-a',toId:'object-b',direction:'forward',confidence:.99}]);
});

test('structural keyed output travels in the existing single local call with the same token limit',async()=>{
 let calls=0;const client=createSceneVisionClient({...options,enforceLocalSchema:true,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);assert.equal(body.stream,false);
  assert.deepEqual(body.response_format.json_schema.schema.properties.structuresByIndex.required,['10']);
  assert.match(body.messages[0].content[0].text,/structuresByIndex MUST have EXACT keys \["10"\]/);
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reviewsByIndex:{},recoveredByIndex:{},
   structuresByIndex:{10:{kind:'container',confidence:.99,regionId:'region-root',box_2d:null}}})}}]}));
 }});
 const result=await client({...request,task:'classify-ocr',localTargets:{reviews:[],missing:[],structures:[10]}});
 assert.equal(calls,1);assert.equal(result.structures[0].regionId,'region-root');
});
test("scene client validates configuration and bounded requests before transport",async()=>{
 assert.equal(sceneVisionFromEnvironment({}),undefined);
 assert.throws(()=>sceneVisionFromEnvironment({COMMON_TOOLS_IMAGE_SCENE_MODEL:"x"}),/incomplete/);
 for(const endpoint of ["http://example.com/v1/chat/completions","https://u:p@example.com/v1/chat/completions","https://example.com/v1/chat/completions?key=x"])
 assert.throws(()=>createSceneVisionClient({...options,endpoint}),/configuration/);
 let called=false;const client=createSceneVisionClient({...options,fetchImpl:async()=>{called=true;throw new Error("not reached");}});
 await assert.rejects(client({...request,images:[]}),/request/);
 await assert.rejects(client({...request,images:[{bytes:Buffer.alloc(12*1024*1024+1),label:"large"}]}),/request/);
 await assert.rejects(client({...request,isCancellationRequested:async()=>true}),/cancelled/);assert.equal(called,false);
});

test('environment string narrowing preserves absent values and rejects unsafe data before transport',()=>{
 const keys=['COMMON_TOOLS_IMAGE_SCENE_ENDPOINT','COMMON_TOOLS_IMAGE_SCENE_MODEL','COMMON_TOOLS_IMAGE_SCENE_TOKEN'];
 const environment=Object.fromEntries(keys.map((key,index)=>[key,[options.endpoint,options.model,options.token][index]]));
 assert.equal(typeof sceneVisionFromEnvironment(environment),'function');
 for(const key of keys){
  assert.equal(sceneVisionFromEnvironment({[key]:undefined}),undefined);
  for(const value of [null,0,false,[],{}])assert.throws(()=>sceneVisionFromEnvironment({...environment,[key]:value}),
   error=>error instanceof TypeError&&error.message==='Scene provider configuration is invalid');
  let called=false;const accessor={...environment};Object.defineProperty(accessor,key,{get(){called=true;throw Error('private-value');}});
  assert.throws(()=>sceneVisionFromEnvironment(accessor),error=>error instanceof TypeError&&error.message==='Scene provider configuration is invalid');
  assert.equal(called,false);
 }
});
test("scene client parses bounded JSON and disables redirects",async()=>{
 const client=createSceneVisionClient({...options,fetchImpl:async(url,init)=>{
  assert.equal(init.redirect,"error");assert.equal(new URL(url).hostname,"127.0.0.1");
  assert.equal(JSON.parse(init.body).messages[0].content[2].type,"image_url");
  return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'```json\n{"reviews":[]}\n```'}}]}));
 }});assert.deepEqual(await client(request),{reviews:[]});
});
test("bounded structural and local tasks limit reasoning without increasing the output budget",async()=>{
 const seen=[];
 const client=createSceneVisionClient({...options,fetchImpl:async(_url,init)=>{
  seen.push(JSON.parse(init.body));return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"reviews":[]}'}}]}));
 }});
 await client({...request,task:"structure"});await client({...request,task:"classify-ocr"});
 assert.equal(seen[0].reasoning_effort,"low");assert.equal(seen[1].reasoning_effort,"low");
 assert.ok(seen.every(body=>body.max_tokens===6000&&body.stream===false));
 await assert.rejects(client({...request,task:"invalid"}),/request/);assert.equal(seen.length,2);
});
test("native image generation models receive the same bounded vision task without unsupported thinking options",async()=>{
 for(const model of ["gemini-3.1-flash-image","gpt-image-2.5-sunburst","gpt-image-2.5-flare"]){
  let called=0;const client=createSceneVisionClient({...options,model,fetchImpl:async(_url,init)=>{
   called++;const body=JSON.parse(init.body);assert.equal(body.reasoning_effort,undefined);
   assert.equal(body.max_tokens,6000);assert.equal(body.stream,false);
   return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"reviews":[]}'}}]}));
  }});assert.deepEqual(await client({...request,task:"structure"}),{reviews:[]});assert.equal(called,1);
 }
});
test("scene provider failures, malformed or oversized responses never echo provider content",async()=>{
 for(const fetchImpl of [async()=>{throw new Error(options.token);},async()=>new Response(options.token,{status:401}),
  async()=>new Response("bad JSON"),async()=>new Response("x".repeat(1024*1024+1)),
  async()=>new Response(JSON.stringify({choices:[{finish_reason:"length",message:{content:'{"reviews":[]}'}}]}))]){
  await assert.rejects(createSceneVisionClient({...options,fetchImpl})(request),error=>error.message==="Scene provider recognition failed");
 }
});

test("local vision requests enforce keyed structured output in the same single-call budget",async()=>{
 let calls=0;
 const client=createSceneVisionClient({...options,enforceLocalSchema:true,fetchImpl:async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);assert.equal(body.response_format.type,"json_schema");
  assert.deepEqual(body.response_format.json_schema.schema.properties.reviewsByIndex.required,["0"]);
  return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify({reviewsByIndex:{0:"text"},recoveredByIndex:{}})}}]}));
 }});
 assert.deepEqual(await client({...request,task:"classify-ocr",localTargets:{reviews:[0],missing:[]}}),{reviews:[{index:0,kind:"text"}],recoveredText:[]});
 await assert.rejects(client({...request,task:"structure",localTargets:{reviews:[0],missing:[]}}),/task/);assert.equal(calls,1);
 const bad=createSceneVisionClient({...options,fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"reviewsByIndex":{},"recoveredByIndex":{}}'}}]}))});
 await assert.rejects(bad({...request,task:"classify-ocr",localTargets:{reviews:[0],missing:[]}}),e=>e.message==="Scene provider recognition failed");
});

test("keyed local binding works without a transport schema on protocol gateways that reject response_format",async()=>{
 const client=createSceneVisionClient({...options,fetchImpl:async(_url,init)=>{
  const body=JSON.parse(init.body);assert.equal(body.response_format,undefined);
  assert.match(body.messages[0].content[0].text,/reviewsByIndex MUST have EXACT keys \["2"\]/u);
  return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:'{"reviewsByIndex":{"2":"text"},"recoveredByIndex":{}}'}}]}));
 }});
 assert.deepEqual(await client({...request,task:"classify-ocr",localTargets:{reviews:[2],missing:[]}}),{reviews:[{index:2,kind:"text"}],recoveredText:[]});
 assert.throws(()=>createSceneVisionClient({...options,enforceLocalSchema:"true"}),/configuration/);
});

test("safe failure codes distinguish invalid transport JSON, output JSON and exact target binding",async()=>{
 const local={...request,task:"classify-ocr",localTargets:{reviews:[2],missing:[]}};
 const cases=[['not-json','SCENE_INVALID_ENVELOPE_JSON'],
  [JSON.stringify({choices:[{finish_reason:'stop',message:{content:'not-json'}}]}),'SCENE_INVALID_OUTPUT_JSON'],
  [JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"reviewsByIndex":{},"recoveredByIndex":{}}'}}]}),'SCENE_LOCAL_TARGET_BINDING_FAILED']];
 for(const [body,code] of cases){let calls=0;const client=createSceneVisionClient({...options,fetchImpl:async()=>{calls++;return new Response(body);}});
  await assert.rejects(client(local),e=>e.code===code&&e.message==='Scene provider recognition failed');assert.equal(calls,1);
 }
});
