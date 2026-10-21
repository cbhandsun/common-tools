// @ts-check
"use strict";
const {types}=require('node:util');
const crypto=require('node:crypto');
const {sceneHeaderObjectCapacity}=require('./source-scene-object-batches');
const {sharedSceneRouteMembers,survivingSharedSceneRoutes}=require('./source-scene-shared-route-inventory');
/** @typedef {{type:'shape'|'image',id:string}} Member */
/** @typedef {{id:string,regionId:string,kind:'container'|'icon',origin:'table-header'|'interior',key:string,parentObjectId?:string,members:Member[]}} Recovery */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @param {number} max @returns {v is unknown[]} */
function array(v,max){return Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=max
 &&Reflect.ownKeys(v).length===v.length+1&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @returns {v is string} */
function identity(v){return typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(v);}
/** @param {unknown} v @returns {v is string} */
function outputId(v){return typeof v==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,255}$/u.test(v);}
/** Reserved compiler namespace; provider object IDs use object-/relation-.
 * This identifies an already measured unit, never authorizes discovery.
 * @param {Recovery['origin']} origin @param {string} key */
function recoveryId(origin,key){return 'recovered-'+crypto.createHash('sha256').update(origin+'\0'+key).digest('hex').slice(0,32);}
/** @param {unknown} v @param {number} max @returns {v is Member[]} */
function members(v,max){
 if(!array(v,max))return false;const seen=new Set();
 for(const m of v){
  if(!record(m)||Object.keys(m).length!==2||(m.type!=='shape'&&m.type!=='image')||!outputId(m.id)||seen.has(m.type+':'+m.id))return false;
  seen.add(m.type+':'+m.id);
 }
 return true;
}
/** Recoveries consume only the pre-existing optional header slots and internal
 * pictorial targets/parts. A larger evidence list is not another object budget.
 * Parent bindings prevent an unrelated group from satisfying an observation.
 * @param {unknown} value @param {import('./source-scene-plan').ScenePlan} plan @returns {Recovery[]} */
function admitSceneRecoveries(value,plan){
 if(!array(value,96))throw new TypeError('Scene recovered inventory is invalid');
 const result=/** @type {Recovery[]} */([]),seen=new Set(),owned=new Set();let headers=0,interiors=0;
 for(const row of value){
  if(!record(row)||!identity(row.id)||!identity(row.regionId)||!plan.regions.some(r=>r.id===row.regionId)
   ||!outputId(row.key)||!['table-header','interior'].includes(String(row.origin))||seen.has(row.id)
   ||!members(row.members,32)||row.members.length===0
   ||row.members.some(m=>m.type!=='shape'||owned.has(m.type+':'+m.id)))throw new TypeError('Scene recovered inventory binding is invalid');
  const origin=/** @type {Recovery['origin']} */(row.origin);
  if(row.id!==recoveryId(origin,row.key))throw new TypeError('Scene recovered inventory identity is invalid');
  if(origin==='table-header'){
   if(row.kind!=='container'||row.parentObjectId!==undefined)throw new TypeError('Scene recovered header is invalid');headers++;
  }else{
   const parent=plan.objects.find(o=>o.id===row.parentObjectId);
   if(row.kind!=='icon'||!parent||parent.kind!=='container'||parent.regionId!==row.regionId)
    throw new TypeError('Scene recovered interior is invalid');interiors++;
  }
  seen.add(row.id);row.members.forEach(m=>owned.add(m.type+':'+m.id));result.push(/** @type {Recovery} */(row));
 }
 if(headers>sceneHeaderObjectCapacity(plan)||interiors>Math.max(0,32-plan.objects.filter(o=>o.kind==='icon').length))
  throw new RangeError('Scene recovered inventory exceeds existing capacity');
 return result;
}
/** Capture only actual emitted identity-bearing members. Duplicate output IDs
 * cannot establish distinct materialization. No count substitutes for a part.
 * @param {unknown} shapes @param {unknown} images @param {boolean} [strictIds]
 * @returns {Map<string,Member[]>|null} */
function captureSceneMembers(shapes,images,strictIds=true){
 if(!array(shapes,10000)||!array(images,10000)||shapes.length+images.length>10000)return null;
 const result=new Map(),seen=new Set();
 for(const [type,rows]of /** @type {['shape'|'image',unknown[]][]} */([['shape',shapes],['image',images]]))for(const row of rows){
  if(!record(row)||row.source!==undefined&&!record(row.source))return null;
  if(!record(row.source)||row.source.sceneInventoryId===undefined)continue;
  if(!identity(row.source.sceneInventoryId)||strictIds&&(!outputId(row.id)||seen.has(type+':'+row.id)))return null;
  seen.add(type+':'+row.id);
  const values=result.get(row.source.sceneInventoryId)??[];
  values.push({type,id:typeof row.id==='string'?row.id:''});result.set(row.source.sceneInventoryId,values);
 }
 return result;
}
/** Bind measured output IDs after physical grouping has copied the shapes.
 * Never discover a recovery from a serialized detector name or shape count.
 * @param {Recovery[]} recoveries @param {{id?:string,source?:Record<string,unknown>}[]} shapes */
function bindSceneRecoveries(recoveries,shapes){
 for(const unit of recoveries)for(const member of unit.members){
  const matches=shapes.filter(s=>s.id===member.id);
  if(matches.length!==1||matches[0]?.source?.sceneInventoryId!==undefined)throw new TypeError('Scene recovered output binding is invalid');
  const shape=matches[0];if(shape)shape.source={...shape.source,sceneInventoryId:unit.id};
 }
}
/** All recorded parts must still belong to this exact unit. Legacy evidence
 * remains count-only; it receives no claim of complete-member verification.
 * @param {{id:string,members?:Member[]}[]} units @param {unknown} shapes @param {unknown} images @param {boolean} complete
 * @param {import('./source-scene-shared-route-inventory').SharedGraph[]} [graphs]
 * @param {import('./source-scene-route-endpoints').RouteEndpoint[]} [endpoints] @param {unknown} [textBoxes]
 * @returns {Set<string>|null} */
function survivingSceneUnits(units,shapes,images,complete,graphs=[],endpoints=[],textBoxes=[]){
 const actual=captureSceneMembers(shapes,images,complete);if(!actual||[...actual.keys()].some(id=>!units.some(u=>u.id===id)&&!graphs.some(g=>g.id===id)))return null;
 const paths=survivingSharedSceneRoutes(graphs,shapes,images,units,endpoints,textBoxes);if(!paths)return null;
 const referenced=new Set(graphs.flatMap(g=>g.paths.map(p=>p.relationId)));
 for(const graph of graphs){const expected=sharedSceneRouteMembers(graph),found=actual.get(graph.id)??[];
  if(found.some(m=>m.type!=='shape'||!expected.includes(m.id)))return null;
 }
 const result=new Set();
 for(const unit of units){const found=actual.get(unit.id)??[];
  if(!complete){if(found.length)result.add(unit.id);continue;}
  const expected=unit.members;if(!members(expected,10000))return null;
  if(referenced.has(unit.id)){
   if(expected.length||found.length)return null;
   if(paths.has(unit.id))result.add(unit.id);continue;
  }
  if(found.some(m=>!expected.some(e=>e.type===m.type&&e.id===m.id)))return null;
  if(expected.length&&expected.every(m=>found.some(e=>e.type===m.type&&e.id===m.id)))result.add(unit.id);
 }
 return result;
}
module.exports={recoveryId,admitSceneRecoveries,captureSceneMembers,bindSceneRecoveries,survivingSceneUnits,sceneInventoryMembersValid:members};
