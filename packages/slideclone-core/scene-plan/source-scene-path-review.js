// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {parseScenePathProgram,sourceRouteMatchesProgram}=require('./source-scene-path-program');
const {sceneRouteWithinAnchor}=require('./source-scene-relation-identity');
const {scenePathPolylinesAgree}=require('./source-scene-path-consensus');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Relation} Relation */
/** @typedef {import('./source-scene-path-program').PathProgram} Path */
/** @typedef {{sourceHash:string,widthPx:number,heightPx:number,relation:Relation,owner:import('./source-scene-plan').Box}} PathReview */
/** Capture identity before either observer runs. A path review cannot repair
 * endpoints/owners at the same time or acquire identity from DFS candidates.
 * @param {Plan} plan @param {Relation} relation @returns {PathReview} */
function captureScenePathReview(plan,relation){
 const owner=plan.regions.find(r=>r.id===relation.regionId);
 if(!owner)throw new TypeError('Scene path review owner is invalid');
 return {sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,relation:structuredClone(relation),owner:{...owner.box}};
}
/** Map each view through its own original atlas tile, before consensus. The
 * path is a complete source proposal with the existing 16-vertex ceiling.
 * @param {unknown} value @param {import('./source-scene-topology-review').Target} target
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame
 * @returns {{visiblePath?:Path,pathRejection?:string}} */
function readScenePathObservation(value,target,frame){
 if(value===null)return {};
 const control=target.pathReview;
 if(!control||!record(frame)||!list(frame.sourceTargets)||!list(frame.sheetTargets)
  ||frame.sourceTargets.length>32||frame.sheetTargets.length>32
  ||[...frame.sourceTargets,...frame.sheetTargets].some(row=>!record(row)||!box(row.cropBox))
  ||frame.sourceTargets.filter(row=>row.index===target.index).length!==1
  ||frame.sheetTargets.filter(row=>row.index===target.index).length!==1)
  throw new TypeError('Scene path source mapping is invalid');
 const source=frame.sourceTargets.find(row=>row.index===target.index),sheet=frame.sheetTargets.find(row=>row.index===target.index);
 if(!source||!sheet||source.cropBox.w!==sheet.cropBox.w||source.cropBox.h!==sheet.cropBox.h)
  throw new TypeError('Scene path source mapping is invalid');
 const atlas=parseScenePathProgram(value,{widthPx:frame.width,heightPx:frame.height,coordinateSpace:'normalized-1000',owner:sheet.cropBox});
 if(!atlas)throw new TypeError('Scene path observation is invalid');
 const vertices=atlas.vertices.map(p=>({x:p.x-sheet.cropBox.x+source.cropBox.x,y:p.y-sheet.cropBox.y+source.cropBox.y}));
 const visiblePath=parseScenePathProgram({...atlas,vertices},{widthPx:control.widthPx,heightPx:control.heightPx,coordinateSpace:'compiled-source-pixels',owner:control.owner});
 if(!visiblePath||!sceneRouteWithinAnchor(control.relation,visiblePath.vertices))return {pathRejection:'path-anchor'};
 return {visiblePath};
}
/** Two full observations must describe the same ordered path at the existing
 * 1.5px source identity tolerance. No averaging, vertex union or extrapolation.
 * Final shaft/head/port/coverage proof remains the compiler's responsibility.
 * @param {Plan} plan @param {import('./source-scene-topology-review').Target} target
 * @param {import('./source-scene-topology-review').Observation} a
 * @param {import('./source-scene-topology-review').Observation} b
 * @returns {{visiblePath?:Path,reason?:string}} */
function scenePathReviewConsensus(plan,target,a,b){
 const control=target.pathReview,relation=plan.relations.find(r=>r.id===target.relationId),owner=plan.regions.find(r=>r.id===target.regionId);
 if(!control||!relation||!owner||control.sourceHash!==plan.sourceHash||control.widthPx!==plan.widthPx||control.heightPx!==plan.heightPx
  ||JSON.stringify(control.relation)!==JSON.stringify(relation)||JSON.stringify(control.owner)!==JSON.stringify(owner.box)
  ||JSON.stringify(target.box)!==JSON.stringify(owner.box))return {reason:'path-revision'};
 if([a,b].some(o=>o.fromId!==relation.fromId||o.toId!==relation.toId||o.direction!==relation.direction))return {reason:'path-core'};
 if(a.pathRejection||b.pathRejection||!a.visiblePath||!b.visiblePath)return {reason:'path-missing'};
 const x=parseScenePathProgram(a.visiblePath,{widthPx:plan.widthPx,heightPx:plan.heightPx,coordinateSpace:'compiled-source-pixels',owner:owner.box});
 const y=parseScenePathProgram(b.visiblePath,{widthPx:plan.widthPx,heightPx:plan.heightPx,coordinateSpace:'compiled-source-pixels',owner:owner.box});
 if(!x||!y||!sceneRouteWithinAnchor(relation,x.vertices)||!sceneRouteWithinAnchor(relation,y.vertices)
  ||!scenePathPolylinesAgree(x.vertices,y.vertices))
  return {reason:'path-consensus'};
 return {visiblePath:x};
}
/** Distinct full proposals may retain already admitted parallel identities.
 * This grants no physical distinctness: the compiler must reject duplicate
 * measured edge sequences even when two proposals differ geometrically.
 * @param {Relation} a @param {Relation} b */
function scenePathReviewsDistinct(a,b){
 if(a.sourcePathChoice&&b.sourcePathChoice)return a.sourcePathChoice.sourceHash===b.sourcePathChoice.sourceHash
  &&a.sourcePathChoice.networkHash===b.sourcePathChoice.networkHash&&JSON.stringify(a.sourcePathChoice.steps)!==JSON.stringify(b.sourcePathChoice.steps);
 const x=a.visiblePath,y=b.visiblePath;if(!x||!y)return false;
 return !sourceRouteMatchesProgram(x.vertices,y,{checks:0})||!sourceRouteMatchesProgram(y.vertices,x,{checks:0});
}
module.exports={captureScenePathReview,readScenePathObservation,scenePathReviewConsensus,scenePathReviewsDistinct};
