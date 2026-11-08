// @ts-check
"use strict";
const {types}=require("node:util");
const {sourcePaintCoverageVariation}=require("./source-paint-coverage");

/** Retain bounded samples from the existing ink-column scan. This evidence
 * can veto an antialias-induced color split; it grants no pixel ownership,
 * crop, text geometry or fill authority and performs no source reads.
 * @param {unknown} columnCount */
function createInkCoreConsensus(columnCount) {
  if (typeof columnCount !== "number" || !Number.isSafeInteger(columnCount)
    || columnCount < 1 || columnCount > 16384) throw new TypeError("Ink core frame is invalid");
  /** @typedef {{r:number,g:number,b:number,contrast:number}} Sample */
  /** @type {Sample[][]} */ const columns = Array.from({length: columnCount}, () => /** @type {Sample[]} */([]));
  return {
    /** Robust paint proposal from retained opaque samples, never an ownership
     * or erasure proof. The caller must independently prove source gaps and
     * render/compare the reconstructed result at the unchanged quality gates.
     * @param {unknown} left @param {unknown} right */
    proposePaintForColumns(left,right){
      if(typeof left!=='number'||typeof right!=='number'||!Number.isSafeInteger(left)||!Number.isSafeInteger(right)
        ||left<0||right>columnCount||right<=left)throw new TypeError('Ink core interval is invalid');
      const samples=columns.slice(left,right).flat().sort((a,b)=>b.contrast-a.contrast);
      if(samples.length<8)return null;
      const core=samples.slice(0,Math.max(8,Math.ceil(samples.length*.1)));
      /** @param {'r'|'g'|'b'} channel */
      const median=channel=>core.map(s=>s[channel]).sort((a,b)=>a-b)[Math.floor(core.length/2)]??0;
      return {r:median('r'),g:median('g'),b:median('b')};
    },
    /** Only opaque pixels already admitted as ink can contribute.
     * @param {number} column @param {number} r @param {number} g @param {number} b
     * @param {number} alpha @param {number} contrast */
    observe(column, r, g, b, alpha, contrast) {
      if (!Number.isSafeInteger(column) || column < 0 || column >= columnCount
        || ![r,g,b,alpha].every(v => Number.isSafeInteger(v) && v >= 0 && v <= 255)
        || !Number.isFinite(contrast) || contrast < 0 || contrast > 442)
        throw new TypeError("Ink core sample is invalid");
      if (alpha < 240) return;
      const samples = columns[column];
      if (!samples) return;
      if (samples.length === 8 && contrast <= (samples[7]?.contrast ?? 0)) return;
      samples.push({r,g,b,contrast});
      samples.sort((a,b) => b.contrast-a.contrast);
      if (samples.length > 8) samples.length = 8;
    },
    /** Require corroborated cores in every character interval, including
     * whitespace intervals; missing or competing evidence preserves the
     * original split. Neutral black and actual gray remain distinct colors.
     * @param {unknown} characterCount */
    isUniform(characterCount) {
      if (typeof characterCount !== "number" || !Number.isSafeInteger(characterCount)
        || characterCount < 1 || characterCount > 512) throw new TypeError("Ink core sequence is invalid");
      /** @type {{r:number,g:number,b:number}[]} */ const cores = [];
      for (let index=0; index<characterCount; index++) {
        const left=Math.floor(index*columnCount/characterCount);
        const right=Math.min(columnCount,Math.max(left+1,Math.ceil((index+1)*columnCount/characterCount)));
        const samples=columns.slice(left,right).flat().sort((a,b)=>b.contrast-a.contrast);
        if (samples.length<8) return false;
        const core=samples.slice(0,Math.max(8,Math.ceil(samples.length*.1)));
        const color={r:0,g:0,b:0};
        for (const sample of core) {color.r+=sample.r; color.g+=sample.g; color.b+=sample.b;}
        color.r/=core.length; color.g/=core.length; color.b/=core.length;
        if (core.some(s=>Math.max(Math.abs(s.r-color.r),Math.abs(s.g-color.g),Math.abs(s.b-color.b))>18)) return false;
        cores.push(color);
      }
      const first=cores[0];
      return !!first && cores.every(c=>Math.hypot(c.r-first.r,c.g-first.g,c.b-first.b)<38);
    },
    /** A missing narrow-character core is not evidence of different paints.
     * Corroborate the proposed runs from the same retained opaque samples.
     * Unknown or competing evidence preserves the existing split decision.
     * @param {unknown} value @param {unknown} characterCount @param {unknown} [background]
     * @returns {boolean|null} */
    hasPaintTransition(value,characterCount,background) {
      if(typeof characterCount!=="number"||!Number.isSafeInteger(characterCount)
        ||characterCount<1||characterCount>512||!Array.isArray(value)||types.isProxy(value)
        ||Object.getPrototypeOf(value)!==Array.prototype||value.length<2||value.length>4
        ||Reflect.ownKeys(value).length!==value.length+1
        ||Object.values(Object.getOwnPropertyDescriptors(value)).some(p=>!("value" in p)))
        throw new TypeError("Ink core transition is invalid");
      /** @type {{r:number,g:number,b:number}[]} */const paints=[];
      /** @type {{start:number,end:number}[]} */const ranges=[];
      let previousEnd=0;
      for(const range of /** @type {unknown[]} */(value)){
        if(range===null||typeof range!=="object"||types.isProxy(range)||Array.isArray(range)
          ||![Object.prototype,null].includes(Object.getPrototypeOf(range))
          ||Object.values(Object.getOwnPropertyDescriptors(range)).some(p=>!("value" in p)))
          throw new TypeError("Ink core transition is invalid");
        const data=/** @type {Record<string,unknown>} */(range),start=data.startIndex,end=data.endIndex;
        if(typeof start!=="number"||typeof end!=="number"||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)
          ||start!==previousEnd||end<=start||end>characterCount)throw new TypeError("Ink core transition is invalid");
        previousEnd=end;
        ranges.push({start,end});
      }
      if(previousEnd!==characterCount)throw new TypeError("Ink core transition is invalid");
      const groups=ranges.map(({start,end})=>columns.slice(Math.floor(start*columnCount/Number(characterCount)),
        Math.ceil(end*columnCount/Number(characterCount))).flat().sort((a,b)=>b.contrast-a.contrast));
      // Coverage is a veto only for inconclusive transition evidence. It
      // neither replaces a corroborated paint change nor performs source reads.
      const coverageVariation=background!==undefined&&sourcePaintCoverageVariation({groups,background});
      const unknown=()=>coverageVariation?false:null;
      for(const [rangeIndex,{start,end}] of ranges.entries()){
        const samples=groups[rangeIndex]??[];
        if(samples.length<8)return unknown();
        const core=samples.slice(0,Math.max(8,Math.ceil(samples.length*.1))),color={r:0,g:0,b:0};
        for(const sample of core){color.r+=sample.r;color.g+=sample.g;color.b+=sample.b;}
        color.r/=core.length;color.g/=core.length;color.b/=core.length;
        if(core.some(s=>Math.max(Math.abs(s.r-color.r),Math.abs(s.g-color.g),Math.abs(s.b-color.b))>18))return unknown();
        // A small darker neighbor must not erase an actual paint transition.
        // Even sparse character intervals retain their strongest source witness;
        // disagreement makes the run unknown rather than uniformly painted.
        for(let index=start;index<end;index++){
          const a=Math.floor(index*columnCount/characterCount),b=Math.ceil((index+1)*columnCount/characterCount);
          const peak=columns.slice(a,b).flat().sort((x,y)=>y.contrast-x.contrast)[0];
          if(peak&&Math.max(Math.abs(peak.r-color.r),Math.abs(peak.g-color.g),Math.abs(peak.b-color.b))>18)return unknown();
        }
        paints.push(color);
      }
      return paints.some((paint,index)=>{
        const before=paints[index-1];return before!==undefined&&Math.hypot(paint.r-before.r,paint.g-before.g,paint.b-before.b)>=48;
      });
    }
  };
}

module.exports={createInkCoreConsensus};
