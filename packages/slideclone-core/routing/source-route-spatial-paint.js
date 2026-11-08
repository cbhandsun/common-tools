// @ts-check
'use strict';
const {fitSourceRoutePaint}=require('./source-route-paint-fit');
/** @typedef {{axis:'x'|'y',origin:number,support:number}&({color:number[],step:number[]}|{span:number,stops:import('./source-route-paint-fit').Stop[]})} SpatialPaint */
/** Fit directly to every ORIGINAL core sample in source coordinates. A long
 * horizontal run contributes many observations at one y; path interpolation
 * never supplies its colors. This is an additional proof, with the original
 * .9 support, 18-channel error and shared four-million-check ledger.
 * @param {{x:number,y:number}[]} path @param {number[][]} colors @param {{checks:number}} work
 * @returns {SpatialPaint|undefined} */
function measureSourceSpatialPaint(path,colors,work){
 if(path.length<8||path.length>512||path.length!==colors.length
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000000)return undefined;
 work.checks+=path.length*2;if(work.checks>4000000)return undefined;
 if(path.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y))
  ||colors.some(color=>color.length!==3||color.some(v=>!Number.isFinite(v)||v<0||v>255)))return undefined;
 for(const axis of /** @type {('y'|'x')[]} */(['y','x'])){
  work.checks+=path.length*8;if(work.checks>4000000)return undefined;
  const coordinates=path.map(p=>p[axis]),origin=coordinates.reduce((a,b)=>a+b,0)/path.length;
  const den=coordinates.reduce((sum,v)=>sum+(v-origin)**2,0);if(den<1e-6)continue;
  const color=[0,1,2].map(c=>colors.reduce((sum,p)=>sum+(p[c]??0),0)/colors.length);
  const step=[0,1,2].map(c=>coordinates.reduce((sum,v,i)=>sum+(v-origin)*((colors[i]?.[c]??0)-(color[c]??0)),0)/den);
  if(![origin,...color,...step].every(Number.isFinite))continue;
  let matching=0;
  for(const [i,p]of path.entries()){
   work.checks+=4;if(work.checks>4000000)return undefined;
   if(color.every((v,c)=>Math.abs((colors[i]?.[c]??0)-Math.max(0,Math.min(255,v+(step[c]??0)*(p[axis]-origin))))<=18))matching++;
  }
  if(matching/path.length>=.9)return {axis,origin,color,step,support:matching/path.length};
 }
 // A source-space gradient can contain a short transition that is not a
 // two-stop linear ramp. Reuse the bounded paint solver on source coordinates,
 // retaining every observation at repeated coordinates (e.g. a horizontal
 // beam). Path-length colors and simplified vertices supply no evidence.
 for(const axis of /** @type {('y'|'x')[]} */(['y','x'])){
  work.checks+=path.length*(8+Math.ceil(Math.log2(path.length)));if(work.checks>4000000)return undefined;
  const values=path.map(p=>p[axis]),origin=Math.min(...values),span=Math.max(...values)-origin;
  if(!Number.isFinite(span)||span<1e-6)continue;
  const order=values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);
  const positions=order.map(p=>(p.value-origin)/span),samples=order.map(p=>colors[p.index]??[]);
  const fit=fitSourceRoutePaint(samples,positions,work);
  if(work.checks>4000000)return undefined;
  if(fit)return {axis,origin,span,...fit};
 }
 return undefined;
}
module.exports={measureSourceSpatialPaint};
