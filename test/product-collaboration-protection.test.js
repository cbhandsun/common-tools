"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createProductCollaborationChallengeObjects } = require("../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
const { dropFalseTableOverlaysOnProtectedCollaborationDiagram, normalizeAssetOsFlowChromeTextBoxes, normalizeProtectedProductCollaborationChromeTextBoxes } = require("../skills/pd-hifi-slideclone/scripts/lib/product-collaboration-protection");

test("protected collaboration chrome corrects OCR text and source-aligned typography only on protected pages", () => {
  const textBoxes = [
    { text: "传统产研协作的“摘增”挑战", box: {}, font: {}, style: {}, source: {} },
    { text: "业务复杂度持续上升，产品工作流却高度依赖“人工流转”与“零散工具”。", box: {}, font: {}, style: {}, source: {} }
  ];
  const untouched = JSON.parse(JSON.stringify(textBoxes));
  normalizeProtectedProductCollaborationChromeTextBoxes(textBoxes, []);
  assert.deepEqual(textBoxes, untouched);
  normalizeProtectedProductCollaborationChromeTextBoxes(textBoxes, [{ source: { productCollaborationChallengeProtected: true } }]);
  assert.equal(textBoxes[0].text, "传统产研协作的“熵增”挑战");
  assert.deepEqual(textBoxes[0].box, { x: 38.98, y: 33.75, w: 332.87, h: 22.5 });
  assert.equal(textBoxes[0].font.sizePt, 27);
  assert.equal(textBoxes[1].font.sizePt, 14.5);
  assert.ok(textBoxes.every((item) => item.source.protectedCollaborationChromeNormalized === true));
});

test("asset OS flow chrome fills its OCR evidence boxes with source-scale typography", () => {
  const textBoxes = [
    { text: "产研资产的中枢操作系统", box: { x: 199.8, y: 51.38, w: 558.91, h: 40.88 }, font: { sizePt: 42.92 }, source: {} },
    { text: "基于AI Skills提炼与沉淀高价值产品资产（Gems）的全新范式", box: { x: 166.81, y: 109.88, w: 624.88, h: 22.88 }, font: { sizePt: 16.47 }, source: {} },
    { text: "将产品交付从“靠人整理”跃升为“有链路、有沉淀”的数字化流水线", box: { x: 215.92, y: 152.63, w: 531.92, h: 16.88 }, font: { sizePt: 12.15 }, source: {} },
    { text: "无关正文", box: { x: 10, y: 10, w: 80, h: 20 }, font: { sizePt: 12 }, source: {} }
  ];
  assert.equal(normalizeAssetOsFlowChromeTextBoxes(null, true).length, 0);
  assert.deepEqual(normalizeAssetOsFlowChromeTextBoxes(textBoxes, false), textBoxes);
  const normalized = normalizeAssetOsFlowChromeTextBoxes(textBoxes, true);
  assert.equal(normalized[0].font.sizePt, 51.8);
  assert.equal(normalized[1].text, "基于 AI Skills 提炼与沉淀高价值产品资产（Gems）的全新范式");
  assert.equal(normalized[1].font.sizePt, 21.8);
  assert.equal(normalized[2].font.sizePt, 16.6);
  assert.deepEqual(normalized[3], textBoxes[3]);
  assert.ok(normalized.slice(0, 3).every((item) => item.style.wrap === false));
  assert.ok(normalized.slice(0, 3).every((item) => item.source.assetOsFlowChromeNormalized === true));
});

test("protected collaboration separates the diagram from its distant value banner", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "product-collaboration-protected-"));
  try {
    const sourceImage = makeImage(960, 540, "#FFFFFF");
    const image = { id: "asset-hub-challenge", box: { x: 36.74, y: 124.5, w: 886.15, h: 380.25 }, source: { detector: "foreground-graphic-underlay-crop", reason: "table-or-grid-graphics-preserved-as-underlay-crop", layer: { layerType: "table-zone", diagramUnderstanding: { archetype: "matrix-or-grid" } } } };
    const textBoxes = [
      { text: "传统产研协作的“摘增”挑战", box: { x: 38.98, y: 33.75, w: 332.87, h: 22.5 } },
      { text: "协作断层：文档分散，查找与核对成本极高", box: { x: 341.87, y: 123.75, w: 280.02, h: 16.88 } },
      { text: "飞书需求", box: { x: 97.84, y: 161.63, w: 58.85, h: 28.88 } },
      { text: "会议截图", box: { x: 157.81, y: 218.25, w: 61.1, h: 27.75 } },
      { text: "口头反馈", box: { x: 77.97, y: 267, w: 60.73, h: 25.5 } },
      { text: "过期旧PRD", box: { x: 143.94, y: 317.63, w: 76.84, h: 28.5 } },
      { text: "评审低效：依赖人工经验，风险往往暴露太晚", box: { x: 452.82, y: 188.25, w: 278.14, h: 19.13 } },
      { text: "版本漂移：规则散落，同功能增量极易互相覆盖", box: { x: 396.97, y: 411.75, w: 295.76, h: 13.88 } },
      { text: "核心矛盾：瓶颈已不是“缺工具”，而是缺乏一条贯穿需求、文档、原型和评审的标准化资产链路", box: { x: 49.86, y: 480.38, w: 846.04, h: 19.88 } }
    ];
    const result = createProductCollaborationChallengeObjects([image], textBoxes, sourceImage, { widthPt: 960, heightPt: 540 }, { assetDir: root, irDir: root, deckName: "asset-hub", pageIndex: 1 });
    assert.equal(result.images.length, 2);
    assert.deepEqual(result.images.map((item) => item.source.productCollaborationChallengeProtectedRegion), ["diagram", "value-banner"]);
    assert.equal(result.images.every((item) => fs.existsSync(path.join(root, item.assetPath))), true);
    assert.equal(image.source.productCollaborationChallengeProtectedSplit, true);
    assert.ok(result.images.reduce((sum, item) => sum + item.box.w * item.box.h, 0) / (960 * 540) < 0.65);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("protected collaboration drops false table overlays from the same source layer", () => {
  const images = [{ id: "diagram", source: { productCollaborationChallengeProtected: true } }];
  const shapes = [
    { id: "false-fill", source: { detector: "table-zone-native-cell-fill", layerSourceId: "diagram" } },
    { id: "false-grid", source: { detector: "table-zone-native-grid-line", layerSourceId: "diagram" } },
    { id: "other-table", source: { detector: "table-zone-native-grid-line", layerSourceId: "real-table" } },
    { id: "connector", source: { detector: "layer-native-connector", layerSourceId: "diagram" } }
  ];
  assert.deepEqual(dropFalseTableOverlaysOnProtectedCollaborationDiagram(shapes, images).map((shape) => shape.id), ["other-table", "connector"]);
});

function makeImage(width, height, color) {
  const rgba = Buffer.alloc(width * height * 4);
  const channels = color.match(/[a-f\d]{2}/gi).map((part) => Number.parseInt(part, 16));
  for (let index = 0; index < width * height; index += 1) {
    rgba.set([...channels, 255], index * 4);
  }
  return { width, height, rgba };
}
