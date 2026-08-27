"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "asset-landing-triad-native-";

function createAssetLandingTriadObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyAssetLandingTriad(page, textBoxes, slideSize)) {
    return { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
  }
  const sourceIds = (page.images || []).map((image) => String(image?.id || "")).filter(Boolean);
  const layout = assetLandingTriadLayout(slideSize);
  return {
    matched: true,
    sourceIds,
    shapes: createAssetLandingTriadShapes(layout),
    textBoxes: createAssetLandingTriadTextBoxes(layout),
    images: materializeAssetLandingMark(layout, slideSize, options)
  };
}

function shouldObjectifyAssetLandingTriad(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const semantic = normalizeText((textBoxes || []).map((item) => item?.text || "").join(" "));
  const required = ["资产落盘", "单点技能产出", "独立配置", "标准化目录", "版本化追踪", "供应链", "物流", "财务"];
  if (!required.every((token) => semantic.includes(normalizeText(token)))) return false;
  const slideArea = Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540);
  const evidenceArea = (page.images || []).reduce((sum, image) => sum + boxArea(image?.box), 0);
  return evidenceArea / Math.max(1, slideArea) >= 0.02;
}

function assetLandingTriadLayout(slideSize = DEFAULT_SLIDE) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  return {
    sx,
    sy,
    mark: box(438.5, 125.5, 81.5, 59),
    bus: { rootX: 479.5 * sx, rootTop: 192 * sy, busY: 251.5 * sy },
    columns: [
      { role: "supply-chain", stage: "独立配置", domain: "供应链", pill: box(266.9, 299.5, 91.9, 31), card: box(241.7, 342, 142.8, 92.3) },
      { role: "logistics", stage: "标准化目录", domain: "物流", pill: box(427, 301.4, 105, 28), card: box(408.2, 342, 142.8, 92.3) },
      { role: "finance", stage: "版本化追踪", domain: "财务", pill: box(591.9, 301.4, 106.1, 28), card: box(574.7, 342, 142.8, 92.3) }
    ]
  };
}

function createAssetLandingTriadShapes(layout) {
  const shapes = [];
  const green = "#2FA961";
  const connector = (id, box, extra = {}) => shapes.push({
    id: `asset-landing-${id}`,
    type: "line",
    box: roundedBox(box),
    style: { stroke: green, strokeWidthPt: 5.2, fill: "none", ...extra },
    source: source(`${DETECTOR_PREFIX}connector`, "routing", id)
  });
  const centers = layout.columns.map((column) => column.pill.x + column.pill.w / 2);
  connector("root", { x: layout.bus.rootX, y: layout.bus.rootTop, w: 0.1, h: layout.bus.busY - layout.bus.rootTop });
  connector("bus", { x: centers[0], y: layout.bus.busY, w: centers[2] - centers[0], h: 0.1 });
  layout.columns.forEach((column, index) => {
    const center = centers[index];
    connector(`drop-${column.role}`, { x: center, y: layout.bus.busY, w: 0.1, h: column.pill.y - layout.bus.busY - 4 }, { endArrow: "triangle" });
    shapes.push({
      id: `asset-landing-pill-${column.role}`,
      type: "roundRect",
      box: column.pill,
      style: { fill: green, stroke: green, strokeWidthPt: 1.2, radiusRatio: 0.42 },
      source: source(`${DETECTOR_PREFIX}stage-pill`, column.role, "stage-pill")
    });
    shapes.push({
      id: `asset-landing-card-${column.role}`,
      type: "roundRect",
      box: column.card,
      style: { fill: "#A7DDB5", stroke: green, strokeWidthPt: 2.4, radiusRatio: 0.07 },
      source: source(`${DETECTOR_PREFIX}domain-card`, column.role, "domain-card")
    });
    shapes.push({
      id: `asset-landing-divider-${column.role}`,
      type: "line",
      box: roundedBox({ x: column.card.x + 10 * layout.sx, y: column.card.y + 35 * layout.sy, w: column.card.w - 20 * layout.sx, h: 0.1 }),
      style: { stroke: green, strokeWidthPt: 1.2, fill: "none" },
      source: source(`${DETECTOR_PREFIX}domain-divider`, column.role, "divider")
    });
  });
  return shapes;
}

