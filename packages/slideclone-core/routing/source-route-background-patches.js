// @ts-check
'use strict';
/** @typedef {number[]|'refused'|null} Patch
 * @typedef {import('./source-route-antialias-background').Raster} Raster
 * @typedef {import('./source-route-antialias-background').Box} Box */
const LIMIT=4000000;
/** Cache only complete physical 3x3 patches within one immutable observer.
 * Missing/noisy/halo samples are unavailable; bodies, transparency and hard
 * color contradictions remain refusals. Budget failure caches no evidence.
 * @param {{image:Raster,window:Box,halo:Uint8Array,blocked:Uint8Array,work:{checks:number}}} input */
function createCoreBackgroundPatches({image,window,halo,blocked,work}){
 /** @type {Map<string,Patch>} */const patches=new Map();
 /** @param {number} cost */const charge=cost=>{work.checks+=cost;return work.checks<=LIMIT;};
 /** @param {number} x @param {number} y @returns {Patch} */
 return function patchAt(x,y){
  if(!charge(1))return null;
  const key=x+','+y;if(patches.has(key))return patches.get(key)??null;
  /** @param {Patch} value */const save=value=>{patches.set(key,value);return value;};
  /** @type {number[][]} */const colors=[];
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   if(!charge(5))return null;
   const px=x+dx,py=y+dy;if(px<0||py<0||px>=window.w||py>=window.h)return save(null);
   const n=py*window.w+px,offset=((window.y+py)*image.width+window.x+px)*4;
   if(blocked[n]||image.rgba[offset+3]!==255)return save('refused');
   if(halo[n])return save(null);
   colors.push([0,1,2].map(c=>image.rgba[offset+c]??0));
  }
  const mean=[0,1,2].map(c=>colors.reduce((sum,p)=>sum+(p[c]??0),0)/9);
  if(colors.some(p=>p.some((v,c)=>Math.abs(v-(mean[c]??0))>18)))return save('refused');
  if(colors.some(p=>p.some((v,c)=>Math.abs(v-(mean[c]??0))>3)))return save(null);
  return save(mean);
 };
}
module.exports={createCoreBackgroundPatches};
