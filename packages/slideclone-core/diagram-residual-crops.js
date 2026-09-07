"use strict";

const { annotateResidualSplitRejection, slidePtBoxToLocalPxBox, localPxBoxToSlidePt, splitResidualLayerSource } = require("./structured-residual-splitting");
const path = require("path");
const { cropPng, writePng, readPng } = require("./png");
const { isGraphicForeground, expandPxBox } = require("./residual-component-analysis");
const { pixel, rgbToHsl, round, constrainPtBox } = require("./raster-native-detection");
const { applyMinimumUnitCropRenderStrategy } = require("./image-layer-metadata");
const { eraseMasks } = require("./residual-primitive-erasure");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function classifyImageExpressionForm(image) {
  const source = image?.source || {};
  if (source.specializedNativeHybridResidual === true) return "complex-diagram";
  const detector = String(source.detector || "").toLowerCase();
  const reason = String(source.reason || source.nonEditableReason || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const text = `${detector} ${reason} ${layerType}`;
  const box = image?.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const aspect = w / Math.max(1, h);
  const y = Number(box.y || 0);
  if (/decorative-page-chrome/.test(text)) return "decorative-page-chrome";
  if (/decorative-cover-background/.test(text)) return "decorative-cover-visual";
  if (/foreground-graphic-crop/.test(detector) && w >= 850 && h >= 150 && h <= 340 && y <= 70) return "decorative-cover-visual";
  if (/foreground-graphic-crop/.test(detector) && aspect >= 4.2 && h <= 70 && w <= 420) return "brand-mark";
  if (/structured-data-chart/.test(text)) return "data-chart";
  if (/kpi|evidence|chart/.test(text)) return "chart-snapshot";
  if (/screenshot|screen|webpage|document-preview|prd-screenshot|ui|prototype/.test(text)) return "screenshot-or-document";
  if (/sketch|sticky/.test(text)) return "icon-or-illustration";
  if (/bottom-banner|value-banner|banner/.test(text)) return "value-banner";
  if (/wms-chain|collaboration-flow|flow|chain|diagram|connector|network|hierarchy|triangle|topology|route/.test(text)) return "complex-diagram";
  if (/comparison-matrix|table-zone|table-grid|grid|quadrant|matrix/.test(text)) return "table-or-matrix";
  if (/illustration|icon|gem|wand|cloud|emblem|cycle/.test(text)) return "icon-or-illustration";
  if (/linear-process|skill-chain|stage|horizontal-stage/.test(text)) return "linear-process-diagram";
  if (/foreground-aggregate|foreground-graphic|visual-cluster|content-graphic|underlay/.test(text)) return "general-visual-layer";
  return "unknown-visual";
}

function classifyImageExpressionSubtype(image) {
  const source = image?.source || {};
  if (source.specializedNativeHybridResidual === true) {
    return String(source.specializedNativeHybridResidualKind || "specialized-structural-hybrid-residual");
  }
  const detector = String(source.detector || "").toLowerCase();
  const reason = String(source.reason || source.nonEditableReason || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const text = `${detector} ${reason} ${layerType}`;
  const form = source.expressionForm || classifyImageExpressionForm(image);
  if (form === "complex-diagram") {
    if (/wms-chain|route/.test(text)) return "route-chain-diagram";
    if (/collaboration-flow/.test(text)) return "collaboration-flow-diagram";
    if (/two-panel/.test(text)) return "two-panel-diagram";
    if (/top-complex/.test(text)) return "top-complex-diagram";
    if (/mixed-diagram/.test(text)) return "mixed-diagram-hybrid";
    if (/saturated-diagram/.test(text)) return "saturated-multi-flow-diagram";
    if (/network|hierarchy|triangle|topology/.test(text)) return "native-topology-candidate";
    return "dense-complex-diagram";
  }
  if (form === "table-or-matrix") {
    if (/comparison-matrix/.test(text)) return "comparison-matrix";
    if (/quadrant/.test(text)) return "quadrant-matrix";
    if (/table-grid|table-zone|grid/.test(text)) return "table-grid";
    return "matrix-like-region";
  }
  if (form === "screenshot-or-document") {
    if (/prd-screenshot|document-preview/.test(text)) return "document-or-prd-preview";
    if (/process/.test(text)) return "screenshot-like-process";
    if (/prototype|ui|screen|webpage/.test(text)) return "ui-screenshot";
    return "screenshot-or-document-region";
  }
  if (form === "chart-snapshot") return /kpi|evidence/.test(text) ? "kpi-chart-snapshot" : "chart-snapshot";
  if (form === "value-banner") return "value-banner-strip";
  if (form === "decorative-cover-visual") return /background/.test(text) ? "cover-background" : "cover-decoration";
  if (form === "decorative-page-chrome") return "page-chrome-background";
  if (form === "brand-mark") return "brand-mark-strip";
  if (form === "icon-or-illustration") return /icon/.test(text) ? "icon" : "illustration";
  if (form === "linear-process-diagram") return "linear-process";
  if (form === "data-chart") return "structured-data-chart";
  return form;
}

function recommendExpressionHandling(image) {
  const source = image?.source || {};
  const form = source.expressionForm || classifyImageExpressionForm(image);
  const subtype = source.expressionSubtype || classifyImageExpressionSubtype(image);
  if (form === "data-chart") return "emit-native-editable-chart";
  if (form === "linear-process-diagram") return "rebuild-with-native-shapes-and-connectors";
  if (form === "table-or-matrix") return "rebuild-native-table-grid-when-cells-are-axis-aligned";
  if (form === "value-banner" || form === "decorative-cover-visual" || form === "decorative-page-chrome" || form === "brand-mark") {
    return "prefer-native-background-shape-or-keep-local-crop";
  }
  if (form === "screenshot-or-document") return "keep-local-crop-and-overlay-external-text-only";
  if (form === "icon-or-illustration") return "match-icon-library-or-keep-local-crop";
  if (form === "chart-snapshot") return "keep-crop-until-source-data-or-axis-series-detected";
  if (form === "complex-diagram") {
    if (subtype === "native-topology-candidate") return "attempt-native-topology-rebuild-with-fidelity-gate";
    if (subtype === "mixed-diagram-hybrid") return "split-native-with-residual-crop";
    return "preserve-fidelity-crop-until-subtype-rebuilder-is-confident";
  }
  return "manual-review-before-native-rebuild";
}

function reclassifyImageSource(source, box, overrides = {}) {
  const hasForcedExpressionForm = Object.prototype.hasOwnProperty.call(overrides, "expressionForm");
  const hasForcedExpressionSubtype = Object.prototype.hasOwnProperty.call(overrides, "expressionSubtype");
  const hasForcedRecommendedAction = Object.prototype.hasOwnProperty.call(overrides, "recommendedAction");
  const next = {
    ...(source || {}),
    ...overrides
  };
  delete next.expressionForm;
  delete next.expressionSubtype;
  delete next.recommendedAction;
  const probe = { box, source: next };
  next.expressionForm = classifyImageExpressionForm(probe);
  next.expressionSubtype = classifyImageExpressionSubtype(probe);
  next.recommendedAction = recommendExpressionHandling(probe);
  if (hasForcedExpressionForm) next.expressionForm = overrides.expressionForm;
  if (hasForcedExpressionSubtype) next.expressionSubtype = overrides.expressionSubtype;
  if (hasForcedRecommendedAction) next.recommendedAction = overrides.recommendedAction;
  return next;
}

function splitNetworkDiagramCenterCrop(image, residual, assetFile, irDir) {
  const centerBox = image.source?.networkCenterBox;
  if (!centerBox || !image.box) {
    annotateResidualSplitRejection(image, { reason: "missing-network-center" });
    return [];
  }
  const localBox = slidePtBoxToLocalPxBox(centerBox, image.box, residual);
  if (localBox.w * localBox.h / Math.max(1, residual.width * residual.height) > 0.45) {
    annotateResidualSplitRejection(image, { reason: "network-center-too-large", componentCount: 1, totalArea: localBox.w * localBox.h / Math.max(1, residual.width * residual.height) });
    return [];
  }
  const crop = cropPng(residual, localBox);
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const file = path.join(outDir, `${base}-network-center.png`);
  writePng(file, crop);
  return [{
    id: `${image.id || "network"}-center-residual`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
    box: centerBox,
    source: reclassifyImageSource(image.source || {}, centerBox, {
      layer: splitResidualLayerSource(image.source?.layer, centerBox, "network-center-residual-crop"),
      detector: "network-center-residual-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      residualSplit: true,
      residualSplitIndex: 0,
      residualSplitCount: 1,
      originalCropBox: image.box,
      nonEditableReason: "complex center emblem preserved after native network node and ray reconstruction"
    })
  }];
}

function splitPrdGenerationFlowResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.prdGenerationResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-prd-flow-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-prd-flow-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "prd-flow"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "prd-generation-flow-residual-crop"),
        detector: "prd-generation-flow-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "prd-generation-preserved-screenshot",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "screenshot-like input panels preserved after native PRD document flow reconstruction"
      })
    });
  }
  return splitImages;
}

function splitPrototypeValidationFlowResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.prototypeValidationResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-prototype-validation-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const isWandIcon = /wand/i.test(String(region.name || ""));
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-prototype-validation-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "prototype-validation"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "prototype-validation-flow-residual-crop"),
        detector: "prototype-validation-flow-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "prototype-validation-preserved-visual",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        ...(isWandIcon ? {
          expressionForm: "icon-or-illustration",
          expressionSubtype: "magic-wand",
          recommendedAction: "keep-local-crop",
          intentionalMinimumUnitCrop: true,
          protectedMinimumUnit: true,
          skipVisualAtomRebuild: true,
          nonEditableReason: "magic wand retained as one source-faithful icon after native prototype-validation structure reconstruction"
        } : {
          expressionForm: "ui-screenshot",
          expressionSubtype: "prototype-validation-screenshot",
          recommendedAction: "keep-local-crop",
          intentionalMinimumUnitCrop: true,
          protectedMinimumUnit: true,
          skipVisualAtomRebuild: true,
          nonEditableReason: "screenshot region retained after native prototype-validation connector reconstruction"
        })
      })
    });
  }
  return splitImages;
}

function splitDemandUnderstandingFlowResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.demandUnderstandingResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-demand-understanding-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-demand-understanding-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "demand-understanding"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "demand-understanding-flow-residual-crop"),
        detector: "demand-understanding-flow-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "demand-understanding-preserved-visual",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "input material cluster and lens/funnel graphic preserved after native demand-understanding output reconstruction"
      })
    });
  }
  return splitImages;
}

function splitFunnelHubResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.funnelHubResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-funnel-hub-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-funnel-hub-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "funnel-hub"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "funnel-hub-residual-crop"),
        detector: "funnel-hub-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "funnel-hub-preserved-icons",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        recommendedAction: "keep-local-crop",
        nonEditableReason: "document, screenshot, and prototype icons preserved after native funnel hub reconstruction"
      })
    });
  }
  return splitImages;
}

function assetHubCycleNativeComponentMetadata(base, role, part) {
  const safeBase = safeComponentToken(base || "asset-hub-cycle");
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `${safeBase}-hub-spoke-${safeRole}`,
    nativeComponentParentId: `${safeBase}-hub-spoke`,
    nativeComponentArchetype: role === "center" ? "hub-spoke-center" : "hub-spoke-endpoint",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role || "unknown",
    nativeComponentPart: part || "detail"
  };
}

function splitAssetHubCycleResidualCrops(image, residual, assetFile, irDir) {
  if (image.source?.dropErasedResidualAfterNativeRebuild === true
    && image.source?.aiSkillsClosedLoopCycleObjectified === true) {
    return [];
  }
  let regions = image.source?.assetHubCycleResidualBoxes || [];
  if (image.source?.assetHubCycleInputIconsObjectified === true) {
    regions = regions.filter((region) => !/^left-/.test(String(region?.name || "")));
  }
  if (image.source?.assetHubCycleOutputGemsObjectified === true) {
    regions = regions.filter((region) => !/^right-/.test(String(region?.name || "")));
  }
  if (image.source?.assetHubCycleCenterShellObjectified === true) {
    regions = regions.filter((region) => !/^center-/.test(String(region?.name || "")));
  }
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-asset-hub-cycle-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  const centerTextEraseBoxes = Array.isArray(image.source?.assetHubCycleCenterTextEraseBoxes)
    ? image.source.assetHubCycleCenterTextEraseBoxes
    : [];
  const residualForSplit = centerTextEraseBoxes.length > 0
    ? eraseMasks(residual, centerTextEraseBoxes.map((box) => slidePtBoxToLocalPxBox({
      x: Number(box.x || 0) - 5,
      y: Number(box.y || 0) - 4,
      w: Number(box.w || 0) + 10,
      h: Number(box.h || 0) + 8
    }, image.box, residual)))
    : residual;
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residualForSplit, localBox);
    const file = path.join(outDir, `${base}-asset-hub-cycle-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "asset-hub-cycle"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "asset-hub-cycle-residual-crop"),
        detector: "asset-hub-cycle-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "asset-hub-cycle-preserved-endpoint-icons-only",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        ...assetHubCycleNativeComponentMetadata(
          image.id || "asset-hub-cycle",
          String(region.name || "").replace(/-(?:input|output)-icon$/, "").replace(/-custom-shield-shell$/, ""),
          "visual"
        ),
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        // These are deliberately retained icon/illustration atoms, not UI
        // screenshots. Preserve that distinction for future routing/audits.
        expressionForm: "icon-or-illustration",
        expressionSubtype: /^center-/.test(String(region.name || ""))
          ? "custom-shield-illustration"
          : "hub-spoke-endpoint-icon",
        recommendedAction: "keep-local-crop",
        nonEditableReason: "endpoint icons and custom shield shell preserved as minimum-unit crops after text and connectors are rebuilt natively"
      })
    });
  }
  return splitImages;
}

function splitInputOutputSplitResidualCrops(image, residual, assetFile, irDir) {
  if (image.source?.inputOutputSplitLeftNetworkObjectified === true && image.source?.dropErasedResidualAfterNativeRebuild === true) {
    return [];
  }
  const regions = image.source?.inputOutputSplitResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-input-output-split-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-input-output-split-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "input-output-split"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "input-output-split-residual-crop"),
        detector: "input-output-split-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "input-output-preserved-left-network",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "left-side input complexity network preserved after native portal output reconstruction"
      })
    });
  }
  return splitImages;
}

function splitProductBrainVisionResidualCrops(image, residual, assetFile, irDir) {
  if (image.source?.dropErasedResidualAfterNativeRebuild === true) return [];
  const regions = image.source?.productBrainVisionResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-product-brain-vision-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  return regions.map((region, index) => {
    const original = readPng(assetFile);
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, original);
    let crop = cropPng(original, localBox);
    if (region.mask === "ellipse") crop = applyEllipseAlphaMask(crop, {
      transparentTopRatio: region.transparentTopRatio
    });
    const file = path.join(outDir, `${base}-product-brain-vision-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    return {
      id: `${image.id || "product-brain-vision"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      drawAfterShapes: region.drawAfterShapes === true,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "product-brain-vision-residual-crop"),
        detector: "product-brain-vision-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "product-brain-vision-center-map",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "dense central product map preserved as a local fidelity crop after native lens and mosaic reconstruction"
      })
    };
  });
}

function applyEllipseAlphaMask(image, options = {}) {
  const rgba = Buffer.from(image.rgba);
  const rx = Math.max(1, image.width / 2);
  const ry = Math.max(1, image.height / 2);
  const cx = (image.width - 1) / 2;
  const cy = (image.height - 1) / 2;
  const transparentTopPx = Math.max(0, Math.min(0.5, Number(options.transparentTopRatio || 0))) * image.height;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4 + 3;
      if (y < transparentTopPx) {
        rgba[offset] = 0;
        continue;
      }
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const distance = dx * dx + dy * dy;
      if (distance > 1) {
        rgba[offset] = 0;
      } else if (distance > 0.96) {
        const alpha = Math.max(0, Math.min(255, Math.round((1 - distance) / 0.04 * 255)));
        rgba[offset] = Math.min(rgba[offset], alpha);
      }
    }
  }
  return { width: image.width, height: image.height, rgba };
}

function splitToolGapPlatformResidualCrops(image, residual, assetFile, irDir) {
  const regions = toolGapPlatformResidualRegions(image);
  const base = path.basename(assetFile, path.extname(assetFile));
  const dir = path.dirname(assetFile);
  const out = [];
  for (const region of regions) {
    const pxBox = localResidualPxBox(region.box, image.box, residual);
    if (pxBox.w < 20 || pxBox.h < 20) continue;
    const crop = cropPng(residual, pxBox);
    const file = path.join(dir, `${base}-tool-gap-${region.name}.png`);
    writePng(file, crop);
    out.push({
      id: `${image.id || "tool-gap-layer"}-${region.name}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || dir, file).replace(/\\/g, "/"),
      box: region.box,
      source: {
        ...(image.source || {}),
        detector: "tool-gap-platform-residual-crop",
        parentDetector: image.source?.detector || null,
        residualSplitMode: "tool-gap-platform-semantic-regions",
        residualRegion: region.name,
        residualCrop: true,
        nativeRebuild: true,
        editable: false,
        layer: splitResidualLayerSource(image.source?.layer, region.box, "tool-gap-platform-residual-crop"),
        nonEditableReason: "tool-gap platform diagram split into semantic local fidelity regions after native reconstruction"
      }
    });
  }
  if (out.length < 3) return [];
  image.source = {
    ...(image.source || {}),
    toolGapPlatformSplit: true,
    toolGapPlatformSplitRegions: out.length
  };
  return out;
}

