// @ts-check
"use strict";
const {types}=require('node:util');
const {encodeNativeFreeformPath,decodeNativeFreeformPath,isClosedNativeFreeformSurface}=require('./native-freeform-path');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{box:Box,segments:import('./native-freeform-path').Segment[]}} Part */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))
 &&Reflect.ownKeys(v).length===Object.keys(v).length
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** Validate the complete measured paint representation before any consumer
 * writes objects. A union frame is observation metadata, never authorization
 * to fill its gaps. This parser grants no source, node or attachment rights.
 * The caller must supply independently measured source evidence.
 * @param {unknown} value @param {{width:number,height:number}} image
 * @returns {Part[]} */
function parseScenePaintParts(value,image){
 if(!record(value)||!box(value.box)||!record(image)
  ||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||value.box.x+value.box.w>image.width||value.box.y+value.box.h>image.height
  ||value.box.w*value.box.h>262144||typeof value.fill!=='string'||!/^#[a-f0-9]{6}$/iu.test(value.fill)
  ||typeof value.support!=='number'||!Number.isFinite(value.support)||value.support<.58||value.support>1
  ||value.segments!==undefined)throw new TypeError('Scene paint parts input is invalid');
 const parts=value.parts;
 if(!Array.isArray(parts)||types.isProxy(parts)||Object.getPrototypeOf(parts)!==Array.prototype
  ||parts.length<1||parts.length>32||Reflect.ownKeys(parts).length!==parts.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(parts)).some(p=>!('value' in p)))
  throw new TypeError('Scene paint parts collection is invalid');
 const bounds=value.box;
 return parts.map(raw=>{
  if(!record(raw)||!box(raw.box)||raw.box.x<bounds.x||raw.box.y<bounds.y
   ||raw.box.x+raw.box.w>bounds.x+bounds.w||raw.box.y+raw.box.h>bounds.y+bounds.h)
   throw new TypeError('Scene paint part frame is invalid');
  const segments=decodeNativeFreeformPath(encodeNativeFreeformPath(raw.segments));
  if(!isClosedNativeFreeformSurface({freeformSegments:segments}))throw new TypeError('Scene paint part is open');
  return {box:{...raw.box},segments};
 });
}
module.exports={parseScenePaintParts};
