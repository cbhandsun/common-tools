// @ts-check
"use strict";
const {types}=require("node:util");
const SCRIPTS=["latinFamily","eastAsianFamily","complexScriptFamily"];
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==="object"&&!types.isProxy(value)&&!Array.isArray(value)
  &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
  &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>"value" in p);}
/** @param {unknown} value @returns {unknown[]} */
function list(value){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype
  ||value.length>10000||Reflect.ownKeys(value).length!==value.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))throw new TypeError("Native text evidence items are invalid");return value;}
/** @param {unknown} value @returns {Record<string,unknown>|undefined} */
function optional(value){if(value===undefined)return undefined;if(!record(value))throw new TypeError("Native text evidence record is invalid");return value;}
/** @param {unknown} value @returns {value is Record<string,number>} */
function box(value){return record(value)&&Reflect.ownKeys(value).length===4
  &&["x","y","w","h"].every(k=>typeof value[k]==="number"&&Number.isFinite(value[k]))
  &&Number(value.x)>=0&&Number(value.y)>=0&&Number(value.w)>0&&Number(value.h)>0;}
/** Omit only native defaults and a proven duplicate OCR envelope. Consumers
 * resolve missing ocrLabelBox to evidenceBox; segmented parent bounds differ
 * and remain explicit. Keep inherited script fonts when a run changes family.
 * Validate the full transaction before deleting any configurable data field.
 * @param {unknown} deck @returns {unknown} */
function compactNativeTextEvidenceDefaults(deck){
  if(!record(deck))throw new TypeError("Native text evidence deck is invalid");
  /** @type {{value:Record<string,unknown>,key:string}[]} */const pending=[];
  /** @param {Record<string,unknown>} value @param {string} key */
  const remove=(value,key)=>{if(!Object.getOwnPropertyDescriptor(value,key)?.configurable)throw new TypeError("Native text evidence default is immutable");pending.push({value,key});};
  for(const page of list(deck.pages)){
    if(!record(page))throw new TypeError("Native text evidence page is invalid");
    for(const text of list(page.textBoxes??[])){
      if(!record(text))throw new TypeError("Native text evidence text is invalid");
      const font=optional(text.font),source=optional(text.source);
      /** @type {Record<string,unknown>[]} */const children=[];
      for(const [field,key]of [["runs","font"],["positionedRuns","fontOverride"]]){
        for(const run of list(text[field]??[])){
          if(!record(run))throw new TypeError("Native text evidence run is invalid");
          const child=optional(run[key]);if(child)children.push(child);
        }
      }
      if(font){
        if(typeof font.family==="string"&&font.family.length>0)for(const key of SCRIPTS){
          if(font[key]===font.family&&children.every(child=>child.family===undefined||child.family===font.family||typeof child[key]==="string"))remove(font,key);
        }
        if(font.align==="left")remove(font,"align");
      }
      if(source&&box(source.ocrLabelBox)&&box(source.evidenceBox)){
        const label=source.ocrLabelBox,evidence=source.evidenceBox;
        if(["x","y","w","h"].every(key=>label[key]===evidence[key]))remove(source,"ocrLabelBox");
      }
    }
  }
  for(const {value,key}of pending)delete value[key];
  return deck;
}
module.exports={compactNativeTextEvidenceDefaults};
