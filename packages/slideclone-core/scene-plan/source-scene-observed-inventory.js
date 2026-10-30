// @ts-check
"use strict";
const {types}=require('node:util');
const {recoveryId,admitSceneRecoveries,captureSceneMembers,survivingSceneUnits,inspectSceneUnitMaterialization,sceneInventoryMembersValid}=require('./source-scene-inventory-materialization');
const {sceneInventoryRelationBatches,sceneInventoryRelationBatchesValid}=require('./source-scene-relation-batches');
const {sceneObjectBatches,sceneInventoryObjectBatchesValid}=require('./source-scene-object-batches');
const {unpackSceneInventoryMembers}=require('./source-scene-inventory-codec');
const {sceneAdmissionHistory,sceneInventoryAdmissionHistoryValid}=require('./source-scene-admission-history');
const {readSharedSceneRouteGraphs,sharedSceneRouteMembers}=require('./source-scene-shared-route-inventory');
const {readSceneRouteEndpoints}=require('./source-scene-route-endpoints');
const {reviseSceneInventoryEvidence,trustedSceneInventoryRevision}=require('./source-inventory-revision-output');
const {sceneProgramRelationObservation}=require('./source-scene-program-obligations');
/** @typedef {'containers'|'icons'|'relations'} Category */
/** @typedef {{containers:number|null,icons:number|null,relations:number|null}} ObservedCounts */
/** @typedef {{containers:number,icons:number,relations:number}} Counts */
/** @typedef {{regionId:string}&ObservedCounts} Observation */
/** @typedef {{id:string,regionId:string,kind:string,fromId?:string,toId?:string,direction?:string,origin?:'proposal'|'table-header'|'interior',key?:string,parentObjectId?:string,members?:import('./source-scene-inventory-materialization').Member[]}} Unit */
/** @typedef {{version:1|2|3|4|5|6,sourceHash:string,basis:'model-observation',scope:'direct-region-units',units:Unit[],inventoryRevision?:import('./source-inventory-revision').Revision,relationObservationUnit?:'logical-relations-v1',sharedRouteGraphs?:import('./source-scene-shared-route-inventory').SharedGraph[],endpointBindings?:import('./source-scene-route-endpoints').RouteEndpoint[],objectBatches?:import('./source-scene-object-batches').ObjectBatches,relationBatches?:ReturnType<typeof sceneInventoryRelationBatches>,admissionHistory?:import('./source-scene-admission-history').History,
 * regions:{regionId:string,observed:ObservedCounts,proposed:Counts,recovered?:Counts,materialized:Counts}[]}} InventoryEvidence */
/** @typedef {{reason:string,regionId?:string,kind?:Category,count?:number}&Partial<import('./source-scene-inventory-materialization').MaterializationFailure>} Finding */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @param {number} max @returns {v is unknown[]} */
function array(v,max){return Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max
 &&Reflect.ownKeys(v).length===v.length+1&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** Counts are bounded metadata, never slots, geometry, or source authority.
 * null is insufficient observation; zero is an explicitly observed absence.
 * @param {unknown} v @returns {v is number|null} */
function count(v){return v===null||typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=10000;}
/** @param {unknown} v @returns {v is string} */
function id(v){return typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v);}
/** Census is independent of intermediate object/relation admission probes.
 * @param {unknown} value @param {string[]} regions @param {(raw:unknown)=>string} scope
 * @param {boolean} required @returns {Observation[]|undefined} */
function parseObservedInventory(value,regions,scope,required){
 if(value===undefined&&!required)return undefined;
 if(!array(value,24)||value.length!==regions.length)throw new TypeError('Scene observed inventory is invalid');
 const seen=new Set();
 return value.map(raw=>{
  if(!array(raw,4)||raw.length!==4||!raw.slice(1).every(count))throw new TypeError('Scene observed inventory is invalid');
  const regionId=scope(raw[0]);
  if(!regions.includes(regionId)||seen.has(regionId))throw new TypeError('Scene observed inventory binding is invalid');
  seen.add(regionId);
  return {regionId,containers:/** @type {number|null} */(raw[1]),icons:/** @type {number|null} */(raw[2]),relations:/** @type {number|null} */(raw[3])};
 });
}
/** @param {Unit[]} units @param {string} regionId @param {Set<string>} [emitted] @returns {Counts} */
function totals(units,regionId,emitted){
 const rows=units.filter(u=>u.regionId===regionId&&(!emitted||emitted.has(u.id)));
 return {containers:rows.filter(u=>u.kind==='container').length,icons:rows.filter(u=>u.kind==='icon').length,relations:rows.filter(u=>u.kind==='relation').length};
}
/** Private same-surface aliases are compacted before calling this function.
 * Only explicit measured recovery descriptors join the census. Semantic region
 * backgrounds remain excluded; unrelated detector names grant no identity.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {unknown} shapes @param {unknown} images
 * @param {unknown} [recoveries]
 * @param {unknown} [sharedGraphs]
 * @param {{endpoints?:unknown,textBoxes?:unknown}} [routeControls]
 * @returns {InventoryEvidence|undefined} */
