// @ts-check
"use strict";
const crypto = require("node:crypto");
const { types } = require("node:util");
const { admitOcrResult } = require("./ocr-result-admission");
const { admitOcrConfidenceEvidence } = require("./ocr-confidence-evidence");
/** @typedef {{x:number,y:number,w:number,h:number}} Box */
/** @typedef {{text:string,confidence:number,box:Box}} Line */
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => "value" in d);
}
/** @param {unknown} value @returns {value is unknown[]} */
function array(value) {
  return Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(d => "value" in d);
}
/** @param {unknown} value @returns {value is number} */
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
/** @param {unknown} value @returns {value is string} */
function hash(value) { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
/** Fresh recognition must supply confidence; the general OCR admission default is not evidence.
 * @param {unknown} value @param {unknown} dimensions */
function admitRecheckResult(value,dimensions) {
  if(!record(value)||!array(value.lines)||value.lines.some(line=>!record(line)||!finite(line.confidence)||line.confidence<0||line.confidence>1))
    throw new TypeError("OCR consensus recognition confidence is invalid");
  return admitOcrResult(value,dimensions);
}
/** @param {Line} line */
function ocrLineRevision(line) {
  return crypto.createHash("sha256").update(JSON.stringify({ text:line.text,confidence:line.confidence,box:line.box })).digest("hex");
}
/** @param {Box} a @param {Box} b */
function intersection(a,b) { return Math.max(0,Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)); }
/** @param {Box} a @param {Box} b */
function contains(a,b) { return a.x<=b.x && a.y<=b.y && a.x+a.w>=b.x+b.w && a.y+a.h>=b.y+b.h; }
/** @param {string} a @param {string} b */
function editDistance(a,b) {
  const left=Array.from(a),right=Array.from(b);
  let row=right.map((_,i)=>i+1); row.unshift(0);
  for(let i=0;i<left.length;i++) {
    const next=[i+1];
    for(let j=0;j<right.length;j++) next.push(Math.min((next[j]??0)+1,(row[j+1]??0)+1,(row[j]??0)+(left[i]===right[j]?0:1)));
    row=next;
  }
  return row[right.length]??0;
}
/** Admit only source-bound agreement; never repair wording from a dictionary or a guessed topic.
 * @param {unknown} input */
function planOcrLineConsensus(input) {
  if(!record(input) || !record(input.dimensions) || !hash(input.sourceHash) || !array(input.evidence) || input.evidence.length>8)
    throw new TypeError("OCR consensus request is invalid");
  const original=admitOcrResult(input.ocr,input.dimensions), lines=[...original.lines];
  const size={widthPx:/** @type {number} */(input.dimensions.widthPx),heightPx:/** @type {number} */(input.dimensions.heightPx)};
  const seen=new Set();
  /** @type {{lineIndex:number,revision:string,confidence:number,operation:"text"|"confidence"}[]} */ const changes=[];
  for(const evidence of input.evidence) {
    if(!record(evidence) || !finite(evidence.lineIndex) || !Number.isSafeInteger(evidence.lineIndex) || evidence.lineIndex<0 || evidence.lineIndex>=lines.length
      || !hash(evidence.revision) || !hash(evidence.sourceHash) || !array(evidence.observations) || evidence.observations.length!==2 || seen.has(evidence.lineIndex))
      throw new TypeError("OCR consensus evidence is invalid");
    seen.add(evidence.lineIndex);
    const line=original.lines[evidence.lineIndex];
    if(!line) throw new TypeError("OCR consensus target is invalid");
    /** @type {{line:Line,crop:Box,cropHash:string,provider:string}[]} */ const observations=[];
    for(const item of evidence.observations) {
      if(!record(item) || !record(item.cropBox) || !hash(item.cropHash) || typeof item.provider!=="string" || !/^[A-Za-z0-9_.-]{1,64}$/u.test(item.provider))
        throw new TypeError("OCR consensus observation is invalid");
      const box=item.cropBox;
      if(!finite(box.x)||!finite(box.y)||!finite(box.w)||!finite(box.h)||![box.x,box.y,box.w,box.h].every(Number.isSafeInteger)
        ||box.x<0||box.y<0||box.w<1||box.h<1||box.x+box.w>size.widthPx||box.y+box.h>size.heightPx)
        throw new TypeError("OCR consensus crop is invalid");
      const crop={x:box.x,y:box.y,w:box.w,h:box.h};
      const result=admitRecheckResult(item.ocr,{widthPx:crop.w,heightPx:crop.h});
      if(result.lines.length!==1) continue;
      const observed=result.lines[0];
      if(!observed) continue;
      observations.push({line:{...observed,box:{...observed.box,x:crop.x+observed.box.x,y:crop.y+observed.box.y}},crop,cropHash:item.cropHash,provider:item.provider});
    }
    const [a,b]=observations;
    if(!a||!b||evidence.sourceHash!==input.sourceHash||evidence.revision!==ocrLineRevision(line)||line.confidence<0.5||line.confidence>=0.9
      ||Array.from(line.text).length<3||Array.from(line.text).length>128||/[\r\n\t]/u.test(line.text)
      ||a.cropHash===b.cropHash||JSON.stringify(a.crop)===JSON.stringify(b.crop)||a.provider!==b.provider
      ||a.line.text!==b.line.text||Array.from(a.line.text).length<3||Array.from(a.line.text).length>128||/[\r\n\t]/u.test(a.line.text)) continue;
    const confidence=Math.min(a.line.confidence,b.line.confidence);
    const unchanged = a.line.text === line.text;
    const distance=editDistance(line.text,a.line.text);
    if((unchanged ? confidence < 0.9 : confidence < 0.95 || confidence < line.confidence + 0.05)
      ||distance>3||distance>Math.max(Array.from(line.text).length,Array.from(a.line.text).length)*0.3) continue;
    if(!observations.every(o=>contains(o.crop,line.box)&&intersection(o.line.box,line.box)/Math.max(o.line.box.w*o.line.box.h,line.box.w*line.box.h)>=0.65
      &&!original.lines.some((other,index)=>index!==evidence.lineIndex&&intersection(o.crop,other.box)>0))) continue;
    const confidenceEvidence = unchanged ? admitOcrConfidenceEvidence({ operation: "same-text-confidence",
      sourceHash: input.sourceHash, revision: evidence.revision, originalConfidence: line.confidence, provider: a.provider,
      crops: observations.map(observation => ({ hash: observation.cropHash, box: observation.crop, confidence: observation.line.confidence })) },
    { ...line, confidence }, size) : undefined;
    const next={...line,text:a.line.text,confidence,...(confidenceEvidence ? { confidenceEvidence } : {})};
    // A confirmed wording correction invalidates proposals for the old
    // character sequence. Confidence-only confirmation keeps source positions.
    if(!unchanged)delete next.wordPositionHints;
    lines[evidence.lineIndex]=Object.freeze(next);
    changes.push({lineIndex:evidence.lineIndex,revision:evidence.revision,confidence,operation: unchanged ? "confidence" : "text"});
  }
  return {ocr:Object.freeze({lines:Object.freeze(lines)}),changes};
}
module.exports={admitRecheckResult,ocrLineRevision,planOcrLineConsensus};
