#!/usr/bin/env node
"use strict";

// Rebuild a small named golden set twice. The candidate run can only use
// components that passed isolated self-fidelity replay, then quality-matrix
// blocks regressions before those components are promoted to wider batches.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function parseArgs(argv = process.argv) {
  const args = {
    workRoot: path.join("ppt文档", "可编辑版本"),
    out: path.join("runs", "component-adoption-ab-gate"),
    decks: [],
    deckPages: {},
    promotionReports: [],
    componentAssetRoots: [],
    renderer: "powerpoint",
    maxPages: 2,
    minAdoptedNativeShapes: 1,
    componentGroupMatchMinScore: 72,
    pptxEngine: "openxml",
    dryRun: false,
    resume: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if ((arg === "--work-root" || arg === "--input") && next) {
      args.workRoot = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if ((arg === "--deck" || arg === "--only") && next) {
      args.decks.push(next);
      index += 1;
    } else if (arg === "--deck-pages" && next) {
      const { deck, pages } = splitDeckPages(next);
      args.deckPages[deck] = pages;
      index += 1;
    } else if (arg === "--component-self-fidelity-report" && next) {
      args.promotionReports.push(next);
      index += 1;
    } else if (arg === "--component-asset-root" && next) {
      args.componentAssetRoots.push(next);
      index += 1;
    } else if (arg === "--renderer" && next) {
      args.renderer = next;
      index += 1;
    } else if (arg === "--max-pages" && next) {
      args.maxPages = normalizePositiveInt(next, 2);
      index += 1;
    } else if (arg === "--min-adopted-native-shapes" && next) {
      args.minAdoptedNativeShapes = normalizeNonNegativeInt(next, 1);
      index += 1;
    } else if (arg === "--component-group-match-min-score" && next) {
      args.componentGroupMatchMinScore = normalizePositiveInt(next, 72);
      index += 1;
    } else if (arg === "--pptx-engine" && next) {
      args.pptxEngine = next;
      index += 1;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--resume") {
      args.resume = true;
    } else {
      throw new Error(`Unknown component-adoption-ab-gate argument: ${arg}`);
    }
  }
  args.decks = uniqueStrings(args.decks);
  args.deckPages = normalizeDeckPages(args.deckPages);
  args.promotionReports = uniqueStrings(args.promotionReports);
  args.componentAssetRoots = uniqueStrings(args.componentAssetRoots);
  if (args.decks.length === 0) throw new Error("At least one --deck is required; use a curated 3-5 deck golden set.");
  if (args.promotionReports.length === 0) {
    throw new Error("At least one --component-self-fidelity-report is required for the promoted-only candidate run.");
  }
  return args;
}

function buildRebuildArgs({ workRoot, out, deck, pages = "", qualityRoot, renderer, maxPages, candidate = false, promotionReports = [], componentAssetRoots = [], componentGroupMatchMinScore, pptxEngine }) {
  const args = [
    path.join(__dirname, "component-strategy-rebuild.js"),
    "--work-root", path.resolve(workRoot),
    "--out", path.resolve(out),
    "--only", deck,
    "--quality", "true",
    "--quality-root", path.resolve(qualityRoot),
    "--quality-renderer", renderer,
    "--quality-max-pages", String(normalizePositiveInt(maxPages, 2)),
    "--pptx-engine", safeEngine(pptxEngine)
  ];
  if (pages) args.push("--pages", pages);
  if (!candidate) return args;
  args.push(
    "--component-assets", "true",
    "--component-assets-promoted-only",
    "--objectify-component-group-matches", "true",
    "--component-group-match-min-score", String(normalizePositiveInt(componentGroupMatchMinScore, 72)),
    "--replace-safe-component-template-crops", "true"
  );
  for (const report of promotionReports) args.push("--component-self-fidelity-report", path.resolve(report));
  for (const root of componentAssetRoots) args.push("--component-asset-root", path.resolve(root));
  return args;
}

function buildQualityMatrixArgs({ baselineReports, candidateReports, out }) {
  return [
    path.join(__dirname, "real-pptx-quality-matrix.js"),
    "--baseline-reports", baselineReports.join(";"),
    "--candidate-reports", candidateReports.join(";"),
    "--out", path.resolve(out),
    "--fail-on-regression"
  ];
}

