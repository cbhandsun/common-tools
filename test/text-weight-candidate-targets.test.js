"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { textWeightCandidateTargets } = require("../packages/slideclone-core/text-weight-candidate-targets");
const { tryBuildFinalWorstTextWeightCandidate } = require("../packages/slideclone-worker-adapter/team-worker");

const row = (id, score = 0) => ({ id, contributionScore: score, pageIndex: 0, kind: "text", role: "text" });
test("isolated text weight targets rank contribution, deduplicate and preserve stable ties", () => {
  const quality = { componentWorst: [row("tiny", 1), row("large", 100), row("tied", 1), row("large", 50)] };
  const before = structuredClone(quality);
  assert.deepEqual(textWeightCandidateTargets(quality), ["0:large", "0:tiny", "0:tied"]);
  assert.deepEqual(quality, before);
  assert.equal(textWeightCandidateTargets({ componentWorst: Array.from({ length: 30 }, (_, i) => row(`text-${i}`, i)) }).length, 8);
});
test("target selection rejects malformed, unsafe, non-text and excessive evidence", () => {
  for (const quality of [null, {}, { componentWorst: [] }, { componentWorst: new Array(20001) }]) {
    assert.deepEqual(textWeightCandidateTargets(quality), []);
  }
  const rows = [null, { ...row("shape"), kind: "shape" }, { ...row("private\0") }, row("x".repeat(257)),
    { ...row("wrong"), pageIndex: -1 }, { ...row("wrong"), pageIndex: 50 }, { ...row("wrong"), pageIndex: "0" }];
  assert.deepEqual(textWeightCandidateTargets({ componentWorst: rows }), []);
  assert.deepEqual(textWeightCandidateTargets({ componentWorst: [row("a", NaN), row("b", -1), row("c", "999")] }), ["0:a", "0:b", "0:c"]);
});

test("isolated body weight improvement survives a batch title regression without weakening gates", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "isolated-text-weight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deck = { version: "1.0", slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ pageIndex: 0, textBoxes: ["title", "body"].map((id, i) => ({ id, text: `${id} content`,
      box: { x: 10, y: 20 + i * 100, w: 200, h: 30 }, font: { sizePt: 20, weight: "bold" }, source: { editable: true } })), shapes: [], images: [] }] };
  const quality = { checks: [{ name: "quality-rendered", passed: true }, { name: "visual-fidelity", passed: false }],
    metrics: { "pixel-diff-ratio": 0.11, "foreground-missing-ratio": 0.08, "mean-absolute-delta": 14,
      "component-regions-attention": 2, "worst-component-normalized-severity": 4 }, componentWorst: [row("title", 1000), row("body", 500)] };
  let bodyOnly = 0;
  const result = await tryBuildFinalWorstTextWeightCandidate({ root, metadata: { generatedDeck: deck }, sourceImages: [], visualQuality: quality,
    isCancellationRequested: async () => false, runBuild: async ({ pptxFile }) => fs.writeFileSync(pptxFile, "test-artifact"),
    rawImageQualityVerifier: async ({ deck: candidate }) => {
      const texts = candidate.pages[0].textBoxes;
      const improves = texts[0].font.weight === "bold" && texts[1].font.weight === "regular";
      if (improves) bodyOnly++;
      return { ...quality, metrics: { ...quality.metrics, "pixel-diff-ratio": improves ? 0.10 : 0.12,
        "foreground-missing-ratio": improves ? 0.07 : 0.09, "mean-absolute-delta": improves ? 13 : 15 } };
    }
  });
  assert.equal(result.accepted, true); assert.equal(result.changedTextBoxes, 1); assert.equal(bodyOnly, 1);
  assert.equal(result.deck.pages[0].textBoxes[0].font.weight, "bold");
  assert.equal(result.deck.pages[0].textBoxes[1].font.weight, "regular");
  assert.equal(deck.pages[0].textBoxes[1].font.weight, "bold");
});
