// @ts-check
"use strict";
/** Group already admitted spacing tokens with the preceding ink-bearing word.
 * The original word box stays a proposal; spacing supplies neither glyph ink
 * nor a cut. The caller still proves complete ink and two blank source columns.
 * Leading spacing has no preceding owner and retains the intact-line fallback.
 * @param {readonly import('../ocr/ocr-word-position-hints').WordHint[]|undefined} alignment
 * @param {{text:string,box:{x:number,y:number,w:number,h:number}}} line */
function sourceWordSpacingUnits(alignment,line){
 const whole=()=>({hints:[{text:line.text.trim(),box:line.box}],intactFallback:!!alignment});
 if(!alignment)return whole();
 /** @type {import('../ocr/ocr-word-position-hints').WordHint[]} */const hints=[];
 for(const hint of alignment){
  if(!hint.text.trim()){
   const previous=hints[hints.length-1];
   if(!previous)return whole();
   previous.text+=hint.text;
  }else hints.push({text:hint.text,box:hint.box});
 }
 return {hints,intactFallback:false};
}
module.exports={sourceWordSpacingUnits};