function runComponentAdoptionAbGate(args = {}) {
  const options = {
    ...parseArgsFromOptions(args),
    workRoot: path.resolve(args.workRoot || path.join("ppt文档", "可编辑版本")),
    out: path.resolve(args.out || path.join("runs", "component-adoption-ab-gate"))
  };
  ensureExistingFiles(options.promotionReports, "component self-fidelity report");
  const baselineOut = path.join(options.out, "baseline");
  const candidateOut = path.join(options.out, "promoted-candidate");
  const baselineQuality = path.join(options.out, "quality", "baseline");
  const candidateQuality = path.join(options.out, "quality", "promoted-candidate");
  const progressFile = path.join(options.out, "component-adoption-ab-gate.progress.json");
  const runs = [];
  const baselineReports = [];
  const candidateReports = [];

  writeProgress(progressFile, {
    status: options.dryRun ? "planned" : "running",
    stage: "initializing",
    totalDecks: options.decks.length,
    completedDecks: 0,
    promotedOnly: true
  });

  for (const [deckIndex, deck] of options.decks.entries()) {
    const pages = options.deckPages[deck] || "";
    const baseline = buildRebuildArgs({ ...options, out: baselineOut, deck, pages, qualityRoot: baselineQuality, candidate: false });
    const candidate = buildRebuildArgs({ ...options, out: candidateOut, deck, pages, qualityRoot: candidateQuality, candidate: true });
    if (options.dryRun) {
      runs.push({ deck, pages, baselineCommand: nodeCommand(baseline), candidateCommand: nodeCommand(candidate) });
      continue;
    }
    let baselineReport = tryFindQualityReport(baselineQuality, deck);
    let candidateReport = tryFindQualityReport(candidateQuality, deck);
    if (!(options.resume && baselineReport)) {
      writeProgress(progressFile, progressState("baseline", deck, deckIndex, options.decks.length));
      runNode(baseline, `baseline:${deck}`);
      baselineReport = findQualityReport(baselineQuality, deck);
    }
    if (!(options.resume && candidateReport)) {
      writeProgress(progressFile, progressState("promoted-candidate", deck, deckIndex, options.decks.length));
      runNode(candidate, `candidate:${deck}`);
      candidateReport = findQualityReport(candidateQuality, deck);
    }
    baselineReports.push(baselineReport);
    candidateReports.push(candidateReport);
    runs.push({ deck, pages, baselineReport, candidateReport });
    writeProgress(progressFile, progressState("deck-complete", deck, deckIndex + 1, options.decks.length));
  }

  const matrixFile = path.join(options.out, "component-adoption-ab-matrix.json");
  let matrix = null;
  let adoption = null;
  if (!options.dryRun) {
    writeProgress(progressFile, {
      status: "running",
      stage: "quality-matrix",
      totalDecks: options.decks.length,
      completedDecks: options.decks.length
    });
    runNode(buildQualityMatrixArgs({ baselineReports, candidateReports, out: matrixFile }), "quality-matrix");
    matrix = readJson(matrixFile);
    adoption = summarizeCandidateAdoption(candidateReports, options.minAdoptedNativeShapes);
  }
  const status = options.dryRun
    ? "planned"
    : matrix?.passed !== true
      ? "failed"
      : adoption?.passed === true ? "passed" : "failed-no-adoption";
  const summary = {
    provider: "component-adoption-ab-gate-v1",
    createdAt: new Date().toISOString(),
    status,
    workRoot: options.workRoot,
    promotedOnly: true,
    promotionReports: options.promotionReports.map((file) => path.resolve(file)),
    componentAssetRoots: options.componentAssetRoots,
    decks: options.decks,
    deckPages: options.deckPages,
    runs,
    ...(matrix ? { matrixFile, matrix: { passed: matrix.passed === true, totals: matrix.totals || {} } } : {}),
    ...(adoption ? { adoption } : {})
  };
  const reportFile = path.join(options.out, "component-adoption-ab-gate.json");
  writeJson(reportFile, summary);
  writeProgress(progressFile, {
    status: summary.status,
    stage: "complete",
    totalDecks: options.decks.length,
    completedDecks: options.decks.length,
    reportFile
  });
  return { ...summary, reportFile };
}

