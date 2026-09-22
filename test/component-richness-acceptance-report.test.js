"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildComponentRichnessAcceptanceReport,
  parseArgs
} = require("../packages/slideclone-native-engine/scripts/component-richness-acceptance-report");

function createFixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-richness-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

test("component richness acceptance report joins component evidence sources", (t) => {
  const dir = createFixture(t);
  const coverage = path.join(dir, "coverage.json");
  const real = path.join(dir, "real.json");
  const image = path.join(dir, "image.json");
  const corpus = path.join(dir, "corpus.json");
  const admission = path.join(dir, "admission.json");
  writeJson(coverage, {
    passed: true,
    totals: {
      uniqueDecks: 2,
      componentFamilyAppliedTypes: 1,
      componentFamilyBacklog: [{
        family: "process-flow",
        priority: "critical",
        stage: "native-application-gap"
      }],
      componentFamilyActionPlan: [{
        family: "process-flow",
        ownerSurface: "native-editable-application"
      }]
    }
  });
  writeJson(real, {
    passed: true,
    totals: {
      uniqueDecks: 1,
      componentFamilyRegressionCases: [{
        deck: "Deck_A",
        family: "matrix-table",
        status: "native-covered"
      }]
    }
  });
  writeJson(image, {
    passed: true,
    totals: {
      imageComponentDetectedFamilyTypes: 1,
      imageComponentMatchedFamilyTypes: 1,
      imageComponentStrategyFamilyTypes: 1,
      imageComponentMissingFamilyTypes: 0,
      imageComponentFamilies: [{
        family: "process-flow",
        detectedLayers: 1,
        matchedLayers: 1,
        strategyLayers: 1,
        missingLayers: 0
      }]
    }
  });
  writeJson(corpus, {
    cases: [{
      id: "process-image",
      title: "Process image",
      expectedComponentFamilies: ["process-flow"],
      observedComponentFamilies: ["process-flow"],
      missingExpectedComponentFamilies: [],
      observedComponentFamilyEvidence: [{
        family: "process-flow",
        detectedLayers: 1,
        matchedLayers: 1
      }]
    }]
  });
  writeJson(admission, {
    passed: true,
    summary: {
      candidates: 1,
      admitted: 1,
      rejected: 0,
      componentFamilyTypes: 1,
      componentFamilyCounts: { "process-flow": 1 },
      missingRequiredComponentFamilies: []
    },
    componentFamilyAdmissionPlan: [{
      family: "process-flow",
      status: "admitted"
    }]
  });

  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: coverage,
    realPptxMatrix: real,
    imageRecallMatrix: image,
    imageRecallCorpus: corpus,
    admissionReport: admission,
    out: path.join(dir, "acceptance.json"),
    requireCoverageMatrix: true,
    requireImageRecall: true,
    requireRealPptxRegression: true,
    requireAssetAdmission: true,
    maxCriticalComponentFamilyBacklogItems: 1
  });

  assert.equal(report.provider, "component-richness-acceptance-report-v1");
  assert.equal(report.passed, true);
  assert.deepEqual(report.gateReasons, []);
  assert.equal(report.summary.providedEvidenceSources, 5);
  assert.equal(report.summary.criticalComponentFamilyBacklogItems, 1);
  assert.deepEqual(report.componentFamilyBacklog, [{
    family: "process-flow",
    priority: "critical",
    stage: "native-application-gap",
    source: "coverageMatrix"
  }]);
  assert.equal(report.componentFamilyRegressionCases[0].family, "matrix-table");
  assert.equal(report.imageRecall.matrixFamilies[0].family, "process-flow");
  assert.equal(report.imageRecall.corpusCases[0].observedComponentFamilyEvidence[0].family, "process-flow");
  assert.equal(report.componentFamilyAdmissionPlan[0].status, "admitted");
});

test("component richness acceptance report keeps missing optional sources non-fatal", (t) => {
  const dir = createFixture(t);
  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: path.join(dir, "missing-coverage.json"),
    realPptxMatrix: path.join(dir, "missing-real.json"),
    imageRecallMatrix: path.join(dir, "missing-image.json"),
    imageRecallCorpus: path.join(dir, "missing-corpus.json"),
    admissionReport: path.join(dir, "missing-admission.json"),
    out: path.join(dir, "acceptance.json")
  });

  assert.equal(report.passed, true);
  assert.equal(report.summary.providedEvidenceSources, 0);
  assert.equal(report.evidenceSources.coverageMatrix.status, "not-provided");
});

test("component richness acceptance report fails required missing evidence", (t) => {
  const dir = createFixture(t);
  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: path.join(dir, "missing-coverage.json"),
    realPptxMatrix: path.join(dir, "missing-real.json"),
    imageRecallMatrix: path.join(dir, "missing-image.json"),
    imageRecallCorpus: path.join(dir, "missing-corpus.json"),
    admissionReport: path.join(dir, "missing-admission.json"),
    out: path.join(dir, "acceptance.json"),
    requireCoverageMatrix: true,
    requireImageRecall: true,
    requireRealPptxRegression: true,
    requireAssetAdmission: true
  });

  assert.equal(report.passed, false);
  assert.ok(report.gateReasons.includes("coverage-matrix-not-provided"));
  assert.ok(report.gateReasons.includes("image-recall-evidence-not-provided"));
  assert.ok(report.gateReasons.includes("real-pptx-regression-cases-missing"));
  assert.ok(report.gateReasons.includes("asset-admission-not-provided"));
});

