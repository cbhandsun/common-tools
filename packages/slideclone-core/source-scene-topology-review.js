// @ts-check
"use strict";
const {types}=require('node:util');
const {containsSceneBox}=require('./source-scene-plan');
const {sceneRejectedRelationCandidates,sceneRelationLocalizations}=require('./source-scene-rejected-relations');
const {readSceneRelationLocalization,sceneRelationLocalizationConsensus}=require('./source-scene-relation-localization-review');
const {sceneRelationsConflict,sceneRelationWithinAnchor}=require('./source-scene-relation-identity');
const {sceneTopologyNeighborhood}=require('./source-scene-topology-neighborhood');
const {recordSceneLocalRelationBatch,sceneRelationBatches}=require('./source-scene-relation-batches');
const {rebindRegionProgramMembers}=require('./source-scene-region-program');
const {sourceSceneTopologyFailures}=require('./source-scene-compile-feedback');
const {recordSceneAdmissionRepairs}=require('./source-scene-admission-history');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id:string,box:Box,textMembers?:{labelRef:string,box:Box}[]}} Endpoint */
/** @typedef {{index:number,relationId:string,regionId:string,box:Box,endpoints:Endpoint[],shaftBox?:Box,admissionIndex?:number,localization?:import('./source-scene-relation-localization').Localization}} Target */
/** @typedef {{index:number,fromId:string|null,toId:string|null,direction:string,confidence:number,shaftBox?:Box,visibleMatches?:number,rejection?:string}} Observation */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function list(value,maximum){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
 ||value.length>maximum||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p)))
 throw new TypeError('Scene topology collection is invalid');return value;}
/** Both geometry and the declared region tree must authorize an endpoint.
 * A relation in a common ancestor can connect different child regions.
 * @param {Plan} plan @param {string} regionId @param {string} endpointId */
function sceneEndpointWithinScope(plan,regionId,endpointId){
 const regions=new Map(plan.regions.map(r=>[r.id,r])),scope=regions.get(regionId);
 const label=plan.textEndpoints?.find(t=>t.id===endpointId);
 const object=plan.objects.find(o=>o.id===endpointId),region=regions.get(endpointId),endpoint=object??region??label;
 if(!scope||!endpoint||object&&(!['container','icon'].includes(object.kind)||object.kind==='icon'&&object.parentObjectId!==undefined)||region&&!['card','container'].includes(region.kind)
  ||!containsSceneBox(scope.box,endpoint.box))return false;
 let owner=regions.get(object?object.regionId:label?label.regionId:endpointId);const seen=new Set();
 while(owner){
  if(seen.has(owner.id)||!containsSceneBox(owner.box,endpoint.box))return false;
  if(owner.id===regionId)return true;
  seen.add(owner.id);const parent=owner.parentId?regions.get(owner.parentId):undefined;
  if(!parent||!containsSceneBox(parent.box,owner.box))return false;owner=parent;
 }
 return false;
}
/** Repair explicit scope contradictions within existing object and relation
 * inventories. Every relation consumes one original local target; no new
 * object, relation, source scan or recognizer call is created.
 * @param {Plan|undefined} plan @param {number} capacity @param {unknown} [compileEvidence] */
