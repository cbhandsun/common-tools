"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizeVisual } = require("../packages/ppt-create-core/data-models");
const { createDeckIr } = require("../packages/ppt-create-core/layout");

function diagram(model = "architecture") {
  return { kind: "analysis", model, entries: [{ id: "client", label: "客户端" }, { id: "gateway", label: "网关" }, { id: "service", label: "服务" }], links: [{ id: "client-gateway", from: "client", to: "gateway" }, { id: "gateway-service", from: "gateway", to: "service", label: "路由" }] };
}

test("native semantic visuals cover architecture, org, network, decision, roadmap and gantt families", () => {
  for (const model of ["architecture", "org-chart", "network", "decision-tree", "roadmap"]) assert.equal(normalizeVisual(diagram(model), "visual").model, model);
  assert.equal(normalizeVisual({ kind: "analysis", model: "gantt", entries: [{ id: "a", label: "设计" }, { id: "b", label: "开发" }] }, "visual").model, "gantt");
  assert.throws(() => normalizeVisual({ ...diagram(), links: [{ id: "bad", from: "client", to: "missing" }] }, "visual"), /link/u);
});

test("relational semantic visuals emit native connectors before editable nodes", () => {
  const ir = createDeckIr({ version: "1.0", title: "系统架构", slides: [{ id: "cover", role: "cover", title: "系统架构" }, { id: "architecture", role: "content", title: "目标架构", items: [{ id: "fact", label: "分层解耦" }], visual: diagram() }] }); const page = ir.pages[1];
  assert.equal(page.images.length, 0); assert.equal(page.shapes.filter((shape) => shape.id.endsWith("-connector")).length, 2); assert.ok(page.shapes.findIndex((shape) => shape.id.endsWith("-connector")) < page.shapes.findIndex((shape) => shape.id.endsWith("-node")));
});
