// @ts-check
'use strict';
const {sceneNativeIconBinding,sceneNativeIconNodes}=require('./source-scene-native-icon');
const {compileExistingSceneVisibleGaps}=require('./source-scene-visible-gap-stage');
/** A model axis cannot choose a multi-part icon endpoint. Try the bounded
 * actual native members against the original shaft, accepting only ONE fully
 * source-proven pair. Every trial debits the same budget; failed and ambiguous
 * trials produce no output, ownership or partial native relation.
 * @param {Parameters<typeof compileExistingSceneVisibleGaps>[0]} input
 * @param {unknown[]} icons */
function compileJointIconGaps(input,icons){
 const {image,plan,nodes}=input;
 const admitted=icons.flatMap(result=>{const b=sceneNativeIconBinding(image,result);return b?[{id:b.id,result}]:[];});
 const parts=[],resolved=new Set(),rejected=[];
 for(const relation of plan.relations){
  if(!input.unresolved.some(r=>r.id===relation.id&&r.reason==='relation-source-evidence'))continue;
  if(!admitted.some(c=>c.id===relation.fromId||c.id===relation.toId))continue;
  const base=input.resolveNodes?.(relation);
  /** @param {string} id */const candidates=id=>{
   const icon=admitted.find(c=>c.id===id);if(icon)return sceneNativeIconNodes(image,icon.result);
   const node=nodes.get(id);return node?[node]:[];
  };
  const from=candidates(relation.fromId),to=candidates(relation.toId);
  if(!from.length||!to.length||from.length*to.length>32){rejected.push({id:relation.id,reason:'joint-endpoint-capacity'});continue;}
  const successful=[];
  for(const a of from)for(const b of to){
   const result=compileExistingSceneVisibleGaps({...input,plan:{...plan,relations:[relation]},
    resolveNodes:()=>({from:a,to:b,otherNodes:base?.otherNodes??[]})});
   if(result.resolved.has(relation.id))successful.push(result);
  }
  if(successful.length!==1){rejected.push({id:relation.id,reason:successful.length?'joint-endpoint-ambiguous':'joint-endpoint-source'});continue;}
  const result=successful[0];if(result){parts.push(...result.parts);resolved.add(relation.id);}
 }
 return {parts,resolved,rejected};
}
module.exports={compileJointIconGaps};
