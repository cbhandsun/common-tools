"use strict";

const { understandDiagramLayer } = require("./diagram-understanding");
const { extractVisualAtoms } = require("./visual-atoms");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

const LAYER_TYPES = {
  BACKGROUND: "background-zone",
  DIAGRAM: "diagram-zone",
  CHART: "chart-zone",
  SCREENSHOT: "screenshot-zone",
  TABLE: "table-zone",
  VALUE_BANNER: "value-banner-zone",
  ILLUSTRATION: "illustration-zone",
  DECORATIVE: "decorative-zone",
  UNKNOWN: "unknown-visual-zone"
};

function classifyVisualLayer(item = {}, page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  const source = item.source || {};
  const detector = String(source.detector || "");
  const reason = String(source.reason || source.nonEditableReason || source.strategy || "");
  const text = `${detector} ${reason}`.toLowerCase();
  const box = item.box || {};
  const areaRatio = areaRatioForBox(box, slideSize);

  let layerType = layerTypeFromExpression(source);
  // Expression classification is a higher-level semantic signal than detector names.
  if (layerType === LAYER_TYPES.UNKNOWN) {
    if (/bottom-banner|value-banner|banner-crop/.test(text)) {
      layerType = LAYER_TYPES.VALUE_BANNER;
    } else if (/decorative-cover-background|background/.test(text) || item.type === "fidelity-background") {
      layerType = LAYER_TYPES.BACKGROUND;
    } else if (/wms-chain|collaboration-flow/.test(text)) {
      layerType = LAYER_TYPES.DIAGRAM;
    } else if (/comparison-matrix|table|grid|matrix/.test(text)) {
      layerType = LAYER_TYPES.TABLE;
    } else if (/(?:^|[^a-z])(?:chart|kpi|evidence|axis|plot|series)(?:[^a-z]|$)/.test(text)) {
      layerType = LAYER_TYPES.CHART;
    } else if (/screenshot|ui|screen|document|input|output/.test(text)) {
      layerType = LAYER_TYPES.SCREENSHOT;
    } else if (/illustration|cover|entropy|decorative/.test(text)) {
      layerType = LAYER_TYPES.ILLUSTRATION;
    } else if (/diagram|flow|chain|underlay|foreground|graphic|connector|sparse|mixed|structured|cluster|aggregate/.test(text)) {
      layerType = LAYER_TYPES.DIAGRAM;
    }
  }

  const chartProfile = classifyChartProfile({ layerType, detector, reason, item, page });
  const standaloneVisualAsset = isStandaloneVisualAssetLayer({ layerType, detector, reason, source });
  const structuredVisualLayer = !standaloneVisualAsset
    && shouldAnalyzeVisualStructure({ layerType, detector, reason, source, areaRatio });
  const layerSemanticText = semanticTextForLayer(item, page);
  const reusableVisualAtoms = options.reuseExistingVisualAnalysis === true && source.layer
    ? (Array.isArray(source.layer.visualAtoms) ? source.layer.visualAtoms : [])
    : null;
  const visualAtomOptions = {
      textBoxes: page.textBoxes || [],
      // Density peaks are meaningful for page-scale networks, but on tiny
      // crops they repeatedly sample one icon fill as several fake nodes.
      enableDenseLinkedNodes: layerType === LAYER_TYPES.DIAGRAM && areaRatio >= 0.02,
      semanticHint: layerSemanticText
    };
  const visualAtoms = structuredVisualLayer && reusableVisualAtoms
    ? reusableVisualAtoms
    : structuredVisualLayer && options.sourceImage
      ? options.visualFeatureContext?.getVisualAtoms
        ? options.visualFeatureContext.getVisualAtoms(box, visualAtomOptions)
        : extractVisualAtoms(options.sourceImage, box, slideSize, visualAtomOptions)
      : [];
  const diagramUnderstanding = structuredVisualLayer
    ? understandDiagramLayer(item, page, slideSize, { visualAtoms, semanticText: layerSemanticText, sourceImage: options.sourceImage })
    : null;
  const nativeConfidence = estimateNativeConfidence({ layerType, detector, item, page, areaRatio, chartProfile });
  const editBenefit = estimateEditBenefit({ layerType, detector, item, page, areaRatio, chartProfile });
  const recommendedAction = recommendLayerAction({ layerType, detector, source, nativeConfidence, editBenefit, areaRatio, chartProfile, diagramUnderstanding, standaloneVisualAsset });
  return {
    layerType,
    detector: detector || "unknown",
    areaRatio: round(areaRatio),
    ...(standaloneVisualAsset ? { standaloneVisualAsset: true } : {}),
    ...(chartProfile ? { chartProfile } : {}),
    ...(visualAtoms.length ? { visualAtoms } : {}),
    ...(diagramUnderstanding ? { diagramUnderstanding } : {}),
    nativeConfidence,
    editBenefit,
    recommendedAction,
    reconstructionPlan: buildReconstructionPlan({ layerType, detector, item, page, areaRatio, nativeConfidence, editBenefit, recommendedAction, chartProfile, diagramUnderstanding, standaloneVisualAsset }),
    explanation: explainLayer({ layerType, detector, source, nativeConfidence, editBenefit, areaRatio, chartProfile, diagramUnderstanding, standaloneVisualAsset })
  };
}

function semanticTextForLayer(item = {}, page = {}) {
  const box = item.box || {};
  return [
    item.source?.pageSemanticText,
    item.source?.semanticText,
    item.source?.reason,
    item.source?.expressionSubtype,
    ...(Array.isArray(page.textBoxes) ? page.textBoxes
      .filter((textBox) => !textBox?.box || boxOverlapRatio(textBox.box, box) >= 0.18)
      .map((textBox) => textBox?.text) : [])
  ]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .slice(0, 500);
}

