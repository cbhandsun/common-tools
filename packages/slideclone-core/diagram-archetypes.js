"use strict";

const { average, boxArea, centerOf, dispersion, distance, median, overlapRatio } = require("./diagram-geometry");
const { clusterNumbers, clusterVisualNodesByAxis } = require("./diagram-visual-topology");
const { connectorAtomCount, countBy, nativeNodeAtomCount } = require("./diagram-metrics");
const { spacingProfile, spread } = require("./diagram-structure-signature");

function inferArchetype({ item, nodes, textBoxes, visualAtoms, visualNodes = [], visualConnectors = [], visualGrid, box, slideSize }) {
  const detector = String(item.source?.detector || "").toLowerCase();
  const form = String(item.source?.expressionForm || "").toLowerCase();
  const subtype = String(item.source?.expressionSubtype || "").toLowerCase();
  const text = `${detector} ${form} ${subtype} ${textBoxes.map((entry) => entry.text).join(" ")}`.toLowerCase();
  const atomKinds = countBy(visualAtoms, "kind");
  if (visualAtoms.some((atom) => String(atom?.source?.detector || "") === "pixel-screenshot-texture-cluster")) return "screenshot-card-grid";
  if (/qr[-_\s]?code|quick[-_\s]?response|barcode|bar[-_\s]?code|data[-_\s]?matrix|machine[-_\s]?readable|二维码|条形码|条码|机器码|扫码/.test(text)) return "machine-readable-code";
  if (looksLikeScreenshotCardGrid(text, atomKinds, visualNodes, visualGrid, nodes, box)) return "screenshot-card-grid";
  if (looksLikeScreenshotZoomCallout(text, atomKinds)) return "screenshot-zoom-callout";
  if (looksLikeAnnotatedScreenshot(text, atomKinds)) return "screenshot-annotation";
  if (looksLikeVisualExampleCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "visual-example-card-grid";
  if (looksLikeFeatureIconCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "feature-icon-card-grid";
  if (looksLikeNumberedStepCardGrid(visualNodes, visualGrid, nodes, visualAtoms, box, text)) return "numbered-step-card-grid";
  if (looksLikeDashboardCardGrid(visualNodes, visualGrid, nodes, box, text)) return "dashboard-card-grid";
  if (looksLikeQuadrantMatrix(visualGrid, visualAtoms, visualNodes, box, text)) return "quadrant-matrix";
  if (looksLikeComparisonMatrix(visualGrid, visualNodes, nodes, box, text)) return "comparison-matrix";
  if (looksLikeHeatmapMatrix(visualGrid, visualNodes, nodes, box, text)) return "heatmap-matrix";
  // Segmented circular primitives are stronger evidence than generic words
  // such as "market share", which occur in both pie and treemap captions.
  if (looksLikeVisualPieChart(visualAtoms, box, text)) return "pie-chart";
  if (looksLikeVisualDonutChart(visualAtoms, box, text)) return "donut-chart";
  if (looksLikeTreemapDiagram(visualGrid, visualNodes, nodes, box, text)) return "treemap-chart";
  if (looksLikeSankeyFlowDiagram(visualNodes, nodes, box, text)) return "sankey-flow-chart";
  if (visualGrid && visualGrid.rows >= 2 && visualGrid.columns >= 2 && visualGrid.coverageRatio >= 0.45) return "matrix-or-grid";
  if (/quadrant|四象限|象限图|优先级矩阵|影响.?成本|价值.?难度|重要.?紧急/.test(text)) return "quadrant-matrix";
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点|前后对比/.test(text)) return "comparison-matrix";
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵/.test(text)) return "heatmap-matrix";
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成/.test(text)) return "treemap-chart";
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(text)) return "sankey-flow-chart";
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(text)) return "map-chart";
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(text)) return "word-cloud-chart";
  if (/matrix|table|grid/.test(text)) return "matrix-or-grid";
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(text) || looksLikeVisualGaugeChart(visualAtoms)) return "gauge-chart";
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(text)) return "radar-chart";
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text) || looksLikeVisualConcentricCircles(visualAtoms)) return "concentric-circles";
  if (/gantt|schedule|project[-_\s]?plan|项目排期|甘特|排期图|计划表/.test(text) || looksLikeVisualGanttRoadmap(visualNodes, visualAtoms, box, text)) return "gantt-roadmap";
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(text) || looksLikeVisualWaterfallChart(visualNodes, visualAtoms, box, text)) return "waterfall-chart";
  if (looksLikeVisualBarChart(visualNodes, visualAtoms, box) || /bar[-_\s]?chart|column[-_\s]?chart|柱状图|条形图/.test(text)) return "bar-chart";
  if (looksLikeVisualScatterChart(visualAtoms, box, text)) return "scatter-chart";
  if (looksLikeVisualLineChart(visualAtoms, box, text)) return "line-chart";
  // A magnifier can resemble an asymmetric ring. Resolve the stronger
  // handle-plus-convergence evidence before the generic cycle heuristic.
  if (/lens[-_\s]?funnel|funnel[-_\s]?flow|converge|convergence|magnifier[-_\s]?flow|放大镜流程|漏斗流程|收敛流程|聚焦分析|需求分析/.test(text) || looksLikeVisualFunnelLensFlow(visualAtoms, visualNodes, visualConnectors, box, text)) return "funnel-lens-flow";
  if (looksLikeVisualCycleLoop(visualAtoms, visualNodes, box, text)) return "cycle-loop";
  if (/timeline|roadmap|milestone|时间轴|里程碑|路线图/.test(text) || looksLikeVisualTimelineRoadmap(visualAtoms, visualNodes, box, text)) return "timeline-roadmap";
  if (/venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠关系|重叠图/.test(text) || looksLikeVisualVennDiagram(visualNodes, box, text)) return "venn-overlap";
  if (/fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|branch[-_\s]?analysis|causal[-_\s]?branch|鱼骨图|因果分析|根因分析|分支分析/.test(text) || looksLikeVisualFishboneDiagram(visualAtoms, visualNodes, box, text)) return "fishbone-cause-effect";
  if (/pyramid|layered[-_\s]?stack|funnel[-_\s]?diagram|金字塔|分层|层级漏斗|阶梯图|漏斗图/.test(text) || looksLikeVisualLayeredStack(visualNodes, box, text)) return "layered-stack";
  if (/triangle|topology|铁三角|闭环/.test(text)) return "topology-diagram";
  if (looksLikeDenseRadialLineArt(visualAtoms, visualNodes, box, text)) return "dense-radial-line-art";
  if (/screenshot|ui|screen|截图|界面|文档/.test(text) && /flow|流程|->|→|输入|输出|生成/.test(text)) return "process-with-screenshots";
  if (/flow|chain|stage|linear|流程|步骤|阶段|->|→/.test(text) || looksLikeLinearFlow(nodes)) return "flow-card-chain";
  if (looksLikeVisualLinearFlow(visualNodes, box)) return "flow-card-chain";
  if (looksLikeVisualHubSpoke(visualNodes, visualConnectors, box)) return "hub-spoke";
  if (looksLikeVisualTreeStructure(visualNodes, visualAtoms, box)) return "tree-structure";
  if (looksLikeVisualSwimlaneFlow(visualNodes, visualAtoms, box)) return "swimlane-flow";
  if (nativeNodeAtomCount(atomKinds) >= 3 && connectorAtomCount(atomKinds) >= 2) return "generic-node-diagram";
  if ((atomKinds["screenshot-crop-candidate"] || 0) >= 1 && nodes.length >= 2) return "process-with-screenshots";
  if (/hub|spoke|network|radial|中心|核心|引擎/.test(text) || looksLikeHubSpoke(nodes, box)) return "hub-spoke";
  if (nodes.length >= 6 && dispersion(nodes, slideSize) > 0.35) return "multi-cluster-diagram";
  if (nativeNodeAtomCount(atomKinds) >= 2) return "generic-node-diagram";
  return nodes.length >= 3 ? "generic-node-diagram" : "unclassified-diagram";
}

