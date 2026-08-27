#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { summarizePptxTemplate } = require("./lib/component-asset-learning");
const { buildComponentAssetReplayIr, parsePresentationSlideSize, selectReplayGroup } = require("./lib/component-asset-replay-fixture");
const { isolatePptxComponentGroup } = require("./lib/component-pptx-group-isolator");
const { readZipEntry } = require("./lib/pptx-inventory");
const { buildOpenXmlDecks } = require("./adapters/pptx-openxml-dotnet");
const { renderDeck } = require("./component-ir-visual-regression-audit");
const { cropPng, readPng, writePng } = require("./lib/png");
const { compareRasterImages } = require("./rendered-similarity-audit");

function parseArgs(argv = process.argv) {
  const args = {
    pptx: "",
    out: path.join("runs", "component-asset-self-fidelity"),
    maxPixelDiffRatio: 0.3,
    maxForegroundMissingRatio: 0.42,
    maxMeanDelta: 58,
    maxRegionPixelDiffRatio: 0.16,
    maxRegionForegroundMissingRatio: 0.2,
    maxRegionMeanDelta: 32,
    failOnThreshold: false
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === "--pptx" && next) {
      args.pptx = next;
      index += 1;
    } else if (arg === "--out" && next) {
      args.out = next;
      index += 1;
    } else if (arg === "--max-pixel-diff-ratio" && next) {
      args.maxPixelDiffRatio = boundedRatio(next, args.maxPixelDiffRatio);
      index += 1;
    } else if (arg === "--max-foreground-missing-ratio" && next) {
      args.maxForegroundMissingRatio = boundedRatio(next, args.maxForegroundMissingRatio);
      index += 1;
    } else if (arg === "--max-mean-delta" && next) {
      args.maxMeanDelta = boundedNumber(next, 0, 255, args.maxMeanDelta);
      index += 1;
    } else if (arg === "--max-region-pixel-diff-ratio" && next) {
      args.maxRegionPixelDiffRatio = boundedRatio(next, args.maxRegionPixelDiffRatio);
      index += 1;
    } else if (arg === "--max-region-foreground-missing-ratio" && next) {
      args.maxRegionForegroundMissingRatio = boundedRatio(next, args.maxRegionForegroundMissingRatio);
      index += 1;
    } else if (arg === "--max-region-mean-delta" && next) {
      args.maxRegionMeanDelta = boundedNumber(next, 0, 255, args.maxRegionMeanDelta);
      index += 1;
    } else if (arg === "--fail-on-threshold") {
      args.failOnThreshold = true;
    } else {
      throw new Error(`Unknown component self-fidelity argument: ${arg}`);
    }
  }
  if (!args.pptx) throw new Error("--pptx is required");
  return args;
}

