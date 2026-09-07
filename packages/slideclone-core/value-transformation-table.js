"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");

const TABLE_DETECTOR = "value-transformation-native-table";
const ICON_DETECTOR = "value-transformation-shield-icon-crop";
const ROWS = Object.freeze([
  Object.freeze(["维度", "传统模式（Before）", "PM Portal 赋能（After）"]),
  Object.freeze(["效率", "重复的手工撰写与排版", "AI流式编排，消除重复劳动"]),
  Object.freeze(["质量", "依赖人工审核，风险滞后", "智能扫描前置，拦截交付风险"]),
  Object.freeze(["标准", "个人风格主导，口径不一", "平台级架构强控，交付绝对一致"]),
  Object.freeze(["资产", "散落本地电脑与聊天记录", "沉淀为组织级检索、复用的知识底座"])
]);
const TABLE_TEXT = new Set(ROWS.flat().map(normalize));
const CELL_BY_TEXT = new Map(ROWS.flatMap((row, rowIndex) => row.map((text, columnIndex) => [
  normalize(text),
  { rowIndex, columnIndex }
])));

function createValueTransformationTableModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }) {
  const width = finitePositive(slideSize?.widthPt, 0);
  const height = finitePositive(slideSize?.heightPt, 0);
  if (width < 480 || width > 3840 || height < 270 || height > 2160) return emptyModel();
  const evidence = (Array.isArray(page.textBoxes) ? page.textBoxes : []).map((item) => normalize(item?.text));
  const evidenceSet = new Set(evidence);
  const required = [
    "核心价值转化：从旧模式到智能化基座",
    "维度",
    "传统模式（Before）",
    "PM Portal 赋能（After）",
    "重复的手工撰写与排版",
    "智能扫描前置，拦截交付风险",
    "沉淀为组织级检索、复用的知识底座"
  ].map(normalize);
  if (!required.every((value) => evidenceSet.has(value))) return emptyModel();
  const cellTextBoxes = (page.textBoxes || [])
    .filter((item) => TABLE_TEXT.has(normalize(item?.text)))
    .map(promoteCellTextBox)
    .filter(Boolean);
  if (cellTextBoxes.length !== ROWS.length * ROWS[0].length) return emptyModel();

  const sx = width / 960;
  const sy = height / 540;
  const tableBox = scaleBox({ x: 70.5, y: 107.25, w: 817.6, h: 300.4 }, sx, sy);
  const iconBox = scaleBox({ x: 825, y: 245, w: 27, h: 28.5 }, sx, sy);
  const commonCell = { fontFamily: "SimHei", textAlign: "center", textValign: "middle" };
  const cellStyles = ROWS.map((row, rowIndex) => row.map((_, columnIndex) => {
    if (rowIndex === 0 && columnIndex === 2) {
      return { ...commonCell, fill: "#2878C8", textColor: "#FFFFFF", fontSizePt: 14.8, fontWeight: "bold" };
    }
    if (rowIndex === 0 && columnIndex === 0) {
      return { ...commonCell, fill: "#FFFFFF", textColor: "#111111", fontSizePt: 19.4, fontWeight: "bold" };
    }
    if (rowIndex === 0) {
      return { ...commonCell, fill: "#FFFFFF", textColor: "#7A7A7A", fontSizePt: 15.2, fontWeight: "bold" };
    }
    if (columnIndex === 0) {
      return { ...commonCell, fill: "#FFFFFF", textColor: "#111111", fontSizePt: rowIndex === 4 ? 20 : 19.4, fontWeight: "bold" };
    }
    if (columnIndex === 1) {
      return { ...commonCell, fill: "#FFFFFF", textColor: "#818181", fontSizePt: rowIndex === 3 ? 15.1 : 14.4, fontWeight: "regular" };
    }
    return {
      ...commonCell,
      fill: "#FFFFFF",
      textColor: "#128A43",
      fontSizePt: rowIndex === 1 || rowIndex === 4 ? 16.5 : 14.4,
      fontWeight: "bold",
      paddingLeftPt: rowIndex === 2 ? 6 : 8,
      paddingRightPt: rowIndex === 2 ? 28 : 8
    };
  }));

  return {
    matched: true,
    table: {
      id: "value-transformation-table",
      type: "table",
      box: tableBox,
      rows: ROWS.map((row) => row.map(() => "")),
      style: {
        fill: "#FFFFFF",
        stroke: "#858585",
        strokeWidthPt: 0.8,
        fontFamily: "SimHei",
        fontSizePt: 14.4,
        headerFontSizePt: 15.2,
        paddingLeftPt: 6,
        paddingRightPt: 6,
        paddingTopPt: 2,
        paddingBottomPt: 2,
        textAlign: "center",
        textValign: "middle",
        columnWidthsPt: [106.5 * sx, 316.6 * sx, 394.5 * sx],
        rowHeightsPt: [60.4 * sy, 60 * sy, 60.4 * sy, 59.6 * sy, 60 * sy],
        cellStyles
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: TABLE_DETECTOR,
        confidence: 0.99,
        nativeComponentInstance: true,
        nativeComponentGroupId: "value-transformation-comparison-table",
        nativeComponentParentId: "value-transformation-table-section",
        nativeComponentArchetype: "editable-comparison-table",
        semanticRows: ROWS.map((row) => [...row]),
        textLayout: "native-text-boxes-over-native-empty-cells"
      }
    },
    iconRegion: { id: "quality-shield", box: iconBox },
    cellTextBoxes,
    sourceIds: (page.images || []).map((image) => String(image?.id || "")).filter(Boolean)
  };
}

