'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {fixture}=require('./helpers/approved-frame-application.cjs');
const {createApprovedFrameAssetApplication:create}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
const {finalizeWithApprovedFrames:finalize}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
test('host may explicitly omit stale retirement while retaining the exact original review and asset scope',async t=>{
 const f=fixture(t),page=f.deck.pages[0],originalReview=fingerprint(f.review),strict=f.deck.meta.sourceSceneCompilation;
 page.shapes=page.shapes.filter(s=>s.id!=='old-frame');const before=[...page.shapes],assets=f.hashFile(f.original);
 await finalize(create(f.review,{frameRegionIds:[],retirementIds:[]}),f.context,()=>true);
 assert.deepEqual(page.shapes,before);assert.equal(f.deck.meta.sourceSceneCompilation,strict);assert.equal(fingerprint(f.review),originalReview);
 assert.equal(f.hashFile(f.original),assets);assert.equal(f.hashFile(path.join(f.root,page.images[0].assetPath)),f.review.assets[0].afterSha256);
 const report=f.deck.meta.approvedApproximateFrames;assert.deepEqual(report.retirementIds,[]);assert.equal(report.retirementScopeNarrowed,true);
 assert.deepEqual(report.retiredNativeShapeIds,[]);
 assert.equal(report.sourceErasure,false);assert.equal(report.wholeProductAcceptance,false);
});
test('omitting retirement keeps even an altered object untouched; default and selected retirement remain strict',async t=>{
 const kept=fixture(t),object=kept.deck.pages[0].shapes[0];object.style={stroke:'#000000'};
 await finalize(create(kept.review,{frameRegionIds:[],retirementIds:[]}),kept.context,()=>true);
 assert.equal(kept.deck.pages[0].shapes[0],object);
 for(const mode of ['default','selected']){
  const f=fixture(t);f.deck.pages[0].shapes[0].style={stroke:'#000000'};const before=fingerprint(f.deck);
  await assert.rejects(finalize(create(f.review,mode==='default'?{frameRegionIds:[]}:{frameRegionIds:[],retirementIds:['old-frame']}),f.context,()=>true),/retirement-binding/u);
  assert.equal(fingerprint(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('retirement narrowing snapshots choices, validates hostile inputs and never expands the approved deletion set',async t=>{
 const f=fixture(t),ids=[],service=create(f.review,{frameRegionIds:[],retirementIds:ids});ids.push('old-frame');
 const before=f.deck.pages[0].shapes[0];await finalize(service,f.context,()=>true);assert.equal(f.deck.pages[0].shapes[0],before);
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter={frameRegionIds:[]};Object.defineProperty(getter,'retirementIds',{get:trap});
 const proxy=new Proxy([],{get:trap,ownKeys:trap});
 for(const selection of [null,'old-frame',['extra'],['old-frame','old-frame'],Array(5).fill('old-frame'),new Array(1),proxy,[{toString:trap}]]){
  assert.throws(()=>create(f.review,{retirementIds:selection}),TypeError);
 }
 assert.throws(()=>create(f.review,getter),TypeError);assert.equal(calls,0);
});
test('explicit narrowing still rolls back asset publication if the final seal fails',async t=>{
 const f=fixture(t),before=fingerprint(f.deck),source=f.hashFile(f.original);
 await assert.rejects(finalize(create(f.review,{frameRegionIds:[],retirementIds:[]}),f.context,()=>{throw Error('seal failed');}),/seal failed/u);
 assert.equal(fingerprint(f.deck),before);assert.equal(f.hashFile(f.original),source);assert.deepEqual(f.directories(),[]);
});
test('retirement selection tests are discovered by the unified unit and release entrypoints',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.replaceAll('\\','/')==='test/approved-frame-retirement-selection.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/approved-frame-retirement-selection.js'));
});
test('a proper subset removes only selected reviewed members and leaves omitted members identical',async t=>{
 const f=fixture(t),page=f.deck.pages[0],keep={id:'keep-reviewed',type:'line',box:{x:1,y:1,w:5,h:0},source:{editable:true}};
 page.shapes.push(keep);f.review.retirements.push({id:keep.id,fingerprint:fingerprint(keep)});
 await finalize(create(f.review,{frameRegionIds:[],retirementIds:['old-frame']}),f.context,()=>true);
 assert.equal(page.shapes.some(s=>s.id==='old-frame'),false);assert.equal(page.shapes.find(s=>s.id===keep.id),keep);
 assert.deepEqual(f.deck.meta.approvedApproximateFrames.retirementIds,['old-frame']);
 assert.deepEqual(f.deck.meta.approvedApproximateFrames.retiredNativeShapeIds,['old-frame']);
 assert.equal(f.deck.meta.approvedApproximateFrames.retirementScopeNarrowed,true);
});
test('the independent selection boundary validates the original list before accepting any subset',()=>{
 const {selectApprovedFrameRetirements:select}=require('../packages/slideclone-core/scene-plan/approved-frame-retirement-selection');
 assert.deepEqual(select([],[]),[]);assert.deepEqual(select([],undefined),[]);
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter={};Object.defineProperty(getter,'id',{get:trap});
 const row={id:'old',fingerprint:'a'.repeat(64)};
 for(const original of [null,{},[getter],[{...row,extra:true}],[row,row],[{id:'old',fingerprint:'invalid'}],new Array(1),new Proxy([],{get:trap,ownKeys:trap}),Array(5).fill(row)]){
  assert.throws(()=>select(original,[]),TypeError);
 }
 assert.throws(()=>select([],['old']),TypeError);assert.equal(calls,0);
});
