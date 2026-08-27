"use strict";

function buildComponentStrategyIndex(report = {}) {
  const layers = Array.isArray(report.layers) ? report.layers : [];
  const index = new Map();
  for (const layer of layers) {
    const pageIndex = toSafeIndex(layer.pageIndex);
    const imageIndex = toSafeIndex(layer.imageIndex);
    if (pageIndex < 0 || imageIndex < 0) continue;
    const strategy = sanitizeStrategy(layer.componentRenderStrategy);
    if (!strategy) continue;
    index.set(keyFor(pageIndex, imageIndex), strategy);
  }
  return index;
}

function annotateImagesWithComponentStrategies(images = [], pageIndex = 0, strategyIndex = null) {
  if (!strategyIndex || typeof strategyIndex.get !== "function") return images;
  return (Array.isArray(images) ? images : []).map((image, imageIndex) => {
    const strategy = strategyIndex.get(keyFor(pageIndex, imageIndex));
    if (!strategy || !image || typeof image !== "object") return image;
    return {
      ...image,
      source: {
        ...(image.source || {}),
        componentRenderStrategy: strategy,
        layer: image.source?.layer
          ? {
            ...image.source.layer,
            componentRenderStrategy: strategy
          }
          : image.source?.layer
      }
    };
  });
}

function buildComponentAssetIndex(manifest = {}) {
  const layers = Array.isArray(manifest.layers) ? manifest.layers : [];
  const index = new Map();
  index.layersByPage = new Map();
  index.shapeLayersByPage = new Map();
  for (const layer of layers) {
    const pageIndex = toSafeIndex(layer.pageIndex);
    const imageIndex = toSafeOptionalIndex(layer.imageIndex);
    if (pageIndex < 0) continue;
    const sanitized = sanitizeAssetLayer(layer);
    if (sanitized.box) {
      if (!index.layersByPage.has(pageIndex)) index.layersByPage.set(pageIndex, []);
      index.layersByPage.get(pageIndex).push(sanitized);
    }
    if (imageIndex >= 0) {
      index.set(keyFor(pageIndex, imageIndex), sanitized);
      continue;
    }
    if (!sanitized.shapeLayerId || !sanitized.box) continue;
    if (!index.shapeLayersByPage.has(pageIndex)) index.shapeLayersByPage.set(pageIndex, []);
    index.shapeLayersByPage.get(pageIndex).push(sanitized);
  }
  return index;
}

function annotateImagesWithComponentAssets(images = [], pageIndex = 0, assetIndex = null) {
  if (!assetIndex || typeof assetIndex.get !== "function") return images;
  return (Array.isArray(images) ? images : []).map((image, imageIndex) => {
    const assetLayer = assetIndex.get(keyFor(pageIndex, imageIndex));
    if (!assetLayer || !image || typeof image !== "object") return image;
    return {
      ...image,
      source: {
        ...(image.source || {}),
        componentLocalAssets: assetLayer.localAssets,
        componentAssetReadiness: assetLayer.readiness,
        componentAssetLayerKey: assetLayer.layerKey
      }
    };
  });
}

function componentAssetShapeLayersForPage(assetIndex = null, pageIndex = 0) {
  if (!assetIndex || !assetIndex.shapeLayersByPage || typeof assetIndex.shapeLayersByPage.get !== "function") return [];
  const safePageIndex = toSafeIndex(pageIndex);
  if (safePageIndex < 0) return [];
  return assetIndex.shapeLayersByPage.get(safePageIndex) || [];
}

function componentAssetLayersForPage(assetIndex = null, pageIndex = 0) {
  if (!assetIndex || !assetIndex.layersByPage || typeof assetIndex.layersByPage.get !== "function") return [];
  const safePageIndex = toSafeIndex(pageIndex);
  if (safePageIndex < 0) return [];
  return assetIndex.layersByPage.get(safePageIndex) || [];
}

function shouldDeferNativeRebuildForComponentStrategy(image = {}) {
  const strategy = image?.source?.componentRenderStrategy || image?.source?.layer?.componentRenderStrategy || {};
  const mode = String(strategy.mode || "");
  if (mode === "plugin-component-template") return true;
  if (mode === "preserve-crop-with-component-reference") return true;
  if (mode === "preserve-crop-with-native-overlays") return true;
  if (mode === "preserve-local-crop") return true;
  return false;
}

