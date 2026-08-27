"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");

const DETECTOR_PREFIX = "runtime-engine-hybrid-native-";
const SCREENSHOT_DETECTOR = "runtime-engine-portal-screenshot-crop";
const ICON_DETECTOR = "runtime-engine-catalog-icon-crop";

function createRuntimeEngineHybridModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }) {
  const width = Number(slideSize?.widthPt);
  const height = Number(slideSize?.heightPt);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return emptyModel();
  if (width < 480 || width > 3840 || height < 270 || height > 2160) return emptyModel();
  const textBoxes = Array.isArray(page.textBoxes) ? page.textBoxes : [];
  const compactText = textBoxes.map((item) => normalize(item?.text)).join("");
  const required = [
    /运行时引擎.*零维护.*实时聚合/,
    /config/i,
    /assets_docs/i,
    /prototype/i,
    /Runtime/i,
    /Catalog/i,
    /门户Hub/i
  ];
  if (!required.every((pattern) => pattern.test(compactText))) return emptyModel();
  const normalized = { sx: width / 960, sy: height / 540 };
  const scaleBox = (box) => roundBox({
    x: box.x * normalized.sx,
    y: box.y * normalized.sy,
    w: box.w * normalized.sx,
    h: box.h * normalized.sy
  });
  const inputCards = [118, 208, 298].map((y) => scaleBox({ x: 46, y, w: 130, h: 72 }));
  const engine = scaleBox({ x: 288, y: 118, w: 160, h: 251 });
  const screenshot = scaleBox({ x: 583, y: 118, w: 332, h: 251 });
  const icon = scaleBox({ x: 338, y: 256, w: 64, h: 66 });
  const shapes = [
    ...inputCards.map((box, index) => rect(`input-${index}`, box, { fill: "#A5A5A5", stroke: "#A5A5A5", strokeWidthPt: 0.8 }, source("input-card", `input-${index}`, { index }))),
    ...inputCards.map((box, index) => ({
      id: `runtime-engine-input-arrow-${index}`,
      type: "rightArrow",
      box: roundBox({ x: box.x + box.w + 8, y: box.y + box.h / 2 - 9, w: engine.x - box.x - box.w - 16, h: 18 }),
      style: { fill: "#00B050", stroke: "#00A046", strokeWidthPt: 0.5 },
      source: source("input-arrow", `input-${index}`, { index })
    })),
    rect("engine", engine, { fill: "#2478CE", stroke: "#2478CE", strokeWidthPt: 1 }, source("engine", "engine")),
    mainArrow(engine, screenshot, source("portal-arrow", "portal"))
  ];
  return {
    matched: true,
    shapes,
    cropRegions: [
      { id: "portal-screenshot", box: screenshot, detector: SCREENSHOT_DETECTOR, subtype: "portal-ui-screenshot" },
      { id: "catalog-icon", box: icon, detector: ICON_DETECTOR, subtype: "catalog-engine-icon" }
    ],
    sourceIds: (page.images || []).map((image) => String(image?.id || "")).filter(Boolean)
  };
}

