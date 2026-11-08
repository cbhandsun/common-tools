// @ts-check
'use strict';
const LIMIT=4000000,SIDES=[10,14,18,22,26,30];
const PAIRS=SIDES.flatMap(top=>SIDES.map(bottom=>({top,bottom}))).sort((a,b)=>
 a.top+a.bottom-b.top-b.bottom||Math.abs(a.top-a.bottom)-Math.abs(b.top-b.bottom)||a.top-b.top);
/** @typedef {import('./source-route-core-backdrop').Field} Field */
/** Find an asymmetric rectangular frame from four independently available
 * 3x3 source patches. Candidate selection proves nothing: every frame still
 * passes the caller's complete exterior proof. All sides preserve the same
 * eight-cell context for every pending cell in the original tile. Original
 * refusals, previously covered targets and permanent conflicts stay excluded.
 * @param {{pending:ReadonlySet<number>,width:number,height:number,work:{checks:number},
 * covered:ReadonlyMap<number,number[]|null>,patch:(x:number,y:number)=>number[]|'refused'|null,
 * measure:(cx:number,cy:number,radius:number,verticalRadius:number)=>Field|null,
 * include:(field:Field)=>boolean}} input @returns {boolean} */
function searchCoreBackgroundCorners({pending,width,height,work,covered,patch,measure,include}){
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||!Number.isSafeInteger(width*height))
  throw new RangeError('Background corner dimensions are invalid');
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>LIMIT)return false;
 /** @param {number} count */const charge=count=>{work.checks+=count;return work.checks<=LIMIT;};
 const seen=new Set();
 for(const n of pending){
  if(!charge(1))return false;
  if(!Number.isSafeInteger(n)||n<0||n>=width*height)throw new RangeError('Background corner core is invalid');
  if(covered.has(n))continue;
  const x=n%width,y=Math.floor(n/width),tx=Math.floor(x/8)*8+4,ty=Math.floor(y/8)*8+4,key=tx+','+ty;
  if(seen.has(key))continue;seen.add(key);
  for(const {top,bottom}of PAIRS){
   if(!charge(1))return false;if(ty-top-2<0||ty+bottom+2>=height)continue;
   /** @type {number[]} */const lefts=[],rights=[];
   for(const extent of SIDES){
    if(!charge(1))return false;
    if(tx-extent-2>=0&&Array.isArray(patch(tx-extent,ty-top))&&Array.isArray(patch(tx-extent,ty+bottom)))lefts.push(extent);
    if(tx+extent+2<width&&Array.isArray(patch(tx+extent,ty-top))&&Array.isArray(patch(tx+extent,ty+bottom)))rights.push(extent);
    if(work.checks>LIMIT)return false;
   }
   candidates:for(const left of lefts)for(const right of rights){
    if(!charge(1))return false;
    const field=measure(tx+(right-left)/2,ty+(bottom-top)/2,(left+right)/2+2,(top+bottom)/2+2);
    if(work.checks>LIMIT||field&&!include(field))return false;
    if(covered.has(n))break candidates;
   }
   if(covered.has(n))break;
  }
 }
 return true;
}
module.exports={searchCoreBackgroundCorners};
