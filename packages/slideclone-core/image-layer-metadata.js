"use strict";
const { round } = require("./raster-native-detection");
const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function applyMinimumUnitCropRenderStrategy(source = {}) {
  const previous = source.componentRenderStrategy || {};
  source.componentRenderStrategy = {
    ...previous,
    mode: "preserve-local-crop",
    implementationMode: "native-generator-safe-fallback",
    editableExpectation: previous.editableExpectation || "standalone-visual-asset-preserved-as-movable-crop",
    visualFidelityBias: previous.visualFidelityBias || "fidelity-first",
    reason: source.minimumUnitReason
      || previous.reason
      || "intentional minimum visual unit is preserved as a local crop instead of being replaced by a mismatched component template"
  };
  return source;
}

function classifyObviousMinimumVisualAssetCrop(image = {}) {
  const source = image?.source || {};
  if (source.specializedNativeHybridResidual === true) return null;
  if (source.editable === true) return null;
  const layer = source.layer || {};
  const text = [
    image.id,
    image.type,
    image.layerType,
    image.expressionForm,
    image.expressionSubtype,
    image.recommendedAction,
    image.detector,
    source.detector,
    source.reason,
    source.nonEditableReason,
    source.expressionForm,
    source.expressionSubtype,
    source.recommendedAction,
    source.expressionRecommendation,
    source.expressionHandling,
    source.visualAtomKind,
    source.minimumUnitReason,
    layer.layerType,
    layer.expressionForm,
    layer.expressionSubtype,
    layer.recommendedAction,
    layer.explanation,
    layer.reconstructionPlan?.reason
  ].filter(Boolean).join(" ").toLowerCase();
  const structuralDataTerms = /(?:data-chart|chart-zone|chart-snapshot|axis|series|plot|table-or-matrix|table-zone|table-grid|matrix|grid|quadrant|数据|坐标轴|序列|图表|表格|矩阵|网格)/i;
  const visualAssetTerms = /(?:standalone-visual-asset|visual-example|plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|pictorial-asset|icon-crop-candidate|icon-residual-crop|complex-shape-crop-candidate|mockup|demo|sample|example|screenshot-demo|screen-demo|pictogram|clipart|sticker|ornament|badge|素材|图形素材|素材图示|图标图示|装饰图示|示意图|图示样例|示例|样例|示意插图|插画|图标|图示)/i;
  const screenshotTerms = /(?:screenshot|screen|ui-capture|product-screenshot|webpage|prototype|mockup|截图|界面示意|截图示意)/i;
  const explicitProtectedAsset = source.intentionalMinimumUnitCrop === true
    || source.protectedMinimumUnit === true
    || source.standaloneVisualAsset === true
    || layer.standaloneVisualAsset === true;
  const structuredIllustrationSplit = source.structuredIllustrationShellObjectified === true
    || (/structured-illustration-card|illustration-card-graphic-underlay/.test(text)
      && /split-native-with-residual-crop|native-visual-atom-rebuild/.test(text));
  if (structuredIllustrationSplit && !explicitProtectedAsset) return null;
  const policy = classifyGraphicExpressionPolicy({
    source,
    layer,
    detector: source.detector || image.detector,
    layerType: source.layerType || layer.layerType || image.layerType,
    expressionForm: source.expressionForm || image.expressionForm,
    expressionSubtype: source.expressionSubtype || image.expressionSubtype,
    recommendedAction: source.recommendedAction || image.recommendedAction,
    reason: source.reason || source.nonEditableReason
  });
  const policyProtectsStandaloneAsset = policy.protectCrop === true
    && /standalone-visual-asset|fidelity-crop|decorative-texture/.test(String(policy.kind || ""));
  // "图示" is often used for both decorative assets and real relationship diagrams.
  // Prefer native reconstruction when the upstream analysis has identified a
  // connected node structure; only an explicit protected asset may override it.
  if (!explicitProtectedAsset && hasStructuredNativeDiagramEvidence(source, layer)) return null;
  if (structuralDataTerms.test(text) && !visualAssetTerms.test(text) && !explicitProtectedAsset) return null;
  if (!explicitProtectedAsset && !visualAssetTerms.test(text) && !policyProtectsStandaloneAsset) return null;
  if (policy.allowNativeRebuild === true && !explicitProtectedAsset && !visualAssetTerms.test(text)) return null;
  if (explicitProtectedAsset && String(source.expressionForm || image.expressionForm || "").toLowerCase() === "complex-diagram") {
    return {
      form: "complex-diagram",
      subtype: source.expressionSubtype || image.expressionSubtype || "dense-complete-diagram",
      layerType: source.layerType || image.layerType || "diagram-zone",
      recommendedAction: source.recommendedAction || image.recommendedAction || "keep-local-crop",
      policy,
      reason: source.minimumUnitReason || source.nonEditableReason
        || "complete dense diagram is preserved as one semantic visual unit because reliable internal reconstruction evidence is unavailable"
    };
  }
  const form = screenshotTerms.test(text) ? "screenshot-or-document" : "icon-or-illustration";
  const subtype = form === "screenshot-or-document"
    ? "screenshot-or-document-region"
    : (/icon|图标|pictogram|badge/.test(text) ? "icon" : "illustration");
  return {
    form,
    subtype,
    layerType: form === "screenshot-or-document" ? "screenshot-zone" : "illustration-zone",
    recommendedAction: form === "screenshot-or-document"
      ? "keep-local-crop-and-overlay-external-text-only"
      : "match-icon-library-or-keep-local-crop",
    policy,
    reason: form === "screenshot-or-document"
      ? "obvious screenshot/demo visual asset is preserved as a local crop unless a confident semantic overlay strategy exists"
      : "obvious icon/illustration/diagram-example is a minimum visual unit; preserve crop instead of forcing native fragments"
  };
}

