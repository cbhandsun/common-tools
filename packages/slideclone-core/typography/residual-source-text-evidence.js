// @ts-check
"use strict";
const {types}=require("node:util");
const {parseResidualTextInk}=require("./residual-text-mask");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
  &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {{widthPt:number,heightPt:number}} size @returns {Box} */
function sourceBox(value,size){
  if(!record(value)||[value.x,value.y,value.w,value.h].some(v=>typeof v!=="number"||!Number.isFinite(v)))throw new TypeError("residual text source geometry is invalid");
  const box={x:/** @type {number} */(value.x),y:/** @type {number} */(value.y),w:/** @type {number} */(value.w),h:/** @type {number} */(value.h)};
  if(box.x<0||box.y<0||box.w<=0||box.h<=0||box.x+box.w>size.widthPt||box.y+box.h>size.heightPt)throw new TypeError("residual text source geometry is invalid");
  return box;
}
/** Resolve source geometry before using the native fitted box. Text content
 * is never copied into a mask or a diagnostic; its presence grants no ownership.
 * @param {unknown} value @param {{width:number,height:number}} image @param {{widthPt:number,heightPt:number}} size */
function residualSourceTextEvidence(value,image,size){
  if(!record(value)||typeof value.text!=="string"||!value.text.trim()||value.text.length>16000
    ||!record(value.font)||typeof value.font.color!=="string"||!/^#[a-f0-9]{6}$/iu.test(value.font.color))throw new TypeError("residual text evidence is invalid");
  if(value.source!==undefined&&!record(value.source))throw new TypeError("residual text source is invalid");
  const fontColor=value.font.color;
  const source=/** @type {Record<string,unknown>|undefined} */(value.source),box=sourceBox(source?.evidenceBox??value.box,size);
  const sx=image.width/size.widthPt,sy=image.height/size.heightPt;
  if(![sx,sy].every(v=>Number.isFinite(v)&&v>0))throw new TypeError("residual text scale is invalid");
  let polygon=[[box.x,box.y],[box.x+box.w,box.y],[box.x+box.w,box.y+box.h],[box.x,box.y+box.h]];
  if(source?.ocrPolygonPt!==undefined){
    const parsed=parseResidualTextInk({color:[0,0,0],polygon:source.ocrPolygonPt});
    if(!parsed)throw new TypeError("residual text polygon is invalid");
    const xs=parsed.polygon.map(p=>p[0]),ys=parsed.polygon.map(p=>p[1]);
    if(Math.max(...xs)>size.widthPt||Math.max(...ys)>size.heightPt)throw new TypeError("residual text source geometry is invalid");
    const envelope={x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};
    if(["x","y","w","h"].some(key=>Math.abs(envelope[/** @type {keyof Box} */(key)]-box[/** @type {keyof Box} */(key)])>1e-6))throw new TypeError("residual text polygon evidence is stale");
    polygon=parsed.polygon.map(p=>[p[0],p[1]]);
  }
  const ink=parseResidualTextInk({color:[1,3,5].map(c=>Number.parseInt(fontColor.slice(c,c+2),16)),polygon:polygon.map(p=>[(p[0]??0)*sx,(p[1]??0)*sy])});
  if(!ink)throw new TypeError("residual text evidence is invalid");
  let contextBox=box;
  if(source?.segmentedOcrLinePolygonPt!==undefined){
    if(typeof source.segmentedOcrLineId!=="string"||!source.segmentedOcrLineId||source.segmentedOcrLineId.length>128)throw new TypeError("residual text parent context is invalid");
    const parent=parseResidualTextInk({color:[0,0,0],polygon:source.segmentedOcrLinePolygonPt});
    if(!parent)throw new TypeError("residual text parent context is invalid");
    const xs=parent.polygon.map(p=>p[0]),ys=parent.polygon.map(p=>p[1]);
    contextBox=sourceBox({x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)},size);
    // A legacy horizontal segment can occupy the envelope of a slightly
    // skewed parent. This envelope is only scan context, never seed geometry.
    if(box.x<contextBox.x-1e-6||box.y<contextBox.y-1e-6||box.x+box.w>contextBox.x+contextBox.w+1e-6
      ||box.y+box.h>contextBox.y+contextBox.h+1e-6)throw new TypeError("residual text parent context is stale");
  }
  // The parent supplies background/connected-component context only. Seed and
  // erasure authority remain with the child's measured source quadrilateral.
  return {box,ink,contextBox};
}
/** @param {unknown} value @param {{width:number,height:number}} image @param {{widthPt:number,heightPt:number}} size */
function sourceTextEraseMask(value,image,size){
  const evidence=residualSourceTextEvidence(value,image,size),box=evidence.contextBox;
  const sx=image.width/size.widthPt,sy=image.height/size.heightPt;
  const px=Math.max(4,Math.round(image.width/216)),py=Math.max(3,Math.round(image.height/216));
  const x=Math.max(0,Math.floor(box.x*sx)-px),y=Math.max(0,Math.floor(box.y*sy)-py);
  return {x,y,w:Math.min(image.width,Math.ceil((box.x+box.w)*sx)+px)-x,
    h:Math.min(image.height,Math.ceil((box.y+box.h)*sy)+py)-y,textInk:evidence.ink};
}
module.exports={residualSourceTextEvidence,sourceTextEraseMask};
