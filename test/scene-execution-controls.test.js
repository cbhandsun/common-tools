'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {readSceneExecutionControls:read}=require('../packages/remote-mcp-server/scene-execution-controls');
const {sceneVisionFromEnvironment}=require('../packages/remote-mcp-server/source-scene-client');
const {createNativeRebuilder}=require('../packages/remote-mcp-server/bin/common-tools-team-image-worker');
const {writePng}=require('../packages/slideclone-core/png');
const {classifyTestFile,includesSuite}=require('../scripts/test-suites');
const {spawnSync}=require('node:child_process');
const batch='COMMON_TOOLS_IMAGE_SCENE_REVIEW_BATCHES',timeout='COMMON_TOOLS_IMAGE_SCENE_GLOBAL_TIMEOUT_MS';
test('isolated execution controls preserve defaults and copy only explicit own data',()=>{
 assert.deepEqual(read({}),{reviewBatches:1,globalTimeoutMs:60000});
 const environment={[batch]:'16',[timeout]:'90000',get UNRELATED_SECRET(){throw Error('private');}};
 const result=read(environment);environment[batch]='1';
 assert.deepEqual(result,{reviewBatches:16,globalTimeoutMs:90000});assert(Object.isFrozen(result));
 assert.deepEqual(read(Object.create(null)),read({}));
});
test('empty illegal extreme and hostile execution controls fail before running caller code',()=>{
 for(const value of ['',null,0,1,1.5,true,{},'0','17','01',' 2','2 ','1e1','9'.repeat(10000)])
  assert.throws(()=>read({[batch]:value}),/execution configuration is invalid/);
 for(const value of ['',null,60000,90000,{},'120000','60001',' 90000','90000\0'])
  assert.throws(()=>read({[timeout]:value}),/execution configuration is invalid/);
 let calls=0;const hostile=new Proxy({},{get(){calls++;throw Error('private');},getPrototypeOf(){calls++;throw Error('private');}});
 for(const value of [null,undefined,1,[],new Uint8Array(1),new Map(),hostile,Object.create({[batch]:'16'})])assert.throws(()=>read(value),TypeError);
 for(const key of [batch,timeout])assert.throws(()=>read({get [key](){calls++;throw Error('private');}}),TypeError);
 assert.equal(calls,0);
 for(const key of ['COMMON_TOOLS_IMAGE_SCENE_ENDPOINT','COMMON_TOOLS_IMAGE_SCENE_MODEL','COMMON_TOOLS_IMAGE_SCENE_TOKEN','COMMON_TOOLS_IMAGE_SCENE_JSON_OUTPUT']){
  assert.throws(()=>sceneVisionFromEnvironment({get [key](){calls++;throw Error('private');}}),/configuration is invalid/);
  assert.throws(()=>sceneVisionFromEnvironment({[key]:{toString(){calls++;throw Error('private');}}}),/configuration is invalid/);
 }
 assert.equal(calls,0);
});
test('configured global deadline reaches real transport while both calls retain standard token and local limits',async t=>{
 const environment={COMMON_TOOLS_IMAGE_SCENE_ENDPOINT:'http://127.0.0.1:3084/v1/chat/completions',COMMON_TOOLS_IMAGE_SCENE_MODEL:'test-model',
  COMMON_TOOLS_IMAGE_SCENE_TOKEN:'test-only',[batch]:'2',[timeout]:'90000'};
 const delays=[],original=setTimeout;let calls=0;
 t.mock.method(globalThis,'setTimeout',(callback,delay,...args)=>{delays.push(delay);return original(callback,delay,...args);});
 t.mock.method(globalThis,'fetch',async(_url,init)=>{
  calls++;const body=JSON.parse(init.body);assert.equal(body.max_tokens,6000);assert.equal(body.model,'test-model');
  return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}));
 });
 const client=sceneVisionFromEnvironment(environment),request={prompt:'fixture',images:[{bytes:Buffer.alloc(8),label:'fixture'}],isCancellationRequested:async()=>false};
 await client({...request,task:'structure'});await client({...request,task:'classify-ocr'});
 assert.equal(calls,2);assert.deepEqual(delays,[90000,60000]);
 assert.equal(sceneVisionFromEnvironment({}),undefined);
 assert.throws(()=>sceneVisionFromEnvironment({[batch]:'2'}),/configuration is incomplete/);
 assert.throws(()=>sceneVisionFromEnvironment({[timeout]:'90000'}),/configuration is incomplete/);
});
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-factory-batches-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const inputFile=path.join(root,'source.png');writePng(inputFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 return {root,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:100,heightPx:100}},
  ocr:{lines:Array.from({length:38},(_,i)=>({text:'fixture'+i,confidence:.8,box:{x:10,y:10,w:30,h:10}}))},isCancellationRequested:async()=>false};
}
test('the actual Worker factory consumes all 38 targets through explicit isolated environment with no export replacement',async t=>{
 const request=fixture(t),batches=[];let generated=0,globals=0;
 const rebuild=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{[batch]:'2'},sceneVision:async input=>{
  if(input.task==='structure'){globals++;return {reviews:[],missingText:[]};}
  batches.push([...input.localTargets.reviews]);return {reviews:input.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
 },loadImplementation:()=>({rebuildDeckFromWorkDir(work){generated++;return JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));}})});
 const result=await rebuild(request);
 assert.equal(generated,1);assert.equal(globals,1);assert.deepEqual(batches.map(b=>b.length),[32,32,6,6]);
 assert.equal(result.deck.meta.sourceSceneReview.reviewed,38);assert.equal(result.deck.meta.sourceSceneReview.reviewAllocation.batchCount,2);
 assert.deepEqual([...batches[0],...batches[2]],Array.from({length:38},(_,i)=>i));
});
test('default Worker factory cannot silently grant an extra pair to 38 targets',async t=>{
 const request=fixture(t);let calls=0,generated=0;
 const rebuild=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{},sceneVision:async()=>{calls++;return {reviews:[],missingText:[]};},
  loadImplementation:()=>({rebuildDeckFromWorkDir(){generated++;throw Error('must not rebuild');}})});
 await assert.rejects(rebuild(request),error=>error.code==='SCENE_REVIEW_CAPACITY_EXCEEDED'&&error.limitTargets===32);assert.equal(generated,0);assert.equal(calls,0);
});
test('execution-control regressions remain in the unified unit and all suites',()=>{
 assert.equal(classifyTestFile(__filename),'unit');assert(includesSuite(__filename,'unit'));assert(includesSuite(__filename,'all'));
});
test('the scene client cold-loads in an installed layout without development workspace aliases',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'scene-installed-layout-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const packages=path.join(root,'packages');fs.mkdirSync(packages);const remote=path.join(packages,'remote-mcp-server');fs.mkdirSync(remote);
 const workspace=path.resolve(__dirname,'..');
 fs.cpSync(path.join(workspace,'packages/slideclone-core'),path.join(packages,'slideclone-core'),{recursive:true,
  filter:file=>!file.split(path.sep).includes('node_modules')});
 for(const name of ['source-scene-client','scene-execution-controls','scene-execution-policy','scene-model-request-options','scene-response-content','scene-request-failure'])
  fs.copyFileSync(path.join(workspace,'packages/remote-mcp-server',name+'.js'),path.join(remote,name+'.js'));
 const probe="try{const c=require(process.argv[1]);if(c.sceneVisionFromEnvironment({})!==undefined)throw Error();process.stdout.write('ready');}catch(e){process.stdout.write(['MODULE_NOT_FOUND','ERR_PACKAGE_PATH_NOT_EXPORTED'].includes(e.code)?e.code:'entry-failed');process.exitCode=2;}";
 const result=spawnSync(process.execPath,['-e',probe,path.join(remote,'source-scene-client.js')],{cwd:root,encoding:'utf8',windowsHide:true,timeout:30000});
 assert.equal(result.status,0,result.stdout);assert.equal(result.stdout,'ready');
});