function hasStructuredNativeDiagramEvidence(source = {}, layer = {}) {
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const layerType = String(layer.layerType || source.layerType || "").toLowerCase();
  const archetype = String(understanding.archetype || "").toLowerCase();
  const nodeCount = Number(understanding.visualNodeCount || understanding.nodeCount || 0);
  const connectorCount = Number(understanding.connectorCount || 0);
  const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
  const nativeAtoms = atoms.filter((atom) => atom?.nativeCandidate === true).length;
  const connectorAtoms = atoms.filter((atom) => /connector|arrow|link|line/.test(String(atom?.kind || ""))).length;
  if (/screenshot|document|screen-capture/.test(layerType)) return false;
  if (!/diagram|table/.test(layerType)) return false;
  if (nodeCount >= 3 && (connectorCount >= 2 || connectorAtoms >= 2)) return true;
  return nativeAtoms >= 4
    && connectorAtoms >= 2
    && /node|hub|spoke|relationship|network|flow|process|topology|diagram/.test(archetype);
}

function promoteMinimumVisualAssetCropMetadata(image = {}, classification = null) {
  const policy = classification || classifyObviousMinimumVisualAssetCrop(image);
  if (!policy) return image;
  const authoritativeExpressionPolicy = {
    kind: policy.form === "screenshot-or-document" || policy.form === "complex-diagram"
      ? "fidelity-crop"
      : "standalone-visual-asset",
    minimumUnitPolicy: "preserve-as-single-crop",
    unitDisposition: "intentional-visual-crop",
    allowNativeRebuild: false,
    protectCrop: true,
    allowPluginTemplate: false,
    reasons: policy.policy?.protectCrop === true && Array.isArray(policy.policy.reasons)
      ? policy.policy.reasons
      : [policy.form === "screenshot-or-document"
        ? "authoritative-screenshot-minimum-unit"
        : policy.form === "complex-diagram"
          ? "authoritative-complete-diagram-minimum-unit"
          : "authoritative-pictorial-minimum-unit"]
  };
  const source = {
    ...(image.source || {}),
    expressionForm: policy.form,
    expressionSubtype: policy.subtype,
    layerType: policy.layerType,
    recommendedAction: policy.recommendedAction,
    intentionalMinimumUnitCrop: true,
    protectedMinimumUnit: true,
    minimumUnitPolicy: "preserve-obvious-visual-asset-crop",
    minimumUnitReason: policy.reason,
    graphicExpressionPolicy: {
      kind: authoritativeExpressionPolicy.kind,
      minimumUnitPolicy: authoritativeExpressionPolicy.minimumUnitPolicy,
      reasons: authoritativeExpressionPolicy.reasons
    }
  };
  applyMinimumUnitCropRenderStrategy(source);
  source.componentRenderStrategy = {
    ...(source.componentRenderStrategy || {}),
    expressionPolicy: authoritativeExpressionPolicy
  };
  if (source.layer && typeof source.layer === "object") {
    source.layer = {
      ...source.layer,
      layerType: policy.layerType,
      expressionForm: policy.form,
      expressionSubtype: policy.subtype,
      recommendedAction: policy.recommendedAction,
      standaloneVisualAsset: true,
      componentRenderStrategy: {
        ...(source.layer.componentRenderStrategy || {}),
        ...source.componentRenderStrategy
      }
    };
  }
  return {
    ...image,
    layerType: policy.layerType,
    detector: image.detector || source.detector,
    expressionForm: policy.form,
    expressionSubtype: policy.subtype,
    recommendedAction: policy.recommendedAction,
    source
  };
}

