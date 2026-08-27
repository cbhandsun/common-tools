"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createWorkflowSupplyChainTwoPanelObjects
} = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");

test("workflow supply-chain parts form three reusable semantic components", () => {
  const page = {
    images: [
      { id: "left-panel", box: { x: 18, y: 76.1, w: 452.4, h: 350.5 }, source: { detector: "two-panel-diagram-crop" } },
      { id: "right-panel", box: { x: 512.8, y: 70.2, w: 412, h: 351.7 }, source: { detector: "two-panel-diagram-crop" } }
    ]
  };
  const textBoxes = [
    ["场景实战I：供应链PMS订货配置", 35, 23],
    ["DomainRepository", 591, 116],
    ["供应链PMS配置（已治理）", 592, 145],
    ["供应链PMS配置", 635, 194],
    ["PRD.md", 667, 243],
    ["API Endpoints.md", 668, 297],
    ["UI_Wireframe.fig", 666, 351],
    ["码表口径模糊", 336, 360],
    ["多版本混杂", 159, 371]
  ].map(([text, x, y]) => ({ text, box: { x, y, w: 160, h: 22 } }));

  const objects = createWorkflowSupplyChainTwoPanelObjects(page, textBoxes, { widthPt: 960, heightPt: 540 });
  const parts = [...objects.shapes, ...objects.textBoxes];
  const groupIds = [...new Set(parts.map((item) => item.source?.nativeComponentGroupId).filter(Boolean))].sort();

  assert.deepEqual(groupIds, [
    "workflow-supply-chain-repository",
    "workflow-supply-chain-summary",
    "workflow-supply-chain-title"
  ]);
  assert.ok(parts.every((item) => item.source.nativeComponentParentId === "workflow-supply-chain-case"));
  assert.ok(parts.every((item) => item.source.nativeComponentMinimumUnit === "semantic-component"));
});
