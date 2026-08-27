"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  parseArgs,
  renderMarkdown,
  summarizeBatchNativeAudit
} = require("../skills/pd-hifi-slideclone/scripts/batch-native-audit-summary");

test("batch native audit summary parses repair-prep no-fail mode", () => {
  const args = parseArgs([
    "node",
    "batch-native-audit-summary.js",
    "--ir-dir",
    "ppt文档/组件策略插件增强版本",
    "--out",
    "runs/batch-native-audit-for-repair.json",
    "--max-download-gated-plugin-targets",
    "0",
    "--max-unknown-protected-crops",
    "0",
    "--max-protected-generic-structured-diagrams",
    "0",
    "--no-fail"
  ]);

  assert.equal(args.irDir, "ppt文档/组件策略插件增强版本");
  assert.equal(args.out, "runs/batch-native-audit-for-repair.json");
  assert.equal(args.maxDownloadGatedPluginTargets, 0);
  assert.equal(args.maxUnknownProtectedCrops, 0);
  assert.equal(args.maxProtectedGenericStructuredDiagrams, 0);
  assert.equal(args.failOnFindings, false);
});

test("batch native audit summary aggregates deck gates", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-"));
  fs.writeFileSync(path.join(dir, "sample.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [{
        id: "component-shape",
        type: "rect",
        box: { x: 10, y: 10, w: 20, h: 20 },
        source: {
          detector: "component-template-native-rect",
          componentOwnerId: "component-1"
        }
      }],
      textBoxes: [{ id: "t1", text: "A", box: { x: 10, y: 40, w: 40, h: 12 } }],
      images: [{
        id: "protected-icon",
        box: { x: 100, y: 100, w: 80, h: 80 },
        source: {
          detector: "decorative-icon-crop",
          expressionFamily: "pictorial-asset",
          expressionForm: "icon-or-illustration",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(path.join(dir, ".openxml-safe-sample.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{ shapes: [], textBoxes: [], images: [] }]
  }, null, 2)}\n`, "utf8");

  const report = summarizeBatchNativeAudit({ irDir: dir });
  const markdown = renderMarkdown(report);

  assert.equal(report.totals.decks, 1);
  assert.equal(report.totals.pages, 1);
  assert.equal(report.totals.fragmentationRisks, 0);
  assert.equal(report.totals.actionableNativeGaps, 0);
  assert.equal(report.totals.protectedCrops, 1);
  assert.equal(report.totals.decisionGateFailures, 0);
  assert.equal(report.totals.oversizedProtectedCrops, 0);
  assert.equal(report.totals.missingProtectedCropEvidence, 0);
  assert.equal(report.totals.expressionFamilies["pictorial-asset"].total, 1);
  assert.equal(report.totals.expressionFamilies["pictorial-asset"].protectedCrops, 1);
  assert.equal(report.decks[0].expressionFamilyCounts["pictorial-asset"].protectedCrops, 1);
  assert.equal(report.decks[0].decisionGate.status, "passed");
  assert.deepEqual(report.findings, []);
  assert.equal(report.totals.embeddedPluginTargets, 0);
  assert.equal(report.totals.executablePluginTargets, 0);
  assert.equal(report.totals.importReadyPluginTargets, 0);
  assert.equal(report.totals.downloadGatedPluginTargets, 0);
  assert.equal(report.totals.protectedPluginCropTargets, 0);
  assert.equal(report.totals.protectedNonSemanticPluginTargets, 0);
  assert.equal(report.totals.unsafePluginTargets, 0);
  assert.equal(report.pluginTargets.summary.embeddedPluginTargets, 0);
  assert.match(markdown, /Batch Native Audit Summary/);
  assert.match(markdown, /Unsafe plugin targets: 0/);
  assert.match(markdown, /Download-gated plugin targets: 0/);
  assert.match(markdown, /Protected non-semantic plugin targets: 0/);
  assert.match(markdown, /Decision gate failures: 0/);
  assert.match(markdown, /Expression families:/);
  assert.match(markdown, /pictorial-asset: total=1, protected=1/);
  assert.match(markdown, /sample/);
});

test("batch native audit summary reports protected non-semantic plugin targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-protected-nonsemantic-"));
  fs.writeFileSync(path.join(dir, "plugin-icon.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: [{
        id: "plugin-arrow-icon",
        box: { x: 100, y: 100, w: 120, h: 120 },
        source: {
          detector: "plugin-cycle-arrow-illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "圆弧箭头 图标图示 素材",
          recommendedAction: "keep-local-crop-unless-exact-component-match",
          componentRenderStrategy: {
            mode: "plugin-component-template",
            implementationMode: "auth-or-download-required",
            bestCandidate: {
              sourceProvider: "islide",
              kind: "component",
              id: "legacy-icon-component",
              title: "圆弧箭头图标素材"
            },
            applicationPlan: {
              targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available"
            }
          },
          layer: {
            layerType: "illustration-zone",
            diagramUnderstanding: {
              nativeReadiness: "native-rebuild",
              visualAtomCount: 12,
              connectorCount: 2
            }
          }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");

  const report = summarizeBatchNativeAudit({ irDir: dir });
  const markdown = renderMarkdown(report);

  assert.equal(report.ok, true);
  assert.equal(report.totals.protectedPluginCropTargets, 1);
  assert.equal(report.totals.protectedNonSemanticPluginTargets, 1);
  assert.equal(report.pluginTargets.summary.protectedNonSemanticTargets, 1);
  assert.equal(report.pluginTargets.decks[0].protectedNonSemanticTargets, 1);
  assert.match(markdown, /Protected non-semantic plugin targets: 1/);
});

test("batch native audit summary can reject unclassified protected crops", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-unknown-protected-"));
  fs.writeFileSync(path.join(dir, "unknown.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: [{
        id: "unknown-protected-icon",
        box: { x: 100, y: 100, w: 80, h: 80 },
        source: {
          detector: "decorative-icon-crop",
          expressionFamily: "unknown",
          expressionForm: "icon-or-illustration",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");

  const compatible = summarizeBatchNativeAudit({ irDir: dir });
  const strict = summarizeBatchNativeAudit({ irDir: dir, maxUnknownProtectedCrops: 0 });

  assert.equal(compatible.ok, true);
  assert.equal(strict.ok, false);
  assert.equal(strict.totals.unknownProtectedCrops, 1);
  assert.equal(strict.unknownProtectedCropExamples.length, 1);
  assert.equal(strict.unknownProtectedCropExamples[0].imageId, "unknown-protected-icon");
  assert.ok(strict.findings.some((finding) => finding.includes("unknownProtectedCrops 1 exceeds allowed 0")));
  assert.match(renderMarkdown(strict), /Unknown protected crops: 1/);
  assert.match(renderMarkdown(strict), /Unknown protected crop examples:/);
});

test("batch native audit summary enforces explicit golden-set coverage thresholds", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-coverage-"));
  fs.writeFileSync(path.join(dir, "one.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: []
    }]
  }, null, 2)}\n`, "utf8");

  const report = summarizeBatchNativeAudit({ irDir: dir, minDecks: 2, minPages: 10 });
  const markdown = renderMarkdown(report);

  assert.equal(report.ok, false);
  assert.equal(report.totals.decks, 1);
  assert.equal(report.totals.pages, 1);
  assert.ok(report.findings.some((finding) => finding.includes("decks 1")));
  assert.ok(report.findings.some((finding) => finding.includes("pages 1")));
  assert.match(markdown, /Findings:/);
});

