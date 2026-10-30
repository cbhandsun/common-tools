// @ts-check
'use strict';
const {record,list,snapshot,fingerprint,hash}=require('../scene-plan/approved-frame-application-input');
const {sourceWordRasterSourceHash}=require('../scene-plan/deferred-source-word-layout');
const {measureHistoricalSourceWordLayout}=require('./source-word-layout-evidence');
const {projectSourceWordRuns}=require('./source-word-layout-projection');
const {compactNativeOpacityDefaults}=require('../scene-plan/native-opacity-defaults');
const {compactNativeTextInsetDefaults}=require('./native-text-inset-defaults');
const {compactNativeTextEvidenceDefaults}=require('./native-text-evidence-defaults');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{request:object,original:Box,lineBox:Box,budget:{remaining:number},rotation:number,fixedFrame?:Box,sourceScale?:{x:number,y:number}}} Plan */
/** @type {WeakMap<object,{id:unknown,drawing:string,sourceHash:string,plan:Plan,expires:number,attempts:number,cache:Map<string,{matched:boolean,scannedPixels:number}>}>} */const receipts=new WeakMap();
/** @param {unknown} input */
function drawing(input){
 const value=record(JSON.parse(snapshot(input))),deck={pages:[{textBoxes:[value]}]};
 compactNativeOpacityDefaults(deck);compactNativeTextInsetDefaults(deck);compactNativeTextEvidenceDefaults(deck);
 delete value.source;return fingerprint(value);
}
/** Arithmetic equivalence only, after choosing a source-measured projection.
 * Never use this bound to admit a changed glyph layout or drawing style.
 * @param {unknown} a @param {unknown} b @returns {boolean} */
function roundoff(a,b){
 if(typeof a==='number'&&typeof b==='number')return Number.isFinite(a)&&Number.isFinite(b)
  &&Math.abs(a-b)<=8*Number.EPSILON*Math.max(1,Math.abs(a),Math.abs(b));
 if(a===undefined||b===undefined)return a===b;
 if(Array.isArray(a)||Array.isArray(b)){const x=list(a,512),y=list(b,512);return x.length===y.length&&x.every((v,i)=>roundoff(v,y[i]));}
 const x=record(a),y=record(b),keys=Object.keys(x);
 // Native spans may be calculated as right-left or bottom-top. Bound that
 // cancellation at the ACTUAL endpoints, never by the small span alone.
 if(keys.length===4&&Object.keys(y).length===4&&['x','y','w','h'].every(k=>Object.hasOwn(x,k)&&Object.hasOwn(y,k))){
  if(![x.x,x.y,x.w,x.h,y.x,y.y,y.w,y.h].every(n=>typeof n==='number'&&Number.isFinite(n))
   ||Number(x.w)<=0||Number(x.h)<=0||Number(y.w)<=0||Number(y.h)<=0)return false;
  return roundoff(x.x,y.x)&&roundoff(x.y,y.y)&&roundoff(Number(x.x)+Number(x.w),Number(y.x)+Number(y.w))
   &&roundoff(Number(x.y)+Number(x.h),Number(y.y)+Number(y.h));
 }
 return keys.length===Object.keys(y).length&&keys.every(k=>Object.hasOwn(y,k)&&roundoff(x[k],y[k]));
}
/** Register only the actual native layout produced from the private deferred
 * source decode. Source metadata may receive later admission annotations;
 * every drawing field is bound, and consumption compares complete metadata.
 * No public initial raster, JSON, copy or caller flag can mint this receipt.
 * @param {Plan} plan @param {Record<string,unknown>} item */
function registerSourceMeasuredTextStyle(plan,item){
 if(plan.rotation||plan.fixedFrame)return false;
 const sourceHash=sourceWordRasterSourceHash(record(plan.request).image);if(!sourceHash)return false;
 receipts.set(record(item.style),{id:item.id,drawing:drawing(item),sourceHash,plan,expires:Date.now()+30*60*1000,attempts:0,cache:new Map()});return true;
}
/** Remove ONLY geometry whose arithmetic/source projection is independently
 * validated below. All content, fonts, paint, ownership and other metadata must
 * still match the COMPLETE historical reviewed object exactly.
 * @param {Record<string,unknown>} input */