function buildSceneInventoryEvidence(plan,shapes,images,recoveries=[],sharedGraphs,routeControls={}){
 if(!record(routeControls))throw new TypeError('Scene route endpoint controls are invalid');
 if(plan.observedInventory===undefined)return undefined;
 const shared=sharedGraphs!==undefined||plan.relationObservationUnit!==undefined;
 const captured=captureSceneMembers(shapes,images);if(!captured)throw new TypeError('Scene inventory output is invalid');
 const recovered=admitSceneRecoveries(recoveries,plan);
 /** @type {Unit[]} */const proposed=[...plan.objects.map(o=>({id:o.id,regionId:o.regionId,kind:o.kind})),
  ...plan.relations.map(r=>({id:r.id,regionId:r.regionId,kind:'relation',...(shared?{fromId:r.fromId,toId:r.toId,direction:r.direction}:{})}))].map(u=>({...u,origin:'proposal',members:captured.get(u.id)??[]}));
 if(shared&&plan.relationObservationUnit!=='logical-relations-v1')throw new TypeError('Scene shared route observation unit is invalid');
 const units=[...proposed,...recovered.map(unit=>({...unit}))];
 const endpoints=shared?readSceneRouteEndpoints(routeControls.endpoints??[],units,plan.regions.map(r=>r.id)):[];
 if(!shared&&routeControls.endpoints!==undefined)throw new TypeError('Scene route endpoint observation unit is invalid');
 const graphs=shared?readSharedSceneRouteGraphs(sharedGraphs??[],units,plan.sourceHash,endpoints):[],
  emitted=survivingSceneUnits(units,shapes,images,true,graphs,endpoints,routeControls.textBoxes??[]);
 if(!emitted||recovered.some(u=>!emitted.has(u.id)))throw new TypeError('Scene inventory output is invalid');
 const objectBatches=sceneObjectBatches(plan);
 const admissionHistory=sceneAdmissionHistory(plan);
 if(shared&&!objectBatches)throw new TypeError('Scene shared route object ledger is invalid');
 return reviseSceneInventoryEvidence(plan,{version:shared?5:objectBatches?4:plan.relationBatches?3:2,sourceHash:plan.sourceHash,basis:'model-observation',scope:'direct-region-units',units,
  ...(shared?{relationObservationUnit:/** @type {const} */('logical-relations-v1'),sharedRouteGraphs:graphs,...(endpoints.length?{endpointBindings:endpoints}:{})}:{}),
  ...(admissionHistory?{admissionHistory}:{}),
  ...(objectBatches?{objectBatches}:{}),
  ...(plan.relationBatches?{relationBatches:sceneInventoryRelationBatches(plan)}:{}),
  regions:plan.observedInventory.map(({regionId,...observed})=>({regionId,
   observed:{...observed,relations:sceneProgramRelationObservation(plan,regionId)??null},proposed:totals(proposed,regionId),
   recovered:totals(recovered,regionId),materialized:totals(units,regionId,emitted)}))});
}
/** @param {unknown} v @param {boolean} unknownAllowed @returns {v is ObservedCounts} */
function counts(v,unknownAllowed){return record(v)&&Object.keys(v).length===3&&['containers','icons','relations'].every(k=>count(v[k])&&(unknownAllowed||v[k]!==null));}
/** @param {unknown} value @param {unknown} sourceHash @returns {value is InventoryEvidence} */
function evidenceValid(value,sourceHash){
 if(!record(value)||(value.version!==1&&value.version!==2&&value.version!==3&&value.version!==4&&value.version!==5&&value.version!==6)||value.sourceHash!==sourceHash||typeof sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(sourceHash)
  ||value.basis!=='model-observation'||value.scope!=='direct-region-units'||!array(value.units,value.version>=4?176:value.version===3?144:value.version===2?120:88)||!array(value.regions,24))return false;
 if(value.version>=5?value.relationObservationUnit!=='logical-relations-v1'||!array(value.sharedRouteGraphs,24):value.sharedRouteGraphs!==undefined||value.relationObservationUnit!==undefined||value.endpointBindings!==undefined)return false;
 if(value.version===6?value.inventoryRevision===undefined:value.inventoryRevision!==undefined)return false;
 const complete=value.version!==1,regions=new Set(),units=new Set(),members=new Set();let objects=0,relations=0,interiors=0,icons=0;
 /** @type {string[]} */const relationIds=[];
 for(const row of value.regions){
  if(!record(row)||!id(row.regionId)||regions.has(row.regionId)||!counts(row.observed,true)||!counts(row.proposed,false)||!counts(row.materialized,false)
   ||complete&&!counts(row.recovered,false))return false;
  regions.add(row.regionId);
 }
 for(const row of value.units){
  if(!record(row)||!id(row.id)||units.has(row.id)||!id(row.regionId)||!regions.has(row.regionId)
   ||typeof row.kind!=='string'||!['container','icon','unknown','relation'].includes(row.kind))return false;
  if(value.version>=5&&row.kind==='relation'&&(!id(row.fromId)||!id(row.toId)||row.fromId===row.toId
   ||typeof row.direction!=='string'||!['forward','backward','both','undirected'].includes(row.direction)))return false;
  if(complete){
   if(!['proposal','table-header','interior'].includes(String(row.origin))||!sceneInventoryMembersValid(row.members,10000)
    ||members.size+row.members.length>10000||row.members.some(m=>members.has(m.type+':'+m.id)))return false;
   row.members.forEach(m=>members.add(m.type+':'+m.id));
   if(row.origin!=='proposal'&&(typeof row.key!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(row.key)
    ||row.id!==recoveryId(/** @type {'table-header'|'interior'} */(row.origin),row.key)))return false;
   if(row.origin==='interior'){
    const parent=value.units.find(p=>record(p)&&p.id===row.parentObjectId);
    if(row.kind!=='icon'||row.members.length<1||row.members.length>32||row.members.some(m=>m.type!=='shape')||!record(parent)||parent.kind!=='container'
     ||parent.origin!=='proposal'||parent.regionId!==row.regionId)return false;interiors++;
   }else if(row.origin==='table-header'){
    if(row.kind!=='container'||row.members.length<1||row.members.length>32||row.members.some(m=>m.type!=='shape')||row.parentObjectId!==undefined)return false;objects++;
   }else{if(row.parentObjectId!==undefined||row.key!==undefined)return false;if(row.kind==='relation')relations++;else objects++;if(row.kind==='icon')icons++;}
  }else if(row.kind==='relation')relations++;else objects++;
  units.add(row.id);
  if(row.kind==='relation')relationIds.push(row.id);
 }
 const proposalObjects=value.units.filter(u=>record(u)&&u.origin==='proposal'&&u.kind!=='relation').map(u=>/** @type {{id:string,regionId:string}} */(u));
 if(value.version>=5){
  /** @type {import('./source-scene-shared-route-inventory').SharedGraph[]} */let graphs;
  try{const endpoints=readSceneRouteEndpoints(value.endpointBindings??[],/** @type {Unit[]} */(value.units),[...regions]);
   graphs=readSharedSceneRouteGraphs(value.sharedRouteGraphs,/** @type {Unit[]} */(value.units),sourceHash,endpoints);
   for(const endpoint of endpoints)if(endpoint.ownerUnitId===undefined)for(const member of endpoint.members){if(members.size>=10000||members.has(member.type+':'+member.id))return false;members.add(member.type+':'+member.id);}
  }
  catch(error){if(!(error instanceof TypeError&&/^Scene (?:shared route |route endpoint )/u.test(error.message)))throw error;return false;}
  for(const graph of graphs)for(const member of sharedSceneRouteMembers(graph)){
   if(members.size>=10000||members.has('shape:'+member)||members.has('image:'+member))return false;members.add('shape:'+member);
  }
  const referenced=new Set(graphs.flatMap(g=>g.paths.map(p=>p.relationId)));
  if(value.units.some(u=>record(u)&&typeof u.id==='string'&&referenced.has(u.id)&&(!array(u.members,0)||u.members.length)))return false;
 }
 const ledgerValid=value.version>=4&&sceneInventoryObjectBatchesValid(value.objectBatches,proposalObjects,sourceHash);
 const ledger=ledgerValid?/** @type {import('./source-scene-object-batches').ObjectBatches} */(value.objectBatches):undefined;
 const global=ledger?.batches.find(b=>b.id==='global');
 const headers=value.units.filter(u=>record(u)&&u.origin==='table-header').length;
 const relationsValid=value.version===3||value.version>=4&&value.relationBatches!==undefined
  ?sceneInventoryRelationBatchesValid(value.relationBatches,relationIds):relations<=24;
 return objects<=(ledgerValid?96:64)&&relations<=(value.version>=3?48:24)&&interiors<=Math.max(0,32-icons)
  &&(value.version<4||ledgerValid&&!!global&&headers<=64-global.members.length-global.rejected)
  &&relationsValid&&sceneInventoryAdmissionHistoryValid(value.admissionHistory,sourceHash,/** @type {Unit[]} */(value.units),value.relationBatches,value.objectBatches,value.regions);
}
/** A model census exposes omissions but does not prove exhaustive recognition.
 * Recompute counts from surviving identities, never trust stale success counts.
 * Legacy absence grants no observed-inventory claim.
 * @param {unknown} evidence @param {unknown} shapes @param {unknown} images @param {unknown} sourceHash @param {unknown} [textBoxes] @returns {Finding[]} */
