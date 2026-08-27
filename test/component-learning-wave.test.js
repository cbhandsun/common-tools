"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  TARGETS,
  buildLearningWave,
  buildLearningStatistics,
  extendLearningWave,
  initializeLearningWave,
  parseArgs,
  refreshLearningWave,
  renderLearningWaveGuide
} = require("../skills/pd-hifi-slideclone/scripts/component-learning-wave");

test("component learning wave contains a balanced high-frequency iSlide and OfficePLUS backlog", () => {
  const wave = buildLearningWave({ outDir: "runs/wave", provider: "all" });

  assert.equal(TARGETS.length, 20);
  assert.equal(wave.summary.total, 20);
  assert.deepEqual(wave.summary.byProvider, { islide: 10, officeplus: 10 });
  assert.ok(wave.tasks.every((task) => task.fixturePptx.includes("fixture")));
  assert.ok(wave.tasks.every((task) => task.ingestCommand.includes("--verify-fidelity")));
});

test("component learning wave filters providers and limits work without changing task order", () => {
  const wave = buildLearningWave({ outDir: "runs/wave", provider: "islide", limit: 3 });

  assert.equal(wave.summary.total, 3);
  assert.deepEqual(wave.tasks.map((task) => task.taskId), [
    "01-islide-arc-arrow-cycle",
    "02-islide-arc-arrow-turn",
    "03-islide-elbow-arrow"
  ]);
  assert.match(renderLearningWaveGuide(wave), /Do not use a business presentation/);
});

test("component learning wave writes isolated fixture copies and a replayable queue", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-wave-"));
  const wave = await initializeLearningWave({
    out: tmp,
    provider: "officeplus",
    limit: 2,
    initializeCollection: async ({ paths }) => {
      fs.mkdirSync(paths.fixtureDir, { recursive: true });
      fs.writeFileSync(paths.fixturePptx, "blank fixture");
      return { fixturePptx: paths.fixturePptx };
    }
  });

  assert.equal(wave.summary.total, 2);
  assert.equal(fs.existsSync(path.join(tmp, "learning-wave.json")), true);
  assert.equal(fs.existsSync(path.join(tmp, "learning-wave.md")), true);
  assert.ok(wave.tasks.every((task) => fs.existsSync(task.fixturePptx)));
  assert.throws(() => parseArgs(["node", "wave.js", "--init", "--provider", "unknown"]), /must be all/);
});

test("component learning wave refreshes task status from verified component manifests", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-refresh-"));
  const wave = buildLearningWave({ outDir: tmp, provider: "islide", limit: 2 });
  fs.mkdirSync(path.join(tmp, "verified", "islide"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "learning-wave.json"), JSON.stringify(wave));
  fs.writeFileSync(path.join(tmp, "verified", "islide", "manifest.json"), JSON.stringify({
    components: [{
      name: "cycle.pptx",
      path: path.join(tmp, "cycle.pptx"),
      sha256: "a".repeat(64),
      collection: { label: "01-islide-arc-arrow-cycle" },
      selfFidelityPromoted: true,
      roleTags: ["self-fidelity-promoted"]
    }, {
      name: "seed.pptx",
      path: path.join(tmp, "seed.pptx"),
      sha256: "b".repeat(64),
      collection: { label: "seed-asset" }
    }]
  }));

  const refreshed = refreshLearningWave({ out: tmp });
  assert.equal(refreshed.wave.summary.status.promoted, 1);
  assert.equal(refreshed.wave.summary.status.pending, 1);
  assert.equal(refreshed.statistics.unmatchedVerifiedAssets.length, 1);
  assert.equal(fs.existsSync(path.join(tmp, "learning-statistics.json")), true);
  assert.equal(buildLearningStatistics(refreshed.wave, []).byProvider.islide.promoted, 1);
  assert.ok(parseArgs(["node", "wave.js", "--refresh"]).refresh);
});

