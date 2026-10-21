"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyTextRefiner } = require("../packages/slideclone-worker-adapter/native-only-text-refinement");
const { validateDeckIr } = require("../packages/slideclone-core/deck-ir-admission");
const { auditSemanticEditability } = require("../packages/slideclone-core/semantic-editability-quality");
const { auditNativeComponentQuality } = require("../packages/slideclone-core/native-component-quality");
const { qualityRendered } = require("../packages/slideclone-core/team-native-rebuild");
const { includesSuite } = require("../scripts/test-suites");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-text-scene-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const source = path.join(root, "assets/source.png"); fs.writeFileSync(source, "source");
  const text = { id: "label", text: "Example", box: { x: 10, y: 10, w: 80, h: 20 },
    font: { family: "Arial", sizePt: 16, color: "#222222", weight: "bold", align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: .99 } };
  const deck = { version: "1.0", slideSize: { widthPt: 200, heightPt: 150 },
    pages: [{ pageIndex: 0, textBoxes: [text], shapes: [], images: [] }] };
  const quality = { passed: false, checks: [{ name: "quality-rendered", passed: true }],
    componentLocalMetrics: [{ pageIndex: 0, id: "label", kind: "text", role: "text", severity: 2, pixelDiffRatio: .2, foregroundMissingRatio: .1 }],
    metrics: { "pixel-diff-ratio": .13, "foreground-missing-ratio": .1, "mean-absolute-delta": 15 } };
  const calls = [];
  const dependencies = { validateDeck: validateDeckIr, auditSemantic: auditSemanticEditability, auditComponents: auditNativeComponentQuality, qualityRendered,
    qualityAcceptable: () => true, maxPptxBytes: 1000,
    refineGeometry: async request => { calls.push("geometry"); return request.nativeOnlyCandidate; } };
  const request = { root, sourceImages: [source], nativeOnlyCandidate: { deck, quality, renderedImages: [source],
    deckFile: path.join(root, "baseline.json"), pptxFile: path.join(root, "baseline.pptx") },
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => { calls.push("build"); fs.writeFileSync(pptxFile, "pptx"); },
    rawImageQualityVerifier: async args => { calls.push("render"); args.collectRenderedPages([source]);
      return { ...quality, metrics: { ...quality.metrics, "pixel-diff-ratio": .12 } }; },
    rawImageOwnedTextRefiner: async request => { calls.push("owned"); return request.baseline; } };
  return { root, source, text, deck, quality, request, dependencies, calls };
}
function unresolved(deck) {
  deck.pages[0].source = { sourceScene: { version: 1, unresolved: [{ id: "node", reason: "container-source-evidence" }] } };
}

test("unresolved source scenes allow rendered text repair while retaining the exact failing source evidence", async t => {
  const f = fixture(t); unresolved(f.deck);
  f.quality.textWeightEvidence = [{ pageIndex: 0, id: f.text.id, source: f.text.box, rendered: f.text.box, coverageRatio: .5 }];
  const frozen = structuredClone(f.request.nativeOnlyCandidate);
  const result = await createNativeOnlyTextRefiner(f.dependencies)(f.request);
  assert.deepEqual(f.calls, ["geometry", "build", "render", "owned"]);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "regular");
  assert.deepEqual(result.deck.pages[0].source, f.deck.pages[0].source);
  assert.equal(result.quality.passed, false); assert.equal(auditNativeComponentQuality(result.deck).passed, false);
  assert.equal(result.quality.metrics["native-only-text-weight-refinement-accepted"], 1);
  assert.deepEqual(f.request.nativeOnlyCandidate, frozen);
});

test("scene state is re-audited instead of trusting cached success or failure", async t => {
  const f = fixture(t); unresolved(f.deck);
  f.deck.meta = { nativeComponentQuality: { passed: true } };
  const refine = createNativeOnlyTextRefiner(f.dependencies);
  const first = await refine(f.request); assert.deepEqual(f.calls, ["geometry", "owned"]);
  assert.equal(auditNativeComponentQuality(first.deck).passed, false);
  f.calls.length = 0;
  f.deck.pages[0].source.sourceScene.unresolved = [];
  const result = await refine({ ...f.request, nativeOnlyCandidate: first });
  assert.deepEqual(f.calls, ["geometry", "owned"]); assert.equal(result.deck, f.deck);
});

