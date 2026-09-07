"use strict";

const { calibrateConnectorStrokeWidth } = require("./connector-stroke-calibration");

const PREFIX = "team-knowledge-graph-";
const RELATION_BLUE = "#4F81E0";
const SOURCE_RELATION_STROKE_WIDTH_PX = 2;
const FALLBACK_RELATION_STROKE_WIDTH_PT = 2;

function validBox(box) {
  return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}
function center(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }
function normalized(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_-]/gu, "").toLowerCase(); }
function lineBox(from, to) { return { x: from.x, y: from.y, w: to.x - from.x, h: to.y - from.y }; }
function rounded(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100])); }
function unionBox(items, padding = 0) {
  const boxes = items.map((item) => item?.box).filter(validBox);
  if (!boxes.length) return null;
  const left = Math.min(...boxes.map((box) => box.x)); const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w)); const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left - padding, y: top - padding, w: right - left + padding * 2, h: bottom - top + padding * 2 };
}
function expandBox(box, { left, top, right, bottom }) { return { x: box.x - left, y: box.y - top, w: box.w + left + right, h: box.h + top + bottom }; }
function pointOnBoxToward(box, target) {
  const origin = center(box); const dx = target.x - origin.x; const dy = target.y - origin.y;
  if (dx === 0 && dy === 0) return origin;
  const scale = 1 / Math.max(Math.abs(dx) / (box.w / 2), Math.abs(dy) / (box.h / 2));
  return { x: origin.x + dx * scale, y: origin.y + dy * scale };
}
function source(detector, role, options = {}) {
  return { editable: true, nativeRebuild: true, detector: `${PREFIX}${detector}`, confidence: 0.94, semanticNativeStructure: true, componentOwnerKind: "knowledge-graph-panel", nativeComponentRole: role, ...options };
}
function shape(id, type, box, style, role) {
  const preserveResidualInterior = role === "panel" || role === "layer-band";
  const definedStyle = Object.fromEntries(Object.entries(style).filter(([, value]) => value !== undefined));
  return { id: `${PREFIX}${id}`, type, box: rounded(box), style: definedStyle, source: source(id, role, preserveResidualInterior ? { preserveResidualInterior: true } : {}) };
}
function connector(id, from, to, relationshipStyle, style = {}) {
  return shape(id, "line", lineBox(from, to), { ...relationshipStyle, connectorType: "straight", endArrow: "triangle", ...style }, "relationship");
}
function pictorialAnchor(item, fallbackTarget) {
  const point = item?.source?.connectorAnchorPoint;
  return [point?.x, point?.y].every(Number.isFinite) ? point : pointOnBoxToward(item.box, fallbackTarget);
}
function arcConnector(id, box, adjustments, relationshipStyle, style = {}) {
  return shape(id, "arc", box, { shapeType: "arc", fill: "none", ...relationshipStyle, adjustments, endArrow: "triangle", ...style }, "relationship");
}
function relationshipStyle(slideSize, sourceImageWidthPx) {
  const slideWidthPt = Number(slideSize?.widthPt);
  const sourceWidthPx = Number(sourceImageWidthPx);
  const calibration = Number.isFinite(sourceWidthPx) && sourceWidthPx > 0
    ? calibrateConnectorStrokeWidth({
      sampledWidthsPx: [SOURCE_RELATION_STROKE_WIDTH_PX],
      sourceImageWidthPx: sourceWidthPx,
      slideWidthPt,
      fallbackPt: FALLBACK_RELATION_STROKE_WIDTH_PT
    })
    : Object.freeze({ strokeWidthPt: FALLBACK_RELATION_STROKE_WIDTH_PT, observedStrokeWidthPx: null, pixelsPerPoint: null, sampleCount: 0, usedFallback: true, quantumPt: 0.25 });
  return Object.freeze({
    style: Object.freeze({
      stroke: RELATION_BLUE,
      strokeWidthPt: calibration.strokeWidthPt,
      lineCap: "round",
      lineJoin: "round",
      startArrowWidth: "medium",
      startArrowLength: "medium",
      endArrowWidth: "medium",
      endArrowLength: "medium"
    }),
    calibration
  });
}
function intersectionCoverage(target, container) {
  if (!validBox(target) || !validBox(container)) return 0;
  const width = Math.max(0, Math.min(target.x + target.w, container.x + container.w) - Math.max(target.x, container.x));
  const height = Math.max(0, Math.min(target.y + target.h, container.y + container.h) - Math.max(target.y, container.y));
  return width * height / Math.max(1, target.w * target.h);
}
function findModel(textBoxes, slideSize) {
  const width = Number(slideSize?.widthPt || 0); const height = Number(slideSize?.heightPt || 0);
  if (!(width >= 600 && width <= 1600 && height / width >= 0.65 && height / width <= 0.85)) return null;
  const boxes = (Array.isArray(textBoxes) ? textBoxes : []).filter((item) => validBox(item?.box) && normalized(item.text));
  if (boxes.length < 14 || boxes.length > 160) return null;
  const title = boxes.find((item) => center(item.box).y < height * 0.14 && /知识图谱|本体|knowledgegraph|ontology/iu.test(normalized(item.text)));
  if (!title) return null;
  const headingCandidates = boxes.filter((item) => {
    const point = center(item.box); const text = normalized(item.text);
    return point.y >= height * 0.13 && point.y <= height * 0.3 && /问题|思路|能力|现状|方案|challenge|approach|capabilit|problem/iu.test(text);
  }).sort((left, right) => center(left.box).x - center(right.box).x);
  if (headingCandidates.length < 3) return null;
  const headings = [0, 1, 2].map((third) => headingCandidates.find((item) => {
    const ratio = center(item.box).x / width; return ratio >= third / 3 && ratio < (third + 1) / 3;
  }));
  if (headings.some((item) => !item)) return null;
  const lowerCandidates = boxes.filter((item) => {
    const point = center(item.box); return point.y >= height * 0.72 && point.y <= height * 0.84 && item.box.w < width * 0.28 && /层|layer/iu.test(normalized(item.text));
  });
  const lower = [0, 1, 2].map((third) => lowerCandidates.filter((item) => {
    const ratio = center(item.box).x / width; return ratio >= third / 3 && ratio < (third + 1) / 3;
  }).sort((a, b) => center(a.box).y - center(b.box).y)[0]);
  if (lower.some((item) => !item)) return null;
  const middle = boxes.filter((item) => center(item.box).x >= width / 3 && center(item.box).x < width * 2 / 3 && center(item.box).y > height * 0.23 && center(item.box).y < height * 0.58);
  const hub = middle.find((item) => /人员|主体|实体|person|entity|subject/iu.test(normalized(item.text)));
  const translator = middle.find((item) => /翻译层|映射层|translation|mapping/iu.test(normalized(item.text)));
  const right = boxes.filter((item) => center(item.box).x >= width * 2 / 3 && center(item.box).y > height * 0.24 && center(item.box).y < height * 0.56);
  const left = boxes.filter((item) => center(item.box).x < width / 3 && center(item.box).y > height * 0.28 && center(item.box).y < height * 0.7);
  const highEvent = right.find((item) => /高空|抛物|拋物|high/iu.test(normalized(item.text)));
  const targetEvent = right.find((item) => /新型事件|新事件|newevent/iu.test(normalized(item.text)));
  const workItems = right.filter((item) => /工单|视频|workorder|video/iu.test(normalized(item.text)));
  const workBox = unionBox(workItems);
  if (!hub || !translator || !highEvent || !targetEvent || !workBox || left.length < 3) return null;
  const rightNodes = [highEvent, { text: workItems.map((item) => item.text).join("\n"), box: workBox }, targetEvent];
  const upgrade = boxes.find((item) => center(item.box).y > height * 0.86 && /升级终点|感知.*决策.*行动.*反馈|upgrade/iu.test(normalized(item.text)));
  return { width, height, title, headings, lower, hub, translator, middle, rightNodes, workItems, upgrade, left };
}

