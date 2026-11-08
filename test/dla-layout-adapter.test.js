"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DLA_REGION_LABELS,
  assertDlaRegion,
  associateTextWithDlaRegions,
  normalizeDlaRegions,
  synthesizeSemanticLayoutTree
} = require("../packages/slideclone-core/archetypes/dla-layout-adapter");

test("assertDlaRegion validates confidence, labels, and bounding box", () => {
  const valid = assertDlaRegion({
    id: "r1",
    label: "title",
    confidence: 0.9542,
    box: { x: 50, y: 30, w: 600, h: 60 }
  });

  assert.equal(valid.id, "r1");
  assert.equal(valid.label, "title");
  assert.equal(valid.confidence, 0.954);
  assert.deepEqual(valid.box, { x: 50, y: 30, w: 600, h: 60 });

  // Unknown label fallback
  const fallback = assertDlaRegion({
    label: "some_unrecognized_label",
    confidence: 0.8,
    box: { x: 10, y: 10, w: 100, h: 100 }
  });
  assert.equal(fallback.label, "unknown");

  // Invalid parameters
  assert.throws(() => assertDlaRegion(null), /must be an object/);
  assert.throws(() => assertDlaRegion({ confidence: 1.5, box: { x: 0, y: 0, w: 10, h: 10 } }), /between 0 and 1/);
  assert.throws(() => assertDlaRegion({ confidence: 0.8, box: { x: 0, y: 0, w: -5, h: 10 } }), /positive finite numbers/);
});

test("associateTextWithDlaRegions assigns text boxes to enclosing regions", () => {
  const regions = [
    { id: "reg_title", label: "title", confidence: 0.9, box: { x: 50, y: 20, w: 500, h: 50 } },
    { id: "reg_flow", label: "process_flow", confidence: 0.88, box: { x: 50, y: 120, w: 500, h: 200 } }
  ];

  const textBoxes = [
    { text: "主标题：企业数字化架构", box: { x: 60, y: 30, w: 200, h: 30 } },
    { text: "步骤1：数据采集", box: { x: 70, y: 150, w: 100, h: 40 } },
    { text: "孤立文本", box: { x: 800, y: 400, w: 100, h: 30 } }
  ];

  const { assigned, unassigned } = associateTextWithDlaRegions(regions, textBoxes);

  const titleItems = assigned.get("reg_title");
  assert.equal(titleItems.length, 1);
  assert.equal(titleItems[0].text, "主标题：企业数字化架构");

  const flowItems = assigned.get("reg_flow");
  assert.equal(flowItems.length, 1);
  assert.equal(flowItems[0].text, "步骤1：数据采集");

  assert.equal(unassigned.length, 1);
  assert.equal(unassigned[0].text, "孤立文本");
});

test("normalizeDlaRegions generates missing IDs and rejects unsafe duplicate IDs", () => {
  const normalized = normalizeDlaRegions([
    { label: "title", confidence: 0.9, box: { x: 10, y: 10, w: 100, h: 30 } },
    { id: "region.two", label: "paragraph", confidence: 0.8, box: { x: 10, y: 60, w: 100, h: 80 } }
  ]);

  assert.equal(normalized[0].id, "dla_region_1");
  assert.equal(normalized[1].id, "region.two");
  assert.throws(() => normalizeDlaRegions([
    { id: "same", label: "title", confidence: 0.9, box: { x: 0, y: 0, w: 10, h: 10 } },
    { id: "same", label: "footer", confidence: 0.9, box: { x: 0, y: 20, w: 10, h: 10 } }
  ]), /duplicate DLA region id/);
  assert.throws(() => normalizeDlaRegions([
    { id: "private-token", label: "title", confidence: 0.9, box: { x: 0, y: 0, w: 10, h: 10 } },
    { id: "private-token", label: "footer", confidence: 0.9, box: { x: 0, y: 20, w: 10, h: 10 } }
  ]), (error) => {
    assert.match(error.message, /duplicate DLA region id/);
    assert.equal(error.message.includes("private-token"), false);
    return true;
  });
  assert.throws(() => normalizeDlaRegions([
    { id: "bad id", label: "title", confidence: 0.9, box: { x: 0, y: 0, w: 10, h: 10 } }
  ]), /simple identifier/);
});

test("associateTextWithDlaRegions keeps generated IDs distinct", () => {
  const { assigned } = associateTextWithDlaRegions([
    { label: "title", confidence: 0.9, box: { x: 0, y: 0, w: 100, h: 40 } },
    { label: "footer", confidence: 0.9, box: { x: 0, y: 200, w: 100, h: 40 } }
  ], [
    { text: "title text", box: { x: 5, y: 5, w: 30, h: 10 } },
    { text: "footer text", box: { x: 5, y: 205, w: 30, h: 10 } }
  ]);

  assert.equal(assigned.get("dla_region_1").length, 1);
  assert.equal(assigned.get("dla_region_2").length, 1);
});

