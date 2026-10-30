// @ts-check
"use strict";
const {record,list}=require('./source-scene-group-containment');
const {sceneObjectLimit}=require('./source-scene-object-batches');
/** An observation is a requirement, not another slot allowance. Local scene
 * reviews can change proposals but cannot revise the independent census. A
 * known lower bound above the two bounded proposal stages cannot be met
 * by geometry, alias compaction or pictorial/header recoveries. The original
 * two local views agree on ONE second batch, not two separate allowances.
 * Table-header recoveries share the 64 object slots. Interior recoveries share
 * 32 targets with explicitly proposed icons: at most max(32, proposed icons)
 * can be represented. Above 32, all icons therefore need explicit object
 * slots. Check only these necessary bounds, never assume discovery succeeds.
 * This grants no source ownership and makes no claim that model counts are true.
 * @param {unknown} value */
function sceneInventoryCapacity(value){
 if(!record(value)||!list(value.regions)||value.regions.length>24)
  throw new TypeError('Scene capacity regions are invalid');
 const regions=new Set();
 for(const region of value.regions){
  if(!record(region)||typeof region.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(region.id)||regions.has(region.id))
   throw new TypeError('Scene capacity regions are invalid');
  regions.add(region.id);
 }
 const relationLimit=24,maxRelationBatches=2,wholePageRelationCapacity=relationLimit*maxRelationBatches,observations=value.observedInventory;
 const objectLimit=value.objectBatches===undefined?64:sceneObjectLimit(/** @type {import('./source-scene-plan').ScenePlan} */(value)),interiorTargetLimit=32;
 const limits={relationLimit,maxRelationBatches,wholePageRelationCapacity,objectLimit,interiorTargetLimit};
 if(observations===undefined)return {assessed:false,feasible:true,...limits,knownRelationMinimum:0,unknownRelationRegions:regions.size,
  knownContainerMinimum:0,knownIconMinimum:0,knownProposalObjectMinimum:0,unknownContainerRegions:regions.size,unknownIconRegions:regions.size};
 if(!list(observations)||observations.length!==regions.size)
  throw new TypeError('Scene capacity observation is invalid');
 const seen=new Set();let knownRelationMinimum=0,unknownRelationRegions=0,
  knownContainerMinimum=0,knownIconMinimum=0,unknownContainerRegions=0,unknownIconRegions=0;
 for(const row of observations){
  if(!record(row)||Reflect.ownKeys(row).length!==4||typeof row.regionId!=='string'||!regions.has(row.regionId)||seen.has(row.regionId)
   ||['containers','icons','relations'].some(k=>row[k]!==null&&(typeof row[k]!=='number'||!Number.isSafeInteger(row[k])||Number(row[k])<0||Number(row[k])>10000)))
   throw new TypeError('Scene capacity observation is invalid');
  seen.add(row.regionId);
  if(row.relations===null)unknownRelationRegions++;else knownRelationMinimum+=Number(row.relations);
  if(row.containers===null)unknownContainerRegions++;else knownContainerMinimum+=Number(row.containers);
  if(row.icons===null)unknownIconRegions++;else knownIconMinimum+=Number(row.icons);
 }
 const knownProposalObjectMinimum=knownContainerMinimum+(knownIconMinimum>interiorTargetLimit?knownIconMinimum:0);
 return {assessed:true,feasible:knownRelationMinimum<=wholePageRelationCapacity&&knownProposalObjectMinimum<=objectLimit,
  ...limits,knownRelationMinimum,unknownRelationRegions,knownContainerMinimum,knownIconMinimum,knownProposalObjectMinimum,
  unknownContainerRegions,unknownIconRegions};
}
const capacityErrors=new WeakSet();
/** A private identity lets the worker distinguish a capacity conflict from
 * provider errors without trusting arbitrary exception codes or messages. */
function sceneInventoryCapacityError(){
 const error=new RangeError('Scene observed inventory exceeds bounded proposal capacity');
 Object.defineProperty(error,'code',{value:'SCENE_INVENTORY_CAPACITY_CONFLICT',enumerable:true});
 capacityErrors.add(error);return error;
}
/** @param {unknown} error */
function isSceneInventoryCapacityError(error){return typeof error==='object'&&error!==null&&capacityErrors.has(error);}
module.exports={sceneInventoryCapacity,sceneInventoryCapacityError,isSceneInventoryCapacityError};
