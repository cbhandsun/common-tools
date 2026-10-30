// @ts-check
'use strict';
const {sceneEndpointWithinScope,containsSceneBox}=require('./source-scene-endpoint-scope');
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {import('./source-scene-plan').Relation} Relation */
/** Nominate one existing ancestor for a purely semantic grouping whose box
 * contains both complete endpoints, but whose declared ancestry does not.
 * This binds a REVIEW, never a repaired relation or source-pixel permission.
 * The nearest valid ancestor in the one declared chain is unique; an invalid
 * chain, physical card owner or out-of-box endpoint cannot widen its scope.
 * @param {Plan} plan @param {Relation} relation */
function captureSceneRelationScopeReview(plan,relation){
 if(plan.regions.length>48||plan.objects.length>176||plan.relations.length>48)return undefined;
 const owner=plan.regions.find(r=>r.id===relation.regionId);
 const entities=[...plan.objects,...plan.regions,...(plan.textEndpoints??[])];
 const from=entities.find(e=>e.id===relation.fromId),to=entities.find(e=>e.id===relation.toId);
 if(!owner||!from||!to||from.id===to.id||!['section','diagram','group'].includes(owner.kind)
  ||!containsSceneBox(owner.box,from.box)||!containsSceneBox(owner.box,to.box)
  ||relation.shaftBox&&!containsSceneBox(owner.box,relation.shaftBox)
  ||sceneEndpointWithinScope(plan,owner.id,from.id)&&sceneEndpointWithinScope(plan,owner.id,to.id))return undefined;
 const regions=new Map(plan.regions.map(r=>[r.id,r])),seen=new Set();
 const ancestors=[];let current=owner;
 while(current){
  if(seen.has(current.id))return undefined;seen.add(current.id);ancestors.push(current);
  if(current.parentId===null)break;
  const parent=regions.get(current.parentId);
  if(!parent||!containsSceneBox(parent.box,current.box))return undefined;current=parent;
 }
 const candidate=ancestors.find(r=>sceneEndpointWithinScope(plan,r.id,from.id)&&sceneEndpointWithinScope(plan,r.id,to.id));
 if(!candidate)return undefined;
 return {sourceHash:plan.sourceHash,widthPx:plan.widthPx,heightPx:plan.heightPx,relation:structuredClone(relation),
  previousOwner:structuredClone(owner),reviewOwner:structuredClone(candidate),fromBox:{...from.box},toBox:{...to.box}};
}
/** @typedef {NonNullable<ReturnType<typeof captureSceneRelationScopeReview>>} ScopeReview */
/** The pair can repair only this owner. Endpoint/direction changes need their
 * own ordinary review; stale source or hierarchy controls must reject.
 * @param {Plan} plan @param {ScopeReview} control @param {Relation} relation
 * @param {{fromId:string|null,toId:string|null,direction:string}} a */
function resolveSceneRelationScopeReview(plan,control,relation,a){
 const current=captureSceneRelationScopeReview(plan,relation);
 if(!current||JSON.stringify(current)!==JSON.stringify(control))return undefined;
 if(a.fromId!==relation.fromId||a.toId!==relation.toId||a.direction!==relation.direction)return undefined;
 return current.reviewOwner.id;
}
module.exports={captureSceneRelationScopeReview,resolveSceneRelationScopeReview};
