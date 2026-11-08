"use strict";
const { required } = require("./approved-frame-bounds");
const { types } = require("node:util");
const { readApprovedFrameBytes: bytes } = require("./approved-frame-bytes");
const { buildBackgroundPlan: buildV2, applyBackgroundPlan: applyV2 } = require("./approved-frame-background.js");
const { digest, signedDistance } = require("./approved-frame-mask.js");
const POLICY = "user-approved-four-legal-witness-normal-interpolation-v3";
/** @typedef {{width:number,height:number,rgba:Uint8Array}} Image */
/** @typedef {{x:number,y:number}} Point */
/** @typedef {{id:string,x:number,y:number,w:number,h:number,radius:number,halfBand:number}} Frame */
/** @typedef {{id:string,kind:string,points:Point[],radius:number,box:{x:number,y:number,r:number,b:number}}} Protection */
/** @typedef {{x:number,y:number,rgb:number[],position:number,reason:string|null,protection:string|null,approximationProtection:string|null,excludedByClassification:boolean}} Witness */
/** @typedef {{valid:boolean,approximationValid:boolean,sameSideDifference:number|null,rgb:number[],position:number}} Side */
/** @param {unknown} value @returns {Record<string,unknown>} */
function record(value) {
  if (!value || typeof value !== "object" || types.isProxy(value)) throw new TypeError("invalid-record");
  const prototype = Object.getPrototypeOf(value), keys = Reflect.ownKeys(value);
  if ((prototype !== Object.prototype && prototype !== null) || keys.length > 128 || keys.some(key => typeof key !== "string" || ["__proto__", "constructor", "prototype"].includes(key))
    || Object.values(Object.getOwnPropertyDescriptors(value)).some(item => !("value" in item))) throw new TypeError("invalid-record");
  return /** @type {Record<string,unknown>} */ (value);
}
/** @param {unknown} value @param {number} limit @returns {unknown[]} */
function array(value, limit) {
  if (!value || typeof value !== "object" || types.isProxy(value) || !Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) throw new TypeError("invalid-array");
  if (value.length > limit || Reflect.ownKeys(value).length !== value.length + 1 || Object.keys(value).length !== value.length
    || Object.keys(value).some((key, index) => key !== String(index)) || Object.values(Object.getOwnPropertyDescriptors(value)).some(item => !("value" in item))) throw new TypeError("invalid-array");
  return value;
}
/** @param {unknown} value @param {number} low @param {number} high */
function number(value, low, high) { if (typeof value !== "number" || !Number.isFinite(value) || value < low || value > high) throw new TypeError("invalid-number"); return value; }
/** @param {unknown} value */
function hash(value) { if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("invalid-hash"); return value; }
/** @param {unknown} value @returns {Image} */
function image(value) {
  const item = record(value), width = number(item.width, 1, 32768), height = number(item.height, 1, 32768);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width * height > 40_000_000) throw new RangeError("image-boundary");
  return { width, height, rgba: bytes(item.rgba, width * height * 4) };
}
/** @param {unknown} value @returns {Point} */
function point(value) { const item = record(value); return { x: number(item.x, -32768, 65536), y: number(item.y, -32768, 65536) }; }
/** @param {Point} p @param {Point} a @param {Point} b */
function distance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/** @param {Frame} frame @param {number} x @param {number} y */
function normal(frame, x, y) {
  const dx = x - frame.x - frame.w / 2, dy = y - frame.y - frame.h / 2;
  const qx = Math.abs(dx) - (frame.w / 2 - frame.radius), qy = Math.abs(dy) - (frame.h / 2 - frame.radius);
  if (qx > 0 && qy > 0) { const length = Math.hypot(qx, qy); return { x: Math.sign(dx) * qx / length, y: Math.sign(dy) * qy / length }; }
  return qx > qy ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
}
/** @param {unknown} input */
function buildApproximateBackgroundPlan(input) {
  const data = record(input), baseline = buildV2(input), source = image(data.source), size = source.width * source.height;
  const excluded = bytes(data.excludedSourceMask, size), exclusionSha256 = hash(data.excludedSourceMaskSha256), classificationSha256 = hash(data.classificationSha256);
  if (digest(excluded) !== exclusionSha256 || hash(data.classificationSourceSha256) !== baseline.sourceSha256) throw new TypeError("exclusion-source-binding");
  let excludedCells = 0;
  for (let index = 0; index < size; index++) {
    if (required(excluded, index) !== 0 && required(excluded, index) !== 1) throw new TypeError("invalid-exclusion-mask");
    if (required(excluded, index)) { excludedCells++; if (baseline.repairMask[index]) throw new TypeError("exclusion-overlaps-existing-v2-repair"); }
  }
  const frames = array(data.frames, 3).map(value => {
    const item = record(value), geometry = record(item.geometry), box = record(geometry.boxPx);
    return { id: String(item.id), x: number(box.x, 0, 32768), y: number(box.y, 0, 32768), w: number(box.w, 1, 32768), h: number(box.h, 1, 32768), radius: number(geometry.radiusPx, 1, 24), halfBand: number(geometry.strokeWidthPx, 0.25, 6) / 2 + 2 };
  });
  const originalProtectionCount = array(data.protections, 512).length;
  const protectionInputs = [...array(data.protections, 512), ...array(data.additionalProtections === undefined ? [] : data.additionalProtections, 512)];
  if (protectionInputs.length > 512) throw new RangeError("protection-boundary");
  /** @type {Protection[]} */
  const protections = protectionInputs.map(value => {
    const item = record(value);
    if (typeof item.id !== "string" || !/^[A-Za-z0-9_.-]{1,160}$/u.test(item.id) || (item.kind !== "polyline" && item.kind !== "polygon")) throw new TypeError("invalid-protection");
    const points = array(item.points, 2048).map(point), radius = number(item.widthPx, 0, 64) / 2 + number(item.marginPx, 0, 2);
    if (points.length < (item.kind === "polygon" ? 3 : 2)) throw new TypeError("invalid-protection-points");
    return { id: item.id, kind: item.kind, points, radius, box: { x: Math.min(...points.map(p => p.x)) - radius, y: Math.min(...points.map(p => p.y)) - radius, r: Math.max(...points.map(p => p.x)) + radius, b: Math.max(...points.map(p => p.y)) + radius } };
  });
  let work = baseline.work;
  /** @param {number} x @param {number} y @param {boolean} [includeAdditional] */
  function protectedAt(x, y, includeAdditional = true) {
    for (let protectionIndex = 0; protectionIndex < protections.length; protectionIndex++) {
      if (!includeAdditional && protectionIndex >= originalProtectionCount) break;
      const item = required(protections, protectionIndex);
      if (x < item.box.x || x > item.box.r || y < item.box.y || y > item.box.b) continue;
      let inside = false;
      for (let index = 0; index < item.points.length - (item.kind === "polygon" ? 0 : 1); index++) {
        if (++work > 4_000_000) throw new RangeError("work-boundary");
        const a = required(item.points, index), b = required(item.points, (index + 1) % item.points.length);
        if (distance({ x, y }, a, b) <= item.radius) return item.id;
        if (item.kind === "polygon" && (a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
      }
      if (inside) return item.id;
    }
    return null;
  }
  const repairMask = Uint8Array.from(baseline.repairMask), replacementRGBA = Buffer.from(baseline.replacementRGBA), approximateFallbackMask = new Uint8Array(size);
  const strictRejections = [], fallbackReports = [];
  for (let index = 0; index < size; index++) {
    if (!baseline.unionMask[index] || baseline.repairMask[index]) continue;
    const x = index % source.width, y = Math.floor(index / source.width), frame = frames.reduce((best, current) => Math.abs(signedDistance(current, x, y)) < Math.abs(signedDistance(best, x, y)) ? current : best, required(frames, 0));
    const sd = signedDistance(frame, x, y), n = normal(frame, x, y), cx = x - n.x * sd, cy = y - n.y * sd;
    let originalFailure = required(source.rgba, index * 4 + 3) === 255 ? "" : "source-not-opaque";
    const targetProtection = protectedAt(x, y, false), approximationTargetProtection = protectedAt(x, y);
    if (targetProtection) originalFailure = "protected-target";
    /** @type {Side[]} */ const sides = [];
    /** @type {Witness[]} */ const witnesses = [];
    for (const direction of [-1, 1]) {
      /** @type {Witness[]} */ const samples = []; let sideFailure = "";
      for (const extra of [3, 4]) {
        const wx = Math.round(cx + n.x * (frame.halfBand + extra) * direction), wy = Math.round(cy + n.y * (frame.halfBand + extra) * direction);
        let reason = "", protection = null, approximationProtection = null, excludedByClassification = false; const rgb = [];
        if (wx < 0 || wy < 0 || wx >= source.width || wy >= source.height) reason = "background-outside-source";
        else {
          const at = (wy * source.width + wx) * 4; rgb.push(required(source.rgba, at), required(source.rgba, at + 1), required(source.rgba, at + 2)); protection = protectedAt(wx, wy, false); approximationProtection = protectedAt(wx, wy);
          excludedByClassification = Boolean(required(excluded, wy * source.width + wx));
          if (required(source.rgba, at + 3) !== 255 || Math.min(...rgb) < 220 || Math.max(...rgb) - Math.min(...rgb) > 40 || baseline.unionMask[wy * source.width + wx] || protection) reason = "background-not-visible-pale";
        }
        if (!sideFailure && reason) sideFailure = reason;
        const sample = { x: wx, y: wy, rgb, position: (wx - cx) * n.x + (wy - cy) * n.y, reason: reason || null, protection, approximationProtection, excludedByClassification };
        samples.push(sample); witnesses.push(sample);
      }
      if (!originalFailure && sideFailure) originalFailure = sideFailure;
      const valid = samples.every(sample => !sample.reason);
      const sameSideDifference = valid ? Math.max(...[0, 1, 2].map(channel => Math.abs(required(required(samples, 0).rgb, channel) - required(required(samples, 1).rgb, channel)))) : null;
      if (!originalFailure && sameSideDifference !== null && sameSideDifference > 6) originalFailure = "background-inconsistent-side";
      sides.push({ valid, approximationValid: valid && samples.every(sample => !sample.approximationProtection && !sample.excludedByClassification), sameSideDifference, rgb: valid ? [0, 1, 2].map(channel => (required(required(samples, 0).rgb, channel) + required(required(samples, 1).rgb, channel)) / 2) : [], position: (required(samples, 0).position + required(samples, 1).position) / 2 });
    }
    const originalWitnessesLegal = sides.every(side => side.valid), allWitnessesLegal = sides.every(side => side.approximationValid), transition = originalWitnessesLegal ? Math.max(...[0, 1, 2].map(channel => Math.abs(required(required(sides, 0).rgb, channel) - required(required(sides, 1).rgb, channel)))) : null;
    if (!originalFailure && transition !== null && transition > 40) originalFailure = "background-transition-too-large";
    if (!originalFailure) throw new Error("v2-rejection-replay-mismatch");
    const eligible = originalFailure === "background-inconsistent-side" && allWitnessesLegal && transition !== null && transition <= 40 && !required(excluded, index) && !approximationTargetProtection && required(source.rgba, index * 4 + 3) === 255;
    const rejection = { index, x, y, frameId: frame.id, sourceRGBA: Array.from(source.rgba.subarray(index * 4, index * 4 + 4)), reason: originalFailure,
      sameSideMaxDeltaThreshold: 6, sameSideDifferences: sides.map(side => side.sameSideDifference), originalWitnessesLegal, allWitnessesLegal, transitionMaxDelta: transition, targetProtection, approximationTargetProtection, excludedByClassification: Boolean(required(excluded, index)), approximateFallbackApplied: eligible, strictAccepted: false, witnesses };
    strictRejections.push(rejection);
    if (!eligible) continue;
    const t = Math.max(0, Math.min(1, (sd - required(sides, 0).position) / (required(sides, 1).position - required(sides, 0).position)));
    for (let channel = 0; channel < 3; channel++) replacementRGBA[index * 4 + channel] = Math.round(required(required(sides, 0).rgb, channel) * (1 - t) + required(required(sides, 1).rgb, channel) * t);
    replacementRGBA[index * 4 + 3] = 255; repairMask[index] = 1; approximateFallbackMask[index] = 1;
    fallbackReports.push({ index, x, y, frameId: frame.id, originalV2Rejection: originalFailure, sameSideDifferences: rejection.sameSideDifferences, inferredRGBA: Array.from(replacementRGBA.subarray(index * 4, index * 4 + 4)), inferredFill: true, approximateBackground: true, strictAccepted: false });
  }
  const replayedFailures = Object.create(null);
  for (const rejection of strictRejections) replayedFailures[rejection.reason] = (replayedFailures[rejection.reason] || 0) + 1;
  if (JSON.stringify(replayedFailures) !== JSON.stringify(baseline.failures)) throw new Error("v2-rejection-replay-mismatch");
  const originalUnion = baseline.unionMask;
  const baselineV2 = Object.fromEntries(Object.entries(baseline).filter(([key]) => !["unionMask", "repairMask", "replacementRGBA"].includes(key)));
  return { ...baseline, repairMask, replacementRGBA, repairMaskSha256: digest(repairMask), replacementRgbaSha256: digest(replacementRGBA), approximationVersion: 3,
    repairPolicy: POLICY, approximationPolicy: POLICY, approximateBackground: true, sourceReconstruction: true, inferredFill: true, strictAccepted: false, noGhostVerified: false,
    unionMask: Uint8Array.from(originalUnion), approximateFallbackMask, approximateFallbackMaskSha256: digest(approximateFallbackMask),
    excludedSourceMaskSha256: exclusionSha256, classificationSha256, classificationSourceSha256: baseline.sourceSha256, excludedSourceCells: excludedCells,
    baselineV2, baselineV2MetadataSha256: digest(Buffer.from(JSON.stringify(baselineV2))), strictRejections, strictRejectionsSha256: digest(Buffer.from(JSON.stringify(strictRejections))),
    fallbackReports, approximateFallbackSourceCells: fallbackReports.length, effectiveRepairSourceCells: repairMask.reduce((total, value) => total + value, 0),
    work, limitations: [...baseline.limitations, "user-approved-approximation-overrides-same-side-v2-rejection-only", "original-v2-rejections-retained", "classification-suspects-excluded", "approximate-AA-is-not-strict-source-ownership"] };
}
/** @param {unknown} input */
function applyApproximateBackgroundPlan(input) {
  const data = record(input), plan = record(data.plan);
  if (plan.approximationVersion !== 3 || plan.approximationPolicy !== POLICY || plan.strictAccepted !== false || plan.noGhostVerified !== false) throw new TypeError("approximation-plan-policy");
  const source = image(data.source), fallback = bytes(plan.approximateFallbackMask, source.width * source.height), repair = bytes(plan.repairMask, source.width * source.height), union = bytes(plan.unionMask, source.width * source.height);
  if (digest(fallback) !== hash(plan.approximateFallbackMaskSha256)) throw new TypeError("fallback-mask-binding");
  for (let index = 0; index < fallback.length; index++) if ((required(fallback, index) !== 0 && required(fallback, index) !== 1) || (required(fallback, index) && (!required(repair, index) || !required(union, index)))) throw new TypeError("fallback-outside-repair-union");
  const result = applyV2(input), asset = image(data.asset), registration = record(data.registration);
  const ox = Math.round(number(registration.x, -0.02, source.width)), oy = Math.round(number(registration.y, -0.02, source.height));
  let approximateFallbackReconstructed = 0;
  for (let yy = 0; yy < asset.height; yy++) for (let xx = 0; xx < asset.width; xx++) {
    const at = (yy * asset.width + xx) * 4, index = (oy + yy) * source.width + ox + xx;
    if (required(fallback, index) && required(asset.rgba, at + 3) > 0 && [0, 1, 2, 3].every(channel => required(asset.rgba, at + channel) === required(source.rgba, index * 4 + channel))) approximateFallbackReconstructed++;
  }
  return { ...result, approximateFallbackReconstructed, approximationPolicy: POLICY, inferredFill: true, strictAccepted: false, noGhostVerified: false };
}
module.exports = { buildApproximateBackgroundPlan, applyApproximateBackgroundPlan };
