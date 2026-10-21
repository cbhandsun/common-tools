// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {parseScenePathProgram}=require('./source-scene-path-program');
const {retainSceneRelationLocalizations,sceneRelationLocalizations}=require('./source-scene-relation-localization');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Relation} Relation */
/** @typedef {{index:number,relation:Relation,reviewRegionId:string,reason?:'tuple'}} Candidate */
/** @param {import('./source-scene-plan').Box} a @param {import('./source-scene-plan').Box} b */
function contains(a,b){return b.x>=a.x&&b.y>=a.y&&b.x+b.w<=a.x+a.w+1e-6&&b.y+b.h<=a.y+a.h+1e-6;}
/** Reparse the original proposal against successive declared ancestors. This
 * preserves only a fully validated anchor/references/identity, never the raw
 * response. The original rejection and owner remain until two observations
 * agree on physical endpoints in this bounded review scope.
 * @param {number} index @param {string} ownerId
 * @param {import('./source-scene-plan').Region[]} regions
 * @param {(regionId:string)=>Plan|undefined} parseAtRegion @returns {Candidate|undefined} */
function retainSceneRejectedRelation(index,ownerId,regions,parseAtRegion){
 const byId=new Map(regions.map(r=>[r.id,r])),seen=new Set();let region=byId.get(ownerId);
 while(region?.parentId){
  const parent=byId.get(region.parentId);
  if(!parent||seen.has(parent.id)||!contains(parent.box,region.box))return undefined;
  seen.add(parent.id);region=parent;
  try{
   const parsed=parseAtRegion(region.id),relation=parsed?.relations[0];
   return relation?.shaftBox?{index,reviewRegionId:region.id,relation:{...relation,regionId:ownerId}}:undefined;
  }catch(error){
   if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;
   if(error.message!=='Scene relation anchor scope is invalid')return undefined;
  }
 }
 return undefined;
}
/** A malformed path cannot authorize geometry. Retain only an independently
 * strict-parsed core from the exact seven-field relation tuple, without its
 * unsupported path payload. The identity, owner, endpoint references and shaft
 * anchor must all be valid. This remains quarantined until the original two
 * source observations agree, and the compiler measures the complete route.
 * @param {number} index @param {unknown} raw
 * @param {(tuple:unknown[])=>Plan|undefined} parseWithoutPath @returns {Candidate|undefined} */
function retainSceneRejectedRelationPath(index,raw,parseWithoutPath){
 if(!list(raw)||raw.length!==7||raw[6]===null)return undefined;
 try{
  const relation=parseWithoutPath([...raw.slice(0,6),null])?.relations[0];
  return relation?.shaftBox?{index,reviewRegionId:relation.regionId,relation,reason:'tuple'}:undefined;
 }catch(error){if(!(error instanceof TypeError&&/^Scene /u.test(error.message)))throw error;return undefined;}
}
/** Revalidate persisted review controls before allocating targets or slots.
 * Rejected candidates remain outside the drawable/native inventory and reserve
 * their original relation slots. A stale/malicious candidate cannot authorize
 * an owner, geometry change, new identity or additional model capacity.
 * @param {Plan} plan @returns {Candidate[]} */
function sceneRejectedRelationCandidates(plan){
 if(plan.admission!==undefined&&(!record(plan.admission)||!list(plan.admission.rejections)||plan.admission.rejections.length>256
  ||plan.admission.rejections.some(r=>!record(r))))throw new TypeError('Scene rejected relation admission is invalid');
 const values=plan.admission?.relationCandidates;
 if(values===undefined)return [];
 if(!list(values)||values.length>24||values.length+plan.relations.length>(plan.relationBatches===undefined?24:48))throw new TypeError('Scene rejected relation capacity is invalid');
 const ids=new Set(plan.relations.map(r=>r.id)),indices=new Set(),entities=new Set([...plan.regions,...plan.objects].map(e=>e.id));
 const regions=new Map(plan.regions.map(r=>[r.id,r]));
 return values.map(raw=>{
  if(!record(raw)||Reflect.ownKeys(raw).length!==(raw.reason===undefined?3:4)||raw.reason!==undefined&&raw.reason!=='tuple'
   ||!Number.isSafeInteger(raw.index)||raw.index<0||raw.index>=24||indices.has(raw.index)
   ||typeof raw.reviewRegionId!=='string'||!record(raw.relation))throw new TypeError('Scene rejected relation binding is invalid');
  const r=raw.relation,scope=regions.get(raw.reviewRegionId),owner=typeof r.regionId==='string'?regions.get(r.regionId):undefined,pathRepair=raw.reason==='tuple';
  if(Reflect.ownKeys(r).some(k=>typeof k!=='string'||!['id','regionId','fromId','toId','direction','shaftBox','visiblePath'].includes(k))
   ||typeof r.id!=='string'||!/^relation-[A-Za-z][A-Za-z0-9_-]{0,54}$/u.test(r.id)||ids.has(r.id)
   ||typeof r.fromId!=='string'||typeof r.toId!=='string'||!entities.has(r.fromId)||!entities.has(r.toId)||r.fromId===r.toId
   ||typeof r.direction!=='string'||!['forward','backward','both','unknown','undirected'].includes(r.direction)||!scope||!owner
   ||!box(r.shaftBox)||Reflect.ownKeys(r.shaftBox).length!==4||!contains(scope.box,r.shaftBox)
   ||(pathRepair?scope.id!==owner.id||!contains(owner.box,r.shaftBox)||r.visiblePath!==undefined:contains(owner.box,r.shaftBox))
   ||!plan.admission?.rejections.some(e=>e.collection==='relation'&&e.index===raw.index&&e.reason==='relation-contract'&&e.detailCode===(pathRepair?'tuple':'relation-anchor-scope')))
   throw new TypeError('Scene rejected relation controls are invalid');
  let current=owner;const seen=new Set();
  while(current.id!==scope.id){
   const parent=current.parentId?regions.get(current.parentId):undefined;
   if(!parent||seen.has(parent.id)||!contains(parent.box,current.box))throw new TypeError('Scene rejected relation ancestry is invalid');
   seen.add(parent.id);current=parent;
  }
  parseScenePathProgram(r.visiblePath,{widthPx:plan.widthPx,heightPx:plan.heightPx,coordinateSpace:'compiled-source-pixels',owner:scope.box,shaftBox:r.shaftBox});
  indices.add(raw.index);ids.add(r.id);
  return {index:raw.index,reviewRegionId:scope.id,relation:/** @type {Relation} */({...r,shaftBox:{...r.shaftBox}}),...(pathRepair?{reason:/** @type {const} */('tuple')}:{})};
 });
}
module.exports={retainSceneRejectedRelation,retainSceneRejectedRelationPath,sceneRejectedRelationCandidates,retainSceneRelationLocalizations,sceneRelationLocalizations};
