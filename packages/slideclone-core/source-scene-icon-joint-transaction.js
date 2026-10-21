// @ts-check
'use strict';
const {compileSceneIcon,sceneNativeIconBinding,sceneNativeIconNode,createSceneIconRelationNodes}=require('./source-scene-native-icon');
const {createIconBoundaryPartition,sealIconBoundaryPartition,iconBoundaryPartitionSize,iconBoundaryPartitionCoverage}=require('./source-scene-icon-boundary-partition');
const {compileJointIconGaps}=require('./source-scene-icon-joint-relations');
/** The candidates below never escape unless the whole dependency set seals.
 * Neither a model rectangle nor the provisional icon can authorize deleting
 * its neighbor. Actual source-proven connector outputs must own every omitted
 * solid source cell; default raster admission is never used in this path.
 * @param {{image:import('./png').PngImage,plan:import('./source-scene-plan').ScenePlan,root:string,
 * slideSize:{widthPt:number,heightPt:number},textBoxes:{text:string,box:import('./source-scene-plan').Box}[],
 * textMasks:import('./source-scene-plan').Box[],budget:{used:number},failedIds:Set<string>,icons:unknown[],
 * nodes:Parameters<typeof createSceneIconRelationNodes>[0]['nodes'],shapes:{id?:string}[]}} input */
function compileJointIconRelationGroup(input){
 const {image,plan,root,slideSize,textBoxes,textMasks,budget,failedIds,icons,nodes,shapes}=input;
 const proposed=plan.objects.filter(o=>o.kind==='icon'&&failedIds.has(o.id));
 const empty={adopted:/** @type {{id:string,result:ReturnType<typeof compileSceneIcon>}[]} */([]),
  parts:/** @type {ReturnType<typeof import('./source-scene-visible-gap-stage').compileExistingSceneVisibleGaps>['parts']} */([]),resolved:new Set(),
  evidence:{proposed:proposed.length,omittedCells:0,adopted:0,failure:''}};
 if(!proposed.length)return empty;
 if(proposed.length>32)return {...empty,evidence:{...empty.evidence,failure:'joint-icon-capacity'}};
 const candidates=[],trialNodes=new Map(nodes),trialShapes=[...shapes];
 for(const object of proposed){
  if(object.parentObjectId||!plan.relations.some(r=>r.fromId===object.id||r.toId===object.id))
   return {...empty,evidence:{...empty.evidence,failure:'joint-icon-endpoint'}};
  const token=createIconBoundaryPartition(image);
  const result=compileSceneIcon({image,box:object.box,id:object.id,regionId:object.regionId,root,slideSize,textBoxes,budget},
   {preflight:true,nativePictorial:true,parentObjectId:'',relationEndpoint:true,boundaryPartition:token});
  if(result.failure!==null||!result.shapes.length||!sceneNativeIconBinding(image,result)||!iconBoundaryPartitionSize(token))
   return {...empty,evidence:{...empty.evidence,failure:result.detailCode??result.failure??'joint-icon-membership'}};
  candidates.push({id:object.id,result,token});trialShapes.push(...result.shapes);
  const node=sceneNativeIconNode(image,result);if(node)trialNodes.set(object.id,node);
 }
 const candidateIds=new Set(candidates.map(c=>c.id));
 const relations=plan.relations.filter(r=>candidateIds.has(r.fromId)||candidateIds.has(r.toId));
 const resolveNodes=createSceneIconRelationNodes({image,icons:[...icons,...candidates.map(c=>c.result)],nodes:trialNodes,slideSize});
 const observed=compileJointIconGaps({plan:{...plan,relations},image,nodes:trialNodes,shapes:trialShapes,textMasks,budget,slideSize,resolveNodes,sourceInk:true,
  unresolved:relations.map(r=>({id:r.id,reason:'relation-source-evidence',detailCode:'joint-icon-pending'}))},[...icons,...candidates.map(c=>c.result)]);
 const omittedCells=candidates.reduce((sum,c)=>sum+iconBoundaryPartitionSize(c.token),0);
 const sealed=candidates.map(c=>sealIconBoundaryPartition(c.token,image,observed.parts));
 if(sealed.some(ok=>!ok)||candidates.some(c=>!sceneNativeIconBinding(image,c.result)))
  return {...empty,evidence:{...empty.evidence,omittedCells,failure:'joint-connector-coverage',measuredRelations:observed.resolved.size,rejected:observed.rejected,
   coverage:candidates.map(c=>({id:c.id,...iconBoundaryPartitionCoverage(c.token)}))}};
 return {adopted:candidates.map(({id,result})=>({id,result})),parts:observed.parts,resolved:observed.resolved,
  evidence:{proposed:proposed.length,omittedCells,adopted:candidates.length,failure:''},rejected:observed.rejected};
}
/** Independent dependency components commit independently. Sharing an already
 * verified node does not couple two icons, but a relation between two pending
 * icons does: neither endpoint may escape a failed joint proof.
 * @param {Parameters<typeof compileJointIconRelationGroup>[0]} input */
function compileJointIconRelations(input){
 const pending=new Set(input.plan.objects.filter(o=>o.kind==='icon'&&input.failedIds.has(o.id)).map(o=>o.id));
 const groups=[];
 while(pending.size){
  const first=[...pending][0];if(!first)break;const group=new Set([first]);pending.delete(first);
  for(const id of group)for(const relation of input.plan.relations){
   const peer=relation.fromId===id?relation.toId:relation.toId===id?relation.fromId:null;
   if(peer&&pending.has(peer)){pending.delete(peer);group.add(peer);}
  }
  groups.push(compileJointIconRelationGroup({...input,failedIds:group}));
 }
 return {adopted:groups.flatMap(g=>g.adopted),parts:groups.flatMap(g=>g.parts),resolved:new Set(groups.flatMap(g=>[...g.resolved])),
  evidence:{proposed:groups.reduce((sum,g)=>sum+g.evidence.proposed,0),adopted:groups.reduce((sum,g)=>sum+g.evidence.adopted,0),
   omittedCells:groups.reduce((sum,g)=>sum+g.evidence.omittedCells,0),groups:groups.map(g=>g.evidence)}};
}
module.exports={compileJointIconRelations};
