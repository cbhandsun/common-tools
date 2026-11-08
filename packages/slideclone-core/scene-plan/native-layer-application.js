// @ts-check
'use strict';
const {record,list,snapshot,fingerprint,identifier}=require('./approved-frame-application-input');
const {captureNativeLayerBinding,parseNativeLayerBinding}=require('./native-layer-binding');
const {planNativeLayerChanges}=require('./native-layer-change-plan');
const {keys}=require('./native-layer-change-style');
const {issueApprovedFrameApplication}=require('./approved-frame-application-lifecycle');
/** @param {Record<string,unknown>} data @param {string} key */
function writable(data,key){const d=Object.getOwnPropertyDescriptor(data,key);if(d?d.writable!==true:!Object.isExtensible(data))throw new TypeError('native-layer-output-readonly');}
/** @param {unknown} check */
async function cancellation(check){
 if(typeof check!=='function')throw new Error('native-layer-cancellation-invalid');let result;
 try{result=await check();}catch{throw new Error('native-layer-cancellation-unavailable');}
 if(typeof result!=='boolean')throw new Error('native-layer-cancellation-invalid');if(result)throw new Error('native-layer-cancellation-requested');
}
/** A trusted composition root installs this dependency AFTER approval of this
 * exact bundle. It is never selected by serialized job options. Capture and
 * pure planning are not approval; this factory does not create source rights.
 * The original assets are retained on disk, including removed references.
 * @param {unknown} input */
function createApprovedNativeLayerApplication(input){
 const b=record(JSON.parse(snapshot(input)));keys(b,['version','approvalId','binding','review']);
 if(b.version!==1)throw new TypeError('native-layer-application-invalid');
 const approvalId=identifier(b.approvalId),binding=parseNativeLayerBinding(b.binding),review=record(b.review),bindingFingerprint=fingerprint(binding);
 if(review.pageFingerprint!==binding.pageFingerprint||review.sourceHash!==binding.source.sha256)throw new TypeError('native-layer-application-binding');
 const reviewFingerprint=fingerprint(review);
 return async(/** @type {unknown} */ context)=>{
  const data=record(context),deck=record(data.deck),pages=list(deck.pages,1),page=record(pages[0]);
  if(pages.length!==1)throw new TypeError('native-layer-application-invalid');
  const oldMeta=deck.meta,hadMeta=Object.hasOwn(deck,'meta');
  if(oldMeta!==undefined&&record(oldMeta).approvedNativeLayers!==undefined)throw new TypeError('native-layer-already-applied');
  const oldPages=deck.pages,oldShapes=page.shapes,oldImages=page.images,oldTexts=page.textBoxes;
  const shapes=list(oldShapes,10000),images=list(oldImages,10000),texts=list(oldTexts,10000),before=snapshot(deck);
  const source=page.source,compilation=oldMeta===undefined?undefined:record(oldMeta).sourceSceneCompilation,strict=fingerprint({source,compilation});
  const root=data.root,sourceFile=data.sourceFile,check=data.isCancellationRequested;
  const checkBinding=()=>{if(fingerprint(captureNativeLayerBinding(context))!==bindingFingerprint)throw new TypeError('native-layer-application-binding');};
  const sameContext=()=>data.deck===deck&&data.root===root&&data.sourceFile===sourceFile&&data.isCancellationRequested===check&&deck.pages===oldPages&&list(deck.pages,1)[0]===page;
  /** @param {unknown} value @param {unknown[]} originals */
  const sameMembers=(value,originals)=>{const items=list(value,10000);return items.length===originals.length&&items.every((item,i)=>item===originals[i]);};
  const unchanged=()=>sameContext()&&deck.meta===oldMeta&&page.shapes===oldShapes&&page.images===oldImages&&page.textBoxes===oldTexts
   &&sameMembers(page.shapes,shapes)&&sameMembers(page.images,images)&&sameMembers(page.textBoxes,texts)&&snapshot(deck)===before;
  const checkWritable=()=>{writable(page,'shapes');writable(page,'images');writable(page,'textBoxes');writable(deck,'meta');};
  checkWritable();checkBinding();
  // Only storage paths have been normalized, and their current bytes were just
  // compared above. Per-shape and text beforeFingerprints are never rewritten.
  const plan=planNativeLayerChanges({page,slideSize:deck.slideSize,review:{...review,pageFingerprint:fingerprint(page)}});
  await cancellation(check);
  if(!unchanged())throw new TypeError('native-layer-application-changed');
  checkBinding();checkWritable();
  const report={policy:'approved-native-layer-application-v1',approvalId,reviewFingerprint,bindingFingerprint,sourceSha256:binding.source.sha256,
   changes:plan.changes,originalAssetsPreserved:true,appliedBeforeFinalSeal:true,strictSourceEquivalent:false,sourceErasureAuthority:false,
   wholeProductAcceptance:false,noGhostVerified:false};
  const resultPage=record(plan.page),nextShapes=resultPage.shapes,nextImages=resultPage.images,nextTexts=resultPage.textBoxes;
  const nextShapeMembers=list(nextShapes,10000),nextImageMembers=list(nextImages,10000),nextTextMembers=list(nextTexts,10000);
  const expectedPage=snapshot(resultPage),reportFingerprint=fingerprint(report);
  // Keep a shallow page using ALL original image references so commit still
  // checks every approved input file, even images removed from the result.
  const sourceContext={deck:{...deck,pages:[{...page,images:oldImages}]},root,sourceFile};
  let retained=false,published=false;
  const rollback=()=>{
   if(retained)return;
   page.shapes=oldShapes;page.images=oldImages;page.textBoxes=oldTexts;
   if(hadMeta)deck.meta=oldMeta;else delete deck.meta;retained=true;
  };
  try{
   page.shapes=nextShapes;page.images=nextImages;page.textBoxes=nextTexts;published=true;
   deck.meta={...(oldMeta===undefined?{}:record(oldMeta)),approvedNativeLayers:report};
   return issueApprovedFrameApplication(context,{commit(){
    const meta=record(deck.meta);
    if(!sameContext()||page.source!==source||page.shapes!==nextShapes||page.images!==nextImages||page.textBoxes!==nextTexts||snapshot(page)!==expectedPage
     ||!sameMembers(page.shapes,nextShapeMembers)||!sameMembers(page.images,nextImageMembers)||!sameMembers(page.textBoxes,nextTextMembers)
     ||fingerprint(deck.slideSize)!==fingerprint(binding.slideSize)||meta.sourceSceneCompilation!==compilation
     ||meta.approvedNativeLayers!==report||fingerprint(report)!==reportFingerprint
     ||fingerprint({source:page.source,compilation:meta.sourceSceneCompilation})!==strict)throw new TypeError('native-layer-application-changed');
    if(fingerprint(captureNativeLayerBinding(sourceContext))!==bindingFingerprint)throw new TypeError('native-layer-application-binding');
    // The process-local receipt is consumed on success. Keep rollback usable
    // if a later sibling commit fails after this validation succeeds.
   },rollback});
  }catch(error){if(published)rollback();throw error;}
 };
}
module.exports={createApprovedNativeLayerApplication};
