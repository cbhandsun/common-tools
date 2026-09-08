"use strict";

const { classifyGraphicExpressionPolicy } = require("./graphic-expression-policy");

function recommendComponentRenderStrategy(layer = {}, candidates = [], options = {}) {
  const sorted = sanitizeCandidates(candidates);
  const best = sorted[0] || null;
  const bestEditable = sorted.find(isEditableComponentCandidate) || null;
  const bestStructureAlignedEditable = findBestStructureAlignedEditableCandidate(layer, sorted);
  const bestReference = sorted.find(isPolishedReferenceCandidate) || null;
  const areaRatio = finiteNumber(layer.areaRatio, 0);
  const action = String(layer.recommendedAction || "");
  const understanding = layer.diagramUnderstanding || {};
  const nativeReadiness = String(understanding.nativeReadiness || "");
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const residualCount = finiteNumber(understanding.residualCount, 0);
  const componentConfidence = finiteNumber(options.componentConfidence, candidateConfidence(best));
  const targetMotifs = componentLayerTargetMotifs(layer);
  const layerStructureSignature = componentLayerStructureSignature(layer);
  const expressionPolicy = classifyGraphicExpressionPolicy(layer);
  const expressionPolicyRepair = normalizeExpressionPolicyRepair(options.expressionPolicyRepair);
  const forceStructuralRepair = expressionPolicyRepair?.mode === "reclassify-structural-diagram-or-component-template";
  const componentTemplateEligible = forceStructuralRepair
    ? isRepairStructureEligibleLayer(layer)
    : isComponentTemplateEligibleLayer(layer);
  const nativeVisualAtomEligible = forceStructuralRepair
    ? isRepairStructureEligibleLayer(layer)
    : isNativeVisualAtomEligibleLayer(layer);
  const strategyBase = (strategyOptions) => strategy({
    ...strategyOptions,
    expressionPolicy,
    expressionPolicyRepair,
    targetMotifs,
    layerStructureSignature
  });

  if (expressionPolicyRepair?.forcePreserveLocalCrop === true) {
    return strategyBase({
      mode: expressionPolicyRepair.mode,
      implementationMode: "expression-policy-forced-fallback",
      editableExpectation: expressionPolicyRepair.allowNativeOverlays
        ? "fidelity-crop-with-safe-native-overlays"
        : "standalone-visual-asset-preserved-as-movable-crop",
      visualFidelityBias: "fidelity-first",
      bestCandidate: best,
      reason: expressionPolicyRepair.reason,
      expressionPolicyRepair
    });
  }

  if (!forceStructuralRepair && expressionPolicy.protectCrop && expressionPolicy.kind === "decorative-texture") {
    return strategyBase({
      mode: "preserve-local-crop",
      implementationMode: "native-generator-safe-fallback",
      editableExpectation: "decorative-texture-preserved-or-summarized-not-over-split",
      visualFidelityBias: "fidelity-first",
      bestCandidate: best,
      reason: "decorative texture/background is not a semantic minimum unit; preserve or summarize it instead of rebuilding many native fragments"
    });
  }

  if (isFidelityCropWithNativeOverlayEligibleLayer(layer)) {
    return strategyBase({
      mode: "preserve-crop-with-native-overlays",
      implementationMode: "hybrid-native-overlay",
      editableExpectation: "fidelity-screenshot-with-editable-native-diagram-overlays",
      visualFidelityBias: "balanced",
      bestCandidate: best,
      reason: "screenshot/document base stays as a fidelity crop, while detected arrows, nodes, labels, and callouts should be rebuilt as native editable overlays"
    });
  }

  if (isFidelityLockedRasterLayer(layer)) {
    return strategyBase({
      mode: "preserve-local-crop",
      implementationMode: "native-generator-safe-fallback",
      editableExpectation: "raster-screenshot-or-document-with-editable-text-overlays",
      visualFidelityBias: "fidelity-first",
      bestCandidate: best,
      reason: "screenshot/document-like regions stay as fidelity crops even when plugin component search finds a visually similar template"
    });
  }

  if (!forceStructuralRepair && isStandaloneVisualAssetLayer(layer)) {
    return strategyBase({
      mode: "preserve-local-crop",
      implementationMode: "native-generator-safe-fallback",
      editableExpectation: "standalone-visual-asset-preserved-as-movable-crop",
      visualFidelityBias: "fidelity-first",
      bestCandidate: best,
      reason: "standalone icon, illustration, screenshot, or visual-example assets are preserved as one movable crop instead of being over-split or replaced by mismatched templates"
    });
  }

  if (bestStructureAlignedEditable
    && candidateConfidence(bestStructureAlignedEditable) >= 0.4
    && componentTemplateEligible) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestStructureAlignedEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestStructureAlignedEditable.downloadUrl ? "mostly-editable-structure-matched-template" : "structure-matched-plugin-template-after-download",
      visualFidelityBias: "component-first",
      bestCandidate: bestStructureAlignedEditable,
      reason: "plugin component structure signature aligns with detected visual atoms, reducing primitive 拼凑感"
    });
  }

  if (bestEditable
    && candidateConfidence(bestEditable) >= 0.55
    && highConfidenceComponentCandidateFitsLayer(layer, bestEditable)
    && componentTemplateEligible) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestEditable.downloadUrl ? "mostly-editable-template" : "candidate-editable-template-after-download",
      visualFidelityBias: "component-first",
      bestCandidate: bestEditable,
      reason: "high-scoring grouped component candidate can reduce primitive拼凑感"
    });
  }

  if (bestEditable && candidateConfidence(bestEditable) >= 0.55 && !componentTemplateEligible) {
    return strategyBase({
      mode: "preserve-local-crop",
      implementationMode: "native-generator-safe-fallback",
      editableExpectation: "raster-preserved-because-component-template-is-not-layer-eligible",
      visualFidelityBias: "fidelity-first",
      bestCandidate: bestEditable,
      reason: "high-scoring grouped component candidate was rejected because this layer is not a structured diagram/component region"
    });
  }

  if (bestEditable
    && candidateConfidence(bestEditable) >= 0.45
    && highConfidenceComponentCandidateFitsLayer(layer, bestEditable)
    && isStructuredMatrixLayer(layer)) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestEditable.downloadUrl ? "mostly-editable-template" : "matrix-native-shell-over-fidelity-crop",
      visualFidelityBias: "balanced",
      bestCandidate: bestEditable,
      reason: "moderate OfficePLUS matrix component plus grid/table evidence is strong enough for an editable native shell"
    });
  }

  if (bestEditable
    && candidateConfidence(bestEditable) >= 0.45
    && highConfidenceComponentCandidateFitsLayer(layer, bestEditable)
    && isStructuredRelationshipLayer(layer)) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestEditable.downloadUrl ? "mostly-editable-template" : "relationship-native-shell-over-fidelity-crop",
      visualFidelityBias: "balanced",
      bestCandidate: bestEditable,
      reason: "moderate OfficePLUS relationship component plus node/connector evidence is strong enough for an editable native shell"
    });
  }

  if (bestEditable
    && candidateConfidence(bestEditable) >= 0.45
    && highConfidenceComponentCandidateFitsLayer(layer, bestEditable)
    && isCompactRelationshipLayer(layer)) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestEditable.downloadUrl ? "mostly-editable-template" : "compact-relationship-native-shell-over-fidelity-crop",
      visualFidelityBias: "balanced",
      bestCandidate: bestEditable,
      reason: "compact relationship diagram has normalized component-family evidence and a moderate OfficePLUS grouped component candidate"
    });
  }

  if (bestEditable
    && candidateConfidence(bestEditable) >= 0.45
    && highConfidenceComponentCandidateFitsLayer(layer, bestEditable)
    && isStructuredProcessLayer(layer)) {
    return strategyBase({
      mode: "plugin-component-template",
      implementationMode: bestEditable.downloadUrl ? "import-ready" : "auth-or-download-required",
      editableExpectation: bestEditable.downloadUrl ? "mostly-editable-template" : "process-native-shell-over-fidelity-crop",
      visualFidelityBias: "balanced",
      bestCandidate: bestEditable,
      reason: "moderate OfficePLUS process component plus node/connector evidence is strong enough for an editable native shell"
    });
  }

  if (bestReference && componentConfidence >= 0.58 && shouldAvoidPrimitiveRebuild({ areaRatio, action, nativeReadiness, visualAtomCount, residualCount })) {
    if (nativeVisualAtomEligible
      && isHighCompositionRiskRelationshipLayer(layer)
      && isSpecializedRelationshipNativeRebuildReady(layer, layerStructureSignature)) {
      return strategyBase({
        mode: "native-visual-atom-rebuild",
        implementationMode: "native-specialized",
        editableExpectation: "mostly-editable-specialized-relationship-diagram",
        visualFidelityBias: "balanced",
        bestCandidate: bestReference,
        reason: "radial/relationship diagram has strong layout and motif evidence for an existing specialized native rebuilder, so the primitive-rebuild avoidance guard is bypassed safely"
      });
    }
    if (nativeVisualAtomEligible && isMatrixNativeRebuildReadyWithReference(layer, bestReference)) {
      return strategyBase({
        mode: "native-visual-atom-rebuild",
        implementationMode: "native-matrix",
        editableExpectation: "mostly-editable-native-grid-or-matrix-primitives",
        visualFidelityBias: "balanced",
        bestCandidate: bestReference,
        reason: "table/matrix layer has explicit structural evidence and an aligned plugin reference, so rebuild it as editable native matrix atoms instead of keeping a guide-only crop"
      });
    }
    return strategyBase({
      mode: "preserve-crop-with-component-reference",
      implementationMode: "guide-only",
      editableExpectation: "raster-diagram-with-editable-text-overlays",
      visualFidelityBias: "fidelity-first",
      bestCandidate: bestReference,
      reason: "polished plugin reference exists, but direct editable import is not yet available; preserve the source diagram instead of over-objectifying it"
    });
  }

  if (bestReference && componentConfidence >= 0.5 && nativeVisualAtomEligible) {
    if (isHighCompositionRiskRelationshipLayer(layer)) {
      if (isSpecializedRelationshipNativeRebuildReady(layer, layerStructureSignature)) {
        return strategyBase({
          mode: "native-visual-atom-rebuild",
          implementationMode: "native-specialized",
          editableExpectation: "mostly-editable-specialized-relationship-diagram",
          visualFidelityBias: "balanced",
          bestCandidate: bestReference,
          reason: "radial/relationship diagram has strong layout and motif evidence for an existing specialized native rebuilder, so use editable atoms instead of preserving the full crop"
        });
      }
      return strategyBase({
        mode: "preserve-crop-with-component-reference",
        implementationMode: "guide-only",
        editableExpectation: "raster-diagram-until-polished-plugin-component-is-applied",
        visualFidelityBias: "fidelity-first",
        bestCandidate: bestReference,
        reason: "radial/relationship diagrams are high 拼凑感 risk; keep fidelity crop and use the plugin reference as the replacement target instead of rebuilding many primitives"
      });
    }
    return strategyBase({
      mode: "native-rebuild-with-component-style-guide",
      implementationMode: "style-guide",
      editableExpectation: "native-primitives-guided-by-plugin-reference",
      visualFidelityBias: "balanced",
      bestCandidate: bestReference,
      reason: "plugin reference can guide colors, layout family, and spacing while native atoms remain plausible"
    });
  }

  if (isHighCompositionRiskRelationshipLayer(layer)) {
    if (nativeVisualAtomEligible && isSpecializedRelationshipNativeRebuildReady(layer, layerStructureSignature)) {
      return strategyBase({
        mode: "native-visual-atom-rebuild",
        implementationMode: "native-specialized",
        editableExpectation: "mostly-editable-specialized-relationship-diagram",
        visualFidelityBias: "balanced",
        bestCandidate: best,
        reason: "radial/relationship diagram has strong layout and motif evidence for an existing specialized native rebuilder"
      });
    }
    return strategyBase({
      mode: "preserve-local-crop",
      implementationMode: "native-generator-safe-fallback",
      editableExpectation: "raster-diagram-until-polished-plugin-component-is-applied",
      visualFidelityBias: "fidelity-first",
      bestCandidate: best,
      reason: "radial/relationship diagram has strong component-template intent but no reusable editable component is ready; preserve crop instead of primitive 拼凑"
    });
  }

  if (isStructuredMatrixLayer(layer) && nativeVisualAtomEligible) {
    return strategyBase({
      mode: "native-visual-atom-rebuild",
      implementationMode: "native",
      editableExpectation: "mostly-editable-native-grid-or-matrix-primitives",
      visualFidelityBias: "editability-first",
      bestCandidate: best,
      reason: "grid/table structure is detected but plugin candidates do not structurally fit; rebuild native atoms instead of preserving a flat crop"
    });
  }

  if ((nativeReadiness === "native-rebuild" || (visualAtomCount >= 4 && residualCount <= 1)) && nativeVisualAtomEligible) {
    return strategyBase({
      mode: "native-visual-atom-rebuild",
      implementationMode: "native",
      editableExpectation: "mostly-editable-native-primitives",
      visualFidelityBias: "editability-first",
      bestCandidate: best,
      reason: "visual atoms are sufficiently structured for native reconstruction"
    });
  }

  return strategyBase({
    mode: "preserve-local-crop",
    implementationMode: "native-generator-safe-fallback",
    editableExpectation: "raster-diagram-with-editable-text-overlays",
    visualFidelityBias: "fidelity-first",
    bestCandidate: best,
    reason: "no reliable reusable component or native atom structure was found"
  });
}

