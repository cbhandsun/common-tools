"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyTextWeightRefiner } = require("../packages/slideclone-worker-adapter/native-only-text-weight-refinement");
const { validateDeckIr } = require("../packages/slideclone-core/deck-ir-admission");
const { auditSemanticEditability } = require("../packages/slideclone-core/semantic-editability-quality");
const { qualityRendered } = require("../packages/slideclone-core/team-native-rebuild");
const { finalRefinementQualityAcceptable } = require("../packages/slideclone-worker-adapter/team-worker");
function quality(pixel = 0.1, severity = [2,2]) {
  const rows = severity.map((value, i) => ({pageIndex:0,id:`label-${i}`,kind:"text",role:"text",severity:value,
    pixelDiffRatio:value/10,foregroundMissingRatio:value/20}));
  return { passed:false, checks:[{name:"quality-rendered",passed:true},{name:"visual-fidelity",passed:false}],
    metrics:{"pixel-diff-ratio":pixel,"foreground-missing-ratio":0.04,"mean-absolute-delta":12},
    componentWorst:rows, componentLocalMetrics:rows };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-weight-"));
  t.after(() => fs.rmSync(root, {recursive:true,force:true}));
  fs.mkdirSync(path.join(root,"assets"));
  const sourceFile = path.join(root,"assets/source.png"); fs.writeFileSync(sourceFile,"source");
  const texts = [0,1].map(i => ({id:`label-${i}`,text:`Label ${i}`,box:{x:20,y:20+i*40,w:80,h:20},
    font:{family:"Arial",sizePt:16,weight:"bold",align:"left",valign:"middle",color:"#222222"},
    style:{visibility:"visible",wrap:false},source:{editable:true,confidence:0.99}}));
  const deck = {version:"1.0",slideSize:{widthPt:200,heightPt:150},pages:[{pageIndex:0,textBoxes:texts,shapes:[],images:[]}]};
  const q = quality(); q.textWeightEvidence = texts.map(text => ({pageIndex:0,id:text.id,source:text.box,rendered:text.box,coverageRatio:0.5}));
  const dependencies = {validateDeck:validateDeckIr,auditSemantic:auditSemanticEditability,qualityRendered,
    qualityAcceptable:finalRefinementQualityAcceptable,maxPptxBytes:1000};
  const request = {root,baseline:{deck,quality:q,removed:1},sourceImages:[sourceFile],isCancellationRequested:async()=>false,
    runBuild:async ({pptxFile})=>fs.writeFileSync(pptxFile,"pptx"),rawImageQualityVerifier:async args=>{
      args.collectRenderedPages([sourceFile]); return quality(0.09,[1.5,1.5]);
    }};
  return {root,sourceFile,request,dependencies,refine:createNativeOnlyTextWeightRefiner(dependencies)};
}
test("native-only weight evidence renders once before accepting ordinary editable text changes", async t => {
  const f = fixture(t), original = structuredClone(f.request.baseline.deck);
  const result = await f.refine(f.request);
  assert.ok(result);
  assert.equal(result.quality.passed,false);
  assert.equal(result.removed,1);
  assert.ok(result.deck.pages[0].textBoxes.every(text=>text.font.weight==="regular"));
  assert.deepEqual(result.renderedImages,[f.sourceFile]);
  assert.deepEqual(f.request.baseline.deck,original);
  assert.equal(result.quality.metrics["native-only-text-weight-proposed-boxes"],2);
});
test("regressed text is restored as a whole object and unaffected gains get exactly one recheck", async t => {
  const f=fixture(t); let attempts=0;
  const result=await f.refine({...f.request,rawImageQualityVerifier:async args=>{
    attempts++; args.collectRenderedPages([f.sourceFile]);
    if(attempts===1) return quality(0.09,[2.5,1.5]);
    assert.deepEqual(args.deck.pages[0].textBoxes[0],f.request.baseline.deck.pages[0].textBoxes[0]);
    assert.equal(args.deck.pages[0].textBoxes[1].font.weight,"regular");
    return quality(0.09,[2,1.5]);
  }});
  assert.ok(result); assert.equal(attempts,2);
  assert.equal(result.quality.metrics["native-only-text-weight-rolled-back-boxes"],1);
});
test("all locally regressed weights reject without rendering the unchanged rollback", async t => {
  const f=fixture(t); let attempts=0;
  assert.equal(await f.refine({...f.request,rawImageQualityVerifier:async()=>{attempts++;return quality(0.09,[2.5,2.5]);}}),null);
  assert.equal(attempts,1); assert.deepEqual(fs.readdirSync(f.root),["assets"]);
});

