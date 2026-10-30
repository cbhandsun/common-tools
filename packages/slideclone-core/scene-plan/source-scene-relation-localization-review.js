// @ts-check
'use strict';
const {box}=require('./source-scene-group-containment');
const {sceneRelationLocalizations}=require('./source-scene-relation-localization');
const {readRegionalRelationAnchor,regionalRelationAnchorsAgree}=require('./source-scene-regional-relation-anchor');
const {sceneRelationKey}=require('./source-scene-relation-identity');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {Box} a @param {Box} b */
const contains=(a,b)=>b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;
/** Parse each localization in its own original crop/atlas mapping. The source
 * window and the original owner both constrain it; another tile cannot supply
 * this target's pixels. A count is a proposal only, never source authority.
 * @param {Record<string,unknown>} raw
 * @param {import('./source-scene-topology-review').Target} target
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame */
function readSceneRelationLocalization(raw,target,frame){
 if(!Number.isSafeInteger(raw.visibleMatches)||Number(raw.visibleMatches)<0||Number(raw.visibleMatches)>10000)
  throw new TypeError('Scene relation localization observation is invalid');
 const anchor=readRegionalRelationAnchor(raw.shaftBox_2d,target,frame),source=frame?.sourceTargets.find(row=>row.index===target.index);
 if(anchor.shaftBox&&(!source||!contains(source.cropBox,anchor.shaftBox)))return {visibleMatches:Number(raw.visibleMatches),rejection:'localization-crop'};
 return {...anchor,visibleMatches:Number(raw.visibleMatches)};
}
/** Only a strict complete current core can receive a new complete location.
 * The normal .9 confidence/.85 anchor consensus gates remain unchanged. A
 * parallel/duplicate topology cannot inherit a lost physical identity by order.
 * The returned candidate still grants no shaft/head/port or erasure proof.
 * @param {import('./source-scene-plan').ScenePlan} plan
 * @param {import('./source-scene-topology-review').Target} target
 * @param {import('./source-scene-topology-review').Observation} a
 * @param {import('./source-scene-topology-review').Observation} b */
function sceneRelationLocalizationConsensus(plan,target,a,b){
 const controls=sceneRelationLocalizations(plan),control=controls.find(c=>c.core.id===target.relationId);
 if(!control||JSON.stringify(target.localization)!==JSON.stringify(control)||target.admissionIndex!==control.index)
  return {reason:'localization-revision'};
 if(a.visibleMatches!==1||b.visibleMatches!==1)return {reason:'localization-ambiguous'};
 if(a.fromId!==control.core.fromId||a.toId!==control.core.toId||a.direction!==control.core.direction
  ||b.fromId!==control.core.fromId||b.toId!==control.core.toId||b.direction!==control.core.direction)
  return {reason:'localization-core'};
 if(!box(a.shaftBox)||!box(b.shaftBox)||!regionalRelationAnchorsAgree(a,b))return {reason:'localization-consensus'};
 const owner=plan.regions.find(r=>r.id===control.core.regionId);
 if(!owner||!contains(owner.box,a.shaftBox)||!contains(owner.box,b.shaftBox))return {reason:'localization-owner'};
 const key=sceneRelationKey(control.core);
 if([...plan.relations,...controls.filter(c=>c.core.id!==control.core.id).map(c=>c.core)].some(r=>sceneRelationKey(r)===key))
  return {reason:'localization-ambiguous'};
 // Snapshot the fully validated complete location. The three rejected values
 // are never read or combined with this new geometry.
 return {shaftBox:{...a.shaftBox}};
}
module.exports={readSceneRelationLocalization,sceneRelationLocalizationConsensus};
