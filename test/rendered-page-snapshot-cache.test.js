"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const { createTemporaryTestDirectory, removeTemporaryTestDirectory } = require("./helpers/temporary-directory.cjs");
const path = require("node:path");
const test = require("node:test");
const { injectSnapshotReplayWriteFault } = require("./helpers/snapshot-replay-write-fault.cjs");
const { crc32 } = require("../packages/ooxml-core");
const { writePng } = require("../packages/slideclone-core/png");
const { writeStoredZipAtomic } = require("../packages/slideclone-core/pptx-zip");
const { createCandidateVerificationCache } = require("../packages/slideclone-worker-adapter/candidate-verification-cache");
const { createRenderedPageSnapshotCache, validatedRenderedPagePaths } = require("../packages/slideclone-worker-adapter/rendered-page-snapshot-cache");
const { createRawImageRenderQualityVerifier } = require("../packages/slideclone-worker-adapter/team-render-quality");

function png(file, color = 80, width = 3, height = 2) {
  const rgba = Buffer.alloc(width * height * 4, color);
  for (let offset = 3; offset < rgba.length; offset += 4) rgba[offset] = 255;
  writePng(file, { width, height, rgba });
  return fs.readFileSync(file);
}

function pptx(file, content = "slide") {
  writeStoredZipAtomic(file, [
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "ppt/presentation.xml", data: Buffer.from("<presentation/>") },
    { name: "ppt/slides/slide1.xml", data: Buffer.from(`<slide>${content}</slide>`) }
  ]);
}

function quality(count = 1, passed = false) {
  return { passed, checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed }],
    metrics: { "pixel-diff-ratio": passed ? 0.01 : 0.19, "foreground-missing-ratio": 0.02,
      "mean-absolute-delta": passed ? 1 : 20, "quality-pages-compared": count } };
}

function fixture(t) {
  const root = createTemporaryTestDirectory("rendered-page-snapshot-");
  t.after(() => removeTemporaryTestDirectory(root));
  fs.mkdirSync(path.join(root, "assets"));
  const source = path.join(root, "assets", "source.png"), asset = path.join(root, "assets", "icon.png");
  const candidate = path.join(root, "candidate.pptx"), page = path.join(root, "render.png");
  png(source); png(asset); pptx(candidate);
  const bytes = png(page);
  const deck = { slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ sourceImage: "assets/source.png",
    shapes: [], textBoxes: [], images: [{ id: "icon", assetPath: "assets/icon.png", box: { x: 1, y: 1, w: 2, h: 2 } }] }] };
  const renderer = async () => ({}), comparator = () => ({});
  const binding = (overrides = {}) => ({ root, pptxFile: candidate, sourceImages: [source], deck,
    renderer, comparator, settings: { dpi: 144 }, policy: { maximumPixelDiffRatio: 0.08 }, ...overrides });
  const verification = createCandidateVerificationCache();
  const entry = (overrides = {}, result = quality()) => {
    const attempt = verification.begin(binding(overrides));
    assert.equal(attempt.commit(result), true);
    return attempt.getEntry();
  };
  return { root, source, asset, candidate, page, bytes, deck, binding, entry, verification };
}

function wrapperFixture(t) {
  const files = fixture(t);
  let renders = 0, comparisons = 0;
  const renderedPaths = [];
  const adapters = {
    renderPresentation: async (_request, context) => {
      renders++;
      fs.mkdirSync(context.outputDir, { recursive: true });
      const image = path.join(context.outputDir, "page.png");
      renderedPaths.push(image);
      fs.writeFileSync(image, files.bytes);
      return { ok: true, data: { renderedPages: [{ image }] } };
    },
    comparePageFiles: () => { comparisons++; return { ok: true, pixelDiffRatio: 0.19, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 20 }; }
  };
  const verify = createRawImageRenderQualityVerifier(adapters);
  const request = { root: files.root, pptxFile: files.candidate, sourceImages: [files.source], deck: files.deck };
  return { ...files, adapters, verify, request, renderedPaths, counts: () => ({ renders, comparisons }) };
}

function capture(cache, files, entry, pages = [files.page]) {
  const pending = cache.capture({ root: files.root, pages });
  assert.ok(pending);
  assert.equal(pending.commit(entry), true);
}

