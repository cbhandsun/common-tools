// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {containsSceneBox}=require('./source-scene-endpoint-scope');
const {resolveSceneCensusScopeReview}=require('./source-scene-census-scope-review');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-census-scope-review').CensusScopeReview} Control */
/** @typedef {{id:string,regionId:string,fromId:string,toId:string,direction:string,shaftBox:import('./source-scene-plan').Box}} DiscoveredRelation */
/** @typedef {{control:Control,relations:DiscoveredRelation[]}} Discovery */
/** @param {unknown} v @returns {v is string} */
const id=v=>typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v);
/** @param {unknown} v @returns {v is number|null} */
const count=v=>v===null||typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000;
/** Validate bounded plain data before traversing nested serialized controls.
 * These records express discovery provenance, not repaired original tuples.
 * @param {unknown} value @param {string} sourceHash @param {number} widthPx @param {number} heightPx @returns {Discovery[]} */
function readSceneCensusDiscoveries(value,sourceHash,widthPx,heightPx){
 if(value===undefined)return [];
 if(typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(sourceHash)||![widthPx,heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||widthPx*heightPx>40000000||!list(value)||value.length>24)throw new TypeError('Scene census discovery history is invalid');
 const sources=new Set(),ids=new Set();let relations=0;
 for(const entry of value){
  if(!record(entry)||Reflect.ownKeys(entry).length!==2||!record(entry.control)||!list(entry.relations)||!entry.relations.length||entry.relations.length>24)
   throw new TypeError('Scene census discovery record is invalid');
  const c=entry.control;
  if(Reflect.ownKeys(c).length!==11||c.sourceHash!==sourceHash||c.widthPx!==widthPx||c.heightPx!==heightPx
   ||!id(c.sourceRegionId)||!id(c.reviewRegionId)||c.sourceRegionId===c.reviewRegionId||sources.has(c.sourceRegionId)
   ||!box(c.box)||!box(c.ownerBox)||!containsSceneBox(c.ownerBox,c.box)||c.ownerBox.x+c.ownerBox.w>widthPx+1e-6||c.ownerBox.y+c.ownerBox.h>heightPx+1e-6
   ||!count(c.observedRelations)||c.observedRelations===null||c.observedRelations<1||!count(c.reviewObservedRelations)
   ||!list(c.endpoints)||c.endpoints.length<2||c.endpoints.length>64||!list(c.chain)||c.chain.length<2||c.chain.length>24)
   throw new TypeError('Scene census discovery scope is invalid');
  const endpoints=new Set();
  for(const e of c.endpoints){
   if(!record(e)||Reflect.ownKeys(e).length!==4||!id(e.id)||endpoints.has(e.id)||!box(e.box)||!containsSceneBox(c.box,e.box)
    ||!['object','region','text'].includes(String(e.entityKind))||e.ownerId!==null&&!id(e.ownerId))throw new TypeError('Scene census discovery endpoint is invalid');
   endpoints.add(e.id);
  }
  const chain=new Set();
  for(const [index,r]of c.chain.entries()){
   const previous=c.chain[index-1];
   if(!record(r)||Reflect.ownKeys(r).length!==4||!id(r.id)||chain.has(r.id)||r.parentId!==null&&!id(r.parentId)
    ||typeof r.kind!=='string'||!['section','diagram','group','card','container','table'].includes(r.kind)||!box(r.box)
    ||previous&&(!record(previous)||previous.parentId!==r.id||!box(previous.box)||!containsSceneBox(r.box,previous.box)))throw new TypeError('Scene census discovery ancestry is invalid');
   chain.add(r.id);
  }
  const first=c.chain[0],last=c.chain.at(-1);
  if(!record(first)||!record(last)||first.id!==c.sourceRegionId||last.id!==c.reviewRegionId
   ||JSON.stringify(first.box)!==JSON.stringify(c.box)||JSON.stringify(last.box)!==JSON.stringify(c.ownerBox))
   throw new TypeError('Scene census discovery ancestry binding is invalid');
  for(const r of entry.relations){
   if(!record(r)||Reflect.ownKeys(r).length!==6||!id(r.id)||ids.has(r.id)||r.regionId!==c.reviewRegionId
    ||!id(r.fromId)||!id(r.toId)||r.fromId===r.toId||!endpoints.has(r.fromId)||!endpoints.has(r.toId)
    ||typeof r.direction!=='string'||!['forward','backward','both','undirected'].includes(r.direction)
    ||!box(r.shaftBox)||!containsSceneBox(c.box,r.shaftBox))throw new TypeError('Scene census discovery relation is invalid');
   ids.add(r.id);relations++;
  }
  if(entry.relations.length>c.observedRelations||relations>24)throw new TypeError('Scene census discovery count is invalid');sources.add(c.sourceRegionId);
 }
 return /** @type {Discovery[]} */(value);
}
/** This verifies only admitted identities and their unchanged local attempt
 * ledger. Every relation still needs ordinary measured source/output proof.
 * @param {Plan} plan @param {Discovery[]} discoveries */
function validateSceneCensusDiscoveries(plan,discoveries){
 if(!discoveries.length)return;
 if(!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r))
  ||!list(plan.relationBatches)||plan.relationBatches.length>2||plan.relationBatches.some(r=>!record(r)))throw new TypeError('Scene census discovery batch is invalid');
 const local=plan.relationBatches.find(r=>r.id==='local-consensus'),global=plan.relationBatches.find(r=>r.id==='global');
 if(!local||!global||!list(local.members)||local.members.length>24||!list(global.members)||global.members.length>24)throw new TypeError('Scene census discovery batch is invalid');
 for(const entry of discoveries){
  const c=resolveSceneCensusScopeReview(plan,entry.control);
  for(const row of entry.relations){
   const matches=plan.relations.filter(r=>r.id===row.id),current=matches[0];
   if(matches.length!==1||!current||!local.members.includes(row.id)||global.members.includes(row.id)
    ||current.regionId!==c.reviewRegionId||current.fromId!==row.fromId||current.toId!==row.toId||current.direction!==row.direction
    ||!box(current.shaftBox)||['x','y','w','h'].some(k=>current.shaftBox?.[/** @type {keyof typeof row.shaftBox} */(k)]!==row.shaftBox[/** @type {keyof typeof row.shaftBox} */(k)]))
    throw new TypeError('Scene census discovery member is invalid');
  }
 }
}
/** The same pure allocation is used by plan completion and the independent
 * serialized output audit. Exact original repairs are applied only when the
 * independent census has not already counted their final owners.
 * @param {{regionId:string,relations:number|null}[]|undefined} observations
 * @param {{regionId:string}[]} relations @param {{regionId:string,previousRegionId?:string}[]} repairs
 * @param {Discovery[]} discoveries @param {string} regionId @returns {number|null|undefined} */