function buildShapes(model, relation) {
  const shapes = [];
  const headingCenters = model.headings.map((item) => center(item.box).x);
  const splitA = (headingCenters[0] + headingCenters[1]) / 2; const splitB = (headingCenters[1] + headingCenters[2]) / 2;
  const marginX = model.width * 0.015; const gap = model.width * 0.015;
  const panelTop = Math.max(model.height * 0.11, Math.min(...model.headings.map((item) => item.box.y)) - model.height * 0.035);
  const panelBottom = Math.min(...model.lower.map((item) => item.box.y)) - model.height * 0.075;
  const panelBounds = [[marginX, splitA - gap / 2], [splitA + gap / 2, splitB - gap / 2], [splitB + gap / 2, model.width - marginX]];
  panelBounds.forEach(([left, right], index) => shapes.push(shape(`panel-${index + 1}`, "roundRect", { x: left, y: panelTop, w: right - left, h: panelBottom - panelTop }, { fill: "#F8FAFC", stroke: "#E6EAEE", strokeWidthPt: 0.8, radiusPt: 12 }, "panel")));
  const bottomTop = Math.min(...model.lower.map((item) => item.box.y)) - model.height * 0.05;
  shapes.push(shape("layer-band", "roundRect", { x: marginX, y: bottomTop, w: model.width - marginX * 2, h: model.height - bottomTop - model.height * 0.025 }, { fill: "#F8FAFC", stroke: "#E6EAEE", strokeWidthPt: 0.8, radiusPt: 12 }, "layer-band"));
  const nodeItems = [model.hub, model.translator, ...model.rightNodes];
  const nodeBoxes = nodeItems.map((item, index) => expandBox(item.box, index === 0
    ? { left: 21, top: 21, right: 22, bottom: 22 }
    : index === 1 ? { left: 14, top: 7, right: 16, bottom: 8 }
      : index === 2 ? { left: 11, top: 10, right: 11, bottom: 12 }
        : index === 3 ? { left: 11, top: 9, right: 11, bottom: 9 }
          : { left: 15, top: 21, right: 16, bottom: 22 }));
  nodeBoxes.forEach((box, index) => shapes.push(shape(`node-${index + 1}`, "roundRect", box, { fill: "#FFFFFF", stroke: [1, 2, 3].includes(index) ? "#A7A7A7" : "#1473E6", strokeWidthPt: 1.25, radiusPt: 8 }, "node")));
  const hubBox = nodeBoxes[0];
  const translatorTarget = center(nodeBoxes[1]);
  shapes.push(connector("translator-hub", pointOnBoxToward(nodeBoxes[1], center(hubBox)), pointOnBoxToward(hubBox, translatorTarget), relation));
  const [highBox, workBox, targetBox] = nodeBoxes.slice(2);
  shapes.push(connector("right-work-high", { x: center(workBox).x, y: workBox.y }, { x: center(highBox).x, y: highBox.y + highBox.h }, relation));
  shapes.push(connector("right-work-target", { x: workBox.x + workBox.w, y: center(workBox).y }, { x: targetBox.x, y: center(targetBox).y }, relation));
  shapes.push(arcConnector("right-high-target", {
    x: highBox.x + highBox.w - (targetBox.x - highBox.x) * 0.72,
    y: center(highBox).y,
    w: (targetBox.x + targetBox.w * 0.72 - highBox.x - highBox.w) * 2,
    h: Math.max(30, targetBox.y - center(highBox).y) * 2
  }, [270, 360], relation));
  shapes.push(arcConnector("right-work-target-lower", {
    x: center(workBox).x,
    y: workBox.y + workBox.h - Math.max(32, model.height * 0.075),
    w: Math.max(40, targetBox.x + targetBox.w * 0.72 - center(workBox).x),
    h: Math.max(32, model.height * 0.075) * 2
  }, [0, 180], relation, { endArrow: undefined, startArrow: "triangle" }));
  for (let index = 0; index < model.lower.length - 1; index += 1) {
    const from = model.lower[index].box; const to = model.lower[index + 1].box;
    shapes.push(connector(`layer-flow-${index + 1}`, { x: from.x + from.w + 10, y: center(from).y }, { x: to.x - 10, y: center(to).y }, relation));
  }
  if (model.upgrade) {
    const routeY = Math.min(model.height - 12, model.upgrade.box.y + model.upgrade.box.h + 11);
    const left = model.lower[0].box; const right = model.lower[2].box;
    const leftInnerX = model.upgrade.box.x - 22; const rightInnerX = model.upgrade.box.x + model.upgrade.box.w + 22;
    shapes.push(connector("feedback-left-horizontal", { x: leftInnerX, y: routeY }, { x: center(left).x, y: routeY }, relation, { endArrow: undefined }));
    shapes.push(connector("feedback-left-up", { x: center(left).x, y: routeY }, { x: center(left).x, y: left.y + left.h + 8 }, relation));
    shapes.push(connector("feedback-right-horizontal", { x: rightInnerX, y: routeY }, { x: center(right).x, y: routeY }, relation, { endArrow: undefined }));
    shapes.push(connector("feedback-right-up", { x: center(right).x, y: routeY }, { x: center(right).x, y: right.y + right.h + 8 }, relation));
  }
  return { shapes, nodeBoxes };
}

