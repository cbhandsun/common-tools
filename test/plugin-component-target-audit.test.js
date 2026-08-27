"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  auditPluginComponentTargets,
  classifyPluginTargetImage,
  classifyStructuralExpression,
  parseArgs,
  renderMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/plugin-component-target-audit");

function pluginStrategy(overrides = {}) {
  return {
    mode: "plugin-component-template",
    implementationMode: "auth-or-download-required",
    bestCandidate: {
      sourceProvider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-20568",
      title: "扁平3项箭头矩阵",
      candidateScore: 58
    },
    applicationPlan: {
      sourceProvider: "officeplus",
      componentKind: "component",
      componentId: "MatlComponentContent-20568",
      targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available"
    },
    ...overrides
  };
}

test("parseArgs accepts plugin component target audit flags", () => {
  const args = parseArgs([
    "node",
    "plugin-component-target-audit.js",
    "--ir-dir",
    "irs",
    "--out",
    "target.json",
    "--markdown-out",
    "target.md",
    "--max-examples",
    "7"
  ]);

  assert.equal(args.irDir, "irs");
  assert.equal(args.out, "target.json");
  assert.equal(args.markdownOut, "target.md");
  assert.equal(args.maxExamples, 7);
});

test("classifyPluginTargetImage accepts structured matrix plugin targets", () => {
  const row = classifyPluginTargetImage({
    deck: "Deck_A",
    pageIndex: 2,
    imageIndex: 0,
    image: {
      id: "matrix-underlay",
      box: { x: 80, y: 120, w: 760, h: 240 },
      source: {
        detector: "foreground-graphic-underlay-crop",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "table-zone",
          diagramUnderstanding: {
            confidence: 0.92,
            archetype: "matrix-or-grid",
            nodeCount: 8,
            visualAtomKindCounts: { "grid-line-candidate": 3 }
          }
        }
      }
    }
  });

  assert.equal(row.decision, "executable-plugin-target");
  assert.equal(row.slide, 3);
  assert.equal(row.pluginAction.id, "MatlComponentContent-20568");
  assert.equal(row.pluginAction.implementationStatus, "download-gated");
  assert.ok(row.reasons.includes("structured-expression-safe-for-plugin-component"));
});

test("classifyPluginTargetImage marks local plugin components as import ready", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "matrix-underlay",
      source: {
        detector: "foreground-graphic-underlay-crop",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
        componentRenderStrategy: pluginStrategy({
          implementationMode: "import-ready",
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-20568",
            title: "扁平3项箭头矩阵",
            localPath: "components/matrix.pptx"
          }
        }),
        layer: {
          layerType: "table-zone",
          diagramUnderstanding: {
            archetype: "matrix-or-grid",
            nodeCount: 8,
            visualAtomKindCounts: { "grid-line-candidate": 3 }
          }
        }
      }
    }
  });

  assert.equal(row.decision, "executable-plugin-target");
  assert.equal(row.pluginAction.implementationStatus, "import-ready");
});

test("classifyPluginTargetImage treats motif-ready local applied assets as import ready", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "radial-underlay",
      source: {
        detector: "foreground-graphic-underlay-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "native-topology-candidate",
        recommendedAction: "attempt-native-topology-rebuild-with-fidelity-gate",
        componentRenderStrategy: pluginStrategy({
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-17427",
            title: "渐变4项中心"
          }
        }),
        componentAssetReadiness: {
          status: "applied-plugin-motif-ready",
          targetMotifs: ["radial-link"]
        },
        componentLocalAssets: [{
          id: "islide-local-radial",
          provider: "islide",
          path: "E:\\DEV\\WorkSpace\\Efficiency\\common-tools\\runs\\plugin-component-inventory\\islide-applied-components\\radial.pptx",
          assetKind: "presentation-template",
          roleTags: ["applied-component", "template-layout"],
          matchScore: 88
        }],
        layer: {
          layerType: "diagram-zone",
          diagramUnderstanding: {
            archetype: "relationship-flow",
            nodeCount: 4,
            connectorCount: 3,
            visualAtomCount: 10
          }
        }
      }
    }
  });

  assert.equal(row.decision, "executable-plugin-target");
  assert.equal(row.pluginAction.implementationStatus, "import-ready");
  assert.equal(row.pluginAction.localEvidence.provider, "islide");
  assert.equal(row.pluginAction.localEvidence.assetId, "islide-local-radial");
  assert.deepEqual(row.pluginAction.localEvidence.targetMotifs, ["radial-link"]);
});

