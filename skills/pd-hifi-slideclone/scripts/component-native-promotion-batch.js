#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const {
  evaluatePromotion,
  readThresholds
} = require("./component-native-promotion-gate");

function parseArgs(argv = process.argv) {
  const args = {
    baselineMatrix: "",
    candidateMatrix: "",
    out: path.join("runs", "component-native-promotion-batch.json"),
    materializeDir: "",
    failOnReject: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--baseline-matrix" || arg === "--baseline") && next) {
      args.baselineMatrix = next;
      index += 1;
    } else if ((arg === "--candidate-matrix" || arg === "--candidate") && next) {
      args.candidateMatrix = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--materialize-dir" || arg === "--final-dir") && next) {
      args.materializeDir = next;
      index += 1;
    } else if (arg === "--fail-on-reject") {
      args.failOnReject = true;
    } else if (arg.startsWith("--")) {
      const key = arg.slice(2);
      if (next && !next.startsWith("--")) {
        args[key] = next;
        index += 1;
      } else {
        args[key] = "true";
      }
    } else {
      throw new Error(`Unknown component-native-promotion-batch argument: ${arg}`);
    }
  }
  if (!args.baselineMatrix) throw new Error("--baseline-matrix is required");
  if (!args.candidateMatrix) throw new Error("--candidate-matrix is required");
  return args;
}

function evaluatePromotionBatch(options = {}) {
  const baselineMatrixFile = requireFile(options.baselineMatrix, "--baseline-matrix");
  const candidateMatrixFile = requireFile(options.candidateMatrix, "--candidate-matrix");
  const baselineMatrix = readJson(baselineMatrixFile);
  const candidateMatrix = readJson(candidateMatrixFile);
  const thresholds = readThresholds(options);
  const baselineRows = rowsByDeck(baselineMatrix.rows || []);
  const candidateRows = rowsByDeck(candidateMatrix.rows || []);
  const decisions = [];
  const missingBaseline = [];
  for (const [deck, candidateRow] of candidateRows.entries()) {
    const baselineRow = baselineRows.get(deck);
    if (!baselineRow) {
      missingBaseline.push(deck);
      decisions.push({
        deck,
        promoted: false,
        reasons: ["missing-baseline-report"],
        baselineReport: null,
        candidateReport: candidateRow.reportFile || null,
        selectedSource: "none",
        selectedReport: null,
        selectedPptx: null
      });
      continue;
    }
    const baselineReport = readJson(baselineRow.reportFile);
    const candidateReport = readJson(candidateRow.reportFile);
    const decision = evaluatePromotion({
      baseline: baselineReport,
      candidate: candidateReport,
      thresholds
    });
    const selectedSource = decision.promoted ? "candidate" : "baseline";
    const selectedReport = selectedSource === "candidate" ? candidateRow.reportFile : baselineRow.reportFile;
    const selectedQuality = selectedSource === "candidate" ? candidateReport : baselineReport;
    decisions.push({
      deck,
      promoted: decision.promoted,
      reasons: decision.reasons,
      baselineReport: baselineRow.reportFile,
      candidateReport: candidateRow.reportFile,
      selectedSource,
      selectedReport,
      selectedPptx: selectedQuality.pptxFile ? path.resolve(String(selectedQuality.pptxFile)) : null,
      deltas: decision.deltas,
      baseline: decision.baseline,
      candidate: decision.candidate
    });
  }
  const promoted = decisions.filter((item) => item.promoted);
  const rejected = decisions.filter((item) => !item.promoted);
  const selectedCandidate = decisions.filter((item) => item.selectedSource === "candidate");
  const selectedBaseline = decisions.filter((item) => item.selectedSource === "baseline");
  const materialized = options.materializeDir
    ? materializeSelectedPptx(decisions, options.materializeDir)
    : null;
  return {
    provider: "component-native-promotion-batch-v1",
    generatedAt: new Date().toISOString(),
    baselineMatrix: baselineMatrixFile,
    candidateMatrix: candidateMatrixFile,
    thresholds,
    summary: {
      decks: decisions.length,
      promoted: promoted.length,
      rejected: rejected.length,
      missingBaseline: missingBaseline.length,
      selectedCandidate: selectedCandidate.length,
      selectedBaseline: selectedBaseline.length
    },
    promotedDecks: promoted.map((item) => item.deck),
    rejectedDecks: rejected.map((item) => item.deck),
    selectedDecks: decisions.map((item) => ({
      deck: item.deck,
      source: item.selectedSource,
      reportFile: item.selectedReport,
      pptxFile: item.selectedPptx
    })),
    ...(materialized ? { materialized } : {}),
    missingBaseline,
    decisions
  };
}

function materializeSelectedPptx(decisions = [], outDir = "") {
  const outputDir = path.resolve(String(outDir || ""));
  if (!outputDir) throw new Error("--materialize-dir is required");
  fs.mkdirSync(outputDir, { recursive: true });
  const files = [];
  const skipped = [];
  for (const decision of Array.isArray(decisions) ? decisions : []) {
    const deck = safeString(decision?.deck);
    const sourcePptx = decision?.selectedPptx ? path.resolve(String(decision.selectedPptx)) : "";
    if (!deck || !sourcePptx || !fs.existsSync(sourcePptx)) {
      skipped.push({
        deck,
        reason: sourcePptx ? "selected-pptx-not-found" : "no-selected-pptx",
        selectedSource: safeString(decision?.selectedSource),
        selectedPptx: sourcePptx || null
      });
      continue;
    }
    const fileName = `${safeFileStem(deck)}.native-editable.selected.pptx`;
    const outFile = path.join(outputDir, fileName);
    fs.copyFileSync(sourcePptx, outFile);
    files.push({
      deck,
      source: safeString(decision.selectedSource),
      promoted: decision.promoted === true,
      reasons: Array.isArray(decision.reasons) ? decision.reasons : [],
      sourcePptx,
      outFile,
      bytes: fs.statSync(outFile).size
    });
  }
  const manifest = {
    provider: "component-native-promotion-selected-pptx-materializer-v1",
    generatedAt: new Date().toISOString(),
    outputDir,
    summary: {
      files: files.length,
      skipped: skipped.length
    },
    files,
    skipped
  };
  const manifestFile = path.join(outputDir, "selected-pptx-manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return {
    outputDir,
    manifestFile,
    files: files.length,
    skipped: skipped.length
  };
}

function rowsByDeck(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const deck = safeString(row?.deck);
    if (!deck || map.has(deck)) continue;
    if (!row.reportFile || !fs.existsSync(path.resolve(String(row.reportFile)))) continue;
    map.set(deck, { ...row, reportFile: path.resolve(String(row.reportFile)) });
  }
  return map;
}

function requireFile(file, flagName) {
  if (!file) throw new Error(`${flagName} is required`);
  const resolved = path.resolve(String(file));
  if (!fs.existsSync(resolved)) throw new Error(`${flagName} not found: ${resolved}`);
  return resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.resolve(String(file)), "utf8").replace(/^\uFEFF/, ""));
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeFileStem(value) {
  return safeString(value)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/^\.+$/, "_")
    .slice(0, 120) || "deck";
}

function main() {
  try {
    const args = parseArgs(process.argv);
    const report = evaluatePromotionBatch(args);
    const out = path.resolve(args.out);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`${JSON.stringify({ summary: report.summary, reportFile: out }, null, 2)}\n`);
    if (args.failOnReject && report.summary.rejected > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  evaluatePromotionBatch,
  materializeSelectedPptx,
  parseArgs,
  rowsByDeck
};