function materializeRuntimeEngineHybridImages(model = {}, options = {}) {
  if (model.matched !== true || !Array.isArray(model.cropRegions) || model.cropRegions.length !== 2) return [];
  const sourceImage = typeof options.sourceImage === "string" ? path.resolve(options.sourceImage) : "";
  const assetDir = typeof options.assetDir === "string" ? path.resolve(options.assetDir) : "";
  const irDir = typeof options.irDir === "string" ? path.resolve(options.irDir) : assetDir;
  if (!sourceImage || !assetDir || !irDir || !fs.existsSync(sourceImage)) return [];
  fs.mkdirSync(assetDir, { recursive: true });
  let image;
  try {
    image = readPng(sourceImage);
  } catch {
    return [];
  }
  const slideSize = options.slideSize || { widthPt: 960, heightPt: 540 };
  const widthPt = finitePositive(slideSize.widthPt, 960);
  const heightPt = finitePositive(slideSize.heightPt, 540);
  const results = [];
  for (const region of model.cropRegions) {
    if (!validSlideBox(region.box, widthPt, heightPt)) return [];
    const pixelBox = {
      x: Math.max(0, Math.floor(region.box.x * image.width / widthPt)),
      y: Math.max(0, Math.floor(region.box.y * image.height / heightPt)),
      w: Math.max(1, Math.ceil(region.box.w * image.width / widthPt)),
      h: Math.max(1, Math.ceil(region.box.h * image.height / heightPt))
    };
    pixelBox.w = Math.min(pixelBox.w, image.width - pixelBox.x);
    pixelBox.h = Math.min(pixelBox.h, image.height - pixelBox.y);
    if (pixelBox.w <= 0 || pixelBox.h <= 0) return [];
    const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-${region.id}.png`);
    const crop = cropPng(image, pixelBox);
    if (region.detector === ICON_DETECTOR) makeBlueBackgroundTransparent(crop);
    writePng(file, crop);
    results.push({
      id: `runtime-engine-${region.id}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
      box: { ...region.box },
      source: {
        editable: false,
        detector: region.detector,
        expressionForm: region.detector === SCREENSHOT_DETECTOR ? "screenshot" : "icon-or-illustration",
        expressionSubtype: region.subtype,
        recommendedAction: "preserve-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        standaloneVisualAsset: true,
        ...(region.detector === ICON_DETECTOR ? { transparentBackground: true } : {}),
        ...nativeComponentMetadata(region.detector === SCREENSHOT_DETECTOR ? "portal" : "engine", "visual-asset"),
        nonEditableReason: region.detector === SCREENSHOT_DETECTOR
          ? "portal UI is a screenshot example and is preserved as one complete minimum visual unit"
          : "catalog engine glyph is an icon and is preserved as one minimum visual unit"
      }
    });
  }
  return results;
}

function normalizeRuntimeEngineHybridTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  const output = [];
  let inputConfig = false;
  let inputPrototype = false;
  let engine = false;
  for (const item of textBoxes || []) {
    const compact = normalize(item?.text);
    const x = Number(item?.box?.x || 0);
    if (isScreenshotText(compact, x)) continue;
    if ((compact === "配置" && inputConfig) || compact === "Catalog" || compact === "引擎" || (compact === "原型" && inputPrototype)) continue;
    const next = { ...item, font: { ...(item.font || {}) }, style: { ...(item.style || {}) }, source: { ...(item.source || {}) } };
    next.style.wrap = false;
    next.style.fit = "shrink";
    next.source.editable = true;
    next.source.nativeRebuild = true;
    next.source.detector = `${DETECTOR_PREFIX}text`;
    if (compact === "config") {
      inputConfig = true;
      applyTextComponentMetadata(next, "input-0", "label");
      next.text = "config\n配置";
      next.font = inputFont();
    } else if (compact === "assets_docs") {
      applyTextComponentMetadata(next, "input-1", "label");
      next.text = "assets_docs\n文档";
      next.box = { x: next.box.x, y: next.box.y - 17, w: next.box.w, h: next.box.h + 34 };
      next.font = inputFont();
    } else if (compact === "prototype" && x < 300) {
      inputPrototype = true;
      applyTextComponentMetadata(next, "input-2", "label");
      next.text = "prototype\n原型";
      next.font = inputFont();
    } else if (compact === "Runtime") {
      engine = true;
      applyTextComponentMetadata(next, "engine", "label");
      next.text = "Runtime\nCatalog\n引擎";
      next.font = { family: "Microsoft YaHei", sizePt: 19, color: "#FFFFFF", weight: "regular", align: "center", valign: "middle" };
      next.box = { x: 318, y: 168, w: 100, h: 82 };
    } else if (/^运行时引擎.*零维护.*实时聚合$/.test(compact)) {
      next.text = "运行时引擎：实现零维护的实时聚合";
      next.font = { ...(next.font || {}), family: "Microsoft YaHei", sizePt: 31.5, color: "#101010", weight: "bold", align: "left", valign: "middle" };
    } else if (/^(配置即呈现|资产全息索引|缓存加速机制|全局统一搜索)[:：]/.test(String(item?.text || ""))) {
      const text = String(item.text || "");
      const splitAt = Math.max(text.indexOf("："), text.indexOf(":"));
      next.font = { ...(next.font || {}), family: "Microsoft YaHei", color: "#1D1D1D", weight: "regular", align: "left", valign: "middle" };
      next.runs = [
        { text: text.slice(0, splitAt + 1), font: { family: "Microsoft YaHei", weight: "bold" } },
        { text: text.slice(splitAt + 1), font: { family: "Microsoft YaHei", weight: "regular" } }
      ];
      next.style.preserveTypography = true;
      next.source.preserveTypography = true;
    } else {
      next.font = { ...(next.font || {}), family: "Microsoft YaHei", color: "#1D1D1D", align: "left", valign: "middle" };
    }
    output.push(next);
  }
  if (!inputConfig || !inputPrototype || !engine) return textBoxes;
  return output;
}

