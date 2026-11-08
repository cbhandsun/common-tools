// @ts-check
"use strict";
const {types}=require('node:util');
const {measureSourceOutlineColor}=require('./source-outline-color');
const {traceNativeMaskContours}=require('./native-mask-contours');
const {fitSourceOutlinePalette}=require('./source-outline-palette');
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{checks:number,exhausted:boolean}} Work */
/** @typedef {{box:Box,segments:NonNullable<ReturnType<typeof traceNativeMaskContours>>,color:string}} Part */
/** @typedef {{box:Box,baseColor:string,parts:Part[],disjoint?:boolean}} Paint */
/** Reuse only the admitted ring's cached source colors. The original full ring
 * remains the attachment body; darker native paint overlays its pale fringe.
 * No source scan, text ownership, hole filling or new component is introduced.
 * All fitting consumes the caller's remaining contour allowance. Thirty dark
 * parts leave room for the original ring and its optional interior body.
 * Disjoint color parts are enabled only by the closed-outline consumer;
 * filled relationship bodies retain their existing complete-route contract.
 * @param {unknown} input @param {Work} work @param {boolean} [disjointPalette] @returns {Paint|null} */
function measureSourceOutlinePaint(input,work,disjointPalette=false){
 if(typeof disjointPalette!=='boolean')throw new TypeError('Source outline paint mode is invalid');
 measureSourceOutlineColor(input);
 if(!work||types.isProxy(work)||![Object.prototype,null].includes(Object.getPrototypeOf(work))
  ||Object.values(Object.getOwnPropertyDescriptors(work)).some(p=>!('value' in p))
  ||!Number.isSafeInteger(work.checks)||work.checks<0||work.checks>4000001||typeof work.exhausted!=='boolean')
  throw new TypeError('Source outline paint work is invalid');
 if(work.exhausted||work.checks>=4000000)return null;
 const {points,colors,width}=/** @type {{points:Point[],colors:Map<number,number[]>,width:number}} */(input);
 /** @param {number} n */const spend=n=>{work.checks=Math.min(4000001,work.checks+n);if(work.checks>4000000)work.exhausted=true;return !work.exhausted;};
 if(!spend(points.length))return null;
 const samples=points.map(p=>/** @type {number[]} */(Map.prototype.get.call(colors,p.y*width+p.x)));
 /** @param {number[]} color */const brightness=color=>color.reduce((s,v)=>s+v,0);
 /** @param {number[]} a @param {number[]} b */const distance=(a,b)=>a.reduce((s,v,c)=>s+(v-(b[c]??0))**2,0);
 const first=samples[0];if(!first)return null;
 let low=first,high=first;
 for(const c of samples){if(brightness(c)<brightness(low))low=c;if(brightness(c)>brightness(high))high=c;}
 if(distance(low,high)===0)return null;
 let centers=[low,high];let labels=new Uint8Array(points.length);
 for(let iteration=0;iteration<8;iteration++){
  if(!spend(points.length))return null;
  const sums=[[0,0,0],[0,0,0]],counts=[0,0];
  for(const [i,c]of samples.entries()){
   const k=distance(c,centers[0]??low)<=distance(c,centers[1]??high)?0:1;labels[i]=k;
   counts[k]=(counts[k]??0)+1;
   for(let channel=0;channel<3;channel++){const row=sums[k];if(row)row[channel]=(row[channel]??0)+(c[channel]??0);}
  }
  if(counts.some(n=>!n))return null;
  const next=sums.map((row,k)=>row.map(v=>Math.round(v/(counts[k]??1))));
  if(next.every((c,k)=>distance(c,centers[k]??[])===0))break;centers=next;
 }
 const dark=brightness(centers[0]??low)<=brightness(centers[1]??high)?0:1;
 /** @param {number[]} c */const hex=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
 const baseColor=hex(centers[1-dark]??high),color=hex(centers[dark]??low);
 /** @param {Point[]} cells */const bounds=cells=>{
  let x=16384,y=16384,right=0,bottom=0;
  for(const p of cells){x=Math.min(x,p.x);y=Math.min(y,p.y);right=Math.max(right,p.x);bottom=Math.max(bottom,p.y);}
  return {x,y,w:right-x+1,h:bottom-y+1};
 };
 const palette=disjointPalette?fitSourceOutlinePalette({samples,centers},work):null;
 if(work.exhausted)return null;
 const box=bounds(points),pending=palette?palette.colors.map((paint,k)=>({points:points.filter((p,i)=>palette.labels[i]===k),depth:0,color:paint}))
  :[{points:points.filter((p,i)=>labels[i]===dark),depth:0,color}];
 /** @type {Part[]} */const parts=[];
 while(pending.length){
  const item=pending.pop();if(!item||!item.points.length)continue;
  if(!spend(item.points.length))return null;
  const frame=bounds(item.points),segments=traceNativeMaskContours(item.points,frame,{tolerancePx:palette ? .5 : .75,workState:work,fastFail:true});
  if(work.exhausted)return null;
  if(segments){parts.push({box:frame,segments,color:item.color});if(parts.length+pending.filter(p=>p.points.length).length>30)return null;continue;}
  if(item.depth>=8||parts.length+pending.length+2>30)return null;
  const axis=frame.w>=frame.h?'x':'y',cut=frame[axis]+Math.floor((axis==='x'?frame.w:frame.h)/2);
  /** @type {Point[]} */const a=[];
  /** @type {Point[]} */const b=[];
  for(const p of item.points)(p[axis]<cut?a:b).push(p);
  if(!a.length||!b.length)return null;
  pending.push({points:a,depth:item.depth+1,color:item.color},{points:b,depth:item.depth+1,color:item.color});
 }
 return parts.length?{box,baseColor,parts,...(palette?{disjoint:true}:{})}:null;
}
module.exports={measureSourceOutlinePaint};