function sanitizeStrategy(strategy = {}) {
  if (!strategy || typeof strategy !== "object") return null;
  const mode = safeString(strategy.mode);
  if (!mode) return null;
  return {
    provider: safeString(strategy.provider || "component-render-strategy-v1"),
    mode,
    implementationMode: safeString(strategy.implementationMode),
    editableExpectation: safeString(strategy.editableExpectation),
    visualFidelityBias: safeString(strategy.visualFidelityBias),
    reason: safeString(strategy.reason).slice(0, 320),
    targetMotifs: sanitizeMotifs(strategy.targetMotifs),
    expressionPolicy: sanitizeExpressionPolicy(strategy.expressionPolicy),
    applicationPlan: sanitizeApplicationPlan(strategy.applicationPlan),
    bestCandidate: sanitizeCandidate(strategy.bestCandidate)
  };
}

function sanitizeExpressionPolicy(policy = {}) {
  if (!policy || typeof policy !== "object") return null;
  return {
    kind: safeString(policy.kind),
    minimumUnitPolicy: safeString(policy.minimumUnitPolicy),
    unitDisposition: safeString(policy.unitDisposition),
    allowNativeRebuild: policy.allowNativeRebuild === true,
    protectCrop: policy.protectCrop === true,
    allowPluginTemplate: policy.allowPluginTemplate === true,
    reasons: Array.isArray(policy.reasons) ? policy.reasons.map(safeString).filter(Boolean).slice(0, 8) : []
  };
}

function sanitizeApplicationPlan(plan = {}) {
  if (!plan || typeof plan !== "object") return null;
  return {
    currentStep: safeString(plan.currentStep),
    targetStep: safeString(plan.targetStep),
    sourceProvider: safeString(plan.sourceProvider),
    componentKind: safeString(plan.componentKind),
    componentId: safeString(plan.componentId),
    suitabilityTier: safeString(plan.suitabilityTier),
    suitabilityScore: safeNumber(plan.suitabilityScore),
    targetMotifs: sanitizeMotifs(plan.targetMotifs),
    requiresDownload: plan.requiresDownload === true,
    preservesFidelityNow: plan.preservesFidelityNow === true
  };
}

function sanitizeCandidate(candidate = {}) {
  if (!candidate || typeof candidate !== "object") return null;
  return {
    sourceProvider: safeString(candidate.sourceProvider),
    kind: safeString(candidate.kind),
    id: safeString(candidate.id),
    title: safeString(candidate.title),
    reuseHint: safeString(candidate.reuseHint),
    candidateScore: safeNumber(candidate.candidateScore),
    confidence: safeNumber(candidate.confidence),
    suitability: sanitizeSuitability(candidate.suitability),
    targetMotifs: sanitizeMotifs(candidate.targetMotifs),
    structureSignature: sanitizeCandidateStructureSignature(candidate.structureSignature),
    roleTags: Array.isArray(candidate.roleTags) ? candidate.roleTags.map(safeString).filter(Boolean).slice(0, 20) : [],
    coverUrl: safeUrl(candidate.coverUrl),
    downloadable: candidate.downloadable === true,
    permission: safeString(candidate.permission)
  };
}

function sanitizeMotifs(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(safeString)
    .filter(Boolean)
    .slice(0, 12);
}

function sanitizeCandidateStructureSignature(signature = {}) {
  if (!signature || typeof signature !== "object") return null;
  return {
    primaryKind: safeString(signature.primaryKind),
    layout: safeString(signature.layout),
    motifs: sanitizeMotifs(signature.motifs)
  };
}

function sanitizeSuitability(value = {}) {
  if (!value || typeof value !== "object") return null;
  return {
    tier: safeString(value.tier),
    score: safeNumber(value.score)
  };
}

function sanitizeAssetLayer(layer = {}) {
  return {
    layerKey: safeString(layer.layerKey),
    pageIndex: toSafeIndex(layer.pageIndex),
    imageIndex: toSafeOptionalIndex(layer.imageIndex),
    shapeLayerId: safeString(layer.shapeLayerId),
    box: sanitizeAbsoluteBox(layer.box),
    layerType: safeString(layer.layerType),
    detector: safeString(layer.detector),
    templateFamily: safeString(layer.templateFamily),
    strategyMode: safeString(layer.strategyMode),
    remoteCandidate: sanitizeCandidate(layer.remoteCandidate),
    readiness: sanitizeReadiness(layer.readiness),
    localAssets: (Array.isArray(layer.localAssets) ? layer.localAssets : [])
      .map(sanitizeLocalAsset)
      .filter((asset) => asset.path)
      .slice(0, 8)
  };
}