function boxOverlapRatio(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const area = Math.max(1, Number(a.w || 0) * Number(a.h || 0));
  return intersection / area;
}

function layerTypeFromExpression(source = {}) {
  if (source.specializedNativeHybridResidual === true) return LAYER_TYPES.DIAGRAM;
  const form = String(source.expressionForm || "").toLowerCase();
  const subtype = String(source.expressionSubtype || "").toLowerCase();
  if (!form && !subtype) return LAYER_TYPES.UNKNOWN;
  if (form === "value-banner" || /value-banner/.test(subtype)) return LAYER_TYPES.VALUE_BANNER;
  if (form === "decorative-cover-visual" || form === "decorative-page-chrome" || /cover-decoration|decorative-cover|page-chrome/.test(subtype)) return LAYER_TYPES.DECORATIVE;
  if (form === "brand-mark" || /brand-mark|logo/.test(subtype)) return LAYER_TYPES.DECORATIVE;
  if (form === "screenshot-or-document" || /screenshot|document|ui-capture/.test(subtype)) return LAYER_TYPES.SCREENSHOT;
  if (form === "data-chart" || form === "chart-snapshot") return LAYER_TYPES.CHART;
  if (form === "table-or-matrix") return LAYER_TYPES.TABLE;
  if (form === "complex-diagram" || form === "linear-process-diagram") return LAYER_TYPES.DIAGRAM;
  if (form === "icon-or-illustration") return LAYER_TYPES.ILLUSTRATION;
  if (/icon|illustration/.test(subtype)) return LAYER_TYPES.ILLUSTRATION;
  if (/chart|kpi|plot|axis/.test(subtype)) return LAYER_TYPES.CHART;
  if (/table|matrix|grid/.test(subtype)) return LAYER_TYPES.TABLE;
  if (/diagram|flow|chain/.test(subtype)) return LAYER_TYPES.DIAGRAM;
  return LAYER_TYPES.UNKNOWN;
}

function annotateLayerSource(item, page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!item || typeof item !== "object") return item;
  const layer = classifyVisualLayer(item, page, slideSize, options);
  return {
    ...item,
    source: {
      ...(item.source || {}),
      layer
    }
  };
}

function summarizeLayerProfile(ir = {}) {
  const slideSize = ir.slideSize || DEFAULT_SLIDE;
  const pages = (ir.pages || []).map((page, fallbackIndex) => summarizePageLayers(page, slideSize, fallbackIndex));
  const totals = {
    pages: pages.length,
    visualLayers: 0,
    largeVisualLayers: 0,
    nativeCandidates: 0,
    residualCandidates: 0,
    largestUnexplainedCropAreaRatio: 0,
    layerTypeCounts: {},
    layerTypeAreaRatio: {},
    recommendedActionCounts: {},
    diagramArchetypeCounts: {},
    diagramReadinessCounts: {},
    componentStrategyModeCounts: {},
    componentTemplateFamilyCounts: {},
    componentTargetMotifCounts: {},
    visualAtomKindCounts: {}
  };
  for (const page of pages) {
    totals.visualLayers += page.visualLayers;
    totals.largeVisualLayers += page.largeVisualLayers;
    totals.nativeCandidates += page.nativeCandidates;
    totals.residualCandidates += page.residualCandidates;
    totals.largestUnexplainedCropAreaRatio = Math.max(
      totals.largestUnexplainedCropAreaRatio,
      page.largestUnexplainedCropAreaRatio
    );
    addCounts(totals.layerTypeCounts, page.layerTypeCounts);
    addCounts(totals.layerTypeAreaRatio, page.layerTypeAreaRatio);
    addCounts(totals.recommendedActionCounts, page.recommendedActionCounts);
    addCounts(totals.diagramArchetypeCounts, page.diagramArchetypeCounts);
    addCounts(totals.diagramReadinessCounts, page.diagramReadinessCounts);
    addCounts(totals.componentStrategyModeCounts, page.componentStrategyModeCounts);
    addCounts(totals.componentTemplateFamilyCounts, page.componentTemplateFamilyCounts);
    addCounts(totals.componentTargetMotifCounts, page.componentTargetMotifCounts);
    addCounts(totals.visualAtomKindCounts, page.visualAtomKindCounts);
  }
  for (const key of Object.keys(totals.layerTypeAreaRatio)) {
    totals.layerTypeAreaRatio[key] = round(totals.layerTypeAreaRatio[key]);
  }
  totals.largestUnexplainedCropAreaRatio = round(totals.largestUnexplainedCropAreaRatio);
  return {
    provider: "visual-layer-classifier",
    totals,
    pages
  };
}