function looksLikeDenseRadialLineArt(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const semantic = /dense[-_\s]?complex[-_\s]?diagram|foreground[-_\s]?aggregate|dispersed[-_\s]?thin[-_\s]?graphics|radial[-_\s]?(?:network|line[-_\s]?art)|放射线网|密集放射|同心多边形/.test(String(text || ""));
  const tinyNodes = (visualNodes || []).filter((node) => {
    const nodeBox = node?.box || {};
    const areaRatio = boxArea(nodeBox) / regionArea;
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return areaRatio >= 0.00008 && areaRatio <= 0.0035 && aspect >= 0.55 && aspect <= 1.8;
  });
  const cardNodes = (visualNodes || []).filter((node) => boxArea(node?.box || {}) / regionArea >= 0.008);
  const longLineAtoms = (visualAtoms || []).filter((atom) => {
    if (!["grid-line-candidate", "connector-line-candidate"].includes(String(atom?.kind || ""))) return false;
    const atomBox = atom?.box || {};
    return Number(atomBox.w || 0) >= Number(box.w || 0) * 0.5
      || Number(atomBox.h || 0) >= Number(box.h || 0) * 0.62;
  });
  const explicitConnectors = (visualAtoms || []).filter((atom) => atom?.kind === "connector-arrow-candidate" || atom?.lineEndpoints?.from && atom?.lineEndpoints?.to);
  if (cardNodes.length > 0 || explicitConnectors.length > 2) return false;
  return tinyNodes.length >= 16
    && longLineAtoms.length >= 6
    && (semantic || tinyNodes.length >= 24 && longLineAtoms.length >= 8);
}

function looksLikeLinearFlow(nodes) {
  if (nodes.length < 3) return false;
  const sorted = [...nodes].sort((a, b) => a.center.x - b.center.x);
  const width = Math.max(1, sorted[sorted.length - 1].center.x - sorted[0].center.x);
  const yValues = sorted.map((node) => node.center.y);
  const ySpread = Math.max(...yValues) - Math.min(...yValues);
  const xMonotonic = sorted.every((node, index) => index === 0 || node.center.x >= sorted[index - 1].center.x);
  return xMonotonic && width > 160 && ySpread < 120;
}

function looksLikeAnnotatedScreenshot(text = "", atomKinds = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|截图|界面|页面截图|产品截图|系统截图|网页截图/.test(value);
  if (!screenshotEvidence) return false;
  const annotationEvidence = /annotation|annotated|callout|highlight|markup|redline|spotlight|magnifier|zoom[-_\s]?in|numbered|labelled|labeled|arrow[-_\s]?callout|截图标注|界面标注|页面标注|标注|批注|注释|说明气泡|气泡说明|框选|圈选|高亮|箭头说明|编号|放大镜|局部放大|重点标记/.test(value);
  const overlayAtomEvidence = (atomKinds["connector-arrow-candidate"] || 0) >= 1
    || (atomKinds["connector-line-candidate"] || 0) >= 1
    || (atomKinds["native-rect-candidate"] || 0) >= 1
    || (atomKinds["native-ellipse-candidate"] || 0) >= 1
    || (atomKinds["native-search-candidate"] || 0) >= 1;
  const screenshotAtomEvidence = (atomKinds["screenshot-crop-candidate"] || 0) >= 1
    || (atomKinds["document-crop-candidate"] || 0) >= 1;
  // A screenshot mentioned as an input to a process must not turn the entire
  // process into an annotated screenshot. Without explicit annotation wording,
  // require an actual screenshot/document visual atom as the annotation base.
  return annotationEvidence || (screenshotAtomEvidence && overlayAtomEvidence);
}

function looksLikeScreenshotZoomCallout(text = "", atomKinds = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|截图|界面|页面截图|产品截图|系统截图|网页截图/.test(value);
  if (!screenshotEvidence) return false;
  const zoomEvidence = /zoom[-_\s]?(?:in|callout|lens|detail|window)|magnifier|magnifying[-_\s]?glass|loupe|detail[-_\s]?view|enlarged[-_\s]?view|局部放大|放大镜|放大框|放大区域|细节放大|重点放大|局部细节|局部展示/.test(value);
  const zoomAtomEvidence = (atomKinds["native-search-candidate"] || 0) >= 1
    || ((atomKinds["native-ellipse-candidate"] || 0) >= 1 && (atomKinds["connector-line-candidate"] || 0) >= 1)
    || ((atomKinds["native-rect-candidate"] || 0) >= 2 && (atomKinds["connector-line-candidate"] || 0) >= 1);
  return zoomEvidence || zoomAtomEvidence;
}

function looksLikeScreenshotCardGrid(text = "", atomKinds = {}, visualNodes = [], visualGrid = null, nodes = [], box = {}) {
  const value = String(text || "").toLowerCase();
  const screenshotEvidence = /screenshot|screen[-_\s]?capture|ui[-_\s]?capture|mockup|interface|web[-_\s]?page|app[-_\s]?screen|product[-_\s]?shot|产品截图|页面截图|系统截图|界面截图|网页截图|截图展示|界面展示|产品展示/.test(value);
  if (!screenshotEvidence) return false;
  if (/annotation|annotated|callout|highlight|markup|redline|spotlight|zoom[-_\s]?(?:in|callout|lens|detail)|magnifier|loupe|标注|批注|注释|说明气泡|高亮|框选|圈选|局部放大|放大镜|放大框/.test(value)) return false;
  const galleryEvidence = /card|grid|gallery|showcase|portfolio|case[-_\s]?study|screens?|mockups?|卡片|宫格|矩阵|展示|合集|案例|样例|示例|多屏|多页面/.test(value);
  if (!galleryEvidence) return false;
  const screenshotAtomCount = (atomKinds["screenshot-crop-candidate"] || 0)
    + (atomKinds["native-screen-candidate"] || 0)
    + (atomKinds["native-phone-candidate"] || 0);
  const structuralCount = Math.max(nodes.length, visualNodes.length);
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2);
  return screenshotAtomCount >= 2 || structuralCount >= 2 || gridLike || Number(box.w || 0) > 0;
}

function looksLikeFeatureIconCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const semantic = /feature|capability|benefit|service|solution|module|function|功能|特性|能力|亮点|优势|服务|模块|方案|卖点|应用场景|场景/.test(value)
    && /icon|illustration|pictogram|card|grid|图标|插图|图示|卡片|宫格|矩阵|清单/.test(value);
  const candidates = visualNodes.length >= 3 ? visualNodes : nodes;
  if (!semantic || candidates.length < 3) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.01 && areaRatio <= 0.28 && aspect >= 0.55 && aspect <= 4.5;
  });
  const iconLikeAtoms = (visualAtoms || []).filter((atom) => {
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "");
    const atomBox = atom?.box || {};
    const areaRatio = boxArea(atomBox) / regionArea;
    return /icon|illustration|complex-shape-crop|native-(?:gear|search|shield|person|team)/.test(`${kind} ${hint}`)
      && areaRatio > 0.0008
      && areaRatio <= 0.08;
  });
  if (semantic && iconLikeAtoms.length >= 3 && candidates.length >= 3) return true;
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(cardLike, "y", Math.max(28, Number(box.h || 0) * 0.11)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(cardLike, "x", Math.max(38, Number(box.w || 0) * 0.09)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.rows || 0) >= 1 && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  return (cardLike.length >= 3 || gridLike) && rows >= 1 && columns >= 2 && (iconLikeAtoms.length >= 2 || /图标|icon|插图|图示/.test(value));
}

function looksLikeVisualExampleCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const visualExampleEvidence = /visual[-_\s]?example|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(value);
  const cardEvidence = /card|grid|gallery|showcase|list|panel|tile|卡片|宫格|矩阵|展示|合集|清单|面板/.test(value);
  if (!visualExampleEvidence || !cardEvidence) return false;
  const candidates = visualNodes.length >= 2 ? visualNodes : nodes;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.012 && areaRatio <= 0.36 && aspect >= 0.45 && aspect <= 5.4;
  });
  const pictorialAtoms = (visualAtoms || []).filter((atom) => {
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "");
    const atomBox = atom?.box || {};
    const areaRatio = boxArea(atomBox) / regionArea;
    return /complex-shape-crop|icon-crop|screenshot-crop|native-(?:cycle|donut|gear|search|shield|screen|phone|person|team)/.test(`${kind} ${hint}`)
      && areaRatio >= 0.001
      && areaRatio <= 0.18;
  });
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(cardLike, "y", Math.max(30, Number(box.h || 0) * 0.12)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(cardLike, "x", Math.max(42, Number(box.w || 0) * 0.1)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  return (cardLike.length >= 2 || gridLike) && columns >= 1 && rows >= 1 && (pictorialAtoms.length >= 1 || /图示|示意图|preview|sample|example/.test(value));
}

function looksLikeNumberedStepCardGrid(visualNodes = [], visualGrid = null, nodes = [], visualAtoms = [], box = {}, text = "") {
  const value = String(text || "").toLowerCase();
  const stepEvidence = /numbered[-_\s]*(?:step|card)|step[-_\s]*cards?|process[-_\s]*cards?|sequence[-_\s]*cards?|phase[-_\s]*cards?|milestone[-_\s]*cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(value);
  const cardEvidence = /card|grid|tile|panel|sequence|cards?|卡片|宫格|矩阵|序列|面板/.test(value);
  const numberedTextCount = (nodes || []).filter((node) => /^(?:0?[1-9]|1[0-9]|[一二三四五六七八九十]+)[.、:]?$/.test(String(node?.text || "").trim())).length;
  const badgeAtoms = (visualAtoms || []).filter((atom) => /native-(?:ellipse|rect)-candidate/.test(String(atom?.kind || "")) && isSmallBadgeAtom(atom, box));
  const candidates = visualNodes.length >= 3 ? visualNodes : nodes;
  if (!(stepEvidence && cardEvidence) && !(numberedTextCount >= 3 && cardEvidence)) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.01 && areaRatio <= 0.32 && aspect >= 0.5 && aspect <= 5.2;
  });
  const layoutEvidence = cardLike.length >= 3 ? cardLike : candidates;
  const rows = visualGrid?.rows || clusterVisualNodesByAxis(layoutEvidence, "y", Math.max(30, Number(box.h || 0) * 0.11)).length;
  const columns = visualGrid?.columns || clusterVisualNodesByAxis(layoutEvidence, "x", Math.max(42, Number(box.w || 0) * 0.09)).length;
  const gridLike = Boolean(visualGrid && Number(visualGrid.columns || 0) >= 2 && Number(visualGrid.coverageRatio || 0) >= 0.08);
  const semanticStepCards = stepEvidence && cardEvidence && candidates.length >= 3 && columns >= 2;
  return (semanticStepCards || cardLike.length >= 3 || gridLike || numberedTextCount >= 3 || badgeAtoms.length >= 3) && rows >= 1 && columns >= 2;
}

function isSmallBadgeAtom(atom = {}, box = {}) {
  const atomBox = atom.box || {};
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const width = Number(atomBox.w || 0);
  const height = Number(atomBox.h || 0);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  return areaRatio >= 0.0008 && areaRatio <= 0.035 && aspect >= 0.55 && aspect <= 1.85;
}

function looksLikeVisualLinearFlow(visualNodes = [], box = {}) {
  if (visualNodes.length < 3) return false;
  const sorted = [...visualNodes].sort((a, b) => a.center.x - b.center.x);
  const xs = sorted.map((node) => node.center.x);
  const ys = sorted.map((node) => node.center.y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  if (xSpread < regionWidth * 0.36 || ySpread > Math.max(52, regionHeight * 0.24)) return false;
  const spacing = spacingProfile(xs);
  return spacing.regular || sorted.length >= 4;
}

function looksLikeDashboardCardGrid(visualNodes = [], visualGrid = null, nodes = [], box = {}, text = "") {
  const semantic = /dashboard|kpi|metric|scorecard|indicator|数据看板|业务看板|指标看板|仪表盘|指标卡|数据卡片|经营分析|运营看板/.test(String(text || ""));
  const candidates = visualNodes.length >= 4 ? visualNodes : nodes;
  if (!semantic || candidates.length < 4) return false;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const cardLike = candidates.filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return areaRatio >= 0.008 && areaRatio <= 0.22 && aspect >= 0.75 && aspect <= 5.5;
  });
  if (cardLike.length < 4) return false;
  const rows = clusterVisualNodesByAxis(cardLike, "y", Math.max(30, Number(box.h || 0) * 0.11)).length;
  const columns = clusterVisualNodesByAxis(cardLike, "x", Math.max(42, Number(box.w || 0) * 0.09)).length;
  const visualGridLike = visualGrid && Number(visualGrid.rows || 0) >= 2 && Number(visualGrid.columns || 0) >= 2;
  return (rows >= 2 && columns >= 2) || visualGridLike;
}

function looksLikeComparisonMatrix(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /comparison|compare|versus|\bvs\b|before.?after|pros.?cons|competitor|竞品|对比|比较|方案对照|方案比较|优劣|优缺点|前后对比|差异分析/.test(String(text || ""));
  if (!semantic) return false;
  const rows = Number(visualGrid?.rows || 0);
  const columns = Number(visualGrid?.columns || 0);
  if (rows >= 2 && columns >= 2) return true;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 4) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const rowClusters = clusterVisualNodesByAxis(candidates, "y", Math.max(26, regionHeight * 0.09));
  const columnClusters = clusterVisualNodesByAxis(candidates, "x", Math.max(36, regionWidth * 0.08));
  return rowClusters.length >= 2 && columnClusters.length >= 2;
}

function looksLikeHeatmapMatrix(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|intensity|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵|强弱分布|浓度分布/.test(String(text || ""));
  if (!semantic) return false;
  const rows = Number(visualGrid?.rows || 0);
  const columns = Number(visualGrid?.columns || 0);
  if (rows >= 2 && columns >= 2) return true;
  const candidates = (visualNodes.length >= 4 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 6) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const rowClusters = clusterVisualNodesByAxis(candidates, "y", Math.max(24, regionHeight * 0.08));
  const columnClusters = clusterVisualNodesByAxis(candidates, "x", Math.max(30, regionWidth * 0.07));
  return rowClusters.length >= 2 && columnClusters.length >= 3;
}

function looksLikeTreemapDiagram(visualGrid = null, visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成|规模构成/.test(String(text || ""));
  if (!semantic) return false;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 3) return Boolean(visualGrid && Number(visualGrid.rows || 0) >= 2 && Number(visualGrid.columns || 0) >= 2);
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const areas = candidates.map((node) => boxArea(node.box || {})).filter((value) => value > 0);
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);
  const areaSpread = maxArea / Math.max(1, minArea);
  const coverage = areas.reduce((sum, value) => sum + value, 0) / regionArea;
  return coverage >= 0.22 && areaSpread >= 1.6;
}

function looksLikeSankeyFlowDiagram(visualNodes = [], nodes = [], box = {}, text = "") {
  const semantic = /sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(String(text || ""));
  if (!semantic) return false;
  const candidates = (visualNodes.length >= 3 ? visualNodes : nodes).filter((node) => node?.box && node?.center);
  if (candidates.length < 3) return true;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const columns = clusterVisualNodesByAxis(candidates, "x", Math.max(42, regionWidth * 0.11)).length;
  const rows = clusterVisualNodesByAxis(candidates, "y", Math.max(28, regionHeight * 0.09)).length;
  return columns >= 2 && rows >= 2;
}

