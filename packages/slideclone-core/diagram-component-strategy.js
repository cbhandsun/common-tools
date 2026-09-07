"use strict";

const { connectorAtomCount, countBy, nativeNodeAtomCount } = require("./diagram-metrics");

function inferComponentStrategy({ archetype, confidence, nativeReadiness, nodes = [], connectors = [], residuals = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, structureSignature = null, semanticText = "", expressionSubtype = "" }) {
  const atomKinds = countBy(visualAtoms, "kind");
  const structuralNodeCount = Math.max(nodes.length, visualNodes.length);
  const structuralConnectorCount = Math.max(connectors.length, visualConnectors.length, connectorAtomCount(atomKinds));
  const residualKinds = new Set(residuals.map((item) => item.kind));
  const semantic = String(semanticText || "").toLowerCase();
  if (archetype === "machine-readable-code") {
    return {
      provider: "component-strategy-v1",
      mode: "preserve-local-crop",
      templateFamily: "machine-readable-code",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity"],
      reason: "QR codes, barcodes, and data-matrix graphics must stay as exact raster crops so scan reliability is not broken by native shape reconstruction"
    };
  }
  if (archetype === "screenshot-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-screenshot-crops", "native-card-containers", "officeplus-search", "islide-search"],
      reason: "screenshot card grids should rebuild card containers, captions, and layout natively while preserving embedded UI/product screenshots as minimum-unit crops"
    };
  }
  if (archetype === "visual-example-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "visual-example-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-visual-example-crops", "native-card-containers", "officeplus-search", "islide-search"],
      reason: "visual example card grids should rebuild card shells, titles, and descriptions natively while preserving each pictorial/plugin preview as a minimum-unit crop"
    };
  }
  if (archetype === "screenshot-annotation") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-annotation",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity", "native-callout-overlays", "officeplus-search", "islide-search"],
      reason: "annotated screenshots should keep the base screenshot as a precise crop while rebuilding callouts, arrows, highlight boxes, labels, and zoom markers as editable overlays"
    };
  }
  if (archetype === "screenshot-zoom-callout") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "screenshot-zoom-callout",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["local-crop-fidelity", "native-zoom-callout-overlays", "officeplus-search", "islide-search"],
      reason: "screenshot zoom callouts should keep the base screenshot and magnified detail as fidelity crops while rebuilding source highlight, connector lines, and zoom labels as editable overlays"
    };
  }
  if (archetype === "feature-icon-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "feature-icon-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-card-containers", "local-icon-crops"],
      reason: "feature icon card grids should rebuild card containers and text natively while preserving pictorial icons as minimum-unit crops unless a matching vector or plugin component is available"
    };
  }
  if (archetype === "numbered-step-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "numbered-step-card-grid",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-step-card-grid"],
      reason: "numbered step card grids should use polished reusable step-card components so badges, card shells, and explanatory text stay editable without looking like loose primitives"
    };
  }
  if (archetype === "dashboard-card-grid") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-kpi-card-grid"],
      reason: "dashboard and KPI card grids should be rebuilt as reusable metric-card components instead of a flat raster crop"
    };
  }
  if (archetype === "quadrant-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "quadrant-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-axis-grid"],
      reason: "quadrant and prioritization matrices should prefer reusable 2x2 axis components over generic table/grid reconstruction"
    };
  }
  if (archetype === "comparison-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-comparison-table"],
      reason: "comparison, versus, and before-after matrices should search polished comparison components instead of generic card grids"
    };
  }
  if (archetype === "heatmap-matrix") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-heatmap-grid"],
      reason: "heatmap, color-scale, and risk matrices should preserve cell-level color semantics instead of generic table reconstruction"
    };
  }
  if (archetype === "treemap-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "treemap-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-treemap-rectangles"],
      reason: "treemap and area-composition diagrams should preserve proportional rectangle semantics instead of generic grid reconstruction"
    };
  }
  if (archetype === "sankey-flow-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "sankey-flow-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "Sankey and alluvial flow diagrams are high 拼凑感 risk, so prefer reusable whole-group flow components over primitive line patches"
    };
  }
  if (archetype === "map-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "map-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "map and geographic distribution graphics are high 拼凑感 risk, so prefer reusable map components or preserve the map crop instead of tracing region fragments"
    };
  }
  if (archetype === "word-cloud-chart") {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "word-cloud-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "local-crop-fidelity"],
      reason: "word clouds are high 拼凑感 risk, so prefer reusable word-cloud components or preserve the crop instead of exploding keywords into loose text boxes"
    };
  }
  if (archetype === "waterfall-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "waterfall-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-search", "islide-search"],
      reason: "waterfall and variance bridge charts should preserve cumulative increase/decrease semantics instead of generic bar reconstruction"
    };
  }
  if (archetype === "gauge-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "gauge-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-gauge-arc"],
      reason: "gauge and speedometer charts should prefer reusable dial/progress components over loose arc fragments"
    };
  }
  if (archetype === "radar-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: "radar-chart",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-search", "islide-search"],
      reason: "radar and spider charts should preserve multi-axis score semantics instead of rebuilding polygon grids from loose lines"
    };
  }
  if (archetype === "matrix-or-grid" && visualGrid) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "grid-or-matrix",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-table-grid", "officeplus-card-grid-style"],
      reason: "visual grid structure is explicit enough for a table/matrix component"
    };
  }
  if (
    archetype === "flow-card-chain"
    && structuralNodeCount >= 3
    && (structuralConnectorCount >= 2 || structureSignature?.wholeGroupTemplatePriority === "high")
  ) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-polished-card-style", "native-connectors"],
      reason: "flow/card chain should be rebuilt as grouped card components instead of loose primitive patches"
    };
  }
  if (archetype === "swimlane-flow" && structuralNodeCount >= 3) {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: structureSignature?.layout === "swimlane" ? "swimlane-flow" : "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-lane-containers", "native-connectors"],
      reason: "swimlane and cross-lane process diagrams should use reusable process components with lane containers instead of freeform primitive patches"
    };
  }
  if (archetype === "process-with-screenshots" && structuralNodeCount >= 3) {
    return {
      provider: "component-strategy-v1",
      mode: "hybrid-template-plus-local-crops",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-polished-card-style", "native-connectors", "local-crop-fidelity"],
      reason: "process-like diagram layers should use reusable process components while preserving unsafe screenshot details"
    };
  }
  if (hasExplicitDemandIntakeProcessEvidence(semantic) && !hasExplicitFunnelLensMetadata(expressionSubtype) && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("screenshot-crop-candidate") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-connectors", "local-crop-fidelity"],
      reason: "demand-intake convergence diagrams should use reusable branch process components while keeping lens/funnel styling as a motif"
    };
  }
  if (archetype === "funnel-lens-flow") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "funnel-lens-flow",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-funnel-lens-shapes", "native-connectors"],
      reason: "convergence, magnifier, and funnel flows should prefer reusable analysis/focusing components over generic process chains"
    };
  }
  if (archetype === "fishbone-cause-effect") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "fishbone-cause-effect",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-spine-branch-connectors"],
      reason: "fishbone and cause-effect diagrams should prefer whole-group root-cause templates over generic tree or branch layouts"
    };
  }
  if (archetype === "topology-diagram") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "topology-diagram",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-triangle-network-connectors"],
      reason: "topology, iron-triangle, and closed-loop diagrams should use reusable relationship components instead of generic node clusters"
    };
  }
  if (archetype === "tree-structure") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "hierarchy-tree",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-tree-connectors", "native-hierarchy-cards"],
      reason: "tree and organization hierarchy diagrams should search hierarchy/org-chart components instead of radial hub-spoke groups"
    };
  }
  if (archetype === "concentric-circles") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "concentric-circles",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-concentric-ellipses"],
      reason: "onion and concentric-circle diagrams should be rebuilt as reusable layered ring components instead of loose donut or ellipse patches"
    };
  }
  if (isDemandOrBranchProcessSemantic(semantic) && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("screenshot-crop-candidate") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "process-chain",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-connectors", "local-crop-fidelity"],
      reason: "semantic demand/input-output branching diagram should search reusable process components before falling back to primitive patches"
    };
  }
  if (archetype === "hub-spoke" && structuralNodeCount >= 4) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("icon-or-illustration-crop") ? "hybrid-template-plus-local-crops" : "component-template",
      templateFamily: "hub-spoke",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-icon-vector-style", "native-radial-connectors"],
      reason: "hub-spoke diagrams benefit from reusable center/endpoint component groups"
    };
  }
  if (archetype === "cycle-loop") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "cycle-loop",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["islide-search", "officeplus-search", "native-arc-arrow-shapes"],
      reason: "cycle-loop and arc-arrow diagrams should prefer reusable polished loop components over loose primitive patches"
    };
  }
  if (archetype === "layered-stack") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "layered-stack",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-layered-shapes"],
      reason: "pyramid, funnel, and ladder diagrams should prefer reusable layered-stack components over loose primitive patches"
    };
  }
  if (archetype === "venn-overlap") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "venn-overlap",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "native-transparent-ellipses"],
      reason: "overlapping set diagrams should prefer reusable Venn/intersection components over loose ellipse patches"
    };
  }
  if (archetype === "timeline-roadmap" || archetype === "gantt-roadmap" || (atomKinds["native-timeline-candidate"] || 0) >= 1 || /timeline/.test(archetype)) {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "component-template" : "hybrid-template-plus-local-crops",
      templateFamily: "timeline",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-search", "islide-search", "office-timeline-demo-openxml-patterns", "native-milestone-connectors"],
      reason: archetype === "gantt-roadmap"
        ? "gantt and project roadmap diagrams should prefer reusable schedule timeline components over generic bar-chart reconstruction"
        : "timeline and roadmap diagrams should prefer reusable milestone components over loose line, dot, and label patches"
    };
  }
  if (["generic-node-diagram", "multi-cluster-diagram", "tree-structure"].includes(archetype) && structuralNodeCount >= 2) {
    return {
      provider: "component-strategy-v1",
      mode: residualKinds.has("icon-or-illustration-crop") || residualKinds.has("complex-shape-crop-candidate")
        ? "hybrid-template-plus-local-crops"
        : nativeReadiness === "native-rebuild"
          ? "component-template"
          : "hybrid-template-plus-local-crops",
      templateFamily: "hub-spoke",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["officeplus-icon-vector-style", "native-radial-connectors", "officeplus-search", "islide-search"],
      reason: "generic node diagrams still map to reusable relationship component groups better than freeform primitive patches"
    };
  }
  if (archetype === "donut-chart" || archetype === "pie-chart" || archetype === "bar-chart" || archetype === "scatter-chart" || archetype === "line-chart") {
    return {
      provider: "component-strategy-v1",
      mode: nativeReadiness === "native-rebuild" ? "native-chart-template" : "hybrid-chart-template",
      templateFamily: archetype,
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["native-chart-primitives", "officeplus-chart-style-reference"],
      reason: "chart-like regions should use chart component templates when data is recoverable"
    };
  }
  if ((atomKinds["native-timeline-candidate"] || 0) >= 1 || /timeline/.test(archetype)) {
    return {
      provider: "component-strategy-v1",
      mode: "component-template",
      templateFamily: "timeline",
      ...(structureSignature ? { structureSignature } : {}),
      sourcePreference: ["office-timeline-demo-openxml-patterns", "native-milestone-connectors"],
      reason: "timeline candidates should learn milestone spacing and grouping from installed Office Timeline examples"
    };
  }
  if (residualKinds.has("icon-or-illustration-crop") || residualKinds.has("icon-crop-candidate") || residualKinds.has("complex-shape-crop-candidate")) {
    return {
      provider: "component-strategy-v1",
      mode: confidence >= 0.55 ? "hybrid-template-plus-local-crops" : "preserve-local-crop",
      templateFamily: "icon-or-illustration",
      sourcePreference: ["officeplus-vector-icon-style", "local-crop-fidelity"],
      reason: "icons and illustrations need a confident vector/library match before replacing crops"
    };
  }
  return {
    provider: "component-strategy-v1",
    mode: nativeReadiness === "native-rebuild" ? "native-primitives" : "preserve-or-hybrid",
    templateFamily: "generic",
    sourcePreference: ["existing-native-rules"],
    reason: "no installed component family is confidently matched"
  };
}