function summarizePageLayers(page = {}, slideSize = DEFAULT_SLIDE, fallbackIndex = 0) {
  const layers = (page.images || [])
    .filter((item) => item?.source?.editable !== true)
    .map((item) => item.source?.layer || classifyVisualLayer(item, page, slideSize));
  const layerTypeCounts = {};
  const layerTypeAreaRatio = {};
  const recommendedActionCounts = {};
  const diagramArchetypeCounts = {};
  const diagramReadinessCounts = {};
  const componentStrategyModeCounts = {};
  const componentTemplateFamilyCounts = {};
  const componentTargetMotifCounts = {};
  const visualAtomKindCounts = {};
  let largestUnexplainedCropAreaRatio = 0;
  for (const layer of layers) {
    addCount(layerTypeCounts, layer.layerType || LAYER_TYPES.UNKNOWN, 1);
    addCount(layerTypeAreaRatio, layer.layerType || LAYER_TYPES.UNKNOWN, Number(layer.areaRatio || 0));
    addCount(recommendedActionCounts, layer.recommendedAction || "unknown", 1);
    if (layer.diagramUnderstanding) {
      addCount(diagramArchetypeCounts, layer.diagramUnderstanding.archetype || "unknown", 1);
      addCount(diagramReadinessCounts, layer.diagramUnderstanding.nativeReadiness || "unknown", 1);
      if (layer.diagramUnderstanding.componentStrategy) {
        addCount(componentStrategyModeCounts, layer.diagramUnderstanding.componentStrategy.mode || "unknown", 1);
        addCount(componentTemplateFamilyCounts, layer.diagramUnderstanding.componentStrategy.templateFamily || "unknown", 1);
        for (const motif of Array.isArray(layer.diagramUnderstanding.componentStrategy.targetMotifs)
          ? layer.diagramUnderstanding.componentStrategy.targetMotifs
          : []) {
          addCount(componentTargetMotifCounts, motif || "unknown", 1);
        }
      }
      addCounts(visualAtomKindCounts, layer.diagramUnderstanding.visualAtomKindCounts);
    }
    if (isUnexplainedLargeLayer(layer)) {
      largestUnexplainedCropAreaRatio = Math.max(largestUnexplainedCropAreaRatio, Number(layer.areaRatio || 0));
    }
  }
  return {
    pageIndex: page.pageIndex ?? fallbackIndex,
    visualLayers: layers.length,
    largeVisualLayers: layers.filter((layer) => Number(layer.areaRatio || 0) >= 0.18).length,
    nativeCandidates: layers.filter((layer) => layer.recommendedAction === "attempt-native-reconstruction").length,
    residualCandidates: layers.filter(isActionableResidualLayerCandidate).length,
    largestUnexplainedCropAreaRatio: round(largestUnexplainedCropAreaRatio),
    layerTypeCounts,
    layerTypeAreaRatio: roundCounts(layerTypeAreaRatio),
    recommendedActionCounts,
    diagramArchetypeCounts,
    diagramReadinessCounts,
    componentStrategyModeCounts,
    componentTemplateFamilyCounts,
    componentTargetMotifCounts,
    visualAtomKindCounts,
    layers
  };
}

function isActionableResidualLayerCandidate(layer = {}) {
  if (layer.recommendedAction !== "split-native-with-residual-crop") return false;
  const residuals = Array.isArray(layer.diagramUnderstanding?.residuals)
    ? layer.diagramUnderstanding.residuals
    : [];
  if (residuals.length === 0) return true;
  return residuals.some((residual) => !isAllowedFidelityResidual(residual));
}

function isAllowedFidelityResidual(residual = {}) {
  const kind = String(residual.kind || "").toLowerCase();
  const reason = String(residual.reason || "").toLowerCase();
  const text = `${kind} ${reason}`;
  return /icon|illustration|screenshot|document|complex-shape|crop/.test(text);
}

function classifyChartProfile({ layerType, detector, reason, item, page }) {
  if (layerType !== LAYER_TYPES.CHART) return null;
  const text = `${detector || ""} ${reason || ""}`.toLowerCase();
  const hasStructuredSeries = Array.isArray(item?.series) || Array.isArray(item?.dataSeries) || Array.isArray(item?.source?.series);
  const hasChartData = hasStructuredSeries || Array.isArray(item?.data) || Array.isArray(item?.source?.data);
  const hasAxisOrSeriesEvidence = /axis|plot|series|bar-chart|line-chart|column-chart|scatter-chart|pie-chart/.test(text);
  const isEvidenceSnapshot = /kpi|evidence|snapshot|screenshot|preserved|figure|dashboard/.test(text) && !hasChartData;
  if (isEvidenceSnapshot) {
    return {
      chartKind: "evidence-snapshot",
      reconstructionReadiness: "defer-until-data-series-detected",
      dataSeriesAvailable: false
    };
  }
  if (hasChartData || hasAxisOrSeriesEvidence) {
    return {
      chartKind: inferChartKind(text),
      reconstructionReadiness: "data-chart-candidate",
      dataSeriesAvailable: Boolean(hasChartData),
      evidence: hasChartData ? "structured-series" : "axis-or-series-detector"
    };
  }
  return {
    chartKind: "unknown-chart",
    reconstructionReadiness: "defer-until-data-series-detected",
    dataSeriesAvailable: false
  };
}

function inferChartKind(text) {
  if (/bar-chart|column-chart/.test(text)) return "bar-or-column-chart";
  if (/line-chart|series|axis|plot/.test(text)) return "line-or-axis-chart";
  if (/scatter-chart/.test(text)) return "scatter-chart";
  if (/pie-chart/.test(text)) return "pie-chart";
  return "data-chart";
}

function shouldAnalyzeVisualStructure({ layerType, detector, reason, source, areaRatio }) {
  if (layerType === LAYER_TYPES.DIAGRAM || layerType === LAYER_TYPES.TABLE || layerType === LAYER_TYPES.CHART) return true;
  if (layerType === LAYER_TYPES.SCREENSHOT) {
    if (areaRatio < 0.12) return false;
    const text = [
      detector,
      reason,
      source?.expressionForm,
      source?.expressionSubtype,
      source?.expressionRecommendation,
      source?.recommendedAction
    ].filter(Boolean).join(" ");
    return hasAnnotationOverlayEvidence(text) || hasScreenshotCardGridEvidence(text);
  }
  if (layerType !== LAYER_TYPES.ILLUSTRATION) return false;
  if (areaRatio < 0.16) return false;
  const text = [
    detector,
    reason,
    source?.expressionForm,
    source?.expressionSubtype,
    source?.expressionRecommendation,
    source?.recommendedAction
  ].filter(Boolean).join(" ").toLowerCase();
  if (/brand|logo|decorative|cover|avatar|photo|screenshot|document|ui-capture/.test(text)) return false;
  return /illustration-card|multi-card|underlay|diagram|flow|process|card|panel|node|graphic/.test(text);
}