function looksLikeVisualTimelineRoadmap(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const measuredTimeline = (visualAtoms || []).find((atom) => {
    if (atom?.kind !== "native-timeline-candidate" || !atom?.box) return false;
    const milestones = Array.isArray(atom.timelineMilestones) ? atom.timelineMilestones : [];
    if (milestones.length < 3 || milestones.length > 16) return false;
    const xs = milestones.map((milestone) => Number(milestone.x)).filter(Number.isFinite).sort((a, b) => a - b);
    if (xs.length !== milestones.length || spread(xs) < regionWidth * 0.38) return false;
    const spacing = spacingProfile(xs);
    const width = Number(atom.box.w || 0);
    const height = Number(atom.box.h || 0);
    return width >= regionWidth * 0.42
      && height <= regionHeight * 0.16
      && width > height * 7
      && (spacing.regular || milestones.length >= 4);
  });
  if (measuredTimeline) return true;
  const nodes = (visualNodes || [])
    .filter((node) => node?.box && node?.center)
    .filter((node) => {
      const kind = String(node.kind || "");
      const hint = String(node.shapeHint || "").toLowerCase();
      const areaRatio = boxArea(node.box) / Math.max(1, regionWidth * regionHeight);
      if (/line|connector|axis/.test(kind) || /line|axis/.test(hint)) return false;
      return areaRatio >= 0.0015 && areaRatio <= 0.12;
    })
    .sort((a, b) => a.center.x - b.center.x);
  if (nodes.length < 3) return false;

  const xs = nodes.map((node) => node.center.x);
  const ys = nodes.map((node) => node.center.y);
  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  if (xSpread < regionWidth * 0.42 || ySpread > Math.max(96, regionHeight * 0.42)) return false;

  const spacing = spacingProfile(xs);
  const horizontalAxis = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    const kind = String(atom?.kind || "");
    const hint = String(atom?.shapeHint || "").toLowerCase();
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return /connector|grid-line|timeline|axis/.test(kind)
      && (w >= regionWidth * 0.34 || /horizontal|axis|timeline/.test(hint))
      && w > h * 5;
  });
  const hasTemporalText = /(?:20\d{2}|19\d{2}|q[1-4]|h[12]|阶段|里程碑|时间|路线|版本|规划|上线|发布|roadmap|milestone|timeline)/i.test(text);
  return (spacing.regular || nodes.length >= 4) && (horizontalAxis || hasTemporalText);
}

function looksLikeVisualGanttRoadmap(visualNodes = [], visualAtoms = [], box = {}, text = "") {
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const bars = (visualNodes || []).filter((node) => {
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = boxArea(nodeBox) / Math.max(1, regionWidth * regionHeight);
    const hint = String(node?.shapeHint || "").toLowerCase();
    return node?.box
      && (/rect|bar|pill/.test(hint) || node.kind === "native-rect-candidate")
      && aspect >= 2.2
      && width >= regionWidth * 0.12
      && height <= regionHeight * 0.18
      && areaRatio >= 0.002
      && areaRatio <= 0.12;
  }).sort((a, b) => a.center.y - b.center.y);
  if (bars.length < 3) return false;
  const rowClusters = clusterVisualNodesByAxis(bars, "y", Math.max(20, regionHeight * 0.07));
  if (rowClusters.length < 3) return false;
  const starts = bars.map((node) => Number(node.box.x || 0));
  const widths = bars.map((node) => Number(node.box.w || 0));
  const startSpread = spread(starts);
  const widthSpread = spread(widths);
  const axisEvidence = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    const width = Number(atomBox.w || 0);
    const height = Number(atomBox.h || 0);
    const hint = String(atom?.shapeHint || "").toLowerCase();
    return /connector|grid-line|axis|timeline/.test(String(atom?.kind || ""))
      && width >= regionWidth * 0.42
      && width > height * 5
      && /horizontal|axis|timeline|grid-line/.test(hint);
  });
  const semantic = /gantt|schedule|project[-_\s]?plan|roadmap|timeline|milestone|甘特|排期|计划|路线图|时间轴/.test(String(text || ""));
  return (semantic || axisEvidence) && (startSpread >= regionWidth * 0.16 || widthSpread >= regionWidth * 0.12);
}

function looksLikeQuadrantMatrix(visualGrid = null, visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const semantic = /quadrant|四象限|象限图|优先级矩阵|影响.?成本|价值.?难度|重要.?紧急|impact.?effort|value.?complexity|urgent.?important/i.test(text);
  const hasTwoByTwoGrid = visualGrid && Number(visualGrid.rows) === 2 && Number(visualGrid.columns) === 2 && Number(visualGrid.coverageRatio || 0) >= 0.38;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const longHorizontal = (visualAtoms || []).filter((atom) => {
    const atomBox = atom?.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return atom?.kind === "grid-line-candidate" && w >= regionWidth * 0.55 && w > h * 6;
  }).length;
  const longVertical = (visualAtoms || []).filter((atom) => {
    const atomBox = atom?.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return atom?.kind === "grid-line-candidate" && h >= regionHeight * 0.55 && h > w * 6;
  }).length;
  const quadrantNodes = (visualNodes || []).filter((node) => node?.box && node?.center).length;
  return (semantic && (hasTwoByTwoGrid || (longHorizontal >= 1 && longVertical >= 1)))
    || (hasTwoByTwoGrid && quadrantNodes >= 3 && /高|低|强|弱|成本|价值|难度|紧急|重要|impact|effort|value|complexity/i.test(text));
}

function looksLikeVisualFunnelLensFlow(visualAtoms = [], visualNodes = [], visualConnectors = [], box = {}, text = "") {
  const atomKinds = countBy(visualAtoms, "kind");
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const explicit = /lens|funnel|converge|focus|analysis|需求|结构化|收敛|漏斗|放大镜|聚焦|分析/.test(text);
  const lensAtomNodes = (visualAtoms || [])
    .filter((atom) => {
      if (!atom?.box) return false;
      if (/native-(ellipse|donut|funnel|search)-candidate/.test(String(atom.kind || ""))) return true;
      if (atom.kind !== "screenshot-crop-candidate") return false;
      const atomBox = atom.box || {};
      const aspect = Number(atomBox.w || 0) / Math.max(1, Number(atomBox.h || 0));
      const areaRatio = boxArea(atomBox) / Math.max(1, regionWidth * regionHeight);
      return aspect >= 0.62 && aspect <= 1.62 && areaRatio >= 0.025 && areaRatio <= 0.18;
    })
    .map((atom) => ({
      ...atom,
      center: atom.center || {
        x: Number(atom.box.x || 0) + Number(atom.box.w || 0) / 2,
        y: Number(atom.box.y || 0) + Number(atom.box.h || 0) / 2
      }
    }));
  const lensNodes = [...(visualNodes || []), ...lensAtomNodes].filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    const areaRatio = boxArea(nodeBox) / Math.max(1, regionWidth * regionHeight);
    return node?.box
      && (
        node.kind === "native-ellipse-candidate"
        || node.kind === "native-donut-candidate"
        || node.kind === "native-funnel-candidate"
        || node.kind === "screenshot-crop-candidate"
        || /ellipse|circle|donut|funnel|lens|loupe|magnifier|search/.test(hint)
      )
      && aspect >= 0.45 && aspect <= 1.9
      && areaRatio >= 0.025;
  });
  const sideNodes = (visualNodes || []).filter((node) => {
    if (!node?.box || !node?.center) return false;
    if (lensNodes.includes(node)) return false;
    const areaRatio = boxArea(node.box) / Math.max(1, regionWidth * regionHeight);
    return areaRatio >= 0.004;
  });
  const connectorCount = Math.max(visualConnectors.length, connectorAtomCount(atomKinds));
  const hasDistinctFocusAtom = (atomKinds["native-search-candidate"] || 0) >= 1
    || (atomKinds["native-funnel-candidate"] || 0) >= 1
    || (atomKinds["native-donut-candidate"] || 0) >= 1
    || lensNodes.some((node) => /funnel|lens|loupe|magnifier|search/.test(String(node?.shapeHint || "").toLowerCase()));
  const hasLensAtom = (atomKinds["native-ellipse-candidate"] || 0) >= 1
    || (atomKinds["native-donut-candidate"] || 0) >= 1
    || (atomKinds["native-funnel-candidate"] || 0) >= 1
    || (atomKinds["native-search-candidate"] || 0) >= 1
    || lensNodes.length >= 1;
  const sideCenters = sideNodes.map((node) => node.center).filter(Boolean);
  const sideSpreadX = spread(sideCenters.map((center) => center.x));
  const sideSpreadY = spread(sideCenters.map((center) => center.y));
  const directionalConvergence = lensNodes.some((lens) => {
    if (!lens?.center) return false;
    const leftInputs = sideNodes.filter((node) => node?.center && node.center.x < lens.center.x - regionWidth * 0.08).length;
    const rightInputs = sideNodes.filter((node) => node?.center && node.center.x > lens.center.x + regionWidth * 0.08).length;
    const aboveInputs = sideNodes.filter((node) => node?.center && node.center.y < lens.center.y - regionHeight * 0.08).length;
    return leftInputs >= 2 || rightInputs >= 2 || aboveInputs >= 2;
  });
  // Plain circle nodes are common in relationship graphs. Require a distinct
  // focus primitive before inferring an unlabeled funnel or magnifier flow.
  const visualConvergence = hasDistinctFocusAtom
    && lensNodes.length >= 1
    && sideNodes.length >= 3
    && directionalConvergence
    && (sideSpreadX >= regionWidth * 0.12 || sideSpreadY >= regionHeight * 0.16);
  return hasLensAtom
    && lensNodes.length >= 1
    && sideNodes.length >= 2
    && (explicit || visualConvergence)
    && (connectorCount >= 1 || visualConvergence);
}

