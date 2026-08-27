"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  aggregateRows,
  buildComponentCoverageMatrix,
  classifyResidualDisposition,
  isIntentionalPreserveLayer,
  _private,
  residualPriority,
  resolveLatestReports,
  summarizeCandidateReport,
  summarizeComponentRebuildReport,
  summarizeExpressionPolicyReport,
  summarizeFinalIrNativeOpportunities
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-coverage-matrix");
const {
  applyCoverageGates,
  normalizeMotifTargetMinimums,
  parseArgs,
  readCoverageManifest
} = require("../skills/pd-hifi-slideclone/scripts/component-coverage-matrix");

test("component coverage matrix summarizes rebuild reports and actionable residuals", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-matrix-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [
      {
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "hub-spoke",
        componentRenderStrategy: { mode: "plugin-component-template" }
      },
      {
        pageIndex: 1,
        imageIndex: 0,
        layerType: "screenshot-zone",
        templateFamily: "icon-or-illustration",
        componentRenderStrategy: { mode: "preserve-local-crop" },
        bestCandidates: [{ title: "蓝色渐变右箭头", candidateScore: 28 }]
      },
      {
        pageIndex: 2,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "generic",
        componentRenderStrategy: { mode: "preserve-local-crop" },
        bestCandidates: [{ title: "鱼骨图分析原因", candidateScore: 32 }]
      }
    ]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Demo.work"),
      outputPptx: path.join(tmp, "Demo.native-editable.pptx"),
      componentCandidateReport: candidateFile,
      pages: 3,
      images: 4,
      shapes: 12,
      textBoxes: 8,
      componentStrategyLayers: 3,
      componentStrategyModeCounts: {
        "plugin-component-template": 1,
        "preserve-local-crop": 2
      },
      componentTemplateAppliedImages: 1,
      componentTemplateAppliedShapes: 7,
      componentTemplateAppliedTextBoxes: 2,
      componentTemplateAppliedPictures: 1,
      visualAtomTopologyConnectors: 2,
      visualAtomContainerNodes: 1,
      visualAtomContainedNodes: 2,
      componentAssetSummary: {
        layers: 3,
        layersWithLocalAssets: 2,
        localAssetMatches: 6,
        assetsWithRecommendedGroups: 1,
        recommendedGroupMatches: 3,
        highReusableGroupMatches: 2
      },
      status: "converted"
    }]
  })}\n`, "utf8");
  writeStoredZip(path.join(tmp, "Demo.native-editable.pptx"), {
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>"
  });

  const rows = summarizeComponentRebuildReport(reportFile);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(rows[0].deck, "Demo");
  assert.equal(rows[0].outputPptxExists, true);
  assert.equal(rows[0].outputPptxBytes > 4, true);
  assert.equal(rows[0].outputPptxZipValid, true);
  assert.equal(rows[0].outputPptxOpenXmlValid, true);
  assert.deepEqual(rows[0].outputPptxMissingEntries, []);
  assert.equal(rows[0].residualLayers, 2);
  assert.equal(rows[0].intentionalPreserveLayers, 1);
  assert.equal(rows[0].actionableResidualLayers, 1);
  assert.equal(rows[0].actionableResiduals[0].candidateTitle, "鱼骨图分析原因");
  assert.equal(rows[0].actionableResiduals[0].disposition, "native-rebuild-candidate");
  assert.equal(rows[0].actionableResiduals[0].priority, "high");
  assert.equal(matrix.totals.decks, 1);
  assert.equal(rows[0].componentTemplateAppliedTextBoxes, 2);
  assert.equal(rows[0].componentTemplateAppliedPictures, 1);
  assert.equal(rows[0].componentTemplateStructureFitShapes, 0);
  assert.equal(rows[0].componentTemplateStructureFitTextBoxes, 0);
  assert.equal(rows[0].componentTemplateStructureFitPictures, 0);
  assert.equal(rows[0].visualAtomTopologyConnectors, 2);
  assert.equal(rows[0].visualAtomContainerNodes, 1);
  assert.equal(rows[0].visualAtomContainedNodes, 2);
  assert.equal(rows[0].componentAssetHighReusableGroups, 2);
  assert.equal(matrix.totals.componentTemplateAppliedTextBoxes, 2);
  assert.equal(matrix.totals.componentTemplateAppliedPictures, 1);
  assert.equal(matrix.totals.componentTemplateStructureFitShapes, 0);
  assert.equal(matrix.totals.componentTemplateStructureFitTextBoxes, 0);
  assert.equal(matrix.totals.componentTemplateStructureFitPictures, 0);
  assert.equal(matrix.totals.visualAtomTopologyConnectors, 2);
  assert.equal(matrix.totals.visualAtomContainerNodes, 1);
  assert.equal(matrix.totals.visualAtomContainedNodes, 2);
  assert.equal(matrix.totals.componentAssetHighReusableGroups, 2);
  assert.equal(matrix.totals.componentTemplateAppliedImageRatio, 0.3333);
  assert.equal(matrix.totals.componentTemplateStructureFitShapeRatio, 0);
  assert.equal(matrix.totals.componentAssetLocalCoverageRatio, 0.6667);
  assert.equal(matrix.totals.actionableResidualRatio, 0.5);
  assert.deepEqual(matrix.totals.residualDispositionCounts, {
    "keep-screenshot-or-product-crop": 1,
    "native-rebuild-candidate": 1
  });
  assert.deepEqual(matrix.totals.residualPriorityCounts, {
    keep: 1,
    high: 1
  });
});

test("component coverage matrix fails gate when referenced output pptx is missing", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      deckNames: ["Deck_A"],
      duplicateDecks: [],
      actionableResidualLayers: 0,
      missingOutputPptx: [{ deck: "Deck_A", outputPptx: "missing.pptx" }]
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    requireOutputPptxExists: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"]
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireOutputPptxExists, true);
  assert.equal(matrix.totals.outputPptxExistsMet, false);
});

test("component coverage matrix fails gate when expression policy violations are present", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      deckNames: ["Deck_A"],
      duplicateDecks: [],
      actionableResidualLayers: 0,
      expressionPolicyViolationLayers: 1
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    requireNoExpressionPolicyViolations: true
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireNoExpressionPolicyViolations, true);
  assert.equal(matrix.totals.expressionPolicyViolationsMet, false);
});

test("component coverage matrix can fail gate on unclassified expression policy units", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      deckNames: ["Deck_A"],
      duplicateDecks: [],
      actionableResidualLayers: 0,
      expressionPolicyViolationLayers: 0,
      expressionPolicyUnitDispositionCounts: {
        "classification-needed": 1,
        "intentional-visual-crop": 2
      }
    }
  };

  applyCoverageGates(matrix, {
    requireNoExpressionPolicyClassificationNeeded: true
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireNoExpressionPolicyClassificationNeeded, true);
  assert.equal(matrix.totals.expressionPolicyClassificationNeededMet, false);
});

test("component coverage matrix fails gate when referenced output pptx is not a zip container", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      deckNames: ["Deck_A"],
      duplicateDecks: [],
      actionableResidualLayers: 0,
      missingOutputPptx: [],
      invalidOutputPptx: [{ deck: "Deck_A", outputPptx: "placeholder.pptx", bytes: 12 }]
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    requireOutputPptxExists: true,
    requireOutputPptxZip: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"]
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireOutputPptxZip, true);
  assert.equal(matrix.totals.outputPptxZipMet, false);
});

test("component coverage matrix verifies required PresentationML entries", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-pptx-"));
  const validPptx = path.join(tmp, "valid.pptx");
  const ordinaryZip = path.join(tmp, "ordinary.pptx");
  writeStoredZip(validPptx, {
    "[Content_Types].xml": "<Types/>",
    "ppt/presentation.xml": "<p:presentation/>",
    "ppt/slides/slide1.xml": "<p:sld/>"
  });
  writeStoredZip(ordinaryZip, {
    "notes.txt": "not a PowerPoint package"
  });

  assert.deepEqual(_private.listZipEntries(validPptx), [
    "[Content_Types].xml",
    "ppt/presentation.xml",
    "ppt/slides/slide1.xml"
  ]);
  assert.equal(_private.outputZipValid(ordinaryZip), true);
  assert.equal(_private.outputPptxOpenXmlValid(validPptx), true);
  assert.deepEqual(_private.outputPptxMissingEntries(validPptx), []);
  assert.equal(_private.outputPptxOpenXmlValid(ordinaryZip), false);
  assert.deepEqual(_private.outputPptxMissingEntries(ordinaryZip), [
    "[Content_Types].xml",
    "ppt/presentation.xml"
  ]);
});

test("component coverage matrix fails gate when zip lacks PPTX OpenXML entries", () => {
  const matrix = {
    totals: {
      decks: 1,
      uniqueDecks: 1,
      deckNames: ["Deck_A"],
      duplicateDecks: [],
      actionableResidualLayers: 0,
      missingOutputPptx: [],
      invalidOutputPptx: [],
      invalidOpenXmlPptx: [{
        deck: "Deck_A",
        outputPptx: "ordinary.pptx",
        missingEntries: ["[Content_Types].xml", "ppt/presentation.xml"]
      }]
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    requireOutputPptxExists: true,
    requireOutputPptxZip: true,
    requireOutputPptxOpenXml: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"]
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.requireOutputPptxOpenXml, true);
  assert.equal(matrix.totals.outputPptxOpenXmlMet, false);
});

test("component coverage matrix classifies screenshots and icons as intentional preserves", () => {
  assert.equal(isIntentionalPreserveLayer({ layerType: "screenshot-zone" }), true);
  assert.equal(isIntentionalPreserveLayer({ family: "icon-or-illustration" }), true);
  assert.equal(isIntentionalPreserveLayer({ layerType: "value-banner-zone" }), true);
  assert.equal(isIntentionalPreserveLayer({ layerType: "chart-zone", detector: "kpi-evidence-crop" }), true);
  assert.equal(isIntentionalPreserveLayer({ layerType: "diagram-zone", areaRatio: 0.014 }), true);
  assert.equal(isIntentionalPreserveLayer({ layerType: "diagram-zone", box: { w: 84, h: 86 } }), true);
  assert.equal(isIntentionalPreserveLayer({ layerType: "diagram-zone", family: "hub-spoke" }), false);
  assert.equal(isIntentionalPreserveLayer({ layerType: "chart-zone", family: "bar-chart" }), false);
});

test("component coverage matrix audits expression policy outcomes", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-expression-policy-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [
      {
        pageIndex: 0,
        imageIndex: 0,
        layerType: "illustration-zone",
        detector: "plugin-cycle-arrow-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "cycle-flow-icon visual-example",
        standaloneVisualAsset: true,
        componentRenderStrategy: { mode: "preserve-local-crop" }
      },
      {
        pageIndex: 0,
        imageIndex: 1,
        layerType: "diagram-zone",
        detector: "relationship-diagram-underlay-crop",
        expressionForm: "complex-diagram",
        templateFamily: "hub-spoke",
        areaRatio: 0.24,
        componentRenderStrategy: { mode: "preserve-local-crop" },
        bestCandidates: [{ title: "中心关系图", candidateScore: 51 }]
      },
      {
        pageIndex: 1,
        imageIndex: 0,
        layerType: "table-zone",
        expressionForm: "table-or-matrix",
        expressionSubtype: "grid",
        componentRenderStrategy: { mode: "native-visual-atom-rebuild" }
      },
      {
        pageIndex: 1,
        imageIndex: 1,
        layerType: "screenshot-zone",
        expressionForm: "screenshot-or-document",
        expressionSubtype: "ui-screenshot",
        componentRenderStrategy: { mode: "preserve-crop-with-native-overlays" }
      }
    ]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Policy.work"),
      componentCandidateReport: candidateFile,
      pages: 2,
      images: 4,
      status: "converted"
    }]
  })}\n`, "utf8");

  const policy = summarizeExpressionPolicyReport(candidateFile);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(policy.layers, 4);
  assert.deepEqual(policy.dispositionCounts, {
    "standalone-visual-asset": 1,
    "structured-diagram": 1,
    "table-or-matrix": 1,
    "screenshot-or-document": 1
  });
  assert.deepEqual(policy.unitDispositionCounts, {
    "intentional-visual-crop": 2,
    "semantic-native-structure": 2
  });
  assert.deepEqual(policy.violationCounts, {
    "structured-diagram-left-as-flat-crop": 1
  });
  assert.equal(policy.violations[0].candidateTitle, "中心关系图");
  assert.equal(matrix.totals.expressionPolicyLayers, 4);
  assert.deepEqual(matrix.totals.expressionPolicyUnitDispositionCounts, {
    "intentional-visual-crop": 2,
    "semantic-native-structure": 2
  });
  assert.equal(matrix.totals.expressionPolicyViolationLayers, 1);
  assert.equal(matrix.totals.expressionPolicyViolationRatio, 0.25);
  assert.equal(matrix.totals.expressionPolicyViolations[0].deck, "Policy");
  assert.equal(_private.classifyExpressionPolicyOutcome("plugin-component-template"), "component-template");
  assert.equal(_private.isStandaloneExpressionPolicyAsset({
    layerType: "illustration-zone",
    expressionSubtype: "visual-example"
  }), true);
});

