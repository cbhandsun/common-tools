// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {sceneRejectedRelationCandidates,sceneRelationLocalizations}=require('./source-scene-rejected-relations');
const {sceneAdmissionHistory}=require('./source-scene-admission-history');
/** One global proposal and one consensus proposal from the two original local
 * views. Existing endpoint repairs consume local proposal slots as well. No
 * third batch/call or independent source/time/glyph budget is granted.
 * @typedef {{id:'global'|'local-consensus',members:string[],reviewed?:string[],rejected?:number}} RelationBatch */
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @param {unknown} value @returns {string[]} */
function identities(value){
 if(!list(value)||value.length>24||value.some(id=>typeof id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id))
  ||new Set(value).size!==value.length)throw new TypeError('Scene relation batch identities are invalid');
 return /** @type {string[]} */(value);
}
/** Failed proposals consume slots without acquiring drawable identities.
 * @param {unknown} value @returns {number} */
function rejectedCount(value){
 if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0||value>24)
  throw new TypeError('Scene relation batch rejection count is invalid');
 return value;
}
/** Unusable global anchors still consumed an original proposal slot. Anchored
 * quarantined candidates are already counted as members and must not be billed
 * twice. Only admitted scalar rejection controls participate; no raw response.
 * @param {Plan} plan @param {{index:number}[]} pending */
function globalRejectedCount(plan,pending){
 const anchored=new Set(pending.map(c=>c.index)),indices=new Set();let rejected=0;
 for(const row of plan.admission?.rejections??[]){
  if(row.collection!=='relation')continue;
  if(!Number.isSafeInteger(row.index)||row.index<0||row.index>=24||indices.has(row.index)||row.reason!=='relation-contract')
   throw new TypeError('Scene relation batch rejected controls are invalid');
  indices.add(row.index);if(!anchored.has(row.index))rejected++;
 }
 return rejected;
}
/** Legacy plans keep their single 24-slot meaning unless an explicit validated
 * second batch exists. Rejected controls reserve their original global slots.
 * @param {Plan} plan @returns {RelationBatch[]} */
function sceneRelationBatches(plan){
 if(!record(plan)||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)||typeof r.id!=='string'))
  throw new TypeError('Scene relation batch inventory is invalid');
 sceneAdmissionHistory(plan);
 const pending=sceneRejectedRelationCandidates(plan);
 const localizations=sceneRelationLocalizations(plan),held=[...pending,...localizations];
 const globalRejected=globalRejectedCount(plan,held);
 const ids=[...plan.relations.map(r=>r.id),...pending.map(c=>c.relation.id),...localizations.map(c=>c.core.id)];
 if(new Set(ids).size!==ids.length)throw new TypeError('Scene relation batch identities conflict');
 if(plan.relationBatches===undefined){
  const members=[...identities(ids)];
  if(members.length+globalRejected>24)throw new TypeError('Scene relation batch capacity is invalid');
  return [{id:/** @type {const} */('global'),members,...(globalRejected?{rejected:globalRejected}:{})}];
 }
 const rows=plan.relationBatches;
 if(!list(rows)||!rows.length||rows.length>2)throw new TypeError('Scene relation batches are invalid');
 const names=new Set(),members=new Set();
 const batches=rows.map(raw=>{
  if(!record(raw)||Reflect.ownKeys(raw).some(k=>!['id','members','reviewed','rejected'].includes(String(k)))
   ||(raw.id!=='global'&&raw.id!=='local-consensus')||names.has(raw.id)||raw.id==='global'&&raw.reviewed!==undefined)
   throw new TypeError('Scene relation batch binding is invalid');
  names.add(raw.id);const values=identities(raw.members),reviewed=raw.reviewed===undefined?[]:identities(raw.reviewed);
  const rejected=raw.rejected===undefined?(raw.id==='global'?globalRejected:0):rejectedCount(raw.rejected);
  if(raw.id==='global'&&rejected!==globalRejected)throw new TypeError('Scene relation batch rejection binding is invalid');
  if(values.length+reviewed.length+rejected>24||values.some(id=>!ids.includes(id)||members.has(id)))
   throw new TypeError('Scene relation batch capacity is invalid');
  values.forEach(id=>members.add(id));
  return {id:/** @type {RelationBatch['id']} */(raw.id),members:[...values],...(raw.id==='local-consensus'?{reviewed:[...reviewed]}:{}),
   ...(rejected?{rejected}:{})};
 });
 const global=batches.find(b=>b.id==='global'),local=batches.find(b=>b.id==='local-consensus');
 if(!global||members.size!==ids.length||[...pending.map(c=>c.relation.id),...localizations.map(c=>c.core.id)].some(id=>!global.members.includes(id))
  ||local?.reviewed?.some(id=>!global.members.includes(id)))throw new TypeError('Scene relation batch coverage is invalid');
 return batches;
}
/** @param {Plan|undefined} plan */
function sceneRelationSlotsUsed(plan){return plan?sceneRelationBatches(plan).reduce((sum,b)=>sum+b.members.length+(b.rejected??0),0):0;}
/** @param {Plan|undefined} plan @param {number} [repairTargets] */
function sceneLocalRelationCapacity(plan,repairTargets=0){
 if(!Number.isSafeInteger(repairTargets)||repairTargets<0||repairTargets>24)throw new RangeError('Scene local relation repair capacity is invalid');
 const local=plan?sceneRelationBatches(plan).find(b=>b.id==='local-consensus'):undefined;
 return Math.max(0,24-(local?.members.length??0)-(local?.reviewed?.length??repairTargets)-(local?.rejected??0));
}
/** Every phase updates the same local consensus batch. It cannot turn a
 * repeated merge into another 24 slots. Caller supplies already validated
 * two-view proposals; final compilation still measures every source unit.
 * @param {Plan} original @param {Plan} result @param {string[]} added @param {string[]} [reviewed] @param {number} [rejected]
 * @returns {Plan} */