test("invalid evidence and outside sources fail before building", async t => {
  const f=fixture(t); let builds=0;
  const runBuild=async()=>{builds++;};
  for(const evidence of [null,{},Array(20001).fill(null),[{pageIndex:-1}],[{pageIndex:1}],
    [{...f.request.baseline.quality.textWeightEvidence[0],coverageRatio:NaN}]])
    await assert.rejects(f.refine({...f.request,runBuild,baseline:{...f.request.baseline,quality:{...f.request.baseline.quality,textWeightEvidence:evidence}}}));
  for(const changes of [{sourceImages:[]},{sourceImages:[__filename]},{sourceImages:["relative"]},
    {sourceImages:[f.sourceFile,f.sourceFile]},{root:"relative"}]) await assert.rejects(f.refine({...f.request,...changes,runBuild}));
  assert.equal(builds,0);
});
test("unmeasured, empty, passing, rejected and unsafe candidates do not build", async t => {
  const f=fixture(t); let builds=0;
  const runBuild=async()=>{builds++;};
  for(const qualityChanges of [{textWeightEvidence:undefined},{textWeightEvidence:[]},{passed:true}])
    assert.equal(await f.refine({...f.request,runBuild,baseline:{...f.request.baseline,quality:{...f.request.baseline.quality,...qualityChanges}}}),null);
  assert.equal(await f.refine({...f.request,runBuild,baseline:{...f.request.baseline,rejected:true}}),null);
  const unsafe=createNativeOnlyTextWeightRefiner({...f.dependencies,auditSemantic:()=>({passed:false})});
  assert.equal(await unsafe({...f.request,runBuild}),null); assert.equal(builds,0);
});
test("failure and cancellation paths propagate and preserve unrelated workspace files", async t => {
  for(const stage of ["build","verify","cancel","empty","oversized"]){
    const f=fixture(t); fs.writeFileSync(path.join(f.root,"keep.json"),"keep"); let built=false;
    await assert.rejects(f.refine({...f.request,runBuild:async args=>{
      if(stage==="build") throw new Error("build failed");
      await f.request.runBuild(args); built=true;
      if(stage==="empty"||stage==="oversized")fs.writeFileSync(args.pptxFile,Buffer.alloc(stage==="empty"?0:1001));
    },rawImageQualityVerifier:async args=>{if(stage==="verify")throw new Error("verify failed");return f.request.rawImageQualityVerifier(args);},
    isCancellationRequested:async()=>stage==="cancel"&&built}),/failed|cancelled|artifact/u);
    assert.deepEqual(fs.readdirSync(f.root).sort(),["assets","keep.json"]);
  }
});
test("dependency and request boundaries are strict", async t => {
  const f=fixture(t);
  assert.throws(()=>createNativeOnlyTextWeightRefiner({...f.dependencies,maxPptxBytes:Infinity}),TypeError);
  assert.throws(()=>createNativeOnlyTextWeightRefiner({...f.dependencies,qualityAcceptable:null}),TypeError);
  for(const value of [null,{},[]]) await assert.rejects(f.refine(value),TypeError);
});

test("weight geometry uses fresh rendered evidence before deciding whether to restore text", async t => {
  const f=fixture(t); let attempts=0;
  const result=await f.refine({...f.request,rawImageQualityVerifier:async args=>{
    attempts++; args.collectRenderedPages([f.sourceFile]);
    if(attempts===1){
      const q=quality(0.09,[2.5,2.5]);
      q.textWeightEvidence=f.request.baseline.deck.pages[0].textBoxes.map(text=>({pageIndex:0,id:text.id,
        source:text.box,rendered:{...text.box,w:text.box.w/1.2,h:text.box.h/1.2},coverageRatio:0.5}));
      return q;
    }
    assert.ok(args.deck.pages[0].textBoxes.every(text=>text.font.sizePt>16));
    return quality(0.085,[1.5,1.5]);
  }});
  assert.ok(result); assert.equal(attempts,2);
  assert.equal(result.quality.metrics["native-only-text-weight-geometry-boxes"],2);
});