test("component coverage matrix uses central expression policy before protecting diagram wording", () => {
  const structured = _private.summarizeExpressionPolicyLayer({
    layerType: "diagram-zone",
    detector: "process-graphic-underlay-crop",
    expressionForm: "complex-diagram",
    expressionSubtype: "流程图示",
    templateFamily: "process-chain",
    diagramUnderstanding: {
      nodeCount: 4,
      connectorCount: 3,
      nativeReadiness: "native-rebuild"
    },
    componentRenderStrategy: { mode: "preserve-local-crop" }
  });
  const icon = _private.summarizeExpressionPolicyLayer({
    layerType: "illustration-zone",
    detector: "plugin-cycle-arrow-illustration-crop",
    expressionForm: "icon-or-illustration",
    expressionSubtype: "循环图示 visual-example",
    standaloneVisualAsset: true,
    componentRenderStrategy: { mode: "preserve-local-crop" }
  });

  assert.equal(structured.disposition, "structured-diagram");
  assert.equal(structured.unitDisposition, "semantic-native-structure");
  assert.equal(structured.policyKind, "structured-native");
  assert.equal(structured.violation, "structured-diagram-left-as-flat-crop");
  assert.equal(icon.disposition, "standalone-visual-asset");
  assert.equal(icon.unitDisposition, "intentional-visual-crop");
  assert.equal(icon.violation, "");
});