function estimateNativeConfidence({ layerType, detector, page, areaRatio, chartProfile }) {
  const textCount = Array.isArray(page?.textBoxes) ? page.textBoxes.length : 0;
  const shapeCount = Array.isArray(page?.shapes) ? page.shapes.length : 0;
  const lowerDetector = String(detector || "").toLowerCase();
  let score = 0.2;
  if (layerType === LAYER_TYPES.TABLE) score = 0.62;
  else if (layerType === LAYER_TYPES.DIAGRAM) score = 0.52;
  else if (layerType === LAYER_TYPES.CHART) {
    score = chartProfile?.reconstructionReadiness === "data-chart-candidate" ? 0.64 : 0.28;
  }
  else if (layerType === LAYER_TYPES.SCREENSHOT) score = 0.18;
  else if (layerType === LAYER_TYPES.VALUE_BANNER) score = 0.1;
  else if (layerType === LAYER_TYPES.ILLUSTRATION) score = 0.16;
  else if (layerType === LAYER_TYPES.BACKGROUND || layerType === LAYER_TYPES.DECORATIVE) score = 0.08;
  if (/line-diagram/.test(lowerDetector)) score = 0.38;
  if (/wms-chain/.test(lowerDetector)) score = Math.min(score, 0.42);
  if (/collaboration-flow/.test(lowerDetector)) score = Math.min(score, 0.42);
  if (/line-diagram|comparison-matrix/.test(lowerDetector)) score += 0.12;
  if (/visual-cluster|mixed|structured|sparse/.test(lowerDetector)) score += 0.05;
  if (textCount >= 8) score += 0.04;
  if (shapeCount >= 4) score += 0.04;
  if (areaRatio >= 0.55 && layerType !== LAYER_TYPES.SCREENSHOT) score += 0.04;
  return round(clamp(score, 0, 0.95));
}

function estimateEditBenefit({ layerType, areaRatio, chartProfile }) {
  let score = Math.min(0.82, Math.max(0.12, areaRatio * 1.2));
  if (layerType === LAYER_TYPES.DIAGRAM || layerType === LAYER_TYPES.TABLE) score += 0.18;
  if (layerType === LAYER_TYPES.CHART && chartProfile?.reconstructionReadiness === "data-chart-candidate") score += 0.12;
  if (layerType === LAYER_TYPES.CHART && chartProfile?.reconstructionReadiness !== "data-chart-candidate") score -= 0.08;
  if (layerType === LAYER_TYPES.SCREENSHOT || layerType === LAYER_TYPES.BACKGROUND || layerType === LAYER_TYPES.VALUE_BANNER || layerType === LAYER_TYPES.DECORATIVE) score -= 0.2;
  if (layerType === LAYER_TYPES.ILLUSTRATION) score -= 0.12;
  return round(clamp(score, 0, 0.95));
}

function recommendLayerAction({ layerType, detector, source, nativeConfidence, editBenefit, areaRatio, chartProfile, diagramUnderstanding, standaloneVisualAsset }) {
  if (standaloneVisualAsset) return "preserve-local-crop";
  if (diagramUnderstanding?.archetype === "machine-readable-code") return "preserve-local-crop";
  if (diagramUnderstanding?.archetype === "screenshot-card-grid") return "split-native-with-residual-crop";
  if (diagramUnderstanding?.archetype === "visual-example-card-grid") return "split-native-with-residual-crop";
  if (diagramUnderstanding?.archetype === "screenshot-zoom-callout") return "split-native-with-residual-crop";
  if (diagramUnderstanding?.archetype === "screenshot-annotation") return "split-native-with-residual-crop";
  if (diagramUnderstanding?.archetype === "feature-icon-card-grid") return "split-native-with-residual-crop";
  if (layerType === LAYER_TYPES.CHART && (diagramUnderstanding?.archetype === "bar-chart" || diagramUnderstanding?.archetype === "donut-chart" || diagramUnderstanding?.archetype === "line-chart" || diagramUnderstanding?.archetype === "scatter-chart") && diagramUnderstanding?.nativeReadiness === "native-rebuild") {
    return "attempt-native-reconstruction";
  }
  if (/line-diagram|wms-chain|collaboration-flow/.test(String(detector || "").toLowerCase())) return "preserve-local-crop";
  if (layerType === LAYER_TYPES.CHART && chartProfile?.reconstructionReadiness !== "data-chart-candidate") return "preserve-local-crop";
  if (layerType === LAYER_TYPES.DIAGRAM && diagramUnderstanding?.nativeReadiness === "hybrid-native-plus-residual-crops") {
    return "split-native-with-residual-crop";
  }
  if (layerType === LAYER_TYPES.DIAGRAM && diagramUnderstanding?.nativeReadiness === "native-rebuild") {
    return "attempt-native-reconstruction";
  }
  if (layerType === LAYER_TYPES.ILLUSTRATION && isStructuredIllustrationCandidate(diagramUnderstanding, areaRatio)) {
    return "split-native-with-residual-crop";
  }
  if (shouldPreserveByExpressionRecommendation(source)) return "preserve-local-crop";
  if (layerType === LAYER_TYPES.BACKGROUND || layerType === LAYER_TYPES.SCREENSHOT || layerType === LAYER_TYPES.VALUE_BANNER || layerType === LAYER_TYPES.ILLUSTRATION || layerType === LAYER_TYPES.DECORATIVE) {
    return "preserve-local-crop";
  }
  if (nativeConfidence >= 0.6 && editBenefit >= 0.5) return "attempt-native-reconstruction";
  if (areaRatio >= 0.28 && editBenefit >= 0.45) return "split-native-with-residual-crop";
  return "preserve-local-crop";
}

