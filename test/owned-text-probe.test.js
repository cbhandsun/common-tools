"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { writePng } = require("../packages/slideclone-core/png");
const { createOwnedTextProbe } = require("../packages/slideclone-core/owned-text-probe");
const { textProbeRevision } = require("../packages/slideclone-core/owned-text-advance");

function image(left = 80, width = 80) {
  const rgba = Buffer.alloc(400 * 200 * 4, 255);
  for (let y = 80; y < 100; y++) for (let x = left; x < left + width; x++) {
    const offset = (y * 400 + x) * 4;
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = 0;
  }
  return { width: 400, height: 200, rgba };
}
function setup(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-probe-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceImage = path.join(root, "source.png"); writePng(sourceImage, image());
  const text = { id: "label", text: "Native text", role: "body", box: { x: 35, y: 35, w: 50, h: 20 },
    font: { family: "Arial", sizePt: 12, weight: "regular", color: "#000000" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.99, ocrProvider: "fixture",
      evidenceBox: { x: 35, y: 35, w: 50, h: 20 } } };
  const page = { pageIndex: 0, source: { ocrProvider: "fixture", sourceIdentity: "retained" },
    textBoxes: [text], shapes: [{ id: "unrelated" }], images: [], tables: [], charts: [] };
  const deck = { version: "1.0", slideSize: { widthPt: 200, heightPt: 100 }, pages: [page] };
  let builds = 0, renders = 0, builtDeck;
  const request = { root, deck, pageIndex: 0, sourceImage,
    sourceHash: crypto.createHash("sha256").update(fs.readFileSync(sourceImage)).digest("hex"),
    targetIds: ["label"], isCancellationRequested: async () => false,
    buildCandidate: async ({ deckFile, pptxFile }) => { builds++; builtDeck = JSON.parse(fs.readFileSync(deckFile)); fs.writeFileSync(pptxFile, "pptx"); } };
  const dependencies = { validateDeck: () => {}, describeRenderer: async () => ({ rendererId: "render-libreoffice", version: "test", dpi: 144, runtimeHash: "a".repeat(64) }),
    renderPresentation: async (_input, context) => {
      renders++; const file = path.join(context.outputDir, "page.png"); writePng(file, image(82, 100));
      return { ok: true, data: { provider: "render-libreoffice", renderedPages: [{ image: file }] } };
    } };
  return { request, dependencies, text, page, counts: () => ({ builds, renders }), built: () => builtDeck };
}
function cleaned(request) { assert.deepEqual(fs.readdirSync(request.root), ["source.png"]); }

test("source preflight admits real measurements without rendering and remains source-bound", async t => {
  const f = setup(t), probe = createOwnedTextProbe(f.dependencies);
  const request = { root: f.request.root, deck: f.request.deck, sourceFiles: [f.request.sourceImage],
    sourceHashes: [f.request.sourceHash], isCancellationRequested: async () => false };
  assert.deepEqual(await probe.prepareTargets(request), [{ pageIndex: 0, ids: ["label"] }]);
  assert.deepEqual(f.counts(), { builds: 0, renders: 0 });
  assert.equal((await probe(f.request)).measurements.length, 1);
  writePng(f.request.sourceImage, image(60));
  await assert.rejects(probe(f.request), /source changed/u);
  await assert.rejects(probe.prepareTargets(request), /binding is invalid/u);
});

test("source preflight refuses accessors, proxies, empty pages, wrong frame and cancellation", async t => {
  const f = setup(t), probe = createOwnedTextProbe(f.dependencies);
  const request = { root: f.request.root, deck: f.request.deck, sourceFiles: [f.request.sourceImage],
    sourceHashes: [f.request.sourceHash], isCancellationRequested: async () => false };
  let reads = 0; const hostile = {};
  Object.defineProperty(hostile, "root", { enumerable: true, get() { reads++; return request.root; } });
  for (const value of [null, {}, hostile, new Proxy(request, {}), { ...request, sourceFiles: new Proxy(request.sourceFiles, {}) },
    { ...request, deck: { ...request.deck, pages: [] } }, { ...request, deck: { ...request.deck, slideSize: { widthPt: 100, heightPt: 100 } } }]) {
    await assert.rejects(probe.prepareTargets(value), /admission/u);
  }
  assert.equal(reads, 0); assert.deepEqual(f.counts(), { builds: 0, renders: 0 });
  await assert.rejects(probe.prepareTargets({ ...request, isCancellationRequested: async () => true }), /cancelled/u);
  await assert.rejects(probe.prepareTargets({ ...request, deck: { ...request.deck, slideSize: { widthPt: 100001, heightPt: 100 } } }), /size is invalid/u);
  f.page.intent = { templatePlaceholderBindings: [] };
  assert.deepEqual(await probe.prepareTargets(request), [{ pageIndex: 0, ids: [] }]);
  await assert.rejects(probe.prepareTargets({ ...request, sourceHashes: ["f".repeat(64)] }), /binding is invalid/u);
});