function looksLikeVisualFishboneDiagram(visualAtoms = [], visualNodes = [], box = {}, text = "") {
  const explicit = /fishbone|cause[-_\s]?effect|root[-_\s]?cause|ishikawa|branch[-_\s]?analysis|causal[-_\s]?branch|鱼骨图|因果分析|根因分析|分支分析/.test(text);
  const regionWidth = Math.max(1, Number(box.w || 0));
  const regionHeight = Math.max(1, Number(box.h || 0));
  const lineAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box || !/connector-line-candidate|connector-arrow-candidate/.test(String(atom.kind || ""))) return false;
    const atomBox = atom.box || {};
    return Number(atomBox.w || 0) >= 8 || Number(atomBox.h || 0) >= 8;
  });
  const horizontalSpines = lineAtoms.filter((atom) => {
    const atomBox = atom.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return w >= regionWidth * 0.45 && w > h * 5;
  });
  const diagonalBranches = lineAtoms.filter((atom) => {
    const hint = String(atom.shapeHint || "").toLowerCase();
    const atomBox = atom.box || {};
    const w = Number(atomBox.w || 0);
    const h = Number(atomBox.h || 0);
    return /diagonal|branch/.test(hint) || (w >= regionWidth * 0.06 && h >= regionHeight * 0.06 && w / Math.max(1, h) >= 0.35 && w / Math.max(1, h) <= 3.2);
  });
  const nodeCount = (visualNodes || []).filter((node) => node?.box && node?.center).length;
  const strongVisualFishbone = horizontalSpines.length >= 1 && diagonalBranches.length >= 4 && nodeCount >= 3;
  return (explicit && horizontalSpines.length >= 1 && diagonalBranches.length >= 3)
    || (explicit && diagonalBranches.length >= 4 && nodeCount >= 3)
    || strongVisualFishbone;
}

function looksLikeHubSpoke(nodes, box = {}) {
  if (nodes.length < 4) return false;
  const center = centerOf(box);
  const distances = nodes.map((node) => distance(node.center, center)).sort((a, b) => a - b);
  return distances[0] < Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.18
    && distances[distances.length - 1] > Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.28;
}

function looksLikeVisualHubSpoke(visualNodes = [], visualConnectors = [], box = {}) {
  if (visualNodes.length < 4 || visualConnectors.length < 3) return false;
  const byId = new Map(visualNodes.map((node) => [node.id, node]));
  const degree = new Map();
  for (const connector of visualConnectors) {
    if (!byId.has(connector.from) || !byId.has(connector.to)) continue;
    degree.set(connector.from, (degree.get(connector.from) || 0) + 1);
    degree.set(connector.to, (degree.get(connector.to) || 0) + 1);
  }
  const hubEntry = [...degree.entries()]
    .filter(([, count]) => count >= 3)
    .map(([id, count]) => ({ node: byId.get(id), count }))
    .filter((entry) => entry.node)
    .sort((a, b) => b.count - a.count || distance(a.node.center, centerOf(box)) - distance(b.node.center, centerOf(box)))[0];
  if (!hubEntry) return false;
  const hub = hubEntry.node;
  const connected = visualConnectors
    .flatMap((connector) => connector.from === hub.id ? [connector.to] : connector.to === hub.id ? [connector.from] : [])
    .map((id) => byId.get(id))
    .filter(Boolean);
  if (connected.length < 3) return false;
  const maxExtent = Math.max(Number(box.w || 0), Number(box.h || 0), 1);
  const centerDistance = distance(hub.center, centerOf(box));
  const outerDistances = connected.map((node) => distance(node.center, hub.center));
  const directions = new Set(connected.map((node) => {
    const dx = node.center.x - hub.center.x;
    const dy = node.center.y - hub.center.y;
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "right" : "left") : (dy >= 0 ? "down" : "up");
  }));
  return centerDistance <= maxExtent * 0.26
    && Math.max(...outerDistances) >= maxExtent * 0.22
    && directions.size >= 3;
}

function looksLikeVisualTreeStructure(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 4 || connectorAtomCount(countBy(visualAtoms, "kind")) < 1) return false;
  const sorted = [...visualNodes].sort((a, b) => a.center.y - b.center.y);
  const root = sorted[0];
  const lowerNodes = sorted.filter((node) => node.id !== root.id && node.center.y > root.center.y + Math.max(48, Number(root.box?.h || 0) * 1.4));
  if (lowerNodes.length < 3) return false;
  const lowerXs = lowerNodes.map((node) => node.center.x).sort((a, b) => a - b);
  const lowerSpread = lowerXs[lowerXs.length - 1] - lowerXs[0];
  const regionWidth = Math.max(1, Number(box.w || 0));
  const rootCenterOffset = Math.abs(root.center.x - average(lowerXs));
  const rootIsAbove = root.center.y <= Number(box.y || 0) + Number(box.h || 0) * 0.42;
  const childrenAligned = (Math.max(...lowerNodes.map((node) => node.center.y)) - Math.min(...lowerNodes.map((node) => node.center.y))) <= Math.max(72, Number(box.h || 0) * 0.22);
  return rootIsAbove
    && lowerSpread >= regionWidth * 0.35
    && rootCenterOffset <= regionWidth * 0.18
    && childrenAligned;
}

function looksLikeVisualSwimlaneFlow(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 4 || connectorAtomCount(countBy(visualAtoms, "kind")) < 2) return false;
  const laneNodes = visualNodes.filter((node) => /rect|card|document|screen|process/.test(String(node?.shapeHint || "").toLowerCase()));
  if (laneNodes.length < Math.max(4, Math.ceil(visualNodes.length * 0.75))) return false;
  const rowClusters = clusterVisualNodesByAxis(laneNodes, "y", Math.max(34, Number(box.h || 0) * 0.11));
  const lanes = rowClusters.filter((cluster) => cluster.nodes.length >= 2);
  if (lanes.length < 2 || lanes.length > 5) return false;
  const regionWidth = Math.max(1, Number(box.w || 0));
  const laneSpreads = lanes.map((lane) => {
    const xs = lane.nodes.map((node) => node.center.x).sort((a, b) => a - b);
    return xs[xs.length - 1] - xs[0];
  });
  const wideLanes = laneSpreads.filter((spread) => spread >= regionWidth * 0.28).length;
  if (wideLanes < 2) return false;
  const centers = lanes.map((lane) => lane.center).sort((a, b) => a - b);
  const laneGap = centers[centers.length - 1] - centers[0];
  if (laneGap < Math.max(70, Number(box.h || 0) * 0.24)) return false;
  const columnClusters = clusterVisualNodesByAxis(laneNodes, "x", Math.max(44, Number(box.w || 0) * 0.09));
  const columnsWithMultipleRows = columnClusters.filter((cluster) => cluster.nodes.length >= 2).length;
  return columnsWithMultipleRows >= 1 || laneNodes.length >= lanes.length * 3;
}

