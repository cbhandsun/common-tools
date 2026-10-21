// @ts-check
"use strict";
const {types}=require('node:util');
const {residualSourceTextEvidence}=require('./residual-source-text-evidence');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==='object'&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))
 &&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>'value' in p);}
/** @param {unknown} value @param {{widthPt:number,heightPt:number}} size @returns {Box} */
function frame(value,size){
 if(!record(value)||![value.x,value.y,value.w,value.h].every(v=>typeof v==='number'&&Number.isFinite(v))
  ||Number(value.x)<0||Number(value.y)<0||Number(value.w)<=0||Number(value.h)<=0
  ||Number(value.x)+Number(value.w)>size.widthPt||Number(value.y)+Number(value.h)>size.heightPt)
  throw new TypeError('Scene source text frame is invalid');
 return {x:Number(value.x),y:Number(value.y),w:Number(value.w),h:Number(value.h)};
}
/** Native layout is an output, not a source exclusion mask. Snapshot the
 * admitted OCR frame for every measurement stage; keep the rendered text and
 * its native frame untouched. No source pixels, ink rights or budget are added.
 * Legacy text without source evidence retains its existing frame contract.
 * @template {{text:string,box:Box,source?:Record<string,unknown>}} T
 * @param {T[]} texts @param {{width:number,height:number}} image
 * @param {{widthPt:number,heightPt:number}} size @returns {T[]} */
function sourceSceneTextBoxes(texts,image,size){
 if(!record(image)||![image.width,image.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||image.width*image.height>40000000||!record(size)
  ||![size.widthPt,size.heightPt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>0&&n<=100000)
  ||!Array.isArray(texts)||types.isProxy(texts)||Object.getPrototypeOf(texts)!==Array.prototype||texts.length>10000
  ||Reflect.ownKeys(texts).length!==texts.length+1||Object.values(Object.getOwnPropertyDescriptors(texts)).some(p=>!('value' in p)))
  throw new TypeError('Scene source text controls are invalid');
 return texts.map(text=>{
  if(!record(text)||typeof text.text!=='string'||text.text.length>16000
   ||text.source!==undefined&&!record(text.source))throw new TypeError('Scene source text controls are invalid');
  const source=text.source;
  const explicit=source&&(source.evidenceBox!==undefined||source.ocrPolygonPt!==undefined);
  if(source?.evidenceBox!==undefined)frame(source.evidenceBox,size);
  // Geometry validation needs no paint hypothesis. Source glyph measurement
  // still uses the actual font color in its original, separate private ledger.
  const box=explicit?residualSourceTextEvidence({...text,font:{color:'#000000'}},image,size).box:frame(text.box,size);
  return {...text,box:{...box}};
 });
}
module.exports={sourceSceneTextBoxes};
