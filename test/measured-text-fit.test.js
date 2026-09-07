"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { planMeasuredSingleLineTextFit } = require("../packages/slideclone-core/measured-text-fit");

const slideSize = { widthPt: 960, heightPt: 540 };

function textBox(id, overrides = {}) {
  return {
    id, text: "可编辑正文", box: { x: 100, y: 100, w: 240, h: 24 },
    font: { family: "Microsoft YaHei", sizePt: 16, align: "left", valign: "middle" },
    style: { visibility: "visible", wrap: false }, source: { editable: true, confidence: 0.95 },
    ...overrides
  };
}

function measurement(id, source, rendered) { return { id, source, rendered }; }

test("plans distinct bounded fits for ordinary body text and a title", () => {
  const body = textBox("body", { source: { editable: true, confidence: 0.8 } });
  const title = textBox("title", { text: "动态本体：知识图谱的可生长升级", box: { x: 200, y: 40, w: 500, h: 32 }, font: { family: "Microsoft YaHei", sizePt: 32, align: "left", valign: "middle" } });
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [body, title], measurements: [
    measurement("body", { x: 102, y: 102, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("title", { x: 201, y: 43, w: 325, h: 24 }, { x: 200, y: 40, w: 300, h: 22 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 2 });
  assert.equal(result.textBoxes[0].font.sizePt, 20.57);
  assert.equal(result.textBoxes[1].font.sizePt, 34.67);
  assert.equal(result.textBoxes[0].box.x, 102);
  assert.equal(result.textBoxes[1].box.y, 44.33333333333333);
  assert.notEqual(result.textBoxes[0], body);
  assert.notEqual(result.textBoxes[0].font, body.font);
  assert.equal(body.font.sizePt, 16);
});

test("rejects inconsistent, shrink-fit, low-confidence, invisible, multiline, and extreme adjustments", () => {
  const entries = [
    textBox("inconsistent"), textBox("shrink", { style: { visibility: "visible", wrap: false, fit: "shrink" } }),
    textBox("confidence", { source: { editable: true, confidence: 0.79 } }), textBox("hidden", { style: { visibility: "hidden", wrap: false } }),
    textBox("transparent", { font: { family: "Microsoft YaHei", sizePt: 16, align: "left", valign: "middle", opacity: 0 } }),
    textBox("multiline", { text: "第一行\n第二行" }), textBox("extreme")
  ];
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: entries, measurements: [
    measurement("inconsistent", { x: 100, y: 100, w: 104, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("shrink", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("confidence", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("hidden", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("transparent", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("multiline", { x: 100, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 }),
    measurement("extreme", { x: 140, y: 100, w: 130, h: 18 }, { x: 100, y: 100, w: 100, h: 14 })
  ] });

  assert.deepEqual(result.evidence, { candidates: 2, accepted: 0 });
  assert.deepEqual(result.changes, []);
  assert.deepEqual(result.textBoxes, entries);
  for (let index = 0; index < entries.length; index += 1) assert.equal(result.textBoxes[index], entries[index]);
});

test("treats missing and ineligible measurements as no-ops", () => {
  const item = textBox("missing");
  const result = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [] });
  assert.deepEqual(result.evidence, { candidates: 0, accepted: 0 });
  assert.equal(result.textBoxes[0], item);
});

test("rejects malformed requests, out-of-slide measurement bounds, and ambiguous ids", () => {
  assert.throws(() => planMeasuredSingleLineTextFit(null), TypeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: Array(2001).fill(null), measurements: [] }), /text boxes are invalid/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: Array(2001).fill(null) }), /measurements are invalid/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize: { widthPt: 0, heightPt: 540 }, textBoxes: [], measurements: [] }), RangeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [textBox("same"), textBox("same")], measurements: [] }), /ambiguous/);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 959, y: 0, w: 2, h: 1 })] }), RangeError);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [], measurements: [measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 }), measurement("m", { x: 0, y: 0, w: 1, h: 1 }, { x: 0, y: 0, w: 1, h: 1 })] }), /ambiguous/);
});

test("rejects ratio caps and nonfinite evidence while preserving unrelated metadata", () => {
  const item = textBox("body"), original = structuredClone(item);
  const source = { x: 100, y: 100, w: 151, h: 20 }, rendered = { x: 100, y: 100, w: 100, h: 14 };
  const rejected = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", source, rendered)] });
  assert.equal(rejected.evidence.accepted, 0); assert.equal(rejected.textBoxes[0], item);
  assert.throws(() => planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", { ...source, w: Infinity }, rendered)] }), /bounds are invalid/);
  const accepted = planMeasuredSingleLineTextFit({ slideSize, textBoxes: [item], measurements: [measurement("body", { ...source, w: 130, h: 18 }, rendered)] });
  assert.equal(accepted.evidence.accepted, 1);
  assert.equal(accepted.textBoxes[0].source, item.source); assert.equal(accepted.textBoxes[0].style, item.style);
  assert.deepEqual(item, original);
});
