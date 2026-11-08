'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/native-layer-application.cjs');
const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
const {captureNativeLayerBinding}=require('../packages/slideclone-core/scene-plan/native-layer-binding');
const {createApprovedNativeLayerApplication}=require('../packages/slideclone-core/scene-plan/native-layer-application');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const builder=workDir=>JSON.parse(fs.readFileSync(path.join(workDir,'ir/deck.json'),'utf8'));
const request=(f,metadata={})=>({root:f.root,metadata:{inputFile:f.sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:10,heightPx:8},...metadata},ocr:{lines:[]},isCancellationRequested:async()=>false});
test('normal raw composition applies a synthetic approved layer before its actual final audits',async t=>{
 const f=fixture(t);let calls=0,strict;
 const rebuild=createRawImageNativeRebuilder({rebuildDeckFromWorkDir:builder,applyApprovedFrames:async context=>{
  calls++;const page=context.deck.pages[0];
  // All emitted data and approval in this test are synthetic. No production
  // manifest or source measurement authority is installed by this fixture.
  const sourceHash=f.page.source.sourceScene.sourceHash;
  page.source={...page.source,sourceScene:{sourceHash}};page.shapes.push(...structuredClone(f.page.shapes));page.textBoxes.push(...structuredClone(f.page.textBoxes));
  const binding=captureNativeLayerBinding(context),review={version:1,reviewId:'synthetic-raw-layer-review',sourceHash,pageFingerprint:binding.pageFingerprint,
   addedShapes:[{id:'synthetic-background',type:'rect',box:{x:0,y:0,w:context.deck.slideSize.widthPt,h:context.deck.slideSize.heightPt},style:{fill:'#EEEEEE',stroke:'none'}}],
   shapeOrder:['synthetic-background',...page.shapes.map(s=>s.id)],shapeChanges:[{id:'card',beforeFingerprint:fingerprint(page.shapes.find(s=>s.id==='card')),style:{fill:'#DDDDDD',stroke:'none'}}],removedImageIds:[],textChanges:[]};
  strict=context.deck.meta.sourceSceneCompilation;
  return createApprovedNativeLayerApplication({version:1,approvalId:'synthetic-raw-layer',binding,review})(context);
 }});
 const result=await rebuild(request(f));assert.equal(calls,1);assert.equal(result.deck.pages[0].shapes[0].id,'synthetic-background');
 assert.equal(result.deck.meta.sourceSceneCompilation,strict);assert.equal(result.deck.meta.approvedNativeLayers.changes.changedShapes,1);
 assert.equal(typeof result.nativeComponentQuality.passed,'boolean');assert.equal(result.deck.meta.nativeComponentQuality,result.nativeComponentQuality);
 assert.equal(result.deck.meta.approvedNativeLayers.strictSourceEquivalent,false);
});
test('serialized job flags and layer bundles never install a native layer application',async t=>{
 const f=fixture(t);let calls=0;
 const result=await createRawImageNativeRebuilder({rebuildDeckFromWorkDir:builder})(request(f,{approvedNativeLayers:{approved:true},applyApprovedFrames:()=>calls++}));
 assert.equal(calls,0);assert.equal(result.deck.meta.approvedNativeLayers,undefined);
});
