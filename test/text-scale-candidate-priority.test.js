"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const test = require("node:test");
const { fitDeckWorstTextScale, tryBuildFinalWorstTextScaleCandidate } = require("../packages/slideclone-worker-adapter/team-worker");

function fixture() {
  return { slideSize: { widthPt: 960, heightPt: 540 }, pages: [{ textBoxes: ["tiny", "title", "body"].map((id, i) => ({
    id, text: `${id} content`, box: { x: 20, y: i * 50, w: 200, h: 40 },
    font: { family: "Microsoft YaHei", sizePt: i === 1 ? 34 : 16 }, source: { editable: true }
  })) }] };
}

function quality() {
  return { passed: false, checks: [{ name: "quality-rendered", passed: true }], metrics: {
    "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14,
    "component-regions-attention": 3, "worst-component-normalized-severity": 4 }, componentWorst:
    ["tiny", "title", "body"].map((id, i) => ({ pageIndex: 0, id, kind: "text", role: "text", contributionScore: [1, 10000, 500][i] })) };
}

test("editable text scaling preserves rich run formatting and scales explicit and inherited sizes once", () => {
  const deck = fixture();
  const text = deck.pages[0].textBoxes[1];
  text.runs = [
    { text: "title", font: { sizePt: 30, color: "#123456", weight: "bold" } },
    { text: " content", font: { color: "#654321" } }
  ];
  const before = structuredClone(deck);
  const fitted = fitDeckWorstTextScale(deck, { priorityIds: new Map([["0:title", 0]]), candidateLimit: 1, targetScale: 1.04 });
  const changed = fitted.deck.pages[0].textBoxes[1];
  assert.equal(changed.font.sizePt, 34 * 1.04);
  assert.equal(changed.runs[0].font.sizePt, 30 * 1.04);
  assert.equal(changed.runs[1].font.sizePt, 34 * 1.04);
  assert.equal(changed.runs[0].font.weight, "bold");
  assert.equal(changed.runs[1].font.color, "#654321");
  assert.deepEqual(changed.box, text.box);
  assert.deepEqual(changed.runs.map(run => run.text), text.runs.map(run => run.text));
  assert.deepEqual(deck, before);
});

test("scale search prioritizes visual contribution and admits a title-only improvement", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "scale-priority-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const baseline = quality();
  const deck = fixture();
  const attempts = [];
  const result = await tryBuildFinalWorstTextScaleCandidate({ root, metadata: { generatedDeck: deck }, sourceImages: [], visualQuality: baseline,
    targetScales: [1.04], candidateLimits: [1], isCancellationRequested: async () => false,
    runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"),
    rawImageQualityVerifier: async ({ deck: candidate }) => {
      attempts.push(candidate.pages[0].textBoxes.filter((item, i) => item.font.sizePt !== deck.pages[0].textBoxes[i].font.sizePt).map(item => item.id));
      return { ...baseline, metrics: { ...baseline.metrics, "pixel-diff-ratio": 0.10, "foreground-missing-ratio": 0.07, "mean-absolute-delta": 13 } };
    }
  });
  assert.deepEqual(attempts, [["title"]]);
  assert.equal(result.accepted, true);
  assert.equal(result.changedTextBoxes, 1);
  assert.equal(deck.pages[0].textBoxes[1].font.sizePt, 34);
});

test("scale search rejects identical, incomplete and regressing visual evidence with candidate cleanup", async t => {
  const baseline = quality();
  for (const candidate of [baseline, { ...baseline, metrics: {} }, { ...baseline, metrics: { ...baseline.metrics,
    "pixel-diff-ratio": 0.12, "foreground-missing-ratio": 0.09, "mean-absolute-delta": 15 } }]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scale-no-gain-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const result = await tryBuildFinalWorstTextScaleCandidate({ root, metadata: { generatedDeck: fixture() }, sourceImages: [], visualQuality: baseline,
      targetScales: [1.04], candidateLimits: [1], isCancellationRequested: async () => false,
      runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"), rawImageQualityVerifier: async () => candidate });
    assert.equal(result.accepted, false);
    assert.deepEqual(fs.readdirSync(root), []);
  }
});

test("scale search filters invalid or excessive search values without invoking the builder", async () => {
  let builds = 0;
  const result = await tryBuildFinalWorstTextScaleCandidate({ root: "unused", metadata: { generatedDeck: fixture() }, sourceImages: [], visualQuality: quality(),
    targetScales: [NaN, Infinity, -1, 0.01, 100, "1.04"], candidateLimits: [1, 0, -1, 100000, Infinity, "1"],
    isCancellationRequested: async () => false, runBuild: async () => { builds++; }, rawImageQualityVerifier: async () => quality() });
  assert.equal(result.accepted, false);
  assert.equal(builds, 0);
});

test("scale search respects cancellation before building and handles an empty text deck", async () => {
  const options = { root: "unused", metadata: { generatedDeck: fixture() }, sourceImages: [], visualQuality: quality(),
    targetScales: [1.04], candidateLimits: [1], isCancellationRequested: async () => true,
    runBuild: async () => { throw new Error("unexpected build"); }, rawImageQualityVerifier: async () => quality() };
  await assert.rejects(tryBuildFinalWorstTextScaleCandidate(options), /cancelled/u);
  const empty = await tryBuildFinalWorstTextScaleCandidate({ ...options, metadata: { generatedDeck: { pages: [{ textBoxes: [] }] } } });
  assert.equal(empty.accepted, false);
  assert.equal(empty.changedTextBoxes, 0);
});
