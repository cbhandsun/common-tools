// @ts-check
'use strict';
const {measureSourceSpatialPaint}=require('./source-route-spatial-paint');
const {fitSourceRoutePaint,sourceRoutePaintColor}=require('./source-route-paint-fit');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{position:number,color:string}} Stop */
/** @typedef {{color:string,startColor:string,endColor:string,support:number,stops?:Stop[],positions?:number[],spatial?:import('./source-route-spatial-paint').SpatialPaint}} RoutePaint */
/** @param {number[]} rgb */
const hex=rgb=>'#'+rgb.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('').toUpperCase();
/** Fit native linear color stops to already charged original route cells.
 * Four million geometry checks, six stops, 18-channel error and .9 support
 * remain unchanged. Geometry, direction, coverage and ports stay separate.
 * @param {Point[]} path @param {Uint8Array} rgba @param {number} width
 * @param {{checks:number}} work @param {Stop[]|Stop[][]} [priorStops]
 * @returns {RoutePaint|null} */
function measureSourceRoutePaint(path,rgba,width,work,priorStops){
 work.checks+=path.length*2;if(work.checks>4000000||path.length<8||path.length>512)return null;
 const colors=path.map(p=>[0,1,2].map(c=>rgba[(p.y*width+p.x)*4+c]??0));
 // Attachment is checked against the actual terminal source cells. A global
 // .9 paint fit can legitimately exclude antialiased terminal samples; its
 // extrapolated stop colors cannot substitute for physical source contact.
 const startColor=hex(colors[0]??[]),endColor=hex(colors.at(-1)??[]);
 const median=[0,1,2].map(c=>colors.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
 const solidSupport=colors.filter(p=>p.every((v,c)=>Math.abs(v-(median[c]??0))<=18)).length/colors.length;
 if(solidSupport>=.9)
  return {color:hex(median),startColor,endColor,support:solidSupport};
 const distances=[0];
 for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i];if(!a||!b)return null;
  distances.push((distances[i-1]??0)+Math.hypot(a.x-b.x,a.y-b.y));
 }
 const length=distances.at(-1)??0;if(!length)return null;
 const positions=distances.map(d=>d/length);
 const spatial=measureSourceSpatialPaint(path,colors,work);
 if(work.checks>4000000)return null;
 const fit=fitSourceRoutePaint(colors,positions,work,priorStops);
 return fit?{color:hex(median),startColor,endColor,...fit,positions,...(spatial?{spatial}: {})}:null;
}
/** Clip the source-certified stops to one original simplified segment. No
 * new color fit, source sample or extra native part is introduced here.
 * @param {Stop[]} stops @param {number} start @param {number} end @param {number} angleDeg */
function sourceRouteSegmentGradient(stops,start,end,angleDeg){
 if(![start,end,angleDeg].every(value=>typeof value==='number'&&Number.isFinite(value))
  ||start<0||end<start||end>1)throw new TypeError('Route paint interval is invalid');
 // Several ordered centreline cells can select the same contrast-core cell.
 // Equal fitted positions are a constant color, not a missing paint interval.
 if(start===end){const color=hex(sourceRoutePaintColor(stops,start));
  return {type:'linear',angleDeg,stops:[{position:0,color},{position:1,color}]};}
 return {type:'linear',angleDeg,stops:[{position:0,color:hex(sourceRoutePaintColor(stops,start))},
  ...stops.filter(s=>s.position>start&&s.position<end).map(s=>({position:(s.position-start)/(end-start),color:s.color})),
  {position:1,color:hex(sourceRoutePaintColor(stops,end))}]};
}
module.exports={measureSourceRoutePaint,sourceRouteSegmentGradient,sourceRoutePaintColor};
