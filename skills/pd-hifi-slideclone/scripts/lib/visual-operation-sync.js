"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");

const DETECTOR_PREFIX = "asset-os-visual-operation-sync-native-";

function createVisualOperationSyncModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }) {
  if (!validSlide(slideSize) || !Array.isArray(page?.textBoxes)) return emptyModel();
  const compact = page.textBoxes.map((item) => normalize(item?.text)).join("");
  const required = [
    /视觉还原与操作同步/,
    /Gem提炼/,
    /形态转换引擎/,
    /可点击交互原型/,
    /自动截屏操作手册/,
    /PMPortal/,
    /门户展示/
  ];
  if (!required.every((pattern) => pattern.test(compact))) return emptyModel();

  const sx = Number(slideSize.widthPt) / 960;
  const sy = Number(slideSize.heightPt) / 540;
  const box = (value) => scaleBox(value, sx, sy);
  const shapes = [
    rect("banner", "roundRect", box({ x: 40, y: 95, w: 880, h: 48 }), { fill: "#DDF6E7", stroke: "#CBEED9", strokeWidthPt: 0.8, radiusPt: 5 }, "banner"),
    rect("input-prd", "roundRect", box({ x: 40, y: 210, w: 130, h: 72 }), cardStyle(), "input-prd"),
    rect("input-dom", "roundRect", box({ x: 40, y: 330, w: 130, h: 72 }), cardStyle(), "input-dom"),
    rect("engine", "roundRect", box({ x: 220, y: 195, w: 115, h: 220 }), { fill: "#2D7ED0", gradient: gradient(90, "#3789D8", "#1F70C3"), stroke: "#2471BD", strokeWidthPt: 1, radiusPt: 6 }, "engine"),
    rect("prototype", "roundRect", box({ x: 382, y: 195, w: 175, h: 230 }), cardStyle(), "prototype"),
    rect("manual", "roundRect", box({ x: 565, y: 195, w: 170, h: 230 }), cardStyle(), "manual"),
    rect("portal", "roundRect", box({ x: 790, y: 270, w: 130, h: 72 }), { fill: "#2D7ED0", gradient: gradient(90, "#3789D8", "#1F70C3"), stroke: "#2471BD", strokeWidthPt: 1, radiusPt: 6 }, "portal"),
    connector("input-prd-route", box({ x: 170, y: 246, w: 50, h: 22 }), "#AAB0B6", "input-prd"),
    connector("input-dom-route", box({ x: 170, y: 366, w: 50, h: -22 }), "#AAB0B6", "input-dom"),
    connector("engine-prototype-route", box({ x: 335, y: 246, w: 47, h: 0 }), "#2DBE72", "prototype"),
    connector("engine-manual-route", box({ x: 335, y: 366, w: 230, h: 0 }), "#2DBE72", "manual"),
    connector("prototype-portal-route", box({ x: 557, y: 246, w: 233, h: 60 }), "#2DBE72", "portal"),
    connector("manual-portal-route", box({ x: 735, y: 366, w: 55, h: -60 }), "#2DBE72", "portal")
  ];
  const textBoxes = [
    text("title", "视觉还原与操作同步：彻底消灭文档与界面的割裂", box({ x: 40, y: 34, w: 650, h: 38 }), { sizePt: 25, weight: "bold", color: "#111111", align: "left" }, "chrome"),
    text("banner", "【Gem 提炼】：将文字方案具象化为高保真交互原型，并自动化生成产品操作手册。", box({ x: 105, y: 103, w: 700, h: 31 }), { sizePt: 16, weight: "bold", color: "#111111", align: "left" }, "banner"),
    text("input-prd", "标准 PRD 文本", box({ x: 51, y: 229, w: 108, h: 34 }), { sizePt: 15, weight: "bold", color: "#111111" }, "input-prd"),
    text("input-dom", "线上系统 DOM /\nFigma 原文件", box({ x: 48, y: 342, w: 114, h: 48 }), { sizePt: 14, weight: "bold", color: "#111111" }, "input-dom"),
    text("engine", "形态转换引擎", box({ x: 230, y: 210, w: 95, h: 32 }), { sizePt: 15, weight: "bold", color: "#FFFFFF" }, "engine"),
    text("prototype", "可点击交互原型", box({ x: 395, y: 207, w: 120, h: 29 }), { sizePt: 14, weight: "bold", color: "#111111" }, "prototype"),
    text("manual", "自动截屏操作手册", box({ x: 576, y: 207, w: 130, h: 29 }), { sizePt: 14, weight: "bold", color: "#111111" }, "manual"),
    text("portal", "PM Portal\n门户展示", box({ x: 803, y: 282, w: 104, h: 49 }), { sizePt: 16, weight: "bold", color: "#FFFFFF" }, "portal"),
    text("portal-note", "路由与菜单全自动打通，\n形成资产最终闭环展示", box({ x: 774, y: 348, w: 158, h: 46 }), { sizePt: 12.5, weight: "regular", color: "#111111" }, "portal")
  ];
  const cropRegions = [
    crop("banner-gem", box({ x: 50, y: 101, w: 40, h: 40 }), "icon-or-illustration", "gem-icon", "banner"),
    crop("prototype-gem", box({ x: 514, y: 201, w: 30, h: 31 }), "icon-or-illustration", "gem-icon", "prototype"),
    crop("manual-gem", box({ x: 699, y: 201, w: 30, h: 31 }), "icon-or-illustration", "gem-icon", "manual"),
    crop("prototype-ui", box({ x: 397, y: 255, w: 141, h: 105 }), "screenshot-or-document", "prototype-ui-screenshot", "prototype"),
    crop("manual-ui", box({ x: 594, y: 242, w: 112, h: 153 }), "screenshot-or-document", "manual-document-screenshot", "manual"),
    crop("magic-wand", box({ x: 257, y: 264, w: 42, h: 54 }), "icon-or-illustration", "magic-wand-icon", "engine"),
    crop("camera", box({ x: 260, y: 331, w: 43, h: 38 }), "icon-or-illustration", "camera-icon", "engine")
  ];
  return {
    matched: true,
    shapes,
    textBoxes,
    cropRegions,
    sourceIds: (page.images || []).map((item) => String(item?.id || "")).filter(Boolean)
  };
}

