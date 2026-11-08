// @ts-check
"use strict";
const {bindSourceScenePhysicalGroups}=require('./source-scene-physical-groups');
const {compileSceneInteriorParts,sceneInteriorBindings}=require('./source-scene-interior-parts');
const {assembleSourceSceneCompleteGroups}=require('./source-scene-complete-groups');
const {compactPhysicalSceneInventory}=require('./source-scene-physical-inventory');
const {buildSceneInventoryEvidence}=require('./source-scene-observed-inventory');
const {bindSceneRecoveries}=require('./source-scene-inventory-materialization');
const {nativeSceneGroupBindings}=require('./source-scene-native-icon-groups');
const {combineMeasuredSceneGroupReceipts}=require('./source-scene-group-retention');
const {sealStandaloneSceneIcons}=require('./source-scene-standalone-icons');
const {bindMeasuredSceneVisibleGapInventory}=require('./source-scene-visible-gap-compiler');
const {sharedSceneRouteMembers,survivingSharedSceneRoutes}=require('./source-scene-shared-route-inventory');
const {sealMeasuredSharedRouteGroups}=require('../routing/source-shared-route-compiler');
const {sealMeasuredFilledRouteGroups}=require('../routing/source-filled-route-compiler');
const {prepareSceneCropPaint}=require('./source-crop-paint-overlap');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{id?:string,box:Box,source?:Record<string,unknown>,style?:Record<string,unknown>,type?:string}} Item */
/** Complete grouping before appending source-isolated internal paint. Keeping
 * this phase after all mandatory measurements preserves their source priority.
 * Preflight retains only measured aliases and performs no optional discovery.
 * @param {Parameters<typeof bindSourceScenePhysicalGroups>[0]&{
 * textBoxes:({text:string}&Item)[],plan:import('./source-scene-plan').ScenePlan,
 * root:string,budget:{used:number},preflight:boolean,validRegions:Set<string>,
 * physicalAliases:{id:string,canonicalId:string}[],nativeIcons?:unknown[],recoveredInventoryUnits?:import('./source-scene-inventory-materialization').Recovery[],
 * sharedRouteGraphs?:import('./source-scene-shared-route-inventory').SharedGraph[],
 * routeEndpoints?:ReturnType<typeof import('./source-scene-route-endpoints').prepareSceneRouteEndpoints>,
 * recoverInteriorSource?:NonNullable<Parameters<typeof compileSceneInteriorParts>[0]['recoverInteriorSource']>}} request */
function finalizeSourceScene(request){
 const {plan,preflight,budget}=request;
 // Optional grouping reads output alpha only; it grants no source erasure.
 if(!preflight&&request.images.length)request={...request,cropPaintToken:prepareSceneCropPaint(request.images,request.root)};
 const grouped=bindSourceScenePhysicalGroups(request);
 let images=request.images;
 const interiorParents=new Set();
 let sealGroups=grouped.sealGroups;
 const recovered=[...(request.recoveredInventoryUnits??[])];
 if(!preflight){
  const groupingWork={used:grouped.evidence.physicalGroupGeometryChecks,exhausted:false};
  const native=nativeSceneGroupBindings({...request,shapes:grouped.shapes,nativeIcons:request.nativeIcons??[],work:groupingWork});
  const interior=compileSceneInteriorParts({...request,plan:{...plan,objects:plan.objects.filter(o=>request.validRegions.has(o.regionId))},
   textBoxes:grouped.textBoxes,shapes:grouped.shapes,representedParents:native.bindings.map(binding=>binding.parentId),
   capacity:Math.max(0,32-plan.objects.filter(o=>o.kind==='icon').length)});
  grouped.shapes.push(...interior.parts);
  const assembled=assembleSourceSceneCompleteGroups({...request,shapes:grouped.shapes,textBoxes:grouped.textBoxes,interior,
   geometryChecks:groupingWork.used});
  grouped.shapes=assembled.shapes;
  grouped.textBoxes=assembled.textBoxes;
  images=assembled.images;
  const sealPhysical=sealGroups;
  sealGroups=page=>combineMeasuredSceneGroupReceipts([
   combineMeasuredSceneGroupReceipts([sealPhysical(page),assembled.sealGroups(page)]),
   sealStandaloneSceneIcons(request.image,request.nativeIcons??[],page,groupingWork.used)]);
  for(const id of assembled.completedParents)interiorParents.add(id);
  for(const binding of sceneInteriorBindings(request.image,interior))if(binding.parts.every(p=>grouped.shapes.filter(s=>s.id===p.id).length===1))interiorParents.add(binding.parentId);
  recovered.push(...(interior.inventoryUnits??[]));
  Object.assign(grouped.evidence,interior.evidence,assembled.evidence,{sourceScanPixels:budget.used});
  const sealLocal=sealGroups;
  sealGroups=page=>{
   const filled=sealMeasuredFilledRouteGroups(request.image,page,grouped.evidence.physicalGroupGeometryChecks);
   return combineMeasuredSceneGroupReceipts([sealLocal(page),combineMeasuredSceneGroupReceipts([filled.token,
    sealMeasuredSharedRouteGroups(request.image,page,filled.checks)])]);
  };
 }
 const inventory=preflight||plan.observedInventory?compactPhysicalSceneInventory(plan,request.physicalAliases):undefined;
 if(plan.observedInventory&&inventory){
  const recoveries=recovered.map(unit=>({...unit,...(unit.parentObjectId?{parentObjectId:
   inventory.evidence.aliases.find(a=>a.id===unit.parentObjectId)?.canonicalId??unit.parentObjectId}:{})}));
  bindSceneRecoveries(recoveries,grouped.shapes);
  const sharedMembers=new Set((request.sharedRouteGraphs??[]).flatMap(sharedSceneRouteMembers));
  for(const shape of grouped.shapes)if(!sharedMembers.has(shape.id??'')&&typeof shape.source?.sceneRelationId==='string'){
   if(!bindMeasuredSceneVisibleGapInventory(request.image,shape,shape.source.sceneRelationId))
    shape.source={...shape.source,sceneInventoryId:shape.source.sceneRelationId};
  }
  const routeControls=plan.relationObservationUnit!==undefined?{endpoints:request.routeEndpoints?.capture(grouped.shapes,grouped.textBoxes)??[],textBoxes:grouped.textBoxes}:{};
  const observedInventory=buildSceneInventoryEvidence(inventory.plan,grouped.shapes,images,recoveries,request.sharedRouteGraphs,routeControls);
  const sharedRelations=survivingSharedSceneRoutes(request.sharedRouteGraphs??[],grouped.shapes,images,observedInventory?.units??[],observedInventory?.endpointBindings??[],grouped.textBoxes);
  if(!sharedRelations)throw new TypeError('Scene shared final members are invalid');
  return {...grouped,images,interiorParents,recoveries,sealGroups,sharedRelations,evidence:{...grouped.evidence,observedInventory},
   ...(preflight?{physicalInventory:inventory}:{})};
 }
 return {...grouped,images,interiorParents,recoveries:recovered,sealGroups,sharedRelations:new Map(),...(preflight&&inventory?{physicalInventory:inventory}:{})};
}
module.exports={finalizeSourceScene};
