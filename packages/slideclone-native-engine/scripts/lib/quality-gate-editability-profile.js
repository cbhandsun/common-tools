"use strict";

const { isAllowedDecorativeBackgroundImage } = require("./logical-native-object-count");

function summarizeComponentTemplateCropStatus(ir = {}, options = {}) {
  const maxExamples = normalizePositiveInt(options.maxExamples, 50);
  const byReason = {};
  const byDetector = {};
  const actionableByReason = {};
  const protectedByReason = {};
  const actionableExamplesByReason = {};
  const examples = [];
  const repairCandidates = [];
  let templateImages = 0;
  let replacedImages = 0;
  let retainedImages = 0;
  let protectedRetainedImages = 0;
  let actionableRetainedImages = 0;
  let splitImages = 0;
  let nativeShapesReplacingCrops = 0;
  for (const [pageOrdinal, page] of (Array.isArray(ir?.pages) ? ir.pages : []).entries()) {
    const pageIndex = page?.pageIndex ?? pageOrdinal;
    for (const image of Array.isArray(page?.images) ? page.images : []) {
      const source = image?.source || {};
      if (!isComponentTemplateCropImage(image)) continue;
      templateImages += 1;
      const reason = safeProfileKey(source.componentTemplateCropReplacementReason || "component-template-crop-no-decision");
      const detector = safeProfileKey(source.detector || "unknown-detector");
      addProfileCount(byReason, reason);
      addProfileCount(byDetector, detector);
      if (source.componentTemplateCropReplacedByNative === true) replacedImages += 1;
      else {
        retainedImages += 1;
        if (isProtectedComponentTemplateRetainedReason(reason, image)) {
          protectedRetainedImages += 1;
          addProfileCount(protectedByReason, reason);
        } else {
          actionableRetainedImages += 1;
          addProfileCount(actionableByReason, reason);
          if (repairCandidates.length < maxExamples) {
            repairCandidates.push(componentTemplateRepairCandidate({
              image,
              pageIndex,
              detector,
              reason
            }));
          }
          if (!actionableExamplesByReason[reason]) actionableExamplesByReason[reason] = [];
          if (actionableExamplesByReason[reason].length < maxExamples) {
            actionableExamplesByReason[reason].push(componentTemplateCropExample({
              image,
              pageIndex,
              detector,
              reason,
              retainedActionable: true
            }));
          }
        }
      }
      if (source.componentTemplateCropSplitIntoResiduals === true) splitImages += 1;
      if (examples.length < maxExamples) {
        examples.push(componentTemplateCropExample({
          image,
          pageIndex,
          detector,
          reason,
          retainedActionable: source.componentTemplateCropReplacedByNative === true
            ? false
            : !isProtectedComponentTemplateRetainedReason(reason, image)
        }));
      }
    }
    for (const shape of Array.isArray(page?.shapes) ? page.shapes : []) {
      if (shape?.source?.componentTemplateCropReplacedByNative === true) nativeShapesReplacingCrops += 1;
    }
  }
  return {
    provider: "quality-gate-component-template-crop-status-v1",
    templateImages,
    replacedImages,
    retainedImages,
    protectedRetainedImages,
    actionableRetainedImages,
    splitImages,
    nativeShapesReplacingCrops,
    replacementRate: templateImages > 0 ? round(replacedImages / templateImages) : 1,
    byReason,
    byDetector,
    protectedByReason,
    actionableByReason,
    topActionableReasons: summarizeTopComponentTemplateReasons(actionableByReason, actionableExamplesByReason),
    repairCandidates,
    examples
  };
}

function componentTemplateCropExample({ image = {}, pageIndex = 0, detector = "unknown-detector", reason = "unknown", retainedActionable = false } = {}) {
  const source = image?.source || {};
  return {
    pageIndex,
    imageId: safeProfileKey(image.id || "unknown-image"),
    detector,
    replaced: source.componentTemplateCropReplacedByNative === true,
    retainedActionable,
    splitIntoResiduals: source.componentTemplateCropSplitIntoResiduals === true,
    reason,
    family: safeProfileKey(source.componentTemplateFamilyApplied || source.layer?.templateFamily || "unknown-family"),
    exactChildCoverageRatio: numberOrNull(source.componentTemplateExactChildCoverageRatio),
    exactChildShapeCount: numberOrNull(source.componentTemplateExactChildShapeCount),
    box: normalizeQualityBox(image.box)
  };
}

