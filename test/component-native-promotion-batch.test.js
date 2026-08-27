"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  evaluatePromotionBatch,
  materializeSelectedPptx,
  parseArgs,
  rowsByDeck
} = require("../skills/pd-hifi-slideclone/scripts/component-native-promotion-batch");

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return file;
}

function qualityReport(overrides = {}) {
  return {
    passed: true,
    summary: { pages: 2, accepted: 2, needsReview: 0, rejected: 0, passed: true },
    deckMetrics: { pixelDiffRatio: 0.08, foregroundMissingRatio: 0.14 },
    editabilityProfile: {
      editableObjectRatio: 0.94,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 4,
      actionableNonEditableImages: 0
    },
    componentStrategyProfile: {
      componentTemplateCropReplacedImages: 0,
      componentTemplateCropPreservedImages: 1
    },
    componentTemplateCropStatus: {
      retainedImages: 1,
      actionableRetainedImages: 1
    },
    ...overrides
  };
}

test("component native promotion batch parses matrix args and thresholds", () => {
  const args = parseArgs([
    "node",
    "component-native-promotion-batch.js",
    "--baseline-matrix", "baseline.json",
    "--candidate-matrix", "candidate.json",
    "--out", "out.json",
    "--materialize-dir", "final",
    "--require-actionable-retained-reduction",
    "--fail-on-reject"
  ]);

  assert.equal(args.baselineMatrix, "baseline.json");
  assert.equal(args.candidateMatrix, "candidate.json");
  assert.equal(args.out, "out.json");
  assert.equal(args.materializeDir, "final");
  assert.equal(args["require-actionable-retained-reduction"], "true");
  assert.equal(args.failOnReject, true);
});

test("component native promotion batch promotes only candidates with visual-safe actionable reductions", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-batch-"));
  const baseA = writeJson(path.join(tmp, "base-a.json"), qualityReport());
  const baseB = writeJson(path.join(tmp, "base-b.json"), qualityReport());
  const candA = writeJson(path.join(tmp, "cand-a.json"), qualityReport({
    deckMetrics: { pixelDiffRatio: 0.081, foregroundMissingRatio: 0.141 },
    editabilityProfile: {
      editableObjectRatio: 0.96,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 3,
      actionableNonEditableImages: 0
    },
    componentTemplateCropStatus: {
      retainedImages: 0,
      actionableRetainedImages: 0
    }
  }));
  const candB = writeJson(path.join(tmp, "cand-b.json"), qualityReport({
    passed: false,
    summary: { pages: 2, accepted: 1, needsReview: 0, rejected: 1, passed: false },
    deckMetrics: { pixelDiffRatio: 0.2, foregroundMissingRatio: 0.4 },
    componentTemplateCropStatus: {
      retainedImages: 0,
      actionableRetainedImages: 0
    }
  }));
  const baselineMatrix = writeJson(path.join(tmp, "baseline-matrix.json"), {
    rows: [
      { deck: "Deck_A", reportFile: baseA },
      { deck: "Deck_B", reportFile: baseB }
    ]
  });
  const candidateMatrix = writeJson(path.join(tmp, "candidate-matrix.json"), {
    rows: [
      { deck: "Deck_A", reportFile: candA },
      { deck: "Deck_B", reportFile: candB },
      { deck: "Deck_C", reportFile: candA }
    ]
  });

  const report = evaluatePromotionBatch({
    baselineMatrix,
    candidateMatrix,
    "require-actionable-retained-reduction": "true"
  });

  assert.deepEqual(report.summary, {
    decks: 3,
    promoted: 1,
    rejected: 2,
    missingBaseline: 1,
    selectedCandidate: 1,
    selectedBaseline: 1
  });
  assert.deepEqual(report.promotedDecks, ["Deck_A"]);
  assert.equal(report.decisions.find((item) => item.deck === "Deck_A").selectedSource, "candidate");
  assert.equal(report.decisions.find((item) => item.deck === "Deck_B").selectedSource, "baseline");
  assert.equal(report.decisions.find((item) => item.deck === "Deck_C").selectedSource, "none");
  assert.ok(report.decisions.find((item) => item.deck === "Deck_B").reasons.includes("candidate-has-rejected-pages"));
  assert.deepEqual(report.decisions.find((item) => item.deck === "Deck_C").reasons, ["missing-baseline-report"]);
  assert.deepEqual(report.selectedDecks.map((item) => [item.deck, item.source]), [
    ["Deck_A", "candidate"],
    ["Deck_B", "baseline"],
    ["Deck_C", "none"]
  ]);
});

