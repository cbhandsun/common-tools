"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { classifyVisualLayer } = require("./layer-classifier");
const { writePng } = require("./png");
const { comparePageImages } = require("../rendered-similarity-audit");
const {
  buildPptxBatch,
  createVisualAtomNativeShapes
} = require("../rebuild-real-pptx-native");
const { classifyPptxEditability } = require("./pptx-editability-classifier");

const SLIDE_SIZE = Object.freeze({ widthPt: 560, heightPt: 340 });
const DEFAULT_THRESHOLDS = Object.freeze({
  maxPixelDiffRatio: 0.08,
  maxForegroundMissingRatio: 0.12,
  maxMeanAbsoluteDelta: 12,
  sampleBudget: 190400,
  foregroundTolerancePx: 3,
  foregroundToleranceDelta: 56
});

function runChartNativeRenderGolden(options = {}) {
  const outputDir = path.resolve(requiredPath(options.outputDir, "outputDir"));
  const sourceDir = path.join(outputDir, "source");
  const renderer = normalizeRenderer(options.renderer || "libreoffice");
  const renderRoot = path.join(outputDir, `${renderer}-render`);
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(renderRoot, { recursive: true });

  const fixtures = createChartFixtures();
  const pages = fixtures.map((fixture, pageIndex) => reconstructFixture(fixture, pageIndex, sourceDir));
  const irFile = path.join(outputDir, "chart-native-render-golden.ir.json");
  const pptxFile = path.join(outputDir, "chart-native-render-golden.pptx");
  fs.writeFileSync(irFile, `${JSON.stringify({ version: "1.0", slideSize: SLIDE_SIZE, pages: pages.map((page) => page.irPage) }, null, 2)}\n`, "utf8");

  buildPptxBatch([{ irFile, outFile: pptxFile }], {
    "pptx-engine": "openxml",
    ...(options.openXmlBuilderExe ? { "openxml-builder-exe": options.openXmlBuilderExe } : {})
  });

  const renderReport = renderWithLibreOffice({
    pptxFile,
    outputDir: renderRoot,
    maxPages: pages.length,
    dpi: 72,
    timeoutMs: boundedInteger(options.timeoutMs, 120000, 1000, 600000)
  });
  const thresholds = normalizeThresholds(options.thresholds);
  const renderedByIndex = new Map((renderReport.renderedPages || []).map((page) => [Number(page.pageIndex), path.resolve(page.image)]));
  const comparisons = pages.map((page, pageIndex) => {
    const renderedImage = renderedByIndex.get(pageIndex);
    if (!renderedImage || !fs.existsSync(renderedImage)) {
      return { pageIndex, ok: false, issues: ["missing-rendered-page"] };
    }
    return comparePageImages(pageIndex, page.sourceFile, renderedImage, thresholds);
  });
  const editability = classifyPptxEditability(pptxFile);
  const report = evaluateChartGolden({
    outputDir,
    irFile,
    pptxFile,
    pages,
    comparisons,
    renderReport,
    editability,
    thresholds
  });
  const reportFile = path.join(outputDir, "chart-native-render-golden.report.json");
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return { ...report, reportFile };
}

function reconstructFixture(fixture, pageIndex, sourceDir) {
  const sourceFile = path.join(sourceDir, `${String(pageIndex + 1).padStart(3, "0")}.png`);
  writePng(sourceFile, fixture.image);
  const box = { x: 0, y: 0, w: SLIDE_SIZE.widthPt, h: SLIDE_SIZE.heightPt };
  const fixtureSource = fixture.visualOnly === true
    ? { detector: "generic-visual-underlay" }
    : {
      detector: fixture.detector,
      expressionForm: fixture.expressionForm || "chart-snapshot",
      expressionSubtype: fixture.expressionSubtype
    };
  const item = {
    id: fixture.id,
    type: "fidelity-crop",
    box,
    source: fixtureSource
  };
  const layer = classifyVisualLayer(item, { textBoxes: fixture.textBoxes || [] }, SLIDE_SIZE, { sourceImage: fixture.image });
  const image = { id: fixture.id, box, source: { ...item.source, layer } };
  const shapes = createVisualAtomNativeShapes([image]);
  return {
    id: fixture.id,
    sourceFile,
    archetype: layer.diagramUnderstanding?.archetype || null,
    nativeReadiness: layer.diagramUnderstanding?.nativeReadiness || null,
    atomCount: Number(layer.diagramUnderstanding?.visualAtomCount || 0),
    shapeCount: shapes.length,
    nativeApplied: layer.diagramUnderstanding?.nativeReadiness === "native-rebuild" || image.source?.relationshipShellObjectified === true,
    nativePromotion: image.source?.relationshipShellObjectified === true ? image.source?.relationshipShellKind || "relationship-shell" : null,
    detectorCounts: countBy(shapes.map((shape) => shape.source?.detector || "unknown")),
    irPage: {
      pageIndex,
      sourceImage: sourceFile,
      background: { fill: "#FFFFFF" },
      textBoxes: [],
      shapes,
      images: [],
      tables: [],
      charts: [],
      icons: []
    }
  };
}

