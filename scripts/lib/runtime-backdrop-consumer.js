// @ts-check
'use strict';
/** Probe the installed host API, sparse pixel output and the normal raw
 * reconstruction lifecycle. Logs expose only a fixed failing stage code. */
function approvedBackdropConsumerProbe(){return String.raw`
(async()=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),assert=require('node:assert/strict');
 const root=path.resolve(process.argv[1]);let temporary,stage='backdrop-cold-load';
 try{
  const core=name=>require(path.join(root,'packages/slideclone-core',name));
  const {createApprovedBackdropPixelReplay,composeApprovedAssetApplications}=core('scene-plan/approved-frame-reconstruction');
  const {backdropImageFingerprint,backdropPageFingerprint}=core('scene-plan/approved-backdrop-pixel-input');
  const {fingerprint}=core('scene-plan/approved-frame-application-input');
  const {issueApprovedFrameApplication}=core('scene-plan/approved-frame-application-lifecycle');
  const {writePng,readPng}=core('png'),{createRawImageNativeRebuilder}=core('team-native-rebuild');
  const {recordSharedResidualChecks}=core('scene-plan/approved-backdrop-budget');
  stage='backdrop-fixture';temporary=fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()),'common-tools-installed-backdrop-'));
  fs.mkdirSync(path.join(temporary,'assets'));
  const sourceFile=path.join(temporary,'assets/source.png');writePng(sourceFile,{width:8,height:6,rgba:Buffer.alloc(192,255)});
  const rgba=Buffer.alloc(192,255);rgba[7]=0;writePng(path.join(temporary,'assets/residual.png'),{width:8,height:6,rgba});
  const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');let committed=0;
  const first=async context=>issueApprovedFrameApplication(context,{commit(){committed++;},rollback(){}});
  const pixel=async context=>{
   const page=context.deck.pages[0],image={id:'reviewed-residual',assetPath:'assets/residual.png',
    box:{x:0,y:0,w:context.deck.slideSize.widthPt,h:context.deck.slideSize.heightPt}};page.images.push(image);
   const source={width:8,height:6,sha256:hash(sourceFile)},pixels=[{cell:1,color:[11,22,33],kind:'source-interpolation'}];
   const review={approvalId:'installed-host-fixture',source,pixels,scopeFingerprint:fingerprint({source,pixels}),
    pageFingerprint:backdropPageFingerprint(context.deck,page),assets:[{imageId:image.id,beforeSha256:hash(path.join(temporary,image.assetPath)),imageFingerprint:backdropImageFingerprint(image)}]};
   const replay=createApprovedBackdropPixelReplay(review,{root:temporary,deck:context.deck});
   page.shapes.find(item=>item.id==='complete-line').style={stroke:'#123456'};
   return replay(context);
  };
  const rebuild=createRawImageNativeRebuilder({rebuildDeckFromWorkDir:workDir=>{
   const deck=JSON.parse(fs.readFileSync(path.join(workDir,'ir/deck.json'),'utf8'));recordSharedResidualChecks(321);
   deck.pages[0].shapes.push({id:'complete-line',type:'line',box:{x:1,y:1,w:2,h:0},source:{editable:true}});return deck;
  },applyApprovedFrames:composeApprovedAssetApplications(first,pixel)});
  stage='backdrop-raw-consume';const result=await rebuild({root:temporary,
   metadata:{inputFile:sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:8,heightPx:6}},ocr:{lines:[]},isCancellationRequested:async()=>false});
  const report=result.deck.meta.approvedRouteBackdrop,image=result.deck.pages[0].images.find(item=>item.id==='reviewed-residual');
  assert.equal(committed,1);assert.equal(report.uniqueSourcePixels,1);assert.equal(report.changedAssetPixels,1);assert.equal(report.budget.sourceChecks,321);
  assert.equal(report.strictMeasurement,false);assert.equal(report.wholeProductAcceptance,false);
  assert.equal(report.compatibility.approvalExpanded,false);assert.equal(report.compatibility.verifiedAssetTargets,1);
  assert.notEqual(report.compatibility.originalPageFingerprint,report.compatibility.appliedPageFingerprint);
  stage='backdrop-pixel-consume';const actual=readPng(path.join(temporary,image.assetPath));assert.deepEqual([...actual.rgba.subarray(4,8)],[11,22,33,255]);
  for(let n=0;n<actual.rgba.length;n++)if(n<4||n>=8)assert.equal(actual.rgba[n],rgba[n]);
  assert.equal(result.metrics.connectors,1);stage='ready';
 }catch{process.exitCode=2;}
 finally{if(temporary){
  try{const parent=fs.realpathSync(os.tmpdir());if(path.dirname(path.resolve(temporary))!==parent||!path.basename(temporary).startsWith('common-tools-installed-backdrop-'))throw Error('backdrop-cleanup-boundary');fs.rmSync(temporary,{recursive:true,force:true});}
  catch{stage='backdrop-cleanup';process.exitCode=2;}
 }}
 process.stdout.write(stage);
})().catch(()=>{process.stdout.write('backdrop-consumer-failed');process.exitCode=2;});
`;}
module.exports={approvedBackdropConsumerProbe};
