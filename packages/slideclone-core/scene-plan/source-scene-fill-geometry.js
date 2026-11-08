// @ts-check
"use strict";
const {types}=require('node:util');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {splitNativeBackground}=require('./native-background-parts');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {NonNullable<ReturnType<typeof traceNativeMaskContours>>} Segments */
/** @typedef {{segments?:Segments,parts?:{box:Box,segments:Segments}[]}} Geometry */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Geometry receives only an already observed component, never the source
 * raster, scan ledger, glyph capability or permission to expand a window.
 * A result describes paint geometry only; the caller retains source admission
 * and registers its private ownership after this calculation succeeds.
 * @param {unknown} input @returns {Geometry|null} */
function fitSceneFillGeometry(input){return fitPreparedSceneFillGeometry(parseSceneFillGeometry(input));}
/** @param {unknown} input */
function parseSceneFillGeometry(input){
 if(!record(input)||!record(input.box)||!Array.isArray(input.points)||types.isProxy(input.points)
  ||Object.getPrototypeOf(input.points)!==Array.prototype||input.points.length>262144
  ||Reflect.ownKeys(input.points).length!==input.points.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.points)).some(p=>!('value' in p))
  ||typeof input.wide!=='boolean'||typeof input.bridged!=='boolean'||typeof input.compound!=='boolean')
  throw new TypeError('Scene fill geometry input is invalid');
 const {x,y,w,h}=input.box;
 if(![x,y,w,h].every(v=>typeof v==='number'&&Number.isSafeInteger(v))
  ||Number(x)<0||Number(y)<0||Number(w)<=0||Number(h)<=0
  ||Number(x)+Number(w)>16384||Number(y)+Number(h)>16384||Number(w)*Number(h)>262144)
  throw new TypeError('Scene fill geometry frame is invalid');
 const box={x:Number(x),y:Number(y),w:Number(w),h:Number(h)};
 const points=input.points.map(point=>{
  if(!record(point)||typeof point.x!=='number'||typeof point.y!=='number'
   ||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)
   ||point.x<box.x||point.x>=box.x+box.w||point.y<box.y||point.y>=box.y+box.h)
   throw new TypeError('Scene fill geometry cell is invalid');
  return {x:point.x,y:point.y};
 });
 return {box,points,wide:input.wide,bridged:input.bridged,compound:input.compound};
}
/** Internal compiler components already passed the source scanner. Worker
 * messages use parseSceneFillGeometry before entering this pure calculation.
 * @param {ReturnType<typeof parseSceneFillGeometry>} input @returns {Geometry|null} */
function fitPreparedSceneFillGeometry(input){
 const {points,box}=input;
 if(!points.length)return null;
 const state={checks:0,exhausted:false},fastFail=input.wide&&input.bridged;
 const segments=traceNativeMaskContours(points,box,{outerOnly:true,curveFallback:true,minimizeSegments:input.bridged,
  workState:state,fastFail})
  ||(!input.wide&&!input.compound&&!state.exhausted?traceNativeMaskContours(points,box,{tolerancePx:1,outerOnly:true,curveFallback:true,
   minimizeSegments:input.bridged,workState:state}):null);
 if(!segments){
  const parts=!state.exhausted?splitNativeBackground({points,box},state):null;
  if(!parts){const coarse=!input.compound&&!state.exhausted?traceNativeMaskContours(points,box,{tolerancePx:1,outerOnly:true,curveFallback:true,minimizeSegments:input.bridged,workState:state}):null;return coarse?{segments:coarse}:null;}
  const first=parts[0];
  const single=!input.compound&&parts.length===1&&first
   &&first.box.x===box.x&&first.box.y===box.y&&first.box.w===box.w&&first.box.h===box.h?first:null;
  return single?{segments:single.segments}:{parts};
 }
 const rectangle=segments.length===5&&segments.filter(s=>s.type!=='close')
  .every(s=>s.points.every(p=>[0,1].includes(p.x)&&[0,1].includes(p.y)));
 return input.compound?{parts:[{box,segments}]}:rectangle?{}:{segments};
}
module.exports={fitSceneFillGeometry,parseSceneFillGeometry,fitPreparedSceneFillGeometry};
