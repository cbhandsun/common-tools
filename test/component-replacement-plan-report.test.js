"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildComponentReplacementPlanReport,
  parseArgs,
  _private
} = require("../skills/pd-hifi-slideclone/scripts/component-replacement-plan-report");

function makeDeck() {
  const plan = {
    provider: "plugin-component-template-replacement-plan-v1",
    layerKey: "0:0",
    sourceProvider: "officeplus",
    componentKind: "component",
    componentId: "MatlComponentContent-11189",
    title: "蓝色简约圆通用4项中心总分PPT组件",
    suitabilityTier: "strong",
    suitabilityScore: 96
  };
  return {
    pages: [{
      shapes: [{
        id: "native-shape-1",
        box: { x: 320, y: 180, w: 80, h: 70 },
        source: { detector: "native-card", componentReplacementPlan: plan }
      }, {
        id: "outside-shape",
        box: { x: 20, y: 20, w: 20, h: 20 },
        source: { detector: "title-accent" }
      }],
      textBoxes: [{
        id: "native-text-1",
        text: "文档",
        box: { x: 330, y: 190, w: 60, h: 24 },
        source: { detector: "native-label", componentReplacementPlan: plan }
      }, {
        id: "title",
        text: "PM Portal",
        box: { x: 40, y: 40, w: 200, h: 40 },
        source: { detector: "title" }
      }]
    }]
  };
}

test("component replacement plan report parses CLI arguments", () => {
  const args = parseArgs([
    "node",
    "component-replacement-plan-report.js",
    "--ir",
    "deck.native.ir.json",
    "--out",
    "report.json",
    "--max-examples",
    "3"
  ]);

  assert.equal(args.ir, "deck.native.ir.json");
  assert.equal(args.out, "report.json");
  assert.equal(args.maxExamples, 3);
});

test("component replacement plan report summarizes final IR replacement coverage", () => {
  const report = buildComponentReplacementPlanReport({
    ir: "deck.native.ir.json",
    deck: makeDeck(),
    maxExamples: 4
  });

  assert.equal(report.summary.pages, 1);
  assert.equal(report.summary.pagesWithPlans, 1);
  assert.equal(report.summary.components, 1);
  assert.equal(report.summary.layers, 1);
  assert.equal(report.summary.shapes, 1);
  assert.equal(report.summary.textBoxes, 1);
  assert.deepEqual(report.summary.bySuitabilityTier, { strong: 1 });
  assert.deepEqual(report.summary.byProvider, { officeplus: 1 });
  assert.equal(report.components[0].componentId, "MatlComponentContent-11189");
  assert.equal(report.components[0].elements, 2);
  assert.equal(report.components[0].examples.length, 2);
  assert.equal(report.components[0].examples[1].text, "文档");
});

test("component replacement plan report ignores elements without component plans", () => {
  const elements = _private.collectReplacementElements(makeDeck().pages[0], 0);

  assert.equal(elements.length, 2);
  assert.deepEqual(elements.map((element) => element.id), ["native-shape-1", "native-text-1"]);
  assert.equal(_private.replacementPlanFor({ source: {} }), null);
});