function inferTargetMotifs({ archetype = "", nodes = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, componentStrategy = {}, structureSignature = null, semanticText = "" } = {}) {
  const atomKinds = countBy(visualAtoms, "kind");
  const motifs = new Set();
  const family = String(componentStrategy.templateFamily || "").toLowerCase();
  const semantic = String(semanticText || "").toLowerCase();
  const text = `${archetype} ${family} ${semantic}`.toLowerCase();
  const connectorCount = Math.max(visualConnectors.length, connectorAtomCount(atomKinds));
  const nodeCount = Math.max(visualNodes.length, nodes.length);
  const semanticProcess = isDemandOrBranchProcessSemantic(semantic);
  const lensLikeAtomCount = (atomKinds["native-ellipse-candidate"] || 0)
    + (atomKinds["native-funnel-candidate"] || 0)
    + (atomKinds["native-search-candidate"] || 0);

  if ((atomKinds["native-cycle-arrow-candidate"] || 0) >= 1 || (atomKinds["native-arc-arrow-segment-candidate"] || 0) >= 3 || /cycle|loop|donut|闭环|循环|环形|圆弧|弧形/.test(text) || structureSignature?.layout === "cycle-loop") {
    motifs.add("cycle-loop");
    motifs.add("arc-arrow");
  }
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier|loupe|局部放大|放大镜|放大框|放大区域|细节放大|局部细节/.test(text) || structureSignature?.layout === "screenshot-zoom-callout") {
    motifs.add("screenshot-zoom-callout");
    motifs.add("zoom-lens-overlay");
    motifs.add("highlight-box");
    motifs.add("callout-overlay");
  }
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|截图标注|界面标注|页面标注|标注|批注|callout|highlight|框选|圈选|放大镜/.test(text) || structureSignature?.layout === "screenshot-annotation") {
    motifs.add("screenshot-annotation");
    motifs.add("callout-overlay");
    motifs.add("highlight-box");
  }
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(text) || structureSignature?.layout === "screenshot-card-grid") {
    motifs.add("screenshot-card-grid");
    motifs.add("screenshot-crop");
    motifs.add("card-grid");
  }
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(text) || structureSignature?.layout === "visual-example-card-grid") {
    motifs.add("visual-example-card-grid");
    motifs.add("visual-example-crop");
    motifs.add("card-grid");
  }
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(text) || structureSignature?.layout === "feature-icon-card-grid") {
    motifs.add("feature-icon-card-grid");
    motifs.add("card-grid");
    motifs.add("icon-crop");
  }
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(text) || structureSignature?.layout === "numbered-step-card-grid") {
    motifs.add("numbered-step-card-grid");
    motifs.add("step-badge");
    motifs.add("card-grid");
    motifs.add("linear-arrow-chain");
  }
  if ((atomKinds["native-donut-candidate"] || 0) >= 1 || (atomKinds["native-donut-segment-candidate"] || 0) >= 2 || ((atomKinds["native-ellipse-candidate"] || 0) >= 2 && /cycle|hub|spoke/.test(text))) motifs.add("ring-node");
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text) || structureSignature?.layout === "concentric-circles") {
    motifs.add("concentric-circles");
    motifs.add("ring-node");
  }
  if (/pie-chart|饼图|扇区|份额|proportion|percentage/.test(text) || structureSignature?.layout === "pie-chart") motifs.add("pie-share-chart");
  if (/dashboard|kpi|metric|scorecard|indicator|数据看板|指标看板|仪表盘|指标卡/.test(text) || structureSignature?.layout === "dashboard-card-grid") {
    motifs.add("dashboard-card-grid");
    motifs.add("card-grid");
  }
  if (/comparison|compare|versus|\bvs\b|before.?after|pros.?cons|竞品|对比|比较|方案对照|优劣|优缺点|前后对比/.test(text) || structureSignature?.layout === "comparison-matrix") {
    motifs.add("comparison-matrix");
    motifs.add("card-grid");
  }
  if (/heat[-_\s]?map|risk.?matrix|color[-_\s]?scale|热力图|热力矩阵|风险矩阵|色阶|色块矩阵|分布矩阵/.test(text) || structureSignature?.layout === "heatmap-matrix") {
    motifs.add("heatmap-matrix");
    motifs.add("card-grid");
  }
  if (/tree[-_\s]?map|area[-_\s]?map|market.?share|composition|矩形树图|树图|面积占比|面积分布|构成占比|份额构成/.test(text) || structureSignature?.layout === "treemap") {
    motifs.add("treemap-chart");
  }
  if (/sankey|alluvial|flow.?distribution|flow.?composition|energy.?flow|user.?journey.?flow|桑基图|流向图|流量分布|流转分布|流向分布|能量流|用户流转|路径流转/.test(text) || structureSignature?.layout === "sankey-flow") {
    motifs.add("sankey-flow-chart");
  }
  if (/map[-_\s]?chart|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|地图图表|地图图示|区域地图|中国地图|世界地图|地理分布|区域分布|地图热力/.test(text) || structureSignature?.layout === "geo-map") {
    motifs.add("map-chart");
  }
  if (/word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|关键词云|标签云|文字云|词云|热词云|词频云/.test(text) || structureSignature?.layout === "word-cloud") {
    motifs.add("word-cloud-chart");
  }
  if (/waterfall|bridge[-_\s]?chart|variance[-_\s]?bridge|瀑布图|桥图|增减分析|增减桥|差异桥/.test(text) || structureSignature?.layout === "waterfall-chart") {
    motifs.add("waterfall-chart");
  }
  if (/gauge[-_\s]?chart|speedometer|dial[-_\s]?chart|semi[-_\s]?circle[-_\s]?gauge|仪表图|仪表盘图|速度表|半圆仪表|进度仪表|评分仪表/.test(text) || structureSignature?.layout === "gauge-chart") {
    motifs.add("gauge-chart");
  }
  if (/radar[-_\s]?chart|spider[-_\s]?chart|web[-_\s]?chart|polar[-_\s]?chart|雷达图|蛛网图|蜘蛛网图|能力雷达|维度评分|多维评分|能力模型/.test(text) || structureSignature?.layout === "radar-chart") {
    motifs.add("radar-chart");
  }
  if (visualGrid || /matrix|grid|table/.test(text)) motifs.add("card-grid");
  if (/quadrant|四象限|象限|优先级|impact|effort|value|complexity/.test(text) || structureSignature?.layout === "quadrant") motifs.add("quadrant-axis");
  if (
    archetype === "scatter-chart"
    && (/bubble|portfolio|distribution|positioning|scatter|气泡|组合分布|分布图|定位图|散点/.test(text) || structureSignature?.layout === "scatter-chart")
  ) motifs.add("bubble-scatter-chart");
  if (/layered|pyramid|funnel|ladder|金字塔|分层|漏斗|阶梯/.test(text) || structureSignature?.layout === "layered-stack") motifs.add("layered-stack");
  if (/funnel|漏斗/.test(text) || (structureSignature?.layout === "layered-stack" && structureSignature?.direction === "funnel-down")) motifs.add("funnel-stack");
  if (/pyramid|金字塔/.test(text) || (structureSignature?.layout === "layered-stack" && structureSignature?.direction === "pyramid-down")) motifs.add("pyramid-stack");
  if (/venn|overlap|intersection|集合|交集|重叠/.test(text) || structureSignature?.layout === "venn-overlap") motifs.add("venn-overlap");
  if (/intersection|交集|重叠/.test(text) || structureSignature?.layout === "venn-overlap") motifs.add("intersection-overlap");
  if (archetype !== "cycle-loop" && (/topology|triangle|closed[-_\s]?loop|network|铁三角|闭环|拓扑/.test(text) || structureSignature?.layout === "topology")) motifs.add("topology-triangle");
  if (/timeline|roadmap|milestone|时间轴|里程碑|路线图/.test(text) || structureSignature?.layout === "timeline") motifs.add("milestone-roadmap");
  if (/gantt|schedule|project[-_\s]?plan|甘特|排期|计划表/.test(text) || structureSignature?.layout === "gantt-roadmap") motifs.add("gantt-roadmap");
  if (/tree|hierarchy|org|组织|部门|岗位|汇报|层级/.test(text) || (archetype === "tree-structure" && nodeCount >= 4)) motifs.add("tree-link");
  if (/org[-_\s]?chart|organization|hierarchy|department|role|reporting|组织架构|组织结构|部门架构|岗位层级|汇报关系|上下级/.test(text) || (archetype === "tree-structure" && structureSignature?.layout === "tree" && nodeCount >= 4)) {
    motifs.add("org-hierarchy");
  }
  if (/fishbone|cause|effect|root|ishikawa|鱼骨|因果|根因/.test(text) || structureSignature?.layout === "fishbone") motifs.add("fishbone-cause");
  if (/hub|spoke|radial/.test(text) || (archetype === "hub-spoke" && connectorCount >= 3)) motifs.add("radial-link");
  if (/flow|process|timeline|swimlane/.test(text) || (nodeCount >= 3 && connectorCount >= 1)) motifs.add("linear-arrow-chain");
  if (structureSignature?.wholeGroupTemplatePriority === "high" && /linear|swimlane|timeline|cycle/.test(String(structureSignature.layout || ""))) motifs.add("whole-process-template");
  if (
    (lensLikeAtomCount >= 1 && (/flow|process|funnel|lens|demand|需求|漏斗|放大镜|聚焦/.test(text) || connectorCount >= 1 || semanticProcess))
    || (semanticProcess && nodeCount >= 4 && /需求|理解|结构化|收敛|蓝图|漏斗|放大镜|聚焦|funnel|lens|analysis/.test(text))
    || structureSignature?.layout === "funnel-lens-flow"
  ) motifs.add("lens-funnel-flow");
  if (Math.max(nodeCount, nativeNodeAtomCount(atomKinds)) >= 4 && (connectorCount >= 1 || semanticProcess) && (/flow|process|tree|branch|demand|需求|输入|输出|素材|流程/.test(text) || structureSignature?.layout === "tree")) motifs.add("branch-card-flow");
  return [...motifs];
}

