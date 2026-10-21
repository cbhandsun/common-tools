// @ts-check
"use strict";
const {types}=require("node:util");
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[null,Object.prototype].includes(Object.getPrototypeOf(value))
 &&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** @param {unknown} value @returns {unknown[]} */
function list(value){if(!Array.isArray(value)||types.isProxy(value)||Object.getPrototypeOf(value)!==Array.prototype||value.length>10000
 ||Reflect.ownKeys(value).length!==value.length+1||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p)))throw new TypeError('Native opacity items are invalid');return value;}
/** Remove only opaque defaults whose omission has identical native rendering.
 * Text style opacity overrides font opacity: preserve that override when the
 * font is translucent. Geometry, content, source evidence and non-default alpha
 * are untouched. Validate all controls before mutating any data.
 * @param {unknown} deck @returns {unknown} */
function compactNativeOpacityDefaults(deck){
 if(!record(deck))throw new TypeError('Native opacity deck is invalid');
 /** @type {Record<string,unknown>[]} */const pending=[];
 /** @param {unknown} value @returns {Record<string,unknown>|undefined} */
 const style=value=>{if(value===undefined)return undefined;if(!record(value))throw new TypeError('Native opacity style is invalid');return value;};
 /** @param {Record<string,unknown>|undefined} value */
 const remove=value=>{if(value?.opacity!==1)return;const p=Object.getOwnPropertyDescriptor(value,'opacity');if(!p?.configurable)throw new TypeError('Native opacity default is immutable');pending.push(value);};
 for(const page of list(deck.pages)){
  if(!record(page))throw new TypeError('Native opacity page is invalid');
  for(const shape of list(page.shapes??[])){if(!record(shape))throw new TypeError('Native opacity shape is invalid');remove(style(shape.style));}
  for(const text of list(page.textBoxes??[])){
   if(!record(text))throw new TypeError('Native opacity text is invalid');
   const font=style(text.font),format=style(text.style);
   if(font?.opacity===undefined||font.opacity===1)remove(format);
   remove(font);
  }
 }
 for(const value of pending)delete value.opacity;
 return deck;
}
module.exports={compactNativeOpacityDefaults};