function componentTemplateRepairCandidate({ image = {}, pageIndex = 0, detector = "unknown-detector", reason = "unknown" } = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  const plan = strategy.applicationPlan || {};
  const bestCandidate = strategy.bestCandidate || {};
  const box = normalizeQualityBox(image.box);
  const areaRatio = box ? round((Number(box.w || 0) * Number(box.h || 0)) / (960 * 540)) : null;
  const motifs = [
    ...safeStringArray(source.componentTemplateTargetMotifs),
    ...safeStringArray(strategy.targetMotifs),
    ...safeStringArray(plan.targetMotifs),
    ...safeStringArray(bestCandidate.targetMotifs)
  ];
  return {
    pageIndex,
    imageId: safeProfileKey(image.id || "unknown-image"),
    detector,
    reason,
    priority: componentTemplateRepairPriority({ source, areaRatio, reason }),
    expressionForm: safeProfileKey(source.expressionForm || "unknown-expression"),
    expressionSubtype: safeProfileKey(source.expressionSubtype || "unknown-subtype"),
    layerType: safeProfileKey(source.layer?.layerType || "unknown-layer"),
    recommendedAction: safeProfileKey(source.recommendedAction || "manual-component-rebuild-review"),
    family: safeProfileKey(source.componentTemplateFamilyApplied || source.layer?.templateFamily || "unknown-family"),
    componentGroupId: safeProfileKey(source.componentTemplateGroupId || "unknown-group"),
    componentGroupScore: numberOrNull(source.componentTemplateGroupScore),
    sourceProvider: safeProfileKey(plan.sourceProvider || bestCandidate.sourceProvider || "unknown-provider"),
    componentKind: safeProfileKey(plan.componentKind || bestCandidate.kind || "unknown-kind"),
    componentId: safeProfileKey(plan.componentId || bestCandidate.id || "unknown-component"),
    componentTitle: safeProfileKey(bestCandidate.title || "unknown-title"),
    targetMotifs: [...new Set(motifs)].slice(0, 12),
    currentStep: safeProfileKey(plan.currentStep || "unknown-current-step"),
    targetStep: safeProfileKey(plan.targetStep || "unknown-target-step"),
    requiresDownload: plan.requiresDownload === true,
    box,
    areaRatio
  };
}

function componentTemplateRepairPriority({ source = {}, areaRatio = null, reason = "" } = {}) {
  const action = String(source.recommendedAction || "").toLowerCase();
  const form = String(source.expressionForm || "").toLowerCase();
  const strategyMode = String(source.componentRenderStrategy?.mode || "").toLowerCase();
  let score = 0;
  if (Number.isFinite(areaRatio)) score += Math.min(40, Math.round(areaRatio * 100));
  if (/rebuild-native|split-native|table-grid|axis-aligned/.test(action)) score += 25;
  if (/table-or-matrix|complex-diagram|data-chart/.test(form)) score += 20;
  if (strategyMode === "plugin-component-template") score += 10;
  if (/score-below|native-parts-incomplete|overlay-suppressed|no-decision/.test(String(reason || ""))) score += 5;
  return Math.max(0, Math.min(100, score));
}