function sanitizeCandidates(candidates = []) {
  return (Array.isArray(candidates) ? candidates : [])
    .filter((candidate) => candidate && typeof candidate === "object")
    .map((candidate) => ({
      sourceProvider: safeString(candidate.sourceProvider || candidate.queryProvider || candidate.provider),
      kind: safeString(candidate.kind || candidate.queryKind),
      id: safeString(candidate.id),
      title: safeString(candidate.title),
      reuseHint: safeString(candidate.reuseHint),
      roleTags: sanitizeArray(candidate.roleTags),
      structureSignature: sanitizeStructureSignature(candidate.structureSignature),
      learningSummary: sanitizeLearningSummary(candidate.learningSummary),
      candidateScore: finiteNumber(candidate.candidateScore ?? candidate.score, 0),
      score: finiteNumber(candidate.score, 0),
      coverUrl: safeUrl(candidate.coverUrl),
      downloadUrl: safeUrl(candidate.downloadUrl),
      downloadable: candidate.downloadable === true,
      permission: safeString(candidate.permission || candidate.paymentType),
      queryKind: safeString(candidate.queryKind),
      queryProvider: safeString(candidate.queryProvider),
      suitability: sanitizeSuitability(candidate.suitability)
    }))
    .sort((a, b) => candidateConfidence(b) - candidateConfidence(a));
}

function isEditableComponentCandidate(candidate = {}) {
  const provider = String(candidate.sourceProvider || candidate.queryProvider || "").toLowerCase();
  const kind = String(candidate.kind || candidate.queryKind || "").toLowerCase();
  const hint = String(candidate.reuseHint || "").toLowerCase();
  const tags = sanitizeArray(candidate.roleTags).join(" ").toLowerCase();
  const signatureKind = safeString(candidate.structureSignature?.primaryKind).toLowerCase();
  if (provider === "officeplus" && kind === "component" && /grouped-pptx-component|template/.test(hint)) {
    return true;
  }
  return provider === "islide"
    && /component|template|presentation-template|vector-component/.test(kind)
    && (/grouped-pptx-component|template|applied-component|editable/.test(`${hint} ${tags}`)
      || /process-chain|timeline|matrix|card-group|cycle-loop|hub-spoke|mixed/.test(signatureKind));
}

