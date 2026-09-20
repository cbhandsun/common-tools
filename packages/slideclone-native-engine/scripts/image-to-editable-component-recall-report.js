"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { COMPONENT_FAMILY_IDS } = require("./lib/component-coverage-family");

const DEFAULT_ROOT = path.join("runs", "image-to-editable-component-recall");
const DEFAULT_OUT = path.join(DEFAULT_ROOT, "component-strategy-rebuild-report.json");
const MAX_SCAN_FILES = 500;
const IR_FILE_NAMES = new Set(["deck.json", "deck.ir.json"]);

function parseArgs(argv) {
  const args = {
    irs: [],
    pptxs: [],
    root: DEFAULT_ROOT,
    out: DEFAULT_OUT,
    maxFiles: MAX_SCAN_FILES
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--ir" && next) {
      args.irs.push(next);
      index += 1;
    } else if (arg === "--irs" && next) {
      args.irs.push(...splitList(next));
      index += 1;
    } else if (arg === "--pptx" && next) {
      args.pptxs.push(next);
      index += 1;
    } else if (arg === "--pptxs" && next) {
      args.pptxs.push(...splitList(next));
      index += 1;
    } else if (arg === "--root" && next) {
      args.root = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--max-files" && next) {
      args.maxFiles = next;
      index += 1;
    } else {
      throw new Error(`Unknown image-to-editable-component-recall-report argument: ${arg}`);
    }
  }
  return args;
}

function buildImageToEditableComponentRecallReport(options = {}) {
  const explicitIrFiles = normalizeInputFiles(options.irs);
  const explicit = explicitIrFiles.length > 0;
  const maxFiles = positiveInteger(options.maxFiles, MAX_SCAN_FILES);
  const candidates = explicit
    ? explicitIrFiles.map((file) => ({ file, explicit: true }))
    : findDeckIrFiles(options.root || DEFAULT_ROOT, maxFiles).map((file) => ({ file, explicit: false }));
  const results = [];
  const summary = {
    scannedIrFiles: candidates.length,
    includedIrFiles: 0,
    skippedMissingComponentAnalysis: 0,
    skippedInvalidIrFiles: 0
  };
  const pptxFiles = normalizeInputFiles(options.pptxs);

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const pptxFile = pptxFiles[index] || "";
    const result = resultForDeckIr(candidate.file, { explicit: candidate.explicit, pptxFile });
    if (result.status === "skipped-missing-component-analysis") {
      summary.skippedMissingComponentAnalysis += 1;
      continue;
    }
    if (result.status === "skipped-invalid-ir") {
      summary.skippedInvalidIrFiles += 1;
      continue;
    }
    results.push(result);
  }

  summary.includedIrFiles = results.length;
  if (results.length === 0) {
    throw new Error("No image-to-editable IR files with source.componentAnalysis evidence were found");
  }

  return {
    provider: "image-to-editable-component-recall-report-v1",
    generatedAt: new Date().toISOString(),
    summary,
    results
  };
}

function resultForDeckIr(file, options = {}) {
  const resolved = assertRegularFile(file, "IR file");
  let deck;
  try {
    deck = readJson(resolved);
  } catch {
    if (options.explicit) throw new Error("IR file is invalid JSON");
    return { status: "skipped-invalid-ir" };
  }
  try {
    assertDeckShape(deck);
  } catch (error) {
    if (options.explicit) throw error;
    return { status: "skipped-invalid-ir" };
  }
  if (!hasComponentAnalysisEvidence(deck)) {
    if (options.explicit) throw new Error("IR file does not contain source.componentAnalysis evidence");
    return { status: "skipped-missing-component-analysis" };
  }
  const outputPptx = options.pptxFile
    ? assertRegularFile(options.pptxFile, "PPTX file")
    : inferSiblingPptx(resolved);
  const candidateReport = inferSiblingCandidateReport(resolved);
  const result = {
    inputWorkDir: deckRootForIr(resolved),
    outputIr: resolved,
    outputPptx,
    status: "ir-built"
  };
  if (candidateReport) result.componentCandidateReport = candidateReport;
  return result;
}