function toolGapPlatformResidualRegions(image) {
  const box = image.box || {};
  const bounds = { x: 0, y: 0, w: DEFAULT_SLIDE.widthPt, h: DEFAULT_SLIDE.heightPt };
  return [
    {
      name: "manual-row",
      box: constrainPtBox({ x: box.x, y: box.y + box.h * 0.005, w: box.w, h: box.h * 0.285 }, bounds)
    },
    {
      name: "ai-status-row",
      box: constrainPtBox({ x: box.x, y: box.y + box.h * 0.335, w: box.w, h: box.h * 0.245 }, bounds)
    },
    {
      name: "platform-row",
      box: constrainPtBox({ x: box.x, y: box.y + box.h * 0.660, w: box.w, h: box.h * 0.330 }, bounds)
    }
  ];
}

function splitProcessWithScreenshotsResidualCrops(image, residual, assetFile, irDir) {
  if (image?.source?.productWorkflowEndpointObjectified === true) {
    image.source = {
      ...(image.source || {}),
      processWithScreenshotsSplit: true,
      processWithScreenshotsSplitRegions: 0,
      dropErasedResidualAfterNativeRebuild: true
    };
    return [];
  }
  const regions = processWithScreenshotsResidualRegions(image);
  const base = path.basename(assetFile, path.extname(assetFile));
  const dir = path.dirname(assetFile);
  const out = [];
  for (const region of regions) {
    const pxBox = localResidualPxBox(region.box, image.box, residual);
    if (pxBox.w < 20 || pxBox.h < 20) continue;
    const crop = cropPng(residual, pxBox);
    const file = path.join(dir, `${base}-process-${region.name}.png`);
    writePng(file, crop);
    out.push({
      id: `${image.id || "process-layer"}-${region.name}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || dir, file).replace(/\\/g, "/"),
      box: region.box,
      source: {
        ...(image.source || {}),
        detector: "process-with-screenshots-residual-crop",
        parentDetector: image.source?.detector || null,
        residualSplitMode: "process-with-screenshots-semantic-regions",
        residualRegion: region.name,
        residualCrop: true,
        nativeRebuild: true,
        editable: false,
        layer: splitResidualLayerSource(image.source?.layer, region.box, "process-with-screenshots-residual-crop"),
        nonEditableReason: "process-with-screenshots diagram split into semantic local fidelity regions"
      }
    });
  }
  const minimumResidualRegions = image.source?.productWorkflowIconProcessObjectified === true
    ? 2
    : image.source?.processWithScreenshotsLeftIllustrationObjectified === true
    ? 2
    : (image.source?.processWithScreenshotsFlowObjectified === true ? 3 : 4);
  if (out.length < minimumResidualRegions) return [];
  image.source = {
    ...(image.source || {}),
    processWithScreenshotsSplit: true,
    processWithScreenshotsSplitRegions: out.length
  };
  return out;
}

function localResidualPxBox(regionBox, parentBox, residual) {
  const scaleX = residual.width / Math.max(1, Number(parentBox.w || 1));
  const scaleY = residual.height / Math.max(1, Number(parentBox.h || 1));
  const x = Math.max(0, Math.round((Number(regionBox.x || 0) - Number(parentBox.x || 0)) * scaleX));
  const y = Math.max(0, Math.round((Number(regionBox.y || 0) - Number(parentBox.y || 0)) * scaleY));
  const w = Math.max(1, Math.round(Number(regionBox.w || 0) * scaleX));
  const h = Math.max(1, Math.round(Number(regionBox.h || 0) * scaleY));
  return {
    x,
    y,
    w: Math.min(w, Math.max(1, residual.width - x)),
    h: Math.min(h, Math.max(1, residual.height - y))
  };
}

function processWithScreenshotsResidualRegions(image) {
  const box = image.box || {};
  const bounds = { x: 0, y: 0, w: DEFAULT_SLIDE.widthPt, h: DEFAULT_SLIDE.heightPt };
  if (image?.source?.productWorkflowIconProcessObjectified === true) {
    return [
      {
        name: "left-chaos-input",
        box: constrainPtBox({ x: box.x + box.w * 0.030, y: box.y, w: box.w * 0.180, h: box.h * 0.500 }, bounds)
      },
      {
        name: "right-standard-output",
        box: constrainPtBox({ x: box.x + box.w * 0.825, y: box.y, w: box.w * 0.165, h: box.h * 0.510 }, bounds)
      }
    ];
  }
  const regions = [
    { name: "left-illustration", box: constrainPtBox({ x: box.x, y: box.y, w: box.w * 0.47, h: box.h * 0.82 }, bounds) },
    { name: "left-explanation", box: constrainPtBox({ x: box.x, y: box.y + box.h * 0.82, w: box.w * 0.47, h: box.h * 0.18 }, bounds) },
    { name: "right-flow", box: constrainPtBox({ x: box.x + box.w * 0.52, y: box.y + box.h * 0.05, w: box.w * 0.48, h: box.h * 0.77 }, bounds) },
    { name: "right-explanation", box: constrainPtBox({ x: box.x + box.w * 0.54, y: box.y + box.h * 0.82, w: box.w * 0.46, h: box.h * 0.18 }, bounds) },
    { name: "center-divider", box: constrainPtBox({ x: box.x + box.w * 0.50, y: box.y, w: box.w * 0.015, h: box.h }, bounds) }
  ];
  if (image?.source?.processWithScreenshotsFlowObjectified === true) {
    let filtered = regions.filter((region) => region.name !== "right-flow");
    if (image?.source?.processWithScreenshotsLeftIllustrationObjectified === true) {
      if (image?.source?.processWithScreenshotsChaosCoreObjectified === true) {
        filtered.unshift(
          {
            name: "left-chaos-texture-top",
            box: constrainPtBox({ x: box.x + box.w * 0.105, y: box.y + box.h * 0.125, w: box.w * 0.340, h: box.h * 0.215 }, bounds)
          },
          {
            name: "left-chaos-texture-mid",
            box: constrainPtBox({ x: box.x + box.w * 0.105, y: box.y + box.h * 0.340, w: box.w * 0.340, h: box.h * 0.215 }, bounds)
          },
          {
            name: "left-chaos-texture-bottom",
            box: constrainPtBox({ x: box.x + box.w * 0.105, y: box.y + box.h * 0.555, w: box.w * 0.340, h: box.h * 0.215 }, bounds)
          }
        );
      } else {
        filtered.unshift({
          name: "left-chaos-core",
          box: constrainPtBox({ x: box.x + box.w * 0.105, y: box.y + box.h * 0.125, w: box.w * 0.340, h: box.h * 0.650 }, bounds)
        });
      }
      filtered = filtered.filter((region) => region.name !== "left-illustration");
    }
    return filtered;
  }
  return regions;
}

function splitValueQuadrantResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.valueQuadrantResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-value-quadrant-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-value-quadrant-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "value-quadrant"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "value-quadrant-icon-crop"),
        detector: "value-quadrant-icon-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "value-quadrant-preserved-gem-icons",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "gem icon preserved after native value quadrant text and divider reconstruction"
      })
    });
  }
  return splitImages;
}

function splitReviewRiskGateFlowResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.reviewRiskGateResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-review-risk-gate-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-review-risk-gate-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "review-risk-gate"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "review-risk-gate-flow-residual-crop"),
        detector: "review-risk-gate-flow-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "review-risk-gate-preserved-visual",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "review-risk-gate-scanner-gem",
        recommendedAction: "match-icon-library-or-keep-local-crop",
        protectedMinimumUnit: true,
        nonEditableReason: "scanner gem preserved as the smallest faithful pictorial unit after native review risk gate reconstruction"
      })
    });
  }
  return splitImages;
}

function splitSkillChainOverviewResidualCrops(image, residual, assetFile, irDir) {
  const regions = image.source?.skillChainResidualBoxes || [];
  if (!Array.isArray(regions) || regions.length === 0) {
    annotateResidualSplitRejection(image, { reason: "missing-skill-chain-residual-regions" });
    return [];
  }
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const localBox = slidePtBoxToLocalPxBox(region.box, image.box, residual);
    const crop = cropPng(residual, localBox);
    const file = path.join(outDir, `${base}-skill-chain-${region.name || index}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(localBox, residual, image.box);
    splitImages.push({
      id: `${image.id || "skill-chain-overview"}-${region.name || index}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source: reclassifyImageSource(image.source || {}, slideBox, {
        layer: splitResidualLayerSource(image.source?.layer, slideBox, "skill-chain-overview-residual-crop"),
        detector: "skill-chain-overview-residual-crop",
        parentDetector: image.source?.detector || null,
        parentImageId: image.id || null,
        residualSplit: true,
        residualSplitMode: "skill-chain-preserved-visual",
        residualSplitIndex: index,
        residualSplitCount: regions.length,
        originalCropBox: image.box,
        nonEditableReason: "left material cloud, engine core, and document screenshot preserved after native skill-chain reconstruction"
      })
    });
  }
  return splitImages;
}

function splitTriangleTopologyResidualCrops(image, residual, assetFile, irDir) {
  const regions = triangleTopologyResidualRegions(residual, {
    includeCenter: image.source?.triangleTopologyCenterTextObjectified !== true,
    topTextObjectified: image.source?.triangleTopologyTopTextObjectified === true,
    bottomTextObjectified: image.source?.triangleTopologyBottomTextObjectified === true,
    sideTextObjectified: image.source?.triangleTopologySideTextObjectified === true,
    nodesObjectified: image.source?.triangleTopologyNodesObjectified === true,
    visualConnectorsObjectified: image.source?.triangleTopologyVisualConnectorsObjectified === true
  });
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const splitImages = [];
  for (let index = 0; index < regions.length; index += 1) {
    const region = regions[index];
    const box = trimResidualRegionBox(residual, region.box) || region.box;
    const areaRatio = box.w * box.h / Math.max(1, residual.width * residual.height);
    if (areaRatio < 0.006 || areaRatio > 0.32 || box.w < 24 || box.h < 18) continue;
    const isIconNode = /node/.test(String(region.name || ""));
    const rawCrop = cropPng(residual, box);
    const purified = isIconNode
      ? purifyTriangleTopologyNodeCrop(rawCrop, region.name)
      : { image: rawCrop, trimBox: { x: 0, y: 0, w: rawCrop.width, h: rawCrop.height }, purified: false };
    const crop = purified.image;
    const finalBox = {
      x: box.x + purified.trimBox.x,
      y: box.y + purified.trimBox.y,
      w: purified.trimBox.w,
      h: purified.trimBox.h
    };
    const file = path.join(outDir, `${base}-triangle-topology-${region.name}.png`);
    writePng(file, crop);
    const slideBox = localPxBoxToSlidePt(finalBox, residual, image.box);
    const source = reclassifyImageSource(image.source || {}, slideBox, {
      layer: splitResidualLayerSource(image.source?.layer, slideBox, "triangle-topology-residual-crop"),
      detector: "triangle-topology-residual-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      residualSplit: true,
      residualSplitMode: "triangle-topology-region",
      residualSplitRegion: region.name,
      residualSplitIndex: splitImages.length,
      originalCropBox: image.box,
      expressionForm: isIconNode ? "icon-or-illustration" : "complex-diagram",
      expressionSubtype: isIconNode ? "triangle-topology-icon-node" : "triangle-topology-residual",
      recommendedAction: isIconNode ? "match-icon-library-or-keep-local-crop" : "preserve-local-crop",
      protectedMinimumUnit: isIconNode ? true : undefined,
      minimumUnitCropPurified: isIconNode ? purified.purified : undefined,
      minimumUnitDominantHue: isIconNode ? purified.dominantHue : undefined,
      nonEditableReason: isIconNode
        ? "icon-like gem node preserved as a local crop unless a confident plugin/vector component match is available"
        : "remaining triangle topology detail preserved after native triangle reconstruction",
      ...(isIconNode ? triangleTopologyNativeComponentMetadata(image.id, region.name, "illustration") : {})
    });
    if (isIconNode) applyMinimumUnitCropRenderStrategy(source);
    splitImages.push({
      id: `${image.id || "triangle-topology"}-${region.name}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
      box: slideBox,
      source
    });
  }
  for (const item of splitImages) {
    item.source.residualSplitCount = splitImages.length;
  }
  return splitImages;
}

function trimResidualRegionBox(residual, region) {
  let minX = region.x + region.w;
  let minY = region.y + region.h;
  let maxX = -1;
  let maxY = -1;
  const xEnd = Math.min(residual.width, region.x + region.w);
  const yEnd = Math.min(residual.height, region.y + region.h);
  for (let y = Math.max(0, region.y); y < yEnd; y += 2) {
    for (let x = Math.max(0, region.x); x < xEnd; x += 2) {
      if (!isGraphicForeground(pixel(residual, x, y))) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, residual, 8);
}

function purifyTriangleTopologyNodeCrop(crop, regionName = "") {
  const bins = Array.from({ length: 12 }, () => 0);
  const anchor = /top-node/.test(String(regionName || ""))
    ? { x: 0.50, y: 0.30 }
    : /left-node/.test(String(regionName || ""))
      ? { x: 0.38, y: 0.64 }
      : { x: 0.62, y: 0.64 };
  const sampleBox = {
    x: Math.max(0, Math.floor(crop.width * (anchor.x - 0.22))),
    y: Math.max(0, Math.floor(crop.height * (anchor.y - 0.24))),
    w: Math.max(1, Math.ceil(crop.width * 0.44)),
    h: Math.max(1, Math.ceil(crop.height * 0.48))
  };
  for (let y = sampleBox.y; y < Math.min(crop.height, sampleBox.y + sampleBox.h); y += 1) {
    for (let x = sampleBox.x; x < Math.min(crop.width, sampleBox.x + sampleBox.w); x += 1) {
      const color = pixel(crop, x, y);
      const hsl = rgbToHsl(color);
      if (color.a < 64 || hsl.s < 0.18 || hsl.l < 0.08 || hsl.l > 0.94) continue;
      bins[Math.floor(hsl.h / 30) % bins.length] += 1;
    }
  }
  const dominantBin = bins.indexOf(Math.max(...bins));
  if (dominantBin < 0 || bins[dominantBin] < Math.max(20, crop.width * crop.height * 0.015)) {
    return { image: crop, trimBox: { x: 0, y: 0, w: crop.width, h: crop.height }, purified: false, dominantHue: null };
  }
  const dominantHue = dominantBin * 30 + 15;
  const masked = { ...crop, rgba: Buffer.from(crop.rgba) };
  let kept = 0;
  for (let y = 0; y < masked.height; y += 1) {
    for (let x = 0; x < masked.width; x += 1) {
      const offset = (y * masked.width + x) * 4;
      const color = pixel(masked, x, y);
      const hsl = rgbToHsl(color);
      const hueDelta = Math.min(Math.abs(hsl.h - dominantHue), 360 - Math.abs(hsl.h - dominantHue));
      const keep = color.a >= 64 && hsl.s >= 0.12 && hsl.l >= 0.06 && hsl.l <= 0.96 && hueDelta <= 38;
      if (keep) kept += 1;
      else masked.rgba[offset + 3] = 0;
    }
  }
  if (kept < Math.max(20, crop.width * crop.height * 0.01)) {
    return { image: crop, trimBox: { x: 0, y: 0, w: crop.width, h: crop.height }, purified: false, dominantHue };
  }
  if (/top-node/.test(String(regionName || ""))) truncateTriangleTopologyArrowLegs(masked);
  const alphaBox = alphaContentBox(masked, 2);
  if (!alphaBox || alphaBox.w < 8 || alphaBox.h < 8) {
    return { image: crop, trimBox: { x: 0, y: 0, w: crop.width, h: crop.height }, purified: false, dominantHue };
  }
  return {
    image: cropPng(masked, alphaBox),
    trimBox: alphaBox,
    purified: true,
    dominantHue: round(dominantHue)
  };
}

function truncateTriangleTopologyArrowLegs(image) {
  let maxWidth = 0;
  let cutoff = image.height;
  for (let y = 0; y < image.height; y += 1) {
    const runs = [];
    let start = -1;
    let opaque = 0;
    for (let x = 0; x < image.width; x += 1) {
      const alpha = image.rgba[(y * image.width + x) * 4 + 3];
      if (alpha >= 64) {
        opaque += 1;
        if (start < 0) start = x;
      } else if (start >= 0) {
        if (x - start >= 2) runs.push({ start, end: x - 1 });
        start = -1;
      }
    }
    if (start >= 0 && image.width - start >= 2) runs.push({ start, end: image.width - 1 });
    maxWidth = Math.max(maxWidth, opaque);
    if (y >= image.height * 0.34 && runs.length >= 2 && opaque <= Math.max(4, maxWidth * 0.58)) {
      cutoff = y;
      break;
    }
  }
  for (let y = cutoff; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) image.rgba[(y * image.width + x) * 4 + 3] = 0;
  }
}

function alphaContentBox(image, padding = 0) {
  let minX = image.width;
  let minY = image.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      if (image.rgba[(y * image.width + x) * 4 + 3] < 64) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: Math.max(0, minX - padding),
    y: Math.max(0, minY - padding),
    w: Math.min(image.width, maxX + padding + 1) - Math.max(0, minX - padding),
    h: Math.min(image.height, maxY + padding + 1) - Math.max(0, minY - padding)
  };
}

function triangleTopologyResidualRegions(residual, options = {}) {
  return triangleTopologyResidualRegionsWithOptions(residual, options);
}

function triangleTopologyResidualRegionsWithOptions(residual, options = {}) {
  const w = residual.width;
  const h = residual.height;
  const includeCenter = options.includeCenter !== false;
  const includeNodes = options.nodesObjectified !== true;
  const includeVisualConnectors = options.visualConnectorsObjectified !== true;
  const topNodeX = options.topTextObjectified === true ? Math.round(w * 0.40) : Math.round(w * 0.28);
  const topNodeW = options.topTextObjectified === true ? Math.round(w * 0.20) : Math.round(w * 0.44);
  const includeBottom = options.bottomTextObjectified !== true;
  const includeSideLabels = options.sideTextObjectified !== true;
  return [
    includeNodes ? { name: "top-node", box: { x: topNodeX, y: 0, w: topNodeW, h: Math.round(h * 0.28) } } : null,
    includeVisualConnectors ? { name: "left-visual-arrow", box: { x: 0, y: Math.round(h * 0.17), w: Math.round(w * 0.36), h: Math.round(h * 0.67) } } : null,
    includeVisualConnectors ? { name: "right-visual-arrow", box: { x: Math.round(w * 0.64), y: Math.round(h * 0.17), w: Math.round(w * 0.36), h: Math.round(h * 0.67) } } : null,
    includeVisualConnectors ? { name: "bottom-visual-arrow", box: { x: Math.round(w * 0.18), y: Math.round(h * 0.76), w: Math.round(w * 0.66), h: Math.round(h * 0.20) } } : null,
    includeSideLabels ? { name: "left-label", box: { x: 0, y: Math.round(h * 0.18), w: Math.round(w * 0.25), h: Math.round(h * 0.52) } } : null,
    includeNodes ? { name: "left-node", box: { x: 0, y: Math.round(h * 0.70), w: Math.round(w * 0.28), h: Math.round(h * 0.30) } } : null,
    includeSideLabels ? { name: "right-label", box: { x: Math.round(w * 0.74), y: Math.round(h * 0.18), w: Math.round(w * 0.26), h: Math.round(h * 0.52) } } : null,
    includeNodes ? { name: "right-node", box: { x: Math.round(w * 0.72), y: Math.round(h * 0.70), w: Math.round(w * 0.28), h: Math.round(h * 0.30) } } : null,
    includeCenter ? { name: "center", box: { x: Math.round(w * 0.36), y: Math.round(h * 0.52), w: Math.round(w * 0.30), h: Math.round(h * 0.18) } } : null,
    includeBottom ? { name: "bottom-label", box: { x: Math.round(w * 0.22), y: Math.round(h * 0.82), w: Math.round(w * 0.56), h: Math.round(h * 0.18) } } : null
  ].filter(Boolean);
}

function splitDocumentVersionMixedParentResidualCrop(image, residual, assetFile, irDir) {
  const parent = image.box || {};
  const peer = image.source?.documentVersionNativePeerBox || null;
  if (!peer || !parent.w || !parent.h) return [];
  const leftEdge = Number(parent.x || 0);
  const topEdge = Number(parent.y || 0);
  const peerLeft = Number(peer.x || 0);
  const peerBottom = Number(peer.y || 0) + Number(peer.h || 0);
  const keepBox = constrainPtBox({
    x: leftEdge,
    y: topEdge,
    w: Math.max(0, peerLeft - leftEdge - 8),
    h: Math.min(Number(parent.h || 0), Math.max(120, peerBottom - topEdge + 4))
  }, parent);
  if (keepBox.w < 120 || keepBox.h < 90) return [];
  const localBox = slidePtBoxToLocalPxBox(keepBox, parent, residual);
  if (localBox.w < 32 || localBox.h < 32) return [];
  const crop = cropPng(residual, localBox);
  const outDir = path.dirname(assetFile);
  const base = path.basename(assetFile, path.extname(assetFile));
  const file = path.join(outDir, `${base}-document-version-sketch-residual.png`);
  writePng(file, crop);
  const slideBox = localPxBoxToSlidePt(localBox, residual, parent);
  return [{
    id: `${image.id || "document-version"}-sketch-residual`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || outDir, file).replace(/\\/g, "/"),
    box: slideBox,
    source: reclassifyImageSource(image.source || {}, slideBox, {
      layer: splitResidualLayerSource(image.source?.layer, slideBox, "document-version-sketch-residual-crop"),
      detector: "document-version-sketch-residual-crop",
      parentDetector: image.source?.detector || null,
      parentImageId: image.id || null,
      residualSplit: true,
      residualSplitMode: "document-version-left-sketch",
      residualSplitIndex: 0,
      residualSplitCount: 1,
      originalCropBox: parent,
      nonEditableReason: "left sticky/sketch illustration preserved after native document-version folder flow reconstruction"
    })
  }];
}