async function runComponentAssetSelfFidelity(args) {
  const pptxFile = path.resolve(args.pptx);
  if (!fs.existsSync(pptxFile) || !/\.pptx$/i.test(pptxFile)) throw new Error("PPTX input is not readable");
  const outDir = path.resolve(args.out);
  fs.mkdirSync(outDir, { recursive: true });
  const summary = summarizePptxTemplate(pptxFile, { maxSlides: 1, maxComponentCatalogItems: 20 });
  const group = selectReplayGroup(summary.componentCatalog);
  if (!group) throw new Error("No reusable component group found in PPTX");
  const presentationXml = readZipEntry(pptxFile, "ppt/presentation.xml", { maxBytes: 1024 * 1024 });
  const slideSize = parsePresentationSlideSize(presentationXml?.toString("utf8") || "");

  const isolatedSourcePptx = path.join(outDir, "component-source-isolated.pptx");
  let sourceIsolation = null;
  let sourceRenderPptx = pptxFile;
  try {
    sourceIsolation = isolatePptxComponentGroup({
      input: pptxFile,
      output: isolatedSourcePptx,
      slide: group.slide || 1,
      groupIndex: group.groupIndex || 0
    });
    sourceRenderPptx = isolatedSourcePptx;
  } catch (error) {
    sourceIsolation = { provider: "component-pptx-group-isolator-v1", status: "unavailable", reason: safeReason(error) };
  }
  const sourceRender = await renderDeck(sourceRenderPptx, path.join(outDir, "source"), [1], { renderer: "powerpoint-com" });
  const sourceImage = sourceRender.renderedPages[0]?.image;
  if (!sourceImage || !fs.existsSync(sourceImage)) throw new Error("Source component render is missing");

  const ir = buildComponentAssetReplayIr({
    summary,
    sourceImage,
    slideSize,
    asset: { provider: inferProvider(pptxFile), name: path.basename(pptxFile), path: pptxFile },
    assetDir: path.join(outDir, "assets")
  });
  const irFile = path.join(outDir, "component-replay.ir.json");
  const replayPptx = path.join(outDir, "component-replay.pptx");
  fs.writeFileSync(irFile, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  await buildOpenXmlDecks([{ irFile, outFile: replayPptx }], {
    skillRoot: path.resolve(__dirname, ".."),
    outputDir: outDir,
    configFile: path.join(process.cwd(), "slideclone.config.json"),
    config: {}
  });
  const replayRender = await renderDeck(replayPptx, path.join(outDir, "replay"), [1], { renderer: "powerpoint-com" });
  const replayImage = replayRender.renderedPages[0]?.image;
  if (!replayImage || !fs.existsSync(replayImage)) throw new Error("Native component replay render is missing");

  const sourcePng = readPng(sourceImage);
  const replayPng = readPng(replayImage);
  const sourceCrop = cropPng(sourcePng, projectBox(group.boundsPt, slideSize, sourcePng));
  const replayCrop = cropPng(replayPng, projectBox(group.boundsPt, slideSize, replayPng));
  const sourceCropFile = path.join(outDir, "component-source-crop.png");
  const replayCropFile = path.join(outDir, "component-replay-crop.png");
  writePng(sourceCropFile, sourceCrop);
  writePng(replayCropFile, replayCrop);
  const thresholds = {
    maxPixelDiffRatio: args.maxPixelDiffRatio,
    maxForegroundMissingRatio: args.maxForegroundMissingRatio,
    maxMeanAbsoluteDelta: args.maxMeanDelta,
    sampleBudget: 160000,
    foregroundTolerancePx: 2,
    foregroundToleranceDelta: 56
  };
  const comparison = compareRasterImages({
    pageIndex: 0,
    source: sourceCrop,
    rendered: replayCrop,
    sourceImage: sourceCropFile,
    renderedImage: replayCropFile,
    thresholds
  });
  const regionThresholds = {
    ...thresholds,
    maxPixelDiffRatio: args.maxRegionPixelDiffRatio,
    maxForegroundMissingRatio: args.maxRegionForegroundMissingRatio,
    maxMeanAbsoluteDelta: args.maxRegionMeanDelta
  };
  const regionComparisons = compareComponentRegions({
    source: sourceCrop,
    rendered: replayCrop,
    group,
    sourceImage: sourceCropFile,
    renderedImage: replayCropFile,
    thresholds: regionThresholds
  });
  const regionsPassed = regionComparisons.every((item) => item.comparison.ok);
  const report = {
    provider: "component-asset-self-fidelity-v1",
    createdAt: new Date().toISOString(),
    passed: comparison.ok && regionsPassed,
    pptxFile,
    sourceRenderPptx,
    sourceIsolation,
    replayPptx,
    irFile,
    group: {
      id: group.id,
      name: group.name,
      boundsPt: group.boundsPt,
      childCount: group.childCount,
      replayChildCount: group.replayChildLayout?.children?.length || 0,
      structure: group.structure
    },
    slideSize,
    nativeObjects: {
      shapes: ir.pages[0].shapes.length,
      textBoxes: ir.pages[0].textBoxes.length,
      images: ir.pages[0].images.length
    },
    thresholds,
    regionThresholds,
    comparison,
    regionComparisons,
    sourceCropFile,
    replayCropFile
  };
  const reportFile = path.join(outDir, "component-self-fidelity.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
}

function compareComponentRegions({ source, rendered, group = {}, sourceImage = "", renderedImage = "", thresholds = {} } = {}) {
  return deriveComponentRegions(group, source).map((region, index) => {
    const sourceRegion = cropPng(source, region.box);
    const renderedRegion = cropPng(rendered, region.box);
    return {
      ...region,
      comparison: compareRasterImages({
        pageIndex: index,
        source: sourceRegion,
        rendered: renderedRegion,
        sourceImage,
        renderedImage,
        thresholds
      })
    };
  });
}

function deriveComponentRegions(group = {}, image = {}) {
  const children = Array.isArray(group?.replayChildLayout?.children) ? group.replayChildLayout.children : [];
  const gradientBoxes = children
    .filter((child) => child?.kind === "shape" && child?.style?.gradient && normalizedRegionBox(child.box))
    .map((child) => normalizedRegionBox(child.box));
  const candidateBoxes = gradientBoxes.length >= 2 ? gradientBoxes : children
    .filter((child) => child?.kind === "shape" && !child?.style?.text && normalizedRegionBox(child.box))
    .map((child) => normalizedRegionBox(child.box))
    .filter((box) => box.w * box.h >= 0.035 && box.w <= 0.6 && box.h <= 0.6);
  const xs = clusterAxis(candidateBoxes.map((box) => box.x + box.w / 2), 0.12);
  const ys = clusterAxis(candidateBoxes.map((box) => box.y + box.h / 2), 0.12);
  const reliableGrid = xs.length >= 1 && ys.length >= 1
    && xs.length * ys.length >= 2
    && xs.length * ys.length <= 12
    && candidateBoxes.length >= xs.length * ys.length * 0.6;
  const xCenters = reliableGrid ? xs : [0.25, 0.75];
  const yCenters = reliableGrid ? ys : [0.25, 0.75];
  const xEdges = clusterEdges(xCenters);
  const yEdges = clusterEdges(yCenters);
  const width = Math.max(1, Number(image.width || 1));
  const height = Math.max(1, Number(image.height || 1));
  const regions = [];
  for (let row = 0; row < yCenters.length; row += 1) {
    for (let column = 0; column < xCenters.length; column += 1) {
      const left = Math.floor(xEdges[column] * width);
      const top = Math.floor(yEdges[row] * height);
      const right = Math.ceil(xEdges[column + 1] * width);
      const bottom = Math.ceil(yEdges[row + 1] * height);
      regions.push({
        id: `region-r${row + 1}-c${column + 1}`,
        row,
        column,
        box: { x: left, y: top, w: Math.max(1, right - left), h: Math.max(1, bottom - top) }
      });
    }
  }
  return regions;
}

function normalizedRegionBox(box = {}) {
  const x = Number(box?.x);
  const y = Number(box?.y);
  const w = Number(box?.w);
  const h = Number(box?.h);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  if (x < -0.05 || y < -0.05 || x + w > 1.05 || y + h > 1.05) return null;
  return { x, y, w, h };
}

function clusterAxis(values = [], tolerance = 0.12) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const clusters = [];
  for (const value of sorted) {
    const current = clusters[clusters.length - 1];
    if (!current || Math.abs(value - current.mean) > tolerance) {
      clusters.push({ values: [value], mean: value });
    } else {
      current.values.push(value);
      current.mean = current.values.reduce((sum, item) => sum + item, 0) / current.values.length;
    }
  }
  return clusters.map((cluster) => Math.max(0, Math.min(1, cluster.mean)));
}

function clusterEdges(centers = []) {
  const edges = [0];
  for (let index = 1; index < centers.length; index += 1) {
    edges.push((centers[index - 1] + centers[index]) / 2);
  }
  edges.push(1);
  return edges;
}

function projectBox(box = {}, slideSize = {}, image = {}) {
  const marginPt = 2;
  const x = Math.max(0, Number(box.x || 0) - marginPt);
  const y = Math.max(0, Number(box.y || 0) - marginPt);
  const right = Math.min(Number(slideSize.widthPt || 960), Number(box.x || 0) + Number(box.w || 0) + marginPt);
  const bottom = Math.min(Number(slideSize.heightPt || 540), Number(box.y || 0) + Number(box.h || 0) + marginPt);
  return {
    x: Math.floor(x * image.width / slideSize.widthPt),
    y: Math.floor(y * image.height / slideSize.heightPt),
    w: Math.max(1, Math.ceil((right - x) * image.width / slideSize.widthPt)),
    h: Math.max(1, Math.ceil((bottom - y) * image.height / slideSize.heightPt))
  };
}

function inferProvider(file) {
  const text = path.basename(file).toLowerCase();
  if (text.includes("officeplus")) return "officeplus";
  if (text.includes("islide")) return "islide";
  return "local-component";
}

function boundedRatio(value, fallback) {
  return boundedNumber(value, 0, 1, fallback);
}

function boundedNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : fallback;
}

function safeReason(error) {
  return String(error?.message || error || "unknown-error")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .trim()
    .slice(0, 180);
}

async function main() {
  try {
    const args = parseArgs(process.argv);
    const report = await runComponentAssetSelfFidelity(args);
    process.stdout.write(`${JSON.stringify({
      passed: report.passed,
      group: report.group,
      nativeObjects: report.nativeObjects,
      comparison: report.comparison,
      reportFile: report.reportFile
    }, null, 2)}\n`);
    if (args.failOnThreshold && !report.passed) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  compareComponentRegions,
  deriveComponentRegions,
  parseArgs,
  projectBox,
  runComponentAssetSelfFidelity
};
