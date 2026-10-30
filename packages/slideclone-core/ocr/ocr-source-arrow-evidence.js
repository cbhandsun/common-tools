// @ts-check
'use strict';
const {types}=require('node:util');
const {sourceRaster}=require('../typography/residual-text-mask');
const {sourceVisibleArrowTerminals}=require('../routing/source-visible-arrow-terminals');
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** A size-independent OCR veto needs positive geometry, not low confidence.
 * Prove one tapered arrow head, a contiguous thin shaft and a single thin
 * perpendicular continuation longer than the head. A clipped head, another
 * branch, a detached baseline or ordinary glyph counters grant no proof.
 * Only the caller's already charged immutable crop is read; no source ledger
 * or erasure rights are created here.
 * @param {unknown} value @returns {boolean} */
function hasSourceArrowTerminal(value){
 if(!record(value)||!record(value.box)||Reflect.ownKeys(value.box).length!==4)return false;
 let image;try{image=sourceRaster(value.image);}catch{return false;}
 const {width,height,rgba}=image,b=value.box;
 if(width>512||height>512||width*height>262144||![b.x,b.y,b.w,b.h].every(n=>typeof n==='number'&&Number.isSafeInteger(n))
  ||Number(b.x)<0||Number(b.y)<0||Number(b.w)<3||Number(b.h)<3
  ||Number(b.x)+Number(b.w)>width||Number(b.y)+Number(b.h)>height)return false;
 const box={x:Number(b.x),y:Number(b.y),w:Number(b.w),h:Number(b.h)};
 /** @type {number[][]} */const colors=[];
 for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
  const o=(y*width+x)*4;if((rgba[o+3]??0)<240)return false;
  colors.push([rgba[o]??0,rgba[o+1]??0,rgba[o+2]??0]);
 }
 const background=[0,1,2].map(c=>colors.map(rgb=>rgb[c]??0).sort((a,b)=>a-b)[Math.floor(colors.length/2)]??0);
 const contrast=(/** @type {number[]} */rgb)=>Math.max(...rgb.map((v,c)=>Math.abs(v-(background[c]??0))));
 const ordered=colors.sort((a,b)=>contrast(b)-contrast(a)),foreground=ordered[Math.floor(ordered.length/8)];
 if(!foreground||!background||Math.max(...foreground.map((v,c)=>Math.abs(v-(background[c]??0))))<64)return false;
 const mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length);
 for(let i=0;i<mask.length;i++)if((rgba[i*4+3]??0)>=240
  &&foreground.every((v,c)=>Math.abs(v-(rgba[i*4+c]??0))<=18))mask[i]=1;
 const seeds=[];for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++)if(mask[y*width+x])seeds.push(y*width+x);
 const seed=seeds[0];if(seed===undefined)return false;
 const members=[seed];seen[seed]=1;
 for(let i=0;i<members.length;i++){
  if(members.length>32768)return false;
  const p=members[i];if(p===undefined)return false;const x=p%width,y=Math.floor(p/width);
  for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const xx=x+dx,yy=y+dy,n=yy*width+xx;
   if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[n]&&!seen[n]){seen[n]=1;members.push(n);}
  }
 }
 if(seeds.some(p=>!seen[p]))return false;
 for(const horizontal of [false,true])for(const sign of [1,-1]){
  const length=horizontal?width:height;
  const points=members.map(p=>{const x=p%width,y=Math.floor(p/width);return {t:sign===1?(horizontal?x:y):length-1-(horizontal?x:y),u:horizontal?y:x};});
  const first=Math.min(...points.map(p=>p.t)),last=Math.max(...points.map(p=>p.t));
  const rows=Array.from({length:last-first+1},()=>/** @type {number[]} */([]));
  for(const p of points)rows[p.t-first]?.push(p.u);
  const widths=rows.map(r=>r.length?Math.max(...r)-Math.min(...r)+1:0),counts=rows.map(r=>r.length);
  for(let end=8;end<rows.length-1;end++){
   const profile=widths.slice(0,end+1),proof=sourceVisibleArrowTerminals({widths:profile,counts:counts.slice(0,end+1),leftArrow:true,rightArrow:false});
   if(!proof)continue;
   const head=points.filter(p=>p.t<=first+end);
   if(head.some(p=>{const axis=sign===1?p.t:length-1-p.t,x=horizontal?axis:p.u,y=horizontal?p.u:axis;
    return x<box.x||x>=box.x+box.w||y<box.y||y>=box.y+box.h;}))continue;
   const body=rows.slice(proof.firstBody,end+1),centers=body.map(r=>(Math.min(...r)+Math.max(...r))/2);
   if(Math.max(...centers)-Math.min(...centers)>1.5)continue;
   const tail=points.filter(p=>p.t>first+end),tailDepth=last-first-end;
   if(!tail.length||tailDepth>5)continue;
   const lo=Math.min(...tail.map(p=>p.u)),hi=Math.max(...tail.map(p=>p.u)),center=centers.at(-1);
   if(center===undefined)continue;
   const peak=Math.max(...profile),side=hi-center>center-lo?1:-1;
   if((side===1?hi-center:center-lo)<peak*2||(side===1?center-lo:hi-center)>proof.widthPx)continue;
   const acrossLimit=horizontal?height:width;
   if(side===1?hi!==acrossLimit-1:lo!==0)continue;
   // Every continuation column is a single contiguous stroke. Nothing can
   // disappear into a head/shaft exception, including a second side branch.
   let valid=true;
   for(let u=lo;u<=hi;u++){
    const column=tail.filter(p=>p.u===u).map(p=>p.t);
    if(!column.length||Math.max(...column)-Math.min(...column)+1!==column.length||column.length>5){valid=false;break;}
   }
   if(valid)return true;
  }
 }
 return false;
}
module.exports={hasSourceArrowTerminal};