function isPolishedReferenceCandidate(candidate = {}) {
  const provider = String(candidate.sourceProvider || candidate.queryProvider || "").toLowerCase();
  const kind = String(candidate.kind || candidate.queryKind || "").toLowerCase();
  const hint = String(candidate.reuseHint || "").toLowerCase();
  if (provider === "islide" && /diagram|smartdiagram|template/.test(kind)) return true;
  return /polished-diagram|smart-diagram|template-style-reference/.test(hint);
}

function shouldAvoidPrimitiveRebuild({ areaRatio, action, nativeReadiness, visualAtomCount, residualCount }) {
  if (action === "preserve-local-crop") return true;
  if (areaRatio >= 0.18 && nativeReadiness !== "native-rebuild") return true;
  if (visualAtomCount < 4) return true;
  return residualCount > Math.max(2, Math.floor(visualAtomCount * 0.5));
}

function isFidelityLockedRasterLayer(layer = {}) {
  const layerType = safeString(layer.layerType).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const action = safeString(layer.recommendedAction || layer.source?.recommendedAction).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  if (String(understanding.nativeReadiness || "") === "native-rebuild") return false;
  if (/screenshot|document/.test(layerType)) return true;
  if (expressionForm === "screenshot-or-document") return true;
  if (/ui-screenshot|product-screenshot|document-snapshot|screen-capture/.test(expressionSubtype)) return true;
  if (/screenshot|document|screen-capture|product-illustration-segment/.test(detector)) return true;
  return /preserve-local-crop|keep-local-crop|preserve-fidelity-crop/.test(action)
    && /screenshot|document|screen/.test(`${expressionForm} ${expressionSubtype} ${detector}`);
}

function isStandaloneVisualAssetLayer(layer = {}) {
  const policy = classifyGraphicExpressionPolicy(layer);
  if (policy.kind === "standalone-visual-asset" || policy.kind === "decorative-texture") return true;
  if (policy.kind === "structured-native" || policy.kind === "hybrid-native-overlays") return false;
  if (hasStructuredExpressionOverride(layer)) return false;
  if (layer.standaloneVisualAsset === true || layer.source?.layer?.standaloneVisualAsset === true) return true;
  const layerType = safeString(layer.layerType || layer.source?.layer?.layerType).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const action = safeString(layer.recommendedAction || layer.source?.recommendedAction || layer.source?.expressionRecommendation).toLowerCase();
  const understanding = layer.diagramUnderstanding || layer.source?.layer?.diagramUnderstanding || {};
  const family = safeString(understanding.componentStrategy?.templateFamily).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  if (/replace-with-native-components|native-rebuild/.test(action)) return false;
  if (/data-chart|chart-snapshot|table-or-matrix|complex-diagram|linear-process-diagram/.test(expressionForm)) return false;
  if (/(?:chart|axis|series|plot|table|matrix|grid|data-series)/.test(expressionSubtype)) return false;
  if (/screenshot|document|decorative|brand/.test(layerType)) return true;
  if (!/illustration|icon/.test(`${layerType} ${expressionForm} ${expressionSubtype} ${detector}`)) return false;
  const explicitAssetText = `${detector} ${expressionSubtype} ${action}`;
  if (/plugin-.*(?:arrow|icon)|arrow-illustration|cycle-flow-icon|vector-arrow|visual-example|mockup|preview|sample|example|图标|图示|示意图|样例|示例|截图|screenshot|ui-capture|logo|brand/i.test(explicitAssetText)) {
    return true;
  }
  if (nativeReadiness === "native-rebuild") return false;
  const structuralText = `${family} ${archetype}`;
  if (/native-rebuild|hybrid-native-plus-residual-crops/.test(nativeReadiness)
    && /diagram|matrix|process|flow|relationship|timeline|chart|grid|table|hub|spoke|cycle|topology/.test(structuralText)) {
    return false;
  }
  return /(?:icon-or-illustration|icon|logo|illustration|插画|图标|图示|示意图|样例|示例|截图|screenshot|ui-capture|mockup|preview|sample|example)/i
    .test(`${layerType} ${detector} ${expressionForm} ${expressionSubtype} ${action}`);
}

function hasStructuredExpressionOverride(layer = {}) {
  const layerType = safeString(layer.layerType || layer.source?.layer?.layerType).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const action = safeString(layer.recommendedAction || layer.source?.recommendedAction || layer.source?.expressionRecommendation).toLowerCase();
  return /^(data-chart|chart-snapshot|table-or-matrix|complex-diagram|linear-process-diagram)$/.test(expressionForm)
    || /^(chart-zone|table-zone|diagram-zone)$/.test(layerType)
    || /(?:chart|axis|series|plot|table|matrix|grid|data-series|flow|process|relationship|timeline|tree|topology|network)/.test(expressionSubtype)
    || (/replace-with-native-components|native-rebuild|split-native|attempt-native-reconstruction/.test(action)
      && /(?:diagram|table|matrix|grid|chart|flow|process|relationship|timeline|topology|network)/.test(`${layerType} ${detector} ${expressionForm} ${expressionSubtype}`));
}

function isFidelityCropWithNativeOverlayEligibleLayer(layer = {}) {
  const layerType = safeString(layer.layerType).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const action = safeString(layer.recommendedAction || layer.source?.recommendedAction).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  const atomCounts = understanding.visualAtomKindCounts || {};
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const residualCount = finiteNumber(understanding.residualCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount, 0)
    + finiteNumber(atomCounts["connector-candidate"], 0)
    + finiteNumber(atomCounts["arrow-candidate"], 0)
    + finiteNumber(atomCounts["line-candidate"], 0);
  const nodeCount = finiteNumber(understanding.nodeCount, 0)
    + finiteNumber(atomCounts["node-candidate"], 0)
    + finiteNumber(atomCounts["shape-candidate"], 0);
  const textLikeCount = finiteNumber(understanding.textSlotCount, 0)
    + finiteNumber(atomCounts["text-candidate"], 0)
    + finiteNumber(atomCounts["label-candidate"], 0)
    + finiteNumber(atomCounts["callout-candidate"], 0);
  const isRasterBase = /screenshot|document/.test(layerType)
    || expressionForm === "screenshot-or-document"
    || /ui-screenshot|product-screenshot|document-snapshot|screen-capture/.test(expressionSubtype)
    || /screenshot|document|screen-capture|product-illustration-segment/.test(detector);
  const hasOverlayIntent = nativeReadiness === "hybrid-native-plus-residual-crops"
    || /split-native-with-residual-crop|native-overlay|editable-overlay/.test(action);
  const hasStructuredOverlay = visualAtomCount >= 3
    && (connectorCount >= 1 || nodeCount >= 2 || textLikeCount >= 2)
    && residualCount <= Math.max(visualAtomCount, 4);
  return isRasterBase && hasOverlayIntent && hasStructuredOverlay;
}

