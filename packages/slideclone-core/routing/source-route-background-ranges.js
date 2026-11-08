// @ts-check
'use strict';
const LIMIT=4000000;
/** @typedef {import('./source-route-antialias-background').Raster} Raster
 * @typedef {import('./source-route-antialias-background').Box} Box
 * @typedef {{low:number[],high:number[],count:number}} Bounds
 * @typedef {{exterior:Bounds,fringe:Bounds}|{refusedCell:number}} Summary
 * @typedef {{y:number,start:number,end:number,left:number[],step:number[],origin:number}} Query
 */
/** Summaries belong to one immutable source/window/mask observation. The
 * extrema prove every exterior sample is within three of EVERY prediction
 * in a block, and every fringe sample is strictly within 42. An inconclusive
 * envelope falls back to the original per-pixel proof, including its exact
 * arithmetic, support count and hard conflicts. No field is accepted here.
 * @param {{image:Raster,window:Box,component:Uint8Array,blocked:Uint8Array,
 * halo:Uint8Array,work:{checks:number},onConflict?:(cell:number)=>void}} input */
function createCoreBackgroundRanges({image,window,component,blocked,halo,work,onConflict}){
 if(![image.width,image.height,window.x,window.y,window.w,window.h].every(Number.isSafeInteger)
  ||image.width<1||image.height<1||window.x<0||window.y<0||window.w<1||window.h<1
  ||window.x+window.w>image.width||window.y+window.h>image.height
  ||!Number.isSafeInteger(image.width*image.height*4)||image.rgba.length!==image.width*image.height*4
  ||[component,blocked,halo].some(mask=>mask.length!==window.w*window.h))throw new RangeError('Background range dimensions are invalid');
 /** @param {number} cost */const charge=cost=>{work.checks+=cost;return work.checks<=LIMIT;};
 /** @type {Map<number,Summary>} */const cache=new Map();
 /** @returns {Bounds} */const empty=()=>({low:[Infinity,Infinity,Infinity],high:[-Infinity,-Infinity,-Infinity],count:0});
 /** @param {number} y @param {number} start @param {number} end @returns {Summary|null} */
 function summary(y,start,end){
  if(!charge(1))return null;
  const key=(y*window.w+start)*9+(end-start),prior=cache.get(key);if(prior)return prior;
  const exterior=empty(),fringe=empty();
  for(let x=start;x<=end;x++){
   if(!charge(5))return null;
   const n=y*window.w+x,offset=((window.y+y)*image.width+window.x+x)*4;
   if(blocked[n]||image.rgba[offset+3]!==255){const result={refusedCell:n};cache.set(key,result);return result;}
   if(component[n])continue;
   const part=halo[n]?fringe:exterior;part.count++;
   for(let c=0;c<3;c++){const value=image.rgba[offset+c]??0;
    part.low[c]=Math.min(part.low[c]??Infinity,value);part.high[c]=Math.max(part.high[c]??-Infinity,value);
   }
  }
  const result={exterior,fringe};cache.set(key,result);return result;
 }
 /** @param {Query} query @returns {{total:number,supported:number}|'refused'|null} */
 return function read({y,start,end,left,step,origin}){
  if(![y,start,end,origin].every(Number.isSafeInteger)||y<0||y>=window.h||start<0||start>=window.w
   ||end<start||end>=window.w||Math.floor(start/8)!==Math.floor(end/8)
   ||left.length!==3||step.length!==3||!left.every(Number.isFinite)||!step.every(Number.isFinite))
   throw new RangeError('Background range query is invalid');
  const part=summary(y,start,end);if(!part)return null;
  if('refusedCell'in part){onConflict?.(part.refusedCell);return 'refused';}
  if(!charge(16))return null;
  const a=left.map((value,c)=>value+(step[c]??0)*(start-origin)),b=left.map((value,c)=>value+(step[c]??0)*(end-origin));
  if(!a.every(Number.isFinite)||!b.every(Number.isFinite))throw new RangeError('Background range prediction is invalid');
  /** Floating multiplication and addition are monotone for these finite
   * linear predictions; the exact endpoint arithmetic bounds every cell.
   * @param {Bounds} sample @param {number} limit @param {boolean} inclusive */
  const bounded=(sample,limit,inclusive)=>!sample.count||sample.low.every((value,c)=>{
   const delta=Math.max(Math.max(a[c]??0,b[c]??0)-value,(sample.high[c]??0)-Math.min(a[c]??0,b[c]??0));
   return inclusive?delta<=limit:delta<limit;
  });
  if(bounded(part.exterior,3,true)&&bounded(part.fringe,42,false))return {total:part.exterior.count,supported:part.exterior.count};
  let total=0,supported=0;
  for(let x=start;x<=end;x++){
   if(!charge(16))return null;
   const n=y*window.w+x;if(component[n])continue;
   const offset=((window.y+y)*image.width+window.x+x)*4;
   const predicted=left.map((value,c)=>value+(step[c]??0)*(x-origin));
   const delta=predicted.map((value,c)=>Math.abs((image.rgba[offset+c]??0)-value));
   if(halo[n]){if(delta.some(value=>value>=42)){onConflict?.(n);return 'refused';}continue;}
   total++;if(delta.some(value=>value>18)){onConflict?.(n);return 'refused';}if(delta.every(value=>value<=3))supported++;
  }
  return {total,supported};
 };
}
module.exports={createCoreBackgroundRanges};
