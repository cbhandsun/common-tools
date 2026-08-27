#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { buildPptxBatch } = require("./rebuild-real-pptx-native");
const { countPptxSlides, listZipEntries, readZipEntry } = require("./lib/pptx-inventory");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const irFiles = collectIrFiles(args);
  if (irFiles.length === 0) {
    throw new Error("No IR files found. Use --ir <file> or --ir-dir <dir>.");
  }
  const outRoot = path.resolve(args.out || path.join("runs", "pptx-build-engine-benchmark"));
  fs.mkdirSync(outRoot, { recursive: true });
  const engines = resolveEngines(args.engine || args.engines || "python,openxml-single,openxml-batch");
  const maxFiles = parsePositiveInt(args["max-files"], irFiles.length);
  const selectedIrFiles = irFiles.slice(0, maxFiles);
  const report = {
    provider: "pptx-build-engine-benchmark",
    generatedAt: new Date().toISOString(),
    outRoot,
    sourceIrFiles: selectedIrFiles,
    engines,
    results: []
  };

  for (const engine of engines) {
    report.results.push(runEngineBenchmark({
      engine,
      irFiles: selectedIrFiles,
      outRoot,
      args
    }));
  }
  report.summary = summarizeBenchmarkResults(report.results);
  const reportFile = path.join(outRoot, "pptx-build-engine-benchmark.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report.summary, reportFile }, null, 2)}\n`);
}

function runEngineBenchmark({ engine, irFiles, outRoot, args }) {
  const engineDir = path.join(outRoot, safeFileStem(engine));
  fs.mkdirSync(engineDir, { recursive: true });
  const jobs = irFiles.map((irFile, index) => ({
    irFile,
    outFile: path.join(engineDir, `${String(index + 1).padStart(2, "0")}-${safeFileStem(path.basename(irFile, path.extname(irFile)))}.pptx`)
  }));
  const startedAt = performance.now();
  let ok = true;
  let error = null;
  try {
    if (engine === "openxml-batch") {
      buildPptxBatch(jobs, buildOptionsForEngine(engine, args));
    } else {
      for (const job of jobs) buildPptxBatch([job], buildOptionsForEngine(engine, args));
    }
  } catch (caught) {
    ok = false;
    error = safeErrorMessage(caught);
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  return {
    engine,
    ok,
    elapsedMs,
    deckCount: jobs.length,
    totalSizeBytes: jobs.reduce((sum, job) => sum + (fs.existsSync(job.outFile) ? fs.statSync(job.outFile).size : 0), 0),
    decks: jobs.map((job) => inspectBuiltDeck(job)),
    ...(error ? { error } : {})
  };
}

function buildOptionsForEngine(engine, args = {}) {
  if (engine === "python") {
    return {
      "pptx-engine": "python",
      python: args.python || ""
    };
  }
  return {
    "pptx-engine": "openxml",
    openXmlBatch: engine === "openxml-batch",
    openXmlBuilderExe: args["openxml-builder-exe"] || "",
    openXmlBuilderConfiguration: args["openxml-builder-configuration"] || "",
    openXmlBuilderTargetFramework: args["openxml-builder-target-framework"] || "",
    openXmlBuildCache: args["openxml-build-cache"] === undefined ? false : args["openxml-build-cache"],
    openXmlBuildCacheDir: args["openxml-build-cache-dir"] || path.join("runs", "slideclone-pptx-build-cache"),
  };
}

function inspectBuiltDeck({ irFile, outFile }) {
  if (!fs.existsSync(outFile)) {
    return {
      irFile,
      outFile,
      exists: false,
      sizeBytes: 0,
      slideCount: 0,
      groupShapes: 0,
      shapes: 0,
      pictures: 0
    };
  }
  const slideEntries = countPptxSlides(outFile);
  const structure = inspectDeckStructure(outFile);
  return {
    irFile,
    outFile,
    exists: true,
    sizeBytes: fs.statSync(outFile).size,
    slideCount: slideEntries,
    ...structure
  };
}

function inspectDeckStructure(pptxFile) {
  const slideXmlEntries = listZipEntries(pptxFile)
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));
  const totals = {
    groupShapes: 0,
    shapes: 0,
    pictures: 0,
    connectors: 0,
    tables: 0
  };
  for (const entryName of slideXmlEntries) {
    const xml = readZipEntry(pptxFile, entryName, { maxBytes: 16 * 1024 * 1024 })?.toString("utf8") || "";
    totals.groupShapes += countMatches(xml, /<p:grpSp(?:\s|>)/g);
    totals.shapes += countMatches(xml, /<p:sp(?:\s|>)/g);
    totals.pictures += countMatches(xml, /<p:pic(?:\s|>)/g);
    totals.connectors += countMatches(xml, /<p:cxnSp(?:\s|>)/g);
    totals.tables += countMatches(xml, /<a:tbl(?:\s|>)/g);
  }
  return totals;
}

function summarizeBenchmarkResults(results = []) {
  const successful = results.filter((result) => result.ok);
  const fastest = [...successful].sort((a, b) => a.elapsedMs - b.elapsedMs)[0]?.engine || null;
  return {
    fastest,
    passedEngines: successful.map((result) => result.engine),
    failedEngines: results.filter((result) => !result.ok).map((result) => result.engine),
    timings: Object.fromEntries(results.map((result) => [result.engine, result.elapsedMs]))
  };
}

function collectIrFiles(args = {}) {
  const files = [];
  const explicit = Array.isArray(args.ir) ? args.ir : args.ir ? [args.ir] : [];
  for (const file of explicit) {
    const resolved = path.resolve(String(file));
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) files.push(resolved);
  }
  if (args["ir-dir"]) {
    const dir = path.resolve(String(args["ir-dir"]));
    if (fs.existsSync(dir)) {
      for (const name of fs.readdirSync(dir).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))) {
        if (!name.startsWith(".openxml-safe-") && (/\.ir\.json$|native\.ir\.json$|deck\.json$/i.test(name))) {
          const file = path.join(dir, name);
          if (fs.statSync(file).isFile()) files.push(file);
        }
      }
    }
  }
  return [...new Set(files)];
}

function resolveEngines(value) {
  const allowed = new Set(["python", "openxml-single", "openxml-batch"]);
  return String(value || "")
    .split(/[,\s]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .filter((item, index, all) => allowed.has(item) && all.indexOf(item) === index);
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    if (key === "ir" && args.ir) {
      args.ir = Array.isArray(args.ir) ? [...args.ir, next] : [args.ir, next];
    } else {
      args[key] = next;
    }
    index += 1;
  }
  return args;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function countMatches(value, pattern) {
  return (String(value || "").match(pattern) || []).length;
}

function slideNumber(entryName) {
  return Number(String(entryName || "").match(/slide(\d+)\.xml/i)?.[1] || 0);
}

function safeFileStem(value) {
  return String(value || "deck").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").slice(0, 160) || "deck";
}

function safeErrorMessage(error) {
  return String(error?.message || error || "unknown error").slice(0, 4000);
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  buildOptionsForEngine,
  collectIrFiles,
  inspectBuiltDeck,
  inspectDeckStructure,
  parseArgs,
  resolveEngines,
  runEngineBenchmark,
  safeFileStem,
  summarizeBenchmarkResults
};
