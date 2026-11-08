// @ts-check
"use strict";
const {types}=require('node:util');
/** A complete triangular head must taper from its source tip to an observed
 * base, then terminate in a stable shaft through the middle of the gap.
 * This supplements the unchanged short-window detector; a longer window alone
 * cannot prove a head. No pixels, ports, support denominators or budgets change.
 * @param {unknown} input @returns {boolean} */
function hasCompleteSourceArrowHead(input){
 if(input===null||typeof input!=='object'||types.isProxy(input)||Array.isArray(input)
  ||![Object.prototype,null].includes(Object.getPrototypeOf(input))
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p)))
  throw new TypeError('Complete source arrow profile is invalid');
 const value=/** @type {Record<string,unknown>} */(input),widths=value.widths,shaft=value.shaft;
 if(typeof value.right!=='boolean'||typeof shaft!=='number'||!Number.isSafeInteger(shaft)||shaft<1||shaft>5
  ||!Array.isArray(widths)||types.isProxy(widths)||Object.getPrototypeOf(widths)!==Array.prototype
  ||widths.length>513||Reflect.ownKeys(widths).length!==widths.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(widths)).some(p=>!('value' in p))
  ||!widths.every(w=>typeof w==='number'&&Number.isSafeInteger(w)&&w>=0&&w<=25))
  throw new TypeError('Complete source arrow profile is invalid');
 const ordered=/** @type {number[]} */(value.right?[...widths].reverse():[...widths]);
 if(ordered.length<9||ordered.filter(w=>w>0).length/ordered.length<.9)return false;
 const first=ordered.findIndex(w=>w>0),last=ordered.length-1-[...ordered].reverse().findIndex(w=>w>0);
 if(first<0||first>2||ordered.slice(first,last+1).some(w=>w===0))return false;
 const half=Math.floor(ordered.length/2),section=ordered.slice(first,half),peak=Math.max(...section);
 const base=section.indexOf(peak),tip=section[0]??0;
 if(base<2||tip>shaft+2||peak<shaft*2+2)return false;
 for(let i=1;i<=base;i++){
  const width=section[i]??0,expected=tip+(peak-tip)*i/base;
  // A row width has two rasterized edges. Each keeps the existing one-pixel
  // source-edge allowance; judge the half-width rather than doubling precision.
  if(width+1<(section[i-1]??0)||Math.abs(width-expected)/2>1)return false;
 }
 let bodyStart=first+base+1;
 // At most one extra base column can come from rasterizing a triangle edge.
 if((ordered[bodyStart]??0)>=peak-1)bodyStart++;
 const body=ordered.slice(bodyStart,Math.max(half,bodyStart+3));
 return body.length>=3&&body.every(w=>w>=1&&w<=5&&Math.abs(w-shaft)<=1);
}
module.exports={hasCompleteSourceArrowHead};
