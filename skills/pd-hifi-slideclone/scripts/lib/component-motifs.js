"use strict";

const KNOWN_TARGET_MOTIFS = Object.freeze([
  "arc-arrow",
  "ring-node",
  "card-grid",
  "tree-link",
  "fishbone-cause",
  "radial-link",
  "linear-arrow-chain",
  "whole-process-template",
  "lens-funnel-flow",
  "branch-card-flow",
  "layered-stack",
  "funnel-stack",
  "pyramid-stack",
  "venn-overlap",
  "intersection-overlap",
  "milestone-roadmap",
  "quadrant-axis",
  "pie-share-chart",
  "donut-segment-chart",
  "treemap-chart",
  "bubble-scatter-chart",
  "concentric-circles",
  "sankey-flow-chart",
  "map-chart",
  "word-cloud-chart",
  "waterfall-chart",
  "gauge-chart",
  "radar-chart",
  "org-hierarchy",
  "swimlane-flow",
  "topology-network"
]);

const KNOWN_TARGET_MOTIF_SET = new Set(KNOWN_TARGET_MOTIFS);

const TARGET_MOTIF_ALIASES = Object.freeze({
  "cycle-arrow": "arc-arrow",
  "circular-arrow": "arc-arrow",
  "circulararrow": "arc-arrow",
  "loop-arrow": "arc-arrow",
  "doughnut-segment-chart": "donut-segment-chart",
  "donut-chart": "donut-segment-chart",
  "doughnut-chart": "donut-segment-chart",
  "scatter-chart": "bubble-scatter-chart",
  "bubble-chart": "bubble-scatter-chart",
  "geo-map-chart": "map-chart",
  "keyword-cloud-chart": "word-cloud-chart"
});

function normalizeTargetMotif(value) {
  const motif = safeString(value).toLowerCase();
  const normalized = TARGET_MOTIF_ALIASES[motif] || motif;
  return KNOWN_TARGET_MOTIF_SET.has(normalized) ? normalized : "";
}

function sanitizeMotifs(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizeTargetMotif)
    .filter(Boolean))];
}

function isKnownTargetMotif(value) {
  return Boolean(normalizeTargetMotif(value));
}

function motifTokens(motifs = []) {
  const tokens = [];
  for (const motif of sanitizeMotifs(motifs)) {
    if (motif === "radial-link") tokens.push("中心", "辐射", "径向", "关系", "hub", "spoke", "radial");
    if (motif === "arc-arrow") tokens.push("圆弧", "环形", "循环", "箭头", "arc", "cycle", "loop");
    if (motif === "ring-node") tokens.push("圆环", "环形", "节点", "ring", "loop");
    if (motif === "tree-link") tokens.push("树状", "层级", "组织", "tree", "hierarchy");
    if (motif === "org-hierarchy") tokens.push("组织架构", "层级", "组织", "org", "hierarchy");
    if (motif === "card-grid") tokens.push("矩阵", "卡片", "宫格", "matrix", "grid");
    if (motif === "linear-arrow-chain") tokens.push("流程", "步骤", "箭头", "时间轴", "process", "timeline");
    if (motif === "whole-process-template") tokens.push("整组", "流程组件", "步骤组件", "process", "step", "template");
    if (motif === "lens-funnel-flow") tokens.push("放大镜", "漏斗", "需求分析", "聚焦", "magnifier", "funnel", "analysis");
    if (motif === "branch-card-flow") tokens.push("分支", "卡片", "输出", "树状", "branch", "cards", "output");
    if (motif === "fishbone-cause") tokens.push("鱼骨", "因果", "根因", "fishbone", "ishikawa", "cause");
    if (motif === "layered-stack") tokens.push("分层", "层级", "阶梯", "layered", "stack");
    if (motif === "funnel-stack") tokens.push("漏斗", "分层漏斗", "funnel");
    if (motif === "pyramid-stack") tokens.push("金字塔", "pyramid");
    if (motif === "venn-overlap") tokens.push("Venn", "韦恩", "集合", "重叠", "venn", "overlap");
    if (motif === "intersection-overlap") tokens.push("交集", "重叠", "intersection", "overlap");
    if (motif === "milestone-roadmap") tokens.push("时间轴", "里程碑", "路线图", "timeline", "milestone", "roadmap");
    if (motif === "quadrant-axis") tokens.push("四象限", "象限", "优先级", "impact", "effort", "quadrant");
    if (motif === "pie-share-chart") tokens.push("饼图", "扇区", "占比", "份额", "pie", "share");
    if (motif === "donut-segment-chart") tokens.push("环形图", "圆环图", "占比", "donut", "doughnut", "segment");
    if (motif === "treemap-chart") tokens.push("矩形树图", "树图", "面积图", "treemap", "tile");
    if (motif === "bubble-scatter-chart") tokens.push("气泡图", "散点图", "bubble", "scatter", "plot");
    if (motif === "concentric-circles") tokens.push("同心圆", "圆环层级", "concentric", "circles");
    if (motif === "sankey-flow-chart") tokens.push("桑基图", "流向", "能流", "sankey", "flow");
    if (motif === "map-chart") tokens.push("地图", "区域地图", "地理", "map", "region", "geo");
    if (motif === "word-cloud-chart") tokens.push("词云", "关键词", "标签云", "word cloud", "keyword");
    if (motif === "waterfall-chart") tokens.push("瀑布图", "增减", "waterfall", "bridge");
    if (motif === "gauge-chart") tokens.push("仪表盘", "进度仪表", "gauge", "dial", "speedometer");
    if (motif === "radar-chart") tokens.push("雷达图", "蛛网图", "radar", "spider");
    if (motif === "swimlane-flow") tokens.push("泳道", "泳道图", "swimlane", "lane");
    if (motif === "topology-network") tokens.push("拓扑", "网络", "节点关系", "topology", "network");
  }
  return [...new Set(tokens)];
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

module.exports = {
  KNOWN_TARGET_MOTIFS,
  isKnownTargetMotif,
  motifTokens,
  normalizeTargetMotif,
  sanitizeMotifs
};
