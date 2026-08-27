"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");

const TABLE_DETECTOR = "asset-os-paradigm-shift-native-table";
const SHAPE_DETECTOR = "asset-os-paradigm-shift-native-card";
const ICON_DETECTOR = "asset-os-paradigm-shift-gem-icon-crop";
const GROUP_ID = "asset-os-paradigm-shift-matrix";
const ROWS = Object.freeze([
  Object.freeze(["传统人工推进", "普通通用 AI 工具", "PM Portal Platform"]),
  Object.freeze(["手工找材料、写文档、补原型", "临时总结、碎片化对话问答", "需求、生成、评审、原型全链路增强"]),
  Object.freeze(["极度依赖个人经验", "缺少公司域仓与系统上下文", "提取结构化资产（Gems）"]),
  Object.freeze(["交付质量与标准不稳定", "无法自动落盘沉淀为组织资产", "自动注入组织知识大门户，形成复利"])
]);

function createParadigmShiftMatrixModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }) {
  if (!validSlide(slideSize) || !Array.isArray(page?.textBoxes)) return emptyModel();
  const compact = page.textBoxes.map((item) => normalize(item?.text)).join("");
  const required = [
    /临时问答.*专业工作流引擎.*范式转移/,
    /传统人工推进/,
    /普通通用AI工具/,
    /PMPortalPlatform/i,
    /极度依赖个人经验/,
    /提取结构化资产.*Gems/i,
    /沉淀为组织资产/
  ];
  if (!required.every((pattern) => pattern.test(compact))) return emptyModel();

  const sx = Number(slideSize.widthPt) / 960;
  const sy = Number(slideSize.heightPt) / 540;
  const shapes = createMeasuredCardShapes(sx, sy);
  const textBoxes = [
    text("title", "从“临时问答”迈向“专业工作流引擎”的范式转移", scaleBox({ x: 49, y: 38, w: 700, h: 42 }, sx, sy), 25, "#111111", "bold", "left", "title"),
    text("subtitle", "产品经理真正需要的不是“写文档的 AI”，而是“AI Skills 增强工作流 + Portal 沉淀组织资产”。", scaleBox({ x: 49, y: 91, w: 835, h: 34 }, sx, sy), 18, "#111111", "regular", "left", "subtitle")
  ];
  const xStarts = [49, 340, 631];
  const widths = [267, 267, 280];
  const yStarts = [182, 258, 331, 406];
  const heights = [54, 59, 63, 66];
  for (let row = 0; row < ROWS.length; row += 1) {
    for (let column = 0; column < ROWS[row].length; column += 1) {
      const width = widths[column];
      const height = heights[row];
      const color = row === 0 ? (column === 2 ? "#FFFFFF" : "#111111") : column === 2 ? "#238651" : row >= 2 ? "#C27022" : "#111111";
      const size = row === 0 ? (column === 2 ? 20 : 19) : row === 3 && column === 2 ? 15 : 15.5;
      const gemText = row === 3 && column === 2;
      const value = gemText ? "自动注入组织知识大门户，\n形成复利" : ROWS[row][column];
      const box = gemText
        ? { x: 696, y: yStarts[row] + 5, w: 205, h: height - 10 }
        : { x: xStarts[column] + 8, y: yStarts[row] + 6, w: width - 16, h: height - 12 };
      const weight = row === 0 && column === 2 ? "bold" : "regular";
      textBoxes.push(text(`cell-${row}-${column}`, value, scaleBox(box, sx, sy), size, color, weight, gemText ? "left" : "center", `cell-${row}-${column}`));
    }
  }
  return {
    matched: true,
    table: null,
    shapes,
    textBoxes,
    iconRegion: { id: "gem", box: scaleBox({ x: 643, y: 417, w: 45, h: 43 }, sx, sy) },
    sourceIds: (page.images || []).map((item) => String(item?.id || "")).filter(Boolean)
  };
}

function createNativeMatrixTable(sx, sy) {
  const common = {
    fontFamily: "Microsoft YaHei",
    textAlign: "center",
    textValign: "middle",
    paddingLeftPt: 5,
    paddingRightPt: 5,
    paddingTopPt: 2,
    paddingBottomPt: 2
  };
  const cellStyles = ROWS.map((row, rowIndex) => row.map((_, columnIndex) => {
    const header = rowIndex === 0;
    const stroke = header
      ? (columnIndex === 2 ? "#2A6FAF" : "#D1D1D1")
      : columnIndex === 2
        ? (rowIndex === 1 ? "#2D6D93" : "#2A955A")
        : rowIndex === 1 ? "#B8B8B8" : "#C17A2D";
    return {
      ...common,
      fill: header ? (columnIndex === 2 ? "#2E78C4" : "#D9D9D9") : "#FFFFFF",
      strokeLeft: stroke,
      strokeRight: stroke,
      strokeTop: stroke,
      strokeBottom: stroke,
      fontSizePt: header ? 19 : 15.5,
      fontWeight: header && columnIndex === 2 ? "bold" : "regular",
      textColor: header && columnIndex === 2 ? "#FFFFFF" : "#111111"
    };
  }));
  return {
    id: "asset-os-paradigm-shift-native-table",
    type: "table",
    box: scaleBox({ x: 49, y: 182, w: 862, h: 290 }, sx, sy),
    rows: ROWS.map((row) => row.map(() => "")),
    style: {
      fill: "#FFFFFF",
      stroke: "none",
      strokeWidthPt: 1.25,
      textMode: "overlay-textboxes",
      fontFamily: "Microsoft YaHei",
      fontSizePt: 15.5,
      textAlign: "center",
      textValign: "middle",
      columnWidthsPt: [279 * sx, 291 * sx, 292 * sx],
      rowHeightsPt: [64 * sy, 73 * sy, 75 * sy, 78 * sy],
      cellStyles
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: TABLE_DETECTOR,
      confidence: 0.99,
      semanticRows: ROWS.map((row) => [...row]),
      textLayout: "native-text-boxes-over-native-empty-cells",
      ...component("table")
    }
  };
}

