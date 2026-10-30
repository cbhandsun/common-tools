// @ts-check
"use strict";
const {containsSceneBox}=require('./source-scene-plan');
const {sceneEndpointWithinScope,sceneRelationWithinAnchor}=require('./source-scene-topology-review');
const {measureSourceSceneVisibleGap}=require('./source-scene-visible-gap');
const {compileSourceSceneVisibleGap}=require('./source-scene-visible-gap-compiler');
const {hasSceneTextEndpoint}=require('./source-scene-text-endpoints');
/** Resolve existing scoped relations only. A measured source gap has distinct
 * evidence from physical shaft attachment; keep that kind in the actual IR.
 * @param {{plan:import('./source-scene-plan').ScenePlan,image:import('../png').PngImage,
 * nodes:Map<string,{id:string,box:import('./source-scene-plan').Box,portFrame:object|null}>,
 * shapes:{id?:string}[],textMasks:import('./source-scene-plan').Box[],budget:{used:number},sourceInk?:boolean,glyphOcclusion?:unknown,
 * slideSize:{widthPt:number,heightPt:number},resolveNodes?:import('./source-scene-icon-relation-nodes').ResolveNodes,unresolved:{id:string,reason:string,detailCode?:string}[]}} request */
function compileExistingSceneVisibleGaps({plan,image,nodes,shapes,textMasks,budget,slideSize,unresolved,resolveNodes,sourceInk=false,glyphOcclusion}){
 const parts=[],resolved=new Set(),rejected=[],repaired=[];
 for(const relation of plan.relations){
  if(relation.visiblePath&&![2,3].includes(relation.visiblePath.vertices.length))continue;
  const failure=unresolved.find(r=>r.id===relation.id&&r.reason==='relation-source-evidence');
  if(!failure||!sceneEndpointWithinScope(plan,relation.regionId,relation.fromId)||!sceneEndpointWithinScope(plan,relation.regionId,relation.toId)||relation.direction==='unknown')continue;
  const pair=resolveNodes?.(relation),from=pair?pair.from:nodes.get(relation.fromId),to=pair?pair.to:nodes.get(relation.toId);
  if(!from||!to||from.id===to.id||!shapes.some(s=>s.id===from.id)||!shapes.some(s=>s.id===to.id))continue;
  const otherNodes=[...new Set(nodes.values())].filter(n=>n.id!==from.id&&n.id!==to.id&&!containsSceneBox(n.box,from.box)&&!containsSceneBox(n.box,to.box)).map(n=>n.box);
  otherNodes.push(...(pair?.otherNodes??[]));
  const result=measureSourceSceneVisibleGap({image,from,to,direction:relation.direction,textMasks,otherNodes,budget,sourceInk,...(glyphOcclusion!==undefined?{glyphOcclusion}:{}),...(relation.shaftBox?{shaftBox:relation.shaftBox}:{}),
   ...(relation.visiblePath?{visiblePath:relation.visiblePath}:{})});
  if(!result.fit){rejected.push({id:relation.id,reason:result.reason});continue;}
  if(!sceneRelationWithinAnchor(relation,result.fit)){rejected.push({id:relation.id,reason:'gap-relation-anchor'});continue;}
  parts.push(compileSourceSceneVisibleGap({fit:result.fit,relation,fromId:from.id,toId:to.id,width:image.width,height:image.height,slideSize,
   ...(hasSceneTextEndpoint(image,from.portFrame,from.box)?{fromTextEndpoint:from.portFrame}:{}),
   ...(hasSceneTextEndpoint(image,to.portFrame,to.box)?{toTextEndpoint:to.portFrame}:{})}));
  resolved.add(relation.id);repaired.push({id:relation.id,previous:failure.detailCode??'source-evidence',attachmentKind:'visible-gap-logical'});
 }
 return {parts,resolved,rejected,repaired,unresolved:unresolved.filter(r=>!resolved.has(r.id))};
}
module.exports={compileExistingSceneVisibleGaps};
