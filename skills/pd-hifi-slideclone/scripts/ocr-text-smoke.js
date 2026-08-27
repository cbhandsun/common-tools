#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const skillRoot = path.resolve(__dirname, "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const fixtureFile = path.resolve(args.ir || path.join(skillRoot, "examples", "ocr-text-smoke.ir.json"));
  const fixtureDir = path.dirname(fixtureFile);
  const renderedImage = path.resolve(args.rendered || path.join(fixtureDir, "ocr-text-smoke.rendered.png"));
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "ocr-text-smoke"));
  const textOcrAdapter = args.ocr || "scripts/adapters/ocr-paddleocr-local.js";

  ensureDir(path.join(outputDir, "compare"));
  ensureDir(path.join(outputDir, "reports"));

  const ir = resolveIrPaths(readJson(fixtureFile), fixtureDir);
  const compare = require(path.join(skillRoot, "scripts", "adapters", "compare-placeholder.js"));
  const polish = require(path.join(skillRoot, "scripts", "adapters", "polish-text-box-micro-adjust.js"));
  const context = {
    skillRoot,
    outputDir,
    configFile: fixtureFile,
    config: {
      adapters: {
        ocr: textOcrAdapter
      },
      textOcr: {
        enabled: true,
        adapter: textOcrAdapter,
        mode: "anchored",
        paddingPt: Number(args.paddingPt || 4),
        upscale: Number(args.upscale || 1),
        psm: Number(args.psm || 6),
        preprocess: args.preprocess === "true"
      },
      umiOcr: {
        paddleBin: args.umiBin || "C:/Program Files/Umi-OCR_Paddle_v2.1.5/UmiOCR-data/plugins/win7_x64_PaddleOCR-json/PaddleOCR-json.exe",
        initTimeoutMs: Number(args.umiInitTimeoutMs || 60000)
      },
      tesseract: {
        bin: args.tesseractBin || "tesseract",
        lang: args.tesseractLang || "chi_sim+eng",
        tessdataPrefix: args.tessdataPrefix || "./tools/tessdata",
        psm: Number(args.psm || 6)
      },
      textMicroAdjust: {
        enabled: true,
        minCoverage: Number(args.minCoverage || 0.995),
        paddingPt: Number(args.paddingPt || 4),
        maxMovePt: Number(args.maxMovePt || 6),
        maxHeightAdjustPt: Number(args.maxHeightAdjustPt || 4),
        minDeltaPt: Number(args.minDeltaPt || 0.15)
      }
    }
  };

  const compareResult = await compare({
    ir,
    render: {
      renderedPages: [{ pageIndex: 0, image: renderedImage }]
    },
    diff: {
      provider: "ocr-text-smoke",
      summary: {}
    },
    thresholds: {
      textCoverage: Number(args.textCoverageThreshold || 0.95)
    },
    iteration: 0
  }, context);
  if (compareResult?.ok !== true) {
    throw new Error(compareResult?.error || "compare placeholder returned non-ok result");
  }

  const polishResult = await polish({
    ir,
    compare: compareResult.data,
    diff: { summary: {} },
    iteration: 1
  }, context);
  if (polishResult?.ok !== true) {
    throw new Error(polishResult?.error || "polish text box micro adjust returned non-ok result");
  }

  const polishedCompareResult = await compare({
    ir: polishResult.data?.ir || ir,
    render: {
      renderedPages: [{ pageIndex: 0, image: renderedImage }]
    },
    diff: {
      provider: "ocr-text-smoke-polished",
      summary: {}
    },
    thresholds: {
      textCoverage: Number(args.textCoverageThreshold || 0.95)
    },
    iteration: 2
  }, context);
  if (polishedCompareResult?.ok !== true) {
    throw new Error(polishedCompareResult?.error || "compare placeholder for polished IR returned non-ok result");
  }

  const report = {
    provider: "ocr-text-smoke",
    fixtureFile,
    renderedImage,
    outputDir,
    compare: compareResult.data,
    polish: polishResult.data,
    polishedCompare: polishedCompareResult.data,
    generatedAt: new Date().toISOString()
  };
  const reportFile = path.join(outputDir, "reports", "ocr-text-smoke.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const baselineCoverage = compareResult.data?.summary?.textCoverage ?? null;
  const polishedCoverage = polishedCompareResult.data?.summary?.textCoverage ?? null;
  const summary = {
    baselineTextCoverage: baselineCoverage,
    polishedTextCoverage: polishedCoverage,
    textCoverageDelta: metricDelta(polishedCoverage, baselineCoverage),
    passed: polishedCompareResult.data?.passed === true,
    suggestionCount: Array.isArray(polishResult.data?.changes) ? polishResult.data.changes.length : 0,
    reportFile
  };
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = "true";
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function resolveIrPaths(ir, baseDir) {
  const next = JSON.parse(JSON.stringify(ir));
  for (const page of next.pages || []) {
    if (page.sourceImage) page.sourceImage = resolveMaybeRelative(baseDir, page.sourceImage);
    for (const group of ["textBoxes", "shapes", "images", "tables", "charts", "icons"]) {
      for (const item of page[group] || []) {
        if (item.assetPath) item.assetPath = resolveMaybeRelative(baseDir, item.assetPath);
        if (item.source?.pageImage) item.source.pageImage = resolveMaybeRelative(baseDir, item.source.pageImage);
        if (item.source?.cropImage) item.source.cropImage = resolveMaybeRelative(baseDir, item.source.cropImage);
      }
    }
  }
  return next;
}

function resolveMaybeRelative(baseDir, value) {
  return path.isAbsolute(value) ? value : path.resolve(baseDir, value);
}

function metricDelta(next, base) {
  if (typeof next !== "number" || typeof base !== "number") return null;
  return Math.round((next - base) * 1000000) / 1000000;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
