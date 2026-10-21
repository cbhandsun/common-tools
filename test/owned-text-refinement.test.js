"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createOwnedTextRefiner } = require("../packages/slideclone-core/owned-text-refinement");
const { textProbeRevision } = require("../packages/slideclone-core/owned-text-advance");

/** @param {unknown} value @returns {value is Record<string,unknown>} */
function record(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }

function textBox(index) {
  return { id: `label-${index}`, text: `Editable label ${index}`, box: { x: 20, y: 20 + index * 40, w: 200, h: 24 },
    font: { family: "Microsoft YaHei", sizePt: 20, weight: "regular", align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false },
    source: { editable: true, confidence: 0.99, ocrProvider: "test-probe" } };
}

function quality(texts, pixelDiffRatio = 0.09, overrides = {}) {
  const rows = texts.map((text, index) => {
    const values = overrides[text.id] || {};
    return { pageIndex: 0, id: text.id, kind: "text", role: "text", severity: values.severity ?? 2,
      pixelDiffRatio: values.pixelDiffRatio ?? 0.4, foregroundMissingRatio: values.foregroundMissingRatio ?? 0.2,
      contributionScore: values.contributionScore ?? texts.length - index, sufficientEvidence: values.sufficientEvidence ?? true };
  });
  return { passed: pixelDiffRatio <= 0.08,
    checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: pixelDiffRatio <= 0.08 }],
    metrics: { "pixel-diff-ratio": pixelDiffRatio, "foreground-missing-ratio": 0.04,
      "mean-absolute-delta": 10 }, componentLocalMetrics: rows };
}

function fixture(t, textCount = 1) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "owned-text-refinement-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceFile = path.join(root, "source.png"), renderedFile = path.join(root, "rendered.png");
  const deckFile = path.join(root, "baseline.json"), pptxFile = path.join(root, "baseline.pptx");
  fs.writeFileSync(sourceFile, "source-image");
  fs.writeFileSync(renderedFile, "rendered-image");
  fs.writeFileSync(pptxFile, "baseline-pptx");
  const texts = Array.from({ length: textCount }, (_, index) => textBox(index));
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, textBoxes: texts, shapes: [], images: [] }] };
  fs.writeFileSync(deckFile, JSON.stringify(deck));
  const state = { probes: 0, builds: 0, verifies: 0, validations: 0, audits: 0, cancel: false,
    builtDecks: [], probeRequests: [], verifyRequests: [], probeTransform: null, verify: null, semanticPassed: true };
  const defaultProbe = request => {
    const renderProfile = { rendererId: "render-libreoffice", version: "26.2.4.2", dpi: 144,
      pixelWidth: 1920, pixelHeight: 1080, runtimeHash: "a".repeat(64), sourceHash: request.sourceHash };
    const result = { pageIndex: request.pageIndex, sourceHash: request.sourceHash, renderProfile,
      measurements: request.page.textBoxes.filter(text => request.targetIds.includes(text.id)).map(text => ({ id: text.id,
        source: { x: text.box.x + 1, y: text.box.y + 1, w: 120, h: 20 },
        rendered: { x: text.box.x, y: text.box.y, w: 144, h: 20 }, sourceComplete: true,
        renderedComplete: true, renderedOwnership: "isolated", textRevision: textProbeRevision(text),
        renderProfile: { ...renderProfile } })) };
    return typeof state.probeTransform === "function" ? state.probeTransform(result, request) : result;
  };
  const dependencies = {
    probeOwnedTexts: async request => {
      state.probes++;
      state.probeRequests.push({ pageIndex: request.pageIndex, targetIds: [...request.targetIds],
        targets: structuredClone(request.targets), buildCandidate: request.buildCandidate });
      return defaultProbe(request);
    },
    validateDeck: value => {
      state.validations++;
      if (!record(value) || !Array.isArray(value.pages)) throw new TypeError("invalid test deck");
      for (const page of value.pages) for (const text of page.textBoxes || []) {
        if (text.style?.textWarp !== undefined && text.style.textWarp !== "textPlain") throw new TypeError("invalid warp");
      }
    },
    auditSemantic: () => { state.audits++; return { passed: state.semanticPassed }; },
    qualityAcceptable: ({ baselineQuality, candidateQuality }) =>
      candidateQuality.metrics["pixel-diff-ratio"] < baselineQuality.metrics["pixel-diff-ratio"]
  };
  const request = { root, deck, deckFile, pptxFile, sourceImages: [sourceFile], renderedImages: [renderedFile],
    initialQuality: quality(texts), isCancellationRequested: async () => state.cancel,
    buildCandidate: async ({ deckFile: candidateDeckFile, pptxFile: candidatePptxFile }) => {
      state.builds++;
      state.builtDecks.push(JSON.parse(fs.readFileSync(candidateDeckFile, "utf8")));
      fs.writeFileSync(candidatePptxFile, `candidate-${state.builds}`);
    },
    verifyCandidate: async args => {
      state.verifies++;
      state.verifyRequests.push(structuredClone(args));
      return typeof state.verify === "function"
        ? state.verify(args, state.verifies)
        : quality(texts, 0.079, Object.fromEntries(texts.map(text => [text.id,
          { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 }])));
    } };
  return { root, sourceFile, renderedFile, deckFile, pptxFile, texts, deck, state, dependencies, request,
    refine: createOwnedTextRefiner(dependencies) };
}

