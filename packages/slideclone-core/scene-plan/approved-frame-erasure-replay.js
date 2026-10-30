// @ts-check
'use strict';
const {record,hash}=require('./approved-frame-application-input');
const {readApprovedFrameBytes}=require('./approved-frame-bytes');
const {digest}=require('./approved-frame-mask');
const {applyApproximateBackgroundPlan}=require('./approved-frame-approximation');
/** @param {unknown} value */
function raster(value){
 const data=record(value),w=data.width,h=data.height;
 if(typeof w!=='number'||typeof h!=='number'||!Number.isSafeInteger(w)||!Number.isSafeInteger(h)
  ||w<1||h<1||w>32768||h>32768||w*h>40000000)throw new TypeError('approved-frame-replay-image-invalid');
 return {width:w,height:h,rgba:readApprovedFrameBytes(data.rgba,w*h*4)};
}
/** Replay a previously approved asset delta after a later native erasure.
 * The host must retain the original reviewed BEFORE and AFTER assets and
 * authenticate their hashes against that review. Recompute the original
 * approved plan too: its exact output must match every reviewed AFTER byte.
 * Only previously opaque, actually changed reviewed cells may fill a now
 * fully transparent cell. Original transparency, partial alpha and later
 * opaque edits remain untouched. This creates no new source/strict authority.
 * @param {unknown} input */
function applyApprovedFrameErasureReplay(input){
 const data=record(input),keys=['asset','before','after','source','plan','registration','beforeRgbaSha256','afterRgbaSha256'];
 if(Reflect.ownKeys(data).length!==keys.length||keys.some(key=>!Object.hasOwn(data,key)))throw new TypeError('approved-frame-replay-input-invalid');
 const asset=raster(data.asset),before=raster(data.before),after=raster(data.after);
 if([before,after].some(image=>image.width!==asset.width||image.height!==asset.height))throw new TypeError('approved-frame-replay-size-invalid');
 if(digest(before.rgba)!==hash(data.beforeRgbaSha256)||digest(after.rgba)!==hash(data.afterRgbaSha256))throw new TypeError('approved-frame-replay-asset-binding');
 const original=applyApproximateBackgroundPlan({asset:before,source:data.source,plan:data.plan,registration:data.registration});
 for(let i=0;i<after.rgba.length;i++)if(after.rgba[i]!==original.rgba[i])throw new TypeError('approved-frame-replay-output-binding');
 const result=applyApproximateBackgroundPlan({asset,source:data.source,plan:data.plan,registration:data.registration});
 let replayedPixels=0;
 for(let i=0;i<asset.rgba.length;i+=4){
  if(asset.rgba[i+3]!==0||before.rgba[i+3]!==255||after.rgba[i+3]!==255)continue;
  if([0,1,2,3].every(c=>before.rgba[i+c]===after.rgba[i+c]))continue;
  for(let c=0;c<4;c++)result.rgba[i+c]=after.rgba[i+c]??0;
  replayedPixels++;
 }
 return {...result,replayedPixels,outputRgbaSha256:digest(result.rgba),
  replayPolicy:'previously-opaque-reviewed-delta-only-v1',originalApprovalCoordinatesOnly:true,
  preservedOriginallyTransparentPixels:true,strictAccepted:false,noGhostVerified:false};
}
module.exports={applyApprovedFrameErasureReplay};