test("classifyPluginTargetImage keeps motif-mismatched local assets download gated", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "matrix-underlay",
      source: {
        detector: "foreground-graphic-underlay-crop",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
        componentRenderStrategy: pluginStrategy(),
        componentAssetReadiness: {
          status: "applied-plugin-template-motif-mismatch",
          targetMotifs: ["card-grid"]
        },
        componentLocalAssets: [{
          id: "islide-local-wrong",
          provider: "islide",
          path: "E:\\DEV\\WorkSpace\\Efficiency\\common-tools\\runs\\plugin-component-inventory\\islide-applied-components\\wrong.pptx",
          assetKind: "presentation-template",
          roleTags: ["applied-component"],
          matchScore: 66
        }],
        layer: {
          layerType: "table-zone",
          diagramUnderstanding: {
            archetype: "matrix-or-grid",
            nodeCount: 8,
            visualAtomKindCounts: { "grid-line-candidate": 3 }
          }
        }
      }
    }
  });

  assert.equal(row.pluginAction.implementationStatus, "download-gated");
  assert.equal(row.pluginAction.localEvidence, undefined);
});

test("classifyPluginTargetImage preserves perspective illustration crops despite card-grid candidates", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "island-frame",
      box: { name: "island-frame", x: 350, y: 96, w: 580, h: 356 },
      source: {
        detector: "entropy-challenge-island-crop",
        reason: "perspective island frame preserved as a local fidelity crop with editable helper shapes layered above",
        strategy: "local-fidelity-crop",
        nonEditableReason: "perspective island frame preserved as a local fidelity crop with editable helper shapes layered above",
        expressionForm: "table-or-matrix",
        expressionSubtype: "table-grid",
        recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
        componentRenderStrategy: pluginStrategy({
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-14861",
            title: "扁平4项矩阵",
            candidateScore: 46
          }
        }),
        componentAssetReadiness: {
          status: "applied-plugin-template-motif-mismatch",
          targetMotifs: ["card-grid"]
        },
        layer: {
          layerType: "table-zone",
          diagramUnderstanding: {
            archetype: "matrix-or-grid",
            confidence: 0.76,
            nativeReadiness: "preserve-crop-with-structured-metadata",
            nodeCount: 0,
            connectorCount: 0,
            visualAtomCount: 19,
            visualAtomKindCounts: {
              "grid-line-candidate": 11,
              "connector-line-candidate": 6,
              "screenshot-crop-candidate": 1,
              "complex-shape-crop-candidate": 1
            },
            residuals: [
              { kind: "icon-or-illustration-crop" },
              { kind: "screenshot-crop-candidate" },
              { kind: "complex-shape-crop-candidate" }
            ]
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.ok(row.reasons.includes("perspective-illustration-minimum-unit"));
  assert.equal(row.pluginAction.implementationStatus, "download-gated");
});

test("classifyPluginTargetImage preserves screenshot targets even with embedded plugin strategy", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "product-screenshot",
      source: {
        detector: "ui-screenshot-crop",
        expressionForm: "screenshot-or-document",
        expressionSubtype: "product-screenshot",
        recommendedAction: "keep-local-crop",
        componentRenderStrategy: pluginStrategy({
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            id: "bad-screenshot-template",
            title: "看起来像截图的组件"
          }
        }),
        layer: {
          layerType: "screenshot-zone",
          diagramUnderstanding: { nativeReadiness: "preserve-crop" }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.pluginAction.id, "bad-screenshot-template");
  assert.ok(row.reasons.includes("expression-policy-protects-crop"));
});

test("classifyPluginTargetImage preserves obvious icon or visual example targets", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "cycle-arrow-icon",
      source: {
        detector: "plugin-cycle-arrow-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "cycle-flow-icon visual-example 示意图",
        recommendedAction: "keep-local-crop-unless-exact-component-match",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "illustration-zone",
          diagramUnderstanding: {
            confidence: 0.72,
            visualAtomCount: 1
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.expressionPolicy.kind, "standalone-visual-asset");
});

