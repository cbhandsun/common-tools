// @ts-check
"use strict";
const {types}=require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** Check already observed cells, never read source pixels or accept provider
 * bounds as enclosure evidence. Flood the non-ring cells from all four sides;
 * each paint cell must belong to the enclosed interior. Concavities and open
 * walls remain exterior even if their bounding rectangles contain the paint.
 * @param {unknown} input @returns {boolean} */
function sourceRingEnclosesFill(input){
 if(!record(input)||!record(input.box))throw new TypeError("Source ring fill controls are invalid");
 const {width,height,box,ringPixels,fillPixels}=input;
 if(typeof width!=="number"||typeof height!=="number"||![width,height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||width*height>40000000||![box.x,box.y,box.w,box.h].every(n=>typeof n==="number"&&Number.isSafeInteger(n))
  ||Number(box.x)<0||Number(box.y)<0||Number(box.w)<=0||Number(box.h)<=0
  ||Number(box.x)+Number(box.w)>width||Number(box.y)+Number(box.h)>height)
  throw new TypeError("Source ring fill frame is invalid");
 if(!Array.isArray(ringPixels)||types.isProxy(ringPixels)||Object.getPrototypeOf(ringPixels)!==Array.prototype||ringPixels.length>262144
  ||Reflect.ownKeys(ringPixels).length!==ringPixels.length+1||Object.values(Object.getOwnPropertyDescriptors(ringPixels)).some(p=>!("value" in p))
  ||fillPixels===null||typeof fillPixels!=="object"||types.isProxy(fillPixels)||Object.getPrototypeOf(fillPixels)!==Set.prototype
  ||Reflect.ownKeys(fillPixels).length)throw new TypeError("Source ring fill cells are invalid");
 const fill=/** @type {Set<unknown>} */(fillPixels),{x,y,w,h}=/** @type {{x:number,y:number,w:number,h:number}} */(box);
 if(fill.size>262144||ringPixels.some(n=>typeof n!=="number"||!Number.isSafeInteger(n)||n<0||n>=width*height)
  ||[...fill].some(n=>typeof n!=="number"||!Number.isSafeInteger(n)||n<0||n>=width*height))throw new TypeError("Source ring fill cells are invalid");
 const area=w*h;if(!fill.size||!ringPixels.length||area>262144)return false;
 const wall=new Uint8Array(area),outside=new Uint8Array(area),queue=new Uint32Array(area);
 for(const n of ringPixels){const dx=n%width-x,dy=Math.floor(n/width)-y;if(dx<0||dy<0||dx>=w||dy>=h)return false;wall[dy*w+dx]=1;}
 let head=0,tail=0;
 /** @param {number} n */
 const add=n=>{if(wall[n]||outside[n])return;outside[n]=1;queue[tail++]=n;};
 for(let col=0;col<w;col++){add(col);add((h-1)*w+col);}for(let row=1;row<h-1;row++){add(row*w);add(row*w+w-1);}
 while(head<tail){const n=queue[head++];if(n===undefined)throw new TypeError("Source ring fill queue is invalid");
  const col=n%w,row=Math.floor(n/w);if(col)add(n-1);if(col<w-1)add(n+1);if(row)add(n-w);if(row<h-1)add(n+w);}
 for(const value of fill){const n=/** @type {number} */(value),dx=n%width-x,dy=Math.floor(n/width)-y;
  if(dx<0||dy<0||dx>=w||dy>=h||wall[dy*w+dx]||outside[dy*w+dx])return false;}
 return true;
}
module.exports={sourceRingEnclosesFill};
