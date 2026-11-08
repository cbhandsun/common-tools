// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {containsSceneBox,sceneEndpointWithinScope}=require('./source-scene-endpoint-scope');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @param {unknown} value @returns {value is string} */
const identity=value=>typeof value==='string'&&/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
/** A census with no legal endpoint pair may refer to sibling nodes under a
 * misplaced semantic owner. Nominate the nearest EXISTING legal ancestor for
 * a cropped, two-view discovery. This never changes ancestry or the census,
 * invents a relation, or grants completion/source-pixel authority.
 * @param {Plan} plan @param {string} regionId */
function captureSceneCensusScopeReview(plan,regionId){
 if(!record(plan)||!identity(regionId)||typeof plan.sourceHash!=='string'||!/^[a-f0-9]{64}$/u.test(plan.sourceHash)
  ||![plan.widthPx,plan.heightPx].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||plan.widthPx*plan.heightPx>40000000
  ||!list(plan.regions)||plan.regions.length>24||!list(plan.objects)||plan.objects.length>176
  ||!list(plan.relations)||plan.relations.length>48||plan.relations.some(r=>!record(r)||!identity(r.fromId)||!identity(r.toId))
  ||plan.textEndpoints!==undefined&&(!list(plan.textEndpoints)||plan.textEndpoints.length>512)
  ||plan.observedInventory!==undefined&&(!list(plan.observedInventory)||plan.observedInventory.length>24))
  throw new TypeError('Scene census scope controls are invalid');
 const entities=[...plan.regions,...plan.objects,...(plan.textEndpoints??[])],ids=new Set();
 for(const entity of entities){
  if(!record(entity)||!identity(entity.id)||ids.has(entity.id)||!box(entity.box)
   ||entity.box.x+entity.box.w>plan.widthPx+1e-6||entity.box.y+entity.box.h>plan.heightPx+1e-6)
   throw new TypeError('Scene census scope entity is invalid');
  ids.add(entity.id);
 }
 const regions=new Map(plan.regions.map(r=>[r.id,r]));
 for(const region of plan.regions){
  if(typeof region.kind!=='string'||region.parentId!==null&&!identity(region.parentId))throw new TypeError('Scene census scope hierarchy is invalid');
  let current=region;const seen=new Set();
  while(current){
   if(seen.has(current.id))throw new TypeError('Scene census scope hierarchy is invalid');seen.add(current.id);
   if(current.parentId===null)break;
   const parent=regions.get(current.parentId);
   if(!parent||!containsSceneBox(parent.box,current.box))throw new TypeError('Scene census scope hierarchy is invalid');current=parent;
  }
 }
 for(const entity of [...plan.objects,...(plan.textEndpoints??[])]){
  if(!identity(entity.regionId)||!regions.has(entity.regionId))
   throw new TypeError('Scene census scope owner is invalid');
 }
 // Object ownership is still a proposal here. Structural paired review must
 // be able to repair a disjoint owner without losing the global inventory.
 // Such endpoints cannot pass sceneEndpointWithinScope below, so they grant
 // no scope nomination, relation binding or source-pixel authority.
 for(const entity of plan.textEndpoints??[]){
  if(!containsSceneBox(/** @type {import('./source-scene-plan').Region} */(regions.get(entity.regionId)).box,entity.box))
   throw new TypeError('Scene census scope owner is invalid');
 }
 const observed=new Set();
 for(const row of plan.observedInventory??[]){
  if(!record(row)||!identity(row.regionId)||!regions.has(row.regionId)||observed.has(row.regionId)
   ||[row.containers,row.icons,row.relations].some(n=>n!==null&&(!Number.isSafeInteger(n)||Number(n)<0||Number(n)>10000)))
   throw new TypeError('Scene census scope observation is invalid');
  observed.add(row.regionId);
 }
 const owner=regions.get(regionId),census=plan.observedInventory?.find(r=>r.regionId===regionId);
 if(!owner||owner.parentId===null||!['section','diagram','group'].includes(owner.kind)||census?.relations==null||census.relations===0)return undefined;
 // Geometric inclusion nominates observation references only. Each one must
 // independently satisfy the normal ancestry contract in the chosen ancestor.
 const physical=[...plan.objects.filter(o=>o.kind==='container'||o.kind==='icon'&&o.parentObjectId===undefined),
  ...plan.regions.filter(r=>['card','container'].includes(r.kind))];
 const referencedText=new Set(plan.relations.flatMap(r=>[r.fromId,r.toId]));
 // A node's OCR labels are alternative nomination locations, not independent
 // physical nodes. Keep every explicit text endpoint, and every unenclosed
 // text candidate; no catalog member or existing relation is removed.
 const text=(plan.textEndpoints??[]).filter(t=>referencedText.has(t.id)||!physical.some(p=>containsSceneBox(p.box,t.box)));
 const eligible=new Set([...physical,...text].map(e=>e.id));
 const contained=entities.filter(e=>e.id!==owner.id&&eligible.has(e.id)&&containsSceneBox(owner.box,e.box));
 const physicalIds=new Set(physical.map(e=>e.id)),physicalContained=contained.filter(e=>physicalIds.has(e.id));
 // OCR headings do not resolve a missing physical node pair. Pure text
 // diagrams keep their original text-only discovery scope.
 const local=physicalContained.length>=2?physicalContained:contained;
 if(local.filter(e=>sceneEndpointWithinScope(plan,owner.id,e.id)).length>=2)return undefined;
 let candidate=regions.get(owner.parentId);
 /** @type {Pick<import('./source-scene-plan').Region,'id'|'parentId'|'kind'|'box'>[]} */
 const chain=[{id:owner.id,parentId:owner.parentId,kind:owner.kind,box:{...owner.box}}];
 while(candidate){
  const current=candidate;
  chain.push({id:current.id,parentId:current.parentId,kind:current.kind,box:{...current.box}});
  /** @type {NonNullable<import('./source-scene-regional-inventory').Target['endpoints']>} */
  const endpoints=contained.filter(e=>sceneEndpointWithinScope(plan,current.id,e.id)).map(e=>{
   const object=plan.objects.find(o=>o.id===e.id),text=plan.textEndpoints?.find(t=>t.id===e.id);
   return {id:e.id,box:{...e.box},entityKind:object?'object':text?'text':'region',ownerId:object?object.regionId:text?text.regionId:regions.get(e.id)?.parentId??null};
  });
  if(['section','diagram','group'].includes(current.kind)&&endpoints.length>=2&&endpoints.length===contained.length){
   if(endpoints.length>64)return undefined;
   return {sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,sourceRegionId:owner.id,reviewRegionId:current.id,
    box:{...owner.box},ownerBox:{...current.box},observedRelations:census.relations,
    reviewObservedRelations:plan.observedInventory?.find(r=>r.regionId===current.id)?.relations??null,endpoints,chain};
  }
  candidate=current.parentId===null?undefined:regions.get(current.parentId);
 }
 return undefined;
}
/** @typedef {NonNullable<ReturnType<typeof captureSceneCensusScopeReview>>} CensusScopeReview */
/** Capture controls never come from a model. Recompute against current source,
 * hierarchy, census and endpoint ownership after other local transactions.
 * @param {Plan} plan @param {unknown} control @returns {CensusScopeReview} */
