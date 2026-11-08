'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {fixture:frameFixture}=require('./helpers/approved-frame-application.cjs');
const {fixture:pixelFixture}=require('./helpers/approved-backdrop-pixels.cjs');
const {fingerprint}=require('../packages/slideclone-core/scene-plan/approved-frame-application-input');
const {createApprovedFrameAssetApplication}=require('../packages/slideclone-core/scene-plan/approved-frame-application');
const {createApprovedBackdropPixelApplication}=require('../packages/slideclone-core/scene-plan/approved-backdrop-pixel-application');
const {withApprovedBackdropBudget}=require('../packages/slideclone-core/scene-plan/approved-backdrop-budget');
const {issueApprovedFrameApplication,composeApprovedAssetApplications,finalizeWithApprovedFrames}=require('../packages/slideclone-core/scene-plan/approved-frame-application-lifecycle');
for(const [name,fixture,create]of[['frames',frameFixture,createApprovedFrameAssetApplication],['pixels',pixelFixture,createApprovedBackdropPixelApplication]]){
 test('a later commit failure rolls back earlier '+name+' publication and staged files',async t=>{
  const f=fixture(t),page=f.deck.pages[0],shapes=page.shapes,images=page.images,meta=f.deck.meta,before=fingerprint(f.deck);
  const fail=async context=>issueApprovedFrameApplication(context,{commit(){throw Error('late-commit-failed');},rollback(){}});
  const apply=composeApprovedAssetApplications(create(f.review),fail);
  await assert.rejects(withApprovedBackdropBudget(()=>finalizeWithApprovedFrames(apply,f.context,()=>true)),/late-commit-failed/u);
  assert.equal(page.shapes,shapes);assert.equal(page.images,images);assert.equal(f.deck.meta,meta);
  assert.equal(fingerprint(f.deck),before);assert.deepEqual(f.directories(),[]);
 });
}