test("collection hits survive deleted renderer paths and mutable replay files while failed conclusions remain failed", async t => {
  const f = wrapperFixture(t);
  const collected = [];
  const request = { ...f.request, collectRenderedPages: pages => {
    assert.equal(Object.isFrozen(pages), true); collected.push(pages);
  } };
  const first = await f.verify(request);
  fs.rmSync(collected[0][0]);
  const second = await f.verify(request);
  assert.deepEqual(f.counts(), { renders: 1, comparisons: 1 });
  assert.equal(first.passed, false); assert.equal(second.passed, false);
  assert.equal(second.metrics["quality-verification-cache-hit"], 1);
  assert.equal(second.metrics["quality-render-milliseconds"], 0);
  assert.notEqual(collected[0][0], collected[1][0]);
  assert.equal(path.dirname(path.dirname(collected[1][0])), f.root);
  assert.deepEqual(fs.readFileSync(collected[1][0]), f.bytes);
  fs.writeFileSync(collected[1][0], "caller changed this copy");
  const third = await f.verify(request);
  assert.equal(third.passed, false); assert.notEqual(collected[1][0], collected[2][0]);
  assert.deepEqual(fs.readFileSync(collected[2][0]), f.bytes);
  assert.equal(fs.readFileSync(collected[1][0], "utf8"), "caller changed this copy");
  assert.throws(() => { third.metrics["pixel-diff-ratio"] = 0; }, TypeError);
});

test("quality-only verification also holds snapshots for a later collector", async t => {
  const f = wrapperFixture(t);
  await f.verify(f.request);
  fs.rmSync(f.renderedPaths[0]);
  let pages;
  const hit = await f.verify({ ...f.request, collectRenderedPages: value => { pages = value; } });
  assert.equal(hit.metrics["quality-verification-cache-hit"], 1);
  assert.deepEqual(fs.readFileSync(pages[0]), f.bytes);
  assert.deepEqual(f.counts(), { renders: 1, comparisons: 1 });
});

test("successful collection preserves its actual complete pass on replay", async t => {
  const f = wrapperFixture(t);
  const verify = createRawImageRenderQualityVerifier({ ...f.adapters,
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.01, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 1 }) });
  const request = { ...f.request, collectRenderedPages: () => {} };
  assert.equal((await verify(request)).passed, true);
  const hit = await verify(request);
  assert.equal(hit.passed, true);
  assert.equal(hit.metrics["quality-verification-cache-hit"], 1);
  assert.equal(f.counts().renders, 1);
});

test("collection invalidates for changed source, assets, full IR, emitted OOXML, reference, and adapters", async t => {
  const changes = [
    ["source", f => { png(f.source, 130); return f.request; }],
    ["asset", f => { png(f.asset, 140); return f.request; }],
    ["full IR", f => ({ ...f.request, deck: { ...f.deck, meta: { revision: 2 } } })],
    ["OOXML", f => { pptx(f.candidate, "changed"); return f.request; }],
    ["reference", f => ({ ...f.request, referenceQuality: { componentWorst: [] } })]
  ];
  for (const [name, change] of changes) await t.test(name, async child => {
    const f = wrapperFixture(child);
    await f.verify({ ...f.request, collectRenderedPages: () => {} });
    const result = await f.verify({ ...change(f), collectRenderedPages: () => {} });
    assert.equal(result.metrics["quality-verification-cache-hit"], undefined);
    assert.deepEqual(f.counts(), { renders: 2, comparisons: 2 });
  });
  await t.test("factory policy and adapter changes", async child => {
    const f = wrapperFixture(child);
    await f.verify({ ...f.request, collectRenderedPages: () => {} });
    const differentPolicy = createRawImageRenderQualityVerifier({ ...f.adapters, thresholds: { maximumPixelDiffRatio: 0.2 } });
    await differentPolicy({ ...f.request, collectRenderedPages: () => {} });
    assert.deepEqual(f.counts(), { renders: 2, comparisons: 2 });
  });
});

test("media is bound to the actual immutable verification entry including policy/settings/renderer identities", t => {
  const f = fixture(t), cache = createRenderedPageSnapshotCache();
  const original = f.entry(); capture(cache, f, original);
  const changes = [ { policy: { maximumPixelDiffRatio: 0.09 } }, { settings: { dpi: 192 } },
    { renderer: async () => ({}) }, { comparator: () => ({}) }, { referenceQuality: quality() },
    { deck: { ...f.deck, meta: { revision: 2 } } } ];
  for (const change of changes) assert.equal(cache.replay({ root: f.root, entry: f.entry(change) }), null);
  assert.equal(cache.replay({ root: f.root, entry: Object.freeze({ ...original }) }), null);
  assert.ok(cache.replay({ root: f.root, entry: original }));
  assert.equal(cache.replay({ root: path.dirname(f.root), entry: original }), null);
});

