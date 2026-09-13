"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  semanticFallbackToPageContext,
  validateSemanticFallback
} = require("../packages/slideclone-core/semantic-fallback-adapter");

test("validateSemanticFallback normalizes model semantic hierarchy without geometry", () => {
  const fallback = validateSemanticFallback({
    archetype: " step_chain ",
    items: [
      { title: " 发现问题 ", body: "访谈与资料梳理", badge: "01" },
      { title: "落地方案", body: "形成可执行路线", badge: "02", children: [{ title: "子任务" }] }
    ],
    slotValues: {
      title_1: "业务增长路径"
    }
  });

  assert.equal(fallback.archetype, "step_chain");
  assert.equal(fallback.items.length, 2);
  assert.equal(fallback.items[0].title, "发现问题");
  assert.equal(fallback.items[1].children[0].title, "子任务");
  assert.deepEqual(fallback.slotValues, { title_1: "业务增长路径" });
});

test("semanticFallbackToPageContext produces declarative pipeline context", () => {
  const context = semanticFallbackToPageContext({
    archetype: "metrics",
    items: [{ title: "转化率", metric: "38%" }]
  }, {
    pageIndex: 2,
    slideSize: { widthPt: 960, heightPt: 540 }
  });

  assert.equal(context.archetype, "metrics");
  assert.equal(context.items[0].metric, "38%");
  assert.equal(context.pageIndex, 2);
  assert.deepEqual(context.slideSize, { widthPt: 960, heightPt: 540 });
  assert.equal(context.metadata.source, "semantic-fallback");
});

test("validateSemanticFallback rejects model-supplied absolute geometry", () => {
  assert.throws(() => validateSemanticFallback({ items: [{ title: "bad", x: 10 }] }), /must not contain geometry key "x"/);
  assert.throws(() => validateSemanticFallback({ items: [{ title: "bad", box: { x: 1, y: 2, w: 3, h: 4 } }] }), /must not contain geometry key "box"/);
  assert.throws(() => validateSemanticFallback({ slotValues: { bounds: "10,10,100,20" } }), /must not contain geometry key "bounds"/);
});

test("validateSemanticFallback enforces size, text, and identifier boundaries", () => {
  assert.throws(() => validateSemanticFallback(null), /must be an object/);
  assert.throws(() => validateSemanticFallback({ items: {} }), /items must be an array/);
  assert.throws(() => validateSemanticFallback({ items: ["bad"] }), /items\[0\] must be an object/);
  assert.throws(() => validateSemanticFallback({ items: [{ title: "bad", children: {} }] }), /items\[0\]\.children must be an array/);
  assert.throws(() => validateSemanticFallback({ items: [{ title: "x".repeat(501) }] }), /exceeds 500 characters/);
  assert.throws(() => validateSemanticFallback({ slotValues: { "bad.key": "value" } }), /simple identifiers/);
  assert.throws(() => validateSemanticFallback({
    items: Array.from({ length: 100 }, (_, index) => ({
      title: `item ${index}`,
      children: index === 0 ? [{ title: "overflow" }] : []
    }))
  }), /cannot contain more than 100 total items/);

  let node = { title: "leaf" };
  for (let i = 0; i < 8; i += 1) {
    node = { children: [node] };
  }
  assert.throws(() => validateSemanticFallback({ items: [node] }), /nesting depth/);
});

test("semanticFallbackToPageContext rejects invalid base context", () => {
  assert.throws(() => semanticFallbackToPageContext({ items: [] }, null), /baseContext must be an object/);
  assert.throws(() => semanticFallbackToPageContext({ items: [] }, []), /baseContext must be an object/);
});
