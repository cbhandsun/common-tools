// @ts-check
"use strict";
const {types}=require('node:util');
const {insidePolygon}=require('./source-scene-band-geometry');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {import('./source-scene-plan').Box} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d);}
/** @param {unknown} value @returns {value is unknown[]} */
function list(value){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&Reflect.ownKeys(value).length===value.length+1&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>'value' in d);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==='number'&&Number.isFinite(n))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** @param {Point} p @param {Point} a @param {Point} b */
function distance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,s=dx*dx+dy*dy;
 const t=s?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/s)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
/** @param {Point} a @param {Point} b */
function middle(a,b){return {x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
/** Only one closed measured body can supply group containment. Curve chords
 * have a certified .25px control-hull error; a bounded failure grants nothing.
 * This controls grouping only, never paint ownership, erasure or ports.
 * @param {{box:Box,segments?:import('./source-scene-band-geometry').Segments}} owner @returns {Point[]|null} */
function measuredGroupVertices(owner){
 if(!owner.segments)return [{x:owner.box.x,y:owner.box.y},{x:owner.box.x+owner.box.w,y:owner.box.y},
  {x:owner.box.x+owner.box.w,y:owner.box.y+owner.box.h},{x:owner.box.x,y:owner.box.y+owner.box.h}];
 const segments=owner.segments;
 if(segments.length<4||segments.length>120||segments[0]?.type!=='moveTo'||segments.at(-1)?.type!=='close'
  ||segments.filter(s=>s.type==='moveTo').length!==1||segments.filter(s=>s.type==='close').length!==1)return null;
 /** @type {Point[]} */const vertices=[];
 /** @param {Point} p */const point=p=>({x:owner.box.x+p.x*owner.box.w,y:owner.box.y+p.y*owner.box.h});
 /** @param {Point} a @param {Point} b @param {Point} c @param {Point} d @param {number} depth @returns {boolean} */
 const curve=(a,b,c,d,depth)=>{
  if(vertices.length>=4096)return false;
  if(Math.max(distance(b,a,d),distance(c,a,d))<=.25){vertices.push(d);return true;}
  if(depth>=12)return false;
  const ab=middle(a,b),bc=middle(b,c),cd=middle(c,d),abc=middle(ab,bc),bcd=middle(bc,cd),mid=middle(abc,bcd);
  return curve(a,ab,abc,mid,depth+1)&&curve(mid,bcd,cd,d,depth+1);
 };
 for(const s of segments){
  if(s.type==='close')continue;
  if(s.type==='moveTo'||s.type==='lnTo'){const p=s.points[0];if(!p)return null;vertices.push(point(p));continue;}
  const a=vertices.at(-1),b=s.points[0],c=s.points[1],d=s.points[2];
  if(s.type!=='cubicBezTo'||!a||!b||!c||!d||!curve(a,point(b),point(c),point(d),0))return null;
 }
 return vertices;
}
/** Crossing, touch and uncertainty all reject. Corners alone cannot detect
 * an edge passing through a concave notch. @param {Point} a @param {Point} b @param {Point} c @param {Point} d */
function edgeDistance(a,b,c,d){
 const dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
 if(den){const t=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1)return 0;}
 return Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b));
}
/** @param {Point[]} owner @param {Point[]} polygon @param {{used:number,exhausted:boolean}} [work] */
function fullyContainedGroupPolygon(owner,polygon,work){
 // This is derived geometry work, not a new source raster allowance. Bound
 // all point/edge checks together; exhaustion grants no partial containment.
 const checks=owner.length*8;
 if(work){if(work.used+checks>4000000){work.exhausted=true;return false;}work.used+=checks;}
 if(owner.length<3||polygon.length!==4||!polygon.every(p=>insidePolygon(p,owner)))return false;
 for(const [i,a]of polygon.entries()){
  const b=polygon[(i+1)%polygon.length];if(!b)return false;
  for(const [j,c]of owner.entries()){const d=owner[(j+1)%owner.length];if(!d||edgeDistance(a,b,c,d)<=.75)return false;}
 }
 return true;
}
/** Use original evidence, never a typography-fit box. A present but invalid
 * quadrilateral must not fall back to its envelope. @param {unknown} source @param {number} sx @param {number} sy @returns {Point[]|null} */
function sourceGroupTextPolygon(source,sx,sy){
 if(!record(source)||source.editable!==true||!box(source.evidenceBox)||![sx,sy].every(n=>Number.isFinite(n)&&n>0))return null;
 const bounds=source.evidenceBox;
 /** @type {Point[]} */let polygon;
 if(source.ocrPolygonPt!==undefined){
  if(!list(source.ocrPolygonPt)||source.ocrPolygonPt.length!==4)return null;
  polygon=[];
  for(const p of source.ocrPolygonPt){if(!list(p)||p.length!==2||typeof p[0]!=='number'||typeof p[1]!=='number'
   ||![p[0],p[1]].every(n=>Number.isFinite(n)&&n>=0))return null;polygon.push({x:p[0],y:p[1]});}
  if(Math.max(Math.abs(Math.min(...polygon.map(p=>p.x))-bounds.x),Math.abs(Math.min(...polygon.map(p=>p.y))-bounds.y),
   Math.abs(Math.max(...polygon.map(p=>p.x))-bounds.x-bounds.w),Math.abs(Math.max(...polygon.map(p=>p.y))-bounds.y-bounds.h))>1e-6)return null;
  const turns=polygon.map((a,i)=>{const b=polygon[(i+1)%4],c=polygon[(i+2)%4];return b&&c?(b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x):0;});
  if(!turns.every(n=>n>0)&&!turns.every(n=>n<0))return null;
 }else polygon=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y+bounds.h},{x:bounds.x,y:bounds.y+bounds.h}];
 return polygon.map(p=>({x:p.x*sx,y:p.y*sy}));
}
module.exports={measuredGroupVertices,fullyContainedGroupPolygon,sourceGroupTextPolygon,record,box,list};
