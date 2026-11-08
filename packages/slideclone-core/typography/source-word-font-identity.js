// @ts-check
"use strict";
const {types}=require("node:util");
const {parsePositionedTextFontOverride}=require("./positioned-text-font-override");
/** @typedef {{text:string,box:{x:number,y:number,w:number,h:number},fontOverride?:Record<string,string>}} Run */
/** Transfer formatting by exact character spans, never by guessed glyphs.
 * A measured word spanning conflicting styles must keep its previous layout.
 * Geometry is already source-proved by the caller and is never expanded here.
 * @param {readonly Run[]} measured @param {unknown} previous @param {string} text
 * @returns {Run[]|null} */
function preserveSourceWordFonts(measured,previous,text){
 if(previous===undefined)return measured.map(run=>({text:run.text,box:{...run.box}}));
 if(!Array.isArray(previous)||types.isProxy(previous)||Object.getPrototypeOf(previous)!==Array.prototype
  ||previous.length<1||previous.length>512||Reflect.ownKeys(previous).length!==previous.length+1
  ||Object.values(Object.getOwnPropertyDescriptors(previous)).some(p=>!("value"in p)))
  throw new TypeError("source word font sequence is invalid");
 let offset=0;
 const spans=previous.map(run=>{
  if(!run||typeof run!=="object"||types.isProxy(run)||![null,Object.prototype].includes(Object.getPrototypeOf(run))
   ||Object.values(Object.getOwnPropertyDescriptors(run)).some(p=>!("value"in p))
   ||typeof run.text!=="string"||!run.text||run.text.length>512
   ||Array.from(run.text).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127))
   throw new TypeError("source word font span is invalid");
  const start=offset;offset+=run.text.length;
  if(offset>512)throw new TypeError("source word font sequence is invalid");
  const font=parsePositionedTextFontOverride(run.fontOverride)??{};
  const identity=JSON.stringify(Object.keys(font).sort().map(key=>[key,font[key]]));
  return {text:run.text,start,end:offset,font,identity};
 });
 if(spans.map(span=>span.text).join("")!==text||measured.map(run=>run.text).join("")!==text)return null;
 offset=0;
 /** @type {Run[]} */const result=[];
 for(const run of measured){
  const end=offset+run.text.length,owners=spans.filter(span=>span.start<end&&span.end>offset);
  const first=owners[0];
  if(!first||owners.some(span=>span.identity!==first.identity))return null;
  result.push({text:run.text,box:{...run.box},...(Object.keys(first.font).length?{fontOverride:{...first.font}}:{})});
  offset=end;
 }
 return result;
}
module.exports={preserveSourceWordFonts};