function isComponentTemplateEligibleLayer(layer = {}) {
  const policy = classifyGraphicExpressionPolicy(layer);
  if (policy.protectCrop && !policy.allowPluginTemplate) return false;
  const layerType = safeString(layer.layerType).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const action = safeString(layer.recommendedAction || layer.source?.recommendedAction).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  const family = safeString(understanding.componentStrategy?.templateFamily).toLowerCase();
  if (!layerType && !expressionForm && !expressionSubtype) return true;
  if (isStandaloneVisualAssetLayer(layer)) return false;
  if (isFidelityLockedRasterLayer(layer)) return false;
  if (/background|decorative|brand|value-banner/.test(layerType)) return false;
  if (/icon|illustration/.test(expressionForm) && !/diagram|matrix|process|flow|relationship|timeline/.test(family)) return false;
  if (nativeReadiness === "native-rebuild" || nativeReadiness === "hybrid-native-plus-residual-crops") return true;
  if (/diagram|table|matrix|grid|chart|flow/.test(layerType)) return true;
  if (/complex-diagram|chart-snapshot/.test(expressionForm) && !/preserve-local-crop|keep-local-crop|preserve-fidelity-crop/.test(action)) return true;
  return false;
}

function isNativeVisualAtomEligibleLayer(layer = {}) {
  const policy = classifyGraphicExpressionPolicy(layer);
  if (!policy.allowNativeRebuild && policy.protectCrop) return false;
  const layerType = safeString(layer.layerType).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  const family = safeString(understanding.componentStrategy?.templateFamily).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  if (!layerType && !expressionForm && !expressionSubtype && !detector) return true;
  if (isStandaloneVisualAssetLayer(layer)) return false;
  if (isFidelityLockedRasterLayer(layer)) return false;
  if (/background|decorative|brand|value-banner/.test(layerType)) return false;
  if (nativeReadiness === "native-rebuild") return true;
  if (/diagram|table|matrix|grid|chart|flow/.test(layerType)) return true;
  if (/diagram|matrix|process|flow|relationship|timeline|chart|grid|table|hub|spoke|cycle|topology/.test(`${family} ${archetype}`)) return true;
  if (/icon|illustration/.test(expressionForm)) return false;
  return /complex-diagram|chart-snapshot/.test(expressionForm);
}

function isRepairStructureEligibleLayer(layer = {}) {
  const layerType = safeString(layer.layerType).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const expressionSubtype = safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const nativeReadiness = safeString(understanding.nativeReadiness).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  const family = safeString(understanding.componentStrategy?.templateFamily || layer.templateFamily).toLowerCase();
  const atomCount = finiteNumber(understanding.visualAtomCount, 0);
  const nodeCount = finiteNumber(understanding.nodeCount || understanding.visualNodeCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount || understanding.visualConnectorCount, 0);
  const atomCounts = understanding.visualAtomKindCounts || {};
  const structuralText = `${layerType} ${expressionForm} ${expressionSubtype} ${detector} ${archetype} ${family}`;
  if (/screenshot|document|screen-capture|ui-capture|background|decorative|texture|brand|logo/.test(structuralText)) {
    return false;
  }
  if (/native-rebuild|hybrid-native-plus-residual-crops/.test(nativeReadiness)) return true;
  if (/diagram|matrix|process|flow|relationship|timeline|chart|grid|table|hub|spoke|cycle|topology|dashboard/.test(structuralText)) {
    return atomCount >= 3 || nodeCount >= 2 || connectorCount >= 1 || finiteNumber(atomCounts["grid-line-candidate"], 0) >= 1;
  }
  return atomCount >= 5 && (nodeCount >= 2 || connectorCount >= 1);
}

function isStructuredMatrixLayer(layer = {}) {
  const layerType = String(layer.layerType || "").toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const atomCounts = understanding.visualAtomKindCounts || {};
  const gridAtoms = finiteNumber(atomCounts["grid-line-candidate"], 0);
  return /table|matrix|grid/.test(layerType)
    || /matrix|grid|table/.test(archetype)
    || (/matrix|grid|table/.test(family) && gridAtoms >= 1)
    || gridAtoms >= 2;
}

function isMatrixNativeRebuildReadyWithReference(layer = {}, candidate = {}) {
  if (!isStructuredMatrixLayer(layer)) return false;
  if (isFidelityLockedRasterLayer(layer) || isStandaloneVisualAssetLayer(layer)) return false;
  const layerType = safeString(layer.layerType).toLowerCase();
  const detector = safeString(layer.detector || layer.source?.detector).toLowerCase();
  const expressionForm = safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase();
  const structuralText = `${layerType} ${expressionForm} ${safeString(layer.recommendedAction).toLowerCase()}`;
  if (!/table|matrix|grid/.test(structuralText)) return false;
  if (/screenshot|document|screen|illustration|icon|decorative/.test(`${layerType} ${detector} ${expressionForm}`)) return false;

  const understanding = layer.diagramUnderstanding || {};
  const atomCounts = understanding.visualAtomKindCounts || {};
  const gridAtoms = finiteNumber(atomCounts["grid-line-candidate"], 0);
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const nodeCount = finiteNumber(understanding.nodeCount, 0);
  const hasStructuralEvidence = gridAtoms >= 1
    || visualAtomCount >= 2
    || nodeCount >= 2
    || /matrix|grid|table|swimlane/.test(safeString(understanding.archetype || understanding.componentStrategy?.layout).toLowerCase());
  if (!hasStructuralEvidence) return false;

  const motifs = new Set([
    ...componentLayerTargetMotifs(layer),
    ...sanitizeArray(candidate.targetMotifs),
    ...sanitizeArray(candidate.structureSignature?.motifs)
  ].map((motif) => safeString(motif).toLowerCase()).filter(Boolean));
  return [...motifs].some((motif) => /card-grid|matrix|grid|table|whole-process|branch-card-flow|linear-arrow-chain/.test(motif));
}

function isStructuredRelationshipLayer(layer = {}) {
  const layerType = String(layer.layerType || "").toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const nodeCount = finiteNumber(understanding.nodeCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount, 0);
  const isDiagram = /diagram|illustration/.test(layerType) && !/screenshot|document/.test(layerType);
  return isDiagram
    && nodeCount >= 3
    && (connectorCount >= 1 || finiteNumber(understanding.visualAtomCount, 0) >= 3)
    && (/generic-node|hub|spoke|cycle|radial|topology/.test(archetype) || /hub|spoke|cycle|radial|topology|relationship/.test(family));
}

function isCompactRelationshipLayer(layer = {}) {
  const layerType = String(layer.layerType || "").toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const nodeCount = finiteNumber(understanding.nodeCount, 0);
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const areaRatio = finiteNumber(layer.areaRatio, 0);
  const isDiagram = /diagram|illustration/.test(layerType) && !/screenshot|document/.test(layerType);
  return isDiagram
    && areaRatio >= 0.025
    && areaRatio <= 0.14
    && (nodeCount >= 1 || visualAtomCount >= 1)
    && (/hub|spoke|cycle|radial|relationship/.test(family) || /hub|spoke|cycle|radial|relationship/.test(archetype));
}

function isStructuredProcessLayer(layer = {}) {
  const layerType = String(layer.layerType || "").toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const archetype = String(understanding.archetype || "").toLowerCase();
  const family = String(understanding.componentStrategy?.templateFamily || "").toLowerCase();
  const nodeCount = finiteNumber(understanding.nodeCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount, 0);
  const isDiagram = /diagram/.test(layerType) && !/screenshot|document/.test(layerType);
  return isDiagram
    && nodeCount >= 4
    && connectorCount >= 3
    && (/process|flow|chain|workflow/.test(archetype) || /process|flow|chain/.test(family));
}

function findBestStructureAlignedEditableCandidate(layer = {}, candidates = []) {
  return candidates
    .filter(isEditableComponentCandidate)
    .map((candidate) => ({
      candidate,
      alignmentScore: componentStructureAlignmentScore(layer, candidate)
    }))
    .filter((entry) => entry.alignmentScore >= 0.5)
    .sort((a, b) => {
      const weightedB = (b.alignmentScore * 2) + candidateConfidence(b.candidate);
      const weightedA = (a.alignmentScore * 2) + candidateConfidence(a.candidate);
      return weightedB - weightedA;
    })
    .map((entry) => ({ ...entry.candidate, structureAlignmentScore: entry.alignmentScore }))[0] || null;
}

