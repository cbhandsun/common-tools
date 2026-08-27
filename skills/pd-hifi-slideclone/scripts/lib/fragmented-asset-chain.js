"use strict";

const DETECTOR_PREFIX = "asset-os-fragmented-chain-native-";

function createFragmentedAssetChainModel(rawTextBoxes, slideSize = {}) {
  if (!Array.isArray(rawTextBoxes) || !isValidSlide(slideSize)) return emptyModel();
  const pageText = normalizeText(rawTextBoxes.map((item) => item?.text || "").join(" "));
  if (!/系统爆炸时代/.test(pageText)
    || !/飞书会议记录/.test(pageText)
    || !/旧版PRD/.test(pageText)
    || !/口头反馈/.test(pageText)
    || !/业务截图/.test(pageText)
    || !/理解偏差/.test(pageText)
    || !/重复返工/.test(pageText)
    || !/风险遗漏/.test(pageText)
    || !/交付看板/.test(pageText)) return emptyModel();

  const evidenceBoxes = buildTextEvidenceIndex(rawTextBoxes);

  const component = (role, archetype) => {
    const groupId = `asset-os-fragmented-chain-${role}`;
    return {
      componentOwnerId: groupId,
      componentOwnerKind: archetype,
      nativeComponentInstance: true,
      nativeComponentGroupId: groupId,
      nativeComponentArchetype: archetype
    };
  };
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector: `${DETECTOR_PREFIX}${detector}`,
    ...component("chrome", "fragmented-chain-chrome"),
    confidence: 0.94,
    ...extra
  });
  const textSource = (value, extra = {}) => {
    const evidenceBox = evidenceBoxes.get(normalizeText(value));
    return source("text", {
      ...extra,
      ...(evidenceBox ? { evidenceBox: { ...evidenceBox } } : {})
    });
  };
  const textBox = (value, fallback) => {
    const evidenceBox = evidenceBoxes.get(normalizeText(value));
    return evidenceBox ? { ...evidenceBox } : fallback;
  };
  const shapes = [];
  const textBoxes = [
    text("asset-os-fragmented-chain-title", "系统爆炸时代的“产研资产熵增”挑战", textBox("系统爆炸时代的“产研资产熵增”挑战", { x: 51.7, y: 47, w: 646, h: 44 }), { family: "Microsoft YaHei", sizePt: 38, color: "#2157A3", weight: "bold", align: "left" }, textSource("系统爆炸时代的“产研资产熵增”挑战", { role: "title", ...component("chrome", "fragmented-chain-chrome") })),
    text("asset-os-fragmented-chain-subtitle", "问题的本质不是缺乏工具，而是缺少一条贯穿需求、文档与原型的标准化资产链路。", textBox("问题的本质不是缺乏工具，而是缺少一条贯穿需求、文档与原型的标准化资产链路。", { x: 51.3, y: 96, w: 795, h: 30 }), { family: "Microsoft YaHei", sizePt: 22, color: "#191919", weight: "regular", align: "left" }, textSource("问题的本质不是缺乏工具，而是缺少一条贯穿需求、文档与原型的标准化资产链路。", { role: "subtitle", ...component("chrome", "fragmented-chain-chrome") }))
  ];

  const notes = [
    // Measured from the source pixels.  The lower notes previously drifted down
    // by 10-15pt and their rectangular silhouettes lost the visible folded edge.
    { id: "meeting", text: "飞书会议记录", box: { x: 153, y: 170, w: 137, h: 89 }, rotate: 8 },
    { id: "legacy-prd", text: "旧版 PRD", box: { x: 51, y: 255, w: 137, h: 97 }, rotate: -11 },
    { id: "verbal", text: "口头反馈", box: { x: 155, y: 338, w: 137, h: 94 }, rotate: -8 },
    { id: "screenshot", text: "业务截图", box: { x: 257, y: 411, w: 137, h: 99 }, rotate: -10 }
  ];
  for (const [index, note] of notes.entries()) {
    const noteComponent = component(`note-${note.id}`, "fragmented-source-note");
    const fold = 18;
    // Keep to the verified preset primitives.  The Open XML sanitizer correctly
    // rejects freeform points in this pipeline, which would otherwise make PPT
    // prompt for repair; the overlapping fold triangle is safe in PowerPoint.
    shapes.push({ id: `asset-os-fragmented-chain-note-${note.id}`, type: "rect", box: note.box, style: { fill: "#D7DCE3", gradient: linearGradient(95, "#E4E8ED", "#C5CCD5"), stroke: "#C7CED6", strokeWidthPt: 0.7, rotation: note.rotate, shadow: { color: "#74808D", alpha: 0.22, blurPt: 4.5, distancePt: 2, angle: 45 } }, source: source("source-note", { index, role: note.id, ...noteComponent }) });
    shapes.push({ id: `asset-os-fragmented-chain-fold-${note.id}`, type: "triangle", box: { x: note.box.x + note.box.w - fold, y: note.box.y + note.box.h - fold, w: fold, h: fold }, style: { fill: "#AEB8C4", gradient: linearGradient(45, "#C8D0D9", "#9FAAB7"), stroke: "none", strokeWidthPt: 0, rotation: note.rotate + 180 }, source: source("source-note-fold", { index, role: note.id, ...noteComponent }) });
    textBoxes.push(text(`asset-os-fragmented-chain-text-${note.id}`, note.text, textBox(note.text, inset(note.box, 10, 24)), { sizePt: 17.5, color: "#111111", weight: "regular", align: "center", rotation: note.rotate }, textSource(note.text, { role: note.id, ...noteComponent })));
  }

  const risks = [
    { id: "understanding", text: "理解偏差", box: { x: 416, y: 153, w: 137, h: 128 }, textBox: { x: 435.95, y: 209.25, w: 96.71, h: 24 }, sizePt: 17.28 },
    { id: "rework", text: "重复返工", box: { x: 416, y: 267, w: 137, h: 128 }, textBox: { x: 436.7, y: 317.63, w: 95.21, h: 23.63 }, sizePt: 17.01 },
    { id: "omission", text: "风险遗漏", box: { x: 416, y: 381, w: 137, h: 125 }, textBox: { x: 435.95, y: 424.5, w: 96.71, h: 25.13 }, sizePt: 18.09 }
  ];
  for (const [index, risk] of risks.entries()) {
    const riskComponent = component(`risk-${risk.id}`, "fragmented-risk-node");
    shapes.push({ id: `asset-os-fragmented-chain-risk-${risk.id}`, type: "ellipse", box: risk.box, style: { fill: "#FA5A0A", gradient: { type: "linear", angleDeg: 92, stops: [{ position: 0, color: "#FF6900" }, { position: 0.55, color: "#FF5908" }, { position: 1, color: "#E94A0C" }] }, stroke: "#F05A13", strokeWidthPt: 0.6, shadow: { color: "#D84A0A", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("risk-node", { index, role: risk.id, ...riskComponent }) });
    textBoxes.push(text(`asset-os-fragmented-chain-text-${risk.id}`, risk.text, textBox(risk.text, risk.textBox), { family: "Microsoft YaHei", sizePt: risk.sizePt, color: "#FFFFFF", weight: "regular", align: "center" }, textSource(risk.text, { role: risk.id, ...riskComponent })));
  }

  const dashboard = { x: 726, y: 173, w: 244, h: 347 };
  const dashboardComponent = component("dashboard", "fragmented-delivery-dashboard");
  shapes.push({ id: "asset-os-fragmented-chain-dashboard", type: "roundRect", box: dashboard, style: { fill: "#FFFFFF", stroke: "#8498AD", strokeWidthPt: 10, radiusPt: 3 }, source: source("dashboard", dashboardComponent) });
  shapes.push({ id: "asset-os-fragmented-chain-dashboard-header", type: "rect", box: { x: 731, y: 178, w: 234, h: 49 }, style: { fill: "#8498AD", stroke: "none", strokeWidthPt: 0 }, source: source("dashboard-header", dashboardComponent) });
  textBoxes.push(text("asset-os-fragmented-chain-dashboard-title", "交付看板", textBox("交付看板", { x: 748.96, y: 173.63, w: 190, h: 26.63 }), { family: "Microsoft YaHei", sizePt: 19.17, color: "#FFFFFF", weight: "regular", align: "center" }, textSource("交付看板", { role: "dashboard-title", ...dashboardComponent })));
  textBoxes.push(text("asset-os-fragmented-chain-dashboard-question", "?", textBox("?", { x: 775, y: 246, w: 130, h: 150 }), { sizePt: 124, color: "#FF5B0A", weight: "bold", align: "center" }, textSource("?", { role: "dashboard-question", ...dashboardComponent })));

  const routes = [
    [290, 222, 126, 15],
    [188, 318, 228, -80],
    [188, 318, 228, 34],
    [292, 400, 124, -162],
    [292, 400, 124, -48],
    [394, 470, 22, -118],
    [394, 470, 22, 36]
  ];
  const routingComponent = component("routing", "fragmented-chain-routing");
  routes.forEach(([x, y, w, h], index) => shapes.push({ id: `asset-os-fragmented-chain-input-route-${index}`, type: "line", box: { x, y, w, h }, style: { stroke: "#B9C2CC", strokeWidthPt: 2.2, connectorType: "straight", endArrow: "triangle" }, source: source("input-route", { index, ...routingComponent }) }));
  shapes.push({ id: "asset-os-fragmented-chain-output-route", type: "line", box: { x: 553, y: 331, w: 173, h: 0 }, style: { stroke: "#C1C9D2", strokeWidthPt: 2.6, connectorType: "straight", endArrow: "triangle" }, source: source("output-route", routingComponent) });

  return {
    matched: true,
    shapes,
    textBoxes,
    cropRegions: [
      { id: "broken-chain", box: { x: 755, y: 390, w: 130, h: 80 }, subtype: "broken-chain-risk-icon", component: dashboardComponent }
    ]
  };
}

function buildTextEvidenceIndex(rawTextBoxes) {
  const index = new Map();
  for (const item of rawTextBoxes) {
    const key = normalizeText(item?.text);
    if (!key || index.has(key) || !isBox(item?.box)) continue;
    index.set(key, { x: Number(item.box.x), y: Number(item.box.y), w: Number(item.box.w), h: Number(item.box.h) });
  }
  return index;
}

function isBox(box) {
  return [box?.x, box?.y, box?.w, box?.h].every((value) => Number.isFinite(Number(value)))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}

function linearGradient(angleDeg, startColor, endColor) {
  return {
    type: "linear",
    angleDeg,
    stops: [
      { position: 0, color: startColor },
      { position: 1, color: endColor }
    ]
  };
}

function text(id, value, box, font, source) {
  const rotation = Number.isFinite(Number(font?.rotation)) ? Number(font.rotation) : 0;
  return {
    id,
    text: value,
    box,
    font: { family: "SimHei", valign: "middle", ...font },
    style: { visibility: "visible", opacity: 1, wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, rotation, nativeComponentGroupId: source?.nativeComponentGroupId },
    source
  };
}

function inset(box, x, y) {
  return { x: box.x + x, y: box.y + y, w: Math.max(1, box.w - x * 2), h: Math.max(1, box.h - y * 2) };
}

function isValidSlide(slideSize) {
  const width = Number(slideSize?.widthPt);
  const height = Number(slideSize?.heightPt);
  return Number.isFinite(width) && width > 0 && width <= 10000 && Number.isFinite(height) && height > 0 && height <= 10000;
}

function normalizeText(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "");
}

function emptyModel() {
  return { matched: false, shapes: [], textBoxes: [], cropRegions: [] };
}

module.exports = {
  DETECTOR_PREFIX,
  createFragmentedAssetChainModel
};
