"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };
const PREFIX = "product-brain-asset-closure-";

function createAssetClosureFunnelObjects(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const model = inferAssetClosureFunnel(page, textBoxes, slideSize);
  if (!model) return emptyResult();
  for (const image of model.sourceImages) {
    image.source = {
      ...(image.source || {}),
      productBrainAssetClosureFunnelObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset closure funnel"}; rebuilt a text-anchored asset-closure funnel as native editable components`
    };
  }
  return {
    matched: true,
    model,
    shapes: createShapes(model),
    textBoxes: createTextBoxes(model),
    images: materializeCrops(model, slideSize, options)
  };
}

function inferAssetClosureFunnel(page = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const boxes = (textBoxes || []).filter((item) => validBox(item?.box) && normalize(item.text));
  const engine = boxes.find((item) => /(?:skills?|ai)?(?:处理|加工|转换|processing|transformation).*引擎|(?:skills?|ai).*engine/i.test(normalize(item.text)));
  if (!engine) return null;
  const engineY = centerY(engine.box);
  const rules = boxes.filter((item) => Math.abs(centerY(item.box) - engineY) <= 90)
    .filter((item) => /提取|映射|校验|约束|extract|mapping|validation|constraint|rule/i.test(normalize(item.text)))
    .sort((a, b) => centerX(a.box) - centerX(b.box));
  if (rules.length !== 3 || span(rules.map((item) => centerX(item.box))) < Number(slideSize.widthPt || 960) * 0.2) return null;
  const inputCandidates = boxes.filter((item) => centerY(item.box) < engineY - 25)
    .filter((item) => /docs?|html|screenshots?|mock\s*data|documents?|screens?|data/i.test(normalize(item.text)));
  const inputKinds = new Set(inputCandidates.map(inputKind).filter(Boolean));
  if (inputKinds.size < 3) return null;
  const outputCandidates = boxes.filter((item) => centerY(item.box) > engineY + 70)
    .filter((item) => centerY(item.box) < engineY + 160)
    .filter((item) => /结构化文档|原型入口|document|prototype|runnable|output/i.test(normalize(item.text)))
    .sort((a, b) => centerX(a.box) - centerX(b.box));
  if (outputCandidates.length !== 2 || centerX(outputCandidates[0].box) >= centerX(engine.box) || centerX(outputCandidates[1].box) <= centerX(engine.box)) return null;
  const sourceImages = (page.images || []).filter((image) => isCandidateImage(image, slideSize));
  if (sourceImages.length === 0) return null;

  const title = boxes.find((item) => centerY(item.box) < engineY - 90 && Number(item.box.w || 0) > Number(slideSize.widthPt || 960) * 0.35) || null;
  const valueLines = boxes.filter((item) => centerY(item.box) > Math.max(...outputCandidates.map((item) => centerY(item.box))) + 35)
    .filter((item) => Number(item.box.w || 0) > Number(slideSize.widthPt || 960) * 0.28)
    .sort((a, b) => Number(a.box.y || 0) - Number(b.box.y || 0));
  if (valueLines.length < 1 || valueLines.length > 3) return null;

  const center = centerX(engine.box);
  const leftRule = rules[0];
  const rightRule = rules[2];
  const topY = round(Math.max(...inputCandidates.map((item) => Number(item.box.y || 0) + Number(item.box.h || 0))) - 3);
  const joinY = round(Math.max(...rules.map((item) => Number(item.box.y || 0) + Number(item.box.h || 0))) + 14);
  const outputY = round(average(outputCandidates.map((item) => centerY(item.box))));
  const bottomY = round(outputY + 33);
  const left = round(Number(leftRule.box.x || 0) + 20);
  const right = round(Number(rightRule.box.x || 0) + Number(rightRule.box.w || 0) - 32);
  if (right - left < 220 || topY >= joinY || joinY >= bottomY) return null;
  const lowerInset = (right - left) * 0.18;
  const lowerLeft = round(left + lowerInset);
  const lowerRight = round(right - lowerInset);
  return {
    sourceImages,
    title,
    engine,
    rules,
    inputs: selectInputs(inputCandidates, center),
    outputs: outputCandidates,
    valueLines,
    geometry: { center, left, right, topY, joinY, outputY, bottomY, lowerLeft, lowerRight }
  };
}