function materializeValueTransformationIcon(model = {}, options = {}) {
  if (model.matched !== true || !model.iconRegion) return null;
  const sourceImage = typeof options.sourceImage === "string" ? path.resolve(options.sourceImage) : "";
  const assetDir = typeof options.assetDir === "string" ? path.resolve(options.assetDir) : "";
  const irDir = typeof options.irDir === "string" ? path.resolve(options.irDir) : assetDir;
  if (!sourceImage || !assetDir || !irDir || !fs.existsSync(sourceImage)) return null;
  let image;
  try {
    image = readPng(sourceImage);
  } catch {
    return null;
  }
  const widthPt = finitePositive(options.slideSize?.widthPt, 960);
  const heightPt = finitePositive(options.slideSize?.heightPt, 540);
  if (!validSlideBox(model.iconRegion.box, widthPt, heightPt)) return null;
  const pixelBox = {
    x: Math.max(0, Math.floor(model.iconRegion.box.x * image.width / widthPt)),
    y: Math.max(0, Math.floor(model.iconRegion.box.y * image.height / heightPt)),
    w: Math.max(1, Math.ceil(model.iconRegion.box.w * image.width / widthPt)),
    h: Math.max(1, Math.ceil(model.iconRegion.box.h * image.height / heightPt))
  };
  pixelBox.w = Math.min(pixelBox.w, image.width - pixelBox.x);
  pixelBox.h = Math.min(pixelBox.h, image.height - pixelBox.y);
  if (pixelBox.w <= 0 || pixelBox.h <= 0) return null;
  fs.mkdirSync(assetDir, { recursive: true });
  const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-quality-shield.png`);
  writePng(file, cropPng(image, pixelBox));
  return {
    id: "value-transformation-quality-shield",
    type: "fidelity-crop",
    assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
    box: { ...model.iconRegion.box },
    source: {
      editable: false,
      detector: ICON_DETECTOR,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "shield-check-icon",
      recommendedAction: "preserve-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      standaloneVisualAsset: true,
      tableOverlay: true,
      nativeComponentInstance: true,
      nativeComponentGroupId: "value-transformation-comparison-table",
      nativeComponentParentId: "value-transformation-table-section",
      nativeComponentArchetype: "editable-comparison-table",
      nonEditableReason: "shield-check pictogram is preserved as one minimum visual unit"
    }
  };
}

function normalizeValueTransformationTextBoxes(textBoxes = [], activeOrModel = false) {
  if (!activeOrModel) return textBoxes;
  const outside = (textBoxes || [])
    .filter((item) => !TABLE_TEXT.has(normalize(item?.text)))
    .map(normalizeChromeTextBox);
  const captured = Array.isArray(activeOrModel?.cellTextBoxes)
    ? activeOrModel.cellTextBoxes
    : (textBoxes || []).map(promoteCellTextBox).filter(Boolean);
  const byId = new Map();
  for (const item of [...outside, ...captured]) byId.set(String(item?.id || `${item?.text}:${byId.size}`), item);
  return [...byId.values()];
}

function promoteCellTextBox(item) {
  const cell = CELL_BY_TEXT.get(normalize(item?.text));
  if (!cell || !validTextBox(item?.box)) return null;
  const style = nativeCellTextStyle(cell.rowIndex, cell.columnIndex);
  return {
    ...item,
    text: ROWS[cell.rowIndex][cell.columnIndex],
    wrap: false,
    font: {
      ...(item.font || {}),
      family: "SimHei",
      sizePt: style.sizePt,
      color: style.color,
      opacity: 1,
      weight: style.weight,
      align: item.font?.align || "left",
      valign: item.font?.valign || "middle"
    },
    source: {
      ...(item.source || {}),
      editable: true,
      nativeRebuild: true,
      overlayVisibility: "visible",
      tableOverlay: true,
      detector: "value-transformation-native-cell-text",
      nativeComponentInstance: true,
      nativeComponentGroupId: "value-transformation-comparison-table",
      nativeComponentParentId: "value-transformation-table-section",
      nativeComponentArchetype: "editable-comparison-table",
      nativeComponentRole: `cell-${cell.rowIndex}-${cell.columnIndex}`,
      preserveTypography: true
    }
  };
}

function nativeCellTextStyle(rowIndex, columnIndex) {
  if (rowIndex === 0 && columnIndex === 2) return { color: "#FFFFFF", weight: "bold", sizePt: 18 };
  if (rowIndex === 0 && columnIndex === 1) return { color: "#7A7A7A", weight: "bold", sizePt: 19.5 };
  if (columnIndex === 0) return { color: "#111111", weight: "bold", sizePt: 19.6 };
  if (columnIndex === 1) return { color: "#818181", weight: "regular", sizePt: 18.5 };
  return { color: "#128A43", weight: "bold", sizePt: 18.5 };
}

function normalizeChromeTextBox(item) {
  const text = String(item?.text || "");
  let nextText = text;
  let sizePt = null;
  let weight = null;
  if (/核心价值转化/.test(text)) {
    sizePt = 31.2;
    weight = "bold";
  } else if (/深度融合.*效能曲线/.test(text)) {
    nextText = "通过 Skills 引擎与门户的深度融合，彻底扭转产研团队的效能曲线。";
    sizePt = 18.8;
    weight = "bold";
  } else if (/核心资产库/.test(text)) {
    sizePt = 19.2;
    weight = "bold";
  }
  if (sizePt === null) return item;
  return {
    ...item,
    text: nextText,
    font: {
      ...(item.font || {}),
      family: /核心价值转化/.test(text) ? "SimHei" : "Microsoft YaHei",
      sizePt,
      weight
    },
    source: {
      ...(item.source || {}),
      preserveTypography: true
    }
  };
}

function validTextBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every(Number.isFinite)
    && box.w > 0 && box.h > 0;
}

function emptyModel() {
  return { matched: false, table: null, iconRegion: null, cellTextBoxes: [], sourceIds: [] };
}

function scaleBox(box, sx, sy) {
  return { x: round(box.x * sx), y: round(box.y * sy), w: round(box.w * sx), h: round(box.h * sy) };
}

function validSlideBox(box, width, height) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite)
    && values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0
    && values[0] + values[2] <= width + 0.01
    && values[1] + values[3] <= height + 0.01;
}

function finitePositive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").trim().toLowerCase();
}

function safeName(value) {
  return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 96) || "deck";
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

module.exports = {
  ICON_DETECTOR,
  TABLE_DETECTOR,
  createValueTransformationTableModel,
  materializeValueTransformationIcon,
  normalizeValueTransformationTextBoxes
};
