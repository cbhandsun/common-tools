// @ts-check
"use strict";
const {types}=require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @param {number} maximum @returns {value is unknown[]} */
function list(value,maximum){return Array.isArray(value)&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Array.prototype
 &&value.length<=maximum&&Reflect.ownKeys(value).length===value.length+1
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** A channel median minimizes absolute color error over the observed source
 * winding. Antialias fringes cannot invent a lighter mean paint. Reads only
 * cached owned cells; no new scan, source authority or tolerance is introduced.
 * @param {unknown} input @returns {string} */
function measureSourceOutlineColor(input){
 if(!record(input)||!list(input.points,262144)||!input.points.length||types.isProxy(input.colors)||!types.isMap(input.colors)
  ||typeof input.width!=="number"||!Number.isSafeInteger(input.width)||input.width<1||input.width>16384)
  throw new TypeError("Source outline color evidence is invalid");
 const histograms=[new Uint32Array(256),new Uint32Array(256),new Uint32Array(256)];
 for(const point of input.points){
  if(!record(point)||typeof point.x!=="number"||typeof point.y!=="number"||!Number.isSafeInteger(point.x)||!Number.isSafeInteger(point.y)
   ||point.x<0||point.x>=input.width||point.y<0||point.y>=16384)throw new TypeError("Source outline color cell is invalid");
  const color=/** @type {unknown} */(Map.prototype.get.call(input.colors,point.y*input.width+point.x));
  if(!list(color,3)||color.length!==3||!color.every(c=>typeof c==="number"&&Number.isSafeInteger(c)&&c>=0&&c<=255))
   throw new TypeError("Source outline color sample is invalid");
  for(let channel=0;channel<3;channel++){
   const histogram=histograms[channel],value=Number(color[channel]);if(histogram)histogram[value]=(histogram[value]??0)+1;
  }
 }
 const middle=Math.floor(input.points.length/2);
 return "#"+histograms.map(histogram=>{let total=0;for(let value=0;value<256;value++){
  total+=histogram[value]??0;if(total>middle)return value.toString(16).padStart(2,"0");
 }throw new TypeError("Source outline color population is invalid");}).join("");
}
module.exports={measureSourceOutlineColor};