test("fresh probe binds complete source, original text revision and same-renderer isolated glyphs", async t => {
  const fixture = setup(t), snapshot = structuredClone(fixture.request.deck);
  const result = await createOwnedTextProbe(fixture.dependencies)(fixture.request);
  assert.equal(result.measurements.length, 1);
  assert.deepEqual(result.measurements[0].source, { x: 40, y: 40, w: 40, h: 10 });
  assert.deepEqual(result.measurements[0].rendered, { x: 41, y: 40, w: 50, h: 10 });
  assert.equal(result.measurements[0].textRevision, textProbeRevision(fixture.text));
  assert.equal(result.measurements[0].renderProfile.sourceHash, fixture.request.sourceHash);
  assert.equal(result.measurements[0].renderedOwnership, "isolated");
  assert.deepEqual(fixture.built().pages[0].source, fixture.page.source);
  assert.deepEqual(fixture.built().pages[0].textBoxes[0], fixture.text);
  assert.deepEqual(fixture.built().pages[0].shapes, []);
  assert.deepEqual(fixture.request.deck, snapshot); cleaned(fixture.request);
});

test("empty targets and unknown target identities do not build or render", async t => {
  for (const ids of [[], ["unknown"]]) {
    const f = setup(t); f.request.targetIds = ids;
    assert.equal((await createOwnedTextProbe(f.dependencies)(f.request)).measurements.length, 0);
    assert.deepEqual(f.counts(), { builds: 0, renders: 0 }); cleaned(f.request);
  }
});

test("grouped, warped, mixed-run and template texts are not measured as absolute ordinary text", async t => {
  for (const mutate of [f => { f.text.source.nativeComponentGroupId = "group"; },
    f => { f.text.style.nativeComponentGroupId = "group"; }, f => { f.text.style.textWarp = "textPlain"; },
    f => { f.text.runs = []; }, f => { f.page.intent = { templatePlaceholderBindings: [] }; },
    f => { f.text.source.confidence = 0.8; }]) {
    const f = setup(t); mutate(f);
    assert.equal((await createOwnedTextProbe(f.dependencies)(f.request)).measurements.length, 0);
    assert.equal(f.counts().builds, 0); cleaned(f.request);
  }
});

test("source text ownership conflicts yield no candidates", async t => {
  const f = setup(t); f.page.textBoxes.push({ ...structuredClone(f.text), id: "neighbor" });
  assert.equal((await createOwnedTextProbe(f.dependencies)(f.request)).measurements.length, 0);
  assert.equal(f.counts().builds, 0); cleaned(f.request);
});

test("invalid and excessive target lists fail before external callbacks", async t => {
  for (const ids of [["label", "label"], ["a", "b", "c", "d", "e"], [123], [""]]) {
    const f = setup(t); f.request.targetIds = ids;
    await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /request/u);
    assert.equal(f.counts().builds, 0); cleaned(f.request);
  }
});

test("accessors and proxies are rejected without executing user accessors", async t => {
  const f = setup(t); let calls = 0;
  const request = { ...f.request }; Object.defineProperty(request, "root", { get() { calls++; return f.request.root; } });
  const probe = createOwnedTextProbe(f.dependencies);
  await assert.rejects(probe(request)); await assert.rejects(probe(new Proxy(f.request, {})));
  assert.equal(calls, 0); cleaned(f.request);
});

test("foreign source files, source hashes and root aliases are rejected", async t => {
  const f = setup(t), outside = fs.mkdtempSync(path.join(os.tmpdir(), "owned-probe-outside-"));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const file = path.join(outside, "source.png"); fs.copyFileSync(f.request.sourceImage, file);
  const probe = createOwnedTextProbe(f.dependencies);
  await assert.rejects(probe({ ...f.request, sourceImage: file }), /file/u);
  await assert.rejects(probe({ ...f.request, sourceHash: "f".repeat(64) }), /source changed/u);
  const alias = path.join(outside, "alias"); fs.symlinkSync(f.request.root, alias, "junction");
  await assert.rejects(probe({ ...f.request, root: alias, sourceImage: path.join(alias, "source.png") }), /root/u);
  cleaned(f.request);
});