function safeStringArray(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function summarizeTopComponentTemplateReasons(actionableByReason = {}, examplesByReason = {}) {
  return Object.entries(actionableByReason)
    .map(([reason, count]) => ({
      reason,
      count: Number(count || 0),
      examples: Array.isArray(examplesByReason[reason]) ? examplesByReason[reason] : []
    }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

function isProtectedComponentTemplateRetainedReason(reason = "", image = {}) {
  const text = String(reason || "").toLowerCase();
  if (isProtectedComponentTemplateMinimumUnit(image)) return true;
  if (text === "component-template-source-layer-requires-fidelity-crop") {
    return isProtectedComponentTemplateFidelityRetainedImage(image);
  }
  if (text === "component-template-overlay-suppressed-because-source-crop-remains-required") {
    return isProtectedComponentTemplateVisualAsset(image)
      || isProtectedComponentTemplateFidelityRetainedImage(image);
  }
  if (text === "component-template-crop-no-decision") {
    return isProtectedComponentTemplateVisualAsset(image)
      || isDeferredComponentTemplateDownloadTarget(image);
  }
  return text === "component-template-child-layout-contains-picture"
    || text === "component-template-contains-picture-children"
    || text === "component-template-picture-children-split-to-local-residuals";
}

function isProtectedComponentTemplateMinimumUnit(image = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  return source.protectedMinimumUnit === true
    || source.intentionalMinimumUnitCrop === true
    || strategy.mode === "preserve-local-crop"
      && /minimum|icon|illustration|screenshot|document/.test(String(strategy.editableExpectation || strategy.reason || "").toLowerCase());
}

function isProtectedComponentTemplateFidelityRetainedImage(image = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || "").toLowerCase();
  const recommendedAction = String(source.recommendedAction || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const visualType = `${detector} ${expressionForm} ${expressionSubtype} ${layerType}`;
  if (/(?:^|[-_ ])(?:screenshot|screen|document|prototype|ui|webpage)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:chart|kpi|evidence)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:icon|illustration|photo|picture)(?:$|[-_ ])/.test(visualType)) return true;
  if (/keep-local-crop-and-overlay-external-text-only|keep-crop-until-source-data-or-axis-series-detected/.test(recommendedAction)) return true;
  return false;
}

function isProtectedComponentTemplateVisualAsset(image = {}) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const expressionForm = String(source.expressionForm || "").toLowerCase();
  const expressionSubtype = String(source.expressionSubtype || "").toLowerCase();
  const recommendedAction = String(source.recommendedAction || "").toLowerCase();
  const layerType = String(source.layer?.layerType || "").toLowerCase();
  const visualType = `${detector} ${expressionForm} ${expressionSubtype} ${layerType}`;
  if (/(?:^|[-_ ])(?:decorative|cover|background|brand|logo|watermark)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:screenshot|screen|document|prototype|ui|webpage)(?:$|[-_ ])/.test(visualType)) return true;
  if (/(?:^|[-_ ])(?:icon|illustration|photo|picture)(?:$|[-_ ])/.test(visualType)) return true;
  return /prefer-native-background-shape-or-keep-local-crop|match-icon-library-or-keep-local-crop|keep-local-crop-and-overlay-external-text-only/.test(recommendedAction);
}

function isDeferredComponentTemplateDownloadTarget(image = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || {};
  const plan = strategy.applicationPlan || {};
  const mode = String(strategy.mode || "").toLowerCase();
  const implementationMode = String(strategy.implementationMode || "").toLowerCase();
  const currentStep = String(plan.currentStep || "").toLowerCase();
  const targetStep = String(plan.targetStep || "").toLowerCase();
  if (mode !== "plugin-component-template") return false;
  if (/auth-or-download-required|download-required/.test(implementationMode)) return true;
  if (/download|auth/.test(currentStep) || /download|auth/.test(targetStep)) return true;
  return plan.requiresDownload === true || strategy.bestCandidate?.downloadable === false;
}

function isComponentTemplateCropImage(image = {}) {
  const source = image?.source || {};
  return source.componentTemplateGroupApplied === true
    || Boolean(source.componentTemplateGroupId)
    || Boolean(source.componentTemplateFamilyApplied)
    || Boolean(source.componentTemplateCropReplacementReason)
    || source.componentRenderStrategy?.mode === "plugin-component-template";
}

function normalizeQualityBox(box = {}) {
  const x = numberOrNull(box?.x);
  const y = numberOrNull(box?.y);
  const w = numberOrNull(box?.w);
  const h = numberOrNull(box?.h);
  return [x, y, w, h].every((value) => value !== null) ? { x, y, w, h } : null;
}