test("synthesizeSemanticLayoutTree sorts by reading order and wraps unassigned nodes", () => {
  const regions = [
    { id: "r_footer", label: "footer", confidence: 0.8, box: { x: 50, y: 500, w: 800, h: 30 } },
    { id: "r_title", label: "title", confidence: 0.95, box: { x: 50, y: 40, w: 600, h: 50 } }
  ];

  const textBoxes = [
    { text: "页脚版权信息", box: { x: 60, y: 505, w: 200, h: 20 } },
    { text: "PPT架构总览", box: { x: 60, y: 45, w: 300, h: 35 } },
    { text: "角落散落信息", box: { x: 700, y: 200, w: 100, h: 50 } }
  ];

  const tree = synthesizeSemanticLayoutTree(regions, textBoxes);

  // First is title (y: 40), then footer (y: 500), then unassigned fallback
  assert.equal(tree.length, 3);
  assert.equal(tree[0].id, "r_title");
  assert.equal(tree[0].role, "title");
  assert.equal(tree[0].items.length, 1);

  assert.equal(tree[1].id, "r_footer");
  assert.equal(tree[1].role, "footer");

  assert.equal(tree[2].id, "unassigned_region");
  assert.equal(tree[2].role, "unknown");
  assert.equal(tree[2].items.length, 1);
});

test("synthesizeSemanticLayoutTree does not invent fallback geometry for invalid text boxes", () => {
  const tree = synthesizeSemanticLayoutTree([], [
    { text: "bad-null", box: { x: null, y: 10, w: 100, h: 20 } },
    { text: "bad-size", box: { x: 10, y: 10, w: 0, h: 20 } }
  ]);

  assert.deepEqual(tree, []);
});

test("nested layout ownership selects the smallest complete parent independently of detector order", () => {
  for (const scale of [0.5, 1, 3]) for (const offset of [0, 41]) {
    const transform = box => ({ x: box.x * scale + offset, y: box.y * scale + offset, w: box.w * scale, h: box.h * scale });
    const regions = [
      { id: "page", label: "diagram", confidence: 0.99, box: transform({ x: 0, y: 0, w: 400, h: 300 }) },
      { id: "panel", label: "metric_card", confidence: 0.8, box: transform({ x: 30, y: 40, w: 160, h: 120 }) },
      { id: "text", label: "paragraph", confidence: 0.7, box: transform({ x: 50, y: 60, w: 100, h: 40 }) }
    ];
    const item = { text: "Changed label", box: transform({ x: 60, y: 70, w: 80, h: 20 }) };
    const before = structuredClone(regions);
    for (const order of [regions, [...regions].reverse(), [regions[1], regions[2], regions[0]]]) {
      const result = associateTextWithDlaRegions(order, [item]);
      assert.deepEqual(result.assigned.get("text"), [item]);
      assert.deepEqual(result.assigned.get("panel"), []);
      assert.deepEqual(result.assigned.get("page"), []);
      assert.deepEqual(result.unassigned, []);
    }
    assert.deepEqual(regions, before);
  }
});

test("layout ownership ranks complete containment, measured overlap, confidence, then stable identity", () => {
  const item = { text: "Short label", box: { x: 50, y: 50, w: 100, h: 20 } };
  const smallCenter = { id: "small", label: "image", confidence: 1, box: { x: 95, y: 55, w: 10, h: 10 } };
  const complete = { id: "complete", label: "paragraph", confidence: 0.5, box: { x: 40, y: 40, w: 120, h: 40 } };
  const partial = { id: "partial", label: "paragraph", confidence: 0.7, box: { x: 50, y: 50, w: 45, h: 20 } };
  const equal = [{ ...complete, id: "b", confidence: 0.9 }, { ...complete, id: "a", confidence: 0.9 }, complete];
  for (const reversed of [false, true]) {
    const select = (regions, id) => {
      const result = associateTextWithDlaRegions(reversed ? [...regions].reverse() : regions, [item]);
      assert.deepEqual(result.assigned.get(id), [item]);
      assert.equal([...result.assigned.values()].flat().length, 1);
    };
    select([smallCenter, complete], "complete");
    select([smallCenter, partial], "partial");
    select(equal, "a");
  }
  assert.deepEqual(associateTextWithDlaRegions([], [item]).unassigned, [item]);
  assert.deepEqual(associateTextWithDlaRegions([complete], []).assigned.get("complete"), []);
});

test("layout ranking remains finite for large admitted boxes and retains overlap boundaries", () => {
  const item = { text: "large", box: { x: 0, y: 0, w: 1e200, h: 1e200 } };
  const region = (id, w) => ({ id, label: "paragraph", confidence: 0.9, box: { x: 0, y: 0, w, h: 1e200 } });
  for (const regions of [[region("a", 6e199), region("b", 9e199)], [region("b", 9e199), region("a", 6e199)]]) {
    assert.deepEqual(associateTextWithDlaRegions(regions, [item]).assigned.get("b"), [item]);
  }
  assert.throws(() => assertDlaRegion({ ...region("overflow", 1e308), box: { x: 1e308, y: 0, w: 1e308, h: 1 } }), /finite/);
  const small = { text: "edge", box: { x: 0, y: 0, w: 100, h: 20 } };
  for (const w of [0.1, 40]) {
    assert.deepEqual(associateTextWithDlaRegions([{ ...region("partial", w), box: { x: 0, y: 0, w, h: 20 } }], [small]).unassigned, [small]);
  }
});
