"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const DETECTOR_PREFIX = "skill-chain-orchestration-native-";

function createSkillChainOrchestrationObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifySkillChainOrchestration(page, textBoxes, slideSize)) return { matched: false, sourceIds: [], shapes: [], textBoxes: [], images: [] };
  const sourceImages = (page.images || []).filter((image) => areaOf(image.box) > 0);
  const sourceIds = sourceImages.map((image) => String(image.id || "")).filter(Boolean);
  for (const image of sourceImages) image.source = { ...(image.source || {}), skillChainOrchestrationObjectified: true, dropErasedResidualAfterNativeRebuild: true, expressionForm: "workflow-diagram", expressionSubtype: "skill-chain-orchestration" };
  const layout = chainLayout(slideSize);
  return { matched: true, sourceIds, shapes: createChainShapes(layout), textBoxes: createChainTextBoxes(layout, textBoxes), images: materializeShieldIcon(layout, slideSize, options) };
}

function shouldObjectifySkillChainOrchestration(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const semantic = normalizeText((textBoxes || []).map((item) => item?.text || "").join(" "));
  const required = ["skills协作模式", "单点调用与链式编排", "产品经理工作台", "理解", "生成", "评审", "资产库", "评审记录"];
  if (!required.every((token) => semantic.includes(normalizeText(token)))) return false;
  const imageArea = (page.images || []).reduce((sum, image) => sum + areaOf(image.box), 0);
  const slideArea = Math.max(1, Number(slideSize.widthPt || 960) * Number(slideSize.heightPt || 540));
  return (page.images || []).length > 0 && imageArea / slideArea >= 0.08;
}

function chainLayout(slideSize = DEFAULT_SLIDE) {
  const sx = Number(slideSize.widthPt || 960) / 960;
  const sy = Number(slideSize.heightPt || 540) / 540;
  const box = (x, y, w, h) => roundedBox({ x: x * sx, y: y * sy, w: w * sx, h: h * sy });
  return {
    sx, sy,
    title: box(225, 39, 512, 38),
    workstation: box(74, 218, 70, 70),
    stages: [
      { role: "understand", label: "理解", box: box(214.4, 263.6, 77.6, 76.9) },
      { role: "generate", label: "生成", box: box(348.2, 263.6, 77.2, 76.9) },
      { role: "review", label: "评审", box: box(481.7, 263.6, 76.8, 76.9) },
      { role: "prototype", label: "原型", box: box(614.4, 263.6, 77.6, 76.9) }
    ],
    repository: box(756.5, 147.8, 148.8, 197.6),
    shield: box(540, 319, 42, 49)
  };
}