function highConfidenceComponentCandidateFitsLayer(layer = {}, candidate = {}) {
  if (safeString(candidate?.suitability?.tier).toLowerCase() === "strong") return true;
  if (componentStructureAlignmentScore(layer, candidate) >= 0.5) return true;
  const layerType = safeString(layer.layerType).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const family = safeString(understanding.componentStrategy?.templateFamily || layer.templateFamily).toLowerCase();
  const archetype = safeString(understanding.archetype).toLowerCase();
  const layerText = `${layerType} ${family} ${archetype}`;
  const candidateText = [
    safeString(candidate.kind),
    safeString(candidate.reuseHint),
    safeString(candidate.title),
    safeString(candidate.structureSignature?.primaryKind),
    ...sanitizeArray(candidate.structureSignature?.motifs)
  ].join(" ").toLowerCase();
  if (/illustration/.test(layerType) && !/table|matrix|grid/.test(family)) return true;
  if (/table|matrix|grid/.test(layerType) || /table|matrix|grid/.test(family)) {
    return /matrix|grid|card-grid|card-group|矩阵|网格|表格|卡片/.test(candidateText);
  }
  if (/pie-chart/.test(family) || /pie-chart/.test(archetype)) {
    return /pie-chart|pie-share-chart|chart|饼图|扇区|占比|份额/.test(candidateText);
  }
  if (/process|flow|chain|workflow/.test(family) || /process|flow|chain|workflow/.test(archetype)) {
    return /process|flow|chain|timeline|arrow|流程|箭头|链路/.test(candidateText);
  }
  if (/relationship|hub|spoke|radial|cycle|ring|topology/.test(family) || /relationship|hub|spoke|radial|cycle|ring|topology/.test(archetype)) {
    return /hub|spoke|cycle|ring|radial|arc-arrow|关系|循环|圆环|圆弧|中心|总分|通用/.test(candidateText);
  }
  return true;
}

function componentStructureAlignmentScore(layer = {}, candidate = {}) {
  const understanding = layer.diagramUnderstanding || {};
  const strategyInfo = understanding.componentStrategy || {};
  const layerSignature = componentLayerStructureSignature(layer);
  const layerSignals = new Set([
    safeString(layer.layerType).toLowerCase(),
    safeString(layer.expressionForm || layer.source?.expressionForm).toLowerCase(),
    safeString(layer.expressionSubtype || layer.source?.expressionSubtype).toLowerCase(),
    safeString(understanding.expressionFamily).toLowerCase(),
    safeString(understanding.archetype).toLowerCase(),
    safeString(strategyInfo.templateFamily).toLowerCase(),
    ...sanitizeArray(understanding.targetMotifs).map((value) => value.toLowerCase()),
    ...sanitizeArray(strategyInfo.targetMotifs).map((value) => value.toLowerCase()),
    ...sanitizeArray(layer.targetMotifs).map((value) => value.toLowerCase())
  ].filter(Boolean));
  const signature = candidate.structureSignature || {};
  const candidateSignals = new Set([
    safeString(candidate.kind).toLowerCase(),
    safeString(candidate.reuseHint).toLowerCase(),
    safeString(candidate.title).toLowerCase(),
    safeString(signature.primaryKind).toLowerCase(),
    safeString(signature.expressionFamily).toLowerCase(),
    ...sanitizeArray(signature.motifs).map((value) => value.toLowerCase()),
    ...sanitizeArray(candidate.roleTags).map((value) => value.toLowerCase()),
    ...sanitizeArray(candidate.learningSummary?.signals).map((value) => value.toLowerCase())
  ].filter(Boolean));
  if (layerSignals.size === 0 || candidateSignals.size === 0) return 0;

  let score = 0;
  for (const signal of layerSignals) {
    if (candidateSignals.has(signal)) score += 0.35;
  }
  score += motifFamilyAlignmentScore(layerSignals, candidateSignals);

  const atomCount = finiteNumber(understanding.visualAtomCount, 0);
  const nodeCount = finiteNumber(understanding.nodeCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount, 0);
  if (atomCount >= 4 && candidateSignals.has("multi-part-component-groups")) score += 0.15;
  if (nodeCount >= 3 && /card-group|process-chain|hub-spoke|cycle-loop|mixed/.test([...candidateSignals].join(" "))) score += 0.15;
  if (connectorCount >= 1 && /arc-arrow|linear-arrow-chain|process-chain|timeline/.test([...candidateSignals].join(" "))) score += 0.15;
  const familyScore = componentStructureExpressionFamilyScore(layerSignature, signature);
  const scaleScore = componentStructureScaleScore(layerSignature, signature);
  const layoutScore = componentStructureLayoutScore(layerSignature, signature);
  score = Math.min(1, score);
  if (familyScore !== null) {
    score *= 0.6 + (familyScore * 0.4);
    if (familyScore < 0.25) score = Math.min(score, 0.48);
    else if (familyScore < 0.55) score = Math.min(score, 0.64);
  }
  if (scaleScore !== null) {
    score *= 0.65 + (scaleScore * 0.35);
    if (scaleScore < 0.35) score = Math.min(score, 0.49);
    else if (scaleScore < 0.55) score = Math.min(score, 0.68);
  }
  if (layoutScore !== null) {
    score *= 0.7 + (layoutScore * 0.3);
    if (layoutScore < 0.25) score = Math.min(score, 0.49);
    else if (layoutScore < 0.55) score = Math.min(score, 0.68);
  }
  return round(Math.min(1, score));
}

function componentStructureScaleScore(layerSignature = {}, candidateSignature = {}) {
  const fields = ["shapeCount", "connectorCount", "textBoxCount", "pictureCount", "stepCount", "rows", "columns", "laneCount"].filter((field) => {
    const layerValue = finiteNumber(layerSignature[field], 0);
    const candidateValue = finiteNumber(candidateSignature[field], 0);
    return layerValue > 0 && candidateValue > 0;
  });
  if (fields.length === 0) return null;
  const scores = fields.map((field) => {
    const layerValue = finiteNumber(layerSignature[field], 0);
    const candidateValue = finiteNumber(candidateSignature[field], 0);
    const ratio = Math.min(layerValue, candidateValue) / Math.max(layerValue, candidateValue);
    return Math.max(0, Math.min(1, ratio));
  });
  const weighted = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return round(weighted);
}

function componentStructureExpressionFamilyScore(layerSignature = {}, candidateSignature = {}) {
  const layerFamily = normalizeStructureLabel(layerSignature.expressionFamily);
  const candidateFamily = normalizeStructureLabel(candidateSignature.expressionFamily);
  if (!layerFamily || !candidateFamily) return null;
  if (layerFamily === candidateFamily) return 1;
  if (/structured-process|generic-structured-diagram/.test(layerFamily) && /structured-process|generic-structured-diagram/.test(candidateFamily)) return 0.75;
  if (/relationship-diagram|structured-process/.test(layerFamily) && /relationship-diagram|structured-process/.test(candidateFamily)) return 0.5;
  if (/layout-grid|data-chart/.test(layerFamily) && /layout-grid|data-chart/.test(candidateFamily)) return 0.45;
  if (/pictorial-asset/.test(layerFamily) || /pictorial-asset/.test(candidateFamily)) return 0;
  return 0.2;
}

