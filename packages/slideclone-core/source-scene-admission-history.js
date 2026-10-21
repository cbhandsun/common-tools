// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {sceneRejectedRelationCandidates,sceneRelationLocalizations}=require('./source-scene-rejected-relations');
const {sceneObjectBatches}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Admission['rejections'][number]} Rejection */
/** @typedef {{index:number,detailCode:'relation-anchor-scope'|'tuple',relationId:string,regionId:string,fromId:string,toId:string,direction:string,shaftBox:import('./source-scene-plan').Box}} Repair */
/** @typedef {{version:1,sourceHash:string,widthPx:number,heightPx:number,rejections:Rejection[],relations:Repair[]}} History */
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** @param {unknown} value @returns {value is string} */
const code=value=>typeof value==='string'&&/^[a-z][a-zA-Z-]{0,63}$/u.test(value);
/** @param {unknown} value @returns {Rejection[]} */
function rejections(value){
 if(!list(value)||value.length>256)throw new TypeError('Scene admission history rejections are invalid');
 const seen=new Set();
 for(const row of value){
  if(!record(row)||Reflect.ownKeys(row).some(k=>!['collection','index','reason','detailCode'].includes(String(k)))
   ||typeof row.collection!=='string'||!['object','relation','program','missingText'].includes(row.collection)
   ||!Number.isSafeInteger(row.index)||Number(row.index)<0||Number(row.index)>=(row.collection==='object'?64:row.collection==='missingText'?512:24)
   ||!code(row.reason)||row.detailCode!==undefined&&!code(row.detailCode)||seen.has(row.collection+':'+row.index))
   throw new TypeError('Scene admission history rejection binding is invalid');
  seen.add(row.collection+':'+row.index);
 }
 return /** @type {Rejection[]} */(value);
}
/** This history carries only sanitized admission controls and repair identity
 * bindings. It grants no drawing, source evidence, completion or extra slots.
 * @param {unknown} value @param {string} sourceHash @returns {History} */
function readHistory(value,sourceHash){
 if(typeof sourceHash!=='string'||!record(value)||Reflect.ownKeys(value).length!==6||value.version!==1||value.sourceHash!==sourceHash
  ||!/^[a-f0-9]{64}$/u.test(sourceHash)||![value.widthPx,value.heightPx].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(value.widthPx)*Number(value.heightPx)>40000000||!list(value.relations)||value.relations.length>24)
  throw new TypeError('Scene admission history source is invalid');
 const original=rejections(value.rejections),indices=new Set(),ids=new Set();
 for(const row of value.relations){
  if(!record(row)||Reflect.ownKeys(row).length!==8||!Number.isSafeInteger(row.index)||Number(row.index)<0||Number(row.index)>=24
   ||row.detailCode!=='relation-anchor-scope'&&row.detailCode!=='tuple'
   ||indices.has(row.index)||!identity(row.relationId)||ids.has(row.relationId)||!identity(row.regionId)
   ||!identity(row.fromId)||!identity(row.toId)||row.fromId===row.toId
   ||typeof row.direction!=='string'||!['forward','backward','both','undirected'].includes(row.direction)
   ||!box(row.shaftBox)||Reflect.ownKeys(row.shaftBox).length!==4
   ||row.shaftBox.x+row.shaftBox.w>Number(value.widthPx)||row.shaftBox.y+row.shaftBox.h>Number(value.heightPx)
   ||!original.some(r=>r.collection==='relation'&&r.index===row.index&&r.reason==='relation-contract'&&r.detailCode===row.detailCode))
   throw new TypeError('Scene admission history repair is invalid');
  indices.add(row.index);ids.add(row.relationId);
 }
 return /** @type {History} */(value);
}
/** @param {Rejection} a @param {Rejection} b */
function sameRejection(a,b){return a.collection===b.collection&&a.index===b.index&&a.reason===b.reason&&a.detailCode===b.detailCode;}
/** Revalidate persisted mappings against current controls. Later changes cannot
 * reuse a successful repair flag; source compilation remains independently
 * mandatory. New downstream failures may be appended to the active list.
 * @param {Plan} plan @returns {History|undefined} */
function sceneAdmissionHistory(plan){
 if(!record(plan)||plan.admission!==undefined&&!record(plan.admission))throw new TypeError('Scene admission history is invalid');
 const value=plan.admission?.history;if(value===undefined)return undefined;
 const history=readHistory(value,plan.sourceHash),active=rejections(plan.admission?.rejections);
 if(history.widthPx!==plan.widthPx||history.heightPx!==plan.heightPx||!list(plan.relations)||plan.relations.some(r=>!record(r)))
  throw new TypeError('Scene admission history frame is invalid');
 // The existing source-bound physical alias ledger preserves the original
 // slot and owner. Keep the repair snapshot, and resolve only these validated
 // aliases when a later measured compaction retains its canonical endpoint.
 const aliases=sceneObjectBatches(plan)?.aliases??[];
 const canonical=(/** @type {string} */id)=>aliases.find(a=>a.id===id)?.canonicalId??id;
 for(const original of history.rejections){
  const repaired=original.collection==='relation'&&history.relations.some(r=>r.index===original.index);
  if(repaired?active.some(r=>r.collection===original.collection&&r.index===original.index):!active.some(r=>sameRejection(r,original)))
   throw new TypeError('Scene admission history transition is invalid');
 }
 for(const row of history.relations){
  const matches=plan.relations.filter(r=>r.id===row.relationId),current=matches[0];
  if(matches.length!==1||!current||current.regionId!==row.regionId||current.fromId!==canonical(row.fromId)||current.toId!==canonical(row.toId)
   ||current.direction!==row.direction||!box(current.shaftBox)||['x','y','w','h'].some(k=>current.shaftBox?.[/** @type {keyof typeof row.shaftBox} */(k)]!==row.shaftBox[/** @type {keyof typeof row.shaftBox} */(k)]))
   throw new TypeError('Scene admission history member is invalid');
 }
 return history;
}
/** Snapshot before the first successful original two-view repair. Legacy plans
 * without history keep their existing meaning until that actual transition.
 * The caller already established consensus, anchors, scope and collisions.
 * @param {Plan} previous @param {Plan} next @param {number[]} indices @returns {Plan} */