function triangleTopologyNativeComponentMetadata(layerSourceId, role, part) {
  const base = safeComponentToken(layerSourceId || "triangle-topology");
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `${base}-triangle-${safeRole}`,
    nativeComponentParentId: `${base}-triangle-topology`,
    nativeComponentArchetype: "triangle-topology",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role || "unknown",
    nativeComponentPart: part || "detail"
  };
}

function safeComponentToken(value) {
  const token = String(value || "")
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return token || "unknown";
}

module.exports = { splitReviewRiskGateFlowResidualCrops, reclassifyImageSource, classifyImageExpressionForm, classifyImageExpressionSubtype, recommendExpressionHandling, splitTriangleTopologyResidualCrops, triangleTopologyResidualRegions, triangleTopologyResidualRegionsWithOptions, trimResidualRegionBox, purifyTriangleTopologyNodeCrop, truncateTriangleTopologyArrowLegs, alphaContentBox, triangleTopologyNativeComponentMetadata, safeComponentToken, splitPrdGenerationFlowResidualCrops, splitPrototypeValidationFlowResidualCrops, splitDemandUnderstandingFlowResidualCrops, splitFunnelHubResidualCrops, splitAssetHubCycleResidualCrops, assetHubCycleNativeComponentMetadata, splitInputOutputSplitResidualCrops, splitProductBrainVisionResidualCrops, applyEllipseAlphaMask, splitToolGapPlatformResidualCrops, toolGapPlatformResidualRegions, localResidualPxBox, splitProcessWithScreenshotsResidualCrops, processWithScreenshotsResidualRegions, splitValueQuadrantResidualCrops, splitSkillChainOverviewResidualCrops, splitNetworkDiagramCenterCrop, splitDocumentVersionMixedParentResidualCrop };