function isStructuredIllustrationCandidate(diagramUnderstanding, areaRatio) {
  if (!diagramUnderstanding || areaRatio < 0.16) return false;
  const counts = diagramUnderstanding.visualAtomKindCounts || {};
  const nativeRectCount = Number(counts["native-rect-candidate"] || 0);
  const gridLineCount = Number(counts["grid-line-candidate"] || 0);
  const connectorCount = Number(counts["connector-line-candidate"] || 0) + Number(counts["connector-arrow-candidate"] || 0);
  const nativeShapeCount = Object.entries(counts)
    .filter(([kind]) => /^native-/.test(kind))
    .reduce((sum, [, value]) => sum + Number(value || 0), 0);
  const residualCount = Number(diagramUnderstanding.residualCount || 0);
  const confidence = Number(diagramUnderstanding.confidence || 0);
  const visualAtomCount = Number(diagramUnderstanding.visualAtomCount || 0);
  const visualGrid = diagramUnderstanding.visualGrid || null;
  const semanticNodeStructure = diagramUnderstanding.nativeReadiness === "native-rebuild"
    && diagramUnderstanding.expressionFamily === "structured-process"
    && Number(diagramUnderstanding.nodeCount || 0) >= 3
    && diagramUnderstanding.structureSignature?.wholeGroupTemplatePriority === "high";
  const cardLikeNativeAtoms = nativeShapeCount >= 3
    && nativeRectCount >= 2
    && residualCount <= nativeShapeCount
    && confidence >= 0.54;
  const lineGridStructure = gridLineCount >= 6
    && visualAtomCount >= 8
    && confidence >= 0.74
    && residualCount <= Math.max(12, gridLineCount + connectorCount)
    && (!visualGrid || Number(visualGrid.coverageRatio || 0) >= 0.08);
  return semanticNodeStructure || cardLikeNativeAtoms || lineGridStructure;
}

function shouldPreserveByExpressionRecommendation(source = {}) {
  const form = String(source.expressionForm || "").toLowerCase();
  const action = String(source.recommendedAction || source.expressionRecommendation || source.recommendedHandling || "").toLowerCase();
  if (form === "complex-diagram" && /preserve-fidelity-crop|keep-local-crop|preserve-local-crop/.test(action)) return true;
  if (form === "chart-snapshot" && /keep-crop|preserve/.test(action)) return true;
  if (form === "screenshot-or-document" && /keep-local-crop|preserve/.test(action)) return true;
  return false;
}

function isStandaloneVisualAssetLayer({ layerType, detector, reason, source }) {
  // These layers are intentionally preserved, but they are not standalone
  // visual assets. Keeping that distinction lets their specific policies and
  // explanations win over the generic icon/illustration fallback.
  if ([LAYER_TYPES.VALUE_BANNER, LAYER_TYPES.BACKGROUND, LAYER_TYPES.DECORATIVE].includes(layerType)) return false;
  // Illustration-card underlays are analyzed as a hybrid: stable card/grid
  // atoms become editable while pictorial details remain local crops.
  if (/illustration-card-graphic-underlay-crop/i.test(String(detector || ""))) return false;
  const expressionPolicy = classifyGraphicExpressionPolicy({
    layerType,
    detector,
    reason,
    source
  });
  if (expressionPolicy.kind === "standalone-visual-asset" || expressionPolicy.kind === "decorative-texture") return true;
  if (expressionPolicy.kind === "structured-native" || expressionPolicy.kind === "hybrid-native-overlays") return false;
  const form = String(source?.expressionForm || "").toLowerCase();
  const subtype = String(source?.expressionSubtype || "").toLowerCase();
  const action = String(source?.recommendedAction || source?.expressionRecommendation || source?.expressionHandling || "").toLowerCase();
  if (/replace-with-native-components|native-rebuild/.test(action)) return false;
  const text = [
    detector,
    reason,
    form,
    subtype,
    action,
    source?.detector,
    source?.nonEditableReason
  ].filter(Boolean).join(" ").toLowerCase();
  if (/data-chart|chart-snapshot|table-or-matrix|complex-diagram|linear-process-diagram/.test(form)) return false;
  if (/(?:chart|axis|series|plot|table|matrix|grid|data-series)/.test(subtype)) return false;
  if (layerType === LAYER_TYPES.SCREENSHOT && hasAnnotationOverlayEvidence(text)) return false;
  if (layerType === LAYER_TYPES.SCREENSHOT || layerType === LAYER_TYPES.DECORATIVE) return true;
  if (layerType !== LAYER_TYPES.ILLUSTRATION) return false;
  if (hasStructuredIllustrationEvidence(text) && !hasObviousStandaloneAssetEvidence(text)) return false;
  if (hasVisualExampleCardGridEvidence(text)) return false;
  return /(?:icon-or-illustration|icon|logo|illustration|插画|图标|图示|示意图|样例|示例|截图|screenshot|ui-capture|mockup|preview|sample|example|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow)/i.test(text);
}

function hasStructuredIllustrationEvidence(text = "") {
  return /(?:complex[-_\s]?diagram|linear[-_\s]?process|structured|multi[-_\s]?card|card[-_\s]?flow|node[-_\s]?diagram|connector|flowchart|process|workflow|matrix|grid|table|chart|axis|series|流程图|流程|节点图|卡片流程|结构化|矩阵|表格|图表|坐标轴)/i.test(String(text || ""));
}

