"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {createStrictNativeCandidatePolicy} = require("../packages/slideclone-worker-adapter/candidate-quality-policy");
const {nativeOnlyResidualQualityAcceptable} = require("../packages/slideclone-worker-adapter/team-worker");

function quality(pdr, missing, mad) {
  return {passed:true,checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:true}],
    metrics:{"pixel-diff-ratio":pdr,"foreground-missing-ratio":missing,"mean-absolute-delta":mad}};
}
function fixture() {
  const native = {slideSize:{widthPt:100,heightPt:100},pages:[{textBoxes:[],images:[],
    shapes:[{id:"node",type:"rect",box:{x:10,y:10,w:30,h:20},source:{editable:true}}]}]};
  const baseline = structuredClone(native);
  baseline.pages[0].images.push({id:"residual",box:{x:0,y:0,w:100,h:100},
    source:{fullSlideResidual:true,detector:"foreground-graphic-crop"}});
  return {baselineDeck:baseline,candidateDeck:native,
    baselineQuality:quality(.07,.025,11),candidateQuality:quality(.071,.03,11.5)};
}
const policy = createStrictNativeCandidatePolicy({recordDecision(){},assessRasterRemoval:nativeOnlyResidualQualityAcceptable});

test("strict native admission reuses the existing raster removal transition instead of conflicting with it", () => {
  const input = fixture();
  assert.equal(nativeOnlyResidualQualityAcceptable(input),true);
  assert.equal(policy(input).passed,true);
  assert.equal(createStrictNativeCandidatePolicy({recordDecision(){}})(input).passed,false);
  assert.equal(input.baselineDeck.pages[0].images.length,1);
  assert.equal(input.candidateDeck.pages[0].images.length,0);
});

test("native references, missing references and transition bounds retain non-regression", () => {
  const native = fixture(); native.baselineDeck = structuredClone(native.candidateDeck);
  assert(policy(native).reasons.includes("visual-regressed"));
  const missing = fixture(); delete missing.baselineDeck;
  assert(policy(missing).reasons.includes("visual-regressed"));
  for (const [key,value] of [["pixel-diff-ratio",.083],["foreground-missing-ratio",.076],
    ["mean-absolute-delta",13.26],["mean-absolute-delta",NaN],["pixel-diff-ratio",Infinity]]) {
    const input = fixture();input.candidateQuality.metrics[key]=value;
    assert.equal(policy(input).passed,false,key);
  }
  assert.throws(() => createStrictNativeCandidatePolicy({recordDecision(){},assessRasterRemoval:true}),TypeError);
});

test("raster removal cannot waive visual, native component, provenance or semantic gates", () => {
  for (const kind of ["visual","unrendered","large-raster","residual-rejected","pixel-tracing"]) {
    const input = fixture();
    if (kind === "visual") input.candidateQuality.checks[1].passed=false;
    if (kind === "unrendered") input.candidateQuality.checks[0].passed=false;
    if (kind === "large-raster") input.candidateDeck.pages[0].images=structuredClone(input.baselineDeck.pages[0].images);
    if (kind === "residual-rejected") input.candidateDeck.meta={residualBranchRejected:{code:"RESIDUAL_PIXEL_OWNERSHIP_REJECTED"}};
    if (kind === "pixel-tracing") input.candidateDeck.pages[0].shapes[0].source={detector:"native-residual-primitive-rect",componentQualityIgnore:true};
    const decision = policy(input);
    assert.equal(decision.passed,false,kind);
  }
  const {includesSuite}=require("../scripts/test-suites");
  assert.equal(includesSuite(__filename,"all"),true);
});