function parseArgsFromOptions(options = {}) {
  const decks = uniqueStrings(options.decks || []);
  const promotionReports = uniqueStrings(options.promotionReports || []);
  if (decks.length === 0) throw new Error("At least one golden deck is required.");
  if (promotionReports.length === 0) throw new Error("At least one component self-fidelity report is required.");
  const componentAssetRoots = uniqueStrings(options.componentAssetRoots || []);
  const inferredAssetRoots = componentAssetRoots.length > 0
    ? componentAssetRoots
    : inferVerifiedAssetRoots(promotionReports);
  if (inferredAssetRoots.length === 0) {
    throw new Error("Provide --component-asset-root when verified roots cannot be inferred from self-fidelity reports.");
  }
  ensureExistingDirectories(inferredAssetRoots, "verified component root");
  return {
    decks,
    deckPages: normalizeDeckPages(options.deckPages),
    promotionReports,
    componentAssetRoots: inferredAssetRoots,
    renderer: safeRenderer(options.renderer),
    maxPages: normalizePositiveInt(options.maxPages, 2),
    minAdoptedNativeShapes: normalizeNonNegativeInt(options.minAdoptedNativeShapes, 1),
    componentGroupMatchMinScore: normalizePositiveInt(options.componentGroupMatchMinScore, 72),
    pptxEngine: safeEngine(options.pptxEngine),
    dryRun: options.dryRun === true,
    resume: options.resume === true
  };
}

function splitDeckPages(value) {
  const text = String(value || "").trim();
  const separator = text.lastIndexOf("=");
  if (separator <= 0 || separator === text.length - 1) {
    throw new Error("--deck-pages must use Deck_Name=1,3 syntax.");
  }
  const deck = text.slice(0, separator).trim();
  const pages = normalizePageList(text.slice(separator + 1));
  if (!/^[A-Za-z0-9_-]{2,160}$/.test(deck)) {
    throw new Error(`Invalid --deck-pages deck name: ${deck}`);
  }
  return { deck, pages };
}

function normalizeDeckPages(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const entries = Object.entries(value)
    .map(([deck, pages]) => [String(deck || "").trim(), normalizePageList(pages)])
    .filter(([deck, pages]) => deck && pages);
  return Object.fromEntries(entries);
}

function normalizePageList(value) {
  const pages = String(value || "").trim();
  if (!/^[0-9][0-9,\s-]{0,79}$/.test(pages)) {
    throw new Error(`Invalid page list: ${pages || "(empty)"}`);
  }
  const normalized = pages.split(/[\s,]+/).filter(Boolean).map((part) => {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!match || Number(match[1]) < 1 || (match[2] && Number(match[2]) < Number(match[1]))) {
      throw new Error(`Invalid page selection: ${part}`);
    }
    return match[2] ? `${Number(match[1])}-${Number(match[2])}` : String(Number(match[1]));
  });
  if (normalized.length === 0) throw new Error("Page list cannot be empty.");
  return normalized.join(",");
}

function summarizeCandidateAdoption(reportFiles = [], minimum = 1) {
  const rows = reportFiles.map((file) => {
    const report = readJson(file);
    const profile = report.componentStrategyProfile || {};
    return {
      reportFile: file,
      componentTemplateAppliedImages: numberOrZero(profile.componentTemplateAppliedImages),
      componentTemplateAppliedShapes: numberOrZero(profile.componentTemplateAppliedShapes),
      componentTemplateAppliedTextBoxes: numberOrZero(profile.componentTemplateAppliedTextBoxes),
      componentTemplateAppliedPictures: numberOrZero(profile.componentTemplateAppliedPictures),
      componentHighReusableGroupMatches: numberOrZero(profile.componentHighReusableGroupMatches)
    };
  });
  const totals = rows.reduce((sum, row) => ({
    componentTemplateAppliedImages: sum.componentTemplateAppliedImages + row.componentTemplateAppliedImages,
    componentTemplateAppliedShapes: sum.componentTemplateAppliedShapes + row.componentTemplateAppliedShapes,
    componentTemplateAppliedTextBoxes: sum.componentTemplateAppliedTextBoxes + row.componentTemplateAppliedTextBoxes,
    componentTemplateAppliedPictures: sum.componentTemplateAppliedPictures + row.componentTemplateAppliedPictures,
    componentHighReusableGroupMatches: sum.componentHighReusableGroupMatches + row.componentHighReusableGroupMatches
  }), {
    componentTemplateAppliedImages: 0,
    componentTemplateAppliedShapes: 0,
    componentTemplateAppliedTextBoxes: 0,
    componentTemplateAppliedPictures: 0,
    componentHighReusableGroupMatches: 0
  });
  return {
    minimumAppliedNativeShapes: minimum,
    passed: totals.componentTemplateAppliedShapes >= minimum,
    totals,
    reports: rows
  };
}

