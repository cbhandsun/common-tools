"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  assetLearningCacheKey,
  buildComponentAssetManifest,
  _private,
  matchLocalComponentAssets,
  scoreLocalAsset
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-asset-matcher");

test("component asset matcher maps plugin candidates to local installed assets", () => {
  const assetPath = path.join(process.cwd(), "OfficePLUS", "assets", "流程组件模板.pptx");
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      ir: "sample.ir.json",
      layers: [{
        pageIndex: 0,
        imageIndex: 2,
        layerType: "diagram-zone",
        detector: "foreground-graphic-crop",
        templateFamily: "process-chain",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: {
            currentStep: "preserve-source-crop-and-record-component-replacement",
            targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available",
            sourceProvider: "officeplus",
            componentKind: "component"
          },
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            id: "MatlComponentContent-1",
            title: "流程关系图",
            confidence: 0.72
          }
        }
      }]
    },
    inventory: {
      provider: "plugin-component-registry-v1",
      candidates: [{
        id: "officeplus-local",
        provider: "officeplus",
        path: assetPath,
        name: "流程组件模板.pptx",
        assetKind: "presentation-template",
        roleTags: ["diagram", "template-layout", "openxml-inspectable"],
        reusePolicy: "inspect-openxml-and-learn-style",
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          componentCatalog: [{
            id: "slide1-group1",
            boundsPt: { x: 0, y: 0, w: 600, h: 100 },
            childCount: 10,
            shapeCount: 8,
            connectorCount: 2,
            pictureCount: 0,
            structure: { kind: "process-chain" },
            reuseReadiness: { level: "high", score: 82, reasons: ["has-child-layout"] },
            componentScore: 80
          }]
        }
      }]
    }
  });

  assert.equal(manifest.summary.layers, 1);
  assert.equal(manifest.summary.layersWithLocalAssets, 1);
  assert.equal(manifest.summary.localAssetMatches, 1);
  assert.equal(manifest.summary.assetsWithRecommendedGroups, 1);
  assert.equal(manifest.summary.recommendedGroupMatches, 1);
  assert.equal(manifest.summary.highReusableGroupMatches, 1);
  assert.deepEqual(manifest.summary.byReuseReadiness, { high: 1 });
  assert.equal(manifest.layers[0].layerKey, "0:2");
  assert.equal(manifest.layers[0].readiness.status, "local-template-learning-ready");
  assert.equal(manifest.layers[0].localAssets[0].suggestedUse, "inspect-openxml-groups-and-learn-editable-component");
});

test("component asset matcher prioritizes and preserves self-fidelity promotion evidence", () => {
  const base = {
    provider: "islide",
    path: path.join(process.cwd(), "runs", "components", "cycle.pptx"),
    name: "cycle.pptx",
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout"],
    reusePolicy: "inspect-openxml-applied-plugin-component"
  };
  const promoted = scoreLocalAsset({
    asset: {
      ...base,
      id: "promoted",
      roleTags: [...base.roleTags, "self-fidelity-promoted"],
      selfFidelityPromoted: true,
      selfFidelity: {
        passed: true,
        sha256: "a".repeat(64),
        comparison: { ok: true, pixelDiffRatio: 0.03 }
      }
    },
    layer: { layerType: "diagram-zone", templateFamily: "cycle-loop" },
    strategy: { mode: "plugin-component-template" }
  });
  const unverified = scoreLocalAsset({
    asset: { ...base, id: "unverified" },
    layer: { layerType: "diagram-zone", templateFamily: "cycle-loop" },
    strategy: { mode: "plugin-component-template" }
  });

  assert.equal(promoted.matchScore, unverified.matchScore + 24);
  assert.ok(promoted.reasonCodes.includes("self-fidelity-promoted"));
  assert.equal(promoted.selfFidelityPromoted, true);
  assert.equal(promoted.selfFidelity.comparison.pixelDiffRatio, 0.03);
});

test("component asset matcher reuses external learning summary cache", () => {
  const asset = {
    id: "officeplus-local",
    provider: "officeplus",
    path: path.join(process.cwd(), "OfficePLUS", "assets", "cached-template.pptx"),
    name: "cached-template.pptx",
    modifiedAt: "2026-01-01T00:00:00.000Z",
    sizeBytes: 1234,
    assetKind: "presentation-template",
    roleTags: ["diagram", "template-layout", "openxml-inspectable"],
    reusePolicy: "inspect-openxml-and-learn-style"
  };
  const learningSummaryCache = new Map([[
    assetLearningCacheKey(asset),
    {
      status: "ok",
      assetType: "pptx-template",
      componentCatalog: [{
        id: "slide1-group1",
        boundsPt: { x: 0, y: 0, w: 600, h: 100 },
        childCount: 8,
        shapeCount: 6,
        connectorCount: 2,
        pictureCount: 0,
        componentScore: 80
      }]
    }
  ]]);
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        detector: "foreground-graphic-crop",
        templateFamily: "process-chain",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: { sourceProvider: "officeplus", componentKind: "component" },
          bestCandidate: { sourceProvider: "officeplus", kind: "component" }
        }
      }]
    },
    inventory: { provider: "plugin-component-registry-v1", candidates: [asset] },
    learningSummaryCache
  });

  assert.equal(manifest.layers[0].localAssets[0].learningSummary.assetType, "pptx-template");
  assert.equal(manifest.summary.assetsWithRecommendedGroups, 1);
  assert.equal(manifest.summary.byStructureSignature.unknown, 1);
});

test("component asset matcher keeps native shape-group layers separate from image indexes", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: null,
        shapeLayerId: "p1-semantic-cycle-native-shapes",
        box: { x: 100, y: 120, width: 300, height: 180 },
        layerType: "diagram-zone",
        detector: "semantic-cycle-native-shape-group",
        templateFamily: "cycle-loop",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: { sourceProvider: "officeplus", componentKind: "component" },
          bestCandidate: { sourceProvider: "officeplus", kind: "component", title: "扁平6项循环闭环" }
        }
      }]
    },
    inventory: {
      candidates: [{
        id: "officeplus-downloaded-cycle",
        provider: "officeplus",
        path: path.join(process.cwd(), "OfficePLUS", "Temp", "OPPowerPNTAddin", "Files", "cycle.pptx"),
        name: "cycle.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          componentCatalog: [{
            id: "slide1-group1",
            boundsPt: { x: 0, y: 0, w: 500, h: 320 },
            childCount: 20,
            shapeCount: 20,
            pictureCount: 0,
            connectorCount: 0,
            componentScore: 80
          }]
        }
      }]
    }
  });

  assert.equal(manifest.layers[0].imageIndex, null);
  assert.equal(manifest.layers[0].shapeLayerId, "p1-semantic-cycle-native-shapes");
  assert.deepEqual(manifest.layers[0].box, { x: 100, y: 120, w: 300, h: 180 });
  assert.equal(manifest.layers[0].layerKey, "0:shape:p1-semantic-cycle-native-shapes");
  assert.notEqual(manifest.layers[0].layerKey, "0:0");
  assert.equal(manifest.summary.layersWithLocalAssets, 1);
  assert.equal(_private.normalizeOptionalIndex(null), null);
});

