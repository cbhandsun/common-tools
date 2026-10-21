// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {allocateSourceSceneReview,sourceSceneReviewCrop}=require('./source-scene-review-allocation');
const {prepareSceneReviewImages,runPairedSceneReview}=require('./source-scene-local-observations');
const {sourceSceneLocalPrompt}=require('./source-scene-local-prompt');
const {readTopologyObservations,applyTopologyReview,topologyReviewPrompt,sceneRelationBatches}=require('./source-scene-topology-review');
/** One bounded pair for existing rejected relation obligations that could not
 * fit the earlier stage. This is not a retry of already observed targets. The
 * same call/pixel/relation ledgers remain owned by the outer job.
 * @param {{plan:import('./source-scene-plan').ScenePlan,
 * targets:import('./source-scene-topology-review').Target[],image:import('./png').PngImage,
 * budget:{used:number},directory:string,rules:string,
 * observe:(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>,
 * verifySource:()=>void,isCancellationRequested:()=>Promise<boolean>}} input */
async function reviewDeferredSceneRelations(input){
 const {plan,image,budget,observe,verifySource,isCancellationRequested,rules}=input;
 sceneRelationBatches(plan);
 const allocation=allocateSourceSceneReview({width:image.width,height:image.height,spentPixels:budget.used,
  targets:input.targets.map(t=>({index:t.index,box:t.box,role:'relation',optional:true,textKnown:false}))});
 const targets=input.targets.filter(t=>allocation.indices.includes(t.index));
 const evidence={allocation,requestedRelations:input.targets.map(t=>t.relationId),observedRelations:targets.map(t=>t.relationId),providerCalls:0,spentBefore:budget.used,spentAfter:budget.used};
 if(!targets.length)return {plan,evidence};
 const directory=path.join(input.directory,'deferred-relations');fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory,'allocation.json'),JSON.stringify(allocation),{flag:'wx',mode:0o600});
 /** @type {((cancel:()=>Promise<boolean>)=>Promise<{response:unknown,frame:import('./source-scene-missing-text').CropFrame|undefined}>)[]} */const work=[];
 for(const paddingRatio of [0,.7]){
  const cropTargets=targets.map(t=>{
   const cropBox=sourceSceneReviewCrop({...t,role:'relation',optional:true,textKnown:false},paddingRatio,image.width,image.height);
   return {index:t.index,cropBox,candidateBox:{...t.box,x:t.box.x-cropBox.x,y:t.box.y-cropBox.y}};
  });
  const prepared=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:[],reservedPixels:0,pixels:budget.used,paddingRatio});budget.used=prepared.pixels;
  /** @type {import('./source-scene-local-response').LocalTargets} */
  const localTargets={reviews:[],missing:[],relations:targets.map(t=>t.index),
   ...(targets.some(t=>t.localization)?{relationLocalizationIndices:targets.filter(t=>t.localization).map(t=>t.index)}:{})};
  const prompt=sourceSceneLocalPrompt({rules,...(plan.relationObservationUnit?{relationObservationUnit:plan.relationObservationUnit}:{}),targets:[],missing:[],focused:[],sheetTargets:prepared.sheetTargets,
   structures:[],inventories:[],relationPrompt:topologyReviewPrompt(targets,prepared.frame),regionalPrompt:'',extraKeys:['relationsByIndex']});
  work.push(async cancel=>({frame:prepared.frame,response:await observe({task:'classify-ocr',localTargets,prompt,images:prepared.images,isCancellationRequested:cancel})}));
 }
 const results=await runPairedSceneReview({work,isCancellationRequested,verifySource});
 const observations=results.map(row=>readTopologyObservations(row.response,targets,row.frame));
 const reviewed=applyTopologyReview(plan,targets,observations);
 evidence.providerCalls=2;evidence.spentAfter=budget.used;
 fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({...evidence,topology:reviewed.evidence,observations}),{flag:'wx',mode:0o600});
 return {plan:reviewed.plan,evidence:{...evidence,topology:reviewed.evidence}};
}
module.exports={reviewDeferredSceneRelations};