test("batch native audit summary can fail unresolved download-gated plugin targets explicitly", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-plugin-gated-"));
  fs.writeFileSync(path.join(dir, "plugin.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: [{
        id: "matrix",
        box: { x: 80, y: 120, w: 760, h: 240 },
        source: {
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
          componentRenderStrategy: {
            mode: "plugin-component-template",
            implementationMode: "auth-or-download-required",
            bestCandidate: {
              sourceProvider: "officeplus",
              kind: "component",
              id: "MatlComponentContent-20568",
              title: "扁平3项箭头矩阵"
            },
            applicationPlan: {
              targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available"
            }
          },
          layer: {
            layerType: "table-zone",
            diagramUnderstanding: {
              archetype: "matrix-or-grid",
              nodeCount: 6,
              visualAtomKindCounts: { "grid-line-candidate": 2 }
            }
          }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");

  const lenient = summarizeBatchNativeAudit({ irDir: dir });
  const strict = summarizeBatchNativeAudit({ irDir: dir, maxDownloadGatedPluginTargets: 0 });

  assert.equal(lenient.ok, true);
  assert.equal(lenient.totals.downloadGatedPluginTargets, 1);
  assert.equal(strict.ok, false);
  assert.ok(strict.findings.some((finding) => finding.includes("downloadGatedPluginTargets 1")));
});

test("batch native audit summary fails oversized protected diagram crops", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-large-crop-"));
  fs.writeFileSync(path.join(dir, "bad.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: [{
        id: "large-process-crop",
        box: { x: 80, y: 80, w: 620, h: 280 },
        source: {
          detector: "foreground-graphic-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "process-flow",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "diagram-zone" }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");

  const report = summarizeBatchNativeAudit({ irDir: dir });
  const markdown = renderMarkdown(report);

  assert.equal(report.ok, false);
  assert.equal(report.totals.decisionGateFailures, 1);
  assert.equal(report.totals.oversizedProtectedCrops, 1);
  assert.equal(report.decks[0].decisionGate.status, "failed");
  assert.equal(report.decks[0].oversizedProtectedCrops[0].imageId, "large-process-crop");
  assert.match(markdown, /Oversized protected crops: 1/);
  assert.match(markdown, /oversized protected crop/);
});

test("batch native audit summary fails semantic protected crops without asset exemption", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "batch-native-audit-semantic-crop-"));
  fs.writeFileSync(path.join(dir, "semantic.native.ir.json"), `${JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      shapes: [],
      textBoxes: [],
      images: [{
        id: "small-process-crop",
        box: { x: 120, y: 120, w: 320, h: 130 },
        source: {
          detector: "foreground-graphic-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "process-flow",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "diagram-zone" }
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");

  const report = summarizeBatchNativeAudit({ irDir: dir });
  const markdown = renderMarkdown(report);

  assert.equal(report.ok, false);
  assert.equal(report.totals.semanticProtectedCropsWithoutEvidence, 1);
  assert.equal(report.decks[0].decisionGate.summary.semanticProtectedCropsWithoutEvidence, 1);
  assert.ok(report.findings.some((finding) => finding.includes("semanticProtectedCropsWithoutEvidence")));
  assert.match(markdown, /Semantic protected crops without evidence: 1/);
  assert.match(markdown, /semantic protected crop missing exemption/);
});