test("component asset matcher penalizes non-absolute asset paths", () => {
  const relative = scoreLocalAsset({
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
    },
    remoteCandidate: { sourceProvider: "officeplus", kind: "component" },
    asset: {
      id: "bad",
      provider: "officeplus",
      path: "relative/template.pptx",
      name: "template.pptx",
      assetKind: "presentation-template",
      roleTags: ["template-layout"]
    }
  });
  const absolute = scoreLocalAsset({
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
    },
    remoteCandidate: { sourceProvider: "officeplus", kind: "component" },
    asset: {
      id: "good",
      provider: "officeplus",
      path: path.join(process.cwd(), "template.pptx"),
      name: "template.pptx",
      assetKind: "presentation-template",
      roleTags: ["template-layout"]
    }
  });

  assert.ok(absolute.matchScore > relative.matchScore);
});

test("component asset matcher prefers downloaded OfficePLUS components over generic addin templates", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
  };
  const remoteCandidate = { sourceProvider: "officeplus", kind: "component" };
  const generic = scoreLocalAsset({
    strategy,
    remoteCandidate,
    asset: {
      id: "officeplus-generic",
      provider: "officeplus",
      path: path.join(process.cwd(), "Microsoft OfficePLUS", "addin", "officeplus.pptx"),
      name: "officeplus.pptx",
      assetKind: "presentation-template",
      roleTags: ["generic-installed-template", "template-layout", "openxml-inspectable"]
    }
  });
  const downloaded = scoreLocalAsset({
    strategy,
    remoteCandidate,
    asset: {
      id: "officeplus-downloaded",
      provider: "officeplus",
      path: path.join(process.cwd(), "OfficePLUS", "Temp", "OPPowerPNTAddin", "Files", "cycle.pptx"),
      name: "cycle.pptx",
      assetKind: "presentation-template",
      roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"]
    }
  });

  assert.ok(downloaded.matchScore > generic.matchScore);
  assert.ok(downloaded.reasonCodes.includes("downloaded-component"));
  assert.ok(!generic.reasonCodes.includes("generic-installed-template"));
});

test("component asset matcher treats applied iSlide decks as reusable component sources", () => {
  const applied = scoreLocalAsset({
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
    },
    remoteCandidate: { sourceProvider: "islide", kind: "smartdiagram" },
    asset: {
      id: "islide-applied-cycle",
      provider: "islide",
      path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "islide-applied-cycle.pptx"),
      name: "islide-applied-cycle.pptx",
      assetKind: "presentation-template",
      roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
    }
  });
  const generic = scoreLocalAsset({
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
    },
    remoteCandidate: { sourceProvider: "islide", kind: "smartdiagram" },
    asset: {
      id: "islide-generic",
      provider: "islide",
      path: path.join(process.cwd(), "iSlide", "template.pptx"),
      name: "template.pptx",
      assetKind: "presentation-template",
      roleTags: ["template-layout", "openxml-inspectable"]
    }
  });

  assert.ok(applied.matchScore > generic.matchScore);
  assert.ok(applied.reasonCodes.includes("applied-component"));
  assert.equal(applied.suggestedUse, "extract-openxml-groups-from-applied-plugin-component");
});

test("component asset matcher promotes applied plugin templates as the strongest local readiness", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      ir: "deck.ir.json",
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "process-chain",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: { sourceProvider: "officeplus", componentKind: "component", currentStep: "local-match" }
        },
        bestCandidates: [{ sourceProvider: "officeplus", kind: "component" }]
      }]
    },
    inventory: {
      provider: "plugin-component-registry-v1",
      candidates: [{
        id: "officeplus-applied-roadmap",
        provider: "officeplus",
        path: path.join(process.cwd(), "runs", "plugin-component-inventory", "officeplus-applied-components", "officeplus-applied-roadmap.pptx"),
        name: "officeplus-applied-roadmap.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          componentCatalog: []
        }
      }]
    },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers[0].readiness.status, "applied-plugin-template-learning-ready");
  assert.equal(manifest.layers[0].readiness.nextStep, "extract-openxml-grouped-shapes-from-applied-plugin-template");
  assert.equal(manifest.layers[0].localAssets[0].suggestedUse, "extract-openxml-groups-from-applied-plugin-component");
});

test("component asset matcher prefers applied plugin templates with matching learned structure", () => {
  const layer = {
    layerType: "diagram-zone",
    templateFamily: "cycle-loop"
  };
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
  };
  const remoteCandidate = { sourceProvider: "islide", kind: "smartdiagram" };
  const processTemplate = {
    id: "islide-applied-process",
    provider: "islide",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "process.pptx"),
    name: "process.pptx",
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
    learningSummary: {
      status: "ok",
      componentCatalog: [{
        id: "slide1-group1",
        structure: { kind: "process-chain" },
        reuseReadiness: { level: "high", score: 82 }
      }]
    }
  };
  const cycleTemplate = {
    ...processTemplate,
    id: "islide-applied-cycle",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "cycle.pptx"),
    name: "cycle.pptx",
    learningSummary: {
      status: "ok",
      componentCatalog: [{
        id: "slide1-group2",
        structure: {
          kind: "cycle-loop",
          motifs: ["arc-arrow", "ring-node"],
          motifCounts: { "arc-arrow": 4, "ring-node": 3 }
        },
        reuseReadiness: { level: "high", score: 88 }
      }]
    }
  };

  const processScore = scoreLocalAsset({ asset: processTemplate, layer, strategy, remoteCandidate });
  const cycleScore = scoreLocalAsset({ asset: cycleTemplate, layer, strategy, remoteCandidate });
  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate,
    inventoryCandidates: [processTemplate, cycleTemplate],
    includeLearningSummary: true
  });

  assert.ok(cycleScore.matchScore > processScore.matchScore);
  assert.ok(cycleScore.reasonCodes.includes("learned-motif:arc-arrow"));
  assert.equal(matches[0].id, "islide-applied-cycle");
  assert.equal(matches[0].structureSignature.primaryKind, "cycle-loop");
  assert.equal(matches[0].structureSignature.primaryMotif, "arc-arrow");
});

