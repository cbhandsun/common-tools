"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  auditMinimumUnitGaps,
  buildRepairQueue,
  collectIrFiles,
  inferRecommendedRoute,
  parseArgs,
  shouldFlagMinimumUnitGap
} = require("../skills/pd-hifi-slideclone/scripts/minimum-unit-gap-audit");

function writeIr(dir, name, ir) {
  const file = path.join(dir, `${name}.native.ir.json`);
  fs.writeFileSync(file, `${JSON.stringify(ir, null, 2)}\n`, "utf8");
  return file;
}

function image(id, box, source) {
  return { id, box, source };
}

test("minimum unit gap audit parses CLI flags", () => {
  const args = parseArgs([
    "node",
    "minimum-unit-gap-audit.js",
    "--ir-dir",
    "out",
    "--out",
    "gap.json",
    "--markdown-out",
    "gap.md",
    "--repair-queue-out",
    "queue.json",
    "--min-area-ratio",
    "0.2",
    "--max-actions",
    "12",
    "--recursive",
    "--fail-on-gap"
  ]);

  assert.equal(args.irDir, "out");
  assert.equal(args.out, "gap.json");
  assert.equal(args.markdownOut, "gap.md");
  assert.equal(args.repairQueueOut, "queue.json");
  assert.equal(args.minAreaRatio, 0.2);
  assert.equal(args.maxActions, 12);
  assert.equal(args.recursive, true);
  assert.equal(args.failOnGap, true);
});