test("LRU evicts stored snapshots without deleting paths already returned to callers", t => {
  const f = fixture(t), cache = createRenderedPageSnapshotCache({ maxEntries: 2 });
  const first = f.entry({ deck: { ...f.deck, meta: { revision: 1 } } });
  const second = f.entry({ deck: { ...f.deck, meta: { revision: 2 } } });
  const third = f.entry({ deck: { ...f.deck, meta: { revision: 3 } } });
  capture(cache, f, first); capture(cache, f, second);
  const paths = cache.replay({ root: f.root, entry: first });
  capture(cache, f, third);
  assert.equal(cache.replay({ root: f.root, entry: second }), null);
  assert.ok(cache.replay({ root: f.root, entry: first }));
  assert.deepEqual(fs.readFileSync(paths[0]), f.bytes);
  cache.clear();
  assert.equal(cache.replay({ root: f.root, entry: first }), null);
  assert.ok(fs.existsSync(paths[0]));
});

test("byte/pixel/page/replay budgets limit storage and fallback without reusing stale paths", async t => {
  for (const [name, options] of [
    ["entry bytes", { maxEntryBytes: 60 }], ["total bytes", { maxBytes: 60 }],
    ["page pixels", { maxPagePixels: 5 }], ["entry pixels", { maxEntryPixels: 5 }],
    ["total pixels", { maxPixels: 5 }]
  ]) await t.test(name, child => {
    const f = fixture(child), cache = createRenderedPageSnapshotCache(options);
    assert.equal(cache.capture({ root: f.root, pages: [f.page] }), null);
  });
  for (const [name, options] of [
    ["held bytes", f => ({ maxBytes: f.bytes.length })], ["held pixels", () => ({ maxPixels: 6 })],
    ["held pages", () => ({ maxTotalPages: 1 })]
  ]) await t.test(name, child => {
    const f = fixture(child), cache = createRenderedPageSnapshotCache(options(f));
    const first = f.entry(), second = f.entry({ deck: { ...f.deck, meta: { revision: 2 } } });
    capture(cache, f, first); capture(cache, f, second);
    assert.equal(cache.replay({ root: f.root, entry: first }), null);
    assert.ok(cache.replay({ root: f.root, entry: second }));
  });
  await t.test("replay disk budget", child => {
    const f = fixture(child), cache = createRenderedPageSnapshotCache({ maxReplayBytes: f.bytes.length, maxReplayPages: 1 });
    const entry = f.entry(); capture(cache, f, entry);
    const paths = cache.replay({ root: f.root, entry });
    assert.ok(paths);
    assert.equal(cache.replay({ root: f.root, entry }), null);
    assert.deepEqual(fs.readFileSync(paths[0]), f.bytes);
  });
});

test("multi-page order/count and atomic capture are bounded", t => {
  const f = fixture(t), second = path.join(f.root, "render-2.png");
  const bytes = png(second, 155);
  const entry = f.entry({ sourceImages: [f.source, f.asset] }, quality(2));
  const cache = createRenderedPageSnapshotCache();
  capture(cache, f, entry, [second, f.page]);
  const replay = cache.replay({ root: f.root, entry });
  assert.deepEqual(fs.readFileSync(replay[0]), bytes);
  assert.deepEqual(fs.readFileSync(replay[1]), f.bytes);
  assert.equal(createRenderedPageSnapshotCache({ maxPages: 1 }).capture({ root: f.root, pages: [second, f.page] }), null);
  const pending = cache.capture({ root: f.root, pages: [f.page] });
  assert.equal(pending.commit(entry), false);
  const changed = cache.capture({ root: f.root, pages: [f.page, second] });
  png(second, 42);
  assert.equal(changed.commit(entry), false);
  assert.deepEqual(fs.readFileSync(cache.replay({ root: f.root, entry })[0]), bytes);
});