function isDemandOrBranchProcessSemantic(text = "") {
  const value = String(text || "").toLowerCase();
  if (!value) return false;
  const hasDemand = /需求|理解|业务目标|会议纪要|旧版说明|角色关系|业务截图|核心流程|飞书对话|异常|蓝图|demand|requirement/.test(value);
  const hasInputOutput = /输入|输出|产出|素材|材料|input|output|material/.test(value);
  const hasProcess = /流程|分支|结构化|收敛|漏斗|放大镜|聚焦|flow|branch|funnel|lens|process/.test(value);
  return (hasDemand && (hasInputOutput || hasProcess)) || (hasInputOutput && hasProcess);
}

function hasExplicitDemandIntakeProcessEvidence(text = "") {
  const value = String(text || "").toLowerCase();
  const intakeTerms = new Set(value.match(/需求理解|业务目标|会议纪要|核心流程|结构化蓝图|需求收敛|requirement intake|meeting notes|structured blueprint/g) || []);
  return intakeTerms.size >= 2 && isDemandOrBranchProcessSemantic(value);
}

function hasExplicitFunnelLensMetadata(expressionSubtype = "") {
  return /lens[-_\s]?funnel|funnel[-_\s]?lens|convergence|magnifier[-_\s]?flow|放大镜流程|漏斗流程|收敛流程/.test(String(expressionSubtype || "").toLowerCase());
}