test("complete and absent scenes retain geometry then weight then owned refinement", async t => {
  for (const hasScene of [false, true]) {
    const f = fixture(t);
    if (hasScene) f.deck.pages[0].source = { sourceScene: { version: 1, unresolved: [] } };
    f.quality.textWeightEvidence = [{ pageIndex: 0, id: f.text.id, source: f.text.box, rendered: f.text.box, coverageRatio: .5 }];
    const result = await createNativeOnlyTextRefiner(f.dependencies)(f.request);
    assert.deepEqual(f.calls, ["geometry", "build", "render", "owned"]);
    assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "regular");
    assert.equal(f.text.font.weight, "bold");
  }
});

test("unresolved reviewed graphics and unrelated component deficits retain their failures during text refinement", async t => {
  const f = fixture(t);
  f.deck.pages[0].source = { sourceSceneReviewedGraphics: { version: 1, sourceHash: "a".repeat(64), unresolvedReviewedGraphics: [0] } };
  const result = await createNativeOnlyTextRefiner(f.dependencies)(f.request);
  assert.deepEqual(result.deck.pages[0].source, f.deck.pages[0].source);
  assert.equal(auditNativeComponentQuality(result.deck).passed, false); assert.deepEqual(f.calls, ["geometry", "owned"]);
  f.calls.length = 0;
  delete f.deck.pages[0].source;
  f.deck.pages[0].shapes = [{ id: "primitive", type: "rect", box: { x: 100, y: 100, w: 10, h: 10 },
    style: { fill: "#000000" }, source: { componentQualityIgnore: true } }];
  assert.equal(auditNativeComponentQuality(f.deck).passed, false);
  await createNativeOnlyTextRefiner(f.dependencies)(f.request);
  assert.deepEqual(f.calls, ["geometry", "owned"]);
});

test("absent, rejected and rejected geometry preserve the original no-op behavior", async t => {
  const f = fixture(t), refine = createNativeOnlyTextRefiner(f.dependencies);
  for (const candidate of [null, undefined, { rejected: true }])
    assert.equal(await refine({ ...f.request, nativeOnlyCandidate: candidate }), candidate);
  for (const candidate of [null, undefined, { rejected: true }]) {
    const run = createNativeOnlyTextRefiner({ ...f.dependencies, refineGeometry: async () => candidate });
    assert.equal(await run(f.request), candidate);
  }
  assert.deepEqual(f.calls, []);
  delete f.request.rawImageOwnedTextRefiner;
  assert.equal(await refine(f.request), f.request.nativeOnlyCandidate);
  assert.deepEqual(f.calls, ["geometry"]);
});

test("cancellation and validation errors propagate before an invariant skip", async t => {
  const f = fixture(t); unresolved(f.deck); const refine = createNativeOnlyTextRefiner(f.dependencies);
  for (const value of [true, "false", null])
    await assert.rejects(refine({ ...f.request, isCancellationRequested: async () => value }));
  const failure = new Error("validation failed");
  await assert.rejects(createNativeOnlyTextRefiner({ ...f.dependencies, validateDeck: () => { throw failure; } })(f.request), error => error === failure);
  assert.deepEqual(f.calls, []);
});

