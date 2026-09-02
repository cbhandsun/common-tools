"use strict";

const PREFIX = "team-knowledge-graph-";

function validBox(box) {
  return !!box && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}
function center(box) { return { x: box.x + box.w / 2, y: box.y + box.h / 2 }; }
function normalized(value) { return String(value || "").replace(/[\s:：,，。.;；·•—_-]/gu, "").toLowerCase(); }
function lineBox(from, to) { return { x: from.x, y: from.y, w: to.x - from.x, h: to.y - from.y }; }
function rounded(box) { return Object.fromEntries(Object.entries(box).map(([key, value]) => [key, Math.round(value * 100) / 100])); }
function source(detector, role, options = {}) {
  return { editable: true, nativeRebuild: true, detector: `${PREFIX}${detector}`, confidence: 0.94, semanticNativeStructure: true, componentOwnerKind: "knowledge-graph-panel", nativeComponentRole: role, ...options };
}
function shape(id, type, box, style, role) {
  const preserveResidualInterior = role === "panel" || role === "layer-band";
  return { id: `${PREFIX}${id}`, type, box: rounded(box), style, source: source(id, role, preserveResidualInterior ? { preserveResidualInterior: true } : {}) };
}
function connector(id, from, to, style = {}) {
  return shape(id, "line", lineBox(from, to), { stroke: "#79A6C8", strokeWidthPt: 1.35, connectorType: "straight", endArrow: "triangle", ...style }, "relationship");
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
  const lower = boxes.filter((item) => {
    const point = center(item.box); return point.y >= height * 0.72 && point.y <= height * 0.91 && item.box.w < width * 0.28;
  }).sort((left, right) => center(left.box).x - center(right.box).x);
  if (lower.length < 3 || center(lower.at(-1).box).x - center(lower[0].box).x < width * 0.45) return null;
  const middle = boxes.filter((item) => center(item.box).x >= width / 3 && center(item.box).x < width * 2 / 3 && center(item.box).y > height * 0.25 && center(item.box).y < height * 0.7);
  const hub = middle.find((item) => /人员|主体|实体|person|entity|subject/iu.test(normalized(item.text)));
  const translator = middle.find((item) => /翻译层|映射层|translation|mapping/iu.test(normalized(item.text)));
  const right = boxes.filter((item) => center(item.box).x >= width * 2 / 3 && center(item.box).y > height * 0.24 && center(item.box).y < height * 0.7);
  const left = boxes.filter((item) => center(item.box).x < width / 3 && center(item.box).y > height * 0.28 && center(item.box).y < height * 0.7);
  if (!hub || !translator || middle.length < 3 || right.length < 3 || left.length < 3) return null;
  return { width, height, title, headings, lower: [lower[0], lower[Math.floor(lower.length / 2)], lower.at(-1)], hub, translator, middle, right, left };
}

function buildShapes(model) {
  const { width: w, height: h } = model; const shapes = [];
  const gap = w * 0.018; const left = w * 0.047; const panelY = h * 0.13; const panelH = h * 0.59; const panelW = (w - left * 2 - gap * 2) / 3;
  for (let index = 0; index < 3; index += 1) {
    shapes.push(shape(`panel-${index + 1}`, "roundRect", { x: left + index * (panelW + gap), y: panelY, w: panelW, h: panelH }, { fill: "none", stroke: "#D5E2EA", strokeWidthPt: 1.1, radiusPt: 10 }, "panel"));
  }
  shapes.push(shape("layer-band", "roundRect", { x: left, y: h * 0.735, w: w - left * 2, h: h * 0.205 }, { fill: "none", stroke: "#D5E2EA", strokeWidthPt: 1.1, radiusPt: 10 }, "layer-band"));
  const nodeItems = [model.hub, model.translator, ...model.right.slice(0, 5)];
  nodeItems.forEach((item, index) => shapes.push(shape(`node-${index + 1}`, index < 2 ? "ellipse" : "roundRect", { x: item.box.x - 11, y: item.box.y - 7, w: item.box.w + 22, h: item.box.h + 14 }, { fill: index < 2 ? "#E5F3FB" : "#FFFFFF", stroke: "#62A7D2", strokeWidthPt: 1.25, radiusPt: 8 }, "node")));
  const hub = center(model.hub.box);
  for (const [index, item] of model.middle.filter((item) => item !== model.hub).slice(0, 6).entries()) shapes.push(connector(`hub-link-${index + 1}`, hub, center(item.box)));
  const rightCenter = center(model.right[Math.floor(model.right.length / 2)].box);
  for (const [index, item] of model.right.entries()) if (item !== model.right[Math.floor(model.right.length / 2)]) shapes.push(connector(`right-link-${index + 1}`, rightCenter, center(item.box), { stroke: "#6F97B5" }));
  const leftNodes = model.left.slice(0, 6).map((item) => center(item.box));
  for (let index = 1; index < leftNodes.length; index += 1) shapes.push(connector(`left-link-${index}`, leftNodes[index - 1], leftNodes[index], { dash: "dash", endArrow: "none", stroke: "#9AAEBB" }));
  if (leftNodes.length > 2) shapes.push(connector("left-loop", leftNodes.at(-1), leftNodes[0], { dash: "dash", endArrow: "none", stroke: "#9AAEBB" }));
  const layers = model.lower.map((item) => center(item.box));
  shapes.push(connector("layer-arrow-1", layers[0], layers[1], { stroke: "#4D91BF", strokeWidthPt: 1.8 }));
  shapes.push(connector("layer-arrow-2", layers[1], layers[2], { stroke: "#4D91BF", strokeWidthPt: 1.8 }));
  shapes.push(connector("layer-feedback", { x: layers[2].x, y: layers[2].y + h * 0.065 }, { x: layers[0].x, y: layers[0].y + h * 0.065 }, { stroke: "#79A6C8", dash: "dash", endArrow: "triangle" }));
  return shapes;
}

function applyKnowledgeGraphPanelNativeRebuild(page, slideSize) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("knowledge graph page is invalid");
  const model = findModel(page.textBoxes, slideSize);
  if (!model) return Object.freeze({ matched: false, addedShapes: 0, connectors: 0 });
  const retained = (Array.isArray(page.shapes) ? page.shapes : []).filter((item) => !/simple-status-icon/iu.test(String(item?.source?.detector || "")));
  const added = buildShapes(model);
  page.shapes = [...retained, ...added];
  page.intent = { ...(page.intent || {}), rasterBackgroundAllowed: true, primarySemanticStructureNative: true, semanticStructureProfile: "knowledge-graph-three-panel-v1" };
  page.source = { ...(page.source || {}), semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1", confidence: 0.94 } };
  return Object.freeze({ matched: true, addedShapes: added.length, connectors: added.filter((item) => item.type === "line").length });
}

module.exports = { applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel: findModel };
