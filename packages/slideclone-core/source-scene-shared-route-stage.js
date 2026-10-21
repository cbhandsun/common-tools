// @ts-check
'use strict';
const crypto=require('node:crypto');
const {sceneEndpointWithinScope}=require('./source-scene-topology-review');
const {sourceRouteObservationWindow}=require('./source-route-observation-window');
const {measureSharedSourceRoute}=require('./source-shared-route-measurement');
const {compileSharedSourceRoute}=require('./source-shared-route-compiler');
const {readSharedSceneRouteGraphs}=require('./source-scene-shared-route-inventory');
const {captureSceneMembers}=require('./source-scene-inventory-materialization');
const {containsSceneBox}=require('./source-scene-plan');
/** @typedef {import('./source-scene-plan').Relation} Relation */
/** @param {Relation} a @param {Relation} b */
function sharesEndpoint(a,b){
 const common=[a.fromId,a.toId].some(id=>id===b.fromId||id===b.toId),x=a.shaftBox,y=b.shaftBox;
 const samePair=[a.fromId,a.toId].every(id=>id===b.fromId||id===b.toId);
 // Bounded search nomination only. Disjoint anchors of the same entity pair
 // may describe different exits of one tree. A mere chain of shared entities
 // must not merge the entire logical diagram into one geometry window.
 return common&&(samePair||!!x&&!!y&&x.x<y.x+y.w&&y.x<x.x+x.w&&x.y<y.y+y.h&&y.y<x.y+x.h);
}
/** Run before single-path fallback probes consume the same source budget.
 * Original physical observation plans keep their old behavior. An explicit
 * logical census is required; a shared tree never silently rewrites it.
 * @param {{plan:import('./source-scene-plan').ScenePlan,image:import('./png').PngImage,
 * nodes:Map<string,import('./source-scene-route').Node>,shapes:{id?:string}[],images:{id?:string}[],
 * textMasks:import('./source-scene-plan').Box[],budget:{used:number},slideSize:{widthPt:number,heightPt:number},
 * existing:Map<string,string[]>,endpoints:import('./source-scene-route-endpoints').RouteEndpoint[]}} input */
function compileSharedSceneRoutes({plan,image,nodes,shapes,images,textMasks,budget,slideSize,existing,endpoints}){
 /** @type {ReturnType<typeof compileSharedSourceRoute>['parts']} */const parts=[];
 /** @type {import('./source-scene-shared-route-inventory').SharedGraph[]} */const graphs=[];
 /** @type {{ids:string[],reason:string,contacts?:{id:string,count:number}[]}[]} */const rejected=[];
 const resolved=new Map();
 if(plan.relationObservationUnit!=='logical-relations-v1')return {parts,graphs,resolved,rejected};
 const pool=plan.relations.filter(r=>!existing.has(r.id)&&r.direction!=='unknown'
  &&sceneEndpointWithinScope(plan,r.regionId,r.fromId)&&sceneEndpointWithinScope(plan,r.regionId,r.toId));
 const seen=new Set(),captured=captureSceneMembers(shapes,images);if(!captured)throw new TypeError('Scene shared stage members are invalid');
 const units=[...plan.objects.map(o=>({id:o.id,regionId:o.regionId,kind:o.kind,members:captured.get(o.id)??[]})),
  ...plan.relations.map(r=>({...r,kind:'relation',members:/** @type {import('./source-scene-inventory-materialization').Member[]} */([])}))];
 for(const seed of pool){
  if(seen.has(seed.id))continue;const group=[seed];seen.add(seed.id);
  for(const at of group)for(const candidate of pool)if(!seen.has(candidate.id)&&candidate.regionId===seed.regionId&&sharesEndpoint(at,candidate)){
   group.push(candidate);seen.add(candidate.id);}
  if(group.length<2)continue;
  const ids=group.map(r=>r.id),endpointIds=[...new Set(group.flatMap(r=>[r.fromId,r.toId]))];
  if(endpointIds.length>32){rejected.push({ids,reason:'shared-contact-capacity'});continue;}
  const bindings=endpointIds.map(endpointId=>{
   const node=nodes.get(endpointId);
   const arrow = group.some(r => r.toId === endpointId && ['forward','both'].includes(r.direction));
    return node&&shapes.filter(s=>s.id===node.id).length===1?{...node,endpointId,arrow}:null;
  });
  if(bindings.some(n=>!n)){rejected.push({ids,reason:'shared-native-endpoint'});continue;}
  const valid=/** @type {NonNullable<typeof bindings[number]>[]} */(bindings);
  const windows=group.map(r=>{
   const from=nodes.get(r.fromId),to=nodes.get(r.toId);if(!from||!to||!r.shaftBox)throw new TypeError('Scene shared source hint is invalid');
   return sourceRouteObservationWindow({hint:r.shaftBox,from:from.box,to:to.box,width:image.width,height:image.height,anchored:true,programmed:false});});
  const x=Math.min(...windows.map(w=>w.x)),y=Math.min(...windows.map(w=>w.y));
  const window={x,y,w:Math.max(...windows.map(w=>w.x+w.w))-x,h:Math.max(...windows.map(w=>w.y+w.h))-y};
  const obstacles=[...new Set(nodes.values())].filter(n=>!endpointIds.some(endpointId=>nodes.get(endpointId)===n)&&!valid.some(member=>containsSceneBox(n.box,member.box))).map(n=>n.box);
  const measured=measureSharedSourceRoute({image,nodes:valid,window,textMasks,obstacles,budget,inferContacts:true});
  if(!measured.fit){rejected.push({ids,reason:measured.reason,...('endpointContacts'in measured?{contacts:measured.endpointContacts}:{})});continue;}
  const id='shared-'+crypto.createHash('sha256').update(plan.sourceHash+'\0'+ids.slice().sort().join('\0')).digest('hex').slice(0,24);
  /** @type {ReturnType<typeof compileSharedSourceRoute>} */let result;
  try{result=compileSharedSourceRoute({fit:measured.fit,image,relations:group,id,sourceHash:plan.sourceHash,slideSize});}
  catch(error){

   const prefix='Scene shared path binding failed: ',code=error instanceof TypeError&&error.message.startsWith(prefix)?error.message.slice(prefix.length):'';
   if(['shared-relation-direction','shared-relation-anchor','shared-path-budget','shared-source-path-budget','shared-geometry-budget','shared-path-program','shared-relation-ambiguous'].includes(code)){
    rejected.push({ids,reason:code});continue;
   }
   if(!(error instanceof TypeError&&['Scene shared path budget is invalid','Scene shared source path budget is invalid','Scene shared complete parts are invalid'].includes(error.message)))throw error;
   rejected.push({ids,reason:'shared-path-parts-budget'});continue;
  }
  readSharedSceneRouteGraphs([result.graph],units,plan.sourceHash,endpoints);
  for(const path of result.graph.paths){const edges=path.edges.map(ref=>result.graph.edges.find(e=>e.id===ref.id));
   const used=new Set(edges.flatMap(e=>e?[e.from,e.to]:[]));
   resolved.set(path.relationId,[...result.graph.nodes.filter(n=>n.endpointId===null&&used.has(n.id)).map(n=>n.nativeId),...edges.flatMap(e=>e?[e.memberId]:[])]);}
  parts.push(...result.parts);graphs.push(result.graph);
 }
 return {parts,graphs,resolved,rejected};
}
module.exports={compileSharedSceneRoutes};
