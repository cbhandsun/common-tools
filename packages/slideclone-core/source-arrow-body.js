// @ts-check
"use strict";
const {types}=require("node:util");
/** @typedef {{widthPx:number,firstBody:number,lastBody:number}} Body */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** The original taper proof, including its 2-column tip, 2..9 base,
 * 12-column/half-span observation and 1px monotonicity allowance.
 * @param {number[]} ordered @param {number} shaft @returns {number|null} */
function headBase(ordered,shaft){
 const tip=ordered.findIndex(w=>w>0);if(tip<0||tip>2)return null;
 const section=ordered.slice(tip,tip+Math.min(12,Math.floor(ordered.length/2)));
 const peak=Math.max(...section),base=section.indexOf(peak);
 if(peak<shaft*2+2||base<2||base>9||(section[0]??0)>shaft+2)return null;
 for(let i=1;i<=base;i++)if((section[i]??0)+1<(section[i-1]??0))return null;
 return tip+base;
}
/** A head's transition must terminate in three contiguous body columns.
 * Detached small marks elsewhere cannot be filtered into a fake shaft.
 * @param {number[]} ordered @param {number} base @param {number} shaft */
function afterHead(ordered,base,shaft){
 for(let i=base+1;i<=ordered.length-3;i++)if(ordered.slice(i,i+3)
  .every(w=>w>=1&&w<=5&&Math.abs(w-shaft)<=1))return i;
 return null;
}
/** A short arrow's head can occupy the fixed middle 40 percent. Derive a
 * stable body from independently verified head transitions instead. This
 * does not read pixels, alter the full-gap .9 support denominator, replace
 * ownership/closure proof or grant a source-boundary port.
 * @param {unknown} input @returns {Body|null} */
function measureSourceArrowBody(input){
 if(!record(input)||typeof input.rightArrow!=="boolean"||typeof input.leftArrow!=="boolean"
  ||!Array.isArray(input.widths)||types.isProxy(input.widths)||Object.getPrototypeOf(input.widths)!==Array.prototype
  ||input.widths.length>513||Reflect.ownKeys(input.widths).length!==input.widths.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(input.widths)).some(p=>!("value" in p))
  ||!input.widths.every(w=>typeof w==="number"&&Number.isSafeInteger(w)&&w>=0&&w<=25))
  throw new TypeError("Source arrow body profile is invalid");
 if(input.widths.length<9||!input.rightArrow&&!input.leftArrow)return null;
 const widths=/** @type {number[]} */(input.widths),reverse=[...widths].reverse();
 const first=widths.findIndex(w=>w>0),last=widths.length-1-reverse.findIndex(w=>w>0);
 if(first<0||widths.filter(w=>w>0).length/widths.length<.9
  ||widths.slice(first,last+1).some(w=>w===0))return null;
 /** @type {Body[]} */const fits=[];
 for(let shaft=1;shaft<=5;shaft++){
  const left=headBase(widths,shaft),right=headBase(reverse,shaft);
  if((left!==null)!==input.leftArrow||(right!==null)!==input.rightArrow)continue;
  const leftBody=left===null?first:afterHead(widths,left,shaft);
  const rightBody=right===null?widths.length-1-last:afterHead(reverse,right,shaft);
  if(leftBody===null||rightBody===null)continue;
  const firstBody=leftBody,lastBody=widths.length-1-rightBody;
  const body=widths.slice(firstBody,lastBody+1);
  if(body.length<3||body.some(w=>w<1||w>5||Math.abs(w-shaft)>1))continue;
  const ordered=[...body].sort((a,b)=>a-b);
  if(ordered[Math.floor(ordered.length/2)]!==shaft)continue;
  fits.push({widthPx:shaft,firstBody,lastBody});
 }
 return fits.length===1?fits[0]??null:null;
}
module.exports={measureSourceArrowBody};
