'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/approved-backdrop-pixels.cjs');
const {snapshot}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createApprovedBackdropPixelReplay:create}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-replay');
const {finalizeWithApprovedFrames:finalize}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {withApprovedBackdropBudget,recordSharedResidualChecks}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const {writePng}=require('../packages/slideclone-core/png');

function setup(t){
 const f=fixture(t),ancestor={root:f.root,deck:structuredClone(f.deck)};
 const app=create(f.review,ancestor);
 // Current reconstruction may legitimately improve unrelated native content
 // or residual pixels. Preserve separate original bytes for verification.
 for(const image of f.page.images){
  const previous=path.join(f.root,image.assetPath),next='assets/current-'+image.id+'.png';
  fs.copyFileSync(previous,path.join(f.root,next));image.assetPath=next;
  if(image.style)image.style.assetPath=next;
  image.source={measurement:'current'};
 }
 f.page.shapes[0].style.fill='#123456';f.page.textBoxes[0].text='source-backed revision';
 return {...f,ancestor,app,runReplay:(finish=()=>true,checks=0)=>withApprovedBackdropBudget(()=>{
  recordSharedResidualChecks(checks);return finalize(app,f.context,finish);
 })};
}
test('approved sparse replay survives unrelated reconstruction changes while the original exact service still rejects',async t=>{
 const f=setup(t),before=snapshot(f.deck),geometry=snapshot({shapes:f.page.shapes,textBoxes:f.page.textBoxes});
 await assert.rejects(f.run(),/page-binding/u);assert.equal(snapshot(f.deck),before);
 const raster=f.readPng(path.join(f.root,f.page.images[0].assetPath));raster.rgba[40*4]=77;
 writePng(path.join(f.root,f.page.images[0].assetPath),raster);
 await f.runReplay();
 const result=f.readPng(path.join(f.root,f.page.images[0].assetPath)),report=f.deck.meta.approvedRouteBackdrop;
 assert.equal(result.rgba[40*4],77);assert.deepEqual([...result.rgba.subarray(0,4)],[10,20,30,255]);
 assert.equal(report.uniqueSourcePixels,3);assert.equal(report.changedAssetPixels,5);
 assert.equal(report.compatibility.originalPageFingerprint,f.review.pageFingerprint);
 assert.notEqual(report.pageFingerprint,f.review.pageFingerprint);assert.equal(report.compatibility.approvalExpanded,false);
 assert.equal(report.compatibility.verifiedAssetTargets,5);assert.equal(report.sourceErasure,false);
 assert.equal(snapshot({shapes:f.page.shapes,textBoxes:f.page.textBoxes}),geometry);
 assert.equal(f.deck.meta.sourceSceneCompilation.passed,false);
});
test('replay rejects altered target bytes including RGB hidden beneath alpha zero and newly eligible overlap pixels',async t=>{
 for(const mode of ['rgb','opaque','partial','overlap-rgb']){
  const f=setup(t),image=f.page.images[mode==='overlap-rgb'?1:0],file=path.join(f.root,image.assetPath),r=f.readPng(file);
  if(mode==='opaque')r.rgba[3]=255;else if(mode==='partial')r.rgba[3]=1;else r.rgba[0]^=1;
  writePng(file,r);const before=snapshot(f.deck);await assert.rejects(f.runReplay(),/target-changed/u);
  assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
 const f=fixture(t),r=f.readPng(path.join(f.root,'assets/overlap.png'));r.rgba[3]=255;writePng(path.join(f.root,'assets/overlap.png'),r);f.rebind();
 const app=create(f.review,{root:f.root,deck:f.deck});r.rgba[3]=0;
 f.page.images[1].assetPath='assets/current-overlap.png';writePng(path.join(f.root,'assets/current-overlap.png'),r);
 await assert.rejects(withApprovedBackdropBudget(()=>finalize(app,f.context,()=>true)),/target-changed/u);
});
test('missing, duplicate, transformed, cropped or aliased current assets cannot inherit an old approval',async t=>{
 for(const mode of ['missing','duplicate','box','opacity','crop','alias','slide','traversal']){
  const f=setup(t),image=f.page.images[0];
  if(mode==='missing')f.page.images.shift();
  if(mode==='duplicate')f.page.images.push(structuredClone(image));
  if(mode==='box')image.box.x=.1;
  if(mode==='opacity')image.style.opacity=.5;
  if(mode==='crop')image.crop={left:.1};
  if(mode==='alias')image.style.assetPath='assets/source.png';
  if(mode==='slide')f.deck.slideSize.widthPt=11;
  if(mode==='traversal')image.assetPath='../outside.png';
  const before=snapshot(f.deck);await assert.rejects(f.runReplay());assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('original review and bytes stay bound and caller mutation cannot change replay scope',async t=>{
 const f=setup(t);f.review.pixels[0].color[0]=99;f.review.pixels.length=0;f.ancestor.deck.pages[0].shapes=[];
 await f.runReplay();assert.equal(f.readPng(path.join(f.root,f.page.images[0].assetPath)).rgba[0],10);
 const g=setup(t);fs.appendFileSync(path.join(g.root,'assets/full.png'),'changed');
 await assert.rejects(g.runReplay(),/original-asset-binding/u);assert.deepEqual(g.directories(),[]);
 const h=fixture(t),deck=structuredClone(h.deck);deck.pages[0].shapes=[];
 assert.throws(()=>create(h.review,{root:h.root,deck}),/original-page-binding/u);
 for(const value of [null,{},[],new Proxy({},{}),{get root(){throw Error('secret');}}])assert.throws(()=>create(h.review,value));
});
test('replay shares the original cost ledger and atomic cancellation, races and final-seal rollback',async t=>{
 for(const mode of ['budget','cancel','race','seal','source']){
  const f=setup(t),before=snapshot(f.deck);let calls=0;
  f.context.isCancellationRequested=async()=>{
   if(++calls===1){
    if(mode==='cancel')return true;
    if(mode==='race')fs.appendFileSync(path.join(f.root,'assets/current-full.png'),'race');
    if(mode==='source')fs.appendFileSync(f.sourceFile,'changed');
   }return false;
  };
  await assert.rejects(f.runReplay(()=>{if(mode==='seal')throw Error('seal-failed');return true;},mode==='budget'?3999999:0));
  assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