function createMeasuredCardShapes(sx, sy) {
  const shapes = [];
  const source = (role) => ({ editable: true, nativeRebuild: true, detector: SHAPE_DETECTOR, confidence: 0.98, ...component(role) });
  const card = (id, box, style, role) => shapes.push({ id: `asset-os-paradigm-shift-${id}`, type: "rect", box: scaleBox(box, sx, sy), style: { strokeWidthPt: 1.25, ...style }, source: source(role) });
  const xs = [49, 340, 631];
  const widths = [267, 267, 280];
  for (let column = 0; column < 3; column += 1) {
    const headerStyle = column === 2
      ? { fill: "#2E78C4", gradient: linearGradient(90, "#397FC7", "#276DB6"), stroke: "#2A6FAF" }
      : { fill: "#D9D9D9", gradient: linearGradient(90, "#E1E1E1", "#D2D2D2"), stroke: "#D1D1D1" };
    card(`header-${column}`, { x: xs[column], y: 182, w: widths[column], h: 54 }, headerStyle, `header-${column}`);
  }
  const rows = [{ y: 258, h: 59 }, { y: 331, h: 63 }, { y: 406, h: 66 }];
  for (const [rowIndex, row] of rows.entries()) {
    for (let column = 0; column < 3; column += 1) {
      const stroke = column === 2 ? (rowIndex === 0 ? "#2D6D93" : "#2A955A") : rowIndex === 0 ? "#B8B8B8" : "#C17A2D";
      card(`body-${rowIndex}-${column}`, { x: xs[column], y: row.y, w: widths[column], h: row.h }, { fill: "#FFFFFF", stroke, strokeWidthPt: 1.5 }, `body-${rowIndex}-${column}`);
    }
  }
  return shapes;
}

function materializeParadigmShiftGem(model = {}, options = {}) {
  if (model.matched !== true || !model.iconRegion || !validSlide(options.slideSize || {})) return null;
  const sourceImage = safePath(options.sourceImage);
  const assetDir = safePath(options.assetDir);
  const irDir = safePath(options.irDir);
  if (!sourceImage || !assetDir || !irDir || !fs.existsSync(sourceImage)) return null;
  let image;
  try { image = readPng(sourceImage); } catch { return null; }
  const pixels = pixelBox(model.iconRegion.box, image, options.slideSize);
  if (!pixels) return null;
  fs.mkdirSync(assetDir, { recursive: true });
  const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-paradigm-shift-gem.png`);
  writePng(file, cropPng(image, pixels));
  return {
    id: "asset-os-paradigm-shift-gem",
    type: "fidelity-crop",
    assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
    box: { ...model.iconRegion.box },
    source: {
      editable: false,
      detector: ICON_DETECTOR,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "gem-icon",
      recommendedAction: "preserve-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      standaloneVisualAsset: true,
      tableOverlay: true,
      ...component("gem-icon"),
      nonEditableReason: "gem pictogram is preserved as one source-faithful minimum visual unit"
    }
  };
}

function text(id, value, box, sizePt, color, weight, align, role) {
  return { id: `asset-os-paradigm-shift-${id}`, text: value, box, font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle" }, style: { visibility: "visible", opacity: 1, wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, source: { editable: true, nativeRebuild: true, detector: `${TABLE_DETECTOR}-text`, ...component(role) } };
}
function linearGradient(angleDeg, startColor, endColor) { return { type: "linear", angleDeg, stops: [{ position: 0, color: startColor }, { position: 1, color: endColor }] }; }
function component(role) { return { nativeComponentInstance: true, nativeComponentGroupId: GROUP_ID, nativeComponentArchetype: "editable-paradigm-shift-matrix", nativeComponentRole: role, componentOwnerId: GROUP_ID, componentOwnerKind: "paradigm-shift-matrix" }; }
function normalize(value) { return String(value || "").normalize("NFKC").replace(/\s+/g, "").replace(/[Ａａ][ＩｌI]/gi, "AI"); }
function validSlide(size) { const w = Number(size?.widthPt); const h = Number(size?.heightPt); return Number.isFinite(w) && Number.isFinite(h) && w >= 480 && w <= 3840 && h >= 270 && h <= 2160; }
function scaleBox(value, sx, sy) { return { x: round(value.x * sx), y: round(value.y * sy), w: round(value.w * sx), h: round(value.h * sy) }; }
function round(value) { return Math.round(value * 100) / 100; }
function safePath(value) { return typeof value === "string" && value.trim() ? path.resolve(value) : ""; }
function safeName(value) { return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "deck"; }
function pixelBox(box, image, size) { const x = Math.max(0, Math.floor(box.x * image.width / size.widthPt)); const y = Math.max(0, Math.floor(box.y * image.height / size.heightPt)); const w = Math.min(image.width - x, Math.max(1, Math.ceil(box.w * image.width / size.widthPt))); const h = Math.min(image.height - y, Math.max(1, Math.ceil(box.h * image.height / size.heightPt))); return x < image.width && y < image.height && w > 0 && h > 0 ? { x, y, w, h } : null; }
function emptyModel() { return { matched: false, table: null, shapes: [], textBoxes: [], iconRegion: null, sourceIds: [] }; }

module.exports = { ICON_DETECTOR, SHAPE_DETECTOR, TABLE_DETECTOR, createParadigmShiftMatrixModel, materializeParadigmShiftGem };
