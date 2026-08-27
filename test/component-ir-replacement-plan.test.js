"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  buildComponentIrReplacementPlan,
  findComponentSample,
  findTargetImage,
  inferTargetStructureProfile,
  isCandidateStructureCompatible,
  parseArgs,
  renderMarkdown
} = require("../skills/pd-hifi-slideclone/scripts/component-ir-replacement-plan");

test("component IR replacement plan parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-ir-replacement-plan.js",
    "--harvest-queue",
    "queue.json",
    "--ir-dir",
    "ir",
    "--inventory",
    "inventory.json",
    "--out",
    "plan.json",
    "--markdown-out",
    "plan.md",
    "--fail-on-missing-targets"
  ]);

  assert.equal(args.harvestQueue, "queue.json");
  assert.equal(args.irDir, "ir");
  assert.equal(args.inventory, "inventory.json");
  assert.equal(args.out, "plan.json");
  assert.equal(args.markdownOut, "plan.md");
  assert.equal(args.failOnMissingTargets, true);
});

test("component IR replacement plan resolves harvest queue targets to IR image boxes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, `${JSON.stringify(makeQueue())}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir });

  assert.equal(plan.summary.operationCount, 2);
  assert.equal(plan.summary.pendingSample, 1);
  assert.equal(plan.summary.missingTarget, 1);
  assert.equal(plan.operations[0].status, "pending_sample");
  assert.deepEqual(plan.operations[0].targetBox, { x: 10, y: 20, w: 300, h: 120 });
  assert.equal(plan.operations[1].status, "missing_target");
  assert.ok(plan.operations[1].missing.includes("target-image-not-found"));
});

test("component IR replacement plan can fail when harvest queue targets are missing from IR", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-missing-target-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, `${JSON.stringify({
    tasks: [{
      provider: "officeplus",
      kind: "component",
      componentId: "repair:Deck_A:p1:missing-flow:officeplus:component:card-grid",
      affectedTargets: [{
        deck: "Deck_A",
        slide: 1,
        imageId: "missing-flow",
        imageIndex: 9,
        layerKey: "Deck_A:p1:missing-flow"
      }]
    }]
  })}\n`, "utf8");

  assert.throws(
    () => buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, failOnMissingTargets: true }),
    /Missing IR targets for 1 replacement operation/
  );
});

test("component IR replacement plan marks operations ready when matching sample exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-ready-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  const inventoryFile = path.join(dir, "inventory.json");
  fs.writeFileSync(queueFile, `${JSON.stringify({
    ...makeQueue(),
    tasks: [makeQueue().tasks[0]]
  })}\n`, "utf8");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    candidates: [{
      id: "MatlComponentContent-11617",
      provider: "officeplus",
      path: path.join(dir, "component.pptx"),
      assetKind: "presentation-template",
      roleTags: ["applied-component"],
      structureSignature: { motifs: ["linear-arrow-chain"] }
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.matchScore >= 100, true);
});

test("component IR replacement plan rejects undersized matrix component samples", () => {
  const target = inferTargetStructureProfile({
    source: {
      detector: "comparison-matrix-crop",
      expressionForm: "table-or-matrix",
      layer: {
        layerType: "table-zone",
        diagramUnderstanding: { archetype: "matrix-or-grid", visualNodeCount: 9 }
      }
    }
  });
  const fourCardSample = {
    provider: "islide",
    path: path.join(process.cwd(), "four-card-matrix.pptx"),
    assetKind: "presentation-template",
    structureSignature: { primaryKind: "matrix", motifs: ["card-grid"] },
    learningSummary: { componentCatalog: [{ structure: { kind: "matrix", nodeCount: 4 } }] }
  };
  const eightCardSample = {
    ...fourCardSample,
    learningSummary: { componentCatalog: [{ structure: { kind: "matrix", nodeCount: 8 } }] }
  };

  assert.deepEqual(target, { family: "matrix", nodeCount: 9 });
  assert.deepEqual(inferTargetStructureProfile({
    source: {
      expressionForm: "table-or-matrix",
      layer: { diagramUnderstanding: { archetype: "matrix-or-grid", visualNodeCount: 0, nodeCount: 10 } }
    }
  }), { family: "matrix", nodeCount: 10 });
  assert.equal(isCandidateStructureCompatible(fourCardSample, target), false);
  assert.equal(isCandidateStructureCompatible(eightCardSample, target), true);
  assert.equal(findComponentSample({ provider: "islide", targetMotifs: ["card-grid"], targetStructureProfile: target }, {
    candidates: [fourCardSample]
  }), null);
  assert.ok(findComponentSample({ provider: "islide", targetMotifs: ["card-grid"], targetStructureProfile: target }, {
    candidates: [eightCardSample]
  }));
});