function looksLikeVisualConcentricCircles(visualAtoms = []) {
  const layers = (visualAtoms || [])
    .filter((atom) => atom?.kind === "native-concentric-circle-candidate" && atom?.box)
    .sort((left, right) => boxArea(right.box) - boxArea(left.box));
  if (layers.length < 3 || layers.length > 8) return false;
  const outer = layers[0].box;
  const outerCenter = {
    x: Number(outer.x || 0) + Number(outer.w || 0) / 2,
    y: Number(outer.y || 0) + Number(outer.h || 0) / 2
  };
  for (let index = 0; index < layers.length; index += 1) {
    const layerBox = layers[index].box;
    const width = Number(layerBox.w || 0);
    const height = Number(layerBox.h || 0);
    const centerDelta = Math.hypot(
      Number(layerBox.x || 0) + width / 2 - outerCenter.x,
      Number(layerBox.y || 0) + height / 2 - outerCenter.y
    );
    if (width / Math.max(1, height) < 0.75 || width / Math.max(1, height) > 1.33) return false;
    if (centerDelta > Math.max(Number(outer.w || 0), Number(outer.h || 0)) * 0.055) return false;
    if (index > 0) {
      const previous = layers[index - 1].box;
      const ratio = Math.max(width, height) / Math.max(1, Math.max(Number(previous.w || 0), Number(previous.h || 0)));
      if (ratio < 0.28 || ratio > 0.88) return false;
    }
  }
  return true;
}

function looksLikeVisualGaugeChart(visualAtoms = []) {
  const arcs = (visualAtoms || []).filter((atom) => atom?.kind === "native-gauge-arc-candidate" && atom?.box);
  const needles = (visualAtoms || []).filter((atom) => atom?.kind === "native-gauge-needle-candidate" && atom?.box);
  return arcs.length === 1 && needles.length === 1;
}

function looksLikeVisualDonutChart(visualAtoms = [], box = {}, text = "") {
  const donutAtoms = (visualAtoms || []).filter((atom) =>
    (atom?.kind === "native-donut-candidate" || atom?.kind === "native-donut-segment-candidate") && atom.box
  );
  const segmentAtoms = donutAtoms.filter((atom) => atom?.kind === "native-donut-segment-candidate");
  if (donutAtoms.length < 1 || donutAtoms.length > 8) return false;
  const explicitDonut = /(^|[^a-z])(chart|plot|kpi|donut|ring|ratio|share)([^a-z]|$)|环形图|甜甜圈图|占比|比例/.test(String(text || ""));
  if (segmentAtoms.length >= 2) return true;
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const completeDonuts = donutAtoms.filter((atom) => {
    const atomBox = atom.box || {};
    const width = Number(atomBox.w || 0);
    const height = Number(atomBox.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    return aspect >= 0.72 && aspect <= 1.38 && areaRatio >= 0.02 && areaRatio <= 0.55;
  });
  if (completeDonuts.length === 0) return false;
  if (explicitDonut) return true;
  const unrelatedLargeAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box || donutAtoms.includes(atom)) return false;
    if (atom?.source?.detector === "dense-linked-node-visual-atom") return false;
    return boxArea(atom.box) / regionArea >= 0.012;
  });
  return completeDonuts.length === 1 && unrelatedLargeAtoms.length === 0;
}

function looksLikeVisualPieChart(visualAtoms = [], box = {}, text = "") {
  const safeText = String(text || "").toLowerCase();
  const pieSemantic = /(^|[^a-z])(pie|share|ratio|proportion|percentage)([^a-z]|$)|饼图|扇区|占比|比例|份额/.test(safeText);
  if (/(^|[^a-z])(donut|ring)([^a-z]|$)|环形图|甜甜圈图|圆环/.test(safeText)) return false;
  const segmentAtoms = (visualAtoms || []).filter((atom) => ["native-donut-segment-candidate", "native-pie-segment-candidate"].includes(atom?.kind) && atom.box);
  if (segmentAtoms.length >= 2 && segmentAtoms.length <= 8) return true;
  if (!pieSemantic) return false;
  const roundAtoms = (visualAtoms || []).filter((atom) => {
    if (!atom?.box) return false;
    const hint = String(atom.shapeHint || "").toLowerCase();
    const kind = String(atom.kind || "");
    const atomBox = atom.box || {};
    const aspect = Number(atomBox.w || 0) / Math.max(1, Number(atomBox.h || 0));
    const areaRatio = boxArea(atomBox) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return (kind === "native-ellipse-candidate" || kind === "native-donut-candidate" || /ellipse|circle|pie|sector/.test(hint))
      && aspect >= 0.72 && aspect <= 1.38
      && areaRatio >= 0.035 && areaRatio <= 0.62;
  });
  return roundAtoms.length >= 1;
}

function looksLikeVisualLineChart(visualAtoms = [], box = {}, text = "") {
  if (!/(^|[^a-z])(chart|plot|trend|line|series|axis)([^a-z]|$)|折线图|趋势图|走势图|曲线图/.test(String(text || ""))) return false;
  const lineSegments = (visualAtoms || []).filter((atom) => atom?.kind === "connector-line-candidate" && atom?.shapeHint === "line-diagonal" && atom.lineEndpoints);
  if (lineSegments.length < 2 || lineSegments.length > 24) return false;
  const axes = (visualAtoms || []).filter((atom) => {
    if (atom?.kind !== "grid-line-candidate" && atom?.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontalOrVertical = Number(atomBox.w || 0) >= Number(atomBox.h || 0) * 6 || Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    const longEnough = Math.max(Number(atomBox.w || 0), Number(atomBox.h || 0)) >= Math.max(70, Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.25);
    return horizontalOrVertical && longEnough;
  });
  if (axes.length < 1) return false;
  const endpoints = lineSegments.flatMap((atom) => [atom.lineEndpoints.from, atom.lineEndpoints.to]);
  const xs = endpoints.map((point) => Number(point.x || 0)).sort((a, b) => a - b);
  const ys = endpoints.map((point) => Number(point.y || 0)).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  const ySpread = ys[ys.length - 1] - ys[0];
  return xSpread >= Number(box.w || 0) * 0.22 && ySpread >= Number(box.h || 0) * 0.12;
}

function looksLikeVisualScatterChart(visualAtoms = [], box = {}, text = "") {
  if (!/(^|[^a-z])(chart|plot|scatter|bubble|axis|distribution)([^a-z]|$)|散点图|气泡图|分布图|坐标轴/.test(String(text || ""))) return false;
  const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
  if (points.length < 5 || points.length > 80) return false;
  const axes = (visualAtoms || []).filter((atom) => {
    if (atom?.kind !== "grid-line-candidate" && atom?.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontalOrVertical = Number(atomBox.w || 0) >= Number(atomBox.h || 0) * 6 || Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    const longEnough = Math.max(Number(atomBox.w || 0), Number(atomBox.h || 0)) >= Math.max(70, Math.max(Number(box.w || 0), Number(box.h || 0)) * 0.25);
    return horizontalOrVertical && longEnough;
  });
  if (axes.length < 2) return false;
  const centers = points.map((atom) => centerOf(atom.box));
  const xs = centers.map((point) => point.x).sort((a, b) => a - b);
  const ys = centers.map((point) => point.y).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  const ySpread = ys[ys.length - 1] - ys[0];
  const sizeValues = points.map((atom) => Math.max(Number(atom.box.w || 0), Number(atom.box.h || 0)));
  const medianSize = median(sizeValues);
  const oversized = points.filter((atom) => Math.max(Number(atom.box.w || 0), Number(atom.box.h || 0)) > medianSize * 2.2).length;
  return xSpread >= Number(box.w || 0) * 0.26
    && ySpread >= Number(box.h || 0) * 0.18
    && oversized <= Math.max(1, points.length * 0.18);
}

function looksLikeVisualWaterfallChart(visualNodes = [], visualAtoms = [], box = {}, text = "") {
  if (!/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(String(text || ""))) return false;
  const bars = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    return node?.box && /rect|bar|column/.test(hint || "rect") && aspect >= 0.12 && aspect <= 3.5 && height >= Math.max(10, Number(box.h || 0) * 0.08);
  });
  if (bars.length < 4 || bars.length > 14) return false;
  const centers = bars.map((node) => centerOf(node.box)).sort((a, b) => a.x - b.x);
  const xSpread = centers[centers.length - 1].x - centers[0].x;
  if (xSpread < Number(box.w || 0) * 0.3) return false;
  const tops = bars.map((node) => Number(node.box.y || 0));
  const bottoms = bars.map((node) => Number(node.box.y || 0) + Number(node.box.h || 0));
  const variedTops = clusterNumbers(tops, Math.max(12, Number(box.h || 0) * 0.04)).length >= 3;
  const variedBottoms = clusterNumbers(bottoms, Math.max(12, Number(box.h || 0) * 0.04)).length >= 2;
  const hasAxis = (visualAtoms || []).some((atom) => {
    const atomBox = atom?.box || {};
    return /grid-line|connector-line/.test(String(atom?.kind || ""))
      && Number(atomBox.w || 0) >= Number(box.w || 0) * 0.3
      && Number(atomBox.w || 0) > Number(atomBox.h || 0) * 6;
  });
  return variedTops && variedBottoms && hasAxis;
}

