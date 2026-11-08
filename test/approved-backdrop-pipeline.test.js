'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/approved-backdrop-pixels.cjs');
const {createRawImageNativeRebuilder}=require('../packages/slideclone-core/team-native-rebuild');
const {createApprovedBackdropPixelApplication:create}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application');
const {backdropPageFingerprint,backdropImageFingerprint}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-input');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {recordSharedResidualChecks}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');

function builder(workDir){const deck=JSON.parse(fs.readFileSync(path.join(workDir,'ir/deck.json'),'utf8'));
 deck.pages[0].shapes.push({id:'line',type:'line',box:{x:1,y:1,w:5,h:0},source:{editable:true}});recordSharedResidualChecks(125);return deck;}
function request(f,metadata={}){return {root:f.root,metadata:{inputFile:f.sourceFile,assetPath:'assets/source.png',dimensions:{widthPx:10,heightPx:8},...metadata},ocr:{lines:[]},isCancellationRequested:async()=>false};}
test('normal raw pipeline installs only a host pixel service and retains source costs through the final audit',async t=>{
 const f=fixture(t);let calls=0;
 const rebuild=createRawImageNativeRebuilder({rebuildDeckFromWorkDir:builder,applyApprovedFrames:async context=>{
  calls++;assert.equal(context.deck.meta.nativeComponentQuality,undefined);
  // A small integration fixture builds the exact host review for the emitted page.
  const page=context.deck.pages[0],image=structuredClone(f.page.images[0]);
  image.box={x:0,y:0,w:context.deck.slideSize.widthPt,h:context.deck.slideSize.heightPt};page.images.push(image);
  const review={...f.review,assets:[{...f.review.assets[0],imageFingerprint:backdropImageFingerprint(image)}],pageFingerprint:backdropPageFingerprint(context.deck,page)};
  return create(review)(context);
 }});
 const result=await rebuild(request(f));assert.equal(calls,1);assert.equal(result.deck.meta.approvedRouteBackdrop.uniqueSourcePixels,3);
 assert.equal(result.deck.meta.approvedRouteBackdrop.budget.sourceChecks,125);assert.equal(result.metrics.connectors,1);
 assert.equal(typeof result.nativeComponentQuality.passed,'boolean');
});
test('serialized job markers and caller-supplied budget counters cannot activate or discount the host service',async t=>{
 const f=fixture(t);let calls=0;
 const rebuild=createRawImageNativeRebuilder({rebuildDeckFromWorkDir:builder});
 const result=await rebuild(request(f,{applyApprovedFrames:()=>calls++,approvedRouteBackdrop:f.review,approvedBackdropPixels:f.review,sourceChecks:0,maximum:Infinity}));
 assert.equal(calls,0);assert.equal(result.deck.meta.approvedRouteBackdrop,undefined);assert.deepEqual(f.directories(),[]);
 assert.equal(fingerprint(f.review.source),fingerprint({width:10,height:8,sha256:f.hash(f.sourceFile)}));
});
