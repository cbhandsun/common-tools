// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
const {captureScenePathReview}=require('./source-scene-path-review');
const {parseSourceRouteCatalog,parseSourceRouteChoice}=require('../routing/source-shared-route-choice');
/** @typedef {import('../routing/source-shared-route-choice').Choice} Choice */
/** @typedef {import('../routing/source-shared-route-choice').Catalog} Catalog */
/** @typedef {import('./source-scene-path-review').PathReview&{catalog:Catalog}} EdgeReview */
/** Only a complete source network description nominates this variant. A
 * malformed public description never becomes a partial graph or authority.
 * @param {import('./source-scene-plan').ScenePlan} plan @param {import('./source-scene-plan').Relation} relation
 * @param {unknown} evidence @returns {EdgeReview|undefined} */
function captureSceneEdgeReview(plan,relation,evidence){
 if(!record(evidence)||!record(evidence.sharedRoutes)||evidence.sharedRoutes.pathChoices===undefined)return undefined;
 const values=evidence.sharedRoutes.pathChoices;
 if(!list(values)||values.length>24)throw new TypeError('Scene source edge review catalogs are invalid');
 const catalogs=values.map(parseSourceRouteCatalog).filter(c=>c.relationIds.includes(relation.id));
 if(catalogs.length>1)throw new TypeError('Scene source edge review catalog is ambiguous');
 const catalog=catalogs[0];if(!catalog)return undefined;
 const owner=plan.regions.find(r=>r.id===relation.regionId),w=catalog.window;
 if(catalog.sourceHash!==plan.sourceHash||catalog.widthPx!==plan.widthPx||catalog.heightPx!==plan.heightPx||!owner
  ||w.x<owner.box.x||w.y<owner.box.y||w.x+w.w>owner.box.x+owner.box.w||w.y+w.h>owner.box.y+owner.box.h
  ||catalog.relationIds.some(id=>!plan.relations.some(r=>r.id===id&&r.regionId===relation.regionId)))return undefined;
 return {...captureScenePathReview(plan,relation),catalog};
}
/** @param {unknown} value @param {EdgeReview} control @returns {Choice|undefined} */
function readSceneEdgeChoice(value,control){
 if(value===null)return undefined;
 const choice=parseSourceRouteChoice({kind:'source-edges-v1',sourceHash:control.sourceHash,networkHash:control.catalog.networkHash,steps:value});
 /** @type {string|undefined} */let at;const seen=new Set();
 for(const [i,step]of choice.steps.entries()){
  const edge=control.catalog.edges.find(e=>e.id===step.id);if(!edge)throw new TypeError('Scene source edge observation is invalid');
  const from=step.reversed?edge.to:edge.from,to=step.reversed?edge.from:edge.to;
  if(i===0){const contact=control.catalog.contacts.find(c=>c.id===from);
   if(contact?.endpointId!==control.relation.fromId||contact.arrow!==['backward','both'].includes(control.relation.direction))
    throw new TypeError('Scene source edge observation contact is invalid');
   seen.add(from);
  }else if(at!==from)throw new TypeError('Scene source edge observation is discontinuous');
  if(seen.has(to))throw new TypeError('Scene source edge observation repeats a contact');seen.add(to);at=to;
 }
 const contact=control.catalog.contacts.find(c=>c.id===at);
 if(contact?.endpointId!==control.relation.toId||contact.arrow!==['forward','both'].includes(control.relation.direction))
  throw new TypeError('Scene source edge observation contact is invalid');
 return choice;
}
/** @param {import('./source-scene-plan').ScenePlan} plan @param {import('./source-scene-topology-review').Target} target
 * @param {import('./source-scene-topology-review').Observation} a @param {import('./source-scene-topology-review').Observation} b */
