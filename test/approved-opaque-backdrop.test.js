'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {readPng,writePng}=require('../packages/slideclone-core/png');
const {fingerprint,snapshot}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {digest}=require('../packages/slideclone-core/scene-plan/approved-frame-application-files');
const {backdropImageFingerprint}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-input');
const {parseApprovedOpaqueBackdrop:parse,opaqueBackdropDrawingFingerprint:drawing}=require('../packages/slideclone-core/scene-plan/approved-opaque-backdrop-input');
const {createApprovedOpaqueBackdropApplication:create}=require('../packages/slideclone-core/scene-plan/approved-opaque-backdrop-application');
const {withApprovedBackdropBudget:budget,recordSharedResidualChecks:sourceCost,approvedBackdropBudget:cost}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const {finalizeWithApprovedFrames:finalize,composeApprovedAssetApplications:compose}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
function fixture(t){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'opaque-backdrop-'));fs.mkdirSync(path.join(root,'assets'));
 t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const raster={width:10,height:10,rgba:Buffer.alloc(400,240)};for(let i=3;i<400;i+=4)raster.rgba[i]=255;
 raster.rgba.set([180,60,50,255],44);raster.rgba.set([170,50,40,255],48);raster.rgba[3]=0;
 const sourceFile=path.join(root,'assets/source.png'),file=path.join(root,'assets/full.png');writePng(sourceFile,raster);writePng(file,raster);
 const image={id:'full',type:'fidelity-crop',box:{x:0,y:0,w:10,h:10},assetPath:'assets/full.png',style:{opacity:1},source:{residualCrop:true}};
 const page={shapes:[{id:'whole-route',type:'line',box:{x:1,y:1,w:2,h:2},style:{stroke:'#AABBCC'},source:{sceneRelationId:'route'}}],
  textBoxes:[{id:'label',text:'Native label',box:{x:2,y:2,w:2,h:1},source:{editable:true}}],images:[image],source:{strict:false}};
 const deck={slideSize:{widthPt:10,heightPt:10},pages:[page],meta:{sourceSceneCompilation:{passed:false},approvedRouteBackdrop:{uniqueSourcePixels:1}}};
 const review={approvalId:'human-reviewed-opaque',source:{width:10,height:10,sha256:digest(fs.readFileSync(sourceFile))},
  asset:{imageId:'full',beforeSha256:'',imageFingerprint:''},drawingFingerprint:'',protectedCells:[0],
  pixels:[{cell:11,before:[180,60,50,255],color:[240,241,242]},{cell:12,before:[170,50,40,255],color:[241,242,243]}],scopeFingerprint:''};
 const rebind=()=>{review.asset.beforeSha256=digest(fs.readFileSync(file));review.asset.imageFingerprint=backdropImageFingerprint(image);
  review.drawingFingerprint=drawing(deck,page);const {source,asset,drawingFingerprint,protectedCells,pixels}=review;review.scopeFingerprint=fingerprint({source,asset,drawingFingerprint,protectedCells,pixels});};rebind();
 const context={root,sourceFile,deck,isCancellationRequested:async()=>false};
 const run=(seal=()=>true,checks=0)=>budget(()=>{sourceCost(checks);return finalize(create(review),context,seal);});
 return {root,file,sourceFile,raster,page,deck,image,review,context,rebind,run,directories:()=>fs.readdirSync(path.join(root,'assets')).filter(p=>p.startsWith('approved-frames-'))};
}
test('exact opaque replacements preserve all other pixels, protected cells, native objects and strict failures',async t=>{
 const f=fixture(t),shapes=f.page.shapes,texts=f.page.textBoxes,source=digest(fs.readFileSync(f.sourceFile)),oldReport=f.deck.meta.approvedRouteBackdrop;
 await f.run();const after=readPng(path.join(f.root,f.page.images[0].assetPath));
 for(let cell=0;cell<100;cell++){const row=f.review.pixels.find(p=>p.cell===cell);
  assert.deepEqual([...after.rgba.subarray(cell*4,cell*4+4)],row?[...row.color,255]:[...f.raster.rgba.subarray(cell*4,cell*4+4)]);}
 assert.equal(f.page.shapes,shapes);assert.equal(f.page.textBoxes,texts);assert.equal(f.deck.meta.approvedRouteBackdrop,oldReport);
 assert.equal(f.deck.meta.sourceSceneCompilation.passed,false);assert.equal(f.deck.meta.approvedOpaqueRouteBackdrop.uniqueSourcePixels,2);
 assert.equal(f.deck.meta.approvedOpaqueRouteBackdrop.approximation,true);assert.equal(f.deck.meta.approvedOpaqueRouteBackdrop.noGhostVerified,false);
 assert.equal(digest(fs.readFileSync(f.sourceFile)),source);assert.deepEqual(readPng(f.file).rgba,f.raster.rgba);
});
test('transparent and opaque policies stay separate and hostile or altered manifests confer no authority',t=>{
 const f=fixture(t);assert.throws(()=>require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application').createApprovedBackdropPixelApplication(f.review));
 let calls=0;const getter={};Object.defineProperty(getter,'source',{get(){calls++;throw Error('secret');}});
 for(const input of [null,getter,new Proxy({},{get(){calls++;throw Error('secret');}})])assert.throws(()=>parse(input),TypeError);
 assert.equal(calls,0);
 for(const change of ['empty','duplicate','protected','transparent','partial','color','scope','extra','sparse']){
  const value=structuredClone(f.review);
  if(change==='empty')value.pixels=[];if(change==='duplicate')value.pixels.push(value.pixels[1]);
  if(change==='protected')value.protectedCells.push(11);if(change==='transparent')value.pixels[0].before[3]=0;
  if(change==='partial')value.pixels[0].before[3]=128;if(change==='color')value.pixels[0].color[0]=256;
  if(change==='scope')value.pixels[0].color[0]++;if(change==='extra')value.extra=true;if(change==='sparse')value.pixels=new Array(2);
  assert.throws(()=>parse(value),TypeError,change);
 }
});
test('source, full asset, native drawing, registration and alias mismatches reject without publication',async t=>{
 for(const mode of ['source','asset','drawing','duplicate','registration','alias','rgba']){
  const f=fixture(t);
  if(mode==='source')fs.appendFileSync(f.sourceFile,'changed');if(mode==='asset')fs.appendFileSync(f.file,'changed');
  if(mode==='drawing')f.page.shapes[0].box.x++;if(mode==='duplicate')f.page.images.push(structuredClone(f.image));
  if(mode==='registration'){f.image.box.x=.1;f.rebind();}if(mode==='alias'){f.image.style.assetPath='assets/source.png';f.rebind();}
  if(mode==='rgba'){const raster=readPng(f.file);raster.rgba[44]++;writePng(f.file,raster);f.rebind();}
  const before=snapshot(f.deck);await assert.rejects(f.run());assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('cancellation, races, readonly state and failed final seals roll back staged files and fields',async t=>{
 for(const mode of ['seal','cancel','source-race','asset-race','staged-race','late-readonly','callback-error','callback-type']){
  const f=fixture(t),before=snapshot(f.deck);let count=0;
  f.context.isCancellationRequested=async()=>{if(++count!==2)return false;
   if(mode==='cancel')return true;if(mode==='source-race')fs.appendFileSync(f.sourceFile,'changed');if(mode==='asset-race')fs.appendFileSync(f.file,'changed');
   if(mode==='staged-race')fs.appendFileSync(path.join(f.root,'assets',f.directories()[0],'full.png'),'changed');
   if(mode==='late-readonly')Object.defineProperty(f.deck,'meta',{writable:false});
   if(mode==='callback-error')throw Error('secret');if(mode==='callback-type')return 'secret';return false;};
  await assert.rejects(f.run(()=>{if(mode==='seal')throw Error('failed-seal');return true;}),e=>!e.message.includes('secret'));
  assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('opaque replacements consume the existing shared ledger, preserve its cap, and cannot reapply reports',async t=>{
 const f=fixture(t);await f.run();const amount=f.deck.meta.approvedOpaqueRouteBackdrop.budget.applicationChecks;assert.ok(amount>0);
 const exact=fixture(t);await exact.run(()=>true,4000000-amount);assert.equal(exact.deck.meta.approvedOpaqueRouteBackdrop.budget.totalChecks,4000000);
 const overflow=fixture(t),before=snapshot(overflow.deck);await assert.rejects(overflow.run(()=>true,4000001-amount),/budget-exceeded/u);
 assert.equal(snapshot(overflow.deck),before);assert.deepEqual(overflow.directories(),[]);
 await assert.rejects(finalize(create(overflow.review),overflow.context,()=>true),/budget-context-required/u);
 const after=snapshot(f.deck);await assert.rejects(f.run(),/already-applied/u);assert.equal(snapshot(f.deck),after);
});
test('factory snapshots cannot be retargeted and later sibling rejection reverses the entire opaque patch',async t=>{
 const f=fixture(t),apply=create(f.review);f.review.pixels[0].color[0]=1;
 await budget(()=>finalize(apply,f.context,()=>true));assert.equal(readPng(path.join(f.root,f.page.images[0].assetPath)).rgba[44],240);
 const g=fixture(t),before=snapshot(g.deck),pipeline=compose(create(g.review),async()=>{throw Error('later-failure');});
 await assert.rejects(budget(()=>finalize(pipeline,g.context,()=>true)),/later-failure/u);assert.equal(snapshot(g.deck),before);assert.deepEqual(g.directories(),[]);
});
test('the host-only opaque factory and its regressions enter the published closure and unified CI',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded'),{IMAGE_EDITABLE_RELEASE_FILES}=require('../scripts/verify-runtime-package');
 assert.ok(discoverTestFiles(path.resolve(__dirname,'..'),'unit').some(p=>p.file.endsWith('approved-opaque-backdrop.test.js')));
 for(const name of ['approved-opaque-backdrop-input','approved-opaque-backdrop-application'])assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes(`packages/slideclone-core/scene-plan/${name}.js`));
 assert.equal(require('../packages/slideclone-core/scene-plan/approved-frame-reconstruction').createApprovedOpaqueBackdropApplication,create);
});
