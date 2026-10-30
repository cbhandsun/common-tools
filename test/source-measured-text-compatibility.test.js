'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-measured-text-compatibility.cjs');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {sourceMeasuredTextAncestor:ancestor,registerSourceMeasuredTextStyle:register}=require('../packages/slideclone-core/typography/source-measured-text-compatibility');
const {parseApprovedCardTextAncestors:parse}=require('../packages/slideclone-core/scene-plan/approved-card-text-ancestors');
function proof(f){return ancestor(f.current,f.prior,f.card.members.find(row=>row.id===f.current.id).fingerprint,f.card.source.sha256);}
test('private source projection admits the original reviewed text without rewriting the review or current drawing',async t=>{
 const f=fixture(t),approved=fingerprint(f.card),before=fingerprint(f.current),budget=f.budget.remaining;
 const revision=proof(f);assert.ok(revision);assert.ok(f.budget.remaining<budget);assert.equal(fingerprint(f.current),before);
 const remaining=f.budget.remaining;assert.deepEqual(proof(f),revision);assert.equal(f.budget.remaining,remaining);
 await f.runText();assert.equal(fingerprint(f.card),approved);
 const report=f.deck.meta.approvedCardBackdrop;assert.equal(report.sourceAppearanceRevisions.length,1);
 assert.equal(report.sourceAppearanceRevisions[0].field,'source.wordPixelProjection');assert.equal(report.memberIds.length,14);
 assert.equal(report.sourceErasure,false);assert.equal(report.wholeProductAcceptance,false);
});
test('arithmetic-only native/source metadata equivalence requires private measurement and scans no new pixels',t=>{
 const f=fixture(t,{arithmeticOnly:true}),remaining=f.budget.remaining;assert.ok(proof(f));assert.equal(f.budget.remaining,remaining);
 f.current.source.pageImage='changed.png';assert.equal(proof(f),null);
});
test('normal late native-default compaction preserves the private drawing receipt and the complete old fingerprint',t=>{
 const f=fixture(t),{compactTeamComponentEvidence:compact}=require('../packages/slideclone-core/archetypes/team-component-evidence');
 const deck={pages:[{textBoxes:[f.current],shapes:[],images:[]}]},old={pages:[{textBoxes:[f.prior],shapes:[],images:[]}]};
 compact(old);f.card.members.find(m=>m.id===f.current.id).fingerprint=fingerprint(f.prior);compact(deck);
 assert.equal(f.current.font.align,undefined);assert.equal(f.current.style.marginLeftPt,undefined);assert.ok(proof(f));
 f.current.style.opacity=.8;assert.equal(proof(f),null);
});
test('native span cancellation uses the same bounded endpoint arithmetic and never admits meaningful geometry changes',t=>{
 const f=fixture(t,{arithmeticOnly:true}),b=f.prior.box;
 let bottom=b.y+b.h;bottom+=Number.EPSILON*bottom;b.h=bottom-b.y;
 assert.ok(Math.abs(b.h-f.current.box.h)>8*Number.EPSILON*f.current.box.h);
 assert.ok(ancestor(f.current,f.prior,fingerprint(f.prior),f.card.source.sha256));
 b.h+=1e-8;assert.equal(ancestor(f.current,f.prior,fingerprint(f.prior),f.card.source.sha256),null);
 const expected=f.card.members.find(row=>row.id===f.current.id).fingerprint;
 for(const width of [NaN,Infinity,0,-1]){f.prior.box.w=width;assert.equal(ancestor(f.current,f.prior,expected,f.card.source.sha256),null);}
});
test('historical source geometry rejects fabricated approved layouts and snapshots the real slide projection scale',t=>{
 const stable=fixture(t,{mutateScale:true});assert.ok(proof(stable));
 for(const mutate of [old=>old.positionedRuns[0].box.w+=1e-8,old=>old.box.w+=1e-8,
  old=>old.source.evidenceBox.x+=1e-8,old=>old.source.ocrPolygonPt=[[1,2],[3,4]],old=>old.font.sizePt++]){
  const f=fixture(t);mutate(f.prior);
  // An arbitrary expected hash cannot turn unmeasured geometry into evidence.
  assert.equal(ancestor(f.current,f.prior,fingerprint(f.prior),f.card.source.sha256),null);
 }
});
test('original source allowance exhaustion and final audit failure retain the complete page',async t=>{
 const exhausted=fixture(t);exhausted.budget.remaining=0;assert.equal(proof(exhausted),null);assert.equal(exhausted.budget.remaining,0);
 await assert.rejects(exhausted.runText(),/member-binding/u);
 const f=fixture(t),before=fingerprint(f.deck),refs={shapes:f.page.shapes,images:f.page.images,texts:f.page.textBoxes,meta:f.deck.meta};
 await assert.rejects(f.runText(()=>{throw Error('text-final-audit');}),/text-final-audit/u);
 assert.equal(fingerprint(f.deck),before);assert.equal(f.page.shapes,refs.shapes);assert.equal(f.page.images,refs.images);
 assert.equal(f.page.textBoxes,refs.texts);assert.equal(f.deck.meta,refs.meta);assert.deepEqual(f.directories(),[]);
});
test('cloned, changed, stale, wrong-source and unrelated text differences cannot obtain compatibility',t=>{
 for(const mode of ['clone','copy-style','text','font','paint','run','source','frame','source-frame','old-object','old-run','wrong-source','expiry']){
  const f=fixture(t);
  if(mode==='clone')f.current=structuredClone(f.current);if(mode==='copy-style')f.current.style={...f.current.style};
  if(mode==='text')f.current.text='OTHER';if(mode==='font')f.current.font.sizePt++;
  if(mode==='paint')f.current.style.opacity=.5;if(mode==='run')f.current.positionedRuns[0].box.x+=.001;
  if(mode==='source')f.current.source.extra='unreviewed';if(mode==='frame')f.current.box.w+=1e-8;
  if(mode==='source-frame')f.current.source.evidenceBox.w+=1e-8;
  if(mode==='old-object')f.prior.font.sizePt++;if(mode==='old-run')f.prior.positionedRuns[0].box.w+=.001;
  if(mode==='wrong-source')f.card.source.sha256='a'.repeat(64);if(mode==='expiry')t.mock.method(Date,'now',()=>Number.MAX_SAFE_INTEGER);
  assert.equal(proof(f),null,mode);t.mock.restoreAll();
 }
});
test('retained ancestor representations are exact, bounded, snapshotted, and cannot install a host policy',async t=>{
 const f=fixture(t),policy={members:f.card.members},parsed=parse([f.prior],policy),old=fingerprint(parsed.get(f.prior.id));
 f.prior.text='changed';assert.equal(fingerprint(parsed.get(f.current.id)),old);
 let calls=0;const trap=()=>{calls++;throw Error('PRIVATE');},getter={};Object.defineProperty(getter,'id',{get:trap});
 for(const input of [null,{},new Array(1),[getter],new Proxy([],{get:trap,ownKeys:trap}),Array(8).fill({}),[f.prior],[{id:'extra',text:'bad'}],[{id:f.current.id,text:'x'.repeat(262145)}]])
  assert.throws(()=>parse(input,policy),TypeError);
 assert.throws(()=>parse([],null),TypeError);assert.equal(calls,0);
 const fresh=fixture(t);assert.throws(()=>parse([fresh.prior,fresh.prior],{members:fresh.card.members}),TypeError);
 const {createApprovedFrameAssetApplication:create}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
 assert.throws(()=>create(fresh.review,{cardTextAncestors:[fresh.prior]}),TypeError);
 const input=[fresh.prior],service=create(fresh.review,{cardBackdrop:fresh.card,cardTextAncestors:input});input[0].text='mutated-after-creation';
 await require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle').finalizeWithApprovedFrames(service,fresh.context,()=>true);
});
test('historical observation controls retain exact budgets, own-neighbor identity and safe malformed-input failures',t=>{
 const f=fixture(t),{measureSourceWordLayout:measure,measureHistoricalSourceWordLayout:historical}=require('../packages/slideclone-core/typography/source-word-layout-evidence');
 const request={image:f.session.image,line:f.line,color:'#1E2328',maxScanPixels:4000000,neighborBoxes:[f.line.box]};
 const current=measure(request);assert.ok(current.runs);
 const seed={...f.line.box,x:f.line.box.x+Number.EPSILON*f.line.box.x*2,w:f.line.box.w+Number.EPSILON*f.line.box.w*2};
 const old=historical(request,seed,4000000);assert.ok(old.runs);assert.ok(old.scannedPixels>current.scannedPixels);
 const limited=historical(request,seed,old.scannedPixels-1);assert.equal(limited.reason,'source-budget');assert.equal(limited.scannedPixels,0);
 assert.equal(historical({...request},seed,4000000),null);assert.equal(historical(request,{...seed,w:seed.w+1e-8},4000000),null);
 let calls=0;const trap=()=>{calls++;throw Error('PRIVATE');},getter={};Object.defineProperty(getter,'x',{get:trap});
 for(const bad of [null,[],{},getter,new Proxy({},{get:trap,ownKeys:trap})])assert.throws(()=>historical(request,bad,4000000),TypeError);
 for(const bad of [null,-1,4000001,NaN,Infinity,'1000'])assert.throws(()=>historical(request,seed,bad),TypeError);
 assert.equal(historical(new Proxy({},{get:trap,ownKeys:trap}),seed,4000000),null);assert.equal(calls,0);
 const {registerSourceWordLayout:registerLayout}=require('../packages/slideclone-core/typography/source-word-layout-registry');
 for(const scale of [null,{},getter,{x:0,y:1},{x:NaN,y:1},{x:100001,y:1},{x:'1',y:1},{x:1,y:1,extra:true}])
  assert.throws(()=>registerLayout(f.seed,f.line,f.session.image,f.budget,[f.line.box],false,f.session.token,scale),TypeError);
 assert.equal(calls,0);
});
test('public rasters, source flags, malformed objects and provider hooks cannot issue a receipt',t=>{
 const f=fixture(t);assert.equal(require('../packages/slideclone-core/scene-plan/deferred-source-word-layout').sourceWordRasterSourceHash(f.session.image),null);
 assert.equal(register({request:{image:f.session.image},original:f.current.box,lineBox:f.line.box,budget:f.budget,rotation:0},structuredClone(f.current)),false);
 let calls=0;const trap=()=>{calls++;throw Error('PRIVATE');},getter={};Object.defineProperty(getter,'style',{get:trap});
 for(const item of [null,[],{},getter,new Proxy({},{get:trap,ownKeys:trap})])assert.equal(ancestor(item,{},'a'.repeat(64),'b'.repeat(64)),null);
 assert.equal(calls,0);
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])
  assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-measured-text-compatibility.test.js'));
 const files=require('../scripts/verify-runtime-package').IMAGE_EDITABLE_RELEASE_FILES;
 for(const file of ['packages/slideclone-core/typography/source-measured-text-compatibility.js','packages/slideclone-core/scene-plan/approved-card-text-ancestors.js'])assert.ok(files.includes(file));
});
