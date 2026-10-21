// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{text:string,box:Box}} Run */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {number} maximum @returns {value is unknown[]} */
function list(value,maximum){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {number} length @returns {value is Uint8Array} */
function bytes(value,length){
 if(types.isProxy(value)||!types.isUint8Array(value)||![Uint8Array.prototype,Buffer.prototype].includes(Object.getPrototypeOf(value)))return false;
 const proto=Object.getPrototypeOf(Uint8Array.prototype);
 return types.isArrayBuffer(Reflect.get(proto,"buffer",value))&&Reflect.get(proto,"length",value)===length
  &&!Object.hasOwn(value,"length");
}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(n=>typeof n==="number"&&Number.isSafeInteger(n))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** Derive a WordArt canvas from the continuous half-coverage boundary of an
 * already isolated source glyph. Complete antialiased ink, its grouping and
 * source frame remain the physical evidence; this result grants no pixel,
 * erasure, split or background ownership. All reads use the charged local
 * snapshot. Sparse opaque cores and ambiguous backgrounds keep ordinary bounds.
 * @param {unknown} input @returns {readonly Run[]|null} */
function measureSourceWordTypographicGeometry(input){
 if(!record(input)||![input.width,input.height,input.left,input.top].every(n=>typeof n==="number"&&Number.isSafeInteger(n))
  ||Number(input.width)<1||Number(input.height)<1||Number(input.left)<0||Number(input.top)<0
  ||Number(input.left)+Number(input.width)>16384||Number(input.top)+Number(input.height)>16384)
  throw new TypeError("Source typographic frame is invalid");
 const width=Number(input.width),height=Number(input.height),left=Number(input.left),top=Number(input.top),pixels=width*height;
 if(pixels>262144||!bytes(input.ink,pixels)||!bytes(input.rgba,pixels*4)
  ||!list(input.background,3)||input.background.length!==3||!list(input.color,3)||input.color.length!==3
  ||[...input.background,...input.color].some(c=>typeof c!=="number"||!Number.isFinite(c)||c<0||c>255)
  ||!list(input.runs,512))throw new TypeError("Source typographic evidence is invalid");
 const ink=input.ink,rgba=input.rgba,background=input.background.map(Number),color=input.color.map(Number);
 /** @type {Run[]} */const runs=[];let end=left,characters=0;
 for(const raw of input.runs){
  if(!record(raw)||typeof raw.text!=="string"||!raw.text.trim()||raw.text.length>512
   ||Array.from(raw.text).some(c=>c.charCodeAt(0)<32||c.charCodeAt(0)===127)||!box(raw.box)
   ||raw.box.x<end||raw.box.y<top||raw.box.x+raw.box.w>left+width||raw.box.y+raw.box.h>top+height)
   throw new TypeError("Source typographic runs are invalid");
  characters+=raw.text.length;if(characters>512)throw new TypeError("Source typographic runs are invalid");
  end=raw.box.x+raw.box.w;runs.push({text:raw.text,box:{...raw.box}});
 }
 for(let n=0;n<pixels;n++)if((ink[n]??0)>1||(rgba[n*4+3]??0)<240)throw new TypeError("Source typographic raster is invalid");
 const delta=background.map((value,c)=>value-(color[c]??0)),norm=delta.reduce((sum,d)=>sum+d*d,0);
 if(!norm||!runs.length)return null;
 /** @param {number} x @param {number} y */
 const alpha=(x,y)=>{
  if(x<left||y<top||x>=left+width||y>=top+height)return 0;
  const n=(y-top)*width+x-left;if(!ink[n])return 0;
  return Math.max(0,Math.min(1,background.reduce((sum,bg,c)=>sum+(bg-(rgba[n*4+c]??0))*(delta[c]??0),0)/norm));
 };
 let changed=false;
 const result=runs.map(run=>{
  const b=run.box;let x0=Infinity,x1=-1,y0=Infinity,y1=-1,count=0;
  for(let y=b.y;y<b.y+b.h;y++)for(let x=b.x;x<b.x+b.w;x++)if(alpha(x,y)>=.5){
   count++;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
  }
  if(count<8)return run;
  let firstX=Infinity,lastX=-Infinity,firstY=Infinity,lastY=-Infinity;
  for(let y=y0;y<=y1;y++){
   const a=alpha(x0,y),before=alpha(x0-1,y);if(a>=.5&&before<.5)firstX=Math.min(firstX,x0+.5-(a-.5)/(a-before));
   const last=alpha(x1,y),after=alpha(x1+1,y);if(last>=.5&&after<.5)lastX=Math.max(lastX,x1+.5+(last-.5)/(last-after));
  }
  for(let x=x0;x<=x1;x++){
   const a=alpha(x,y0),before=alpha(x,y0-1);if(a>=.5&&before<.5)firstY=Math.min(firstY,y0+.5-(a-.5)/(a-before));
   const last=alpha(x,y1),after=alpha(x,y1+1);if(last>=.5&&after<.5)lastY=Math.max(lastY,y1+.5+(last-.5)/(last-after));
  }
  firstX=Math.max(b.x,firstX);firstY=Math.max(b.y,firstY);lastX=Math.min(b.x+b.w,lastX);lastY=Math.min(b.y+b.h,lastY);
  if(![firstX,firstY,lastX,lastY].every(Number.isFinite)||lastX<=firstX||lastY<=firstY)return run;
  const next={x:firstX,y:firstY,w:lastX-firstX,h:lastY-firstY};
  if(next.x+next.w>b.x+b.w||next.y+next.h>b.y+b.h)return run;
  if(next.x!==b.x||next.y!==b.y||next.w!==b.w||next.h!==b.h)changed=true;
  return {text:run.text,box:next};
 });
 return changed?Object.freeze(result.map(run=>Object.freeze({text:run.text,box:Object.freeze(run.box)}))):null;
}
module.exports={measureSourceWordTypographicGeometry};