test("component IR replacement plan keeps learned cycle arrows and matrices structurally isolated", () => {
  const cycleArrow = {
    provider: "islide",
    path: path.join(process.cwd(), "cycle-arrow.pptx"),
    assetKind: "presentation-template",
    structureSignature: { primaryKind: "cycle-loop", motifs: ["arc-arrow"] },
    learningSummary: { componentCatalog: [{ structure: { kind: "cycle-loop", nodeCount: 4 } }] }
  };
  const matrix = {
    ...cycleArrow,
    path: path.join(process.cwd(), "matrix.pptx"),
    structureSignature: { primaryKind: "matrix", motifs: ["card-grid"] },
    learningSummary: { componentCatalog: [{ structure: { kind: "matrix", nodeCount: 4 } }] }
  };

  assert.deepEqual(inferTargetStructureProfile({
    source: { expressionForm: "diagram", expressionSubtype: "循环圆弧箭头" }
  }), { family: "cycle-loop", nodeCount: 0 });
  assert.equal(isCandidateStructureCompatible(cycleArrow, { family: "matrix", nodeCount: 4 }), false);
  assert.equal(isCandidateStructureCompatible(matrix, { family: "cycle-loop", nodeCount: 4 }), false);
  assert.equal(isCandidateStructureCompatible(cycleArrow, { family: "cycle-loop", nodeCount: 4 }), true);
  assert.equal(isCandidateStructureCompatible(matrix, { family: "matrix", nodeCount: 4 }), true);
});

test("component IR replacement plan isolates learned process, timeline, and relationship components", () => {
  const process = {
    structureSignature: { primaryKind: "process-chain" },
    learningSummary: { componentCatalog: [{ structure: { kind: "process-chain", nodeCount: 4 } }] }
  };
  const timeline = {
    structureSignature: { primaryKind: "timeline" },
    learningSummary: { componentCatalog: [{ structure: { kind: "timeline", nodeCount: 4 } }] }
  };
  const relationship = {
    structureSignature: { primaryKind: "hub-spoke" },
    learningSummary: { componentCatalog: [{ structure: { kind: "hub-spoke", nodeCount: 5 } }] }
  };

  assert.deepEqual(inferTargetStructureProfile({ source: { expressionForm: "关系图" } }), { family: "hub-spoke", nodeCount: 0 });
  assert.deepEqual(inferTargetStructureProfile({ source: { expressionForm: "时间轴里程碑" } }), { family: "timeline", nodeCount: 0 });
  assert.deepEqual(inferTargetStructureProfile({ source: { expressionForm: "业务流程图" } }), { family: "process-chain", nodeCount: 0 });
  assert.equal(isCandidateStructureCompatible(process, { family: "hub-spoke" }), false);
  assert.equal(isCandidateStructureCompatible(timeline, { family: "process-chain" }), false);
  assert.equal(isCandidateStructureCompatible(relationship, { family: "hub-spoke" }), true);
});

