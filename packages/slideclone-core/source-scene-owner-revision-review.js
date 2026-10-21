// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {selectSceneOwnerRevisions,applySceneOwnerRevisions}=require('./source-scene-owner-revision');
const {allocateSourceSceneReview,sourceSceneReviewCrop}=require('./source-scene-review-allocation');
const {prepareSceneReviewImages,runPairedSceneReview}=require('./source-scene-local-observations');
const {readRegionalInventoryObservations}=require('./source-scene-regional-inventory');
const {sourceBox2D}=require('./source-scene-coordinate-frame');
/** One separately charged, source-bound revision pair. It reuses the regional
 * wire format, but observes a COMPLETE icon census, including existing members.
 * The ordinary new-object merger never consumes these observations.
 * @param {{plan:import('./source-scene-plan').ScenePlan,image:import('./png').PngImage,budget:{used:number},directory:string,rules:string,
 * observe:(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>,verifySource:()=>void,isCancellationRequested:()=>Promise<boolean>}} input */
async function reviewSceneOwnerRevisions(input){
 const {plan,image,budget,observe,verifySource,isCancellationRequested,rules}=input;
 const proposed=selectSceneOwnerRevisions(plan);
 if(image.width!==plan.widthPx||image.height!==plan.heightPx||typeof rules!=='string')throw new TypeError('Scene owner revision source is invalid');
 const allocation=allocateSourceSceneReview({width:image.width,height:image.height,spentPixels:budget.used,
  targets:proposed.map(target=>({...target,role:'region-inventory',optional:true,textKnown:false}))});
 const targets=proposed.filter(target=>allocation.indices.includes(target.index));
 const evidence={requested:proposed.length,observed:targets.length,providerCalls:0,spentBefore:budget.used,spentAfter:budget.used,allocation};
 if(!targets.length)return {plan,evidence};
 const directory=path.join(input.directory,'owner-revision');fs.mkdirSync(directory);
 const capacity={objects:targets.reduce((sum,target)=>sum+target.iconIds.length,0),relations:0};
 /** @type {import('./source-scene-local-response').LocalTargets} */
 const localTargets={reviews:[],missing:[],regionInventories:targets.map(target=>target.index),regionObjectCapacity:capacity.objects,regionRelationCapacity:0};
 /** @type {((cancel:()=>Promise<boolean>)=>Promise<{response:unknown,frame:import('./source-scene-missing-text').CropFrame|undefined}>)[]} */const work=[];
 for(const paddingRatio of [0,.7]){
  const cropTargets=targets.map(target=>{
   const cropBox=sourceSceneReviewCrop({...target,role:'region-inventory',optional:true,textKnown:false},paddingRatio,image.width,image.height);
   return {index:target.index,cropBox,candidateBox:{...target.box,x:target.box.x-cropBox.x,y:target.box.y-cropBox.y}};
  });
  const prepared=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:[],reservedPixels:0,pixels:budget.used,paddingRatio});budget.used=prepared.pixels;
  const bindings=targets.map(target=>{
   const source=prepared.frame?.sourceTargets.find(row=>row.index===target.index),sheet=prepared.frame?.sheetTargets.find(row=>row.index===target.index);
   if(!source||!sheet||!prepared.frame)throw new TypeError('Scene owner revision atlas is invalid');
   const frame=prepared.frame;
   return {index:target.index,expectedIcons:target.iconIds.length,missingMemberId:target.objectId,
    candidateBox2D:sourceBox2D({...target.box,x:target.box.x-source.cropBox.x+sheet.cropBox.x,y:target.box.y-source.cropBox.y+sheet.cropBox.y},frame),
    existingIcons:plan.objects.filter(object=>target.iconIds.includes(object.id)&&object.id!==target.objectId).map(object=>({id:object.id,
     box_2d:sourceBox2D({...object.box,x:object.box.x-source.cropBox.x+sheet.cropBox.x,y:object.box.y-source.cropBox.y+sheet.cropBox.y},frame)}))};
  });
  const prompt=`${rules} COMPLETE OWNER ICON CENSUS FOR SOURCE REVISION. The old missing-member location is invalid and is intentionally not supplied. Inspect ALL icons inside each candidateBox2D, INCLUDING the existingIcons. Return every complete pictorial icon as one unit, not its separate strokes or enclosing container. Text, bullets, card borders and containers are not icons. Existing boxes and counts are hypotheses, never permission to invent missing artwork. If a complete unique census is not visible, return units:[] for that index. All box_2d coordinates use the FIRST atlas normalized 0-1000 [ymin,xmin,ymax,xmax] frame; preserve whole component extents, never include neighboring text. Reply with reviewsByIndex:{}, recoveredByIndex:{}, regionInventoriesByIndex keyed by each exact index, with {units:[{kind:'icon',confidence:0.99,box_2d:[ymin,xmin,ymax,xmax],nativeGeometry:null}],relations:[]}. No relations, text or new IDs. Bindings: ${JSON.stringify(bindings)}`;
  work.push(async cancel=>({frame:prepared.frame,response:await observe({task:'classify-ocr',localTargets,prompt,images:prepared.images,isCancellationRequested:cancel})}));
 }
 const results=await runPairedSceneReview({work,isCancellationRequested,verifySource});
 const observations=results.map(result=>readRegionalInventoryObservations(result.response,targets,result.frame,capacity));
 const revised=applySceneOwnerRevisions(plan,targets,observations);
 evidence.providerCalls=2;evidence.spentAfter=budget.used;
 fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({...evidence,targets,observations,revision:revised.evidence}),{flag:'wx',mode:0o600});
 return {plan:revised.plan,evidence:{...evidence,revision:revised.evidence}};
}
module.exports={reviewSceneOwnerRevisions};
