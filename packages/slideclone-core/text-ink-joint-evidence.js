// @ts-check
"use strict";
const {record,list}=require('./typography-contract');
const {types}=require('node:util');
const {observeJointSourceWordRows,sampleJointSourceWordOwner}=require('./source-word-joint-observation');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** Private component attribution may exclude only independently witnessed
 * FOREIGN ink from a measurement. Unknown cells remain visible. No pixels are
 * edited and this comparison evidence grants no erasure/completion authority.
 * @param {Raster} image @param {unknown[]} texts
 * @param {{widthPt:number,heightPt:number}} size */
function createJointTextInkEvidence(image,texts,size){
 if(!record(image)||!record(size)||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||types.isProxy(image.rgba)||!types.isUint8Array(image.rgba)
  ||![size.widthPt,size.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000))
  throw new TypeError('Invalid joint text evidence frame');
 const proto=Object.getPrototypeOf(Uint8Array.prototype);
 if(!types.isArrayBuffer(Reflect.get(proto,'buffer',image.rgba))||Reflect.get(proto,'length',image.rgba)!==image.width*image.height*4)
  throw new TypeError('Invalid joint text evidence pixels');
 /** @type {{id:string,box:Box,color:string,confidence:number}[]} */const rows=[];
 for(const t of list(texts,2000)){
  if(!record(t)||!record(t.source)||!record(t.font)||typeof t.id!=='string')continue;
  const b=t.source.componentQualityBox??t.source.evidenceBox;
  const confidence=t.source.confidence,color=t.font.color;
  if(!record(b)||![b.x,b.y,b.w,b.h].every(v=>typeof v==='number'&&Number.isFinite(v))
   ||Number(b.x)<0||Number(b.y)<0||Number(b.w)<=0||Number(b.h)<=0
   ||Number(b.x)+Number(b.w)>size.widthPt||Number(b.y)+Number(b.h)>size.heightPt
   ||typeof confidence!=='number'||!Number.isFinite(confidence)||confidence<0||confidence>1
   ||typeof color!=='string'||!/^#[a-f0-9]{6}$/iu.test(color))continue;
  rows.push({id:t.id,box:{x:Number(b.x)*image.width/size.widthPt,y:Number(b.y)*image.height/size.heightPt,
   w:Number(b.w)*image.width/size.widthPt,h:Number(b.h)*image.height/size.heightPt},color,confidence});
 }
 const budget={remaining:4000000};
 return {
  /** Every charged observation shares this ledger, including failed probes.
   * @param {string} id @param {number} available */
  observe(id,available){
   if(typeof id!=='string'||!id||id.length>256||!Number.isSafeInteger(available)||available<0||available>20000000)
    throw new TypeError('Invalid joint text sampling budget');
   const row=rows.find(r=>r.id===id);if(!row)return {samples:0,accept:null};
   budget.remaining=Math.min(budget.remaining,available);const before=budget.remaining;
   const token=observeJointSourceWordRows({image,rows,anchor:row.box,budget});
   return {samples:before-budget.remaining,accept:token?
    (/** @type {number} */x,/** @type {number} */y)=>sampleJointSourceWordOwner(token,image,row.box,x,y)!==0:null};
  }
 };
}
module.exports={createJointTextInkEvidence};
