"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { buildApprovedFrameMask, signedDistance, digest } = require("../packages/slideclone-core/scene-plan/approved-frame-mask.js");
const { buildBackgroundPlan } = require("../packages/slideclone-core/scene-plan/approved-frame-background.js");
const { buildApproximateBackgroundPlan, applyApproximateBackgroundPlan } = require("../packages/slideclone-core/scene-plan/approved-frame-approximation.js");
const HASH = "a".repeat(64), FIT = "b".repeat(64), CLASSIFICATION = "c".repeat(64);
function refresh(data) { data.originalMaskSha256 = buildApprovedFrameMask(data).maskSha256; data.excludedSourceMaskSha256 = digest(data.excludedSourceMask); return data; }
function fixture(noisy = true, origin = { x: 8, y: 8 }) {
  const width = 64, height = 48, rgba = Buffer.alloc(width * height * 4), f = { ...origin, w: 48, h: 30, radius: 6 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const sd = signedDistance(f, x, y), color = Math.abs(sd) <= 0.7 ? [225, 235, 230] : sd < 0 ? [242, 249, 245] : [251, 250, 248], at = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) rgba[at + channel] = color[channel]; rgba[at + 3] = 255;
  }
  if (noisy && origin.y === 8) { const at = (2 * width + 30) * 4; [242, 244, 242].forEach((value, channel) => { rgba[at + channel] = value; }); }
  return refresh({ approvalId: "user-20261023-approx-frame", source: { width, height, rgba }, sourceSha256: HASH, fitSha256: FIT,
    frames: [{ status: "fitted", id: "region-n6", source: { width, height, sha256: HASH }, geometry: { boxPx: { ...origin, w: 48, h: 30 }, radiusPx: 6, strokeWidthPx: 2, strokeColor: "#E1EBE6" }, approximation: { approvalId: "user-20261023-approx-frame" } }],
    protections: [], additionalProtections: [], supplement: [], supplementEvidenceSha256: CLASSIFICATION,
    excludedSourceMask: new Uint8Array(width * height), excludedSourceMaskSha256: "", classificationSha256: CLASSIFICATION, classificationSourceSha256: HASH });
}
const target = 8 * 64 + 30;
const apply = (data, plan, asset = data.source, registration = { x: 0, y: 0, w: 64, h: 48 }) => applyApproximateBackgroundPlan({ source: data.source, asset, plan, registration });

test("byte views cannot execute caller methods or getters during build and apply", () => {
  const data = fixture(), expected = buildApproximateBackgroundPlan(data);
  let calls = 0;
  const hostile = original => {
    const bytes = Uint8Array.from(original);
    for (const key of ["subarray", "slice", "map", "buffer", "byteOffset", "byteLength", "constructor", "valueOf", Symbol.iterator]) {
      Object.defineProperty(bytes, key, { get() { calls++; throw new Error("sensitive-caller-content"); } });
    }
    return bytes;
  };
  data.source.rgba = hostile(data.source.rgba);
  data.excludedSourceMask = hostile(data.excludedSourceMask);
  const actual = buildApproximateBackgroundPlan(data);
  assert.deepEqual(actual, expected);
  const plan = { ...actual };
  for (const key of ["approximateFallbackMask", "repairMask", "unionMask", "replacementRGBA"]) plan[key] = hostile(plan[key]);
  assert.deepEqual(apply(data, plan), apply(fixture(), expected));
  assert.equal(calls, 0);
});