function sanitizeReadiness(readiness = {}) {
  if (!readiness || typeof readiness !== "object") return null;
  return {
    status: safeString(readiness.status),
    nextStep: safeString(readiness.nextStep),
    currentStep: safeString(readiness.currentStep),
    targetMotifs: Array.isArray(readiness.targetMotifs)
      ? readiness.targetMotifs.map(safeString).filter(Boolean).slice(0, 8)
      : [],
    appliedMotifReadyAssets: safeNumber(readiness.appliedMotifReadyAssets)
  };
}

function sanitizeLocalAsset(asset = {}) {
  return {
    id: safeString(asset.id),
    provider: safeString(asset.provider),
    path: safeString(asset.path),
    name: safeString(asset.name),
    assetKind: safeString(asset.assetKind),
    roleTags: Array.isArray(asset.roleTags) ? asset.roleTags.map(safeString).filter(Boolean).slice(0, 20) : [],
    reusePolicy: safeString(asset.reusePolicy),
    matchScore: safeNumber(asset.matchScore),
    suggestedUse: safeString(asset.suggestedUse),
    reasonCodes: Array.isArray(asset.reasonCodes) ? asset.reasonCodes.map(safeString).filter(Boolean).slice(0, 20) : [],
    selfFidelityPromoted: asset.selfFidelityPromoted === true,
    selfFidelity: sanitizeSelfFidelity(asset.selfFidelity),
    learningSummary: sanitizeLearningSummary(asset.learningSummary),
    recommendedComponentGroups: sanitizeRecommendedGroups(asset.recommendedComponentGroups)
  };
}

function sanitizeSelfFidelity(value = {}) {
  if (!value || typeof value !== "object" || value.passed !== true) return null;
  const sha256 = safeString(value.sha256).toLowerCase();
  return {
    provider: safeString(value.provider || "component-self-fidelity-promotion-v1"),
    passed: true,
    sha256: /^[a-f0-9]{64}$/.test(sha256) ? sha256 : "",
    reportFile: safeLocalPath(value.reportFile),
    replayPptx: safeLocalPath(value.replayPptx),
    comparison: sanitizeFidelityMetrics(value.comparison),
    regionSummary: sanitizeFidelityRegionSummary(value.regionSummary)
  };
}

function sanitizeFidelityMetrics(value = {}) {
  return {
    ok: value?.ok === true,
    pixelDiffRatio: boundedMetric(value?.pixelDiffRatio, 0, 1),
    foregroundMissingRatio: boundedMetric(value?.foregroundMissingRatio, 0, 1),
    meanAbsoluteDelta: boundedMetric(value?.meanAbsoluteDelta, 0, 255)
  };
}

function sanitizeFidelityRegionSummary(value = {}) {
  return {
    regions: Math.trunc(boundedMetric(value?.regions, 0, 1000) || 0),
    passed: Math.trunc(boundedMetric(value?.passed, 0, 1000) || 0),
    maxPixelDiffRatio: boundedMetric(value?.maxPixelDiffRatio, 0, 1),
    maxForegroundMissingRatio: boundedMetric(value?.maxForegroundMissingRatio, 0, 1),
    maxMeanAbsoluteDelta: boundedMetric(value?.maxMeanAbsoluteDelta, 0, 255)
  };
}

function boundedMetric(value, min, max) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max ? number : null;
}

function safeLocalPath(value) {
  const text = safeString(value);
  return /^[A-Za-z]:[\\/]/.test(text) || text.startsWith("/") ? text : "";
}

function sanitizeRecommendedGroups(groups = []) {
  return (Array.isArray(groups) ? groups : [])
    .map((group) => ({
      id: safeString(group.id),
      slide: safeNumber(group.slide),
      groupIndex: safeNumber(group.groupIndex),
      name: safeString(group.name),
      boundsPt: group.boundsPt && typeof group.boundsPt === "object"
        ? {
          x: safeNumber(group.boundsPt.x),
          y: safeNumber(group.boundsPt.y),
          w: safeNumber(group.boundsPt.w),
          h: safeNumber(group.boundsPt.h)
        }
        : null,
      childCount: safeNumber(group.childCount),
      shapeCount: safeNumber(group.shapeCount),
      pictureCount: safeNumber(group.pictureCount),
      connectorCount: safeNumber(group.connectorCount),
      textRuns: safeNumber(group.textRuns),
      topColors: sanitizeTopColors(group.topColors),
      childLayout: sanitizeChildLayout(group.childLayout),
      replayChildLayout: sanitizeChildLayout(group.replayChildLayout),
      structure: sanitizeGroupStructure(group.structure),
      reuseReadiness: sanitizeReuseReadiness(group.reuseReadiness),
      componentScore: safeNumber(group.componentScore),
      score: safeNumber(group.score),
      matchScore: safeNumber(group.matchScore),
      matchReasons: Array.isArray(group.matchReasons) ? group.matchReasons.map(safeString).filter(Boolean).slice(0, 20) : []
    }))
    .filter((group) => group.id)
    .slice(0, 8);
}

