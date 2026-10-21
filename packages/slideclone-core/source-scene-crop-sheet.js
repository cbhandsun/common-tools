// @ts-check
"use strict";
const {types}=require("node:util");
const {planSceneCropAtlas}=require("./source-scene-crop-atlas");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Raster */
/** @typedef {{index:number,cropBox:Box,candidateBox:Box}} Target */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** @param {Box} outer @param {Box} inner */
function contains(outer,inner){return inner.x>=outer.x&&inner.y>=outer.y&&inner.x+inner.w<=outer.x+outer.w&&inner.y+inner.h<=outer.y+outer.h;}
/** Subtraction on the original source grid can leave a right/bottom endpoint
 * a few binary ULPs beyond its integer crop. Canonicalize only that numerical
 * representation, inward to the existing observed crop. Real out-of-crop
 * coordinates still fail; no pixel, model rounding cell or budget is added.
 * @param {Box} candidate @param {Box} crop @param {{width:number,height:number}} image */
function canonicalCandidate(candidate,crop,image){
 const right=candidate.x+candidate.w,bottom=candidate.y+candidate.h;
 if(right-crop.w>4*Number.EPSILON*image.width||bottom-crop.h>4*Number.EPSILON*image.height)return null;
 return {...candidate,...(right>crop.w?{w:crop.w-candidate.x}:{}),...(bottom>crop.h?{h:crop.h-candidate.y}:{})};
}
const INDEX_DIGITS=["111101101101111","010110010010111","111001111100111","111001111001111","101101111001001",
 "111100111001111","111100111101111","111001001001001","111101111101111","111101111001111"];
/** Bind visual observations to IDs without altering source pixels or packing.
 * Numbers are annotations confined to the existing top/right gutter.
 * @param {Buffer} output @param {number} width @param {number} index
 * @param {{x:number,y:number}} placement */
function annotateIndex(output,width,index,placement){
 const label=String(index),spacing=1;
 for(let digit=0;digit<label.length;digit++)for(let row=0;row<5;row++)for(let col=0;col<3;col++){
  if(INDEX_DIGITS[Number(label[digit])]?.[row*3+col]==="1"){
   const x=placement.x+digit*(3+spacing)+col,y=placement.y-7+row;
   output.set([0,0,0,255],(y*width+x)*4);
  }
 }
}
/** Pack source crops without resampling. Borders separate the windows; exact
 * candidate coordinates allow independent review on the original pixel grid.
 * @param {unknown} input
 * @returns {{image:import("./png").PngImage,targets:{index:number,cropBox:Box,candidateBox:Box}[],pixels:number}} */
function createSceneCropSheet(input){
 if(!record(input)||!record(input.image)||types.isProxy(input.targets)||!Array.isArray(input.targets)
  ||Object.getPrototypeOf(input.targets)!==Array.prototype||input.targets.length<1||input.targets.length>32
  ||Reflect.ownKeys(input.targets).length!==input.targets.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.targets)).some(p=>!("value" in p)))throw new TypeError("Scene sheet request is invalid");
 const {width,height,rgba}=input.image;
 if(typeof width!=="number"||typeof height!=="number"||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width>16384||height>16384||width*height>40000000||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError("Scene sheet source is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",rgba),offset=Reflect.get(proto,"byteOffset",rgba),length=Reflect.get(proto,"length",rgba);
 if(!types.isArrayBuffer(buffer)||length!==width*height*4)throw new TypeError("Scene sheet source is invalid");
 const pixels=new Uint8Array(buffer,offset,length),ids=new Set();
 /** @type {Target[]} */const targets=[];
 for(const raw of input.targets){
  if(!record(raw)||typeof raw.index!=="number"||!Number.isSafeInteger(raw.index)||raw.index<0||raw.index>=512||ids.has(raw.index)
   ||!box(raw.cropBox)||!box(raw.candidateBox)||![raw.cropBox.x,raw.cropBox.y,raw.cropBox.w,raw.cropBox.h].every(Number.isSafeInteger)
   ||!contains({x:0,y:0,w:width,h:height},raw.cropBox))throw new TypeError("Scene sheet target is invalid");
  const candidate=canonicalCandidate(raw.candidateBox,raw.cropBox,{width,height});
  if(!candidate||!box(candidate)||!contains({x:0,y:0,w:raw.cropBox.w,h:raw.cropBox.h},candidate))throw new TypeError('Scene sheet target is invalid');
  ids.add(raw.index);targets.push({index:raw.index,cropBox:{...raw.cropBox},candidateBox:candidate});
 }
 const layout=planSceneCropAtlas(targets.map(t=>({index:t.index,...t.cropBox})));
 const sheetWidth=layout.width,sheetHeight=layout.height;
 const placements=targets.map((target,i)=>{
  const p=layout.placements[i];if(!p||p.index!==target.index)throw new TypeError("Scene sheet layout binding is invalid");
  return {...target,x:p.x,y:p.y};
 });
 // This shares the existing 4M scene review budget with the other observation.
 // Do not introduce the unrelated OCR-sheet 2M limit on visual review crops.
 if(sheetWidth>16384||sheetHeight>16384||sheetWidth*sheetHeight>4000000)throw new RangeError("Scene sheet exceeds pixel budget");
 const output=Buffer.alloc(sheetWidth*sheetHeight*4,255);
 for(const p of layout.tiles)for(let row=0;row<p.cropBox.h;row++){
  const from=((p.cropBox.y+row)*width+p.cropBox.x)*4,to=((p.y+row)*sheetWidth+p.x)*4;
  output.set(pixels.subarray(from,from+p.cropBox.w*4),to);
 }
 for(const placement of layout.annotations)annotateIndex(output,sheetWidth,placement.index,placement);
 return {image:{width:sheetWidth,height:sheetHeight,rgba:output},pixels:sheetWidth*sheetHeight,
  targets:placements.map(p=>({index:p.index,cropBox:{x:p.x,y:p.y,w:p.cropBox.w,h:p.cropBox.h},
   candidateBox:{x:p.x+p.candidateBox.x,y:p.y+p.candidateBox.y,w:p.candidateBox.w,h:p.candidateBox.h}}))};
}
module.exports={createSceneCropSheet};
