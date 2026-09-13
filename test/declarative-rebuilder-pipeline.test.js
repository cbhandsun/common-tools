"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDeclarativePipeline } = require("../packages/slideclone-core/declarative-rebuilder-pipeline");
const { semanticFallbackToPageContext } = require("../packages/slideclone-core/semantic-fallback-adapter");

test("DeclarativeRebuilderPipeline dispatches step_chain archetype to builtin-step-chain plugin", () => {
  const pipeline = createDeclarativePipeline();

  const ctx = {
    archetype: "step_chain",
    items: [
      { title: "阶段一", body: "需求与对齐", badge: "01" },
      { title: "阶段二", body: "设计与实施", badge: "02" }
    ]
  };

  const result = pipeline.run(ctx);
  assert.equal(result.status, "matched");
  assert.equal(result.matchedPlugin, "builtin-step-chain");
  assert.ok(result.shapes.length > 0);
  assert.ok(result.textBoxes.length > 0);
  assert.ok(result.qualityReport);
  assert.equal(result.qualityReport.passed, true);
});

test("DeclarativeRebuilderPipeline applies brand kit styling during pipeline execution", () => {
  const pipeline = createDeclarativePipeline();

  const ctx = {
    archetype: "metrics",
    items: [
      { title: "转化率", metric: "35.8%", trend: "+5.2%" },
      { title: "客单价", metric: "¥1,280", trend: "+12%" }
    ]
  };

  const brandKit = {
    palette: {
      primary: "#FF5722",
      secondary: "#212121",
      accent: "#4CAF50",
      background: "#FAFAFA",
      surface: "#FFFFFF",
      textPrimary: "#212121",
      textMuted: "#757575"
    }
  };

  const result = pipeline.run(ctx, { brandKit });
  assert.equal(result.status, "matched");
  assert.equal(result.matchedPlugin, "builtin-metric-cards");
  assert.ok(result.qualityReport.passed);

  // Textboxes font colors should be adjusted
  const metricBoxes = result.textBoxes.filter((t) => t.role === "metric");
  assert.equal(metricBoxes.length, 2);
  assert.equal(metricBoxes[0].font.color, "#212121"); // High-contrast textPrimary
});

test("DeclarativeRebuilderPipeline validates slide size and pipeline options before layout", () => {
  const pipeline = createDeclarativePipeline();
  const ctx = {
    archetype: "step_chain",
    slideSize: { widthPt: "wide", heightPt: 540 },
    items: [
      { title: "一", badge: "01" },
      { title: "二", badge: "02" }
    ]
  };

  assert.throws(() => pipeline.run(ctx), /slideSize\.widthPt/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: ctx.items }, []), /pipeline options/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: ctx.items }, { gridSnap: 0 }), /gridSnap/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: ctx.items }, { autoFitText: "false" }), /autoFitText/);
});

test("DeclarativeRebuilderPipeline snapshots page context before plugins read it", () => {
  const pipeline = createDeclarativePipeline();
  let topLevelGetterCalls = 0;
  const getterContext = {};
  Object.defineProperty(getterContext, "archetype", {
    enumerable: true,
    get() {
      topLevelGetterCalls += 1;
      throw new Error("private-archetype");
    }
  });

  assert.throws(() => pipeline.run(getterContext), /archetype must be a data property/);
  assert.equal(topLevelGetterCalls, 0);

  let itemGetterCalls = 0;
  const unsafeItem = {};
  Object.defineProperty(unsafeItem, "title", {
    enumerable: true,
    get() {
      itemGetterCalls += 1;
      throw new Error("private-title");
    }
  });

  assert.throws(() => pipeline.run({ archetype: "step_chain", items: [unsafeItem] }), /items\[0\] must contain only data properties/);
  assert.equal(itemGetterCalls, 0);
});

test("DeclarativeRebuilderPipeline rejects unsafe page context without echoing private data", () => {
  const pipeline = createDeclarativePipeline();
  const hostile = new Proxy({}, {
    ownKeys() {
      throw new Error("private-token");
    }
  });

  assert.throws(() => pipeline.run({ archetype: "step_chain", items: [hostile] }), (error) => {
    assert.match(String(error && error.message), /items\[0\] must be safe data/);
    assert.doesNotMatch(String(error && error.message), /private-token/);
    return true;
  });
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: new Array(101).fill({ title: "x" }) }), /items cannot contain more than 100 entries/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: [{ title: "x", metric: Number.POSITIVE_INFINITY }] }), /finite number/);
  assert.throws(() => pipeline.run({ archetype: "step chain", items: [] }), /archetype must be a simple identifier/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", items: [, { title: "x" }] }), /items must be a dense array/);
  assert.throws(() => pipeline.run({ archetype: "step_chain", metadata: new Proxy({}, {
    getPrototypeOf() {
      throw new Error("private-prototype");
    }
  }) }), (error) => {
    assert.match(String(error && error.message), /metadata must be safe data/);
    assert.doesNotMatch(String(error && error.message), /private-prototype/);
    return true;
  });
});

test("DeclarativeRebuilderPipeline passes gridSnap to builtin layouts", () => {
  const pipeline = createDeclarativePipeline();
  const result = pipeline.run({
    archetype: "metrics",
    items: [
      { title: "A", metric: "10" },
      { title: "B", metric: "20" }
    ]
  }, { gridSnap: 7 });

  assert.equal(result.status, "matched");
  const firstCard = result.shapes.find((shape) => shape.id === "shape_kpi_1");
  assert.ok(firstCard);
  assert.equal(firstCard.x % 7, 0);
  assert.equal(firstCard.y % 7, 0);
});