function addKnowledgeGraphPictorialConnectors(page, slideSize) {
  if (page?.source?.semanticNativeStructure?.profile !== "knowledge-graph-three-panel-v1") return Object.freeze({ matched: false, added: 0 });
  const width = Number(slideSize?.widthPt); const height = Number(slideSize?.heightPt);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new TypeError("knowledge graph connector slide size is invalid");
  const images = (Array.isArray(page.images) ? page.images : []).filter((item) => validBox(item?.box));
  const central = images.filter((item) => { const point = center(item.box); return point.x >= width / 3 && point.x <= width * 2 / 3 && point.y >= height * 0.18 && point.y <= height * 0.64; }).sort((a, b) => center(a.box).y - center(b.box).y || center(a.box).x - center(b.box).x);
  const left = images.filter((item) => { const point = center(item.box); return point.x < width / 3 && point.y >= height * 0.18 && point.y <= height * 0.64; }).sort((a, b) => center(a.box).y - center(b.box).y || center(a.box).x - center(b.box).x);
  const hub = (Array.isArray(page.shapes) ? page.shapes : []).find((item) => item.id === `${PREFIX}node-1`);
  if (!hub || central.length !== 4 || left.length < 4) return Object.freeze({ matched: false, added: 0 });
  const relation = relationshipStyle(slideSize, page?.source?.semanticNativeStructure?.connectorCalibration?.sourceImageWidthPx).style;
  const hubCenter = center(hub.box);
  const added = central.map((item, index) => {
    const targetCenter = center(item.box);
    const hubJunction = { x: hubCenter.x, y: targetCenter.y < hubCenter.y ? hub.box.y : hub.box.y + hub.box.h };
    return connector(`pictorial-hub-${index + 1}`, hubJunction, pictorialAnchor(item, hubCenter), relation);
  });
  const top = left.slice(0, 2).sort((a, b) => center(a.box).x - center(b.box).x); const bottom = left.slice(-2).sort((a, b) => center(a.box).x - center(b.box).x);
  const legacyStyle = { stroke: "#252B33", dash: "dash", endArrow: undefined };
  added.push(connector("legacy-top", pointOnBoxToward(top[0].box, center(top[1].box)), pointOnBoxToward(top[1].box, center(top[0].box)), relation, legacyStyle));
  added.push(connector("legacy-cross-a", pointOnBoxToward(top[0].box, center(bottom[1].box)), pointOnBoxToward(bottom[1].box, center(top[0].box)), relation, legacyStyle));
  added.push(connector("legacy-cross-b", pointOnBoxToward(top[1].box, center(bottom[0].box)), pointOnBoxToward(bottom[0].box, center(top[1].box)), relation, legacyStyle));
  page.shapes = [...page.shapes.filter((item) => !String(item?.source?.detector || "").startsWith(`${PREFIX}pictorial-`) && !String(item?.source?.detector || "").startsWith(`${PREFIX}legacy-`)), ...added];
  return Object.freeze({ matched: true, added: added.length });
}