test("component IR replacement plan blocks non-semantic visual unit targets even when sample exists", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-non-semantic-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify({
    pages: [{
      images: [{
        id: "plugin-arrow-preview",
        box: { x: 20, y: 30, w: 180, h: 120 },
        source: {
          detector: "component-preview-illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "圆弧箭头 图示样例",
          componentRenderStrategy: {
            expressionPolicy: {
              kind: "standalone-visual-asset",
              minimumUnitPolicy: "preserve-as-single-crop",
              unitDisposition: "intentional-visual-crop"
            }
          }
        }
      }]
    }]
  })}\n`, "utf8");
  const componentId = "repair:Deck_A:p1:plugin-arrow-preview:officeplus:component:arc-arrow";
  const queueFile = path.join(dir, "queue.json");
  fs.writeFileSync(queueFile, `${JSON.stringify({
    tasks: [{
      provider: "officeplus",
      kind: "component",
      componentId,
      title: "圆弧箭头组件",
      targetMotifs: ["arc-arrow"],
      affectedTargets: [{
        deck: "Deck_A",
        slide: 1,
        imageId: "plugin-arrow-preview",
        imageIndex: 0,
        layerKey: "Deck_A:p1:plugin-arrow-preview"
      }]
    }]
  })}\n`, "utf8");
  const inventoryFile = path.join(dir, "inventory.json");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    candidates: [{
      id: componentId,
      provider: "officeplus",
      path: path.join(dir, "arc-arrow.pptx"),
      assetKind: "presentation-template",
      queueBinding: {
        componentId,
        targetMotifs: ["arc-arrow"],
        compatibility: { compatible: true, reason: "queue-bound" }
      }
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.summary.ready, 0);
  assert.equal(plan.summary.blockedNonSemanticTarget, 1);
  assert.equal(plan.operations[0].status, "blocked_non_semantic_target");
  assert.equal(plan.operations[0].sourceImage.unitDisposition, "intentional-visual-crop");
  assert.ok(plan.operations[0].missing.includes("non-semantic-target:intentional-visual-crop"));
  assert.equal(plan.operations[0].sample.queueBinding.componentId, componentId);
  assert.equal(plan.operations[0].nextAction, null);
});

test("component IR replacement plan prefers queue-bound aliases for repair coverage samples", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-queue-bound-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  const inventoryFile = path.join(dir, "inventory.json");
  const componentId = "repair:Deck_A:p1:native-flow:officeplus:component:card-grid";
  fs.writeFileSync(queueFile, `${JSON.stringify({
    tasks: [{
      provider: "officeplus",
      kind: "component",
      componentId,
      title: "卡片矩阵",
      targetMotifs: ["card-grid"],
      affectedTargets: [makeQueue().tasks[0].affectedTargets[0]]
    }]
  })}\n`, "utf8");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    candidates: [{
      id: componentId,
      provider: "officeplus",
      path: path.join(dir, "queue-bound-component.pptx"),
      assetKind: "presentation-template",
      roleTags: ["queue-bound-component-sample"],
      queueBinding: {
        componentId,
        title: "卡片矩阵",
        targetMotifs: ["card-grid"],
        compatibility: { compatible: true, reason: "motif-overlap" }
      }
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.queueBinding.componentId, componentId);
  assert.equal(plan.operations[0].sample.matchScore >= 140, true);
});

test("component IR replacement plan uses queue binding when harvested alias id is sanitized", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-sanitized-alias-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  const inventoryFile = path.join(dir, "inventory.json");
  const componentId = "repair:Deck_A:p1:native-flow:islide:smartdiagram:cycle-arrow";
  fs.writeFileSync(queueFile, `${JSON.stringify({
    tasks: [{
      provider: "islide",
      kind: "smartdiagram",
      componentId,
      title: "环形箭头",
      targetMotifs: ["cycle-arrow"],
      affectedTargets: [makeQueue().tasks[0].affectedTargets[0]]
    }]
  })}\n`, "utf8");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    candidates: [{
      id: "repair-Deck-A-p1-native-flow-islide-smartdiagram",
      provider: "islide",
      path: path.join(dir, "downloaded-component.pptx"),
      assetKind: "presentation-template",
      roleTags: ["queue-bound-component-sample"],
      queueBinding: {
        componentId,
        targetMotifs: ["cycle-arrow"],
        compatibility: { compatible: true, reason: "queue-bound" }
      }
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.provider, "islide");
  assert.equal(plan.operations[0].sample.queueBinding.componentId, componentId);
});

test("component IR replacement plan matches cycle-arrow queues to arc-arrow learned samples", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-cycle-alias-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  const inventoryFile = path.join(dir, "inventory.json");
  fs.writeFileSync(queueFile, `${JSON.stringify({
    tasks: [{
      provider: "islide",
      kind: "smartdiagram",
      componentId: "repair:Deck_A:p1:native-flow:islide:smartdiagram:cycle-arrow",
      title: "环形箭头",
      targetMotifs: ["cycle-arrow"],
      affectedTargets: [makeQueue().tasks[0].affectedTargets[0]]
    }]
  })}\n`, "utf8");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    candidates: [{
      id: "islide-applied-arc-arrow",
      provider: "islide",
      path: path.join(dir, "arc-arrow.pptx"),
      assetKind: "presentation-template",
      roleTags: ["applied-component"],
      structureSignature: {
        primaryKind: "cycle-loop",
        primaryMotif: "arc-arrow",
        motifs: ["arc-arrow"]
      }
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.summary.ready, 1);
  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.structureSignature.primaryMotif, "arc-arrow");
});

test("component IR replacement plan permits explicit motif evidence to repair stale target family metadata", () => {
  const cycleArrow = {
    provider: "islide",
    path: path.join(process.cwd(), "cycle-arrow.pptx"),
    assetKind: "presentation-template",
    structureSignature: { primaryKind: "cycle-loop", primaryMotif: "arc-arrow", motifs: ["arc-arrow"] },
    learningSummary: { componentCatalog: [{ structure: { kind: "cycle-loop", nodeCount: 4 } }] }
  };
  const result = findComponentSample({
    provider: "islide",
    targetMotifs: ["cycle-arrow"],
    targetStructureProfile: { family: "process-chain", nodeCount: 4 }
  }, { candidates: [cycleArrow] });

  assert.ok(result);
  assert.equal(result.structureSignature.primaryKind, "cycle-loop");
});

test("component IR replacement plan does not mark provider-only samples ready", () => {
  const sample = findComponentSample({
    provider: "islide",
    componentId: "repair:Deck_A:p1:native-flow:islide:smartdiagram:cycle-arrow",
    targetMotifs: ["cycle-arrow"]
  }, {
    candidates: [{
      id: "unrelated-islide-component",
      provider: "islide",
      name: "generic-component.pptx",
      roleTags: ["applied-component"]
    }]
  });

  assert.equal(sample, null);
});

test("component IR replacement plan rejects motif-only samples from the wrong provider", () => {
  const sample = findComponentSample({
    provider: "islide",
    componentId: "repair:Deck_A:p1:native-flow:islide:smartdiagram:card-grid",
    targetMotifs: ["card-grid"]
  }, {
    candidates: [{
      id: "office-timeline-demo",
      provider: "office-timeline",
      name: "Expert Edition Demo Timeline.pptx",
      roleTags: ["template-layout"],
      structureSignature: { motifs: ["card-grid"] }
    }]
  });

  assert.equal(sample, null);
});

test("component IR replacement plan carries recommended component groups from asset manifest", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "component-ir-plan-group-"));
  const irDir = path.join(dir, "ir");
  fs.mkdirSync(irDir, { recursive: true });
  fs.writeFileSync(path.join(irDir, "Deck_A.native.ir.json"), `${JSON.stringify(makeIr())}\n`, "utf8");
  const queueFile = path.join(dir, "queue.json");
  const inventoryFile = path.join(dir, "component-asset-manifest.json");
  fs.writeFileSync(queueFile, `${JSON.stringify({
    ...makeQueue(),
    tasks: [makeQueue().tasks[0]]
  })}\n`, "utf8");
  fs.writeFileSync(inventoryFile, `${JSON.stringify({
    layers: [{
      layerKey: "Deck_A:p1:native-flow",
      templateFamily: "process-chain",
      readiness: { targetMotifs: ["linear-arrow-chain"] },
      localAssets: [{
        id: "officeplus-process-template",
        provider: "officeplus",
        path: path.join(dir, "process-template.pptx"),
        assetKind: "presentation-template",
        roleTags: ["applied-component", "template-layout"],
        structureSignature: { primaryKind: "process-chain", motifs: ["linear-arrow-chain"] },
        recommendedComponentGroups: [{
          id: "slide1-process-group",
          name: "Process Group",
          slide: 1,
          groupIndex: 2,
          matchScore: 91,
          componentScore: 84,
          structure: {
            kind: "process-chain",
            motifs: ["linear-arrow-chain"],
            motifCounts: { "linear-arrow-chain": 6 }
          },
          reuseReadiness: { level: "high", score: 90 }
        }]
      }]
    }]
  })}\n`, "utf8");

  const plan = buildComponentIrReplacementPlan({ harvestQueue: queueFile, irDir, inventory: inventoryFile });

  assert.equal(plan.operations[0].status, "ready");
  assert.equal(plan.operations[0].sample.recommendedGroup.id, "slide1-process-group");
  assert.equal(plan.operations[0].sample.recommendedGroup.matchScore, 91);
  assert.equal(plan.operations[0].sample.manifestLayerKey, "Deck_A:p1:native-flow");
  assert.ok(plan.operations[0].sample.matchScore > 100);
});

test("component IR replacement helpers find images and component samples", () => {
  const ir = makeIr();
  assert.equal(findTargetImage(ir, { slide: 1, imageId: "native-flow" }).box.w, 300);
  assert.equal(findTargetImage(ir, { slide: 1, imageId: "missing", imageIndex: 0 }).id, "native-flow");

  const sample = findComponentSample({
    provider: "officeplus",
    componentId: "MatlComponentContent-11617",
    targetMotifs: ["linear-arrow-chain"]
  }, {
    candidates: [{
      id: "other",
      provider: "officeplus",
      name: "MatlComponentContent-11617.pptx",
      roleTags: ["applied-component"]
    }]
  });
  assert.equal(sample.name, "MatlComponentContent-11617.pptx");
});

test("component IR replacement markdown summarizes operations", () => {
  const markdown = renderMarkdown({
    summary: {
      taskCount: 1,
      operationCount: 1,
      ready: 0,
      pendingSample: 1,
      missingTarget: 0
    },
    operations: [{
      status: "pending_sample",
      deck: "Deck_A",
      slide: 1,
      imageId: "native-flow",
      component: { componentId: "MatlComponentContent-11617" },
      targetBox: { w: 300, h: 120 }
    }]
  });

  assert.match(markdown, /Component IR Replacement Plan/);
  assert.match(markdown, /pending_sample: Deck_A p1 native-flow/);
});

function makeIr() {
  return {
    pages: [{
      images: [{
        id: "native-flow",
        box: { x: 10, y: 20, w: 300, h: 120 },
        source: {
          detector: "foreground-graphic-crop",
          expressionForm: "complex-diagram",
          expressionSubtype: "route-chain-diagram"
        }
      }]
    }]
  };
}

function makeQueue() {
  return {
    tasks: [{
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-11617",
      title: "渐变6项流程",
      targetMotifs: ["linear-arrow-chain"],
      searchKeywords: ["流程 箭头 组件"],
      harvestCommand: "node harvest",
      workflow: ["apply"],
      affectedTargets: [{
        deck: "Deck_A",
        slide: 1,
        imageId: "native-flow",
        imageIndex: 0,
        layerKey: "Deck_A:p1:native-flow"
      }, {
        deck: "Deck_A",
        slide: 1,
        imageId: "missing-flow",
        imageIndex: 9,
        layerKey: "Deck_A:p1:missing-flow"
      }]
    }]
  };
}
