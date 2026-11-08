'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSceneVisionClient,sceneVisionFromEnvironment}=require('../packages/remote-mcp-server/source-scene-client');
const options={model:'fixture-vision',token:'fixture-only'};
const invalid=error=>error instanceof TypeError&&error.message==='Scene provider configuration is invalid'
 &&!Object.hasOwn(error,'input')&&!Object.hasOwn(error,'cause');

test('scene endpoint parsing returns a fixed error without retaining malformed configuration',()=>{
 for(const endpoint of ['', 'relative-private-marker', 'http://[private-marker', 'https://[::1-private-marker/v1/chat/completions']){
  assert.throws(()=>createSceneVisionClient({...options,endpoint}),invalid);
  assert.throws(()=>sceneVisionFromEnvironment({COMMON_TOOLS_IMAGE_SCENE_ENDPOINT:endpoint||'http://[private-marker',
   COMMON_TOOLS_IMAGE_SCENE_MODEL:options.model,COMMON_TOOLS_IMAGE_SCENE_TOKEN:options.token}),invalid);
 }
});

test('scene endpoint parsing rejects unknown values without executing coercion',()=>{
 let calls=0;
 const hostile={toString(){calls++;throw Error('synthetic-private-marker');}};
 const accessor=Object.defineProperty({},'toString',{get(){calls++;throw Error('synthetic-private-marker');}});
 const proxy=new Proxy({},{get(){calls++;throw Error('synthetic-private-marker');}});
 for(const endpoint of [undefined,null,0,false,[],{},Symbol('fixture'),hostile,accessor,proxy])
  assert.throws(()=>createSceneVisionClient({...options,endpoint}),invalid);
 assert.equal(calls,0);
});

test('scene endpoint parsing bounds direct clients and rejects hidden control characters',()=>{
 const suffix='/chat/completions',prefix='https://vision.example.test/';
 const endpoint=prefix+'a'.repeat(4096-prefix.length-suffix.length)+suffix;
 assert.equal(typeof createSceneVisionClient({...options,endpoint}),'function');
 for(const value of [prefix+'a'+endpoint.slice(prefix.length),
  'https://vision.example.test/\r\nv1/chat/completions','https://vision.example.test/\0v1/chat/completions'])
  assert.throws(()=>createSceneVisionClient({...options,endpoint:value}),invalid);
});

test('scene endpoint validation preserves supported transports and existing URL restrictions',()=>{
 for(const endpoint of ['https://vision.example.test/v1/chat/completions',
  'http://127.0.0.1:3084/v1/chat/completions','http://[::1]:3084/v1/chat/completions'])
  assert.equal(typeof createSceneVisionClient({...options,endpoint}),'function');
 for(const endpoint of ['http://vision.example.test/v1/chat/completions','file:///chat/completions',
  'https://user:private-marker@vision.example.test/v1/chat/completions',
  'https://vision.example.test/v1/chat/completions?token=private-marker',
  'https://vision.example.test/v1/chat/completions#private-marker','https://vision.example.test/v1/completions'])
  assert.throws(()=>createSceneVisionClient({...options,endpoint}),invalid);
});

test('scene endpoint regressions enter unified CI and the installed release surface',()=>{
 const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
 const {IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.equal(classifyTestFile(__filename),'unit');
 assert.equal(includesSuite(__filename,'unit'),true);assert.equal(includesSuite(__filename,'all'),true);
 assert.equal(IMAGE_EDITABLE_RELEASE_FILES.includes('packages/remote-mcp-server/scene-provider-endpoint.js'),true);
});