const TEXT_FREE_BAND_CLEARANCE_PT = 12;

function collectTextOverlayRisks({ images = [], textBoxes = [], slideArea = 960 * 540 } = {}) {
  const risks = [];
  for (const image of images) {
    if (!isTextOverlayRiskImage(image, slideArea)) continue;
    const unsafeDecorativeBackground = isUnsafeDecorativeTextOverlayBackground(image);
    const overlapping = textBoxes.filter((textBox) =>
      boxCenterInside(textBox?.box, image?.box) && !isTextErasedFromCrop(textBox, image));
    // A split band is valid only when it stays outside every native text box.
    // This prevents a stale/incorrect textFreeBandSplit marker from masking
    // raster text below the editable text and producing visible ghosting.
    const splitBandOverlaps = image?.source?.textFreeBandSplit === true
      ? textBoxes.filter((textBox) => boxesOverlap(textBox?.box, image?.box) && !isTextErasedFromCrop(textBox, image))
      : [];
    // A crop that merely avoids geometric overlap can still retain antialiased
    // glyph edges. Require a measurable gap before treating it as text-free.
    const splitBandTooClose = image?.source?.textFreeBandSplit === true
      ? textBoxes.filter((textBox) =>
        boxesWithinClearance(textBox?.box, image?.box, TEXT_FREE_BAND_CLEARANCE_PT)
        && !boxesOverlap(textBox?.box, image?.box)
        && !isTextErasedFromCrop(textBox, image))
      : [];
    const verifiedTextFreeBandOverlap = splitBandOverlaps.length > 0;
    if (verifiedTextFreeBandOverlap) {
      risks.push({
        imageId: image.id || null,
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        textBoxes: splitBandOverlaps.length,
        reason: "verified-text-free-band-overlaps-native-text",
        areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
      });
      continue;
    }
    if (splitBandTooClose.length > 0) {
      risks.push({
        imageId: image.id || null,
        detector: image?.source?.detector || "unknown",
        expressionForm: image?.source?.expressionForm || "unknown-expression",
        expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
        recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
        textBoxes: splitBandTooClose.length,
        reason: "verified-text-free-band-too-close-to-native-text",
        areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
      });
      continue;
    }
    // A single native title over an uncleared raster crop is enough to create
    // visible ghosting. Do not wait for a dense text layer before failing it.
    if (overlapping.length === 0) continue;
    risks.push({
      imageId: image.id || null,
      detector: image?.source?.detector || "unknown",
      expressionForm: image?.source?.expressionForm || "unknown-expression",
      expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
      recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
      textBoxes: overlapping.length,
      reason: unsafeDecorativeBackground
        ? "decorative-background-with-native-text-must-use-a-verified-text-free-band"
        : "fidelity-crop-with-native-text-overlay",
      areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
    });
  }
  return risks;
}

function collectNativeOverlayRisks({ images = [], shapes = [], slideArea = 960 * 540 } = {}) {
  const risks = [];
  for (const image of images) {
    if (!isNativeOverlayRiskImage(image, slideArea)) continue;
    const overlapping = shapes.filter((shape) => isVisibleNativeOverlayShapeForImage(shape, image));
    if (overlapping.length === 0) continue;
    risks.push({
      imageId: image.id || null,
      detector: image?.source?.detector || "unknown",
      expressionForm: image?.source?.expressionForm || "unknown-expression",
      expressionSubtype: image?.source?.expressionSubtype || "unknown-subtype",
      recommendedAction: image?.source?.recommendedAction || "manual-review-before-native-rebuild",
      shapes: overlapping.length,
      areaRatio: round((Number(image?.box?.w || 0) * Number(image?.box?.h || 0)) / Math.max(1, slideArea))
    });
  }
  return risks;
}

function isNativeOverlayRiskImage(image, slideArea) {
  const source = image?.source || {};
  const detector = String(source.detector || "").toLowerCase();
  const box = image?.box || {};
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, slideArea);
  if (areaRatio < 0.18) return false;
  if (source.visualAtomOverlayOnly === true) return true;
  if (/top-complex-diagram-crop/.test(detector) && source.allowVisibleTopComplexNativeRebuild !== true) return true;
  return false;
}