function nativeLabel(item, index) {
  const lineCount = Math.max(1, String(item.text || "").split(/\r?\n/u).length);
  const estimatedSize = Number(item.box?.h || 18) / lineCount * 0.68;
  return {
    ...item,
    id: `${PREFIX}label-${index + 1}`,
    font: { ...(item.font || {}), family: item.font?.family || "Microsoft YaHei", sizePt: Math.max(11, Math.min(18, estimatedSize)), color: item.font?.color || "#111111", opacity: 1, align: "center", valign: "middle" },
    style: { ...(item.style || {}), visibility: "visible", opacity: 1, fit: "shrink", wrap: lineCount > 1 },
    source: source(`label-${index + 1}`, "node-label", { sourceTextId: item.id || null })
  };
}

function removeNativeOwnedCrops(page, nodeBoxes, slideSize) {
  const height = Number(slideSize.heightPt); const width = Number(slideSize.widthPt);
  const removed = [];
  page.images = (Array.isArray(page.images) ? page.images : []).filter((item) => {
    if (item?.source?.strategy !== "local-fidelity-crop" || !validBox(item.box)) return true;
    const containsNativeNode = nodeBoxes.some((box) => intersectionCoverage(box, item.box) >= 0.72);
    const centerPoint = center(item.box);
    const centralDiagramCrop = centerPoint.x >= width / 3 && centerPoint.x <= width * 2 / 3 && centerPoint.y >= height * 0.18 && centerPoint.y <= height * 0.64;
    const bottomRouteCrop = item.box.y >= height * 0.84 && item.box.w >= width * 0.09 && item.box.h <= height * 0.15;
    if ((!containsNativeNode || centralDiagramCrop) && !bottomRouteCrop) return true;
    removed.push(item.id || null);
    return false;
  });
  return removed;
}

