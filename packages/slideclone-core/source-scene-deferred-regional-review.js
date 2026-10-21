// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {allocateSourceSceneReview,sourceSceneReviewCrop}=require('./source-scene-review-allocation');
const {prepareSceneReviewImages,runPairedSceneReview}=require('./source-scene-local-observations');
const {sourceSceneLocalPrompt}=require('./source-scene-local-prompt');
const {regionalInventoryPrompt,readRegionalInventoryObservations,applyRegionalInventoryReview,applySceneRegionBoundaryReview}=require('./source-scene-regional-inventory');
const {sceneLocalObjectCapacity}=require('./source-scene-object-batches');
const {sceneLocalRelationCapacity}=require('./source-scene-relation-batches');
const {sceneRegionalProgramBindings}=require('./source-scene-program-tasks');
const {reviewDeferredSceneRelations}=require('./source-scene-deferred-relation-review');
const {reviewSceneOwnerRevisions}=require('./source-scene-owner-revision-review');
/** Keep speculative work from consuming a source window that can fit after
 * mandatory scanners finish. Reservations are released only by their actual
 * consumers, never by an allocation estimate or a provider claim.
 * @param {Parameters<typeof allocateSourceSceneReview>[0]} input
 * @param {number} remainingPairs */
function allocateStagedSceneReview(input,remainingPairs){
 if(!Number.isSafeInteger(remainingPairs)||remainingPairs<1||remainingPairs>16)throw new TypeError('Scene remaining review capacity is invalid');
 const allocation=allocateSourceSceneReview(input);
 if(remainingPairs===1||allocation.reservedPixels===0||!allocation.deferred.some(t=>t.role==='region-inventory'))return allocation;
 // The allocator has validated and copied these internal target descriptors.
 const request=/** @type {{width:number,height:number,spentPixels?:number,targets:import('./source-scene-review-allocation').Target[]}} */(input);
 const required=request.targets.filter(t=>!t.optional||t.role==='missing'&&allocation.indices.includes(t.index));
 const first=allocateSourceSceneReview({...request,targets:required});
 if(!first.reservedPixels)return allocation;
 return {...first,focusIndices:[],structureFocusIndices:[],focusPixels:0,
  deferred:request.targets.filter(t=>!first.indices.includes(t.index)).map(t=>({index:t.index,role:t.role,reason:'awaiting-scanner-settlement'}))};
}
/** One additional independent pair for previously unobserved regions. The
 * caller has settled ALL downstream scanners and supplies their actual ledger.
 * Deferred/failed regions remain obligations in the unchanged completion gate.
 * @param {{plan:import('./source-scene-plan').ScenePlan,
 * targets:import('./source-scene-regional-inventory').Target[],image:import('./png').PngImage,
 * budget:{used:number},directory:string,rules:string,
 * observe:(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>,
 * verifySource:()=>void,isCancellationRequested:()=>Promise<boolean>}} input */
async function reviewDeferredSceneRegions(input){
 const {image,budget,observe,verifySource,isCancellationRequested,rules}=input;
 // Missing topology has explicit independent census demand. Preserve that
 // demand before speculative new members when complete windows compete.
 const pending=input.targets.slice().sort((a,b)=>(b.inventoryMissing?.relations??0)-(a.inventoryMissing?.relations??0));
 const allocation=allocateSourceSceneReview({width:image.width,height:image.height,spentPixels:budget.used,
  targets:pending.map(t=>({index:t.index,box:t.box,contextBox:t.contextBox,role:'region-inventory',optional:true,textKnown:false}))});
 const targets=input.targets.filter(t=>allocation.indices.includes(t.index));
 const capacity={objects:targets.some(t=>t.addObjects||!t.programOnly&&!t.boundaryReview&&!t.endpoints?.length)?sceneLocalObjectCapacity(input.plan):0,
  relations:sceneLocalRelationCapacity(input.plan)};
 const evidence={allocation,requestedRegions:input.targets.map(t=>t.regionId),observedRegions:targets.map(t=>t.regionId),providerCalls:0,spentBefore:budget.used,spentAfter:budget.used};
 if(!targets.length)return {plan:input.plan,evidence,added:/** @type {string[]} */([])};
 const directory=path.join(input.directory,'deferred-regions');fs.mkdirSync(directory);
 fs.writeFileSync(path.join(directory,'allocation.json'),JSON.stringify(allocation),{flag:'wx',mode:0o600});
 /** @type {((cancel:()=>Promise<boolean>)=>Promise<{response:unknown,frame:import('./source-scene-missing-text').CropFrame|undefined}>)[]} */const work=[];
 for(const paddingRatio of [0,.7]){
  const cropTargets=targets.map(t=>{
   const cropBox=sourceSceneReviewCrop({...t,role:'region-inventory',optional:true,textKnown:false},paddingRatio,image.width,image.height);
   return {index:t.index,cropBox,candidateBox:{...t.box,x:t.box.x-cropBox.x,y:t.box.y-cropBox.y}};
  });
  const prepared=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:[],structureFocusIndices:allocation.structureFocusIndices??[],
   reservedPixels:0,pixels:budget.used,paddingRatio});budget.used=prepared.pixels;
  /** @type {import('./source-scene-local-response').LocalTargets} */
  const localTargets={reviews:[],missing:[],regionInventories:targets.map(t=>t.index),regionObjectCapacity:capacity.objects,regionRelationCapacity:capacity.relations,
   ...sceneRegionalProgramBindings(targets),
   ...(targets.some(t=>t.boundaryReview)?{regionBoundaryIndices:targets.filter(t=>t.boundaryReview).map(t=>t.index)}:{}),
   ...(targets.some(t=>t.endpoints?.length)?{regionEndpointIds:Object.fromEntries(targets.map(t=>[String(t.index),(t.endpoints??[]).map(e=>e.id)]))}:{})};
  const prompt=sourceSceneLocalPrompt({rules,...(input.plan.relationObservationUnit?{relationObservationUnit:input.plan.relationObservationUnit}:{}),targets:[],missing:[],focused:[],focusedStructures:allocation.structureFocusIndices??[],sheetTargets:prepared.sheetTargets,
   structures:[],inventories:[],relationPrompt:'',regionalPrompt:regionalInventoryPrompt(targets,capacity,prepared.frame),extraKeys:['regionInventoriesByIndex']});
  work.push(async cancel=>({frame:prepared.frame,response:await observe({task:'classify-ocr',localTargets,prompt,images:prepared.images,isCancellationRequested:cancel})}));
 }
 const results=await runPairedSceneReview({work,isCancellationRequested,verifySource});
 const observations=results.map(r=>readRegionalInventoryObservations(r.response,targets,r.frame,capacity));
 const reviewed=applyRegionalInventoryReview(input.plan,targets,observations);
 const boundaries=applySceneRegionBoundaryReview(reviewed.plan,targets,observations);
 evidence.providerCalls=2;evidence.spentAfter=budget.used;
 fs.writeFileSync(path.join(directory,'evidence.json'),JSON.stringify({...evidence,inventory:reviewed.evidence,boundaries:boundaries.evidence,observations}),{flag:'wx',mode:0o600});
 return {plan:boundaries.plan,evidence:{...evidence,inventory:reviewed.evidence,boundaries:boundaries.evidence},added:reviewed.evidence.added};
}
module.exports={allocateStagedSceneReview,reviewDeferredSceneRegions,reviewDeferredSceneRelations,reviewSceneOwnerRevisions};
