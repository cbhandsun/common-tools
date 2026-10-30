"use strict";
const test=require("node:test"),assert=require("node:assert/strict");
const {createNativeRebuildCandidatePolicy:create}=require("../packages/slideclone-core/quality/native-rebuild-candidate-policy");
const policy=create({largeRasterEditability:deck=>({largeRasterCount:deck.rasters,largestAreaRatio:deck.area}),nativeObjectMetrics:deck=>({textBoxes:deck.texts})});
function quality(pdr,attention=90) {return {passed:false,checks:[{name:"quality-rendered",passed:true}],metrics:{"pixel-diff-ratio":pdr,"foreground-missing-ratio":0.09,"mean-absolute-delta":11,"component-regions-attention":attention,"worst-component-normalized-severity":8}};}
function fixture(){return {baseline:{deck:{rasters:2,area:1,texts:10},ocrCropRecovery:{recovered:0},nativeComponentQuality:{passed:true}},candidate:{deck:{rasters:2,area:1,texts:12},ocrCropRecovery:{recovered:2},nativeComponentQuality:{passed:true}},baselineQuality:quality(0.10),candidateQuality:quality(0.086,95)};}
test("better OCR pixels retain the existing optional component admission limit and record its reason",()=>{
  const f=fixture(),decision=policy.assessOcrRecovery(f);
  assert.equal(decision.passed,false);assert.deepEqual(decision.reasons,["optional-visual-regression"]);
  f.candidateQuality=quality(0.086,90);
  assert.equal(policy.assessOcrRecovery(f).passed,true);
});
test("OCR assessment explains raster, component and semantic recovery failures without changing selection",()=>{
  for(const kind of ["raster","component","text","recovery","unrendered"]) {
    const f=fixture();f.candidateQuality=quality(0.086);
    if(kind==="raster")f.candidate.deck.rasters=3;
    if(kind==="component")f.candidate.nativeComponentQuality.passed=false;
    if(kind==="text")f.candidate.deck.texts=10;
    if(kind==="recovery")f.candidate.ocrCropRecovery.recovered=0;
    if(kind==="unrendered")f.candidateQuality.checks=[];
    const decision=policy.assessOcrRecovery(f);assert.equal(decision.passed,false,kind);assert.ok(decision.reasons.length>0);
    assert.equal(decision.passed,policy.selectOcrRecovery(f));
  }
});