function inferVerifiedAssetRoots(reports = []) {
  const roots = [];
  for (const report of reports) {
    const resolved = path.resolve(report);
    const reportedRoots = readVerifiedAssetRootsFromReport(resolved);
    if (reportedRoots.length > 0) {
      roots.push(...reportedRoots);
      continue;
    }
    const provider = path.basename(path.dirname(resolved));
    const selfFidelityRoot = path.dirname(path.dirname(resolved));
    if (path.basename(selfFidelityRoot).toLowerCase() !== "self-fidelity") continue;
    const legacyRoot = path.join(path.dirname(selfFidelityRoot), "verified", provider);
    if (fs.existsSync(legacyRoot) && fs.statSync(legacyRoot).isDirectory()) roots.push(legacyRoot);
  }
  return uniqueStrings(roots);
}

function readVerifiedAssetRootsFromReport(reportFile) {
  let report;
  try {
    report = readJson(reportFile);
  } catch {
    return [];
  }
  const assets = [
    ...(Array.isArray(report.promotedAssets) ? report.promotedAssets : []),
    ...(Array.isArray(report.results) ? report.results.filter((result) => result?.passed === true) : [])
  ];
  return uniqueStrings(assets.map((asset) => verifiedAssetRootForFile(asset?.file)).filter(Boolean));
}

function verifiedAssetRootForFile(file) {
  if (typeof file !== "string" || !path.isAbsolute(file)) return "";
  const parent = path.dirname(path.resolve(file));
  return path.basename(path.dirname(parent)).toLowerCase() === "verified" ? parent : "";
}

function progressState(stage, deck, completedDecks, totalDecks) {
  return {
    status: "running",
    stage,
    deck,
    totalDecks,
    completedDecks
  };
}

function findQualityReport(root, deck) {
  const exact = path.join(root, `${deck}-component-strategy-quality`, "quality-gate-report.json");
  if (!fs.existsSync(exact)) throw new Error(`Quality report was not produced for ${deck}: ${exact}`);
  return exact;
}

function tryFindQualityReport(root, deck) {
  const file = path.join(root, `${deck}-component-strategy-quality`, "quality-gate-report.json");
  return fs.existsSync(file) ? file : "";
}

function runNode(args, label) {
  process.stdout.write(`[component-adoption-ab] ${label} started\n`);
  const startedAt = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 50 * 1024 * 1024
  });
  if (result.status !== 0) throw new Error(`${label} failed: ${safeOutput(result.stderr || result.stdout || result.error)}`);
  process.stdout.write(`[component-adoption-ab] ${label} completed in ${Date.now() - startedAt}ms\n`);
}

function nodeCommand(args) {
  return [process.execPath, ...args].map(quoteShellToken).join(" ");
}

function quoteShellToken(value) {
  const text = String(value || "");
  return /[\s;]/.test(text) ? `"${text.replace(/"/g, "\\\"")}"` : text;
}

function ensureExistingFiles(files, label) {
  for (const file of files) {
    if (!fs.existsSync(path.resolve(file))) throw new Error(`Missing ${label}: ${file}`);
  }
}

function ensureExistingDirectories(directories, label) {
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
      throw new Error(`Missing ${label}: ${directory}`);
    }
  }
}

function safeRenderer(value) {
  const renderer = String(value || "powerpoint").toLowerCase();
  return ["libreoffice", "powerpoint"].includes(renderer) ? renderer : "powerpoint";
}

function safeEngine(value) {
  const engine = String(value || "openxml").toLowerCase();
  return ["auto", "openxml", "python"].includes(engine) ? engine : "openxml";
}

function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || "").trim())
    .filter(Boolean))];
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function normalizeNonNegativeInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function safeOutput(value) {
  return String(value || "").replace(/[\r\n]+/g, " ").slice(-1200);
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function writeProgress(file, state) {
  writeJson(file, {
    provider: "component-adoption-ab-gate-progress-v1",
    updatedAt: new Date().toISOString(),
    ...state
  });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function main() {
  const args = parseArgs(process.argv);
  try {
    const result = runComponentAdoptionAbGate(args);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status !== "passed" && result.status !== "planned") process.exitCode = 1;
  } catch (error) {
    const progressFile = path.join(path.resolve(args.out), "component-adoption-ab-gate.progress.json");
    writeProgress(progressFile, { status: "failed", stage: "failed", error: safeOutput(error?.message || error) });
    process.stderr.write(`[component-adoption-ab] failed: ${safeOutput(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  buildQualityMatrixArgs,
  buildRebuildArgs,
  findQualityReport,
  parseArgs,
  parseArgsFromOptions,
  splitDeckPages,
  normalizeDeckPages,
  summarizeCandidateAdoption,
  inferVerifiedAssetRoots,
  readVerifiedAssetRootsFromReport,
  progressState,
  runComponentAdoptionAbGate,
  tryFindQualityReport
};
