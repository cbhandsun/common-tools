// @ts-check
"use strict";
const {types}=require('node:util');
const {sourceRaster}=require('../typography/residual-text-mask');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Validate source/crop coordinates before applying an internal measured body.
 * @param {unknown} imageInput @param {unknown} budgetInput @param {unknown} windowInput @param {unknown} rasterInput */
function backdropMatteFrame(imageInput,budgetInput,windowInput,rasterInput){
 const image=sourceRaster(imageInput),raster=sourceRaster(rasterInput);
 if(!record(budgetInput)||!Number.isSafeInteger(budgetInput.used)||Number(budgetInput.used)<0||Number(budgetInput.used)>4000000
  ||!record(windowInput)||![windowInput.x,windowInput.y,windowInput.w,windowInput.h].every(Number.isSafeInteger)
  ||Number(windowInput.x)<0||Number(windowInput.y)<0||Number(windowInput.w)<=0||Number(windowInput.h)<=0
  ||Number(windowInput.x)+Number(windowInput.w)>image.width||Number(windowInput.y)+Number(windowInput.h)>image.height
  ||Number(windowInput.w)*Number(windowInput.h)>262144||windowInput.w!==raster.width||windowInput.h!==raster.height)
  throw new TypeError('Scene icon backdrop frame is invalid');
 return {image,raster,budget:/** @type {{used:number}} */(budgetInput),window:/** @type {Box} */(windowInput)};
}
/** Internal caller supplies a private source-measured body. Preserve all RGB
 * and dark strokes, including strokes crossing the measured perimeter. Geometry
 * never authorizes stroke erasure. Use the existing 20/42 edge matte distances.
 * @param {ReturnType<typeof sourceRaster>} raster @param {Box} window @param {Box} box @param {number[]} color */
function matteMeasuredBackdrop(raster,window,box,color){
 const area=window.w*window.h,seen=new Uint8Array(area),queue=new Int32Array(area),rgba=Buffer.from(raster.rgba);
 let head=0,tail=0;
 const distance=(/** @type {number} */n)=>Math.hypot(...color.map((c,k)=>c-(raster.rgba[n*4+k]??0)));
 const add=(/** @type {number} */n)=>{if(seen[n]||distance(n)>42)return;seen[n]=1;queue[tail++]=n;};
 for(let n=0;n<area;n++){
  const x=window.x+n%window.w,y=window.y+Math.floor(n/window.w);
  if(x>=box.x&&y>=box.y&&x<box.x+box.w&&y<box.y+box.h
   &&color.every((c,k)=>Math.abs(c-(raster.rgba[n*4+k]??0))<=16))add(n);
 }
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError('Scene backdrop queue is invalid');
  const x=n%window.w,y=Math.floor(n/window.w);
  rgba[n*4+3]=Math.min(rgba[n*4+3]??0,Math.round(255*Math.max(0,Math.min(1,(distance(n)-20)/22))));
  for(const q of [x?n-1:-1,x<window.w-1?n+1:-1,y?n-window.w:-1,y<window.h-1?n+window.w:-1])if(q>=0)add(q);
 }
 return {width:raster.width,height:raster.height,rgba};
}
module.exports={backdropMatteFrame,matteMeasuredBackdrop};