function createShapes(model) {
  const g = model.geometry;
  const shapes = [];
  shapes.push(shape("frame", "native-frame", "rect", { x: 27, y: 38, w: 906, h: 476 }, { fill: "none", stroke: "#222222", strokeWidthPt: 1.1, radiusPt: 5 }, "frame"));
  shapes.push(shape("funnel", "native-funnel", "freeform", { x: g.left, y: g.topY, w: g.right - g.left, h: g.bottomY - g.topY }, {
    fill: "#0F66C4", stroke: "#0B559F", strokeWidthPt: 1.2, opacity: 0.97,
    points: [[0, 0], [1, 0], [(g.lowerRight - g.left) / (g.right - g.left), (g.joinY - g.topY) / (g.bottomY - g.topY)], [(g.center + 35 - g.left) / (g.right - g.left), 1], [(g.center - 35 - g.left) / (g.right - g.left), 1], [(g.lowerLeft - g.left) / (g.right - g.left), (g.joinY - g.topY) / (g.bottomY - g.topY)]]
  }, "core"));
  shapes.push(shape("funnel-lower", "native-funnel-lower", "freeform", { x: g.lowerLeft, y: g.joinY, w: g.lowerRight - g.lowerLeft, h: g.bottomY - g.joinY }, {
    fill: "#31B877", stroke: "#238E5B", strokeWidthPt: 0.9, opacity: 0.97,
    points: [[0, 0], [1, 0], [(g.center + 35 - g.lowerLeft) / (g.lowerRight - g.lowerLeft), 1], [(g.center - 35 - g.lowerLeft) / (g.lowerRight - g.lowerLeft), 1]]
  }, "core"));
  shapes.push(shape("funnel-stem", "native-funnel-stem", "cylinder", { x: g.center - 35, y: g.joinY + 9, w: 70, h: Math.max(28, g.bottomY - g.joinY - 12) }, { fill: "#2EB878", stroke: "#177F4E", strokeWidthPt: 1.1, opacity: 0.95 }, "core"));
  model.rules.forEach((rule, index) => {
    const box = expand(rule.box, 7, 5);
    shapes.push(shape(`pill-${index}`, "native-pill", "rect", box, { fill: index === 1 ? "#31A96C" : "#1A75BB", stroke: "#0E5A93", strokeWidthPt: 1, radiusPt: 3 }, `rule-${index}`));
    const from = index === 1 ? { x: centerX(box), y: box.y + box.h } : { x: index === 0 ? box.x + box.w : box.x, y: centerY(box) };
    const to = index === 1 ? { x: g.center, y: g.outputY } : { x: index === 0 ? g.center - 60 : g.center + 60, y: Number(model.engine.box.y || 0) + Number(model.engine.box.h || 0) + 12 };
    shapes.push(shape(`rule-arrow-${index}`, "native-rule-arrow", "line", lineBox(from, to), { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight", endArrow: "triangle" }, `rule-${index}`));
  });
  shapes.push(shape("output-route-left", "native-output-route", "line", lineBox({ x: g.center, y: g.outputY }, { x: g.lowerLeft + 23, y: g.outputY }), { stroke: "#3AAF73", strokeWidthPt: 2, connectorType: "straight", endArrow: "triangle" }, "output-left"));
  shapes.push(shape("output-route-right", "native-output-route", "line", lineBox({ x: g.center, y: g.outputY }, { x: g.lowerRight - 12, y: g.outputY }), { stroke: "#3AAF73", strokeWidthPt: 2, connectorType: "straight", endArrow: "triangle" }, "output-right"));
  const valueUnion = union(model.valueLines.map((item) => item.box));
  shapes.push(shape("value-banner", "native-value-banner", "rect", { x: 175, y: Math.max(430, valueUnion.y - 8), w: 610, h: Math.min(72, valueUnion.h + 20) }, { fill: "#EAF6FF", stroke: "#3AAE82", strokeWidthPt: 2, radiusPt: 8, shadow: { color: "#60D09A", alpha: 0.25, blurPt: 9, distancePt: 0, angle: 0 } }, "value"));
  return shapes;
}

function createTextBoxes(model) {
  const boxes = [];
  if (model.title) {
    const title = text("title", model.title.text, expand(model.title.box, 0, 9), 33.4, "#000000", "bold", "center", "title");
    title.style.wrap = false;
    boxes.push(title);
  }
  const docs = model.inputs.docs;
  const mock = model.inputs.mock;
  if (docs) boxes.push(text("docs-label", "DOCs", expand(docs.box, 5, 3), 16, "#111111", "bold", "center", "input-label"));
  if (mock) boxes.push(text("mock-label", "Mock Data", expand(mock.box, 14, 3), 16, "#111111", "regular", "center", "input-label"));
  boxes.push(text("engine-title", model.engine.text.replace(/\s+/g, " ").replace(/skills(?=[\u4e00-\u9fff])/i, "Skills "), expand(model.engine.box, 25, 6), 21, "#FFFFFF", "bold", "center", "core"));
  model.rules.forEach((rule, index) => boxes.push(text(`pill-text-${index}`, rule.text.replace(/\s+/g, " "), expand(rule.box, 1, 1), 13, "#FFFFFF", "bold", "center", `rule-${index}`)));
  model.outputs.forEach((output, index) => boxes.push(text(`output-${index}`, output.text.replace(/\s+/g, " "), expand(output.box, 15, 4), 16, "#111111", "bold", "center", `output-${index}`)));
  model.valueLines.forEach((item, index) => {
    const valueText = text(
      `value-text-${index}`,
      String(item.text || "").trim(),
      item.box,
      Math.max(14, Number(item.font?.sizePt || 0) * 1.3),
      "#111111",
      "bold",
      "left",
      "value"
    );
    valueText.style.wrap = false;
    boxes.push(valueText);
  });
  return boxes;
}

function materializeCrops(model, slideSize, options) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  fs.mkdirSync(options.assetDir, { recursive: true });
  const g = model.geometry;
  const leftOutput = model.outputs[0].box;
  const rightOutput = model.outputs[1].box;
  const specs = [
    { id: "input-assembly", box: { x: g.left - 5, y: Math.max(0, Math.min(...Object.values(model.inputs).filter(Boolean).map((item) => Number(item.box.y || 0))) - 15), w: g.right - g.left, h: g.topY - Math.max(0, Math.min(...Object.values(model.inputs).filter(Boolean).map((item) => Number(item.box.y || 0))) - 15) }, subtype: "asset-input-materials-funnel-assembly" },
    { id: "document-output", box: { x: Number(leftOutput.x || 0) + Number(leftOutput.w || 0) + 8, y: g.joinY + 16, w: Math.max(24, g.lowerLeft - (Number(leftOutput.x || 0) + Number(leftOutput.w || 0)) + 23), h: Math.max(40, g.bottomY - g.joinY + 1) }, subtype: "structured-document-output-icon" },
    { id: "prototype-output", box: { x: g.lowerRight - 12, y: g.joinY + 16, w: Math.max(24, Number(rightOutput.x || 0) - g.lowerRight + 12), h: Math.max(40, g.bottomY - g.joinY - 3) }, subtype: "runnable-prototype-output-icon" }
  ];
  const deck = safe(options.deckName || "deck");
  const page = String(Number(options.pageIndex || 0) + 1).padStart(2, "0");
  return specs.map((spec) => {
    const box = clamp(spec.box, slideSize);
    const px = ptToPx(box, options.sourceImage, slideSize);
    const file = path.join(options.assetDir, `${deck}-p${page}-asset-closure-${spec.id}.png`);
    writePng(file, cropPng(options.sourceImage, px));
    const role = spec.id === "input-assembly" ? "input-assembly" : (spec.id === "document-output" ? "output-left" : "output-right");
    const group = `${PREFIX}${role}`;
    return { id: `asset-closure-${spec.id}-crop`, type: "fidelity-crop", assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"), box, source: { editable: false, nativeRebuild: true, detector: `${PREFIX}${spec.id}-crop`, expressionForm: "icon-or-illustration", expressionSubtype: spec.subtype, recommendedAction: "keep-local-crop", intentionalMinimumUnitCrop: true, protectedMinimumUnit: true, skipVisualAtomRebuild: true, nativeComponentInstance: true, nativeComponentGroupId: group, nativeComponentArchetype: "asset-closure-funnel", nativeComponentRole: "pictorial-unit", componentOwnerId: group, componentOwnerKind: "asset-closure-funnel", nonEditableReason: "pictorial input or output assembly retained as the smallest faithful visual unit" } };
  });
}

function selectInputs(candidates, center) {
  const byKind = {};
  for (const item of candidates) {
    const kind = inputKind(item);
    if (!kind) continue;
    if (!byKind[kind] || scoreInput(item, kind, center) > scoreInput(byKind[kind], kind, center)) byKind[kind] = item;
  }
  return byKind;
}

function scoreInput(item, kind, center) {
  const width = Number(item.box.w || 0);
  if (kind === "docs") return width - Math.abs(centerX(item.box) - (center - 190)) * 0.1;
  if (kind === "mock") return width - Math.abs(centerX(item.box) - (center + 210)) * 0.1;
  return width;
}

function inputKind(item) {
  const value = normalize(item?.text);
  if (/docs?|documents?/.test(value)) return "docs";
  if (/html/.test(value)) return "html";
  if (/screenshots?|screens?/.test(value)) return "screenshots";
  if (/mock\s*data|data/.test(value)) return "mock";
  return "";
}

function isCandidateImage(image, slideSize) {
  if (!/structured-case-graphic-underlay-crop|cycle-illustration-underlay-crop/.test(String(image?.source?.detector || ""))) return false;
  return Number(image.box?.w || 0) > Number(slideSize.widthPt || 960) * 0.55 && Number(image.box?.h || 0) > Number(slideSize.heightPt || 540) * 0.35;
}

function shape(id, detector, type, box, style, role) {
  const shapeBox = rounded(box);
  const points = Array.isArray(style?.points)
    ? style.points.map(([x, y]) => ({ x: round(shapeBox.x + shapeBox.w * x), y: round(shapeBox.y + shapeBox.h * y) }))
    : null;
  const safeStyle = { ...(style || {}) };
  delete safeStyle.points;
  return { id: `${PREFIX}${id}`, type, box: shapeBox, ...(points ? { points } : {}), style: safeStyle, source: source(`${PREFIX}${detector}`, role) };
}
function text(id, value, box, sizePt, color, weight, align, role) { return { id: `${PREFIX}${id}`, text: String(value || ""), box: rounded(box), font: { family: "Microsoft YaHei", sizePt, color, weight, align, valign: "middle", opacity: 1 }, style: { visibility: "visible", opacity: 1, fit: "shrink", wrap: true, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 }, source: source(`${PREFIX}native-text`, role) }; }
function source(detector, role) { const group = `${PREFIX}${safe(role || "component")}`; return { editable: true, nativeRebuild: true, detector, confidence: 0.9, nativeComponentInstance: true, nativeComponentGroupId: group, nativeComponentArchetype: "asset-closure-funnel", nativeComponentRole: role, componentOwnerId: group, componentOwnerKind: "asset-closure-funnel" }; }
function expand(box, x, y) { return { x: Number(box.x || 0) - x, y: Number(box.y || 0) - y, w: Number(box.w || 0) + x * 2, h: Number(box.h || 0) + y * 2 }; }
function lineBox(a, b) { return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; }
function union(boxes) { const x = Math.min(...boxes.map((b) => Number(b.x || 0))); const y = Math.min(...boxes.map((b) => Number(b.y || 0))); const r = Math.max(...boxes.map((b) => Number(b.x || 0) + Number(b.w || 0))); const d = Math.max(...boxes.map((b) => Number(b.y || 0) + Number(b.h || 0))); return { x, y, w: r - x, h: d - y }; }
function clamp(box, slide) { const x = Math.max(0, Number(box.x || 0)); const y = Math.max(0, Number(box.y || 0)); return rounded({ x, y, w: Math.max(1, Math.min(Number(box.w || 0), Number(slide.widthPt || 960) - x)), h: Math.max(1, Math.min(Number(box.h || 0), Number(slide.heightPt || 540) - y)) }); }
function ptToPx(box, image, slide) { const sx = image.width / Number(slide.widthPt || 960); const sy = image.height / Number(slide.heightPt || 540); const x = Math.max(0, Math.floor(box.x * sx)); const y = Math.max(0, Math.floor(box.y * sy)); const r = Math.min(image.width, Math.ceil((box.x + box.w) * sx)); const d = Math.min(image.height, Math.ceil((box.y + box.h) * sy)); return { x, y, w: Math.max(1, r - x), h: Math.max(1, d - y) }; }
function normalize(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_-]/g, "").toLowerCase(); }
function validBox(box) { return box && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) && Number(box.w) > 0 && Number(box.h) > 0; }
function centerX(box) { return Number(box.x || 0) + Number(box.w || 0) / 2; }
function centerY(box) { return Number(box.y || 0) + Number(box.h || 0) / 2; }
function span(values) { return values.length ? Math.max(...values) - Math.min(...values) : 0; }
function average(values) { return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length); }
function rounded(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(Number(value || 0) * 100) / 100])); }
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
function safe(value) { return String(value || "component").replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "component"; }
function emptyResult() { return { matched: false, model: null, shapes: [], textBoxes: [], images: [] }; }

module.exports = { createAssetClosureFunnelObjects, inferAssetClosureFunnel };
