'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/source-outline-card-family.cjs');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {sourceMeasuredOutlineFamily:family}=require('../packages/slideclone-core/scene-plan/source-measured-outline-compatibility');
const {parseApprovedCardBackdrop:parse}=require('../packages/slideclone-core/scene-plan/approved-card-backdrop-input');
const {prepareApprovedCardBackdrop:prepare}=require('../packages/slideclone-core/scene-plan/approved-card-backdrop');
const {compactNativeFreeformPaths:compact}=require('../packages/slideclone-core/scene-plan/native-freeform-path');
function run(f){return prepare(parse(f.card,f.card.source),{deck:f.deck,page:f.page,shapes:f.page.shapes,images:f.page.images,texts:f.page.textBoxes});}
test('same-source paint evolution groups every current layer while retaining the complete original review',t=>{
 const f=fixture(t),review=fingerprint(f.card),deck=fingerprint(f.deck),result=run(f);
 assert.equal(fingerprint(f.card),review);assert.equal(fingerprint(f.deck),deck);
 assert.equal(result.report.memberIds.length,14+f.current.length-f.legacy.length);
 assert.equal(result.report.originalMemberIds.length,14);assert.equal(result.report.outlineFamilies.length,1);
 for(const shape of f.current)assert.equal(result.group(shape).source.nativeComponentGroupId,result.report.groupId);
 assert.equal(result.shape.source.nativeComponentGroupId,undefined);
 assert.equal(result.report.sourceErasure,false);assert.equal(result.report.wholeProductAcceptance,false);
 assert.deepEqual(result.report.outlineFamilies[0].originalFingerprints,f.card.members.filter(m=>f.legacy.some(s=>s.id===m.id)));
});
test('compact paths and late matching source metadata preserve exact historical family binding',t=>{
 const f=fixture(t);compact(f.deck);
 for(const s of [...f.current,...f.legacy])s.source.pageImage='assets/source.png';
 compact({pages:[{shapes:f.legacy}]});
 for(const old of f.legacy)f.card.members.find(m=>m.id===old.id).fingerprint=fingerprint(old);
 assert.ok(run(f).report.outlineFamilies.length);
 f.current[1].source.pageImage='elsewhere.png';assert.throws(()=>run(f),/member-binding/u);
});
test('family grouping publishes atomically and a failed final audit restores every original reference',async t=>{
 for(const fail of [false,true]){
  const f=fixture(t),before=fingerprint(f.deck),refs={shapes:f.page.shapes,images:f.page.images,texts:f.page.textBoxes,meta:f.deck.meta};
  if(fail){
   await assert.rejects(f.runCard(()=>{throw Error('family-final-audit');}),/family-final-audit/u);
   assert.equal(fingerprint(f.deck),before);assert.equal(f.page.shapes,refs.shapes);assert.equal(f.page.images,refs.images);
   assert.equal(f.page.textBoxes,refs.texts);assert.equal(f.deck.meta,refs.meta);assert.deepEqual(f.directories(),[]);
  }else{
   await f.runCard();const report=f.deck.meta.approvedCardBackdrop;
   const all=[...f.page.shapes,...f.page.images,...f.page.textBoxes];
   assert.equal(all.filter(s=>s.source?.nativeComponentGroupId===report.groupId).length,report.memberIds.length);
   assert.equal(f.page.shapes.find(s=>s.id===report.backdropId).source.nativeComponentGroupId,undefined);
  }
 }
});
test('missing, duplicated, copied, altered, expired and cross-source family proofs cannot change the card',t=>{
 for(const mode of ['delete','duplicate','copy','style','metadata','anchor','review-child','review-anchor','extra-reviewed','expiry','cross-source','serialize']){
  const f=fixture(t),a=f.current[0],child=f.current.at(-1);
  if(mode==='delete')f.page.shapes.splice(f.page.shapes.indexOf(child),1);
  if(mode==='duplicate')f.page.shapes.push({...child});
  if(mode==='copy')f.page.shapes[f.page.shapes.indexOf(child)]=structuredClone(child);
  if(mode==='style')child.style.fill='#000000';if(mode==='metadata')child.source.unapproved=true;
  if(mode==='anchor')a.box.w++;
  if(mode==='review-child')f.card.members.find(m=>m.id===f.legacy[1].id).fingerprint='a'.repeat(64);
  if(mode==='review-anchor')f.card.members.find(m=>m.id===a.id).fingerprint='a'.repeat(64);
  if(mode==='extra-reviewed')f.card.members.push({id:a.id+'-paint-90',fingerprint:'a'.repeat(64)});
  if(mode==='expiry')t.mock.method(Date,'now',()=>Number.MAX_SAFE_INTEGER);
  if(mode==='cross-source')f.card.source.sha256='a'.repeat(64);
  if(mode==='serialize')f.page.shapes=structuredClone(f.page.shapes);
  const before=fingerprint(f.deck);assert.throws(()=>run(f),TypeError,mode);assert.equal(fingerprint(f.deck),before);t.mock.restoreAll();
 }
});
test('an exact old anchor cannot leave an unreviewed extra color child behind',t=>{
 const f=fixture(t);f.page.shapes=f.page.shapes.filter(s=>!f.current.includes(s));f.page.shapes.push(...f.legacy,f.current.at(-1));
 assert.throws(()=>run(f),/member-binding/u);
});
test('a complete anchor receipt cannot substitute for exhausted family reconstruction work',t=>{
 const f=fixture(t,{exhaustFamily:true});
 const {sourceMeasuredOutlineAncestor:ancestor}=require('../packages/slideclone-core/scene-plan/source-measured-outline-compatibility');
 assert.ok(ancestor(f.current[0],f.card.members.find(m=>m.id===f.current[0].id).fingerprint,f.card.source.sha256,f.page.shapes));
 assert.equal(family(f.current[0],f.card.members,f.card.source.sha256,f.page.shapes),null);
 assert.throws(()=>run(f),/member-binding/u);
});
test('malformed or public-only family metadata cannot mint compatibility or invoke hooks',()=>{
 let calls=0;const trap=()=>{calls++;throw Error('PRIVATE');},getter={};Object.defineProperty(getter,'style',{get:trap});
 for(const item of [null,[],{},getter,new Proxy({},{get:trap,ownKeys:trap})])assert.equal(family(item,[], 'a'.repeat(64),[]),null);
 assert.equal(calls,0);
 for(const reviewed of [[],new Array(1),Array(10001).fill({}),new Proxy([],{get:trap,ownKeys:trap}),[getter]])
  assert.equal(family({},reviewed,'a'.repeat(64),[]),null);
 assert.equal(calls,0);
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all'])
  assert.ok(discoverTestFiles(process.cwd(),suite).some(row=>row.file.replaceAll('\\','/')==='test/source-outline-card-family.test.js'));
});
