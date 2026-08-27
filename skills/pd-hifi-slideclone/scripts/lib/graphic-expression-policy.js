"use strict";

function classifyGraphicExpressionPolicy(input = {}) {
  const source = input.source || input.image?.source || {};
  const layer = input.layer || source.layer || input.source?.layer || {};
  const understanding = input.diagramUnderstanding || layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const detector = safeString(input.detector || source.detector).toLowerCase();
  const layerType = safeString(input.layerType || layer.layerType).toLowerCase();
  const expressionForm = safeString(input.expressionForm || source.expressionForm).toLowerCase();
  const expressionSubtype = safeString(input.expressionSubtype || source.expressionSubtype).toLowerCase();
  const action = safeString(input.recommendedAction || source.recommendedAction || source.expressionRecommendation).toLowerCase();
  const reasonText = safeString(input.reason || source.reason || source.nonEditableReason).toLowerCase();
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  const expressionFamily = safeString(understanding.expressionFamily || understanding.structureSignature?.expressionFamily || input.expressionFamily || source.expressionFamily).toLowerCase();
  const family = safeString(understanding.componentStrategy?.templateFamily).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  const atomCounts = understanding.visualAtomKindCounts || {};
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const semanticNodeCount = finiteNumber(understanding.nodeCount, 0);
  const semanticConnectorCount = finiteNumber(understanding.connectorCount, 0);
  const nodeCount = semanticNodeCount + finiteNumber(understanding.visualNodeCount, 0);
  const connectorCount = semanticConnectorCount + finiteNumber(understanding.visualConnectorCount, 0);
  const residualCount = finiteNumber(understanding.residualCount, 0);
  const text = [
    detector,
    layerType,
    expressionForm,
    expressionSubtype,
    action,
    reasonText,
    expressionFamily,
    family,
    archetype
  ].join(" ");
  const reasons = [];
  const add = (reason) => reasons.push(reason);
  const explicitStandalone = input.standaloneVisualAsset === true
    || source.standaloneVisualAsset === true
    || layer.standaloneVisualAsset === true;
  const structuralExpressionOverride = /^(data-chart|chart-snapshot|table-or-matrix|complex-diagram|linear-process-diagram)$/.test(expressionForm)
    || /^(chart-zone|table-zone|diagram-zone)$/.test(layerType)
    || /(?:chart|axis|series|plot|table|matrix|grid|data-series|flow|process|relationship|timeline|tree|topology|network)/.test(expressionSubtype);
  const approvedCompleteDiagramFidelity = source.largeFidelityCropApproved === true
    && source.sourceFaithfulCrop === true
    && source.protectedMinimumUnit === true
    && safeString(source.largeFidelityCropApprovalReason).length >= 24
    && safeString(source.componentRenderStrategy?.mode) === "preserve-local-crop"
    && expressionForm === "complex-diagram";

  if (approvedCompleteDiagramFidelity) {
    add("authoritative-complete-diagram-fidelity-exception");
    return policy("fidelity-crop", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (explicitStandalone && !structuralExpressionOverride) {
    add("explicit-standalone-visual-asset");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }
  if (explicitStandalone && structuralExpressionOverride) add("explicit-standalone-overridden-by-structured-expression");

  const nativeIntent = /replace-with-native-components|native-rebuild|split-native|attempt-native-reconstruction/.test(action)
    || nativeReadiness === "native-rebuild";
  const structuredKind = nativeIntent
    || /diagram|matrix|grid|table|chart|flow|process|relationship|timeline|topology|network|hub|spoke|cycle/.test(text);
  const knownDocumentDiagram = /document-version|version-folder|folder-flow/.test(text);
  const rasterLike = /screenshot|screen-capture|ui-capture|product-screenshot|photo|bitmap/.test(text)
    || (/document/.test(text) && !knownDocumentDiagram);
  const decorativeLike = /background|texture|pattern|brand|logo|avatar|portrait/.test(text)
    || input.decorativeTexture === true
    || source.decorativeTexture === true;
  const structuredExpressionTerms = /structured|diagram|complex-diagram|relationship-flow|linear-process-diagram|process-flow|process|flow|matrix|grid|table|chart|bar-chart|line-chart|pie-chart|donut-chart|dashboard|timeline|topology|network|architecture|workflow|flowchart|org-chart|mind-map|结构化|关系图|流程|矩阵|表格|图表|柱状图|折线图|饼图|环形图|仪表盘|看板|时间线|拓扑|网络|架构|组织结构/.test(text);
  const singleAssetTerms = /visual-example|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|mockup|demo|sample|example|screenshot-demo|screen-demo|infographic|pictogram|clipart|sticker|ornament|badge|decorative-diagram|插画|图标|图示|示意图|样例|示例|截图示意|界面示意|信息图|图标图示|装饰图示|素材图示|图形素材|示意插图/.test(text);
  const assetDominatedTerms = /visual-example|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|mockup|demo|sample|example|screenshot-demo|screen-demo|pictogram|clipart|sticker|ornament|badge|decorative-diagram|组件预览|素材|图形素材|素材图示|图标图示|装饰图示|示意图|图示样例|示例|样例|示意插图/.test(text);
  const dataStructureTerms = /data|axis|series|plot|chart|\bgraph\b|table|matrix|grid|dashboard|数据|坐标轴|序列|图表|柱状图|折线图|饼图|环形图|表格|矩阵|网格|看板|仪表盘/.test(text);
  const obviousVisualAsset = /pictorial-asset|icon-or-illustration|illustration-zone|icon|illustration/.test(text)
    || singleAssetTerms;
  const structuralForm = /^(data-chart|chart-snapshot|table-or-matrix|complex-diagram|linear-process-diagram)$/.test(expressionForm);
  const hardPictorialAsset = assetDominatedTerms
    && !structuralForm
    && !dataStructureTerms
    && (expressionForm === "icon-or-illustration" || /illustration-zone|icon|illustration|图标|图示|示意图|素材|preview|sample|example|mockup|vector-arrow|cycle-flow-icon/.test(text));
  if (hardPictorialAsset) {
    add(/(?:preview|sample|example|样例|示例|组件预览|图示样例|素材)/.test(text)
      ? "asset-dominated-diagram-example-preserved"
      : "pictorial-single-asset-preserved");
    add("pictorial-single-asset-preserved");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }
  const pictorialSingleAsset = singleAssetTerms && !structuredExpressionTerms;
  const semanticStructureEvidence = nativeReadiness === "native-rebuild"
    || nativeReadiness === "hybrid-native-plus-residual-crops"
    || nodeCount >= 2
    || connectorCount >= 1
    || finiteNumber(atomCounts["grid-line-candidate"], 0) >= 2
    || /table|matrix|grid|chart|graph|plot|diagram|flow|process|workflow|relationship|timeline|tree|topology|network|hub|spoke|architecture/.test(text);
  const hasStrongStructure = nativeReadiness === "native-rebuild"
    || nativeReadiness === "hybrid-native-plus-residual-crops"
    || nodeCount >= 2
    || connectorCount >= 1
    || finiteNumber(atomCounts["grid-line-candidate"], 0) >= 2
    || visualAtomCount >= 4;
  const semanticUnitEvidence = nodeCount >= 2
    || connectorCount >= 1
    || finiteNumber(atomCounts["grid-line-candidate"], 0) >= 2
    || dataStructureTerms;
  const denseRadialPictorialUnit = archetype === "dense-radial-line-art"
    && nativeReadiness === "preserve-crop"
    && visualAtomCount >= 24
    && semanticNodeCount === 0
    && semanticConnectorCount === 0
    && finiteNumber(understanding.visualConnectorCount, 0) === 0
    && finiteNumber(understanding.evidence?.textBoxCount, 0) === 0;

  if (denseRadialPictorialUnit) {
    add("dense-radial-line-art-without-semantic-units");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (/pictorial-asset|visual-asset|icon|illustration/.test(expressionFamily) && !semanticUnitEvidence) {
    add("pictorial-expression-family-without-semantic-units");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (decorativeLike && !hasStrongStructure) {
    add("decorative-or-texture-without-semantic-structure");
    return policy("decorative-texture", "sample-or-merge-decorative-texture", false, true, false, reasons);
  }

  if (decorativeLike && !nativeIntent) {
    add("decorative-or-texture-raster");
    return policy("decorative-texture", "sample-or-merge-decorative-texture", false, true, false, reasons);
  }

  if (rasterLike && nativeReadiness === "hybrid-native-plus-residual-crops" && hasStrongStructure) {
    add("raster-base-with-structured-overlays");
    return policy("hybrid-native-overlays", "crop-base-with-native-semantic-overlays", true, false, true, reasons);
  }

  if (rasterLike && !nativeIntent) {
    add("screenshot-or-document-raster");
    return policy("fidelity-crop", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (pictorialSingleAsset) {
    add("pictorial-single-asset-preserved");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (assetDominatedTerms
    && !dataStructureTerms
    && nativeReadiness !== "native-rebuild"
    && (!semanticUnitEvidence || expressionForm === "icon-or-illustration")) {
    add("asset-dominated-diagram-example-preserved");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (/preserve-local-crop|preserve-crop|keep-local-crop|match-icon-library/.test(action)
    && !nativeIntent
    && (obviousVisualAsset || rasterLike || decorativeLike || !structuredKind)) {
    add("explicit-preserve-crop-action");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (/preserve-fidelity-crop|preserve-crop-until|preserve.*until/.test(action)
    && nativeReadiness === "preserve-crop"
    && !hasStrongStructure) {
    add("low-confidence-structure-preserved-for-fidelity");
    return policy("fidelity-crop", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (obviousVisualAsset && !semanticStructureEvidence && !structuredExpressionTerms) {
    add("obvious-icon-illustration-without-semantic-structure");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (obviousVisualAsset && !nativeIntent && !hasStrongStructure && !structuredExpressionTerms) {
    add("obvious-icon-illustration-without-structure");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (obviousVisualAsset && !nativeIntent && residualCount > Math.max(2, visualAtomCount * 0.5)) {
    add("illustration-has-too-many-unsafe-residuals");
    return policy("standalone-visual-asset", "preserve-as-single-crop", false, true, false, reasons);
  }

  if (structuredKind && hasStrongStructure) {
    add("structured-expression-with-semantic-atoms");
    return policy("structured-native", "rebuild-semantic-structure", true, false, true, reasons);
  }

  if (structuredKind && !hasStrongStructure) {
    add("structured-expression-needs-more-evidence");
    return policy("native-intended-gap", "rebuild-semantic-structure-after-rule-or-template", true, false, false, reasons);
  }

  add("no-strong-structure-or-asset-signal");
  return policy("unknown", "preserve-crop-until-classified", false, true, false, reasons);
}

function policy(kind, minimumUnitPolicy, allowNativeRebuild, protectCrop, allowPluginTemplate, reasons = []) {
  return {
    kind,
    minimumUnitPolicy,
    unitDisposition: unitDispositionForPolicy(kind, minimumUnitPolicy, allowNativeRebuild, protectCrop, allowPluginTemplate),
    allowNativeRebuild,
    protectCrop,
    allowPluginTemplate,
    reasons: uniqueStrings(reasons)
  };
}

function unitDispositionForPolicy(kind, minimumUnitPolicy, allowNativeRebuild, protectCrop, allowPluginTemplate) {
  if (kind === "standalone-visual-asset" || minimumUnitPolicy === "preserve-as-single-crop") {
    return "intentional-visual-crop";
  }
  if (kind === "decorative-texture" || minimumUnitPolicy === "sample-or-merge-decorative-texture") {
    return "intentional-decorative-crop";
  }
  if (kind === "hybrid-native-overlays" || minimumUnitPolicy === "crop-base-with-native-semantic-overlays") {
    return "hybrid-crop-with-native-overlays";
  }
  if (allowNativeRebuild || allowPluginTemplate || minimumUnitPolicy === "rebuild-semantic-structure") {
    return "semantic-native-structure";
  }
  if (protectCrop) return "intentional-visual-crop";
  return "classification-needed";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => safeString(value)).filter(Boolean))];
}

module.exports = {
  classifyGraphicExpressionPolicy,
  _private: {
    unitDispositionForPolicy
  }
};
