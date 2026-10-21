// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {types}=require('node:util');
const {pendingSceneProgramObligations}=require('./source-scene-program-obligations');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @param {unknown} value @returns {value is string} */
const id=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** @param {unknown} value @returns {value is number|null} */
const count=value=>value===null||typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=10000;
/** Reject proxies and instance overrides before invoking any native collection
 * operation. A report must never execute an input's iterator, size or traps.
 * @param {unknown} value @param {number} maximum @returns {value is Set<string>} */
function identities(value,maximum){
 return typeof value==='object'&&value!==null&&!types.isProxy(value)&&types.isSet(value)
  &&Object.getPrototypeOf(value)===Set.prototype&&Reflect.ownKeys(value).length===0
  &&value.size<=maximum&&[...value].every(id);
}
/** Account for the entire declared scene, including owners without admitted
 * programs. This report grants no drawing, erasure or completion authority.
 * The caller supplies only IDs whose actual output members survived THIS
 * compilation. An independent census remains distinct from admitted slots.
 * @param {Plan} plan @param {{objects:Set<string>,relations:Set<string>,completed:Set<string>}} actual */
function sceneObligationCoverage(plan,actual){
 if(!record(plan)||!record(actual)||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||!list(plan.regions)||plan.regions.length>24||!list(plan.objects)||plan.objects.length>96
  ||!list(plan.relations)||plan.relations.length>48
  ||plan.textEndpoints!==undefined&&(!list(plan.textEndpoints)||plan.textEndpoints.length>512
   ||plan.textEndpoints.some(t=>!record(t)||!id(t.id)))
  ||plan.regions.some(r=>!record(r)||!id(r.id))
  ||[...plan.objects,...plan.relations].some(u=>!record(u)||!id(u.id)||!id(u.regionId))
  ||!identities(actual.objects,632)||!identities(actual.relations,48)||!identities(actual.completed,24))
  throw new TypeError('Scene obligation coverage is invalid');
 const regions=new Set(plan.regions.map(r=>r.id)),units=new Set([...plan.objects,...plan.relations].map(u=>u.id));
 if(regions.size!==plan.regions.length||units.size!==plan.objects.length+plan.relations.length
  ||[...plan.objects,...plan.relations].some(u=>!regions.has(u.regionId))
  ||[...actual.objects].some(key=>!plan.objects.some(o=>o.id===key)&&!regions.has(key)&&!plan.textEndpoints?.some(t=>t.id===key))
  ||[...actual.relations].some(key=>!plan.relations.some(r=>r.id===key))||[...actual.completed].some(key=>!regions.has(key)))
  throw new TypeError('Scene obligation coverage binding is invalid');
 if(plan.regionPrograms===undefined&&plan.pendingRegionPrograms===undefined)return null;
 const declared=plan.regionPrograms??[],pending=pendingSceneProgramObligations(plan);
 if(!list(declared)||declared.length>24
  ||declared.some(p=>!record(p)||!id(p.regionId)||!regions.has(p.regionId)))throw new TypeError('Scene obligation programs are invalid');
 const programs=new Set(declared.map(p=>p.regionId));
 if(programs.size!==declared.length||[...actual.completed].some(key=>!programs.has(key)))throw new TypeError('Scene obligation programs are ambiguous');
 const observations=plan.observedInventory;
 if(observations!==undefined&&(!list(observations)||observations.length!==regions.size
  ||observations.some(o=>!record(o)||!id(o.regionId)||!regions.has(o.regionId)||!count(o.containers)||!count(o.icons)||!count(o.relations))
  ||new Set(observations.map(o=>o.regionId)).size!==regions.size))throw new TypeError('Scene obligation observations are invalid');
 const rows=plan.regions.map(r=>{
  const expected=observations?.find(o=>o.regionId===r.id)?.relations??null;
  const relations=plan.relations.filter(u=>u.regionId===r.id),objects=plan.objects.filter(u=>u.regionId===r.id);
  return {regionId:r.id,program:programs.has(r.id)?'admitted':'missing',complete:actual.completed.has(r.id),
   relations:{observed:expected,admitted:relations.length,materialized:relations.filter(u=>actual.relations.has(u.id)).length},
   objects:{admitted:objects.length,materialized:objects.filter(u=>actual.objects.has(u.id)).length}};
 });
 const observed=rows.every(r=>r.relations.observed!==null)?rows.reduce((sum,r)=>sum+(r.relations.observed??0),0):null;
 return {version:1,sourceHash:plan.sourceHash,basis:'declared-scene-obligations',
  regions:{declared:regions.size,programmed:programs.size,pending:pending.length,completed:actual.completed.size,missingPrograms:rows.filter(r=>r.program==='missing').map(r=>r.regionId)},
  relations:{observed,admitted:plan.relations.length,materialized:actual.relations.size,
   unprogrammed:plan.relations.filter(r=>!programs.has(r.regionId)).length},rows};
}
module.exports={sceneObligationCoverage};
