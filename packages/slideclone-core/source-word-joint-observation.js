// @ts-check
"use strict";
const {types}=require('node:util');
const {classifySourceRowComponents}=require('./source-row-component-ownership');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{box:Box,color:string,confidence:number}} Row */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{image:Raster,source:Uint8Array,sourceWidth:number,sourceHeight:number,left:number,top:number,width:number,height:number,rgba:Uint8Array,owners:Uint8Array}} Observation */
/** @type {WeakMap<object,Set<object>>} */const targets=new WeakMap();
/** @type {WeakMap<object,Observation&{anchor:Box,row:number}>} */const proofs=new WeakMap();
/** @type {WeakMap<object,{image:object,rows:object,windows:Map<string,Observation|null>}>} */const caches=new WeakMap();
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value'in p);}
/** @param {unknown} v @returns {v is number} */
function finite(v){return typeof v==='number'&&Number.isFinite(v);}
/** @param {unknown} v @returns {v is Box} */
function box(v){return record(v)&&[v.x,v.y,v.w,v.h].every(finite)&&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0;}
/** Capture joint source evidence only after an ordinary rotated measurement
 * fails. Private capabilities bind exact source bytes, anchor and component
 * attribution. This shares the original 4M source budget and 32 target limit.
 * No caller-supplied pixel mask or separator is accepted.
 * @param {unknown} input */