test("component asset matcher prefers an explicit high-readiness structure over a mixed helper group", () => {
  const signature = _private.summarizeAssetStructureSignature({
    componentCatalog: [
      {
        id: "roadmap",
        componentScore: 160,
        structure: {
          kind: "timeline",
          motifs: ["milestone-roadmap"],
          motifCounts: { "milestone-roadmap": 5 }
        },
        reuseReadiness: { level: "high", score: 92 }
      },
      {
        id: "helper",
        componentScore: 60,
        structure: { kind: "mixed", motifs: [], motifCounts: {} },
        reuseReadiness: { level: "medium", score: 60 }
      }
    ]
  });

  assert.equal(signature.primaryKind, "timeline");
  assert.ok(signature.motifs.includes("milestone-roadmap"));
  assert.ok(signature.kindScores.timeline > signature.kindScores.mixed);
});

test("component asset matcher uses explicit layer target motifs before text fallback", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
  };
  const remoteCandidate = { sourceProvider: "officeplus", kind: "component", title: "关系图" };
  const baseAsset = {
    provider: "officeplus",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "officeplus-applied-components", "template.pptx"),
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
  };
  const treeAsset = {
    ...baseAsset,
    id: "tree-template",
    name: "tree-template.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group1",
        structure: {
          kind: "hub-spoke",
          motifs: ["tree-link"],
          motifCounts: { "tree-link": 5 }
        },
        reuseReadiness: { level: "high", score: 84 }
      }]
    }
  };
  const radialAsset = {
    ...baseAsset,
    id: "radial-template",
    name: "radial-template.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group2",
        structure: {
          kind: "hub-spoke",
          motifs: ["radial-link"],
          motifCounts: { "radial-link": 6 }
        },
        reuseReadiness: { level: "high", score: 86 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer: {
      layerType: "diagram-zone",
      templateFamily: "hub-spoke",
      diagramUnderstanding: {
        targetMotifs: ["tree-link"],
        componentStrategy: { targetMotifs: ["tree-link"] }
      }
    },
    strategy,
    remoteCandidate,
    inventoryCandidates: [radialAsset, treeAsset],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "tree-template");
  assert.equal(matches[0].structureSignature.primaryMotif, "tree-link");
  assert.ok(matches[0].reasonCodes.includes("learned-motif:tree-link"));
});

test("component asset matcher marks applied templates with matching target motifs as ready to reuse", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "cycle-loop",
        targetMotifs: ["arc-arrow"],
        componentRenderStrategy: {
          mode: "plugin-component-template",
          targetMotifs: ["arc-arrow"],
          applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram", currentStep: "local-match" }
        },
        bestCandidates: [{ sourceProvider: "islide", kind: "smartdiagram", title: "圆弧箭头循环" }]
      }]
    },
    inventory: {
      candidates: [{
        id: "islide-applied-arc-arrow",
        provider: "islide",
        path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "arc-arrow.pptx"),
        name: "arc-arrow.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          componentCatalog: [{
            id: "slide1-group1",
            structure: {
              kind: "cycle-loop",
              motifs: ["arc-arrow"]
            },
            reuseReadiness: { level: "high", score: 88 }
          }]
        }
      }]
    },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers[0].readiness.status, "applied-plugin-motif-ready");
  assert.equal(manifest.layers[0].readiness.nextStep, "reuse-openxml-groups-from-applied-plugin-template-for-target-motif");
  assert.deepEqual(manifest.layers[0].readiness.targetMotifs, ["arc-arrow"]);
  assert.equal(manifest.layers[0].readiness.appliedMotifReadyAssets, 1);
  assert.equal(manifest.layers[0].localAssets[0].structureSignature.primaryMotif, "arc-arrow");
});

test("component asset matcher prefers learned templates with closer visual structure complexity", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
  };
  const layer = {
    layerType: "diagram-zone",
    templateFamily: "hub-spoke",
    diagramUnderstanding: {
      archetype: "hub-spoke",
      visualNodeCount: 5,
      visualConnectorCount: 4,
      residualCount: 0,
      targetMotifs: ["radial-link"]
    }
  };
  const baseAsset = {
    provider: "islide",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "watched-plugin-components", "islide", "template.pptx"),
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
  };
  const closeStructure = {
    ...baseAsset,
    id: "hub-spoke-five-node",
    name: "hub-spoke-five-node.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group1",
        shapeCount: 5,
        connectorCount: 4,
        pictureCount: 0,
        childCount: 9,
        structure: { kind: "hub-spoke", motifs: ["radial-link"], motifCounts: { "radial-link": 4 } },
        reuseReadiness: { level: "high", score: 88 }
      }]
    }
  };
  const hugeStructure = {
    ...baseAsset,
    id: "hub-spoke-huge",
    name: "hub-spoke-huge.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group2",
        shapeCount: 30,
        connectorCount: 18,
        pictureCount: 0,
        childCount: 48,
        structure: { kind: "hub-spoke", motifs: ["radial-link"], motifCounts: { "radial-link": 4 } },
        reuseReadiness: { level: "high", score: 88 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate: { sourceProvider: "islide", kind: "smartdiagram" },
    inventoryCandidates: [hugeStructure, closeStructure],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "hub-spoke-five-node");
  assert.ok(matches[0].reasonCodes.includes("structure-node-count-close"));
  assert.ok(matches[0].reasonCodes.includes("structure-connector-count-close"));
  assert.ok(matches[0].matchScore > matches[1].matchScore);
});

