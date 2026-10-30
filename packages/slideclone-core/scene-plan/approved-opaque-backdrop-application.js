// @ts-check
'use strict';
const path=require('node:path');
const {record,list,snapshot,absolutePath}=require('./approved-frame-application-input');
const {assetFile,readFile,digest,workspace,createStaging,removeStaging}=require('./approved-frame-application-files');
const {readPngBuffer,writePng}=require('../png');
const {backdropImageFingerprint}=require('./approved-backdrop-pixel-input');
const {parseApprovedOpaqueBackdrop,opaqueBackdropDrawingFingerprint}=require('./approved-opaque-backdrop-input');
const {chargeApprovedBackdropChecks,approvedBackdropBudget}=require('./approved-backdrop-budget');
const {issueApprovedFrameApplication}=require('./approved-frame-application-lifecycle');
/** @param {Record<string,unknown>} item @param {string} key */
function writable(item,key){const d=Object.getOwnPropertyDescriptor(item,key);if(d?d.writable!==true:!Object.isExtensible(item))throw new TypeError('approved-opaque-output-readonly');}
/** @param {Buffer} bytes */
function decode(bytes){try{return readPngBuffer(bytes);}catch{throw new TypeError('approved-opaque-png-invalid');}}
/** @param {unknown} callback */
async function cancellation(callback){
 if(typeof callback!=='function')throw new TypeError('approved-opaque-cancellation-invalid');let value;
 try{value=await callback();}catch{throw new Error('approved-opaque-cancellation-unavailable');}
 if(typeof value!=='boolean')throw new TypeError('approved-opaque-cancellation-invalid');
 if(value)throw new Error('approved-opaque-cancelled');
}
/** Replace only one fully registered asset at the exact reviewed opaque RGBA
 * cells. The original shared budget, race checks, and sibling/final-seal
 * rollback remain mandatory. A serialized report never installs this service.
 * @param {unknown} input */
