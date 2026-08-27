"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  determineCloseLoopStatus,
  ensureDecisionCandidates,
  ensureDecisionReport,
  ensureDecisionShortlist,
  parseArgs,
  runComponentReplacementCloseLoop
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-close-loop");

test("component replacement close loop parses CLI options", () => {
  const args = parseArgs([
    "node",
    "component-replacement-close-loop.js",
    "--input",
    "pptx",
    "--inventory",
    "inventory.json",
    "--out",
    "out",
    "--concurrency",
    "2",
    "--disallow-missing",
    "--decision-report",
    "decision.json",
    "--decision-ir",
    "deck.ir.json",
    "--decision-shortlist",
    "shortlist.json",
    "--decision-candidates",
    "candidates.json",
    "--decision-search-candidates",
    "--decision-candidate-dry-run",
    "--decision-candidate-size",
    "4",
    "--decision-shortlist-max-actions",
    "6",
    "--decision-shortlist-max-actions-per-task",
    "2",
    "--fail-on-decision-gate",
    "--max-decision-actionable-gaps",
    "0",
    "--min-decision-plugin-targets",
    "8",
    "--min-decision-protected-crops",
    "2",
    "--allow-decision-defer"
  ]);

  assert.equal(args.input, "pptx");
  assert.equal(args.inventory, "inventory.json");
  assert.equal(args.out, "out");
  assert.equal(args.concurrency, 2);
  assert.equal(args.allowMissing, false);
  assert.equal(args.decisionReport, "decision.json");
  assert.equal(args.decisionIr, "deck.ir.json");
  assert.equal(args.decisionShortlist, "shortlist.json");
  assert.equal(args.decisionCandidates, "candidates.json");
  assert.equal(args.decisionSearchCandidates, true);
  assert.equal(args.decisionCandidateDryRun, true);
  assert.equal(args.decisionCandidateSize, 4);
  assert.equal(args.decisionShortlistMaxActions, 6);
  assert.equal(args.decisionShortlistMaxActionsPerTask, 2);
  assert.equal(args.failOnDecisionGate, true);
  assert.equal(args.maxDecisionActionableGaps, 0);
  assert.equal(args.minDecisionPluginTargets, 8);
  assert.equal(args.minDecisionProtectedCrops, 2);
  assert.equal(args.allowDecisionDefer, true);
  assert.throws(() => parseArgs(["node", "script"]), /Either --input or --manifest is required/);
});

test("component replacement close loop can generate decision candidates from IR", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-candidates-"));
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const ir = path.join(tmp, "deck.ir.json");
  fs.writeFileSync(ir, JSON.stringify({
    pages: [{
      slideSize: { widthPt: 960, heightPt: 540 },
      images: [],
      shapes: [
        ownerShape("ring", "asset-os-closed-loop-cycle-native-ring", { x: 380, y: 120, w: 260, h: 260 }),
        ownerShape("node-a", "asset-os-closed-loop-cycle-native-node", { x: 390, y: 130, w: 46, h: 46 }),
        ownerShape("node-b", "asset-os-closed-loop-cycle-native-node", { x: 590, y: 130, w: 46, h: 46 }),
        ownerShape("node-c", "asset-os-closed-loop-cycle-native-node", { x: 390, y: 330, w: 46, h: 46 }),
        ownerShape("node-d", "asset-os-closed-loop-cycle-native-node", { x: 590, y: 330, w: 46, h: 46 }),
        ownerShape("route", "asset-os-closed-loop-cycle-native-route", { x: 436, y: 153, w: 154, h: 0 })
      ],
      textBoxes: []
    }]
  }, null, 2));

  const candidates = await ensureDecisionCandidates({
    out,
    decisionIr: ir,
    decisionSearchCandidates: true,
    decisionCandidateDryRun: true,
    decisionCandidateSize: 4
  });

  assert.equal(candidates.generated, true);
  assert.equal(fs.existsSync(candidates.reportFile), true);
  const report = JSON.parse(fs.readFileSync(candidates.reportFile, "utf8"));
  assert.equal(report.layers.length, 1);
  assert.equal(report.layers[0].templateFamily, "cycle-loop");
});

