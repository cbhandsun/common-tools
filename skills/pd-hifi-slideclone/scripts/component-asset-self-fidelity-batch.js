#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const { summarizePptxTemplate } = require("./lib/component-asset-learning");
const { selectReplayGroup } = require("./lib/component-asset-replay-fixture");
const { runComponentAssetSelfFidelity } = require("./component-asset-self-fidelity");

function parseArgs(argv = process.argv) {
  const args = {
    roots: [],
    files: [],
    out: path.join("runs", "component-asset-self-fidelity-batch"),
    concurrency: 2,
    maxAssets: 24,
    maxDepth: 6,
    maxScannedEntries: 20000,
    maxPixelDiffRatio: 0.15,
    maxForegroundMissingRatio: 0.18,
    maxMeanDelta: 28,
    maxRegionPixelDiffRatio: 0.18,
    maxRegionForegroundMissingRatio: 0.2,
    maxRegionMeanDelta: 36,
    failOnReject: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--root" && next) {
      args.roots.push(next);
      index += 1;
    } else if (arg === "--file" && next) {
      args.files.push(next);
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--concurrency" && next) {
      args.concurrency = boundedInteger(next, 1, 4, args.concurrency);
      index += 1;
    } else if (arg === "--max-assets" && next) {
      args.maxAssets = boundedInteger(next, 1, 200, args.maxAssets);
      index += 1;
    } else if (arg === "--max-depth" && next) {
      args.maxDepth = boundedInteger(next, 0, 12, args.maxDepth);
      index += 1;
    } else if (arg === "--max-scanned-entries" && next) {
      args.maxScannedEntries = boundedInteger(next, 100, 100000, args.maxScannedEntries);
      index += 1;
    } else if (arg === "--max-pixel-diff-ratio" && next) {
      args.maxPixelDiffRatio = boundedNumber(next, 0, 1, args.maxPixelDiffRatio);
      index += 1;
    } else if (arg === "--max-foreground-missing-ratio" && next) {
      args.maxForegroundMissingRatio = boundedNumber(next, 0, 1, args.maxForegroundMissingRatio);
      index += 1;
    } else if (arg === "--max-mean-delta" && next) {
      args.maxMeanDelta = boundedNumber(next, 0, 255, args.maxMeanDelta);
      index += 1;
    } else if (arg === "--max-region-pixel-diff-ratio" && next) {
      args.maxRegionPixelDiffRatio = boundedNumber(next, 0, 1, args.maxRegionPixelDiffRatio);
      index += 1;
    } else if (arg === "--max-region-foreground-missing-ratio" && next) {
      args.maxRegionForegroundMissingRatio = boundedNumber(next, 0, 1, args.maxRegionForegroundMissingRatio);
      index += 1;
    } else if (arg === "--max-region-mean-delta" && next) {
      args.maxRegionMeanDelta = boundedNumber(next, 0, 255, args.maxRegionMeanDelta);
      index += 1;
    } else if (arg === "--fail-on-reject") {
      args.failOnReject = true;
    } else {
      throw new Error(`Unknown component self-fidelity batch argument: ${arg}`);
    }
  }
  if (args.roots.length === 0 && args.files.length === 0) throw new Error("At least one --root or --file is required");
  return args;
}

