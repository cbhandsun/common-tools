// @ts-check
"use strict";
const {types}=require("node:util");
const INSETS=Object.freeze(["marginLeftPt","marginRightPt","marginTopPt","marginBottomPt"]);
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {unknown[]} */
function list(value){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>10000
 ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))
 throw new TypeError("Native text inset items are invalid");return value;}
/** Native OpenXML TextInset supplies zero when a margin is absent. Omit only
 * those literal defaults; retain nonzero margins, source evidence, text and
 * positioned-run geometry. Validate the whole operation before deleting keys.
 * Other values are preserved for the existing deck admission boundary.
 * @param {unknown} deck @returns {unknown} */
function compactNativeTextInsetDefaults(deck){
 if(!record(deck))throw new TypeError("Native text inset deck is invalid");
 /** @type {{style:Record<string,unknown>,key:string}[]} */const pending=[];
 for(const page of list(deck.pages)){
  if(!record(page))throw new TypeError("Native text inset page is invalid");
  for(const text of list(page.textBoxes??[])){
   if(!record(text))throw new TypeError("Native text inset text is invalid");
   if(text.style===undefined)continue;
   if(!record(text.style))throw new TypeError("Native text inset style is invalid");
   for(const key of INSETS){
    if(text.style[key]!==0)continue;
    if(!Object.getOwnPropertyDescriptor(text.style,key)?.configurable)throw new TypeError("Native text inset default is immutable");
    pending.push({style:text.style,key});
   }
  }
 }
 for(const {style,key}of pending)delete style[key];
 return deck;
}
module.exports={compactNativeTextInsetDefaults};