function hasObviousStandaloneAssetEvidence(text = "") {
  return /(?:logo|brand|插画|图标|截图|screenshot|ui[-_\s]?capture|mockup|preview|sample|example|样例|示例|组件预览|plugin-.*(?:arrow|icon)|arrow[-_\s]?illustration|cycle[-_\s]?flow[-_\s]?icon|vector[-_\s]?arrow)/i.test(String(text || ""));
}

function hasAnnotationOverlayEvidence(text = "") {
  return /(?:annotation|annotated|callout|highlight|markup|redline|spotlight|magnifier|zoom[-_\s]?in|numbered|labelled|labeled|arrow[-_\s]?callout|截图标注|界面标注|页面标注|标注|批注|注释|说明气泡|气泡说明|框选|圈选|高亮|箭头说明|编号|放大镜|局部放大|重点标记)/i.test(String(text || ""));
}

function hasScreenshotCardGridEvidence(text = "") {
  const value = String(text || "");
  return /(?:screenshot[-_\s]?card[-_\s]?grid|screen[-_\s]?gallery|ui[-_\s]?showcase|mockup[-_\s]?cards?|product[-_\s]?screenshot|产品截图|界面截图|截图卡片|截图宫格|截图展示|界面展示|产品展示|多屏展示)/i.test(value)
    && /(?:card|grid|gallery|showcase|mockup|卡片|宫格|矩阵|展示|合集|案例|样例|示例|多屏)/i.test(value);
}

function hasVisualExampleCardGridEvidence(text = "") {
  const value = String(text || "");
  return /(?:visual[-_\s]?example[-_\s]?card|sample[-_\s]?(?:preview|card)|component[-_\s]?preview|plugin[-_\s]?preview|diagram[-_\s]?sample|illustration[-_\s]?sample|asset[-_\s]?preview|图示样例|图示示例|示意图样例|组件预览|插件预览|素材预览|素材样例|示例图示|图形示例|样例图|示例图)/i.test(value)
    && /(?:card|grid|gallery|showcase|list|panel|tile|卡片|宫格|矩阵|展示|合集|清单|面板)/i.test(value);
}

function buildReconstructionPlan({ layerType, detector, item, page, areaRatio, nativeConfidence, editBenefit, recommendedAction, chartProfile, diagramUnderstanding, standaloneVisualAsset }) {
  if (recommendedAction === "preserve-local-crop") {
    const plan = {
      status: "deferred",
      reason: standaloneVisualAsset
        ? "standalone icon, illustration, screenshot, or visual-example asset is preserved as a movable crop"
        : "native reconstruction confidence is below the safe threshold"
    };
    if (chartProfile) plan.chartProfile = chartProfile;
    if (diagramUnderstanding) plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
    return plan;
  }
  const plan = {
    status: "candidate",
    targetLayerType: layerType,
    detector: detector || "unknown",
    confidence: nativeConfidence,
    editBenefit,
    areaRatio: round(areaRatio),
    strategy: recommendedAction,
    residualCrop: recommendedAction === "split-native-with-residual-crop",
    primitives: []
  };
  if (diagramUnderstanding?.archetype === "screenshot-annotation" || diagramUnderstanding?.archetype === "screenshot-zoom-callout" || diagramUnderstanding?.archetype === "screenshot-card-grid" || diagramUnderstanding?.archetype === "visual-example-card-grid") {
    plan.primitives = diagramPrimitivePlan(detector, page, diagramUnderstanding);
    plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
  } else if (layerType === LAYER_TYPES.TABLE) {
    plan.primitives = ["table-grid", "cell-text", "header-fill", "residual-icons"];
    if (diagramUnderstanding) plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
  } else if (layerType === LAYER_TYPES.CHART) {
    plan.primitives = ["chart-area", "axis-lines", "series-marks", "labels", "residual-legend-icons"];
    if (chartProfile) plan.chartProfile = chartProfile;
    if (diagramUnderstanding) plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
  } else if (layerType === LAYER_TYPES.DIAGRAM) {
    plan.primitives = diagramPrimitivePlan(detector, page, diagramUnderstanding);
    if (diagramUnderstanding) plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
  } else {
    plan.primitives = ["native-shapes", "native-text", "residual-crop"];
    if (diagramUnderstanding) plan.diagramUnderstanding = compactDiagramUnderstanding(diagramUnderstanding);
  }
  if (item?.box) plan.regionBox = item.box;
  return plan;
}

function diagramPrimitivePlan(detector, page = {}, diagramUnderstanding = null) {
  const lowerDetector = String(detector || "").toLowerCase();
  const primitives = ["container-shapes", "node-text", "residual-icons"];
  const archetype = String(diagramUnderstanding?.archetype || "");
  if (/line|flow|chain|wms|collaboration/.test(lowerDetector)) primitives.push("native-connectors", "arrowheads");
  if (/flow-card-chain|process-with-screenshots|screenshot-annotation|screenshot-zoom-callout|hub-spoke|tree-structure|swimlane-flow|topology-diagram/.test(archetype)) primitives.push("native-connectors", "arrowheads");
  if (archetype === "screenshot-annotation") primitives.push("base-screenshot-crop", "editable-callouts", "highlight-boxes");
  if (archetype === "screenshot-zoom-callout") primitives.push("base-screenshot-crop", "zoom-detail-crop", "source-highlight", "editable-zoom-connectors");
  if (archetype === "screenshot-card-grid") primitives.push("native-card-containers", "editable-card-text", "minimum-unit-screenshot-crops");
  if (archetype === "visual-example-card-grid") primitives.push("native-card-containers", "editable-card-text", "minimum-unit-visual-example-crops");
  if (archetype === "feature-icon-card-grid") primitives.push("native-card-containers", "editable-card-text", "minimum-unit-icon-crops");
  if (archetype === "numbered-step-card-grid") primitives.push("native-card-containers", "editable-step-badges", "editable-step-text");
  if (archetype === "matrix-or-grid") primitives.push("grid-lines", "group-labels");
  if (diagramUnderstanding?.residualCount > 0) primitives.push("residual-crops");
  if (/comparison|matrix/.test(lowerDetector)) primitives.push("grid-lines", "group-labels");
  if (/structured|mixed|cluster|foreground|sparse/.test(lowerDetector)) primitives.push("cluster-bounds", "connector-candidates");
  if ((page.textBoxes || []).length >= 8) primitives.push("external-labels");
  return [...new Set(primitives)];
}