test("classifyPluginTargetImage preserves single pictorial arrows even when they have many visual atoms", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "segmented-cycle-arrow",
      source: {
        detector: "plugin-cycle-arrow-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "cycle-flow-icon vector-arrow 示意图",
        recommendedAction: "replace-with-native-components",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "illustration-zone",
          diagramUnderstanding: {
            confidence: 0.81,
            visualAtomCount: 12,
            nodeCount: 0,
            connectorCount: 0,
            visualAtomKindCounts: { "curved-segment": 12 }
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.expressionPolicy.minimumUnitPolicy, "preserve-as-single-crop");
  assert.ok(row.reasons.includes("pictorial-single-asset-preserved"));
});

test("classifyPluginTargetImage preserves pictorial arrows even with connector-like atom evidence", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "connector-like-cycle-arrow",
      source: {
        detector: "plugin-cycle-arrow-illustration-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "cycle-flow-icon vector-arrow",
        recommendedAction: "replace-with-native-components",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "illustration-zone",
          diagramUnderstanding: {
            confidence: 0.88,
            nativeReadiness: "native-rebuild",
            visualAtomCount: 14,
            nodeCount: 0,
            connectorCount: 2,
            residualCount: 1,
            visualAtomKindCounts: {
              "native-arc-arrow-segment-candidate": 10,
              "connector-line-candidate": 2
            }
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(row.expressionPolicy.allowNativeRebuild, false);
  assert.ok(row.reasons.includes("pictorial-single-asset-preserved"));
});

test("classifyPluginTargetImage preserves pictorial expression family despite flow wording", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "process-arrow-sample",
      source: {
        detector: "plugin-process-arrow-preview-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "process flow 图示样例",
        recommendedAction: "replace-with-native-components",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "illustration-zone",
          diagramUnderstanding: {
            confidence: 0.84,
            nativeReadiness: "native-rebuild",
            expressionFamily: "pictorial-asset",
            visualAtomCount: 16,
            nodeCount: 0,
            connectorCount: 0,
            visualAtomKindCounts: { "native-arc-arrow-segment-candidate": 16 }
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.expressionPolicy.kind, "standalone-visual-asset");
  assert.equal(row.expressionPolicy.allowNativeRebuild, false);
  assert.ok(row.reasons.includes("pictorial-expression-family-without-semantic-units"));
});

test("classifyPluginTargetImage still executes semantic diagrams with pictorial labels when structure is clear", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "relationship-diagram-with-icons",
      box: { x: 40, y: 80, w: 720, h: 260 },
      source: {
        detector: "foreground-diagram-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "relationship-flow 示意图",
        recommendedAction: "replace-with-native-components",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "diagram-zone",
          diagramUnderstanding: {
            confidence: 0.9,
            archetype: "relationship-flow",
            nodeCount: 4,
            connectorCount: 3,
            visualAtomCount: 10
          }
        }
      }
    }
  });

  assert.equal(row.decision, "executable-plugin-target");
  assert.equal(row.expressionPolicy.kind, "structured-native");
  assert.ok(row.reasons.includes("structured-expression-safe-for-plugin-component"));
});

test("classifyPluginTargetImage preserves decorative backgrounds despite stale plugin candidates", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "decorative-background",
      source: {
        detector: "decorative-cover-background-underlay",
        expressionForm: "general-visual-layer",
        expressionSubtype: "general-visual-layer",
        recommendedAction: "replace-with-native-components",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "background-zone",
          diagramUnderstanding: {
            confidence: 0.3,
            nodeCount: 0,
            connectorCount: 0,
            visualAtomCount: 0
          }
        }
      }
    }
  });

  assert.equal(row.decision, "preserve-local-crop");
  assert.equal(row.expressionPolicy.kind, "decorative-texture");
  assert.ok(row.reasons.includes("expression-policy-protects-crop"));
});

test("classifyPluginTargetImage defers structural-looking graphics without enough evidence", () => {
  const row = classifyPluginTargetImage({
    image: {
      id: "weak-process",
      source: {
        detector: "foreground-graphic-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "process-flow",
        recommendedAction: "try-plugin-component-template",
        componentRenderStrategy: pluginStrategy(),
        layer: {
          layerType: "diagram-zone",
          diagramUnderstanding: {
            confidence: 0.52,
            archetype: "process-flow",
            nodeCount: 0,
            connectorCount: 0,
            visualAtomCount: 1
          }
        }
      }
    }
  });

  assert.equal(row.decision, "defer-until-structure-evidence");
  assert.ok(row.reasons.includes("structural-expression-with-insufficient-evidence"));
});

