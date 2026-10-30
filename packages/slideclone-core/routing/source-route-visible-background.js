// @ts-check
'use strict';
const {types}=require('node:util');
const {record,list}=require('../scene-plan/source-scene-group-containment');
const {sourceRaster}=require('../typography/residual-text-mask');
/** Observe only VISIBLE low-contrast background between two immediately
 * adjacent opaque source witnesses. Neither the center color nor a route,
 * mask, neighboring stroke width or provider proposal supplies the field.
 * Each witness remains below the existing 42-channel ink threshold, the
 * opposite witnesses agree within 18, and the center must independently
 * agree with their interpolation within 18. Disagreeing axes grant nothing.
 * This cannot infer the background under core ink or grant erasure authority.
 * The width caller still needs two distinct blank cells on each flank within
 * its original 12px limit, and complete-component/port/paint audits remain.
 * @param {unknown} input @returns {(index:number)=>number[]} */
function sourceRouteVisibleBackground(input){
 if(!record(input)||!list(input.background)||input.background.length!==3
  ||input.background.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>255)
  ||input.backgroundAt!==undefined&&(typeof input.backgroundAt!=='function'||types.isProxy(input.backgroundAt))
  ||!record(input.work)||!Number.isSafeInteger(input.work.checks)||Number(input.work.checks)<0
  ||Number(input.work.checks)>4000000||Object.getOwnPropertyDescriptor(input.work,'checks')?.writable!==true)
  throw new TypeError('Visible route background input is invalid');
 const image=sourceRaster(input.image),background=/** @type {number[]} */(input.background),work=/** @type {{checks:number}} */(input.work);
 if(image.width*image.height>262144)throw new RangeError('Visible route background exceeds the unit budget');
 const base=/** @type {((index:number)=>number[])|undefined} */(input.backgroundAt)??(()=>background);
 /** @type {Map<number,number[]>} */const memo=new Map();
 /** @param {number} n */const rgb=n=>[0,1,2].map(c=>image.rgba[n*4+c]??0);
 /** @param {number[]} a @param {number[]} b */const agrees=(a,b)=>a.every((v,c)=>Math.abs(v-(b[c]??0))<=18);
 /** @param {number[]} a @param {number[]} b */const weak=(a,b)=>a.every((v,c)=>Math.abs(v-(b[c]??0))<42);
 return index=>{
  if(work.checks>4000000)return background;
  if(++work.checks>4000000||!Number.isSafeInteger(index)||index<0||index>=image.width*image.height)return background;
  const cached=memo.get(index);if(cached)return cached;
  const expected=base(index),color=rgb(index);work.checks+=8;
  if(work.checks>4000000)return background;
  if((image.rgba[index*4+3]??0)<240||!weak(color,expected))return expected;
  const x=index%image.width,y=Math.floor(index/image.width);
  /** @type {number[][]} */const fields=[];
  for(const horizontal of [true,false]){
   work.checks+=24;if(work.checks>4000000)return background;
   if(horizontal?(x===0||x===image.width-1):(y===0||y===image.height-1))continue;
   const step=horizontal?1:image.width,a=index-step,b=index+step,left=rgb(a),right=rgb(b);
   if((image.rgba[a*4+3]??0)<240||(image.rgba[b*4+3]??0)<240||!agrees(left,right))continue;
   if(!weak(left,base(a))||!weak(right,base(b)))continue;
   const field=left.map((v,c)=>(v+(right[c]??0))/2);
   if(agrees(color,field))fields.push(field);
  }
  if(work.checks>4000000)return background;
  const a=fields[0],b=fields[1],result=a&&b&&!agrees(a,b)?expected:a??expected;
  memo.set(index,result);return result;
 };
}
module.exports={sourceRouteVisibleBackground};