function createApprovedOpaqueBackdropApplication(input){
 const review=parseApprovedOpaqueBackdrop(input);
 return async(/** @type {unknown} */context)=>{
  const data=record(context),deck=record(data.deck),pages=list(deck.pages,1),page=record(pages[0]);
  if(pages.length!==1)throw new TypeError('approved-opaque-page-invalid');
  const oldPages=deck.pages,oldImages=page.images,images=list(oldImages,10000),oldMeta=deck.meta,hadMeta=Object.hasOwn(deck,'meta'),before=snapshot(deck);
  if(oldMeta!==undefined&&record(oldMeta).approvedOpaqueRouteBackdrop!==undefined)throw new TypeError('approved-opaque-already-applied');
  writable(page,'images');writable(deck,'meta');
  const {root,assets}=workspace(data.root),sourceFile=assetFile(root,path.relative(root,absolutePath(data.sourceFile)));
  const sourceBytes=readFile(sourceFile,128*1024*1024),source=decode(sourceBytes);
  if(digest(sourceBytes)!==review.source.sha256||source.width!==review.source.width||source.height!==review.source.height)throw new TypeError('approved-opaque-source-binding');
  if(opaqueBackdropDrawingFingerprint(deck,page)!==review.drawingFingerprint)throw new TypeError('approved-opaque-drawing-binding');
  const matches=images.filter(value=>record(value).id===review.asset.imageId);
  if(matches.length!==1)throw new TypeError('approved-opaque-member-binding');
  const image=record(matches[0]),style=image.style===undefined?{}:record(image.style),box=record(image.box),slide=record(deck.slideSize);
  if(backdropImageFingerprint(image)!==review.asset.imageFingerprint)throw new TypeError('approved-opaque-member-binding');
  if(Object.keys(style).some(key=>!['opacity','assetPath','strategy'].includes(key))||(style.opacity??1)!==1
   ||style.assetPath!==undefined&&style.assetPath!==image.assetPath||(image.rotation??0)!==0
   ||![slide.widthPt,slide.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
   ||box.x!==0||box.y!==0||box.w!==slide.widthPt||box.h!==slide.heightPt)throw new TypeError('approved-opaque-registration');
  const file=assetFile(root,image.assetPath),bytes=readFile(file),raster=decode(bytes);
  if(digest(bytes)!==review.asset.beforeSha256)throw new TypeError('approved-opaque-asset-binding');
  if(raster.width!==source.width||raster.height!==source.height)throw new TypeError('approved-opaque-registration');
  const budgetBefore=approvedBackdropBudget();chargeApprovedBackdropChecks(review.validationChecks);
  const next={width:raster.width,height:raster.height,rgba:Buffer.from(raster.rgba)};
  for(const pixel of review.pixels){
   const n=pixel.cell*4;chargeApprovedBackdropChecks(7);
   if(pixel.before.some((value,i)=>raster.rgba[n+i]!==value))throw new TypeError('approved-opaque-target-binding');
   pixel.color.forEach((value,i)=>{next.rgba[n+i]=value;});
  }
  const unchanged=()=>deck.pages===oldPages&&list(deck.pages,1)[0]===page&&page.images===oldImages&&deck.meta===oldMeta&&snapshot(deck)===before;
  await cancellation(data.isCancellationRequested);if(!unchanged())throw new TypeError('approved-opaque-page-changed');
  const directory=createStaging(assets);let published=false,retained=false;
  try{
   const output=path.join(directory,review.asset.imageId+'.png');
   try{writePng(output,next);}catch{throw new Error('approved-opaque-write-failed');}
   const afterSha256=digest(readFile(output));
   await cancellation(data.isCancellationRequested);if(!unchanged())throw new TypeError('approved-opaque-page-changed');
   if(digest(readFile(sourceFile,128*1024*1024))!==review.source.sha256)throw new TypeError('approved-opaque-source-binding');
   if(digest(readFile(file))!==review.asset.beforeSha256)throw new TypeError('approved-opaque-asset-binding');
   if(digest(readFile(output))!==afterSha256)throw new TypeError('approved-opaque-staged-binding');
   writable(page,'images');writable(deck,'meta');
   const assetPath=path.relative(root,output).replaceAll('\\','/');
   page.images=images.map(value=>value===image?{...image,assetPath,...(style.assetPath===undefined?{}:{style:{...style,assetPath}})}:value);
   const report={policy:'approved-exact-opaque-backdrop-v1',approvalId:review.approvalId,sourceSha256:review.source.sha256,
    imageId:review.asset.imageId,scopeFingerprint:review.scopeFingerprint,uniqueSourcePixels:review.pixels.length,
    protectedSourcePixels:review.protectedCells.length,beforeSha256:review.asset.beforeSha256,afterSha256,
    budget:{...approvedBackdropBudget(),checksBeforeApplication:budgetBefore.totalChecks},approximation:true,
    strictMeasurement:false,sourceOwnership:false,wholeProductAcceptance:false,noGhostVerified:false,
    originalAssetsPreserved:true,inferredColorsRecomputed:false,appliedBeforeFinalSeal:true};
   deck.meta={...(oldMeta===undefined?{}:record(oldMeta)),approvedOpaqueRouteBackdrop:report};published=true;
   return issueApprovedFrameApplication(context,{commit(){},rollback(){
    if(retained)return;page.images=oldImages;if(hadMeta)deck.meta=oldMeta;else delete deck.meta;
    removeStaging(assets,directory);retained=true;
   }});
  }catch(error){
   try{if(published){page.images=oldImages;if(hadMeta)deck.meta=oldMeta;else delete deck.meta;}removeStaging(assets,directory);}
   catch{throw new AggregateError([error],'approved-opaque-rollback-failed');}throw error;
  }
 };
}
module.exports={createApprovedOpaqueBackdropApplication};