function evaluateChartGolden(input = {}) {
  const pageEvidence = (input.pages || []).map((page, pageIndex) => {
    const comparison = input.comparisons?.[pageIndex] || { ok: false, issues: ["missing-comparison"] };
    const requirements = chartRequirements(page.archetype);
    const axisCount = requirements.axisDetectors.reduce(
      (sum, detector) => sum + Number(page.detectorCounts?.[detector] || 0),
      0
    );
    const markCount = requirements.detectors.reduce((sum, detector) => sum + Number(page.detectorCounts?.[detector] || 0), 0);
    const issues = [
      ...(page.nativeApplied === true || page.nativeReadiness === "native-rebuild" ? [] : ["native-rebuild-not-applied"]),
      ...(axisCount >= requirements.minimumAxes ? [] : ["insufficient-native-axes"]),
      ...(markCount >= requirements.minimumMarks ? [] : ["insufficient-native-series-marks"]),
      ...(comparison.ok ? [] : comparison.issues || ["render-similarity-failed"])
    ];
    return {
      pageIndex,
      id: page.id,
      archetype: page.archetype,
      nativeReadiness: page.nativeReadiness,
      nativeApplied: page.nativeApplied === true,
      nativePromotion: page.nativePromotion || null,
      atomCount: page.atomCount,
      nativeShapeCount: page.shapeCount,
      axisCount,
      markCount,
      pixelDiffRatio: comparison.pixelDiffRatio ?? null,
      foregroundMissingRatio: comparison.foregroundMissingRatio ?? null,
      meanAbsoluteDelta: comparison.meanAbsoluteDelta ?? null,
      issues,
      passed: issues.length === 0
    };
  });
  const nativeShapeCount = (input.editability?.slides || []).reduce((sum, slide) => sum + Number(slide.nativeObjects ?? slide.nativeShapeCount ?? 0), 0);
  const pictureCount = (input.editability?.slides || []).reduce((sum, slide) => sum + Number(slide.pictures || 0), 0);
  const expectedNativeShapes = pageEvidence.reduce((sum, page) => sum + page.nativeShapeCount, 0);
  const deckIssues = [
    ...(input.renderReport?.passed ? [] : ["presentation-render-failed"]),
    ...(Number(input.editability?.slideCount || 0) === pageEvidence.length ? [] : ["pptx-slide-count-mismatch"]),
    ...(nativeShapeCount >= expectedNativeShapes ? [] : ["pptx-native-shape-count-below-ir"]),
    ...(pictureCount === 0 ? [] : ["unexpected-raster-picture-in-native-chart-deck"]),
    ...(pageEvidence.every((page) => page.passed) ? [] : ["page-gate-failed"])
  ];
  return {
    provider: "chart-native-render-golden-v1",
    outputDir: input.outputDir,
    irFile: input.irFile,
    pptxFile: input.pptxFile,
    thresholds: input.thresholds,
    pageCount: pageEvidence.length,
    renderedPageCount: Number(input.renderReport?.renderedPageCount || 0),
    nativeShapeCount,
    pictureCount,
    expectedNativeShapes,
    pages: pageEvidence,
    issues: deckIssues,
    passed: deckIssues.length === 0
  };
}

function renderWithLibreOffice(options = {}) {
  const benchmarkScript = path.resolve(__dirname, "..", "libreoffice-benchmark.js");
  const runtimeNode = process.env.RUNTIME_NODE ? path.resolve(process.env.RUNTIME_NODE) : process.execPath;
  const outputDir = path.resolve(requiredPath(options.outputDir, "outputDir"));
  const isolatedOutputDir = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-chart-render-"));
  try {
    const args = [benchmarkScript, "--pptx", requiredPath(options.pptxFile, "pptxFile"), "--out", isolatedOutputDir, "--max-pages", String(boundedInteger(options.maxPages, 1, 1, 128)), "--dpi", String(boundedInteger(options.dpi, 72, 36, 600)), "--convert-timeout-ms", String(options.timeoutMs), "--render-timeout-ms", String(options.timeoutMs)];
    const result = spawnSync(runtimeNode, args, { encoding: "utf8", windowsHide: true, timeout: options.timeoutMs * 2 + 10000, maxBuffer: 20 * 1024 * 1024 });
    if (result.status !== 0) {
      throw new Error(`LibreOffice chart golden render failed: ${String(result.stderr || result.stdout || result.error?.message || `exit ${result.status}`).trim()}`);
    }
    return materializeLibreOfficeReport(parseLastJsonObject(result.stdout), outputDir);
  } finally {
    fs.rmSync(isolatedOutputDir, { recursive: true, force: true });
  }
}