function selectTopologyReviewTargets(plan,capacity,compileEvidence){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError('Scene topology capacity is invalid');
 if(!plan||!capacity)return [];
 // Scoped pictorial proposals retain their own identity. Only the source
 // compiler can grant a real native port. Invalid ownership/kinds still need
 // explicit reference review; semantic sections/diagrams are never nodes.
 const pending=sceneRejectedRelationCandidates(plan),localizations=sceneRelationLocalizations(plan);
 const physicalFailures=sourceSceneTopologyFailures(plan,compileEvidence);
 /** @type {{relation:import('./source-scene-plan').Relation,admissionIndex:number|undefined,localization?:import('./source-scene-relation-localization').Localization}[]} */
 const nominated=[...localizations.map(c=>({relation:{...c.core},admissionIndex:c.index,localization:c})),...pending.map(c=>({relation:{...c.relation,regionId:c.reviewRegionId},admissionIndex:c.index})),
  ...plan.relations.filter(r=>!pending.some(c=>c.relation.id===r.id)&&(physicalFailures.has(r.id)||[r.fromId,r.toId].some(id=>!sceneEndpointWithinScope(plan,r.regionId,id)
    ||plan.textEndpoints?.some(t=>t.id===id&&t.members!==undefined&&t.reviewed!==true)))).map(relation=>({relation,admissionIndex:/** @type {number|undefined} */(undefined)}))];
  return nominated.slice(0,Math.min(capacity,24)).map(({relation,admissionIndex,localization})=>{
   const scope=plan.regions.find(r=>r.id===relation.regionId);
   if(!scope)throw new TypeError('Scene topology scope is invalid');
   const pool=[...plan.regions,...plan.objects,...(plan.textEndpoints??[])].filter(e=>e.id!==scope.id&&sceneEndpointWithinScope(plan,scope.id,e.id));
    const endpoints=(localization?pool.filter(e=>e.id===relation.fromId||e.id===relation.toId):sceneTopologyNeighborhood(plan,relation,pool)).map(e=>{
    const text=plan.textEndpoints?.find(t=>t.id===e.id);
    return {id:e.id,box:{...e.box},...(text?.members?{textMembers:text.members.map(m=>({labelRef:m.labelRef,box:{...m.box}}))}:{})};
   });
   // The complete endpoint inventory bounds the review, not the wrong IDs.
   // Preserve the scope when fewer than two candidates exist; it stays failed.
   const x=endpoints.length>=2?Math.min(...endpoints.map(e=>e.box.x)):scope.box.x;
   const y=endpoints.length>=2?Math.min(...endpoints.map(e=>e.box.y)):scope.box.y;
   const right=endpoints.length>=2?Math.max(...endpoints.map(e=>e.box.x+e.box.w)):scope.box.x+scope.box.w;
   const bottom=endpoints.length>=2?Math.max(...endpoints.map(e=>e.box.y+e.box.h)):scope.box.y+scope.box.h;
   const anchor=relation.shaftBox;
   const left=anchor?Math.min(x,anchor.x):x,top=anchor?Math.min(y,anchor.y):y;
    return {relationId:relation.id,regionId:scope.id,...(admissionIndex!==undefined?{admissionIndex}:{}),...(localization?{localization}:{}),box:localization?{...scope.box}:{x:left,y:top,w:(anchor?Math.max(right,anchor.x+anchor.w):right)-left,
    h:(anchor?Math.max(bottom,anchor.y+anchor.h):bottom)-top},endpoints,...(anchor?{shaftBox:{...anchor}}:{})};
  });
}
/** @param {unknown} response @param {Target[]} targets @param {import('./source-scene-missing-text').CropFrame} [frame] @returns {Observation[]} */
function readTopologyObservations(response,targets,frame){
 if(!record(response))throw new TypeError('Scene topology response is invalid');
 const rows=list(response.relations===undefined?[]:response.relations,24),seen=new Set();
 const observations=rows.map(raw=>{
   const localization=record(raw)?targets.find(t=>t.index===raw.index)?.localization:undefined;
   if(!record(raw)||Object.keys(raw).length!==5+Number(!!localization)*2||!['index','fromId','toId','direction','confidence',...(localization?['shaftBox_2d','visibleMatches']:[])].every(k=>Object.hasOwn(raw,k))
   ||typeof raw.index!=='number'||!Number.isSafeInteger(raw.index)||!targets.some(t=>t.index===raw.index)||seen.has(raw.index)
   ||![raw.fromId,raw.toId].every(id=>id===null||typeof id==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id))
   ||typeof raw.direction!=='string'||!['forward','backward','both','unknown','undirected'].includes(raw.direction)
   ||typeof raw.confidence!=='number'||!Number.isFinite(raw.confidence)||raw.confidence<0||raw.confidence>1)
   throw new TypeError('Scene topology observation is invalid');
   const target=targets.find(t=>t.index===raw.index);if(!target)throw new TypeError('Scene topology target is invalid');
   seen.add(raw.index);return {index:raw.index,fromId:/** @type {string|null} */(raw.fromId),toId:/** @type {string|null} */(raw.toId),direction:raw.direction,confidence:raw.confidence,
    ...(localization?readSceneRelationLocalization(raw,target,frame):{})};
 });
 if(observations.length!==targets.length)throw new TypeError('Scene topology target binding is invalid');
 return observations;
}
/** Consensus changes references only. It never grants shaft, arrowhead or
 * port evidence; the final compiler must remeasure them at the original gates.
 * @param {Plan} plan @param {Target[]} targets @param {Observation[][]} observations */