test("source admission spends the unchanged four slots on measurable high-contribution text", async t => {
  const f = fixture(t, 8);
  const requested = [];
  f.dependencies.prepareSourceTargets = async input => {
    assert.equal(input.sourceHashes.length, 1);
    assert.deepEqual(input.deck, f.deck);
    return [{ pageIndex: 0, ids: f.texts.slice(4).map(text => text.id) }];
  };
  f.state.probeTransform = result => { requested.push(...result.measurements.map(row => row.id)); return result; };
  await createOwnedTextRefiner(f.dependencies)(f.request);
  assert.deepEqual(requested, ["label-4", "label-5", "label-6", "label-7"]);
  assert.equal(f.state.probeRequests[0].targetIds.length, 4);
});

test("strict recovery can refine an absolute visual pass while preserving the original local rollback", async t => {
  for (const regress of [false, true]) {
    const f = fixture(t); f.request.initialQuality = quality(f.texts, 0.0795); f.request.strictRecovery = true;
    f.state.verify = () => quality(f.texts, 0.079, { "label-0": { severity: regress ? 3 : 1,
      pixelDiffRatio: regress ? 0.5 : 0.25, foregroundMissingRatio: regress ? 0.3 : 0.1 } });
    const before = structuredClone(f.request.initialQuality), result = await f.refine(f.request);
    assert.equal(f.state.probes, 1); assert.equal(result.accepted, !regress);
    assert.deepEqual(f.request.initialQuality, before);
  }
});

test("strict recovery is opt-in, typed, and never bypasses semantic or cancellation admission", async t => {
  const f = fixture(t); f.request.initialQuality = quality(f.texts, 0.0795);
  for (const value of [undefined, false]) {
    const result = await f.refine({ ...f.request, strictRecovery: value }); assert.equal(result.accepted, false);
  }
  for (const value of [null, "true", 1, {}, []]) await assert.rejects(f.refine({ ...f.request, strictRecovery: value }), TypeError);
  let reads = 0;
  await assert.rejects(f.refine({ ...f.request, get strictRecovery() { reads++; return true; } }), TypeError);
  f.state.semanticPassed = false;
  assert.equal((await f.refine({ ...f.request, strictRecovery: true })).accepted, false);
  f.state.semanticPassed = true; f.state.cancel = true;
  await assert.rejects(f.refine({ ...f.request, strictRecovery: true }), /cancel/u);
  assert.equal(f.state.probes, 0); assert.equal(reads, 0);
});

test("source admission rejects empty, illegal and hostile callback results before rendering", async t => {
  let reads = 0;
  const hostile = {}; Object.defineProperty(hostile, "ids", { enumerable: true, get() { reads++; return []; } });
  const arrayGetter = []; Object.defineProperty(arrayGetter, "0", { enumerable: true, get() { reads++; return { pageIndex: 0, ids: [] }; } });
  for (const value of [null, [], [hostile], arrayGetter, new Proxy([{ pageIndex: 0, ids: [] }], {}),
    [{ pageIndex: 0, ids: ["unknown"] }], [{ pageIndex: 0, ids: ["label-0", "label-0"] }], [{ pageIndex: 0, ids: Array(2001).fill("label-0") }]]) {
    const f = fixture(t);
    f.dependencies.prepareSourceTargets = async () => value;
    await assert.rejects(createOwnedTextRefiner(f.dependencies)(f.request), /source admission/u);
    assert.equal(f.state.probes, 0); assert.equal(f.state.builds, 0);
  }
  assert.equal(reads, 0);
  const empty = fixture(t); empty.dependencies.prepareSourceTargets = async () => [{ pageIndex: 0, ids: [] }];
  assert.equal((await createOwnedTextRefiner(empty.dependencies)(empty.request)).accepted, false);
  assert.equal(empty.state.probes, 0);
  const failure = fixture(t); failure.dependencies.prepareSourceTargets = async () => { throw new Error("admission failed"); };
  await assert.rejects(createOwnedTextRefiner(failure.dependencies)(failure.request), /admission failed/u);
});

