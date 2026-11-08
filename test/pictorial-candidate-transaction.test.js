"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), os = require("node:os");
const { writePng } = require("../packages/slideclone-core/png");
const { tryBuildNativeOnlyPictorialIconCandidate: build } = require("../packages/slideclone-worker-adapter/team-worker");
const { createPictorialCandidateBuilder: create } = require("../packages/slideclone-worker-adapter/pictorial-candidate-transaction");

function quality(pdr, passed) {
  return { passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }],
    metrics: { "pixel-diff-ratio": pdr, "foreground-missing-ratio": 0.03, "mean-absolute-delta": 10 } };
}
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pictorial-transaction-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "assets"));
  const icon = { width: 20, height: 20, rgba: Buffer.alloc(1600, 0) };
  for (let y = 3; y < 17; y++) for (let x = 3; x < 17; x++) {
    const i = (y * 20 + x) * 4;
    icon.rgba[i] = 36; icon.rgba[i + 1] = 106; icon.rgba[i + 2] = 215; icon.rgba[i + 3] = 255;
  }
  writePng(path.join(root, "assets/icon.png"), icon);
  const deck = { version: "1.0", slideSize: { widthPt: 100, heightPt: 100 }, pages: [{ pageIndex: 0, shapes: [],
    textBoxes: [{ id: "label", text: "Changed label", box: { x: 5, y: 5, w: 10, h: 8 },
      font: { family: "Arial", sizePt: 8, color: "#111111" }, source: { editable: true, nativeRebuild: true } }],
    images: [{ id: "icon", type: "fidelity-crop", assetPath: "assets/icon.png", box: { x: 20, y: 20, w: 20, h: 20 },
      source: { detector: "knowledge-graph-semantic-icon-crop", protectedMinimumUnit: true,
        expressionForm: "icon-or-illustration", intentionalMinimumUnitCrop: true } }] }] };
  const deckFile = path.join(root, "baseline.json"), pptxFile = path.join(root, "baseline.pptx");
  fs.writeFileSync(deckFile, JSON.stringify(deck)); fs.writeFileSync(pptxFile, "baseline");
  const baseline = { deck, deckFile, pptxFile, quality: quality(0.07999, true) };
  const request = { root, baseline, sourceImages: [path.join(root, "assets/icon.png")],
    isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile: output }) => fs.writeFileSync(output, "candidate"),
    rawImageQualityVerifier: async () => quality(0.08001, false) };
  return { root, baseline, request, original: JSON.stringify(deck) };
}
function assertPreserved(f) {
  assert.equal(JSON.stringify(f.baseline.deck), f.original);
  assert.equal(fs.readFileSync(f.baseline.deckFile, "utf8"), f.original);
  assert.equal(fs.readFileSync(f.baseline.pptxFile, "utf8"), "baseline");
  assert.deepEqual(fs.readdirSync(f.root).filter(name => name.startsWith("native-only-pictorial-icons-")), []);
}

test("accepted pictorial candidate annotates a copy of the immutable verifier report", async t => {
  const f = fixture(t);
  const report = quality(0.07, true);
  Object.freeze(report.metrics);
  for (const check of report.checks) Object.freeze(check);
  Object.freeze(report.checks);
  Object.freeze(report);
  f.request.rawImageQualityVerifier = async () => report;
  const result = await build(f.request);
  assert.ok(result);
  assert.notEqual(result.quality, report);
  assert.notEqual(result.quality.metrics, report.metrics);
  assert.equal(result.quality.metrics["native-only-pictorial-icons-accepted"], 1);
  assert.equal(result.quality.metrics["pixel-diff-ratio"], 0.07);
  assert.equal(result.quality.passed, true);
  assert.equal(Object.hasOwn(report.metrics, "native-only-pictorial-icons-accepted"), false);
  assert.equal(JSON.stringify(f.baseline.deck), f.original);
  assert.ok(fs.existsSync(result.pptxFile));
});

