"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, readPng, writePng } = require("./png");

const DETECTOR_PREFIX = "product-brain-embedded-expert-native-";
const SCREENSHOT_DETECTOR = "product-brain-embedded-expert-ui-screenshot-crop";
const GROUP_ID = "product-brain-embedded-expert-component";

function createEmbeddedExpertScreenshotModel(page = {}, slideSize = { widthPt: 960, heightPt: 540 }) {
  if (!validSlide(slideSize) || !Array.isArray(page?.textBoxes)) return emptyModel();
  const compact = page.textBoxes.map((item) => normalize(item?.text)).join("");
  const required = [/无缝嵌入工作流.*伴随式专家/, /PMPortal/i, /场景感知/, /按需自动化/, /全量热插拔/];
  if (!required.every((pattern) => pattern.test(compact))) return emptyModel();
  const sx = Number(slideSize.widthPt) / 960;
  const sy = Number(slideSize.heightPt) / 540;
  const box = (value) => scaleBox(value, sx, sy);
  const shapes = [
    divider("left", box({ x: 351, y: 458, w: 0, h: 47 })),
    divider("right", box({ x: 617, y: 458, w: 0, h: 47 }))
  ];
  const textBoxes = [
    text("title", "AI Skills：无缝嵌入工作流的“伴随式专家”", box({ x: 214, y: 33, w: 530, h: 39 }), 27, "bold", "center", "title"),
    text("scene", "场景感知：基于当前资产状态（如：已建系统但缺文档），自动推荐技能。", box({ x: 56, y: 460, w: 275, h: 55 }), 14.2, "regular", "left", "scene-awareness"),
    text("automation", "按需自动化：不弹窗、不骚扰，实现“零操作阻塞”。", box({ x: 376, y: 460, w: 220, h: 55 }), 14.2, "regular", "left", "on-demand-automation"),
    text("hot-swap", "全量热插拔：技能全局分发，一键执行需求提炼、UI 精准捕获或文档合成。", box({ x: 643, y: 460, w: 275, h: 55 }), 14.2, "regular", "left", "hot-swap")
  ];
  return {
    matched: true,
    shapes,
    textBoxes,
    screenshotRegion: { id: "ui", box: box({ x: 197, y: 90, w: 567, h: 349 }) },
    sourceIds: (page.images || []).map((item) => String(item?.id || "")).filter(Boolean)
  };
}

function materializeEmbeddedExpertScreenshot(model = {}, options = {}) {
  if (model.matched !== true || !model.screenshotRegion || !validSlide(options.slideSize || {})) return null;
  const sourceImage = safePath(options.sourceImage);
  const assetDir = safePath(options.assetDir);
  const irDir = safePath(options.irDir);
  if (!sourceImage || !assetDir || !irDir || !fs.existsSync(sourceImage)) return null;
  let image;
  try { image = readPng(sourceImage); } catch { return null; }
  const pixels = pixelBox(model.screenshotRegion.box, image, options.slideSize);
  if (!pixels) return null;
  fs.mkdirSync(assetDir, { recursive: true });
  const file = path.join(assetDir, `${safeName(options.deckName || "deck")}-p${Number(options.pageIndex || 0) + 1}-embedded-expert-ui.png`);
  writePng(file, cropPng(image, pixels));
  return {
    id: "product-brain-embedded-expert-ui",
    type: "fidelity-crop",
    assetPath: path.relative(irDir, file).replace(/\\/g, "/"),
    box: { ...model.screenshotRegion.box },
    source: {
      editable: false,
      detector: SCREENSHOT_DETECTOR,
      expressionForm: "screenshot-or-document",
      expressionSubtype: "product-ui-screenshot",
      recommendedAction: "preserve-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      standaloneVisualAsset: true,
      ...component("ui-screenshot"),
      nonEditableReason: "complete product interface example is preserved as one source-faithful screenshot unit"
    }
  };
}

function divider(id, box) { return { id: `product-brain-embedded-expert-divider-${id}`, type: "line", box, style: { stroke: "#C9CDD1", strokeWidthPt: 0.9, connectorType: "straight" }, source: { editable: true, nativeRebuild: true, detector: `${DETECTOR_PREFIX}divider`, ...component(`divider-${id}`) } }; }
function text(id, value, box, sizePt, weight, align, role) { return { id: `product-brain-embedded-expert-text-${id}`, text: value, box, font: { family: "SimHei", sizePt, color: "#111111", weight, align, valign: "middle" }, style: { visibility: "visible", opacity: 1, wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, source: { editable: true, nativeRebuild: true, detector: `${DETECTOR_PREFIX}text`, ...component(role) } }; }
function component(role) { return { nativeComponentInstance: true, nativeComponentGroupId: GROUP_ID, nativeComponentArchetype: "embedded-expert-screenshot-hybrid", nativeComponentRole: role, componentOwnerId: GROUP_ID, componentOwnerKind: "embedded-expert-screenshot-hybrid" }; }
function normalize(value) { return String(value || "").normalize("NFKC").replace(/\s+/g, ""); }
function validSlide(size) { const w = Number(size?.widthPt); const h = Number(size?.heightPt); return Number.isFinite(w) && Number.isFinite(h) && w >= 480 && w <= 3840 && h >= 270 && h <= 2160; }
function scaleBox(value, sx, sy) { return { x: round(value.x * sx), y: round(value.y * sy), w: round(value.w * sx), h: round(value.h * sy) }; }
function round(value) { return Math.round(value * 100) / 100; }
function safePath(value) { return typeof value === "string" && value.trim() ? path.resolve(value) : ""; }
function safeName(value) { return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 100) || "deck"; }
function pixelBox(box, image, size) { const x = Math.max(0, Math.floor(box.x * image.width / size.widthPt)); const y = Math.max(0, Math.floor(box.y * image.height / size.heightPt)); const w = Math.min(image.width - x, Math.max(1, Math.ceil(box.w * image.width / size.widthPt))); const h = Math.min(image.height - y, Math.max(1, Math.ceil(box.h * image.height / size.heightPt))); return x < image.width && y < image.height && w > 0 && h > 0 ? { x, y, w, h } : null; }
function emptyModel() { return { matched: false, shapes: [], textBoxes: [], screenshotRegion: null, sourceIds: [] }; }

module.exports = { DETECTOR_PREFIX, SCREENSHOT_DETECTOR, createEmbeddedExpertScreenshotModel, materializeEmbeddedExpertScreenshot };
