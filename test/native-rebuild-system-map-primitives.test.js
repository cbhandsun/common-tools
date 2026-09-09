"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  systemMapAssetGridTileSegments,
  systemMapBottomLabelTextBoxes,
  systemMapLine,
  systemMapShape
} = require("../packages/slideclone-native-engine/scripts/lib/native-rebuild-system-map-primitives");

test("system map shape normalizes coordinates and preserves source metadata", () => {
  const shape = systemMapShape("shape-1", "rect", {
    x: 10.1234,
    y: 20.5678,
    w: 30.9123,
    h: 40.3456
  }, { fill: "#126CB4" }, { detector: "system-map-native-test" });
  assert.equal(shape.id, "shape-1");
  assert.equal(shape.type, "rect");
  assert.deepEqual(shape.box, { x: 10.12, y: 20.57, w: 30.91, h: 40.35 });
  assert.equal(shape.source.detector, "system-map-native-test");
});

test("system map line creates a square-cap straight line shape", () => {
  const line = systemMapLine("line-1", { x: 10, y: 20 }, { x: 70, y: 50 }, "#126CB4", 1.25, {
    detector: "system-map-native-line"
  });
  assert.equal(line.type, "line");
  assert.equal(line.style.stroke, "#126CB4");
  assert.equal(line.style.strokeWidthPt, 1.25);
  assert.equal(line.style.connectorType, "straight");
  assert.equal(line.style.lineCap, "square");
  assert.equal(line.source.detector, "system-map-native-line");
});

test("system map asset grid tile segments encode each tile as a closed freeform cell", () => {
  const segments = systemMapAssetGridTileSegments(2, 10, 5, 25);
  assert.equal(segments.length, 10);
  assert.deepEqual(segments[0], { type: "moveTo", points: [{ x: 0, y: 0 }] });
  assert.deepEqual(segments[4], { type: "close", points: [] });
  assert.deepEqual(segments[5], { type: "moveTo", points: [{ x: 0.6, y: 0 }] });
  assert.deepEqual(segments[9], { type: "close", points: [] });
});

test("system map bottom label text boxes keep domain labels editable", () => {
  const labels = systemMapBottomLabelTextBoxes("map", {
    x: 10,
    y: 100,
    w: 800,
    h: 320
  }, { detector: "system-map-native-source" });
  assert.deepEqual(labels.map((label) => label.text), ["物流域", "供应链", "ERP", "财务"]);
  assert.equal(labels[0].font.family, "Microsoft YaHei");
  assert.equal(labels[0].font.color, "#6D8798");
  assert.equal(labels[0].source.detector, "system-map-native-label");
  assert.equal(labels[0].source.role, "bottom-domain-label");
});