function sanitizeGroupStructure(structure = {}) {
  if (!structure || typeof structure !== "object") return null;
  return {
    kind: safeString(structure.kind),
    motifs: Array.isArray(structure.motifs) ? structure.motifs.map(safeString).filter(Boolean).slice(0, 8) : [],
    motifCounts: sanitizeCountMap(structure.motifCounts)
  };
}

function sanitizeReuseReadiness(readiness = {}) {
  if (!readiness || typeof readiness !== "object") return null;
  return {
    level: safeString(readiness.level),
    score: safeNumber(readiness.score),
    reasons: Array.isArray(readiness.reasons) ? readiness.reasons.map(safeString).filter(Boolean).slice(0, 12) : []
  };
}

function sanitizeCountMap(counts = {}) {
  if (!counts || typeof counts !== "object") return {};
  const out = {};
  for (const [key, value] of Object.entries(counts).slice(0, 12)) {
    const safeKey = safeString(key);
    const number = safeNumber(value);
    if (safeKey && number !== null) out[safeKey] = number;
  }
  return out;
}

function sanitizeChildLayout(layout = {}) {
  if (!layout || typeof layout !== "object") return null;
  const children = (Array.isArray(layout.children) ? layout.children : [])
    .map((child) => ({
      kind: sanitizeChildKind(child?.kind),
      box: sanitizeRelativeBox(child?.box),
      style: sanitizeChildStyle(child?.style)
    }))
    .filter((child) => child.kind && child.box)
    .map((child) => Object.keys(child.style || {}).length ? child : { kind: child.kind, box: child.box })
    .slice(0, 48);
  if (children.length === 0) return null;
  return {
    provider: safeString(layout.provider || "pptx-group-child-layout-v1"),
    boundsSource: safeString(layout.boundsSource),
    childBoxCount: safeNumber(layout.childBoxCount),
    children
  };
}

function sanitizeChildKind(value) {
  const kind = safeString(value).toLowerCase();
  return /^(shape|picture|connector)$/.test(kind) ? kind : "";
}

function sanitizeRelativeBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  const out = {
    x: clampNumber(box.x, -2, 3, 0),
    y: clampNumber(box.y, -2, 3, 0),
    w: clampNumber(box.w, 0, 3, 0),
    h: clampNumber(box.h, 0, 3, 0)
  };
  return out.w > 0 && out.h > 0 ? out : null;
}

function sanitizeChildStyle(style = {}) {
  if (!style || typeof style !== "object") return {};
  const out = {};
  const fill = safeColorOrNone(style.fill);
  const stroke = safeColorOrNone(style.stroke);
  if (fill) out.fill = fill;
  if (stroke) out.stroke = stroke;
  if (style.strokeWidthPt !== undefined) out.strokeWidthPt = clampNumber(style.strokeWidthPt, 0, 20, 0);
  if (style.radiusRatio !== undefined) out.radiusRatio = clampNumber(style.radiusRatio, 0, 1, 0);
  const shapeType = safeShapeType(style.shapeType);
  if (shapeType) out.shapeType = shapeType;
  const connectorType = safeConnectorType(style.connectorType);
  if (connectorType) out.connectorType = connectorType;
  const startArrow = safeArrowType(style.startArrow);
  const endArrow = safeArrowType(style.endArrow);
  const dash = safeDashType(style.dash);
  if (startArrow) out.startArrow = startArrow;
  if (endArrow) out.endArrow = endArrow;
  if (dash) out.dash = dash;
  if (style.rotation !== undefined) out.rotation = clampNumber(style.rotation, -360, 360, 0);
  if (style.flipH === true) out.flipH = true;
  if (style.flipV === true) out.flipV = true;
  if (style.opacity !== undefined) out.opacity = clampNumber(style.opacity, 0, 1, 1);
  const adjustments = sanitizeAdjustments(style.adjustments);
  if (adjustments.length > 0) out.adjustments = adjustments;
  const gradient = sanitizeGradient(style.gradient);
  if (gradient) out.gradient = gradient;
  const freeform = sanitizeFreeform(style.freeform);
  if (freeform) out.freeform = freeform;
  const shadow = sanitizeShadow(style.shadow);
  if (shadow) out.shadow = shadow;
  const text = sanitizeChildTextStyle(style.text);
  if (text) out.text = text;
  const picture = sanitizePictureStyle(style.picture);
  if (picture) out.picture = picture;
  return out;
}