test("malformed controls, extreme lists, accessors and proxies never execute caller code", async t => {
  const f = fixture(t); unresolved(f.deck); const refine = createNativeOnlyTextRefiner(f.dependencies);
  for (const patch of [{ root: "relative" }, { nativeOnlyCandidate: 1 }, { rawImageOwnedTextRefiner: true },
    { runBuild: null }, { sourceImages: [] }, { sourceImages: new Array(1) }, { sourceImages: ["relative"] },
    { sourceImages: Array(51).fill(f.source) }, { nativeOnlyCandidate: { ...f.request.nativeOnlyCandidate, quality: { metrics: [] } } }])
    await assert.rejects(refine({ ...f.request, ...patch }), TypeError);
  let invoked = 0;
  const accessor = { ...f.request }; Object.defineProperty(accessor, "nativeOnlyCandidate", { get() { invoked++; throw Error("secret"); } });
  const proxy = new Proxy(f.request, { get() { invoked++; throw Error("secret"); } });
  const sources = [f.source]; Object.defineProperty(sources, "0", { get() { invoked++; throw Error("secret"); } });
  for (const request of [accessor, proxy, { ...f.request, sourceImages: sources }])
    await assert.rejects(refine(request), error => error instanceof TypeError && !error.message.includes("secret"));
  assert.equal(invoked, 0); assert.deepEqual(f.calls, []);
  assert.throws(() => createNativeOnlyTextRefiner({ ...f.dependencies, refineGeometry: null }), TypeError);
});

test("geometry and owned provider failures are not converted into successful skips", async t => {
  const f = fixture(t), failure = new Error("provider failure");
  await assert.rejects(createNativeOnlyTextRefiner({ ...f.dependencies, refineGeometry: async () => { throw failure; } })(f.request), error => error === failure);
  await assert.rejects(createNativeOnlyTextRefiner(f.dependencies)({ ...f.request,
    rawImageOwnedTextRefiner: async () => { throw failure; } }), error => error === failure);
  await assert.rejects(createNativeOnlyTextRefiner({ ...f.dependencies, refineGeometry: async () => 1 })(f.request), TypeError);
});

test("independent refinement rejects cleared failures, graphics edits, source reassignment and changed wording", async t => {
  for (const stage of ["geometry", "owned"]) for (const tamper of ["clear", "graphic", "source", "content", "in-place"]) {
    const f = fixture(t); unresolved(f.deck);
    const unsafe = async request => {
      const baseline = stage === "geometry" ? request.nativeOnlyCandidate : request.baseline;
      const result = tamper === "in-place" ? baseline : structuredClone(baseline);
      if (tamper === "clear" || tamper === "in-place") result.deck.pages[0].source.sourceScene.unresolved = [];
      if (tamper === "graphic") result.deck.pages[0].shapes.push({ id: "new", type: "rect", box: { x: 1, y: 1, w: 1, h: 1 } });
      if (tamper === "source") result.deck.pages[0].textBoxes[0].source.confidence = 1;
      if (tamper === "content") result.deck.pages[0].textBoxes[0].text = "Replacement";
      return result;
    };
    const dependencies = stage === "geometry" ? { ...f.dependencies, refineGeometry: unsafe } : f.dependencies;
    const request = stage === "owned" ? { ...f.request, rawImageOwnedTextRefiner: unsafe } : f.request;
    await assert.rejects(createNativeOnlyTextRefiner(dependencies)(request), TypeError);
  }
});

test("a new structural failure is rejected even when the existing scene already fails", async t => {
  const f = fixture(t); unresolved(f.deck); let calls = 0;
  const auditComponents = () => ({ checks: [{ name: "source-scene-completion", passed: false },
    { name: "text-integrity", passed: ++calls === 1 }] });
  await assert.rejects(createNativeOnlyTextRefiner({ ...f.dependencies, auditComponents })(f.request), /structural/u);
  assert.deepEqual(f.calls, ["geometry"]);
});

test("a rejected or empty provider result cannot conceal in-place erasure of source failures", async t => {
  for (const result of [null,undefined,{rejected:true}]) {
    const f=fixture(t);unresolved(f.deck);
    const refineGeometry=async()=>{f.deck.pages[0].source.sourceScene.unresolved=[];return result;};
    await assert.rejects(createNativeOnlyTextRefiner({...f.dependencies,refineGeometry})(f.request),/source authority/u);
  }
});

test("native text scene regressions are discovered by the unified unit and all suites", () => {
  for (const suite of ["unit", "all"]) assert.equal(includesSuite(__filename, suite), true);
});
