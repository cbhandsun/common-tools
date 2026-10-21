"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProvisionalNativeSearch } = require("../packages/slideclone-worker-adapter/provisional-native-search");
const { hasMeasuredVisualGain, assessStrictNativeCandidate } = require("../packages/slideclone-worker-adapter/candidate-quality-policy");
const { createProgressiveOwnedTextRefiner } = require("../packages/slideclone-worker-adapter/progressive-owned-text-refinement");
const { ownedTextTargetWindow } = require("../packages/slideclone-core/owned-text-target-window");
function candidate(pdr, reasons) {
  return { deck: { native: true }, deckFile: `deck-${pdr}.json`, pptxFile: `deck-${pdr}.pptx`, renderedImages: [`render-${pdr}.png`],
    quality: { passed: pdr <= 0.08, reasons, metrics: { "pixel-diff-ratio": pdr, "foreground-missing-ratio": pdr / 3, "mean-absolute-delta": pdr * 100 } } };
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-search-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, "source.png"); fs.writeFileSync(file, "source");
  const original = candidate(0.0855);
  const request = { root, sourceImages: [file], candidate: original, baselineQuality: candidate(0.0963).quality,
    isCancellationRequested: async () => false, refineOwnedTexts: async () => candidate(0.0798) };
  const dependencies = { hasMeasuredGain: hasMeasuredVisualGain, qualityAcceptable: () => true,
    assess: ({ candidateQuality }) => ({ passed: candidateQuality.passed && !candidateQuality.reasons?.length,
      reasons: candidateQuality.reasons || (candidateQuality.passed ? [] : ["visual-fidelity"]) }) };
  return { request, dependencies, original };
}
test("native search continues on shadow artifacts and returns only a strict-passing candidate for publication", async t => {
  const f = setup(t), original = structuredClone(f.original), seen = [];
  f.request.refineOwnedTexts = async input => {
    seen.push(input.baseline);
    assert.deepEqual(f.original, original);
    return candidate(seen.length === 1 ? 0.082 : 0.0798);
  };
  const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
  assert.equal(result.quality.passed, true); assert.equal(result.quality.metrics["pixel-diff-ratio"], 0.0798);
  assert.equal(seen.length, 2); assert.equal(seen[0], f.original);
  assert.deepEqual(seen[1].renderedImages, ["render-0.082.png"]);
  assert.deepEqual(f.original, original);
});
test("only visual deficits may enter provisional search", async t => {
  for (const reasons of [["large-raster"], ["semantic-editability"], ["native-component-quality"], [], ["unknown"],
    ["visual-fidelity", "large-raster"], ["quality-not-rendered"]]) {
    const f = setup(t); f.original.quality.reasons = reasons;
    f.request.refineOwnedTexts = async () => { throw new Error("unexpected"); };
    assert.equal(await createProvisionalNativeSearch(f.dependencies)(f.request), f.original);
  }
});

test("absolute visual success does not stop repair of a strict visual regression", async t => {
  for (const reasons of [["visual-regressed"], ["visual-fidelity", "visual-regressed"]]) {
    const f = setup(t); let calls = 0;
    f.request.candidate = candidate(0.079, reasons);
    f.request.refineOwnedTexts = async input => {
      calls++; assert.equal(input.strictRecovery, true);
      return candidate(0.078, ["visual-regressed"]);
    };
    const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
    assert.equal(calls, 2);
    assert.deepEqual(result.quality.reasons, ["visual-regressed"]);
    assert.equal(f.dependencies.assess({ candidateQuality: result.quality }).passed, false);
    assert.equal(result.quality.metrics["pixel-diff-ratio"], 0.078);
  }
});

test("strict recovery retains the last native candidate after a local regression or structural failure", async t => {
  for (const mode of ["local", "semantic", "source", "no-gain"]) {
    const f = setup(t); f.request.candidate = candidate(0.079, ["visual-regressed"]);
    if (mode === "local") f.dependencies.qualityAcceptable = () => false;
    f.request.refineOwnedTexts = async () => {
      if (mode === "source") fs.writeFileSync(f.request.sourceImages[0], "drift");
      return candidate(mode === "no-gain" ? 0.079 : 0.078, mode === "semantic" ? ["semantic-editability"] : ["visual-regressed"]);
    };
    if (mode === "source") await assert.rejects(createProvisionalNativeSearch(f.dependencies)(f.request), /source changed/u);
    else assert.equal(await createProvisionalNativeSearch(f.dependencies)(f.request), f.request.candidate);
  }
});