test("component coverage matrix prefers final IR expression strategy over stale candidate layer strategy", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-expression-policy-final-ir-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const finalIrFile = path.join(tmp, "Policy.native.ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  const box = { x: 120, y: 80, w: 360, h: 180 };
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      layerType: "illustration-zone",
      detector: "wms-chain-underlay-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "visual-example",
      standaloneVisualAsset: true,
      box,
      componentRenderStrategy: { mode: "plugin-component-template" }
    }]
  })}\n`, "utf8");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [{
      images: [{
        box,
        source: {
          detector: "wms-chain-underlay-crop",
          layerType: "illustration-zone",
          intentionalMinimumUnitCrop: true,
          expressionForm: "icon-or-illustration",
          expressionSubtype: "visual-example",
          componentRenderStrategy: {
            mode: "preserve-local-crop",
            editableExpectation: "standalone-visual-asset-preserved-as-movable-crop"
          }
        }
      }],
      shapes: [],
      textBoxes: []
    }]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Policy.work"),
      outputIr: finalIrFile,
      componentCandidateReport: candidateFile,
      pages: 1,
      images: 1,
      status: "converted"
    }]
  })}\n`, "utf8");

  const policy = summarizeExpressionPolicyReport(candidateFile, { finalIrFile });
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(policy.layers, 1);
  assert.equal(policy.outcomeCounts["fidelity-crop"], 1);
  assert.equal(policy.violationCounts["standalone-asset-over-objectified"] || 0, 0);
  assert.equal(matrix.rows[0].expressionPolicyViolations.length, 0);
  assert.equal(matrix.totals.expressionPolicyViolationLayers, 0);
});

test("component coverage matrix recognizes an objectified native table beneath its retained header icon", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-expression-policy-native-table-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const finalIrFile = path.join(tmp, "Table.native.ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  const box = { x: 40, y: 120, w: 880, h: 380 };
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      layerType: "table-zone",
      detector: "foreground-graphic-underlay-crop",
      box,
      componentRenderStrategy: { mode: "native-visual-atom-rebuild" }
    }]
  })}\n`, "utf8");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [{
      images: [{
        box,
        source: {
          detector: "foreground-graphic-underlay-crop",
          layerType: "table-zone",
          nativeRebuild: true,
          tableGridObjectified: true,
          objectifiedGrid: { rows: 4, columns: 3 },
          componentRenderStrategy: { mode: "preserve-local-crop" }
        }
      }],
      shapes: [],
      textBoxes: []
    }]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Table.work"),
      outputIr: finalIrFile,
      componentCandidateReport: candidateFile,
      pages: 1,
      images: 1,
      status: "converted"
    }]
  })}\n`, "utf8");

  const policy = summarizeExpressionPolicyReport(candidateFile, { finalIrFile });
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(policy.outcomeCounts["native-rebuild"], 1);
  assert.equal(policy.violationCounts["table-or-matrix-left-as-flat-crop"] || 0, 0);
  assert.equal(matrix.rows[0].actionableResidualLayers, 0);
  assert.equal(matrix.totals.expressionPolicyViolationLayers, 0);
});

test("component coverage matrix does not let candidate titles reclassify decorative or entropy assets as matrices", () => {
  const decorative = _private.summarizeExpressionPolicyLayer({
    layerType: "decorative-zone",
    detector: "decorative-cover-background-underlay",
    templateFamily: "grid-or-matrix",
    componentRenderStrategy: { mode: "preserve-local-crop" },
    bestCandidates: [{ title: "扁平3项箭头矩阵", candidateScore: 80 }]
  });
  const entropy = _private.summarizeExpressionPolicyLayer({
    layerType: "illustration-zone",
    detector: "entropy-challenge-crop",
    templateFamily: "grid-or-matrix",
    componentRenderStrategy: { mode: "preserve-local-crop" },
    bestCandidates: [{ title: "扁平3项箭头矩阵", candidateScore: 80 }]
  });

  assert.equal(decorative.disposition, "decorative-or-banner");
  assert.equal(decorative.violation, "");
  assert.equal(entropy.disposition, "standalone-visual-asset");
  assert.equal(entropy.violation, "");
});

test("component coverage matrix keeps protected mixed screenshot diagrams until a matching subtype rebuilder exists", () => {
  const disposition = classifyResidualDisposition({
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    expressionSubtype: "dense-complex-diagram",
    recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident"
  });

  assert.equal(disposition, "keep-protected-mixed-visual-crop");
  assert.equal(residualPriority({ disposition }), "keep");
});

function writeStoredZip(file, entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralOffset = offset;
  const central = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8);
  eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  fs.writeFileSync(file, Buffer.concat([...localParts, central, eocd]));
}

test("component coverage matrix explains residual disposition and priority", () => {
  assert.equal(classifyResidualDisposition({ layerType: "screenshot-zone" }), "keep-screenshot-or-product-crop");
  assert.equal(classifyResidualDisposition({ layerType: "decorative-zone" }), "keep-decorative-crop");
  assert.equal(classifyResidualDisposition({ detector: "kpi-evidence-crop" }), "keep-kpi-evidence-crop");
  assert.equal(classifyResidualDisposition({ layerType: "chart-zone", family: "bar-chart" }), "needs-chart-data-or-series-detection");
  assert.equal(classifyResidualDisposition({ layerType: "table-zone", residualState: "objectified-table-grid-large-residual" }), "residual-split-needed-after-native-grid");
  assert.equal(classifyResidualDisposition({ layerType: "table-zone", mode: "native-visual-atom-rebuild", family: "grid-or-matrix" }), "native-rebuild-covered-with-fidelity-underlay");
  assert.equal(classifyResidualDisposition({ layerType: "table-zone", expressionSubtype: "table-grid" }), "native-rebuild-candidate");
  assert.equal(classifyResidualDisposition({ layerType: "diagram-zone", family: "hub-spoke" }), "native-rebuild-candidate");
  assert.equal(residualPriority({ layerType: "table-zone", mode: "native-visual-atom-rebuild", family: "grid-or-matrix" }), "keep");
  assert.equal(residualPriority({ layerType: "diagram-zone", family: "hub-spoke" }), "high");
  assert.equal(residualPriority({ layerType: "chart-zone", family: "bar-chart" }), "medium");
  assert.equal(residualPriority({ layerType: "screenshot-zone" }), "keep");
});