function observeJointSourceWordRows(input){
 if(!record(input)||!record(input.image)||!box(input.anchor)||!record(input.budget)
  ||!finite(input.budget.remaining)||!Number.isSafeInteger(input.budget.remaining)||input.budget.remaining<0||input.budget.remaining>4000000)
  throw new TypeError('joint source word request is invalid');
 const {width,height,rgba}=input.image;
 if(!finite(width)||!finite(height)||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)||width*height>40000000
  ||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError('joint source word image is invalid');
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',rgba),length=Reflect.get(proto,'length',rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4)throw new TypeError('joint source word image is invalid');
 const bytes=new Uint8Array(buffer,Reflect.get(proto,'byteOffset',rgba),length),rows=input.rows;
 if(!Array.isArray(rows)||types.isProxy(rows)||Object.getPrototypeOf(rows)!==Array.prototype||rows.length>10000
  ||Reflect.ownKeys(rows).length!==rows.length+1||Object.values(Object.getOwnPropertyDescriptors(rows)).some(p=>!('value'in p))
  ||rows.some(r=>!record(r)||!box(r.box)||r.box.x+r.box.w>width||r.box.y+r.box.h>height
   ||typeof r.color!=='string'||!/^#[a-f0-9]{6}$/iu.test(r.color)||!finite(r.confidence)||r.confidence<0||r.confidence>1))
  throw new TypeError('joint source word rows are invalid');
 const admitted=/** @type {Row[]} */(rows),anchor=input.anchor;
 const anchors=admitted.filter(r=>r.box===anchor);if(anchors.length!==1||!anchors[0]||anchors[0].confidence<.9)return null;
 const cluster=[anchors[0]],seen=new Set(cluster);
 for(let i=0;i<cluster.length;i++){
  const a=cluster[i]?.box;if(!a)return null;
  for(const row of admitted){if(seen.has(row)||row.confidence<.9)continue;const b=row.box;
   if(Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))<.8*Math.min(a.w,b.w)
    ||a.y>b.y+b.h+2||b.y>a.y+a.h+2)continue;
   cluster.push(row);seen.add(row);if(cluster.length>4)return null;
  }
 }
 if(cluster.length<2)return null;
 cluster.sort((a,b)=>a.box.y+a.box.h/2-b.box.y-b.box.h/2);
 if(cluster.some((r,i)=>i>0&&r.box.y+r.box.h/2===(cluster[i-1]?.box.y??0)+(cluster[i-1]?.box.h??0)/2))return null;
 const left=Math.max(0,Math.floor(Math.min(...cluster.map(r=>r.box.x)))-2),top=Math.max(0,Math.floor(Math.min(...cluster.map(r=>r.box.y)))-2);
 const right=Math.min(width,Math.ceil(Math.max(...cluster.map(r=>r.box.x+r.box.w)))+2),bottom=Math.min(height,Math.ceil(Math.max(...cluster.map(r=>r.box.y+r.box.h)))+2);
 const w=right-left,h=bottom-top,area=w*h;
 // Other overlapping OCR evidence has not participated in this correspondence.
 if(admitted.some(r=>!seen.has(r)&&r.box.x<right&&r.box.x+r.box.w>left&&r.box.y<bottom&&r.box.y+r.box.h>top))return null;
 const key=JSON.stringify(cluster.map(r=>[r.box.x,r.box.y,r.box.w,r.box.h,r.color,r.confidence]));
 let cache=caches.get(input.budget);
 if(!cache||cache.image!==input.image||cache.rows!==rows){cache={image:input.image,rows,windows:new Map()};caches.set(input.budget,cache);}
 if(cache.windows.has(key)){
  const observed=cache.windows.get(key);if(!observed)return null;
  const token=Object.freeze({});proofs.set(token,{...observed,anchor,row:cluster.indexOf(anchors[0])+1});return token;
 }
 if(area>262144||area>input.budget.remaining)return null;
 const counted=targets.get(input.budget)??new Set();
 if(new Set([...counted,...cluster.map(r=>r.box)]).size>32)return null;
 cluster.forEach(r=>counted.add(r.box));targets.set(input.budget,counted);
 input.budget.remaining-=area;
 cache.windows.set(key,null);
 const local=new Uint8Array(area*4),ink=new Uint8Array(area);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){
  const src=((y+top)*width+x+left)*4,dst=(y*w+x)*4;
  if((bytes[src+3]??0)<240)return null;
  for(let c=0;c<4;c++)local[dst+c]=bytes[src+c]??0;
 }
 const corners=[0,(w-1)*4,(h-1)*w*4,(area-1)*4];
 const background=[0,1,2].map(c=>{const v=corners.map(p=>local[p+c]??0).sort((a,b)=>a-b);return ((v[1]??0)+(v[2]??0))/2;});
 const stable=corners.every(p=>background.every((v,c)=>Math.abs(v-(local[p+c]??0))<=18));
 const colors=cluster.map(r=>[1,3,5].map(o=>parseInt(r.color.slice(o,o+2),16)));
 for(let i=0;i<area;i++){
  const p=i*4,contrast=background.map((v,c)=>v-(local[p+c]??0));
  if(colors.some(color=>{
   if(color.every((v,c)=>Math.abs(v-(local[p+c]??0))<=65))return true;
   if(!stable||Math.max(...contrast.map(Math.abs))<42)return false;
   const delta=background.map((v,c)=>v-(color[c]??0)),norm=delta.reduce((a,v)=>a+v*v,0);if(!norm)return false;
   const alpha=contrast.reduce((a,v,c)=>a+v*(delta[c]??0),0)/norm;
   return alpha>0&&alpha<=1&&contrast.every((v,c)=>Math.abs(v-alpha*(delta[c]??0))<=18);
  }))ink[i]=1;
 }
 const classified=classifySourceRowComponents({width:w,height:h,ink,rows:cluster.map(r=>({...r.box,x:r.box.x-left,y:r.box.y-top}))});
 if(!classified)return null;
 const observed={image:/** @type {Raster} */(input.image),source:/** @type {Uint8Array} */(rgba),sourceWidth:width,sourceHeight:height,left,top,width:w,height:h,rgba:local,owners:classified.owners};cache.windows.set(key,observed);
 const token=Object.freeze({});proofs.set(token,{...observed,anchor,row:cluster.indexOf(anchors[0])+1});
 return token;
}
/** Unknown or modified source pixels never acquire ownership from a token.
 * Return 1 for own, 0 for witnessed foreign, 255 for unresolved.
 * @param {unknown} token @param {Raster} image @param {Box} anchor @param {number} x @param {number} y */
function sampleJointSourceWordOwner(token,image,anchor,x,y){
 if(token===null||typeof token!=='object'||types.isProxy(token))return 255;
 const p=proofs.get(token);if(!p||p.image!==image||p.anchor!==anchor||!record(image)||image.rgba!==p.source||image.width!==p.sourceWidth||image.height!==p.sourceHeight||!Number.isSafeInteger(x)||!Number.isSafeInteger(y)
  ||x<p.left||x>=p.left+p.width||y<p.top||y>=p.top+p.height)return 255;
 const at=(y-p.top)*p.width+x-p.left,src=(y*image.width+x)*4;
 for(let c=0;c<4;c++)if(image.rgba[src+c]!==p.rgba[at*4+c])return 255;
 const owner=p.owners[at];return !owner||owner===255?255:owner===p.row?1:0;
}
module.exports={observeJointSourceWordRows,sampleJointSourceWordOwner};