test("minimum unit gap audit recursively discovers sharded IR outputs when requested", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-recursive-"));
  try {
    const nested = path.join(tmp, "case-a", "result");
    fs.mkdirSync(nested, { recursive: true });
    writeIr(nested, "Deck_Nested", { pages: [] });
    assert.deepEqual(collectIrFiles(tmp), []);
    assert.equal(collectIrFiles(tmp, { recursive: true }).length, 1);
    assert.equal(auditMinimumUnitGaps({ irDir: tmp, recursive: true }).summary.decks, 1);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("minimum unit gap audit flags large structural crops and protects icons/screenshots", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-audit-"));
  writeIr(tmp, "Deck_A", {
    slideSize: { widthPt: 1000, heightPt: 500 },
    pages: [{
      images: [
        image("table-grid", { x: 100, y: 40, w: 650, h: 320 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
          layer: { layerType: "diagram-zone" }
        }),
        image("icon-example", { x: 100, y: 40, w: 650, h: 320 }, {
          detector: "cycle-illustration-underlay-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "图标 图示",
          recommendedAction: "match-icon-library-or-keep-local-crop",
          layer: { layerType: "illustration-zone" }
        }),
        image("screenshot", { x: 100, y: 40, w: 650, h: 320 }, {
          detector: "screenshot-process-underlay-crop",
          expressionForm: "screenshot-or-document",
          expressionSubtype: "ui-screenshot",
          recommendedAction: "keep-local-crop-and-overlay-external-text-only",
          layer: { layerType: "screenshot-zone" }
        })
      ]
    }]
  });
  fs.writeFileSync(path.join(tmp, ".openxml-safe-Deck_A.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 1000, heightPt: 500 },
    pages: [{ images: [image("duplicate-gap", { x: 0, y: 0, w: 800, h: 400 }, {
      detector: "foreground-graphic-underlay-crop",
      expressionForm: "table-or-matrix",
      expressionSubtype: "table-grid",
      recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
      layer: { layerType: "diagram-zone" }
    })] }]
  }, null, 2)}\n`, "utf8");

  const report = auditMinimumUnitGaps({
    irDir: tmp,
    out: path.join(tmp, "report.json"),
    markdownOut: path.join(tmp, "report.md"),
    repairQueueOut: path.join(tmp, "queue.json"),
    minAreaRatio: 0.18
  });

  assert.equal(report.ok, false);
  assert.equal(report.summary.minimumUnitGaps, 1);
  assert.equal(report.summary.decks, 1);
  assert.equal(report.summary.protectedCrops, 2);
  assert.equal(report.gaps[0].imageId, "table-grid");
  assert.equal(report.gaps[0].recommendedRoute, "native-table-or-card-grid");
  assert.equal(report.gaps[0].expressionPolicy.unitDisposition, "semantic-native-structure");
  assert.deepEqual(report.gaps[0].targetMotifs, ["card-grid"]);
  assert.ok(report.protectedCropExamples.some((item) => item.imageId === "icon-example" && item.expressionPolicy.unitDisposition === "intentional-visual-crop"));
  assert.ok(report.protectedCropExamples.some((item) => item.imageId === "screenshot" && item.expressionPolicy.unitDisposition === "intentional-visual-crop"));
  assert.match(fs.readFileSync(path.join(tmp, "report.md"), "utf8"), /Minimum Unit Gap Audit/);

  const queue = JSON.parse(fs.readFileSync(path.join(tmp, "queue.json"), "utf8"));
  assert.equal(queue.actions.length, 1);
  assert.equal(queue.actions[0].violation, "minimum-unit-structural-crop-gap");
  assert.equal(queue.actions[0].repair.mode, "reclassify-structural-diagram-or-component-template");
});

test("minimum unit gap audit ignores objectified native images and small structural crops", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-audit-objectified-"));
  writeIr(tmp, "Deck_B", {
    slideSize: { widthPt: 1000, heightPt: 500 },
    pages: [{
      images: [
        image("already-native", { x: 0, y: 0, w: 700, h: 320 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "process-flow",
          recommendedAction: "replace-with-native-components",
          nativeRebuild: true,
          editable: true,
          layer: { layerType: "diagram-zone" }
        }),
        image("small-table", { x: 0, y: 0, w: 100, h: 50 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
          layer: { layerType: "diagram-zone" }
        })
      ]
    }]
  });

  const report = auditMinimumUnitGaps({ irDir: tmp, minAreaRatio: 0.18 });

  assert.equal(report.ok, true);
  assert.equal(report.summary.minimumUnitGaps, 0);
  assert.equal(report.summary.objectifiedImages, 1);
});

test("minimum unit gap audit does not mistake debugger screenshots for editable card grids", () => {
  const screenshot = image("debugger", { x: 0, y: 0, w: 800, h: 400 }, {
    detector: "top-complex-diagram-crop",
    expressionFamily: "layout-grid",
    expressionForm: "screenshot-or-document",
    expressionSubtype: "debugger-window-screenshot",
    recommendedAction: "keep-local-crop-and-overlay-external-text-only",
    layer: { layerType: "screenshot-zone" }
  });

  assert.equal(shouldFlagMinimumUnitGap({
    image: screenshot,
    policy: { protectCrop: false, allowNativeRebuild: true },
    areaRatio: 0.64,
    minAreaRatio: 0.18
  }), false);
});

test("minimum unit gap audit uses expression family to separate structure from pictorial assets", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-audit-family-"));
  writeIr(tmp, "Deck_Family", {
    slideSize: { widthPt: 1000, heightPt: 500 },
    pages: [{
      images: [
        image("family-chart", { x: 80, y: 40, w: 650, h: 320 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionFamily: "data-chart",
          expressionForm: "",
          expressionSubtype: "",
          recommendedAction: "preserve-crop-until-classified",
          layer: { layerType: "diagram-zone" }
        }),
        image("family-asset", { x: 80, y: 40, w: 650, h: 320 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionFamily: "pictorial-asset",
          expressionForm: "",
          expressionSubtype: "流程图表示意样例",
          recommendedAction: "preserve-crop-until-classified",
          layer: { layerType: "illustration-zone" }
        })
      ]
    }]
  });

  const report = auditMinimumUnitGaps({ irDir: tmp, minAreaRatio: 0.18 });

  assert.equal(report.ok, false);
  assert.equal(report.summary.minimumUnitGaps, 1);
  assert.equal(report.summary.protectedCrops, 1);
  assert.equal(report.gaps[0].imageId, "family-chart");
  assert.equal(report.gaps[0].expressionFamily, "data-chart");
  assert.equal(buildRepairQueue(report).actions[0].expressionFamily, "data-chart");
});

test("minimum unit gap audit does not force obvious diagram samples into native rebuild", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "minimum-unit-gap-audit-visual-sample-"));
  writeIr(tmp, "Deck_Visual_Sample", {
    slideSize: { widthPt: 1000, heightPt: 500 },
    pages: [{
      images: [
        image("diagram-sample", { x: 80, y: 40, w: 650, h: 320 }, {
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "",
          expressionSubtype: "流程图表示意样例 图标图示",
          recommendedAction: "preserve-crop-until-classified",
          layer: { layerType: "illustration-zone" }
        })
      ]
    }]
  });

  const report = auditMinimumUnitGaps({ irDir: tmp, minAreaRatio: 0.18 });

  assert.equal(report.ok, true);
  assert.equal(report.summary.minimumUnitGaps, 0);
  assert.equal(report.gaps.length, 0);
});

test("minimum unit gap helpers route common structures", () => {
  assert.equal(inferRecommendedRoute({ source: { expressionSubtype: "循环圆弧箭头" } }).templateFamily, "cycle-arrow");
  assert.equal(inferRecommendedRoute({ source: { expressionSubtype: "dashboard bar-chart 图表" } }).templateFamily, "chart");
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "地图热力图" } }).targetMotifs, ["map-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "关键词云 词云组件" } }).targetMotifs, ["word-cloud-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "桑基图 流量分布" } }).targetMotifs, ["sankey-flow-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "仪表盘图 速度表" } }).targetMotifs, ["gauge-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "能力雷达图" } }).targetMotifs, ["radar-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "矩形树图 面积占比" } }).targetMotifs, ["treemap-chart"]);
  assert.deepEqual(inferRecommendedRoute({ source: { expressionSubtype: "鱼骨图 因果分析" } }).targetMotifs, ["fishbone-cause"]);
  assert.equal(inferRecommendedRoute({
    source: {
      expressionSubtype: "large chart crop",
      componentRenderStrategy: {
        targetMotifs: ["word-cloud-chart"],
        bestCandidate: {
          title: "OfficePLUS 词云组件",
          structureSignature: { motifs: ["word-cloud-chart"] }
        }
      }
    }
  }).templateFamily, "word-cloud-chart");
  assert.equal(inferRecommendedRoute({
    source: {
      detector: "structured-case-graphic-underlay-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "dense-complex-diagram",
      layer: {
        layerType: "diagram-zone",
        diagramUnderstanding: {
          componentStrategy: { templateFamily: "chart", targetMotifs: ["pie-share-chart"] }
        }
      }
    }
  }).templateFamily, "generic-structure");
  assert.equal(shouldFlagMinimumUnitGap({
    policy: { allowNativeRebuild: true, protectCrop: false },
    objectified: false,
    areaRatio: 0.3,
    minAreaRatio: 0.18
  }), true);
  assert.equal(buildRepairQueue({ gaps: [{ deck: "D", slide: 1, image: 1, imageId: "g", recommendedRoute: "plugin-or-native-process-flow", targetMotifs: ["linear-arrow-chain"] }] }).actions[0].repair.prioritizePluginTemplateReplacement, true);
  assert.equal(buildRepairQueue({ gaps: [{ deck: "D", slide: 1, image: 1, imageId: "m", recommendedRoute: "plugin-map-chart-component", targetMotifs: ["map-chart"] }] }).actions[0].repair.prioritizePluginTemplateReplacement, true);
});