test("production fitting consumes revision-bound local residual for matched ink and rolls back its regression", async t => {
  for (const regressed of [false, true]) await t.test(regressed ? "rollback" : "admit", async t => {
    const f = fixture(t);
    f.state.probeTransform = result => ({ ...result, measurements: result.measurements.map(row => ({ ...row, source: { ...row.rendered } })) });
    if (regressed) f.state.verify = () => quality(f.request.deck.pages[0].textBoxes, 0.079, { "label-0": { severity: 3, pixelDiffRatio: 0.5, foregroundMissingRatio: 0.3 } });
    const result = await createOwnedTextRefiner(f.dependencies)(f.request);
    assert.equal(f.state.builds, 1);
    assert.equal(result.accepted, !regressed);
    assert.equal(f.state.builtDecks[0].pages[0].textBoxes[0].style.textWarp, "textPlain");
    assert.equal(result.deck.pages[0].textBoxes[0].text, f.request.deck.pages[0].textBoxes[0].text);
    if (regressed) assert.equal(result.rolledBackTextBoxes, 1);
  });
});

function assertNoCandidateFiles(root) {
  assert.deepEqual(fs.readdirSync(root).filter(name => name.startsWith("owned-text-refinement-")), []);
}

test("builds one source-bound textPlain candidate with fixed original ROIs", async t => {
  const f = fixture(t), original = structuredClone(f.deck);
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.proposedTextBoxes, 1);
  assert.equal(result.rolledBackTextBoxes, 0);
  assert.equal(f.state.probes, 1);
  assert.equal(f.state.builds, 1);
  assert.equal(f.state.verifies, 1);
  assert.deepEqual(f.state.probeRequests[0].targetIds, ["label-0"]);
  assert.deepEqual(f.state.probeRequests[0].targets, [{ id: "label-0", textRevision: textProbeRevision(original.pages[0].textBoxes[0]) }]);
  assert.equal(f.state.probeRequests[0].buildCandidate, f.request.buildCandidate);
  assert.equal(result.deck.pages[0].textBoxes[0].style.textWarp, "textPlain");
  assert.deepEqual(f.request.deck, original);
  const verification = f.state.verifyRequests[0];
  assert.equal(verification.deck.pages[0].textBoxes[0].style.textWarp, undefined);
  assert.equal(verification.candidateDeck.pages[0].textBoxes[0].style.textWarp, "textPlain");
  assert.deepEqual(verification.fixedTextRois, [{ pageIndex: 0, id: "label-0", box: original.pages[0].textBoxes[0].box }]);
  assert.equal(fs.statSync(result.deckFile).isFile(), true);
  assert.equal(fs.statSync(result.pptxFile).size > 0, true);
});

test("strict local rollback restores a regressed whole text and rebuilds only once", async t => {
  const f = fixture(t, 2);
  f.state.verify = (_args, attempt) => attempt === 1
    ? quality(f.texts, 0.078, {
      "label-0": { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 },
      "label-1": { severity: 1, pixelDiffRatio: 0.41, foregroundMissingRatio: 0.1 } })
    : quality(f.texts, 0.079, {
      "label-0": { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 },
      "label-1": { severity: 2, pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2 } });
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 1);
  assert.equal(result.proposedTextBoxes, 2);
  assert.equal(result.rolledBackTextBoxes, 1);
  assert.equal(f.state.builds, 2);
  assert.equal(f.state.verifies, 2);
  assert.equal(result.deck.pages[0].textBoxes[0].style.textWarp, "textPlain");
  assert.deepEqual(result.deck.pages[0].textBoxes[1], f.deck.pages[0].textBoxes[1]);
  assert.deepEqual(f.state.builtDecks[1].pages[0].textBoxes[1], f.deck.pages[0].textBoxes[1]);
});

