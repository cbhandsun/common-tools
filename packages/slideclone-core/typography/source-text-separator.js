// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{sx:number,sy:number,left:number,right:number,top:number,bottom:number}} Window */
/** @typedef {{id:string,seed:Box|null,region:Box,color:number[]|null,window:Window}} Entry */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is unknown[]} */
function array(value){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is number} */
function finite(value){return typeof value==="number"&&Number.isFinite(value);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(finite)
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** @param {Raster} image @param {Entry[]} entries */
function validate(image,entries){
 if(!record(image)||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||!types.isArrayBuffer(Reflect.get(Object.getPrototypeOf(Uint8Array.prototype),"buffer",image.rgba))
  ||Reflect.get(Object.getPrototypeOf(Uint8Array.prototype),"length",image.rgba)!==image.width*image.height*4
  ||!array(entries)||entries.length>2000)throw new TypeError("Source text separator input is invalid");
 const ids=new Set();
 for(const entry of entries){
  if(!record(entry)||typeof entry.id!=="string"||!entry.id||entry.id.length>256||ids.has(entry.id)
   ||!box(entry.region)||entry.seed!==null&&!box(entry.seed)||!record(entry.window)
   ||![entry.window.sx,entry.window.sy].every(n=>finite(n)&&n>0)
   ||![entry.window.left,entry.window.right,entry.window.top,entry.window.bottom].every(Number.isSafeInteger)
   ||entry.window.left<0||entry.window.top<0||entry.window.right>image.width||entry.window.bottom>image.height
   ||entry.window.right<entry.window.left||entry.window.bottom<entry.window.top
   ||[entry.region,...(entry.seed?[entry.seed]:[])].some(b=>b.x+b.w>image.width/entry.window.sx||b.y+b.h>image.height/entry.window.sy)
   ||entry.color!==null&&(!array(entry.color)||entry.color.length!==3||!entry.color.every(c=>Number.isInteger(c)&&c>=0&&c<=255)))
    throw new TypeError("Source text separator entries are invalid");
  ids.add(entry.id);
 }
}
/** @param {Entry} entry @param {Raster} image */
function expanded(entry,image){const b=entry.region,{sx,sy}=entry.window;
 return {sx,sy,left:Math.max(0,Math.floor((b.x-8)*sx)),right:Math.min(image.width,Math.ceil((b.x+b.w+8)*sx)),
  top:Math.max(0,Math.floor((b.y-8)*sy)),bottom:Math.min(image.height,Math.ceil((b.y+b.h+8)*sy))};}
/** @param {Window} a @param {Window} b */
function overlap(a,b){return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;}
/** Resolve overlapping OCR hints only with a unique opaque source whitespace
 * separator AND complete, uncensored ink on both sides. The caller's ordinary
 * conflict and boundary checks still apply. No text or font is inferred here.
 * All extra source projections and validation scans debit the same 20M budget.
 * @param {Raster} image @param {Entry[]} entries
 * @param {(image:Raster,window:Window,color:number[])=>Box|null} measureComplete */
function partitionSourceTextOverlaps(image,entries,measureComplete){
 validate(image,entries);if(typeof measureComplete!=="function")throw new TypeError("Source text separator measurement is invalid");
 let samples=0;
 /** @param {number} area */
 const charge=area=>{samples+=area;if(samples>20000000)throw new RangeError("source text ink sampling exceeds the processing boundary");};
 for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
  let a=entries[i],b=entries[j];if(!a?.seed||!b?.seed||!a.color||!b.color)continue;
  const u=a.seed,v=b.seed;
  if(u.x>=v.x+v.w||v.x>=u.x+u.w||u.y>=v.y+v.h||v.y>=u.y+u.h)continue;
  const containsY=u.y<=v.y&&u.y+u.h>=v.y+v.h||v.y<=u.y&&v.y+v.h>=u.y+u.h;
  const containsX=u.x<=v.x&&u.x+u.w>=v.x+v.w||v.x<=u.x&&v.x+v.w>=u.x+u.w;
  const horizontal=containsY&&(u.x<v.x&&u.x+u.w<v.x+v.w||v.x<u.x&&v.x+v.w<u.x+u.w);
  const vertical=containsX&&(u.y<v.y&&u.y+u.h<v.y+v.h||v.y<u.y&&v.y+v.h<u.y+u.h);
  if(horizontal===vertical)continue;
  if(horizontal?u.x>v.x:u.y>v.y)[a,b]=[b,a];
  if(!a.seed||!b.seed||!a.color||!b.color)continue;
  // Preserve narrowing already established by another independently proven pair.
  const aw={...expanded(a,image)},bw={...expanded(b,image)};
  const lo=Math.ceil((horizontal?b.seed.x:b.seed.y)*(horizontal?aw.sx:aw.sy));
  const hi=Math.floor((horizontal?a.seed.x+a.seed.w:a.seed.y+a.seed.h)*(horizontal?aw.sx:aw.sy));
  const acrossLo=horizontal?Math.min(aw.top,bw.top):Math.min(aw.left,bw.left);
  const acrossHi=horizontal?Math.max(aw.bottom,bw.bottom):Math.max(aw.right,bw.right);
  if(hi-lo<2)continue;charge((hi-lo)*(acrossHi-acrossLo));
  /** @type {{start:number,end:number}[]} */const runs=[];let start=/** @type {number|null} */(null);
  for(let along=lo;along<hi;along++){
   let empty=true;
   for(let across=acrossLo;across<acrossHi;across++){
    const x=horizontal?along:across,y=horizontal?across:along,o=(y*image.width+x)*4;
    if((image.rgba[o+3]??0)<160||[a.color,b.color].some(color=>color?.every((c,k)=>Math.abs((image.rgba[o+k]??0)-c)<=65)))empty=false;
   }
   if(empty&&start===null)start=along;
   if((!empty||along===hi-1)&&start!==null){const end=empty?along+1:along;if(end-start>=2)runs.push({start,end});start=null;}
  }
  const run=runs[0];if(runs.length!==1||!run)continue;
  const split=Math.floor((run.start+run.end)/2);
  if(horizontal){aw.right=Math.min(aw.right,split);bw.left=Math.max(bw.left,split);}
  else{aw.bottom=Math.min(aw.bottom,split);bw.top=Math.max(bw.top,split);}
  if(entries.some(e=>e!==a&&e!==b&&[aw,bw].some(w=>overlap(w,e.window))))continue;
  charge((aw.right-aw.left)*(aw.bottom-aw.top)+(bw.right-bw.left)*(bw.bottom-bw.top));
  if(!measureComplete(image,aw,a.color)||!measureComplete(image,bw,b.color))continue;
  if(horizontal){a.window.right=Math.min(a.window.right,split);b.window.left=Math.max(b.window.left,split);}
  else{a.window.bottom=Math.min(a.window.bottom,split);b.window.top=Math.max(b.window.top,split);}
 }
 return samples;
}
module.exports={partitionSourceTextOverlaps};
