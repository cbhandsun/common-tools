"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyStrokeRefiner } = require("../packages/slideclone-worker-adapter/native-only-stroke-refinement");
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "native-strokes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.png"); fs.writeFileSync(source, "source");
  const quality = pdr => ({ passed: pdr <= 0.08, metrics: { "pixel-diff-ratio": pdr } });
  const baseline = { deck: { native: true }, quality: quality(0.085), deckFile: "original.json", pptxFile: "original.pptx",
    ownedTextTargetHistory: [{ pageIndex: 0, id: "text", textRevision: "a".repeat(64), sourceHash: "b".repeat(64) }] };
  let builds = 0;
  const dependencies = { fit: (deck, options) => ({ deck: { ...deck, multiplier: options.strokeWidthMultiplier }, candidateShapes: 6, changedShapes: 1 }),
    priorityIds: () => new Map(), strokeWidthMultipliers: () => [0.86, 0.75, 0.66, 0.58], candidateLimits: () => [1, 2, 3, 4, 5, 6],
    validateDeck: () => {}, qualityAcceptable: ({ baselineQuality, candidateQuality }) => candidateQuality.metrics["pixel-diff-ratio"] <= baselineQuality.metrics["pixel-diff-ratio"],
    hasMeasuredGain: (before, after) => after.metrics["pixel-diff-ratio"] < before.metrics["pixel-diff-ratio"] };
  const request = { root, sourceImages: [source], baseline, isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => { builds++; fs.writeFileSync(pptxFile, "pptx"); },
    rawImageQualityVerifier: async ({ collectRenderedPages }) => { collectRenderedPages([source]); return quality(0.079); } };
  return { dependencies, request, quality, builds: () => builds };
}
test("native shadow strokes stop at a passing measured gain, retaining fresh renders and text history", async t => {
  const f = setup(t), before = structuredClone(f.request.baseline);
  const result = await createNativeOnlyStrokeRefiner(f.dependencies)(f.request);
  assert.equal(result.quality.passed, true); assert.equal(f.builds(), 1);
  assert.deepEqual(result.renderedImages, f.request.sourceImages);
  assert.deepEqual(result.ownedTextTargetHistory, before.ownedTextTargetHistory);
  assert.deepEqual(f.request.baseline, before);
  assert.equal(fs.existsSync(result.deckFile), true); assert.equal(fs.existsSync(result.pptxFile), true);
});
test("no-gain and rejected plans preserve baseline, clean artifacts and remain bounded by existing 4x6 plans", async t => {
  const f = setup(t);
  f.request.rawImageQualityVerifier = async ({ collectRenderedPages }) => { collectRenderedPages(f.request.sourceImages); return f.quality(0.09); };
  assert.equal(await createNativeOnlyStrokeRefiner(f.dependencies)(f.request), f.request.baseline);
  assert.equal(f.builds(), 24); assert.deepEqual(fs.readdirSync(f.request.root), ["source.png"]);
  f.dependencies.fit = deck => ({ deck, candidateShapes: 0, changedShapes: 0 });
  assert.equal(await createNativeOnlyStrokeRefiner(f.dependencies)(f.request), f.request.baseline);
  assert.equal(f.builds(), 24);
});
test("unsafe plans, malformed fits and contradictory quality decisions fail closed", async t => {
  for (const mode of ["sparse", "duplicate", "oversized", "nonfinite", "fractional", "bad-fit", "bad-decision"]) {
    const f = setup(t);
    if (mode === "sparse") f.dependencies.strokeWidthMultipliers = () => new Array(1);
    if (mode === "duplicate") f.dependencies.strokeWidthMultipliers = () => [0.75, 0.75];
    if (mode === "oversized") f.dependencies.candidateLimits = () => [1, 2, 3, 4, 5, 6, 7];
    if (mode === "nonfinite") f.dependencies.strokeWidthMultipliers = () => [NaN];
    if (mode === "fractional") f.dependencies.candidateLimits = () => [0.5];
    if (mode === "bad-fit") f.dependencies.fit = deck => ({ deck, candidateShapes: 0, changedShapes: 1 });
    if (mode === "bad-decision") f.dependencies.qualityAcceptable = () => "true";
    await assert.rejects(createNativeOnlyStrokeRefiner(f.dependencies)(f.request), TypeError);
    assert.deepEqual(fs.readdirSync(f.request.root), ["source.png"]);
  }
});
test("provider failure, cancellation, source mutation and invalid artifacts propagate with scoped cleanup", async t => {
  for (const mode of ["provider", "cancel", "source", "artifact", "missing-renders", "invalid-cancel"]) {
    const f = setup(t), failure = new Error("provider failed"); let cancelled = false;
    f.request.isCancellationRequested = async () => mode === "invalid-cancel" ? "false" : cancelled;
    f.request.runBuild = async ({ pptxFile }) => {
      if (mode === "provider") throw failure;
      if (mode !== "artifact") fs.writeFileSync(pptxFile, "pptx");
      if (mode === "cancel") cancelled = true;
      if (mode === "source") fs.writeFileSync(f.request.sourceImages[0], "changed");
    };
    if (mode === "missing-renders") f.request.rawImageQualityVerifier = async () => f.quality(0.079);
    await assert.rejects(createNativeOnlyStrokeRefiner(f.dependencies)(f.request));
    assert.deepEqual(fs.readdirSync(f.request.root), ["source.png"]);
  }
});
test("requests, dependencies and render accessors are rejected without invoking getters", async t => {
  const f = setup(t); let called = false;
  const accessor = { ...f.request, get baseline() { called = true; return f.request.baseline; } };
  await assert.rejects(createNativeOnlyStrokeRefiner(f.dependencies)(accessor)); assert.equal(called, false);
  assert.throws(() => createNativeOnlyStrokeRefiner({ ...f.dependencies, fit: null }));
  f.request.rawImageQualityVerifier = async ({ collectRenderedPages }) => {
    const pages = [];
    Object.defineProperty(pages, "0", { get() { called = true; return f.request.sourceImages[0]; } });
    collectRenderedPages(pages); return f.quality(0.079);
  };
  await assert.rejects(createNativeOnlyStrokeRefiner(f.dependencies)(f.request)); assert.equal(called, false);
  f.request.rawImageQualityVerifier = async ({ collectRenderedPages }) => {
    const pages = [...f.request.sourceImages];
    pages.slice = () => { called = true; throw new Error("unexpected"); };
    collectRenderedPages(pages); return f.quality(0.079);
  };
  assert.equal((await createNativeOnlyStrokeRefiner(f.dependencies)(f.request)).quality.passed, true);
  assert.equal(called, false);
});