test("source-owned duplicate glyph shapes follow the accepted text and restore atomically on rollback", async t => {
  const f = fixture(t, 2);
  f.deck.pages[0].shapes = [{ id: "glyph-0" }, { id: "independent-icon" }, { id: "glyph-1" }];
  const before = structuredClone(f.deck);
  f.state.probeTransform = result => ({ ...result, ownedGlyphShapes: f.texts.map((text, index) => ({
    id: `glyph-${index}`, textId: text.id, textRevision: textProbeRevision(text) })) });
  f.state.verify = (_args, attempt) => attempt === 1
    ? quality(f.texts, 0.078, { "label-0": { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 },
      "label-1": { severity: 1, pixelDiffRatio: 0.41, foregroundMissingRatio: 0.1 } })
    : quality(f.texts, 0.079, { "label-0": { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 } });
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(result.removedGlyphShapes, 1);
  assert.deepEqual(f.state.builtDecks[0].pages[0].shapes, [{ id: "independent-icon" }]);
  assert.deepEqual(result.deck.pages[0].shapes, [{ id: "independent-icon" }, { id: "glyph-1" }]);
  assert.deepEqual(f.deck, before);
});

test("invalid, duplicate, foreign and stale source-owned glyph claims fail before building", async t => {
  for (const mode of ["invalid", "duplicate", "foreign", "stale", "owner"]) {
    const f = fixture(t);
    f.deck.pages[0].shapes = [{ id: "glyph" }];
    f.state.probeTransform = result => {
      const entry = { id: "glyph", textId: f.texts[0].id, textRevision: textProbeRevision(f.texts[0]) };
      if (mode === "foreign") entry.id = "missing";
      if (mode === "stale") entry.textRevision = "f".repeat(64);
      if (mode === "owner") entry.textId = "another-text";
      return { ...result, ownedGlyphShapes: mode === "invalid" ? {} : mode === "duplicate" ? [entry, entry] : [entry] };
    };
    await assert.rejects(f.refine(f.request), /glyph/u);
    assert.equal(f.state.builds, 0);
  }
});

test("a second-render local regression rejects the batch despite global improvement", async t => {
  const f = fixture(t, 2);
  f.state.verify = (_args, attempt) => attempt === 1
    ? quality(f.texts, 0.078, {
      "label-0": { severity: 3, pixelDiffRatio: 0.5, foregroundMissingRatio: 0.3 },
      "label-1": { severity: 1, pixelDiffRatio: 0.25, foregroundMissingRatio: 0.1 } })
    : quality(f.texts, 0.077, {
      "label-0": { severity: 2, pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2 },
      "label-1": { severity: 1, pixelDiffRatio: 0.41, foregroundMissingRatio: 0.1 } });
  const result = await f.refine(f.request);
  assert.equal(result.accepted, false);
  assert.equal(f.state.builds, 2);
  assertNoCandidateFiles(f.root);
});

test("no evidence, stale text revisions and mismatched renderer profiles do not build", async t => {
  for (const mode of ["empty", "stale", "profile"]) {
    await t.test(mode, async subtest => {
      const f = fixture(subtest);
      f.state.probeTransform = result => {
        if (mode === "empty") result.measurements = [];
        if (mode === "stale") result.measurements[0].textRevision = "0".repeat(64);
        if (mode === "profile") result.measurements[0].renderProfile.version = "different-renderer-version";
        return result;
      };
      const result = await f.refine(f.request);
      assert.equal(result.accepted, false);
      assert.equal(result.changedTextBoxes, 0);
      assert.equal(f.state.builds, 0);
      assertNoCandidateFiles(f.root);
    });
  }
});

test("contribution ranking probes at most four targets across the whole deck and skips empty pages", async t => {
  const f = fixture(t, 6), low = textBox(99);
  f.deck.pages.push({ pageIndex: 1, textBoxes: [low], shapes: [], images: [] });
  f.request.sourceImages.push(f.sourceFile);
  f.request.renderedImages.push(f.renderedFile);
  f.request.initialQuality.componentLocalMetrics.push({ pageIndex: 1, id: low.id, kind: "text", role: "text",
    severity: 2, pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2, contributionScore: 0.1, sufficientEvidence: true });
  fs.writeFileSync(f.deckFile, JSON.stringify(f.deck));
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(result.proposedTextBoxes, 4);
  assert.equal(f.state.probes, 1);
  assert.deepEqual(f.state.probeRequests[0].targetIds, ["label-0", "label-1", "label-2", "label-3"]);
  assert.deepEqual(result.deck.pages[1], f.deck.pages[1]);
});