function auditSceneInventory(evidence,shapes,images,sourceHash,textBoxes=[]){
 evidence=unpackSceneInventoryMembers(evidence);
 let revision;
 try{revision=trustedSceneInventoryRevision(evidence);}catch{return [{reason:'inventory-revision-unverified'}];}
 if(revision===null)return [{reason:'inventory-revision-unverified'}];
 if(evidence===undefined)return [];
 if(!evidenceValid(evidence,sourceHash))return [{reason:'evidence-invalid'}];
 const materialization=inspectSceneUnitMaterialization(evidence.units,shapes,images,evidence.version!==1,evidence.sharedRouteGraphs,evidence.endpointBindings,textBoxes);
 const {emitted}=materialization;
 if(!emitted)return [{reason:'evidence-invalid',...materialization.failure}];
 /** @type {Finding[]} */const findings=[];
 if(evidence.version>=4)for(const batch of evidence.objectBatches?.batches??[])if(batch.id==='global'&&batch.rejected)
  findings.push({reason:'object-rejected-missing',count:batch.rejected});
 if(evidence.version>=3)for(const batch of evidence.relationBatches??[])if(batch.reserved.length)findings.push({reason:'relation-reserved-missing',kind:'relations',count:batch.reserved.length});
 if(evidence.version>=3)for(const batch of evidence.relationBatches??[])if(batch.id==='global'&&batch.rejected&&!revision)
  findings.push({reason:'relation-rejected-missing',kind:'relations',count:batch.rejected});
 for(const row of evidence.regions){
  const proposed=totals(evidence.units.filter(u=>evidence.version===1||u.origin==='proposal'),row.regionId),
   recovered=totals(evidence.units.filter(u=>u.origin==='interior'||u.origin==='table-header'),row.regionId),
   materialized=totals(evidence.units,row.regionId,emitted);
  for(const kind of /** @type {Category[]} */(['containers','icons','relations'])){
   if(row.proposed[kind]!==proposed[kind]||evidence.version!==1&&row.recovered?.[kind]!==recovered[kind])return [{reason:'evidence-invalid'}];
   const expected=proposed[kind]+recovered[kind];
   const observed=row.observed[kind];
   if(observed===null)findings.push({regionId:row.regionId,kind,reason:'observation-unknown'});
   else if(observed!==expected)findings.push({regionId:row.regionId,kind,reason:observed>expected?'proposal-missing':'proposal-excess',count:Math.abs(observed-expected)});
   if(materialized[kind]<expected)findings.push({regionId:row.regionId,kind,reason:'compile-missing',count:expected-materialized[kind]});
  }
 }
 return findings;
}
/** Reuse source-bound preflight recoveries when scheduling the original local
 * calls. Never ask for a duplicate object because its measured identity came
 * from another compiler branch. Changed controls invalidate this evidence.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {unknown} evidence @returns {Map<string,Counts>} */
