"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  DLA_REGION_LABELS,
  assertDlaRegion,
  associateTextWithDlaRegions,
  normalizeDlaRegions,
  synthesizeSemanticLayoutTree
} = require("../packages/slideclone-core/dla-layout-adapter");

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
