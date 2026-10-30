// @ts-check
"use strict";
const {types}=require("node:util");
const {containsSceneBox}=require("./source-scene-plan");
const {readStructuralObservations}=require("./source-scene-structural-review");
const {rebindRegionProgramMembers}=require('./source-scene-region-program');
const {sceneObjectLimit,sceneLocalObjectCapacity,recordSceneLocalObjectBatch}=require('./source-scene-object-batches');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{index:number,objectId:string,regionId:string,box:Box}} Target */
/** @typedef {ReturnType<typeof readStructuralObservations>[number]} Observation */
/** Prioritize observed illustrations and missing children of connector endpoints, sharing existing object
 * and local-target capacity. Round robin across regions prevents the first
 * section from consuming all discovery slots. No new source authority.
 * @param {Plan|undefined} plan @param {number} capacity @param {string[]} [excluded] */
function selectInventoryReviewTargets(plan,capacity,excluded=[]){
 if(!Number.isSafeInteger(capacity)||capacity<0||capacity>32)throw new RangeError('Scene inventory capacity is invalid');
 if(!plan||!capacity)return [];
 const endpoints=new Set(plan.relations.flatMap(r=>[r.fromId,r.toId])),regions=new Map(plan.regions.map(r=>[r.id,r]));
 const maximum=Math.min(capacity,sceneLocalObjectCapacity(plan)),selected=[];
 // Semantic presence only ranks proposals. It never authorizes a child, and
 // even an "absent" hypothesis remains discoverable after the other tiers.
 // Older plans keep their original round-robin order in the unknown tier.
 for(const content of ['present','unknown','absent']){
  /** @type {Map<string,import('./source-scene-plan').SceneObject[]>} */const groups=new Map();
  for(const object of plan.objects){
   const region=regions.get(object.regionId);
   if((object.pictorialContent??'unknown')!==content||object.kind!=='container'||(!endpoints.has(object.id)&&content!=='present')||excluded.includes(object.id)
    ||!region||!containsSceneBox(region.box,object.box)||plan.objects.some(child=>child.kind==='icon'&&containsSceneBox(object.box,child.box)))continue;
   const rows=groups.get(region.id)||[];rows.push(object);groups.set(region.id,rows);
  }
  for(let round=0;selected.length<maximum;round++){
   let found=false;
   for(const rows of groups.values()){
    const object=rows[round];if(!object||selected.length>=maximum)continue;
    selected.push({objectId:object.id,regionId:object.regionId,box:{...object.box}});found=true;
   }
   if(!found)break;
  }
 }
 return selected;
}
/** Reuse exact sheet/source mapping and hostile-input guards. The response
 * can propose a child, never rename its parent or supply source pixels.
 * @param {unknown} response @param {Target[]} targets
 * @param {import('./source-scene-missing-text').CropFrame|undefined} frame */
function readInventoryObservations(response,targets,frame){
 if(response===null||typeof response!=='object'||types.isProxy(response)||Array.isArray(response)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(response))
  ||Object.values(Object.getOwnPropertyDescriptors(response)).some(p=>!('value' in p)))throw new TypeError('Scene inventory response is invalid');
 const rows=/** @type {Record<string,unknown>} */(response).inventories;
 return readStructuralObservations({structures:rows===undefined?[]:rows},targets,frame);
}
/** @param {Box} a @param {Box} b */
function intersection(a,b){return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y));}
/** Add only complete independently observed children. OCR, regions, existing
 * objects and topology stay intact; every child still undergoes the source
 * compiler's isolation and final render gates. No crop implies editability.
 * @param {Plan} plan @param {Target[]} targets @param {Observation[][]} observations */
function applyInventoryReview(plan,targets,observations){
 const [local,context]=observations;
 if(targets.length>32||new Set(targets.map(t=>t.index)).size!==targets.length||new Set(targets.map(t=>t.objectId)).size!==targets.length
  ||observations.length!==2||!local||!context||observations.some(rows=>rows.length!==targets.length))throw new TypeError('Scene inventory consensus is invalid');
 const objects=[...plan.objects],regions=new Map(plan.regions.map(r=>[r.id,r]));
 /** @type {string[]} */const added=[];
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 for(const target of targets){
  const parent=plan.objects.find(o=>o.id===target.objectId),region=regions.get(target.regionId);
  const a=local.find(r=>r.index===target.index),b=context.find(r=>r.index===target.index);
  const decline=(/** @type {string} */reason)=>rejected.push({id:target.objectId,reason});
  if(!parent||parent.kind!=='container'||parent.regionId!==target.regionId||!region
   ||!containsSceneBox(region.box,parent.box)||['x','y','w','h'].some(k=>parent.box[/** @type {keyof Box} */(k)]!==target.box[/** @type {keyof Box} */(k)])){decline('parent-binding');continue;}
  if(!a||!b){decline('missing-observation');continue;}
  if(a.rejection||b.rejection){decline(a.rejection==='geometry-contract'||b.rejection==='geometry-contract'?'geometry-contract':'source-window');continue;}
  if(a.kind!=='icon'||b.kind!=='icon'){decline('non-icon');continue;}
  if(a.confidence<.9||b.confidence<.9){decline('confidence');continue;}
  if(a.regionId!==region.id||b.regionId!==region.id){decline('owner-consensus');continue;}
  if(!a.box||!b.box){decline('geometry-presence');continue;}
  if(!containsSceneBox(parent.box,a.box)||!containsSceneBox(parent.box,b.box)){decline('outside-parent');continue;}
  const overlap=intersection(a.box,b.box);
  if(overlap/(a.box.w*a.box.h+b.box.w*b.box.h-overlap)<.85){decline('geometry-consensus');continue;}
  const observed=a.box;
  if(objects.some(o=>o.kind==='icon'&&intersection(o.box,observed)/Math.max(o.box.w*o.box.h,observed.w*observed.h)>=.85)){decline('existing-unit');continue;}
  const id=`object-local-icon-${target.index}`;
  if(objects.length>=sceneObjectLimit(plan)){decline('object-capacity');continue;}
  if(objects.some(o=>o.id===id)){decline('identity-conflict');continue;}
  objects.push({id,kind:'icon',regionId:region.id,parentObjectId:parent.id,nativePictorial:true,box:{...observed}});added.push(id);
 }
 const result=recordSceneLocalObjectBatch(plan,{...plan,objects},added,[],targets.length-added.length);
 return {plan:rebindRegionProgramMembers(plan,result),evidence:{proposed:targets.length,added,rejected}};
}
module.exports={selectInventoryReviewTargets,readInventoryObservations,applyInventoryReview};
