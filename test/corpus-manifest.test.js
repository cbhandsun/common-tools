"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  resolveCorpusCases,
  summarizeCorpusCoverage,
  validateCorpusManifest
} = require("../skills/pd-hifi-slideclone/scripts/lib/real-pptx-corpus");
const { applyFreshExecution, readTrendMetrics, resolveCorpusConcurrency, summarizeCorpusPerformance } = require("../skills/pd-hifi-slideclone/scripts/real-pptx-corpus-runner");

const root = path.resolve(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(root, "skills/pd-hifi-slideclone/examples/real-pptx-corpus.manifest.json"), "utf8"));
const golden = JSON.parse(fs.readFileSync(path.join(root, "skills/pd-hifi-slideclone/examples/golden-set.manifest.json"), "utf8"));

test("real PPTX corpus covers every required presentation family", () => {
  const resolved = resolveCorpusCases(corpus, golden);
  assert.equal(resolved.coverage.passed, true);
  assert.equal(resolved.coverage.categoryCount, 21);
  assert.equal(resolved.cases.length, 31);
  assert.equal(resolved.cases.find((item) => item.id === "system-map-hybrid").goldenCaseId, "complex-system-map-hybrid-real");
  assert.equal(resolved.cases.find((item) => item.id === "system-map-fidelity-sentinel").expect.maxPixelDiffRatio, 0.083);
  assert.equal(resolved.coverage.deckCount, 7);
});

test("chart corpus reports expose conservative complete trend metrics", () => {
  const directory = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "chart-trend-"));
  const reportFile = path.join(directory, "report.json");
  fs.writeFileSync(reportFile, JSON.stringify({
    pages: [
      { pixelDiffRatio: 0.04, foregroundMissingRatio: 0.05 },
      { pixelDiffRatio: 0.07, foregroundMissingRatio: 0.08 }
    ],
    nativeShapeCount: 27,
    pictureCount: 3
  }));
  assert.deepEqual(readTrendMetrics(reportFile), {
    pixelDiffRatio: 0.07,
    foregroundMissingRatio: 0.08,
    editableObjectRatio: 0.9,
    largestResidualAreaRatio: null
  });
});

test("corpus supports bounded suite and category selections", () => {
  const smoke = resolveCorpusCases(corpus, golden, {
    suites: ["smoke"],
    manifestSuites: corpus.suites,
    requireCoverage: false
  });
  assert.deepEqual(smoke.cases.map((item) => item.id), ["system-map-hybrid", "comparison-table", "process-network", "ui-screenshot"]);
  const systemMap = resolveCorpusCases(corpus, golden, { categories: ["system-map"], requireCoverage: false });
  assert.equal(systemMap.cases.length, 2);
  const full = resolveCorpusCases(corpus, golden, { suites: ["full"], manifestSuites: corpus.suites, requireCoverage: false });
  assert.equal(full.cases.length, 31);
  assert.equal(full.coverage.categoryCount, 21);
  assert.equal(Object.hasOwn(corpus.suites, "holdout"), false);
  assert.equal(full.cases.some((item) => item.corpusTags.includes("holdout")), false);
});

test("corpus validation fails closed for duplicate, unsafe, unknown, empty and extreme inputs", () => {
  assert.throws(() => validateCorpusManifest(null), /must be an object/);
  assert.throws(() => validateCorpusManifest({ id: "x", cases: [] }), /between 1 and 512/);
  assert.throws(() => validateCorpusManifest({ id: "../x", cases: [{}] }), /safe identifier/);
  assert.throws(() => validateCorpusManifest({ id: "x", cases: Array.from({ length: 513 }, () => ({})) }), /between 1 and 512/);
  const duplicate = { id: "x", requiredCategories: [], cases: [
    { id: "a", goldenCaseId: "one", category: "table" },
    { id: "a", goldenCaseId: "two", category: "table" }
  ] };
  assert.throws(() => validateCorpusManifest(duplicate), /Duplicate corpus case/);
  assert.throws(() => resolveCorpusCases({ id: "x", requiredCategories: ["table"], cases: [{ id: "a", goldenCaseId: "missing", category: "table" }] }, golden), /unknown golden case/);
  assert.throws(() => validateCorpusManifest({ id: "x", cases: [{ id: "a", goldenCaseId: "flow-baseline", category: "table", qualityExpect: { maxImages: 1 } }] }), /Unknown corpus quality expectations/);
});

test("coverage summary reports missing categories", () => {
  const coverage = summarizeCorpusCoverage([{ corpusCategory: "table", sourceDeck: "deck" }], ["table", "chart"]);
  assert.equal(coverage.passed, false);
  assert.deepEqual(coverage.missingCategories, ["chart"]);
});

test("real PPTX corpus serializes Office cases unless isolated workers are explicitly enabled", () => {
  assert.equal(resolveCorpusConcurrency(undefined, false), 1);
  assert.equal(resolveCorpusConcurrency(8, false), 1);
  assert.equal(resolveCorpusConcurrency(8, true), 8);
  assert.equal(resolveCorpusConcurrency(99, true), 8);
});

test("fresh corpus execution disables reuse only for golden commands that support force", () => {
  const cases = [
    { id: "golden", command: ["node", "skills/pd-hifi-slideclone/scripts/complex-graphic-golden-smoke.js", "--deck", "safe"] },
    { id: "chart", command: ["node", "scripts/chart-native-render-golden.js"] }
  ];
  const fresh = applyFreshExecution(cases, true);
  assert.equal(fresh[0].command.at(-1), "--force");
  assert.equal(fresh[1].command.includes("--force"), false);
  assert.equal(cases[0].command.includes("--force"), false);
  assert.throws(() => applyFreshExecution([{ command: [] }], true), /command is invalid/);
});

test("real PPTX corpus reports bounded latency percentiles for trend evidence", () => {
  assert.deepEqual(summarizeCorpusPerformance([
    { elapsedMs: 300 }, { elapsedMs: 100 }, { elapsedMs: 200 }, { elapsedMs: -1 }, { elapsedMs: "invalid" }
  ]), {
    measuredCases: 3,
    totalElapsedMs: 600,
    averageElapsedMs: 200,
    p50ElapsedMs: 200,
    p95ElapsedMs: 300,
    maxElapsedMs: 300
  });
  assert.throws(() => summarizeCorpusPerformance(Array.from({ length: 10001 })), /bounded array/);
});
