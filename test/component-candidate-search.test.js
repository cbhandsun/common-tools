"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  loadDiagramUnderstanding,
  parseArgs,
  searchIrComponentCandidates,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-candidate-search");

test("IR component candidate search includes native semantic cycle shape groups", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-candidate-ir-"));
  const irFile = path.join(tmp, "deck.ir.json");
  fs.writeFileSync(irFile, JSON.stringify({
    pages: [{
      slideSize: { widthPt: 960, heightPt: 540 },
      images: [],
      shapes: [
        shape("left-ring", "semantic-cycle-native-ring", { x: 240, y: 130, w: 220, h: 260 }),
        shape("right-ring", "semantic-cycle-native-ring", { x: 430, y: 130, w: 220, h: 260 }),
        shape("doc-node", "semantic-cycle-native-node", { x: 250, y: 130, w: 60, h: 60 }),
        shape("manual-node", "semantic-cycle-native-node", { x: 250, y: 330, w: 60, h: 60 }),
        shape("dom-node", "semantic-cycle-native-node", { x: 595, y: 130, w: 60, h: 60 }),
        shape("prototype-node", "semantic-cycle-native-node", { x: 595, y: 330, w: 60, h: 60 })
      ],
      textBoxes: [
        { id: "dom", text: "DOM 语义 精准克隆", box: { x: 540, y: 210, w: 120, h: 40 } },
        { id: "prototype", text: "所见即所得的交互原型", box: { x: 500, y: 310, w: 160, h: 40 } }
      ]
    }]
  }), "utf8");

  const report = await searchIrComponentCandidates({ ir: irFile, dryRun: true, size: 6 });

  assert.equal(report.layers.length, 1);
  assert.equal(report.layers[0].detector, "semantic-cycle-native-shape-group");
  assert.equal(report.layers[0].templateFamily, "cycle-loop");
  assert.deepEqual(report.layers[0].plan.targetMotifs, ["arc-arrow", "ring-node"]);
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "圆弧箭头"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "环形节点"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "闭环流程"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "环形箭头"));
});

test("IR component candidate search includes native component owner shape groups", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-owner-candidate-ir-"));
  const irFile = path.join(tmp, "deck.ir.json");
  fs.writeFileSync(irFile, JSON.stringify({
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
      textBoxes: [
        {
          id: "closed-loop-label",
          text: "资产提炼闭环",
          box: { x: 440, y: 230, w: 120, h: 32 },
          source: { componentOwnerId: "asset-os-closed-loop-cycle-native-component" }
        }
      ]
    }]
  }), "utf8");

  const report = await searchIrComponentCandidates({ ir: irFile, dryRun: true, size: 6 });

  assert.equal(report.layers.length, 1);
  assert.equal(report.layers[0].detector, "native-component-owner-shape-group");
  assert.equal(report.layers[0].componentOwnerId, "asset-os-closed-loop-cycle-native-component");
  assert.equal(report.layers[0].templateFamily, "cycle-loop");
  assert.equal(report.layers[0].plan.structureSignature.layout, "cycle-loop");
  assert.equal(report.layers[0].plan.structureSignature.stepCount, 4);
  assert.deepEqual(report.layers[0].plan.targetMotifs, ["arc-arrow", "ring-node", "whole-process-template"]);
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "4项循环"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "四项循环箭头"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "圆弧箭头"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "环形节点"));
});

test("IR component candidate search preserves process owner step-count signatures", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "component-owner-process-candidate-ir-"));
  const irFile = path.join(tmp, "deck.ir.json");
  fs.writeFileSync(irFile, JSON.stringify({
    pages: [{
      slideSize: { widthPt: 960, heightPt: 540 },
      images: [],
      shapes: [
        ownerShape("input-a", "asset-os-demand-understanding-native-input-note", { x: 80, y: 120, w: 70, h: 48 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("input-b", "asset-os-demand-understanding-native-input-note", { x: 80, y: 190, w: 70, h: 48 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("input-c", "asset-os-demand-understanding-native-input-note", { x: 80, y: 260, w: 70, h: 48 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("input-d", "asset-os-demand-understanding-native-input-note", { x: 80, y: 330, w: 70, h: 48 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("skill", "asset-os-demand-understanding-native-skill-card", { x: 390, y: 220, w: 150, h: 92 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("output-a", "asset-os-demand-understanding-native-output-card", { x: 710, y: 150, w: 100, h: 42 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("output-b", "asset-os-demand-understanding-native-output-card", { x: 710, y: 235, w: 100, h: 42 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant"),
        ownerShape("output-c", "asset-os-demand-understanding-native-output-card", { x: 710, y: 320, w: 100, h: 42 }, "asset-os-demand-understanding-native-component", "demand-understanding-assistant")
      ],
      textBoxes: []
    }]
  }), "utf8");

  const report = await searchIrComponentCandidates({ ir: irFile, dryRun: true, size: 8 });

  assert.equal(report.layers.length, 1);
  assert.equal(report.layers[0].templateFamily, "process-chain");
  assert.equal(report.layers[0].plan.structureSignature.layout, "linear-process");
  assert.equal(report.layers[0].plan.structureSignature.stepCount, 4);
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "4项流程"));
  assert.ok(report.layers[0].plan.queries.some((query) => query.keywords === "四项箭头流程"));
});

test("candidate search CLI can seed explicit target motifs", () => {
  const args = parseArgs([
    "node",
    "component-candidate-search.js",
    "--target-motifs",
    "arc-arrow,tree-link",
    "--keywords",
    "循环关系"
  ]);
  const diagramUnderstanding = loadDiagramUnderstanding(args);

  assert.deepEqual(diagramUnderstanding.targetMotifs, ["arc-arrow", "tree-link"]);
  assert.deepEqual(diagramUnderstanding.componentStrategy.targetMotifs, ["arc-arrow", "tree-link"]);
});

test("IR component candidate search deduplicates repeated query hits by provider kind and id", () => {
  const best = _private.bestCandidateDocuments([
    {
      query: { provider: "officeplus", kind: "component" },
      documents: [
        { id: "MatlComponentContent-1900", title: "渐变风流程箭头元素_4项", candidateScore: 72 },
        { id: "MatlComponentContent-3611", title: "渐变4项流程箭头", candidateScore: 90 }
      ]
    },
    {
      query: { provider: "officeplus", kind: "component" },
      documents: [
        { id: "MatlComponentContent-1900", title: "渐变风流程箭头元素_4项", candidateScore: 90 }
      ]
    }
  ], 8);

  assert.equal(best.length, 2);
  assert.equal(best[0].candidateScore, 90);
  assert.equal(best.filter((item) => item.id === "MatlComponentContent-1900").length, 1);
});

function shape(id, detector, box) {
  return {
    id,
    type: "ellipse",
    box,
    source: {
      detector,
      nativeRebuild: true,
      editable: true
    }
  };
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
