// @ts-check
"use strict";
const {types}=require('node:util');
/** @typedef {{checks:number,exhausted:boolean}} Work */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&[null,Object.prototype].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} v @param {number} limit @returns {v is unknown[]} */
function list(v,limit){
 if(!Array.isArray(v)||types.isProxy(v)||Object.getPrototypeOf(v)!==Array.prototype||v.length>limit)return false;
 const keys=Reflect.ownKeys(v);
 return keys.length===v.length+1&&keys.every((key,index)=>key===(index===v.length?'length':String(index))
  &&Object.hasOwn(Object.getOwnPropertyDescriptor(v,key)??{},'value'));
}
/** Split a lossy two-color fringe into at most eight observed color clusters.
 * Source cells, paint ownership and geometry are unchanged. All distance work
 * consumes the caller's existing contour budget. Null keeps the original
 * two-color representation, unless that shared budget has been exhausted.
 * @param {unknown} input @param {unknown} control
 * @returns {{colors:string[],labels:Uint8Array}|null} */
function fitSourceOutlinePalette(input,control){
 if(!record(input)||!list(input.samples,262144)||input.samples.length<1||!list(input.centers,2)||input.centers.length!==2
  ||![...input.samples,...input.centers].every(c=>list(c,3)&&c.length===3&&c.every(v=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=255))
  ||!record(control)||!Number.isSafeInteger(control.checks)||Number(control.checks)<0||Number(control.checks)>4000001
  ||typeof control.exhausted!=='boolean'||Number(control.checks)>4000000&&!control.exhausted||Object.getOwnPropertyDescriptor(control,'checks')?.writable!==true
  ||Object.getOwnPropertyDescriptor(control,'exhausted')?.writable!==true)
  throw new TypeError('Source outline palette evidence is invalid');
 const samples=/** @type {number[][]} */(input.samples),centers=/** @type {number[][]} */(input.centers).map(c=>c.slice()),work=/** @type {Work} */(control);
 if(work.exhausted||work.checks>=4000000)return null;
 /** @param {number} count */const spend=count=>{work.checks=Math.min(4000001,work.checks+count);if(work.checks>4000000)work.exhausted=true;return !work.exhausted;};
 /** @param {number[]} a @param {number[]} b */const distance=(a,b)=>a.reduce((s,v,i)=>s+(v-(b[i]??0))**2,0);
 /** @param {number[]} c */const nearest=c=>{let k=0,best=distance(c,centers[0]??[]);
  for(let i=1;i<centers.length;i++){const d=distance(c,centers[i]??[]);if(d<best){best=d;k=i;}}return k;};
 if(!spend(samples.length*centers.length))return null;
 // Six channel levels is the existing source surface uniformity tolerance.
 // Do not multiply native parts when two source colors already explain it.
 if(samples.every(c=>{const center=centers[nearest(c)]??[];return c.every((v,i)=>Math.abs(v-(center[i]??0))<=6);}))return null;
 while(centers.length<8){
  if(!spend(samples.length*(centers.length+1)))return null;
  let farthest=samples[0]??[],error=0;
  for(const c of samples){const d=distance(c,centers[nearest(c)]??[]);if(d>error){error=d;farthest=c;}}
  if(error===0)break;centers.push(farthest.slice());
 }
 const labels=new Uint8Array(samples.length);
 for(let pass=0;pass<8;pass++){
  if(!spend(samples.length*centers.length))return null;
  const sums=centers.map(()=>[0,0,0]),counts=centers.map(()=>0);let changed=false;
  for(const [i,c]of samples.entries()){
   const k=nearest(c);changed ||= pass===0||labels[i]!==k;labels[i]=k;counts[k]=(counts[k]??0)+1;
   for(let channel=0;channel<3;channel++){const row=sums[k];if(row)row[channel]=(row[channel]??0)+(c[channel]??0);}
  }
  for(let k=0;k<centers.length;k++){const count=counts[k]??0;if(count)centers[k]=(sums[k]??[]).map(v=>Math.round(v/count));}
  if(!changed)break;
 }
 return {colors:centers.map(c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('')),labels};
}
module.exports={fitSourceOutlinePalette};