test("component asset matcher prefers learned whole-process templates for process structure targets", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
  };
  const layer = {
    layerType: "diagram-zone",
    templateFamily: "process-chain",
    diagramUnderstanding: {
      archetype: "flow-card-chain",
      visualNodeCount: 4,
      visualConnectorCount: 3,
      targetMotifs: ["linear-arrow-chain", "whole-process-template"],
      componentStrategy: {
        templateFamily: "process-chain",
        targetMotifs: ["linear-arrow-chain", "whole-process-template"]
      }
    }
  };
  const baseAsset = {
    provider: "islide",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "process.pptx"),
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
  };
  const wholeProcess = {
    ...baseAsset,
    id: "whole-process",
    name: "whole-process.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-whole-process",
        shapeCount: 8,
        connectorCount: 3,
        pictureCount: 0,
        childCount: 12,
        structure: {
          kind: "process-chain",
          motifs: ["linear-arrow-chain", "whole-process-template"],
          motifCounts: { "linear-arrow-chain": 7, "whole-process-template": 7 }
        },
        reuseReadiness: { level: "high", score: 92 }
      }]
    }
  };
  const looseProcess = {
    ...baseAsset,
    id: "loose-process",
    name: "loose-process.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-loose-process",
        shapeCount: 8,
        connectorCount: 3,
        pictureCount: 0,
        childCount: 12,
        structure: {
          kind: "process-chain",
          motifs: ["linear-arrow-chain"],
          motifCounts: { "linear-arrow-chain": 7 }
        },
        reuseReadiness: { level: "high", score: 92 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate: { sourceProvider: "islide", kind: "smartdiagram" },
    inventoryCandidates: [looseProcess, wholeProcess],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "whole-process");
  assert.ok(matches[0].reasonCodes.includes("learned-motif:whole-process-template"));
  assert.ok(matches[0].matchScore > matches[1].matchScore);
});

test("component asset matcher boosts learned assets that match native semantic component instances", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
  };
  const layer = {
    layerType: "chart-zone",
    templateFamily: "bar-chart",
    nativeComponentArchetype: "bar-chart",
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentPartCount: 5,
    nativeComponentReplacementKey: "visual-component-chart-zone-layer-bar-chart:bar-chart:5",
    nativeComponentBounds: { x: 40, y: 50, w: 320, h: 180 },
    diagramUnderstanding: {
      archetype: "bar-chart"
    }
  };
  const baseAsset = {
    provider: "officeplus",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "watched-plugin-components", "officeplus", "chart.pptx"),
    assetKind: "presentation-template",
    roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"]
  };
  const matchingChart = {
    ...baseAsset,
    id: "matching-bar-chart",
    name: "matching-bar-chart.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "bar-chart-group",
        shapeCount: 5,
        connectorCount: 0,
        pictureCount: 0,
        childCount: 5,
        structure: { kind: "bar-chart" },
        reuseReadiness: { level: "high", score: 88 }
      }]
    }
  };
  const genericProcess = {
    ...baseAsset,
    id: "generic-process",
    name: "generic-process.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "process-group",
        shapeCount: 18,
        connectorCount: 4,
        pictureCount: 0,
        childCount: 22,
        structure: { kind: "process-chain" },
        reuseReadiness: { level: "high", score: 90 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate: { sourceProvider: "officeplus", kind: "component" },
    inventoryCandidates: [genericProcess, matchingChart],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "matching-bar-chart");
  assert.ok(matches[0].reasonCodes.includes("native-component-archetype:bar-chart"));
  assert.ok(matches[0].reasonCodes.includes("native-component-part-count-close"));
  assert.ok(matches[0].reasonCodes.includes("native-component-editable-template"));
});

test("component asset matcher carries pie-share-chart motifs through learned component matching", () => {
  const strategy = {
    mode: "plugin-component-template",
    targetMotifs: ["pie-share-chart"],
    applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
  };
  const layer = {
    layerType: "chart-zone",
    templateFamily: "pie-chart",
    targetMotifs: ["pie-share-chart"],
    nativeComponentArchetype: "pie-chart",
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentPartCount: 4,
    diagramUnderstanding: {
      archetype: "pie-chart",
      targetMotifs: ["pie-share-chart"],
      componentStrategy: { templateFamily: "pie-chart", targetMotifs: ["pie-share-chart"] }
    }
  };
  const baseAsset = {
    provider: "officeplus",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "watched-plugin-components", "officeplus", "pie.pptx"),
    assetKind: "presentation-template",
    roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"]
  };
  const matchingPie = {
    ...baseAsset,
    id: "matching-pie-chart",
    name: "matching-pie-chart.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "pie-chart-group",
        shapeCount: 4,
        connectorCount: 0,
        pictureCount: 0,
        childCount: 4,
        structure: { kind: "pie-chart", motifs: ["pie-share-chart"], motifCounts: { "pie-share-chart": 4 } },
        reuseReadiness: { level: "high", score: 90 }
      }]
    }
  };
  const donutLike = {
    ...baseAsset,
    id: "donut-chart",
    name: "donut-chart.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "donut-chart-group",
        shapeCount: 4,
        connectorCount: 0,
        pictureCount: 0,
        childCount: 4,
        structure: { kind: "donut-chart", motifs: ["ring-node"], motifCounts: { "ring-node": 4 } },
        reuseReadiness: { level: "high", score: 88 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate: { sourceProvider: "officeplus", kind: "component", title: "四扇区饼图" },
    inventoryCandidates: [donutLike, matchingPie],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "matching-pie-chart");
  assert.ok(matches[0].reasonCodes.includes("native-component-archetype:pie-chart"));
  assert.ok(matches[0].reasonCodes.includes("learned-motif:pie-share-chart"));
  assert.equal(matches[0].structureSignature.primaryMotif, "pie-share-chart");
});

test("component asset matcher avoids bitmap-heavy learned templates for native diagram targets", () => {
  const strategy = {
    mode: "plugin-component-template",
    applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
  };
  const layer = {
    layerType: "diagram-zone",
    templateFamily: "cycle-loop",
    diagramUnderstanding: {
      archetype: "cycle-loop",
      visualNodeCount: 6,
      visualConnectorCount: 0,
      targetMotifs: ["arc-arrow"]
    }
  };
  const baseAsset = {
    provider: "officeplus",
    path: path.join(process.cwd(), "runs", "plugin-component-inventory", "watched-plugin-components", "officeplus", "cycle.pptx"),
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
  };
  const nativeShapes = {
    ...baseAsset,
    id: "cycle-native",
    name: "cycle-native.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group1",
        shapeCount: 8,
        connectorCount: 0,
        pictureCount: 0,
        childCount: 8,
        structure: { kind: "cycle-loop", motifs: ["arc-arrow"], motifCounts: { "arc-arrow": 8 } },
        reuseReadiness: { level: "high", score: 90 }
      }]
    }
  };
  const bitmapHeavy = {
    ...baseAsset,
    id: "cycle-bitmap-heavy",
    name: "cycle-bitmap-heavy.pptx",
    learningSummary: {
      componentCatalog: [{
        id: "slide1-group2",
        shapeCount: 2,
        connectorCount: 0,
        pictureCount: 5,
        childCount: 7,
        structure: { kind: "cycle-loop", motifs: ["arc-arrow"], motifCounts: { "arc-arrow": 8 } },
        reuseReadiness: { level: "high", score: 90 }
      }]
    }
  };

  const matches = matchLocalComponentAssets({
    layer,
    strategy,
    remoteCandidate: { sourceProvider: "officeplus", kind: "component" },
    inventoryCandidates: [bitmapHeavy, nativeShapes],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "cycle-native");
  assert.ok(matches[0].reasonCodes.includes("structure-native-no-picture-close"));
  assert.ok(matches[0].matchScore > matches[1].matchScore);
});

