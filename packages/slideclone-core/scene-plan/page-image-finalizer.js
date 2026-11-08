"use strict";

// Final page policy is independent of image decoding and diagram detection.
// The composition root supplies those three existing domain operations.
function createPageImageFinalizer(operations = {}) {
  const { normalizeImageLayerMetadata, shouldPreserveTwoPanelChaosIllustrationCrop, markTwoPanelChaosIllustrationPreserved } = operations;
  if ([normalizeImageLayerMetadata, shouldPreserveTwoPanelChaosIllustrationCrop, markTwoPanelChaosIllustrationPreserved].some((operation) => typeof operation !== "function")) {
    throw new TypeError("page image finalizer operations are invalid");
  }
  function normalizePageImageMetadata(page = {}) {
    if (!page || typeof page !== "object") return page;
    page.images = (Array.isArray(page.images) ? page.images : [])
      .map((image) => normalizeImageLayerMetadata(image))
      .map((image) => normalizeFinalPreservedImageStrategy(image));
    suppressUnreplacedComponentTemplateOverlays(page);
    return page;
  }

  function suppressUnreplacedComponentTemplateOverlays(page = {}) {
    const images = Array.isArray(page.images) ? page.images : [];
    const suppressedLayerIds = new Set();
    page.images = images.map((image) => {
      if (!shouldSuppressUnreplacedComponentTemplateOverlay(image)) return image;
      for (const id of componentTemplateLayerIdsForImage(image)) suppressedLayerIds.add(id);
      return normalizeFinalPreservedImageStrategy({
        ...image,
        source: {
          ...(image.source || {}),
          componentTemplateGroupApplied: false,
          componentTemplateNativeShapes: 0,
          componentTemplateNativeTextBoxes: 0,
          componentTemplateNativePictures: 0,
          componentTemplateCropReplacedByNative: false,
          componentTemplateCropReplacementReason: "component-template-overlay-suppressed-because-source-crop-remains-required",
          nativeRebuildDeferredReason: image.source?.nativeRebuildDeferredReason
            || "component template overlay was suppressed because the source fidelity crop is still required"
        }
      });
    });
    if (suppressedLayerIds.size === 0) return false;
    page.shapes = (Array.isArray(page.shapes) ? page.shapes : [])
      .filter((shape) => !isSuppressedComponentTemplateOverlayPart(shape, suppressedLayerIds));
    page.textBoxes = (Array.isArray(page.textBoxes) ? page.textBoxes : [])
      .filter((textBox) => !isSuppressedComponentTemplateOverlayPart(textBox, suppressedLayerIds));
    return true;
  }

  function shouldSuppressUnreplacedComponentTemplateOverlay(image = {}) {
    const source = image.source || {};
    if (source.componentTemplateGroupApplied !== true) return false;
    if (source.componentTemplateCropReplacedByNative === true) return false;
    const reason = String(source.componentTemplateCropReplacementReason || "").toLowerCase();
    if (!/requires-fidelity-crop|native-parts-incomplete|native-matrix-cells-incomplete|source-crop|component-template-group-not-found|generated-geometry-outside-source-crop|applied-plugin-(?:replay|motif)-keeps-source-crop/.test(reason)) return false;
    return shouldNormalizeFinalPreservedCropStrategy(image);
  }

  function componentTemplateLayerIdsForImage(image = {}) {
    const id = String(image.id || "");
    const source = image.source || {};
    const ids = new Set([id, String(source.layerSourceId || ""), String(source.layer?.id || "")].filter(Boolean));
    [
      /^(.*?)-sketch-residual$/,
      /^(.*?)-split-\d+$/,
      /^(.*?)-residual-\d+$/,
      /^(.*?)-wand-icon$/
    ].forEach((pattern) => {
      const match = id.match(pattern);
      if (match?.[1]) ids.add(match[1]);
    });
    return ids;
  }

  function isSuppressedComponentTemplateOverlayPart(item = {}, suppressedLayerIds = new Set()) {
    const source = item.source || {};
    if (source.detector !== "plugin-component-template-native-shape"
      && source.componentTemplateGroupApplied !== true
      && !source.componentTemplatePart) return false;
    const layerSourceId = String(source.layerSourceId || source.componentReplacementLayerSourceId || "");
    return suppressedLayerIds.has(layerSourceId);
  }

  function normalizeFinalPreservedImageStrategy(image = {}) {
    if (!image || typeof image !== "object") return image;
    const source = image.source || {};
    if (source.editable === true) return image;
    if (shouldPreserveTwoPanelChaosIllustrationCrop(image)) {
      return markTwoPanelChaosIllustrationPreserved({ ...image, source: { ...(image.source || {}) } });
    }
    const mode = source.componentRenderStrategy?.mode || source.layer?.componentRenderStrategy?.mode || "";
    const hasAppliedTemplate = source.componentTemplateGroupApplied === true
      || Number(source.componentTemplateNativeShapes || 0) > 0
      || Number(source.componentTemplateNativeTextBoxes || 0) > 0
      || Number(source.componentTemplateNativePictures || 0) > 0;
    if (hasAppliedTemplate || (mode && mode !== "plugin-component-template")) return image;
    if (!shouldNormalizeFinalPreservedCropStrategy(image)) return image;
    const cleanSource = { ...source };
    for (const key of [
      "componentTemplateGroupApplied", "componentTemplateFamilyApplied", "componentTemplateGroupId",
      "componentTemplateGroupScore", "componentTemplateAssetMotifReady", "componentTemplateTargetMotifs",
      "componentTemplateWholeProcessApplied", "componentTemplateNativeShapes", "componentTemplateNativeTextBoxes",
      "componentTemplateNativePictures", "componentTemplateApplicationMode", "componentTemplateCropReplacedByNative",
      "componentTemplateCropReplacementReason"
    ]) delete cleanSource[key];
    const nextSource = {
      ...cleanSource,
      componentRenderStrategy: {
        ...(source.componentRenderStrategy || {}),
        mode: "preserve-local-crop",
        implementationMode: "native-generator-safe-fallback",
        editableExpectation: finalPreservedCropEditableExpectation(image),
        visualFidelityBias: "fidelity-first",
        reason: source.componentRenderStrategy?.reason && mode !== "plugin-component-template"
          ? source.componentRenderStrategy.reason
          : "final image is an intentional preserved visual unit without a verified editable component replacement"
      }
    };
    if (nextSource.layer && typeof nextSource.layer === "object") {
      nextSource.layer = {
        ...nextSource.layer,
        componentRenderStrategy: {
          ...(nextSource.layer.componentRenderStrategy || {}),
          ...nextSource.componentRenderStrategy
        }
      };
    }
    return { ...image, source: nextSource };
  }

  function shouldNormalizeFinalPreservedCropStrategy(image = {}) {
    const source = image.source || {};
    const layer = source.layer || {};
    const text = [
      image.type,
      source.detector,
      layer.detector,
      source.layerType,
      layer.layerType,
      source.expressionForm,
      layer.expressionForm,
      source.expressionSubtype,
      layer.expressionSubtype,
      source.recommendedAction,
      layer.recommendedAction,
      source.reason,
      source.nonEditableReason
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    if (/full-slide-raster|full-page-raster/.test(text)) return false;
    if (/fidelity|crop|preserved|local|residual|underlay|background/.test(text)
      && /screenshot|document|ui|icon|illustration|decorative|brand|logo|photo|sketch|residual|protected|minimum|示意|图标|截图|插画/.test(text)) {
      return true;
    }
    return /fidelity-(?:crop|background)/.test(String(image.type || "").toLowerCase());
  }

  function finalPreservedCropEditableExpectation(image = {}) {
    const source = image.source || {};
    const layer = source.layer || {};
    const text = [
      source.layerType,
      layer.layerType,
      source.expressionForm,
      layer.expressionForm,
      source.expressionSubtype,
      layer.expressionSubtype,
      source.detector,
      layer.detector
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    if (/screenshot|document|ui|screen|prototype/.test(text)) return "raster-screenshot-or-document-with-editable-text-overlays";
    if (/decorative|background|brand|logo/.test(text)) return "decorative-or-brand-visual-preserved-under-editable-slide-content";
    return "standalone-visual-asset-preserved-as-movable-crop";
  }
  return Object.freeze({ normalizePageImageMetadata });
}

module.exports = { createPageImageFinalizer };
