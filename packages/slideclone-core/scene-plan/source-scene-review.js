// @ts-check
"use strict";
const { types } = require("node:util");
const { admitOcrResult } = require("../ocr/ocr-result-admission");
const {sourceSceneGapReviewContext}=require('./source-scene-review-context');
const {sourceRouteCatalogsFromEvidence}=require('../routing/source-shared-route-reprojection');
/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && !types.isProxy(value)
    && Object.values(Object.getOwnPropertyDescriptors(value)).every(p => "value" in p);
}
/** @typedef {{index:number,kind:"text"|"graphic"|"mixed"|"uncertain"}} Review */
/** Validate the envelope independently of OCR item admission. Never invoke a
 * provider accessor or proxy while preserving an independently valid plan.
 * @param {unknown} value @returns {unknown} */
function readScenePlanProposal(value){
 if(!record(value))throw new TypeError("Scene review response is invalid");
 return Object.getOwnPropertyDescriptor(value,"scene")?.value;
}
/** @param {unknown} value @param {number} lineCount @returns {Review[]} */
function parseSceneReviews(value, lineCount) {
  if (!record(value) || !Array.isArray(value.reviews) || types.isProxy(value.reviews)
    || !Object.values(Object.getOwnPropertyDescriptors(value.reviews)).every(p => "value" in p)
    || !Number.isSafeInteger(lineCount) || lineCount < 0 || value.reviews.length > lineCount || lineCount > 512) throw new TypeError("Scene review response is invalid");
  const seen = new Set();
  return value.reviews.map(item => {
    if (!record(item) || typeof item.index !== "number" || !Number.isSafeInteger(item.index)
      || item.index < 0 || item.index >= lineCount || seen.has(item.index)
      || typeof item.kind !== "string" || !["text", "graphic", "mixed", "uncertain"].includes(item.kind)) throw new TypeError("Scene review item is invalid");
    seen.add(item.index);
    return { index: item.index, kind: /** @type {Review["kind"]} */ (item.kind) };
  });
}
/** Local evidence must refer to exactly the candidates reviewed on this source.
 * Both observations are classifications, not pixel ownership or topology proof.
 * @param {{ocr:unknown,dimensions:unknown,sourceHash:string,global:unknown,local:unknown,context:unknown,targets:number[]}} input
 */
function applySourceSceneReview(input) {
  const ocr = admitOcrResult(input.ocr, input.dimensions);
  if (!/^[a-f0-9]{64}$/u.test(input.sourceHash) || !record(input.global) || !record(input.local) || !record(input.context)
    || input.global.sourceHash !== input.sourceHash || input.local.sourceHash !== input.sourceHash || input.context.sourceHash !== input.sourceHash
    || !Array.isArray(input.targets) || input.targets.length > 32 || new Set(input.targets).size !== input.targets.length)
    throw new TypeError("Scene review source binding is invalid");
  const global = parseSceneReviews(input.global, ocr.lines.length), local = parseSceneReviews(input.local, ocr.lines.length);
  const context = parseSceneReviews(input.context, ocr.lines.length);
  const proposed = new Set(global.filter(item => item.kind !== "text").map(item => item.index));
  if (input.targets.some(index => !proposed.has(index)) || [local, context].some(reviews => reviews.length !== input.targets.length
    || reviews.some(item => !input.targets.includes(item.index)))) throw new TypeError("Scene review crop binding is invalid");
  const contextGraphics = new Set(context.filter(item => item.kind === "graphic").map(item => item.index));
  const removed = new Set(local.filter(item => item.kind === "graphic" && proposed.has(item.index) && contextGraphics.has(item.index)).map(item => item.index));
  return { ocr: { lines: ocr.lines.filter((_, index) => !removed.has(index)) },
    evidence: { version: 1, sourceHash: input.sourceHash, proposed: proposed.size, reviewed: local.length,
      rejectedOcr: [...removed].map(index => ({ index, box: ocr.lines[index]?.box })),
      retainedAfterLocalReview: local.filter(item => !removed.has(item.index)).map(item => item.index) } };
}
/** A global text claim cannot waive the planner's required low-confidence
 * review. OCR uncertainty is independent of token length and remains a reason
 * to inspect the source, never permission to erase it.
 * @param {Review[]} reviews @param {readonly import("../ocr/ocr-result-admission").OcrLine[]} lines */
