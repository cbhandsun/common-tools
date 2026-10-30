// @ts-check
'use strict';
const path=require('node:path');
const {readPngBuffer,writePng}=require('../png');
const {record,list,snapshot,fingerprint,absolutePath}=require('./approved-frame-application-input');
const {digest,readFile,assetFile,workspace,createStaging,removeStaging}=require('./approved-frame-application-files');
const {parseApprovedBackdropPixels,backdropImageFingerprint,backdropPageFingerprint}=require('./approved-backdrop-pixel-input');
const {chargeApprovedBackdropChecks,approvedBackdropBudget}=require('./approved-backdrop-budget');
const {patchApprovedBackdropPixels}=require('./approved-backdrop-pixel-patch');
const {issueApprovedFrameApplication}=require('./approved-frame-application-lifecycle');
/** @param {Record<string,unknown>} value @param {string} key */
function writable(value,key){const d=Object.getOwnPropertyDescriptor(value,key);if(d?d.writable!==true:!Object.isExtensible(value))throw new TypeError('approved-backdrop-output-readonly');}
/** @param {unknown} value */
async function cancellation(value){
 if(typeof value!=='function')throw new TypeError('approved-backdrop-cancellation-invalid');let cancelled;
 try{cancelled=await value();}catch{throw new Error('approved-backdrop-cancellation-unavailable');}
 if(typeof cancelled!=='boolean')throw new TypeError('approved-backdrop-cancellation-invalid');
 if(cancelled)throw new Error('approved-backdrop-cancelled');
}
/** @param {Buffer} bytes */
function decode(bytes){try{return readPngBuffer(bytes);}catch{throw new TypeError('approved-backdrop-png-invalid');}}
/** Installed only by trusted host composition after approval of this manifest.
 * Returns the same private transaction receipt as other approved applications,
 * so failed later applications and the final seal roll back files and fields.
 * @param {unknown} input */