function looksLikeVisualBarChart(visualNodes = [], visualAtoms = [], box = {}) {
  if (visualNodes.length < 3 || connectorAtomCount(countBy(visualAtoms, "kind")) < 1) return false;
  const bars = visualNodes.filter((node) => {
    const hint = String(node.shapeHint || "");
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return (hint === "rect" || hint === "line") && aspect >= 0.18 && aspect <= 16;
  });
  if (bars.length < 3 || bars.length > 16) return false;
  return looksLikeVerticalBarSeries(bars, visualAtoms, box)
    || looksLikeHorizontalBarSeries(bars, visualAtoms, box)
    || looksLikeHorizontalStackedBarSeries(bars, visualAtoms, box);
}

function looksLikeVisualCycleLoop(visualAtoms = [], _visualNodes = [], box = {}, text = "") {
  const atomKinds = countBy(visualAtoms, "kind");
  const arcSegments = (atomKinds["native-arc-arrow-segment-candidate"] || 0);
  const cycleArrows = (atomKinds["native-cycle-arrow-candidate"] || 0);
  const ringSegments = (atomKinds["native-donut-segment-candidate"] || 0);
  const ringShapes = (atomKinds["native-donut-candidate"] || 0) + ringSegments;
  const cycleText = /cycle|loop|circular|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形|环状/.test(String(text || ""));
  if (cycleText && (arcSegments >= 2 || ringSegments >= 2 || ringShapes >= 1)) return true;
  const measuredCycleArrows = visualAtoms.filter((atom) => {
    if (atom?.kind !== "native-cycle-arrow-candidate" || !atom?.box) return false;
    const width = Number(atom.box.w || 0);
    const height = Number(atom.box.h || 0);
    const aspect = width / Math.max(1, height);
    const density = Number(atom.density || 0);
    return aspect >= 0.72 && aspect <= 1.38 && density >= 0.18 && density <= 0.58;
  });
  if (cycleArrows >= 1 && (cycleText || ringShapes >= 1 || measuredCycleArrows.length >= 1)) return true;
  if (arcSegments < 3) return false;
  const arcAtoms = visualAtoms.filter((atom) => atom.kind === "native-arc-arrow-segment-candidate" && atom.box);
  if (arcAtoms.length < 3) return false;
  const sharedParent = arcAtoms[0]?.donutParentBox;
  if (sharedParent && arcAtoms.every((atom) => atom?.donutParentBox && overlapRatio(atom.donutParentBox, sharedParent) >= 0.92)) {
    const parentAspect = Number(sharedParent.w || 0) / Math.max(1, Number(sharedParent.h || 0));
    if (parentAspect >= 0.72 && parentAspect <= 1.38) return true;
  }
  const centers = arcAtoms.map((atom) => centerOf(atom.box));
  const xSpread = spread(centers.map((point) => point.x));
  const ySpread = spread(centers.map((point) => point.y));
  const regionW = Math.max(1, Number(box.w || 0));
  const regionH = Math.max(1, Number(box.h || 0));
  const regionArea = regionW * regionH;
  const arcAreaRatio = arcAtoms.reduce((sum, atom) => sum + boxArea(atom.box), 0) / Math.max(1, regionArea);
  const circularSpread = xSpread >= regionW * 0.18 && ySpread >= regionH * 0.18;
  const enoughInk = arcAreaRatio >= 0.018 || arcAtoms.length >= 5;
  return circularSpread && enoughInk && (cycleText || ringShapes >= 1 || arcAtoms.length >= 4);
}

function looksLikeVisualLayeredStack(visualNodes = [], box = {}, text = "") {
  const stackNodes = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    return node?.box && (/funnel|triangle|trapezoid|chevron|parallelogram|rect/.test(hint) || node.kind === "native-funnel-candidate");
  });
  if (stackNodes.length < 3 || stackNodes.length > 9) return false;
  const yClusters = clusterVisualNodesByAxis(stackNodes, "y", Math.max(18, Number(box.h || 0) * 0.08));
  if (yClusters.length < 3) return false;
  const layerNodes = yClusters
    .map((cluster) => cluster.nodes.sort((a, b) => boxArea(b.box || {}) - boxArea(a.box || {}))[0])
    .filter(Boolean)
    .sort((a, b) => centerOf(a.box).y - centerOf(b.box).y);
  const centerSpread = spread(layerNodes.map((node) => centerOf(node.box).x));
  const stackText = String(text || "");
  if (centerSpread > Math.max(48, Number(box.w || 0) * 0.16) && !/ladder|step|阶梯/.test(stackText)) return false;
  const widths = layerNodes.map((node) => Number(node.box?.w || 0));
  const variedEnough = spread(widths) >= Math.max(24, Number(box.w || 0) * 0.08);
  const explicitStackSemantics = /pyramid|layered|funnel|ladder|金字塔|分层|层级|漏斗|阶梯/.test(stackText);
  return explicitStackSemantics || variedEnough;
}

function looksLikeVisualVennDiagram(visualNodes = [], box = {}, text = "") {
  const ellipseNodes = (visualNodes || []).filter((node) => {
    const hint = String(node?.shapeHint || "").toLowerCase();
    const nodeBox = node?.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return node?.box && (node.kind === "native-ellipse-candidate" || /ellipse|circle/.test(hint))
      && aspect >= 0.55 && aspect <= 1.8;
  });
  if (ellipseNodes.length < 2 || ellipseNodes.length > 5) return false;
  const explicitVenn = /venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠关系|重叠图/.test(String(text || ""));
  let overlapPairs = 0;
  for (let i = 0; i < ellipseNodes.length; i += 1) {
    for (let j = i + 1; j < ellipseNodes.length; j += 1) {
      const a = ellipseNodes[i].box;
      const b = ellipseNodes[j].box;
      const mutualOverlap = Math.min(overlapRatio(a, b), overlapRatio(b, a));
      const centerDistance = distance(centerOf(a), centerOf(b));
      const maxRadius = Math.max(Number(a.w || 0), Number(a.h || 0), Number(b.w || 0), Number(b.h || 0)) / 2;
      const recoveredPixelPair = [ellipseNodes[i], ellipseNodes[j]]
        .every((node) => String(node?.atomId || "").startsWith("pixel-venn-lobe-"));
      const minimumOverlap = recoveredPixelPair ? 0.04 : 0.12;
      const maximumCenterDistance = maxRadius * (recoveredPixelPair ? 1.95 : 1.65);
      if (mutualOverlap >= minimumOverlap && centerDistance <= maximumCenterDistance) overlapPairs += 1;
    }
  }
  const regionArea = Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  const ellipseAreaRatio = ellipseNodes.reduce((sum, node) => sum + boxArea(node.box || {}), 0) / regionArea;
  return overlapPairs >= 1 && (explicitVenn || ellipseAreaRatio >= 0.18);
}

