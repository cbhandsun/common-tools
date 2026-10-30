// @ts-check
'use strict';
const {bindSharedSourcePath}=require('./source-shared-route-path-binding');
const {sourceRouteChoiceFailure}=require('./source-shared-route-choice');
const {reprojectSourceRouteChoice}=require('./source-shared-route-reprojection');
/** Bind logical identities without discarding physical source edges. Only
 * ambiguity and duplicate identities may remain pending on a complete network.
 * Every other failure (including a truncated search or stale choice) is fatal.
 * @param {Omit<Parameters<typeof bindSharedSourcePath>[0],'relation'|'choiceContext'>&{
 * relations:import('../scene-plan/source-scene-plan').Relation[],allowUnboundRelations:boolean,
 * previousCatalogs?:import('./source-shared-route-choice').Catalog[],
 * choiceContext:ReturnType<typeof import('./source-shared-route-choice').createSourceRouteCatalog>}} input */
function bindSharedSourceRelations({relations,allowUnboundRelations,previousCatalogs=[],...context}){
 const partial=allowUnboundRelations&&context.graph.topology==='source-network-v1';
 /** @type {Map<string,NonNullable<ReturnType<typeof bindSharedSourcePath>['binding']>>} */const bindings=new Map();
 /** @type {Map<string,string>} */const failures=new Map();
 /** @type {Map<string,string[]>} */const sequences=new Map();
 const fail=(/** @type {string} */reason)=>sourceRouteChoiceFailure(reason,context.choiceContext.catalog);
 /** @type {{id:string,previousNetworkHash:string,networkHash:string}[]} */const reprojectedChoices=[];
 for(const relation of relations){
  const choice=relation.sourcePathChoice&&reprojectSourceRouteChoice(relation.sourcePathChoice,previousCatalogs,context.choiceContext.catalog,context.work);
  const selected=bindSharedSourcePath({...context,relation:choice?{...relation,sourcePathChoice:choice}:relation});
  if(!selected.binding){
   if(!partial||selected.reason!=='shared-relation-ambiguous')throw fail(selected.reason);
   failures.set(relation.id,selected.reason);continue;
  }
  const {refs}=selected.binding;
  context.work.checks+=refs.length*2;if(context.work.checks>4000000)throw fail('shared-geometry-budget');
  const forward=JSON.stringify(refs.map(r=>[r.id,r.reversed]));
  const reverse=JSON.stringify([...refs].reverse().map(r=>[r.id,!r.reversed]));
  const key=forward<reverse?forward:reverse,ids=sequences.get(key)??[];
  if(ids.length&&!partial)throw fail('shared-relation-duplicate');
  ids.push(relation.id);sequences.set(key,ids);bindings.set(relation.id,selected.binding);
  if(choice&&relation.sourcePathChoice&&choice.networkHash!==relation.sourcePathChoice.networkHash)reprojectedChoices.push({id:relation.id,previousNetworkHash:relation.sourcePathChoice.networkHash,networkHash:choice.networkHash});
 }
 // Resolve complete conflict classes, never whichever relation arrived first.
 for(const ids of sequences.values())if(ids.length>1)for(const id of ids){bindings.delete(id);failures.set(id,'shared-relation-duplicate');}
 const unbound=relations.flatMap(r=>{const reason=failures.get(r.id);return reason?[{id:r.id,reason}]:[];});
 if(bindings.size<2)throw fail(unbound[0]?.reason??'shared-relation-ambiguous');
 return {bindings,unbound,reprojectedChoices:reprojectedChoices.filter(r=>bindings.has(r.id))};
}
module.exports={bindSharedSourceRelations};