function resolveSceneCensusScopeReview(plan,control){
 // Validate nested plain data without invoking accessors or Proxy traps.
 let visited=0;const seen=new WeakSet();
 /** @param {unknown} value @param {number} depth @returns {void} */
 const visit=(value,depth=0)=>{
  if(++visited>2048)throw new TypeError('Scene census scope review is invalid');
  if(value===null||typeof value==='string'&&value.length<=128||typeof value==='number'&&Number.isFinite(value))return;
  if(depth>8||Array.isArray(value)&&value.length>512||!record(value)&&!list(value))throw new TypeError('Scene census scope review is invalid');
  if(seen.has(value))throw new TypeError('Scene census scope review is invalid');seen.add(value);
  const values=list(value)?value:Object.values(value);
  if(values.length>512)throw new TypeError('Scene census scope review is invalid');
  for(const entry of values)visit(entry,depth+1);
 };
 visit(control);
 if(!record(control)||!identity(control.sourceRegionId))throw new TypeError('Scene census scope review is invalid');
 const current=captureSceneCensusScopeReview(plan,control.sourceRegionId);
 if(!current||JSON.stringify(current)!==JSON.stringify(control))throw new TypeError('Scene census scope review is stale');
 return current;
}
module.exports={captureSceneCensusScopeReview,resolveSceneCensusScopeReview};