function normalizeImageLayerMetadata(image) {
  if (!image || typeof image !== "object") return image;
  if (image.source?.wmsRouteChainWholeFidelityCrop === true) {
    const source = {
      ...(image.source || {}),
      expressionForm: "complex-diagram",
      expressionSubtype: "wms-route-chain-illustration",
      layerType: "diagram-zone",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true
    };
    if (source.layer && typeof source.layer === "object") {
      source.layer = {
        ...source.layer,
        expressionForm: "complex-diagram",
        expressionSubtype: source.expressionSubtype,
        layerType: "diagram-zone",
        recommendedAction: source.recommendedAction
      };
    }
    return {
      ...image,
      layerType: "diagram-zone",
      expressionForm: source.expressionForm,
      expressionSubtype: source.expressionSubtype,
      recommendedAction: source.recommendedAction,
      source
    };
  }
  if (image.source?.specializedNativeHybridResidual === true) {
    const source = {
      ...(image.source || {}),
      expressionForm: "complex-diagram",
      expressionSubtype: String(image.source?.specializedNativeHybridResidualKind || "specialized-structural-hybrid-residual"),
      layerType: "diagram-zone",
      recommendedAction: image.source?.recommendedAction || "keep-local-crop-as-visual-fidelity-residual-over-specialized-native-structure",
      protectedMinimumUnit: true
    };
    if (source.layer && typeof source.layer === "object") {
      source.layer = {
        ...source.layer,
        layerType: "diagram-zone",
        expressionForm: "complex-diagram",
        expressionSubtype: source.expressionSubtype,
        recommendedAction: source.recommendedAction
      };
    }
    return {
      ...image,
      layerType: "diagram-zone",
      expressionForm: "complex-diagram",
      expressionSubtype: source.expressionSubtype,
      recommendedAction: source.recommendedAction,
      source
    };
  }
  if (hasAuthoritativeSourceExpressionMetadata(image)) {
    return applyAuthoritativeSourceExpressionMetadata(image);
  }
  if (shouldKeepSmallStandaloneIllustrationCrop(image)) {
    return image;
  }
  if (shouldPromoteStructuredIllustrationCardSplit(image)) {
    return promoteStructuredIllustrationCardSplitMetadata(image);
  }
  if (shouldClassifyWmsTopRouteIllustrationCrop(image)) {
    const source = {
      ...(image.source || {}),
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      layerType: "illustration-zone",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      intentionalMinimumUnitCrop: true,
      minimumUnitReason: "WMS top route contains complex illustration primitives with editable text overlays"
    };
    applyMinimumUnitCropRenderStrategy(source);
    if (source.layer && typeof source.layer === "object") {
      source.layer = {
        ...source.layer,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "illustration",
        layerType: "illustration-zone",
        recommendedAction: "match-icon-library-or-keep-local-crop"
      };
    }
    return {
      ...image,
      layerType: "illustration-zone",
      detector: image.detector || source.detector,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      source
    };
  }
  if (shouldClassifyTwoPanelIconChainResidual(image)) {
    const source = {
      ...(image.source || {}),
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      layerType: "illustration-zone",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      intentionalMinimumUnitCrop: true,
      minimumUnitReason: "two-panel residual contains icon/illustration chain better preserved as a local visual unit"
    };
    applyMinimumUnitCropRenderStrategy(source);
    if (source.layer && typeof source.layer === "object") {
      source.layer = {
        ...source.layer,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "illustration",
        layerType: "illustration-zone",
        recommendedAction: "match-icon-library-or-keep-local-crop"
      };
    }
    return {
      ...image,
      layerType: "illustration-zone",
      detector: image.detector || source.detector,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      source
    };
  }
  if (shouldClassifyResidualMinimumUnitCrop(image)) {
    const source = {
      ...(image.source || {}),
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      layerType: "illustration-zone",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      intentionalMinimumUnitCrop: true,
      minimumUnitReason: "small residual is an already isolated icon/illustration unit, so preserving the local crop is safer than forcing a mismatched native table/diagram rebuild"
    };
    applyMinimumUnitCropRenderStrategy(source);
    if (source.layer && typeof source.layer === "object") {
      source.layer = {
        ...source.layer,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "illustration",
        layerType: "illustration-zone",
        recommendedAction: "match-icon-library-or-keep-local-crop",
        componentRenderStrategy: {
          ...(source.layer.componentRenderStrategy || {}),
          ...source.componentRenderStrategy
        }
      };
    }
    return {
      ...image,
      layerType: "illustration-zone",
      detector: image.detector || source.detector,
      expressionForm: "icon-or-illustration",
      expressionSubtype: "illustration",
      recommendedAction: "match-icon-library-or-keep-local-crop",
      source
    };
  }
  const obviousMinimumVisualAsset = classifyObviousMinimumVisualAssetCrop(image);
  if (obviousMinimumVisualAsset) {
    return promoteMinimumVisualAssetCropMetadata(image, obviousMinimumVisualAsset);
  }
  const source = image.source || {};
  if (source.intentionalMinimumUnitCrop === true) {
    const nextSource = { ...source };
    applyMinimumUnitCropRenderStrategy(nextSource);
    return { ...image, source: nextSource };
  }
  const layer = source.layer || {};
  const layerType = source.layerType || layer.layerType || image.layerType || "";
  const detector = source.detector || layer.detector || image.detector || "";
  const expressionForm = source.expressionForm || layer.expressionForm || image.expressionForm || "";
  const expressionSubtype = source.expressionSubtype || layer.expressionSubtype || image.expressionSubtype || "";
  const recommendedAction = source.recommendedAction || layer.recommendedAction || image.recommendedAction || "";
  return {
    ...image,
    ...(layerType ? { layerType } : {}),
    ...(detector ? { detector } : {}),
    ...(expressionForm ? { expressionForm } : {}),
    ...(expressionSubtype ? { expressionSubtype } : {}),
    ...(recommendedAction ? { recommendedAction } : {})
  };
}