test("component replacement close loop can generate decision shortlist from candidates and harvest queue", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-shortlist-"));
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const candidates = path.join(tmp, "candidates.json");
  const queue = path.join(tmp, "queue.json");
  fs.writeFileSync(candidates, JSON.stringify({
    layers: [{
      shapeLayerId: "p1-flow",
      plan: {
        targetMotifs: ["branch-card-flow", "linear-arrow-chain"],
        structureSignature: { layout: "linear-process", stepCount: 4 }
      },
      bestCandidates: [{
        sourceProvider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-1900",
        title: "渐变风流程箭头元素_4项",
        candidateScore: 90
      }]
    }]
  }, null, 2));
  fs.writeFileSync(queue, JSON.stringify({
    tasks: [{
      id: "officeplus:component:MatlComponentContent-1900",
      provider: "officeplus",
      kind: "component",
      componentId: "MatlComponentContent-1900",
      title: "渐变风流程箭头元素_4项",
      targetMotifs: ["branch-card-flow", "linear-arrow-chain"],
      searchKeywords: ["流程箭头"],
      affectedFiles: [{ slides: [1] }]
    }]
  }, null, 2));

  const shortlist = await ensureDecisionShortlist({
    out,
    decisionCandidates: candidates,
    generatedHarvestQueue: queue,
    decisionShortlistMaxActions: 4,
    decisionShortlistMaxActionsPerTask: 2
  });

  assert.equal(shortlist.generated, true);
  assert.equal(fs.existsSync(shortlist.reportFile), true);
  assert.equal(fs.existsSync(shortlist.markdownFile), true);
  const report = JSON.parse(fs.readFileSync(shortlist.reportFile, "utf8"));
  assert.equal(report.actions[0].id, "MatlComponentContent-1900");
});

test("component replacement close loop can generate decision audit from IR and shortlist", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-decision-audit-"));
  const out = path.join(tmp, "out");
  fs.mkdirSync(out, { recursive: true });
  const ir = path.join(tmp, "deck.native.ir.json");
  const shortlist = path.join(tmp, "shortlist.json");
  fs.writeFileSync(ir, JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      images: [{
        id: "protected-illustration",
        box: { x: 40, y: 120, w: 260, h: 180 },
        source: {
          detector: "illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "screenshot-demo",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }]
    }]
  }, null, 2));
  fs.writeFileSync(shortlist, JSON.stringify({
    actions: [{
      status: "direct-target-candidate",
      slide: 1,
      layerId: "p1-flow",
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-1900",
      title: "渐变风流程箭头元素_4项",
      score: 288,
      action: { searchText: "流程箭头" }
    }]
  }, null, 2));

  const decision = await ensureDecisionReport({
    out,
    decisionIr: ir,
    decisionShortlist: shortlist
  });

  assert.equal(decision.generated, true);
  assert.equal(fs.existsSync(decision.reportFile), true);
  assert.equal(fs.existsSync(decision.markdownFile), true);
  const audit = JSON.parse(fs.readFileSync(decision.reportFile, "utf8"));
  assert.equal(audit.summary.protectedCrops, 1);
  assert.equal(audit.summary.pluginTemplateTargets, 1);
});