test("malformed PNG, traversal, outside paths, symbolic directories, and executable data cannot enter snapshots", t => {
  const f = fixture(t), cache = createRenderedPageSnapshotCache();
  const invalid = [Buffer.from("not PNG"), f.bytes.subarray(0, f.bytes.length - 1), Buffer.concat([f.bytes, Buffer.from("trailing")])];
  const badCrc = Buffer.from(f.bytes); badCrc[20] ^= 1; invalid.push(badCrc);
  const huge = Buffer.from(f.bytes); huge.writeUInt32BE(20000, 16); huge.writeUInt32BE(crc32(huge.subarray(12, 29)), 29); invalid.push(huge);
  for (const bytes of invalid) {
    fs.writeFileSync(f.page, bytes);
    assert.equal(cache.capture({ root: f.root, pages: [f.page] }), null);
  }
  fs.writeFileSync(f.page, f.bytes);
  for (const pages of [[], [null], new Array(1), [f.page, f.page]]) {
    assert.equal(cache.capture({ root: f.root, pages }), null);
  }
  assert.equal(cache.capture(null), null);
  assert.equal(cache.capture({ root: f.root, pages: [`${f.root}/sub/../render.png`] }), null);
  assert.equal(cache.capture({ root: path.join(f.root, "assets"), pages: [f.page] }), null);
  const directory = path.join(f.root, "real-directory"), link = path.join(f.root, "linked-directory");
  fs.mkdirSync(directory); png(path.join(directory, "page.png"));
  fs.symlinkSync(directory, link, process.platform === "win32" ? "junction" : "dir");
  assert.equal(cache.capture({ root: f.root, pages: [path.join(link, "page.png")] }), null);
  let invoked = 0;
  const pages = []; Object.defineProperty(pages, "0", { get() { invoked++; return f.page; } });
  assert.equal(cache.capture({ root: f.root, pages }), null);
  const input = Object.defineProperty({}, "root", { enumerable: true, get() { invoked++; return f.root; } });
  assert.equal(cache.capture(input), null);
  const proxy = new Proxy([f.page], { get() { invoked++; throw new Error("must not execute"); } });
  assert.equal(cache.capture({ root: f.root, pages: proxy }), null);
  assert.equal(cache.replay(new Proxy({}, { get() { invoked++; return null; } })), null);
  assert.equal(invoked, 0);
  assert.throws(() => createRenderedPageSnapshotCache(input), /options/u);
  assert.throws(() => createRenderedPageSnapshotCache({ maxBytes: Infinity }), /boundary/u);
});

test("unsafe renderer page getters/proxies fail closed without invoking caller code", async t => {
  const f = fixture(t); let invoked = 0;
  const accessor = Object.defineProperty({}, "image", { enumerable: true, get() { invoked++; return f.page; } });
  const proxy = new Proxy({ image: f.page }, { get() { invoked++; return f.page; } });
  for (const page of [accessor, proxy]) {
    const rendered = { ok: true, data: { renderedPages: [page] } };
    assert.equal(validatedRenderedPagePaths(rendered, 1), null);
    const verify = createRawImageRenderQualityVerifier({ renderPresentation: async () => rendered,
      comparePageFiles: () => assert.fail("unsafe render must not compare") });
    const result = await verify({ root: f.root, pptxFile: f.candidate, sourceImages: [f.source], deck: f.deck });
    assert.equal(result.metrics["quality-render-failed"], 1);
  }
  assert.equal(invoked, 0);
});

test("missing/invalid snapshots rerender collection normally while quality-only hits remain available", async t => {
  const f = fixture(t); let renders = 0;
  const verify = createRawImageRenderQualityVerifier({
    renderPresentation: async () => { renders++; fs.writeFileSync(f.page, "invalid PNG"); return { ok: true, data: { renderedPages: [{ image: f.page }] } }; },
    comparePageFiles: () => ({ ok: true, pixelDiffRatio: 0.19, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 20 })
  });
  const request = { root: f.root, pptxFile: f.candidate, sourceImages: [f.source], deck: f.deck };
  for (let index = 0; index < 2; index++) {
    const result = await verify({ ...request, collectRenderedPages: () => {} });
    assert.equal(result.passed, false); assert.equal(result.metrics["quality-verification-cache-hit"], undefined);
  }
  assert.equal(renders, 2);
  assert.equal((await verify(request)).metrics["quality-verification-cache-hit"], 1);
  assert.equal(renders, 2);
});