function hasAuthoritativeSourceExpressionMetadata(image = {}) {
  const source = image.source || {};
  const isExplicitAuthoritativeMinimumUnit = source.authoritativeExpressionMetadata === true
    && source.intentionalMinimumUnitCrop === true
    && source.protectedMinimumUnit === true
    && ["complex-diagram", "screenshot-or-document", "icon-or-illustration", "data-chart", "table-or-matrix"]
      .includes(String(source.expressionForm || "").toLowerCase());
  const isProtectedIllustration = source.intentionalMinimumUnitCrop === true
    && source.protectedMinimumUnit === true
    && String(source.expressionForm || "").toLowerCase() === "icon-or-illustration";
  const isSemanticCycleValueBanner = source.detector === "saturated-diagram-bottom-banner-crop"
    && String(source.expressionForm || "").toLowerCase() === "value-banner";
  const isProtectedClosedLoopDiagram = source.detector === "asset-os-closed-loop-fidelity-crop"
    && source.sourceFaithfulCrop === true
    && String(source.expressionForm || "").toLowerCase() === "complex-diagram";
  const isProtectedSemanticCycle = source.detector === "semantic-cycle-interlocking-minimum-unit-crop"
    && source.intentionalMinimumUnitCrop === true
    && source.protectedMinimumUnit === true
    && String(source.expressionForm || "").toLowerCase() === "complex-diagram";
  return Boolean(
    (isExplicitAuthoritativeMinimumUnit || String(source.expressionForm || "").toLowerCase() === "screenshot-or-document" || isProtectedIllustration || isSemanticCycleValueBanner || isProtectedClosedLoopDiagram || isProtectedSemanticCycle)
    && source.expressionSubtype
    && source.recommendedAction
  );
}

function applyAuthoritativeSourceExpressionMetadata(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const isScreenshot = String(source.expressionForm || "").toLowerCase() === "screenshot-or-document";
  const isComplexDiagram = String(source.expressionForm || "").toLowerCase() === "complex-diagram";
  return {
    ...image,
    layerType: source.layerType || (isScreenshot ? "screenshot-zone" : isComplexDiagram ? "diagram-zone" : layer.layerType || image.layerType),
    detector: source.detector || image.detector,
    expressionForm: source.expressionForm,
    expressionSubtype: source.expressionSubtype,
    recommendedAction: source.recommendedAction
  };
}