test("DeclarativeRebuilderPipeline registers custom rebuilder plugin with priority", () => {
  const pipeline = createDeclarativePipeline();

  let customCalled = false;
  pipeline.registerPlugin({
    id: "high-priority-custom",
    priority: 999, // Higher than any builtin
    canHandle: (ctx) => ctx.metadata?.isCustom === true,
    rebuild: () => {
      customCalled = true;
      return {
        shapes: [{ id: "custom_s1", type: "rectangle", x: 100, y: 100, w: 200, h: 100 }],
        textBoxes: [{ role: "title", text: "自定义组件", box: { x: 110, y: 110, w: 180, h: 40 } }]
      };
    }
  });

  const ctx = {
    metadata: { isCustom: true }
  };

  const result = pipeline.run(ctx);
  assert.equal(customCalled, true);
  assert.equal(result.matchedPlugin, "high-priority-custom");
  assert.equal(result.shapes.length, 1);
  assert.equal(result.textBoxes.length, 1);
});

test("DeclarativeRebuilderPipeline rejects unsafe plugin definitions before registration", () => {
  const pipeline = createDeclarativePipeline();
  let getterCalls = 0;
  const getterPlugin = {
    priority: 1,
    canHandle: () => false,
    rebuild: () => ({ shapes: [], textBoxes: [] })
  };
  Object.defineProperty(getterPlugin, "id", {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error("private-plugin-id");
    }
  });

  assert.throws(() => pipeline.registerPlugin(getterPlugin), /plugin\.id must be a data property/);
  assert.equal(getterCalls, 0);
  assert.throws(() => pipeline.registerPlugin({ id: "bad plugin", priority: 1, canHandle: () => false, rebuild: () => ({ shapes: [], textBoxes: [] }) }), /plugin\.id must be a simple identifier/);
  assert.throws(() => pipeline.registerPlugin({ id: "safe-plugin", priority: 1, canHandle: "nope", rebuild: () => ({ shapes: [], textBoxes: [] }) }), /plugin\.canHandle must be a function/);
  assert.throws(() => pipeline.registerPlugin(new Proxy({}, {
    getOwnPropertyDescriptor() {
      throw new Error("private-plugin");
    }
  })), (error) => {
    assert.match(String(error && error.message), /plugin\.id must be safe data/);
    assert.doesNotMatch(String(error && error.message), /private-plugin/);
    return true;
  });
});

test("DeclarativeRebuilderPipeline returns unhandled when no plugin matches", () => {
  const pipeline = createDeclarativePipeline();
  const result = pipeline.run({ archetype: "unknown_future_archetype" });
  assert.equal(result.status, "unhandled");
  assert.equal(result.matchedPlugin, null);
});

test("DeclarativeRebuilderPipeline consumes sanitized semantic fallback context", () => {
  const pipeline = createDeclarativePipeline();
  const context = semanticFallbackToPageContext({
    archetype: "process_flow",
    items: [
      { title: "识别", body: "只描述语义", badge: "01" },
      { title: "排版", body: "由本地求解器生成坐标", badge: "02" }
    ]
  });

  const result = pipeline.run(context);
  assert.equal(result.status, "matched");
  assert.equal(result.matchedPlugin, "builtin-step-chain");
  assert.ok(result.shapes.length > 0);
  assert.ok(result.textBoxes.length > 0);
});

test("DeclarativeRebuilderPipeline derives process flow items from DLA regions", () => {
  const pipeline = createDeclarativePipeline();
  const result = pipeline.run({
    dlaRegions: [
      { id: "flow", label: "process_flow", confidence: 0.93, box: { x: 40, y: 100, w: 500, h: 180 } }
    ],
    textBoxes: [
      { text: "识别需求", box: { x: 60, y: 130, w: 120, h: 24 } },
      { text: "生成方案", box: { x: 220, y: 130, w: 120, h: 24 } },
      { text: "验收发布", box: { x: 380, y: 130, w: 120, h: 24 } }
    ]
  });

  assert.equal(result.status, "matched");
  assert.equal(result.matchedPlugin, "builtin-step-chain");
  assert.ok(Array.isArray(result.semanticTree));
  assert.equal(result.semanticTree[0].role, "process_flow");
  const titles = result.textBoxes.filter((box) => box.role === "title").map((box) => box.text);
  assert.deepEqual(titles, ["识别需求", "生成方案", "验收发布"]);
});

test("DeclarativeRebuilderPipeline derives metric card items from DLA regions", () => {
  const pipeline = createDeclarativePipeline();
  const result = pipeline.run({
    dlaRegions: [
      { id: "metric-a", label: "metric_card", confidence: 0.92, box: { x: 50, y: 120, w: 180, h: 120 } },
      { id: "metric-b", label: "metric_card", confidence: 0.91, box: { x: 260, y: 120, w: 180, h: 120 } }
    ],
    textBoxes: [
      { text: "转化率", box: { x: 70, y: 140, w: 80, h: 20 } },
      { text: "35.8%", box: { x: 70, y: 170, w: 80, h: 28 } },
      { text: "客单价", box: { x: 280, y: 140, w: 80, h: 20 } },
      { text: "1280", box: { x: 280, y: 170, w: 80, h: 28 } }
    ]
  });

  assert.equal(result.status, "matched");
  assert.equal(result.matchedPlugin, "builtin-metric-cards");
  assert.ok(Array.isArray(result.semanticTree));
  const metricTexts = result.textBoxes.filter((box) => box.role === "metric").map((box) => box.text);
  assert.deepEqual(metricTexts, ["35.8%", "1280"]);
});