function componentStructureLayoutScore(layerSignature = {}, candidateSignature = {}) {
  const layerLayout = normalizeStructureLabel(layerSignature.layout);
  const candidateLayout = normalizeStructureLabel(candidateSignature.layout);
  const layerDirection = normalizeStructureLabel(layerSignature.direction);
  const candidateDirection = normalizeStructureLabel(candidateSignature.direction);
  const scores = [];
  if (layerLayout && candidateLayout) {
    scores.push(layerLayout === candidateLayout ? 1 : relatedLayoutScore(layerLayout, candidateLayout));
  }
  if (layerDirection && candidateDirection) {
    scores.push(layerDirection === candidateDirection ? 1 : relatedDirectionScore(layerDirection, candidateDirection));
  }
  if (scores.length === 0) return null;
  return round(scores.reduce((sum, value) => sum + value, 0) / scores.length);
}

function normalizeStructureLabel(value) {
  return safeString(value).toLowerCase().replace(/[_\s]+/g, "-");
}

function relatedLayoutScore(first, second) {
  if (!first || !second) return 0;
  const pair = `${first} ${second}`;
  if (/linear-process|timeline/.test(first) && /linear-process|timeline/.test(second)) return 0.75;
  if (/vertical-process/.test(first) && /vertical-process/.test(second)) return 0.75;
  if (/cycle-loop|arc-arrow|radial/.test(first) && /cycle-loop|arc-arrow|radial/.test(second)) return 0.7;
  if (/grid|matrix|quadrant/.test(first) && /grid|matrix|quadrant/.test(second)) return 0.7;
  if (/swimlane/.test(first) && /swimlane/.test(second)) return 0.7;
  if (/vertical-process/.test(pair) && /linear-process|timeline/.test(pair)) return 0.35;
  if (/cycle-loop|arc-arrow|radial/.test(pair) && /linear-process|vertical-process|timeline/.test(pair)) return 0.25;
  if (/swimlane/.test(pair) && /linear-process|vertical-process|timeline/.test(pair)) return 0.45;
  if (/grid|matrix|quadrant/.test(pair) && /linear-process|vertical-process|timeline/.test(pair)) return 0.25;
  return 0;
}

function relatedDirectionScore(first, second) {
  if (!first || !second) return 0;
  if (first === second) return 1;
  if (/left-to-right|horizontal/.test(first) && /left-to-right|horizontal/.test(second)) return 0.75;
  if (/top-to-bottom|vertical/.test(first) && /top-to-bottom|vertical/.test(second)) return 0.75;
  if (/clockwise|counterclockwise|circular/.test(first) && /clockwise|counterclockwise|circular/.test(second)) return 0.6;
  return 0;
}

function motifFamilyAlignmentScore(layerSignals, candidateSignals) {
  const layerText = [...layerSignals].join(" ");
  const candidateText = [...candidateSignals].join(" ");
  let score = 0;
  if (/process|flow|chain|workflow|linear-process/.test(layerText) && /process-chain|linear-arrow-chain|timeline|card-grid|流程|箭头|链路/.test(candidateText)) score += 0.45;
  if (/matrix|grid|table/.test(layerText) && /matrix|card-grid|card-group|矩阵|网格|表格|卡片/.test(candidateText)) score += 0.45;
  if (/pie-chart|pie-share-chart|饼图|扇区/.test(layerText) && /pie-chart|pie-share-chart|chart|饼图|扇区|占比|份额/.test(candidateText)) score += 0.45;
  if (/relationship|hub|spoke|radial|cycle|ring|topology/.test(layerText) && /hub-spoke|cycle-loop|ring-node|radial-link|arc-arrow/.test(candidateText)) score += 0.45;
  if (/arc-arrow/.test(layerText) && /arc-arrow|cycle-loop/.test(candidateText)) score += 0.45;
  if (/whole-process-template/.test(layerText) && /whole-process-template|process-chain|card-grid/.test(candidateText)) score += 0.45;
  return score;
}

function isHighCompositionRiskRelationshipLayer(layer = {}) {
  const layerType = safeString(layer.layerType).toLowerCase();
  const understanding = layer.diagramUnderstanding || {};
  const archetype = safeString(understanding.archetype).toLowerCase();
  const strategy = understanding.componentStrategy || {};
  const family = safeString(strategy.templateFamily).toLowerCase();
  const motifs = [
    ...sanitizeArray(understanding.targetMotifs),
    ...sanitizeArray(strategy.targetMotifs),
    ...sanitizeArray(layer.targetMotifs),
    ...sanitizeArray(layer.plan?.targetMotifs)
  ].map((value) => value.toLowerCase());
  const nodeCount = finiteNumber(understanding.nodeCount, 0) + finiteNumber(understanding.visualNodeCount, 0);
  const connectorCount = finiteNumber(understanding.connectorCount, 0) + finiteNumber(understanding.visualConnectorCount, 0);
  const visualAtomCount = finiteNumber(understanding.visualAtomCount, 0);
  const relationshipSignal = /hub|spoke|radial|relationship|cycle|ring/.test(`${archetype} ${family}`)
    || motifs.some((motif) => /radial-link|ring-node|arc-arrow/.test(motif));
  const isStructuredVisual = nodeCount >= 4
    || connectorCount >= 3
    || visualAtomCount >= 5
    || motifs.includes("radial-link");
  return /diagram|illustration/.test(layerType)
    && !/screenshot|document|decorative|background|value-banner/.test(layerType)
    && relationshipSignal
    && isStructuredVisual;
}

function isSpecializedRelationshipNativeRebuildReady(layer = {}, signature = componentLayerStructureSignature(layer)) {
  if (!isHighCompositionRiskRelationshipLayer(layer)) return false;
  const detector = safeString(layer.detector).toLowerCase();
  const layerType = safeString(layer.layerType).toLowerCase();
  if (layerType !== "diagram-zone") return false;
  if (/screenshot|screen|document|prototype|visual-example|illustration|icon/.test(detector)) return false;
  const understanding = layer.diagramUnderstanding || {};
  const strategyInfo = understanding.componentStrategy || {};
  const primaryKind = safeString(signature.primaryKind || understanding.archetype || strategyInfo.templateFamily || layer.templateFamily).toLowerCase();
  const layout = safeString(signature.layout).toLowerCase();
  const direction = safeString(signature.direction).toLowerCase();
  const motifs = sanitizeArray(signature.motifs).map((value) => safeString(value).toLowerCase());
  const stepCount = finiteNumber(signature.stepCount, 0);
  const shapeCount = finiteNumber(signature.shapeCount, 0);
  const textBoxCount = finiteNumber(signature.textBoxCount, 0);
  const connectorCount = finiteNumber(signature.connectorCount, 0);
  const rows = finiteNumber(signature.rows, 0);
  const columns = finiteNumber(signature.columns, 0);
  const areaRatio = finiteNumber(layer.areaRatio, 0);
  const hasRelationshipFamily = /hub|spoke|radial|relationship|cycle|ring/.test(primaryKind)
    || /hub|spoke|radial|relationship|cycle|ring/.test(safeString(layer.templateFamily).toLowerCase());
  const hasExplicitLayoutEvidence = /radial|center|hub|spoke/.test(`${layout} ${direction} ${detector}`)
    || stepCount >= 8
    || (rows >= 2 && columns >= 2);
  const hasRadialLayout = hasExplicitLayoutEvidence
    && (/radial|center|hub|spoke/.test(`${layout} ${direction} ${detector}`)
      || motifs.some((motif) => /radial-link|ring-node|arc-arrow/.test(motif)));
  const hasDenseStructure = stepCount >= 8
    || (hasExplicitLayoutEvidence && shapeCount >= 8)
    || (hasExplicitLayoutEvidence && textBoxCount >= 6)
    || (hasExplicitLayoutEvidence && connectorCount >= 5)
    || (rows >= 2 && columns >= 2 && stepCount >= 6);
  return hasRelationshipFamily
    && hasRadialLayout
    && hasDenseStructure
    && areaRatio >= 0.08
    && areaRatio <= 0.58;
}

