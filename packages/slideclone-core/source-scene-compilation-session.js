// @ts-check
"use strict";
const {sourceRaster}=require('./residual-text-mask');
const {types}=require('node:util');
const {createSceneFillRasterScope,withSceneFillRasterScope}=require('./source-scene-fill-raster-cache');
/** @typedef {{image:import('./png').PngImage,budget:{used:number},scope:object,sourceHash:string}} State */
/** @type {WeakMap<object,State>} */const sessions=new WeakMap();
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Open an opaque compiler capability only after the compiler verified the
 * source hash. A review can return the token, but cannot serialize or alter it.
 * Reopening always recalculates geometry/ink/ownership against final controls.
 * @template T @param {unknown} input
 * @param {(state:State)=>T} compile @returns {{result:T,session:object}} */
function withSceneCompilationSession(input,compile){
 if(!record(input))throw new TypeError('Scene compilation session is invalid');
 const {sourceHash,session}=input,source=sourceRaster(input.image);
 const image={...source,rgba:Buffer.from(source.rgba.buffer,source.rgba.byteOffset,source.rgba.byteLength)};
 if(typeof sourceHash!=='string'||! /^[a-f0-9]{64}$/u.test(sourceHash)||typeof compile!=='function')throw new TypeError('Scene compilation session is invalid');
 let token,state;
 if(session!==undefined){
  token=session;state=session!==null&&typeof session==='object'?sessions.get(session):undefined;
  if(!state||state.sourceHash!==sourceHash||state.image.width!==image.width||state.image.height!==image.height)
   throw new TypeError('Scene compilation session source changed');
 }else{
  token=Object.freeze({});const budget={used:0};state={image,sourceHash,budget,scope:createSceneFillRasterScope(image,budget)};sessions.set(token,state);
 }
 const current=state;
 return {result:withSceneFillRasterScope(current.image,current.budget,current.scope,()=>compile(current)),session:/** @type {object} */(token)};
}
module.exports={withSceneCompilationSession};