function applyTopologyReview(plan,targets,observations){
 const [local,context]=observations;
 if(observations.length!==2||!local||!context||observations.some(rows=>rows.length!==targets.length))throw new TypeError('Scene topology consensus is invalid');
 const pending=sceneRejectedRelationCandidates(plan),localizations=sceneRelationLocalizations(plan),pendingIds=new Set([...pending.map(c=>c.relation.id),...localizations.map(c=>c.core.id)]);
 /** @type {{id:string,previousFromId:string,previousToId:string,fromId:string,toId:string,direction:string,previousRegionId:string,regionId:string}[]} */const corrected=[];
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 const relations=[...plan.relations,...pending.map(c=>c.relation),...localizations.map(c=>c.core)].map(relation=>{
  const target=targets.find(t=>t.relationId===relation.id);if(!target)return relation;
  const a=local.find(r=>r.index===target.index),b=context.find(r=>r.index===target.index);
  const decline=(/** @type {string} */reason)=>{rejected.push({id:relation.id,reason});return relation;};
  if(!a||!b)return decline('missing-observation');
  if(a.confidence<.9||b.confidence<.9)return decline('confidence');
  if(a.fromId!==b.fromId||a.toId!==b.toId||a.direction!==b.direction)return decline('endpoint-consensus');
  if(a.fromId===null||a.toId===null||a.fromId===a.toId||a.direction==='unknown')return decline('endpoint-unknown');
   const candidate=pending.find(c=>c.relation.id===relation.id),localization=localizations.find(c=>c.core.id===relation.id),owner=candidate?candidate.reviewRegionId:relation.regionId;
   if(target.regionId!==owner||target.admissionIndex!==(candidate?.index??localization?.index)||JSON.stringify(target.shaftBox)!==JSON.stringify('shaftBox'in relation?relation.shaftBox:undefined)
   ||![a.fromId,a.toId].every(id=>{
    const binding=target.endpoints.find(e=>e.id===id),entity=[...plan.regions,...plan.objects,...(plan.textEndpoints??[])].find(e=>e.id===id);
    const members=plan.textEndpoints?.find(t=>t.id===id)?.members;
    return binding&&entity&&JSON.stringify(binding.textMembers)===JSON.stringify(members)&&['x','y','w','h'].every(k=>binding.box[/** @type {keyof Box} */(k)]===entity.box[/** @type {keyof Box} */(k)])
     &&sceneEndpointWithinScope(plan,owner,id);
   }))return decline('source-scope');
   const location=localization?sceneRelationLocalizationConsensus(plan,target,a,b):undefined;
   if(location&&!location.shaftBox)return decline(location.reason??'localization-consensus');
   if(!candidate&&!localization&&relation.fromId===a.fromId&&relation.toId===a.toId&&relation.direction===a.direction
   &&![a.fromId,a.toId].some(id=>plan.textEndpoints?.some(t=>t.id===id&&t.members!==undefined&&t.reviewed!==true)))return relation;
  corrected.push({id:relation.id,previousFromId:relation.fromId,previousToId:relation.toId,fromId:a.fromId,toId:a.toId,direction:a.direction,previousRegionId:relation.regionId,regionId:owner});
   return {...relation,regionId:owner,fromId:a.fromId,toId:a.toId,direction:a.direction,...(location?.shaftBox?{shaftBox:location.shaftBox}:{})};
 });
 // Reverting a collision can expose an original reference that collides with
 // another proposed correction. Reject the full dependency chain; do not let
 // relation enumeration select a winner. Each round removes at least one
 // correction, so the unchanged 24-relation bound also bounds this closure.
 const active=new Set(corrected.map(r=>r.id)),originals=new Map(plan.relations.map(r=>[r.id,r]));
 let current=relations.filter(r=>!pendingIds.has(r.id)||active.has(r.id));
 while(active.size){
  const collisions=current.filter(r=>active.has(r.id)&&current.some(other=>other.id!==r.id&&sceneRelationsConflict(r,other)));
  if(!collisions.length)break;
  for(const r of collisions){active.delete(r.id);rejected.push({id:r.id,reason:'duplicate-source-relation'});}
  current=current.filter(r=>!pendingIds.has(r.id)||active.has(r.id)).map(r=>collisions.some(c=>c.id===r.id)?/** @type {import('./source-scene-plan').Relation} */(originals.get(r.id)):r);
 }
  const repaired=new Set([...pending.filter(c=>active.has(c.relation.id)),...localizations.filter(c=>active.has(c.core.id))].map(c=>c.index));
 const rejections=plan.admission?.rejections.filter(r=>r.collection!=='relation'||!repaired.has(r.index));
 const admission=rejections?{...plan.admission,complete:rejections.length===0,rejections,
   ...(plan.admission?.relationCandidates?{relationCandidates:plan.admission.relationCandidates.filter(c=>!repaired.has(c.index))}:{}),
   ...(plan.admission?.relationLocalizations?{relationLocalizations:plan.admission.relationLocalizations.filter(c=>!repaired.has(c.index))}:{})}:undefined;
 const confirmed=new Set(corrected.filter(r=>active.has(r.id)).flatMap(r=>[r.fromId,r.toId]));
 const textEndpoints=plan.textEndpoints?.map(t=>t.members&&confirmed.has(t.id)?{...t,reviewed:/** @type {const} */(true)}:t);
 const repairedPlan=recordSceneAdmissionRepairs(plan,{...plan,relations:current,...(textEndpoints?{textEndpoints}:{}),...(admission?{admission}:{})},[...repaired]);
 const result=recordSceneLocalRelationBatch(plan,repairedPlan,[],targets.map(t=>t.relationId));
 return {plan:rebindRegionProgramMembers(plan,result),evidence:{proposed:targets.length,corrected:corrected.filter(r=>active.has(r.id)),rejected}};
}
/** @param {Target[]} targets @param {import('./source-scene-missing-text').CropFrame|undefined} frame */
function topologyReviewPrompt(targets,frame){
 if(!targets.length)return '';
 if(!frame)throw new TypeError('Scene topology crop binding is invalid');
 const bindings=targets.map(target=>{
  const source=frame.sourceTargets.find(t=>t.index===target.index),sheet=frame.sheetTargets.find(t=>t.index===target.index);
  if(!source||!sheet)throw new TypeError('Scene topology crop binding is invalid');
  /** @param {Box} box */
  const corners=box=>[Math.floor((box.y-source.cropBox.y+sheet.cropBox.y)*1000/frame.height),Math.floor((box.x-source.cropBox.x+sheet.cropBox.x)*1000/frame.width),
   Math.ceil((box.y+box.h-source.cropBox.y+sheet.cropBox.y)*1000/frame.height),Math.ceil((box.x+box.w-source.cropBox.x+sheet.cropBox.x)*1000/frame.width)];
   return {index:target.index,relationId:target.relationId,regionId:target.regionId,...(target.admissionIndex!==undefined?{scopeRepair:true}:{}),...(target.localization?{needsLocalization:true,fromId:target.localization.core.fromId,toId:target.localization.core.toId,direction:target.localization.core.direction}:{}),...(target.shaftBox?{shaftBox2D:corners(target.shaftBox)}:{}),endpoints:target.endpoints.map(e=>({id:e.id,
   box_2d:[Math.floor((e.box.y-source.cropBox.y+sheet.cropBox.y)*1000/frame.height),Math.floor((e.box.x-source.cropBox.x+sheet.cropBox.x)*1000/frame.width),
    Math.ceil((e.box.y+e.box.h-source.cropBox.y+sheet.cropBox.y)*1000/frame.height),Math.ceil((e.box.x+e.box.w-source.cropBox.x+sheet.cropBox.x)*1000/frame.width)],
   ...(e.textMembers?{textMemberBoxes:e.textMembers.map(m=>({labelRef:m.labelRef,box_2d:corners(m.box)}))}:{})}))};
 });
 return ` relationsByIndex MUST map EXACT relation indices ${JSON.stringify(targets.map(t=>t.index))} to the explicitly bound per-index response shape. Ordinary entries use {fromId,toId,direction,confidence}; needsLocalization entries additionally require shaftBox_2d and visibleMatches, with one complete unique source match and unchanged bound endpoints/direction. For an unenclosed text endpoint with textMemberBoxes, inspect EVERY listed original OCR line and confirm that these exact lines together form ONE logical node targeted by this shaft. Select that group ID only if the whole membership is independently visible; never merge neighboring unrelated labels or treat its blank envelope as a physical body. Otherwise decline the group. Independently identify the original visible connector and its two COMPLETE enclosing nodes inside this target's candidateBox2D. When a binding includes shaftBox2D, identify ONLY the visible connector at that exact source location; this anchor determines its identity, so do not reassign it by reading order or choose a neighboring arrow. Follow that connector's shaft to the enclosing node at each end, then use their exact endpoint IDs from the inventory below. A box or ID alone proves nothing; inspect actual shaft and arrowheads. Preserve this relation's identity and owner. For legacy unanchored requested relations without needsLocalization in the same owner, first identify DISTINCT visible connectors, then bind them to increasing indices in source from-node y,x followed by to-node y,x order; this order only assigns IDs, never proves a connection. Do not create nodes or relations, return the same physical connector twice, or select endpoints from another crop. A standalone icon can be a pictorial endpoint only when the actual shaft identifies it; never substitute its containing panel or invent an enclosing surface. Full source isolation and native endpoint compilation remain mandatory. If the intended relation cannot be uniquely identified, return {fromId:null,toId:null,direction:"unknown",confidence:0}. Direction is forward for fromId to toId, backward for toId to fromId, both for two arrowheads, undirected ONLY for a complete visible connector with no arrowheads at either end; unknown remains uncertainty and is never an undirected edge. These reference proposals grant no source pixel ownership. Bindings: ${JSON.stringify(bindings)}. `;
}
module.exports={sceneEndpointWithinScope,selectTopologyReviewTargets,readTopologyObservations,applyTopologyReview,topologyReviewPrompt,sceneRelationWithinAnchor,sceneRelationBatches};
