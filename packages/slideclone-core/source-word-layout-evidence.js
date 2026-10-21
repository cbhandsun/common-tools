// @ts-check
"use strict";
const { types } = require("node:util");
const { admitOcrWordPositionHints } = require("./ocr-word-position-hints");
const { isolateSourceWordInk } = require("./source-word-ink-components");
const { sourceWordWindowRetry } = require("./source-word-window-retry");
const { sourceWordRetryFrame } = require("./source-word-retry-frame");
const { measureSourceWordTypographicGeometry } = require("./source-word-typographic-geometry");
const { sourceWordSpacingUnits } = require("./source-word-spacing-units");
const {filterRotatedSourceWordInk,captureSourceWordFrameIdentity}=require('./source-word-rotated-frame');
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{text:string,box:Box}} PositionedRun */
/** @typedef {{left:boolean,right:boolean,top:boolean,bottom:boolean}} Sides */
/** @typedef {{runs:readonly PositionedRun[]|null,scannedPixels:number,reason:string,sourceFrame?:Box,typographicRuns?:readonly PositionedRun[]}} Layout */
/** @typedef {{left:number,right:number,top:number,bottom:number,local:Uint8Array,request:Record<string,unknown>}} Observation */
/** Captured source bytes never escape this module or authorize source erasure.
 * @type {WeakMap<object,Observation[]>} */const observations=new WeakMap();
/** Failed split evidence can propose a separate whole-line geometry candidate,
 * never a successful split or erasure permission. @type {WeakMap<object,number>} */
const missingSplitRequests=new WeakMap();
/** @param {Layout&{censoredSides?:Sides}} result @returns {Layout} */
function layoutResult(result){return {runs:result.runs,scannedPixels:result.scannedPixels,reason:result.reason,
 ...(result.sourceFrame?{sourceFrame:result.sourceFrame}:{}),...(result.typographicRuns?{typographicRuns:result.typographicRuns}:{})};}
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && [Object.prototype,null].includes(Object.getPrototypeOf(value))
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(property => "value" in property);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is Box} */
function box(value) {
  return record(value) && finite(value.x) && finite(value.y) && finite(value.w) && finite(value.h)
    && value.x >= 0 && value.y >= 0 && value.w > 0 && value.h > 0;
}
/** Same initial recognition proposes splits. Only two observed blank columns
 * can authorize a split; ambiguous adjacent units remain one editable run.
 * A single source scan is charged before reading any pixel. The mask is reused.
 * @param {unknown} input
 * @returns {Layout} */
function measureSourceWordLayout(input) {
  if(input!==null&&typeof input==='object'){
    observations.delete(input);missingSplitRequests.delete(input);
  }
  /** @type {Observation[]} */const captured=[];
  const first=measureWordWindow(input,2,captured);
  if(input!==null&&typeof input==='object'&&captured.length)observations.set(input,captured);
  if(input!==null&&typeof input==='object'&&first.reason==='missing-source-unit'&&captured.length)
    missingSplitRequests.set(input,first.scannedPixels);
  if(first.reason!=="censored-source")return layoutResult(first);
  // The first measurement has already validated every external input. Never
  // make another observation after missing hints, budget or ownership failure.
  if(!record(input)||!record(input.line)||!box(input.line.box)||!finite(input.maxScanPixels))
    throw new TypeError("source word layout request is invalid");
  const retry=sourceWordWindowRetry({height:input.line.box.h,maximumPixels:input.maxScanPixels,scannedPixels:first.scannedPixels});
  if(!retry||!first.censoredSides)return layoutResult(first);
  const second=measureWordWindow({...input,maxScanPixels:retry.remainingPixels},{margin:retry.margin,sides:first.censoredSides},captured);
  if(!second.scannedPixels)return layoutResult(first);
  return {...layoutResult(second),scannedPixels:first.scannedPixels+second.scannedPixels};
}
/** Re-evaluate geometry only inside source windows already observed by this
 * exact private request. Color changes do not authorize new context or masks.
 * Charge the original window cost again, keeping the shared 4M ceiling even
 * though all source bytes come from immutable private snapshots.
 * @param {unknown} request @param {unknown} color @param {unknown} maximum
 * @returns {Layout|null} */
