// @ts-check
'use strict';
const {observeOpenScenePaint,retainedOpenScenePaint}=require('./source-scene-open-paint');
const {observeSceneLiteralPaint}=require('./source-scene-literal-paint');
const {observeOpenSceneOwnerMembers}=require('./source-scene-open-owner-members');
const {observeOpenSceneOwnerInventory,retainedOpenSceneOwnerInventory}=require('./source-scene-open-owner-inventory');
const {prepareRegionProgramLabels,completeRegionPrograms}=require('./source-scene-region-completion');
const {measuredSceneGroupBounds,measuredSceneOpaqueSurface}=require('./source-scene-port-evidence');
const {createSceneFillRasterScope,withSceneFillRasterScope}=require('./source-scene-fill-raster-cache');
/** @typedef {import('./source-scene-open-owner-members').Page} Page */
/** @typedef {import('./source-scene-plan').ScenePlan} Plan */
/** @typedef {Parameters<typeof completeRegionPrograms>[0]} CompletionInput */
/** @typedef {NonNullable<ReturnType<typeof observeOpenScenePaint>['parts']>[number]} Paint */
/** @typedef {{owner:Plan['regions'][number],paint:{receipt:object,parts:Paint[]},
 * foreignFrames:{id:string,token:unknown,box:import('./source-scene-plan').Box,pattern?:unknown}[],relationParts:Page['shapes'],
 * literalPaint?:{receipt:unknown,parts:unknown[]}}} Stage */
/** @type {WeakMap<object,{image:import('../png').PngImage,plan:Plan,page:Page,inventories:unknown[],members:Set<object>}>} */
const transactions=new WeakMap();
/** Complete transparent owners only after all descendants and relations exist.
 * The first full inventory derives residual cells; a final full inventory is
 * issued AFTER label rebinding and surface composition. Failure restores every
 * shared source reference and publishes neither paint, maps nor typography.
 * The real compiler's maps and all original census gates remain mandatory.
 * @param {{image:import('../png').PngImage,plan:Plan,page:Page,slideSize:{widthPt:number,heightPt:number},
 * budget:{used:number},glyph:unknown,textMasks:import('./source-scene-plan').Box[],
 * measurements:ReturnType<typeof import('./source-scene-source-controls').prepareSceneSourceMeasurements>['measurements'],
 * completion:CompletionInput,owners:Plan['regions']}} input */