test("component asset matcher recognizes Venn and overlap plugin component motifs", () => {
  const matches = matchLocalComponentAssets({
    layer: {
      layerType: "diagram-zone",
      templateFamily: "venn-overlap",
      plan: { targetMotifs: ["venn-overlap", "intersection-overlap"] }
    },
    strategy: {
      mode: "plugin-component-template",
      targetMotifs: ["venn-overlap", "intersection-overlap"],
      applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
    },
    remoteCandidate: {
      sourceProvider: "officeplus",
      kind: "component",
      title: "维恩图交集关系组件"
    },
    inventoryCandidates: [
      {
        id: "officeplus-cycle",
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", "cycle.pptx"),
        name: "cycle.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          componentCatalog: [{
            id: "slide1-group-cycle",
            shapeCount: 8,
            childCount: 8,
            structure: { kind: "cycle-loop", motifs: ["arc-arrow"], motifCounts: { "arc-arrow": 6 } },
            reuseReadiness: { level: "high", score: 88 }
          }]
        }
      },
      {
        id: "officeplus-venn",
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", "venn-overlap.pptx"),
        name: "venn-overlap.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          componentCatalog: [{
            id: "slide1-group-venn",
            shapeCount: 5,
            childCount: 5,
            structure: {
              kind: "venn-overlap",
              motifs: ["venn-overlap", "intersection-overlap"],
              motifCounts: { "venn-overlap": 3, "intersection-overlap": 1 }
            },
            reuseReadiness: { level: "high", score: 91 }
          }]
        }
      }
    ],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "officeplus-venn");
  assert.ok(matches[0].reasonCodes.includes("learned-motif:venn-overlap"));
});

test("component asset matcher recognizes layered, pyramid, and funnel plugin component motifs", () => {
  const matches = matchLocalComponentAssets({
    layer: {
      layerType: "diagram-zone",
      templateFamily: "layered-stack",
      plan: { targetMotifs: ["layered-stack", "pyramid-stack", "funnel-stack"] }
    },
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
    },
    remoteCandidate: {
      sourceProvider: "islide",
      kind: "smartdiagram",
      title: "分层金字塔漏斗结构"
    },
    inventoryCandidates: [{
      id: "islide-layered-stack",
      provider: "islide",
      path: path.join(process.cwd(), "islide", "layered-stack.pptx"),
      name: "layered-stack.pptx",
      assetKind: "presentation-template",
      roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
      learningSummary: {
        componentCatalog: [{
          id: "slide1-group-layered",
          shapeCount: 9,
          childCount: 9,
          structure: {
            kind: "layered-stack",
            motifs: ["layered-stack", "pyramid-stack", "funnel-stack"],
            motifCounts: { "layered-stack": 5, "pyramid-stack": 2, "funnel-stack": 2 }
          },
          reuseReadiness: { level: "high", score: 90 }
        }]
      }
    }],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "islide-layered-stack");
  assert.ok(matches[0].reasonCodes.includes("learned-motif:layered-stack"));
});

test("component asset matcher records roadmap acquisition motifs instead of generic process-only search", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 2,
        imageIndex: 1,
        layerType: "diagram-zone",
        templateFamily: "timeline",
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: {
            sourceProvider: "officeplus",
            componentKind: "component",
            currentStep: "preserve-source-crop-and-record-component-replacement"
          },
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            title: "项目里程碑甘特路线图"
          }
        },
        bestCandidates: [{
          sourceProvider: "officeplus",
          kind: "component",
          title: "项目里程碑甘特路线图"
        }]
      }]
    },
    inventory: { candidates: [] },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers[0].readiness.status, "remote-candidate-only");
  assert.equal(manifest.summary.acquisitionTasks, 6);
  assert.equal(manifest.summary.byAcquisitionMotif["milestone-roadmap"], 6);
  assert.equal(manifest.summary.byAcquisitionMotif["gantt-roadmap"], 6);
  const keywordPool = manifest.layers[0].componentAcquisitionTasks
    .flatMap((task) => [task.keywords, ...(task.alternateKeywords || [])]);
  assert.ok(keywordPool.includes("里程碑路线图"));
  assert.ok(keywordPool.includes("甘特路线图"));
});

test("component asset matcher recognizes fishbone, swimlane, and hierarchy plugin motifs", () => {
  const base = {
    provider: "islide",
    assetKind: "presentation-template",
    roleTags: ["applied-component", "template-layout", "openxml-inspectable"]
  };
  const cases = [
    {
      id: "fishbone",
      family: "fishbone-cause-effect",
      motif: "fishbone-cause",
      title: "鱼骨图根因分析",
      structureKind: "fishbone",
      expectedReason: "learned-motif:fishbone-cause"
    },
    {
      id: "swimlane",
      family: "swimlane-flow",
      motif: "swimlane-flow",
      title: "跨部门泳道流程",
      structureKind: "swimlane",
      expectedReason: "learned-motif:swimlane-flow"
    },
    {
      id: "hierarchy",
      family: "hierarchy-tree",
      motif: "org-hierarchy",
      title: "组织架构层级图",
      structureKind: "org-chart",
      expectedReason: "learned-motif:org-hierarchy"
    }
  ];

  for (const item of cases) {
    const matches = matchLocalComponentAssets({
      layer: {
        layerType: "diagram-zone",
        templateFamily: item.family,
        plan: { targetMotifs: [item.motif] }
      },
      strategy: {
        mode: "plugin-component-template",
        applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" }
      },
      remoteCandidate: {
        sourceProvider: "islide",
        kind: "smartdiagram",
        title: item.title
      },
      inventoryCandidates: [{
        ...base,
        id: `islide-${item.id}`,
        path: path.join(process.cwd(), "islide", `${item.id}.pptx`),
        name: `${item.id}.pptx`,
        learningSummary: {
          componentCatalog: [{
            id: `slide1-${item.id}`,
            shapeCount: 10,
            childCount: 12,
            connectorCount: 3,
            structure: {
              kind: item.structureKind,
              motifs: [item.motif],
              motifCounts: { [item.motif]: 4 }
            },
            reuseReadiness: { level: "high", score: 89 }
          }]
        }
      }],
      includeLearningSummary: true
    });

    assert.equal(matches[0].id, `islide-${item.id}`);
    assert.ok(matches[0].reasonCodes.includes(item.expectedReason), item.id);
  }
});