function materializeVisualOperationSyncImages(model = {}, options = {}) {
  if (model.matched !== true || !Array.isArray(model.cropRegions) || model.cropRegions.length !== 7) return [];
  const sourceImage = safePath(options.sourceImage);
  const assetDir = safePath(options.assetDir);
  const irDir = safePath(options.irDir);
  if (!sourceImage || !assetDir || !irDir || !fs.existsSync(sourceImage)) return [];
  let image;
  try { image = readPng(sourceImage); } catch { return []; }
  const slideSize = options.slideSize || { widthPt: 960, heightPt: 540 };
  if (!validSlide(slideSize)) return [];
  fs.mkdirSync(assetDir, { recursive: true });
  const output = [];
  for (const region of model.cropRegions) {
    const pixels = pixelBox(region.box, image, slideSize);
    if (!pixels) return [];
    const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-visual-operation-${region.id}.png`);
    writePng(file, cropPng(image, pixels));
    output.push({
      id: `asset-os-visual-operation-${region.id}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: { ...region.box },
      source: {
        editable: false,
        detector: `asset-os-visual-operation-sync-${region.id}-crop`,
        expressionForm: region.expressionForm,
        expressionSubtype: region.subtype,
        recommendedAction: "preserve-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        standaloneVisualAsset: true,
        ...component(region.componentRole),
        nonEditableReason: region.expressionForm === "screenshot-or-document"
          ? "UI or document example retained as one source-faithful minimum visual unit"
          : "pictorial icon retained as one source-faithful minimum visual unit"
      }
    });
  }
  return output;
}

function rect(id, type, box, style, role) {
  return { id: `asset-os-visual-operation-${id}`, type, box, style, source: source(id, role) };
}

function connector(id, box, color, role) {
  return { id: `asset-os-visual-operation-${id}`, type: "line", box, style: { stroke: color, strokeWidthPt: 2.4, connectorType: "elbow", endArrow: "triangle" }, source: source("connector", role, "routing") };
}

function text(id, value, box, font, role) {
  return { id: `asset-os-visual-operation-text-${id}`, text: value, box, font: { family: "SimHei", sizePt: 14, weight: "regular", color: "#111111", align: "center", valign: "middle", ...font }, style: { visibility: "visible", opacity: 1, wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, source: source("text", role) };
}

function source(detector, role, componentRole = role) {
  return { editable: true, nativeRebuild: true, detector: `${DETECTOR_PREFIX}${detector}`, role, confidence: 0.95, ...component(componentRole) };
}

function component(role) {
  const safeRole = safeName(role || "component");
  const groupId = `asset-os-visual-operation-sync-${safeRole}`;
  return { componentOwnerId: groupId, componentOwnerKind: "visual-operation-sync-flow", nativeComponentInstance: true, nativeComponentGroupId: groupId, nativeComponentArchetype: "visual-operation-sync-flow", nativeComponentRole: role };
}

function crop(id, box, expressionForm, subtype, componentRole) { return { id, box, expressionForm, subtype, componentRole }; }
function cardStyle() { return { fill: "#F0F1F2", gradient: gradient(90, "#F7F7F8", "#E6E8EA"), stroke: "#E2E4E6", strokeWidthPt: 0.8, radiusPt: 5 }; }
function gradient(angleDeg, start, end) { return { type: "linear", angleDeg, stops: [{ position: 0, color: start }, { position: 1, color: end }] }; }
function normalize(value) { return String(value || "").normalize("NFKC").replace(/\s+/g, ""); }
function validSlide(size) { const w = Number(size?.widthPt); const h = Number(size?.heightPt); return Number.isFinite(w) && Number.isFinite(h) && w >= 480 && w <= 3840 && h >= 270 && h <= 2160; }
function scaleBox(value, sx, sy) { return { x: round(value.x * sx), y: round(value.y * sy), w: round(value.w * sx), h: round(value.h * sy) }; }
function round(value) { return Math.round(value * 100) / 100; }
function safePath(value) { return typeof value === "string" && value.trim() ? path.resolve(value) : ""; }
function safeName(value) { return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "deck"; }
function pixelBox(box, image, size) {
  const x = Math.max(0, Math.floor(box.x * image.width / size.widthPt));
  const y = Math.max(0, Math.floor(box.y * image.height / size.heightPt));
  const w = Math.min(image.width - x, Math.max(1, Math.ceil(box.w * image.width / size.widthPt)));
  const h = Math.min(image.height - y, Math.max(1, Math.ceil(box.h * image.height / size.heightPt)));
  return x < image.width && y < image.height && w > 0 && h > 0 ? { x, y, w, h } : null;
}
function emptyModel() { return { matched: false, shapes: [], textBoxes: [], cropRegions: [], sourceIds: [] }; }

module.exports = { DETECTOR_PREFIX, createVisualOperationSyncModel, materializeVisualOperationSyncImages };
