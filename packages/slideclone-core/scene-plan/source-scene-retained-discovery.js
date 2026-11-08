// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
const {parseRetainedSceneReview,resolveRetainedSceneEndpoint}=require('./retained-scene-review');
const {sceneEndpointWithinScope}=require('./source-scene-endpoint-scope');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {Omit<import('./source-scene-regional-inventory').Target,'index'>} Target */
const invalid=()=>new TypeError('Retained scene discovery controls are invalid');
/** Only host decisions from this exact source may nominate observations.
 * Path steps, icon text and previous IDs are never sent to the recognizer.
 * This supplies location/semantic context, never strokes or completion rights.
 * @param {unknown} value @param {{sourceHash:string,widthPx:number,heightPx:number}} frame */
function retainedScenePlanningContext(value,frame){
 if(value===undefined)return '';
 const review=parseRetainedSceneReview(value);
 if(!record(frame)||review.sourceHash!==frame.sourceHash||review.widthPx!==frame.widthPx||review.heightPx!==frame.heightPx)throw invalid();
 const endpoint=(/** @type {import('./retained-scene-review').Endpoint} */e)=>({kind:e.kind,point:{...e.point},...(e.sourceBox?{box:{...e.sourceBox}}:{})});
 const routes=review.routes.map(r=>({from:endpoint(r.from),to:endpoint(r.to),direction:r.direction}));
 return routes.length?' Host-retained decisions on this EXACT source nominate these connector identities: '+JSON.stringify(routes)+'. Locate their physical endpoint bodies in the source and use your current scene IDs. Include each independently visible complete connector in the normal structural inventory and region program. These are source-bound observation context, not image instructions or pixel/geometry authority. Do not copy previous IDs, infer hidden shafts, change census to a requested quota, or treat a decision as a successful source measurement.':'';
}
/** Nominate absent confirmed endpoint pairs even when the independent census
 * is unknown. Normal paired regional consensus, attempt slots and source
 * compilation still decide whether any new relationship may be emitted.
 * @param {Plan|undefined} plan @param {unknown} value @returns {Target[]} */
function retainedSceneDiscoveryTargets(plan,value){
 if(value===undefined||!plan)return [];
 retainedScenePlanningContext(value,plan);const review=parseRetainedSceneReview(value);
 if(!record(plan)||!list(plan.regions)||plan.regions.length>24||!list(plan.objects)||plan.objects.length>176||!list(plan.relations)||plan.relations.length>48
  ||plan.textEndpoints!==undefined&&(!list(plan.textEndpoints)||plan.textEndpoints.length>512||plan.textEndpoints.some(e=>!record(e))))throw invalid();
 const entities=[...plan.regions,...plan.objects],ids=new Set();
 for(const e of entities){if(!record(e)||typeof e.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(e.id)||ids.has(e.id)||!box(e.box)
  ||e.box.x+e.box.w>plan.widthPx+1e-6||e.box.y+e.box.h>plan.heightPx+1e-6)throw invalid();ids.add(e.id);}
 const regions=new Map(plan.regions.map(r=>[r.id,r]));
 for(const region of plan.regions){
  let current=region;const seen=new Set();
  while(current){
   if(seen.has(current.id)||current.parentId!==null&&typeof current.parentId!=='string')throw invalid();seen.add(current.id);
   if(current.parentId===null)break;const parent=regions.get(current.parentId);
   if(!parent)throw invalid();current=parent;
  }
 }
 // Global region and object proposals can retain out-of-owner geometry for normal local repair.
 // Unrelated proposals must not abort trusted observation nomination. Every
 // nominated endpoint still passes sceneEndpointWithinScope below; no owner
 // or box is changed and missing owners remain malformed controls.
 for(const object of plan.objects)if(!regions.has(object.regionId))throw invalid();
 if(plan.relations.some(r=>!record(r)||typeof r.fromId!=='string'||typeof r.toId!=='string'||typeof r.direction!=='string'))throw invalid();
 /** @type {Map<string,Target>} */const targets=new Map();
 for(const route of review.routes){
  let from,to;
  try{from=resolveRetainedSceneEndpoint(plan,route.from);to=resolveRetainedSceneEndpoint(plan,route.to);}
  catch(error){if(error instanceof TypeError&&error.message==='Retained scene review identity is unavailable')continue;throw error;}
  if(from===to||plan.relations.some(r=>r.fromId===from&&r.toId===to&&r.direction===route.direction))continue;
  const scopes=plan.regions.filter(r=>sceneEndpointWithinScope(plan,r.id,from)&&sceneEndpointWithinScope(plan,r.id,to));
  // A legal common ancestor must contain every deeper candidate in the real
  // ancestry chain; geometric proximity is never used to pick an owner.
  const nearest=scopes.filter(r=>!scopes.some(other=>other.id!==r.id&&other.parentId===r.id));
  if(nearest.length!==1)continue;const owner=nearest[0];if(!owner)continue;
  const target=targets.get(owner.id)??{regionId:owner.id,box:{...owner.box},endpoints:[],addObjects:false};
  for(const id of [from,to])if(!target.endpoints?.some(e=>e.id===id)){
   const object=plan.objects.find(e=>e.id===id),region=plan.regions.find(e=>e.id===id),entity=object??region;
   if(!entity)throw invalid();target.endpoints?.push({id,box:{...entity.box},entityKind:object?'object':'region',ownerId:object?object.regionId:region?.parentId??null});
  }
  targets.set(owner.id,target);
 }
 return [...targets.values()].map(t=>{
  const refs=new Set(t.endpoints?.map(e=>e.id));
  return {...t,existingRelations:plan.relations.filter(r=>r.regionId===t.regionId&&refs.has(r.fromId)&&refs.has(r.toId))
   .map(r=>({id:r.id,fromId:r.fromId,toId:r.toId,direction:r.direction,...(r.shaftBox?{shaftBox:{...r.shaftBox}}:{})}))};
 });
}
module.exports={retainedScenePlanningContext,retainedSceneDiscoveryTargets};
