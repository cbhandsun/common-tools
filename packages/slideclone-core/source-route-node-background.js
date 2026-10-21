// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list,box}=require('./source-scene-group-containment');
const {sourceRaster}=require('./residual-text-mask');
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
 /** @type {{box:import('./source-scene-plan').Box,mask:Uint8Array}[]} */const bodies=[];
 for(const row of input.bodies){
  if(!record(row)||!box(row.box)||![row.box.x,row.box.y,row.box.w,row.box.h].every(Number.isSafeInteger)
   ||row.box.x+row.box.w>image.width||row.box.y+row.box.h>image.height||types.isProxy(row.mask)||!types.isUint8Array(row.mask))
   throw new TypeError('Route node backdrop body is invalid');
  const prototype=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(prototype,'buffer',row.mask);
  if(!types.isArrayBuffer(buffer)||Reflect.get(prototype,'length',row.mask)!==area)throw new TypeError('Route node backdrop mask is invalid');
  bodies.push({box:row.box,mask:new Uint8Array(buffer,Reflect.get(prototype,'byteOffset',row.mask),area)});
 }
 /** @type {{box:import('./source-scene-plan').Box,at:(index:number)=>number[]}[]} */const fields=[];
 for(const body of bodies){
  const spans=sourceRouteBodyShadowSpans(body,image.width,image.height,/** @type {{checks:number}} */(work));
  if(!spans)return ()=>background;
  for(const span of spans){
  const rgba=Buffer.alloc(span.w*span.h*4),mask=new Uint8Array(span.w*span.h);
  for(let y=0;y<span.h;y++)for(let x=0;x<span.w;x++){
   work.checks=Number(work.checks)+5;if(Number(work.checks)>4000000)return ()=>background;
   const original=(span.y+y)*image.width+span.x+x,n=y*span.w+x;
   rgba.set(image.rgba.subarray(original*4,original*4+4),n*4);mask[n]=body.mask[original]??0;
  }
  const at=sourceRouteLocalBackground({image:{width:span.w,height:span.h,rgba},body:mask,background,work});
  if(Number(work.checks)>4000000)return ()=>background;
  if(hasRouteLocalBackground(at))fields.push({box:span,at});
  }
 }
 const at=index=>{
  if(Number(work.checks)>4000000)return background;
  // A portfolio query is proportional to the certificates actually visited.
  // Charge lookup, projection and RGB comparisons in the SAME construction
  // ledger; exhaustion cannot grant a partial or stale background certificate.
  work.checks=Number(work.checks)+1;if(Number(work.checks)>4000000)return background;
  const x=index%image.width,y=Math.floor(index/image.width);let selected=background;
  for(const field of fields){
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
