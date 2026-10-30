'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture}=require('./helpers/approved-card-backdrop.cjs');
const {createApprovedFrameAssetApplication:create}=require('../packages/slideclone-core/scene-plan/approved-frame-reconstruction');
test('n10 host option rejects unsafe, empty, duplicate, extreme and out-of-approval input',t=>{
 const f=fixture(t);
 for(const options of [null,true,[],{unexpected:true},{cardBackdrop:null},{cardBackdrop:{}},'private'])assert.throws(()=>create(f.review,options),TypeError);
 for(const mutate of [r=>r.approvalId='private',r=>r.regionId='region-n9',r=>r.color='#FFFFFF',r=>r.geometryBoundsPx.x--,
  r=>r.impactBoundsPx.h++,r=>r.geometryBoundsPx.x=Infinity,r=>r.source.width=120,r=>r.source.sha256='a'.repeat(64),r=>r.source.secret='private',
  r=>r.members=[],r=>r.members.pop(),r=>r.members.push(r.members[0]),r=>r.members[0].id='foreign',r=>r.members[0].fingerprint='invalid',r=>r.extra=true]){
  const r=structuredClone(f.card);mutate(r);assert.throws(()=>create(f.review,{cardBackdrop:r}),e=>e instanceof TypeError&&!e.message.includes('private'));
 }
});
test('host review admission never executes proxy traps, getters, serialization hooks or replacement array methods',t=>{
 const f=fixture(t);let calls=0;const trap=()=>{calls++;throw Error('private');},handler={get:trap,ownKeys:trap,getPrototypeOf:trap};
 for(const field of [null,'source','members','geometryBoundsPx','impactBoundsPx']){
  const r=structuredClone(f.card);if(field)r[field]=new Proxy(r[field],handler);
  assert.throws(()=>create(f.review,{cardBackdrop:field?r:new Proxy(r,handler)}),TypeError);
 }
 const getter=structuredClone(f.card);Object.defineProperty(getter.members[0],'fingerprint',{get:trap});assert.throws(()=>create(f.review,{cardBackdrop:getter}),TypeError);
 assert.throws(()=>create(f.review,new Proxy({},handler)),TypeError);assert.equal(calls,0);
});
test('review data is detached, deeply frozen and cannot be widened through a previous output report',async t=>{
 const f=fixture(t),g=fixture(t),service=create(f.review,{cardBackdrop:f.card});f.card.geometryBoundsPx.x=1;f.card.members.length=0;
 const {finalizeWithApprovedFrames:finalize}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
 await finalize(service,f.context,()=>true);const report=f.deck.meta.approvedCardBackdrop;
 assert.throws(()=>{report.geometryBoundsPx.x=0;},TypeError);assert.throws(()=>{report.impactBoundsPx.w=100000;},TypeError);
 await finalize(service,g.context,()=>true);assert.equal(g.deck.meta.approvedCardBackdrop.geometryBoundsPx.x,376);
});
test('n10 input and transaction tests enter unified unit and all CI discovery',()=>{
 const {discoverTestFiles}=require('../scripts/test-sharded');for(const suite of ['unit','all']){
  const files=discoverTestFiles(process.cwd(),suite).map(r=>r.file.replaceAll('\\','/'));
  assert(files.includes('test/approved-card-backdrop-input.test.js'));assert(files.includes('test/approved-card-backdrop.test.js'));
 }
});
