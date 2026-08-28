"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { normalizeVisual } = require("../packages/ppt-create-core/data-models");
const { createDeckIr } = require("../packages/ppt-create-core/layout");
const { planSemanticAnalysis } = require("../packages/ppt-create-core/semantic-components");
const { buildSemanticOfficeSpec, newWorkspaceOutput } = require("../scripts/ppt-create-office-smoke");

const bounds = Object.freeze({ x: 56, y: 194, w: 848, h: 274 });
function entries(count = 4) { return Array.from({ length: count }, (_, index) => ({ id: `n${index + 1}`, label: `Node ${index + 1}`, detail: `Detail ${index + 1}` })); }
function visual(model, count = 4, links) { return normalizeVisual({ kind: "analysis", model, entries: entries(count), ...(links ? { links } : {}) }, `${model} visual`); }
function matrixVisual() { return normalizeVisual({ kind: "analysis", model: "quadrant", entries: entries(4).map((entry, index) => ({ ...entry, group: `q${index + 1}` })) }, "matrix visual"); }

test("semantic analysis planner produces distinct deterministic geometries within the editable canvas", () => {
  const plans = [
    planSemanticAnalysis(matrixVisual(), bounds),
    planSemanticAnalysis(visual("funnel", 5), bounds),
    planSemanticAnalysis(visual("timeline", 4), bounds),
    planSemanticAnalysis(visual("org-chart", 4, [{ id: "l1", from: "n1", to: "n2" }, { id: "l2", from: "n1", to: "n3" }, { id: "l3", from: "n1", to: "n4" }]), bounds),
    planSemanticAnalysis(visual("network", 4, [{ id: "l1", from: "n1", to: "n2" }]), bounds)
  ];
  assert.deepEqual(plans.map((plan) => plan.component), ["matrix", "funnel", "timeline", "hierarchy", "graph"]);
  for (const plan of plans) for (const node of plan.nodes) {
    assert.ok(node.box.x >= bounds.x && node.box.y >= bounds.y);
    assert.ok(node.box.x + node.box.w <= bounds.x + bounds.w + 0.001);
    assert.ok(node.box.y + node.box.h <= bounds.y + bounds.h + 0.001);
  }
  assert.equal(JSON.stringify(planSemanticAnalysis(visual("funnel", 5), bounds)), JSON.stringify(plans[1]));
  assert.ok(plans[1].nodes[0].box.w > plans[1].nodes.at(-1).box.w);
  assert.throws(() => planSemanticAnalysis({ kind: "analysis", model: "unknown", entries: entries(2) }, bounds), /input/);
  assert.throws(() => planSemanticAnalysis({ kind: "analysis", model: "network", entries: entries(2), links: [{ id: "bad", from: "n1", to: "missing" }] }, bounds), /links/);
});

test("scheduled Office smoke fixture covers native semantic component families", () => {
  const ir = createDeckIr(buildSemanticOfficeSpec());
  assert.equal(ir.pages.length, 5);
  assert.deepEqual(ir.pages.slice(1).map((page) => page.semanticComponents[0].kind), ["matrix", "funnel", "timeline", "hierarchy"]);
  assert.ok(ir.pages.slice(1).every((page) => page.images.length === 0 && page.shapes.length > 0 && page.textBoxes.length > 0));
  assert.throws(() => newWorkspaceOutput(process.cwd(), process.cwd()), /workspace child/);
  assert.throws(() => newWorkspaceOutput(process.cwd(), path.resolve(process.cwd(), "..", "outside-smoke")), /workspace child/);
});

test("analysis canvas persists semantic component identity while keeping native editable objects", () => {
  const spec = { version: "1.0", title: "Semantic deck", theme: "clean-light-v1", seed: "semantic-test", slides: [
    { id: "cover", role: "cover", title: "Semantic deck" },
    { id: "funnel", role: "content", title: "Conversion", layout: "analysis-canvas-v1", items: [{ id: "takeaway", label: "Improve conversion" }], visual: { kind: "analysis", model: "funnel", entries: entries(4) } }
  ] };
  const page = createDeckIr(spec).pages[1];
  assert.equal(page.semanticComponents[0].kind, "funnel");
  assert.equal(page.semanticComponents[0].model, "funnel");
  assert.equal(page.shapes.filter((shape) => shape.id.endsWith("-analysis")).length, 4);
  assert.equal(page.images.length, 0);
});

test("roadmap, gantt, architecture and deep hierarchy keep distinct native geometry", () => {
  const roadmap = planSemanticAnalysis(visual("roadmap", 5), bounds);
  const gantt = planSemanticAnalysis(visual("gantt", 5), bounds);
  const architecture = planSemanticAnalysis(visual("architecture", 4, [{ id: "a1", from: "n1", to: "n2" }, { id: "a2", from: "n2", to: "n3" }, { id: "a3", from: "n3", to: "n4" }]), bounds);
  const hierarchy = planSemanticAnalysis(visual("decision-tree", 4, [{ id: "h1", from: "n1", to: "n2" }, { id: "h2", from: "n2", to: "n3" }, { id: "h3", from: "n3", to: "n4" }]), bounds);
  assert.deepEqual([roadmap.component, gantt.component, architecture.component, hierarchy.component], ["roadmap", "gantt", "architecture", "hierarchy"]);
  assert.notDeepEqual(roadmap.nodes.map((node) => node.box), gantt.nodes.map((node) => node.box));
  assert.equal(new Set(hierarchy.nodes.map((node) => node.box.y)).size, 4);
  assert.equal(new Set(architecture.nodes.map((node) => node.box.x)).size, 4);
});