function allocatedSceneRelationObservation(observations,relations,repairs,discoveries,regionId){
 /** @param {string} owner */
 const base=owner=>{
  const original=observations?.find(row=>row.regionId===owner)?.relations;if(original==null)return original;
  const incoming=discoveries.filter(d=>d.control.reviewRegionId===owner).reduce((n,d)=>n+d.relations.length,0);
  const outgoing=discoveries.filter(d=>d.control.sourceRegionId===owner).reduce((n,d)=>n+d.relations.length,0);
  const value=original+incoming-outgoing;
  if(!Number.isSafeInteger(value)||value<0||value>10000)throw new TypeError('Scene program relation census transfer is invalid');return value;
 };
 const observed=base(regionId);if(observed==null)return observed;
 const transfers=repairs.filter(row=>row.previousRegionId!==undefined),owners=new Set([regionId]);
 for(let pass=0;pass<transfers.length;pass++)for(const row of transfers)
  if(row.previousRegionId!==undefined&&(owners.has(row.regionId)||owners.has(row.previousRegionId))){owners.add(row.regionId);owners.add(row.previousRegionId);}
 if(owners.size===1)return observed;
 const counts=[...owners].map(owner=>{
  const current=relations.filter(row=>row.regionId===owner).length;
  const incoming=transfers.filter(row=>row.regionId===owner).length,outgoing=transfers.filter(row=>row.previousRegionId===owner).length;
  return {owner,observed:base(owner),current,original:current-incoming+outgoing};
 });
 if(counts.some(row=>row.observed==null))return null;
 if(counts.every(row=>Number(row.observed)>=row.current))return observed;
 if(counts.some(row=>Number(row.observed)<row.original||Number(row.observed)+row.current-row.original>10000))throw new TypeError('Scene program relation census transfer is invalid');
 const row=counts.find(r=>r.owner===regionId);return row?Number(row.observed)+row.current-row.original:observed;
}
module.exports={readSceneCensusDiscoveries,validateSceneCensusDiscoveries,allocatedSceneRelationObservation};