function safeColorOrNone(value) {
  const text = safeString(value);
  if (text.toLowerCase() === "none") return "none";
  return safeColor(text);
}

function sanitizeFreeform(freeform = {}) {
  if (!freeform || typeof freeform !== "object") return null;
  const points = (Array.isArray(freeform.points) ? freeform.points : [])
    .map((point) => ({
      x: clampNumber(point?.x, -2, 3, 0),
      y: clampNumber(point?.y, -2, 3, 0)
    }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    .slice(0, 80);
  if (points.length < 3) return null;
  const out = {
    points,
    closePath: freeform.closePath !== false
  };
  const segments = sanitizeFreeformSegments(freeform.segments);
  if (segments.length > 0) out.segments = segments;
  return out;
}

function sanitizeFreeformSegments(segments = []) {
  return (Array.isArray(segments) ? segments : [])
    .map((segment) => ({
      type: sanitizeFreeformSegmentType(segment?.type),
      points: (Array.isArray(segment?.points) ? segment.points : [])
        .map((point) => ({
          x: clampNumber(point?.x, -2, 3, 0),
          y: clampNumber(point?.y, -2, 3, 0)
        }))
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .slice(0, 3)
    }))
    .filter((segment) => segment.type && (segment.type === "close" || segment.points.length > 0))
    .slice(0, 120);
}

function sanitizeFreeformSegmentType(value) {
  const type = safeString(value);
  return /^(moveTo|lnTo|cubicBezTo|quadBezTo|close)$/.test(type) ? type : "";
}

function safeShapeType(value) {
  const text = safeString(value);
  return /^(rect|roundRect|ellipse|line|triangle|rightTriangle|diamond|hexagon|chevron|parallelogram|arc|blockArc|circularArrow|bentArrow|leftArrow|rightArrow|upArrow|downArrow|leftRightArrow|upDownArrow|curvedLeftArrow|curvedRightArrow|uturnArrow|donut|cloud|document|screen|phone)$/i.test(text)
    ? text
    : "";
}

function safeConnectorType(value) {
  const text = safeString(value).toLowerCase();
  return /^(straight|elbow|curve)$/.test(text) ? text : "";
}

function safeArrowType(value) {
  const text = safeString(value).toLowerCase();
  return /^(triangle|stealth|arrow|none)$/.test(text) ? text : "";
}

function safeDashType(value) {
  const text = safeString(value).toLowerCase();
  return /^(dash|dot)$/.test(text) ? text : "";
}

function sanitizeAdjustments(adjustments = []) {
  return (Array.isArray(adjustments) ? adjustments : [])
    .map((value) => clampNumber(value, -2, 2, 0))
    .filter((value) => Number.isFinite(value))
    .slice(0, 8);
}

function sanitizeGradient(gradient = {}) {
  if (!gradient || typeof gradient !== "object" || !Array.isArray(gradient.stops)) return null;
  const stops = gradient.stops
    .map((stop) => ({
      position: clampNumber(stop?.position, 0, 1, 0),
      color: safeColor(stop?.color),
      ...(stop?.alpha !== undefined ? { alpha: clampNumber(stop.alpha, 0, 1, 1) } : {})
    }))
    .filter((stop) => stop.color)
    .slice(0, 8);
  if (stops.length < 2) return null;
  return {
    type: safeString(gradient.type || "linear"),
    angleDeg: clampNumber(gradient.angleDeg, -360, 360, 0),
    stops
  };
}

function sanitizeShadow(shadow = {}) {
  if (!shadow || typeof shadow !== "object" || Object.keys(shadow).length === 0) return null;
  return {
    color: safeColor(shadow.color) || "#000000",
    alpha: clampNumber(shadow.alpha, 0, 1, 0.22),
    blurPt: clampNumber(shadow.blurPt, 0, 80, 0),
    distancePt: clampNumber(shadow.distancePt, 0, 80, 0),
    angleDeg: clampNumber(shadow.angleDeg, -360, 360, 90)
  };
}

function sanitizeChildTextStyle(text = {}) {
  if (!text || typeof text !== "object") return null;
  const out = {};
  if (text.placeholderText !== undefined) out.placeholderText = safeString(text.placeholderText).slice(0, 200);
  if (text.fontSizePt !== undefined) out.fontSizePt = clampNumber(text.fontSizePt, 1, 160, 14);
  const color = safeColor(text.color);
  if (color) out.color = color;
  const weight = safeString(text.weight).toLowerCase();
  if (/^(regular|normal|bold|semibold|medium)$/.test(weight)) out.weight = weight;
  const align = safeString(text.align).toLowerCase();
  if (/^(left|center|right)$/.test(align)) out.align = align;
  const valign = safeString(text.valign).toLowerCase();
  if (/^(top|middle|bottom)$/.test(valign)) out.valign = valign;
  if (text.family !== undefined) out.family = safeString(text.family).slice(0, 80);
  return Object.keys(out).length ? out : null;
}

function sanitizePictureStyle(picture = {}) {
  if (!picture || typeof picture !== "object") return null;
  const out = {};
  const embedRelId = safeString(picture.embedRelId);
  const mediaTarget = safeMediaTarget(picture.mediaTarget);
  if (embedRelId) out.embedRelId = embedRelId;
  if (mediaTarget) out.mediaTarget = mediaTarget;
  const crop = sanitizeCrop(picture.crop);
  if (crop) out.crop = crop;
  if (picture.opacity !== undefined) out.opacity = clampNumber(picture.opacity, 0, 1, 1);
  return Object.keys(out).length ? out : null;
}

function safeMediaTarget(value) {
  const text = safeString(value).replace(/\\/g, "/");
  return /^ppt\/media\/[^/]+\.(?:png|jpe?g|gif|webp|emf|wmf)$/i.test(text) ? text : "";
}

function sanitizeCrop(crop = {}) {
  if (!crop || typeof crop !== "object") return null;
  const out = {};
  for (const key of ["left", "top", "right", "bottom"]) {
    if (crop[key] !== undefined) out[key] = clampNumber(crop[key], 0, 1, 0);
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeAbsoluteBox(box = {}) {
  if (!box || typeof box !== "object") return null;
  const out = {
    x: safeNumber(box.x),
    y: safeNumber(box.y),
    w: safeNumber(box.w ?? box.width),
    h: safeNumber(box.h ?? box.height)
  };
  return [out.x, out.y, out.w, out.h].every((value) => Number.isFinite(value)) && out.w > 0 && out.h > 0 ? out : null;
}

function sanitizeTopColors(colors = []) {
  return (Array.isArray(colors) ? colors : [])
    .map((entry) => ({
      value: safeColor(entry?.value),
      count: safeNumber(entry?.count)
    }))
    .filter((entry) => entry.value && Number(entry.count) > 0)
    .slice(0, 8);
}

function sanitizeLearningSummary(summary = {}) {
  if (!summary || typeof summary !== "object") return null;
  return JSON.parse(JSON.stringify(summary, (key, value) => {
    if (typeof value === "string") return safeString(value);
    if (Array.isArray(value)) return value.slice(0, 20);
    if (value && typeof value === "object") return value;
    return value;
  }));
}

function keyFor(pageIndex, imageIndex) {
  return `${pageIndex}:${imageIndex}`;
}

function toSafeIndex(value) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number >= 0 ? number : -1;
}

function toSafeOptionalIndex(value) {
  if (value === null || value === undefined || value === "") return -1;
  return toSafeIndex(value);
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

function safeUrl(value) {
  const text = safeString(value);
  return /^https?:\/\//i.test(text) ? text : "";
}

function safeColor(value) {
  const text = safeString(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : "";
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

module.exports = {
  annotateImagesWithComponentAssets,
  annotateImagesWithComponentStrategies,
  buildComponentAssetIndex,
  buildComponentStrategyIndex,
  componentAssetLayersForPage,
  componentAssetShapeLayersForPage,
  shouldDeferNativeRebuildForComponentStrategy,
  _private: {
    keyFor,
    sanitizeAssetLayer,
    sanitizeAbsoluteBox,
    sanitizeApplicationPlan,
    sanitizeExpressionPolicy,
    sanitizeLearningSummary,
    sanitizeRecommendedGroups,
    sanitizeStrategy,
    toSafeOptionalIndex
  }
};