function strategy({ mode, implementationMode, editableExpectation, visualFidelityBias, bestCandidate, reason, targetMotifs = [], layerStructureSignature = null, expressionPolicy = null, expressionPolicyRepair = null }) {
  const safeTargetMotifs = sanitizeArray(targetMotifs);
  const summarized = bestCandidate ? summarizeCandidate(bestCandidate, { targetMotifs: safeTargetMotifs, layerStructureSignature }) : null;
  const result = {
    provider: "component-render-strategy-v1",
    mode,
    implementationMode,
    editableExpectation,
    visualFidelityBias,
    expressionPolicy,
    targetMotifs: safeTargetMotifs,
    bestCandidate: summarized,
    applicationPlan: buildApplicationPlan({ mode, implementationMode, bestCandidate: summarized, targetMotifs: safeTargetMotifs }),
    reason
  };
  if (expressionPolicyRepair) {
    result.expressionPolicyRepairApplied = true;
    result.expressionPolicyRepair = expressionPolicyRepair;
    result.componentTemplateDisabledByExpressionPolicy = expressionPolicyRepair.disableComponentTemplate === true;
  }
  return result;
}

function normalizeExpressionPolicyRepair(value = null) {
  const source = value && typeof value === "object" ? value : {};
  const repair = source.repair && typeof source.repair === "object" ? source.repair : source;
  const mode = safeString(repair.mode);
  if (!/^(preserve-local-crop|preserve-crop-with-native-overlays|reclassify-structural-diagram-or-component-template|classify-visual-unit-then-rebuild-or-protect|apply-real-plugin-component-or-specialized-native-rebuilder|add-expression-policy-evidence)$/.test(mode)) return null;
  const preserveMode = /^(preserve-local-crop|preserve-crop-with-native-overlays)$/.test(mode);
  return {
    mode,
    violation: safeString(source.violation || repair.violation),
    disableComponentTemplate: preserveMode ? repair.disableComponentTemplate !== false : repair.disableComponentTemplate === true,
    forcePreserveLocalCrop: preserveMode ? repair.forcePreserveLocalCrop !== false : repair.forcePreserveLocalCrop === true,
    allowNativeOverlays: repair.allowNativeOverlays === true || mode === "preserve-crop-with-native-overlays",
    requireSemanticStructureEvidence: repair.requireSemanticStructureEvidence === true,
    reason: safeString(repair.reason || source.reason || "Expression policy repair forces this visual layer away from plugin component replacement.")
  };
}

function buildApplicationPlan({ mode, implementationMode, bestCandidate, targetMotifs = [] }) {
  if (mode === "plugin-component-template") {
    return {
      currentStep: implementationMode === "import-ready" ? "import-plugin-component" : "preserve-source-crop-and-record-component-replacement",
      targetStep: "replace-fidelity-crop-with-editable-plugin-component-when-download-is-available",
      sourceProvider: bestCandidate?.sourceProvider || "",
      componentKind: bestCandidate?.kind || "",
      componentId: bestCandidate?.id || "",
      suitabilityTier: bestCandidate?.suitability?.tier || "",
      suitabilityScore: bestCandidate?.suitability?.score || 0,
      targetMotifs: sanitizeArray(targetMotifs),
      requiresDownload: implementationMode !== "import-ready",
      preservesFidelityNow: implementationMode !== "import-ready"
    };
  }
  if (mode === "preserve-crop-with-component-reference") {
    return {
      currentStep: "preserve-source-crop-with-plugin-style-reference",
      targetStep: "use-reference-for-template-family-color-spacing-and-future-component-match",
      sourceProvider: bestCandidate?.sourceProvider || "",
      componentKind: bestCandidate?.kind || "",
      componentId: bestCandidate?.id || "",
      suitabilityTier: bestCandidate?.suitability?.tier || "",
      suitabilityScore: bestCandidate?.suitability?.score || 0,
      targetMotifs: sanitizeArray(targetMotifs),
      requiresDownload: false,
      preservesFidelityNow: true
    };
  }
  if (mode === "preserve-crop-with-native-overlays") {
    return {
      currentStep: "preserve-source-crop-and-rebuild-detected-overlays-as-native",
      targetStep: "replace-only-non-screenshot-overlay-atoms-with-editable-native-shapes",
      sourceProvider: bestCandidate?.sourceProvider || "",
      componentKind: bestCandidate?.kind || "",
      componentId: bestCandidate?.id || "",
      suitabilityTier: bestCandidate?.suitability?.tier || "",
      suitabilityScore: bestCandidate?.suitability?.score || 0,
      targetMotifs: sanitizeArray(targetMotifs),
      requiresDownload: false,
      preservesFidelityNow: true
    };
  }
  if (mode === "native-rebuild-with-component-style-guide") {
    return {
      currentStep: "rebuild-native-primitives-guided-by-component-style",
      targetStep: "replace-low-confidence-primitives-with-plugin-components-when-match-confidence-improves",
      sourceProvider: bestCandidate?.sourceProvider || "",
      componentKind: bestCandidate?.kind || "",
      componentId: bestCandidate?.id || "",
      suitabilityTier: bestCandidate?.suitability?.tier || "",
      suitabilityScore: bestCandidate?.suitability?.score || 0,
      targetMotifs: sanitizeArray(targetMotifs),
      requiresDownload: false,
      preservesFidelityNow: false
    };
  }
  if (mode === "native-visual-atom-rebuild") {
    return {
      currentStep: implementationMode === "native-specialized"
        ? "rebuild-specialized-native-visual-atoms"
        : "rebuild-native-visual-atoms",
      targetStep: "keep-source-crop-only-for-decorative-or-low-confidence-residuals",
      sourceProvider: bestCandidate?.sourceProvider || "",
      componentKind: bestCandidate?.kind || "",
      componentId: bestCandidate?.id || "",
      suitabilityTier: bestCandidate?.suitability?.tier || "",
      suitabilityScore: bestCandidate?.suitability?.score || 0,
      targetMotifs: sanitizeArray(targetMotifs),
      requiresDownload: false,
      preservesFidelityNow: false
    };
  }
  return {
    currentStep: "preserve-source-crop",
    targetStep: "retry-component-search-after-better-layer-understanding",
    sourceProvider: bestCandidate?.sourceProvider || "",
    componentKind: bestCandidate?.kind || "",
    componentId: bestCandidate?.id || "",
    suitabilityTier: bestCandidate?.suitability?.tier || "",
    suitabilityScore: bestCandidate?.suitability?.score || 0,
    targetMotifs: sanitizeArray(targetMotifs),
    requiresDownload: false,
    preservesFidelityNow: true
  };
}

function summarizeCandidate(candidate = {}, context = {}) {
  const candidateMotifs = sanitizeArray(candidate.targetMotifs);
  const targetMotifs = candidateMotifs.length > 0 ? candidateMotifs : sanitizeArray(context.targetMotifs);
  const ownSignature = sanitizeStructureSignature(candidate.structureSignature);
  const fallbackSignature = sanitizeStructureSignature(context.layerStructureSignature);
  const structureSignature = structureSignatureHasSignals(ownSignature) ? ownSignature : {
    ...ownSignature,
    expressionFamily: ownSignature.expressionFamily || fallbackSignature.expressionFamily,
    primaryKind: ownSignature.primaryKind || fallbackSignature.primaryKind,
    layout: ownSignature.layout || fallbackSignature.layout,
    direction: ownSignature.direction || fallbackSignature.direction,
    motifs: ownSignature.motifs.length > 0 ? ownSignature.motifs : targetMotifs.length > 0 ? targetMotifs : fallbackSignature.motifs,
    shapeCount: ownSignature.shapeCount || fallbackSignature.shapeCount,
    textBoxCount: ownSignature.textBoxCount || fallbackSignature.textBoxCount,
    connectorCount: ownSignature.connectorCount || fallbackSignature.connectorCount,
    pictureCount: ownSignature.pictureCount || fallbackSignature.pictureCount,
    stepCount: ownSignature.stepCount || fallbackSignature.stepCount,
    rows: ownSignature.rows || fallbackSignature.rows,
    columns: ownSignature.columns || fallbackSignature.columns,
    laneCount: ownSignature.laneCount || fallbackSignature.laneCount
  };
  return {
    sourceProvider: safeString(candidate.sourceProvider || candidate.queryProvider),
    kind: safeString(candidate.kind || candidate.queryKind),
    id: safeString(candidate.id),
    title: safeString(candidate.title),
    reuseHint: safeString(candidate.reuseHint),
    candidateScore: finiteNumber(candidate.candidateScore ?? candidate.score, 0),
    confidence: candidateConfidence(candidate),
    suitability: sanitizeSuitability(candidate.suitability),
    structureAlignmentScore: finiteNumber(candidate.structureAlignmentScore, 0),
    roleTags: sanitizeArray(candidate.roleTags),
    targetMotifs,
    structureSignature,
    coverUrl: safeUrl(candidate.coverUrl),
    downloadable: candidate.downloadable === true,
    permission: safeString(candidate.permission)
  };
}