test("component coverage matrix derives native opportunities from final IR image metadata", () => {
  const summary = summarizeFinalIrNativeOpportunities({
    pages: [{
      pageIndex: 0,
      images: [
        {
          layerType: "table-zone",
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
          box: { x: 10, y: 20, w: 400, h: 220 },
          source: { nativeRebuild: true, componentRenderStrategy: { mode: "plugin-component-template" } }
        },
        {
          layerType: "screenshot-zone",
          detector: "product-illustration-segment-crop",
          expressionForm: "screenshot-or-document",
          expressionSubtype: "ui-screenshot",
          box: { x: 1, y: 2, w: 120, h: 80 },
          source: { nativeRebuild: true }
        }
      ],
      shapes: [],
      textBoxes: []
    }]
  });

  assert.equal(summary.nativeOpportunityLayers, 1);
  assert.deepEqual(summary.nativeOpportunityPriorityCounts, { high: 1 });
  assert.equal(summary.nativeOpportunities[0].page, 1);
  assert.equal(summary.nativeOpportunities[0].layerType, "table-zone");
  assert.equal(summary.nativeOpportunities[0].disposition, "native-rebuild-candidate");
});

test("component coverage matrix highlights objectified table grids that still have large residual crops", () => {
  const summary = summarizeFinalIrNativeOpportunities({
    pages: [{
      pageIndex: 2,
      images: [{
        layerType: "table-zone",
        detector: "foreground-graphic-underlay-crop",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        box: { x: 30, y: 100, w: 860, h: 360 },
        source: {
          nativeRebuild: true,
          tableGridObjectified: true,
          primitiveErased: true,
          erasedPrimitiveCount: 22,
          objectifiedGrid: { rows: 3, columns: 7, lineCount: 11 },
          residualSplitRejected: {
            reason: "too-many-components",
            bandSplitRejected: "too-few-band-components"
          }
        }
      }]
    }]
  });

  assert.equal(summary.nativeOpportunityLayers, 1);
  assert.equal(summary.nativeOpportunities[0].residualState, "objectified-table-grid-large-residual");
  assert.equal(summary.nativeOpportunities[0].disposition, "residual-split-needed-after-native-grid");
  assert.equal(summary.nativeOpportunities[0].residualSplitRejectedReason, "too-many-components");
  assert.equal(summary.nativeOpportunities[0].objectifiedGrid.columns, 7);
});

test("component coverage matrix prioritizes large objectified table residuals before ordinary diagram candidates", () => {
  const summary = summarizeFinalIrNativeOpportunities({
    pages: [{
      images: [
        {
          layerType: "diagram-zone",
          detector: "line-diagram-graphic-underlay-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "dense-complex-diagram",
          box: { x: 20, y: 60, w: 900, h: 400 },
          source: { nativeRebuild: true }
        },
        {
          layerType: "table-zone",
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          box: { x: 30, y: 100, w: 700, h: 240 },
          source: {
            nativeRebuild: true,
            tableGridObjectified: true,
            primitiveErased: true,
            residualSplitRejected: { reason: "too-many-components" }
          }
        }
      ]
    }]
  });

  assert.equal(summary.nativeOpportunities[0].disposition, "residual-split-needed-after-native-grid");
  assert.equal(summary.nativeOpportunities[1].disposition, "native-rebuild-candidate");
});

test("component coverage matrix reads candidate reports directly", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-candidate-summary-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [
      { layerType: "diagram-zone", templateFamily: "hub-spoke", componentRenderStrategy: { mode: "plugin-component-template" } },
      { layerType: "diagram-zone", templateFamily: "generic", componentRenderStrategy: { mode: "native-visual-atom-rebuild" } }
    ]
  })}\n`, "utf8");

  const summary = summarizeCandidateReport(candidateFile);

  assert.equal(summary.residualLayers, 1);
  assert.equal(summary.actionableResidualLayers, 0);
  assert.deepEqual(summary.residualModeCounts, { "native-visual-atom-rebuild": 1 });
  assert.deepEqual(summary.residualDispositionCounts, { "native-rebuild-covered-with-fidelity-underlay": 1 });
});

test("component coverage matrix prefers final preserved illustration metadata over stale candidate diagram metadata", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-candidate-final-preserve-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const finalIrFile = path.join(tmp, "deck.native.ir.json");
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [{
      pageIndex: 0,
      imageIndex: 0,
      layerType: "diagram-zone",
      detector: "two-panel-diagram-crop",
      templateFamily: "hub-spoke",
      expressionForm: "complex-diagram",
      expressionSubtype: "two-panel-diagram",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      areaRatio: 0.3,
      box: { x: 18, y: 76, w: 452, h: 350 },
      componentRenderStrategy: { mode: "native-visual-atom-rebuild" },
      bestCandidates: [{ title: "扁平6项流程图", candidateScore: 58 }]
    }]
  })}\n`, "utf8");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [{
      images: [{
        box: { x: 18, y: 76, w: 452, h: 350 },
        source: {
          detector: "two-panel-diagram-crop",
          expressionForm: "illustration",
          expressionSubtype: "workflow-supply-chain-chaos-illustration",
          recommendedAction: "preserve-local-crop",
          componentRenderStrategy: { mode: "preserve-local-crop" }
        }
      }]
    }]
  })}\n`, "utf8");

  const summary = summarizeCandidateReport(candidateFile, { finalIrFile });

  assert.equal(summary.residualLayers, 1);
  assert.equal(summary.actionableResidualLayers, 0);
  assert.equal(summary.intentionalPreserveLayers, 1);
  assert.deepEqual(summary.residualModeCounts, { "preserve-local-crop": 1 });
  assert.deepEqual(summary.residualDispositionCounts, { "keep-icon-or-illustration-crop": 1 });
});

test("component coverage matrix summarizes component group rejection diagnostics", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-diagnostics-"));
  const componentAssetsFile = path.join(tmp, "deck.component-assets.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(componentAssetsFile, `${JSON.stringify({
    layers: [{
      layerKey: "0:0",
      componentAcquisitionTasks: [
        {
          provider: "officeplus",
          kind: "component",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke",
          reason: "download officeplus component matching radial-link"
        },
        {
          provider: "islide",
          kind: "smartdiagram",
          keywords: "中心辐射",
          targetMotifs: ["radial-link"],
          templateFamily: "hub-spoke",
          reason: "download islide smartdiagram matching radial-link"
        }
      ],
      localAssets: [{
        id: "islide-arc",
        name: "arc-arrow.pptx",
        componentGroupDiagnostics: {
          targetMotifs: ["radial-link"],
          rejectedGroups: 2,
          byReason: {
            "target-motif-conflict": 1,
            "strict-aspect-incompatible": 1
          },
          examples: [{
            id: "slide1-group1",
            name: "组合 1",
            matchScore: 49.5,
            rejectionReasons: ["target-motif-conflict"],
            structureKind: "cycle-loop",
            motifs: ["arc-arrow"]
          }]
        }
      }]
    }]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Demo.work"),
      componentAssetManifest: componentAssetsFile,
      componentAssetSummary: {
        layers: 1,
        layersWithLocalAssets: 1,
        localAssetMatches: 1,
        recommendedGroupMatches: 0
      },
      pages: 1,
      images: 0,
      shapes: 0,
      textBoxes: 0,
      status: "ir-built"
    }]
  })}\n`, "utf8");

  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });
  const [row] = matrix.rows;

  assert.equal(row.componentAssetRejectedGroups, 2);
  assert.equal(row.componentAssetAcquisitionTasks, 2);
  assert.deepEqual(row.componentAssetRejectionReasonCounts, {
    "target-motif-conflict": 1,
    "strict-aspect-incompatible": 1
  });
  assert.deepEqual(row.componentAssetRejectionTargetMotifCounts, { "radial-link": 1 });
  assert.deepEqual(row.componentAssetAcquisitionProviderCounts, { officeplus: 1, islide: 1 });
  assert.deepEqual(row.componentAssetAcquisitionMotifCounts, { "radial-link": 2 });
  assert.deepEqual(row.componentAssetAcquisitionKindCounts, {
    "officeplus:component": 1,
    "islide:smartdiagram": 1
  });
  assert.equal(row.componentAssetRejectionExamples[0].groupId, "slide1-group1");
  assert.equal(row.componentAssetAcquisitionExamples[0].keywords, "中心辐射");
  assert.equal(matrix.totals.componentAssetRejectedGroups, 2);
  assert.equal(matrix.totals.componentAssetAcquisitionTasks, 2);
  assert.deepEqual(matrix.totals.componentAssetRejectionReasonCounts, row.componentAssetRejectionReasonCounts);
  assert.deepEqual(matrix.totals.componentAssetAcquisitionProviderCounts, row.componentAssetAcquisitionProviderCounts);
  assert.equal(matrix.totals.componentAssetRejectionExamples[0].deck, "Demo");
  assert.equal(matrix.totals.componentAssetAcquisitionExamples[0].deck, "Demo");
});

test("component coverage matrix ignores candidate residuals removed from final IR", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-final-ir-"));
  const candidateFile = path.join(tmp, "deck.component-candidates.json");
  const finalIrFile = path.join(tmp, "Demo.native.ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(candidateFile, `${JSON.stringify({
    layers: [
      {
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "process-chain",
        detector: "sparse-diagram-graphic-underlay-crop",
        box: { x: 100, y: 100, w: 300, h: 180 },
        componentRenderStrategy: { mode: "preserve-local-crop" }
      },
      {
        pageIndex: 1,
        imageIndex: 0,
        layerType: "screenshot-zone",
        templateFamily: "screenshot",
        detector: "product-illustration-segment-crop",
        box: { x: 10, y: 20, w: 120, h: 90 },
        componentRenderStrategy: { mode: "preserve-local-crop" }
      }
    ]
  })}\n`, "utf8");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [
      { images: [], shapes: [{ source: { detector: "asset-os-flow-native-component" } }], textBoxes: [] },
      {
        images: [{
          box: { x: 10, y: 20, w: 120, h: 90 },
          source: {
            detector: "product-illustration-segment-crop",
            layer: { layerType: "screenshot-zone" }
          }
        }],
        shapes: [],
        textBoxes: []
      }
    ]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Demo.work"),
      outputIr: finalIrFile,
      componentCandidateReport: candidateFile,
      pages: 2,
      images: 1,
      shapes: 1,
      textBoxes: 0,
      status: "ir-built"
    }]
  })}\n`, "utf8");

  const rows = summarizeComponentRebuildReport(reportFile);

  assert.equal(rows[0].residualLayers, 1);
  assert.equal(rows[0].intentionalPreserveLayers, 1);
  assert.equal(rows[0].actionableResidualLayers, 0);
  assert.deepEqual(rows[0].residualLayerTypeCounts, { "screenshot-zone": 1 });
});