function compactDiagramUnderstanding(diagramUnderstanding = {}) {
  return {
    provider: diagramUnderstanding.provider,
    archetype: diagramUnderstanding.archetype,
    expressionFamily: diagramUnderstanding.expressionFamily,
    confidence: diagramUnderstanding.confidence,
    nativeReadiness: diagramUnderstanding.nativeReadiness,
    ...(diagramUnderstanding.componentStrategy ? { componentStrategy: diagramUnderstanding.componentStrategy } : {}),
    nodeCount: diagramUnderstanding.nodeCount,
    connectorCount: diagramUnderstanding.connectorCount,
    residualCount: diagramUnderstanding.residualCount,
    ...(Array.isArray(diagramUnderstanding.targetMotifs) && diagramUnderstanding.targetMotifs.length
      ? { targetMotifs: diagramUnderstanding.targetMotifs.slice(0, 8) }
      : {}),
    ...(typeof diagramUnderstanding.visualAtomCount === "number" ? { visualAtomCount: diagramUnderstanding.visualAtomCount } : {}),
    ...(diagramUnderstanding.visualAtomKindCounts ? { visualAtomKindCounts: diagramUnderstanding.visualAtomKindCounts } : {}),
    ...(typeof diagramUnderstanding.visualNodeCount === "number" ? { visualNodeCount: diagramUnderstanding.visualNodeCount } : {}),
    ...(typeof diagramUnderstanding.visualConnectorCount === "number" ? { visualConnectorCount: diagramUnderstanding.visualConnectorCount } : {}),
    ...(diagramUnderstanding.visualGrid ? { visualGrid: compactVisualGrid(diagramUnderstanding.visualGrid) } : {}),
    ...(diagramUnderstanding.structureSignature ? { structureSignature: compactStructureSignature(diagramUnderstanding.structureSignature) } : {})
  };
}

function compactStructureSignature(signature = {}) {
  return {
    provider: signature.provider,
    expressionFamily: signature.expressionFamily,
    layout: signature.layout,
    direction: signature.direction,
    stepCount: signature.stepCount,
    rows: signature.rows,
    columns: signature.columns,
    laneCount: signature.laneCount,
    connectorCount: signature.connectorCount,
    regularSpacing: signature.regularSpacing,
    wholeGroupTemplatePriority: signature.wholeGroupTemplatePriority,
    evidence: Array.isArray(signature.evidence) ? signature.evidence.slice(0, 8) : undefined
  };
}

