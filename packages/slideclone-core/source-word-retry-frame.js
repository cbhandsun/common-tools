// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v){return v!==null&&typeof v==="object"&&!types.isProxy(v)&&!Array.isArray(v)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(v))&&Object.values(Object.getOwnPropertyDescriptors(v)).every(p=>"value"in p);}
/** @param {unknown} v @param {number} width @param {number} height @returns {v is Box} */
function box(v,width,height){return record(v)&&[v.x,v.y,v.w,v.h].every(n=>typeof n==="number"&&Number.isFinite(n))
 &&Number(v.x)>=0&&Number(v.y)>=0&&Number(v.w)>0&&Number(v.h)>0
 &&Number(v.x)+Number(v.w)<=width&&Number(v.y)+Number(v.h)<=height;}
/** Choose a superset of the first two-pixel observation. Expand only sides
 * where retained source ink was censored. Adjacent recognition seeds limit
 * the search, never authorize removal or ownership of a single source pixel.
 * Closure, source-frame ownership and the caller's original budget still apply.
 * @param {unknown} input @returns {Box} */
function sourceWordRetryFrame(input){
 if(!record(input)||typeof input.width!=="number"||typeof input.height!=="number"
  ||![input.width,input.height].every(n=>Number.isSafeInteger(n)&&n>0&&n<=16384)
  ||input.width*input.height>40000000||!box(input.hint,input.width,input.height)
  ||typeof input.margin!=="number"||!Number.isSafeInteger(input.margin)||input.margin<2||input.margin>64)
  throw new TypeError("source word retry frame is invalid");
 const {width,height,margin}=input,hint=input.hint,sides=input.sides,neighbors=input.neighbors;
 if(!record(sides)||Reflect.ownKeys(sides).length!==4
  ||!["left","right","top","bottom"].every(key=>typeof sides[key]==="boolean"))throw new TypeError("source word retry sides are invalid");
 if(!Array.isArray(neighbors)||types.isProxy(neighbors)||Object.getPrototypeOf(neighbors)!==Array.prototype||neighbors.length>10000
  ||Reflect.ownKeys(neighbors).length!==neighbors.length+1||Object.values(Object.getOwnPropertyDescriptors(neighbors)).some(p=>!("value"in p))
  ||!neighbors.every(n=>box(n,width,height)))throw new TypeError("source word retry neighbors are invalid");
 const original={left:Math.max(0,Math.floor(hint.x)-2),right:Math.min(width,Math.ceil(hint.x+hint.w)+2),
  top:Math.max(0,Math.floor(hint.y)-2),bottom:Math.min(height,Math.ceil(hint.y+hint.h)+2)};
 let left=Math.max(0,Math.floor(hint.x)-(sides.left?margin:2)),right=Math.min(width,Math.ceil(hint.x+hint.w)+(sides.right?margin:2));
 let top=Math.max(0,Math.floor(hint.y)-(sides.top?margin:2)),bottom=Math.min(height,Math.ceil(hint.y+hint.h)+(sides.bottom?margin:2));
 // Raster windows exclude right/bottom. An extra one-cell gap here hides the
 // last outside-neighbor blank witness and can falsely censor complete ink.
 // Floor/ceil still exclude every cell intersecting a fractional neighbor.
 for(const n of neighbors)if(n.y<bottom&&n.y+n.h>top){
  if(n.x>=hint.x+hint.w)right=Math.min(right,Math.max(original.right,Math.floor(n.x)));
  if(n.x+n.w<=hint.x)left=Math.max(left,Math.min(original.left,Math.ceil(n.x+n.w)));
 }
 for(const n of neighbors)if(n.x<right&&n.x+n.w>left){
  if(n.y>=hint.y+hint.h)bottom=Math.min(bottom,Math.max(original.bottom,Math.floor(n.y)));
  if(n.y+n.h<=hint.y)top=Math.max(top,Math.min(original.top,Math.ceil(n.y+n.h)));
 }
 return {x:left,y:top,w:right-left,h:bottom-top};
}
module.exports={sourceWordRetryFrame};
