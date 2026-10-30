// @ts-check
"use strict";
const { types } = require('node:util');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{id:string,content:string,revision:string,ink:Box|null}} Text */
/** @typedef {{id:string,pdr:number,mad:number,texts:Text[]}} Candidate */
/** @param {unknown} value @returns {Record<string,unknown>} */
function data(value) {
  if (!value || typeof value !== 'object' || types.isProxy(value) || Array.isArray(value)
    || ![null,Object.prototype].includes(Object.getPrototypeOf(value)) || Object.getOwnPropertySymbols(value).length
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(p => !('value' in p)))
    throw new TypeError('Typography candidate data is invalid');
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {unknown} value @param {number} max @returns {unknown[]} */
function list(value,max) {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value)!==Array.prototype || value.length>max
    || Reflect.ownKeys(value).length!==value.length+1 || Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!('value' in p)))
    throw new TypeError('Typography candidate list is invalid');
  return value;
}
/** @param {unknown} value @param {number} max */
function number(value,max) {
  if (typeof value!=='number' || !Number.isFinite(value) || value<0 || value>max) throw new TypeError('Typography candidate metric is invalid');
  return value;
}
/** @param {unknown} value */
function identity(value) {
  if (typeof value!=='string' || !value.trim() || value.length>256 || Array.from(value).some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127))
    throw new TypeError('Typography candidate identity is invalid');
  return value;
}
/** @param {unknown} value @returns {Box|null} */
function box(value) {
  if (value===null) return null;
  const b=data(value),x=number(b.x,100000),y=number(b.y,100000),w=number(b.w,100000),h=number(b.h,100000);
  if (!w || !h || x+w>100000 || y+h>100000) throw new TypeError('Typography candidate bounds are invalid');
  return {x,y,w,h};
}
/** @param {unknown} value @returns {Candidate} */
function candidate(value) {
  const c=data(value),ids=new Set();
  const texts=list(c.texts,2000).map(raw=>{
    const t=data(raw),id=identity(t.id);
    if (ids.has(id)) throw new TypeError('Typography text identity is ambiguous');
    ids.add(id);
    for (const hash of [t.content,t.revision]) if (typeof hash!=='string' || !/^[a-f0-9]{64}$/u.test(hash))
      throw new TypeError('Typography candidate digest is invalid');
    return {id,content:/** @type {string} */(t.content),revision:/** @type {string} */(t.revision),ink:box(t.ink)};
  });
  return {id:identity(c.id),pdr:number(c.pdr,1),mad:number(c.mad,255),texts};
}
/** @param {Box} source @param {Box} ink */
function errors(source,ink) {
  return [Math.abs(ink.w-source.w),Math.abs(ink.h-source.h),
    Math.abs(ink.x+ink.w/2-source.x-source.w/2),Math.abs(ink.y+ink.h/2-source.y-source.h/2)];
}
/** Select one actually rendered variant for an entire overlapping text group.
 * The caller computes PDR/MAD on the same UNION of windows, not their sum, and
 * re-renders the assembled page before adoption. Digests preserve wording and
 * identify unchanged text. Geometry is sampled independently of those scores;
 * a smaller font cannot win merely by removing mismatched foreground pixels.
 * This proposes a variant only; it creates no provenance or completeness grant.
 * @param {unknown} input */
function selectTypographyCandidate(input) {
  const request=data(input),baseline=candidate(request.baseline),candidates=list(request.candidates,64).map(candidate);
  const uncertainty=number(request.geometryUncertaintyPt,2);
  /** @type {Map<string,Box|null>} */ const source=new Map();
  for (const raw of list(request.source,2000)) {
    const s=data(raw),id=identity(s.id);
    if (source.has(id)) throw new TypeError('Typography source identity is ambiguous');
    source.set(id,box(s.ink));
  }
  if (source.size!==baseline.texts.length || baseline.texts.some(t=>!source.has(t.id)))
    throw new TypeError('Typography source inventory is incomplete');
  const ids=new Set([baseline.id]),before=new Map(baseline.texts.map(t=>[t.id,t]));
  let best=baseline;
  /** @type {{id:string,eligible:boolean,reason:string}[]} */ const decisions=[];
  for (const c of candidates) {
    if (ids.has(c.id)) throw new TypeError('Typography candidate identity is ambiguous');
    ids.add(c.id);
    if (c.texts.length!==before.size || c.texts.some(t=>!before.has(t.id)))
      throw new TypeError('Typography candidate inventory is incomplete');
    let reason='eligible';
    for (const t of c.texts) {
      const b=before.get(t.id);
      if (!b) throw new TypeError('Typography candidate inventory is incomplete');
      if (t.content!==b.content) { reason='content-changed'; break; }
      if (t.revision===b.revision) continue;
      const s=source.get(t.id);
      if (!s || !b.ink || !t.ink) { reason='geometry-unavailable'; break; }
      const previous=errors(s,b.ink),next=errors(s,t.ink);
      if (next.some((error,i)=>error>(previous[i]??0)+uncertainty)) { reason='geometry-regressed'; break; }
    }
    if (reason==='eligible' && !(c.pdr<baseline.pdr && c.mad<baseline.mad)) reason='region-not-improved';
    const eligible=reason==='eligible';decisions.push({id:c.id,eligible,reason});
    if (eligible && c.pdr<=best.pdr && c.mad<=best.mad && (c.pdr<best.pdr || c.mad<best.mad)) best=c;
  }
  return {selectedId:best.id,changed:best!==baseline,decisions};
}
module.exports={selectTypographyCandidate};
