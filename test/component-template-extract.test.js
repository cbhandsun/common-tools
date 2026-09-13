"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateComponentTemplate } = require("../packages/slideclone-core/component-template-catalog");
const {
  harvestComponentTemplate,
  instantiateComponentTemplate
} = require("../packages/slideclone-core/component-template-harvester");

test("harvestComponentTemplate normalizes shapes, text slots, and palette", () => {
  const shapes = [
    { id: "bg_card", type: "round_rect", x: 100, y: 100, w: 200, h: 100, fill: "#0066CC", stroke: "#FFFFFF" }
  ];
  const textBoxes = [
    { role: "title", text: "核心业务指标", x: 120, y: 120, w: 160, h: 30 },
    { role: "body", text: "季度增长 45%", x: 120, y: 160, w: 160, h: 25 }
  ];

  const template = harvestComponentTemplate(shapes, textBoxes, {
    id: "tpl_metric_card",
    archetype: "kpi_card",
    category: "metrics",
    tags: ["kpi", "card"]
  });

  assert.equal(template.id, "tpl_metric_card");
  assert.equal(template.archetype, "kpi_card");
  assert.equal(template.category, "metrics");
  assert.doesNotThrow(() => validateComponentTemplate(template));
  assert.deepEqual(template.envelope, { w: 200, h: 100 });

  // Palette extracted
  assert.deepEqual(template.palette.fills, ["#0066CC"]);
  assert.deepEqual(template.palette.strokes, ["#FFFFFF"]);

  // Normalized relative coordinates: shape starts at 0,0, relW = 1, relH = 1
  assert.equal(template.shapes.length, 1);
  assert.equal(template.shapes[0].relX, 0);
  assert.equal(template.shapes[0].relY, 0);
  assert.equal(template.shapes[0].relW, 1);
  assert.equal(template.shapes[0].relH, 1);

  // Slots extracted
  assert.equal(template.slots.length, 2);
  assert.equal(template.slots[0].name, "title_1");
  assert.equal(template.slots[0].defaultText, "[title]");
  assert.equal(template.slots[1].name, "body_2");
});

test("harvestComponentTemplate can preserve default text only when explicitly requested", () => {
  const template = harvestComponentTemplate(
    [{ id: "bg", type: "rectangle", x: 0, y: 0, w: 100, h: 80 }],
    [{ role: "title", text: "可公开样本文案", x: 10, y: 10, w: 80, h: 20 }],
    { preserveText: true }
  );

  assert.equal(template.slots[0].defaultText, "可公开样本文案");
});

test("instantiateComponentTemplate scales coordinates and injects slot values", () => {
  const shapes = [
    { id: "card", type: "rectangle", x: 0, y: 0, w: 100, h: 100, fill: "#112233" }
  ];
  const textBoxes = [
    { role: "title", text: "原始标题", x: 10, y: 10, w: 80, h: 30 }
  ];

  const template = harvestComponentTemplate(shapes, textBoxes, { archetype: "simple_card" });

  // Instantiate at a new location scaled up 2x: x=200, y=300, w=200, h=200
  const instance = instantiateComponentTemplate(
    template,
    { title_1: "全新业务流程" },
    { x: 200, y: 300, w: 200, h: 200 }
  );

  assert.equal(instance.shapes.length, 1);
  assert.equal(instance.shapes[0].x, 200);
  assert.equal(instance.shapes[0].y, 300);
  assert.equal(instance.shapes[0].w, 200);
  assert.equal(instance.shapes[0].h, 200);

  assert.equal(instance.textBoxes.length, 1);
  assert.equal(instance.textBoxes[0].text, "全新业务流程");
  assert.equal(instance.textBoxes[0].x, 220); // 200 + 0.1 * 200
  assert.equal(instance.textBoxes[0].y, 320); // 300 + 0.1 * 200
  assert.equal(instance.textBoxes[0].w, 160); // 0.8 * 200
  assert.equal(instance.textBoxes[0].h, 60);  // 0.3 * 200
});

test("harvestComponentTemplate rejects unsafe source fields and options", () => {
  const shape = { id: "bg", type: "rectangle", x: 0, y: 0, w: 100, h: 80 };
  const text = { role: "title", text: "可公开样本文案", x: 10, y: 10, w: 80, h: 20 };

  assert.throws(() => harvestComponentTemplate([shape], [text], []), /options must be an object/);
  assert.throws(() => harvestComponentTemplate([shape], [text], { preserveText: "yes" }), /options\.preserveText must be a boolean/);
  assert.throws(() => harvestComponentTemplate([{ ...shape, id: "bad id" }], [text]), /shape\[0\]\.id must be a simple identifier/);
  assert.throws(() => harvestComponentTemplate([{ ...shape, type: "bad\ntype" }], [text]), /shape\[0\]\.type must be a simple identifier/);
  assert.throws(() => harvestComponentTemplate([{ ...shape, fill: "#fff\nprivate-token" }], [text]), /shape\[0\]\.fill must be a single-line string/);
  assert.throws(() => harvestComponentTemplate([shape], [{ ...text, role: "bad role" }]), /textBox\[0\]\.role must be a simple identifier/);
  assert.throws(() => harvestComponentTemplate([shape], [{ ...text, text: "x".repeat(501) }], { preserveText: true }), /textBox\[0\]\.text must be at most 500 characters/);
  assert.throws(() => harvestComponentTemplate([shape], [text], { tags: ["ok", "bad\nline"] }), /options\.tags\[1\] must be a single-line string/);
});

test("instantiateComponentTemplate validates slot values without echoing private content", () => {
  const template = harvestComponentTemplate(
    [{ id: "bg", type: "rectangle", x: 0, y: 0, w: 100, h: 80 }],
    [{ role: "title", text: "原始标题", x: 10, y: 10, w: 80, h: 20 }]
  );

  assert.throws(() => instantiateComponentTemplate(template, []), /slotValues must be an object/);
  assert.throws(() => instantiateComponentTemplate(template, { "bad.key private-token": "value" }), (error) => {
    assert.match(error.message, /slotValues keys must be simple identifiers/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
  assert.throws(() => instantiateComponentTemplate(template, { title_1: "safe\nprivate-token" }), (error) => {
    assert.match(error.message, /slotValues\.title_1 must be a single-line string/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
});

test("harvestComponentTemplate and instantiateComponentTemplate handle error paths", () => {
  assert.throws(() => harvestComponentTemplate(null, []), /shapes must be an array/);
  assert.throws(() => harvestComponentTemplate([], null), /textBoxes must be an array/);
  assert.throws(() => harvestComponentTemplate([], []), /cannot harvest template from empty/);
  assert.throws(() => harvestComponentTemplate([{ box: { w: 0, h: 0 } }], []), /no valid bounding boxes found/);

  assert.throws(() => instantiateComponentTemplate(null), /invalid component template/);
  assert.throws(() => instantiateComponentTemplate({ shapes: [] }), /invalid component template/);
  assert.throws(() => instantiateComponentTemplate(harvestComponentTemplate([{ x: 0, y: 0, w: 10, h: 10 }], []), {}, { x: 0, y: 0, w: 0, h: 10 }), /targetBounds width and height must be positive/);
});