function completeOpenSceneOwners(input){
 const {image,plan,slideSize,budget,glyph,textMasks,measurements,completion,owners}=input;
 const rejected=/** @type {{id:string,reason:string}[]} */([]);
 const fail=(/** @type {string} */id,/** @type {string} */reason)=>({failure:reason,rejected:[...rejected,{id,reason}]});
 if(!owners.length||owners.length>24)throw new TypeError('Open owner transaction capacity is invalid');
 for(const owner of owners)if(owner.kind!=='container'||owner.nativeGeometry?.kind!=='openPaths'
  ||!plan.regions.includes(owner)||completion.preflight
  ||!plan.observedInventory?.some(o=>o.regionId===owner.id)
  ||plan.relations.some(r=>r.fromId===owner.id||r.toId===owner.id))return fail(owner.id,'open-owner-physical-role');
 const objects=new Map(completion.objects),relations=completion.relations;
 const oldSources=new Map(input.page.shapes.map(shape=>[shape,shape.source]));
 let committed=false;
 try{return withSceneFillRasterScope(image,budget,createSceneFillRasterScope(image,budget),()=>{
  let page={...input.page,shapes:input.page.shapes.slice()};
  const staged=/** @type {Stage[]} */([]);
  for(const owner of owners){
   const foreignFrames=/** @type {Stage['foreignFrames']} */([]);
   for(const unit of [...plan.regions,...plan.objects]){
    if(unit.id===owner.id||!objects.has(unit.id)||!['card','container'].includes(unit.kind))continue;
    const token=measurements.patternFrame(unit.box)??measurements.portFrame(unit.box),box=measuredSceneGroupBounds(image,token);
    if(!box)continue;
    const pattern=plan.regions.some(r=>r.id===unit.id&&r.parentId===owner.id)&&!measuredSceneOpaqueSurface(image,token)
     ?measurements.pattern(unit.box):undefined;
    foreignFrames.push({id:unit.id,token,box,...(pattern?{pattern}:{})});
   }
   const ids=new Set(plan.relations.filter(r=>r.regionId===owner.id).flatMap(r=>relations.get(r.id)??[]));
   const relationParts=page.shapes.filter(s=>!!s.id&&ids.has(s.id));
   const paint=observeOpenScenePaint({image,slideSize,budget,textMasks,
    foreignFrames:foreignFrames.map(({id,token,box})=>({id,token,box})),relationParts,
    recipe:{id:owner.id,box:owner.box,...owner.nativeGeometry,fill:'#FFFFFF',stroke:'#000000',strokeWidthPx:1}});
   if(paint.failure!==null||!paint.parts||!paint.receipt)return fail(owner.id,paint.failure??'open-owner-paint-binding');
   page={...page,shapes:[...paint.parts,...page.shapes]};staged.push({owner,paint:{receipt:paint.receipt,parts:paint.parts},foreignFrames,relationParts});
  }
  const prepared=prepareRegionProgramLabels(page,{...plan,regionPrograms:(plan.regionPrograms??[]).filter(p=>owners.some(o=>o.id===p.regionId))},slideSize);
  if(prepared.evidence.rejected.length)return fail(prepared.evidence.rejected[0]?.regionId??owners[0]?.id??'owner','open-owner-final-labels');
  page=prepared.page;
  /** @param {Stage} stage @param {Page} target @param {{id:string,reason:string}[]} unresolved */
  const inventory=(stage,target,unresolved)=>{
   const members=observeOpenSceneOwnerMembers({image,slideSize,plan,ownerId:stage.owner.id,page:target,
    paintReceipt:stage.paint.receipt,paintParts:stage.paint.parts,...(stage.literalPaint?{literalPaint:stage.literalPaint}:{}),
    objects,relations,unresolved});
   if(!members.membershipComplete)return {failure:members.failure??'open-owner-members-incomplete'};
   const result=observeOpenSceneOwnerInventory({image,plan,page:target,slideSize,budget,glyph,membersReceipt:members.receipt,
    paintReceipt:stage.paint.receipt,paintParts:stage.paint.parts,...(stage.literalPaint?{literalPaint:stage.literalPaint}:{}),
    foreignFrames:stage.foreignFrames,relationParts:stage.relationParts});
   return {...result,memberIds:members.members};
  };
  for(const stage of staged){
   const initial=inventory(stage,page,completion.unresolved);
   if(initial.failure==='open-owner-inventory-unaccounted'&&'unaccountedCells' in initial){
    const proof=retainedOpenScenePaint(image,stage.paint.receipt,stage.paint.parts);
    if(!proof)return fail(stage.owner.id,'open-owner-paint-binding');
    const literal=observeSceneLiteralPaint({id:stage.owner.id,image,window:proof.window,cells:initial.unaccountedCells,budget,slideSize});
    if(literal.failure!==null)return fail(stage.owner.id,literal.failure);
    if(stage.paint.parts.length+literal.parts.length>32)return fail(stage.owner.id,'open-owner-paint-capacity');
    stage.literalPaint={receipt:literal.receipt,parts:literal.parts};page={...page,shapes:[...page.shapes,...literal.parts]};
    const verified=inventory(stage,page,completion.unresolved);if(verified.failure!==null)return fail(stage.owner.id,verified.failure);
   }else if(initial.failure!==null)return fail(stage.owner.id,initial.failure);
   // Registration follows complete source proof, never construction alone.
   objects.set(stage.owner.id,[...stage.paint.parts,...(stage.literalPaint?.parts??[])].map(p=>/** @type {Paint} */(p).id));
  }
  // Only the deliberately deferred open-source obligation can be discharged.
  // Other source/admission failures keep their original verdicts.
  const unresolved=completion.unresolved.filter(f=>!owners.some(o=>o.id===f.id&&f.reason==='native-program-source-evidence'));
  if(unresolved.some(f=>owners.some(o=>o.id===f.id)))return fail(unresolved.find(f=>owners.some(o=>o.id===f.id))?.id??'owner','open-owner-unresolved');
  const completed=completeRegionPrograms({...completion,page,objects,unresolved});
  for(const stage of staged){
   const subtree=new Set([stage.owner.id]);
   for(let round=0;round<plan.regions.length;round++)for(const r of plan.regions)if(r.parentId!==null&&subtree.has(r.parentId))subtree.add(r.id);
   if(completed.evidence.rejected.some(r=>subtree.has(r.regionId)))return fail(stage.owner.id,'open-owner-region-incomplete');
  }
  const receipts=/** @type {unknown[]} */([]),counts=/** @type {unknown[]} */([]),memberIds=new Set();
  for(const stage of staged){
   const final=inventory(stage,completed.page,unresolved);
   if(final.failure!==null)return fail(stage.owner.id,final.failure);
   if(!('receipt' in final)||!final.receipt||!('counts' in final)||!final.counts)return fail(stage.owner.id,'open-owner-final-seal');
   if(!retainedOpenSceneOwnerInventory(image,final.receipt,plan,completed.page))return fail(stage.owner.id,'open-owner-final-seal');
   receipts.push(final.receipt);counts.push({id:stage.owner.id,...final.counts});
   if('memberIds' in final)for(const id of final.memberIds??[])memberIds.add(id);
  }
  const members=new Set([...completed.page.shapes,...completed.page.textBoxes].filter(p=>memberIds.has(p.id)));
  const receipt=Object.freeze({});transactions.set(receipt,{image,plan,page:completed.page,inventories:receipts,members});
  committed=true;
  return {failure:/** @type {null} */(null),receipt,page:completed.page,completed,objects,unresolved,
   evidence:{completed:staged.length,rejected,counts,sourcePixels:budget.used,portsAuthorized:false,opaqueBodyAuthorized:false,erasureAuthorized:false}};
 });}finally{if(!committed)for(const [shape,source]of oldSources){if(source===undefined)delete shape.source;else shape.source=source;}}
}
/** @param {unknown} receipt @param {unknown} page */
function retainedOpenSceneOwnerTransaction(receipt,page){
 const proof=receipt!==null&&typeof receipt==='object'?transactions.get(receipt):undefined;
 if(!proof||!proof.inventories.every(r=>retainedOpenSceneOwnerInventory(proof.image,r,proof.plan,page)))return null;
 return {completed:proof.inventories.length,members:new Set(proof.members),portsAuthorized:false,opaqueBodyAuthorized:false,erasureAuthorized:false};
}
module.exports={completeOpenSceneOwners,retainedOpenSceneOwnerTransaction};
