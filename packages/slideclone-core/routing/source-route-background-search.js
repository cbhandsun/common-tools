// @ts-check
'use strict';
const LIMIT=4000000;
/** @typedef {import('./source-route-core-backdrop').Field} Field */
/** Supplement only the original eligible pending cores after the old grids
 * have finished. Four-by-two-tile fields provide more independent corner
 * positions around curved ink. Each must pass the caller's unchanged full
 * source proof. Keep eight cells of context on every side of the target;
 * successful observations and permanent conflicts stop further target search.
 * No original refusal, covered pixel or new erasure authority enters here.
 * @param {{pending:ReadonlySet<number>,width:number,height:number,work:{checks:number},
 * covered:ReadonlyMap<number,number[]|null>,measure:(cx:number,cy:number,radius:number,verticalRadius:number)=>Field|null,
 * include:(field:Field)=>boolean}} input @returns {boolean} */
function searchAdditionalCoreBackground({pending,width,height,work,covered,measure,include}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height))
  throw new RangeError('Additional background dimensions are invalid');
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>LIMIT)return false;
 /** @param {number} count */const charge=count=>{work.checks+=count;return work.checks<=LIMIT;};
 const tried=new Set();
 for(const n of pending){
  if(!charge(1))return false;
  if(!Number.isSafeInteger(n)||n<0||n>=width*height)throw new RangeError('Additional background core is invalid');
  if(covered.has(n))continue;
  const x=n%width,y=Math.floor(n/width),tx=Math.floor(x/8)*8+4,ty=Math.floor(y/8)*8+4;
  for(const [dx=0,dy=0]of [[0,0],[0,-4],[0,4],[-4,0],[4,0],[-4,-4],[-4,4],[4,-4],[4,4]]){
   const cx=tx+dx,cy=ty+dy;
   for(const [radius=0,verticalRadius=0]of [[32,16],[16,32]]){
    if(!charge(1))return false;
    if(Math.abs(x-cx)>radius-8||Math.abs(y-cy)>verticalRadius-8)continue;
    const key=cx+','+cy+','+radius+','+verticalRadius;
    if(tried.has(key))continue;tried.add(key);
    const field=measure(cx,cy,radius,verticalRadius);
    if(work.checks>LIMIT||field&&!include(field))return false;
    if(covered.has(n))break;
   }
   if(covered.has(n))break;
  }
 }
 return true;
}
module.exports={searchAdditionalCoreBackground};