test("real strict policy requires recovery against the original reference after an absolute pass", async t => {
  const f = setup(t), deck = { slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ shapes: [], images: [], textBoxes: [] }] };
  const measured = (pdr, missing, mad) => ({ passed: true,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: true }],
    metrics: { "pixel-diff-ratio": pdr, "foreground-missing-ratio": missing, "mean-absolute-delta": mad } });
  f.request.baselineQuality = measured(0.072, 0.019, 11.09);
  f.request.candidate = { ...candidate(0.070), deck, quality: measured(0.070, 0.027, 11.51) };
  f.dependencies.assess = assessStrictNativeCandidate;
  f.dependencies.qualityAcceptable = ({ baselineQuality, candidateQuality }) => Object.keys(baselineQuality.metrics)
    .every(key => candidateQuality.metrics[key] <= baselineQuality.metrics[key]);
  let calls = 0;
  f.request.refineOwnedTexts = async input => {
    assert.equal(input.strictRecovery, true); calls++;
    return { ...input.baseline, quality: calls === 1 ? measured(0.0699, 0.025, 11.48) : measured(0.0698, 0.018, 11.08) };
  };
  assert.deepEqual(assessStrictNativeCandidate({ baselineQuality: f.request.baselineQuality,
    candidateQuality: f.request.candidate.quality, candidateDeck: deck }).reasons, ["visual-regressed"]);
  const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
  assert.equal(calls, 2);
  assert.equal(assessStrictNativeCandidate({ baselineQuality: f.request.baselineQuality,
    candidateQuality: result.quality, candidateDeck: result.deck }).passed, true);
  assert.equal(f.request.baselineQuality.metrics["foreground-missing-ratio"], 0.019);
});
test("passed, rejected, absent and disabled candidates do not restart the search", async t => {
  const f = setup(t), refine = createProvisionalNativeSearch(f.dependencies);
  f.request.refineOwnedTexts = async () => { throw new Error("unexpected"); };
  for (const value of [null, undefined, { ...candidate(0.079), rejected: true }, candidate(0.079)]) {
    assert.equal(await refine({ ...f.request, candidate: value }), value);
  }
  assert.equal(await refine({ ...f.request, refineOwnedTexts: undefined }), f.original);
});
test("a failing but improving search stays bounded and is never labeled as publishable", async t => {
  const f = setup(t); let calls = 0;
  f.request.refineOwnedTexts = async () => { calls++; return candidate(calls === 1 ? 0.084 : 0.083); };
  const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
  assert.equal(calls, 2); assert.equal(result.quality.passed, false);
});
test("regression, invalid native structures and no gain preserve the last safe search baseline", async t => {
  for (const value of [candidate(0.0855), candidate(0.09), candidate(0.079, ["large-raster"]), { ...candidate(0.079), rejected: true }]) {
    const f = setup(t); f.request.refineOwnedTexts = async () => value;
    assert.equal(await createProvisionalNativeSearch(f.dependencies)(f.request), f.original);
  }
  const f = setup(t); f.dependencies.qualityAcceptable = () => false;
  assert.equal(await createProvisionalNativeSearch(f.dependencies)(f.request), f.original);
});
test("source drift, cancellation and provider errors propagate without publication", async t => {
  for (const mode of ["source", "cancel", "provider", "invalid-cancel"]) {
    const f = setup(t), failure = new Error("provider failed"); let cancelled = false;
    f.request.isCancellationRequested = async () => mode === "invalid-cancel" ? "false" : cancelled;
    f.request.refineOwnedTexts = async () => {
      if (mode === "provider") throw failure;
      if (mode === "source") fs.writeFileSync(f.request.sourceImages[0], "changed");
      if (mode === "cancel") cancelled = true;
      return candidate(0.0798);
    };
    await assert.rejects(createProvisionalNativeSearch(f.dependencies)(f.request));
    assert.equal(f.original.quality.passed, false);
  }
});
test("malformed, accessor and contradictory policies fail closed", async t => {
  const f = setup(t);
  for (const policy of [{ passed: "true", reasons: [] }, { passed: true, reasons: ["large-raster"] },
    { passed: false, reasons: new Array(1) }, { passed: false, reasons: [null] }]) {
    await assert.rejects(createProvisionalNativeSearch({ ...f.dependencies, assess: () => policy })(f.request));
  }
  let executed = false;
  const accessor = { ...f.request, get candidate() { executed = true; return f.original; } };
  await assert.rejects(createProvisionalNativeSearch(f.dependencies)(accessor)); assert.equal(executed, false);
  await assert.rejects(createProvisionalNativeSearch({ ...f.dependencies, hasMeasuredGain: () => "true" })(f.request));
  await assert.rejects(createProvisionalNativeSearch({ ...f.dependencies, qualityAcceptable: () => "true" })(f.request));
  assert.throws(() => createProvisionalNativeSearch({ ...f.dependencies, assess: null }));
});

