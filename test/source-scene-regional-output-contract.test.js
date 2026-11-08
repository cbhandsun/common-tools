"use strict";
const test=require('node:test'),assert=require('node:assert/strict');
const {sceneRegionalOutputPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-local-response');
const {regionalInventoryPrompt}=require('../packages/slideclone-core/scene-plan/source-scene-regional-inventory');
const {createSceneVisionClient}=require('../packages/remote-mcp-server/source-scene-client');
const targets={reviews:[],missing:[],regionInventories:[10,11],regionObjectCapacity:2,regionRelationCapacity:0,regionBoundaryIndices:[10]};
const empty={reviewsByIndex:{},recoveredByIndex:{},regionInventoriesByIndex:{10:{units:[],relations:[],boundary:{confidence:0,box_2d:null}},11:{units:[],relations:[]}}};
const request={prompt:'review',images:[{bytes:Buffer.alloc(8),label:'original'}],task:'classify-ocr',localTargets:targets,isCancellationRequested:async()=>false};
const config={endpoint:'http://127.0.0.1:3084/v1/chat/completions',model:'vision-test',token:'private-test-token'};

test('regional source prompt and transport use identical per-index shapes including only requested boundaries',async()=>{
 const before=structuredClone(targets),contract=sceneRegionalOutputPrompt(targets);
 assert.match(contract,/"10":\["units","relations","boundary"\]/);
 assert.match(contract,/"11":\["units","relations"\]/);
 assert.doesNotMatch(contract,/"confidence":0/, 'field instructions must not supply placeholder observations for the model to copy');
 assert.doesNotMatch(contract,/Each value is \{units:\[\],relations:\[\]\}/);
 const frame={width:100,height:100,sourceTargets:[{index:10,cropBox:{x:0,y:0,w:100,h:100}},{index:11,cropBox:{x:0,y:0,w:100,h:100}}],sheetTargets:[{index:10,cropBox:{x:0,y:0,w:100,h:100}},{index:11,cropBox:{x:0,y:0,w:100,h:100}}]};
 const semantic=regionalInventoryPrompt([{index:10,regionId:'panel-a',box:{x:0,y:0,w:100,h:100},boundaryReview:true},{index:11,regionId:'panel-b',box:{x:0,y:0,w:100,h:100}}],{objects:2,relations:0},frame);
 assert.ok(semantic.includes(contract));
 for(const enforceLocalSchema of [false,true]){
  let calls=0;const client=createSceneVisionClient({...config,enforceLocalSchema,fetchImpl:async(_url,init)=>{
   calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);
   assert.ok(body.messages[0].content[0].text.includes(contract));
   if(enforceLocalSchema){const properties=body.response_format.json_schema.schema.properties.regionInventoriesByIndex.properties;
    assert.deepEqual(properties['10'].required,['units','relations','boundary']);assert.deepEqual(properties['11'].required,['units','relations']);}
   return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(empty)}}]}));
  }});
  const result=await client(request);assert.equal(calls,1);
  assert.deepEqual(result.regionInventories,[{index:10,...empty.regionInventoriesByIndex[10]},{index:11,...empty.regionInventoriesByIndex[11]}]);
 }
 assert.deepEqual(targets,before);
});

test('regional output contract handles empty and legacy targets without widening any capacity',()=>{
 assert.equal(sceneRegionalOutputPrompt({reviews:[],missing:[]}), '');
 assert.equal(sceneRegionalOutputPrompt({...targets,regionInventories:[],regionBoundaryIndices:[]}), '');
 const legacy={...targets};delete legacy.regionBoundaryIndices;
 const contract=sceneRegionalOutputPrompt(legacy);assert.doesNotMatch(contract,/boundary/);
 assert.match(contract,/Combined units <=2, combined relations <=0/);
 assert.match(sceneRegionalOutputPrompt({...targets,regionInventories:[10],regionObjectCapacity:0}),/Combined units <=0, combined relations <=0/);
 const endpoint={reviews:[],missing:[],regionInventories:[11],regionObjectCapacity:0,regionRelationCapacity:1,regionEndpointIds:{11:['node-a','node-b']}};
 assert.match(sceneRegionalOutputPrompt(endpoint),/Combined units <=0, combined relations <=1/);
});

test('regional output contract validates unknown and hostile inputs without accessing provider data',()=>{
 let touched=0;const trap=()=>{touched++;throw Error('private-test-token');};
 for(const value of [null,{},new Proxy(targets,{get:trap,ownKeys:trap}),{...targets,get regionInventories(){return trap();}},
  {...targets,regionBoundaryIndices:[12]},{...targets,regionInventories:[10,10]},{...targets,regionObjectCapacity:65},{...targets,regionRelationCapacity:25}])
  assert.throws(()=>sceneRegionalOutputPrompt(value),error=>error instanceof TypeError&&!error.message.includes('private-test-token'));
 assert.equal(touched,0);
});

test('missing or unsolicited boundary output remains rejected in one call without exposing response content',async()=>{
 for(const mutate of [response=>{delete response.regionInventoriesByIndex[10].boundary;},response=>{response.regionInventoriesByIndex[11].boundary={confidence:0,box_2d:null};}]){
  const response=structuredClone(empty);mutate(response);let calls=0;
  const client=createSceneVisionClient({...config,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(response)}}]}));}});
  await assert.rejects(client(request),error=>error.code==='SCENE_LOCAL_TARGET_BINDING_FAILED'&&!error.message.includes(config.token));assert.equal(calls,1);
 }
});

test('regional output contract regression enters unit and all CI',()=>{
 const path=require('node:path'),{discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),suite).some(file=>file.file.endsWith('source-scene-regional-output-contract.test.js')));
});
