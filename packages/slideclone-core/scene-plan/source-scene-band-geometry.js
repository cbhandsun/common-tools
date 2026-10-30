// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {NonNullable<ReturnType<typeof import('./native-mask-contours').traceNativeMaskContours>>} Segments */
/** @typedef {{box:Box,segments?:Segments}} Owner */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==="number"&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** @param {unknown} v @param {number} limit @returns {v is unknown[]} */
function list(v,limit){return Array.isArray(v)&&!types.isProxy(v)&&Object.getPrototypeOf(v)===Array.prototype&&v.length<=limit
 &&Reflect.ownKeys(v).length===v.length+1&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value" in p);}
/** The caller supplies only bodies already measured by its private source
 * measurement cache. A provider proposal is never an occlusion owner.
 * @param {unknown} input */
function parseBandBackground(input){
 if(!record(input)||!record(input.image)||!box(input.hint)||!record(input.budget)
  ||!Number.isSafeInteger(input.budget.used)||Number(input.budget.used)<0
  ||!list(input.textMasks,10000)||!input.textMasks.every(box)||!list(input.owners,88))throw new TypeError("Scene background band input is invalid");
 const {width,height,rgba}=input.image;
 if(typeof width!=="number"||typeof height!=="number"||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||width*height>40000000||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError("Scene background band raster is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",rgba),length=Reflect.get(proto,"length",rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4||input.hint.x+input.hint.w>width||input.hint.y+input.hint.h>height
  ||input.textMasks.some(b=>b.x+b.w>width||b.y+b.h>height))throw new TypeError("Scene background band frame is invalid");
 /** @type {Owner[]} */const owners=[];
 for(const value of input.owners){
  if(!record(value)||!box(value.box)||value.box.x+value.box.w>width||value.box.y+value.box.h>height)throw new TypeError("Scene background band owner is invalid");
  const segments=value.segments;
  if(segments!==undefined){
   const last=Array.isArray(segments)&&!types.isProxy(segments)?Object.getOwnPropertyDescriptor(segments,String(segments.length-1))?.value:undefined;
   if(!list(segments,120)||segments.length<4||!segments.every(s=>record(s)&&typeof s.type==="string"&&["moveTo","lnTo","cubicBezTo","close"].includes(s.type)
    &&list(s.points,3)&&s.points.length===(s.type==="close"?0:s.type==="cubicBezTo"?3:1)&&s.points.every(p=>record(p)
     &&[p.x,p.y].every(n=>typeof n==="number"&&Number.isFinite(n)&&n>=0&&n<=1)))
    ||!record(segments[0])||segments[0].type!=="moveTo"||!record(last)
    ||last.type!=="close"||segments.filter(s=>record(s)&&s.type==="moveTo").length!==1)throw new TypeError("Scene background band owner contour is invalid");
  }
  owners.push({box:{...value.box},...(segments?{segments:structuredClone(/** @type {Segments} */(segments))}:{})});
 }
 const hint={...input.hint},x=Math.max(0,Math.floor(hint.x-64)),y=Math.max(0,Math.floor(hint.y-64));
 const w=Math.min(width,Math.ceil(hint.x+hint.w+64))-x,h=Math.min(height,Math.ceil(hint.y+hint.h+64))-y,band=72;
 const core={x:x+band,y:y+band,w:Math.max(0,w-2*band),h:Math.max(0,h-2*band)};
 const windows=!core.w||!core.h?[{x,y,w,h}]:[{x,y,w,h:band},{x,y:y+h-band,w,h:band},
  {x,y:y+band,w:band,h:h-2*band},{x:x+w-band,y:y+band,w:band,h:h-2*band}];
 return {image:{width,height,rgba},hint,budget:/** @type {{used:number}} */(input.budget),textMasks:input.textMasks.map(b=>({...b})),owners,
  frame:{x,y,w,h},core,windows,area:windows.reduce((sum,b)=>sum+b.w*b.h,0)};
}
/** @param {Point} p @param {Point[]} vertices */
function insidePolygon(p,vertices){
 let inside=false;
 for(let i=0,j=vertices.length-1;i<vertices.length;j=i++){
  const a=vertices[i],b=vertices[j];if(!a||!b)continue;
  if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)inside=!inside;
 }
 return inside;
}
/** Conservatively exclude a measured foreground's original .75px contour
 * uncertainty too. These cells authorize no parent paint or geometry.
 * @param {Point} p @param {Point[]} vertices */
function foregroundOwnsPoint(p,vertices){
 if(insidePolygon(p,vertices))return true;
 return vertices.some((a,index)=>{
  const b=vertices[(index+1)%vertices.length];if(!b)return false;
  const dx=b.x-a.x,dy=b.y-a.y,squared=dx*dx+dy*dy;
  const t=squared?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/squared)):0;
  return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)<=.75;
 });
}
/** @param {Owner} owner */
function ownerVertices(owner){
 if(!owner.segments)return [{x:owner.box.x,y:owner.box.y},{x:owner.box.x+owner.box.w,y:owner.box.y},
  {x:owner.box.x+owner.box.w,y:owner.box.y+owner.box.h},{x:owner.box.x,y:owner.box.y+owner.box.h}];
 /** @type {Point[]} */const vertices=[];
 /** @param {Point} p */const point=p=>({x:owner.box.x+p.x*owner.box.w,y:owner.box.y+p.y*owner.box.h});
 for(const segment of owner.segments){
  if(segment.type==="close")continue;
  if(segment.type!=="cubicBezTo"){const p=segment.points[0];if(p)vertices.push(point(p));continue;}
  const a=vertices[vertices.length-1],b=segment.points[0],c=segment.points[1],d=segment.points[2];if(!a||!b||!c||!d)continue;
  const p1=point(b),p2=point(c),p3=point(d);
  for(let step=1;step<=8;step++){const t=step/8,u=1-t;vertices.push({x:u*u*u*a.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x,
   y:u*u*u*a.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y});}
 }
 return vertices;
}
/** Curves lie inside their control hull. Refuse a hull whose bounding box
 * intersects the unknown core; no endpoint-only approximation is authority.
 * @param {Owner} owner @param {Box} core */
