// @ts-check
'use strict';
const {record,list,snapshot,fingerprint}=require('./approved-frame-application-input');
const {assetFile,readFile,digest,workspace}=require('./approved-frame-application-files');
const {readPngBuffer}=require('../png');
const {parseApprovedBackdropPixels,backdropPageFingerprint,backdropImageFingerprint}=require('./approved-backdrop-pixel-input');
const {chargeApprovedBackdropChecks}=require('./approved-backdrop-budget');
const {createApprovedBackdropPixelApplication}=require('./approved-backdrop-pixel-application');

/** Source annotations and transaction-local paths do not change a crop's
 * drawing registration. Every other image field, including crop/opacity/order
 * fields, must retain the originally reviewed value.
 * @param {Record<string,unknown>} image */
function drawing(image){
 const result={...image};delete result.source;delete result.assetPath;
 if(image.style!==undefined){const style={...record(image.style)};delete style.assetPath;result.style=style;}
 return result;
}
/** @param {Buffer} bytes */
function decode(bytes){try{return readPngBuffer(bytes);}catch{throw new TypeError('approved-backdrop-replay-png-invalid');}}
/** @param {Record<string,unknown>} image @param {import('../png').PngImage} raster
 * @param {{width:number,height:number}} source @param {Record<string,unknown>} slide */
function registration(image,raster,source,slide){
 const box=record(image.box),sx=source.width/Number(slide.widthPt),sy=source.height/Number(slide.heightPt);
 const values=[Number(box.x)*sx,Number(box.y)*sy,Number(box.w)*sx,Number(box.h)*sy];
 if(![slide.widthPt,slide.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n))
  ||values.some(n=>!Number.isFinite(n)||Math.abs(n-Math.round(n))>.02)
  ||Number(values[0])<0||Number(values[1])<0||Number(values[0])+raster.width>source.width
  ||Number(values[1])+raster.height>source.height||Math.abs(Number(values[2])-raster.width)>.02
  ||Math.abs(Number(values[3])-raster.height)>.02)throw new TypeError('approved-backdrop-replay-registration');
 return {x:Math.round(Number(values[0])),y:Math.round(Number(values[1]))};
}
/** Replay an already approved sparse patch after unrelated source-backed
 * reconstruction changes. Trusted host injection is still required; job
 * metadata cannot install this service. The original complete review and all
 * original asset bytes must validate. Drawing registration stays identical,
 * and every proposed RGBA write must target the very same transparent bytes.
 * No new colors, coordinates, inference, source erasure or acceptance rights.
 * The ordinary application retains its race checks, budget and atomic rollback.
 * @param {unknown} input @param {unknown} ancestorInput */
function createApprovedBackdropPixelReplay(input,ancestorInput){
 const review=parseApprovedBackdropPixels(input),ancestor=record(ancestorInput);
 const root=workspace(ancestor.root).root;
 const oldDeck=record(JSON.parse(snapshot(ancestor.deck))),oldPages=list(oldDeck.pages,1),oldPage=record(oldPages[0]);
 if(oldPages.length!==1||backdropPageFingerprint(oldDeck,oldPage)!==review.pageFingerprint)
  throw new TypeError('approved-backdrop-replay-original-page-binding');
 const oldImages=list(oldPage.images,10000).map(record),slide=record(oldDeck.slideSize);
 const originals=review.assets.map(row=>{
  const matches=oldImages.filter(image=>image.id===row.imageId);
  if(matches.length!==1||backdropImageFingerprint(matches[0])!==row.imageFingerprint)
   throw new TypeError('approved-backdrop-replay-original-member-binding');
  const image=matches[0];if(!image)throw new TypeError('approved-backdrop-replay-original-member-binding');
  return {row,image,file:assetFile(root,image.assetPath)};
 });
 return async(/** @type {unknown} */ context)=>{
  const data=record(context),deck=record(data.deck),pages=list(deck.pages,1),page=record(pages[0]);
  if(pages.length!==1||fingerprint(deck.slideSize)!==fingerprint(oldDeck.slideSize))
   throw new TypeError('approved-backdrop-replay-slide-binding');
  const currentRoot=workspace(data.root).root,images=list(page.images,10000).map(record);
  const covered=new Set();let decoded=0,totalTargets=0;
  chargeApprovedBackdropChecks(review.validationChecks);
  const assets=originals.map(({row,image:old,file})=>{
   const bytes=readFile(file);if(digest(bytes)!==row.beforeSha256)throw new TypeError('approved-backdrop-replay-original-asset-binding');
   const matches=images.filter(image=>image.id===row.imageId),image=matches[0];
   if(matches.length!==1||!image||fingerprint(drawing(image))!==fingerprint(drawing(old)))
    throw new TypeError('approved-backdrop-replay-drawing-binding');
   const current=readFile(assetFile(currentRoot,image.assetPath)),before=decode(bytes),after=decode(current);
   decoded+=before.width*before.height+after.width*after.height;
   if(decoded>40000000)throw new RangeError('approved-backdrop-replay-pixel-budget');
   const a=registration(old,before,review.source,slide),b=registration(image,after,review.source,slide);
   if(a.x!==b.x||a.y!==b.y||before.width!==after.width||before.height!==after.height)
    throw new TypeError('approved-backdrop-replay-registration');
   let targets=0;
   for(const pixel of review.pixels){
    chargeApprovedBackdropChecks(1);
    const x=pixel.cell%review.source.width-a.x,y=Math.floor(pixel.cell/review.source.width)-a.y;
    if(x<0||y<0||x>=before.width||y>=before.height)continue;
    const n=(y*before.width+x)*4;chargeApprovedBackdropChecks(4);
    // Also preserve opaque/partial-alpha overlap pixels: a formerly ineligible
    // overlap must never become a newly authorized target during replay.
    if(!before.rgba.subarray(n,n+4).equals(after.rgba.subarray(n,n+4)))
     throw new TypeError('approved-backdrop-replay-target-changed');
    if(before.rgba[n+3]===0){covered.add(pixel.cell);targets++;}
   }
   if(!targets)throw new TypeError('approved-backdrop-replay-no-targets');totalTargets+=targets;
   return {...row,imageFingerprint:backdropImageFingerprint(image),beforeSha256:digest(current)};
  });
  if(covered.size!==review.pixels.length)throw new TypeError('approved-backdrop-replay-incomplete');
  const rebound={approvalId:review.approvalId,source:review.source,pixels:review.pixels,scopeFingerprint:review.scopeFingerprint,
   pageFingerprint:backdropPageFingerprint(deck,page),assets};
  const receipt=await createApprovedBackdropPixelApplication(rebound)(context);
  const report=record(record(deck.meta).approvedRouteBackdrop);
  report.compatibility={policy:'identical-reviewed-transparent-rgba-v1',originalPageFingerprint:review.pageFingerprint,
   appliedPageFingerprint:rebound.pageFingerprint,originalAssetBindings:review.assets,uniqueSourcePixels:covered.size,
   verifiedAssetTargets:totalTargets,sourceScopeUnchanged:true,drawingRegistrationUnchanged:true,approvalExpanded:false};
  return receipt;
 };
}
module.exports={createApprovedBackdropPixelReplay};