test("renderer identity, version, DPI and runtime hash are mandatory", async t => {
  for (const patch of [{ rendererId: "render-powerpoint-com" }, { version: "bad\nversion" }, { dpi: 96 }, { runtimeHash: "unknown" }]) {
    const f = setup(t), base = await f.dependencies.describeRenderer();
    f.dependencies.describeRenderer = async () => ({ ...base, ...patch });
    await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /profile/u);
    assert.equal(f.counts().builds, 0); cleaned(f.request);
  }
});

test("build and render errors propagate with owned artifacts cleaned", async t => {
  for (const stage of ["build", "render"]) {
    const f = setup(t), failure = new Error("bounded provider failure");
    if (stage === "build") f.request.buildCandidate = async () => { throw failure; };
    else f.dependencies.renderPresentation = async () => { throw failure; };
    await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), error => error === failure);
    cleaned(f.request);
  }
});

test("failed, mismatched and oversized renderer results do not become trusted evidence", async t => {
  for (const result of [{ ok: false }, { ok: true, data: { provider: "other", renderedPages: [{}] } },
    { ok: true, data: { provider: "render-libreoffice", renderedPages: [] } }]) {
    const f = setup(t); f.dependencies.renderPresentation = async () => result;
    await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /render/u); cleaned(f.request);
  }
  const f = setup(t); f.dependencies.renderPresentation = async (_input, context) => {
    const file = path.join(context.outputDir, "page.png"); writePng(file, { width: 40, height: 20, rgba: Buffer.alloc(40 * 20 * 4, 255) });
    return { ok: true, data: { provider: "render-libreoffice", renderedPages: [{ image: file }] } };
  };
  await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /dimensions/u); cleaned(f.request);
});

test("foreign rendered files fail closed without deleting the source", async t => {
  const f = setup(t); f.dependencies.renderPresentation = async () => ({ ok: true,
    data: { provider: "render-libreoffice", renderedPages: [{ image: f.request.sourceImage }] } });
  await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /file/u); cleaned(f.request);
});

test("cancellation before and after build stops further provider work", async t => {
  const before = setup(t); before.request.isCancellationRequested = async () => true;
  await assert.rejects(createOwnedTextProbe(before.dependencies)(before.request), /cancelled/u);
  assert.equal(before.counts().builds, 0); cleaned(before.request);
  const after = setup(t), build = after.request.buildCandidate; let stop = false;
  after.request.isCancellationRequested = async () => stop;
  after.request.buildCandidate = async input => { await build(input); stop = true; };
  await assert.rejects(createOwnedTextProbe(after.dependencies)(after.request), /cancelled/u);
  assert.equal(after.counts().renders, 0); cleaned(after.request);
});

test("source mutation during render is rejected", async t => {
  const f = setup(t), render = f.dependencies.renderPresentation;
  f.dependencies.renderPresentation = async (...args) => { const result = await render(...args); writePng(f.request.sourceImage, image(84)); return result; };
  await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /source changed/u); cleaned(f.request);
});

test("clipped rendered ink yields no trusted measurement", async t => {
  const f = setup(t); f.dependencies.renderPresentation = async (_input, context) => {
    const file = path.join(context.outputDir, "page.png"); writePng(file, image(0, 200));
    return { ok: true, data: { provider: "render-libreoffice", renderedPages: [{ image: file }] } };
  };
  assert.equal((await createOwnedTextProbe(f.dependencies)(f.request)).measurements.length, 0); cleaned(f.request);
});

test("renderer identity drift during build or render invalidates measurements", async t => {
  const f = setup(t), render = f.dependencies.renderPresentation;
  let changed = false;
  f.dependencies.describeRenderer = async () => ({ rendererId: "render-libreoffice", version: "test", dpi: 144,
    runtimeHash: (changed ? "b" : "a").repeat(64) });
  f.dependencies.renderPresentation = async (...args) => { const result = await render(...args); changed = true; return result; };
  await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /identity changed/u); cleaned(f.request);
});

test("source and slide aspect ratios must match", async t => {
  const f = setup(t); f.request.deck.slideSize.heightPt = 200;
  await assert.rejects(createOwnedTextProbe(f.dependencies)(f.request), /aspect ratio/u); cleaned(f.request);
});
