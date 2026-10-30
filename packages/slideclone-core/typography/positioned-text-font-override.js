// @ts-check
"use strict";
const {types}=require("node:util");
const FAMILY_FIELDS=["family","latinFamily","eastAsianFamily","complexScriptFamily"];
/** @param {unknown} value */
function validateScriptFontFamily(value){
 if(value===undefined||value===null)return;
 if(typeof value!=="string"||value.length<1||value.length>256||!value.trim()
  ||Array.from(value).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))
  throw new TypeError("editable deck script font family is invalid");
}
/** Compact formatting overlays retain the parent's provenance and geometry.
 * They cannot change text, size, paint, opacity, measurements or source rights.
 * @param {unknown} input @returns {Record<string,string>|null} */
function parsePositionedTextFontOverride(input){
 if(input===null||input===undefined)return null;
 if(typeof input!=="object"||Array.isArray(input)||types.isProxy(input)
  ||![null,Object.prototype].includes(Object.getPrototypeOf(input))
  ||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!("value" in p)))throw new TypeError("editable positioned text font override is invalid");
 /** @type {Record<string,string>} */const result={};
 for(const [key,value]of Object.entries(input)){
  if(![...FAMILY_FIELDS,"weight"].includes(key)||typeof value!=="string")throw new TypeError("editable positioned text font override is invalid");
  if(key==="weight"){
   if(!["bold","regular","normal"].includes(value))throw new TypeError("editable positioned text font weight is invalid");
  }else validateScriptFontFamily(value);
  result[key]=value;
 }
 return result;
}
module.exports={parsePositionedTextFontOverride,validateScriptFontFamily};