function createAssetLandingTriadTextBoxes(layout) {
  const textBoxes = [
    textBox("asset-landing-title", "资产落盘：单点技能产出，化为组织级资产", roundedBox({ x: 39 * layout.sx, y: 32.6 * layout.sy, w: 587 * layout.sx, h: 27 * layout.sy }), 26, "#111111", "regular", "left", source(`${DETECTOR_PREFIX}text`, "title", "text")),
    textBox("asset-landing-footer", "技能的终点不是对话框的关闭，而是企业数字化版图的静默扩充。", roundedBox({ x: 117 * layout.sx, y: 473.2 * layout.sy, w: 710 * layout.sx, h: 23 * layout.sy }), 20, "#111111", "regular", "center", source(`${DETECTOR_PREFIX}text`, "footer", "text"))
  ];
  layout.columns.forEach((column) => {
    textBoxes.push(textBox(`asset-landing-stage-${column.role}`, column.stage, column.pill, 15, "#FFFFFF", "regular", "center", source(`${DETECTOR_PREFIX}text`, column.role, "stage-label")));
    textBoxes.push(textBox(`asset-landing-domain-${column.role}`, column.domain, roundedBox({ x: column.card.x + 12 * layout.sx, y: column.card.y + 5 * layout.sy, w: column.card.w - 24 * layout.sx, h: 27 * layout.sy }), 17, "#111111", "regular", "center", source(`${DETECTOR_PREFIX}text`, column.role, "domain-label")));
  });
  return textBoxes;
}

function materializeAssetLandingMark(layout, slideSize, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const crop = cropPng(options.sourceImage, ptToPxBox(layout.mark, options.sourceImage, slideSize, 2));
  const isolated = isolateBlueAssetMark(crop);
  const deck = safeToken(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  const file = path.join(options.assetDir, `${deck}-p${page}-asset-landing-mark.png`);
  writePng(file, isolated);
  return [{
    id: "asset-landing-mark",
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
    box: layout.mark,
    source: {
      editable: false,
      nativeRebuild: true,
      detector: `${DETECTOR_PREFIX}mark-crop`,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "asset-network-mark",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      nonEditableReason: "source-faithful asset network mark retained as the smallest pictorial unit",
      ...component("mark", "icon")
    }
  }];
}

function isolateBlueAssetMark(image) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
    const blueInk = b - r >= 12 && b - g >= 3 && b <= 250;
    if (!blueInk) rgba[offset + 3] = 0;
  }
  return { ...image, rgba };
}

function filterAssetLandingTriadTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const native = (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX));
  const claimed = new Set(native.map((item) => normalizeText(item.text)));
  return (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX) || !claimed.has(normalizeText(item?.text || "")));
}

function textBox(id, text, box, sizePt, color, weight, align, sourceValue) {
  return { id, text, box, font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1 }, style: { wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, wrap: false, source: sourceValue };
}
function source(detector, role, part) { return { editable: true, nativeRebuild: true, detector, confidence: 0.96, expressionForm: "hierarchy-diagram", expressionSubtype: "asset-landing-triad", ...component(role, part) }; }
function component(role, part) { return { nativeComponentGroupId: `asset-landing-triad-${safeToken(role)}`, nativeComponentArchetype: "asset-landing-triad", nativeComponentRole: part }; }
function ptToPxBox(box, image, slideSize, paddingPt = 0) { const sx = image.width / Number(slideSize.widthPt || 960), sy = image.height / Number(slideSize.heightPt || 540); const x = Math.max(0, Math.floor((box.x - paddingPt) * sx)), y = Math.max(0, Math.floor((box.y - paddingPt) * sy)), right = Math.min(image.width, Math.ceil((box.x + box.w + paddingPt) * sx)), bottom = Math.min(image.height, Math.ceil((box.y + box.h + paddingPt) * sy)); return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) }; }
function roundedBox(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100])); }
function boxArea(box) { return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0)); }
function normalizeText(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_\-/]/g, "").toLowerCase(); }
function safeToken(value) { return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component"; }

module.exports = { DETECTOR_PREFIX, assetLandingTriadLayout, createAssetLandingTriadObjects, filterAssetLandingTriadTextBoxes, isolateBlueAssetMark, shouldObjectifyAssetLandingTriad };