function inferExpressionFamily({ archetype = "", nativeReadiness = "", structureSignature = null, item = {}, visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, semanticText = "" } = {}) {
  const text = [
    archetype,
    nativeReadiness,
    structureSignature?.layout,
    item.source?.expressionForm,
    item.source?.expressionSubtype,
    item.source?.detector,
    semanticText
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const atomKinds = countBy(visualAtoms, "kind");
  const semanticStructureEvidence = (visualNodes || []).length >= 2
    || (visualConnectors || []).length >= 1
    || connectorAtomCount(atomKinds) >= 1
    || Boolean(visualGrid);
  if (/machine-readable-code|qr[-_\s]?code|quick[-_\s]?response|barcode|bar[-_\s]?code|data[-_\s]?matrix|二维码|条形码|条码|扫码/.test(text)) {
    return "pictorial-asset";
  }
  if (/screenshot[-_\s]?zoom[-_\s]?callout|zoom[-_\s]?callout|zoom[-_\s]?lens|magnifier|loupe|局部放大|放大镜|放大框|放大区域|细节放大|局部细节/.test(text)) {
    return "annotated-screenshot";
  }
  if (/screenshot[-_\s]?annotation|annotated[-_\s]?screenshot|截图标注|界面标注|页面标注|标注|批注|callout|highlight|框选|圈选|放大镜/.test(text)) {
    return "annotated-screenshot";
  }
  if (/screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示/.test(text)) {
    return "layout-grid";
  }
  if (/visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图/.test(text)) {
    return "layout-grid";
  }
  if (/feature[-_\s]?icon[-_\s]?card[-_\s]?grid|feature[-_\s]?cards?|icon[-_\s]?cards?|capability[-_\s]?cards?|功能卡片|特性卡片|能力卡片|图标卡片|图标宫格|功能宫格|亮点卡片/.test(text)) {
    return "layout-grid";
  }
  if (/numbered[-_\s]?(?:step|card)|step[-_\s]?cards?|process[-_\s]?cards?|sequence[-_\s]?cards?|phase[-_\s]?cards?|步骤卡片|编号卡片|序号卡片|阶段卡片|流程卡片|步骤宫格|步骤矩阵|分步说明/.test(text)) {
    return "structured-process";
  }
  if (/screenshot|screen-capture|ui-capture|mockup|demo|sample|example|icon|illustration|pictogram|clipart|sticker|截图|样例|示例|图标|插画|示意图|图示/.test(text) && !semanticStructureEvidence) {
    return "pictorial-asset";
  }
  if (/bar-chart|line-chart|scatter-chart|pie-chart|donut-chart|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|\bchart\b|dashboard|\bplot\b|\bgraph\b|sankey|alluvial|geo[-_\s]?map|choropleth|regional[-_\s]?map|china[-_\s]?map|world[-_\s]?map|word[-_\s]?cloud|tag[-_\s]?cloud|keyword[-_\s]?cloud|waterfall|gauge|speedometer|radar|spider|图表|柱状图|折线图|散点图|饼图|环形图|桑基图|流向图|地图|词云|关键词云|瀑布图|仪表图|雷达图|蛛网图|看板|仪表盘/.test(text)) {
    return "data-chart";
  }
  if (/table|grid|matrix|quadrant|表格|网格|矩阵|象限/.test(text) || visualGrid) {
    return "layout-grid";
  }
  if (/timeline|roadmap|milestone|gantt|schedule|project[-_\s]?plan|process|workflow|flowchart|linear|funnel|fishbone|swimlane|tree|layered-stack|pyramid|layered|ladder|流程|时间线|路线图|里程碑|甘特|排期|计划表|泳道|树状|鱼骨|金字塔|分层|阶梯/.test(text)) {
    return "structured-process";
  }
  if (/relationship|hub|spoke|radial|cycle|ring|topology|network|venn|overlap|intersection|set[-_\s]?relation|关系|循环|圆环|拓扑|网络|集合|交集|重叠/.test(text)) {
    return "relationship-diagram";
  }
  if (/concentric[-_\s]?circles?|onion[-_\s]?diagram|nested[-_\s]?circles?|layered[-_\s]?circles?|同心圆|洋葱图|嵌套圆|层级圆|圈层模型|圈层结构/.test(text)) {
    return "relationship-diagram";
  }
  if (/screenshot|screen-capture|ui-capture|mockup|demo|sample|example|icon|illustration|pictogram|clipart|sticker|截图|样例|示例|图标|插画|示意图|图示/.test(text)) {
    return "pictorial-asset";
  }
  if (semanticStructureEvidence) {
    return "generic-structured-diagram";
  }
  return "unknown";
}

module.exports = {
  inferComponentStrategy,
  inferTargetMotifs,
  isDemandOrBranchProcessSemantic,
  hasExplicitDemandIntakeProcessEvidence,
  hasExplicitFunnelLensMetadata,
  inferExpressionFamily
};