test("classifyStructuralExpression treats chart table diagram families as semantic minimum units", () => {
  const result = classifyStructuralExpression({
    layerType: "diagram-zone",
    expressionForm: "complex-diagram",
    expressionSubtype: "relationship-flow",
    diagramUnderstanding: {
      componentStrategy: { templateFamily: "hub-spoke" },
      nodeCount: 4,
      connectorCount: 2
    }
  });

  assert.equal(result.executable, true);
  assert.ok(result.reasons.includes("diagram-flow-relationship-minimum-unit"));
});

test("auditPluginComponentTargets summarizes executable and protected plugin targets", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plugin-component-target-audit-"));
  const irFile = path.join(dir, "Deck_A.native.ir.json");
  fs.writeFileSync(irFile, `${JSON.stringify({
    pages: [
      {
        images: [
          {
            id: "matrix",
            source: {
              detector: "foreground-graphic-underlay-crop",
              expressionForm: "table-or-matrix",
              expressionSubtype: "table-grid",
              recommendedAction: "rebuild-native-table-grid-when-cells-are-axis-aligned",
              componentRenderStrategy: pluginStrategy(),
              layer: {
                layerType: "table-zone",
                diagramUnderstanding: {
                  archetype: "matrix-or-grid",
                  nodeCount: 6,
                  visualAtomKindCounts: { "grid-line-candidate": 2 }
                }
              }
            }
          },
          {
            id: "icon",
            source: {
              detector: "decorative-icon-crop",
              expressionForm: "icon-or-illustration",
              expressionSubtype: "图标",
              recommendedAction: "preserve-local-crop",
              componentRenderStrategy: pluginStrategy(),
              layer: { layerType: "illustration-zone" }
            }
          }
        ]
      }
    ]
  })}\n`, "utf8");
  fs.copyFileSync(irFile, path.join(dir, ".openxml-safe-Deck_A.native.ir.json"));

  const report = auditPluginComponentTargets({ irDir: dir });

  assert.equal(report.totals.decks, 1);
  assert.equal(report.totals.embeddedPluginTargets, 2);
  assert.equal(report.totals.executableTargets, 1);
  assert.equal(report.totals.importReadyTargets, 0);
  assert.equal(report.totals.downloadGatedTargets, 1);
  assert.equal(report.totals.protectedCropTargets, 1);
  assert.equal(report.totals.protectedNonSemanticTargets, 1);
  assert.equal(report.totals.unsafeRejectedTargets, 0);
  assert.equal(report.decks[0].summary.protectedNonSemanticTargets, 1);
  assert.equal(report.decks[0].executableTargets[0].imageId, "matrix");
});

test("renderMarkdown documents the minimum-unit policy", () => {
  const markdown = renderMarkdown({
    ok: true,
    totals: {
      decks: 1,
      embeddedPluginTargets: 2,
      executableTargets: 1,
      importReadyTargets: 0,
      downloadGatedTargets: 1,
      protectedCropTargets: 1,
      protectedNonSemanticTargets: 1,
      unsafeRejectedTargets: 0,
      deferTargets: 0
    },
    decks: [{
      deck: "Deck_A",
      summary: {
        embeddedPluginTargets: 2,
        executableTargets: 1,
        importReadyTargets: 0,
        downloadGatedTargets: 1,
        protectedCropTargets: 1,
        protectedNonSemanticTargets: 1,
        unsafeRejectedTargets: 0,
        deferTargets: 0
      },
      executableTargets: [{
        slide: 3,
        pluginAction: { provider: "officeplus", id: "MatlComponentContent-20568" },
        expressionSubtype: "table-grid"
      }],
      protectedCropTargets: [{
        slide: 4,
        expressionSubtype: "图标"
      }]
    }]
  });

  assert.match(markdown, /Plugin Component Target Audit/);
  assert.match(markdown, /charts, tables, matrices, flows/);
  assert.match(markdown, /Protected non-semantic targets: 1/);
  assert.match(markdown, /MatlComponentContent-20568/);
});