test("a rejected four-text revision window admits the fifth text without reusing geometry evidence", async t => {
  const f = fixture(t, 5);
  f.state.probeTransform = result => ({ ...result, measurements: [] });
  const first = await f.refine(f.request);
  assert.equal(first.accepted, false);
  assert.equal(first.probedTextTargets.length, 4);
  assert.equal(f.state.builds, 0);
  f.state.probeTransform = null;
  const next = await f.refine({ ...f.request, targetHistory: first.probedTextTargets });
  assert.equal(next.accepted, true);
  assert.deepEqual(f.state.probeRequests[1].targetIds, ["label-4"]);
  assert.equal(next.probedTextTargets.length, 1);
  assert.equal(f.state.builds, 1);
});

test("cross-page renderer identity ignores page pixels and source hashes", async t => {
  const f = fixture(t), second = textBox(99);
  const secondSource = path.join(f.root, "source-2.png"), secondRendered = path.join(f.root, "rendered-2.png");
  fs.writeFileSync(secondSource, "different-source-image");
  fs.writeFileSync(secondRendered, "different-rendered-image");
  f.deck.pages.push({ pageIndex: 1, textBoxes: [second], shapes: [], images: [] });
  f.request.sourceImages.push(secondSource);
  f.request.renderedImages.push(secondRendered);
  f.request.initialQuality.componentLocalMetrics.push({ pageIndex: 1, id: second.id, kind: "text", role: "text",
    severity: 2, pixelDiffRatio: 0.4, foregroundMissingRatio: 0.2, contributionScore: 2, sufficientEvidence: true });
  fs.writeFileSync(f.deckFile, JSON.stringify(f.deck));
  f.state.probeTransform = (result, request) => {
    if (request.pageIndex === 1) {
      result.renderProfile.pixelWidth = 3840;
      result.renderProfile.pixelHeight = 2160;
      result.measurements = [];
    }
    return result;
  };
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(f.state.probes, 2);
  assert.notEqual(f.state.probeRequests[0].pageIndex, f.state.probeRequests[1].pageIndex);
});

test("unprobeable high-contribution text does not consume the four-target budget", async t => {
  const f = fixture(t, 6);
  f.texts[0].style.textWarp = "textPlain";
  f.texts[1].source.confidence = 0.89;
  const result = await f.refine(f.request);
  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 4);
  assert.deepEqual(f.state.probeRequests[0].targetIds, ["label-2", "label-3", "label-4", "label-5"]);
  assert.equal(f.state.builds, 1);
  assert.equal(f.state.verifies, 1);
});

test("the probe source hash must match the current regular source file", async t => {
  const mismatch = fixture(t);
  mismatch.state.probeTransform = result => ({ ...result, sourceHash: "f".repeat(64) });
  await assert.rejects(mismatch.refine(mismatch.request), /probe result is invalid/u);
  assert.equal(mismatch.state.builds, 0);

  const changed = fixture(t);
  changed.state.probeTransform = (result, request) => {
    fs.writeFileSync(request.sourceImage, "changed-source-image");
    return result;
  };
  await assert.rejects(changed.refine(changed.request), /source image changed/u);
  assert.equal(changed.state.builds, 0);
});

test("malformed requests, external paths and incomplete local metrics fail closed", async t => {
  const f = fixture(t);
  await assert.rejects(f.refine(null), TypeError);
  await assert.rejects(f.refine({ ...f.request, root: "relative" }), /root is invalid/u);
  await assert.rejects(f.refine({ ...f.request, sourceImages: [] }), /source images/u);
  await assert.rejects(f.refine({ ...f.request, renderedImages: ["relative"] }), /rendered image/u);
  await assert.rejects(f.refine({ ...f.request, sourceImages: [__filename] }), /outside the root/u);
  await assert.rejects(f.refine({ ...f.request, deck: { ...f.deck, pages: [] } }), /deck is invalid/u);
  f.state.verify = () => ({ ...quality(f.texts, 0.079), componentLocalMetrics: [] });
  await assert.rejects(f.refine(f.request), /local metrics are incomplete/u);
  assert.equal(f.state.builds, 1);
  assertNoCandidateFiles(f.root);
});

