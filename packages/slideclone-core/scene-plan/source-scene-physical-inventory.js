// @ts-check
"use strict";
const {types}=require('node:util');
const {rebindRegionProgramMembers}=require('./source-scene-region-program');
const {sceneObjectLimit,recordSceneObjectAliases}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Only the compiler's private sameSurface measurements supply aliases here.
 * Provider rectangles and confidence never establish physical equivalence.
 * Rebind controls to the retained source-measured object, preserving every
 * admission failure, relation and OCR control. Final compilation still measures
 * the retained/new units under the same session and original source gates.
 * @param {Plan} plan @param {unknown} input */
function compactPhysicalSceneInventory(plan,input){
 const limit=sceneObjectLimit(plan);
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length>limit
  ||Reflect.ownKeys(input).length!==input.length+1||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p)))
  throw new TypeError('Scene physical aliases are invalid');
 const objects=new Map(plan.objects.map(o=>[o.id,o]));
 if(objects.size!==plan.objects.length||plan.objects.length>limit)throw new TypeError('Scene physical inventory is invalid');
 /** @type {Map<string,string>} */const aliases=new Map();
 for(const row of input){
  if(!record(row)||Object.keys(row).length!==2||typeof row.id!=='string'||typeof row.canonicalId!=='string'
   ||!objects.has(row.id)||!objects.has(row.canonicalId)||row.id===row.canonicalId||aliases.has(row.id))
   throw new TypeError('Scene physical alias binding is invalid');
  const a=objects.get(row.id),b=objects.get(row.canonicalId);
  // Region boundaries are not object slots. A child or a cross-region unit
  // cannot be coalesced with its enclosing panel or another semantic owner.
  if(a?.kind!=='container'||b?.kind!=='container'||a.regionId!==b.regionId
   ||a.parentObjectId!==b.parentObjectId)throw new TypeError('Scene physical alias owner is invalid');
  aliases.set(row.id,row.canonicalId);
 }
 /** @param {string} id */
 const canonical=id=>{const seen=new Set();let current=id;
  while(aliases.has(current)){if(seen.has(current))throw new TypeError('Scene physical aliases are cyclic');seen.add(current);
   const next=aliases.get(current);if(next===undefined)throw new TypeError('Scene physical alias binding is invalid');current=next;}
  return current;};
 for(const id of aliases.keys())canonical(id);
 const retained=plan.objects.filter(o=>!aliases.has(o.id)).map(o=>({...o,box:{...o.box},
  ...(o.parentObjectId?{parentObjectId:canonical(o.parentObjectId)}:{})}));
 const relations=plan.relations.map(r=>({...r,fromId:canonical(r.fromId),toId:canonical(r.toId)}));
 const admission=plan.admission?.relationCandidates?{...plan.admission,relationCandidates:plan.admission.relationCandidates.map(c=>({...c,
  relation:{...c.relation,fromId:canonical(c.relation.fromId),toId:canonical(c.relation.toId)}}))}:plan.admission;
 // Do not silently remove invalid self-relations or failed source hypotheses.
 // Such evidence must remain visible to the unchanged final completion gate.
 const result=recordSceneObjectAliases(plan,{...plan,regions:plan.regions.map(r=>({...r,box:{...r.box}})),objects:retained,relations,...(admission?{admission}:{})},
  [...aliases].map(([id])=>({id,canonicalId:canonical(id)})));
 return {plan:rebindRegionProgramMembers(plan,result),
  evidence:{aliases:[...aliases].map(([id])=>({id,canonicalId:canonical(id)})),releasedObjectSlots:aliases.size}};
}
module.exports={compactPhysicalSceneInventory};
