// @ts-check
'use strict';
const {containsSceneBox}=require('./source-scene-plan');
const {sceneEndpointWithinScope}=require('./source-scene-topology-review');
const {measureSourceSceneCaptionRoute}=require('./source-scene-caption-route');
const {compileSourceSceneCaptionRoute}=require('./source-scene-caption-route-compiler');
/** @param {Parameters<typeof import('./source-scene-route-stage').compileExistingSceneRoutes>[0]&{glyphOcclusion?:unknown}} request */
function compileExistingSceneCaptionRoutes({plan,image,nodes,shapes,textMasks,budget,slideSize,unresolved,glyphOcclusion,resolveNodes}){
 /** @type {ReturnType<typeof compileSourceSceneCaptionRoute>} */const parts=[];
 /** @type {Set<string>} */const resolved=new Set();
 /** @type {{id:string,reason:string}[]} */const rejected=[];
 if(glyphOcclusion===undefined)return {parts,resolved,rejected,unresolved};
 for(const relation of plan.relations){
  if(!relation.shaftBox||relation.visiblePath||relation.direction==='unknown'||!unresolved.some(r=>r.id===relation.id&&r.reason==='relation-source-evidence')
   ||!sceneEndpointWithinScope(plan,relation.regionId,relation.fromId)||!sceneEndpointWithinScope(plan,relation.regionId,relation.toId))continue;
  const pair=resolveNodes?.(relation),from=pair?pair.from:nodes.get(relation.fromId),to=pair?pair.to:nodes.get(relation.toId);
  if(!from||!to||from.id===to.id||!shapes.some(s=>s.id===from.id)||!shapes.some(s=>s.id===to.id))continue;
  const otherNodes=[...new Set(nodes.values())].filter(n=>n.id!==from.id&&n.id!==to.id&&!containsSceneBox(n.box,from.box)&&!containsSceneBox(n.box,to.box)).map(n=>n.box);
  otherNodes.push(...(pair?.otherNodes??[]));
  const result=measureSourceSceneCaptionRoute({image,from,to,shaftBox:relation.shaftBox,direction:relation.direction,textMasks,otherNodes,budget,glyphOcclusion});
  if(!result.fit){rejected.push({id:relation.id,reason:result.reason});continue;}
  parts.push(...compileSourceSceneCaptionRoute({fit:result.fit,relation,fromId:from.id,toId:to.id,width:image.width,height:image.height,slideSize}));resolved.add(relation.id);
 }
 return {parts,resolved,rejected,unresolved:unresolved.filter(r=>!resolved.has(r.id))};
}
module.exports={compileExistingSceneCaptionRoutes};