test("component richness acceptance report requires explicit passing mandatory reports", (t) => {
  const dir = createFixture(t);
  const coverage = path.join(dir, "coverage.json");
  const real = path.join(dir, "real.json");
  const admission = path.join(dir, "admission.json");
  writeJson(coverage, {});
  writeJson(real, {
    totals: {
      componentFamilyRegressionCases: [{ deck: "Deck_A", family: "process-flow" }]
    }
  });
  writeJson(admission, {});

  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: coverage,
    realPptxMatrix: real,
    imageRecallMatrix: path.join(dir, "missing-image.json"),
    imageRecallCorpus: path.join(dir, "missing-corpus.json"),
    admissionReport: admission,
    out: path.join(dir, "acceptance.json"),
    requireCoverageMatrix: true,
    requireRealPptxRegression: true,
    requireAssetAdmission: true
  });

  assert.equal(report.passed, false);
  assert.ok(report.gateReasons.includes("coverage-matrix-not-passing"));
  assert.ok(report.gateReasons.includes("real-pptx-matrix-not-passing"));
  assert.ok(report.gateReasons.includes("asset-admission-not-passing"));
});

test("component richness acceptance report requires passing image recall matrix", (t) => {
  const dir = createFixture(t);
  const corpus = path.join(dir, "corpus.json");
  writeJson(corpus, {
    cases: [{
      id: "image-plan-only",
      expectedComponentFamilies: ["process-flow"],
      observedComponentFamilyEvidence: [{ family: "process-flow" }]
    }]
  });

  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: path.join(dir, "missing-coverage.json"),
    realPptxMatrix: path.join(dir, "missing-real.json"),
    imageRecallMatrix: path.join(dir, "missing-image.json"),
    imageRecallCorpus: corpus,
    admissionReport: path.join(dir, "missing-admission.json"),
    out: path.join(dir, "acceptance.json"),
    requireImageRecall: true
  });

  assert.equal(report.passed, false);
  assert.ok(report.gateReasons.includes("image-recall-evidence-not-provided"));
});

test("component richness acceptance report accepts passing image recall matrix", (t) => {
  const dir = createFixture(t);
  const image = path.join(dir, "image.json");
  writeJson(image, {
    passed: true,
    totals: {
      imageComponentDetectedFamilyTypes: 1,
      imageComponentMatchedFamilyTypes: 1,
      imageComponentMissingFamilyTypes: 0,
      imageComponentFamilies: [{ family: "process-flow" }]
    }
  });

  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: path.join(dir, "missing-coverage.json"),
    realPptxMatrix: path.join(dir, "missing-real.json"),
    imageRecallMatrix: image,
    imageRecallCorpus: path.join(dir, "missing-corpus.json"),
    admissionReport: path.join(dir, "missing-admission.json"),
    out: path.join(dir, "acceptance.json"),
    requireImageRecall: true
  });

  assert.equal(report.passed, true);
  assert.deepEqual(report.gateReasons, []);
});

test("component richness acceptance report fails failed sources and backlog caps", (t) => {
  const dir = createFixture(t);
  const coverage = path.join(dir, "coverage.json");
  writeJson(coverage, {
    passed: false,
    totals: {
      componentFamilyBacklog: [
        { family: "process-flow", priority: "critical" },
        { family: "matrix-table", priority: "critical" }
      ]
    }
  });

  const report = buildComponentRichnessAcceptanceReport({
    coverageMatrix: coverage,
    realPptxMatrix: path.join(dir, "missing-real.json"),
    imageRecallMatrix: path.join(dir, "missing-image.json"),
    imageRecallCorpus: path.join(dir, "missing-corpus.json"),
    admissionReport: path.join(dir, "missing-admission.json"),
    out: path.join(dir, "acceptance.json"),
    maxCriticalComponentFamilyBacklogItems: 1
  });

  assert.equal(report.passed, false);
  assert.ok(report.gateReasons.includes("coverage-matrix-failed"));
  assert.ok(report.gateReasons.includes("critical-component-family-backlog-limit-exceeded"));
  assert.equal(report.summary.criticalComponentFamilyBacklogItems, 2);
});

test("component richness acceptance report parses CLI arguments", () => {
  const args = parseArgs([
    "--coverage-matrix", "runs/coverage.json",
    "--real-pptx-matrix", "runs/real.json",
    "--image-recall-matrix", "runs/image.json",
    "--image-recall-corpus", "runs/corpus.json",
    "--admission-report", "runs/admission.json",
    "--out", "runs/out.json",
    "--require-coverage-matrix",
    "--require-image-recall",
    "--require-real-pptx-regression",
    "--require-asset-admission",
    "--max-critical-component-family-backlog-items", "0"
  ]);

  assert.deepEqual(args, {
    coverageMatrix: "runs/coverage.json",
    realPptxMatrix: "runs/real.json",
    imageRecallMatrix: "runs/image.json",
    imageRecallCorpus: "runs/corpus.json",
    admissionReport: "runs/admission.json",
    out: "runs/out.json",
    requireCoverageMatrix: true,
    requireImageRecall: true,
    requireRealPptxRegression: true,
    requireAssetAdmission: true,
    maxCriticalComponentFamilyBacklogItems: 0
  });
});
