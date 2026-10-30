// @ts-check
'use strict';
const {types}=require('node:util');
const {sourceCurveFootprint}=require('./source-route-curve-footprint');
const {sourceRouteTransverseTargets}=require('./source-route-transverse-targets');
const {sharedOutputWork,sharedOutputList,sharedOutputRecord,chargeSharedOutput}=require('./source-shared-route-output-snapshot');
/** Internal geometry parser. Only the measurement registry supplies a live
 * shaft mask. Neither this predicate nor its arguments mint a capability.
 * @param {import('./source-shared-route-measurement').SharedRouteFit} measured
 * @param {{shaft:Uint8Array,shaftCells:readonly number[],joints:number[],window:import('../scene-plan/source-scene-plan').Box}} proof
 * @param {unknown} rows @param {unknown} work */
function checkSharedSourceCurveFootprint(measured,proof,rows,work){
 if(!sharedOutputWork(work))throw new TypeError('Scene shared curve work is invalid');
 /** @param {number} count */const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 /** @param {unknown} value @param {number} low @param {number} high @returns {value is unknown[]} */
 const array=(value,low,high)=>!types.isProxy(value)&&Array.isArray(value)&&value.length>=low&&value.length<=high&&sharedOutputList(value,work);
 if(!array(rows,measured.edges.length,measured.edges.length))return false;
 /** @type {import('./source-route-curve-footprint').Edge[]} */const edges=[];
 for(const [index,row]of rows.entries()){
  if(!sharedOutputRecord(row,work)||typeof row.widthPx!=='number'||!Number.isFinite(row.widthPx)||row.widthPx<=0||row.widthPx>64
   ||!array(row.curves,1,120))return false;
  /** @type {{x:number,y:number}[][]} */const curves=[];
  for(const curve of row.curves){
   if(!array(curve,2,4)||curve.length===3)return false;
   const points=[];
   for(const p of curve){if(!sharedOutputRecord(p,work)||typeof p.x!=='number'||typeof p.y!=='number'
    ||![p.x,p.y].every(n=>Number.isFinite(n)&&Math.abs(n)<=100000))return false;points.push({x:p.x,y:p.y});}
   curves.push(points);
  }
  charge(8);const edge=measured.edges[index];if(!edge)return false;
  edges.push({curves,widthPx:Math.min(row.widthPx,edge.widthPx),cells:edge.cells,from:edge.from,to:edge.to,fromHead:edge.fromHead,toHead:edge.toHead});
 }
 return sourceCurveFootprint({mask:proof.shaft,sourceCells:proof.shaftCells,width:proof.window.w,height:proof.window.h,edges,joints:proof.joints,work});
}
/** Assign original interior ink to its nearest original path sample. Existing
 * source-proven joint/head disks and halo pixels are left to the final FULL
 * footprint check. The returned detached observations grant no capability.
 * @param {import('./source-shared-route-measurement').SharedRouteFit} fit
 * @param {{shaft:Uint8Array,joints:number[],window:import('../scene-plan/source-scene-plan').Box}} proof
 * @param {import('./source-shared-route-output-snapshot').Work} work */
function sharedSourceFittingInk(fit,proof,work){
 if(!sharedOutputWork(work))throw new TypeError('Scene shared curve work is invalid');
 /** @param {number} count */const charge=count=>{if(!chargeSharedOutput(work,count))throw new TypeError('Scene shared path binding failed: shared-geometry-budget');};
 const width=proof.window.w,span=4;
 /** @type {Map<string,{x:number,y:number,ordinal:number,index:number}[]>} */const buckets=new Map();
 /** @type {Map<string,{x:number,y:number,radius:number}[]>} */const disks=new Map();
 const output=fit.edges.map(()=>/** @type {{x:number,y:number,index:number}[]} */([]));
 /** @param {number} x @param {number} y */const key=(x,y)=>x+','+y;
 /** @param {number} n @param {number} radius */const disk=(n,radius)=>{
  const x=n%width,y=Math.floor(n/width),left=Math.floor((x-radius)/span),right=Math.floor((x+radius)/span),top=Math.floor((y-radius)/span),bottom=Math.floor((y+radius)/span);
  charge((right-left+1)*(bottom-top+1));const row={x,y,radius};
  for(let yy=top;yy<=bottom;yy++)for(let xx=left;xx<=right;xx++){const k=key(xx,yy),rows=disks.get(k)??[];rows.push(row);disks.set(k,rows);}
 };
 for(const [ordinal,edge]of fit.edges.entries()){
  charge(edge.path.length+edge.cells.length);
  for(const [index,p]of edge.path.entries()){const k=key(Math.floor(p.x/span),Math.floor(p.y/span)),rows=buckets.get(k)??[];rows.push({x:p.x,y:p.y,ordinal,index});buckets.set(k,rows);}
  for(const [i,n]of edge.cells.entries())if(edge.fromHead&&i<16||edge.toHead&&i>=edge.cells.length-16)disk(n,Math.max(8.5,edge.widthPx/2+.75));
 }
 for(const n of proof.joints){charge(fit.edges.length);const incident=fit.edges.filter(e=>e.from===n||e.to===n);if(incident.length)disk(n,Math.min(15,Math.max(8.5,Math.max(...incident.map(e=>e.widthPx))*2.5+.75)));}
 const reach=Math.ceil((Math.max(...fit.edges.map(e=>e.widthPx))/2+2)/span);
 charge(proof.shaft.length);
 for(let n=0;n<proof.shaft.length;n++)if(proof.shaft[n]){
  const x=n%width,y=Math.floor(n/width),bx=Math.floor(x/span),by=Math.floor(y/span);let exempt=false;
  for(const d of disks.get(key(bx,by))??[]){charge(1);if((x-d.x)**2+(y-d.y)**2<=d.radius**2){exempt=true;break;}}
  if(exempt)continue;
  /** @type {{x:number,y:number,ordinal:number,index:number}|undefined} */let nearest;let best=Infinity;
  charge((reach*2+1)**2);
  for(let dy=-reach;dy<=reach;dy++)for(let dx=-reach;dx<=reach;dx++)for(const p of buckets.get(key(bx+dx,by+dy))??[]){
   charge(1);const d=(x-p.x)**2+(y-p.y)**2;if(d<best){best=d;nearest=p;}
  }
  if(!nearest)throw new TypeError('Scene shared fitting ink is invalid');
  const edge=fit.edges[nearest.ordinal],row=output[nearest.ordinal];if(!edge||!row)throw new TypeError('Scene shared fitting ink is invalid');
  if(best>(edge.widthPx/2+.75)**2)continue; // original halo: final 2% cap remains mandatory
  if(row.length>=8192)throw new TypeError('Scene shared fitting ink capacity is invalid');
  row.push({x,y,index:nearest.index});
 }
 return output;
}
module.exports={checkSharedSourceCurveFootprint,sharedSourceFittingInk,sourceRouteTransverseTargets};