function compactVisualGrid(visualGrid = {}) {
  const xLines = compactGridLines(visualGrid.xLines);
  const yLines = compactGridLines(visualGrid.yLines);
  const expectedCells = Math.max(0, xLines.length - 1) * Math.max(0, yLines.length - 1);
  const cells = Array.isArray(visualGrid.cells) && expectedCells > 0 && expectedCells <= 256
    ? visualGrid.cells.slice(0, expectedCells).map(compactGridCell).filter(Boolean)
    : [];
  return {
    provider: visualGrid.provider,
    rows: visualGrid.rows,
    columns: visualGrid.columns,
    lineCount: visualGrid.lineCount,
    coverageRatio: visualGrid.coverageRatio,
    ...(xLines.length >= 2 ? { xLines } : {}),
    ...(yLines.length >= 2 ? { yLines } : {}),
    ...(validCompactBox(visualGrid.bounds) ? { bounds: compactBox(visualGrid.bounds) } : {}),
    ...(/^#[0-9a-f]{6}$/i.test(String(visualGrid.stroke || "")) ? { stroke: String(visualGrid.stroke).toUpperCase() } : {}),
    ...(cells.length === expectedCells ? { cells } : {})
  };
}

function compactGridLines(values) {
  if (!Array.isArray(values) || values.length < 2 || values.length > 32) return [];
  const lines = values.map(Number);
  if (lines.some((value) => !Number.isFinite(value) || value < 0 || value > 100000)) return [];
  return lines.every((value, index) => index === 0 || value > lines[index - 1])
    ? lines.map((value) => Math.round(value * 10000) / 10000)
    : [];
}

function compactGridCell(cell) {
  if (!cell || !Number.isInteger(cell.row) || !Number.isInteger(cell.column) || !validCompactBox(cell.box)) return null;
  const fill = /^#[0-9a-f]{6}$/i.test(String(cell.fill || "")) ? String(cell.fill).toUpperCase() : "#FFFFFF";
  return { row: cell.row, column: cell.column, box: compactBox(cell.box), fill };
}

function validCompactBox(box) {
  const values = [box?.x, box?.y, box?.w, box?.h].map(Number);
  return values.every(Number.isFinite) && values[0] >= 0 && values[1] >= 0 && values[2] > 0 && values[3] > 0
    && values.every((value) => value <= 100000);
}

function compactBox(box) {
  return Object.fromEntries(["x", "y", "w", "h"].map((key) => [key, Math.round(Number(box[key]) * 10000) / 10000]));
}

function explainLayer({ layerType, detector, source, nativeConfidence, editBenefit, areaRatio, chartProfile, diagramUnderstanding, standaloneVisualAsset }) {
  if (standaloneVisualAsset) {
    return "standalone icon, illustration, screenshot, or visual-example assets are kept as precise movable crops instead of being over-split into native fragments";
  }
  if (shouldPreserveByExpressionRecommendation(source)) {
    return "expression classifier recommends preserving this visual until a confident native subtype rebuilder is available";
  }
  if (diagramUnderstanding?.archetype === "screenshot-annotation") {
    return "annotated screenshot recognized; preserve the screenshot base as a crop and rebuild arrows, callouts, highlight boxes, and labels as editable overlays";
  }
  if (diagramUnderstanding?.archetype === "screenshot-zoom-callout") {
    return "screenshot zoom callout recognized; preserve the screenshot and magnified detail as crops while rebuilding source highlight, connector lines, and labels as editable overlays";
  }
  if (diagramUnderstanding?.archetype === "screenshot-card-grid") {
    return "screenshot card grid recognized; rebuild card containers and captions as editable objects while preserving embedded UI/product screenshots as minimum-unit crops";
  }
  if (diagramUnderstanding?.archetype === "visual-example-card-grid") {
    return "visual example card grid recognized; rebuild card containers and explanatory text as editable objects while preserving pictorial/plugin previews as minimum-unit crops";
  }
  if (diagramUnderstanding?.archetype === "feature-icon-card-grid") {
    return "feature icon card grid recognized; rebuild card containers and text as editable objects while preserving pictorial icons as minimum-unit crops unless a matching plugin/vector component is available";
  }
  if (diagramUnderstanding?.archetype === "numbered-step-card-grid") {
    return "numbered step card grid recognized; rebuild badges, card containers, and explanatory text as editable reusable step-card components";
  }
  if (layerType === LAYER_TYPES.DIAGRAM && diagramUnderstanding?.nativeReadiness === "hybrid-native-plus-residual-crops") {
    return `diagram understanding recognized ${diagramUnderstanding.archetype}; rebuild native structure and keep unsafe details as residual crops`;
  }
  if (layerType === LAYER_TYPES.DIAGRAM && diagramUnderstanding?.nativeReadiness === "native-rebuild") {
    return `diagram understanding recognized ${diagramUnderstanding.archetype}; native reconstruction is structurally plausible`;
  }
  if (layerType === LAYER_TYPES.ILLUSTRATION && isStructuredIllustrationCandidate(diagramUnderstanding, areaRatio)) {
    return "structured illustration has card/node visual atoms; rebuild stable containers natively and preserve unsafe details as residual crops";
  }
  if (layerType === LAYER_TYPES.DIAGRAM && /wms-chain/.test(String(detector || "").toLowerCase())) {
    return "complex route diagrams are preserved as local crops unless topology reconstruction is reliable";
  }
  if (layerType === LAYER_TYPES.DIAGRAM && /collaboration-flow/.test(String(detector || "").toLowerCase())) {
    return "complex collaboration flow diagrams are preserved as local crops unless card topology is reliable";
  }
  if (layerType === LAYER_TYPES.SCREENSHOT) return "screenshot-like regions are usually more faithful as local crops";
  if (layerType === LAYER_TYPES.BACKGROUND) return "decorative background layer should remain behind editable text";
  if (layerType === LAYER_TYPES.DECORATIVE) return "decorative/brand imagery is preserved unless a native vector match is confident";
  if (layerType === LAYER_TYPES.VALUE_BANNER) return "value banners are preserved as local background strips behind editable text";
  if (layerType === LAYER_TYPES.ILLUSTRATION) return "illustration/icon clusters are preserved unless a library match is confident";
  if (layerType === LAYER_TYPES.CHART && chartProfile?.reconstructionReadiness === "data-chart-candidate") {
    return "chart has axis/series evidence and can be considered for native data-chart reconstruction";
  }
  if (layerType === LAYER_TYPES.CHART) return "chart-like evidence is preserved unless data series reconstruction is reliable";
  if (nativeConfidence >= 0.6) return "structured visual layer is a candidate for native reconstruction";
  if (areaRatio >= 0.28 && editBenefit >= 0.45) return "large visual layer should be split into native objects plus residual crop";
  return "insufficient confidence for native reconstruction";
}

function isUnexplainedLargeLayer(layer = {}) {
  const action = layer.recommendedAction;
  return Number(layer.areaRatio || 0) >= 0.28
    && (action === "attempt-native-reconstruction" || action === "split-native-with-residual-crop");
}

function areaRatioForBox(box = {}, slideSize = DEFAULT_SLIDE) {
  const slideArea = Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return Math.max(0, Number(box.w || 0) * Number(box.h || 0)) / slideArea;
}

function addCounts(target, counts = {}) {
  for (const [key, value] of Object.entries(counts || {})) addCount(target, key, Number(value || 0));
}

function addCount(target, key, value) {
  const safeKey = String(key || "unknown");
  target[safeKey] = (target[safeKey] || 0) + value;
}

function roundCounts(counts = {}) {
  return Object.fromEntries(Object.entries(counts).map(([key, value]) => [key, round(value)]));
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  LAYER_TYPES,
  annotateLayerSource,
  areaRatioForBox,
  classifyVisualLayer,
  buildReconstructionPlan,
  summarizeLayerProfile,
  summarizePageLayers
};
