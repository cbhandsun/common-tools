'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {workerSettings,startupFailureCode}=require('../packages/remote-mcp-server/bin/common-tools-team-image-worker');
const {createImageWorkerSettings}=require('../packages/remote-mcp-server/image-worker-settings');
const {createNativeRebuilder}=require('../packages/remote-mcp-server/image-native-rebuilder');
const {createTemporaryTestDirectory,removeTemporaryTestDirectory}=require('./helpers/temporary-directory.cjs');
const key='COMMON_TOOLS_IMAGE_OUTPUT_POLICY',base={OPENXML_BUILDER_EXE:process.execPath};

test('Worker output policy is configurable while preserving the existing default',()=>{
 assert.equal(workerSettings(base).outputPolicy,'source-fidelity');
 for(const policy of ['source-fidelity','semantic-native'])assert.equal(workerSettings({...base,[key]:policy}).outputPolicy,policy);
});

test('startup diagnostics report invalid reconstruction policy as configuration without echoing input',()=>{
 assert.throws(()=>workerSettings(null),error=>startupFailureCode(error)==='invalid-configuration');
 for(const [name,value]of [[key,'private-do-not-echo'],['COMMON_TOOLS_IMAGE_CONNECTOR_CORNER_MODE','private-do-not-echo']]){
  assert.throws(()=>workerSettings({...base,[name]:value}),error=>{
   assert.equal(startupFailureCode(error),'invalid-configuration');
   assert.doesNotMatch(error.message,/private-do-not-echo/u);return true;
  });
 }
});

test('invalid output policy rejects before profile IO and never evaluates or echoes hostile environment values',()=>{
 let profiles=0,calls=0;
 const profile=()=>{profiles++;return {enabled:false};};
 const settings=createImageWorkerSettings({paddleProfileName:'test',readPaddleProfile:profile,readRawProfile:profile});
 const marker='private-do-not-echo';
 for(const value of ['',null,false,{},marker,'x'.repeat(4097),'semantic-native\0'])
  assert.throws(()=>settings({...base,[key]:value}),error=>error instanceof TypeError&&!error.message.includes(marker));
 const getter={...base};Object.defineProperty(getter,key,{get(){calls++;throw Error(marker);}});
 const proxy=new Proxy({...base},{get(){calls++;throw Error(marker);},getOwnPropertyDescriptor(){calls++;throw Error(marker);}});
 for(const input of [getter,proxy])assert.throws(()=>settings(input),TypeError);
 assert.equal(profiles,0);assert.equal(calls,0);
 const inherited=Object.assign(Object.create({get [key](){calls++;throw Error(marker);}}),base);
 assert.equal(settings(inherited).outputPolicy,'source-fidelity');assert.equal(calls,0);
});

test('server factory passes configured output policy to reconstruction and explicit overrides remain validated',async t=>{
 const root=createTemporaryTestDirectory('output-policy-config-');t.after(()=>removeTemporaryTestDirectory(root));
 const {writePng}=require('../packages/slideclone-core/png');
 const inputFile=path.join(root,'source.png');writePng(inputFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
 let generated=0,loaded=0;
 const options={environment:{},sceneVision:null,loadImplementation(){loaded++;return {rebuildDeckFromWorkDir(work){
  generated++;return JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));
 }};}};
 const settings={rawImageOcrProfile:{kind:'umi'},outputPolicy:'semantic-native'};
 let index=0;
 const request=()=>{const directory=path.join(root,'case-'+index++);fs.mkdirSync(directory);
  return {root:directory,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:100,heightPx:100}},ocr:{lines:[]},isCancellationRequested:async()=>false};};
 // No complete scene inventory exists here. The configured semantic path
 // must refuse publication, rather than silently fall back to fidelity.
 await assert.rejects(createNativeRebuilder(settings,options)(request()),/semantic-native-output-incomplete/u);
 assert.equal(generated,1);
 const result=await createNativeRebuilder(settings,{...options,outputPolicy:'source-fidelity'})(request());
 assert.equal(result.deck.meta.nativeOutputSelection,undefined);
 await assert.rejects(createNativeRebuilder({...settings,outputPolicy:'source-fidelity'},{...options,outputPolicy:'semantic-native'})(request()),/semantic-native-output-incomplete/u);
 const before=loaded;
 for(const policy of ['',null,'private-do-not-echo',{}]){
  assert.throws(()=>createNativeRebuilder({...settings,outputPolicy:policy},options),/native-output-policy-invalid/u);
  assert.throws(()=>createNativeRebuilder(settings,{...options,outputPolicy:policy}),/native-output-policy-invalid/u);
 }
 assert.equal(loaded,before);
});

test('output policy configuration regressions enter unified unit and all CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.replaceAll('\\','/')==='test/native-output-policy-config.test.js'));
});

test('configured semantic output reaches actual scene planning, compilation and final publication',async t=>{
 const root=createTemporaryTestDirectory('output-policy-complete-');t.after(()=>removeTemporaryTestDirectory(root));
 const {writePng}=require('../packages/slideclone-core/png');
 const inputFile=path.join(root,'source.png'),image={width:100,height:100,rgba:Buffer.alloc(40000,255)};
 for(let y=20;y<80;y++)for(let x=20;x<80;x++)image.rgba.set([200,225,245,255],(y*100+x)*4);
 writePng(inputFile,image);
 const settings={...workerSettings({...base,[key]:'semantic-native'}),rawImageOcrProfile:{kind:'umi'}};
 let calls=0;
 const reconstruct=createNativeRebuilder(settings,{environment:{},sceneVision:async request=>{
  calls++;
  if(request.task!=='structure'){
   assert.equal(request.task,'classify-ocr');const targets=request.localTargets;
   return {reviews:targets.reviews.map(index=>({index,kind:'text'})),recoveredText:targets.missing.map(index=>({index,text:null,confidence:0})),
    structures:(targets.structures??[]).map(index=>({index,kind:'container',confidence:.99,regionId:'region-root',box_2d:null})),
    inventories:(targets.inventories??[]).map(index=>({index,kind:'unknown',confidence:0,regionId:null,box_2d:null})),
    regionInventories:(targets.regionInventories??[]).map(index=>({index,units:[],relations:[]}))};
  }
  return {reviews:[],missingText:[],scene:{coordinateSpace:'source-pixels',
   regions:[{id:'root',parentId:null,kind:'diagram',box:{x:0,y:0,w:100,h:100}}],
   objects:[{id:'a',regionId:'root',kind:'container',pictorialContent:'absent',box:{x:20,y:20,w:60,h:60}}],
   relations:[],inventory:[['root',1,0,0]],programs:[{regionId:'root',objects:['a'],relations:[],labels:[]}]}};
 },loadImplementation:()=>({rebuildDeckFromWorkDir:work=>JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'))})});
 const result=await reconstruct({root,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:100,heightPx:100}},ocr:{lines:[]},isCancellationRequested:async()=>false});
 assert.equal(calls,3);assert.equal(result.deck.meta.nativeOutputSelection.policy,'semantic-native');
 assert.equal(result.deck.meta.nativeOutputSelection.semanticEditability.passed,true);
 assert.equal(result.nativeComponentQuality.passed,true);
 assert.equal(result.deck.meta.sourceSceneCompilation.regionPrograms.coverage.regions.completed,1);
 assert.ok(result.deck.pages[0].shapes.length>0);
});
