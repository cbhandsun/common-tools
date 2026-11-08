// @ts-check
"use strict";
const {isDeepStrictEqual}=require('node:util');
/** @typedef {{pages:{images?:{id?:string,source?:Record<string,unknown>,[key:string]:unknown}[]}[]}} Deck */
/** Carry erasure evidence only for an unchanged subset of admitted residuals.
 * Decks here have already passed IR admission. Removing a full-page residual
 * does not undo erasure in a surviving local asset. A new, changed, ambiguous
 * or moved residual must obtain its own evidence instead of inheriting counts.
 * @param {Deck} baseline
 * @param {Deck} candidate
 * @param {{passed?:boolean,candidateObjects?:number,erasedObjects?:number}|undefined} previous */
function retainResidualDeduplication(baseline,candidate,previous){
 const rejected={candidateObjects:0,erasedObjects:0};
 if(previous?.passed!==true||!Number.isSafeInteger(previous.candidateObjects)||!(Number(previous.candidateObjects)>0)
  ||previous.erasedObjects!==previous.candidateObjects||!Array.isArray(baseline?.pages)||!Array.isArray(candidate?.pages)
  ||baseline.pages.length!==candidate.pages.length)return rejected;
 for(let index=0;index<candidate.pages.length;index++){
  const original=baseline.pages[index]?.images??[],next=candidate.pages[index]?.images??[];
  for(const image of next){
   if(image.source?.residualCrop!==true)continue;
   const matches=original.filter(prior=>prior.id===image.id);
   if(matches.length!==1||!isDeepStrictEqual(matches[0],image))return rejected;
  }
 }
 return {candidateObjects:Number(previous.candidateObjects),erasedObjects:Number(previous.erasedObjects)};
}
module.exports={retainResidualDeduplication};
