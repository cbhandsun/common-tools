// @ts-check
'use strict';
const {types}=require('node:util');
const {sharedOutputWork,sharedOutputRecord,sharedOutputList,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
const {record}=require('../scene-plan/source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-route-paint').RoutePaint} Paint */
/** @typedef {import('./source-shared-route-output-snapshot').Work} Work */
/** @typedef {{points:Point[],indices:number[],samples:Point[],paint:Paint,sourceOrigin:Point,widthPx:number,sx:number,sy:number,work:Work,sourceInk:(Point&{index:number})[]}} ChainInput */
/** @param {unknown} n @param {number} low @param {number} high @returns {n is number} */
const finite=(n,low,high)=>typeof n==='number'&&Number.isFinite(n)&&n>=low&&n<=high;
/** @param {Work} work @returns {never} */
function invalid(work){throw new TypeError(work.checks>4000000?'Scene shared path binding failed: shared-geometry-budget':'Native route chain input is invalid');}
/** No source proof is issued here. Snapshot only the fields consumed by the
 * fitter, and reject proxies/accessors before reading caller-owned properties.
 * @param {unknown} value @returns {ChainInput} */
function parseNativeRouteChainInput(value){
 if(!record(value)||!sharedOutputWork(value.work))throw new TypeError('Native route chain controls are invalid');
 const work=value.work;
 /** @param {unknown} row @returns {Record<string,unknown>} */
 const obj=row=>{if(!sharedOutputRecord(row,work))return invalid(work);return row;};
 /** @param {unknown} row @param {number} low @param {number} high @returns {unknown[]} */
 const array=(row,low,high)=>{
  if(!Array.isArray(row)||types.isProxy(row)||row.length<low||row.length>high||!sharedOutputList(row,work))return invalid(work);return row;
 };
 /** @param {unknown} row @param {number} high @returns {Point[]} */
 const points=(row,high)=>array(row,2,high).map(raw=>{
  const p=obj(raw);if(!finite(p.x,-100000,100000)||!finite(p.y,-100000,100000))return invalid(work);return {x:p.x,y:p.y};
 });
 obj(value);
 const route=points(value.points,120),samples=points(value.samples,512),indices=array(value.indices,route.length,route.length);
 let sourceOrigin={x:0,y:0};
 if(value.sourceOrigin!==undefined){
  const origin=obj(value.sourceOrigin);if(!finite(origin.x,-100000,100000)||!finite(origin.y,-100000,100000))return invalid(work);
  sourceOrigin={x:origin.x,y:origin.y};
 }
 if(route.some((p,i)=>i>0&&Math.hypot(p.x-(route[i-1]?.x??NaN),p.y-(route[i-1]?.y??NaN))<1e-9))return invalid(work);
 for(let i=0;i<indices.length;i++){
  const n=indices[i];if(!finite(n,0,samples.length-1)||!Number.isInteger(n)||i>0&&n<=Number(indices[i-1]))return invalid(work);
 }
 if(indices[0]!==0||indices.at(-1)!==samples.length-1||!finite(value.widthPx,.01,64)
  ||!finite(value.sx,1e-9,100000)||!finite(value.sy,1e-9,100000))return invalid(work);
 const raw=obj(value.paint);
 const sourceInk=value.sourceInk===undefined?[]:array(value.sourceInk,0,8192).map(value=>{
  const p=obj(value);if(!finite(p.x,-100000,100000)||!finite(p.y,-100000,100000)||!finite(p.index,0,samples.length-1)||!Number.isInteger(p.index))return invalid(work);
  return {x:p.x,y:p.y,index:p.index};
 });
 /** @param {unknown} color @returns {color is string} */
 const hex=color=>typeof color==='string'&&/^#[0-9a-f]{6}$/iu.test(color);
 if(!hex(raw.color)||!hex(raw.startColor)||!hex(raw.endColor)||!finite(raw.support,.9,1))return invalid(work);
 /** @type {Paint} */const paint={color:raw.color,startColor:raw.startColor,endColor:raw.endColor,support:raw.support};
 /** @param {unknown} row @returns {import('./source-route-paint').Stop[]} */
 const stops=row=>{
  const result=array(row,2,6).map(item=>{const s=obj(item);if(!finite(s.position,0,1)||!hex(s.color))return invalid(work);return {position:s.position,color:s.color};});
  if(result[0]?.position!==0||result.at(-1)?.position!==1||result.some((s,i)=>i>0&&s.position<=(result[i-1]?.position??0)))return invalid(work);return result;
 };
 if(raw.stops!==undefined||raw.positions!==undefined){
  paint.stops=stops(raw.stops);
  const values=array(raw.positions,samples.length,samples.length);
  for(let i=0;i<values.length;i++)if(!finite(values[i],0,1)||i>0&&Number(values[i])<Number(values[i-1]))return invalid(work);
  paint.positions=/** @type {number[]} */(values.slice());
 }
 if(raw.spatial!==undefined){
  const s=obj(raw.spatial);
  if(!paint.stops||!['x','y'].includes(/** @type {string} */(s.axis))||!finite(s.origin,-100000,100000)||!finite(s.support,.9,1))return invalid(work);
  const base={axis:/** @type {'x'|'y'} */(s.axis),origin:s.origin,support:s.support};
  if(s.stops!==undefined){
   if(!finite(s.span,1e-9,200000)||s.color!==undefined||s.step!==undefined)return invalid(work);
   paint.spatial={...base,span:s.span,stops:stops(s.stops)};
  }else{
   const color=array(s.color,3,3),step=array(s.step,3,3);
   if(color.some(v=>!finite(v,0,255))||step.some(v=>!finite(v,-1e6,1e6)))return invalid(work);
   paint.spatial={...base,color:/** @type {number[]} */(color.slice()),step:/** @type {number[]} */(step.slice())};
  }
 }
 if(!chargeSharedOutput(work,route.length+samples.length+indices.length+32))return invalid(work);
 return {points:route,samples,indices:/** @type {number[]} */(indices.slice()),paint,sourceOrigin,widthPx:value.widthPx,sx:value.sx,sy:value.sy,work,sourceInk};
}
module.exports={parseNativeRouteChainInput};