function invariants(input){
 const item=record(JSON.parse(snapshot(input))),source=record(item.source);delete item.box;
 for(const key of ['evidenceBox','ocrPolygonPt'])delete source[key];
 if(source.ocrEvidenceFit!==undefined)delete record(source.ocrEvidenceFit).originalBox;
 if(item.positionedRuns!==undefined)for(const run of list(item.positionedRuns,512))delete record(run).box;
 return fingerprint(item);
}
/** @param {unknown} runs @param {unknown} expected */
function runGeometry(runs,expected){
 const a=list(runs,512).map(record),b=list(expected,512).map(record);
 return a.length===b.length&&a.every((run,i)=>run.text===b[i]?.text&&roundoff(run.box,b[i]?.box));
}
/** Verify the exact approved ancestor from its retained representation. A
 * historical pixel-window measurement is charged to the ORIGINAL remaining
 * 4M budget, with original neighbors and all ordinary ink/ownership gates.
 * It is never selected as the current layout and grants no pixel erasure.
 * @param {unknown} input @param {unknown} ancestor @param {unknown} expected @param {unknown} sourceHash */
function sourceMeasuredTextAncestor(input,ancestor,expected,sourceHash){
 try{
  hash(expected);hash(sourceHash);snapshot(input);snapshot(ancestor);
  const item=record(input),prior=record(ancestor),proof=receipts.get(record(item.style));
  if(!proof||proof.id!==item.id||proof.sourceHash!==sourceHash||Date.now()>proof.expires
   ||proof.drawing!==drawing(item)||fingerprint(prior)!==expected||invariants(item)!==invariants(prior))return null;
  const source=record(item.source),oldSource=record(prior.source);
  if(!roundoff(item.box,prior.box)||!roundoff(source.evidenceBox,oldSource.evidenceBox)
   ||!roundoff(source.ocrPolygonPt,oldSource.ocrPolygonPt)
   ||!roundoff(source.ocrEvidenceFit===undefined?undefined:record(source.ocrEvidenceFit).originalBox,
    oldSource.ocrEvidenceFit===undefined?undefined:record(oldSource.ocrEvidenceFit).originalBox))return null;
  let matched=runGeometry(item.positionedRuns,prior.positionedRuns),historicalScannedPixels=0;
  if(!matched){
   const cached=proof.cache.get(String(expected));if(cached!==undefined){matched=cached.matched;historicalScannedPixels=cached.scannedPixels;}
   else{
    if(proof.attempts++>=4)return null;
    const {plan}=proof;if(!plan.sourceScale)return null;
    const b=record(oldSource.evidenceBox),sx=plan.sourceScale.x,sy=plan.sourceScale.y;
    const seed={x:Number(b.x)*(1/sx),y:Number(b.y)*(1/sy),w:Number(b.w)*(1/sx),h:Number(b.h)*(1/sy)};
    const result=measureHistoricalSourceWordLayout(plan.request,seed,plan.budget.remaining);
    if(result){plan.budget.remaining-=result.scannedPixels;historicalScannedPixels=result.scannedPixels;}
    if(result?.runs&&result.sourceFrame){const frame=result.sourceFrame;
     const measured={x:Number(b.x)+(frame.x-seed.x)*sx,y:Number(b.y)+(frame.y-seed.y)*sy,w:frame.w*sx,h:frame.h*sy};
     matched=runGeometry(projectSourceWordRuns(result.typographicRuns??result.runs,frame,measured),prior.positionedRuns);
    }
    proof.cache.set(String(expected),{matched,scannedPixels:historicalScannedPixels});
   }
  }
  return matched?{id:String(item.id),field:'source.wordPixelProjection',originalFingerprint:String(expected),measuredFingerprint:fingerprint(item),sourceSha256:String(sourceHash),historicalScannedPixels}:null;
 }catch{return null;}
}
module.exports={registerSourceMeasuredTextStyle,sourceMeasuredTextAncestor};
