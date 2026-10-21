// @ts-check
"use strict";
const {types}=require("node:util");
const {sceneSourceTextPointsOwned}=require('./source-scene-glyph-occlusion');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {value is Box} */
function box(value){return record(value)&&[value.x,value.y,value.w,value.h].every(v=>typeof v==="number"&&Number.isFinite(v))
 &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** The caller supplies an isolated crop made from the admitted source. Only
 * transparent padding may overlap text; source cells with alpha >=32 retain
 * the original text ownership protection. Verify the entire source mapping
 * before deriving collision masks. No source raster is re-read.
 * @param {unknown} input @returns {{text:string,box:Box}[]} */
function sceneIconInkTextCollisions(input){
 if(!record(input)||!record(input.refinement)||!record(input.refinement.image)||!box(input.refinement.box)
  ||!box(input.originalPixelBox)||!box(input.box)||!record(input.slideSize))throw new TypeError("Scene icon ownership input is invalid");
 const {sourceWidth:sw,sourceHeight:sh}=input,{widthPt,heightPt}=input.slideSize;
 if(typeof sw!=="number"||typeof sh!=="number"||![sw,sh].every(Number.isSafeInteger)||sw<1||sh<1||sw>16384||sh>16384||sw*sh>40000000
  ||typeof widthPt!=="number"||typeof heightPt!=="number"||![widthPt,heightPt].every(v=>Number.isFinite(v)&&v>0&&v<=16384))throw new TypeError("Scene icon ownership source frame is invalid");
 const original=input.originalPixelBox,local=input.refinement.box,image=input.refinement.image,{width,height,rgba}=image;
 if(![original.x,original.y,original.w,original.h,local.x,local.y,local.w,local.h].every(Number.isSafeInteger)
  ||original.x+original.w>sw||original.y+original.h>sh||original.w*original.h>262144
  ||local.x+local.w>original.w||local.y+local.h>original.h||width!==local.w||height!==local.h
  ||types.isProxy(rgba)||!types.isUint8Array(rgba))throw new TypeError("Scene icon ownership crop frame is invalid");
 const proto=Object.getPrototypeOf(Uint8Array.prototype),buffer=Reflect.get(proto,"buffer",rgba),length=Reflect.get(proto,"length",rgba);
 if(!types.isArrayBuffer(buffer)||length!==local.w*local.h*4)throw new TypeError("Scene icon ownership pixels are invalid");
 const expected={x:(original.x+local.x)*widthPt/sw,y:(original.y+local.y)*heightPt/sh,w:local.w*widthPt/sw,h:local.h*heightPt/sh};
 const finalBox=/** @type {Box} */(input.box);
 if(["x","y","w","h"].some(key=>Math.abs(Number(finalBox[/** @type {keyof Box} */(key)])-Number(expected[/** @type {keyof Box} */(key)]))>1e-7))throw new TypeError("Scene icon ownership mapping changed");
 const texts=input.textBoxes;
 if(!Array.isArray(texts)||types.isProxy(texts)||texts.length>10000||Reflect.ownKeys(texts).length!==texts.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(texts)).some(p=>!("value" in p))
  ||texts.some(t=>!record(t)||typeof t.text!=="string"||!box(t.box)||t.box.x+t.box.w>widthPt||t.box.y+t.box.h>heightPt))throw new TypeError("Scene icon ownership text masks are invalid");
 /** @type {{text:string,box:Box}[]} */const collisions=[];
 for(const text of /** @type {{text:string,box:Box}[]} */(texts)){
  if(!text.text.trim())continue;
  const left=Math.max(0,Math.floor((text.box.x-expected.x)*sw/widthPt)),right=Math.min(local.w,Math.ceil((text.box.x+text.box.w-expected.x)*sw/widthPt));
  const top=Math.max(0,Math.floor((text.box.y-expected.y)*sh/heightPt)),bottom=Math.min(local.h,Math.ceil((text.box.y+text.box.h-expected.y)*sh/heightPt));
  if(left>=right||top>=bottom)continue;
  const sourceBox={x:text.box.x*sw/widthPt,y:text.box.y*sh/heightPt,w:text.box.w*sw/widthPt,h:text.box.h*sh/heightPt};
  /** @type {{x:number,y:number}[]} */const overlap=[];
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++)if((rgba[(y*local.w+x)*4+3]??0)>=32){
   overlap.push({x:original.x+local.x+x,y:original.y+local.y+y});
  }
  if(overlap.length&&(input.glyphOcclusion===undefined||sceneSourceTextPointsOwned(input.glyphOcclusion,input.sourceImage,input.budget,sourceBox,overlap)!==false))collisions.push(text);
 }
 return collisions;
}
module.exports={sceneIconInkTextCollisions};
