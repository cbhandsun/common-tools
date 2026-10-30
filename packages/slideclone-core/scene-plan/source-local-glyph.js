// @ts-check
'use strict';
const {types}=require('node:util');
const {record,box:validBox}=require('./source-scene-group-containment');
/** @typedef {import('./source-scene-plan').Box} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** Measure a single complete contrasting stroke on a locally observed flat
 * surface. Provider colors are not source colors. This returns geometry only,
 * never transcription, background replacement or admission authority.
 * @param {unknown} input */
function measureSourceLocalGlyph(input){
 const invalid=()=>{throw new TypeError('Source local glyph controls are invalid');};
 if(!record(input)||Reflect.ownKeys(input).length!==4||!record(input.image)||!validBox(input.box)
  ||!validBox(input.seed)||!record(input.budget))return invalid();
 const {image:im,box:b,seed,budget}=input;
 if(![im.width,im.height].every(n=>typeof n==='number'&&Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||Number(im.width)*Number(im.height)>40000000||types.isProxy(im.rgba)||!types.isUint8Array(im.rgba)
  ||!Number.isSafeInteger(budget.used)||Number(budget.used)<0||Number(budget.used)>4000000
  ||Object.getOwnPropertyDescriptor(budget,'used')?.writable!==true)return invalid();
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,'buffer',im.rgba),offset=Reflect.get(proto,'byteOffset',im.rgba),length=Reflect.get(proto,'length',im.rgba);
 if(!types.isArrayBuffer(buffer)||length!==Number(im.width)*Number(im.height)*4)return invalid();
 const rgba=new Uint8Array(buffer,offset,length),width=Number(im.width),height=Number(im.height);
 const x0=Math.floor(b.x),y0=Math.floor(b.y),w=Math.ceil(b.x+b.w)-x0,h=Math.ceil(b.y+b.h)-y0,area=w*h;
 if(x0<0||y0<0||x0+w>width||y0+h>height||w>256||h>256||area>262144
  ||seed.x<b.x||seed.y<b.y||seed.x+seed.w>b.x+b.w||seed.y+seed.h>b.y+b.h)return invalid();
 if(w<5||h<5)return null;
 // Include raster, flood traversal, and the counter rejection in the original
 // shared pixel budget. Reserve before reading; no partial measurement escapes.
 if(Number(budget.used)+area*4>4000000)throw new RangeError('Scene crop pixel budget exceeded');
 budget.used=Number(budget.used)+area*4;
 /** @param {number} n */
 const color=n=>{const i=((Math.floor(n/w)+y0)*width+n%w+x0)*4;return [rgba[i]??0,rgba[i+1]??0,rgba[i+2]??0];};
 /** @type {number[][]} */const pixels=[];
 /** @type {number[][]} */const rim=[];
 for(let n=0;n<area;n++){
  const x=n%w,y=Math.floor(n/w),i=((y+y0)*width+x+x0)*4;if(rgba[i+3]!==255)return null;
  const c=color(n);pixels.push(c);if(x===0||y===0||x===w-1||y===h-1)rim.push(c);
 }
 const background=[0,1,2].map(c=>rim.map(p=>p[c]??0).sort((a,b)=>a-b)[Math.floor(rim.length/2)]??0);
 if(rim.filter(p=>p.every((v,c)=>Math.abs(v-(background[c]??0))<=18)).length/rim.length<.9)return null;
 /** @param {number[]} c */const luminance=c=>(c[0]??0)*.2126+(c[1]??0)*.7152+(c[2]??0)*.0722;
 const bgLight=luminance(background),mask=Uint8Array.from(pixels,p=>Math.max(...p.map((v,c)=>Math.abs(v-(background[c]??0))))>=42
  &&Math.abs(luminance(p)-bgLight)>=42?1:0),queue=new Int32Array(area),seen=new Uint8Array(area);
 let count=0,minX=w,minY=h,maxX=0,maxY=0;
 /** @type {number[]} */const cells=[];
 /** @param {number} n */const neighbors=n=>{const x=n%w,y=Math.floor(n/w);return [x?n-1:-1,x<w-1?n+1:-1,y?n-w:-1,y<h-1?n+w:-1];};
 for(let start=0;start<area;start++){
  if(!mask[start]||seen[start])continue;if(count)return null;
  let head=0,tail=1,seeded=false;queue[0]=start;seen[start]=1;
  while(head<tail){
   const n=queue[head++]??0,x=n%w,y=Math.floor(n/w);
   if(x===0||y===0||x===w-1||y===h-1)return null;
   seeded ||= x+x0>=Math.floor(seed.x)&&y+y0>=Math.floor(seed.y)&&x+x0<Math.ceil(seed.x+seed.w)&&y+y0<Math.ceil(seed.y+seed.h);
   cells.push(n);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
   for(const next of neighbors(n))if(next>=0&&mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}
  }
  if(!seeded||tail<12)return null;count=tail;
 }
 if(!count)return null;
 // Reject an enclosed counter masquerading as a stroke on the wrong surface.
 // The border is source background; every non-stroke cell must reach it.
 let head=0,tail=1;queue[0]=0;seen.fill(0);seen[0]=1;
 while(head<tail){const n=queue[head++]??0;for(const next of neighbors(n))if(next>=0&&!mask[next]&&!seen[next]){seen[next]=1;queue[tail++]=next;}}
 if(tail+count!==area)return null;
 const box={x:x0+minX,y:y0+minY,w:maxX-minX+1,h:maxY-minY+1};
 // A model rectangle is a localization seed, not a fractional ink-area cap.
 // The complete component may occupy the fixed two-pixel search rim, but a
 // broad or displaced seed cannot claim some unrelated inner component.
 if(Math.abs(box.x-seed.x)>2||Math.abs(box.y-seed.y)>2
  ||Math.abs(box.x+box.w-seed.x-seed.w)>2||Math.abs(box.y+box.h-seed.y-seed.h)>2)return null;
 return {box,count,cells:cells.map(n=>(y0+Math.floor(n/w))*width+x0+n%w).sort((a,b)=>a-b)};
}
/** Both views must independently measure exactly the same source cells.
 * Reserve both scans in advance; an exhausted optional path grants nothing.
 * @param {Raster} image @param {Box} outer @param {Box} a @param {Box} b @param {{used:number}} budget */
