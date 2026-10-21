// @ts-check
"use strict";
const {isDeepStrictEqual}=require('node:util');
const {parseTypographyDeck,record,jsonSnapshot}=require('./typography-contract');
/** Diagnostics describe fitting, never grant source ownership or completion. */
const DIAGNOSTICS=new Set(['ocrEvidenceFit','textWeightEvidenceFit','finalEditableTextFontFamilyFit']);
/** Capture every non-text field and source claim before a provider can mutate it.
 * Typography may change drawing geometry and font runs, but not wording, source
 * observations, graphic members, groups, unresolved findings or completion.
 * @param {unknown} input */
function textRefinementAuthoritySnapshot(input){
 const deck=parseTypographyDeck(input),{pages,...envelope}=deck;
 return {envelope,pages:pages.map(page=>{
  const {textBoxes,...graphics}=page;
  return {graphics,texts:textBoxes.map(t=>({id:t.id,text:t.text,visibility:t.style?.visibility,
   styleOpacity:t.style?.opacity,fontOpacity:t.font.opacity,source:t.source===undefined?undefined:
   Object.fromEntries(Object.entries(t.source).filter(([key])=>!DIAGNOSTICS.has(key)))}))};
 })};
}
/** This guard permits repairs on incomplete pages without rewriting their
 * failures. It does not adopt a candidate or replace real-render quality gates.
 * @param {ReturnType<typeof textRefinementAuthoritySnapshot>} before
 * @param {unknown} candidate */
function assertTextRefinementPreservesAuthority(before,candidate){
 if(!isDeepStrictEqual(before,textRefinementAuthoritySnapshot(candidate)))
  throw new TypeError('Native text refinement changed content or source authority');
}
/** Compare failure multiplicities, rather than only an already-failing boolean.
 * @param {unknown} input */
function textRefinementAuditFailures(input){
 const audit=jsonSnapshot(input);
 if(!record(audit)||!Array.isArray(audit.checks))throw new TypeError('Invalid native text structural audit');
 /** @type {Map<string,number>} */const failures=new Map();
 for(const check of audit.checks){
  if(!record(check)||typeof check.name!=='string'||typeof check.passed!=='boolean')throw new TypeError('Invalid native text structural check');
  if(!check.passed)failures.set(check.name,(failures.get(check.name)??0)+1);
 }
 return failures;
}
module.exports={textRefinementAuthoritySnapshot,assertTextRefinementPreservesAuthority,textRefinementAuditFailures};