function createApprovedBackdropPixelApplication(input){
 const review=parseApprovedBackdropPixels(input);
 return async(/** @type {unknown} */ context)=>{
  const data=record(context),deck=record(data.deck),pages=list(deck.pages,1),page=record(pages[0]);
  if(pages.length!==1)throw new TypeError('approved-backdrop-page-invalid');
  const before=snapshot(deck),oldImages=page.images,images=list(oldImages,10000),oldMeta=deck.meta,hadMeta=Object.hasOwn(deck,'meta'),oldPages=deck.pages;
  writable(page,'images');writable(deck,'meta');
  if(oldMeta!==undefined&&record(oldMeta).approvedRouteBackdrop!==undefined)throw new TypeError('approved-backdrop-already-applied');
  const {root,assets}=workspace(data.root),sourceFile=assetFile(root,path.relative(root,absolutePath(data.sourceFile)));
  const sourceBytes=readFile(sourceFile,128*1024*1024),source=decode(sourceBytes);
  if(digest(sourceBytes)!==review.source.sha256||source.width!==review.source.width||source.height!==review.source.height)throw new TypeError('approved-backdrop-source-binding');
  if(backdropPageFingerprint(deck,page)!==review.pageFingerprint)throw new TypeError('approved-backdrop-page-binding');
  const slide=record(deck.slideSize);
  if(![slide.widthPt,slide.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))throw new TypeError('approved-backdrop-slide-invalid');
  const sx=source.width/Number(slide.widthPt),sy=source.height/Number(slide.heightPt),applied=new Set();
  const strict=fingerprint({source:page.source,compilation:oldMeta===undefined?undefined:record(oldMeta).sourceSceneCompilation});
  const budgetBefore=approvedBackdropBudget();chargeApprovedBackdropChecks(review.validationChecks);let decodedPixels=0;
  const pending=review.assets.map(row=>{
   const members=images.filter(item=>record(item).id===row.imageId);if(members.length!==1)throw new TypeError('approved-backdrop-member-binding');
   const image=record(members[0]),style=image.style===undefined?undefined:record(image.style);
   if(style?.assetPath!==undefined&&style.assetPath!==image.assetPath)throw new TypeError('approved-backdrop-asset-alias-conflict');
   if(backdropImageFingerprint(image)!==row.imageFingerprint)throw new TypeError('approved-backdrop-member-binding');
   const file=assetFile(root,image.assetPath),bytes=readFile(file);
   if(digest(bytes)!==row.beforeSha256)throw new TypeError('approved-backdrop-asset-binding');
   const raster=decode(bytes);decodedPixels+=raster.width*raster.height;
   if(decodedPixels>40000000)throw new RangeError('approved-backdrop-assets-pixel-budget');
   const box=record(image.box),values=[Number(box.x)*sx,Number(box.y)*sy,Number(box.w)*sx,Number(box.h)*sy];
   if(![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))||values.some(n=>Math.abs(n-Math.round(n))>.02)
    ||Number(values[0])<0||Number(values[1])<0||Number(values[0])+raster.width>source.width||Number(values[1])+raster.height>source.height
    ||Math.abs(Number(values[2])-raster.width)>.02||Math.abs(Number(values[3])-raster.height)>.02)throw new TypeError('approved-backdrop-registration-invalid');
   const patch=patchApprovedBackdropPixels(raster,{x:Math.round(Number(values[0])),y:Math.round(Number(values[1]))},review);
   if(!patch.cells.length)throw new TypeError('approved-backdrop-asset-no-targets');
   for(const cell of patch.cells)applied.add(cell);
   return {row,image,file,patch};
  });
  if(applied.size!==review.pixels.length)throw new TypeError('approved-backdrop-targets-incomplete');
  const unchanged=()=>deck.pages===oldPages&&list(deck.pages,1)[0]===page&&page.images===oldImages&&deck.meta===oldMeta&&snapshot(deck)===before;
  await cancellation(data.isCancellationRequested);if(!unchanged())throw new TypeError('approved-backdrop-page-changed');
  const directory=createStaging(assets);let published=false,retained=false;
  try{
   const deltas=pending.map(item=>{
    const output=path.join(directory,item.row.imageId+'.png');
    try{writePng(output,item.patch.image);}catch{throw new Error('approved-backdrop-write-failed');}
    const afterSha256=digest(readFile(output));
    return {...item,assetPath:path.relative(root,output).replaceAll('\\','/'),afterSha256};
   });
   await cancellation(data.isCancellationRequested);
   if(!unchanged())throw new TypeError('approved-backdrop-page-changed');
   if(digest(readFile(sourceFile,128*1024*1024))!==review.source.sha256)throw new TypeError('approved-backdrop-source-binding');
   for(const item of deltas){
    if(digest(readFile(item.file))!==item.row.beforeSha256)throw new TypeError('approved-backdrop-asset-binding');
    if(digest(readFile(assetFile(root,item.assetPath)))!==item.afterSha256)throw new TypeError('approved-backdrop-staged-binding');
   }
   writable(page,'images');writable(deck,'meta');
   const nextImages=images.map(value=>{
    const delta=deltas.find(item=>item.image===value);if(!delta)return value;
    const image=record(value),style=image.style===undefined?undefined:record(image.style);
    return {...image,assetPath:delta.assetPath,...(style?.assetPath===undefined?{}:{style:{...style,assetPath:delta.assetPath}})};
   });
   const report={policy:'approved-transparent-route-backdrop-pixels-v1',approvalId:review.approvalId,sourceSha256:review.source.sha256,
    scopeFingerprint:review.scopeFingerprint,pageFingerprint:review.pageFingerprint,uniqueSourcePixels:applied.size,
    sourceInterpolationPixels:review.pixels.filter(p=>p.kind==='source-interpolation').length,neighborInferencePixels:review.pixels.filter(p=>p.kind==='neighbor-inference').length,
    changedAssetPixels:deltas.reduce((sum,item)=>sum+item.patch.cells.length,0),
    assets:deltas.map(item=>({imageId:item.row.imageId,beforeSha256:item.row.beforeSha256,afterSha256:item.afterSha256,changedPixels:item.patch.cells.length})),
    budget:{...approvedBackdropBudget(),checksBeforeApplication:budgetBefore.totalChecks},
    strictBaselineUnchanged:true,strictMeasurement:false,sourceFootprint:false,sourceErasure:false,originalAssetsPreserved:true,
    inferredColorsRecomputed:false,wholeProductAcceptance:false,noGhostVerified:false,appliedBeforeFinalSeal:true};
   if(fingerprint({source:page.source,compilation:oldMeta===undefined?undefined:record(oldMeta).sourceSceneCompilation})!==strict)throw new TypeError('approved-backdrop-strict-changed');
   page.images=nextImages;deck.meta={...(oldMeta===undefined?{}:record(oldMeta)),approvedRouteBackdrop:report};published=true;
   // Receipt consumption closes a successful transaction. Do not disable
   // rollback before every sibling commit has succeeded.
   return issueApprovedFrameApplication(context,{commit(){},rollback(){
    if(retained)return;page.images=oldImages;if(hadMeta)deck.meta=oldMeta;else delete deck.meta;
    removeStaging(assets,directory);retained=true;
   }});
  }catch(error){
   try{if(published){page.images=oldImages;if(hadMeta)deck.meta=oldMeta;else delete deck.meta;}removeStaging(assets,directory);}
   catch{throw new AggregateError([error],'approved-backdrop-rollback-failed');}throw error;
  }
 };
}
module.exports={createApprovedBackdropPixelApplication};