test("component asset matcher recognizes quadrant, comparison, and heatmap matrix plugin motifs", () => {
  const targetLayer = {
    layerType: "table-zone",
    templateFamily: "grid-or-matrix",
    plan: { targetMotifs: ["comparison-matrix", "heatmap-matrix", "quadrant-axis"] }
  };
  const matches = matchLocalComponentAssets({
    layer: targetLayer,
    strategy: {
      mode: "plugin-component-template",
      targetMotifs: ["comparison-matrix", "heatmap-matrix", "quadrant-axis"],
      applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
    },
    remoteCandidate: {
      sourceProvider: "officeplus",
      kind: "component",
      title: "四象限优先级对比热力矩阵"
    },
    inventoryCandidates: [
      {
        id: "officeplus-generic-process",
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", "process.pptx"),
        name: "process.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          componentCatalog: [{
            id: "slide1-process",
            shapeCount: 6,
            childCount: 6,
            structure: { kind: "process-chain", motifs: ["linear-arrow-chain"], motifCounts: { "linear-arrow-chain": 4 } },
            reuseReadiness: { level: "high", score: 85 }
          }]
        }
      },
      {
        id: "officeplus-quadrant-matrix",
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", "quadrant-matrix.pptx"),
        name: "quadrant-matrix.pptx",
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          componentCatalog: [{
            id: "slide1-quadrant",
            shapeCount: 12,
            childCount: 12,
            structure: {
              kind: "quadrant",
              motifs: ["quadrant-axis", "comparison-matrix", "heatmap-matrix"],
              motifCounts: { "quadrant-axis": 2, "comparison-matrix": 2, "heatmap-matrix": 1 }
            },
            reuseReadiness: { level: "high", score: 91 }
          }]
        }
      }
    ],
    includeLearningSummary: true
  });

  assert.equal(matches[0].id, "officeplus-quadrant-matrix");
  assert.ok(matches[0].reasonCodes.includes("learned-motif:comparison-matrix"));
  assert.ok(matches[0].matchScore > matches[1].matchScore);
});

test("component asset matcher creates precise acquisition tasks for fishbone and swimlane targets", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [
        {
          pageIndex: 1,
          imageIndex: 0,
          layerType: "diagram-zone",
          templateFamily: "fishbone-cause-effect",
          plan: { targetMotifs: ["fishbone-cause"] },
          componentRenderStrategy: {
            mode: "plugin-component-template",
            applicationPlan: { sourceProvider: "officeplus", componentKind: "component" },
            bestCandidate: { sourceProvider: "officeplus", kind: "component", title: "鱼骨图根因分析" }
          }
        },
        {
          pageIndex: 1,
          imageIndex: 1,
          layerType: "diagram-zone",
          templateFamily: "swimlane-flow",
          plan: { targetMotifs: ["swimlane-flow"] },
          componentRenderStrategy: {
            mode: "plugin-component-template",
            applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" },
            bestCandidate: { sourceProvider: "islide", kind: "smartdiagram", title: "泳道流程" }
          }
        }
      ]
    },
    inventory: { candidates: [] },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.summary.byAcquisitionMotif["fishbone-cause"], 6);
  assert.equal(manifest.summary.byAcquisitionMotif["swimlane-flow"], 6);
  const keywords = manifest.layers.flatMap((layer) => layer.componentAcquisitionTasks || [])
    .flatMap((task) => [task.keywords, ...(task.alternateKeywords || [])]);
  assert.ok(keywords.includes("鱼骨图"));
  assert.ok(keywords.includes("泳道流程"));
});

test("component asset matcher recognizes treemap, bubble, and segmented donut plugin chart motifs", () => {
  const cases = [
    {
      id: "treemap",
      family: "treemap-chart",
      motif: "treemap-chart",
      title: "矩形树图面积占比组件",
      structureKind: "treemap",
      expectedReason: "learned-motif:treemap-chart"
    },
    {
      id: "bubble",
      family: "scatter-chart",
      motif: "bubble-scatter-chart",
      title: "气泡矩阵组合分布图",
      structureKind: "bubble-chart",
      expectedReason: "learned-motif:bubble-scatter-chart"
    },
    {
      id: "donut",
      family: "donut-chart",
      motif: "donut-segment-chart",
      title: "分段环形占比图",
      structureKind: "segmented-donut",
      expectedReason: "learned-motif:donut-segment-chart"
    }
  ];

  for (const item of cases) {
    const matches = matchLocalComponentAssets({
      layer: {
        layerType: "chart-zone",
        templateFamily: item.family,
        plan: { targetMotifs: [item.motif] }
      },
      strategy: {
        mode: "plugin-component-template",
        targetMotifs: [item.motif],
        applicationPlan: { sourceProvider: "officeplus", componentKind: "component" }
      },
      remoteCandidate: {
        sourceProvider: "officeplus",
        kind: "component",
        title: item.title
      },
      inventoryCandidates: [{
        id: `officeplus-${item.id}`,
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", `${item.id}.pptx`),
        name: `${item.id}.pptx`,
        assetKind: "presentation-template",
        roleTags: ["downloaded-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          componentCatalog: [{
            id: `slide1-${item.id}`,
            shapeCount: 10,
            childCount: 10,
            structure: {
              kind: item.structureKind,
              motifs: [item.motif],
              motifCounts: { [item.motif]: 4 }
            },
            reuseReadiness: { level: "high", score: 90 }
          }]
        }
      }],
      includeLearningSummary: true
    });

    assert.equal(matches[0].id, `officeplus-${item.id}`);
    assert.ok(matches[0].reasonCodes.includes(item.expectedReason), item.id);
  }
});

