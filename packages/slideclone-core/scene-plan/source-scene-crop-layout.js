// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{index:number,w:number,h:number}} Size */
/** @typedef {{x:number,y:number,w:number,h:number}} Rect */
/** @typedef {Rect&{index:number}} Placement */
/** @typedef {{width:number,height:number,placed:Placement[]}} Layout */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {Rect} a @param {Rect} b */
function contains(a,b){return a.x<=b.x&&a.y<=b.y&&a.x+a.w>=b.x+b.w&&a.y+a.h>=b.y+b.h;}
/** Packing operates only on admitted dimensions. It never reads source pixels,
 * resizes/rotates crops, removes targets or changes their source mapping.
 * @param {Size[]} sizes @param {number} width @param {number} height @returns {Layout|null} */
function pack(sizes,width,height){
 /** @type {Rect[]} */let free=[{x:0,y:0,w:width,h:height}];
 /** @type {Placement[]} */const placed=[];
 for(const size of sizes){
  /** @type {{rect:Rect,score:number[]}|null} */let selected=null;
  for(const rect of free){
   if(size.w>rect.w||size.h>rect.h)continue;
   const score=[Math.min(rect.w-size.w,rect.h-size.h),Math.max(rect.w-size.w,rect.h-size.h),rect.y,rect.x];
   if(!selected||score.some((v,i)=>v<(selected?.score[i]??Infinity)&&score.slice(0,i).every((n,j)=>n===selected?.score[j])))selected={rect,score};
  }
  if(!selected)return null;
  const r={index:size.index,x:selected.rect.x,y:selected.rect.y,w:size.w,h:size.h};placed.push(r);
  /** @type {Rect[]} */const split=[];
  for(const f of free){
   if(r.x>=f.x+f.w||r.x+r.w<=f.x||r.y>=f.y+f.h||r.y+r.h<=f.y){split.push(f);continue;}
   if(r.x>f.x)split.push({...f,w:r.x-f.x});
   if(r.x+r.w<f.x+f.w)split.push({...f,x:r.x+r.w,w:f.x+f.w-r.x-r.w});
   if(r.y>f.y)split.push({...f,h:r.y-f.y});
   if(r.y+r.h<f.y+f.h)split.push({...f,y:r.y+r.h,h:f.y+f.h-r.y-r.h});
  }
  // This bounds optional packing work independently of source/model budgets.
  // A stopped search grants no permission to exceed the original sheet limit.
  if(split.length>1024)return null;
  free=split.filter((a,i)=>!split.some((b,j)=>i!==j&&contains(b,a)
   &&(i>j||a.x!==b.x||a.y!==b.y||a.w!==b.w||a.h!==b.h)));
 }
 return {width:Math.max(...placed.map(r=>r.x+r.w)),height:Math.max(...placed.map(r=>r.y+r.h)),placed};
}
/** The original shelf is a fallback: bounded packing may improve its area,
 * never worsen it or create a new rejection for a previously fitting sheet.
 * @param {Size[]} sizes @returns {Layout} */
function shelfLayout(sizes){
 const shelf=Math.max(...sizes.map(s=>s.w),Math.ceil(Math.sqrt(sizes.reduce((n,s)=>n+s.w*s.h,0))));
 let x=0,y=0,row=0,width=0,height=0;
 const placed=sizes.map(s=>{if(x&&x+s.w>shelf){x=0;y+=row;row=0;}
  const r={...s,x,y};x+=s.w;row=Math.max(row,s.h);width=Math.max(width,x);height=Math.max(height,y+row);return r;});
 return {width,height,placed};
}
/** @param {unknown} input @returns {{width:number,height:number,placements:{index:number,x:number,y:number}[]}} */
function planSceneCropLayout(input){
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length<1||input.length>32
  ||Reflect.ownKeys(input).length!==input.length+1||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!("value" in p)))
  throw new TypeError("Scene layout targets are invalid");
 const ids=new Set();
 /** @type {Size[]} */const sizes=input.map(raw=>{
  if(!record(raw)||typeof raw.index!=="number"||typeof raw.w!=="number"||typeof raw.h!=="number"
   ||![raw.index,raw.w,raw.h].every(Number.isSafeInteger)||raw.index<0||raw.index>=512||ids.has(raw.index)
   ||raw.w<1||raw.h<1||raw.w>16384||raw.h>16384)throw new TypeError("Scene layout dimensions are invalid");
  ids.add(raw.index);return {index:raw.index,w:raw.w+16,h:raw.h+16};
 });
 const area=sizes.reduce((n,s)=>n+s.w*s.h,0),minimum=Math.max(...sizes.map(s=>s.w)),root=Math.ceil(Math.sqrt(area));
 if(area>4000000||minimum>16384||sizes.some(s=>s.h>16384))throw new RangeError("Scene sheet exceeds pixel budget");
 let best=shelfLayout(sizes);
 const widths=new Set([minimum,...[.5,.6,.7,.8,.9,1,1.1,1.2,1.4,1.6,2,2.5,3].map(f=>Math.max(minimum,Math.ceil(root*f)))]);
 for(let i=0;i<=64;i++)widths.add(Math.ceil(minimum+(root*3-minimum)*i/64));
 const orders=[sizes.slice().sort((a,b)=>b.h-a.h||b.w-a.w||a.index-b.index),
  sizes.slice().sort((a,b)=>b.w*b.h-a.w*a.h||a.index-b.index),
  sizes.slice().sort((a,b)=>Math.max(b.w,b.h)-Math.max(a.w,a.h)||a.index-b.index)];
 for(const width of widths){
  if(width>16384)continue;
  for(const order of orders){
   let low=Math.max(...sizes.map(s=>s.h),Math.ceil(area/width)),high=Math.min(16384,Math.floor(4000000/width));
   for(let step=0;step<15&&low<=high;step++){
    const height=Math.floor((low+high)/2),fit=pack(order,width,height);
    if(fit){const area=fit.width*fit.height,bestArea=best.width*best.height;
     if(area<bestArea||area===bestArea&&Math.max(fit.width,fit.height)<Math.max(best.width,best.height))best=fit;
     high=height-1;
    }else low=height+1;
   }
  }
 }
 if(best.width>16384||best.height>16384||best.width*best.height>4000000)throw new RangeError("Scene sheet exceeds pixel budget");
 const positions=new Map(best.placed.map(p=>[p.index,p]));
 return {width:best.width,height:best.height,placements:sizes.map(s=>{
  const p=positions.get(s.index);if(!p)throw new TypeError("Scene layout target binding failed");
  return {index:s.index,x:p.x+8,y:p.y+8};
 })};
}
module.exports={planSceneCropLayout};