function isVisibleNativeOverlayShapeForImage(shape, image) {
  const source = shape?.source || {};
  if (!source.layerSourceId || !image?.id || source.layerSourceId !== image.id) return false;
  if (source.editable !== true && source.nativeRebuild !== true) return false;
  return boxCenterInside(shape?.box, image?.box);
}

function isTextErasedFromCrop(textBox, image) {
  const source = textBox?.source || {};
  return source.textErasedFromCrop === true
    && source.layerSourceId
    && image?.id
    && source.layerSourceId === image.id;
}

function isTextOverlayRiskImage(image, slideArea) {
  // Split decorative bands still need a geometry check in
  // collectTextOverlayRisks. Returning early here used to trust the marker
  // without proving that the crop stayed outside native text.
  if (isAllowedDecorativeBackgroundImage(image)) return true;
  const source = image?.source || {};
  const form = String(source.expressionForm || "").toLowerCase();
  const action = String(source.recommendedAction || "").toLowerCase();
  const box = image?.box || {};
  const areaRatio = (Number(box.w || 0) * Number(box.h || 0)) / Math.max(1, slideArea);
  if (areaRatio < 0.25) return false;
  if (/decorative-cover|brand|value-banner/.test(form)) return false;
  if (/native-background/.test(action)) return false;
  return /complex-diagram|screenshot|chart-snapshot|icon-or-illustration|unknown/.test(form)
    || /preserve-fidelity-crop|keep-local-crop|keep-crop/.test(action);
}

function isUnsafeDecorativeTextOverlayBackground(image) {
  return isAllowedDecorativeBackgroundImage(image)
    && image?.source?.textFreeBandSplit !== true;
}

function boxCenterInside(box, container) {
  if (!box || !container) return false;
  const x = Number(box.x || 0) + Number(box.w || 0) / 2;
  const y = Number(box.y || 0) + Number(box.h || 0) / 2;
  return x >= Number(container.x || 0)
    && x <= Number(container.x || 0) + Number(container.w || 0)
    && y >= Number(container.y || 0)
    && y <= Number(container.y || 0) + Number(container.h || 0);
}

function boxesOverlap(first, second) {
  const firstX = Number(first?.x);
  const firstY = Number(first?.y);
  const firstW = Number(first?.w);
  const firstH = Number(first?.h);
  const secondX = Number(second?.x);
  const secondY = Number(second?.y);
  const secondW = Number(second?.w);
  const secondH = Number(second?.h);
  if (![firstX, firstY, firstW, firstH, secondX, secondY, secondW, secondH].every(Number.isFinite)) return false;
  if (firstW <= 0 || firstH <= 0 || secondW <= 0 || secondH <= 0) return false;
  return firstX < secondX + secondW
    && firstX + firstW > secondX
    && firstY < secondY + secondH
    && firstY + firstH > secondY;
}

function boxesWithinClearance(first, second, clearancePt = 0) {
  const clearance = Math.max(0, Number(clearancePt) || 0);
  if (clearance === 0) return boxesOverlap(first, second);
  const expanded = {
    x: Number(second?.x) - clearance,
    y: Number(second?.y) - clearance,
    w: Number(second?.w) + clearance * 2,
    h: Number(second?.h) + clearance * 2
  };
  return boxesOverlap(first, expanded);
}


function addProfileCount(target, key) {
  const safeKey = String(key || "unknown");
  target[safeKey] = (target[safeKey] || 0) + 1;
}

function safeProfileKey(value) {
  const text = stripControlCharacters(String(value ?? "")).trim();
  return text || "unknown";
}

function stripControlCharacters(value) {
  let result = "";
  for (const character of value) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result;
}

function numberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  return Math.round(Number(value) * 10000) / 10000;
}

module.exports = {
  collectNativeOverlayRisks,
  collectTextOverlayRisks,
  summarizeComponentTemplateCropStatus
};
