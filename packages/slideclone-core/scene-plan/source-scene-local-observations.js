// @ts-check
"use strict";
const fs=require('node:fs'),path=require('node:path');
const {types}=require('node:util');
const {writePng,cropPng}=require('../png');
const {createSceneCropSheet}=require('./source-scene-crop-sheet');
const {sourceSceneSheetTargets}=require('./source-scene-local-prompt');
const {runPairedSceneReview}=require('./source-scene-paired-review');
const {sourceSceneReviewFocusWindow}=require('./source-scene-review-allocation');
const {reconcileSceneGraphicLabels}=require('./source-scene-regeneration');
const {createSceneObservationBudget}=require('./source-scene-observation-budget');
/** Prepare the exact source views and their shared charge before dispatch.
 * Inputs are internal admitted targets; crop-sheet admission validates geometry.
 * @param {{image:import('../png').PngImage,directory:string,cropTargets:import('./source-scene-crop-sheet').Target[],focusIndices:number[],structureFocusIndices?:number[],reservedPixels:number,pixels:number,paddingRatio:number}} request */
function prepareSceneReviewImages({image,directory,cropTargets,focusIndices,structureFocusIndices=[],reservedPixels,pixels,paddingRatio}){
 if(![pixels,reservedPixels].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=4000000)||![0,.7].includes(paddingRatio))throw new TypeError('Scene review preparation budget is invalid');
 if(!Array.isArray(cropTargets)||types.isProxy(cropTargets)||Object.getPrototypeOf(cropTargets)!==Array.prototype
  ||Reflect.ownKeys(cropTargets).length!==cropTargets.length+1||Object.values(Object.getOwnPropertyDescriptors(cropTargets)).some(p=>!('value'in p)))
  throw new TypeError('Scene review focus targets are invalid');
 // Validate the source frame and target descriptors before inspecting their
 // identities. No provider accessor can execute through the focus lookup.
 const sheet=cropTargets.length?createSceneCropSheet({image,targets:cropTargets}):null;
 const seen=new Set();
 for(const indices of [focusIndices,structureFocusIndices]){
  if(!Array.isArray(indices)||types.isProxy(indices)||Object.getPrototypeOf(indices)!==Array.prototype||indices.length>31
   ||Reflect.ownKeys(indices).length!==indices.length+1||Object.values(Object.getOwnPropertyDescriptors(indices)).some(p=>!('value'in p)))
   throw new TypeError('Scene review focus identities are invalid');
  for(const index of indices){
   if(!Number.isSafeInteger(index)||seen.has(index)||!sheet?.targets.some(t=>t.index===index))throw new TypeError('Scene review focus identities are invalid');
   seen.add(index);
  }
 }
 if(seen.size>31)throw new RangeError('Scene review focus image count exceeds boundary');
 const focusedTargets=cropTargets.filter(t=>seen.has(t.index)).map(target=>{
  if(!structureFocusIndices.includes(target.index))return target;
  const candidate={...target.candidateBox,x:target.candidateBox.x+target.cropBox.x,y:target.candidateBox.y+target.cropBox.y};
  const cropBox=sourceSceneReviewFocusWindow({width:image.width,height:image.height,candidateBox:candidate,cropBox:target.cropBox});
  if(!cropBox)throw new RangeError('Scene review focus window exceeds boundary');
  return {...target,cropBox,candidateBox:{...candidate,x:candidate.x-cropBox.x,y:candidate.y-cropBox.y}};
 });
 if(focusedTargets.some(t=>t.cropBox.w*t.cropBox.h>262144))throw new RangeError('Scene review focus window exceeds boundary');
 if(pixels+reservedPixels+(sheet?.pixels??0)+focusedTargets.reduce((sum,t)=>sum+t.cropBox.w*t.cropBox.h,0)>4000000)
  throw new RangeError('Scene crop pixel budget exceeded');
 /** @type {{bytes:Buffer,label:string}[]} */const images=[];
 /** @type {import("./source-scene-missing-text").CropFrame|undefined} */let frame;
 /** @type {{index:number,cropBox2D:number[],candidateBox2D:number[]}[]} */let sheetTargets=[];
 if(sheet){
   frame={width:sheet.image.width,height:sheet.image.height,sourceTargets:cropTargets,sheetTargets:sheet.targets};
   pixels+=sheet.pixels;
   if(pixels>4000000)throw new RangeError("Scene crop pixel budget exceeded");
   const file=path.join(directory,`sheet-${paddingRatio}.png`);writePng(file,sheet.image);
   images.push({bytes:fs.readFileSync(file),label:"Original source crop sheet, no scaling; overlapping target windows share context; indices appear above each shared tile"});
   sheetTargets=sourceSceneSheetTargets(sheet);
   fs.writeFileSync(path.join(directory,`sheet-${paddingRatio}-mapping.json`),`${JSON.stringify({width:sheet.image.width,height:sheet.image.height,coordinateSpace:"normalized-1000",boxFormat:"ymin-xmin-ymax-xmax",targets:sheetTargets,sourceTargets:cropTargets,sheetTargets:sheet.targets})}\n`,{flag:"wx",mode:0o600});
 }
 for(const target of focusedTargets){
   const focused=cropPng(image,target.cropBox);pixels+=focused.width*focused.height;
   if(pixels+reservedPixels>4000000)throw new RangeError("Scene crop pixel budget exceeded");
   const file=path.join(directory,`focus-${paddingRatio}-${target.index}.png`);writePng(file,focused);
   const role=structureFocusIndices.includes(target.index)?'structural':'OCR';
   const action=role==='OCR'?'Classify ONLY candidate rectangle':'Inspect the proposed physical unit near candidate rectangle; use the complete source context to correct a misplaced envelope';
   images.push({bytes:fs.readFileSync(file),label: `Original context for ${role} index ${target.index}; image ${focused.width} by ${focused.height} pixels. ${action} ${JSON.stringify(target.candidateBox)} in LOCAL PIXELS. Neighboring text is context. Structure/glyph boxes still use the FIRST atlas frame.`});
 }
 return {images,frame,sheetTargets,pixels};
}
module.exports={prepareSceneReviewImages,runPairedSceneReview,reconcileSceneGraphicLabels,createSceneObservationBudget};
