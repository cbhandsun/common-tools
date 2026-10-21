// @ts-check
"use strict";
const {types}=require('node:util');
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d);}
const {sourceRaster}=require('./residual-text-mask');
/** Admit an already source-isolated pictorial asset, including opaque internal
 * paint. The caller must first prove complete connected source ownership and
 * absence of text; this size/alpha check grants no isolation or erase rights.
 * Original sparse-crop admission and all page fidelity limits stay unchanged.
 * @param {unknown} raster @param {unknown} box @param {unknown} size */
function admitSourcePictorialCrop(raster,box,size){
 const image=sourceRaster(raster);
 if(!record(box)||!record(size)||typeof box.w!=='number'||typeof box.h!=='number'
  ||typeof size.widthPt!=='number'||typeof size.heightPt!=='number'||![box.w,box.h,size.widthPt,size.heightPt].every(n=>Number.isFinite(n)&&n>0)
  ||size.widthPt>4000||size.heightPt>4000||box.w>size.widthPt||box.h>size.heightPt)throw new TypeError('Pictorial crop frame is invalid');
 const area=image.width*image.height,ratio=box.w*box.h/(size.widthPt*size.heightPt),aspect=box.w/box.h;
 if(area>262144||ratio>.035||box.w/size.widthPt>.18||box.h/size.heightPt>.22||aspect<.8||aspect>3.25)return null;
 let foreground=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){
  const alpha=image.rgba[(y*image.width+x)*4+3]??0;
  if(alpha>=32){if(x===0||y===0||x===image.width-1||y===image.height-1)return null;foreground++;}
 }
 if(!foreground)return null;
 return {tightCropAdmission:{operation:'source-isolated-pictorial-asset',sourceResolution:true,
  opaqueDensity:foreground/area,edgeOccupancy:0}};
}
module.exports={admitSourcePictorialCrop};