test("component learning wave extends an existing queue with real-deck gap targets without changing prior tasks", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-learning-extend-"));
  const wave = buildLearningWave({ outDir: tmp, provider: "islide", limit: 1 });
  fs.mkdirSync(path.join(tmp, "fixture"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "fixture", "collection-fixture.pptx"), "blank fixture");
  fs.writeFileSync(path.join(tmp, "learning-wave.json"), JSON.stringify(wave));

  const result = await extendLearningWave({ out: tmp, provider: "officeplus", limit: 1 });

  assert.equal(result.appended.length, 1);
  assert.equal(result.appended[0].id, "topology-triangle");
  assert.equal(result.appended[0].provider, "officeplus");
  assert.equal(result.wave.tasks[0].taskId, "01-islide-arc-arrow-cycle");
  assert.equal(fs.existsSync(result.appended[0].fixturePptx), true);
  assert.ok(parseArgs(["node", "wave.js", "--extend", "--provider", "islide"]).extend);
  assert.throws(() => parseArgs(["node", "wave.js", "--init", "--extend"]), /only one/);
});

test("component learning statistics separately report promoted asset motif coverage", () => {
  const statistics = buildLearningStatistics({ tasks: [] }, [{
    provider: "islide",
    selfFidelityPromoted: true,
    learningSummary: {
      componentCatalog: [{ structure: { motifs: ["radial-link", "tree-link"] } }]
    }
  }]);

  assert.deepEqual(statistics.assetCoverageByMotif["radial-link"], {
    verifiedAssets: 1,
    promotedAssets: 1,
    providers: ["islide"]
  });
  assert.equal(statistics.assetCoverageByMotif["tree-link"].promotedAssets, 1);
});

test("component learning statistics retain accepted and preflight-rejected ingest evidence", () => {
  const statistics = buildLearningStatistics({ tasks: [{ taskId: "01-islide-arc-arrow-cycle" }] }, [], [
    {
      provider: "islide",
      label: "01-islide-arc-arrow-cycle",
      acceptedCount: 1,
      rejectedCount: 0,
      rejectionReasons: []
    },
    {
      provider: "islide",
      label: "legacy-failed-download",
      acceptedCount: 0,
      rejectedCount: 1,
      rejectionReasons: ["invalid-pptx-zip-signature"]
    }
  ]);

  assert.deepEqual(statistics.ingestAttempts, {
    total: 2,
    accepted: 1,
    rejected: 1,
    preflightRejected: 1,
    unmatched: 1,
    byProvider: {
      islide: { total: 2, accepted: 1, rejected: 1, preflightRejected: 1 }
    }
  });
});

test("component learning statistics distinguish direct reuse from compatible promoted assets", () => {
  const statistics = buildLearningStatistics({ tasks: [
    { taskId: "arc", provider: "islide", status: "pending", targetMotifs: ["arc-arrow"] },
    { taskId: "flow", provider: "officeplus", status: "pending", targetMotifs: ["linear-arrow-chain"] },
    { taskId: "tree", provider: "islide", status: "pending", targetMotifs: ["tree-link"] }
  ] }, [
    {
      name: "cycle.pptx",
      provider: "islide",
      selfFidelityPromoted: true,
      learningSummary: { componentCatalog: [{ structure: { motifs: ["cycle-loop"] } }] }
    },
    {
      name: "flow.pptx",
      provider: "officeplus",
      selfFidelityPromoted: true,
      learningSummary: { componentCatalog: [{ structure: { motifs: ["linear-arrow-chain"] } }] }
    }
  ]);

  assert.deepEqual(statistics.adoptionCoverage, {
    totalTasks: 3,
    tasksWithPromotedAsset: 2,
    tasksWithDirectMotifAsset: 1,
    tasksWithoutPromotedAsset: 1
  });
  assert.deepEqual(statistics.adoptionSuggestions.find((item) => item.taskId === "arc").candidates[0].directMatches, []);
  assert.deepEqual(statistics.adoptionSuggestions.find((item) => item.taskId === "arc").candidates[0].compatibleMatches, ["arc-arrow"]);
  assert.deepEqual(statistics.adoptionSuggestions.find((item) => item.taskId === "flow").candidates[0].directMatches, ["linear-arrow-chain"]);
  assert.deepEqual(statistics.adoptionReady.map((item) => item.taskId), ["flow"]);
  assert.deepEqual(statistics.adoptionGaps, [{
    taskId: "tree",
    taskStatus: "pending",
    targetMotifs: ["tree-link"],
    reason: "no-fidelity-promoted-asset-for-target-motif"
  }]);
});