function applyKnowledgeGraphPanelNativeRebuild(page, slideSize, options = {}) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("knowledge graph page is invalid");
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("knowledge graph options are invalid");
  const semanticTextBoxes = Array.isArray(options.semanticTextBoxes) ? options.semanticTextBoxes : page.textBoxes;
  const model = findModel(semanticTextBoxes, slideSize);
  if (!model) return Object.freeze({ matched: false, addedShapes: 0, connectors: 0 });
  const retained = (Array.isArray(page.shapes) ? page.shapes : []).filter((item) => !/simple-status-icon|long-axis-line/iu.test(String(item?.source?.detector || "")));
  const relation = relationshipStyle(slideSize, options.sourceImageWidthPx);
  const built = buildShapes(model, relation.style); const added = built.shapes;
  const pictorialGlyphIds = new Set(model.middle.filter((item) => normalized(item.text) === "✓").map((item) => item.id));
  page.textBoxes = page.textBoxes.filter((item) => !pictorialGlyphIds.has(item.id));
  const nativeText = [model.translator, ...model.workItems];
  const existingLabels = new Set(page.textBoxes.map((item) => normalized(item.text)));
  page.textBoxes.push(...nativeText.filter((item) => !existingLabels.has(normalized(item.text))).map(nativeLabel));
  page.shapes = [...retained, ...added];
  const removedCrops = removeNativeOwnedCrops(page, built.nodeBoxes, slideSize);
  page.intent = { ...(page.intent || {}), rasterBackgroundAllowed: true, primarySemanticStructureNative: true, semanticStructureProfile: "knowledge-graph-three-panel-v1" };
  page.source = { ...(page.source || {}), semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1", confidence: 0.94, removedImpreciseCropIds: removedCrops, connectorCalibration: { ...relation.calibration, sourceImageWidthPx: Number.isFinite(Number(options.sourceImageWidthPx)) ? Number(options.sourceImageWidthPx) : null } } };
  return Object.freeze({ matched: true, addedShapes: added.length, connectors: added.filter((item) => item.type === "line" || item.type === "arc").length, restoredTextBoxes: nativeText.filter((item) => !existingLabels.has(normalized(item.text))).length, removedCrops: removedCrops.length });
}

module.exports = { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel: findModel };