function makeBlueBackgroundTransparent(image) {
  if (!image?.rgba || !Number.isFinite(image.width) || !Number.isFinite(image.height)) return image;
  for (let offset = 0; offset < image.rgba.length; offset += 4) {
    const red = image.rgba[offset];
    const green = image.rgba[offset + 1];
    const blue = image.rgba[offset + 2];
    const dominance = blue - Math.max(red, green);
    if (dominance >= 36 && blue >= 110) {
      image.rgba[offset + 3] = 0;
    } else if (dominance > 12 && blue >= 130) {
      image.rgba[offset + 3] = Math.round(image.rgba[offset + 3] * (36 - dominance) / 24);
    }
  }
  return image;
}

function isScreenshotText(text, x) {
  if (x < 560) return false;
  return /^(门户Hub|systemlist|Tags|prototype|PRD[123]|系统[ABC])$/i.test(text);
}

function inputFont() {
  return { family: "Microsoft YaHei", sizePt: 16, color: "#FFFFFF", weight: "regular", align: "center", valign: "middle" };
}

function mainArrow(engine, screenshot, arrowSource) {
  const y = engine.y + engine.h * 0.5;
  const left = engine.x + engine.w;
  const right = screenshot.x - 8;
  const headW = Math.min(58, (right - left) * 0.42);
  const halfH = 55;
  const points = [
    { x: left, y: y - 27 },
    { x: right - headW, y: y - 27 },
    { x: right - headW, y: y - halfH },
    { x: right, y },
    { x: right - headW, y: y + halfH },
    { x: right - headW, y: y + 27 },
    { x: left, y: y + 27 }
  ];
  const bounds = boundsOf(points);
  return {
    id: "runtime-engine-portal-arrow",
    type: "freeform",
    box: bounds,
    points: points.map((point) => ({ x: (point.x - bounds.x) / bounds.w, y: (point.y - bounds.y) / bounds.h })),
    style: { fill: "#00B050", stroke: "#00A046", strokeWidthPt: 0.8 },
    source: arrowSource
  };
}

function rect(id, box, style, shapeSource) {
  return { id: `runtime-engine-${id}`, type: "rect", box: roundBox(box), style, source: shapeSource };
}

function line(id, from, to, style, shapeSource) {
  return {
    id: `runtime-engine-${id}`,
    type: "line",
    box: { x: round(from.x), y: round(from.y), w: round(to.x - from.x), h: round(to.y - from.y) },
    style,
    source: shapeSource
  };
}

function source(part, role, extra = {}) {
  return {
    editable: true,
    nativeRebuild: true,
    detector: `${DETECTOR_PREFIX}${part}`,
    confidence: 0.97,
    ...nativeComponentMetadata(role, part),
    ...extra
  };
}

function applyTextComponentMetadata(textBox, role, part) {
  const component = nativeComponentMetadata(role, part);
  textBox.style = { ...(textBox.style || {}), nativeComponentGroupId: component.nativeComponentGroupId };
  textBox.source = { ...(textBox.source || {}), ...component };
}

function nativeComponentMetadata(role, part) {
  const safeRole = safeToken(role);
  return {
    nativeComponentGroupId: `runtime-engine-component-${safeRole}`,
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentArchetype: "runtime-engine-flow",
    nativeComponentRole: safeRole,
    nativeComponentPart: safeToken(part)
  };
}

function safeToken(value) {
  const token = String(value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return token || "unknown";
}

function emptyModel() {
  return { matched: false, shapes: [], cropRegions: [], sourceIds: [] };
}

function validSlideBox(box, width, height) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite)
    && values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0
    && values[0] + values[2] <= width + 0.01
    && values[1] + values[3] <= height + 0.01;
}

function boundsOf(points) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

function finitePositive(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

function safeName(value) {
  return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 96) || "deck";
}

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").trim();
}

function round(value) {
  return Math.round(Number(value) * 100) / 100;
}

function roundBox(box) {
  return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) };
}

module.exports = {
  DETECTOR_PREFIX,
  ICON_DETECTOR,
  SCREENSHOT_DETECTOR,
  createRuntimeEngineHybridModel,
  materializeRuntimeEngineHybridImages,
  normalizeRuntimeEngineHybridTextBoxes
};