function recordSceneAdmissionRepairs(previous,next,indices){
 const prior=sceneAdmissionHistory(previous);
 if(!list(indices)||indices.length>24||indices.some(n=>!Number.isSafeInteger(n)||n<0||n>=24)||new Set(indices).size!==indices.length
  ||!record(next)||previous.sourceHash!==next.sourceHash||previous.widthPx!==next.widthPx||previous.heightPx!==next.heightPx
  ||!list(next.relations)||next.relations.some(r=>!record(r)))throw new TypeError('Scene admission history transition is invalid');
 if(next.admission!==undefined&&!record(next.admission)||next.admission?.history!==previous.admission?.history)
  throw new TypeError('Scene admission history transition is invalid');
 if(!indices.length){sceneAdmissionHistory(next);return next;}
 if(!record(next.admission))throw new TypeError('Scene admission history transition is invalid');
 const candidates=sceneRejectedRelationCandidates(previous),localizations=sceneRelationLocalizations(previous);
 const original=prior?.rejections??rejections(previous.admission?.rejections);
 const repairs=[...(prior?.relations??[])];
 for(const index of indices){
  const candidate=candidates.find(c=>c.index===index),localization=localizations.find(c=>c.index===index);
  const current=next.relations.find(r=>r.id===(candidate?.relation.id??localization?.core.id));
  if(!current||!box(current.shaftBox)||!(candidate?current.regionId===candidate.reviewRegionId&&box(candidate.relation.shaftBox)
   &&['x','y','w','h'].every(k=>current.shaftBox?.[/** @type {keyof typeof current.shaftBox} */(k)]===candidate.relation.shaftBox?.[/** @type {keyof typeof current.shaftBox} */(k)])
   :localization&&current.regionId===localization.core.regionId&&current.fromId===localization.core.fromId&&current.toId===localization.core.toId&&current.direction===localization.core.direction))
   throw new TypeError('Scene admission history original repair is invalid');
  repairs.push({index,detailCode:localization?'tuple':candidate?.reason??'relation-anchor-scope',relationId:current.id,regionId:current.regionId,fromId:current.fromId,toId:current.toId,direction:current.direction,shaftBox:{...current.shaftBox}});
 }
 const history={version:/** @type {const} */(1),sourceHash:previous.sourceHash,widthPx:previous.widthPx,heightPx:previous.heightPx,
  rejections:original.map(r=>({...r})),relations:repairs};
 const result={...next,admission:{...next.admission,history}};sceneAdmissionHistory(result);return result;
}
/** Final inventory validates the same source-bound identity mapping and global
 * attempt accounting, then the normal audit checks every surviving member.
 * History cannot discharge a reserved/rejected slot or authorize a replacement.
 * @param {unknown} value @param {string} sourceHash
 * @param {{id:string,regionId:string,kind:string}[]} units
 * @param {unknown} batches @param {unknown} [objectBatches] @returns {boolean} */
function sceneInventoryAdmissionHistoryValid(value,sourceHash,units,batches,objectBatches){
 if(value===undefined)return true;
 try{
  const history=readHistory(value,sourceHash);
  if(objectBatches!==undefined&&(!record(objectBatches)||objectBatches.sourceHash!==history.sourceHash
   ||objectBatches.widthPx!==history.widthPx||objectBatches.heightPx!==history.heightPx))return false;
  if(!list(batches)||!batches.every(record))return false;
  const global=batches.find(b=>b.id==='global');
  if(!global||!list(global.members)||!list(global.reserved)||typeof (global.rejected??0)!=='number')return false;
  const members=global.members;
  if(history.rejections.filter(r=>r.collection==='relation').length-history.relations.length!==global.reserved.length+Number(global.rejected??0))return false;
  return history.relations.every(row=>members.includes(row.relationId)
   &&units.filter(u=>u.id===row.relationId&&u.regionId===row.regionId&&u.kind==='relation').length===1);
 }catch(error){if(!(error instanceof TypeError&&/^Scene admission history /u.test(error.message)))throw error;return false;}
}
module.exports={sceneAdmissionHistory,recordSceneAdmissionRepairs,sceneInventoryAdmissionHistoryValid};
