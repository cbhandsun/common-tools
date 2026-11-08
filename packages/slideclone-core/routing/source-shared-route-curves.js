// @ts-check
'use strict';
const {sharedSourceRouteTransverseTargets}=require('./source-shared-route-measurement');
const {smoothSourceRouteSamples}=require('./source-route-banded-smoothing');
const {fitSourceRouteCubics}=require('./source-route-cubic-fit');
const {flattenSourceCurves}=require('./source-route-curve-geometry');
const {reserveCurveWork}=require('./source-route-curve-input');
const {encodeNativeFreeformPath}=require('../scene-plan/native-freeform-path');
/** @typedef {{x:number,y:number}} Point */
/** Only the compiler supplies a live source fit. Targets, the fixed eight-step
 * solver and bounded cubic fit share its original ledger. Continuous
 * bidirectional geometry, actual output ink and topology are checked later,
 * before either private output registry is allowed to capture these shapes.
 * @param {{fit:import('./source-shared-route-measurement').SharedRouteFit,image:import('../png').PngImage,
 * sx:number,sy:number,work:import('./source-shared-route-output-snapshot').Work}} input */
function compileSharedSourceCurves({fit,image,sx,sy,work}){
 const observations=sharedSourceRouteTransverseTargets(fit,image,work);
 /** @type {Map<number,{box:{x:number,y:number,w:number,h:number},style:{closed:boolean,freeformPath:string},route:Point[],tangents:Point[]}>} */const result=new Map();
 for(const row of observations){
  if(!row.eligible)continue;const edge=fit.edges[row.ordinal];if(!edge)throw new TypeError('Source curve edge is invalid');
  reserveCurveWork(work,edge.path.length*3+row.targets.length*4+16);
  const points=edge.path.map(p=>({x:p.x+fit.window.x,y:p.y+fit.window.y}));let prefix=0;
  for(const [index,cell]of [[0,edge.from],[-1,edge.to]])if(fit.cuts.includes(/** @type {number} */(cell))){
   const port=fit.sites[fit.cuts.indexOf(/** @type {number} */(cell))]?.point,p=index===0?points[0]:points.at(-1);if(!port||!p)throw new TypeError('Source curve endpoint is invalid');
   if(Math.hypot(port.x-p.x,port.y-p.y)>1e-12){if(index===0){points.unshift({...port});prefix=1;}else points.push({...port});}
  }
  const smoothed=smoothSourceRouteSamples({points,targets:row.targets.map(t=>({...t,index:t.index+prefix})),work});
  const curves=smoothed&&fitSourceRouteCubics({points:smoothed.points,work});
  if(!curves)throw new TypeError('Source curve fitting failed');
  const flattened=flattenSourceCurves(curves.map(c=>c.controls),work);if(!flattened?.length)throw new TypeError('Source curve subdivision is invalid');
  reserveCurveWork(work,flattened.length+1);const route=[/** @type {import('./source-route-curve-geometry').Segment} */(flattened[0]).a,...flattened.map(s=>s.b)];
  const count=curves.reduce((n,c)=>n+c.controls.length,0);reserveCurveWork(work,count*8+curves.length*8+route.length*2);
  const controls=curves.map(c=>c.controls.map(p=>({x:p.x*sx,y:p.y*sy}))),all=controls.flat(),x=Math.min(...all.map(p=>p.x)),y=Math.min(...all.map(p=>p.y)),w=Math.max(1e-6,Math.max(...all.map(p=>p.x))-x),h=Math.max(1e-6,Math.max(...all.map(p=>p.y))-y);
  const normalized=(/** @type {Point} */p)=>({x:(p.x-x)/w,y:(p.y-y)/h}),first=/** @type {Point[]} */(controls[0]),last=/** @type {Point[]} */(controls.at(-1));
  const segments=[{type:'moveTo',points:[normalized(/** @type {Point} */(first[0]))]},...controls.map(c=>({type:c.length===2?'lnTo':'cubicBezTo',points:c.slice(1).map(normalized)}))];
  const path=encodeNativeFreeformPath(segments);reserveCurveWork(work,path.length);
  result.set(row.ordinal,{box:{x,y,w,h},style:{closed:false,freeformPath:path},route,
   tangents:[/** @type {Point} */(first[0]),/** @type {Point} */(first[1]),/** @type {Point} */(last.at(-2)),/** @type {Point} */(last.at(-1))]});
 }
 return result;
}
module.exports={compileSharedSourceCurves};
