// @ts-check
'use strict';
const {record,list}=require('./source-scene-group-containment');
/** @typedef {[number,[number,number,number,number],number,string?]} Locator */
/** Quote bounded original OCR locations without repeated field names. This
 * does not compress observations, transcribe glyphs, change indices or grant
 * ownership. The private source identity is intentionally never transmitted.
 * @param {unknown} value @returns {Locator[]} */
function sourceSceneGlobalLocations(value){
 if(!list(value)||value.length>512)throw new TypeError('Scene global locations are invalid');
 let hintCharacters=0;
 return value.map((row,index)=>{
  if(!record(row)||row.index!==index||typeof row.confidence!=='number'||!Number.isFinite(row.confidence)
   ||row.confidence<0||row.confidence>1||!list(row.box_2d)||row.box_2d.length!==4
   ||row.box_2d.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0||v>1000))
   throw new TypeError('Scene global locations are invalid');
  const [top,left,bottom,right]=/** @type {number[]} */(row.box_2d);
  if(top===undefined||left===undefined||bottom===undefined||right===undefined||top>=bottom||left>=right)
   throw new TypeError('Scene global locations are invalid');
  /** @type {Locator} */const locator=[index,[top,left,bottom,right],row.confidence];
  if(row.ocrTextHint!==undefined){
   if(typeof row.ocrTextHint!=='string')throw new TypeError('Scene global locations are invalid');
   const characters=Array.from(row.ocrTextHint);
   if(characters.some(character=>{const code=character.codePointAt(0)??0;
    return code<32||code>=127&&code<=159||code>=0xd800&&code<=0xdfff;}))
    throw new TypeError('Scene global locations are invalid');
   const length=characters.length;hintCharacters+=length;
   if(length>128||hintCharacters>4096)throw new TypeError('Scene global locations are invalid');
   locator.push(row.ocrTextHint);
  }
  return locator;
 });
}
module.exports={sourceSceneGlobalLocations};
