'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture}=require('./helpers/approved-card-backdrop.cjs');
const {fingerprint,snapshot}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
test('only the approved card is grouped and its fixed native backdrop stays outside the movement group',async t=>{
 const f=fixture(t),beforeSource=fs.readFileSync(f.context.sourceFile),strict=fingerprint({source:f.page.source,compilation:f.deck.meta.sourceSceneCompilation}),
  before=f.members.map(p=>structuredClone(p));await f.runCard();const report=f.deck.meta.approvedCardBackdrop,bg=f.page.shapes[0];
 assert.equal(bg.id,'approved-card-backdrop-region-n10');assert.equal(bg.type,'rect');assert.equal(bg.style.fill,'#FBFAF8');assert.equal(bg.source.nativeComponentGroupId,undefined);
 assert.equal(report.memberIds.length,14);assert.equal(report.sourceErasure,false);assert.equal(report.noGhostVerified,false);assert.equal(report.wholeProductAcceptance,false);
 assert.equal(fingerprint({source:f.page.source,compilation:f.deck.meta.sourceSceneCompilation}),strict);
 const all=[...f.page.shapes,...f.page.images,...f.page.textBoxes];
 for(const original of before){const p=all.find(p=>p.id===original.id);assert.ok(p);assert.equal(p.source.nativeComponentGroupId,report.groupId);
  const copy=structuredClone(p);copy.source.nativeComponentGroupId=original.source.nativeComponentGroupId;
  if(original.style.nativeComponentGroupId!==undefined)copy.style.nativeComponentGroupId=original.style.nativeComponentGroupId;
  assert.deepEqual(copy,original);
 }
 assert.equal(all.filter(p=>p.source?.nativeComponentGroupId===report.groupId).length,14);assert.deepEqual(fs.readFileSync(f.context.sourceFile),beforeSource);
});
test('final audit failure rolls back shapes, images, texts, metadata and staged assets as one transaction',async t=>{
 const f=fixture(t),before=snapshot(f.deck),refs={shapes:f.page.shapes,images:f.page.images,texts:f.page.textBoxes,meta:f.deck.meta};
 await assert.rejects(f.runCard(()=>{throw Error('audit-failed');}),/audit-failed/u);
 assert.equal(snapshot(f.deck),before);assert.equal(f.page.shapes,refs.shapes);assert.equal(f.page.images,refs.images);assert.equal(f.page.textBoxes,refs.texts);assert.equal(f.deck.meta,refs.meta);
 assert.deepEqual(f.directories(),[]);
});
test('membership, page color, scope bounds, source region and external native connections cannot broaden the approximation',async t=>{
 for(const mode of ['missing','duplicate','changed','outside','region','background','external','id-conflict']){
  const f=fixture(t),p=f.members[0];
  if(mode==='missing')f.page.shapes=f.page.shapes.filter(q=>q!==p);
  if(mode==='duplicate')f.page.shapes.push(structuredClone(p));
  if(mode==='changed')p.style.opacity=.5;
  if(mode==='outside'){p.box.x=0;f.card.members[0].fingerprint=fingerprint(p);}
  if(mode==='region'){p.source.sceneRegionId='region-n9';f.card.members[0].fingerprint=fingerprint(p);}
  if(mode==='background')f.page.background.fill='#FFFFFF';
  if(mode==='external')f.page.shapes.push({id:'external',type:'line',style:{startAnchor:{elementId:p.id},endAnchor:{elementId:'elsewhere'}},source:{}});
  if(mode==='id-conflict')f.page.shapes.push({id:'approved-card-backdrop-region-n10',source:{}});
  const before=snapshot(f.deck);await assert.rejects(f.runCard(),TypeError);assert.equal(snapshot(f.deck),before);assert.deepEqual(f.directories(),[]);
 }
});
test('readonly text publication and cancellation cannot leave a partially patched page',async t=>{
 for(const mode of ['readonly','late-readonly','cancel']){
  const f=fixture(t),before=snapshot(f.deck),refs={shapes:f.page.shapes,images:f.page.images,texts:f.page.textBoxes};let calls=0;
  if(mode==='readonly')Object.defineProperty(f.page,'textBoxes',{writable:false});
  if(mode==='cancel')f.context.isCancellationRequested=async()=>true;
  if(mode==='late-readonly')f.context.isCancellationRequested=async()=>{if(++calls===2)Object.defineProperty(f.page,'textBoxes',{writable:false});return false;};
  await assert.rejects(f.runCard());assert.equal(snapshot(f.deck),before);assert.equal(f.page.shapes,refs.shapes);assert.equal(f.page.images,refs.images);assert.equal(f.page.textBoxes,refs.texts);
  assert.deepEqual(f.directories(),[]);
 }
});
test('job/page approval markers do not install the host option',async t=>{
 const f=fixture(t),{createApprovedFrameAssetApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-reconstruction'),
  {finalizeWithApprovedFrames:finalize}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
 f.deck.meta.cardBackdrop=f.card;f.context.cardBackdrop=f.card;await finalize(createApprovedFrameAssetApplication(f.review),f.context,()=>true);
 assert.equal(f.deck.meta.approvedCardBackdrop,undefined);assert.equal(f.page.shapes.some(p=>p.id==='approved-card-backdrop-region-n10'),false);
});
