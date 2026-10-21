// @ts-check
"use strict";
const {types}=require('node:util');
const {validatePositionedTextLayout}=require('./positioned-text-layout');
const {projectSourceWordRuns}=require('./source-word-layout-projection');
const {parsePositionedTextFontOverride}=require('./positioned-text-font-override');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @param {unknown} value @returns {Record<string,unknown>} */
function data(value){
 if(value===null||typeof value!=='object'||Array.isArray(value)||types.isProxy(value)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(value))
  ||Object.getOwnPropertySymbols(value).length>0
  ||Object.values(Object.getOwnPropertyDescriptors(value)).some(d=>!('value'in d)))
  throw new TypeError('positioned text reframe data is invalid');
 return /** @type {Record<string,unknown>} */(value);
}
/** Absolute child coordinates must follow the same frame transformation as
 * their parent. This changes presentation geometry, never source evidence.
 * @param {Record<string,unknown>} text @param {Box} nextBox */
function reframePositionedText(text,nextBox){
 data(text);data(nextBox);
 if(text.positionedRuns===undefined)return {...text,box:nextBox};
 data(text.box);data(text.style);
 const runs=text.positionedRuns;
 if(!Array.isArray(runs)||types.isProxy(runs)||Object.getPrototypeOf(runs)!==Array.prototype
  ||runs.length<1||runs.length>512||Reflect.ownKeys(runs).length!==runs.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(runs)).some(d=>!('value'in d)))
  throw new TypeError('positioned text reframe runs are invalid');
 const safe=runs.map(value=>{const run=data(value);data(run.box);
  const fontOverride=parsePositionedTextFontOverride(run.fontOverride);
  return {...run,...(fontOverride?{fontOverride}:{})};});
 const original={...text,positionedRuns:safe};validatePositionedTextLayout(original);
 const projected=projectSourceWordRuns(/** @type {{text:string,box:Box}[]} */(safe),/** @type {Box} */(text.box),nextBox);
 const positionedRuns=projected.map((run,index)=>({...safe[index],box:run.box}));
 const result={...text,box:nextBox,positionedRuns};validatePositionedTextLayout(result);
 return result;
}
module.exports={reframePositionedText};