test("component native promotion batch records selected PPTX from the promoted or fallback report", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-batch-selected-"));
  const basePptx = path.join(tmp, "base.pptx");
  const candPptx = path.join(tmp, "candidate.pptx");
  const base = writeJson(path.join(tmp, "base.json"), qualityReport({ pptxFile: basePptx }));
  const cand = writeJson(path.join(tmp, "cand.json"), qualityReport({
    pptxFile: candPptx,
    deckMetrics: { pixelDiffRatio: 0.25, foregroundMissingRatio: 0.35 },
    editabilityProfile: {
      editableObjectRatio: 1,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 0,
      actionableNonEditableImages: 0
    },
    componentTemplateCropStatus: {
      retainedImages: 0,
      actionableRetainedImages: 0
    }
  }));
  const baselineMatrix = writeJson(path.join(tmp, "baseline-matrix.json"), {
    rows: [{ deck: "Deck_A", reportFile: base }]
  });
  const candidateMatrix = writeJson(path.join(tmp, "candidate-matrix.json"), {
    rows: [{ deck: "Deck_A", reportFile: cand }]
  });

  const report = evaluatePromotionBatch({
    baselineMatrix,
    candidateMatrix,
    "require-actionable-retained-reduction": "true"
  });
  const decision = report.decisions[0];

  assert.equal(decision.promoted, false);
  assert.equal(decision.selectedSource, "baseline");
  assert.equal(decision.selectedReport, path.resolve(base));
  assert.equal(decision.selectedPptx, path.resolve(basePptx));
});

test("component native promotion batch materializes selected PPTX deliverables", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-batch-materialize-"));
  const basePptx = path.join(tmp, "base deck.pptx");
  const candPptx = path.join(tmp, "candidate.pptx");
  fs.writeFileSync(basePptx, "baseline pptx", "utf8");
  fs.writeFileSync(candPptx, "candidate pptx", "utf8");
  const outDir = path.join(tmp, "final");

  const materialized = materializeSelectedPptx([
    {
      deck: "Deck A",
      promoted: false,
      reasons: ["candidate-pixel-diff-regression"],
      selectedSource: "baseline",
      selectedPptx: basePptx
    },
    {
      deck: "Deck/B",
      promoted: true,
      reasons: [],
      selectedSource: "candidate",
      selectedPptx: candPptx
    },
    {
      deck: "Deck C",
      promoted: false,
      reasons: ["missing-baseline-report"],
      selectedSource: "none",
      selectedPptx: null
    }
  ], outDir);

  assert.equal(materialized.files, 2);
  assert.equal(materialized.skipped, 1);
  assert.equal(fs.readFileSync(path.join(outDir, "Deck_A.native-editable.selected.pptx"), "utf8"), "baseline pptx");
  assert.equal(fs.readFileSync(path.join(outDir, "Deck_B.native-editable.selected.pptx"), "utf8"), "candidate pptx");
  const manifest = JSON.parse(fs.readFileSync(materialized.manifestFile, "utf8"));
  assert.equal(manifest.summary.files, 2);
  assert.equal(manifest.summary.skipped, 1);
  assert.equal(manifest.files[0].source, "baseline");
  assert.equal(manifest.files[1].source, "candidate");
  assert.equal(manifest.skipped[0].reason, "no-selected-pptx");
});

test("component native promotion batch can materialize during batch evaluation", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-batch-materialize-eval-"));
  const basePptx = path.join(tmp, "base.pptx");
  const candPptx = path.join(tmp, "cand.pptx");
  fs.writeFileSync(basePptx, "base", "utf8");
  fs.writeFileSync(candPptx, "cand", "utf8");
  const base = writeJson(path.join(tmp, "base.json"), qualityReport({ pptxFile: basePptx }));
  const cand = writeJson(path.join(tmp, "cand.json"), qualityReport({
    pptxFile: candPptx,
    deckMetrics: { pixelDiffRatio: 0.081, foregroundMissingRatio: 0.141 },
    editabilityProfile: {
      editableObjectRatio: 0.96,
      actionableEditableObjectRatio: 1,
      nonEditableImages: 3,
      actionableNonEditableImages: 0
    },
    componentTemplateCropStatus: {
      retainedImages: 0,
      actionableRetainedImages: 0
    }
  }));
  const baselineMatrix = writeJson(path.join(tmp, "baseline-matrix.json"), {
    rows: [{ deck: "Deck_A", reportFile: base }]
  });
  const candidateMatrix = writeJson(path.join(tmp, "candidate-matrix.json"), {
    rows: [{ deck: "Deck_A", reportFile: cand }]
  });
  const finalDir = path.join(tmp, "selected");

  const report = evaluatePromotionBatch({
    baselineMatrix,
    candidateMatrix,
    materializeDir: finalDir,
    "require-actionable-retained-reduction": "true"
  });

  assert.equal(report.materialized.files, 1);
  assert.equal(fs.readFileSync(path.join(finalDir, "Deck_A.native-editable.selected.pptx"), "utf8"), "cand");
});

test("component native promotion batch indexes only rows with readable reports", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "promotion-batch-rows-"));
  const reportFile = writeJson(path.join(tmp, "deck.json"), qualityReport());
  const rows = rowsByDeck([
    { deck: "Deck_A", reportFile },
    { deck: "Deck_A", reportFile: path.join(tmp, "duplicate.json") },
    { deck: "Deck_B", reportFile: path.join(tmp, "missing.json") }
  ]);

  assert.equal(rows.size, 1);
  assert.equal(rows.get("Deck_A").reportFile, path.resolve(reportFile));
});
