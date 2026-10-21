// @ts-check
'use strict';
const {record,list,box}=require('./source-scene-group-containment');
/** @typedef {{x:number,y:number}} Point */
/** A source-component chain is a GRAPH hypothesis only. Gaps stay empty.
 * Require all components, no clipped/noise cells, a unique simple chain and
 * locally corroborated spacing. Do not infer arrows, node identity or paint.
 * @param {unknown} input */
function certifySegmentedRouteChain(input){
 if(!record(input)||!list(input.components)||input.components.length>32||!Number.isSafeInteger(input.noisePixels)||Number(input.noisePixels)<0)
  throw new TypeError('Segmented chain input is invalid');
 const components=input.components.map(c=>{
  if(!record(c)||!box(c.box)||typeof c.boundary!=='boolean'||!list(c.cells)||c.cells.length>262144||c.cells.length<4)throw new TypeError('Segmented chain component is invalid');
  const bounds=c.box;
  if(!c.cells.every(p=>record(p)&&Number.isSafeInteger(p.x)&&Number.isSafeInteger(p.y)&&Number(p.x)>=bounds.x&&Number(p.y)>=bounds.y
    &&Number(p.x)<bounds.x+bounds.w&&Number(p.y)<bounds.y+bounds.h))throw new TypeError('Segmented chain component is invalid');
  return {box:bounds,cells:/** @type {Point[]} */(c.cells),boundary:c.boundary};
 });
 if(components.length<3||input.noisePixels!==0||components.some(c=>c.boundary))return {failure:'segmented-incomplete-components'};
 if(components.reduce((sum,c)=>sum+c.cells.length,0)>262144)return {failure:'segmented-geometry-budget'};
 const distances=components.map(()=>components.map(()=>Infinity));let checks=0;
 for(let i=0;i<components.length;i++)for(let j=i+1;j<components.length;j++){
  const a=components[i],b=components[j];if(!a||!b)throw new TypeError('Segmented chain binding is invalid');
  // Bound pair geometry before the actual cell-to-cell distance proof.
  const dx=Math.max(a.box.x-b.box.x-b.box.w,b.box.x-a.box.x-a.box.w,0),dy=Math.max(a.box.y-b.box.y-b.box.h,b.box.y-a.box.y-a.box.h,0);
  if(Math.hypot(dx,dy)>12)continue;let d=Infinity;
  for(const p of a.cells)for(const q of b.cells){if(++checks>4000000)return {failure:'segmented-geometry-budget'};d=Math.min(d,Math.hypot(p.x-q.x,p.y-q.y));}
  const row=distances[i],other=distances[j];if(!row||!other)throw new TypeError('Segmented chain binding is invalid');row[j]=d;other[i]=d;
 }
 const nearest=distances.map(row=>Math.min(...row)).sort((a,b)=>a-b),median=nearest[Math.floor(nearest.length/2)];
 if(median===undefined||!Number.isFinite(median)||median<=1)return {failure:'segmented-spacing'};
 const gapLimit=Math.min(12,median*2),edges=distances.map(row=>row.flatMap((d,i)=>d<=gapLimit?[i]:[]));
 const ends=edges.flatMap((neighbors,i)=>neighbors.length===1?[i]:[]);
 if(ends.length!==2||edges.some(n=>n.length<1||n.length>2))return {failure:'segmented-ambiguous-chain'};
 const start=ends[0];if(start===undefined)throw new TypeError('Segmented chain binding is invalid');
 const order=[start];let previous=-1,current=start;
 while(order.length<components.length){const next=edges[current]?.find(n=>n!==previous);
  if(next===undefined||order.includes(next))return {failure:'segmented-disconnected-chain'};
  previous=current;current=next;order.push(current);
 }
 if(!ends.includes(current))return {failure:'segmented-ambiguous-chain'};
 return {failure:/** @type {null} */(null),order,gapLimit,checks,authorityGranted:false};
}
module.exports={certifySegmentedRouteChain};
