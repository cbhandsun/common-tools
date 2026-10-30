// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('./source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
const {fitObservedSurfaceGradient}=require('./source-surface-gradient');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
const invalid=()=>new TypeError('Source fill gradient input is invalid');
/** @param {unknown} value @param {number} maximum @returns {unknown[]} */
function array(value,maximum){
 if(types.isProxy(value)||!Array.isArray(value)||value.length>maximum||!list(value))throw invalid();return value;
}
/** @param {unknown} value @returns {Box} */
function bounds(value){
 if(!record(value)||![value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=32768)
  ||Number(value.w)<=0||Number(value.h)<=0)throw invalid();
 return {x:Number(value.x),y:Number(value.y),w:Number(value.w),h:Number(value.h)};
}
/** Copy masks before any source/geometry work. They can exclude samples only;
 * an OCR rectangle cannot establish a fill component or its ownership.
 * @param {unknown} value @returns {Box[]} */
function sourceSurfaceGradientMasks(value){return value===undefined?[]:array(value,10000).map(bounds);}
/** Fit appearance only from paint cells in an independently admitted window.
 * The caller owns connectivity, geometry and source debits. This helper grants
 * no source receipt, erasure permission or new physical-body measurement.
 * Reuse the existing 24x24 / 12 samples / 18-channel / 82% support estimator.
 * @param {unknown} input */
function fitAdmittedFillGradient(input){
 if(!record(input))throw invalid();
 const masks=sourceSurfaceGradientMasks(input.masks),window=bounds(input.window),box=bounds(input.box);
 const points=array(input.pixels,262144),fill=array(input.fill,3),tolerance=input.tolerance;
 if(fill.length!==3||!fill.every(v=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0&&v<=255)
  ||typeof tolerance!=='number'||!Number.isFinite(tolerance)||tolerance<0||tolerance>16)throw invalid();
 let raster;
 try{raster=sourceRaster(input.raster);}catch{throw invalid();}
 if(raster.width*raster.height>262144||window.w!==raster.width||window.h!==raster.height
  ||![window.x,window.y,box.x,box.y,box.w,box.h].every(Number.isSafeInteger)||window.x<0||window.y<0
  ||box.x<window.x||box.y<window.y||box.x+box.w>window.x+window.w||box.y+box.h>window.y+window.h)throw invalid();
 const rgba=Buffer.alloc(raster.rgba.length);
 for(const raw of points){
  if(!record(raw)||!Number.isSafeInteger(raw.x)||!Number.isSafeInteger(raw.y))throw invalid();
  const x=Number(raw.x)-window.x,y=Number(raw.y)-window.y;
  if(x<0||y<0||x>=raster.width||y>=raster.height)throw invalid();
  const at=(y*raster.width+x)*4;
  if((raster.rgba[at+3]??0)<250||!fill.every((v,c)=>Math.abs(Number(v)-(raster.rgba[at+c]??0))<=tolerance))continue;
  for(let c=0;c<4;c++)rgba[at+c]=raster.rgba[at+c]??0;
 }
 const gradient=fitObservedSurfaceGradient({width:raster.width,height:raster.height,rgba},
  {...box,x:box.x-window.x,y:box.y-window.y},masks.map(m=>({...m,x:m.x-window.x,y:m.y-window.y})));
 // Constant-color bodies keep the previous IR and drawing representation.
 return gradient&&gradient.stops[0]?.color!==gradient.stops[1]?.color?gradient:null;
}
module.exports={fitAdmittedFillGradient,sourceSurfaceGradientMasks};
