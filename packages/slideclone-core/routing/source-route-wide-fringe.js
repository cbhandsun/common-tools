// @ts-check
'use strict';
/** Detached observations for a repeated, measured source edge up to six
 * pixels wide. Existing observations win. This internal reader receives the
 * issuer's already validated private raster/masks and grants no erasure.
 * @typedef {import('./source-route-antialias-background').Raster} Raster
 * @typedef {import('./source-route-antialias-background').Box} Box
 * @typedef {{cell:number,color:number[]}} Sample
 * @typedef {{last:number,profile:number[],targets:Sample[]}} Section
 * @param {{image:Raster,window:Box,component:Uint8Array,blocked:Uint8Array,
 * work:{checks:number},covered:ReadonlyMap<number,number[]>,candidates:ReadonlySet<number>}} input
 * @returns {Sample[]|null} */
function observeWideFields({image,window,component,blocked,work,covered,candidates}){
 const area=component.length,limit=4000000;
 if(!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>limit)return null;
 /** @param {number} count */
 const charge=count=>{work.checks+=count;return work.checks<=limit;};
 /** @param {number} x @param {number} y */
 const index=(x,y)=>x<0||y<0||x>=window.w||y>=window.h?-1:y*window.w+x;
 /** @param {number} n */
 const offset=n=>((window.y+Math.floor(n/window.w))*image.width+window.x+n%window.w)*4;
 /** @param {number} n */
 const rgb=n=>[0,1,2].map(c=>image.rgba[offset(n)+c]??0);
 /** @param {number} n */
 const exterior=n=>n>=0&&!component[n]&&!blocked[n]&&image.rgba[offset(n)+3]===255;
 /** @type {Map<number,Section|null>} */const cache=new Map();
 /** @type {[number,number][]} */const axes=[[1,0],[0,1]];
 /** @type {{n:number,axis:number}[]} */const boundaries=[];
 // Reuse the old observer's complete adjacent exterior set instead of
 // rescanning the entire window; every right/down core boundary is in it.
 for(const n of candidates){
  if(!charge(2))return null;
  if(!Number.isSafeInteger(n)||n<0||n>=area||!exterior(n))continue;
  const x=n%window.w,y=Math.floor(n/window.w);
  for(let axis=0;axis<2;axis++){
   const [dx=0,dy=0]=axes[axis]??[],previous=index(x-dx,y-dy);
   if(previous>=0&&component[previous])boundaries.push({n,axis});
  }
 }
 /** @param {number} n @param {number} axis @returns {Section|null} */
 function measure(n,axis){
  const [dx=0,dy=0]=axes[axis]??[],x=n%window.w,y=Math.floor(n/window.w);
  /** @param {number} t */const at=t=>index(x+dx*t,y+dy*t);
  if(n<0||!exterior(n)||at(-1)<0||!component[at(-1)])return null;
  let last=-1,count=0;
  for(;last>=-32;last--){
   if(!charge(1))return null;
   const p=at(last);if(p<0||blocked[p])return null;if(!component[p])break;
   if(image.rgba[offset(p)+3]!==255)return null;count++;
  }
  if(count<2||count>31)return null;
  // A nomination filter only: do not re-prove a field whose entire possible
  // replacement is already observed or byte-identical to its old background.
  // A varying/unknown field proceeds to all four flanks and nine sections.
  const reference=covered.get(n)??covered.get(at(-1));
  if(reference){
   let unchanged=true;
   for(const side of [1,-1])for(let distance=0;distance<6;distance++){
    if(!charge(4))return null;
    const cell=at(side===1?distance:last-distance);
    if(cell<0||!covered.has(cell)&&rgb(cell).some((v,c)=>v!==(reference[c]??0)))unchanged=false;
   }
   if(unchanged)return null;
  }
  const positions=[last-8,last-7,7,8],cells=positions.map(at);
  if(!charge(20)||cells.some(p=>!exterior(p)))return null;
  const colors=cells.map(rgb),left=colors[0],right=colors[3];
  if(!left||!right||left.some((v,c)=>Math.abs(v-(right[c]??0))>18))return null;
  /** @param {number} t */const colorAt=t=>left.map((v,c)=>v+((right[c]??0)-v)*(t-(positions[0]??0))/((positions[3]??0)-(positions[0]??0)));
  if(colors.some((color,i)=>color.some((v,c)=>Math.abs(v-(colorAt(positions[i]??0)[c]??0))>3)))return null;
  /** @type {number[]} */const profile=[];
  /** @type {Sample[]} */const targets=[];
  for(const side of [1,-1]){
   let previous=42;
   const start=side===1?0:last,end=side===1?8:last-8;
   for(let t=start;side===1?t<=end:t>=end;t+=side){
    if(!charge(8))return null;
    const cell=at(t);if(!exterior(cell))return null;
    const color=rgb(cell),background=colorAt(t),delta=color.map((v,c)=>v-(background[c]??0));
    const contrast=Math.max(...delta.map(Math.abs)),distance=Math.abs(t-start)+1;
    if(contrast>=42||contrast>previous+3||distance>6&&contrast>3)return null;
    previous=contrast;
    if(distance<=6){
     profile.push(...delta);
     const old=covered.get(cell);
     if(old&&old.some((v,c)=>Math.abs(v-(background[c]??0))>3))return null;
     if(contrast>=1)targets.push({cell,color:background.map(Math.round)});
    }
   }
  }
  return {last,profile,targets};
 }
 /** @param {number} n @param {number} axis @returns {Section|null} */
 function section(n,axis){
  if(!charge(1))return null;
  const key=n*2+axis;
  if(cache.has(key))return cache.get(key)??null;
  const value=measure(n,axis);cache.set(key,value);return value;
 }
 /** @type {Map<number,number[]|null>} */const proposed=new Map();
 for(const {n,axis}of boundaries){
  const middle=section(n,axis);if(work.checks>limit)return null;if(!middle)continue;
  if(middle.targets.every(row=>covered.has(row.cell)))continue;
  const [dx=0,dy=0]=axes[axis]??[],x=n%window.w,y=Math.floor(n/window.w);let support=0;
  for(let tangent=-4;tangent<=4;tangent++){
   const other=section(index(x-dy*tangent,y+dx*tangent),axis);
   if(!charge(20))return null;
   if(other&&other.last===middle.last&&other.profile.every((v,c)=>Math.abs(v-(middle.profile[c]??0))<=18))support++;
   else break; // Nine independent matches are required by the 90% gate.
  }
  if(support/9<.9)continue;
  for(const row of middle.targets){
   if(!charge(4))return null;if(covered.has(row.cell))continue;
   const old=proposed.get(row.cell);
   if(old===null)continue;
   if(old&&old.some((v,c)=>Math.abs(v-(row.color[c]??0))>3))proposed.set(row.cell,null);
   else if(!old)proposed.set(row.cell,row.color);
  }
 }
 return [...proposed].filter(([,color])=>color!==null).map(([n,color])=>({cell:(window.y+Math.floor(n/window.w))*image.width+window.x+n%window.w,color:/** @type {number[]} */(color)}));
}
module.exports={observeWideFields};
