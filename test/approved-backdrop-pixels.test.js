'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {fixture}=require('./helpers/approved-backdrop-pixels.cjs');
const {snapshot}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createApprovedBackdropPixelApplication:create}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application');
const {withApprovedBackdropBudget,recordSharedResidualChecks,approvedBackdropBudget}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const {finalizeWithApprovedFrames:finalize,composeApprovedAssetApplications:compose,issueApprovedFrameApplication:issue}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');

test('exact approved sparse pixels fill only alpha-zero positions in overlapping assets and keep complete native geometry',async t=>{
 const f=fixture(t),strict=snapshot(f.deck.meta),shapes=f.page.shapes,texts=f.page.textBoxes,sourceHash=f.hash(f.sourceFile);
 const originals=f.page.images.map(image=>({image:structuredClone(image),file:path.join(f.root,image.assetPath),raster:f.readPng(path.join(f.root,image.assetPath))}));
 await f.run();const report=f.deck.meta.approvedRouteBackdrop;
 assert.equal(report.uniqueSourcePixels,3);assert.equal(report.changedAssetPixels,5);assert.equal(report.sourceInterpolationPixels,2);assert.equal(report.neighborInferencePixels,1);
 assert.equal(report.strictMeasurement,false);assert.equal(report.sourceErasure,false);assert.equal(report.wholeProductAcceptance,false);assert.equal(report.noGhostVerified,false);
 assert.equal(f.page.shapes,shapes);assert.equal(f.page.textBoxes,texts);assert.equal(snapshot(f.deck.meta.sourceSceneCompilation),snapshot(JSON.parse(strict).sourceSceneCompilation));
 assert.equal(f.hash(f.sourceFile),sourceHash);
 const colors=new Map(f.review.pixels.map(p=>[p.cell,[...p.color,255]]));
 for(const row of originals){
  const result=f.page.images.find(image=>image.id===row.image.id),after=f.readPng(path.join(f.root,result.assetPath));let changed=0;
  for(let i=0;i<after.width*after.height;i++){
   const cell=(row.image.box.y+Math.floor(i/after.width))*10+row.image.box.x+i%after.width;
   const expected=colors.get(cell)&&row.raster.rgba[i*4+3]===0?colors.get(cell):[...row.raster.rgba.subarray(i*4,i*4+4)];
   assert.deepEqual([...after.rgba.subarray(i*4,i*4+4)],expected);if(expected===colors.get(cell))changed++;
  }
  assert.equal(changed,report.assets.find(asset=>asset.imageId===row.image.id).changedPixels);
  assert.equal(f.hash(row.file),f.review.assets.find(asset=>asset.imageId===row.image.id).beforeSha256);
 }
});
test('opaque and partial-alpha overlap pixels are untouched while the full asset still covers every approved source pixel',async t=>{
 for(const alpha of [1,128,255]){
  const f=fixture(t),file=path.join(f.root,'assets/overlap.png'),raster=f.readPng(file);raster.rgba[3]=alpha;
  require('../packages/slideclone-core/png').writePng(file,raster);f.rebind();await f.run();
  const image=f.page.images.find(i=>i.id==='overlap'),after=f.readPng(path.join(f.root,image.assetPath));assert.deepEqual(after.rgba.subarray(0,4),raster.rgba.subarray(0,4));
 }
});
test('missing coverage, stale assets/source/layout, duplicate membership and invalid registrations fail without publishing',async t=>{
 for(const mode of ['coverage','asset','source','layout','duplicate','registration','alias','no-targets']){
  const f=fixture(t);
  if(mode==='coverage'){f.review.pixels.push({cell:79,color:[1,2,3],kind:'neighbor-inference'});f.rebind();}
  if(mode==='asset')fs.appendFileSync(path.join(f.root,'assets/full.png'),'changed');
  if(mode==='source')fs.appendFileSync(f.sourceFile,'changed');
  if(mode==='layout')f.page.shapes[0].style.fill='#000000';
  if(mode==='duplicate')f.page.images.push(structuredClone(f.page.images[0]));
  if(mode==='registration'){f.page.images[0].box.x=.1;f.rebind();}
  if(mode==='alias'){f.page.images[0].style.assetPath='assets/source.png';f.rebind();}
  if(mode==='no-targets'){const file=path.join(f.root,'assets/overlap.png'),raster=f.readPng(file);for(let i=0;i<12;i++)raster.rgba[i*4+3]=255;
   require('../packages/slideclone-core/png').writePng(file,raster);f.rebind();}
  const before=snapshot(f.deck);await assert.rejects(f.run());assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('failed final seal, cancellation, late readonly and asynchronous mutation roll back every staged artifact',async t=>{
 for(const mode of ['seal','cancel','late-readonly','mutation','source-race','asset-race','staged-race','cancel-error','cancel-type']){
  const f=fixture(t),before=snapshot(f.deck),oldImages=f.page.images,oldMeta=f.deck.meta;let calls=0;
  f.context.isCancellationRequested=async()=>{
   if(++calls!==2)return false;
   if(mode==='cancel')return true;
   if(mode==='late-readonly')Object.defineProperty(f.page,'images',{writable:false});
   if(mode==='mutation')f.deck.meta.external=true;
   if(mode==='source-race')fs.appendFileSync(f.sourceFile,'changed');
   if(mode==='asset-race')fs.appendFileSync(path.join(f.root,'assets/full.png'),'changed');
   if(mode==='staged-race')fs.appendFileSync(path.join(f.root,'assets',f.directories()[0],'full.png'),'changed');
   if(mode==='cancel-error')throw Error('sensitive');
   if(mode==='cancel-type')return 'sensitive';return false;
  };
  await assert.rejects(f.run(()=>{if(mode==='seal')throw Error('seal-failed');return true;}),error=>!error.message.includes('sensitive'));
  if(mode==='mutation')delete f.deck.meta.external;
  assert.equal(snapshot(f.deck),before);assert.equal(f.page.images,oldImages);assert.equal(f.deck.meta,oldMeta);assert.deepEqual(f.directories(),[]);
 }
});
test('composed host applications defer commit and reverse earlier work on later rejection or final failure',async t=>{
 for(const mode of ['success','later-rejection','invalid-receipt','seal']){
  const f=fixture(t),before=snapshot(f.deck),events=[];
  const first=async context=>{events.push('prepare');const old=f.deck.meta;f.deck.meta={...old,first:true};
   return issue(context,{commit(){events.push('commit');},rollback(){events.push('rollback');f.deck.meta=old;}});};
  const second=mode==='later-rejection'?async()=>{throw Error('later-rejection');}:mode==='invalid-receipt'?async()=>({}):create(f.review);
  const run=()=>withApprovedBackdropBudget(()=>finalize(compose(first,second),f.context,()=>{if(mode==='seal')throw Error('seal');return true;}));
  if(mode==='success'){await run();assert.deepEqual(events,['prepare','commit']);assert.equal(f.deck.meta.approvedRouteBackdrop.uniqueSourcePixels,3);}
  else{await assert.rejects(run());assert.deepEqual(events,['prepare','rollback']);assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);}
 }
});
test('source and application share the original four-million-check cap, with exact-boundary acceptance',async t=>{
 const f=fixture(t);await f.run();const cost=f.deck.meta.approvedRouteBackdrop.budget.applicationChecks;assert.ok(cost>0);
 const g=fixture(t);await g.run(()=>true,4000000-cost);assert.equal(g.deck.meta.approvedRouteBackdrop.budget.totalChecks,4000000);
 const h=fixture(t),before=snapshot(h.deck);await assert.rejects(h.run(()=>true,4000001-cost),/budget-exceeded/u);assert.equal(snapshot(h.deck),before);assert.deepEqual(h.directories(),[]);
 const i=fixture(t);await assert.rejects(finalize(create(i.review),i.context,()=>true),/budget-context-required/u);
});
test('private budget isolates parallel jobs and rejects serialized counters as a budget reset',async()=>{
 const values=await Promise.all([13,29].map(checks=>withApprovedBackdropBudget(async()=>{recordSharedResidualChecks(checks);await new Promise(resolve=>setImmediate(resolve));return approvedBackdropBudget().sourceChecks;})));
 assert.deepEqual(values,[13,29]);assert.throws(()=>approvedBackdropBudget(),/context-required/u);
});
test('a report cannot reapply an already committed service or mutate the reviewed scope',async t=>{
 const f=fixture(t),service=create(f.review);f.review.pixels[0].color[0]=99;f.review.pixels.length=0;
 await withApprovedBackdropBudget(()=>finalize(service,f.context,()=>true));const after=f.readPng(path.join(f.root,f.page.images[0].assetPath));assert.equal(after.rgba[0],10);
 const before=snapshot(f.deck);await assert.rejects(withApprovedBackdropBudget(()=>finalize(service,f.context,()=>true)),/already-applied/u);assert.equal(snapshot(f.deck),before);
});
test('missing metadata is restored on failure and readonly publication is rejected before staging',async t=>{
 const f=fixture(t);delete f.deck.meta;const before=snapshot(f.deck);
 await assert.rejects(f.run(()=>{throw Error('seal');}),/seal/u);assert.equal(snapshot(f.deck),before);assert.equal(Object.hasOwn(f.deck,'meta'),false);assert.deepEqual(f.directories(),[]);
 for(const field of ['images','meta']){
  const g=fixture(t);Object.defineProperty(field==='images'?g.page:g.deck,field,{writable:false});
  await assert.rejects(g.run(),/readonly/u);assert.deepEqual(g.directories(),[]);
 }
});
test('asset traversal and source paths outside the workspace are rejected without reading or publishing',async t=>{
 for(const mode of ['asset','source']){
  const f=fixture(t);
  if(mode==='asset'){
   f.page.images[0].assetPath='../outside.png';f.page.images[0].style.assetPath='../outside.png';
   const {backdropPageFingerprint,backdropImageFingerprint}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-input');
   f.review.pageFingerprint=backdropPageFingerprint(f.deck,f.page);f.review.assets[0].imageFingerprint=backdropImageFingerprint(f.page.images[0]);
  }else f.context.sourceFile=path.resolve(f.root,'../outside.png');
  const before=snapshot(f.deck);await assert.rejects(f.run(),/invalid-approved-frame-asset/u);assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('composition rejects invalid host dependencies and continues rollback after one rollback fails',async t=>{
 for(const input of [[],[null],[true],[{}],Array(17).fill(async()=>({}))])assert.throws(()=>compose(...input),TypeError);
 const f=fixture(t),events=[];
 const app=name=>async context=>issue(context,{commit(){},rollback(){events.push(name);if(name==='second')throw Error('rollback-failed');}});
 await assert.rejects(finalize(compose(app('first'),app('second'),async()=>{throw Error('prepare-failed');}),f.context,()=>true),/rollback-failed/u);
 assert.deepEqual(events,['second','first']);
});
