// @ts-check
'use strict';
const {measuredSceneVisibleGapPaint}=require('./source-scene-visible-gap-compiler');
/** A pending partition is NOT source ownership. Its omitted components must
 * all be accounted for by real, unchanged connector outputs before adoption.
 * @type {WeakMap<object,{pixels:Uint8Array,width:number,height:number,cells:Set<number>,sealed:boolean,covered?:number}>} */
const pending=new WeakMap();
/** @param {import('../png').PngImage} image */
function createIconBoundaryPartition(image){
 const token=Object.freeze({});pending.set(token,{pixels:image.rgba,width:image.width,height:image.height,cells:new Set(),sealed:false});return token;
}
/** Called only on a complete connected component from the ordinary scanner.
 * The original center-identity, text and complete-detail checks still apply.
 * No pixel is edited; this defers one rejection inside an atomic transaction.
 * @param {unknown} token @param {import('../png').PngImage} image
 * @param {import('./source-scene-plan').Box} frame @param {Int32Array} queue @param {number} length */
function deferIconBoundaryComponent(token,image,frame,queue,length){
 const state=token!==null&&typeof token==='object'?pending.get(token):undefined;
 if(!state||state.sealed||state.pixels!==image.rgba||state.width!==image.width||state.height!==image.height)return false;
 if(!Number.isSafeInteger(length)||length<1||length>queue.length||state.cells.size+length>262144)return false;
 for(let k=0;k<length;k++){
  const n=queue[k];if(n===undefined||n<0||n>=frame.w*frame.h)return false;
  state.cells.add((frame.y+Math.floor(n/frame.w))*image.width+frame.x+n%frame.w);
 }
 return true;
}
/** Exact cell coverage, not rectangle overlap, confidence, nearest-center
 * selection, a copied source flag, or an enlarged connector mask. A failed
 * transaction cannot be retried with a different output using the same token.
 * @param {unknown} token @param {import('../png').PngImage} image @param {unknown[]} connectors */
function sealIconBoundaryPartition(token,image,connectors){
 const state=token!==null&&typeof token==='object'?pending.get(token):undefined;
 if(!state||state.sealed||state.pixels!==image.rgba||state.width!==image.width||state.height!==image.height)return false;
 state.sealed=true;
 if(!state.cells.size||!Array.isArray(connectors)||connectors.length>48)return false;
 const covered=new Set();
 for(const output of connectors){const cells=measuredSceneVisibleGapPaint(image,output);if(!cells)continue;for(const cell of cells)covered.add(cell);}
 state.covered=[...state.cells].filter(cell=>covered.has(cell)).length;
 return [...state.cells].every(cell=>covered.has(cell));
}
/** Diagnostic counters disclose no mutable receipt or excluded pixel set.
 * @param {unknown} token */
function iconBoundaryPartitionSize(token){return token!==null&&typeof token==='object'?pending.get(token)?.cells.size??0:0;}
/** @param {unknown} token */
function iconBoundaryPartitionCoverage(token){const state=token!==null&&typeof token==='object'?pending.get(token):undefined;return {omitted:state?.cells.size??0,covered:state?.covered??0};}
module.exports={createIconBoundaryPartition,deferIconBoundaryComponent,sealIconBoundaryPartition,iconBoundaryPartitionSize,iconBoundaryPartitionCoverage};
