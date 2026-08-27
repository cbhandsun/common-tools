#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const skillRoot = path.resolve(__dirname, "..");

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const pptxFile = path.resolve(args.pptx || path.join(process.cwd(), "ppt文档", "PM_Portal_AI_Skills_Engine.pptx"));
  if (!fs.existsSync(pptxFile)) {
    throw new Error(`PPTX file not found: ${pptxFile}`);
  }
  const outputDir = path.resolve(args.out || path.join(process.cwd(), "runs", "real-pptx-normalize-smoke"));
  const inputDir = path.join(outputDir, "input");
  const reportsDir = path.join(outputDir, "reports");
  fs.mkdirSync(inputDir, { recursive: true });
  fs.mkdirSync(reportsDir, { recursive: true });

  const copiedPptx = path.join(inputDir, path.basename(pptxFile));
  fs.copyFileSync(pptxFile, copiedPptx);

  const normalize = require(path.join(skillRoot, "scripts", "adapters", "normalize-powerpoint-com.js"));
  const maxPages = parsePositiveInt(args["max-pages"], 2);
  const result = await normalize({ inputDir, outputDir }, {
    skillRoot,
    outputDir,
    config: {
      normalize: {
        exportWidthPx: parsePositiveInt(args.width, 1280),
        exportHeightPx: parsePositiveInt(args.height, 720),
        maxPages
      },
      powerPoint: {
        cleanupHidden: true
      },
      regionProposal: {
        includeFullPage: true,
        emitRegionPages: false,
        cropContainer: false,
        minConfidence: 0.45,
        minAreaRatio: 0.035,
        maxAreaRatio: 0.72,
        paddingPx: 4,
        innerPaddingPx: 4,
        innerHeaderSkipRatio: 0.18
      }
    }
  });
  if (result.ok !== true) {
    throw new Error(result.error || "normalize-powerpoint-com returned non-ok result");
  }

  const reports = result.data.reports || [];
  const report = {
    provider: "real-pptx-normalize-smoke",
    pptxFile,
    outputDir,
    maxPages,
    pageCount: result.data.pageImages.length,
    slideCount: reports.reduce((sum, item) => sum + Number(item.slideCount || 0), 0),
    exportedSlideCount: reports.reduce((sum, item) => sum + Number(item.exportedSlideCount || 0), 0),
    imageOnlySlideCount: reports.reduce((sum, item) => sum + Number(item.imageOnlySlideCount || 0), 0),
    reportFile: result.data.reportFile,
    normalizedDir: result.data.normalizedDir,
    warnings: result.data.warnings || []
  };
  report.passed = report.pageCount > 0 && report.exportedSlideCount === Math.min(report.slideCount, maxPages);
  const reportFile = path.join(reportsDir, "real-pptx-normalize-smoke.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify({ ...report, reportFile }, null, 2)}\n`);
  if (!report.passed) {
    process.exitCode = 1;
  }
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

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
