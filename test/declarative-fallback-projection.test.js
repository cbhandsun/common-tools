"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { applySemanticFallbackPipeline, _private } = require("../packages/slideclone-core/declarative-fallback-projection");

function page() {
  return { source: {}, shapes: [{ id: "existing", type: "rect", box: { x: 1, y: 1, w: 1, h: 1 } }], textBoxes: [] };
}

test("semantic fallback projection appends quality-gated declarative objects with safe Deck IR fields", () => {
  const deckPage = page();
  applySemanticFallbackPipeline(deckPage, { archetype: "step_chain" }, () => ({
    run(context, options) {
      assert.equal(context.archetype, "step_chain");
      assert.deepEqual(options, { enforceQualityGate: true });
      return {
        status: "matched",
        matchedPlugin: "plugin-one",
        qualityReport: { passed: true },
        shapes: [
          { id: "card-1", type: "round_rect", x: 10, y: 20, w: 30, h: 40, fill: "#AABBCC", stroke: "#001122" },
          { id: "arrow-1", type: "connector_line", x1: 30, y1: 40, x2: 70, y2: 40, stroke: "#334455" }
        ],
        textBoxes: [{ id: "title-1", text: "Title", box: { x: 11, y: 21, w: 28, h: 8 }, font: { sizePt: 14 }, role: "title" }]
      };
    }
  }));

  assert.deepEqual(deckPage.source.declarativeRebuild, {
    status: "matched",
    matchedPlugin: "plugin-one",
    shapes: 2,
    textBoxes: 1,
    qualityPassed: true
  });
  assert.equal(deckPage.shapes.length, 3);
  assert.deepEqual(deckPage.shapes[1], {
    id: "card-1",
    type: "roundRect",
    box: { x: 10, y: 20, w: 30, h: 40 },
    style: { fill: "#AABBCC", stroke: "#001122" },
    source: { declarativeRebuilder: true, matchedPlugin: "plugin-one" }
  });
  assert.equal(deckPage.shapes[2].type, "line");
  assert.deepEqual(deckPage.shapes[2].box, { x: 30, y: 40, w: 40, h: 0 });
  assert.deepEqual(deckPage.textBoxes[0].source, { declarativeRebuilder: true, matchedPlugin: "plugin-one", role: "title" });
  assert.deepEqual(_private.projectDeclarativeTextBoxes([{ id: "template-title", text: "Template title", x: 1, y: 2, w: 3, h: 4 }], "template-plugin"), [{
    id: "template-title",
    text: "Template title",
    box: { x: 1, y: 2, w: 3, h: 4 },
    font: {},
    style: { visibility: "visible", opacity: 1, wrap: true, fit: "shrink" },
    source: { declarativeRebuilder: true, matchedPlugin: "template-plugin", role: undefined }
  }]);
});

test("semantic fallback projection records unmatched evidence without mutating page objects", () => {
  const deckPage = page();
  applySemanticFallbackPipeline(deckPage, { archetype: "unknown" }, () => ({
    run() {
      return { status: "unhandled", matchedPlugin: null, qualityReport: { passed: false }, shapes: [{ id: "ignored", x: 1, y: 1, w: 1, h: 1 }], textBoxes: [] };
    }
  }));

  assert.deepEqual(deckPage.source.declarativeRebuild, {
    status: "unhandled",
    matchedPlugin: null,
    shapes: 1,
    textBoxes: 0,
    qualityPassed: false
  });
  assert.deepEqual(deckPage.shapes, [{ id: "existing", type: "rect", box: { x: 1, y: 1, w: 1, h: 1 } }]);
  assert.deepEqual(deckPage.textBoxes, []);
});

test("semantic fallback projection bounds unsafe identifiers colors geometry and object types", () => {
  assert.deepEqual(_private.boxFromDeclarative({ x: 0, y: 1, w: 2, h: 0 }), { x: 0, y: 1, w: 2, h: 0 });
  assert.equal(_private.boxFromDeclarative({ x: 0, y: 1, w: 0, h: 1 }), null);
  assert.equal(_private.boxFromDeclarative({ x: 0, y: 1, w: 2, h: -1 }), null);
  assert.equal(_private.safeColor("red"), "");
  assert.equal(_private.safeColor("#Aa09Ff"), "#Aa09Ff");
  assert.equal(_private.boundedIdentifier("bad id", "fallback"), "fallback");
  assert.equal(_private.declarativeShapeType("circle"), "ellipse");
  assert.equal(_private.declarativeShapeType("<script>"), "rect");

  assert.deepEqual(_private.projectDeclarativeShapes([
    { id: "bad id", type: "circle", x: 1, y: 2, w: 3, h: 4, fill: "red", stroke: "#123456" },
    { id: "bad-line", type: "connector_line", x1: 1, y1: 2, x2: Number.NaN, y2: 4 }
  ], "plugin-two"), [{
    id: "declarative-shape-1",
    type: "ellipse",
    box: { x: 1, y: 2, w: 3, h: 4 },
    style: { stroke: "#123456" },
    source: { declarativeRebuilder: true, matchedPlugin: "plugin-two" }
  }]);
});