function assertDeckShape(deck) {
  if (!deck || typeof deck !== "object" || Array.isArray(deck) || !Array.isArray(deck.pages) || deck.pages.length < 1 || deck.pages.length > 50) {
    throw new Error("IR file must contain a bounded deck with pages");
  }
}

function hasComponentAnalysisEvidence(deck) {
  return deck.pages.some((page) => {
    const evidence = page?.source?.componentAnalysis;
    return isConsumableComponentAnalysisEvidence(evidence);
  });
}

function isConsumableComponentAnalysisEvidence(evidence) {
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) return false;
  if (evidence.provider !== "team-component-analysis-v1") return false;
  return hasPositiveKnownFamilyCount(evidence.detectedComponentFamilyCounts)
    || hasPositiveKnownFamilyCount(evidence.matchedComponentFamilyCounts)
    || hasPositiveKnownFamilyCount(evidence.strategyComponentFamilyCounts)
    || hasPositiveKnownFamilyCount(evidence.missingComponentFamilyCounts)
    || hasKnownFamilyRow(evidence.componentFamilies);
}

function hasPositiveKnownFamilyCount(counts) {
  if (!counts || typeof counts !== "object" || Array.isArray(counts)) return false;
  return Object.entries(counts).some(([family, count]) => COMPONENT_FAMILY_IDS.includes(family) && Number(count) > 0);
}

function hasKnownFamilyRow(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some((row) => COMPONENT_FAMILY_IDS.includes(String(row?.family || "")));
}

function deckRootForIr(irFile) {
  const dir = path.dirname(irFile);
  return path.basename(dir).toLowerCase() === "ir" ? path.dirname(dir) : dir;
}

function findDeckIrFiles(root, limit = MAX_SCAN_FILES) {
  const resolvedRoot = path.resolve(root || DEFAULT_ROOT);
  if (!fs.existsSync(resolvedRoot)) return [];
  const stat = fs.lstatSync(resolvedRoot);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("IR root is not a readable directory");
  const out = [];
  const stack = [resolvedRoot];
  while (stack.length > 0 && out.length < limit) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && IR_FILE_NAMES.has(entry.name)) {
        out.push(full);
      }
      if (out.length >= limit) break;
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
}

function inferSiblingPptx(irFile) {
  const dir = deckRootForIr(irFile);
  const base = path.basename(irFile);
  const candidates = base === "deck.ir.json"
    ? ["deck.pptx", `${path.basename(dir)}.pptx`]
    : ["deck.pptx", "output.pptx"];
  for (const candidate of candidates) {
    const file = path.join(dir, candidate);
    if (fs.existsSync(file) && fs.lstatSync(file).isFile()) return file;
  }
  return "";
}

function inferSiblingCandidateReport(irFile) {
  const root = deckRootForIr(irFile);
  const candidates = [
    path.join(root, "deck.component-candidates.json"),
    path.join(root, `${path.basename(root)}.component-candidates.json`),
    path.join(path.dirname(irFile), "deck.component-candidates.json")
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) return candidate;
  }
  return "";
}

function normalizeInputFiles(value) {
  return asArray(value)
    .flatMap(splitList)
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function splitList(value) {
  if (Array.isArray(value)) return value.flatMap(splitList);
  return String(value || "")
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= MAX_SCAN_FILES ? number : fallback;
}

function assertRegularFile(file, label) {
  const resolved = path.resolve(String(file || ""));
  const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`${label} is unavailable`);
  return resolved;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs(process.argv);
  const report = buildImageToEditableComponentRecallReport(args);
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`scannedIrFiles: ${report.summary.scannedIrFiles}\n`);
  process.stdout.write(`includedIrFiles: ${report.summary.includedIrFiles}\n`);
  process.stdout.write(`skippedMissingComponentAnalysis: ${report.summary.skippedMissingComponentAnalysis}\n`);
  process.stdout.write(`report: ${path.resolve(args.out)}\n`);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${String(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_OUT,
  DEFAULT_ROOT,
  buildImageToEditableComponentRecallReport,
  findDeckIrFiles,
  main,
  parseArgs,
  _private: {
    hasComponentAnalysisEvidence,
    isConsumableComponentAnalysisEvidence,
    deckRootForIr,
    inferSiblingCandidateReport,
    inferSiblingPptx,
    resultForDeckIr
  }
};
