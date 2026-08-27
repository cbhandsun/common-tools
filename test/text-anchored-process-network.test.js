"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  createTextAnchoredProcessNetworkObjects,
  inferTextAnchoredProcessNetwork,
  _private: { detectSideInputIconBoxes }
} = require("../skills/pd-hifi-slideclone/scripts/lib/text-anchored-process-network");

test("infers a generic branch-join process network from OCR text geometry", () => {
  const region = { x: 48, y: 161, w: 819, h: 229 };
  const labels = [
    text("多源捕获", 128, 289, 65, 18),
    text("需求理解", 252, 289, 66, 18),
    text("业务目标", 385, 204, 67, 21),
    text("用户角色", 385, 266, 67, 21),
    text("边界条件", 385, 326, 67, 21),
    text("PRD生成", 519, 285, 69, 23),
    text("原型克隆", 651, 281, 65, 18),
    text("与同步", 658, 302, 50, 18),
    text("手册产出", 787, 287, 67, 21)
  ];

  const model = inferTextAnchoredProcessNetwork(region, labels, { widthPt: 960, heightPt: 540 });

  assert.ok(model);
  assert.equal(model.archetype, "text-anchored-branch-join-process");
  assert.equal(model.evidence.rowNodes, 5);
  assert.equal(model.evidence.branchNodes, 3);
  assert.equal(model.nodes.filter((node) => node.role === "branch").length, 3);
  assert.ok(model.connectors.length >= 12);
  assert.ok(model.connectors.some((connector) => connector.role === "feedback-top"));
  assert.ok(model.connectors.some((connector) => connector.role === "feedback-bottom"));
  assert.equal(model.connectors.filter((connector) => connector.role === "tool-output" && connector.endArrow === "triangle").length, 2);
  assert.equal(model.nodes[0].role, "source");
  assert.ok(model.nodes[0].box.h > 200);
});

test("fails closed for prose-heavy screenshots and incomplete node layouts", () => {
  const region = { x: 40, y: 100, w: 840, h: 320 };
  const prose = Array.from({ length: 12 }, (_, index) => text(
    `这是截图中的一段很长的说明文字用于模拟界面内容${index}`,
    80 + (index % 3) * 250,
    140 + Math.floor(index / 3) * 55,
    220,
    24
  ));

  assert.equal(inferTextAnchoredProcessNetwork(region, prose), null);
  assert.equal(inferTextAnchoredProcessNetwork(region, [text("节点A", 100, 200, 50, 20)]), null);
  assert.equal(inferTextAnchoredProcessNetwork({}, []), null);
});

test("materialized network forces OCR text visible and keeps icon crops above labels", () => {
  const labels = [
    text("多源捕获", 128, 289, 65, 18), text("需求理解", 252, 289, 66, 18),
    text("业务目标", 385, 204, 67, 21), text("用户角色", 385, 266, 67, 21), text("边界条件", 385, 326, 67, 21),
    text("PRD生成", 519, 285, 69, 23), text("原型克隆", 651, 281, 65, 18), text("与同步", 658, 302, 50, 18),
    text("手册产出", 787, 287, 67, 21)
  ].map((item) => ({ ...item, font: { ...item.font, opacity: 0 } }));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-anchored-network-"));
  const result = createTextAnchoredProcessNetworkObjects([{
    id: "underlay",
    box: { x: 48, y: 161, w: 819, h: 229 },
    source: { detector: "screenshot-process-underlay-crop" }
  }], labels, blankImage(960, 540), { widthPt: 960, heightPt: 540 }, {
    assetDir: path.join(root, "assets"), irDir: root, deckName: "deck", pageIndex: 5
  });

  assert.equal(result.matched, true);
  assert.ok(result.textBoxes.every((item) => item.font.opacity === 1));
  assert.ok(result.textBoxes.every((item) => item.style.visibility === "visible" && item.style.opacity === 1));
  assert.equal(result.textBoxes.find((item) => item.text === "业务目标").font.color, "#FFFFFF");
  for (const crop of result.images) {
    const nodeIndex = Number(crop.id.match(/icon-(\d+)$/)?.[1]);
    const node = result.model.nodes.filter((item) => item.role !== "branch")[nodeIndex];
    assert.ok(crop.box.y + crop.box.h <= Math.min(...node.labels.map((label) => label.box.y)) - 7.9);
  }
});

test("detects a bounded vertical stack of source input icons and rejects incomplete evidence", () => {
  const image = blankImage(960, 540);
  const region = { x: 48, y: 161, w: 819, h: 229 };
  const model = inferTextAnchoredProcessNetwork(region, [
    text("多源捕获", 128, 289, 65, 18), text("需求理解", 252, 289, 66, 18),
    text("业务目标", 385, 204, 67, 21), text("用户角色", 385, 266, 67, 21), text("边界条件", 385, 326, 67, 21),
    text("PRD生成", 519, 285, 69, 23), text("原型克隆", 651, 281, 65, 18), text("与同步", 658, 302, 50, 18),
    text("手册产出", 787, 287, 67, 21)
  ]);
  for (const y of [171, 225, 279, 333]) fillRect(image, 56, y, 30, 30, "#486A86");

  const boxes = detectSideInputIconBoxes(image, model, region, { widthPt: 960, heightPt: 540 });
  assert.equal(boxes.length, 4);
  assert.ok(boxes.every((box) => box.x >= region.x && box.x + box.w < model.nodes[0].box.x));

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "text-anchored-inputs-"));
  const result = createTextAnchoredProcessNetworkObjects([{
    id: "underlay",
    box: region,
    source: { detector: "screenshot-process-underlay-crop" }
  }], model.nodes.flatMap((node) => node.labels), image, { widthPt: 960, heightPt: 540 }, {
    assetDir: path.join(root, "assets"), irDir: root, deckName: "deck", pageIndex: 5
  });
  const inputConnectors = result.shapes.filter((shape) => shape.source?.connectorRole === "source-input");
  assert.equal(inputConnectors.length, 4);
  assert.ok(inputConnectors.every((shape) => shape.box.h === 0));
  assert.ok(inputConnectors.every((shape) => Math.abs(shape.box.x + shape.box.w - model.nodes[0].box.x) < 0.01));

  const incomplete = blankImage(960, 540);
  fillRect(incomplete, 56, 171, 30, 30, "#486A86");
  assert.deepEqual(detectSideInputIconBoxes(incomplete, model, region), []);
});

function text(value, x, y, w, h) {
  return { text: value, box: { x, y, w, h }, font: { sizePt: 14, color: "#111111" } };
}

function blankImage(width, height) {
  const rgba = Buffer.alloc(width * height * 4, 255);
  return { width, height, rgba };
}

function fillRect(image, x, y, w, h, color) {
  const rgb = color.match(/[a-f\d]{2}/gi).map((part) => parseInt(part, 16));
  for (let yy = y; yy < y + h; yy += 1) {
    for (let xx = x; xx < x + w; xx += 1) {
      const offset = (yy * image.width + xx) * 4;
      image.rgba[offset] = rgb[0];
      image.rgba[offset + 1] = rgb[1];
      image.rgba[offset + 2] = rgb[2];
      image.rgba[offset + 3] = 255;
    }
  }
}
