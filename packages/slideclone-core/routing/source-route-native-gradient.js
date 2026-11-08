// @ts-check
'use strict';
const {sourceRoutePaintColor}=require('./source-route-paint-fit');
const {record,list}=require('../scene-plan/source-scene-group-containment');
/** Fit an unrotated spatial gradient to the already measured paint model.
 * Neither a rotated connector frame nor path-length positions are a global
 * gradient axis. Reject spatial fits that cannot reproduce the source model.
 * @param {{x:number,y:number}[]} points
 * @param {{stops:{position:number,color:string}[],positions:number[],spatial?:import('./source-route-spatial-paint').SpatialPaint}|undefined} paint
 * @param {unknown} [drawingPoints] Actual output bounds in the SAME source frame. */
function nativeSourceRouteGradient(points,paint,drawingPoints){
 /** @type {{x:number,y:number}[]|undefined} */let drawing;
 if(drawingPoints!==undefined){
  if(!list(drawingPoints)||drawingPoints.length<2||drawingPoints.length>120
   ||!drawingPoints.every(p=>record(p)&&[p.x,p.y].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100000)))
   throw new TypeError('Native gradient drawing bounds are invalid');
  drawing=/** @type {{x:number,y:number}[]} */(drawingPoints).map(p=>({x:p.x,y:p.y}));
 }
 /** @param {'x'|'y'} axis */const interval=axis=>{
  const coordinates=(drawing??points).map(p=>p[axis]);return {lo:Math.min(...coordinates),hi:Math.max(...coordinates)};
 };
 if(!paint||points.length<2||points.length!==paint.positions.length)return undefined;
 if(paint.spatial){
  const spatial=paint.spatial,{axis,origin}=spatial,{lo,hi}=interval(axis);
  if(hi-lo<1e-6&&!drawing)return undefined;
  if('stops' in spatial){
   /** @param {number} at */const color=at=>'#'+sourceRoutePaintColor(spatial.stops,Math.max(0,Math.min(1,(at-origin)/spatial.span)))
    .map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
   const internal=hi-lo<1e-6?[]:spatial.stops.slice(1,-1)
    .map(stop=>({position:(origin+stop.position*spatial.span-lo)/(hi-lo),color:stop.color})).filter(stop=>stop.position>0&&stop.position<1);
   const stops=[{position:0,color:color(lo)},...internal,{position:1,color:color(hi)}];
   return {type:'linear',angleDeg:axis==='y'?90:0,stops};
  }
  const {color,step}=spatial;
  /** @param {number} at */const hex=at=>'#'+color.map((v,c)=>Math.round(Math.max(0,Math.min(255,v+(step[c]??0)*(at-origin)))).toString(16).padStart(2,'0')).join('').toUpperCase();
  return {type:'linear',angleDeg:axis==='y'?90:0,stops:[{position:0,color:hex(lo)},{position:1,color:hex(hi)}]};
 }
 const colors=points.map((_,i)=>sourceRoutePaintColor(paint.stops,paint.positions[i]??0));
 for(const axis of /** @type {('y'|'x')[]} */(['y','x'])){
  const values=points.map(p=>p[axis]),lo=Math.min(...values),hi=Math.max(...values),span=hi-lo;if(span<1e-6)continue;
  const ts=values.map(v=>(v-lo)/span),mean=ts.reduce((a,b)=>a+b,0)/ts.length,den=ts.reduce((a,t)=>a+(t-mean)**2,0);if(den<1e-6)continue;
  const slope=[0,1,2].map(c=>ts.reduce((sum,t,i)=>sum+(t-mean)*(colors[i]?.[c]??0),0)/den);
  const intercept=[0,1,2].map(c=>colors.reduce((sum,p)=>sum+(p[c]??0),0)/colors.length-(slope[c]??0)*mean);
  const support=ts.filter((t,i)=>[0,1,2].every(c=>Math.abs((colors[i]?.[c]??0)-(intercept[c]??0)-(slope[c]??0)*t)<=18)).length/ts.length;
  if(support<.9)continue;
  /** @param {number} t */const color=t=>'#'+intercept.map((v,c)=>Math.round(Math.max(0,Math.min(255,v+(slope[c]??0)*t))).toString(16).padStart(2,'0')).join('').toUpperCase();
  const actual=interval(axis);
  return {type:'linear',angleDeg:axis==='y'?90:0,stops:[{position:0,color:color((actual.lo-lo)/span)},{position:1,color:color((actual.hi-lo)/span)}]};
 }
 return undefined;
}
/** Invert Office's local flip-then-rotate transform for a slide-space axis.
 * @param {NonNullable<ReturnType<typeof nativeSourceRouteGradient>>} gradient
 * @param {{rotationDeg:number,flipH:boolean,flipV:boolean}} frame */
function sourceRouteGradientInFrame(gradient,frame){
 const radians=(gradient.angleDeg-frame.rotationDeg)*Math.PI/180;
 const x=Math.cos(radians)*(frame.flipH?-1:1),y=Math.sin(radians)*(frame.flipV?-1:1);
 const angleDeg=(Math.round(Math.atan2(y,x)*180/Math.PI)+360)%360;
 return {...gradient,angleDeg};
}
/** Reframe an already emitted gradient through slide space. Reapplying only
 * the inverse transform would rotate/flip a native input for a second time.
 * Stops and their order are preserved exactly. @param {unknown} value
 * @param {unknown} from @param {unknown} to */
function reframeSourceRouteGradient(value,from,to){
 /** @param {unknown} frame @returns {frame is {rotationDeg:number,flipH:boolean,flipV:boolean}} */
 const validFrame=frame=>record(frame)&&typeof frame.rotationDeg==='number'&&[0,90,180,270].includes(frame.rotationDeg)
  &&typeof frame.flipH==='boolean'&&typeof frame.flipV==='boolean';
 if(!record(value)||value.type!=='linear'||typeof value.angleDeg!=='number'||!Number.isFinite(value.angleDeg)||Math.abs(value.angleDeg)>36000
  ||!list(value.stops)||value.stops.length<2||value.stops.length>8||value.stops.some(s=>!record(s)||typeof s.position!=='number'||!Number.isFinite(s.position)
   ||s.position<0||s.position>1||typeof s.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(s.color))||!validFrame(to))throw new TypeError('Native gradient frame is invalid');
 const stops=/** @type {{position:number,color:string}[]} */(value.stops);
 if(stops.some((s,i)=>{const prior=stops[i-1];return prior&&s.position<prior.position;}))throw new TypeError('Native gradient frame is invalid');
 let angleDeg=value.angleDeg;
 if(from!==undefined){
  if(!validFrame(from))throw new TypeError('Native gradient frame is invalid');
  const radians=angleDeg*Math.PI/180,x=Math.cos(radians)*(from.flipH?-1:1),y=Math.sin(radians)*(from.flipV?-1:1);
  angleDeg=(Math.atan2(y,x)*180/Math.PI+/** @type {number} */(from.rotationDeg)+360)%360;
 }
 return sourceRouteGradientInFrame(/** @type {NonNullable<ReturnType<typeof nativeSourceRouteGradient>>} */({...value,angleDeg}),to);
}
module.exports={nativeSourceRouteGradient,sourceRouteGradientInFrame,reframeSourceRouteGradient};