function shouldKeepSmallStandaloneIllustrationCrop(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const box = image.box || {};
  const detector = String(source.detector || layer.detector || image.detector || "").toLowerCase();
  const action = String(source.recommendedAction || layer.recommendedAction || image.recommendedAction || "").toLowerCase();
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  if (detector !== "illustration-card-graphic-underlay-crop") return false;
  if (action !== "preserve-local-crop" || !/multi-card|illustration-card/.test(reason)) return false;
  return Number(box.w || 0) < DEFAULT_SLIDE.widthPt * 0.58
    || Number(box.h || 0) < DEFAULT_SLIDE.heightPt * 0.48;
}

function shouldPromoteStructuredIllustrationCardSplit(image = {}) {
  const source = image.source || {};
  const box = image.box || {};
  if (String(source.detector || source.layer?.detector || image.detector || "").toLowerCase() !== "illustration-card-graphic-underlay-crop") return false;
  if (Number(box.w || 0) < Number(box.h || 0) * 1.6) return false;
  if (Number(box.w || 0) < DEFAULT_SLIDE.widthPt * 0.58 || Number(box.h || 0) < DEFAULT_SLIDE.heightPt * 0.48) return false;
  const layerType = String(source.layer?.layerType || source.layerType || image.layerType || "").toLowerCase();
  if (layerType && layerType !== "illustration-zone") return false;
  const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
  return /multi-card|illustration-card/.test(reason);
}

function promoteStructuredIllustrationCardSplitMetadata(image = {}) {
  const box = image.box || {};
  const existingUnderstanding = image.source?.layer?.diagramUnderstanding || {};
  const existingAtoms = Array.isArray(existingUnderstanding.visualAtoms) ? existingUnderstanding.visualAtoms : [];
  const source = {
    ...(image.source || {}),
    expressionForm: "icon-or-illustration",
    expressionSubtype: "illustration",
    layerType: "illustration-zone",
    recommendedAction: "match-icon-library-or-keep-local-crop",
    structuredIllustrationCardSplitEligible: true,
    minimumUnitPolicy: "split-card-illustration-crops",
    minimumUnitReason: "multi-card illustration is split into card illustration crops while keeping complex icons as fidelity units"
  };
  source.layer = {
    ...(source.layer || {}),
    layerType: "illustration-zone",
    detector: source.detector || "illustration-card-graphic-underlay-crop",
    recommendedAction: "split-native-with-residual-crop",
    diagramUnderstanding: {
      ...existingUnderstanding,
      provider: existingUnderstanding.provider || "structured-illustration-card-split-v1",
      archetype: "process-with-screenshots",
      expressionFamily: existingUnderstanding.expressionFamily || "icon-or-illustration",
      confidence: Math.max(0.88, Number(existingUnderstanding.confidence || 0)),
      nativeReadiness: "split-card-illustration-crops",
      visualAtomCount: Math.max(2, Number(existingUnderstanding.visualAtomCount || existingAtoms.length || 0)),
      visualAtomKindCounts: {
        ...(existingUnderstanding.visualAtomKindCounts || {}),
        "grid-line-candidate": Math.max(2, Number(existingUnderstanding.visualAtomKindCounts?.["grid-line-candidate"] || 0))
      },
      visualAtoms: [
        structuredIllustrationSyntheticSeparatorAtom(image, 1, 1 / 3),
        structuredIllustrationSyntheticSeparatorAtom(image, 2, 2 / 3),
        ...existingAtoms
      ],
      evidence: {
        ...(existingUnderstanding.evidence || {}),
        syntheticSeparators: true,
        regionBox: box
      }
    }
  };
  return {
    ...image,
    layerType: "illustration-zone",
    detector: image.detector || source.detector,
    expressionForm: "icon-or-illustration",
    expressionSubtype: "illustration",
    recommendedAction: "match-icon-library-or-keep-local-crop",
    source
  };
}

function structuredIllustrationSyntheticSeparatorAtom(image = {}, index = 1, ratio = 0.5) {
  const box = image.box || {};
  const x = round(Number(box.x || 0) + Number(box.w || 0) * ratio - 1.8);
  return {
    id: `synthetic-structured-card-separator-${index}`,
    kind: "grid-line-candidate",
    axis: "v",
    box: {
      x,
      y: round(Number(box.y || 0)),
      w: 3.6,
      h: round(Number(box.h || 0))
    },
    nativeCandidate: true,
    residualCandidate: false,
    synthetic: true
  };
}