test("passed baseline rejects a failed candidate inside the material non-regression tolerance", async t => {
  const f = fixture(t);
  assert.equal(await build(f.request), null);
  assert.equal(f.baseline.quality.metrics["native-only-pictorial-icons-passed-gate-regressed"], 1);
  assertPreserved(f);
});
test("accepted candidate retains its artifacts and rendered-page feedback", async t => {
  const f = fixture(t);
  f.request.rawImageQualityVerifier = async ({ collectRenderedPages }) => {
    collectRenderedPages([path.join(f.root, "render.png")]); return quality(0.0799, true);
  };
  const candidate = await build(f.request);
  assert.ok(candidate); assert.ok(fs.existsSync(candidate.deckFile)); assert.ok(fs.existsSync(candidate.pptxFile));
  assert.deepEqual(candidate.renderedImages, [path.join(f.root, "render.png")]);
  assert.equal(candidate.quality.metrics["native-only-pictorial-icons-accepted"], 1);
  assert.equal(JSON.stringify(f.baseline.deck), f.original);
});
test("failed baseline can retain a diagnostic candidate under the existing policy", async t => {
  const f = fixture(t); f.baseline.quality = quality(0.1, false);
  f.request.rawImageQualityVerifier = async () => quality(0.1001, false);
  assert.ok(await build(f.request));
});
for (const stage of ["build", "verify", "cancel-after-build", "cancel-after-verify"]) {
  test(`candidate artifacts are removed after ${stage} and errors remain visible`, async t => {
    const f = fixture(t);
    if (stage === "build") f.request.runBuild = async ({ pptxFile }) => {
      fs.writeFileSync(pptxFile, "partial"); throw new Error("build failed");
    };
    if (stage === "verify") f.request.rawImageQualityVerifier = async () => { throw new Error("verify failed"); };
    if (stage.startsWith("cancel-")) {
      let calls = 0; f.request.isCancellationRequested = async () => ++calls >= (stage === "cancel-after-build" ? 2 : 3);
      f.request.rawImageQualityVerifier = async () => quality(0.0799, true);
    }
    await assert.rejects(build(f.request), /failed|cancelled/u);
    assertPreserved(f);
  });
}

test("empty proposals perform no build and malformed boundaries fail safely", async t => {
  const f = fixture(t), dependencies = { replace: () => null, validateDeck: () => {}, semanticChecksPass: () => true,
    doesNotRegress: () => true, raster: () => ({ passed: true }) };
  f.request.runBuild = async () => { assert.fail("unexpected build"); };
  assert.equal(await create(dependencies)(f.request), null);
  let getters = 0; const hostile = {};
  Object.defineProperty(hostile, "root", { get() { getters++; return f.root; } });
  for (const input of [null, [], hostile, new Proxy(f.request, {}), { ...f.request, root: "relative" },
    { ...f.request, sourceImages: [] }, { ...f.request, sourceImages: Array(21).fill(f.baseline.pptxFile) }]) {
    await assert.rejects(create(dependencies)(input), /invalid/u);
  }
  assert.equal(getters, 0); assertPreserved(f);
  assert.throws(() => create({}), /dependencies/u);
});
test("invalid replacement and cancellation state cannot reach publication", async t => {
  const f = fixture(t);
  const dependencies = { replace: () => ({ deck: {}, vectorizedImages: Infinity, nativeShapes: 1 }),
    validateDeck: () => {}, semanticChecksPass: () => true, doesNotRegress: () => true, raster: () => ({}) };
  await assert.rejects(create(dependencies)(f.request), /replacement/u);
  f.request.isCancellationRequested = async () => "false";
  await assert.rejects(build(f.request), /cancellation state/u);
  assertPreserved(f);
});
test("malformed rendered feedback is rejected with transaction cleanup", async t => {
  const f = fixture(t);
  f.request.rawImageQualityVerifier = async ({ collectRenderedPages }) => {
    collectRenderedPages(["relative.png"]); return quality(0.0799, true);
  };
  await assert.rejects(build(f.request), /rendered pages/u); assertPreserved(f);
});
test("invalid native IR and failed semantic audit retain the baseline", async t => {
  for (const kind of ["ir", "semantic"]) {
    const f = fixture(t), dependencies = { replace: () => ({ deck: f.baseline.deck, vectorizedImages: 1, nativeShapes: 1 }),
      validateDeck: () => { if (kind === "ir") throw new Error("private content"); },
      semanticChecksPass: () => false, doesNotRegress: () => true, raster: () => ({}) };
    f.request.rawImageQualityVerifier = async () => quality(0.0799, true);
    assert.equal(await create(dependencies)(f.request), null);
    assert.equal(f.baseline.quality.metrics[kind === "ir" ? "native-only-pictorial-icons-invalid-deck" : "native-only-pictorial-icons-semantic-rejected"], 1);
    assert.ok(!JSON.stringify(f.baseline.quality).includes("private content")); assertPreserved(f);
  }
});
test("new transaction and grid regressions enter the unified CI suites", () => {
  const { classifyTestFile } = require("../scripts/test-suites");
  const { IMAGE_EDITABLE_RELEASE_FILES } = require("../scripts/verify-runtime-package");
  for (const file of ["pictorial-candidate-transaction.test.js", "grid-cell-background-ownership.test.js"]) assert.equal(classifyTestFile(file), "unit");
  assert.ok(IMAGE_EDITABLE_RELEASE_FILES.includes("packages/slideclone-worker-adapter/pictorial-candidate-transaction.js"));
});