function matchSourceLocalGlyphDetailed(image,outer,a,b,budget){
 if(!record(image)||!validBox(outer)||!validBox(a)||!validBox(b)||!record(budget)
  ||typeof budget.used!=='number'||!Number.isSafeInteger(budget.used)||budget.used<0||budget.used>4000000)
  throw new TypeError('Source local glyph controls are invalid');
 /** @param {Box} seed */
 const window=seed=>{
  const x=Math.max(Math.floor(outer.x),Math.floor(seed.x)-2),y=Math.max(Math.floor(outer.y),Math.floor(seed.y)-2);
  const right=Math.min(Math.ceil(outer.x+outer.w),Math.ceil(seed.x+seed.w)+2),bottom=Math.min(Math.ceil(outer.y+outer.h),Math.ceil(seed.y+seed.h)+2);
  if(right<=x||bottom<=y||right-x>256||bottom-y>256||seed.x<x||seed.y<y||seed.x+seed.w>right||seed.y+seed.h>bottom)return null;
  return {x,y,w:right-x,h:bottom-y};
 };
 const wa=window(a),wb=window(b);if(!wa||!wb||budget.used+(wa.w*wa.h+wb.w*wb.h)*4>4000000)return null;
 const first=measureSourceLocalGlyph({image,box:wa,seed:a,budget}),second=measureSourceLocalGlyph({image,box:wb,seed:b,budget});
 if(!first||!second||first.cells.length!==second.cells.length||first.cells.some((n,i)=>n!==second.cells[i]))return null;
 if(first.box.x<outer.x||first.box.y<outer.y||first.box.x+first.box.w>outer.x+outer.w||first.box.y+first.box.h>outer.y+outer.h)return null;
 return first;
}
/** @param {Raster} image @param {Box} outer @param {Box} a @param {Box} b @param {{used:number}} budget */
function matchSourceLocalGlyph(image,outer,a,b,budget){return matchSourceLocalGlyphDetailed(image,outer,a,b,budget)?.box??null;}
module.exports={measureSourceLocalGlyph,matchSourceLocalGlyph,matchSourceLocalGlyphDetailed};