function shouldClassifyTwoPanelIconChainResidual(image = {}) {
  const source = image.source || {};
  const detector = String(source.detector || source.layer?.detector || image.detector || "").toLowerCase();
  if (detector !== "split-erased-residual-crop") return false;
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || image.expressionSubtype || "").toLowerCase();
  if (expressionSubtype !== "two-panel-diagram") return false;
  const box = image.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  if (!Number.isFinite(area) || area < 12000) return false;
  const atoms = Array.isArray(source.layer?.visualAtoms) ? source.layer.visualAtoms : [];
  return atoms.some((atom) => /icon-crop-candidate|complex-shape-crop-candidate/.test(String(atom?.kind || "")));
}

function shouldClassifyResidualMinimumUnitCrop(image = {}) {
  const source = image.source || {};
  const detector = String(source.detector || source.layer?.detector || image.detector || "").toLowerCase();
  if (!/^(?:icon-residual-crop|visual-atom-residual-crop|split-focused-foreground-residual-crop)$/.test(detector)) return false;
  if (source.tableMatrixResidualObjectified === true || source.dropErasedResidualAfterNativeRebuild === true) return false;
  const box = image.box || {};
  const area = Number(box.w || 0) * Number(box.h || 0);
  if (!Number.isFinite(area) || area <= 0 || area > 12000) return false;
  const layerType = String(source.layerType || source.layer?.layerType || image.layerType || "").toLowerCase();
  const reasonText = [
    source.reason,
    source.nonEditableReason,
    source.minimumUnitReason,
    source.layer?.reason,
    source.layer?.nonEditableReason
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  const markedIllustrationUnit = layerType === "illustration-zone"
    || /small icon preserved|local fidelity crop|minimum visual unit|icon\/illustration|图标|图示|插画/.test(reasonText);
  if (!markedIllustrationUnit) return false;
  const expressionText = [
    source.expressionForm,
    source.expressionSubtype,
    source.layer?.expressionForm,
    source.layer?.expressionSubtype,
    image.expressionForm,
    image.expressionSubtype
  ].map((value) => String(value || "").toLowerCase()).join(" ");
  if (/screenshot|document|ui|prototype|photo/.test(expressionText)) return false;
  return true;
}

function shouldClassifyWmsTopRouteIllustrationCrop(image = {}) {
  const source = image.source || {};
  const detector = String(source.detector || source.layer?.detector || image.detector || "").toLowerCase();
  if (detector !== "wms-chain-underlay-crop") return false;
  const box = image.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const y = Number(box.y || 0);
  if (width < 850 || height < 190 || height > 260 || y > 180) return false;
  const expressionSubtype = String(source.expressionSubtype || source.layer?.expressionSubtype || image.expressionSubtype || "").toLowerCase();
  return expressionSubtype === "route-chain-diagram"
    || source.wmsRouteChainTopIllustrationPreserved === true
    || /wms-route-chain-illustration/.test(expressionSubtype);
}

function markProtectedComplexDiagramMinimumUnit(images = [], { detector, expressionSubtype, reason } = {}) {
  for (const image of images || []) {
    const source = {
      ...(image.source || {}),
      detector: detector || image.source?.detector || "protected-complex-diagram-crop",
      expressionForm: "complex-diagram",
      expressionSubtype: expressionSubtype || "protected-complex-diagram",
      recommendedAction: "preserve-local-crop",
      skipVisualAtomRebuild: true,
      protectedMinimumUnit: true,
      nonEditableReason: reason || "complex diagram/icon composition preserved as a protected visual unit"
    };
    image.source = applyMinimumUnitCropRenderStrategy(source);
  }
}

module.exports = { markProtectedComplexDiagramMinimumUnit,  normalizeImageLayerMetadata, hasAuthoritativeSourceExpressionMetadata, applyAuthoritativeSourceExpressionMetadata, shouldKeepSmallStandaloneIllustrationCrop, shouldPromoteStructuredIllustrationCardSplit, promoteStructuredIllustrationCardSplitMetadata, structuredIllustrationSyntheticSeparatorAtom, shouldClassifyWmsTopRouteIllustrationCrop, applyMinimumUnitCropRenderStrategy, shouldClassifyTwoPanelIconChainResidual, shouldClassifyResidualMinimumUnitCrop, classifyObviousMinimumVisualAssetCrop, hasStructuredNativeDiagramEvidence, promoteMinimumVisualAssetCropMetadata };
