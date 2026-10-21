// @ts-check
"use strict";
const {types}=require("node:util");
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{x:number,y:number,w:number,h:number}} Window */
/** @typedef {{image:Raster,budget:{used:number},tiles:Map<number,{known:Uint8Array,rgba:Buffer}>,windows:Map<string,Raster>,windowPixels:number}} Scope */
/** @type {WeakMap<object,Scope>} */const scopes=new WeakMap();
/** @type {Scope|null} */let active=null;
/** Retain private source bytes across the bounded review, never measurement
 * decisions or ownership. Only this source buffer and budget can open it.
 * @param {Raster} image @param {{used:number}} budget */
function createSceneFillRasterScope(image,budget){
 let scope;
 withSceneFillRasterCache(image,budget,()=>{scope=active;});
 const token=Object.freeze({});if(!scope)throw new TypeError('Scene fill cache scope is unavailable');
 scopes.set(token,scope);return token;
}
/** @template T @param {Raster} image @param {{used:number}} budget @param {unknown} token @param {()=>T} measure @returns {T} */
function withSceneFillRasterScope(image,budget,token,measure){
 const scope=token!==null&&typeof token==='object'?scopes.get(token):undefined;
 if(!scope||scope.image.rgba!==image.rgba||scope.image.width!==image.width||scope.image.height!==image.height
  ||scope.budget!==budget||typeof measure!=='function')throw new TypeError('Scene fill cache binding is invalid');
 const previous=active;active=scope;try{return withSceneFillRasterCache(image,budget,measure);}finally{active=previous;}
}
/** One synchronous container measurement owns the source while testing its
 * independently sampled colors. Cache exact source windows, not color masks.
 * A different predicate still performs its complete original component proof.
 * @template T @param {Raster} image @param {{used:number}} budget @param {()=>T} measure @returns {T} */
function withSceneFillRasterCache(image,budget,measure){
 if(!record(image)||!record(budget)||typeof measure!=="function"||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||image.width*image.height>40000000||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||!Number.isSafeInteger(budget.used)||budget.used<0)throw new TypeError("Scene fill cache scope is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",image.rgba),length=Reflect.get(proto,"length",image.rgba);
 if(!types.isArrayBuffer(buffer)||length!==image.width*image.height*4)throw new TypeError("Scene fill cache source is invalid");
 if(active?.image.rgba===image.rgba&&active.image.width===image.width&&active.image.height===image.height&&active.budget===budget)return measure();
 const previous=active;active={image:{width:image.width,height:image.height,rgba:image.rgba},budget,tiles:new Map(),windows:new Map(),windowPixels:0};
 try{return measure();}finally{active=previous;}
}
/** Validate a bounded read and count only unknown cells in its private scope.
 * This observes cache metadata, never source bytes, ownership or a caller's
 * declared hit count. The returned plan is used synchronously and is private.
 * @param {Raster} image @param {Window} window @param {{used:number}} budget */
function rasterReadPlan(image,window,budget){
 if(!record(image)||!record(window)||!record(budget)||![image.width,image.height].every(v=>Number.isSafeInteger(v)&&v>0&&v<=16384)
  ||image.width*image.height>40000000||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||!Number.isSafeInteger(budget.used)||budget.used<0)throw new TypeError("Scene fill cache input is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",image.rgba),length=Reflect.get(proto,"length",image.rgba);
 if(!types.isArrayBuffer(buffer)||length!==image.width*image.height*4)throw new TypeError("Scene fill cache pixels are invalid");
 const {x,y,w,h}=window,area=w*h;
 if(![x,y,w,h].every(Number.isSafeInteger)||x<0||y<0||w<=0||h<=0||area>262144||x+w>image.width||y+h>image.height)
  throw new TypeError("Scene fill cache window is invalid");
 const scope=active?.image.rgba===image.rgba&&active.image.width===image.width&&active.image.height===image.height&&active.budget===budget?active:null,key=`${x},${y},${w},${h}`;
 const existing=scope?.windows.get(key);if(existing)return {scope,key,newPixels:0,existing};
 // Fixed tiles make lookup independent of the number of prior windows and
 // store each observed cell once. Unobserved tile cells never count as reads.
 const columns=Math.ceil(image.width/64);
 let reused=0;
 for(let row=y;scope&&row<y+h;row++)for(let col=x;col<x+w;col++){
  const tile=scope.tiles.get(Math.floor(row/64)*columns+Math.floor(col/64));
  if(tile?.known[(row%64)*64+col%64])reused++;
 }
 return {scope,key,newPixels:area-reused,existing:undefined};
}
/** A read-only estimate, not a reservation or a reusable authorization. A
 * later read revalidates and charges against the current shared allowance.
 * @param {Raster} image @param {Window} window @param {{used:number}} budget */
function sceneFillRasterReadCost(image,window,budget){return rasterReadPlan(image,window,budget).newPixels;}
/** Charge each newly read source cell to the same original 4M allowance.
 * Different geometry and text predicates retain their independent proofs.
 * @param {Raster} image @param {Window} window @param {{used:number}} budget @returns {Raster} */
function readSceneFillRaster(image,window,budget){
 const {scope,key,newPixels,existing}=rasterReadPlan(image,window,budget);
 if(existing)return existing;
 const {x,y,w,h}=window,area=w*h,columns=Math.ceil(image.width/64);
 if(budget.used+newPixels>4000000)throw new RangeError("Scene container scan exceeds the pixel budget");
 budget.used+=newPixels;
 const rgba=Buffer.alloc(area*4);
 for(let row=0;row<h;row++)for(let col=0;col<w;col++){
  const px=x+col,py=y+row,destination=(row*w+col)*4;
  const tileKey=Math.floor(py/64)*columns+Math.floor(px/64),cell=(py%64)*64+px%64;
  let tile=scope?.tiles.get(tileKey);
  const cached=tile?.known[cell],source=cached&&tile?tile.rgba:image.rgba,begin=cached?cell*4:(py*image.width+px)*4;
  for(let byte=0;byte<4;byte++)rgba[destination+byte]=source[begin+byte]??0;
  if(scope&&!cached){
   if(!tile){tile={known:new Uint8Array(4096),rgba:Buffer.alloc(16384)};scope.tiles.set(tileKey,tile);}
   tile.known[cell]=1;for(let byte=0;byte<4;byte++)tile.rgba[cell*4+byte]=rgba[destination+byte]??0;
  }
 }
 const result={width:w,height:h,rgba};
 // Exact-window identity is a small optimization, not the source store. Keep
 // at most one original per-window allowance of redundant raster copies.
 if(scope){while(scope.windowPixels+area>262144&&scope.windows.size){const first=scope.windows.entries().next().value;
   if(!first)break;scope.windows.delete(first[0]);scope.windowPixels-=first[1].width*first[1].height;}
  scope.windows.set(key,result);scope.windowPixels+=area;}
 return result;
}
module.exports={withSceneFillRasterCache,readSceneFillRaster,sceneFillRasterReadCost,createSceneFillRasterScope,withSceneFillRasterScope};
