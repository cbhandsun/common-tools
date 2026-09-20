"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  buildComponentCoverageMatrix
} = require("../packages/slideclone-native-engine/scripts/lib/component-coverage-matrix");
const {
  buildImageToEditableComponentRecallReport,
  findDeckIrFiles,
  parseArgs,
  _private
} = require("../packages/slideclone-native-engine/scripts/image-to-editable-component-recall-report");

test("image-to-editable recall report adapts explicit IR for coverage matrix", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-explicit-"));
  const irFile = path.join(tmp, "deck.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  writeJson(irFile, deckWithComponentAnalysis());

  const report = buildImageToEditableComponentRecallReport({ irs: [irFile] });
  writeJson(reportFile, report);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(report.provider, "image-to-editable-component-recall-report-v1");
  assert.equal(report.summary.scannedIrFiles, 1);
  assert.equal(report.summary.includedIrFiles, 1);
  assert.equal(report.results[0].inputWorkDir, tmp);
  assert.equal(report.results[0].outputIr, irFile);
  assert.equal(report.results[0].status, "ir-built");
  assert.equal(matrix.totals.decks, 1);
  assert.equal(matrix.totals.imageComponentDetectedFamilyTypes, 2);
  assert.equal(matrix.totals.imageComponentMatchedFamilyTypes, 1);
  assert.equal(matrix.totals.imageComponentStrategyFamilyTypes, 1);
  assert.equal(matrix.totals.imageComponentMissingFamilyTypes, 1);
});

test("image-to-editable recall report scans root and skips IRs without component evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-root-"));
  const first = path.join(tmp, "first", "deck.json");
  const second = path.join(tmp, "second", "deck.ir.json");
  const missingEvidence = path.join(tmp, "third", "deck.json");
  const invalid = path.join(tmp, "fourth", "deck.json");
  const unsupportedEvidence = path.join(tmp, "fifth", "deck.json");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.mkdirSync(path.dirname(second), { recursive: true });
  fs.mkdirSync(path.dirname(missingEvidence), { recursive: true });
  fs.mkdirSync(path.dirname(invalid), { recursive: true });
  fs.mkdirSync(path.dirname(unsupportedEvidence), { recursive: true });
  writeJson(first, deckWithComponentAnalysis({ family: "relationship-network" }));
  writeJson(second, deckWithComponentAnalysis({ family: "process-flow" }));
  writeJson(missingEvidence, { pages: [{ images: [], shapes: [], textBoxes: [] }] });
  writeJson(invalid, { notPages: true });
  writeJson(unsupportedEvidence, {
    pages: [{ source: { componentAnalysis: { provider: "other", detectedComponentFamilyCounts: { "process-flow": 1 } } } }]
  });

  const report = buildImageToEditableComponentRecallReport({ root: tmp });

  assert.equal(report.summary.scannedIrFiles, 5);
  assert.equal(report.summary.includedIrFiles, 2);
  assert.equal(report.summary.skippedMissingComponentAnalysis, 2);
  assert.equal(report.summary.skippedInvalidIrFiles, 1);
  assert.deepEqual(report.results.map((item) => path.basename(path.dirname(item.outputIr))), ["first", "second"]);
});

test("image-to-editable recall report fails closed for explicit IR without consumable component evidence", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-missing-"));
  const irFile = path.join(tmp, "deck.json");
  writeJson(irFile, { pages: [{ source: { componentAnalysis: {} }, images: [], shapes: [], textBoxes: [] }] });

  assert.throws(
    () => buildImageToEditableComponentRecallReport({ irs: [irFile] }),
    /source\.componentAnalysis/u
  );
});

test("image-to-editable recall report rejects missing explicit IR files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-absent-"));

  assert.throws(
    () => buildImageToEditableComponentRecallReport({ irs: [path.join(tmp, "missing.json")] }),
    /IR file is unavailable/u
  );
});

test("image-to-editable recall report parses lists and finds bounded deck IR files", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-parse-"));
  const first = path.join(tmp, "a", "deck.json");
  const second = path.join(tmp, "b", "deck.ir.json");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.mkdirSync(path.dirname(second), { recursive: true });
  writeJson(first, deckWithComponentAnalysis());
  writeJson(second, deckWithComponentAnalysis());
  fs.writeFileSync(path.join(tmp, "other.json"), "{}\n", "utf8");

  const args = parseArgs(["node", "script", "--irs", "a.json;b.json", "--pptxs", "a.pptx,b.pptx", "--max-files", "12"]);

  assert.deepEqual(args.irs, ["a.json", "b.json"]);
  assert.deepEqual(args.pptxs, ["a.pptx", "b.pptx"]);
  assert.equal(args.maxFiles, "12");
  assert.deepEqual(findDeckIrFiles(tmp), [first, second]);
});

test("image-to-editable recall report infers sibling PPTX when present", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-pptx-"));
  const irFile = path.join(tmp, "deck.json");
  const pptxFile = path.join(tmp, "deck.pptx");
  writeJson(irFile, deckWithComponentAnalysis());
  fs.writeFileSync(pptxFile, "pptx");

  assert.equal(_private.inferSiblingPptx(irFile), pptxFile);
  assert.equal(buildImageToEditableComponentRecallReport({ irs: [irFile] }).results[0].outputPptx, pptxFile);
});

test("image-to-editable recall report preserves deck root for standard ir deck layout", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "image-recall-report-standard-root-"));
  const deckRoot = path.join(tmp, "ExampleDeck");
  const irFile = path.join(deckRoot, "ir", "deck.json");
  const candidateReport = path.join(deckRoot, "ExampleDeck.component-candidates.json");
  writeJson(irFile, deckWithComponentAnalysis());
  writeJson(candidateReport, { layers: [] });

  const report = buildImageToEditableComponentRecallReport({ irs: [irFile] });

  assert.equal(_private.deckRootForIr(irFile), deckRoot);
  assert.equal(report.results[0].inputWorkDir, deckRoot);
  assert.equal(report.results[0].componentCandidateReport, candidateReport);
});

function deckWithComponentAnalysis(options = {}) {
  const family = options.family || "process-flow";
  return {
    version: "1.0",
    pages: [{
      source: {
        componentAnalysis: {
          provider: "team-component-analysis-v1",
          preImages: 2,
          analysisLayers: 3,
          assetMatches: 2,
          strategyLayers: 1,
          assetLayers: 1,
          detectedComponentFamilyCounts: {
            [family]: 1,
            "matrix-table": family === "matrix-table" ? 0 : 1
          },
          matchedComponentFamilyCounts: { [family]: 1 },
          strategyComponentFamilyCounts: { [family]: 1 },
          missingComponentFamilyCounts: { "matrix-table": 1 },
          componentFamilies: [{
            family,
            detectedLayers: 1,
            matchedLayers: 1,
            assetMatches: 2,
            strategyLayers: 1,
            missingLayers: 0
          }]
        }
      },
      images: [],
      shapes: [],
      textBoxes: []
    }]
  };
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
