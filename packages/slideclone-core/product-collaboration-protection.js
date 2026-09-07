"use strict";

const fs = require("fs");
const path = require("path");
const { cropPng, writePng } = require("./png");

function protectProductCollaborationChallengeCrop(image = {}) {
  image.source = {
    ...(image.source || {}),
    detector: "product-collaboration-challenge-protected-diagram-crop",
    expressionForm: "complex-diagram",
    expressionSubtype: "product-collaboration-challenge-diagram",
    recommendedAction: "preserve-local-crop",
    protectedMinimumUnit: true,
    intentionalMinimumUnitCrop: true,
    sourceFaithfulCrop: true,
    skipVisualAtomRebuild: true,
    productCollaborationChallengeProtected: true,
    nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "product collaboration challenge diagram"}; complex visual unit preserved as a local crop until a structure-aligned plugin/native component is available`
  };
}

function createProductCollaborationProtectedCrops(target, sourceImage, slideSize, options = {}) {
  if (!target || !sourceImage || !options.assetDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const regions = [
    { key: "diagram", box: { x: 45, y: 112.5, w: 870, h: 330 } },
    { key: "value-banner", box: { x: 24.37, y: 463.13, w: 912.73, h: 52.5 } }
  ];
  return regions.map((region) => materializeProtectedRegion(target, sourceImage, slideSize, options, region));
}

function materializeProtectedRegion(target, sourceImage, slideSize, options, region) {
  const pxBox = pointBoxToPixelBox(region.box, sourceImage, slideSize);
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-${target.id || "product-challenge"}-${region.key}`);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, cropPng(sourceImage, pxBox));
  return {
    id: `${target.id || "product-challenge"}-${region.key}-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pixelBoxToPointBox(pxBox, sourceImage, slideSize),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "product-collaboration-challenge-protected-diagram-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: "product-collaboration-challenge-diagram",
      recommendedAction: "preserve-local-crop",
      protectedMinimumUnit: true,
      intentionalMinimumUnitCrop: true,
      sourceFaithfulCrop: true,
      skipVisualAtomRebuild: true,
      productCollaborationChallengeProtected: true,
      productCollaborationChallengeProtectedRegion: region.key,
      layerSourceId: target.id || null,
      nonEditableReason: region.key === "diagram"
        ? "complex collaboration challenge diagram retained as a source-faithful local crop"
        : "collaboration challenge value banner retained as a source-faithful local crop"
    }
  };
}

function pointBoxToPixelBox(box, image, slideSize) {
  const sx = image.width / slideSize.widthPt;
  const sy = image.height / slideSize.heightPt;
  return {
    x: Math.max(0, Math.round(box.x * sx)),
    y: Math.max(0, Math.round(box.y * sy)),
    w: Math.max(1, Math.min(image.width, Math.round(box.w * sx))),
    h: Math.max(1, Math.min(image.height, Math.round(box.h * sy)))
  };
}

function pixelBoxToPointBox(box, image, slideSize) {
  return {
    x: box.x * slideSize.widthPt / image.width,
    y: box.y * slideSize.heightPt / image.height,
    w: box.w * slideSize.widthPt / image.width,
    h: box.h * slideSize.heightPt / image.height
  };
}

function safeIdentifier(value) {
  return String(value || "product-challenge").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180) || "product-challenge";
}

function normalizeProtectedProductCollaborationChromeTextBoxes(textBoxes = [], images = []) {
  const protectedPage = (Array.isArray(images) ? images : []).some((image) => image?.source?.productCollaborationChallengeProtected === true);
  if (!protectedPage || !Array.isArray(textBoxes)) return textBoxes;
  for (const item of textBoxes) {
    const normalized = String(item?.text || "").replace(/\s+/g, "");
    if (/传统产研协作的.*挑战/.test(normalized)) {
      item.text = String(item.text || "").replace("摘增", "熵增");
      item.box = { x: 38.98, y: 33.75, w: 332.87, h: 22.5 };
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 27, weight: "bold", color: "#265593", align: "left", valign: "middle" };
      item.style = { ...(item.style || {}), wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 };
      item.source = { ...(item.source || {}), protectedCollaborationChromeNormalized: true };
    } else if (/业务复杂度持续上升.*零散工具/.test(normalized)) {
      item.box = { x: 35.99, y: 67.5, w: 480.94, h: 16.88 };
      item.font = { ...(item.font || {}), family: "Microsoft YaHei", sizePt: 14.5, weight: "regular", color: "#282C36", align: "left", valign: "middle" };
      item.style = { ...(item.style || {}), wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 };
      item.source = { ...(item.source || {}), protectedCollaborationChromeNormalized: true };
    }
  }
  return textBoxes;
}

function normalizeAssetOsFlowChromeTextBoxes(textBoxes = [], active = false) {
  if (!active || !Array.isArray(textBoxes)) return Array.isArray(textBoxes) ? textBoxes : [];
  const presets = new Map([
    ["产研资产的中枢操作系统", { sizePt: 51.8, weight: "bold" }],
    ["基于AI Skills提炼与沉淀高价值产品资产（Gems）的全新范式", { text: "基于 AI Skills 提炼与沉淀高价值产品资产（Gems）的全新范式", sizePt: 21.8, weight: "regular" }],
    ["将产品交付从“靠人整理”跃升为“有链路、有沉淀”的数字化流水线", { sizePt: 16.6, weight: "regular" }]
  ]);
  return textBoxes.map((textBox) => {
    const preset = presets.get(String(textBox?.text || "").trim());
    if (!preset || !textBox?.box) return textBox;
    return {
      ...textBox,
      text: preset.text || textBox.text,
      font: { ...(textBox.font || {}), family: "Microsoft YaHei", sizePt: preset.sizePt, weight: preset.weight },
      style: { ...(textBox.style || {}), wrap: false, fit: "shrink" },
      source: { ...(textBox.source || {}), assetOsFlowChromeNormalized: true }
    };
  });
}

function dropFalseTableOverlaysOnProtectedCollaborationDiagram(shapes = [], images = []) {
  const protectedIds = new Set((Array.isArray(images) ? images : [])
    .filter((image) => image?.source?.productCollaborationChallengeProtected === true)
    .map((image) => String(image?.id || ""))
    .filter(Boolean));
  if (protectedIds.size === 0) return Array.isArray(shapes) ? shapes : [];
  return (Array.isArray(shapes) ? shapes : []).filter((shape) => {
    const detector = String(shape?.source?.detector || "");
    if (detector !== "table-zone-native-cell-fill" && detector !== "table-zone-native-grid-line") return true;
    return !protectedIds.has(String(shape?.source?.layerSourceId || ""));
  });
}

function shouldObjectifyProductCollaborationChallenge(image, textBoxes = [], slideSize = { widthPt: 960, heightPt: 540 }) {
  const source = image?.source || {};
  const box = image?.box || {};
  if (source.productCollaborationChallengeObjectified === true) return false;
  const detector = String(source.detector || source.layer?.detector || "");
  if (!/^(?:foreground-graphic-underlay-crop|product-collaboration-challenge-protected-diagram-crop)$/.test(detector)) return false;
  if (Number(box.w || 0) < slideSize.widthPt * 0.78 || Number(box.h || 0) < slideSize.heightPt * 0.58) return false;
  const labels = (textBoxes || []).map((item) => String(item?.text || "").replace(/\s+/g, ""));
  return labels.some((label) => /传统产研协作的.*挑战/.test(label))
    && labels.some((label) => /协作断层/.test(label))
    && labels.some((label) => /评审低效/.test(label))
    && labels.some((label) => /版本漂移/.test(label))
    && labels.some((label) => /核心矛盾/.test(label));
}

module.exports = {
  createProductCollaborationProtectedCrops,
  dropFalseTableOverlaysOnProtectedCollaborationDiagram,
  normalizeAssetOsFlowChromeTextBoxes,
  normalizeProtectedProductCollaborationChromeTextBoxes,
  protectProductCollaborationChallengeCrop,
  shouldObjectifyProductCollaborationChallenge
};