async function runComponentAssetSelfFidelityBatch(args = {}) {
  const outDir = path.resolve(String(args.out || ""));
  fs.mkdirSync(outDir, { recursive: true });
  const discovered = discoverPptxFiles(args.roots, args.files, args);
  const deduplicated = await deduplicatePptxFiles(discovered);
  const candidates = [];
  const skipped = [...deduplicated.duplicates];
  for (const item of deduplicated.unique) {
    if (candidates.length >= args.maxAssets) {
      skipped.push({ file: item.file, reason: "max-assets-reached", duplicateOf: null });
      continue;
    }
    try {
      const summary = summarizePptxTemplate(item.file, { maxSlides: 1, maxComponentCatalogItems: 20 });
      const group = selectReplayGroup(summary.componentCatalog);
      if (!group) {
        skipped.push({ file: item.file, reason: "no-reusable-component-group", duplicateOf: null });
        continue;
      }
      candidates.push({ ...item, group });
    } catch (error) {
      skipped.push({ file: item.file, reason: safeReason(error), duplicateOf: null });
    }
  }

  const results = await mapConcurrent(candidates, args.concurrency, async (candidate, index) => {
    const assetOut = path.join(outDir, `${String(index + 1).padStart(3, "0")}-${candidate.sha256.slice(0, 12)}`);
    try {
      const report = await runComponentAssetSelfFidelity({
        ...args,
        pptx: candidate.file,
        out: assetOut,
        failOnThreshold: false
      });
      return {
        file: candidate.file,
        sha256: candidate.sha256,
        passed: report.passed,
        provider: inferProvider(candidate.file),
        group: report.group,
        nativeObjects: report.nativeObjects,
        comparison: compactComparison(report.comparison),
        regionSummary: summarizeRegions(report.regionComparisons),
        reportFile: report.reportFile,
        replayPptx: report.replayPptx
      };
    } catch (error) {
      return {
        file: candidate.file,
        sha256: candidate.sha256,
        passed: false,
        provider: inferProvider(candidate.file),
        error: safeReason(error)
      };
    }
  });
  const promoted = results.filter((item) => item.passed === true);
  const rejected = results.filter((item) => item.passed !== true);
  const report = {
    provider: "component-asset-self-fidelity-batch-v1",
    createdAt: new Date().toISOString(),
    config: {
      concurrency: args.concurrency,
      maxAssets: args.maxAssets,
      maxDepth: args.maxDepth,
      maxScannedEntries: args.maxScannedEntries
    },
    summary: {
      discovered: discovered.length,
      unique: deduplicated.unique.length,
      duplicates: deduplicated.duplicates.length,
      candidates: candidates.length,
      promoted: promoted.length,
      rejected: rejected.length,
      skipped: skipped.length
    },
    promotedAssets: promoted.map((item) => ({
      file: item.file,
      sha256: item.sha256,
      provider: item.provider,
      group: item.group,
      reportFile: item.reportFile,
      replayPptx: item.replayPptx
    })),
    results,
    skipped
  };
  const reportFile = path.join(outDir, "component-self-fidelity-batch.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
}

function discoverPptxFiles(roots = [], files = [], options = {}) {
  const maxDepth = boundedInteger(options.maxDepth, 0, 12, 6);
  const maxScannedEntries = boundedInteger(options.maxScannedEntries, 100, 100000, 20000);
  const found = new Set();
  for (const file of Array.isArray(files) ? files : []) {
    const resolved = safePptxFile(file);
    if (resolved) found.add(resolved);
  }
  let scanned = 0;
  for (const rootValue of Array.isArray(roots) ? roots : []) {
    const root = safeDirectory(rootValue);
    if (!root) continue;
    const queue = [{ dir: root, depth: 0 }];
    while (queue.length > 0 && scanned < maxScannedEntries) {
      const current = queue.shift();
      let entries = [];
      try {
        entries = fs.readdirSync(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        scanned += 1;
        if (scanned > maxScannedEntries) break;
        const full = path.join(current.dir, entry.name);
        if (entry.isSymbolicLink()) continue;
        if (entry.isDirectory() && current.depth < maxDepth) {
          queue.push({ dir: full, depth: current.depth + 1 });
        } else if (entry.isFile() && /\.pptx$/i.test(entry.name)) {
          const resolved = safePptxFile(full);
          if (resolved) found.add(resolved);
        }
      }
    }
  }
  return [...found].sort((a, b) => a.localeCompare(b));
}

async function deduplicatePptxFiles(files = []) {
  const unique = [];
  const duplicates = [];
  const seen = new Map();
  for (const file of Array.isArray(files) ? files : []) {
    const sha256 = await hashFile(file);
    if (seen.has(sha256)) {
      duplicates.push({ file, reason: "duplicate-content", duplicateOf: seen.get(sha256) });
    } else {
      seen.set(sha256, file);
      unique.push({ file, sha256 });
    }
  }
  return { unique, duplicates };
}

async function hashFile(file) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(file, { highWaterMark: 1024 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function mapConcurrent(items = [], concurrency = 2, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(items.length, boundedInteger(concurrency, 1, 4, 2)) }, runWorker));
  return results;
}

function summarizeRegions(regions = []) {
  const comparisons = (Array.isArray(regions) ? regions : []).map((item) => item?.comparison).filter(Boolean);
  return {
    regions: comparisons.length,
    passed: comparisons.filter((item) => item.ok).length,
    maxPixelDiffRatio: maxMetric(comparisons, "pixelDiffRatio"),
    maxForegroundMissingRatio: maxMetric(comparisons, "foregroundMissingRatio"),
    maxMeanAbsoluteDelta: maxMetric(comparisons, "meanAbsoluteDelta")
  };
}

function maxMetric(items, key) {
  const values = items.map((item) => Number(item?.[key])).filter(Number.isFinite);
  return values.length ? Math.max(...values) : null;
}

function compactComparison(comparison = {}) {
  return {
    ok: comparison.ok === true,
    pixelDiffRatio: finiteOrNull(comparison.pixelDiffRatio),
    foregroundMissingRatio: finiteOrNull(comparison.foregroundMissingRatio),
    meanAbsoluteDelta: finiteOrNull(comparison.meanAbsoluteDelta)
  };
}

function safeDirectory(value) {
  try {
    const resolved = fs.realpathSync(path.resolve(String(value || "")));
    return fs.statSync(resolved).isDirectory() ? resolved : "";
  } catch {
    return "";
  }
}

function safePptxFile(value) {
  try {
    const resolved = fs.realpathSync(path.resolve(String(value || "")));
    if (!/\.pptx$/i.test(resolved)) return "";
    const stat = fs.statSync(resolved);
    return stat.isFile() && stat.size > 0 && stat.size <= 512 * 1024 * 1024 ? resolved : "";
  } catch {
    return "";
  }
}

function inferProvider(file) {
  const text = path.basename(file).toLowerCase();
  if (text.includes("islide")) return "islide";
  if (text.includes("officeplus")) return "officeplus";
  return "local-component";
}

function safeReason(error) {
  return String(error?.message || error || "unknown-error").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 180);
}

function boundedInteger(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentAssetSelfFidelityBatch(args);
    process.stdout.write(`${JSON.stringify({ summary: report.summary, reportFile: report.reportFile }, null, 2)}\n`);
    if (args.failOnReject && report.summary.rejected > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  deduplicatePptxFiles,
  discoverPptxFiles,
  mapConcurrent,
  parseArgs,
  runComponentAssetSelfFidelityBatch,
  summarizeRegions
};