test("component replacement close loop reports needs_harvest and writes artifacts", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));

  const report = await runComponentReplacementCloseLoop({
    input,
    inventory,
    engine: "powerpoint",
    out,
    allowMissing: true,
    runner() {
      return Promise.resolve({
        stdout: JSON.stringify({
          operations: [{ Status: "missing_sample", Reason: "operation_not_ready" }],
          summary: { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.status, "needs_harvest");
  assert.equal(report.totals.gaps.missingComponents, 1);
  assert.equal(report.totals.harvestQueue.taskCount, 1);
  assert.equal(fs.existsSync(report.artifacts.batchReport), true);
  assert.equal(fs.existsSync(report.artifacts.sampleGapReport), true);
  assert.equal(fs.existsSync(report.artifacts.harvestQueue), true);
  assert.equal(fs.existsSync(report.artifacts.harvestGuide), true);
  assert.equal(fs.existsSync(report.reportFile), true);
});

test("component replacement close loop embeds graphic reconstruction decision gate", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-decision-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  const decisionReport = path.join(tmp, "decision-report.json");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));
  fs.writeFileSync(decisionReport, JSON.stringify({
    ok: true,
    summary: {
      total: 10,
      actionableNativeGaps: 0,
      pluginTemplateTargets: 8,
      protectedCrops: 2,
      byDecision: {
        "harvest-or-apply-plugin-template": 8,
        "preserve-local-crop": 2
      }
    },
    decisions: [
      { decision: "harvest-or-apply-plugin-template" },
      {
        decision: "preserve-local-crop",
        detector: "decorative-icon-crop",
        layerType: "illustration-zone",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "图标",
        recommendedAction: "preserve-local-crop",
        areaRatio: 0.03,
        reasons: ["protected-icon-illustration-or-screenshot"]
      },
      {
        decision: "preserve-local-crop",
        detector: "screenshot-process-underlay-crop",
        layerType: "screenshot-zone",
        expressionForm: "screenshot-or-document",
        expressionSubtype: "product-screenshot",
        recommendedAction: "preserve-local-crop",
        areaRatio: 0.55,
        reasons: ["protected-icon-illustration-or-screenshot"]
      }
    ]
  }, null, 2));

  const report = await runComponentReplacementCloseLoop({
    input,
    inventory,
    out,
    allowMissing: true,
    decisionReport,
    maxDecisionActionableGaps: 0,
    minDecisionPluginTargets: 8,
    minDecisionProtectedCrops: 2,
    runner() {
      return Promise.resolve({
        stdout: JSON.stringify({
          operations: [{ Status: "missing_sample", Reason: "operation_not_ready" }],
          summary: { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.decisionGate.status, "passed");
  assert.equal(report.totals.decisionGate.pluginTargets, 8);
  assert.equal(fs.existsSync(report.artifacts.decisionGate), true);
});

test("component replacement close loop auto-generates decision audit before gate", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-auto-decision-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  const ir = path.join(tmp, "deck.native.ir.json");
  const shortlist = path.join(tmp, "shortlist.json");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));
  fs.writeFileSync(ir, JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      images: [{
        id: "protected-illustration",
        box: { x: 40, y: 120, w: 260, h: 180 },
        source: {
          detector: "illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "screenshot-demo",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }]
    }]
  }, null, 2));
  fs.writeFileSync(shortlist, JSON.stringify({
    actions: [{
      status: "direct-target-candidate",
      slide: 1,
      layerId: "p1-flow",
      provider: "officeplus",
      kind: "component",
      id: "MatlComponentContent-1900",
      title: "渐变风流程箭头元素_4项",
      score: 288,
      action: { searchText: "流程箭头" }
    }]
  }, null, 2));

  const report = await runComponentReplacementCloseLoop({
    input,
    inventory,
    out,
    allowMissing: true,
    decisionIr: ir,
    decisionShortlist: shortlist,
    minDecisionPluginTargets: 1,
    minDecisionProtectedCrops: 1,
    runner() {
      return Promise.resolve({
        stdout: JSON.stringify({
          operations: [{ Status: "missing_sample", Reason: "operation_not_ready" }],
          summary: { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.decisionGate.status, "passed");
  assert.equal(fs.existsSync(report.artifacts.decisionAudit), true);
  assert.equal(fs.existsSync(report.artifacts.decisionAuditGuide), true);
  assert.equal(fs.existsSync(report.artifacts.decisionGate), true);
});

test("component replacement close loop auto-generates shortlist audit and gate from candidates", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-auto-shortlist-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  const ir = path.join(tmp, "deck.native.ir.json");
  const candidates = path.join(tmp, "candidates.json");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));
  fs.writeFileSync(ir, JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      images: [{
        id: "protected-illustration",
        box: { x: 40, y: 120, w: 260, h: 180 },
        source: {
          detector: "illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "screenshot-demo",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }]
    }]
  }, null, 2));
  fs.writeFileSync(candidates, JSON.stringify({
    layers: [{
      shapeLayerId: "p1-flow",
      plan: {
        targetMotifs: ["branch-card-flow", "linear-arrow-chain"],
        structureSignature: { layout: "linear-process", stepCount: 4 }
      },
      bestCandidates: [{
        sourceProvider: "officeplus",
        kind: "component",
        id: "MatlComponentContent-11189",
        title: "蓝色简约圆通用4项中心总分PPT组件",
        candidateScore: 90
      }]
    }]
  }, null, 2));

  const report = await runComponentReplacementCloseLoop({
    input,
    inventory,
    out,
    allowMissing: true,
    decisionIr: ir,
    decisionCandidates: candidates,
    minDecisionPluginTargets: 1,
    minDecisionProtectedCrops: 1,
    runner() {
      return Promise.resolve({
        stdout: JSON.stringify({
          operations: [{ Status: "missing_sample", Reason: "operation_not_ready" }],
          summary: { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.decisionGate.status, "passed");
  assert.equal(fs.existsSync(report.artifacts.decisionShortlist), true);
  assert.equal(fs.existsSync(report.artifacts.decisionShortlistGuide), true);
  assert.equal(fs.existsSync(report.artifacts.decisionAudit), true);
  assert.equal(fs.existsSync(report.artifacts.decisionGate), true);
});

test("component replacement close loop can search candidates before shortlist audit and gate", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-search-candidates-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  const ir = path.join(tmp, "deck.native.ir.json");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));
  fs.writeFileSync(ir, JSON.stringify({
    slideSize: { widthPt: 960, heightPt: 540 },
    pages: [{
      images: [{
        id: "protected-illustration",
        box: { x: 40, y: 120, w: 260, h: 180 },
        source: {
          detector: "illustration-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: "screenshot-demo",
          recommendedAction: "preserve-local-crop",
          layer: { layerType: "illustration-zone" }
        }
      }],
      shapes: [
        ownerShape("ring", "asset-os-closed-loop-cycle-native-ring", { x: 380, y: 120, w: 260, h: 260 }),
        ownerShape("node-a", "asset-os-closed-loop-cycle-native-node", { x: 390, y: 130, w: 46, h: 46 }),
        ownerShape("node-b", "asset-os-closed-loop-cycle-native-node", { x: 590, y: 130, w: 46, h: 46 }),
        ownerShape("node-c", "asset-os-closed-loop-cycle-native-node", { x: 390, y: 330, w: 46, h: 46 }),
        ownerShape("node-d", "asset-os-closed-loop-cycle-native-node", { x: 590, y: 330, w: 46, h: 46 }),
        ownerShape("route", "asset-os-closed-loop-cycle-native-route", { x: 436, y: 153, w: 154, h: 0 })
      ],
      textBoxes: []
    }]
  }, null, 2));

  const report = await runComponentReplacementCloseLoop({
    input,
    inventory,
    out,
    allowMissing: true,
    decisionIr: ir,
    decisionSearchCandidates: true,
    decisionCandidateDryRun: true,
    minDecisionPluginTargets: 1,
    minDecisionProtectedCrops: 1,
    runner() {
      return Promise.resolve({
        stdout: JSON.stringify({
          operations: [{ Status: "missing_sample", Reason: "operation_not_ready" }],
          summary: { appliedCount: 0, skippedCount: 1, removedShapeCount: 0, clonedShapeCount: 0 }
        }),
        stderr: ""
      });
    },
    skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
  });

  assert.equal(report.decisionGate.status, "passed");
  assert.equal(fs.existsSync(report.artifacts.decisionCandidates), true);
  assert.equal(fs.existsSync(report.artifacts.decisionShortlist), true);
  assert.equal(fs.existsSync(report.artifacts.decisionAudit), true);
  assert.equal(fs.existsSync(report.artifacts.decisionGate), true);
});

test("component replacement close loop can fail on graphic reconstruction decision gate", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slideclone-close-loop-decision-fail-"));
  const input = path.join(tmp, "input");
  const inventory = path.join(tmp, "inventory.json");
  const out = path.join(tmp, "out");
  const decisionReport = path.join(tmp, "decision-report.json");
  fs.mkdirSync(input, { recursive: true });
  writeStoreZip(path.join(input, "deck.pptx"), {
    "[Content_Types].xml": "<Types />",
    "ppt/slides/slide1.xml": slideXml()
  });
  fs.writeFileSync(inventory, JSON.stringify({ components: [] }, null, 2));
  fs.writeFileSync(decisionReport, JSON.stringify({
    ok: false,
    summary: {
      total: 1,
      actionableNativeGaps: 1,
      pluginTemplateTargets: 0,
      protectedCrops: 0,
      byDecision: { "rebuild-native-gap": 1 }
    },
    decisions: [{ decision: "rebuild-native-gap" }]
  }, null, 2));

  await assert.rejects(
    () => runComponentReplacementCloseLoop({
      input,
      inventory,
      out,
      allowMissing: true,
      decisionReport,
      failOnDecisionGate: true,
      runner() {
        return Promise.resolve({
          stdout: JSON.stringify({
            operations: [],
            summary: { appliedCount: 0, skippedCount: 0, removedShapeCount: 0, clonedShapeCount: 0 }
          }),
          stderr: ""
        });
      },
      skillRoot: path.join(__dirname, "..", "skills", "pd-hifi-slideclone")
    }),
    /Graphic reconstruction decision gate failed/
  );
});

test("component replacement close loop status classification is explicit", () => {
  assert.equal(determineCloseLoopStatus({ totals: { failed: 1 } }, { totals: { missingComponents: 0 } }), "failed");
  assert.equal(determineCloseLoopStatus({ totals: { failed: 0 } }, { totals: { missingComponents: 1 } }), "needs_harvest");
  assert.equal(determineCloseLoopStatus({ totals: { failed: 0, appliedCount: 2 } }, { totals: { missingComponents: 0 } }), "applied");
  assert.equal(determineCloseLoopStatus({ totals: { failed: 0, appliedCount: 0 } }, { totals: { missingComponents: 0 } }), "ready_to_apply");
});

function slideXml() {
  return `
    <p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
      <p:cSld><p:spTree>
        <p:sp><p:nvSpPr><p:cNvPr id="2" name="replacement-card" descr="slideclone:componentReplacementPlan provider=officeplus kind=component id=MatlComponentContent-11189 layer=0:0 tier=strong score=96" /></p:nvSpPr></p:sp>
      </p:spTree></p:cSld>
    </p:sld>
  `;
}

function ownerShape(id, detector, box, ownerId = "asset-os-closed-loop-cycle-native-component", ownerKind = "asset-os-closed-loop-cycle") {
  return {
    id,
    type: "shape",
    box,
    source: {
      detector,
      nativeRebuild: true,
      editable: true,
      componentOwnerId: ownerId,
      componentOwnerKind: ownerKind
    }
  };
}

function writeStoreZip(file, entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name, "utf8");
    const data = Buffer.from(content, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 10);
    local.writeUInt32LE(0, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuffer, data);
    const item = Buffer.alloc(46);
    item.writeUInt32LE(0x02014b50, 0);
    item.writeUInt16LE(20, 4);
    item.writeUInt16LE(20, 6);
    item.writeUInt16LE(0, 8);
    item.writeUInt16LE(0, 10);
    item.writeUInt32LE(0, 12);
    item.writeUInt32LE(0, 16);
    item.writeUInt32LE(data.length, 20);
    item.writeUInt32LE(data.length, 24);
    item.writeUInt16LE(nameBuffer.length, 28);
    item.writeUInt16LE(0, 30);
    item.writeUInt16LE(0, 32);
    item.writeUInt32LE(0, 34);
    item.writeUInt32LE(0, 38);
    item.writeUInt32LE(offset, 42);
    central.push(item, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralStart = offset;
  const centralBuffer = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(centralStart, 16);
  end.writeUInt16LE(0, 20);
  fs.writeFileSync(file, Buffer.concat([...chunks, centralBuffer, end]));
}
