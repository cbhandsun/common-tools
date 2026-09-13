"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  buildHorizontalStepsLayout,
  buildMetricCardsLayout
} = require("../packages/slideclone-core/declarative-layout-rebuilder");

test("buildHorizontalStepsLayout generates cards, badges, connectors, and text", () => {
  const steps = [
    { title: "需求调研", body: "收集业务痛点与目标", badge: "01" },
    { title: "方案架构", body: "设计微内核与插件体系", badge: "02" },
    { title: "工程落地", body: "端到端自动化验证", badge: "03" }
  ];

  const bounds = { x: 50, y: 100, w: 600, h: 200 };
  const result = buildHorizontalStepsLayout(steps, bounds, { gridSnap: 5 });

  assert.equal(result.shapes.length, 3 + 3 + 2); // 3 cards + 3 circle badges + 2 connectors
  assert.equal(result.textBoxes.length, 3 * 3); // 3 badges + 3 titles + 3 bodies

  // Verify coordinates are snapped to gridSnap (multiple of 5)
  for (const shape of result.shapes) {
    if (shape.x != null) assert.equal(shape.x % 5, 0);
    if (shape.y != null) assert.equal(shape.y % 5, 0);
  }

  // Connectors link adjacent cards
  const connectors = result.shapes.filter((s) => s.type === "connector_line");
  assert.equal(connectors.length, 2);
});

test("buildMetricCardsLayout generates KPI cards with big values and auto-scaled fonts", () => {
  const kpis = [
    { title: "自动化率", body: "99.8%", subtitle: "同比提升 15%" },
    { title: "总吞吐量", body: "1,250,000 req/s", subtitle: "峰值达 2.4M" }
  ];

  const bounds = { x: 50, y: 50, w: 400, h: 150 };
  const result = buildMetricCardsLayout(kpis, bounds);

  assert.equal(result.shapes.length, 2); // 2 cards
  assert.equal(result.textBoxes.length, 6); // 2 titles + 2 values + 2 subtitles

  const metrics = result.textBoxes.filter((t) => t.role === "metric");
  assert.equal(metrics.length, 2);
  assert.equal(metrics[0].text, "99.8%");
  assert.equal(metrics[1].text, "1,250,000 req/s");
});

test("buildHorizontalStepsLayout handles error cases", () => {
  assert.throws(() => buildHorizontalStepsLayout([], { x: 0, y: 0, w: 100, h: 100 }), /items must be an array/);
  assert.throws(() => buildHorizontalStepsLayout([{}], null), /bounds must be an object/);
});