test("component coverage matrix prefers final IR metrics over stale rebuild report counts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-final-metrics-"));
  const finalIrFile = path.join(tmp, "Demo.native.ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [
      {
        images: [{
          box: { x: 40, y: 50, w: 320, h: 180 },
          layerType: "table-zone",
          detector: "foreground-graphic-underlay-crop",
          expressionForm: "table-or-matrix",
          expressionSubtype: "table-grid",
          source: {
            layer: {
              componentRenderStrategy: { mode: "preserve-local-crop" }
            }
          }
        }, {
          type: "plugin-component-picture",
          source: {
            detector: "plugin-component-template-native-picture",
            layerSourceId: "component-layer",
            matchedComponentAssetMotifReady: true,
            matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
            matchedComponentWholeProcessTemplate: true
          }
        }],
        shapes: [{
          type: "rect",
          source: {
            nativeRebuild: true,
            detector: "asset-os-flow-native-component",
            componentReplacementPlan: {
              layerKey: "0:0",
              sourceProvider: "officeplus",
              componentKind: "component",
              componentId: "MatlComponentContent-11189",
              suitabilityTier: "strong",
              suitabilityScore: 96
            }
          }
        }, {
          type: "roundRect",
          source: {
            componentTemplateGroupApplied: true,
            componentTemplatePart: "process-node",
            layerSourceId: "component-layer",
            matchedComponentAssetMotifReady: true,
            matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
            matchedComponentWholeProcessTemplate: true,
            matchedComponentStructureFitScore: 12,
            matchedComponentStructureFitReasons: ["native-group-node-count-close"]
          }
        }],
        textBoxes: [
          { text: "A" },
          { text: "B" },
          { text: "组件文字", source: {
            componentTemplateGroupApplied: true,
            layerSourceId: "component-layer",
            matchedComponentAssetMotifReady: true,
            matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
            matchedComponentWholeProcessTemplate: true,
            matchedComponentStructureFitScore: 12,
            matchedComponentStructureFitReasons: ["native-group-node-count-close", "native-group-connector-count-close"],
            componentReplacementPlan: {
              layerKey: "0:0",
              sourceProvider: "officeplus",
              componentKind: "component",
              componentId: "MatlComponentContent-11189",
              suitabilityTier: "strong",
              suitabilityScore: 96
            }
          } }
        ]
      },
      { images: [], shapes: [], textBoxes: [] }
    ]
  })}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Demo.work"),
      outputIr: finalIrFile,
      pages: 99,
      images: 88,
      shapes: 77,
      textBoxes: 66,
      componentStrategyLayers: 55,
      componentStrategyModeCounts: { stale: 55 },
      componentTemplateAppliedImages: 99,
      componentTemplateAppliedShapes: 88,
      componentTemplateAppliedTextBoxes: 77,
      componentTemplateAppliedPictures: 66,
      componentTemplateMotifReadyImages: 99,
      componentTemplateMotifReadyShapes: 88,
      componentTemplateMotifReadyTextBoxes: 77,
      componentTemplateMotifReadyPictures: 66,
      componentTemplateMotifReadyTargetCounts: { stale: 231 },
      componentTemplateStructureFitShapes: 88,
      componentTemplateStructureFitTextBoxes: 77,
      componentTemplateStructureFitPictures: 66,
      componentTemplateStructureFitReasonCounts: { stale: 231 },
      status: "ir-built"
    }]
  })}\n`, "utf8");

  const [row] = summarizeComponentRebuildReport(reportFile);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(row.pages, 2);
  assert.equal(row.images, 2);
  assert.equal(row.shapes, 2);
  assert.equal(row.textBoxes, 3);
  assert.equal(row.componentStrategyLayers, 2);
  assert.equal(row.componentTemplateAppliedImages, 0);
  assert.equal(row.componentTemplateAppliedShapes, 1);
  assert.equal(row.componentTemplateAppliedTextBoxes, 1);
  assert.equal(row.componentTemplateAppliedPictures, 1);
  assert.equal(row.componentTemplateMotifReadyImages, 0);
  assert.equal(row.componentTemplateMotifReadyShapes, 1);
  assert.equal(row.componentTemplateMotifReadyTextBoxes, 1);
  assert.equal(row.componentTemplateMotifReadyPictures, 1);
  assert.equal(row.componentTemplateWholeProcessImages, 1);
  assert.equal(row.componentTemplateWholeProcessShapes, 1);
  assert.equal(row.componentTemplateWholeProcessTextBoxes, 1);
  assert.equal(row.componentTemplateWholeProcessPictures, 1);
  assert.deepEqual(row.componentTemplateMotifReadyTargetCounts, {
    "arc-arrow": 3,
    "linear-arrow-chain": 1,
    "whole-process-template": 3
  });
  assert.equal(row.componentTemplateStructureFitShapes, 1);
  assert.equal(row.componentTemplateStructureFitTextBoxes, 1);
  assert.equal(row.componentTemplateStructureFitPictures, 0);
  assert.deepEqual(row.componentTemplateStructureFitReasonCounts, {
    "native-group-connector-count-close": 1,
    "native-group-node-count-close": 2
  });
  assert.equal(matrix.totals.componentTemplateStructureFitShapes, 1);
  assert.equal(matrix.totals.componentTemplateStructureFitTextBoxes, 1);
  assert.equal(matrix.totals.componentTemplateStructureFitPictures, 0);
  assert.equal(matrix.totals.componentTemplateStructureFitShapeRatio, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessImages, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessShapes, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessTextBoxes, 1);
  assert.equal(matrix.totals.componentTemplateWholeProcessPictures, 1);
  assert.deepEqual(matrix.totals.componentTemplateStructureFitReasonCounts, {
    "native-group-connector-count-close": 1,
    "native-group-node-count-close": 2
  });
  assert.equal(row.componentReplacementPlanComponents, 1);
  assert.equal(row.componentReplacementPlanLayers, 1);
  assert.equal(row.componentReplacementPlanShapes, 1);
  assert.equal(row.componentReplacementPlanTextBoxes, 1);
  assert.equal(row.componentReplacementPlanElements, 2);
  assert.deepEqual(row.componentReplacementPlanProviderCounts, { officeplus: 2 });
  assert.deepEqual(row.componentReplacementPlanSuitabilityTierCounts, { strong: 2 });
  assert.deepEqual(row.componentStrategyModeCounts, {
    "preserve-local-crop": 1,
    "native-specialized-rebuild": 1
  });
  assert.equal(row.nativeOpportunityLayers, 1);
  assert.equal(row.nativeOpportunities[0].layerType, "table-zone");
});

test("component coverage matrix infers motif readiness from legacy component template parts", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-legacy-motifs-"));
  const finalIrFile = path.join(tmp, "Legacy.native.ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [{
      images: [],
      shapes: [{
        type: "rect",
        source: {
          detector: "plugin-component-template-native-shape",
          componentTemplateGroupApplied: true,
          componentTemplatePart: "matrix-cell"
        }
      }, {
        type: "rect",
        source: {
          detector: "plugin-component-template-native-shape",
          componentTemplateGroupApplied: true,
          nativeComponentArchetype: "process-chain",
          nativeComponentRole: "process-node"
        }
      }],
      textBoxes: []
    }]
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Legacy.work"),
      outputIr: finalIrFile,
      status: "ir-built"
    }]
  }, null, 2)}\n`, "utf8");

  const [row] = summarizeComponentRebuildReport(reportFile);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.equal(row.componentTemplateMotifReadyShapes, 2);
  assert.deepEqual(row.componentTemplateMotifReadyTargetCounts, {
    "card-grid": 1,
    "linear-arrow-chain": 1
  });
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypes, 2);
});