test("approved approximation: same-side rejection is retained while four legal witnesses support an inferred opaque fill", () => {
  const data = fixture(), before = Buffer.from(data.source.rgba), strict = buildBackgroundPlan(data), plan = buildApproximateBackgroundPlan(data);
  assert.equal(strict.repairMask[target], 0); assert.equal(plan.repairMask[target], 1); assert.equal(plan.approximateFallbackMask[target], 1);
  const { unionMask, repairMask, replacementRGBA, ...metadata } = strict;
  assert.deepEqual(plan.baselineV2, metadata); assert.equal(plan.baselineV2.policy.sameSideMaxDelta, 6);
  const refusal = plan.strictRejections.find(row => row.index === target); assert(refusal);
  assert.equal(refusal.reason, "background-inconsistent-side"); assert.equal(refusal.sameSideMaxDeltaThreshold, 6);
  assert(refusal.sameSideDifferences.some(value => value > 6)); assert.equal(refusal.allWitnessesLegal, true); assert.equal(refusal.approximateFallbackApplied, true);
  assert.equal(plan.strictAccepted, false); assert.equal(plan.noGhostVerified, false); assert.equal(plan.inferredFill, true);
  const output = apply(data, plan); assert(output.approximateFallbackReconstructed > 0); assert.equal(output.rgba[target * 4 + 3], 255);
  assert.deepEqual(Array.from(output.rgba.subarray(target * 4, target * 4 + 4)), Array.from(plan.replacementRGBA.subarray(target * 4, target * 4 + 4)));
  assert.deepEqual(data.source.rgba, before); assert.deepEqual(plan.unionMask, unionMask); assert.deepEqual(plan.baselineV2.failures, strict.failures);
});
test("normal and empty: original accepted repairs remain byte-identical; empty plan returns a separate unchanged asset", () => {
  const data = fixture(false), strict = buildBackgroundPlan(data), plan = buildApproximateBackgroundPlan(data);
  assert.equal(plan.approximateFallbackSourceCells, 0); assert.deepEqual(plan.repairMask, strict.repairMask); assert.deepEqual(plan.replacementRGBA, strict.replacementRGBA);
  data.frames = []; refresh(data); const empty = buildApproximateBackgroundPlan(data), output = apply(data, empty);
  assert.equal(empty.approximateFallbackSourceCells, 0); assert.equal(empty.strictRejections.length, 0); assert.deepEqual(output.rgba, data.source.rgba); assert.notEqual(output.rgba, data.source.rgba);
});
test("classification excludes every carrier at the same source coordinate without changing strict refusal", () => {
  const data = fixture(); data.excludedSourceMask[target] = 1; refresh(data); const plan = buildApproximateBackgroundPlan(data);
  assert.equal(plan.repairMask[target], 0); assert.equal(plan.excludedSourceCells, 1);
  const row = plan.strictRejections.find(item => item.index === target); assert.equal(row.excludedByClassification, true); assert.equal(row.reason, "background-inconsistent-side");
  const full = apply(data, plan), cropped = { width: 1, height: 1, rgba: Buffer.from(data.source.rgba.subarray(target * 4, target * 4 + 4)) };
  const crop = apply(data, plan, cropped, { x: 30, y: 8, w: 1, h: 1 });
  assert.deepEqual(crop.rgba, cropped.rgba); assert.deepEqual(full.rgba.subarray(target * 4, target * 4 + 4), cropped.rgba);
});
test("additional target text and witness geometry fail closed while original v2 failures stay exact", () => {
  for (const y of [8, 2]) {
    const data = fixture(), baseline = buildBackgroundPlan(data);
    data.additionalProtections = [{ id: "text-guard", kind: "polygon", points: [{ x: 29, y: y - 1 }, { x: 31, y: y - 1 }, { x: 31, y: y + 1 }, { x: 29, y: y + 1 }], widthPx: 0, marginPx: 0 }];
    const plan = buildApproximateBackgroundPlan(data), row = plan.strictRejections.find(item => item.index === target);
    assert.equal(plan.repairMask[target], 0); assert.equal(row.reason, "background-inconsistent-side"); assert.deepEqual(plan.baselineV2.failures, baseline.failures);
  }
});
test("classification-excluded witnesses cannot support fallback while strict refusals remain unchanged", () => {
  const data = fixture(), baseline = buildBackgroundPlan(data);
  data.excludedSourceMask[2 * 64 + 30] = 1; refresh(data);
  const plan = buildApproximateBackgroundPlan(data), row = plan.strictRejections.find(item => item.index === target);
  assert.equal(plan.repairMask[target], 0); assert.equal(row.reason, "background-inconsistent-side");
  assert.equal(row.originalWitnessesLegal, true); assert.equal(row.allWitnessesLegal, false);
  assert(row.witnesses.some(witness => witness.excludedByClassification)); assert.deepEqual(plan.baselineV2.failures, baseline.failures);
});
test("unsafe witnesses: dark, transparent, original path-protected and out-of-source samples never acquire approximation", () => {
  for (const variant of ["dark", "transparent", "path"]) {
    const data = fixture(), at = (2 * 64 + 30) * 4;
    if (variant === "dark") data.source.rgba[at] = 100;
    if (variant === "transparent") data.source.rgba[at + 3] = 0;
    if (variant === "path") data.protections = [{ id: "business-path", kind: "polyline", points: [{ x: 29, y: 2 }, { x: 31, y: 2 }], widthPx: 1, marginPx: 0 }];
    refresh(data); const plan = buildApproximateBackgroundPlan(data);
    assert.equal(plan.repairMask[target], 0); assert.equal(plan.approximateFallbackMask[target], 0);
  }
  const edge = fixture(false, { x: 2, y: 8 }), plan = buildApproximateBackgroundPlan(edge);
  for (const row of plan.strictRejections.filter(row => row.reason === "background-outside-source")) assert.equal(row.approximateFallbackApplied, false);
  assert(plan.strictRejections.some(row => row.reason === "background-outside-source"));
});
test("exact source and hidden transparent RGBA: conflicting or already transparent asset cells are never rewritten", () => {
  const data = fixture(), plan = buildApproximateBackgroundPlan(data);
  for (const transparent of [false, true]) {
    const asset = { ...data.source, rgba: Buffer.from(data.source.rgba) }; asset.rgba[target * 4] = 17; if (transparent) asset.rgba[target * 4 + 3] = 0;
    const output = apply(data, plan, asset); assert.deepEqual(output.rgba.subarray(target * 4, target * 4 + 4), asset.rgba.subarray(target * 4, target * 4 + 4));
    if (!transparent) assert.equal(output.sourceConflictCount, 1);
  }
});
test("invalid exclusion binding, nonbinary masks and exclusions against existing v2 repairs reject", () => {
  const stale = fixture(); stale.classificationSourceSha256 = FIT; assert.throws(() => buildApproximateBackgroundPlan(stale), /exclusion-source-binding/);
  const badHash = fixture(); badHash.excludedSourceMaskSha256 = FIT; assert.throws(() => buildApproximateBackgroundPlan(badHash), /exclusion-source-binding/);
  const nonbinary = fixture(); nonbinary.excludedSourceMask[0] = 2; refresh(nonbinary); assert.throws(() => buildApproximateBackgroundPlan(nonbinary), /invalid-exclusion-mask/);
  const existing = fixture(false); existing.excludedSourceMask[target] = 1; refresh(existing); assert.throws(() => buildApproximateBackgroundPlan(existing), /exclusion-overlaps-existing-v2-repair/);
  const wrongLength = fixture(); wrongLength.excludedSourceMask = new Uint8Array(1); assert.throws(() => buildApproximateBackgroundPlan(wrongLength), /invalid-byte-length/);
});
test("plan policy, fallback hash/scope, source bytes and registration cannot be forged", () => {
  const data = fixture(), plan = buildApproximateBackgroundPlan(data);
  assert.throws(() => apply(data, { ...plan, strictAccepted: true }), /approximation-plan-policy/);
  assert.throws(() => apply(data, { ...plan, approximateFallbackMaskSha256: FIT }), /fallback-mask-binding/);
  const forged = Uint8Array.from(plan.approximateFallbackMask); forged[0] = 1;
  assert.throws(() => apply(data, { ...plan, approximateFallbackMask: forged, approximateFallbackMaskSha256: digest(forged) }), /fallback-outside-repair-union/);
  assert.throws(() => apply(data, { ...plan, sourceRgbaSha256: FIT }), /plan-source-binding/);
  assert.throws(() => apply(data, plan, data.source, { x: 0.5, y: 0, w: 64, h: 48 }), /registration-mismatch/);
});
test("security and extreme boundaries: no Proxy/getter execution, no sparse or custom-prototype inputs", () => {
  let calls = 0; const proxy = new Proxy({}, { get() { calls++; throw new Error("trap"); }, ownKeys() { calls++; throw new Error("trap"); } });
  assert.throws(() => buildApproximateBackgroundPlan(proxy)); const revoked = Proxy.revocable({}, {}); revoked.revoke(); assert.throws(() => buildApproximateBackgroundPlan(revoked.proxy));
  const accessor = fixture(); Object.defineProperty(accessor, "excludedSourceMask", { get() { calls++; throw new Error("getter"); } }); assert.throws(() => buildApproximateBackgroundPlan(accessor));
  const nested = fixture(); nested.additionalProtections = [Object.defineProperty({}, "points", { get() { calls++; throw new Error("getter"); } })]; assert.throws(() => buildApproximateBackgroundPlan(nested));
  const sparse = fixture(); sparse.additionalProtections = new Array(1); sparse.additionalProtections[Symbol("padding")] = 1; assert.throws(() => buildApproximateBackgroundPlan(sparse));
  const custom = fixture(); Object.setPrototypeOf(custom, { surprise: true }); assert.throws(() => buildApproximateBackgroundPlan(custom));
  const extreme = fixture(); extreme.source.width = 32768; extreme.source.height = 32768; assert.throws(() => buildApproximateBackgroundPlan(extreme));
  assert.equal(calls, 0);
});
