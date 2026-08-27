"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "smart-review-branch-gate-native-";

function createSmartReviewBranchGateObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifySmartReviewBranchGate(page, textBoxes, slideSize)) {
    return { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
  }
  const sourceImages = (page.images || []).filter(isSegment);
  const sourceIds = sourceImages.map((image) => String(image.id || "")).filter(Boolean);
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      smartReviewBranchGateObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      expressionForm: "workflow-diagram",
      expressionSubtype: "smart-review-branch-gate",
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "smart review branch segment"}; cards, routes, document, and risk archive rebuilt as native components`
    };
  }
  const layout = branchLayout(slideSize, textBoxes);
  const palette = deriveSmartReviewBranchPalette(layout, slideSize, options.sourceImage);
  return {
    matched: true,
    sourceIds,
    shapes: createBranchShapes(layout, palette),
    textBoxes: createBranchTextBoxes(layout, textBoxes),
    images: materializeReviewIcon(layout, slideSize, options)
  };
}

function shouldObjectifySmartReviewBranchGate(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const semantic = normalizeText((textBoxes || []).map((item) => item?.text || "").join(" "));
  const required = ["prd智能评审", "交付风险拦截在研发之前", "prd评审skill", "风险归档", "逻辑矛盾", "边界缺失", "体验阻塞"];
  if (!required.every((token) => semantic.includes(normalizeText(token)))) return false;
  const images = (page.images || []).filter(isSegment);
  if (images.length !== 4) return false;
  const area = images.reduce((sum, image) => sum + areaOf(image.box), 0);
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  const ratio = area / slideArea;
  return ratio >= 0.25 && ratio <= 0.5;
}

function isSegment(image) {
  return /^(?:product-illustration-segment-crop|product-brain-smart-review-protected-diagram-crop)$/.test(String(image?.source?.detector || ""));
}

function branchLayout(slideSize = DEFAULT_SLIDE, evidenceTextBoxes = []) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  const evidence = (text) => (evidenceTextBoxes || []).find((item) => normalizeText(item?.text) === normalizeText(text));
  const pending = evidence("待评审")?.box;
  const prd = evidence("PRD")?.box;
  const skillLabel = evidence("PRD评审Skill")?.box;
  const passHeader = evidence("修订建议/通过项清单")?.box;
  const riskTitle = evidence("风险归档")?.box;
  const riskLabels = ["逻辑矛盾", "边界缺失", "体验阻塞"].map((text) => evidence(text)?.box).filter(Boolean);
  const input = pending && prd ? roundedBox({ x: Math.min(pending.x, prd.x) - 20 * sx, y: pending.y - 44 * sy, w: 116 * sx, h: prd.y + prd.h + 44 * sy - (pending.y - 44 * sy) }) : box(69, 207, 116, 148);
  const skill = skillLabel ? roundedBox({ x: skillLabel.x - 40 * sx, y: skillLabel.y - 88 * sy, w: skillLabel.w + 80 * sx, h: skillLabel.h + 127 * sy }) : box(296, 202, 225, 158);
  const document = passHeader ? roundedBox({ x: passHeader.x - 16 * sx, y: passHeader.y - 14 * sy, w: passHeader.w + 34 * sx, h: passHeader.h + 121 * sy }) : box(710, 120, 211, 151);
  const risk = riskTitle && riskLabels.length === 3 ? roundedBox({ x: Math.min(riskTitle.x, ...riskLabels.map((item) => item.x)) - 80 * sx, y: riskTitle.y - 11 * sy, w: 252 * sx, h: riskLabels[2].y + riskLabels[2].h + 28 * sy - (riskTitle.y - 11 * sy) }) : box(690, 291, 263, 239);
  return {
    sx,
    sy,
    title: box(166, 42, 628, 38),
    input,
    skill,
    icon: box(356, 220, 54, 52),
    document,
    risk,
    riskItems: riskLabels.length === 3 ? riskLabels.map((label) => roundedBox({ x: label.x + label.w / 2 - 99.5 * sx, y: label.y - 6 * sy, w: 199 * sx, h: 33 * sy })) : [0, 1, 2].map((index) => box(723, 356 + index * 46, 199, 36))
  };
}

function createBranchShapes(layout, palette = {}) {
  const shapes = [];
  const add = (shape) => shapes.push(shape);
  const inputFill = palette.inputFill || "#EEEEED";
  add({ id: "smart-review-input-card", type: "roundRect", box: layout.input, style: { fill: inputFill, gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: lightenHex(inputFill, 18) }, { position: 1, color: darkenHex(inputFill, 5) }] }, stroke: "#555555", strokeWidthPt: 1.5, radiusPt: 5, shadow: { color: "#777777", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: { ...source(`${DETECTOR_PREFIX}input-card`, "input", "container"), ...(palette.inputFill ? { sampledFill: inputFill } : {}) } });
  const inputRouteY = layout.input.y + layout.input.h / 2;
  add({ id: "smart-review-input-arrow", type: "line", box: lineBox({ x: layout.input.x + layout.input.w, y: inputRouteY }, { x: layout.skill.x, y: inputRouteY }), style: { stroke: "#999999", strokeWidthPt: 5.5, connectorType: "straight", endArrow: "triangle" }, source: source(`${DETECTOR_PREFIX}route`, "input-route", "connector") });
  add({ id: "smart-review-skill-card", type: "roundRect", box: layout.skill, style: { fill: "#287BCF", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#2774C9" }, { position: 1, color: "#3989DA" }] }, stroke: "#2775C5", strokeWidthPt: 1, radiusPt: 6, shadow: { color: "#2775C5", alpha: 0.14, blurPt: 4, distancePt: 1, angle: 45 } }, source: source(`${DETECTOR_PREFIX}skill-card`, "skill", "container") });
  const routeX = (layout.skill.x + layout.skill.w + layout.document.x) / 2;
  const passStartY = layout.skill.y + layout.skill.h * 0.41;
  const passEndY = layout.document.y + layout.document.h * 0.50;
  addRoute(add, "pass", "#2AA760", [
    [{ x: layout.skill.x + layout.skill.w, y: passStartY }, { x: routeX, y: passStartY }],
    [{ x: routeX, y: passStartY }, { x: routeX, y: passEndY }],
    [{ x: routeX, y: passEndY }, { x: layout.document.x, y: passEndY }]
  ]);
  const riskStartY = layout.skill.y + layout.skill.h * 0.69;
  const riskEndY = layout.risk.y + layout.risk.h * 0.52;
  addRoute(add, "risk", "#FF6900", [
    [{ x: layout.skill.x + layout.skill.w, y: riskStartY }, { x: routeX, y: riskStartY }],
    [{ x: routeX, y: riskStartY }, { x: routeX, y: riskEndY }],
    [{ x: routeX, y: riskEndY }, { x: layout.risk.x, y: riskEndY }]
  ]);
  addReviewDocument(add, layout);
  addRiskArchive(add, layout);
  return shapes;
}

function addRoute(add, role, color, segments) {
  segments.forEach(([from, to], index) => add({
    id: `smart-review-${role}-route-${index}`,
    type: "line",
    box: lineBox(from, to),
    style: { stroke: color, strokeWidthPt: role === "risk" ? 8 : 5.5, connectorType: "straight", endArrow: index === segments.length - 1 ? "triangle" : undefined, lineCap: "round" },
    source: source(`${DETECTOR_PREFIX}${role}-route`, `${role}-route`, `segment-${index}`)
  }));
}

function addReviewDocument(add, layout) {
  const card = layout.document;
  add({ id: "smart-review-pass-document", type: "roundRect", box: card, style: { fill: "#FFFFFF", stroke: "#32945C", strokeWidthPt: 2, radiusPt: 5 }, source: source(`${DETECTOR_PREFIX}pass-document`, "pass-document", "outer") });
  add({ id: "smart-review-pass-document-inner", type: "roundRect", box: inset(card, 10 * layout.sx, 9 * layout.sy), style: { fill: "#FFFFFF", stroke: "#32945C", strokeWidthPt: 1.5, radiusPt: 4 }, source: source(`${DETECTOR_PREFIX}pass-document`, "pass-document", "inner") });
  add({ id: "smart-review-pass-document-header", type: "rect", box: roundedBox({ x: card.x + 11 * layout.sx, y: card.y + 10 * layout.sy, w: card.w - 22 * layout.sx, h: 31 * layout.sy }), style: { fill: "#3A9C62", stroke: "#3A9C62", strokeWidthPt: 0 }, source: source(`${DETECTOR_PREFIX}pass-document`, "pass-document", "header") });
  [0, 1, 2, 3].forEach((index) => {
    const widths = [164, 124, 151, 123];
    add({ id: `smart-review-pass-document-line-${index}`, type: "line", box: { x: card.x + 25 * layout.sx, y: card.y + (65 + index * 18) * layout.sy, w: widths[index] * layout.sx, h: 0 }, style: { stroke: "#3AA364", strokeWidthPt: 4, connectorType: "straight", lineCap: "round" }, source: source(`${DETECTOR_PREFIX}pass-document-line`, "pass-document", `line-${index}`) });
  });
}

function addRiskArchive(add, layout) {
  const risk = layout.risk;
  add({ id: "smart-review-risk-archive", type: "roundRect", box: risk, style: { fill: "#FFFFFF", stroke: "#E86216", strokeWidthPt: 3, radiusPt: 6 }, source: source(`${DETECTOR_PREFIX}risk-archive`, "risk-archive", "outer") });
  add({ id: "smart-review-risk-archive-inner", type: "roundRect", box: roundedBox({ x: risk.x + 13 * layout.sx, y: risk.y + 46 * layout.sy, w: risk.w - 26 * layout.sx, h: risk.h - 59 * layout.sy }), style: { fill: "#FFF8F3", gradient: { type: "linear", angleDeg: 90, stops: [{ position: 0, color: "#FFFDFB" }, { position: 1, color: "#FFE9DC" }] }, stroke: "#D56A2D", strokeWidthPt: 1.5, radiusPt: 5 }, source: source(`${DETECTOR_PREFIX}risk-archive`, "risk-archive", "inner") });
  layout.riskItems.forEach((box, index) => add({ id: `smart-review-risk-item-${index}`, type: "roundRect", box, style: { fill: "#FF6420", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#FF7A2A" }, { position: 1, color: "#FF5918" }] }, stroke: "#F05B18", strokeWidthPt: 0.8, radiusPt: 5 }, source: source(`${DETECTOR_PREFIX}risk-item`, `risk-item-${index}`, "container") }));
}

function createBranchTextBoxes(layout, evidenceTextBoxes = []) {
  const notes = [
    ["logic", "逻辑自洽校验：", "跨越章节深度扫描，发现隐蔽的前后矛盾。", 68, 385, 410],
    ["boundary", "异常边界检查：", "地毯式排查缺失的异常分支与非快乐路径。", 68, 414, 410],
    ["experience", "交互体验审查：", "识别潜在的操作阻塞点与反直觉设计。", 68, 443, 390],
    ["frontload", "极致风险前置：", "将传统的“会后补救”转化为“交付前自动拦截”。", 68, 472, 443]
  ];
  return [
    anchoredTextBox("smart-review-title", "PRD智能评审：将交付风险拦截在研发之前", layout.title, 25.5, "#111111", "bold", "center", source(`${DETECTOR_PREFIX}text`, "title", "text"), evidenceTextBoxes),
    anchoredTextBox("smart-review-input-label-pending", "待评审", inset(layout.input, 14 * layout.sx, 28 * layout.sy), 15.7, "#222222", "regular", "center", source(`${DETECTOR_PREFIX}text`, "input", "label-pending"), evidenceTextBoxes),
    anchoredTextBox("smart-review-input-label-prd", "PRD", inset(layout.input, 20 * layout.sx, 50 * layout.sy), 13.5, "#222222", "regular", "center", source(`${DETECTOR_PREFIX}text`, "input", "label-prd"), evidenceTextBoxes),
    anchoredTextBox("smart-review-skill-label", "PRD评审Skill", roundedBox({ x: 318 * layout.sx, y: 291 * layout.sy, w: 164 * layout.sx, h: 30 * layout.sy }), 14.3, "#FFFFFF", "regular", "center", source(`${DETECTOR_PREFIX}text`, "skill", "label"), evidenceTextBoxes),
    anchoredTextBox("smart-review-pass-header", "修订建议/通过项清单", roundedBox({ x: 720 * layout.sx, y: 129 * layout.sy, w: 191 * layout.sx, h: 28 * layout.sy }), 13.8, "#FFFFFF", "bold", "center", source(`${DETECTOR_PREFIX}text`, "pass-document", "header"), evidenceTextBoxes),
    anchoredTextBox("smart-review-risk-title", "风险归档", roundedBox({ x: 745 * layout.sx, y: 303 * layout.sy, w: 154 * layout.sx, h: 28 * layout.sy }), 17, "#C55B1A", "bold", "center", source(`${DETECTOR_PREFIX}text`, "risk-archive", "title"), evidenceTextBoxes),
    ...["逻辑矛盾", "边界缺失", "体验阻塞"].map((label, index) => anchoredTextBox(`smart-review-risk-label-${index}`, label, layout.riskItems[index], 15.1, "#FFFFFF", "bold", "center", source(`${DETECTOR_PREFIX}text`, `risk-item-${index}`, "label"), evidenceTextBoxes)),
    ...notes.map(([role, prefix, body, x, y, w]) => richNote(`smart-review-note-${role}`, prefix, body, x, y, w, layout, role, evidenceTextBoxes))
  ];
}

function richNote(id, prefix, body, x, y, w, layout, role, evidenceTextBoxes = []) {
  const fallback = roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: 20 * layout.sy });
  const evidence = findTextEvidence(evidenceTextBoxes, `${prefix}${body}`);
  const box = evidence?.box ? roundedBox(evidence.box) : fallback;
  const sizePt = Number(evidence?.font?.sizePt || 13);
  return {
    ...textBox(id, `${prefix}${body}`, box, sizePt, "#111111", "regular", "left", evidence?.box ? { ...source(`${DETECTOR_PREFIX}note`, `note-${role}`, "text"), evidenceBox: roundedBox(evidence.box) } : source(`${DETECTOR_PREFIX}note`, `note-${role}`, "text")),
    runs: [
      { text: prefix, font: { family: "Microsoft YaHei", sizePt, weight: "bold", color: "#111111" } },
      { text: body, font: { family: "Microsoft YaHei", sizePt, weight: "regular", color: "#111111" } }
    ]
  };
}

function anchoredTextBox(id, text, fallbackBox, sizePt, color, weight, align, sourceValue, evidenceTextBoxes) {
  const evidence = findTextEvidence(evidenceTextBoxes, text);
  return textBox(id, text, evidence?.box ? roundedBox(evidence.box) : fallbackBox, Number(evidence?.font?.sizePt || sizePt), color, weight, align, evidence?.box ? { ...sourceValue, evidenceBox: roundedBox(evidence.box) } : sourceValue);
}
function findTextEvidence(items, text) { const key = normalizeText(text); return (items || []).find((item) => normalizeText(item?.text) === key) || null; }

function materializeReviewIcon(layout, slideSize, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const pxBox = ptToPxBox(layout.icon, options.sourceImage, slideSize, 1);
  const icon = isolateLightReviewIcon(cropPng(options.sourceImage, pxBox));
  const deck = safeToken(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  const file = path.join(options.assetDir, `${deck}-p${page}-smart-review-inspection-icon.png`);
  writePng(file, icon);
  return [{ id: "smart-review-inspection-icon", type: "fidelity-crop", assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"), box: layout.icon, source: { editable: false, nativeRebuild: true, detector: `${DETECTOR_PREFIX}icon-crop`, strategy: "local-fidelity-crop", expressionForm: "icon-or-illustration", expressionSubtype: "inspection-lens-icon", recommendedAction: "keep-local-crop", intentionalMinimumUnitCrop: true, protectedMinimumUnit: true, skipVisualAtomRebuild: true, nonEditableReason: "source-faithful inspection icon retained as the smallest pictorial unit", ...component("skill", "icon") } }];
}

function deriveSmartReviewBranchPalette(layout, slideSize = DEFAULT_SLIDE, sourceImage) {
  if (!sourceImage?.rgba || !Number.isFinite(Number(sourceImage.width)) || !Number.isFinite(Number(sourceImage.height))) return {};
  // The left-side strip is text-free in this motif, so it safely reflects the
  // card surface without sampling black OCR glyphs or the surrounding page.
  const neutralFill = sampleNeutralFill(sourceImage, slideSize, {
    x: layout.input.x + layout.input.w * 0.12,
    y: layout.input.y + layout.input.h * 0.16,
    w: layout.input.w * 0.22,
    h: layout.input.h * 0.68
  });
  return neutralFill ? { inputFill: neutralFill } : {};
}

function sampleNeutralFill(image, slideSize, box) {
  const scaleX = Number(image.width) / Math.max(1, Number(slideSize.widthPt || 960));
  const scaleY = Number(image.height) / Math.max(1, Number(slideSize.heightPt || 540));
  const left = Math.max(0, Math.floor(Number(box.x) * scaleX));
  const top = Math.max(0, Math.floor(Number(box.y) * scaleY));
  const right = Math.min(image.width, Math.ceil((Number(box.x) + Number(box.w)) * scaleX));
  const bottom = Math.min(image.height, Math.ceil((Number(box.y) + Number(box.h)) * scaleY));
  const channels = [[], [], []];
  for (let y = top; y < bottom; y += 2) {
    for (let x = left; x < right; x += 2) {
      const offset = (y * image.width + x) * 4;
      if (image.rgba[offset + 3] < 220) continue;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
      const minimum = Math.min(...rgb);
      const maximum = Math.max(...rgb);
      if (maximum - minimum > 14 || minimum < 110 || maximum > 235) continue;
      channels[0].push(rgb[0]);
      channels[1].push(rgb[1]);
      channels[2].push(rgb[2]);
    }
  }
  if (channels[0].length < 30) return null;
  const median = (values) => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  return rgbToHex(median(channels[0]), median(channels[1]), median(channels[2]));
}

function isolateLightReviewIcon(image) {
  const rgba = Buffer.from(image.rgba);
  for (let offset = 0; offset < rgba.length; offset += 4) {
    const r = rgba[offset];
    const g = rgba[offset + 1];
    const b = rgba[offset + 2];
    const keep = r >= 155 && g >= 175 && b >= 180 && Math.max(r, g, b) - Math.min(r, g, b) <= 100;
    if (!keep) rgba[offset + 3] = 0;
  }
  return { ...image, rgba };
}

function filterSmartReviewBranchGateTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const native = (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX));
  const claimed = new Set(native.map((item) => normalizeText(item.text)));
  const fragments = new Set(["待评审", "prd"]);
  return (textBoxes || []).filter((item) => {
    if (String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX)) return true;
    const key = normalizeText(item?.text || "");
    return !claimed.has(key) && !fragments.has(key);
  });
}

function textBox(id, text, box, sizePt, color, weight, align, sourceValue) {
  return { id, text, box, font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1 }, style: { wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, wrap: true, source: sourceValue };
}

function source(detector, role, part) {
  return { editable: true, nativeRebuild: true, detector, confidence: 0.94, expressionForm: "workflow-diagram", expressionSubtype: "smart-review-branch-gate", ...component(role, part) };
}

function component(role, part) {
  const safeRole = safeToken(role);
  return { nativeComponentGroupId: `smart-review-branch-${safeRole}`, nativeComponentArchetype: "smart-review-branch-gate", nativeComponentRole: part };
}

function lineBox(a, b) { return roundedBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }); }
function inset(box, x, y) { return roundedBox({ x: box.x + x, y: box.y + y, w: Math.max(1, box.w - x * 2), h: Math.max(1, box.h - y * 2) }); }
function ptToPxBox(box, image, slideSize, paddingPt = 0) { const sx = image.width / Number(slideSize.widthPt || 960); const sy = image.height / Number(slideSize.heightPt || 540); const x = Math.max(0, Math.floor((box.x - paddingPt) * sx)); const y = Math.max(0, Math.floor((box.y - paddingPt) * sy)); const right = Math.min(image.width, Math.ceil((box.x + box.w + paddingPt) * sx)); const bottom = Math.min(image.height, Math.ceil((box.y + box.h + paddingPt) * sy)); return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) }; }
function roundedBox(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100])); }
function areaOf(box) { return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0)); }
function normalizeText(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_\-/]/g, "").toLowerCase(); }
function safeToken(value) { return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component"; }
function rgbToHex(r, g, b) { return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`; }
function adjustHex(hex, amount) { const match = String(hex || "").match(/^#?([0-9a-f]{6})$/i); if (!match) return hex; const value = match[1]; return rgbToHex(...[0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16) + amount)); }
function lightenHex(hex, amount) { return adjustHex(hex, Math.abs(Number(amount || 0))); }
function darkenHex(hex, amount) { return adjustHex(hex, -Math.abs(Number(amount || 0))); }

module.exports = { DETECTOR_PREFIX, branchLayout, createSmartReviewBranchGateObjects, deriveSmartReviewBranchPalette, filterSmartReviewBranchGateTextBoxes, isolateLightReviewIcon, shouldObjectifySmartReviewBranchGate };