test("component asset matcher creates chart-specific acquisition tasks for treemap, bubble, and segmented donut targets", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [
        {
          pageIndex: 3,
          imageIndex: 0,
          layerType: "chart-zone",
          templateFamily: "treemap-chart",
          plan: { targetMotifs: ["treemap-chart"] },
          componentRenderStrategy: {
            mode: "plugin-component-template",
            applicationPlan: { sourceProvider: "officeplus", componentKind: "component" },
            bestCandidate: { sourceProvider: "officeplus", kind: "component", title: "矩形树图面积占比组件" }
          }
        },
        {
          pageIndex: 3,
          imageIndex: 1,
          layerType: "chart-zone",
          templateFamily: "scatter-chart",
          plan: { targetMotifs: ["bubble-scatter-chart"] },
          componentRenderStrategy: {
            mode: "plugin-component-template",
            applicationPlan: { sourceProvider: "officeplus", componentKind: "component" },
            bestCandidate: { sourceProvider: "officeplus", kind: "component", title: "气泡矩阵组合分布图" }
          }
        },
        {
          pageIndex: 3,
          imageIndex: 2,
          layerType: "chart-zone",
          templateFamily: "donut-chart",
          plan: { targetMotifs: ["donut-segment-chart"] },
          componentRenderStrategy: {
            mode: "plugin-component-template",
            applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram" },
            bestCandidate: { sourceProvider: "islide", kind: "smartdiagram", title: "分段环形占比图" }
          }
        }
      ]
    },
    inventory: { candidates: [] },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.summary.byAcquisitionMotif["treemap-chart"], 6);
  assert.equal(manifest.summary.byAcquisitionMotif["bubble-scatter-chart"], 6);
  assert.equal(manifest.summary.byAcquisitionMotif["donut-segment-chart"], 5);
  const keywords = manifest.layers.flatMap((layer) => layer.componentAcquisitionTasks || [])
    .flatMap((task) => [task.keywords, ...(task.alternateKeywords || [])]);
  assert.ok(keywords.includes("矩形树图"));
  assert.ok(keywords.includes("气泡图"));
  assert.ok(keywords.includes("分段环形图"));
});

test("component asset matcher reports applied template motif mismatch when downloaded components do not fit the target", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "diagram-zone",
        templateFamily: "hub-spoke",
        plan: { targetMotifs: ["radial-link"] },
        componentRenderStrategy: {
          mode: "plugin-component-template",
          applicationPlan: { sourceProvider: "islide", componentKind: "smartdiagram", currentStep: "local-match" }
        },
        bestCandidates: [{ sourceProvider: "islide", kind: "smartdiagram", title: "中心辐射关系图" }]
      }]
    },
    inventory: {
      candidates: [{
        id: "islide-applied-arc-arrow",
        provider: "islide",
        path: path.join(process.cwd(), "runs", "plugin-component-inventory", "islide-applied-components", "arc-arrow.pptx"),
        name: "arc-arrow.pptx",
        assetKind: "presentation-template",
        roleTags: ["applied-component", "template-layout", "openxml-inspectable"],
        learningSummary: {
          status: "ok",
          assetType: "pptx-template",
          componentCatalog: [{
            id: "slide1-group1",
            structure: {
              kind: "cycle-loop",
              motifs: ["arc-arrow"],
              motifCounts: { "arc-arrow": 13 }
            },
            reuseReadiness: { level: "medium", score: 62 }
          }]
        }
      }]
    },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers[0].readiness.status, "applied-plugin-template-motif-mismatch");
  assert.equal(manifest.layers[0].readiness.nextStep, "find-or-download-applied-plugin-template-with-matching-target-motif");
  assert.deepEqual(manifest.layers[0].readiness.targetMotifs, ["radial-link"]);
  assert.equal(manifest.summary.recommendedGroupMatches, 0);
  assert.equal(manifest.layers[0].localAssets[0].componentGroupDiagnostics.rejectedGroups, 1);
  assert.equal(manifest.layers[0].localAssets[0].componentGroupDiagnostics.byReason["target-motif-conflict"], 1);
  assert.deepEqual(manifest.layers[0].localAssets[0].componentGroupDiagnostics.targetMotifs, ["radial-link"]);
  assert.deepEqual(manifest.layers[0].localAssets[0].componentGroupDiagnostics.examples[0].motifs, ["arc-arrow"]);
  assert.equal(manifest.summary.acquisitionTasks, 5);
  assert.equal(manifest.summary.byAcquisitionMotif["radial-link"], 5);
  assert.deepEqual(
    manifest.layers[0].componentAcquisitionTasks.map((task) => `${task.provider}:${task.kind}`),
    [
      "islide:diagram",
      "islide:smartdiagram",
      "officeplus:component",
      "officeplus:shape",
      "officeplus:vector"
    ]
  );
  assert.equal(manifest.layers[0].componentAcquisitionTasks[0].keywords, "中心辐射");
  assert.ok(manifest.layers[0].componentAcquisitionTasks[0].alternateKeywords.includes("放射关系图"));
});

test("component asset matcher suppresses acquisition tasks for protected fidelity crops", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "illustration-zone",
        detector: "left-illustration-panel-crop",
        templateFamily: "icon-or-illustration",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "workflow-demand-funnel-illustration",
        recommendedAction: "match-icon-library-or-keep-local-crop",
        reason: "preserved the dense left illustration as a movable fidelity crop",
        plan: { targetMotifs: ["pie-share-chart"] },
        componentRenderStrategy: {
          mode: "preserve-local-crop",
          editableExpectation: "standalone-visual-asset-preserved-as-movable-crop",
          reason: "intentional minimum visual unit is preserved as a local crop",
          applicationPlan: {
            currentStep: "preserve-source-crop",
            targetStep: "retry-component-search-after-better-layer-understanding",
            sourceProvider: "officeplus"
          }
        },
        bestCandidates: [{ sourceProvider: "officeplus", kind: "ppt", title: "饼图模板" }]
      }]
    },
    inventory: { candidates: [] },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers.length, 1);
  assert.equal(manifest.layers[0].readiness.status, "remote-candidate-only");
  assert.equal(manifest.layers[0].componentAcquisitionTasks, undefined);
  assert.equal(manifest.summary.acquisitionTasks, 0);
  assert.equal(manifest.summary.byAcquisitionMotif["pie-share-chart"], undefined);
});

test("component asset matcher does not let uncertain preserve crops inherit motifs from weak remote candidates", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 12,
        imageIndex: 2,
        layerType: "chart-zone",
        detector: "kpi-evidence-crop",
        templateFamily: "generic",
        recommendedAction: "preserve-local-crop",
        componentRenderStrategy: {
          mode: "preserve-local-crop",
          editableExpectation: "raster-diagram-with-editable-text-overlays",
          reason: "no reliable reusable component or native atom structure was found",
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "component",
            title: "扁平3项人物关系图",
            reuseHint: "candidate-grouped-pptx-component"
          },
          applicationPlan: {
            currentStep: "preserve-source-crop",
            targetStep: "retry-component-search-after-better-layer-understanding",
            sourceProvider: "officeplus",
            componentKind: "component",
            componentId: "MatlComponentContent-17792",
            requiresDownload: false,
            preservesFidelityNow: true
          }
        },
        bestCandidates: [{
          sourceProvider: "officeplus",
          kind: "component",
          title: "扁平3项人物关系图",
          reuseHint: "candidate-grouped-pptx-component"
        }]
      }]
    },
    inventory: { candidates: [] },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers.length, 1);
  assert.equal(manifest.layers[0].readiness.status, "remote-candidate-only");
  assert.equal(manifest.layers[0].componentAcquisitionTasks, undefined);
  assert.equal(manifest.summary.acquisitionTasks, 0);
  assert.equal(manifest.summary.byAcquisitionMotif["radial-link"], undefined);
});

