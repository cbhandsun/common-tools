'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/approved-card-backdrop.cjs');
const {readPng,writePng}=require('../packages/slideclone-core/png');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {parseSourceScenePlan}=require('../packages/slideclone-core/scene-plan/source-scene-plan');
const {compileSourceScene}=require('../packages/slideclone-core/scene-plan/source-scene-compiler');
function compiledFixture(t){
 const f=fixture(t),image=readPng(f.context.sourceFile),box={x:379,y:1046,w:20,h:15};
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
  const u=(y-box.y)/(box.h-1);image.rgba.set([210+Math.round(u*10),230+Math.round(u*10),245+Math.round(u*5),255],(y*image.width+x)*4);
 }
 writePng(f.context.sourceFile,image);const sourceHash=f.hashFile(f.context.sourceFile);
 f.review.source.sha256=sourceHash;f.card.source.sha256=sourceHash;for(const fit of f.review.fits)fit.source.sha256=sourceHash;
 const plan=parseSourceScenePlan({coordinateSpace:'source-pixels',regions:[{id:10,parentId:null,kind:'section',box:{x:0,y:0,w:1086,h:1448}}],
  objects:[{id:128,regionId:10,kind:'container',box,pictorialContent:'present'}],relations:[]},
 {sourceHash,widthPx:1086,heightPx:1448});
 const compiled=compileSourceScene({page:{shapes:[],images:[],textBoxes:[]},plan,sourceFile:f.context.sourceFile,root:f.root,slideSize:f.deck.slideSize});
 const shape=compiled.page.shapes.find(s=>s.id==='scene-container-object-n128');assert.ok(shape?.style.gradient);
 // Model the normal native-admission residual choice explicitly in this
 // synthetic approval. Compatibility must still bind this entire field.
 shape.source.preserveResidualInterior=false;
 const previous=f.members[1],i=f.page.shapes.indexOf(previous);f.page.shapes[i]=shape;f.members[1]=shape;
 const legacy=structuredClone(shape);delete legacy.style.gradient;
 const expected=f.card.members.find(row=>row.id===shape.id);expected.fingerprint=fingerprint(legacy);
 return {...f,shape,legacy,expected,sourceHash};
}
test('an independently source-measured gradient can coexist with the exact original approved member fingerprint',async t=>{
 const f=compiledFixture(t),approved=fingerprint(f.card),gradient=f.shape.style.gradient;
 await f.runCard();assert.equal(fingerprint(f.card),approved);
 const current=f.page.shapes.find(s=>s.id===f.shape.id);assert.equal(current.style.gradient,gradient);
 const report=f.deck.meta.approvedCardBackdrop;assert.equal(report.strictMeasurement,false);assert.equal(report.sourceErasure,false);
 assert.equal(report.sourceAppearanceRevisions.length,1);assert.equal(report.sourceAppearanceRevisions[0].originalFingerprint,f.expected.fingerprint);
 assert.equal(report.sourceAppearanceRevisions[0].field,'style.gradient');
});
test('copied, altered, stale, wrong-source and unrelated drawing differences cannot obtain compatibility',async t=>{
 for(const mode of ['clone-gradient','alter-gradient','stroke','geometry','source-field','copy-flag','expiry']){
  const f=compiledFixture(t);
  if(mode==='clone-gradient')f.shape.style.gradient=structuredClone(f.shape.style.gradient);
  if(mode==='alter-gradient')f.shape.style.gradient.stops[0].color='#000000';
  if(mode==='stroke')f.shape.style.stroke='#000000';if(mode==='geometry')f.shape.box.w++;
  if(mode==='source-field')f.shape.source.extra='unapproved';
  if(mode==='copy-flag'){f.shape.style.gradient=structuredClone(f.shape.style.gradient);f.shape.source.sourceMeasuredGradient=true;}
  if(mode==='expiry')t.mock.method(Date,'now',()=>Number.MAX_SAFE_INTEGER);
  const before=fingerprint(f.deck);await assert.rejects(f.runCard(),/approved-card-backdrop-member-binding/u);assert.equal(fingerprint(f.deck),before);assert.deepEqual(f.directories(),[]);
  t.mock.restoreAll();
 }
 const f=compiledFixture(t),{sourceMeasuredFillGradientAncestor:ancestor}=require('../packages/slideclone-core/scene-plan/source-measured-fill-compatibility');
 assert.equal(ancestor(f.shape,f.expected.fingerprint,'b'.repeat(64)),null);
});
test('compatibility queries reject malformed inputs without invoking provider hooks and cannot issue measurements',t=>{
 const {sourceMeasuredFillGradientAncestor:ancestor,registerSourceMeasuredFillGradient:register}=require('../packages/slideclone-core/scene-plan/source-measured-fill-compatibility');
 let calls=0;const trap=()=>{calls++;throw Error('private');},getter={};Object.defineProperty(getter,'style',{get:trap});
 for(const item of [null,[],{},getter,new Proxy({},{get:trap,ownKeys:trap})])assert.equal(ancestor(item,'a'.repeat(64),'b'.repeat(64)),null);
 assert.equal(register({image:{},measurement:{},id:'x',box:{}}),false);assert.equal(calls,0);
 const f=compiledFixture(t);assert.equal(ancestor(f.shape,f.expected.fingerprint,f.sourceHash).originalFingerprint,f.expected.fingerprint);
});
test('compatibility remains process-local and regressions are in the unified release and CI closure',t=>{
 const f=compiledFixture(t),{sourceMeasuredFillGradientAncestor:ancestor}=require('../packages/slideclone-core/scene-plan/source-measured-fill-compatibility');
 assert.equal(ancestor(JSON.parse(JSON.stringify(f.shape)),f.expected.fingerprint,f.sourceHash),null);
 const {discoverTestFiles}=require('../scripts/test-sharded');
 for(const suite of ['unit','all'])assert.ok(discoverTestFiles(process.cwd(),suite).some(r=>r.file.replaceAll('\\','/')==='test/source-measured-fill-compatibility.test.js'));
 assert.ok(require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES.includes('packages/slideclone-core/scene-plan/source-measured-fill-compatibility.js'));
 assert.ok(fs.existsSync(f.context.sourceFile));
});
