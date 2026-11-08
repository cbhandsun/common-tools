// @ts-check
"use strict";
const { types } = require("node:util");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {Record<string,unknown> & {family:string,sizePt:number,weight:string}} Font */
/** @typedef {Record<string,unknown> & {id:string,text:string,box:Box,font:Font,source?:Record<string,unknown>,style?:Record<string,unknown>}} Text */
/** @typedef {Record<string,unknown> & {textBoxes:Text[],shapes?:Record<string,unknown>[]}} Page */
/** @typedef {Record<string,unknown> & {slideSize:{widthPt:number,heightPt:number},pages:Page[]}} Deck */
/** Reject executable properties before reading untrusted JSON-shaped inputs.
 * @param {unknown} v @returns {v is Record<string,unknown>} */
function record(v) {
  return v !== null && typeof v === "object" && !types.isProxy(v) && !Array.isArray(v)
    && [null,Object.prototype].includes(Object.getPrototypeOf(v)) && !Object.getOwnPropertySymbols(v).length
    && Object.values(Object.getOwnPropertyDescriptors(v)).every(p => "value" in p);
}
/** @param {unknown} v @param {number} max @returns {unknown[]} */
function list(v,max) {
  if (!Array.isArray(v) || types.isProxy(v) || Object.getPrototypeOf(v)!==Array.prototype || v.length>max
    || Reflect.ownKeys(v).length!==v.length+1 || Object.values(Object.getOwnPropertyDescriptors(v)).some(p=>!("value" in p)))
    throw new TypeError("Invalid typography collection");
  return v;
}
/** @param {unknown} v @param {number} min @param {number} max */
function numeric(v,min,max) {
  if (typeof v!=="number" || !Number.isFinite(v) || v<min || v>max) throw new TypeError("Invalid typography number");
  return v;
}
/** @param {unknown} v @param {number} max */
function text(v,max=16000) {
  if (typeof v!=="string" || v.length>max || [...v].some(c=>{const n=c.codePointAt(0)??0;return n<9||n>10&&n<32||n===127;})) throw new TypeError("Invalid typography string");
  return v;
}
/** @param {unknown} v */
function identity(v) { const s=text(v,256); if (!s.trim()) throw new TypeError("Invalid typography identity"); return s; }
/** @param {unknown} v @returns {Box} */
function box(v) {
  if (!record(v)) throw new TypeError("Invalid typography frame");
  return {x:numeric(v.x,0,100000),y:numeric(v.y,0,100000),w:numeric(v.w,.001,100000),h:numeric(v.h,.001,100000)};
}
/** Bounded deep check protects cloning, hashing and serialization as well as top-level parsing.
 * @param {unknown} input */
function jsonSnapshot(input) {
  let nodes=0,characters=0; const ancestors=new Set();
  /** @param {unknown} v @param {number} depth */
  function scan(v,depth) {
    if (++nodes>300000 || depth>32) throw new RangeError("Typography input exceeds capacity");
    if (typeof v==="string") { characters+=v.length; if (characters>16000000) throw new RangeError("Typography input exceeds capacity"); return; }
    if (v===undefined || v===null || typeof v==="boolean" || typeof v==="number" && Number.isFinite(v)) return;
    if (typeof v!=="object" || types.isProxy(v) || ancestors.has(v)) throw new TypeError("Invalid typography data");
    const values=Array.isArray(v)?list(v,30000):record(v)?Object.values(v):null;
    if (!values) throw new TypeError("Invalid typography data");
    ancestors.add(v); for (const child of values) scan(child,depth+1); ancestors.delete(v);
  }
  scan(input,0); return structuredClone(input);
}
/** @param {unknown} input @returns {Deck} */
function parseTypographyDeck(input) {
  const v=jsonSnapshot(input);
  if (!record(v) || !record(v.slideSize)) throw new TypeError("Invalid typography deck");
  const width=numeric(v.slideSize.widthPt,1,100000),height=numeric(v.slideSize.heightPt,1,100000);
  for (const p of list(v.pages,50)) {
    if (!record(p)) throw new TypeError("Invalid typography page");
    const ids=new Set();
    for (const t of list(p.textBoxes,10000)) {
      if (!record(t) || !record(t.font) || t.source!==undefined&&!record(t.source) || t.style!==undefined&&!record(t.style))
        throw new TypeError("Invalid typography text");
      const id=identity(t.id); if (ids.has(id)) throw new TypeError("Duplicate typography text"); ids.add(id);
      text(t.text); const b=box(t.box); if (b.x+b.w>width+.001 || b.y+b.h>height+.001) throw new TypeError("Typography text outside page");
      const family=identity(t.font.family); if (/[;{}<>"'\\]/u.test(family)) throw new TypeError("Invalid typography font");
      numeric(t.font.sizePt,1,400); numeric(t.rotation??0,-180,180);
      if (t.font.lineHeightMultiple!==undefined) numeric(t.font.lineHeightMultiple,.5,4);
      for (const key of ["runs","positionedRuns"]) if (t[key]!==undefined) {
        const runs=list(t[key],512);
        if (runs.map(r=>{if(!record(r))throw new TypeError("Invalid typography run");return text(r.text);}).join("")!==t.text)
          throw new TypeError("Typography run content differs");
      }
    }
  }
  return /** @type {Deck} */ (v);
}
module.exports={record,list,numeric,text,identity,box,jsonSnapshot,parseTypographyDeck};
