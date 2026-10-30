// @ts-check
'use strict';
const {types}=require('node:util');
const {sceneSurfaceOwnershipCost,commitSceneGlyphOwnership,sceneGlyphOcclusionEvidence}=require('./source-scene-glyph-occlusion');
/** @typedef {{id:string,coveragePixels:number,attachment:boolean,receipt:unknown}} Candidate */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value){return value!==null&&typeof value==='object'&&!types.isProxy(value)&&!Array.isArray(value)
 &&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(p=>'value' in p);}
/** Selection controls never mint source evidence. Every row must carry a
 * private, complete measurement receipt on the same source ledger. Values
 * estimate measured source coverage, not provider confidence or rendered PDR.
 * @param {unknown} input @returns {Candidate[]} */
function candidates(input){
 if(!Array.isArray(input)||types.isProxy(input)||Object.getPrototypeOf(input)!==Array.prototype||input.length>120
  ||Reflect.ownKeys(input).length!==input.length+1||Object.values(Object.getOwnPropertyDescriptors(input)).some(p=>!('value' in p)))
  throw new TypeError('Scene surface selection is invalid');
 const ids=new Set(),receipts=new Set();
 return input.map(value=>{
  if(!record(value)||typeof value.id!=='string'||!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(value.id)||ids.has(value.id)
   ||typeof value.coveragePixels!=='number'||!Number.isSafeInteger(value.coveragePixels)||value.coveragePixels<1||value.coveragePixels>40000000
   ||typeof value.attachment!=='boolean'||receipts.has(value.receipt))throw new TypeError('Scene surface candidate is invalid');
  ids.add(value.id);receipts.add(value.receipt);return {id:value.id,coveragePixels:value.coveragePixels,attachment:value.attachment,receipt:value.receipt};
 });
}
/** All alternatives have already finished source measurement provisionally.
 * Preserve attachment surfaces before optional paint, then maximize measured
 * paint coverage per additional glyph cell. Recompute union costs after each
 * selection; overlapping proofs never pay twice. The final atomic ledger
 * check, rather than the score, decides whether each candidate can commit.
 * @param {unknown} token @param {unknown} input */
function selectMeasuredSceneSurfaceChoices(token,input){
 if(token===null||typeof token!=='object'||types.isProxy(token))throw new TypeError('Scene surface selection token is invalid');
 const pending=candidates(input),selected=/** @type {string[]} */([]),
  rejected=/** @type {{id:string,code:string,requestedGlyphs:number,remainingGlyphs:number}[]} */([]);
 // Validate every receipt before mutating any ownership, including later rows.
 for(const candidate of pending)sceneSurfaceOwnershipCost(token,candidate.receipt);
 while(pending.length){
  const ranked=pending.map((candidate,index)=>({candidate,index,cost:sceneSurfaceOwnershipCost(token,candidate.receipt)}))
   .sort((a,b)=>Number(b.candidate.attachment)-Number(a.candidate.attachment)
    ||Number(b.cost===0)-Number(a.cost===0)
    ||b.candidate.coveragePixels*Math.max(1,a.cost)-a.candidate.coveragePixels*Math.max(1,b.cost)
    ||a.index-b.index);
  const next=ranked[0];if(!next)break;pending.splice(next.index,1);
  if(commitSceneGlyphOwnership(token,next.candidate.receipt))selected.push(next.candidate.id);
  else rejected.push({id:next.candidate.id,code:'surface-choice-budget',requestedGlyphs:next.cost,
   remainingGlyphs:100000-sceneGlyphOcclusionEvidence(token).glyphOwnedPixels});
 }
 return {selected,rejected};
}
module.exports={selectMeasuredSceneSurfaceChoices};
