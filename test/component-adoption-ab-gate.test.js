"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  buildQualityMatrixArgs,
  buildRebuildArgs,
  inferVerifiedAssetRoots,
  parseArgs,
  runComponentAdoptionAbGate,
  splitDeckPages,
  summarizeCandidateAdoption
} = require("../skills/pd-hifi-slideclone/scripts/component-adoption-ab-gate");

test("component adoption A/B gate keeps the baseline component-free and limits the candidate to promoted assets", () => {
  const baseline = buildRebuildArgs({
    workRoot: "input",
    out: "baseline",
    qualityRoot: "quality-baseline",
    deck: "Deck_A",
    renderer: "powerpoint",
    maxPages: 2,
    pptxEngine: "openxml"
  });
  const candidate = buildRebuildArgs({
    workRoot: "input",
    out: "candidate",
    qualityRoot: "quality-candidate",
    deck: "Deck_A",
    renderer: "powerpoint",
    maxPages: 2,
    pptxEngine: "openxml",
    candidate: true,
    componentGroupMatchMinScore: 72,
    promotionReports: ["promoted.json"]
  });

  assert.equal(baseline.includes("--component-assets"), false);
  assert.ok(candidate.includes("--component-assets-promoted-only"));
  assert.ok(candidate.includes("--component-self-fidelity-report"));
  assert.ok(candidate.includes("--replace-safe-component-template-crops"));
});

test("component adoption A/B gate sends named target pages to both rebuild variants", () => {
  const baseline = buildRebuildArgs({
    workRoot: "input",
    out: "baseline",
    qualityRoot: "quality-baseline",
    deck: "Deck_A",
    pages: "3,9",
    renderer: "powerpoint",
    maxPages: 2,
    pptxEngine: "openxml"
  });

  assert.equal(baseline[baseline.indexOf("--pages") + 1], "3,9");
  assert.deepEqual(splitDeckPages("PM_Portal_AI_Asset_Hub=3,9"), {
    deck: "PM_Portal_AI_Asset_Hub",
    pages: "3,9"
  });
  assert.throws(() => splitDeckPages("Deck_A=0"), /Invalid page selection/);
});

test("component adoption A/B gate dry run writes bounded commands without rebuilding decks", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-ab-gate-"));
  const verified = path.join(root, "isolated-collection", "verified", "islide");
  const promotion = path.join(root, "isolated-collection", "self-fidelity", "islide", "promotion.json");
  fs.mkdirSync(verified, { recursive: true });
  fs.mkdirSync(path.dirname(promotion), { recursive: true });
  fs.writeFileSync(promotion, JSON.stringify({ results: [] }), "utf8");

  const result = runComponentAdoptionAbGate({
    workRoot: path.join(root, "work"),
    out: path.join(root, "out"),
    decks: ["Deck_A", "Deck_A"],
    deckPages: { Deck_A: "2" },
    promotionReports: [promotion],
    dryRun: true
  });

  assert.equal(result.status, "planned");
  assert.deepEqual(result.decks, ["Deck_A"]);
  assert.equal(result.runs.length, 1);
  assert.equal(result.runs[0].pages, "2");
  assert.match(result.runs[0].baselineCommand, /--pages 2/);
  assert.match(result.runs[0].candidateCommand, /--component-assets-promoted-only/);
  assert.match(result.runs[0].candidateCommand, /--component-asset-root/);
  assert.ok(fs.existsSync(result.reportFile));
  const progress = JSON.parse(fs.readFileSync(path.join(root, "out", "component-adoption-ab-gate.progress.json"), "utf8"));
  assert.equal(progress.status, "planned");
  assert.equal(progress.stage, "complete");
});

test("component adoption A/B gate infers verified roots from promoted batch assets instead of batch names", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-ab-root-"));
  const verified = path.join(root, "isolated-collection", "verified", "islide");
  const promotion = path.join(root, "isolated-collection", "self-fidelity", "islide-arc-stroke-batch", "promotion.json");
  const asset = path.join(verified, "islide-flow.pptx");
  fs.mkdirSync(path.dirname(promotion), { recursive: true });
  fs.mkdirSync(verified, { recursive: true });
  fs.writeFileSync(promotion, JSON.stringify({
    promotedAssets: [{ file: asset }],
    results: [{ file: asset, passed: true }]
  }), "utf8");

  assert.deepEqual(inferVerifiedAssetRoots([promotion]), [verified]);
});

test("component adoption A/B gate requires a curated deck and promotion report", () => {
  assert.throws(() => parseArgs([process.execPath, "gate"]), /--deck/);
  assert.throws(() => parseArgs([process.execPath, "gate", "--deck", "Deck_A"]), /self-fidelity-report/);
});

test("component adoption A/B gate parses scoped page selections from the CLI", () => {
  const parsed = parseArgs([
    process.execPath,
    "gate",
    "--deck", "Deck_A",
    "--deck-pages", "Deck_A=2,4-5",
    "--component-self-fidelity-report", "promoted.json"
  ]);

  assert.deepEqual(parsed.deckPages, { Deck_A: "2,4-5" });
});

test("component adoption A/B gate passes both report lists to the regression matrix", () => {
  const args = buildQualityMatrixArgs({
    baselineReports: ["baseline-a.json", "baseline-b.json"],
    candidateReports: ["candidate-a.json", "candidate-b.json"],
    out: "matrix.json"
  });

  assert.equal(args[args.indexOf("--baseline-reports") + 1], "baseline-a.json;baseline-b.json");
  assert.equal(args[args.indexOf("--candidate-reports") + 1], "candidate-a.json;candidate-b.json");
  assert.ok(args.includes("--fail-on-regression"));
});

test("component adoption A/B gate rejects a visually safe candidate that applied no native component shapes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-adoption-proof-"));
  const report = path.join(root, "quality-gate-report.json");
  fs.writeFileSync(report, JSON.stringify({
    componentStrategyProfile: {
      componentTemplateAppliedShapes: 0,
      componentHighReusableGroupMatches: 8
    }
  }), "utf8");

  const adoption = summarizeCandidateAdoption([report], 1);

  assert.equal(adoption.passed, false);
  assert.equal(adoption.totals.componentTemplateAppliedShapes, 0);
  assert.equal(adoption.totals.componentHighReusableGroupMatches, 8);
});