test("component coverage matrix counts specialty component motifs from final IR sources", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-specialty-motifs-"));
  const finalIrFile = path.join(tmp, "final-ir.json");
  const reportFile = path.join(tmp, "component-strategy-rebuild-report.json");
  fs.writeFileSync(finalIrFile, `${JSON.stringify({
    pages: [{
      images: [],
      shapes: [{
        type: "freeform",
        source: {
          detector: "plugin-component-template-native-shape",
          componentTemplateGroupApplied: true,
          componentTemplateTargetMotifs: ["map-chart"],
          componentTemplateFamilyApplied: "map-chart"
        }
      }, {
        type: "rect",
        source: {
          detector: "plugin-component-template-native-shape",
          componentTemplateGroupApplied: true,
          matchedComponentTargetMotifs: ["treemap-chart", "bubble-scatter-chart"],
          componentTemplateFamilyApplied: "treemap-chart"
        }
      }, {
        type: "arc",
        source: {
          detector: "plugin-component-template-native-shape",
          componentTemplateGroupApplied: true,
          nativeComponentArchetype: "gauge-chart",
          nativeComponentPart: "gauge-arc"
        }
      }],
      textBoxes: [{
        text: "关键词",
        source: {
          detector: "plugin-component-template-native-text",
          componentTemplateGroupApplied: true,
          componentTemplateTargetMotifs: ["word-cloud-chart"],
          componentTemplateFamilyApplied: "word-cloud-chart"
        }
      }]
    }]
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(reportFile, `${JSON.stringify({
    results: [{
      inputWorkDir: path.join(tmp, "Specialty.work"),
      outputIr: finalIrFile,
      status: "ir-built"
    }]
  }, null, 2)}\n`, "utf8");

  const [row] = summarizeComponentRebuildReport(reportFile);
  const matrix = buildComponentCoverageMatrix({ reports: [reportFile] });

  assert.deepEqual(row.componentTemplateMotifReadyTargetCounts, {
    "map-chart": 1,
    "treemap-chart": 1,
    "bubble-scatter-chart": 1,
    "gauge-chart": 1,
    "word-cloud-chart": 1
  });
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypes, 5);
});

test("component coverage matrix resolves latest reports per deck", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-latest-reports-"));
  const first = path.join(tmp, "older", "component-strategy-rebuild-report.json");
  const second = path.join(tmp, "newer", "component-strategy-rebuild-report.json");
  fs.mkdirSync(path.dirname(first), { recursive: true });
  fs.mkdirSync(path.dirname(second), { recursive: true });
  fs.writeFileSync(first, `${JSON.stringify({ results: [{ inputWorkDir: path.join(tmp, "Demo.work") }] })}\n`, "utf8");
  fs.writeFileSync(second, `${JSON.stringify({ results: [{ inputWorkDir: path.join(tmp, "Demo.work") }] })}\n`, "utf8");
  const now = new Date();
  fs.utimesSync(first, new Date(now.getTime() - 10000), new Date(now.getTime() - 10000));
  fs.utimesSync(second, now, now);

  assert.deepEqual(resolveLatestReports(tmp), [second]);
});

test("component coverage matrix CLI parses coverage gate flags", () => {
  const args = parseArgs([
    "node",
    "component-coverage-matrix.js",
    "--report",
    "a.json",
    "--coverage-manifest",
    "manifest.json",
    "--expected-decks",
    "2",
    "--expected-deck-names",
    "Deck_A;Deck_B",
    "--min-component-asset-local-coverage-ratio",
    "0.8",
    "--min-component-asset-local-matches",
    "4",
    "--min-component-asset-high-reusable-groups",
    "2",
    "--min-component-replacement-plan-shapes",
    "12",
    "--min-component-replacement-plan-text-boxes",
    "4",
    "--min-component-template-applied-shapes",
    "8",
    "--min-component-template-applied-text-boxes",
    "5",
    "--min-component-template-applied-pictures",
    "3",
    "--min-component-template-motif-ready-shapes",
    "6",
    "--min-component-template-structure-fit-shapes",
    "5",
    "--min-component-template-structure-fit-shape-ratio",
    "0.75",
    "--min-component-template-structure-fit-text-boxes",
    "2",
    "--min-component-template-structure-fit-pictures",
    "1",
    "--min-component-template-motif-ready-target-counts",
    "arc-arrow=2,tree-link=1,whole-process-template=1",
    "--min-component-template-motif-ready-target-types",
    "3",
    "--min-visual-atom-topology-connectors",
    "3",
    "--min-visual-atom-container-nodes",
    "1",
    "--min-visual-atom-contained-nodes",
    "2",
    "--require-no-actionable-residuals",
    "--require-no-expression-policy-violations",
    "--require-no-expression-policy-classification-needed",
    "--fail-on-coverage-gap"
  ]);

  assert.deepEqual(args.reports, ["a.json"]);
  assert.equal(args.coverageManifest, "manifest.json");
  assert.equal(args.expectedDecks, "2");
  assert.equal(args.expectedDeckNames, "Deck_A;Deck_B");
  assert.equal(args.minComponentAssetLocalCoverageRatio, "0.8");
  assert.equal(args.minComponentAssetLocalMatches, "4");
  assert.equal(args.minComponentAssetHighReusableGroups, "2");
  assert.equal(args.minComponentReplacementPlanShapes, "12");
  assert.equal(args.minComponentReplacementPlanTextBoxes, "4");
  assert.equal(args.minComponentTemplateAppliedShapes, "8");
  assert.equal(args.minComponentTemplateAppliedTextBoxes, "5");
  assert.equal(args.minComponentTemplateAppliedPictures, "3");
  assert.equal(args.minComponentTemplateMotifReadyShapes, "6");
  assert.equal(args.minComponentTemplateStructureFitShapes, "5");
  assert.equal(args.minComponentTemplateStructureFitShapeRatio, "0.75");
  assert.equal(args.minComponentTemplateStructureFitTextBoxes, "2");
  assert.equal(args.minComponentTemplateStructureFitPictures, "1");
  assert.equal(args.minComponentTemplateMotifReadyTargetCounts, "arc-arrow=2,tree-link=1,whole-process-template=1");
  assert.equal(args.minComponentTemplateMotifReadyTargetTypes, "3");
  assert.equal(args.minVisualAtomTopologyConnectors, "3");
  assert.equal(args.minVisualAtomContainerNodes, "1");
  assert.equal(args.minVisualAtomContainedNodes, "2");
  assert.equal(args.requireNoActionableResiduals, true);
  assert.equal(args.requireNoExpressionPolicyViolations, true);
  assert.equal(args.requireNoExpressionPolicyClassificationNeeded, true);
  assert.equal(args.failOnCoverageGap, true);
});

test("component coverage matrix reads coverage manifests", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-coverage-manifest-"));
  const manifestFile = path.join(tmp, "coverage.manifest.json");
  fs.writeFileSync(manifestFile, `${JSON.stringify({
    id: "coverage-smoke",
    reports: ["a.json", "", " b.json "],
    gates: {
      requireNoActionableResiduals: true,
      requireNoExpressionPolicyViolations: true,
      requireNoExpressionPolicyClassificationNeeded: true,
      expectedDecks: 2,
      expectedDeckNames: ["Deck_A", "Deck_B"],
      minComponentAssetLocalCoverageRatio: 0.95,
      minComponentAssetLocalMatches: 10,
      minComponentAssetHighReusableGroups: 4,
      minComponentReplacementPlanShapes: 12,
      minComponentReplacementPlanTextBoxes: 4,
      minComponentTemplateAppliedShapes: 20,
      minComponentTemplateAppliedTextBoxes: 6,
      minComponentTemplateAppliedPictures: 3,
      minComponentTemplateStructureFitShapes: 12,
      minComponentTemplateStructureFitShapeRatio: 0.7,
      minComponentTemplateStructureFitTextBoxes: 4,
      minComponentTemplateStructureFitPictures: 2,
      minComponentTemplateMotifReadyTargetCounts: {
        "whole-process-template": 1
      },
      minComponentTemplateMotifReadyTargetTypes: 4
    }
  })}\n`, "utf8");

  const manifest = readCoverageManifest(manifestFile);

  assert.equal(manifest.id, "coverage-smoke");
  assert.equal(manifest.manifestFile, path.resolve(manifestFile));
  assert.deepEqual(manifest.reports, ["a.json", "b.json"]);
  assert.equal(manifest.gates.requireNoActionableResiduals, true);
  assert.equal(manifest.gates.requireNoExpressionPolicyViolations, true);
  assert.equal(manifest.gates.requireNoExpressionPolicyClassificationNeeded, true);
  assert.equal(manifest.gates.expectedDecks, 2);
  assert.deepEqual(manifest.gates.expectedDeckNames, ["Deck_A", "Deck_B"]);
  assert.equal(manifest.gates.minComponentAssetLocalCoverageRatio, 0.95);
  assert.equal(manifest.gates.minComponentAssetLocalMatches, 10);
  assert.equal(manifest.gates.minComponentAssetHighReusableGroups, 4);
  assert.equal(manifest.gates.minComponentReplacementPlanShapes, 12);
  assert.equal(manifest.gates.minComponentReplacementPlanTextBoxes, 4);
  assert.equal(manifest.gates.minComponentTemplateAppliedShapes, 20);
  assert.equal(manifest.gates.minComponentTemplateAppliedTextBoxes, 6);
  assert.equal(manifest.gates.minComponentTemplateAppliedPictures, 3);
  assert.equal(manifest.gates.minComponentTemplateStructureFitShapes, 12);
  assert.equal(manifest.gates.minComponentTemplateStructureFitShapeRatio, 0.7);
  assert.equal(manifest.gates.minComponentTemplateStructureFitTextBoxes, 4);
  assert.equal(manifest.gates.minComponentTemplateStructureFitPictures, 2);
  assert.deepEqual(manifest.gates.minComponentTemplateMotifReadyTargetCounts, {
    "whole-process-template": 1
  });
  assert.equal(manifest.gates.minComponentTemplateMotifReadyTargetTypes, 4);
});

test("component coverage matrix fails gate when expected deck count is not met", () => {
  const matrix = {
    totals: {
      decks: 1,
      actionableResidualLayers: 0
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 2
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.gates.expectedDecks, 2);
  assert.equal(matrix.totals.expectedDeckCountMet, false);
});

test("component coverage matrix fails gate when expected deck names do not match", () => {
  const matrix = {
    totals: aggregateRows([
      { deck: "Wrong_Deck", pages: 1, actionableResidualLayers: 0 }
    ])
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"]
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.expectedDeckCountMet, true);
  assert.equal(matrix.totals.expectedDeckNamesMet, false);
  assert.deepEqual(matrix.totals.missingExpectedDecks, ["Deck_A"]);
  assert.deepEqual(matrix.totals.unexpectedDecks, ["Wrong_Deck"]);
});

test("component coverage matrix fails gate when expected page counts do not match", () => {
  const matrix = {
    rows: [
      { deck: "Deck_A", pages: 4 }
    ],
    totals: aggregateRows([
      { deck: "Deck_A", pages: 4, actionableResidualLayers: 0 }
    ])
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"],
    expectedPageCounts: { Deck_A: 5 }
  });

  assert.equal(matrix.passed, false);
  assert.deepEqual(matrix.totals.pageCountMismatches, [
    { deck: "Deck_A", expectedPages: 5, actualPages: 4 }
  ]);
});

test("component coverage matrix fails gate when component asset participation is below minimums", () => {
  const matrix = {
    rows: [
      { deck: "Deck_A", pages: 1 }
    ],
    totals: {
      ...aggregateRows([
        { deck: "Deck_A", pages: 1, actionableResidualLayers: 0 }
      ]),
      componentAssetLocalCoverageRatio: 0.5,
      componentAssetLocalMatches: 4,
      componentAssetHighReusableGroups: 1,
      componentReplacementPlanShapes: 7,
      componentReplacementPlanTextBoxes: 2,
      componentTemplateAppliedShapes: 8,
      componentTemplateAppliedTextBoxes: 2,
      componentTemplateAppliedPictures: 1,
      componentTemplateMotifReadyShapes: 3,
      componentTemplateStructureFitShapes: 2,
      componentTemplateStructureFitShapeRatio: 0.25,
      componentTemplateStructureFitTextBoxes: 1,
      componentTemplateStructureFitPictures: 0,
      componentTemplateMotifReadyTargetCounts: { "arc-arrow": 3 },
      visualAtomTopologyConnectors: 2,
      visualAtomContainerNodes: 0,
      visualAtomContainedNodes: 1
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"],
    expectedPageCounts: { Deck_A: 1 },
    minComponentAssetLocalCoverageRatio: 0.95,
    minComponentAssetLocalMatches: 10,
    minComponentAssetHighReusableGroups: 4,
    minComponentReplacementPlanShapes: 12,
    minComponentReplacementPlanTextBoxes: 4,
    minComponentTemplateAppliedShapes: 20,
    minComponentTemplateAppliedTextBoxes: 6,
    minComponentTemplateAppliedPictures: 3,
    minComponentTemplateMotifReadyShapes: 8,
    minComponentTemplateStructureFitShapes: 6,
    minComponentTemplateStructureFitShapeRatio: 0.8,
    minComponentTemplateStructureFitTextBoxes: 2,
    minComponentTemplateStructureFitPictures: 1,
    minComponentTemplateMotifReadyTargetCounts: "arc-arrow=4,tree-link=1,whole-process-template=1",
    minComponentTemplateMotifReadyTargetTypes: 4,
    minVisualAtomTopologyConnectors: 4,
    minVisualAtomContainerNodes: 1,
    minVisualAtomContainedNodes: 3
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.componentAssetLocalCoverageRatioMet, false);
  assert.equal(matrix.totals.componentAssetLocalMatchesMet, false);
  assert.equal(matrix.totals.componentAssetHighReusableGroupsMet, false);
  assert.equal(matrix.totals.componentReplacementPlanShapesMet, false);
  assert.equal(matrix.totals.componentReplacementPlanTextBoxesMet, false);
  assert.equal(matrix.totals.componentTemplateAppliedShapesMet, false);
  assert.equal(matrix.totals.componentTemplateAppliedTextBoxesMet, false);
  assert.equal(matrix.totals.componentTemplateAppliedPicturesMet, false);
  assert.equal(matrix.totals.componentTemplateMotifReadyShapesMet, false);
  assert.equal(matrix.totals.componentTemplateStructureFitShapesMet, false);
  assert.equal(matrix.totals.componentTemplateStructureFitShapeRatioMet, false);
  assert.equal(matrix.totals.componentTemplateStructureFitTextBoxesMet, false);
  assert.equal(matrix.totals.componentTemplateStructureFitPicturesMet, false);
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetCountsMet, false);
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypes, 1);
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypesMet, false);
  assert.equal(matrix.totals.visualAtomTopologyConnectorsMet, false);
  assert.equal(matrix.totals.visualAtomContainerNodesMet, false);
  assert.equal(matrix.totals.visualAtomContainedNodesMet, false);
  assert.deepEqual(matrix.totals.missingComponentTemplateMotifReadyTargetCounts, {
    "arc-arrow": { expected: 4, actual: 3 },
    "tree-link": { expected: 1, actual: 0 },
    "whole-process-template": { expected: 1, actual: 0 }
  });
  assert.deepEqual(
    normalizeMotifTargetMinimums({ "arc-arrow": 2, "whole-process-template": 1, invalid: 9 }),
    { "arc-arrow": 2, "whole-process-template": 1 }
  );
});

test("component coverage matrix passes motif diversity gate when enough target motif types are present", () => {
  const matrix = {
    totals: {
      ...aggregateRows([
        { deck: "Deck_A", pages: 1, actionableResidualLayers: 0 }
      ]),
      componentTemplateMotifReadyTargetCounts: {
        "arc-arrow": 4,
        "map-chart": 2,
        "word-cloud-chart": 1,
        unknown: 99
      }
    }
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 1,
    expectedDeckNames: ["Deck_A"],
    minComponentTemplateMotifReadyTargetTypes: 3
  });

  assert.equal(matrix.passed, true);
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypes, 3);
  assert.equal(matrix.totals.componentTemplateMotifReadyTargetTypesMet, true);
});

test("component coverage matrix fails gate when deck rows are duplicated", () => {
  const matrix = {
    totals: aggregateRows([
      { deck: "Deck_A", pages: 1, actionableResidualLayers: 0 },
      { deck: "Deck_A", pages: 1, actionableResidualLayers: 0 }
    ])
  };

  applyCoverageGates(matrix, {
    requireNoActionableResiduals: true,
    expectedDecks: 2
  });

  assert.equal(matrix.passed, false);
  assert.equal(matrix.totals.decks, 2);
  assert.equal(matrix.totals.uniqueDecks, 1);
  assert.deepEqual(matrix.totals.duplicateDecks, ["Deck_A"]);
  assert.equal(matrix.totals.expectedDeckCountMet, false);
});