function candidateConfidence(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return 0;
  const score = finiteNumber(candidate.candidateScore ?? candidate.score, 0);
  const base = Math.max(0, Math.min(0.95, score / 100));
  const suitability = sanitizeSuitability(candidate.suitability);
  if (suitability.tier === "rejected") return round(Math.min(base, 0.12));
  if (suitability.tier === "strong") return round(Math.max(base, Math.min(0.98, 0.55 + suitability.score / 220)));
  if (suitability.tier === "weak") return round(Math.min(base, Math.max(0.2, suitability.score / 150)));
  return round(base);
}

function componentLayerTargetMotifs(layer = {}) {
  const understanding = layer.diagramUnderstanding || {};
  const strategyInfo = understanding.componentStrategy || {};
  return uniqueStrings([
    ...sanitizeArray(layer.targetMotifs),
    ...sanitizeArray(layer.plan?.targetMotifs),
    ...sanitizeArray(understanding.targetMotifs),
    ...sanitizeArray(strategyInfo.targetMotifs)
  ]).slice(0, 12);
}

function componentLayerStructureSignature(layer = {}) {
  const understanding = layer.diagramUnderstanding || {};
  const strategyInfo = understanding.componentStrategy || {};
  const planSignature = layer.plan?.structureSignature || {};
  const understandingSignature = understanding.structureSignature || {};
  const strategySignature = strategyInfo.structureSignature || {};
  const motifs = componentLayerTargetMotifs(layer);
  return {
    primaryKind: safeString(planSignature.primaryKind || understandingSignature.primaryKind || understanding.archetype || strategyInfo.templateFamily || layer.templateFamily),
    expressionFamily: safeString(planSignature.expressionFamily || understandingSignature.expressionFamily || understanding.expressionFamily || strategySignature.expressionFamily),
    layout: safeString(planSignature.layout || understandingSignature.layout || strategySignature.layout),
    direction: safeString(planSignature.direction || understandingSignature.direction || strategySignature.direction),
    motifs,
    shapeCount: finiteNumber(understanding.visualAtomCount || planSignature.shapeCount, 0),
    textBoxCount: finiteNumber(
      understanding.textBoxCount || understanding.textSlotCount || layer.textBoxCount || planSignature.textBoxCount || planSignature.textSlotCount,
      0
    ),
    connectorCount: finiteNumber(understanding.connectorCount || understanding.visualConnectorCount || planSignature.connectorCount, 0),
    pictureCount: finiteNumber(planSignature.pictureCount, 0),
    stepCount: finiteNumber(planSignature.stepCount || understandingSignature.stepCount || strategySignature.stepCount, 0),
    rows: finiteNumber(planSignature.rows || understandingSignature.rows || strategySignature.rows, 0),
    columns: finiteNumber(planSignature.columns || understandingSignature.columns || strategySignature.columns, 0),
    laneCount: finiteNumber(planSignature.laneCount || understandingSignature.laneCount || strategySignature.laneCount, 0)
  };
}

function structureSignatureHasSignals(signature = {}) {
  return Boolean(
    safeString(signature.primaryKind)
    || safeString(signature.expressionFamily)
    || safeString(signature.layout)
    || safeString(signature.direction)
    || (Array.isArray(signature.motifs) && signature.motifs.length > 0)
    || finiteNumber(signature.shapeCount, 0) > 0
    || finiteNumber(signature.textBoxCount, 0) > 0
    || finiteNumber(signature.connectorCount, 0) > 0
    || finiteNumber(signature.pictureCount, 0) > 0
    || finiteNumber(signature.stepCount, 0) > 0
    || finiteNumber(signature.rows, 0) > 0
    || finiteNumber(signature.columns, 0) > 0
    || finiteNumber(signature.laneCount, 0) > 0
  );
}

function sanitizeStructureSignature(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    primaryKind: safeString(source.primaryKind),
    expressionFamily: safeString(source.expressionFamily),
    layout: safeString(source.layout),
    direction: safeString(source.direction),
    motifs: sanitizeArray(source.motifs),
    shapeCount: finiteNumber(source.shapeCount, 0),
    textBoxCount: finiteNumber(source.textBoxCount || source.textSlotCount, 0),
    connectorCount: finiteNumber(source.connectorCount, 0),
    pictureCount: finiteNumber(source.pictureCount, 0),
    stepCount: finiteNumber(source.stepCount, 0),
    rows: finiteNumber(source.rows, 0),
    columns: finiteNumber(source.columns, 0),
    laneCount: finiteNumber(source.laneCount, 0)
  };
}

function sanitizeLearningSummary(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  return {
    signals: sanitizeArray(source.signals),
    primaryKind: safeString(source.primaryKind)
  };
}

function sanitizeSuitability(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const tier = /^(strong|weak|rejected)$/.test(safeString(source.tier)) ? safeString(source.tier) : "";
  const score = finiteNumber(source.score, 0);
  return {
    tier,
    score: Math.max(0, Math.min(100, round(score)))
  };
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeUrl(value) {
  const text = safeString(value);
  return /^https?:\/\//i.test(text) ? text : "";
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function sanitizeArray(values = []) {
  return (Array.isArray(values) ? values : [])
    .map((value) => safeString(value))
    .filter(Boolean);
}

function uniqueStrings(values = []) {
  return [...new Set(values.map((value) => safeString(value)).filter(Boolean))];
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  recommendComponentRenderStrategy,
  _private: {
    buildApplicationPlan,
    candidateConfidence,
    classifyGraphicExpressionPolicy,
    sanitizeSuitability,
    isEditableComponentCandidate,
    componentStructureAlignmentScore,
    findBestStructureAlignedEditableCandidate,
    isCompactRelationshipLayer,
    isComponentTemplateEligibleLayer,
    isFidelityCropWithNativeOverlayEligibleLayer,
    isFidelityLockedRasterLayer,
    isStandaloneVisualAssetLayer,
    isRepairStructureEligibleLayer,
    isNativeVisualAtomEligibleLayer,
    isHighCompositionRiskRelationshipLayer,
    isSpecializedRelationshipNativeRebuildReady,
    componentStructureScaleScore,
    componentStructureExpressionFamilyScore,
    componentStructureLayoutScore,
    componentLayerTargetMotifs,
    componentLayerStructureSignature,
    isPolishedReferenceCandidate,
    isStructuredProcessLayer,
    isStructuredRelationshipLayer,
    isStructuredMatrixLayer,
    isMatrixNativeRebuildReadyWithReference,
    normalizeExpressionPolicyRepair,
    shouldAvoidPrimitiveRebuild
  }
};