function remeasureSourceWordLayout(request,color,maximum){
 if(request===null||typeof request!=='object'||types.isProxy(request))return null;
 if(typeof color!=='string'||!/^#[a-f0-9]{6}$/iu.test(color)||typeof maximum!=='number'
  ||!Number.isSafeInteger(maximum)||maximum<0||maximum>4000000)throw new TypeError('source word layout retry controls are invalid');
 const captured=observations.get(request);if(!captured)return null;
 let spent=0;
 for(const snapshot of captured){
  const result=measureWordWindow({...snapshot.request,color,maxScanPixels:maximum-spent},2,undefined,snapshot);
  spent+=result.scannedPixels;
  if(result.reason!=='censored-source')return {...layoutResult(result),scannedPixels:spent};
 }
 return {runs:null,scannedPixels:spent,reason:'censored-source'};
}
/** Propose intact geometry from the same immutable window after a spatial split
 * failed. This does not prove individual glyphs: a caller must render and compare
 * this independent candidate before selecting it. A copied request has no access.
 * The original failed result and all ownership/closure tests remain unchanged.
 * @param {unknown} request @param {unknown} maximum @returns {Layout|null} */
function proposeIntactSourceWordLayout(request,maximum){
 if(request===null||typeof request!=='object'||types.isProxy(request))return null;
 if(typeof maximum!=='number'||!Number.isSafeInteger(maximum)||maximum<0||maximum>4000000)
  throw new TypeError('source word candidate budget is invalid');
 const spent=missingSplitRequests.get(request),captured=observations.get(request);
 if(spent===undefined||!captured||captured.length!==1)return null;
 const snapshot=captured[0];if(!snapshot||!record(snapshot.request.line))return null;
 // Consume once, including rejected attempts; no unbounded retry scanning.
 missingSplitRequests.delete(request);
 const line={...snapshot.request.line};delete line.wordPositionHints;
 const result=measureWordWindow({...snapshot.request,line,maxScanPixels:Math.min(maximum,262144-spent)},2,undefined,snapshot);
 if(result.runs?.length!==1||!result.sourceFrame||result.runs[0]?.text!==line.text)
  return {runs:null,scannedPixels:result.scannedPixels,reason:result.reason};
 return {...layoutResult(result),reason:'intact-geometry-candidate'};
}
/** @param {unknown} input @param {number|{margin:number,sides:Sides}} margin
 * @param {Observation[]|undefined} [captured] @param {Observation|undefined} [snapshot]
 * @returns {Layout&{censoredSides?:Sides}} */
