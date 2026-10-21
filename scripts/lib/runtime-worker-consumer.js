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
  stage='worker-fixture';
  temporary=fs.mkdtempSync(path.join(parent,'common-tools-installed-worker-'));
  const {writePng}=require(path.join(root,'packages/slideclone-core/png.js'));
  const fixture=name=>{
   const directory=path.join(temporary,name);fs.mkdirSync(directory);const inputFile=path.join(directory,'source.png');
   writePng(inputFile,{width:100,height:100,rgba:Buffer.alloc(40000,255)});
   return {root:directory,metadata:{inputFile,assetPath:'assets/source.png',dimensions:{widthPx:100,heightPx:100}},
    ocr:{lines:Array.from({length:38},(_,i)=>({text:'fixture'+i,confidence:.8,box:{x:10,y:10,w:30,h:10}}))},isCancellationRequested:async()=>false};
  };
  const sizes=[];let globals=0,generated=0;
  stage='worker-factory';
  const configured=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{COMMON_TOOLS_IMAGE_SCENE_REVIEW_BATCHES:'2'},
   sceneVision:async request=>{
    if(request.task==='structure'){globals++;return {reviews:[],missingText:[]};}
    sizes.push([...request.localTargets.reviews]);return {reviews:request.localTargets.reviews.map(index=>({index,kind:'text'})),recoveredText:[]};
   },loadImplementation:()=>({rebuildDeckFromWorkDir(work){generated++;return JSON.parse(fs.readFileSync(path.join(work,'ir/deck.json'),'utf8'));}})});
  stage='worker-reconstruction';const result=await configured(fixture('configured'));
  stage='worker-consumer-assertions';
  assert.equal(globals,1);assert.equal(generated,1);assert.deepEqual(sizes.map(row=>row.length),[32,32,6,6]);
  assert.deepEqual([...sizes[0],...sizes[2]],Array.from({length:38},(_,i)=>i));
  assert.deepEqual(sizes[0],sizes[1]);assert.deepEqual(sizes[2],sizes[3]);
  assert.equal(result.deck.meta.sourceSceneReview.reviewed,38);assert.equal(result.deck.meta.sourceSceneReview.reviewAllocation.batchCount,2);
  let unconfiguredCalls=0,unconfiguredGenerated=0;
  stage='worker-default-budget';
  const unconfigured=createNativeRebuilder({rawImageOcrProfile:{kind:'umi'}},{environment:{},
   sceneVision:async()=>{unconfiguredCalls++;return {reviews:[],missingText:[]};},
   loadImplementation:()=>({rebuildDeckFromWorkDir(){unconfiguredGenerated++;throw Error();}})});
  await assert.rejects(unconfigured(fixture('default')),error=>error.code==='SCENE_REVIEW_CAPACITY_EXCEEDED'&&error.limitTargets===32);
  assert.equal(unconfiguredCalls,0);assert.equal(unconfiguredGenerated,0);
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