function routeSceneReviewCandidates(reviews, lines) {
  const routed = new Map(reviews.map(item => [item.index, item]));
  /** @type {number[]} */
  const shortTokenReviews = [];
  /** @type {number[]} */const lowConfidenceReviews=[];
  /** @type {number[]} */const geometryTokenReviews=[];
  lines.forEach((line, index) => {
    const length=Array.from(line.text.trim()).length,aspect=line.box.w/line.box.h;
    const lowConfidence=line.confidence<0.9;
    // OCR confidence estimates recognition, not whether an icon is text.
    // A compact single-glyph shape supplies a separate review trigger; it
    // grants no deletion authority and does not change confidence thresholds.
    const geometric=length===1&&aspect>=.5&&aspect<=1.8;
    if ((lowConfidence||geometric) && (!routed.has(index) || routed.get(index)?.kind === "text")) {
      routed.set(index, { index, kind: "uncertain" });
      if(lowConfidence){lowConfidenceReviews.push(index);if(length<=2)shortTokenReviews.push(index);}
      if(geometric)geometryTokenReviews.push(index);
    }
  });
  return { reviews: [...routed.values()].sort((a, b) => a.index - b.index), shortTokenReviews,lowConfidenceReviews,geometryTokenReviews };
}
/** Reserve the union, not just the provider's explicit non-text claims. This
 * contract grants neither OCR deletion nor permission to omit excess evidence.
 * @param {unknown} reviews @param {unknown} [missingCount] @param {number} [maxReviewBatches] */
function sourceSceneReviewCapacity(reviews,missingCount=0,maxReviewBatches=1){
 if(!Number.isSafeInteger(maxReviewBatches)||maxReviewBatches<1||maxReviewBatches>16)throw new TypeError('Scene review batch budget is invalid');
 if(!Array.isArray(reviews)||types.isProxy(reviews)||Object.getPrototypeOf(reviews)!==Array.prototype
  ||Reflect.ownKeys(reviews).length!==reviews.length+1||typeof missingCount!=='number'
  ||!Number.isSafeInteger(missingCount)||missingCount<0||missingCount>512)
  throw new TypeError('Scene review capacity input is invalid');
 const indices=parseSceneReviews({reviews},512).filter(item=>item.kind!=='text').map(item=>item.index).sort((a,b)=>a-b);
 const limit=32*maxReviewBatches,remaining=limit-indices.length-missingCount;
 if(remaining<0)throw Object.assign(new RangeError('Scene crop review exceeds boundary'),{
  code:'SCENE_REVIEW_CAPACITY_EXCEEDED',requiredReviews:indices.length,missingTargets:missingCount,limitTargets:limit});
 return {indices,remaining,prompt:`MANDATORY LOCAL REVIEW RESERVATION: indices ${JSON.stringify(indices)} already consume ${indices.length} of ${limit} authorized local targets, even if omitted from reviews or classified as text globally. Do not repeat these reserved indices in reviews: the pipeline independently queues every one for both local observations. reviews contains only additional suspicious indices outside this set; use [] if there are none. Only ${remaining} additional distinct non-text OCR indices plus missingText targets fit. Each batch retains at most 32 targets and two independent observations. Do not hide suspicious candidates outside the reserved set or change their classification to fit; excess evidence must remain explicit and will fail admission.`};
}
/** A crop provides context, never an OCR deletion or pixel ownership decision.
 * The plan is already admitted against this source at the planner boundary.
 * Keep the OCR target unchanged while exposing its smallest enclosing icon.
 * @param {import('./source-scene-plan').Box} box
 * @param {Pick<import('./source-scene-plan').ScenePlan,'objects'>|undefined} plan */
function sourceSceneReviewContext(box,plan){
 const enclosing=plan?.objects.filter(o=>o.kind==='icon'&&o.box.x<=box.x&&o.box.y<=box.y
  &&o.box.x+o.box.w>=box.x+box.w&&o.box.y+o.box.h>=box.y+box.h)
  .sort((a,b)=>a.box.w*a.box.h-b.box.w*b.box.h||a.id.localeCompare(b.id));
 return enclosing?.[0]?{...enclosing[0].box}:plan?sourceSceneGapReviewContext(box,plan):undefined;
}
module.exports = { parseSceneReviews, applySourceSceneReview, routeSceneReviewCandidates, sourceSceneReviewCapacity, readScenePlanProposal, sourceSceneReviewContext,sourceRouteCatalogsFromEvidence };