function measureWordWindow(input,margin,captured,snapshot) {
  if (!record(input) || !record(input.image) || !record(input.line) || !box(input.line.box)
    || typeof input.line.text !== "string" || input.line.text.length > 512
    || Array.from(input.line.text).some(character=>character.charCodeAt(0)<32||character.charCodeAt(0)===127)
    || typeof input.color !== "string" || !/^#[a-f0-9]{6}$/iu.test(input.color)
    || !finite(input.maxScanPixels) || !Number.isSafeInteger(input.maxScanPixels) || input.maxScanPixels < 0 || input.maxScanPixels > 4_000_000)
    throw new TypeError("source word layout request is invalid");
  const neighbors=input.neighborBoxes===undefined?[]:input.neighborBoxes;
  if(!Array.isArray(neighbors)||types.isProxy(neighbors)||neighbors.length>10000
    ||Object.getPrototypeOf(neighbors)!==Array.prototype||Reflect.ownKeys(neighbors).length!==neighbors.length+1
    ||Object.values(Object.getOwnPropertyDescriptors(neighbors)).some(property=>!("value"in property))||!neighbors.every(box))
    throw new TypeError("source word layout neighbors are invalid");
  const { width, height, rgba } = input.image;
  if (!finite(width) || !finite(height) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height)
    || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 40_000_000
    || !(rgba instanceof Uint8Array) || rgba.length !== width * height * 4)
    throw new TypeError("source word layout raster is invalid");
  if(neighbors.some(neighbor=>neighbor.x+neighbor.w>width||neighbor.y+neighbor.h>height))
    throw new TypeError("source word layout neighbors are invalid");
  const line = { text: input.line.text, box: input.line.box };
  if (line.box.x + line.box.w > width || line.box.y + line.box.h > height)
    throw new TypeError("source word layout frame is invalid");
  const alignment = admitOcrWordPositionHints(input.line.wordPositionHints, line);
  // Alignment is needed to propose splits, not to observe an intact line's
  // source ink. Without alignment keep the entire admitted recognition as one
  // unit; the same pixel, closure and neighboring-owner proofs still apply.
  // Spacing carries no glyph ink. Preserve its exact text without discarding
  // the other admitted word hints; cuts still require physical source gaps.
  const {hints,intactFallback}=sourceWordSpacingUnits(alignment,line);
  // One exact unit supplies no split points, but the same independently
  // observed uncensored ink still proves its complete source geometry. Requiring
  // two units here discarded valid short labels before the source scan.
  if (!hints || hints.length < 1 || hints.some(hint => !hint.text.trim())) return { runs: null, scannedPixels: 0, reason: "no-position-sequence" };
  const frame=typeof margin==="number"?null:sourceWordRetryFrame({width,height,hint:line.box,margin:margin.margin,sides:margin.sides,neighbors});
  const padding=typeof margin==="number"?margin:2;
  const left = snapshot?.left??frame?.x??Math.max(0, Math.floor(line.box.x) - padding), right = snapshot?.right??(frame?frame.x+frame.w:Math.min(width, Math.ceil(line.box.x + line.box.w) + padding));
  const top = snapshot?.top??frame?.y??Math.max(0, Math.floor(line.box.y) - padding), bottom = snapshot?.bottom??(frame?frame.y+frame.h:Math.min(height, Math.ceil(line.box.y + line.box.h) + padding));
  const w = right - left, h = bottom - top, pixels = w * h;
  if (pixels > 262144 || pixels > input.maxScanPixels) return { runs: null, scannedPixels: 0, reason: "source-budget" };
  const scannedPixels = pixels;
  const ink = new Uint8Array(pixels), columns = new Uint32Array(w);
  const colorToken=input.color;
  const color = [1,3,5].map(offset => parseInt(colorToken.slice(offset,offset+2),16));
  // Snapshot each source cell once under the already charged window. Geometry
  // needs the full antialiased stroke, not just pixels near its opaque color.
  const local = snapshot?.local??new Uint8Array(pixels * 4);
  if(!snapshot)for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
    const source=(y*width+x)*4,target=((y-top)*w+x-left)*4;
    if((rgba[source+3]??0)<240)return {runs:null,scannedPixels,reason:"transparent-source"};
    for(let channel=0;channel<4;channel++)local[target+channel]=rgba[source+channel]??0;
  }
  if(captured){
   const lineBox={...line.box};
   captured.push({left,right,top,bottom,local,request:{image:captureSourceWordFrameIdentity(/** @type {{width:number,height:number,rgba:Uint8Array}} */(input.image)),
    line:{text:line.text,box:lineBox,...(alignment?{wordPositionHints:alignment.map(hint=>({text:hint.text,box:{...hint.box}}))}:{})},
    color:colorToken,maxScanPixels:input.maxScanPixels,
    // Preserve only the admitted seed's identity. A distinct overlapping box
    // remains a real neighbor, including one with identical coordinates.
    neighborBoxes:neighbors.map(neighbor=>neighbor===line.box?lineBox:{...neighbor})}});
  }
  const corners=[0,(w-1)*4,(h-1)*w*4,(pixels-1)*4];
  const background=[0,1,2].map(channel=>{
    const values=corners.map(offset=>local[offset+channel]??0).sort((a,b)=>a-b);
    return ((values[1]??0)+(values[2]??0))/2;
  });
  const stableBackground=corners.every(offset=>background.every((value,channel)=>Math.abs(value-(local[offset+channel]??0))<=18));
  const delta=background.map((value,channel)=>value-(color[channel]??0));
  const norm=delta.reduce((sum,value)=>sum+value*value,0);
  /** Keep the existing 42 source contrast and 18 color residual requirements.
   * A pixel must lie on the measured background-to-ink blend, rather than merely
   * be dark. This admits antialiasing without admitting unrelated colored marks.
   * @param {number} offset */
  const blendedInk=offset=>{
    if(!stableBackground||norm===0)return false;
    const contrast=background.map((value,channel)=>value-(local[offset+channel]??0));
    if(Math.max(...contrast.map(Math.abs))<42)return false;
    const alpha=contrast.reduce((sum,value,channel)=>sum+value*(delta[channel]??0),0)/norm;
    return alpha>0&&alpha<=1&&contrast.every((value,channel)=>Math.abs(value-alpha*(delta[channel]??0))<=18);
  };
  for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
    const offset = ((y-top)*w+x-left)*4;
    if (!color.every((value,index) => Math.abs(value - (local[offset+index] ?? 0)) <= 65)&&!blendedInk(offset)) continue;
    ink[(y-top)*w+x-left] = 1; columns[x-left] = (columns[x-left] ?? 0) + 1;
  }
  const neighborBoxes=neighbors.filter(n=>n!==line.box&&n.x<right&&n.x+n.w>left&&n.y<bottom&&n.y+n.h>top).map(n=>{
    const x=Math.max(left,n.x),y=Math.max(top,n.y);
    return {x:x-left,y:y-top,w:Math.min(right,n.x+n.w)-x,h:Math.min(bottom,n.y+n.h)-y};
  });
  const jointOwned=filterRotatedSourceWordInk(/** @type {{width:number,height:number,rgba:Uint8Array}} */(input.image),ink,{left,top,width:w,height:h},local);
  if(jointOwned===false)return {runs:null,scannedPixels,reason:'joint-source-ownership'};
  const isolated = isolateSourceWordInk({ink,width:w,height:h,neighborBoxes,
    seed:{x:line.box.x-left,y:line.box.y-top,w:line.box.w,h:line.box.h}});
  ink.set(isolated.ink); columns.set(isolated.columns);
  if (isolated.censored) return { runs:null,scannedPixels,reason:"censored-source",censoredSides:isolated.censoredSides };
  if (!alignment) {
    const trimmed = line.text.trim();
    const c0 = columns.findIndex(c => c > 0);
    if (c0 >= 0) {
      let c1 = c0;
      while (c1 + 1 < w) {
        let next = c1 + 1;
        while (next < w && !columns[next]) next++;
        if (next < w && next - c1 - 1 <= 3) c1 = next;
        else break;
      }
      let c2 = c1 + 1;
      while (c2 < w && !columns[c2]) c2++;
      const gap = c2 < w ? c2 - c1 - 1 : 0, cw = c1 - c0 + 1;
      if (c2 < w && gap >= Math.max(12, Math.floor(h * 0.45)) && cw <= Math.ceil(h * 1.05) && w - c2 >= cw * 2
        && !/^\S{1,2}\s/u.test(trimmed) && !/^[\p{P}\p{S}]|^.[\p{P}\p{S}]/u.test(trimmed)) {
        for (let x = 0; x <= c1; x++) {
          columns[x] = 0;
          for (let y = 0; y < h; y++) ink[y * w + x] = 0;
        }
      }
    }
  }
  const units = (!alignment && hints.length === 1 ? inferUnalignedWordUnits(hints[0]?.text ?? "", line.box, left, columns) : hints).map(hint => ({...hint}));
  const cuts = [left];
  /** @type {{text:string,left:number,right:number}[]} */ const groups = [];
  let pending = units[0]?.text ?? "";
  for (let index=0;index<units.length-1;index++) {
    const a=units[index], b=units[index+1];
    if (!a || !b) throw new TypeError("source word layout sequence is invalid");
    const lastCut = cuts[cuts.length-1] ?? left;
    const predicted=(a.box.x+a.box.w+b.box.x)/2;
    const from=Math.max(lastCut+1,Math.ceil(a.box.x+a.box.w*(alignment?0.5:0.25)));
    const to=Math.min(right-1,Math.floor(b.box.x+b.box.w*(alignment?0.5:0.75)));
    let cut=-1, distance=Infinity;
    for(let x=from;x<=to;x++) {
      if(columns[x-left] || columns[x-left-1]) continue;
      if(!alignment) {
        let g0 = x - 1, g1 = x;
        while (g0 > lastCut && !columns[g0 - 1 - left]) g0--;
        while (g1 + 1 < right && !columns[g1 + 1 - left]) g1++;
        const gapW = g1 - g0 + 1;
        if (/\s$/u.test(a.text) && gapW < Math.max(3, Math.floor(h * 0.08))) continue;
        let hasLeftInk = false, hasRightInk = false;
        for (let k = lastCut; k < x; k++) if (columns[k - left]) { hasLeftInk = true; break; }
        for (let k = x; k < right; k++) if (columns[k - left]) { hasRightInk = true; break; }
        if (!hasLeftInk || !hasRightInk) continue;
        const score = Math.abs(x - predicted) - gapW * 2.5;
        if (score < distance) { cut = x; distance = score; }
        continue;
      }
      if(Math.abs(x-predicted)<distance){cut=x;distance=Math.abs(x-predicted);}
    }
    if(cut<0){pending+=b.text;continue;}
    groups.push({text:pending,left:lastCut,right:cut}); cuts.push(cut); pending=b.text;
  }
  groups.push({text:pending,left:cuts[cuts.length-1] ?? left,right});
  /** @type {PositionedRun[]} */ const runs=[];let emptyUnit=false;
  for(const group of groups){
    let x0=right,x1=-1,y0=bottom,y1=-1;
    for(let y=top;y<bottom;y++)for(let x=group.left;x<group.right;x++){
      if(!ink[(y-top)*w+x-left])continue;
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    }
    if(x1<x0){emptyUnit=true;continue;}
    runs.push(Object.freeze({text:group.text,box:Object.freeze({x:x0,y:y0,w:x1-x0+1,h:y1-y0+1})}));
  }
  if(!runs.length)return {runs:null,scannedPixels,reason:"missing-source-unit"};
  if(emptyUnit){
    // Missing ink for a proposed unit cannot bind the whole phrase to only
    // the other units. Retain ordinary text until the complete source matches.
    return {runs:null,scannedPixels,reason:'missing-source-unit'};
  }
  // The recognition box is a search seed, not a physical glyph boundary.
  // Uncensored ink inside this unchanged charged window supplies its own frame.
  // Never acquire space occupied by another admitted recognition seed.
  const x=Math.min(line.box.x,...runs.map(run=>run.box.x)),y=Math.min(line.box.y,...runs.map(run=>run.box.y));
  const rightEdge=Math.max(line.box.x+line.box.w,...runs.map(run=>run.box.x+run.box.w));
  const bottomEdge=Math.max(line.box.y+line.box.h,...runs.map(run=>run.box.y+run.box.h));
  const sourceFrame={x,y,w:rightEdge-x,h:bottomEdge-y};
  if(jointOwned!==true&&(x<line.box.x||y<line.box.y||rightEdge>line.box.x+line.box.w||bottomEdge>line.box.y+line.box.h)
    &&neighbors.some(neighbor=>neighbor!==line.box&&Math.max(x,neighbor.x)<Math.min(rightEdge,neighbor.x+neighbor.w)
      &&Math.max(y,neighbor.y)<Math.min(bottomEdge,neighbor.y+neighbor.h)))
    return {runs:null,scannedPixels,reason:"source-frame-ownership"};
  const typographicRuns=stableBackground?measureSourceWordTypographicGeometry({ink,rgba:local,width:w,height:h,left,top,background,color,runs}):null;
  return {runs:Object.freeze(runs),scannedPixels,reason:intactFallback?"source-unsplit-confirmed":"source-gap-confirmed",sourceFrame:Object.freeze(sourceFrame),
    ...(typographicRuns?{typographicRuns}:{})};
}
/** @param {string} text @param {Box} lineBox @param {number} left @param {Uint32Array} columns */
function inferUnalignedWordUnits(text, lineBox, left, columns) {
  if (!text || (!/\s|\|/u.test(text) && !(/[A-Za-z0-9]/u.test(text) && /[\u3400-\u9fff\uf900-\ufaff]/u.test(text)))) {
    return [{ text, box: lineBox }];
  }
  /** @type {string[]} */ const tokens = [];
  let pos = 0;
  while (pos < text.length) {
    const rest = text.slice(pos);
    const m = rest.match(/^([\u3400-\u9fff\uf900-\ufaff]+[，、：；！？]*|[A-Za-z0-9._@-]+|\|+|\S+)(\s*)/u);
    if (!m) break;
    tokens.push(m[0]);
    pos += m[0].length;
  }
  if (tokens.length < 2 || tokens.join("") !== text) return [{ text, box: lineBox }];
  let first = -1, last = -1;
  for (let i = 0; i < columns.length; i++) {
    if (columns[i]) {
      if (first < 0) first = i;
      last = i;
    }
  }
  const spanLeft = first >= 0 ? left + first : lineBox.x;
  const spanW = first >= 0 && last >= first ? Math.max(1, last - first + 1) : lineBox.w;
  /** @param {string} ch */
  const weight = ch => /^\s$/u.test(ch) ? 0.38 : (ch.charCodeAt(0) < 0x0250 ? 0.56 : 1.0);
  const weights = tokens.map(tok => Array.from(tok).reduce((s, ch) => s + weight(ch), 0));
  const total = weights.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  return tokens.map((tok, i) => {
    const wTok = weights[i] ?? 1;
    const x = spanLeft + (acc / total) * spanW;
    acc += wTok;
    const rightEdge = spanLeft + (acc / total) * spanW;
    return { text: tok, box: { x, y: lineBox.y, w: Math.max(1, rightEdge - x), h: lineBox.h } };
  });
}
module.exports = { measureSourceWordLayout,remeasureSourceWordLayout,proposeIntactSourceWordLayout };
