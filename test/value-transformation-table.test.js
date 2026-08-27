"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { readPng, writePng } = require("../skills/pd-hifi-slideclone/scripts/lib/png");
const {
  ICON_DETECTOR,
  TABLE_DETECTOR,
  createValueTransformationTableModel,
  materializeValueTransformationIcon,
  normalizeValueTransformationTextBoxes
} = require("../skills/pd-hifi-slideclone/scripts/lib/value-transformation-table");

const values = [
  "核心价值转化：从旧模式到智能化基座",
  "维度", "传统模式（Before）", "PM Portal 赋能（After）",
  "效率", "重复的手工撰写与排版", "AI流式编排，消除重复劳动",
  "质量", "依赖人工审核，风险滞后", "智能扫描前置，拦截交付风险",
  "标准", "个人风格主导，口径不一", "平台级架构强控，交付绝对一致",
  "资产", "散落本地电脑与聊天记录", "沉淀为组织级检索、复用的知识底座",
  "通过 Skills 引擎与门户的深度融合，彻底扭转产研团队的效能曲线。"
];

function fixture() {
  return {
    images: [{ id: "native-graphic-underlay" }],
    textBoxes: values.map((text, index) => ({ text, box: { x: 10, y: 10 + index * 20, w: 200, h: 18 } }))
  };
}

test("value transformation model emits one semantic table with per-cell styling", () => {
  const model = createValueTransformationTableModel(fixture(), { widthPt: 960, heightPt: 540 });

  assert.equal(model.matched, true);
  assert.equal(model.table.source.detector, TABLE_DETECTOR);
  assert.equal(model.table.source.nativeComponentGroupId, "value-transformation-comparison-table");
  assert.deepEqual(model.table.rows.map((row) => row.length), [3, 3, 3, 3, 3]);
  assert.ok(model.table.rows.flat().every((text) => text === ""));
  assert.equal(model.table.source.semanticRows[2][2], "智能扫描前置，拦截交付风险");
  assert.equal(model.cellTextBoxes.length, 15);
  assert.equal(model.table.style.columnWidthsPt.length, 3);
  assert.equal(model.table.style.rowHeightsPt.length, 5);
  assert.equal(model.table.style.cellStyles[0][2].fill, "#2878C8");
  assert.equal(model.table.style.cellStyles[2][2].textColor, "#128A43");
});

test("value transformation model rejects incomplete evidence and unsafe dimensions", () => {
  const incomplete = fixture();
  incomplete.textBoxes = incomplete.textBoxes.filter((item) => item.text !== "智能扫描前置，拦截交付风险");

  assert.equal(createValueTransformationTableModel(incomplete, { widthPt: 960, heightPt: 540 }).matched, false);
  assert.equal(createValueTransformationTableModel(fixture(), { widthPt: Number.NaN, heightPt: 540 }).matched, false);
  assert.equal(createValueTransformationTableModel(fixture(), { widthPt: 1e9, heightPt: 540 }).matched, false);
});

test("value transformation icon is one protected minimum-unit crop", () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), "value-transformation-table-"));
  const sourceImage = path.join(temp, "source.png");
  const assetDir = path.join(temp, "assets");
  writePng(sourceImage, { width: 1920, height: 1080, rgba: Buffer.alloc(1920 * 1080 * 4, 255) });
  const model = createValueTransformationTableModel(fixture(), { widthPt: 960, heightPt: 540 });

  const icon = materializeValueTransformationIcon(model, {
    sourceImage,
    assetDir,
    irDir: temp,
    deckName: "value-table",
    pageIndex: 12,
    slideSize: { widthPt: 960, heightPt: 540 }
  });

  assert.equal(icon.source.detector, ICON_DETECTOR);
  assert.equal(icon.source.intentionalMinimumUnitCrop, true);
  assert.equal(icon.source.tableOverlay, true);
  assert.equal(icon.source.nativeComponentGroupId, model.table.source.nativeComponentGroupId);
  assert.equal(readPng(path.resolve(temp, icon.assetPath)).width, 54);
  assert.equal(materializeValueTransformationIcon(model, { sourceImage: path.join(temp, "missing.png"), assetDir, irDir: temp }), null);
});

test("value transformation text normalization restores captured cells after generic filtering", () => {
  const model = createValueTransformationTableModel(fixture(), { widthPt: 960, heightPt: 540 });
  const chromeOnly = fixture().textBoxes.filter((item) => !values.slice(1, 16).includes(item.text));
  const boxes = normalizeValueTransformationTextBoxes(chromeOnly, model);

  assert.equal(boxes.length, values.length);
  const header = boxes.find((item) => item.text === "PM Portal 赋能（After）");
  const after = boxes.find((item) => item.text === "智能扫描前置，拦截交付风险");
  assert.equal(header.font.color, "#FFFFFF");
  assert.equal(header.font.family, "SimHei");
  assert.equal(header.font.sizePt, 18);
  assert.equal(header.wrap, false);
  assert.equal(after.font.color, "#128A43");
  assert.equal(after.font.sizePt, 18.5);
  assert.equal(after.font.opacity, 1);
  assert.equal(after.source.detector, "value-transformation-native-cell-text");
  assert.equal(after.source.tableOverlay, true);
  assert.equal(after.source.nativeComponentGroupId, "value-transformation-comparison-table");
  assert.equal(after.source.preserveTypography, true);
  const footer = boxes.find((item) => /深度融合/.test(item.text));
  assert.equal(footer.text, "通过 Skills 引擎与门户的深度融合，彻底扭转产研团队的效能曲线。");
  assert.equal(footer.font.family, "Microsoft YaHei");
  assert.equal(footer.font.sizePt, 18.8);
  assert.equal(footer.font.weight, "bold");
});
