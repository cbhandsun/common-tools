// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list,box}=require('../scene-plan/source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
const {sourceRouteLocalBackground,hasRouteLocalBackground}=require('./source-route-local-background');
const {sourceRouteBodyShadowSpans}=require('./source-route-body-shadow-spans');
const activeNodeBackgrounds = new WeakSet();
/** @param {unknown} value */
function hasRouteNodeBackground(value) { return typeof value === 'function' && activeNodeBackgrounds.has(value); }

/** A multi-node window need not end at either side of any one body. Observe
 * each body's actual transverse span inside the ALREADY charged raster, so
 * the existing body-anchored backdrop certificate can see both real flanks.
 * Never extrapolate past a span or average disagreeing certificates. This
 * estimates background only; it grants no paint, erasure or port authority.
 * @param {unknown} input @returns {(index:number)=>number[]} */
function sourceRouteNodeBackground(input){
 if(!record(input)||!list(input.bodies)||input.bodies.length>32||!list(input.background)||input.background.length!==3
  ||input.background.some(v=>typeof v!=='number'||!Number.isFinite(v)||v<0||v>255)
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0||Number(input.work.checks)>4000000)
  throw new TypeError('Route node backdrop input is invalid');
 const image=sourceRaster(input.image),area=image.width*image.height,background=/** @type {number[]} */(input.background),work=input.work;
 if(area>262144)throw new RangeError('Route node backdrop exceeds the unit budget');
 /** @type {{box:import('../scene-plan/source-scene-plan').Box,mask:Uint8Array}[]} */const bodies=[];
 for(const row of input.bodies){
  if(!record(row)||!box(row.box)||![row.box.x,row.box.y,row.box.w,row.box.h].every(Number.isSafeInteger)
   ||row.box.x+row.box.w>image.width||row.box.y+row.box.h>image.height||types.isProxy(row.mask)||!types.isUint8Array(row.mask))
   throw new TypeError('Route node backdrop body is invalid');
  const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,'buffer',row.mask);
  if(!types.isArrayBuffer(buffer)||Reflect.get(prototype,'length',row.mask)!==area)throw new TypeError('Route node backdrop mask is invalid');
  bodies.push({box:row.box,mask:new Uint8Array(buffer,Reflect.get(prototype,'byteOffset',row.mask),area)});
 }
 /** @type {{box:import('../scene-plan/source-scene-plan').Box,at:(index:number)=>number[]}[]} */const fields=[];
 for(const body of bodies){
  const spans=sourceRouteBodyShadowSpans(body,image.width,image.height,/** @type {{checks:number}} */(work));
  if(!spans)return ()=>background;
  for(const span of spans){
  const at=sourceRouteLocalBackground({image,body:body.mask,window:span,background,work});
  if(Number(work.checks)>4000000)return ()=>background;
  if(hasRouteLocalBackground(at))fields.push({box:span,at});
  }
 }
 // Index the already certified fields by row once. A raster query visits only
 // certificates that can contain it, preserving overlap disagreement checks
 // and the original shared ledger instead of multiplying area by all nodes.
 /** @type {Map<number,typeof fields>} */const rows=new Map();
 for(const field of fields)for(let y=field.box.y;y<field.box.y+field.box.h;y++){
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return ()=>background;
  const row=rows.get(y);if(row)row.push(field);else rows.set(y,[field]);
 }
 const at=(/** @type {number} */index)=>{
  if(Number(work.checks)>4000000)return background;
  // A portfolio query is proportional to the certificates actually visited.
  // Charge lookup, projection and RGB comparisons in the SAME construction
  // ledger; exhaustion cannot grant a partial or stale background certificate.
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return background;
  const x=index%image.width,y=Math.floor(index/image.width);let selected=background;
  for(const field of rows.get(y)??[]){
   work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return background;
   const b=field.box;if(x<b.x||y<b.y||x>=b.x+b.w||y>=b.y+b.h)continue;
   work.checks=Number(work.checks)+7;if(Number(work.checks)>4000000)return background;
   const observed=field.at((y-b.y)*b.w+x-b.x);
   if(observed.every((v,c)=>v===(background[c]??0)))continue;
   if(selected!==background&&observed.some((v,c)=>Math.abs(v-(selected[c]??0))>18))return background;
   selected=observed;
  }
  return selected;
 };
 if(fields.length>0)activeNodeBackgrounds.add(at);
 return at;
}
module.exports={sourceRouteNodeBackground,hasRouteNodeBackground};