function recordSceneLocalRelationBatch(original,result,added,reviewed=[],rejected=0){
 rejectedCount(rejected);
 const batches=sceneRelationBatches(original),previous=batches.find(b=>b.id==='local-consensus');
 if(!added.length&&!reviewed.length&&!rejected){
  if(original.relationBatches===undefined)return result;
  const preserved={...result,relationBatches:batches};sceneRelationBatches(preserved);return preserved;
 }
 if((previous?.rejected??0)+rejected>24)throw new TypeError('Scene relation batch capacity is invalid');
 const local={id:/** @type {const} */('local-consensus'),members:[...(previous?.members??[]),...identities(added)],
  reviewed:[...new Set([...(previous?.reviewed??[]),...identities(reviewed)])],
  ...((previous?.rejected??0)+rejected?{rejected:(previous?.rejected??0)+rejected}:{})};
 const plan={...result,relationBatches:[...batches.filter(b=>b.id==='global'),local]};
 sceneRelationBatches(plan);return plan;
}
/** Export a complete batch ledger for the actual source-bound native inventory.
 * Reserved rejects stay visible and cannot satisfy materialization counts.
 * @param {Plan} plan */
function sceneInventoryRelationBatches(plan){
 const native=new Set(plan.relations.map(r=>r.id));
 return sceneRelationBatches(plan).map(b=>({id:b.id,members:b.members.filter(id=>native.has(id)),
  reserved:b.members.filter(id=>!native.has(id)),...(b.reviewed?{reviewed:[...b.reviewed]}:{}),...(b.rejected?{rejected:b.rejected}:{})}));
}
/** Serialized ledgers must account for every real native relation and every
 * reserved reject. Counts, labels or forged extra batches grant no membership.
 * @param {unknown} value @param {string[]} relationIds */
function sceneInventoryRelationBatchesValid(value,relationIds){
 if(!list(value)||!value.length||value.length>2||relationIds.length>48||new Set(relationIds).size!==relationIds.length)return false;
 const names=new Set(),members=new Set(),reserved=new Set();
 /** @type {Map<string,string[]>} */const reviews=new Map();
 /** @type {Set<string>} */const globalIds=new Set();
 try{
  for(const raw of value){
   if(!record(raw)||Reflect.ownKeys(raw).some(k=>!['id','members','reserved','reviewed','rejected'].includes(String(k)))
    ||(raw.id!=='global'&&raw.id!=='local-consensus')||names.has(raw.id)||raw.id==='global'&&raw.reviewed!==undefined)return false;
   names.add(raw.id);const current=identities(raw.members),held=identities(raw.reserved),reviewed=identities(raw.reviewed??[]);
   const rejected=raw.rejected===undefined?0:rejectedCount(raw.rejected);
   if(current.length+held.length+reviewed.length+rejected>24||raw.id==='local-consensus'&&held.length)return false;
   for(const id of [...current,...held]){
    if(members.has(id)||reserved.has(id)||current.includes(id)!==relationIds.includes(id))return false;
    (current.includes(id)?members:reserved).add(id);if(raw.id==='global')globalIds.add(id);
   }
   reviews.set(raw.id,reviewed);
  }
 }catch(error){if(!(error instanceof TypeError&&/^Scene relation batch /u.test(error.message)))throw error;return false;}
 return names.has('global')&&members.size===relationIds.length&&[...(reviews.get('local-consensus')??[])].every(id=>globalIds.has(id));
}
module.exports={sceneRelationBatches,sceneRelationSlotsUsed,sceneLocalRelationCapacity,recordSceneLocalRelationBatch,sceneInventoryRelationBatches,sceneInventoryRelationBatchesValid};