function sceneEdgeReviewConsensus(plan,target,a,b){
 const control=target.edgeReview,relation=plan.relations.find(r=>r.id===target.relationId),owner=plan.regions.find(r=>r.id===target.regionId);
 if(!control||!relation||!owner||control.sourceHash!==plan.sourceHash||control.widthPx!==plan.widthPx||control.heightPx!==plan.heightPx
  ||JSON.stringify(control.relation)!==JSON.stringify(relation)||JSON.stringify(control.owner)!==JSON.stringify(owner.box)
  ||JSON.stringify(target.box)!==JSON.stringify(owner.box))return {reason:'path-revision'};
 if([a,b].some(o=>o.fromId!==relation.fromId||o.toId!==relation.toId||o.direction!==relation.direction))return {reason:'path-core'};
 if(!a.sourcePathChoice||!b.sourcePathChoice)return {reason:'path-missing'};
 const x=readSceneEdgeChoice(a.sourcePathChoice.steps,control),y=readSceneEdgeChoice(b.sourcePathChoice.steps,control);
 if(!x||!y||JSON.stringify(x)!==JSON.stringify(a.sourcePathChoice)||JSON.stringify(y)!==JSON.stringify(b.sourcePathChoice)||JSON.stringify(x)!==JSON.stringify(y))
  return {reason:'path-consensus'};
 return {sourcePathChoice:x};
}
/** @param {import('./source-scene-topology-review').Target[]} targets */
function sceneEdgeLocalTargets(targets){const rows=targets.filter(t=>t.edgeReview);
 return rows.length?{relationEdgePaths:Object.fromEntries(rows.map(t=>{
  const c=t.edgeReview;if(!c)throw new TypeError('Scene source edge target is invalid');
  return [String(t.index),{sourceHash:c.sourceHash,networkHash:c.catalog.networkHash,edgeIds:c.catalog.edges.map(e=>e.id)}];}))}:{};
}
/** Map a complete network description into THIS observer's first atlas. Names
 * are source-derived, never DFS candidate numbers. Pixels stay unannotated.
 * @param {import('./source-scene-topology-review').Target[]} targets @param {import('./source-scene-missing-text').CropFrame} frame */
function sceneEdgeReviewPrompt(targets,frame){
 const catalogs=new Map();
 for(const target of targets){
  const control=target.edgeReview;if(!control||catalogs.has(control.catalog.networkHash))continue;
  const source=frame.sourceTargets.find(t=>t.index===target.index),sheet=frame.sheetTargets.find(t=>t.index===target.index);
  if(!source||!sheet)throw new TypeError('Scene source edge atlas mapping is invalid');
  const point=(/** @type {{x:number,y:number}} */p)=>({x:Math.round((p.x-source.cropBox.x+sheet.cropBox.x)*1000/frame.width),y:Math.round((p.y-source.cropBox.y+sheet.cropBox.y)*1000/frame.height)});
  catalogs.set(control.catalog.networkHash,{networkHash:control.catalog.networkHash,atlasTargetIndex:target.index,
   contacts:control.catalog.contacts.map(c=>({...c,point:point(c.point)})),edges:control.catalog.edges.map(e=>({...e,points:e.points.map(point)}))});
 }
 return catalogs.size?` For needsEdgeChoice indices independently follow the actual COMPLETE source shaft and return sourceEdgePath as [{id,reversed},...] using ONLY the source-derived edge IDs below, or null when uncertain. Each edge is canonical from->to; reversed:true traverses to->from. Geometry in this description locates ALL independently measured physical edges in the FIRST atlas, including ALL cycle arms; it is not a proposed logical path. Do not select a branch by list order, invent an edge, change contacts, approximate coordinates, or join competing observations. Preserve the exact bound endpoints, direction, owner and source anchor. Two observations must select the SAME complete ordered edge sequence. Full source fitting, anchors, direction, complete coverage and unique physical binding remain mandatory. Source networks: ${JSON.stringify([...catalogs.values()])}. `:'';
}
module.exports={captureSceneEdgeReview,readSceneEdgeChoice,sceneEdgeReviewConsensus,sceneEdgeLocalTargets,sceneEdgeReviewPrompt};
