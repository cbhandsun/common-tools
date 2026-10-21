// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{type:string,points:{x:number,y:number}[]}} Segment */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @param {number} limit @returns {unknown[]} */
function list(v,limit){if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>limit
 ||Reflect.ownKeys(v).length!==v.length+1||Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!("value" in p)))throw new TypeError("Native freeform path collection is invalid");return v;}
const names=["moveTo","lnTo","cubicBezTo","quadBezTo","close"],sizes=[1,1,3,2,0];
/** A bounded command stream encodes the same double coordinates and winding.
 * It is a transport representation, not a raster/vector approximation. Every
 * decoder retains the original 120-command / three-control-point limits.
 * @param {unknown} value @returns {Segment[]} */
function decodeNativeFreeformPath(value){
 if(typeof value!=="string"||value.length<3||value.length>32768)throw new TypeError("Native freeform path payload is invalid");
 /** @type {unknown} */let raw;
 try{raw=JSON.parse(value);}catch{throw new TypeError("Native freeform path payload is invalid");}
 const rows=list(raw,120);if(!rows.length)throw new TypeError("Native freeform path is empty");
 return rows.map((row,index)=>{
  const tuple=list(row,7),code=tuple[0];
  if(typeof code!=="number"||!Number.isSafeInteger(code)||code<0||code>4||index===0&&code!==0
   ||tuple.length!==1+2*(sizes[code]??0))throw new TypeError("Native freeform path command is invalid");
  /** @type {{x:number,y:number}[]} */const points=[];
  for(let i=1;i<tuple.length;i+=2){const x=tuple[i],y=tuple[i+1];
   if(typeof x!=="number"||typeof y!=="number"||![x,y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError("Native freeform path point is invalid");points.push({x,y});}
  return {type:names[code]??"",points};
 });
}
/** @param {unknown} value @returns {string} */
function encodeNativeFreeformPath(value){
 const rows=list(value,120).map(segment=>{
  if(!record(segment)||typeof segment.type!=="string")throw new TypeError("Native freeform segment is invalid");
  const code=names.indexOf(segment.type),points=list(segment.points,3);
  if(code<0||points.length!==sizes[code])throw new TypeError("Native freeform segment is invalid");
  return [code,...points.flatMap(point=>{if(!record(point)||typeof point.x!=="number"||typeof point.y!=="number"
   ||![point.x,point.y].every(v=>Number.isFinite(v)&&v>=0&&v<=1))throw new TypeError("Native freeform point is invalid");return [point.x,point.y];})];
 });
 const encoded=JSON.stringify(rows);decodeNativeFreeformPath(encoded);return encoded;
}
/** Legacy geometry keeps its existing consumer validation. A compact payload
 * must never override a second, conflicting geometry authority.
 * @param {unknown} style @returns {unknown} */
function readNativeFreeformSegments(style){
 if(!record(style))throw new TypeError("Native freeform style is invalid");
 if(style.freeformPath===undefined)return style.freeformSegments;
 if(style.freeformSegments!==undefined)throw new TypeError("Native freeform geometry is ambiguous");
 return decodeNativeFreeformPath(style.freeformPath);
}
/** A closed compound surface has no open subpath. This describes geometry,
 * never semantic ownership or permission to erase source pixels.
 * Reuse the same bounded codec for compact and expanded representations.
 * @param {unknown} style @returns {boolean} */
function isClosedNativeFreeformSurface(style){
 if(!record(style))throw new TypeError("Native freeform style is invalid");
 const raw=readNativeFreeformSegments(style);
 if(raw===undefined)return false;
 const segments=decodeNativeFreeformPath(encodeNativeFreeformPath(raw));
 let open=false,drawn=0,closed=0;
 for(const segment of segments){
  if(segment.type==="moveTo"){if(open)return false;open=true;drawn=0;}
  else if(segment.type==="close"){if(!open||drawn<2)return false;open=false;closed++;}
  else{if(!open)return false;drawn++;}
 }
 return !open&&closed>0;
}
/** Atomically replace expanded paths with reversible bounded command streams.
 * Geometry, native IDs, styling, ownership and source evidence are unchanged.
 * The deck tree's 30,000-node limit remains unchanged.
 * @param {unknown} deck @returns {unknown} */
function compactNativeFreeformPaths(deck){
 if(!record(deck))throw new TypeError("Native freeform deck is invalid");
 /** @type {{style:Record<string,unknown>,path:string}[]} */const pending=[];
 for(const page of list(deck.pages,10000)){
  if(!record(page))throw new TypeError("Native freeform page is invalid");
  for(const item of list(page.shapes??[],10000)){
   if(!record(item))throw new TypeError("Native freeform shape is invalid");
   if(item.type!=="freeform"||item.style===undefined)continue;
   if(!record(item.style))throw new TypeError("Native freeform style is invalid");
   const style=item.style;
   if(style.freeformPath!==undefined){readNativeFreeformSegments(style);continue;}
   if(style.freeformSegments===undefined)continue;
   const path=encodeNativeFreeformPath(style.freeformSegments);
   const original=Object.getOwnPropertyDescriptor(style,"freeformSegments"),destination=Object.getOwnPropertyDescriptor(style,"freeformPath");
   if(!original?.configurable||!original.enumerable||!Object.isExtensible(style)
    ||destination&&(!destination.writable||!destination.enumerable))throw new TypeError("Native freeform style is immutable");
   pending.push({style,path});
  }
 }
 for(const {style,path}of pending){delete style.freeformSegments;style.freeformPath=path;}
 return deck;
}
module.exports={encodeNativeFreeformPath,decodeNativeFreeformPath,readNativeFreeformSegments,isClosedNativeFreeformSurface,compactNativeFreeformPaths};
