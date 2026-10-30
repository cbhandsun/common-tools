// @ts-check
"use strict";
const {types}=require("node:util");
/** Explicit paint is a native text style, never source ink/erasure authority.
 * @param {unknown} input @returns {{color:string,widthPt:number}|null} */
function parseNativeTextOutline(input){
 if(input===null||input===undefined)return null;
 if(typeof input!=="object"||Array.isArray(input)||types.isProxy(input)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(input))
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!("value" in p)))throw new TypeError("editable deck native text outline style is invalid");
 const style=/** @type {Record<string,unknown>} */(input),fields=["textOutlineColor","textOutlineWidthPt"];
 for(const key of Object.keys(style))if(fields.some(field=>field.toLowerCase()===key.toLowerCase()&&field!==key))
  throw new TypeError("editable deck native text outline casing is invalid");
 const colorPresent=Object.hasOwn(style,"textOutlineColor"),widthPresent=Object.hasOwn(style,"textOutlineWidthPt");
 if(!colorPresent&&!widthPresent)return null;
 if(!colorPresent||!widthPresent||typeof style.textOutlineColor!=="string"||!/^#[a-f0-9]{6}$/iu.test(style.textOutlineColor)
  ||typeof style.textOutlineWidthPt!=="number"||!Number.isFinite(style.textOutlineWidthPt)
  ||style.textOutlineWidthPt<=0||style.textOutlineWidthPt>12
  ||!(style.textWarp==="textPlain"||style.textLayout==="paragraph"&&style.textWarp===undefined))
  throw new TypeError("editable deck native text outline paint is invalid");
 return {color:style.textOutlineColor.toUpperCase(),widthPt:style.textOutlineWidthPt};
}
module.exports={parseNativeTextOutline};