function curveTouchesUnobservedCore(owner,core){
 if(!core.w||!core.h)return false;let last={x:owner.box.x,y:owner.box.y};
 /** @param {Point} p */const point=p=>({x:owner.box.x+p.x*owner.box.w,y:owner.box.y+p.y*owner.box.h});
 for(const segment of owner.segments??[]){
  if(segment.type==="close")continue;
  if(segment.type==="cubicBezTo"){
   const controls=[last,...segment.points.map(point)],left=Math.min(...controls.map(p=>p.x)),right=Math.max(...controls.map(p=>p.x)),
    top=Math.min(...controls.map(p=>p.y)),bottom=Math.max(...controls.map(p=>p.y));
   if(right>=core.x-.75&&left<=core.x+core.w+.75&&bottom>=core.y-.75&&top<=core.y+core.h+.75)return true;
  }
  const end=segment.points[segment.points.length-1];if(end)last=point(end);
 }
 return false;
}
/** Test every closing edge too; vertices alone cannot prove that an edge
 * avoided the skipped raster core. Preserve the original .75px fit bound.
 * @param {Point[]} vertices @param {Box} core */
function crossesUnobservedCore(vertices,core){
 if(!core.w||!core.h)return false;
 const bounds={x:core.x-.75,y:core.y-.75,w:core.w+1.5,h:core.h+1.5};
 return vertices.some((a,index)=>{
  const b=vertices[(index+1)%vertices.length];if(!b)return true;let lo=0,hi=1;
  for(const [start,delta,min,max]of[[a.x,b.x-a.x,bounds.x,bounds.x+bounds.w],[a.y,b.y-a.y,bounds.y,bounds.y+bounds.h]]){
   if(start===undefined||delta===undefined||min===undefined||max===undefined)return true;
   if(delta===0){if(start<min||start>max)return false;continue;}
   const first=(min-start)/delta,last=(max-start)/delta;lo=Math.max(lo,Math.min(first,last));hi=Math.min(hi,Math.max(first,last));if(lo>hi)return false;
  }
  return true;
 });
}
module.exports={parseBandBackground,insidePolygon,ownerVertices,foregroundOwnsPoint,crossesUnobservedCore,curveTouchesUnobservedCore};