function sceneRecoveredInventoryCounts(plan,evidence){
 const result=new Map();if(evidence===undefined)return result;
 evidence=unpackSceneInventoryMembers(evidence);
 if(!evidenceValid(evidence,plan.sourceHash))throw new TypeError('Scene preflight inventory is invalid');
 if(evidence.regions.length!==plan.regions.length||evidence.regions.some(r=>!plan.regions.some(p=>p.id===r.regionId)))
  throw new TypeError('Scene preflight inventory regions changed');
 const proposed=[...plan.objects,...plan.relations.map(r=>({...r,kind:'relation'}))],bound=evidence.units.filter(u=>u.origin==='proposal');
 if(evidence.version===1)return result;
 if(bound.length!==proposed.length||proposed.some(o=>!bound.some(u=>u.id===o.id&&u.kind===o.kind&&u.regionId===o.regionId)))
  throw new TypeError('Scene preflight inventory controls changed');
 const units=evidence.units.filter(u=>u.origin==='interior'||u.origin==='table-header');
 for(const region of plan.regions){
  const recovered=totals(units,region.id),row=evidence.regions.find(r=>r.regionId===region.id);
  if(!row||['containers','icons','relations'].some(k=>row.recovered?.[/** @type {Category} */(k)]!==recovered[/** @type {Category} */(k)]))
   throw new TypeError('Scene preflight recovery counts are invalid');
  result.set(region.id,recovered);
 }
 return result;
}
module.exports={parseObservedInventory,buildSceneInventoryEvidence,auditSceneInventory,sceneRecoveredInventoryCounts,sceneProgramRelationObservation};