function materializeLibreOfficeReport(report, outputDir) {
  if (!report || typeof report !== "object" || Array.isArray(report)) throw new TypeError("LibreOffice report must be an object");
  const stableOutputDir = path.resolve(requiredPath(outputDir, "outputDir"));
  const renderDir = path.join(stableOutputDir, "render");
  fs.mkdirSync(renderDir, { recursive: true });
  const renderedPages = (Array.isArray(report.renderedPages) ? report.renderedPages : []).map((page, index) => {
    const pageIndex = boundedInteger(page?.pageIndex, index, 0, 127);
    const sourceImage = path.resolve(requiredPath(page?.image, `renderedPages[${index}].image`));
    if (!fs.existsSync(sourceImage) || !fs.statSync(sourceImage).isFile()) {
      throw new Error(`LibreOffice rendered page is missing: ${sourceImage}`);
    }
    const targetImage = path.join(renderDir, `lo-page-${String(pageIndex + 1).padStart(3, "0")}.png`);
    fs.copyFileSync(sourceImage, targetImage);
    return { ...page, pageIndex, image: targetImage };
  });
  const reportFile = path.join(stableOutputDir, "libreoffice-benchmark.report.json");
  const materialized = {
    ...report,
    stagedPptxFile: null,
    pdf: null,
    renderedPageCount: renderedPages.length,
    renderedPages,
    reportFile
  };
  fs.writeFileSync(reportFile, `${JSON.stringify(materialized, null, 2)}\n`, "utf8");
  return materialized;
}

function normalizeRenderer(value) {
  const renderer = String(value || "").trim().toLowerCase();
  if (renderer !== "libreoffice") throw new TypeError("renderer must be libreoffice");
  return renderer;
}

