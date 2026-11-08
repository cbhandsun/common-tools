// @ts-check
'use strict';
/** Executed in an independent installed-package child process. The actual
 * complete Worker export and factory run; only recognizer/renderer adapters
 * use deterministic fixtures. No service, model, OCR or Office is started.
 * The child never prints exception messages, provider output or fixture text.
 */
function sceneWorkerConsumerProbe(){return String.raw`
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
 const root=path.resolve(process.argv[1]),parent=fs.realpathSync(os.tmpdir());
 let temporary,stage='worker-cold-load';
 try{
  const {createNativeRebuilder}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  assert.equal(typeof createNativeRebuilder,'function');
  stage='worker-native-engine-cold-load';
  const actualNative=require(path.join(root,'packages/slideclone-native-engine')).loadNativeImageRebuilder();
  assert.equal(typeof actualNative.rebuildDeckFromWorkDir,'function');
  stage='worker-fixture';
  temporary=fs.mkdtempSync(path.join(parent,'common-tools-installed-worker-'));
  const {writePng}=require(path.join(root,'packages/slideclone-core/png.js'));
  const fixture=name=>{
   const directory=path.join(temporary,name);fs.mkdirSync(directory);const inputFile=path.join(directory,'source.png');
   writePng(inputFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
   return {root:directory,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:100,heightPx:100}},
    ocr:{lines:Array.from({length:38},(_,i)=>({text:'fixture'+i,confidence:.8,box:{x:10,y:10,w:30,h:10}}))},isCancellationRequested:async()=>false};
  };
  const sizes=[],approvedModes=[];let globals=0,generated=0;
  stage='worker-factory';
  const configured=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'},connectorCornerMode:'rounded-freeform'},{environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_BATCHES:'2'},
   sceneVision:async request=>{
    if(request.task==='structure'){globals++;return {reviews:[],missingText:[]};}
    sizes.push([...request.localTargets.reviews]);return {reviews:request.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
   },applyApprovedFrames:async context=>{
    approvedModes.push(context.connectorCornerMode);
    const {issueApprovedFrameApplication}=require(path.join(root,'packages/slideclone-core/scene-plan/approved-frame-application-lifecycle.js'));
    return issueApprovedFrameApplication(context,{commit(){},rollback(){assert.fail('unexpected rollback');}});
   },loadImplementation:()=>({rebuildDeckFromWorkDir(work){generated++;return JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));}})});
  stage='worker-reconstruction';const result=await configured(fixture('configured'));
  stage='worker-consumer-assertions';
  assert.equal(globals,1);assert.equal(generated,1);assert.deepEqual(sizes.map(row=>row.length),[32,32,6,6]);
  assert.deepEqual([...sizes[0],...sizes[2]],Array.from({length:38},(_,i)=>i));
  assert.deepEqual(sizes[0],sizes[1]);assert.deepEqual(sizes[2],sizes[3]);
  assert.equal(result.deck.meta.sourceSceneReview.reviewed,38);assert.equal(result.deck.meta.sourceSceneReview.reviewAllocation.batchCount,2);
  assert.deepEqual(approvedModes,['rounded-freeform']);
  let unconfiguredCalls=0,unconfiguredGenerated=0;
  stage='worker-default-budget';
  const unconfigured=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{},
   sceneVision:async()=>{unconfiguredCalls++;return {reviews:[],missingText:[]};},
   loadImplementation:()=>({rebuildDeckFromWorkDir(){unconfiguredGenerated++;throw Error();}})});
  await assert.rejects(unconfigured(fixture('default')),error=>error.code==='SCENE_REVIEW_CAPACITY_EXCEEDED'&&error.limitTargets===32);
  assert.equal(unconfiguredCalls,0);assert.equal(unconfiguredGenerated,0);
  stage='worker-output-policy';
  const {workerSettings}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  assert.equal(workerSettings({OPENXML_BUILDER_EXE:process.execPath}).outputPolicy,'source-fidelity');
  const policySettings=workerSettings({OPENXML_BUILDER_EXE:process.execPath,COMMON_TOOLS_IMAGE_OUTPUT_POLICY:'semantic-native'});
  assert.equal(policySettings.outputPolicy,'semantic-native');
  stage='worker-deployment-policy';
  const {readImageReconstructionPolicy,assertResolvedImageReconstructionPolicy}=require(path.join(root,'packages/cli/image-reconstruction-policy.js'));
  const selectedPolicy=readImageReconstructionPolicy({COMMON_TOOLS_IMAGE_OUTPUT_POLICY:'semantic-native'});
  assert.deepEqual(selectedPolicy,{outputPolicy:'semantic-native',connectorCornerMode:'reroutable-elbow'});
  assert.throws(()=>assertResolvedImageReconstructionPolicy({},selectedPolicy),/reconstruction policy does not match/u);
  assert.throws(()=>readImageReconstructionPolicy({COMMON_TOOLS_IMAGE_OUTPUT_POLICY:''}),/reconstruction policy is invalid/u);
  const {startupFailureCode}=require(path.join(root,'packages/remote-mcp-server/bin/common-tools-team-image-worker.js'));
  assert.equal(startupFailureCode(new TypeError('native-output-policy-invalid')),'invalid-configuration');
  const semantic=createNativeRebuilder({...policySettings,rawImageOcrProfile:{kind:'umi'}},{environment:{},sceneVision:null,
   loadImplementation:()=>({rebuildDeckFromWorkDir:work=>JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'))})});
  await assert.rejects(semantic(fixture('output-policy')),/semantic-native-output-incomplete/u);
  stage='ready';
 }catch{process.exitCode=2;}
 finally{
  if(temporary){
   if(path.dirname(temporary)!==parent||!path.basename(temporary).startsWith('common-tools-installed-worker-')){stage='worker-cleanup';process.exitCode=2;}
   else try{fs.rmSync(temporary,{recursive:true,force:true,maxRetries:3,retryDelay:100});}catch{stage='worker-cleanup';process.exitCode=2;}
  }
 }
 process.stdout.write(stage);
})().catch(()=>{process.stdout.write('worker-consumer-failed');process.exitCode=2;});
`;}
module.exports={sceneWorkerConsumerProbe};
