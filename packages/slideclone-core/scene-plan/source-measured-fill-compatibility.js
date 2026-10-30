// @ts-check
'use strict';
const {AsyncLocalStorage}=require('node:async_hooks');
const {sceneFillPaintMeasurement}=require('./source-scene-fill-window');
const {record,snapshot,fingerprint,hash,identifier}=require('./approved-frame-application-input');
/** @typedef {{image:import('../png').PngImage,sourceHash:string,closed:boolean}} Scope */
/** @type {AsyncLocalStorage<Scope>} */const sources=new AsyncLocalStorage();
/** @type {WeakMap<object,{id:string,box:string,sourceHash:string,gradient:string,expires:number}[]>} */const gradients=new WeakMap();
/** Internal compiler scope, opened only after compileSourceScene verifies the
 * actual source file/hash. Neither a job flag nor JSON can reopen this scope.
 * The shared compiler session still owns source pixels and measurement costs.
 * @template T @param {import('../png').PngImage} image @param {string} sourceHash @param {()=>T} operation @returns {T} */
function withSourceMeasuredFillScope(image,sourceHash,operation){
 hash(sourceHash);const state={image,sourceHash,closed:false};
 try{return sources.run(state,operation);}finally{state.closed=true;}
}
/** Register only the ordinary connected fill's existing private measurement.
 * The gradient reference, snapshot, physical source, ID and scaled output box
 * are bound; this creates no approval, erasure or general shape authority.
 * @param {unknown} input */
function registerSourceMeasuredFillGradient(input){
 const scope=sources.getStore();if(!scope||scope.closed)return false;
 try{
  const data=record(input),image=record(data.image),measurement=record(data.measurement);
  if(image.rgba!==scope.image.rgba||image.width!==scope.image.width||image.height!==scope.image.height)return false;
  const paint=sceneFillPaintMeasurement(measurement,scope.image);if(!paint?.gradient)return false;
  const gradient=record(data.gradient);if(fingerprint(gradient)!==fingerprint(paint.gradient))return false;
  const rows=gradients.get(gradient)??[];if(rows.length>=10000)return false;
  const box=record(data.box);if(Object.keys(box).length!==4||![box.x,box.y,box.w,box.h].every(n=>typeof n==='number'&&Number.isFinite(n)))return false;
  rows.push({id:identifier(data.id),box:fingerprint(box),sourceHash:scope.sourceHash,gradient:fingerprint(gradient),expires:Date.now()+30*60*1000});
  gradients.set(gradient,rows);return true;
 }catch{return false;}
}
/** Verify the ENTIRE original approved member fingerprint after removing only
 * one privately measured appearance field. All geometry, path, other styles,
 * text, source identities and ownership must still match the original review.
 * No expected fingerprint is regenerated or replaced. Detached/JSON gradients
 * and public metadata claims have no private measurement reference.
 * @param {unknown} input @param {unknown} expected @param {unknown} sourceHash */
function sourceMeasuredFillGradientAncestor(input,expected,sourceHash){
 try{
  hash(expected);hash(sourceHash);snapshot(input);const item=record(input),style=record(item.style),gradient=record(style.gradient);
  const rows=gradients.get(gradient);if(!rows||!rows.some(row=>row.id===item.id&&row.sourceHash===sourceHash&&Date.now()<=row.expires
   &&row.box===fingerprint(item.box)&&row.gradient===fingerprint(gradient)))return null;
  const legacyStyle={...style};delete legacyStyle.gradient;
  if(fingerprint({...item,style:legacyStyle})!==expected)return null;
  return {id:String(item.id),field:'style.gradient',originalFingerprint:String(expected),measuredFingerprint:fingerprint(item),sourceSha256:String(sourceHash)};
 }catch{return null;}
}
module.exports={withSourceMeasuredFillScope,registerSourceMeasuredFillGradient,sourceMeasuredFillGradientAncestor};