function createChartFixtures() {
  const bar = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(bar, 76, 60, 5, 227, "#64748b");
  fillRect(bar, 76, 282, 382, 5, "#64748b");
  fillRect(bar, 92, 186, 42, 96, "#2f80ed");
  fillRect(bar, 168, 126, 42, 156, "#2f80ed");
  fillRect(bar, 244, 214, 42, 68, "#2f80ed");
  fillRect(bar, 320, 94, 42, 188, "#2f80ed");

  const scatter = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(scatter, 56, 54, 5, 212, "#64748b");
  fillRect(scatter, 56, 261, 340, 5, "#64748b");
  for (const [x, y] of [[88, 224], [126, 188], [170, 204], [214, 142], [260, 166], [306, 108], [344, 132], [374, 82]]) {
    fillEllipse(scatter, x, y, 11, 11, "#2f80ed");
  }
  const line = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(line, 76, 282, 382, 5, "#64748b");
  fillRect(line, 76, 86, 5, 201, "#64748b");
  fillLine(line, 104, 236, 214, 174, 4, "#2f80ed");
  fillLine(line, 236, 168, 346, 216, 4, "#2f80ed");
  fillLine(line, 368, 206, 446, 126, 4, "#2f80ed");

  const donut = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillDonut(donut, 176, 68, 180, 180, 0.5, "#60a5fa");

  const waterfall = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(waterfall, 76, 282, 382, 5, "#64748b");
  fillRect(waterfall, 76, 86, 5, 201, "#64748b");
  fillRect(waterfall, 108, 198, 42, 84, "#2563eb");
  fillRect(waterfall, 176, 146, 42, 52, "#16a34a");
  fillRect(waterfall, 244, 198, 42, 36, "#ef4444");
  fillRect(waterfall, 312, 122, 42, 76, "#16a34a");
  fillRect(waterfall, 380, 172, 42, 50, "#ef4444");
  fillRect(waterfall, 448, 118, 42, 164, "#2563eb");

  const treemap = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(treemap, 70, 64, 230, 210, "#60a5fa");
  fillRect(treemap, 306, 64, 154, 100, "#93c5fd");
  fillRect(treemap, 466, 64, 40, 100, "#bfdbfe");
  fillRect(treemap, 306, 170, 92, 104, "#2563eb");
  fillRect(treemap, 404, 170, 102, 104, "#dbeafe");

  const gauge = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillEllipse(gauge, 192, 58, 176, 176, "#bfdbfe");
  fillEllipse(gauge, 216, 82, 128, 128, "#ffffff");
  fillRect(gauge, 192, 146, 176, 88, "#ffffff");
  fillLine(gauge, 280, 146, 334, 104, 6, "#2563eb");

  const radar = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  const radarCenter = { x: 280, y: 170 };
  const radarAxes = [
    { x: 280, y: 74 },
    { x: 372, y: 142 },
    { x: 336, y: 254 },
    { x: 224, y: 254 },
    { x: 188, y: 142 }
  ];
  const radarScore = [
    { x: 280, y: 102 },
    { x: 346, y: 152 },
    { x: 320, y: 224 },
    { x: 242, y: 226 },
    { x: 214, y: 148 }
  ];
  for (const point of radarAxes) fillLine(radar, radarCenter.x, radarCenter.y, point.x, point.y, 2, "#bfdbfe");
  fillPolygon(radar, radarAxes, "#e0f2fe");
  fillPolygon(radar, radarScore, "#38bdf8");

  const concentric = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillEllipse(concentric, 156, 46, 248, 248, "#dbeafe");
  fillEllipse(concentric, 192, 82, 176, 176, "#bfdbfe");
  fillEllipse(concentric, 228, 118, 104, 104, "#60a5fa");

  const quadrant = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(quadrant, 64, 168, 432, 4, "#64748b");
  fillRect(quadrant, 278, 44, 4, 252, "#64748b");
  for (const [x, y, color] of [[96, 72, "#dbeafe"], [332, 72, "#bfdbfe"], [96, 210, "#bfdbfe"], [332, 210, "#dbeafe"]]) {
    fillRect(quadrant, x, y, 132, 56, color);
  }

  const comparison = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(comparison, 58, 66, 147, 62, "#eff6ff");
  fillRect(comparison, 207, 66, 147, 62, "#f8fafc");
  fillRect(comparison, 356, 66, 147, 62, "#f8fafc");
  for (const y of [64, 128, 192, 256]) fillRect(comparison, 56, y, 448, 3, "#64748b");
  for (const x of [56, 205, 354, 503]) fillRect(comparison, x, 64, 3, 195, "#64748b");
  const comparisonTextBoxes = [
    { id: "comparison-h1", text: "Option A", box: { x: 72, y: 82, w: 92, h: 24 } },
    { id: "comparison-h2", text: "Option B", box: { x: 221, y: 82, w: 92, h: 24 } },
    { id: "comparison-h3", text: "Option C", box: { x: 370, y: 82, w: 92, h: 24 } }
  ];

  const heatmap = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  for (const y of [58, 108, 158, 208, 258]) fillRect(heatmap, 72, y, 376, 3, "#94a3b8");
  for (const x of [72, 166, 260, 354, 448]) fillRect(heatmap, x, 58, 3, 203, "#94a3b8");
  const heatmapColors = ["#dcfce7", "#bbf7d0", "#fef3c7", "#fed7aa", "#fecaca", "#fca5a5", "#fde68a", "#86efac"];
  let heatmapColorIndex = 0;
  for (const y of [61, 111, 161, 211]) {
    for (const x of [75, 169, 263, 357]) {
      fillRect(heatmap, x + 3, y + 3, 84, 40, heatmapColors[heatmapColorIndex % heatmapColors.length]);
      heatmapColorIndex += 1;
    }
  }

  const gantt = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(gantt, 72, 70, 420, 4, "#64748b");
  for (const x of [132, 222, 312, 402]) fillRect(gantt, x, 64, 3, 18, "#64748b");
  fillRect(gantt, 102, 108, 152, 28, "#60a5fa");
  fillRect(gantt, 182, 156, 210, 28, "#34d399");
  fillRect(gantt, 292, 204, 142, 28, "#f59e0b");
  fillRect(gantt, 372, 252, 102, 28, "#a78bfa");

  const timeline = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(timeline, 72, 168, 416, 4, "#2563eb");
  for (const ratio of [0.12, 0.38, 0.64, 0.9]) {
    const size = 23;
    const centerX = 72 + Math.round(416 * ratio);
    fillEllipse(timeline, centerX - Math.round(size / 2), 170 - Math.round(size / 2), size, size, "#2563eb");
  }

  const pie = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillPie(pie, 280, 170, 92, [
    { start: 0, end: 110, color: "#60a5fa" },
    { start: 110, end: 235, color: "#34d399" },
    { start: 235, end: 360, color: "#f59e0b" }
  ]);

  const flow = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  for (const [x, color] of [[40, "#60a5fa"], [168, "#93c5fd"], [296, "#60a5fa"], [424, "#93c5fd"]]) {
    fillRect(flow, x, 145, 88, 50, color);
  }
  for (const x of [132, 260, 388]) fillArrowRight(flow, x, 170, 18, 6, 14, "#94a3b8");

  const hubSpoke = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(hubSpoke, 246, 148, 68, 44, "#2563eb");
  for (const [x, y] of [[246, 40], [246, 256], [56, 148], [436, 148]]) fillRect(hubSpoke, x, y, 68, 44, "#60a5fa");
  fillRect(hubSpoke, 277, 84, 6, 64, "#94a3b8");
  fillRect(hubSpoke, 277, 192, 6, 64, "#94a3b8");
  fillRect(hubSpoke, 124, 167, 122, 6, "#94a3b8");
  fillRect(hubSpoke, 314, 167, 122, 6, "#94a3b8");

  const swimlane = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  for (const y of [80, 212]) {
    for (const x of [40, 234, 428]) fillRect(swimlane, x, y, 88, 46, "#60a5fa");
    for (const x of [140, 334]) fillRect(swimlane, x, y + 21, 80, 5, "#94a3b8");
  }

  const layeredStack = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(layeredStack, 230, 54, 100, 54, "#60a5fa");
  fillRect(layeredStack, 180, 130, 200, 54, "#34d399");
  fillRect(layeredStack, 124, 206, 312, 54, "#f97316");

  const cycleLoop = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillDonutSegment(cycleLoop, 216, 90, 128, 128, 0.62, -60, 35, "#38bdf8");
  fillDonutSegment(cycleLoop, 216, 90, 128, 128, 0.62, 70, 165, "#0ea5e9");
  fillDonutSegment(cycleLoop, 216, 90, 128, 128, 0.62, 200, 300, "#0369a1");
  fillPolygon(cycleLoop, [{ x: 324, y: 130 }, { x: 350, y: 142 }, { x: 326, y: 156 }], "#38bdf8");

  const topology = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillLine(topology, 280, 64, 116, 246, 6, "#64748b");
  fillLine(topology, 280, 64, 444, 246, 6, "#64748b");
  fillRect(topology, 116, 243, 328, 6, "#64748b");
  fillEllipse(topology, 238, 34, 84, 60, "#60a5fa");
  fillEllipse(topology, 72, 216, 88, 64, "#34d399");
  fillEllipse(topology, 400, 216, 88, 64, "#f97316");

  const funnelLens = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  for (const [y, color] of [[42, "#dbeafe"], [144, "#e0f2fe"], [246, "#dcfce7"]]) {
    fillRect(funnelLens, 42, y, 118, 48, color);
  }
  fillLine(funnelLens, 160, 66, 372, 142, 5, "#60a5fa");
  fillLine(funnelLens, 160, 168, 372, 168, 5, "#60a5fa");
  fillLine(funnelLens, 160, 270, 372, 194, 5, "#60a5fa");
  fillMagnifier(funnelLens, 360, 92, 150, "#2563eb");

  const sankey = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillSankeyBand(sankey, 66, 84, 116, 258, 116, 150, "#93c5fd");
  fillSankeyBand(sankey, 66, 126, 150, 258, 164, 184, "#f9a8d4");
  fillSankeyBand(sankey, 66, 206, 240, 258, 184, 210, "#fdba74");
  fillSankeyBand(sankey, 276, 116, 146, 494, 82, 112, "#86efac");
  fillSankeyBand(sankey, 276, 150, 184, 494, 196, 232, "#c4b5fd");
  fillSankeyBand(sankey, 276, 184, 210, 494, 238, 264, "#67e8f9");
  fillRect(sankey, 48, 68, 18, 92, "#334155");
  fillRect(sankey, 48, 196, 18, 56, "#475569");
  fillRect(sankey, 258, 108, 18, 106, "#1e293b");
  fillRect(sankey, 494, 70, 18, 50, "#166534");
  fillRect(sankey, 494, 190, 18, 80, "#166534");

  const venn = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillEllipse(venn, 92, 72, 196, 142, "#60a5fa");
  fillEllipse(venn, 272, 72, 196, 142, "#34d399");
  fillRect(venn, 132, 246, 82, 28, "#bfdbfe");
  fillRect(venn, 346, 246, 82, 28, "#bbf7d0");

  const genericGraph = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  for (const edge of [
    [116, 100, 264, 72],
    [316, 72, 444, 136],
    [462, 166, 358, 252],
    [314, 264, 126, 254],
    [96, 226, 96, 126]
  ]) fillLine(genericGraph, ...edge, 5, "#64748b");
  fillEllipse(genericGraph, 60, 72, 72, 56, "#60a5fa");
  fillEllipse(genericGraph, 248, 42, 84, 60, "#34d399");
  fillEllipse(genericGraph, 428, 112, 76, 62, "#f97316");
  fillEllipse(genericGraph, 306, 234, 82, 60, "#a78bfa");
  fillEllipse(genericGraph, 58, 224, 76, 58, "#38bdf8");

  const tree = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillRect(tree, 230, 28, 100, 64, "#2563eb");
  fillRect(tree, 50, 220, 100, 64, "#60a5fa");
  fillRect(tree, 230, 220, 100, 64, "#60a5fa");
  fillRect(tree, 410, 220, 100, 64, "#60a5fa");
  fillRect(tree, 100, 156, 360, 6, "#94a3b8");

  const fishbone = blankImage(SLIDE_SIZE.widthPt, SLIDE_SIZE.heightPt, "#ffffff");
  fillArrowRight(fishbone, 70, 170, 390, 7, 30, "#2563eb");
  for (const branch of [
    [150, 170, 102, 86],
    [238, 170, 190, 86],
    [326, 170, 374, 86],
    [414, 170, 462, 86],
    [176, 170, 124, 254],
    [294, 170, 242, 254],
    [412, 170, 464, 254]
  ]) fillLine(fishbone, ...branch, 6, "#2563eb");
  for (const [x, y] of [[60, 54], [164, 54], [350, 54], [84, 254], [204, 254], [430, 254]]) {
    fillRect(fishbone, x, y, 90, 32, "#dbeafe");
  }
  return [
    { id: "native-bar-chart", detector: "bar-chart-axis-snapshot", expressionSubtype: "bar chart column chart", image: bar },
    { id: "native-scatter-chart", detector: "scatter-chart-axis-snapshot", expressionSubtype: "scatter chart bubble plot", image: scatter },
    { id: "native-line-chart", detector: "line-chart-axis-snapshot", expressionSubtype: "line chart trend series", image: line },
    { id: "native-donut-chart", detector: "donut-chart-snapshot", expressionSubtype: "donut chart ring chart", image: donut },
    { id: "native-donut-chart-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: donut },
    { id: "native-waterfall-chart", detector: "waterfall-variance-bridge-chart-snapshot", expressionSubtype: "waterfall chart variance bridge", image: waterfall },
    { id: "native-heatmap-matrix", detector: "heatmap-risk-matrix-underlay", expressionForm: "complex-diagram", expressionSubtype: "heatmap risk matrix color scale", image: heatmap },
    { id: "native-gantt-roadmap", detector: "gantt-project-roadmap", expressionForm: "complex-diagram", expressionSubtype: "gantt project schedule roadmap", image: gantt },
    { id: "native-timeline-roadmap", detector: "timeline-roadmap-underlay", expressionForm: "complex-diagram", expressionSubtype: "timeline roadmap milestones", image: timeline },
    { id: "native-timeline-roadmap-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: timeline },
    { id: "native-pie-chart", detector: "pie-chart-snapshot", expressionSubtype: "pie chart market share proportion", image: pie },
    { id: "native-pie-chart-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: pie },
    { id: "native-treemap-chart", detector: "treemap-area-composition-underlay", expressionSubtype: "treemap market share area composition", image: treemap },
    { id: "native-gauge-chart", detector: "gauge-speedometer-chart-snapshot", expressionSubtype: "gauge chart speedometer semi circle gauge", image: gauge },
    { id: "native-gauge-chart-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: gauge },
    { id: "native-radar-chart", detector: "radar-chart-snapshot", expressionSubtype: "radar chart spider chart multi axis score", image: radar },
    { id: "native-concentric-circles", detector: "concentric-circles-onion-diagram-snapshot", expressionForm: "complex-diagram", expressionSubtype: "concentric circles onion diagram 同心圆 洋葱图 圈层模型", image: concentric },
    { id: "native-concentric-circles-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: concentric },
    { id: "native-quadrant-matrix", detector: "quadrant-priority-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "impact effort quadrant matrix 四象限", image: quadrant },
    { id: "native-comparison-matrix", detector: "comparison-matrix-underlay", expressionForm: "complex-diagram", expressionSubtype: "comparison matrix 方案对比", image: comparison, textBoxes: comparisonTextBoxes },
    { id: "native-hub-spoke", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "hub spoke radial relationship", image: hubSpoke },
    { id: "native-swimlane-flow", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", image: swimlane },
    { id: "native-layered-stack", detector: "pyramid-layered-stack-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "pyramid layered stack", image: layeredStack },
    { id: "native-cycle-loop", detector: "islide-segmented-cycle-arrow-component", expressionForm: "complex-diagram", expressionSubtype: "循环箭头 圆弧箭头 闭环流程", image: cycleLoop },
    { id: "native-cycle-loop-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: cycleLoop },
    { id: "native-funnel-lens-flow", detector: "plugin-component-diagram-crop", expressionForm: "complex-diagram", expressionSubtype: "magnifier convergence analysis flow", image: funnelLens },
    { id: "native-sankey-flow", detector: "sankey-flow-distribution-underlay", expressionForm: "data-chart", expressionSubtype: "sankey alluvial flow distribution", image: sankey },
    { id: "native-venn-overlap", detector: "overlap-relationship-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "venn overlap intersection set relation", image: venn },
    { id: "native-venn-overlap-visual-only", detector: "generic-visual-underlay", visualOnly: true, image: venn },
    { id: "native-measured-generic-graph", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "irregular relationship graph", image: genericGraph },
    { id: "native-topology-diagram", detector: "topology-relationship-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "closed-loop topology triangle", image: topology },
    { id: "native-flow-card-chain", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "linear process flow card chain", image: flow },
    { id: "native-tree-structure", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "hierarchy tree structure", image: tree },
    { id: "native-fishbone-cause-effect", detector: "sparse-diagram-graphic-underlay-crop", expressionForm: "complex-diagram", expressionSubtype: "branch analysis fishbone cause effect", image: fishbone }
  ];
}

function chartRequirements(archetype) {
  const chartAxes = ["visual-chart-native-axis"];
  if (archetype === "flow-card-chain") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 7, detectors: ["visual-relationship-native-flow-node", "visual-relationship-native-flow-connector"] };
  if (archetype === "tree-structure") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 5, detectors: ["visual-relationship-native-tree-node", "visual-relationship-native-tree-connector"] };
  if (archetype === "fishbone-cause-effect") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 14, detectors: ["visual-relationship-native-fishbone-node", "visual-relationship-native-fishbone-spine", "visual-relationship-native-fishbone-connector"] };
  if (archetype === "gantt-roadmap") return { minimumAxes: 1, axisDetectors: ["visual-gantt-native-axis"], minimumMarks: 4, detectors: ["visual-gantt-native-task-bar"] };
  if (archetype === "timeline-roadmap") return { minimumAxes: 1, axisDetectors: ["visual-relationship-native-timeline-axis"], minimumMarks: 4, detectors: ["visual-relationship-native-timeline-milestone"] };
  if (archetype === "pie-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 3, detectors: ["visual-chart-native-pie-segment"] };
  if (archetype === "scatter-chart") return { minimumAxes: 2, axisDetectors: chartAxes, minimumMarks: 8, detectors: ["visual-chart-native-scatter-point"] };
  if (archetype === "line-chart") return { minimumAxes: 2, axisDetectors: chartAxes, minimumMarks: 3, detectors: ["visual-chart-native-line-segment"] };
  if (archetype === "donut-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 1, detectors: ["visual-chart-native-donut", "visual-chart-native-donut-segment"] };
  if (archetype === "waterfall-chart") return { minimumAxes: 2, axisDetectors: chartAxes, minimumMarks: 6, detectors: ["visual-chart-native-waterfall-bar"] };
  if (archetype === "heatmap-matrix") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 16, detectors: ["visual-chart-native-heatmap-cell"] };
  if (archetype === "treemap-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 5, detectors: ["visual-chart-native-treemap-tile"] };
  if (archetype === "gauge-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 2, detectors: ["visual-chart-native-gauge-arc", "visual-chart-native-gauge-needle"] };
  if (archetype === "radar-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 7, detectors: ["visual-chart-native-radar-axis", "visual-chart-native-radar-frame", "visual-chart-native-radar-score"] };
  if (archetype === "concentric-circles") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 3, detectors: ["visual-relationship-native-concentric-layer"] };
  if (archetype === "quadrant-matrix") return { minimumAxes: 2, axisDetectors: ["visual-relationship-native-quadrant-axis"], minimumMarks: 4, detectors: ["visual-relationship-native-quadrant-panel"] };
  if (archetype === "comparison-matrix") return { minimumAxes: 8, axisDetectors: ["visual-relationship-native-comparison-grid-line"], minimumMarks: 9, detectors: ["visual-relationship-native-comparison-cell"] };
  if (archetype === "hub-spoke") return { minimumAxes: 4, axisDetectors: ["visual-relationship-native-hub-spoke-connector"], minimumMarks: 5, detectors: ["visual-relationship-native-hub-spoke-node"] };
  if (archetype === "swimlane-flow") return { minimumAxes: 4, axisDetectors: ["visual-relationship-native-swimlane-connector"], minimumMarks: 6, detectors: ["visual-relationship-native-swimlane-node"] };
  if (archetype === "layered-stack") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 3, detectors: ["visual-relationship-native-layered-stack-layer"] };
  if (archetype === "cycle-loop") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 3, detectors: ["visual-relationship-native-cycle-loop-segment"] };
  if (archetype === "funnel-lens-flow") return { minimumAxes: 3, axisDetectors: ["visual-relationship-native-funnel-lens-connector"], minimumMarks: 5, detectors: ["visual-relationship-native-funnel-lens-node", "visual-relationship-native-funnel-lens-focus"] };
  if (archetype === "sankey-flow-chart") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 11, detectors: ["visual-relationship-native-sankey-node", "visual-relationship-native-sankey-band"] };
  if (archetype === "venn-overlap") return { minimumAxes: 0, axisDetectors: [], minimumMarks: 4, detectors: ["visual-relationship-native-venn-ellipse", "visual-relationship-native-venn-supplementary"] };
  if (archetype === "generic-node-diagram" || archetype === "multi-cluster-diagram") return { minimumAxes: 5, axisDetectors: ["visual-relationship-native-generic-connector"], minimumMarks: 5, detectors: ["visual-relationship-native-generic-node"] };
  if (archetype === "topology-diagram") return { minimumAxes: 3, axisDetectors: ["visual-relationship-native-topology-connector"], minimumMarks: 3, detectors: ["visual-relationship-native-topology-node"] };
  return { minimumAxes: 2, axisDetectors: chartAxes, minimumMarks: 4, detectors: ["visual-chart-native-bar"] };
}

function normalizeThresholds(value = {}) {
  const result = { ...DEFAULT_THRESHOLDS };
  for (const key of ["maxPixelDiffRatio", "maxForegroundMissingRatio"]) {
    if (value[key] !== undefined) result[key] = boundedNumber(value[key], result[key], 0, 1);
  }
  if (value.maxMeanAbsoluteDelta !== undefined) result.maxMeanAbsoluteDelta = boundedNumber(value.maxMeanAbsoluteDelta, result.maxMeanAbsoluteDelta, 0, 255);
  return result;
}

function requiredPath(value, name) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${name} is required.`);
  if (text.length > 4096) throw new Error(`${name} is too long.`);
  return text;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function parseLastJsonObject(output) {
  const text = String(output || "").trim();
  if (!text.includes("{")) throw new Error("Presentation render returned no JSON report.");
  const start = text.lastIndexOf("\n{");
  const json = start >= 0 ? text.slice(start + 1) : text.slice(text.indexOf("{"));
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new Error(`Presentation render returned invalid JSON: ${error.message}`);
  }
}

function countBy(values) {
  return values.reduce((counts, value) => ({ ...counts, [value]: Number(counts[value] || 0) + 1 }), {});
}

function blankImage(width, height, color) {
  const image = { width, height, rgba: Buffer.alloc(width * height * 4) };
  fillRect(image, 0, 0, width, height, color);
  return image;
}

function fillRect(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  for (let yy = Math.max(0, y); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, x); xx < Math.min(image.width, x + w); xx += 1) setPixel(image, xx, yy, rgb);
  }
}

function fillEllipse(image, x, y, w, h, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      if (((xx + 0.5 - cx) / (w / 2)) ** 2 + ((yy + 0.5 - cy) / (h / 2)) ** 2 <= 1) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillPie(image, cx, cy, radius, segments) {
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      if (Math.hypot(x - cx, y - cy) > radius) continue;
      const angle = (Math.atan2(y - cy, x - cx) * 180 / Math.PI + 360) % 360;
      const segment = segments.find((item) => angle >= item.start && angle < item.end);
      if (segment) setPixel(image, x, y, parseHex(segment.color));
    }
  }
}

function fillLine(image, x1, y1, x2, y2, thickness, color) {
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const sx = x1 < x2 ? 1 : -1;
  const sy = y1 < y2 ? 1 : -1;
  let error = dx - dy;
  let x = x1;
  let y = y1;
  const radius = Math.max(0, Math.floor(thickness / 2));
  while (true) {
    fillRect(image, x - radius, y - radius, radius * 2 + 1, radius * 2 + 1, color);
    if (x === x2 && y === y2) break;
    const doubled = error * 2;
    if (doubled > -dy) {
      error -= dy;
      x += sx;
    }
    if (doubled < dx) {
      error += dx;
      y += sy;
    }
  }
}

function fillSankeyBand(image, x0, sourceTop, sourceBottom, x1, targetTop, targetBottom, color) {
  const points = [];
  const steps = 36;
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceTop, targetTop, t) });
  }
  for (let index = steps; index >= 0; index -= 1) {
    const t = index / steps;
    points.push({ x: x0 + (x1 - x0) * t, y: cubicEase(sourceBottom, targetBottom, t) });
  }
  fillPolygon(image, points, color);
}

function cubicEase(start, end, t) {
  const smooth = t * t * (3 - 2 * t);
  return start + (end - start) * smooth;
}

function fillArrowRight(image, x, y, shaftWidth, shaftHeight, headSize, color) {
  fillRect(image, x, y - Math.floor(shaftHeight / 2), shaftWidth, shaftHeight, color);
  const rgb = parseHex(color);
  const tipX = x + shaftWidth + headSize;
  for (let dx = 0; dx <= headSize; dx += 1) {
    const halfHeight = Math.round(headSize * (1 - dx / Math.max(1, headSize)) / 2);
    for (let yy = y - halfHeight; yy <= y + halfHeight; yy += 1) setPixel(image, tipX - dx, yy, rgb);
  }
}

function fillDonut(image, x, y, w, h, innerRatio, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const innerRx = rx * innerRatio;
  const innerRy = ry * innerRatio;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const outer = ((xx + 0.5 - cx) / rx) ** 2 + ((yy + 0.5 - cy) / ry) ** 2;
      const inner = ((xx + 0.5 - cx) / innerRx) ** 2 + ((yy + 0.5 - cy) / innerRy) ** 2;
      if (outer <= 1 && inner >= 1) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillMagnifier(image, x, y, size, color) {
  const lens = Math.round(size * 0.68);
  fillDonut(image, x, y, lens, lens, 0.58, color);
  const handleWidth = size * 0.12;
  const start = { x: x + lens * 0.68, y: y + lens * 0.68 };
  const end = { x: x + size * 0.94, y: y + size * 0.94 };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const nx = -dy / length * handleWidth / 2;
  const ny = dx / length * handleWidth / 2;
  fillPolygon(image, [
    { x: start.x + nx, y: start.y + ny },
    { x: start.x - nx, y: start.y - ny },
    { x: end.x - nx, y: end.y - ny },
    { x: end.x + nx, y: end.y + ny }
  ], color);
}

function fillDonutSegment(image, x, y, w, h, innerRatio, startDeg, endDeg, color) {
  const rgb = parseHex(color);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const start = ((startDeg % 360) + 360) % 360;
  const end = ((endDeg % 360) + 360) % 360;
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const dx = (xx + 0.5 - cx) / rx;
      const dy = (yy + 0.5 - cy) / ry;
      const radiusSquared = dx * dx + dy * dy;
      if (radiusSquared > 1 || radiusSquared < innerRatio * innerRatio) continue;
      let angle = Math.atan2(dy, dx) * 180 / Math.PI;
      if (angle < 0) angle += 360;
      const inSweep = start <= end ? angle >= start && angle <= end : angle >= start || angle <= end;
      if (inSweep) setPixel(image, xx, yy, rgb);
    }
  }
}

function fillPolygon(image, points, color) {
  const rgb = parseHex(color);
  const minX = Math.floor(Math.min(...points.map((point) => point.x)));
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)));
  const minY = Math.floor(Math.min(...points.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) setPixel(image, x, y, rgb);
    }
  }
}

function pointInPolygon(x, y, points) {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    const denominator = b.y - a.y || 0.0001;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / denominator + a.x) inside = !inside;
  }
  return inside;
}

function setPixel(image, x, y, rgb) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const offset = (y * image.width + x) * 4;
  image.rgba[offset] = rgb[0];
  image.rgba[offset + 1] = rgb[1];
  image.rgba[offset + 2] = rgb[2];
  image.rgba[offset + 3] = 255;
}

function parseHex(value) {
  const hex = String(value).replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) throw new Error("Invalid RGB color.");
  return [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16));
}

module.exports = {
  DEFAULT_THRESHOLDS,
  SLIDE_SIZE,
  createChartFixtures,
  chartRequirements,
  evaluateChartGolden,
  materializeLibreOfficeReport,
  normalizeThresholds,
  parseLastJsonObject,
  reconstructFixture,
  runChartNativeRenderGolden
};