function createChainShapes(layout) {
  const shapes = [];
  const add = (shape) => shapes.push(shape);
  add({ id: "skill-chain-workstation", type: "ellipse", box: layout.workstation, style: { fill: "#B2B2B2", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#BDBDBD" }, { position: 1, color: "#A6A6A6" }] }, stroke: "#A7A7A7", strokeWidthPt: 0.8 }, source: source(`${DETECTOR_PREFIX}workstation`, "workstation", "node") });
  layout.stages.forEach((stage) => add({ id: `skill-chain-stage-${stage.role}`, type: "roundRect", box: stage.box, style: { fill: "#277BCF", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#2774C8" }, { position: 1, color: "#3689DA" }] }, stroke: "#2878C5", strokeWidthPt: 0.8, radiusPt: 5, shadow: { color: "#2878C5", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source(`${DETECTOR_PREFIX}stage-card`, `stage-${stage.role}`, "container") }));
  addRepository(add, layout);
  addGreenChain(add, layout);
  addGrayInvocationRoutes(add, layout);
  return shapes;
}

function addRepository(add, layout) {
  const repo = layout.repository;
  add({ id: "skill-chain-repository", type: "roundRect", box: repo, style: { fill: "#287BCF", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#2774C8" }, { position: 1, color: "#3588D9" }] }, stroke: "#2878C5", strokeWidthPt: 1, radiusPt: 6 }, source: source(`${DETECTOR_PREFIX}repository`, "repository", "container") });
  const itemBoxes = [[775.4, 212.3, 111.2, 30.4], [775.4, 255.4, 111.2, 29.6], [775.4, 297.4, 111.2, 31.0]];
  itemBoxes.forEach(([x, y, w, h], index) => add({ id: `skill-chain-repository-item-${index}`, type: "roundRect", box: roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: h * layout.sy }), style: { fill: "#FFFFFF", stroke: "#E8E8E8", strokeWidthPt: 0.8, radiusPt: 5, shadow: { color: "#0E5B9B", alpha: 0.08, blurPt: 2, distancePt: 1, angle: 45 } }, source: source(`${DETECTOR_PREFIX}repository-item`, "repository", `item-${index}`) }));
}

function addGreenChain(add, layout) {
  const green = "#2BA961";
  for (let index = 0; index < layout.stages.length - 1; index += 1) {
    const a = layout.stages[index].box;
    const b = layout.stages[index + 1].box;
    add(connector(`skill-chain-green-stage-${index}`, { x: a.x + a.w, y: a.y + a.h / 2 }, { x: b.x, y: b.y + b.h / 2 }, green, "green-chain", `stage-${index}`));
  }
  const last = layout.stages[3].box;
  const x = 733 * layout.sx;
  const repoY = 235 * layout.sy;
  add(connector("skill-chain-green-repo-a", { x: last.x + last.w, y: last.y + last.h / 2 }, { x, y: last.y + last.h / 2 }, green, "green-chain", "repo-a"));
  add(connector("skill-chain-green-repo-b", { x, y: last.y + last.h / 2 }, { x, y: repoY }, green, "green-chain", "repo-b"));
  add(connector("skill-chain-green-repo-c", { x, y: repoY }, { x: layout.repository.x, y: repoY }, green, "green-chain", "repo-c", true));
}

function addGrayInvocationRoutes(add, layout) {
  const gray = "#9B9B9B";
  const origin = { x: layout.workstation.x + layout.workstation.w, y: layout.workstation.y + layout.workstation.h / 2 };
  const branchX = 190 * layout.sx;
  add(connector("skill-chain-gray-origin", origin, { x: branchX, y: origin.y }, gray, "gray-routing", "origin"));
  const stageCenterY = layout.stages[0].box.y + layout.stages[0].box.h / 2;
  add(connector("skill-chain-gray-understand-v", { x: branchX, y: origin.y }, { x: branchX, y: stageCenterY }, gray, "gray-routing", "understand-v"));
  add(connector("skill-chain-gray-understand-h", { x: branchX, y: stageCenterY }, { x: layout.stages[0].box.x, y: stageCenterY }, gray, "gray-routing", "understand-h", true));
  add(connector("skill-chain-gray-repository-v", { x: branchX, y: origin.y }, { x: branchX, y: 185 * layout.sy }, gray, "gray-routing", "repository-v"));
  add(connector("skill-chain-gray-repository-h", { x: branchX, y: 185 * layout.sy }, { x: layout.repository.x, y: 185 * layout.sy }, gray, "gray-routing", "repository-h", true));
  add(connector("skill-chain-gray-review-h", { x: layout.repository.x, y: 202 * layout.sy }, { x: 520 * layout.sx, y: 202 * layout.sy }, gray, "gray-routing", "review-h"));
  add(connector("skill-chain-gray-review-v", { x: 520 * layout.sx, y: 202 * layout.sy }, { x: 520 * layout.sx, y: layout.stages[2].box.y }, gray, "gray-routing", "review-v", true));
}

function connector(id, from, to, color, group, part, arrow = false) {
  return { id, type: "line", box: lineBox(from, to), style: { stroke: color, strokeWidthPt: color === "#9B9B9B" ? 2.8 : 4.2, connectorType: "straight", endArrow: arrow ? "triangle" : undefined, lineCap: "round" }, source: source(`${DETECTOR_PREFIX}connector`, group, part) };
}

function createChainTextBoxes(layout, evidenceTextBoxes = []) {
  const anchored = (id, text, fallbackBox, sizePt, color, weight, align, sourceValue) => {
    const evidence = nearestTextEvidence(evidenceTextBoxes, text, fallbackBox);
    const box = evidence ? copyBox(evidence.box) : fallbackBox;
    const evidenceSize = Number(evidence?.font?.sizePt);
    const resolvedSize = Number.isFinite(evidenceSize) ? clamp(evidenceSize, 9, 30) : sizePt;
    return textBox(id, text, box, resolvedSize, color, weight, align, withEvidence(sourceValue, evidence));
  };
  const notes = [
    ["minimal", "极简跨界调用：", "支持将单一 Skill 抽离使用，精准解决即时痛点。", 56, 443, 352],
    ["deposit", "结果自动沉淀：", "无论单点还是链式，产出物均自动入库，消除手动搬运。", 501, 443, 399],
    ["automation", "全链路自动化：", "将四大节点串联编排，实现从需求到原型的无人值守流转。", 56, 473, 405],
    ["knowledge", "组织经验固化：", "每一次调用都在为企业的标准产品知识网络注入新鲜资产。", 501, 473, 410]
  ];
  return [
    anchored("skill-chain-title", "Skills协作模式：单点调用与链式编排", layout.title, 25.5, "#111111", "bold", "center", source(`${DETECTOR_PREFIX}text`, "title", "text")),
    anchored("skill-chain-workstation-label", "产品经理工作台", roundedBox({ x: 47 * layout.sx, y: 294 * layout.sy, w: 126 * layout.sx, h: 28 * layout.sy }), 16, "#111111", "regular", "center", source(`${DETECTOR_PREFIX}text`, "workstation", "label")),
    ...layout.stages.map((stage) => anchored(`skill-chain-stage-label-${stage.role}`, stage.label, inset(stage.box, 8 * layout.sx, 18 * layout.sy), 20, "#FFFFFF", "regular", "center", source(`${DETECTOR_PREFIX}text`, `stage-${stage.role}`, "label"))),
    anchored("skill-chain-repository-label", "资产库", roundedBox({ x: 832 * layout.sx, y: 173 * layout.sy, w: 108 * layout.sx, h: 30 * layout.sy }), 21, "#FFFFFF", "regular", "center", source(`${DETECTOR_PREFIX}text`, "repository", "title")),
    ...["PRD", "原型", "评审记录"].map((label, index) => anchored(`skill-chain-repository-item-label-${index}`, label, roundedBox({ x: 834 * layout.sx, y: (232 + index * 45) * layout.sy, w: 104 * layout.sx, h: 22 * layout.sy }), 17, "#222222", "regular", "center", source(`${DETECTOR_PREFIX}text`, "repository", `item-${index}-label`))),
    ...notes.map(([role, prefix, body, x, y, w]) => richNote(`skill-chain-note-${role}`, prefix, body, x, y, w, layout, role, evidenceTextBoxes))
  ];
}

function materializeShieldIcon(layout, slideSize, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const crop = cropPng(options.sourceImage, ptToPxBox(layout.shield, options.sourceImage, slideSize, 1));
  const icon = isolateOrangeShield(crop);
  const deck = safeToken(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  const file = path.join(options.assetDir, `${deck}-p${page}-skill-chain-warning-shield.png`);
  writePng(file, icon);
  return [{ id: "skill-chain-warning-shield", type: "fidelity-crop", assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"), box: layout.shield, source: { editable: false, nativeRebuild: true, detector: `${DETECTOR_PREFIX}shield-icon-crop`, strategy: "local-fidelity-crop", expressionForm: "icon-or-illustration", expressionSubtype: "warning-shield-icon", recommendedAction: "keep-local-crop", intentionalMinimumUnitCrop: true, protectedMinimumUnit: true, skipVisualAtomRebuild: true, nonEditableReason: "source-faithful warning shield retained as the smallest pictorial unit", semanticParentGroupId: "skill-chain-orchestration-stage-review", ...component("warning-shield", "warning-icon") } }];
}

function isolateOrangeShield(image) {
  const rgba = Buffer.from(image.rgba);
  const orange = new Uint8Array(image.width * image.height);
  for (let pixel = 0; pixel < orange.length; pixel += 1) {
    const offset = pixel * 4, r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
    orange[pixel] = r >= 170 && g >= 55 && g <= 190 && b <= 125 ? 1 : 0;
  }
  for (let pixel = 0; pixel < orange.length; pixel += 1) {
    const offset = pixel * 4, r = rgba[offset], g = rgba[offset + 1], b = rgba[offset + 2];
    let keep = orange[pixel] === 1;
    if (!keep && r >= 215 && g >= 215 && b >= 205) {
      const x = pixel % image.width, y = Math.floor(pixel / image.width);
      for (let dy = -6; dy <= 6 && !keep; dy += 1) for (let dx = -6; dx <= 6 && !keep; dx += 1) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < image.width && ny >= 0 && ny < image.height && orange[ny * image.width + nx]) keep = true;
      }
    }
    if (!keep) rgba[offset + 3] = 0;
  }
  return { ...image, rgba };
}

function filterSkillChainOrchestrationTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const native = (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX));
  const claimed = new Set(native.map((item) => normalizeText(item.text)));
  return (textBoxes || []).filter((item) => String(item?.source?.detector || "").startsWith(DETECTOR_PREFIX) || !claimed.has(normalizeText(item?.text || "")));
}

function richNote(id, prefix, body, x, y, w, layout, role, evidenceTextBoxes = []) { const fallback = roundedBox({ x: x * layout.sx, y: y * layout.sy, w: w * layout.sx, h: 20 * layout.sy }); const text = `${prefix}${body}`; const evidence = nearestTextEvidence(evidenceTextBoxes, text, fallback); const box = evidence ? copyBox(evidence.box) : fallback; const evidenceSize = Number(evidence?.font?.sizePt); const sizePt = Number.isFinite(evidenceSize) ? clamp(evidenceSize, 9, 13) : 13; return { ...textBox(id, text, box, sizePt, "#111111", "regular", "left", withEvidence(source(`${DETECTOR_PREFIX}note`, `note-${role}`, "text"), evidence)), runs: [{ text: prefix, font: { family: "Microsoft YaHei", sizePt, weight: "bold", color: "#111111" } }, { text: body, font: { family: "Microsoft YaHei", sizePt, weight: "regular", color: "#111111" } }] }; }
function textBox(id, text, box, sizePt, color, weight, align, sourceValue) { return { id, text, box, font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1 }, style: { wrap: true, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, wrap: true, source: sourceValue }; }
function nearestTextEvidence(items, text, fallbackBox) { const target = normalizeText(text); const matches = (items || []).filter((item) => item?.box && normalizeText(item.text) === target); if (matches.length <= 1) return matches[0] || null; const center = boxCenter(fallbackBox); return matches.slice().sort((a, b) => centerDistance(boxCenter(a.box), center) - centerDistance(boxCenter(b.box), center))[0]; }
function withEvidence(sourceValue, evidence) { return evidence?.box ? { ...sourceValue, evidenceBox: copyBox(evidence.box), ocrConfidence: Number.isFinite(Number(evidence.source?.confidence)) ? Number(evidence.source.confidence) : undefined } : sourceValue; }
function copyBox(box) { return roundedBox({ x: Number(box.x), y: Number(box.y), w: Number(box.w), h: Number(box.h) }); }
function boxCenter(box) { return { x: Number(box?.x || 0) + Number(box?.w || 0) / 2, y: Number(box?.y || 0) + Number(box?.h || 0) / 2 }; }
function centerDistance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function source(detector, role, part) { return { editable: true, nativeRebuild: true, detector, confidence: 0.95, expressionForm: "workflow-diagram", expressionSubtype: "skill-chain-orchestration", ...component(role, part) }; }
function component(role, part) { const safeRole = safeToken(role); return { nativeComponentGroupId: `skill-chain-orchestration-${safeRole}`, nativeComponentArchetype: "skill-chain-orchestration", nativeComponentRole: part }; }
function lineBox(a, b) { return roundedBox({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }); }
function inset(box, x, y) { return roundedBox({ x: box.x + x, y: box.y + y, w: Math.max(1, box.w - x * 2), h: Math.max(1, box.h - y * 2) }); }
function ptToPxBox(box, image, slideSize, paddingPt = 0) { const sx = image.width / Number(slideSize.widthPt || 960), sy = image.height / Number(slideSize.heightPt || 540); const x = Math.max(0, Math.floor((box.x - paddingPt) * sx)), y = Math.max(0, Math.floor((box.y - paddingPt) * sy)), right = Math.min(image.width, Math.ceil((box.x + box.w + paddingPt) * sx)), bottom = Math.min(image.height, Math.ceil((box.y + box.h + paddingPt) * sy)); return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) }; }
function roundedBox(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100])); }
function areaOf(box) { return Math.max(0, Number(box?.w || 0)) * Math.max(0, Number(box?.h || 0)); }
function normalizeText(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_\-/]/g, "").toLowerCase(); }
function safeToken(value) { return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component"; }

module.exports = { DETECTOR_PREFIX, chainLayout, createSkillChainOrchestrationObjects, filterSkillChainOrchestrationTextBoxes, isolateOrangeShield, shouldObjectifySkillChainOrchestration };
