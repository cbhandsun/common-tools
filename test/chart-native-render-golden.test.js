"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseArgs, usage } = require("../skills/pd-hifi-slideclone/scripts/chart-native-render-golden-smoke");
const {
  createChartFixtures,
  evaluateChartGolden,
  materializeLibreOfficeReport,
  normalizeThresholds,
  parseLastJsonObject
} = require("../skills/pd-hifi-slideclone/scripts/lib/chart-native-render-golden");

test("chart native render golden exposes a side-effect-free help contract", () => {
  assert.match(usage(), /max-foreground-missing-ratio/);
  assert.deepEqual(parseArgs(["--out", "runs/chart", "--timeout-ms", "90000"]), { out: "runs/chart", "timeout-ms": "90000" });
});

test("chart native render golden creates bounded pixel fixtures", () => {
  const fixtures = createChartFixtures();
  assert.equal(fixtures.length, 34);
  assert.deepEqual(fixtures.map((fixture) => fixture.id), [
    "native-bar-chart",
    "native-scatter-chart",
    "native-line-chart",
    "native-donut-chart",
    "native-donut-chart-visual-only",
    "native-waterfall-chart",
    "native-heatmap-matrix",
    "native-gantt-roadmap",
    "native-timeline-roadmap",
    "native-timeline-roadmap-visual-only",
    "native-pie-chart",
    "native-pie-chart-visual-only",
    "native-treemap-chart",
    "native-gauge-chart",
    "native-gauge-chart-visual-only",
    "native-radar-chart",
    "native-concentric-circles",
    "native-concentric-circles-visual-only",
    "native-quadrant-matrix",
    "native-comparison-matrix",
    "native-hub-spoke",
    "native-swimlane-flow",
    "native-layered-stack",
    "native-cycle-loop",
    "native-cycle-loop-visual-only",
    "native-funnel-lens-flow",
    "native-sankey-flow",
    "native-venn-overlap",
    "native-venn-overlap-visual-only",
    "native-measured-generic-graph",
    "native-topology-diagram",
    "native-flow-card-chain",
    "native-tree-structure",
    "native-fishbone-cause-effect"
  ]);
  assert.ok(fixtures.every((fixture) => fixture.image.width === 560 && fixture.image.height === 340));
  assert.ok(fixtures.every((fixture) => fixture.image.rgba.length === 560 * 340 * 4));
});

test("chart native render golden sanitizes threshold boundaries", () => {
  const thresholds = normalizeThresholds({ maxPixelDiffRatio: -1, maxForegroundMissingRatio: "0.2", maxMeanAbsoluteDelta: Infinity });
  assert.equal(thresholds.maxPixelDiffRatio, 0.08);
  assert.equal(thresholds.maxForegroundMissingRatio, 0.2);
  assert.equal(thresholds.maxMeanAbsoluteDelta, 12);
});

test("chart native render golden parses noisy PowerPoint output", () => {
  assert.deepEqual(parseLastJsonObject(`build output\n${JSON.stringify({ passed: true, renderedPages: [] })}`), { passed: true, renderedPages: [] });
  assert.throws(() => parseLastJsonObject("no report"), /no JSON report/);
});

test("chart native render golden materializes isolated LibreOffice images", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-chart-report-test-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const isolatedImage = path.join(root, "isolated", "lo-page-1.png");
  const outputDir = path.join(root, "stable-output");
  fs.mkdirSync(path.dirname(isolatedImage), { recursive: true });
  fs.writeFileSync(isolatedImage, Buffer.from([1, 2, 3, 4]));

  const report = materializeLibreOfficeReport({
    passed: true,
    stagedPptxFile: path.join(root, "isolated", "office-input.pptx"),
    pdf: path.join(root, "isolated", "office-input.pdf"),
    renderedPages: [{ pageIndex: 0, image: isolatedImage, width: 560, height: 340 }]
  }, outputDir);

  assert.equal(report.stagedPptxFile, null);
  assert.equal(report.pdf, null);
  assert.equal(report.renderedPageCount, 1);
  assert.equal(report.renderedPages[0].image, path.join(outputDir, "render", "lo-page-001.png"));
  assert.deepEqual(fs.readFileSync(report.renderedPages[0].image), Buffer.from([1, 2, 3, 4]));
  assert.equal(report.reportFile, path.join(outputDir, "libreoffice-benchmark.report.json"));
  assert.equal(JSON.parse(fs.readFileSync(report.reportFile, "utf8")).renderedPages[0].image, report.renderedPages[0].image);
});

test("chart native render golden rejects a missing isolated render", () => {
  assert.throws(
    () => materializeLibreOfficeReport({ renderedPages: [{ pageIndex: 0, image: "missing-page.png" }] }, path.join(os.tmpdir(), "slideclone-missing-chart-report")),
    /rendered page is missing/
  );
});

test("chart native render golden fails incomplete native chart evidence", () => {
  const report = evaluateChartGolden({
    pages: [{ id: "bar", archetype: "bar-chart", nativeReadiness: "native-rebuild", shapeCount: 4, detectorCounts: { "visual-chart-native-axis": 1, "visual-chart-native-bar": 3 } }],
    comparisons: [{ ok: true }],
    renderReport: { passed: true, renderedPageCount: 1 },
    editability: { slideCount: 1, slides: [{ nativeObjects: 4, pictures: 0 }] },
    thresholds: {}
  });
  assert.equal(report.passed, false);
  assert.ok(report.pages[0].issues.includes("insufficient-native-axes"));
  assert.ok(report.pages[0].issues.includes("insufficient-native-series-marks"));
});
