// @ts-check
'use strict';
const fs=require('node:fs'),path=require('node:path'),{types}=require('node:util');
const {allocateSourceSceneReview,sourceSceneReviewCrop}=require('./source-scene-review-allocation');
const {prepareSceneReviewImages,runPairedSceneReview}=require('./source-scene-local-observations');
const {sourceSceneLocalPrompt}=require('./source-scene-local-prompt');
const {parseSceneReviews,applySourceSceneReview}=require('./source-scene-review');
const {admitOcrResult}=require('../ocr/ocr-result-admission');
/** @typedef {{targets:number[],local:unknown,context:unknown}} Batch */
/** Complete overflow OCR batches before the final mixed structural batch.
 * Original OCR indices never move. Every batch has its own two source views,
 * and all sheets, focused views and downstream reserves share one pixel cap.
 * @param {{targets:number[],missingCount:number,lines:readonly import('../ocr/ocr-result-admission').OcrLine[],
 * image:import('../png').PngImage,directory:string,contexts:Map<number,import('./source-scene-plan').Box|undefined>,
 * rules:string,sourceHash:string,observe:(request:import('./source-scene-planner').VisionRequest)=>Promise<unknown>,
 * isCancellationRequested:()=>Promise<boolean>,verifySource:()=>void}} input */
async function reviewSceneOcrBatches(input){
 const {image,lines,contexts,observe,isCancellationRequested,verifySource,rules}=input;
 const remaining=input.targets.slice();
 /** @type {Batch[]} */const batches=[];
 /** @type {ReturnType<typeof allocateSourceSceneReview>[]} */const allocations=[];
 let pixels=0,reservedPixels=0;
 while(remaining.length+input.missingCount>32){
  const targets=remaining.splice(0,32);
  if(!targets.length||batches.length>=15)throw new RangeError('Scene OCR batch capacity exceeded');
  if(await isCancellationRequested())throw new Error('editable job was cancelled');
  verifySource();
  const directory=path.join(input.directory,`ocr-batch-${String(batches.length+1).padStart(2,'0')}`);fs.mkdirSync(directory);
  const allocation=allocateSourceSceneReview({width:image.width,height:image.height,spentPixels:pixels+reservedPixels,
   targets:targets.map(index=>({index,box:lines[index]?.box,contextBox:contexts.get(index),role:'review',optional:false,textKnown:false}))});
  reservedPixels+=allocation.reservedPixels;
  fs.writeFileSync(path.join(directory,'allocation.json'),JSON.stringify(allocation),{flag:'wx',mode:0o600});
  /** @type {((cancel:()=>Promise<boolean>)=>Promise<unknown>)[]} */const work=[];
  for(const paddingRatio of [0,.7]){
   const cropTargets=targets.map(index=>{
    const line=lines[index];if(!line)throw new TypeError('Scene batch OCR reference is invalid');
    const cropBox=sourceSceneReviewCrop({index,box:line.box,contextBox:contexts.get(index),role:'review',optional:false,textKnown:false},paddingRatio,image.width,image.height);
    return {index,cropBox,candidateBox:{...line.box,x:line.box.x-cropBox.x,y:line.box.y-cropBox.y}};
   });
   const prepared=prepareSceneReviewImages({image,directory,cropTargets,focusIndices:allocation.focusIndices??[],reservedPixels,pixels,paddingRatio});
   pixels=prepared.pixels;
   const prompt=sourceSceneLocalPrompt({rules,targets,missing:[],focused:allocation.focusIndices??[],sheetTargets:prepared.sheetTargets,
    structures:[],inventories:[],relationPrompt:'',regionalPrompt:'',extraKeys:[]});
   work.push(cancel=>observe({task:'classify-ocr',images:prepared.images,prompt,localTargets:{reviews:targets,missing:[]},isCancellationRequested:cancel}));
  }
  const [local,context]=await runPairedSceneReview({work,isCancellationRequested,verifySource});
  // Validate exact crop bindings now; a bad batch cannot dispatch another one.
  const observations=[];
  for(const response of [local,context]){
   const reviews=parseSceneReviews(response,lines.length);
   if(reviews.length!==targets.length||reviews.some(row=>!targets.includes(row.index)))throw new TypeError('Scene batch crop binding is invalid');
   observations.push({sourceHash:input.sourceHash,reviews});
  }
  batches.push({targets,local:observations[0],context:observations[1]});allocations.push(allocation);
 }
 return {targets:remaining,batches,allocations,pixels,reservedPixels};
}
/** Merge only a disjoint, exhaustive partition of the original required set.
 * Run the existing two-observation admission separately on every original OCR
 * frame; do not let removal in an earlier batch renumber a later batch.
 * @param {{ocr:unknown,dimensions:unknown,sourceHash:string,global:unknown,batches:Batch[]}} input */
function applyBatchedSceneReview(input){
 const {batches}=input;
 if(!Array.isArray(batches)||types.isProxy(batches)||Object.getPrototypeOf(batches)!==Array.prototype
  ||batches.length<1||batches.length>16||Reflect.ownKeys(batches).length!==batches.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(batches)).some(p=>!('value'in p)))throw new TypeError('Scene review batches are invalid');
 const ocr=admitOcrResult(input.ocr,input.dimensions);
 const global=parseSceneReviews(input.global,ocr.lines.length),required=global.filter(row=>row.kind!=='text').map(row=>row.index);
 const results=batches.map(batch=>{
  if(!batch||typeof batch!=='object'||types.isProxy(batch)||Object.values(Object.getOwnPropertyDescriptors(batch)).some(p=>!('value'in p)))throw new TypeError('Scene review batch is invalid');
  if(!Array.isArray(batch.targets)||types.isProxy(batch.targets)||Object.getPrototypeOf(batch.targets)!==Array.prototype
   ||Reflect.ownKeys(batch.targets).length!==batch.targets.length+1
   ||Object.values(Object.getOwnPropertyDescriptors(batch.targets)).some(p=>!('value'in p)))throw new TypeError('Scene review batch targets are invalid');
  return applySourceSceneReview({...input,targets:batch.targets,local:batch.local,context:batch.context});
 });
 const targets=batches.flatMap(batch=>batch.targets);
 if(new Set(targets).size!==targets.length||targets.length!==required.length||required.some(index=>!targets.includes(index)))
  throw new TypeError('Scene review batch partition is incomplete');
 const rejectedOcr=results.flatMap(result=>result.evidence.rejectedOcr).sort((a,b)=>a.index-b.index),removed=new Set(rejectedOcr.map(row=>row.index));
 return {ocr:{lines:ocr.lines.filter((_,index)=>!removed.has(index))},evidence:{version:1,sourceHash:input.sourceHash,proposed:required.length,
  reviewed:targets.length,rejectedOcr,retainedAfterLocalReview:targets.filter(index=>!removed.has(index)).sort((a,b)=>a-b)}};
}
module.exports={reviewSceneOcrBatches,applyBatchedSceneReview};
