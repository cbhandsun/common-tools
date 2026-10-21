// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{r:number,g:number,b:number,contrast:number}} Sample */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {number} maximum @returns {value is unknown[]} */
function list(value,maximum){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** A source color can vary with coverage of the same opaque paint. This veto
 * uses retained source observations only; it never proves a new color, glyph,
 * split, background or erasure. Call only when paint-transition evidence was
 * inconclusive, preserving independently corroborated gray/color transitions.
 * @param {unknown} input */
function sourcePaintCoverageVariation(input){
 if(!record(input)||!record(input.background)||!list(input.groups,4)||input.groups.length<2
  ||![input.background.r,input.background.g,input.background.b].every(v=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=255))
  throw new TypeError("Source paint coverage frame is invalid");
 /** @type {Sample[][]} */const groups=[];let count=0;
 for(const raw of input.groups){
  if(!list(raw,131072))throw new TypeError("Source paint coverage samples are invalid");
  count+=raw.length;if(count>131104)throw new RangeError("Source paint coverage samples exceed the boundary");
  /** @type {Sample[]} */const group=[];
  for(const value of raw){
   if(!record(value)||![value.r,value.g,value.b].every(v=>typeof v==="number"&&Number.isSafeInteger(v)&&v>=0&&v<=255)
    ||typeof value.contrast!=="number"||!Number.isFinite(value.contrast)||value.contrast<0||value.contrast>442)
    throw new TypeError("Source paint coverage samples are invalid");
   group.push({r:Number(value.r),g:Number(value.g),b:Number(value.b),contrast:value.contrast});
  }
  groups.push(group);
 }
 if(groups.some(group=>group.length<8))return false;
 const cores=groups.map(group=>group.sort((a,b)=>b.contrast-a.contrast).slice(0,Math.max(8,Math.ceil(group.length*.1))));
 const strongest=cores.flat().sort((a,b)=>b.contrast-a.contrast).slice(0,8);
 const paint=["r","g","b"].map(channel=>strongest.reduce((sum,sample)=>sum+sample[/** @type {'r'|'g'|'b'} */(channel)],0)/8);
 // One extreme compression artifact cannot establish the common paint.
 if(strongest.some(sample=>Math.max(...[sample.r,sample.g,sample.b].map((v,c)=>Math.abs(v-(paint[c]??0))))>18))return false;
 const background=[Number(input.background.r),Number(input.background.g),Number(input.background.b)];
 const delta=background.map((value,c)=>value-(paint[c]??0)),norm=delta.reduce((sum,d)=>sum+d*d,0);
 if(!norm)return false;
 return cores.every(group=>group.filter(sample=>{
  const rgb=[sample.r,sample.g,sample.b];
  const coverage=Math.max(0,Math.min(1,rgb.reduce((sum,value,c)=>sum+(value-(paint[c]??0))*(delta[c]??0),0)/norm));
  return Math.max(...rgb.map((value,c)=>Math.abs(value-((paint[c]??0)+coverage*(delta[c]??0)))))<=18;
 }).length/group.length>=.82);
}
module.exports={sourcePaintCoverageVariation};
