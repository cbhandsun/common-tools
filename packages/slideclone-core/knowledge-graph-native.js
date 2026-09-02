"use strict";

const PREFIX = "team-knowledge-graph-";

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
  if (!hub || !translator || middle.length < 3 || !highEvent || !targetEvent || !workBox || left.length < 3) return null;
  const rightNodes = [highEvent, { text: workItems.map((item) => item.text).join("\n"), box: workBox }, targetEvent];
  return { width, height, title, headings, lower, hub, translator, middle, rightNodes, left };
}

function buildShapes(model) {
  const shapes = [];
  const nodeItems = [model.hub, model.translator, ...model.rightNodes];
  const nodeBoxes = nodeItems.map((item, index) => expandBox(item.box, index === 0
    ? { left: 21, top: 21, right: 22, bottom: 22 }
    : index === 1 ? { left: 14, top: 7, right: 16, bottom: 8 }
      : index === 2 ? { left: 11, top: 10, right: 11, bottom: 12 }
        : index === 3 ? { left: 11, top: 9, right: 11, bottom: 9 }
          : { left: 15, top: 21, right: 16, bottom: 22 }));
  nodeBoxes.forEach((box, index) => shapes.push(shape(`node-${index + 1}`, "roundRect", box, { fill: "#FFFFFF", stroke: [1, 2, 3].includes(index) ? "#A7A7A7" : "#1473E6", strokeWidthPt: 1.25, radiusPt: 8 }, "node")));
  const hubBox = nodeBoxes[0];
  for (const [index, item] of model.middle.filter((item) => item !== model.hub).slice(0, 6).entries()) {
    const target = center(item.box); shapes.push(connector(`hub-link-${index + 1}`, pointOnBoxToward(hubBox, target), target, { stroke: "#1473E6" }));
  }
  const [highBox, workBox, targetBox] = nodeBoxes.slice(2);
  shapes.push(connector("right-work-high", { x: center(workBox).x, y: workBox.y }, { x: center(highBox).x, y: highBox.y + highBox.h }, { stroke: "#1473E6" }));
  shapes.push(connector("right-work-target", { x: workBox.x + workBox.w, y: center(workBox).y }, { x: targetBox.x, y: center(targetBox).y }, { stroke: "#1473E6" }));
  return shapes;
}

function applyKnowledgeGraphPanelNativeRebuild(page, slideSize) {
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("knowledge graph page is invalid");
  const model = findModel(page.textBoxes, slideSize);
  if (!model) return Object.freeze({ matched: false, addedShapes: 0, connectors: 0 });
  const retained = (Array.isArray(page.shapes) ? page.shapes : []).filter((item) => !/simple-status-icon/iu.test(String(item?.source?.detector || "")));
  const added = buildShapes(model);
  const pictorialGlyphIds = new Set(model.middle.filter((item) => normalized(item.text) === "✓").map((item) => item.id));
  page.textBoxes = page.textBoxes.filter((item) => !pictorialGlyphIds.has(item.id));
  page.shapes = [...retained, ...added];
  page.intent = { ...(page.intent || {}), rasterBackgroundAllowed: true, primarySemanticStructureNative: true, semanticStructureProfile: "knowledge-graph-three-panel-v1" };
  page.source = { ...(page.source || {}), semanticNativeStructure: { profile: "knowledge-graph-three-panel-v1", confidence: 0.94 } };
  return Object.freeze({ matched: true, addedShapes: added.length, connectors: added.filter((item) => item.type === "line").length });
}

module.exports = { applyKnowledgeGraphPanelNativeRebuild, findKnowledgeGraphPanelModel: findModel };