function looksLikeVerticalBarSeries(bars = [], visualAtoms = [], box = {}) {
  const verticalBars = bars.filter((node) => {
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return aspect >= 0.18 && aspect <= 1.25;
  });
  if (verticalBars.length < 3) return false;
  const bottoms = verticalBars.map((node) => Number(node.box.y || 0) + Number(node.box.h || 0));
  const baselineSpread = Math.max(...bottoms) - Math.min(...bottoms);
  if (baselineSpread > Math.max(12, Number(box.h || 0) * 0.04)) return false;
  const heights = verticalBars.map((node) => Number(node.box.h || 0));
  const widths = verticalBars.map((node) => Number(node.box.w || 0));
  const heightRange = Math.max(...heights) - Math.min(...heights);
  const widthRange = Math.max(...widths) - Math.min(...widths);
  if (heightRange < Math.max(18, Number(box.h || 0) * 0.08)) return false;
  if (widthRange > Math.max(18, median(widths) * 0.65)) return false;
  const xs = verticalBars.map((node) => node.center.x).sort((a, b) => a - b);
  const xSpread = xs[xs.length - 1] - xs[0];
  if (xSpread < Number(box.w || 0) * 0.24) return false;
  const axisEvidence = visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const horizontal = Number(atomBox.w || 0) >= Number(atomBox.h || 0);
    if (!horizontal) return false;
    const y = Number(atomBox.y || 0) + Number(atomBox.h || 0) / 2;
    return Math.abs(y - median(bottoms)) <= Math.max(14, Number(box.h || 0) * 0.05)
      && Number(atomBox.w || 0) >= xSpread * 0.75;
  });
  return axisEvidence;
}

function looksLikeHorizontalBarSeries(bars = [], visualAtoms = [], box = {}) {
  const horizontalBars = bars.filter((node) => {
    const nodeBox = node.box || {};
    const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
    return aspect >= 1.35 && aspect <= 16;
  });
  if (horizontalBars.length < 3) return false;
  const lefts = horizontalBars.map((node) => Number(node.box.x || 0));
  const baselineSpread = Math.max(...lefts) - Math.min(...lefts);
  if (baselineSpread > Math.max(12, Number(box.w || 0) * 0.035)) return false;
  const widths = horizontalBars.map((node) => Number(node.box.w || 0));
  const heights = horizontalBars.map((node) => Number(node.box.h || 0));
  const widthRange = Math.max(...widths) - Math.min(...widths);
  const heightRange = Math.max(...heights) - Math.min(...heights);
  if (widthRange < Math.max(32, Number(box.w || 0) * 0.12)) return false;
  if (heightRange > Math.max(14, median(heights) * 0.7)) return false;
  const ys = horizontalBars.map((node) => node.center.y).sort((a, b) => a - b);
  const ySpread = ys[ys.length - 1] - ys[0];
  if (ySpread < Number(box.h || 0) * 0.22) return false;
  const leftEdge = median(lefts);
  const axisEvidence = visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const vertical = Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    if (!vertical) return false;
    const x = Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2;
    return Math.abs(x - leftEdge) <= Math.max(14, Number(box.w || 0) * 0.045)
      && Number(atomBox.h || 0) >= ySpread * 0.75;
  });
  return axisEvidence;
}

function looksLikeHorizontalStackedBarSeries(bars = [], visualAtoms = [], box = {}) {
  const segments = bars.filter((node) => {
    const nodeBox = node.box || {};
    const width = Number(nodeBox.w || 0);
    const height = Number(nodeBox.h || 0);
    const aspect = width / Math.max(1, height);
    return aspect >= 0.8 && aspect <= 8 && width >= Math.max(18, Number(box.w || 0) * 0.035);
  });
  if (segments.length < 6 || segments.length > 24) return false;
  const medianHeight = median(segments.map((node) => Number(node.box?.h || 0)));
  const rowClusters = clusterVisualNodesByAxis(segments, "y", Math.max(10, medianHeight * 0.9));
  const rows = rowClusters
    .map((cluster) => ({
      ...cluster,
      nodes: [...cluster.nodes].sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))
    }))
    .filter((cluster) => cluster.nodes.length >= 2);
  if (rows.length < 3 || rows.length > 8) return false;
  const rowLefts = rows.map((row) => Number(row.nodes[0].box?.x || 0));
  const rowRights = rows.map((row) => Math.max(...row.nodes.map((node) => Number(node.box?.x || 0) + Number(node.box?.w || 0))));
  const leftEdge = median(rowLefts);
  if (Math.max(...rowLefts) - Math.min(...rowLefts) > Math.max(16, Number(box.w || 0) * 0.045)) return false;
  const rowWidths = rowRights.map((right, index) => right - rowLefts[index]);
  if (Math.max(...rowWidths) < Number(box.w || 0) * 0.24) return false;
  const rowCenters = rows.map((row) => row.center).sort((a, b) => a - b);
  const ySpread = rowCenters[rowCenters.length - 1] - rowCenters[0];
  if (ySpread < Number(box.h || 0) * 0.22) return false;
  const adjacentEnough = rows.every((row) => {
    for (let index = 0; index < row.nodes.length - 1; index += 1) {
      const current = row.nodes[index].box || {};
      const next = row.nodes[index + 1].box || {};
      const gap = Number(next.x || 0) - (Number(current.x || 0) + Number(current.w || 0));
      if (gap > Math.max(8, medianHeight * 0.55)) return false;
    }
    return true;
  });
  if (!adjacentEnough) return false;
  return visualAtoms.some((atom) => {
    if (atom.kind !== "grid-line-candidate" && atom.kind !== "connector-line-candidate") return false;
    const atomBox = atom.box || {};
    const vertical = Number(atomBox.h || 0) >= Number(atomBox.w || 0) * 6;
    if (!vertical) return false;
    const x = Number(atomBox.x || 0) + Number(atomBox.w || 0) / 2;
    return Math.abs(x - leftEdge) <= Math.max(14, Number(box.w || 0) * 0.045)
      && Number(atomBox.h || 0) >= ySpread * 0.75;
  });
}

module.exports = {
  inferArchetype,
  looksLikeDenseRadialLineArt,
  looksLikeLinearFlow,
  looksLikeAnnotatedScreenshot,
  looksLikeScreenshotZoomCallout,
  looksLikeScreenshotCardGrid,
  looksLikeFeatureIconCardGrid,
  looksLikeVisualExampleCardGrid,
  looksLikeNumberedStepCardGrid,
  isSmallBadgeAtom,
  looksLikeVisualLinearFlow,
  looksLikeDashboardCardGrid,
  looksLikeComparisonMatrix,
  looksLikeHeatmapMatrix,
  looksLikeTreemapDiagram,
  looksLikeSankeyFlowDiagram,
  looksLikeVisualTimelineRoadmap,
  looksLikeVisualGanttRoadmap,
  looksLikeQuadrantMatrix,
  looksLikeVisualFunnelLensFlow,
  looksLikeVisualFishboneDiagram,
  looksLikeHubSpoke,
  looksLikeVisualHubSpoke,
  looksLikeVisualTreeStructure,
  looksLikeVisualSwimlaneFlow,
  looksLikeVisualConcentricCircles,
  looksLikeVisualGaugeChart,
  looksLikeVisualDonutChart,
  looksLikeVisualPieChart,
  looksLikeVisualLineChart,
  looksLikeVisualScatterChart,
  looksLikeVisualWaterfallChart,
  looksLikeVisualBarChart,
  looksLikeVisualCycleLoop,
  looksLikeVisualLayeredStack,
  looksLikeVisualVennDiagram,
  looksLikeVerticalBarSeries,
  looksLikeHorizontalBarSeries,
  looksLikeHorizontalStackedBarSeries
};