test("component asset matcher treats completed native style-guide rebuilds as not requiring acquisition", () => {
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 12,
        imageIndex: 0,
        layerType: "chart-zone",
        detector: "kpi-evidence-crop",
        templateFamily: "line-chart",
        plan: { targetMotifs: ["card-grid"] },
        componentRenderStrategy: {
          mode: "native-rebuild-with-component-style-guide",
          implementationMode: "style-guide",
          editableExpectation: "native-primitives-guided-by-plugin-reference",
          reason: "plugin reference can guide colors, layout family, and spacing while native atoms remain plausible",
          bestCandidate: {
            sourceProvider: "officeplus",
            kind: "ppt",
            title: "灰色三步流程管理PPT模板",
            targetMotifs: ["card-grid"]
          },
          applicationPlan: {
            currentStep: "rebuild-native-primitives-guided-by-component-style",
            targetStep: "replace-low-confidence-primitives-with-plugin-components-when-match-confidence-improves",
            sourceProvider: "officeplus",
            componentKind: "ppt",
            requiresDownload: false
          }
        },
        bestCandidates: [{
          sourceProvider: "officeplus",
          kind: "ppt",
          title: "灰色三步流程管理PPT模板",
          targetMotifs: ["card-grid"]
        }]
      }]
    },
    inventory: {
      candidates: [{
        id: "wrong-motif-local-template",
        provider: "islide",
        path: path.join(process.cwd(), "islide", "cycle-template.pptx"),
        name: "cycle-template.pptx",
        assetKind: "presentation-template",
        roleTags: ["diagram"],
        learningSummary: {
          status: "ok",
          structure: { kind: "cycle-loop", motifs: ["arc-arrow"], motifCounts: { "arc-arrow": 4 } },
          componentCatalog: [{
            id: "slide1-group1",
            name: "cycle",
            structure: { kind: "cycle-loop", motifs: ["arc-arrow"], motifCounts: { "arc-arrow": 4 } },
            reuseReadiness: { level: "medium", score: 62 }
          }]
        }
      }]
    },
    maxAssetsPerLayer: 1
  });

  assert.equal(manifest.layers.length, 1);
  assert.ok(["remote-candidate-only", "applied-plugin-template-motif-mismatch"].includes(manifest.layers[0].readiness.status));
  assert.equal(manifest.layers[0].componentAcquisitionTasks, undefined);
  assert.equal(manifest.summary.acquisitionTasks, 0);
  assert.equal(manifest.summary.byAcquisitionMotif["card-grid"], undefined);
});

test("component asset matcher returns the strongest local matches first", () => {
  const matches = matchLocalComponentAssets({
    layer: { templateFamily: "icon-or-illustration" },
    strategy: {
      mode: "plugin-component-template",
      applicationPlan: { sourceProvider: "officeplus", componentKind: "vector" }
    },
    remoteCandidate: { sourceProvider: "officeplus", kind: "vector" },
    inventoryCandidates: [
      {
        id: "islide-ref",
        provider: "islide",
        path: path.join(process.cwd(), "islide", "icon.png"),
        name: "icon.png",
        assetKind: "bitmap-reference",
        roleTags: ["icon"]
      },
      {
        id: "officeplus-vector",
        provider: "officeplus",
        path: path.join(process.cwd(), "officeplus", "icon.svg"),
        name: "icon.svg",
        assetKind: "vector-component",
        roleTags: ["icon", "vector"]
      }
    ]
  });

  assert.equal(matches[0].id, "officeplus-vector");
  assert.equal(matches[0].suggestedUse, "reuse-vector-style-or-convert-to-native-freeform-after-license-review");
});

test("component asset matcher uses layer type fallback for structured layers without remote candidates", () => {
  const asset = {
    id: "officeplus-matrix-template",
    provider: "officeplus",
    path: path.join(process.cwd(), "officeplus", "matrix-template.pptx"),
    name: "matrix-template.pptx",
    assetKind: "presentation-template",
    roleTags: ["diagram", "template-layout"],
    learningSummary: {
      status: "ok",
      assetType: "pptx-template",
      componentCatalog: [{
        id: "slide1-group1",
        boundsPt: { x: 0, y: 0, w: 500, h: 260 },
        childCount: 12,
        shapeCount: 10,
        connectorCount: 0,
        pictureCount: 0,
        componentScore: 76
      }]
    }
  };
  const manifest = buildComponentAssetManifest({
    candidateReport: {
      layers: [{
        pageIndex: 0,
        imageIndex: 0,
        layerType: "table-zone",
        detector: "foreground-graphic-underlay-crop",
        templateFamily: "generic",
        componentRenderStrategy: { mode: "preserve-crop-with-component-reference" }
      }]
    },
    inventory: { provider: "plugin-component-registry-v1", candidates: [asset] }
  });

  assert.equal(manifest.layers[0].templateFamily, "grid-or-matrix");
  assert.equal(manifest.summary.layersWithLocalAssets, 1);
  assert.equal(manifest.layers[0].localAssets[0].id, "officeplus-matrix-template");
  assert.ok(manifest.layers[0].localAssets[0].reasonCodes.includes("structured-layer-kind-fallback"));
});

test("component asset matcher does not apply structured fallback reasons to screenshot layers", () => {
  const matches = matchLocalComponentAssets({
    layer: { layerType: "screenshot-zone", templateFamily: "generic" },
    strategy: { mode: "preserve-crop-with-component-reference" },
    inventoryCandidates: [{
      id: "officeplus-generic-template",
      provider: "officeplus",
      path: path.join(process.cwd(), "officeplus", "generic-template.pptx"),
      name: "generic-template.pptx",
      assetKind: "presentation-template",
      roleTags: ["diagram", "template-layout"]
    }]
  });

  assert.equal(matches.length, 1);
  assert.ok(!matches[0].reasonCodes.some((code) => code.startsWith("structured-layer-")));
});