test("aggregate accepted quality still cannot hide increased local foreground loss", async t => {
  const f=fixture(t); let attempts=0;
  const result=await f.refine({...f.request,rawImageQualityVerifier:async args=>{
    attempts++; args.collectRenderedPages([f.sourceFile]);
    const q=quality(0.09,[1.5,1.5]);
    if(attempts===1) q.componentLocalMetrics[0].foregroundMissingRatio=0.15;
    else assert.equal(args.deck.pages[0].textBoxes[0].font.weight,"bold");
    return q;
  }});
  assert.ok(result); assert.equal(attempts,2);
  assert.equal(result.quality.metrics["native-only-text-weight-rolled-back-boxes"],1);
});

test("local foreground loss triggers fresh geometry even when whole-slide quality improved", async t => {
  const f = fixture(t); let renders = 0;
  const result = await f.refine({ ...f.request, rawImageQualityVerifier: async args => {
    renders++;
    args.collectRenderedPages([f.sourceFile]);
    const q = quality(0.09, [1.5, 1.5]);
    if (renders === 1) {
      q.componentLocalMetrics[0].foregroundMissingRatio = 0.15;
      q.textWeightEvidence = f.request.baseline.deck.pages[0].textBoxes.map(text => ({ pageIndex: 0, id: text.id,
        source: text.box, rendered: { ...text.box, w: text.box.w / 1.2, h: text.box.h / 1.2 }, coverageRatio: 0.5 }));
      assert.equal(finalRefinementQualityAcceptable({ baselineQuality: f.request.baseline.quality, candidateQuality: q }), true);
    } else {
      assert.ok(args.deck.pages[0].textBoxes.every(text => text.font.weight === "regular" && text.font.sizePt > 16));
    }
    return q;
  } });
  assert.ok(result);
  assert.equal(renders, 2);
  assert.equal(result.quality.metrics["native-only-text-weight-rolled-back-boxes"], 0);
  assert.equal(result.quality.metrics["native-only-text-weight-geometry-boxes"], 2);
});

test("rollback re-render cannot retain newly regressed text under a global gain", async t => {
  const f = fixture(t); let renders = 0;
  const result = await f.refine({ ...f.request, rawImageQualityVerifier: async args => {
    renders++;
    args.collectRenderedPages([f.sourceFile]);
    const q = quality(0.09, [1.5, 1.5]);
    q.componentLocalMetrics[renders === 1 ? 0 : 1].foregroundMissingRatio = 0.15;
    return q;
  } });
  assert.equal(result, null);
  assert.equal(renders, 2);
  assert.deepEqual(fs.readdirSync(f.root), ["assets"]);
});

test("both Worker paths compose geometry and weight before strict native adoption", () => {
  const source=fs.readFileSync(path.join(__dirname,"../packages/slideclone-worker-adapter/team-worker.js"),"utf8");
  const start=source.indexOf("async function refineNativeOnlyResidualCandidateText(request)");
  const end=source.indexOf("async function refineNativeOnlyResidualCandidateTextGeometry",start);
  assert.match(source.slice(start,end),/return refineNativeOnlyTextCandidate\(request\)/u);
  assert.match(source,/createNativeOnlyTextRefiner\(\{ refineGeometry: refineNativeOnlyResidualCandidateTextGeometry/u);
  const coordinator=fs.readFileSync(path.join(__dirname,"../packages/slideclone-worker-adapter/native-only-text-refinement.js"),"utf8");
  assert.match(coordinator,/await dependencies\.refineGeometry\(request\)[\s\S]+await refineWeight\(/u);
  assert.equal(source.match(/=> refineNativeOnlyResidualCandidateText\(\{/gu)?.length,2);
});