test("cached and uncached cancellation/collector failures share the verifier failure boundary", async t => {
  const f = wrapperFixture(t);
  const fail = async () => { throw new Error("secret collector content"); };
  const firstFailure = await f.verify({ ...f.request, collectRenderedPages: fail });
  assert.equal(firstFailure.metrics["quality-render-failed"], 1);
  assert.equal(JSON.stringify(firstFailure).includes("secret"), false);
  await f.verify({ ...f.request, collectRenderedPages: () => {} });
  const cachedFailure = await f.verify({ ...f.request, collectRenderedPages: fail });
  assert.equal(cachedFailure.metrics["quality-render-failed"], 1);
  assert.equal(cachedFailure.metrics["quality-verification-cache-hit"], undefined);
  assert.equal(JSON.stringify(cachedFailure).includes("secret"), false);
  assert.deepEqual(f.counts(), { renders: 2, comparisons: 1 });
  let cancelled = false;
  await assert.rejects(f.verify({ ...f.request, collectRenderedPages: () => { cancelled = true; },
    isCancellationRequested: async () => cancelled }), /cancelled/u);
  assert.deepEqual(f.counts(), { renders: 2, comparisons: 1 });
  await assert.rejects(f.verify({ ...f.request, isCancellationRequested: async () => true }), /cancelled/u);
  const hit = await f.verify({ ...f.request, collectRenderedPages: () => {} });
  assert.equal(hit.metrics["quality-verification-cache-hit"], 1);
  const uncached = wrapperFixture(t); let active = true;
  await assert.rejects(uncached.verify({ ...uncached.request, collectRenderedPages: () => { active = false; },
    isCancellationRequested: async () => !active }), /cancelled/u);
  assert.deepEqual(uncached.counts(), { renders: 1, comparisons: 0 });
});

test("snapshot write errors fall back to render and do not claim a hit", async t => {
  const f = wrapperFixture(t);
  await f.verify({ ...f.request, collectRenderedPages: () => {} });
  const mkdir = fs.mkdtempSync;
  const blocked = t.mock.method(fs, "mkdtempSync", (prefix, ...args) => {
    if (path.basename(prefix).startsWith("quality-render-")) return mkdir(prefix, ...args);
    throw new Error("cache disk unavailable");
  });
  let result;
  try { result = await f.verify({ ...f.request, collectRenderedPages: () => {} }); }
  finally { blocked.mock.restore(); }
  assert.equal(result.metrics["quality-verification-cache-hit"], undefined);
  assert.equal(result.metrics["quality-render-failed"], undefined);
  assert.deepEqual(f.counts(), { renders: 2, comparisons: 2 });
});

test("valid PNGs from an incomplete comparison never authorize a collection cache hit", async t => {
  const f = wrapperFixture(t); let comparisons = 0;
  const verify = createRawImageRenderQualityVerifier({ ...f.adapters, comparePageFiles: () => {
    if (comparisons++ === 0) throw new Error("comparison unavailable");
    return { ok: true, pixelDiffRatio: 0.19, foregroundMissingRatio: 0.02, meanAbsoluteDelta: 20 };
  } });
  const request = { ...f.request, collectRenderedPages: () => {} };
  assert.equal((await verify(request)).metrics["quality-render-failed"], 1);
  assert.equal((await verify(request)).metrics["quality-verification-cache-hit"], undefined);
  assert.equal((await verify(request)).metrics["quality-verification-cache-hit"], 1);
  assert.equal(f.counts().renders, 2);
});

test("partial replay write failures clean only unpublished files and release their disk reservation", t => {
  const f = fixture(t), cache = createRenderedPageSnapshotCache({ maxReplayPages: 1 });
  const entry = f.entry(); capture(cache, f, entry);
  const injection = injectSnapshotReplayWriteFault(t.mock, fs, f.root);
  try {
    // Fault injection must never corrupt another descriptor, including the
    // test runner's transport. Only this replay's unpublished PNG may fail.
    const unrelated = path.join(f.root, "unrelated.bin"), descriptor = fs.openSync(unrelated, "wx");
    try { fs.writeFileSync(descriptor, Buffer.from("retained")); }
    finally { fs.closeSync(descriptor); }
    assert.equal(fs.readFileSync(unrelated, "utf8"), "retained");
    assert.equal(cache.replay({ root: f.root, entry }), null);
  }
  finally { injection.restore(); }
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith("quality-snapshot-replay-")), false);
  assert.ok(cache.replay({ root: f.root, entry }));
});

test("a source mutation inside the collector prevents returning a cached conclusion", async t => {
  const f = wrapperFixture(t);
  await f.verify({ ...f.request, collectRenderedPages: () => {} });
  let called = 0;
  const result = await f.verify({ ...f.request, collectRenderedPages: () => {
    if (called++ === 0) png(f.source, 190);
  } });
  assert.equal(result.metrics["quality-verification-cache-hit"], undefined);
  assert.deepEqual(f.counts(), { renders: 2, comparisons: 2 });
});