test("combined initial and shadow windows never repeat an unchanged revision before later targets", async t => {
  const f = setup(t);
  const ranked = Array.from({ length: 28 }, (_, index) => ({ pageIndex: 0, id: `text-${index}`,
    textRevision: "a".repeat(64), sourceHash: "b".repeat(64) }));
  const seen = [];
  const progressive = createProgressiveOwnedTextRefiner(async (input, history, collect) => {
    const selected = ownedTextTargetWindow(ranked, history);
    collect(selected); seen.push(...selected.map(item => item.id));
    if (history.length < 12) return input.baseline;
    return candidate(history.length >= 24 ? 0.0798 : 0.084 - (history.length - 12) / 4000);
  });
  const initial = await progressive({ ...f.request, baseline: f.original });
  assert.equal(initial.quality.passed, false);
  assert.equal(initial.ownedTextTargetHistory.length, 12);
  const result = await createProvisionalNativeSearch(f.dependencies)({ ...f.request,
    candidate: initial, refineOwnedTexts: progressive });
  assert.equal(result.quality.passed, true);
  assert.deepEqual(seen, ranked.map(item => item.id));
  assert.equal(result.ownedTextTargetHistory.length, 28);
  assert.deepEqual(f.original, candidate(0.0855));
});

test("a complete no-gain shadow pass preserves attempts and continues with the later target", async t => {
  const f = setup(t), ranked = Array.from({ length: 28 }, (_, index) => ({ pageIndex: 0, id: `text-${index}`,
    textRevision: "a".repeat(64), sourceHash: "b".repeat(64) }));
  const seen = [];
  const progressive = createProgressiveOwnedTextRefiner(async (input, history, collect) => {
    const selected = ownedTextTargetWindow(ranked, history);
    collect(selected); seen.push(...selected.map(item => item.id));
    return history.length < 24 ? input.baseline : candidate(0.0798);
  });
  const initial = await progressive({ ...f.request, baseline: f.original });
  const result = await createProvisionalNativeSearch(f.dependencies)({ ...f.request, candidate: initial,
    refineOwnedTexts: progressive });
  assert.equal(result.quality.passed, true);
  assert.equal(result.ownedTextTargetHistory.length, 28);
  assert.deepEqual(seen, ranked.map(item => item.id));
  assert.equal(initial.ownedTextTargetHistory.length, 12);
});

test("a rejected artifact cannot replace best but valid attempt history survives within the bound", async t => {
  const f = setup(t), entry = { pageIndex: 0, id: "text-0", textRevision: "a".repeat(64), sourceHash: "b".repeat(64) };
  f.original.ownedTextTargetHistory = [entry];
  f.request.refineOwnedTexts = async () => ({ ...candidate(0.09), rejected: true,
    ownedTextTargetHistory: [entry, { ...entry, id: "text-1" }] });
  const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
  assert.equal(result.deckFile, f.original.deckFile);
  assert.equal(result.quality, f.original.quality);
  assert.equal(result.ownedTextTargetHistory.length, 2);
  assert.equal(f.original.ownedTextTargetHistory.length, 1);
});

test("shadow history cannot disappear, rewrite earlier attempts, duplicate revisions or exceed the budget", async t => {
  const f = setup(t), entry = { pageIndex: 0, id: "text-0", textRevision: "a".repeat(64), sourceHash: "b".repeat(64) };
  f.original.ownedTextTargetHistory = [entry];
  for (const history of [undefined, [], [{ ...entry, sourceHash: "c".repeat(64) }], [entry, entry],
    Array.from({ length: 37 }, (_, index) => ({ ...entry, id: `text-${index}` })), new Array(1)]) {
    f.request.refineOwnedTexts = async () => ({ ...candidate(0.0798), ownedTextTargetHistory: history });
    await assert.rejects(createProvisionalNativeSearch(f.dependencies)(f.request), TypeError);
  }
});

test("native stroke search resumes from the best text candidate and still obeys strict publication admission", async t => {
  for (const reason of [undefined, ["large-raster"], ["semantic-editability"]]) {
    const f = setup(t); let strokes = 0;
    f.request.refineOwnedTexts = async () => candidate(0.082);
    f.request.refineNativeStrokes = async input => {
      strokes++;
      assert.equal(input.baseline.quality.metrics["pixel-diff-ratio"], 0.082);
      return candidate(0.0798, reason);
    };
    const result = await createProvisionalNativeSearch(f.dependencies)(f.request);
    assert.equal(strokes, 1);
    assert.equal(result.quality.passed, reason === undefined);
    assert.equal(result.quality.metrics["pixel-diff-ratio"], reason === undefined ? 0.0798 : 0.082);
  }
});

test("shape-only search handles disabled text fitting but refuses invalid callbacks and source drift", async t => {
  const f = setup(t);
  const refine = createProvisionalNativeSearch(f.dependencies);
  const request = { ...f.request, refineOwnedTexts: undefined, refineNativeStrokes: async () => candidate(0.0798) };
  assert.equal((await refine(request)).quality.passed, true);
  await assert.rejects(refine({ ...request, refineNativeStrokes: null }), TypeError);
  await assert.rejects(refine({ ...request, refineNativeStrokes: async () => {
    fs.writeFileSync(request.sourceImages[0], "changed"); return candidate(0.0798);
  } }), /source changed/u);
});
