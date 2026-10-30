// @ts-check
"use strict";
const {types}=require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** Convert an admitted source box to the explicit model localization frame.
 * Round outward so no original candidate ink is excluded. This does not
 * change the source image, OCR geometry, crop ownership or pixel budget.
 * @param {unknown} box @param {unknown} dimensions
 * @returns {[number,number,number,number]} */
function sourceBox2D(box,dimensions){
 if(!record(box)||!record(dimensions))throw new TypeError("Scene coordinate input is invalid");
 const {width,height}=dimensions,{x,y,w,h}=box;
 if(typeof width!=="number"||typeof height!=="number"||!Number.isSafeInteger(width)||!Number.isSafeInteger(height)
  ||width<1||height<1||width>16384||height>16384||width*height>40000000
  ||typeof x!=="number"||typeof y!=="number"||typeof w!=="number"||typeof h!=="number"
  ||![x,y,w,h].every(Number.isFinite)||x<0||y<0||w<=0||h<=0||x+w>width||y+h>height)throw new TypeError("Scene coordinate bounds are invalid");
 return [Math.floor(y*1000/height),Math.floor(x*1000/width),Math.ceil((y+h)*1000/height),Math.ceil((x+w)*1000/width)];
}
module.exports={sourceBox2D};
