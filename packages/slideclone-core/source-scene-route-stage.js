// @ts-check
"use strict";
const {containsSceneBox}=require('./source-scene-plan');
const {sceneEndpointWithinScope}=require('./source-scene-topology-review');
const {measureSourceSceneRoute}=require('./source-scene-route');
const {compileSourceSceneRoute}=require('./source-scene-route-compiler');
const {sceneRouteWithinAnchor}=require('./source-scene-relation-identity');
/** Existing relations retain their IDs, inventories and shared source budget.
 * Each failed straight shaft can be completed only by a source-proven route.
 * Run after mandatory straight measurements, before optional decoration.
 * @param {{plan:import('./source-scene-plan').ScenePlan,image:import('./png').PngImage,
 * nodes:Map<string,{id:string,box:import('./source-scene-plan').Box,portFrame:object|null}>,
 * shapes:{id?:string}[],textMasks:import('./source-scene-plan').Box[],budget:{used:number},
 * slideSize:{widthPt:number,heightPt:number},resolveNodes?:import('./source-scene-icon-relation-nodes').ResolveNodes,unresolved:{id:string,reason:string,detailCode?:string}[]}} request */
function compileExistingSceneRoutes({plan,image,nodes,shapes,textMasks,budget,slideSize,unresolved,resolveNodes}){
 const parts=[],resolved=new Set(),rejected=[];
 for(const relation of plan.relations){
  const failure=unresolved.find(r=>r.id===relation.id&&r.reason==='relation-source-evidence');
  if(!failure||!sceneEndpointWithinScope(plan,relation.regionId,relation.fromId)||!sceneEndpointWithinScope(plan,relation.regionId,relation.toId))continue;
  const pair=resolveNodes?.(relation),from=pair?pair.from:nodes.get(relation.fromId),to=pair?pair.to:nodes.get(relation.toId);
  if(!from||!to||from.id===to.id||!shapes.some(s=>s.id===from.id)||!shapes.some(s=>s.id===to.id)||relation.direction==='unknown')continue;
  const otherNodes=[...new Set(nodes.values())].filter(n=>n.id!==from.id&&n.id!==to.id
    &&!containsSceneBox(n.box,from.box)&&!containsSceneBox(n.box,to.box)).map(n=>n.box);
  otherNodes.push(...(pair?.otherNodes??[]));
  const measured=measureSourceSceneRoute({image,from,to,direction:relation.direction,textMasks,otherNodes,budget,...(relation.shaftBox?{shaftBox:relation.shaftBox}:{}),
   ...(relation.visiblePath?{visiblePath:relation.visiblePath}:{})});
  if(!measured.fit){rejected.push({id:relation.id,reason:measured.reason});continue;}
  if(!sceneRouteWithinAnchor(relation,measured.fit.points)){rejected.push({id:relation.id,reason:'route-relation-anchor'});continue;}
  parts.push(...compileSourceSceneRoute({fit:measured.fit,relation,fromId:from.id,toId:to.id,widthPx:image.width,heightPx:image.height,slideSize}));
  resolved.add(relation.id);
 }
 return {parts,resolved,unresolved:unresolved.filter(r=>!resolved.has(r.id)),rejected};
}
module.exports={compileExistingSceneRoutes};