test("empty, oversized and symlinked inputs are rejected before probing", async t => {
  await t.test("empty", async subtest => {
    for (const field of ["deckFile", "pptxFile", "sourceFile", "renderedFile"]) {
      const f = fixture(subtest), file = f[field];
      fs.truncateSync(file, 0);
      await assert.rejects(f.refine(f.request), /is invalid/u);
      assert.equal(f.state.probes, 0);
    }
  });
  await t.test("oversized", async subtest => {
    const f = fixture(subtest);
    fs.truncateSync(f.sourceFile, 60 * 1024 * 1024 + 1);
    await assert.rejects(f.refine(f.request), /source image is invalid/u);
    assert.equal(f.state.probes, 0);
  });
  await t.test("file symlink", async subtest => {
    const f = fixture(subtest), link = path.join(f.root, "source-link.png");
    try { fs.symlinkSync(f.sourceFile, link, "file"); }
    catch (error) {
      if (record(error) && ["EPERM", "EACCES"].includes(String(error.code))) return subtest.skip("file symlinks unavailable");
      throw error;
    }
    await assert.rejects(f.refine({ ...f.request, sourceImages: [link] }), /source image is invalid/u);
    assert.equal(f.state.probes, 0);
  });
  await t.test("root symlink", async subtest => {
    const f = fixture(subtest), link = `${f.root}-link`;
    subtest.after(() => { if (fs.existsSync(link)) fs.unlinkSync(link); });
    try { fs.symlinkSync(f.root, link, "junction"); }
    catch (error) {
      if (record(error) && ["EPERM", "EACCES"].includes(String(error.code))) return subtest.skip("directory symlinks unavailable");
      throw error;
    }
    await assert.rejects(f.refine({ ...f.request, root: link }), /root is invalid/u);
    assert.equal(f.state.probes, 0);
  });
});

test("cancellation and callback failures propagate while candidate files are cleaned", async t => {
  for (const stage of ["cancel-before", "cancel-after-build", "build", "verify", "empty-output", "policy"]) {
    await t.test(stage, async subtest => {
      const f = fixture(subtest);
      fs.writeFileSync(path.join(f.root, "keep.txt"), "keep");
      if (stage === "cancel-before") f.state.cancel = true;
      if (stage === "cancel-after-build") f.request.buildCandidate = async ({ pptxFile }) => {
        f.state.builds++; fs.writeFileSync(pptxFile, "candidate"); f.state.cancel = true;
      };
      if (stage === "build") f.request.buildCandidate = async () => { throw new Error("build failed"); };
      if (stage === "verify") f.request.verifyCandidate = async () => { throw new Error("verify failed"); };
      if (stage === "empty-output") f.request.buildCandidate = async () => {};
      const refine = stage === "policy" ? createOwnedTextRefiner({ ...f.dependencies, qualityAcceptable: () => undefined }) : f.refine;
      await assert.rejects(refine(f.request), /cancelled|failed|candidate PPTX file|quality decision/u);
      assert.equal(fs.readFileSync(path.join(f.root, "keep.txt"), "utf8"), "keep");
      assertNoCandidateFiles(f.root);
    });
  }
});

test("dependency, audit and batch-size boundaries are explicit", async t => {
  const f = fixture(t);
  assert.throws(() => createOwnedTextRefiner(null), TypeError);
  assert.throws(() => createOwnedTextRefiner({ ...f.dependencies, probeOwnedTexts: null }), TypeError);
  assert.throws(() => createOwnedTextRefiner({ ...f.dependencies, qualityAcceptable: null }), TypeError);
  f.state.semanticPassed = false;
  const unsafe = await f.refine(f.request);
  assert.equal(unsafe.accepted, false);
  assert.equal(f.state.probes, 0);
  const tooManyPages = { ...f.deck, pages: Array.from({ length: 21 }, () => f.deck.pages[0]) };
  await assert.rejects(f.refine({ ...f.request, deck: tooManyPages }), /deck is invalid/u);
  const tooManyTexts = { ...f.deck, pages: [{ ...f.deck.pages[0], textBoxes: Array(2001).fill(null) }] };
  await assert.rejects(f.refine({ ...f.request, deck: tooManyTexts }), /page is invalid/u);
});
