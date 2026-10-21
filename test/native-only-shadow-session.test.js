"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createNativeOnlyShadowSession } = require("../packages/slideclone-worker-adapter/native-only-shadow-session");
const { hasMeasuredVisualGain } = require("../packages/slideclone-worker-adapter/candidate-quality-policy");
function quality(pdr) {
  return { passed: pdr <= 0.08, metrics: { "pixel-diff-ratio": pdr, "foreground-missing-ratio": pdr / 2, "mean-absolute-delta": pdr * 100 } };
}
function setup(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "native-shadow-test-")));
  fs.mkdirSync(path.join(root, "assets"));
  const source = path.join(root, "assets", "source.png"), icon = path.join(root, "assets", "icon.png");
  fs.writeFileSync(source, "source"); fs.writeFileSync(icon, "icon");
  const deck = { pages: [{ sourceImage: "assets/source.png", textBoxes: [{ id: "label", text: "Editable", font: { sizePt: 20 } }],
    images: [{ assetPath: "assets/icon.png" }] }] };
  const deckFile = path.join(root, "candidate.json"), pptxFile = path.join(root, "candidate.pptx"), render = path.join(root, "render.png");
  fs.writeFileSync(deckFile, JSON.stringify(deck)); fs.writeFileSync(pptxFile, "pptx"); fs.writeFileSync(render, "render");
  const history = [{ pageIndex: 0, id: "label", textRevision: "a".repeat(64), sourceHash: "b".repeat(64) }];
  const candidate = { deck, deckFile, pptxFile, renderedImages: [render], quality: quality(0.085), ownedTextTargetHistory: history };
  const dependencies = { hasMeasuredGain: hasMeasuredVisualGain,
    validateDeck: value => { if (!Array.isArray(value?.pages)) throw new Error("invalid deck"); },
    assess: ({ candidateQuality }) => ({ passed: candidateQuality.passed, reasons: candidateQuality.passed ? [] : ["visual-fidelity"] }) };
  const session = createNativeOnlyShadowSession(dependencies);
  t.after(() => { try { session.close(); } finally { fs.rmSync(root, { recursive: true, force: true }); } });
  return { root, source, icon, candidate, dependencies, session,
    request: { root, baselineDeck: structuredClone(deck), baselineQuality: quality(0.096), candidate, sourceImages: [source], policy: { renderer: "test-v1" } } };
}
test("native shadow resumes immutable candidates and preserves full history despite original-path overwrites", t => {
  const f = setup(t);
  assert.equal(f.session.checkpoint(f.request), true);
  fs.writeFileSync(f.candidate.deckFile, "overwritten by late stage");
  fs.writeFileSync(f.candidate.pptxFile, "overwritten by late stage");
  fs.writeFileSync(f.candidate.renderedImages[0], "overwritten by late stage");
  f.candidate.deck.pages[0].textBoxes[0].text = "mutated caller";
  const result = f.session.resume(f.request);
  assert.equal(result.deck.pages[0].textBoxes[0].text, "Editable");
  assert.deepEqual(result.ownedTextTargetHistory, f.candidate.ownedTextTargetHistory);
  assert.equal(fs.readFileSync(result.pptxFile, "utf8"), "pptx");
  assert.equal(fs.readFileSync(result.renderedImages[0], "utf8"), "render");
  assert.equal(result.quality.passed, false);
  result.deck.pages[0].textBoxes[0].text = "mutated resume";
  assert.equal(f.session.resume(f.request).deck.pages[0].textBoxes[0].text, "Editable");
});
test("baseline revisions, root, source order and render policy changes invalidate the job-local shadow", t => {
  for (const kind of ["text", "font", "image", "policy", "root", "source-order"]) {
    const f = setup(t); assert.equal(f.session.checkpoint(f.request), true);
    const next = { ...f.request, baselineDeck: structuredClone(f.request.baselineDeck) };
    if (kind === "text") next.baselineDeck.pages[0].textBoxes[0].text = "Changed";
    if (kind === "font") next.baselineDeck.pages[0].textBoxes[0].font.sizePt = 21;
    if (kind === "image") next.baselineDeck.pages[0].images = [];
    if (kind === "policy") next.policy = { renderer: "test-v2" };
    if (kind === "root") next.root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "native-shadow-other-")));
    if (kind === "source-order") next.sourceImages = [f.icon];
    try { assert.equal(f.session.resume(next), null); assert.equal(f.session.resume(f.request), null); }
    finally { if (kind === "root") fs.rmSync(next.root, { recursive: true }); }
  }
});
test("source, referenced assets and checkpoint artifacts cannot be tampered before resume", t => {
  for (const kind of ["source", "icon", "deck", "pptx", "render", "deleted"]) {
    const f = setup(t); f.session.checkpoint(f.request);
    const resumed = f.session.resume(f.request);
    const file = kind === "source" ? f.source : kind === "icon" ? f.icon : kind === "deck" ? resumed.deckFile
      : kind === "render" ? resumed.renderedImages[0] : resumed.pptxFile;
    if (kind === "deleted") fs.rmSync(file); else fs.writeFileSync(file, "tampered");
    assert.throws(() => f.session.resume(f.request));
  }
});
test("only measured, structurally admitted native candidates may be retained; passing does not bypass caller publication", t => {
  const f = setup(t);
  assert.equal(f.session.resume(f.request), null);
  assert.equal(f.session.checkpoint({ ...f.request, candidate: null }), false);
  assert.equal(f.session.checkpoint({ ...f.request, candidate: { rejected: true, rejectionCode: "unsafe" } }), false);
  assert.equal(f.session.checkpoint({ ...f.request, candidate: { ...f.candidate, rejected: true } }), false);
  assert.equal(f.session.checkpoint({ ...f.request, candidate: { ...f.candidate, quality: quality(0.1) } }), false);
  for (const reasons of [["large-raster"], ["semantic-editability"], ["visual-fidelity", "native-component-quality"]]) {
    const session = createNativeOnlyShadowSession({ ...f.dependencies, assess: () => ({ passed: false, reasons }) });
    assert.equal(session.checkpoint(f.request), false); assert.equal(session.resume(f.request), null); session.close();
  }
  const passing = { ...f.candidate, quality: quality(0.079) };
  assert.equal(f.session.checkpoint({ ...f.request, candidate: passing }), true);
  assert.equal(f.session.resume(f.request).quality.passed, true);
  f.session.close(); assert.equal(f.session.resume(f.request), null); f.session.close();
});
test("complete history remains bounded and sparse, duplicate, rewritten or oversized histories reject", t => {
  const f = setup(t), entry = f.candidate.ownedTextTargetHistory[0];
  for (const history of [new Array(1), [entry, entry], [{ ...entry, textRevision: "invalid" }],
    Array.from({ length: 37 }, (_, index) => ({ ...entry, id: `label-${index}` }))]) {
    assert.throws(() => f.session.checkpoint({ ...f.request, candidate: { ...f.candidate, ownedTextTargetHistory: history } }));
  }
  const history = Array.from({ length: 36 }, (_, index) => ({ ...entry, id: `label-${index}` }));
  f.session.checkpoint({ ...f.request, candidate: { ...f.candidate, ownedTextTargetHistory: history } });
  assert.deepEqual(f.session.resume(f.request).ownedTextTargetHistory, history);
});
test("unsafe data never invokes getters, proxies or toJSON; extreme and cyclic inputs fail closed", t => {
  const f = setup(t); let executed = false;
  const getter = { ...f.request, get candidate() { executed = true; return f.candidate; } };
  assert.throws(() => f.session.checkpoint(getter)); assert.equal(executed, false);
  const proxy = new Proxy(f.candidate, { get() { executed = true; throw new Error("unexpected proxy"); } });
  const cyclic = { ...f.candidate }; cyclic.loop = cyclic;
  for (const candidate of [proxy, cyclic, Object.assign(Object.create({}), f.candidate),
    { ...f.candidate, toJSON() { executed = true; return f.candidate; } },
    { ...f.candidate, value: NaN }, { ...f.candidate, values: new Array(20001) }]) {
    assert.throws(() => f.session.checkpoint({ ...f.request, candidate }));
  }
  assert.equal(executed, false);
});
test("missing, outside-root, duplicate and mismatched artifact files reject without leaked checkpoint directories", t => {
  const f = setup(t);
  for (const candidate of [{ ...f.candidate, pptxFile: path.join(f.root, "missing.pptx") },
    { ...f.candidate, pptxFile: path.join(f.root, "..", "outside.pptx") },
    { ...f.candidate, renderedImages: [f.candidate.pptxFile] }, { ...f.candidate, renderedImages: [] },
    { ...f.candidate, deck: { pages: [] } }]) assert.throws(() => f.session.checkpoint({ ...f.request, candidate }));
  assert.equal(fs.readdirSync(f.root).some(name => name.startsWith("native-search-shadow-")), false);
});
test("callback failure and contradictory admission fail closed and retain no checkpoint", t => {
  const f = setup(t);
  for (const dependencies of [{ ...f.dependencies, hasMeasuredGain: () => "true" },
    { ...f.dependencies, assess: () => ({ passed: true, reasons: ["visual-fidelity"] }) },
    { ...f.dependencies, assess: () => { throw new Error("assessment failed"); } },
    { ...f.dependencies, validateDeck: () => { throw new Error("validation failed"); } }]) {
    const session = createNativeOnlyShadowSession(dependencies);
    assert.throws(() => session.checkpoint(f.request)); assert.equal(session.resume(f.request), null); session.close();
  }
  assert.throws(() => createNativeOnlyShadowSession({ ...f.dependencies, assess: null }));
});
test("failed and corrupted copies remove only their owned temporary checkpoint", t => {
  const f = setup(t), copy = fs.copyFileSync;
  for (const mode of ["failure", "corruption"]) {
    fs.copyFileSync = (...args) => {
      if (mode === "failure") throw new Error("copy failed");
      copy(...args); fs.writeFileSync(args[1], "corrupted during copy");
    };
    try { assert.throws(() => f.session.checkpoint(f.request)); }
    finally { fs.copyFileSync = copy; }
    assert.equal(f.session.resume(f.request), null);
    assert.equal(fs.readdirSync(f.root).some(name => name.startsWith("native-search-shadow-")), false);
    assert.equal(fs.readFileSync(f.candidate.pptxFile, "utf8"), "pptx");
  }
});
test("junction escapes and replaced checkpoint directories cannot read or delete external artifacts", t => {
  const f = setup(t), outside = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "shadow-external-")));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const external = path.join(outside, "external.pptx"); fs.writeFileSync(external, "external");
  const link = path.join(f.root, "assets", "linked"); fs.symlinkSync(outside, link, "junction");
  assert.throws(() => f.session.checkpoint({ ...f.request, candidate: { ...f.candidate, pptxFile: path.join(link, "external.pptx") } }));
  f.session.checkpoint(f.request);
  const directory = path.dirname(f.session.resume(f.request).pptxFile);
  fs.renameSync(directory, path.join(f.root, "old-checkpoint"));
  fs.symlinkSync(outside, directory, "junction");
  assert.throws(() => f.session.close(), /cleanup directory changed/);
  assert.equal(fs.readFileSync(external, "utf8"), "external");
});
