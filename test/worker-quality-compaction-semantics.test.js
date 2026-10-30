"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { compactDeckFinalQualitySourceProvenance: compact } = require("../packages/slideclone-worker-adapter/team-worker");
const { auditSemanticEditability: audit } = require("../packages/slideclone-core/quality/semantic-editability-quality");

function deck(images = [], shapes = []) {
  return { slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ images, shapes }] };
}
function invariant(input, passed) {
  const original = structuredClone(input);
  const before = audit(input);
  assert.equal(before.passed, passed);
  const output = compact(input).deck;
  assert.deepEqual(audit(output), before);
  assert.deepEqual(input, original);
  assert.deepEqual(audit(compact(output).deck), before);
}

test("quality compaction cannot hide a filled relationship behind native editable flags", () => {
  const body={id:"body",type:"freeform",box:{x:1,y:1,w:20,h:10},source:{detector:"source-scene-route",
    editable:true,nativeRebuild:true,semanticNativeStructure:true,sourcePhysicalAttachment:true}};
  invariant(deck([], [body]), false);
  const worker=require("../packages/slideclone-worker-adapter/team-worker");
  const reduced=worker.compactDeckLateShapeSourceBudgetProvenance(worker.compactDeckNativeShapeSourceProvenance(deck([], [body])).deck).deck;
  assert.equal(audit(compact(reduced).deck).passed,false);
  assert.equal(audit(worker.compactDeckFinalPrimitiveCandidate(deck([], [body]))).passed,false);
});

test("strict Worker candidate selection rejects fixed relation paint despite passing visual metrics", () => {
  const {assessStrictNativeCandidate}=require("../packages/slideclone-worker-adapter/candidate-quality-policy");
  const quality={passed:true,checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:true}],
    metrics:{"pixel-diff-ratio":.01,"foreground-missing-ratio":.01,"mean-absolute-delta":1}};
  const candidateDeck=deck([],[{id:"body",type:"freeform",box:{x:1,y:1,w:20,h:10},
    source:{detector:"source-scene-route",editable:true,nativeRebuild:true}}]);
  for(const input of [candidateDeck,compact(candidateDeck).deck]){
    const decision=assessStrictNativeCandidate({baselineQuality:quality,candidateQuality:quality,candidateDeck:input});
    assert.equal(decision.passed,false);
    assert.ok(decision.reasons.includes("semantic-editability"));
    assert.equal(decision.semantic.metrics.fixedRelationshipPaintCount,1);
  }
});
test("quality compaction preserves every reconstruction classifier and lineage priority", () => {
  for (const classifier of [
    { fullSlideResidual: true }, { residualCrop: true }, { tiledLargeRaster: true },
    { visualFallbackSource: true }, { detector: "foreground-graphic-crop" }, { strategy: "local-fidelity-crop" }
  ]) for (const key of ["lineageId", "parentRasterId", "parentLargeRasterId", "sourceAssetSha256", "pageImage"]) {
    invariant(deck([0, 1].map(i => ({ id: `crop-${i}`, assetPath: `assets/${i}.png`,
      box: { x: i * 20, y: 0, w: 20, h: 30 }, source: { ...classifier, [key]: "common-source", verbose: [1, 2] } }))), false);
  }
});
test("quality compaction preserves full-slide and missing provenance failures", () => {
  invariant(deck([{ id: "page", box: { x: 0, y: 0, w: 100, h: 100 }, source: { fullSlideResidual: true } }]), false);
  invariant(deck([{ id: "tile", box: { x: 0, y: 0, w: 1, h: 1 }, source: { tiledLargeRaster: true } }]), false);
});
test("quality compaction preserves primitive identities including prefix-only and anonymous rectangles", () => {
  for (const id of ["native-residual-1", "text-fidelity-native-run-1", "component-fidelity-native-run-1", "anonymous"]) {
    invariant(deck([], [{ id, type: "rect", box: { x: 0, y: 0, w: 1, h: 1 },
      style: { fill: "#111111", strokeWidthPt: 0 }, source: { componentQualityIgnore: true } }]), false);
  }
  for (const detector of ["native-residual-primitive-rect", "text-fidelity-native-primitive", "component-fidelity-native-primitive"]) {
    invariant(deck([], [{ id: "shape", type: "rect", box: { x: 0, y: 0, w: 1, h: 1 },
      source: { detector, componentQualityIgnore: true } }]), false);
  }
});
test("quality compaction preserves both genuine native and suspicious mosaic verdicts", () => {
  const shapes = Array.from({ length: 32 }, (_, i) => ({ id: `s${i}`, type: "rect",
    box: { x: i, y: 0, w: 1, h: 1 }, style: { fill: "#111111", stroke: "none", strokeWidthPt: 0 },
    source: { detector: "measured-grid", nativeRebuild: true } }));
  invariant(deck([], shapes), true);
  invariant(deck([], shapes.map(shape => ({ ...shape, source: { ...shape.source, nativeRebuild: false } }))), false);
});
test("quality compaction preserves empty pages and admitted isolated crops", () => {
  invariant(deck(), true);
  invariant(deck([{ id: "icon", box: { x: 0, y: 0, w: 4, h: 4 }, assetPath: "assets/icon.png",
    source: { protectedMinimumUnit: true, cropEvidenceRequired: true, residualCrop: true } }]), true);
  invariant(deck([{ id: "icon", box: { x: 0, y: 0, w: 4, h: 4 },
    source: { protectedMinimumUnit: true } }]), false);
});
