"use strict";

const KNOWN_COMPONENT_MOTIFS = "arc-arrow|ring-node|card-grid|dashboard-card-grid|comparison-matrix|heatmap-matrix|tree-link|org-hierarchy|fishbone-cause|swimlane-flow|radial-link|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|layered-stack|funnel-stack|pyramid-stack|venn-overlap|intersection-overlap|concentric-circles|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|milestone-roadmap|gantt-roadmap|quadrant-axis|pie-share-chart|treemap-chart|bubble-scatter-chart|donut-segment-chart";
const KNOWN_COMPONENT_MOTIF_RE = new RegExp(`^(?:${KNOWN_COMPONENT_MOTIFS})$`);
const STRICT_COMPONENT_MOTIF_RE = /^(?:radial-link|arc-arrow|tree-link|org-hierarchy|fishbone-cause|swimlane-flow|linear-arrow-chain|whole-process-template|lens-funnel-flow|branch-card-flow|venn-overlap|intersection-overlap|concentric-circles|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|milestone-roadmap|gantt-roadmap|quadrant-axis|comparison-matrix|heatmap-matrix|pie-share-chart|treemap-chart|bubble-scatter-chart|donut-segment-chart)$/;

function recommendComponentGroupsForLayer({ layer = {}, asset = {}, limit = 3 } = {}) {
  return evaluateComponentGroupsForLayer({ layer, asset, limit }).recommendedGroups;
}

function evaluateComponentGroupsForLayer({ layer = {}, asset = {}, limit = 3, rejectedLimit = 8 } = {}) {
  const catalog = asset.learningSummary?.componentCatalog || [];
  if (!Array.isArray(catalog) || catalog.length === 0) {
    return {
      provider: "component-template-group-evaluation-v1",
      recommendedGroups: [],
      rejectedGroups: []
    };
  }
  const targetMotifs = inferTargetMotifs(layer);
  const evaluated = catalog
    .map((group) => {
      const scored = scoreComponentGroup({ layer, group });
      return {
        group: scored,
        rejectionReasons: componentGroupRejectionReasons(scored, layer, targetMotifs)
      };
    });
  const recommendedGroups = evaluated
    .filter((entry) => entry.rejectionReasons.length === 0)
    .map((entry) => entry.group)
    .sort((a, b) => b.matchScore - a.matchScore || b.componentScore - a.componentScore || a.id.localeCompare(b.id))
    .slice(0, normalizePositiveInt(limit, 3));
  const rejectedGroups = evaluated
    .filter((entry) => entry.rejectionReasons.length > 0)
    .map((entry) => ({
      id: entry.group.id,
      name: entry.group.name,
      matchScore: entry.group.matchScore,
      componentScore: entry.group.componentScore,
      structure: entry.group.structure,
      rejectionReasons: entry.rejectionReasons
    }))
    .sort((a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id))
    .slice(0, normalizePositiveInt(rejectedLimit, 8));
  return {
    provider: "component-template-group-evaluation-v1",
    targetMotifs,
    recommendedGroups,
    rejectedGroups
  };
}

function scoreComponentGroup({ layer = {}, group = {} } = {}) {
  const family = safeString(layer.templateFamily || "generic");
  const layerType = safeString(layer.layerType || "");
  const detector = safeString(layer.detector || "");
  const areaRatio = clampNumber(layer.areaRatio, 0, 1, 0);
  const layerAspect = positiveNumber(layer.aspectRatio) || aspectFromBox(layer.box);
  const bounds = group.boundsPt || {};
  const groupAspect = positiveNumber(bounds.w) && positiveNumber(bounds.h) ? bounds.w / bounds.h : null;
  const childCount = clampNumber(group.childCount, 0, 1000, 0);
  const connectorCount = clampNumber(group.connectorCount, 0, 1000, 0);
  const pictureCount = clampNumber(group.pictureCount, 0, 1000, 0);
  const shapeCount = clampNumber(group.shapeCount, 0, 1000, 0);
  const textRuns = clampNumber(group.textRuns, 0, 1000, 0);
  const hasChildLayout = hasUsableChildLayout(group.childLayout);
  const hasHorizontalChildLayout = hasHorizontalTimelineChildLayout(group.childLayout);
  const hasCycleShapeLayout = hasCycleLikeChildLayout(group.childLayout);
  const structureKind = safeString(group.structure?.kind).toLowerCase();
  const nativeComponent = nativeComponentSignature(layer);
  const reuseReadiness = sanitizeReuseReadiness(group.reuseReadiness);
  const reasons = [];
  let score = 0;

  add(Math.min(30, clampNumber(group.componentScore, 0, 200, 0) * 0.25), "catalog-component-score");
  if (reuseReadiness) {
    add(Math.min(20, reuseReadiness.score * 0.2), `reuse-${reuseReadiness.level}`);
    if (reuseReadiness.level === "avoid") add(-24, "avoid-low-reuse-readiness");
  }
  addAspectScore({ layerAspect, groupAspect });

  if (family === "process-chain") {
    if (connectorCount >= 1) add(18, "process-chain-connectors");
    if (childCount >= 6) add(12, "process-chain-multipart");
    if (groupAspect !== null && groupAspect >= 2.2) add(14, "wide-process-aspect");
    if (structureKind === "process-chain") add(18, "learned-process-structure");
    if (structureKind === "timeline") add(8, "learned-horizontal-structure");
  } else if (family === "grid-or-matrix") {
    if (shapeCount >= 12) add(14, "matrix-many-shapes");
    if (connectorCount >= 2) add(8, "matrix-connectors");
    if (groupAspect !== null && groupAspect >= 1.4) add(8, "matrix-wide-layout");
    if (structureKind === "matrix") add(22, "learned-matrix-structure");
  } else if (family === "hub-spoke") {
    if (connectorCount >= 3) add(18, "hub-spoke-connectors");
    if (childCount >= 10) add(10, "hub-spoke-multipart");
    if (groupAspect !== null && groupAspect >= 0.75 && groupAspect <= 1.8) add(10, "hub-spoke-balanced-aspect");
    if (structureKind === "hub-spoke") add(24, "learned-hub-spoke-structure");
  } else if (family === "cycle-loop") {
    if (childCount >= 8) add(14, "cycle-loop-multipart");
    if (shapeCount >= 8 && pictureCount === 0) add(16, "cycle-loop-native-shapes");
    if (shapeCount >= 8 && pictureCount <= Math.max(1, shapeCount * 0.35)) add(8, "cycle-loop-shape-dominant");
    if (groupAspect !== null && groupAspect >= 0.75 && groupAspect <= 2.4) add(12, "cycle-loop-compatible-aspect");
    if (hasCycleShapeLayout) add(20, "cycle-loop-arc-or-node-layout");
    if (structureKind === "cycle-loop") add(24, "learned-cycle-loop-structure");
  } else if (family === "timeline") {
    if (groupAspect !== null && groupAspect >= 3) add(18, "timeline-wide-layout");
    if (connectorCount >= 1) add(10, "timeline-connectors");
    if (hasHorizontalChildLayout) add(22, "timeline-child-layout");
    if (structureKind === "timeline") add(22, "learned-timeline-structure");
  } else if (/^(bar|line|scatter|donut|pie)-chart$/.test(family)) {
    if (structureKind === family) add(24, `learned-${family}-structure`);
    if (family === "scatter-chart" && structureKind === "bubble-chart") add(24, "learned-bubble-chart-structure");
    if (family === "donut-chart" && structureKind === "segmented-donut") add(24, "learned-segmented-donut-structure");
    if (pictureCount === 0) add(10, "chart-native-no-picture");
    if (childCount >= 3) add(8, "chart-multipart");
    if (groupAspect !== null && groupAspect >= 1.2) add(8, "chart-compatible-aspect");
  } else if (family === "treemap-chart") {
    if (structureKind === "treemap-chart" || structureKind === "treemap") add(24, "learned-treemap-structure");
    if (pictureCount === 0) add(10, "chart-native-no-picture");
    if (shapeCount >= 4) add(10, "treemap-multipart-tiles");
    if (groupAspect !== null && groupAspect >= 1.1) add(8, "chart-compatible-aspect");
  } else {
    if (childCount >= 8) add(8, "generic-multipart");
    if (connectorCount >= 1) add(8, "generic-connectors");
  }

  addNativeComponentScore(nativeComponent);

  const motifs = groupMotifSet(group);
  if (motifs.has("lens-funnel-flow")) add(18, "learned-lens-funnel-flow-motif");
  if (motifs.has("branch-card-flow")) add(16, "learned-branch-card-flow-motif");
  if (motifs.has("fishbone-cause")) add(18, "learned-fishbone-cause-motif");
  if (motifs.has("venn-overlap")) add(18, "learned-venn-overlap-motif");
  if (motifs.has("intersection-overlap")) add(14, "learned-intersection-overlap-motif");
  if (motifs.has("concentric-circles")) add(18, "learned-concentric-circles-motif");
  if (motifs.has("sankey-flow-chart")) add(18, "learned-sankey-flow-chart-motif");
  if (motifs.has("waterfall-chart")) add(16, "learned-waterfall-chart-motif");
  if (motifs.has("gauge-chart")) add(16, "learned-gauge-chart-motif");
  if (motifs.has("radar-chart")) add(16, "learned-radar-chart-motif");
  if (motifs.has("map-chart")) add(12, "learned-map-chart-motif");
  if (motifs.has("word-cloud-chart")) add(12, "learned-word-cloud-chart-motif");
  if (motifs.has("milestone-roadmap")) add(16, "learned-milestone-roadmap-motif");
  if (motifs.has("quadrant-axis")) add(16, "learned-quadrant-axis-motif");
  if (motifs.has("pie-share-chart")) add(16, "learned-pie-share-chart-motif");
  if (motifs.has("comparison-matrix")) add(16, "learned-comparison-matrix-motif");
  if (motifs.has("heatmap-matrix")) add(16, "learned-heatmap-matrix-motif");
  if (motifs.has("org-hierarchy")) add(16, "learned-org-hierarchy-motif");
  if (motifs.has("swimlane-flow")) add(16, "learned-swimlane-flow-motif");
  if (motifs.has("treemap-chart")) add(18, "learned-treemap-chart-motif");
  if (motifs.has("bubble-scatter-chart")) add(18, "learned-bubble-scatter-chart-motif");
  if (motifs.has("donut-segment-chart")) add(18, "learned-donut-segment-chart-motif");
  if (motifs.has("gantt-roadmap")) add(14, "learned-gantt-roadmap-motif");
  if (motifs.has("layered-stack")) add(12, "learned-layered-stack-motif");
  if (motifs.has("funnel-stack")) add(10, "learned-funnel-stack-motif");
  if (motifs.has("pyramid-stack")) add(10, "learned-pyramid-stack-motif");

  if (/diagram|illustration|table/.test(layerType)) add(8, "structural-layer-type");
  if (/screenshot/.test(layerType) && pictureCount === 0 && connectorCount >= 1) add(4, "screenshot-flow-overlay-possible");
  if (/screenshot/.test(layerType) && pictureCount > childCount * 0.3) add(-16, "avoid-bitmap-heavy-for-screenshot");
  if (/cycle|hub|spoke|关系|辐射/.test(`${detector} ${family}`) && connectorCount >= 3) add(10, "radial-or-cycle-evidence");
  if (areaRatio >= 0.3 && childCount >= 10) add(8, "large-layer-needs-multipart-component");
  if (areaRatio < 0.15 && childCount > 45) add(-18, "small-layer-avoid-huge-component");
  if ((bounds.w === 0 || bounds.h === 0) && !hasChildLayout) add(-18, "missing-group-bounds");
  if (pictureCount > shapeCount) add(-20, "bitmap-heavy-group");
  if (textRuns > 0) add(4, "text-bearing-group");

  score = Math.max(0, Math.round(score * 100) / 100);
  return {
    id: safeString(group.id),
    slide: clampNumber(group.slide, 0, 10000, 0),
    groupIndex: clampNumber(group.groupIndex, 0, 10000, 0),
    name: safeString(group.name),
    boundsPt: sanitizeBounds(group.boundsPt),
    childCount,
    shapeCount,
    pictureCount,
    connectorCount,
    textRuns,
    topColors: sanitizeTopColors(group.topColors),
    childLayout: sanitizeChildLayout(group.childLayout),
    replayChildLayout: sanitizeChildLayout(group.replayChildLayout),
    structure: sanitizeStructure(group.structure),
    reuseReadiness,
    componentScore: clampNumber(group.componentScore, 0, 10000, 0),
    matchScore: score,
    matchReasons: reasons
  };

  function add(value, reason) {
    score += value;
    if (value > 0) reasons.push(reason);
  }

  function addNativeComponentScore(native) {
    if (!native.present) return;
    const nativeArchetype = safeString(native.archetype).toLowerCase();
    if (nativeArchetype && (structureKind === nativeArchetype || family === nativeArchetype)) add(18, `native-component-archetype:${nativeArchetype}`);
    if (native.partCount > 1 && childCount > 0) {
      const ratio = Math.max(native.partCount, childCount) / Math.max(1, Math.min(native.partCount, childCount));
      if (ratio <= 1.5) add(14, "native-component-part-count-close");
      else if (ratio <= 2.5) add(6, "native-component-part-count-compatible");
      else add(-10, "native-component-part-count-different");
    }
    if (native.bounds && bounds?.w && bounds?.h) addAspectScore({ layerAspect: aspectFromBox(native.bounds), groupAspect });
    if (native.replacementKey && pictureCount === 0) add(6, "native-component-editable-group");
  }

  function addAspectScore({ layerAspect, groupAspect }) {
    if (!layerAspect || !groupAspect) return;
    const ratio = Math.max(layerAspect, groupAspect) / Math.max(0.001, Math.min(layerAspect, groupAspect));
    if (ratio <= 1.35) add(20, "aspect-close");
    else if (ratio <= 2.1) add(10, "aspect-compatible");
    else if (ratio >= 4) add(-24, "aspect-very-different");
    else add(-10, "aspect-different");
  }
}

function hasUsableChildLayout(layout = {}) {
  return !!layout
    && typeof layout === "object"
    && Array.isArray(layout.children)
    && layout.children.some((child) => child?.box && positiveNumber(child.box.w) && positiveNumber(child.box.h));
}

function hasHorizontalTimelineChildLayout(layout = {}) {
  if (!hasUsableChildLayout(layout)) return false;
  const points = layout.children
    .filter((child) => String(child?.kind || "") !== "connector")
    .map((child) => child.box || {})
    .filter((box) => positiveNumber(box.w) && positiveNumber(box.h))
    .map((box) => ({
      x: Number(box.x || 0) + Number(box.w || 0) / 2,
      y: Number(box.y || 0) + Number(box.h || 0) / 2
    }));
  if (points.length < 3) return false;
  const spreadX = Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x));
  const spreadY = Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y));
  return spreadX >= 0.45 && spreadY <= 0.70;
}

function hasCycleLikeChildLayout(layout = {}) {
  if (!hasUsableChildLayout(layout)) return false;
  const children = Array.isArray(layout.children) ? layout.children : [];
  let cycleShapes = 0;
  let nodeLikeShapes = 0;
  for (const child of children) {
    const shapeType = safeString(child?.style?.shapeType).toLowerCase();
    if (/arc|circular|cycle|triangle/.test(shapeType)) cycleShapes += 1;
    if (/ellipse|oval|roundrect|rect/.test(shapeType)) nodeLikeShapes += 1;
  }
  return cycleShapes >= 1 && nodeLikeShapes >= 2;
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
    childBoxCount: clampNumber(layout.childBoxCount, 0, 1000, children.length),
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
  const shapeType = safeShapeType(style.shapeType);
  const connectorType = safeConnectorType(style.connectorType);
  const startArrow = safeArrowType(style.startArrow);
  const endArrow = safeArrowType(style.endArrow);
  const dash = safeDashType(style.dash);
  const shadow = sanitizeShadow(style.shadow);
  const gradient = sanitizeGradient(style.gradient);
  const adjustments = sanitizeAdjustments(style.adjustments, shapeType);
  const freeform = sanitizeFreeform(style.freeform);
  const picture = sanitizePicture(style.picture);
  const text = sanitizeText(style.text);
  if (fill) out.fill = fill;
  if (stroke) out.stroke = stroke;
  if (Number.isFinite(Number(style.strokeWidthPt))) {
    out.strokeWidthPt = clampNumber(style.strokeWidthPt, 0, 12, 0);
  }
  if (Number.isFinite(Number(style.opacity))) out.opacity = clampNumber(style.opacity, 0, 1, 1);
  if (Number.isFinite(Number(style.rotation))) out.rotation = clampNumber(style.rotation, -360, 360, 0);
  if (style.flipH === true) out.flipH = true;
  if (style.flipV === true) out.flipV = true;
  if (shapeType) out.shapeType = shapeType;
  if (connectorType) out.connectorType = connectorType;
  if (startArrow) out.startArrow = startArrow;
  if (endArrow) out.endArrow = endArrow;
  if (dash) out.dash = dash;
  if (shadow) out.shadow = shadow;
  if (gradient) out.gradient = gradient;
  if (adjustments.length > 0) out.adjustments = adjustments;
  if (freeform) out.freeform = freeform;
  if (picture) out.picture = picture;
  if (text) out.text = text;
  return out;
}

function sanitizeText(text = {}) {
  if (!text || typeof text !== "object") return null;
  const out = {};
  const placeholderText = safeString(text.placeholderText).slice(0, 200);
  if (placeholderText) out.placeholderText = placeholderText;
  if (Number.isFinite(Number(text.fontSizePt))) out.fontSizePt = clampNumber(text.fontSizePt, 1, 160, 14);
  const color = safeColor(text.color);
  if (color) out.color = color;
  const weight = safeString(text.weight).toLowerCase();
  if (/^(regular|normal|bold|semibold|medium)$/.test(weight)) out.weight = weight;
  const align = safeString(text.align).toLowerCase();
  if (/^(left|center|right)$/.test(align)) out.align = align;
  const valign = safeString(text.valign).toLowerCase();
  if (/^(top|middle|bottom)$/.test(valign)) out.valign = valign;
  const family = safeString(text.family).slice(0, 80);
  if (family) out.family = family;
  const gradient = sanitizeGradient(text.gradient);
  if (gradient) out.gradient = gradient;
  const reflection = sanitizeTextReflection(text.reflection);
  if (reflection) out.reflection = reflection;
  if (Number.isFinite(Number(text.lineHeightMultiple))) {
    out.lineHeightMultiple = clampNumber(text.lineHeightMultiple, 0.5, 4, 1);
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeTextReflection(reflection = {}) {
  if (!reflection || typeof reflection !== "object") return null;
  const out = {};
  for (const [key, min, max, fallback] of [
    ["blurPt", 0, 40, 0], ["startAlpha", 0, 1, 0.6], ["startPosition", 0, 1, 0],
    ["endAlpha", 0, 1, 0], ["endPosition", 0, 1, 1], ["distancePt", 0, 40, 0],
    ["directionDeg", -360, 360, 90], ["fadeDirectionDeg", -360, 360, 90],
    ["scaleX", -2, 2, 1], ["scaleY", -2, 2, -1],
    ["skewXDeg", -90, 90, 0], ["skewYDeg", -90, 90, 0]
  ]) {
    if (Number.isFinite(Number(reflection[key]))) out[key] = clampNumber(reflection[key], min, max, fallback);
  }
  const alignment = safeString(reflection.alignment).toLowerCase();
  if (/^(tl|t|tr|l|ctr|r|bl|b|br)$/.test(alignment)) out.alignment = alignment;
  if (typeof reflection.rotateWithShape === "boolean") out.rotateWithShape = reflection.rotateWithShape;
  return Object.keys(out).length ? out : null;
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

function sanitizeStructure(structure = {}) {
  if (!structure || typeof structure !== "object") return null;
  const kind = safeStructureKind(structure.kind);
  const roles = sanitizeStructureRoles(structure.roles);
  const out = {};
  if (kind) out.kind = kind;
  if (roles) out.roles = roles;
  const motifCounts = sanitizeMotifCounts(structure.motifCounts);
  const motifs = sanitizeMotifs(structure.motifs, motifCounts);
  if (motifs.length > 0) out.motifs = motifs;
  if (Object.keys(motifCounts).length > 0) out.motifCounts = motifCounts;
  for (const [sourceKey, targetKey] of [
    ["nodeCount", "nodeCount"],
    ["connectorCount", "connectorCount"],
    ["textSlotCount", "textSlotCount"],
    ["pictureSlotCount", "pictureSlotCount"]
  ]) {
    if (Number.isFinite(Number(structure[sourceKey]))) {
      out[targetKey] = clampNumber(structure[sourceKey], 0, 1000, 0);
    }
  }
  return Object.keys(out).length ? out : null;
}

function inferTargetMotifs(layer = {}) {
  const values = [
    ...(Array.isArray(layer.targetMotifs) ? layer.targetMotifs : []),
    ...(Array.isArray(layer.plan?.targetMotifs) ? layer.plan.targetMotifs : []),
    ...(Array.isArray(layer.componentRenderStrategy?.targetMotifs) ? layer.componentRenderStrategy.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.targetMotifs) ? layer.diagramUnderstanding.targetMotifs : []),
    ...(Array.isArray(layer.diagramUnderstanding?.componentStrategy?.targetMotifs) ? layer.diagramUnderstanding.componentStrategy.targetMotifs : [])
  ].map(normalizeMotif).filter(Boolean);
  return [...new Set(values)];
}

function groupMatchesTargetMotifs(group = {}, targetMotifs = []) {
  const targets = (Array.isArray(targetMotifs) ? targetMotifs : []).map(normalizeMotif).filter(Boolean);
  if (targets.length === 0) return true;
  const structure = group.structure || {};
  const motifs = new Set([
    ...(Array.isArray(structure.motifs) ? structure.motifs.map(normalizeMotif) : []),
    ...Object.keys(structure.motifCounts || {}).map(normalizeMotif)
  ].filter(Boolean));
  if (motifs.size === 0) return true;
  return targets.some((motif) => motifs.has(motif));
}

function groupHasRequiredMotifEvidence(group = {}, targetMotifs = []) {
  const targets = (Array.isArray(targetMotifs) ? targetMotifs : []).map(normalizeMotif).filter(Boolean);
  if (!targets.some(isStrictMotif)) return true;
  const motifs = groupMotifSet(group);
  return targets.some((motif) => motifs.has(motif));
}

function groupHasCompatibleGeometryAndSlots(group = {}, layer = {}, targetMotifs = []) {
  const targets = (Array.isArray(targetMotifs) ? targetMotifs : []).map(normalizeMotif).filter(Boolean);
  if (!targets.some(isStrictMotif)) return true;
  if (!aspectCompatibleForStrictMotif(group, layer)) return false;
  if (!nodeCountCompatibleForStrictMotif(group, layer)) return false;
  if (!textSlotCompatibleForStrictMotif(group, layer)) return false;
  return true;
}

function componentGroupRejectionReasons(group = {}, layer = {}, targetMotifs = []) {
  const reasons = [];
  if (!groupMatchesTargetMotifs(group, targetMotifs)) reasons.push("target-motif-conflict");
  if (!groupHasRequiredMotifEvidence(group, targetMotifs)) reasons.push("strict-motif-evidence-missing");
  if (!aspectCompatibleForStrictMotif(group, layer)) reasons.push("strict-aspect-incompatible");
  if (!nodeCountCompatibleForStrictMotif(group, layer)) reasons.push("strict-node-count-incompatible");
  if (!textSlotCompatibleForStrictMotif(group, layer)) reasons.push("strict-text-slot-incompatible");
  if (clampNumber(group.matchScore, 0, 1000, 0) < 35) reasons.push("match-score-below-threshold");
  return reasons;
}

function aspectCompatibleForStrictMotif(group = {}, layer = {}) {
  const layerAspect = positiveNumber(layer.aspectRatio) || aspectFromBox(layer.box);
  const groupAspect = aspectFromBox(group.boundsPt);
  if (!layerAspect || !groupAspect) return true;
  const ratio = Math.max(layerAspect, groupAspect) / Math.max(0.001, Math.min(layerAspect, groupAspect));
  return ratio <= 2.35;
}

function nodeCountCompatibleForStrictMotif(group = {}, layer = {}) {
  const layerNodes = layerNodeCount(layer);
  const groupNodes = groupNodeCount(group);
  if (layerNodes < 3 || groupNodes < 3) return true;
  return groupNodes >= Math.max(2, Math.floor(layerNodes * 0.5))
    && groupNodes <= Math.ceil(layerNodes * 2.25);
}

function textSlotCompatibleForStrictMotif(group = {}, layer = {}) {
  const layerTextSlots = layerTextSlotCount(layer);
  const groupTextSlots = groupTextSlotCount(group);
  if (layerTextSlots < 2 || groupTextSlots === 0) return true;
  return groupTextSlots >= Math.max(1, Math.floor(layerTextSlots * 0.5))
    && groupTextSlots <= Math.ceil(layerTextSlots * 2.5);
}

function layerNodeCount(layer = {}) {
  const understanding = layer.diagramUnderstanding || {};
  return Math.max(
    clampNumber(layer.nodeCount, 0, 1000, 0),
    clampNumber(understanding.nodeCount, 0, 1000, 0),
    clampNumber(understanding.visualNodeCount, 0, 1000, 0)
  );
}

function nativeComponentSignature(layer = {}) {
  const source = layer.source || {};
  const style = layer.style || {};
  const archetype = safeString(
    layer.nativeComponentArchetype
    || source.nativeComponentArchetype
    || style.nativeComponentArchetype
    || layer.diagramUnderstanding?.nativeComponentArchetype
  );
  const replacementKey = safeString(
    layer.nativeComponentReplacementKey
    || source.nativeComponentReplacementKey
    || style.nativeComponentReplacementKey
  );
  const minimumUnit = safeString(
    layer.nativeComponentMinimumUnit
    || source.nativeComponentMinimumUnit
    || style.nativeComponentMinimumUnit
  );
  const partCount = clampNumber(
    layer.nativeComponentPartCount
    || source.nativeComponentPartCount
    || style.nativeComponentPartCount,
    0,
    1000,
    0
  );
  const bounds = sanitizeBounds(
    layer.nativeComponentBounds
    || source.nativeComponentBounds
    || style.nativeComponentBounds
    || null
  );
  return {
    present: !!(archetype || replacementKey || minimumUnit || partCount > 0),
    archetype,
    replacementKey,
    minimumUnit,
    partCount,
    bounds
  };
}

function groupNodeCount(group = {}) {
  return Math.max(
    clampNumber(group.structure?.nodeCount, 0, 1000, 0),
    clampNumber(group.structure?.roles?.node, 0, 1000, 0),
    estimateNodeCountFromChildLayout(group.childLayout)
  );
}

function layerTextSlotCount(layer = {}) {
  const understanding = layer.diagramUnderstanding || {};
  return Math.max(
    clampNumber(layer.textSlotCount, 0, 1000, 0),
    clampNumber(understanding.textSlotCount, 0, 1000, 0),
    clampNumber(understanding.nodeCount, 0, 1000, 0)
  );
}

function groupTextSlotCount(group = {}) {
  return Math.max(
    clampNumber(group.structure?.textSlotCount, 0, 1000, 0),
    clampNumber(group.structure?.roles?.textSlot, 0, 1000, 0),
    clampNumber(group.textRuns, 0, 1000, 0),
    estimateTextSlotCountFromChildLayout(group.childLayout)
  );
}

function estimateNodeCountFromChildLayout(layout = {}) {
  if (!hasUsableChildLayout(layout)) return 0;
  return (layout.children || [])
    .filter((child) => child?.kind === "shape")
    .filter((child) => {
      const shapeType = safeString(child?.style?.shapeType).toLowerCase();
      return /^(rect|roundrect|ellipse|oval|diamond|hexagon|chevron|parallelogram|donut|cloud|document|screen|phone)$/.test(shapeType);
    }).length;
}

function estimateTextSlotCountFromChildLayout(layout = {}) {
  if (!hasUsableChildLayout(layout)) return 0;
  return (layout.children || [])
    .filter((child) => child?.style?.text && Object.keys(child.style.text || {}).length > 0)
    .length;
}

function groupMotifSet(group = {}) {
  const structure = group.structure || {};
  return new Set([
    ...(Array.isArray(structure.motifs) ? structure.motifs.map(normalizeMotif) : []),
    ...Object.keys(structure.motifCounts || {}).map(normalizeMotif)
  ].filter(Boolean));
}

function isStrictMotif(value) {
  const motif = normalizeMotif(value);
  return STRICT_COMPONENT_MOTIF_RE.test(motif);
}

function sanitizeMotifs(motifs = [], motifCounts = {}) {
  const fromArray = Array.isArray(motifs) ? motifs : [];
  const combined = [...fromArray, ...Object.keys(motifCounts || {})];
  return [...new Set(combined.map(safeMotif).filter(Boolean))].slice(0, 12);
}

function normalizeMotif(value) {
  const motif = safeString(value).toLowerCase();
  return KNOWN_COMPONENT_MOTIF_RE.test(motif) ? motif : "";
}

function sanitizeMotifCounts(motifCounts = {}) {
  if (!motifCounts || typeof motifCounts !== "object" || Array.isArray(motifCounts)) return {};
  const out = {};
  for (const [motif, rawCount] of Object.entries(motifCounts)) {
    const safe = safeMotif(motif);
    if (!safe) continue;
    out[safe] = clampNumber(rawCount, 0, 1000, 0);
  }
  return out;
}

function safeMotif(value) {
  const motif = safeString(value).toLowerCase();
  return KNOWN_COMPONENT_MOTIF_RE.test(motif) ? motif : "";
}

function sanitizeReuseReadiness(readiness = {}) {
  if (!readiness || typeof readiness !== "object") return null;
  const level = safeString(readiness.level).toLowerCase();
  if (!/^(high|medium|low|avoid)$/.test(level)) return null;
  const reasons = (Array.isArray(readiness.reasons) ? readiness.reasons : [])
    .map((reason) => safeString(reason).toLowerCase())
    .filter((reason) => /^[a-z0-9_.:-]{1,80}$/.test(reason))
    .slice(0, 10);
  return {
    level,
    score: clampNumber(readiness.score, 0, 100, 0),
    reasons
  };
}

function sanitizeStructureRoles(roles = {}) {
  if (!roles || typeof roles !== "object") return null;
  const out = {};
  for (const key of ["background", "node", "connector", "textSlot", "pictureSlot", "decoration"]) {
    if (Number.isFinite(Number(roles[key]))) out[key] = clampNumber(roles[key], 0, 1000, 0);
  }
  return Object.keys(out).length ? out : null;
}

function safeStructureKind(value) {
  const kind = safeString(value).toLowerCase();
  return /^(unknown|image-heavy|hub-spoke|cycle-loop|process-chain|timeline|matrix|card-group|mixed|fishbone-cause-effect|swimlane-flow|hierarchy-tree|quadrant-matrix|comparison-matrix|heatmap-matrix|venn-overlap|concentric-circles|sankey-flow-chart|map-chart|word-cloud-chart|waterfall-chart|gauge-chart|radar-chart|treemap|treemap-chart|bubble-chart|segmented-donut|scatter-chart|donut-chart|pie-chart)$/.test(kind) ? kind : "";
}

function sanitizePicture(picture = {}) {
  if (!picture || typeof picture !== "object") return null;
  const out = {};
  const embedRelId = safeRelationshipId(picture.embedRelId);
  if (embedRelId) out.embedRelId = embedRelId;
  const mediaTarget = safeMediaTarget(picture.mediaTarget);
  if (mediaTarget) out.mediaTarget = mediaTarget;
  const crop = sanitizePictureCrop(picture.crop);
  if (crop) out.crop = crop;
  if (Number.isFinite(Number(picture.opacity))) out.opacity = clampNumber(picture.opacity, 0, 1, 1);
  return Object.keys(out).length ? out : null;
}

function sanitizePictureCrop(crop = {}) {
  if (!crop || typeof crop !== "object") return null;
  const out = {};
  for (const key of ["left", "top", "right", "bottom"]) {
    if (!Number.isFinite(Number(crop[key]))) continue;
    const value = Math.round(clampNumber(crop[key], 0, 1, 0) * 10000) / 10000;
    if (value > 0) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

function sanitizeShadow(shadow = {}) {
  if (!shadow || typeof shadow !== "object") return null;
  if (!Object.values(shadow).some((value) => value !== undefined && value !== null && value !== "")) return null;
  return {
    color: safeColor(shadow.color) || "#000000",
    alpha: clampNumber(shadow.alpha, 0, 1, 0.18),
    blurPt: clampNumber(shadow.blurPt, 0, 40, 4),
    distancePt: clampNumber(shadow.distancePt, 0, 40, 1),
    angleDeg: clampNumber(shadow.angleDeg, 0, 360, 90)
  };
}

function sanitizeGradient(gradient = {}) {
  if (!gradient || typeof gradient !== "object") return null;
  if (safeString(gradient.type).toLowerCase() !== "linear") return null;
  const stops = (Array.isArray(gradient.stops) ? gradient.stops : [])
    .map((stop) => ({
      position: clampNumber(stop?.position, 0, 1, 0),
      color: safeColor(stop?.color),
      ...(stop?.alpha !== undefined ? { alpha: clampNumber(stop.alpha, 0, 1, 1) } : {})
    }))
    .filter((stop) => stop.color)
    .slice(0, 6)
    .sort((a, b) => a.position - b.position);
  if (stops.length < 2) return null;
  return {
    type: "linear",
    angleDeg: clampNumber(gradient.angleDeg, -360, 360, 0),
    stops
  };
}

function sanitizeAdjustments(adjustments = [], shapeType = "") {
  const limit = String(shapeType || "").toLowerCase() === "arc" ? 360 : 10;
  return (Array.isArray(adjustments) ? adjustments : [])
    .map((value) => Number(value))
    .filter(Number.isFinite)
    .map((value) => Math.round(clampNumber(value, -limit, limit, 0) * 10000) / 10000)
    .slice(0, 4);
}

function sanitizeTopColors(colors = []) {
  return (Array.isArray(colors) ? colors : [])
    .map((entry) => ({
      value: safeColor(entry?.value),
      count: clampNumber(entry?.count, 0, 10000, 0)
    }))
    .filter((entry) => entry.value && entry.count > 0)
    .slice(0, 8);
}

function sanitizeBounds(bounds = {}) {
  if (!bounds || typeof bounds !== "object") return null;
  return {
    x: round(bounds.x),
    y: round(bounds.y),
    w: round(bounds.w),
    h: round(bounds.h)
  };
}

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function aspectFromBox(box = {}) {
  const width = positiveNumber(box?.w ?? box?.width);
  const height = positiveNumber(box?.h ?? box?.height);
  return width && height ? width / height : 0;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizePositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function round(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function safeString(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
}

function safeRelationshipId(value) {
  const text = safeString(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : "";
}

function safeMediaTarget(value) {
  const text = safeString(value).replace(/\\/g, "/");
  if (!/^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text)) return "";
  if (text.includes("..")) return "";
  return text;
}

function safeColor(value) {
  const text = safeString(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : "";
}

function safeColorOrNone(value) {
  const text = safeString(value);
  if (text.toLowerCase() === "none") return "none";
  return safeColor(text);
}

function safeShapeType(value) {
  const text = safeString(value).toLowerCase();
  if ([
    "rect", "roundrect", "ellipse", "oval", "line", "triangle", "righttriangle",
    "diamond", "hexagon", "chevron", "parallelogram", "arc", "blockarc",
    "circulararrow", "bentarrow", "leftarrow", "rightarrow", "uparrow", "downarrow",
    "leftrightarrow", "updownarrow", "curvedleftarrow", "curvedrightarrow",
    "uturnarrow", "donut", "cloud", "document", "screen", "phone"
  ].includes(text)) return text;
  return "";
}

function safeConnectorType(value) {
  const text = safeString(value).toLowerCase();
  return ["straight", "elbow", "curve"].includes(text) ? text : "";
}

function safeArrowType(value) {
  const text = safeString(value).toLowerCase();
  return ["triangle", "oval", "diamond"].includes(text) ? text : "";
}

function safeDashType(value) {
  const text = safeString(value).toLowerCase();
  return ["dash", "dot"].includes(text) ? text : "";
}

module.exports = {
  evaluateComponentGroupsForLayer,
  recommendComponentGroupsForLayer,
  scoreComponentGroup,
  _private: {
    aspectFromBox,
    aspectCompatibleForStrictMotif,
    componentGroupRejectionReasons,
    groupHasCompatibleGeometryAndSlots,
    groupHasRequiredMotifEvidence,
    groupMotifSet,
    groupNodeCount,
    groupTextSlotCount,
    hasCycleLikeChildLayout,
    hasHorizontalTimelineChildLayout,
    hasUsableChildLayout,
    layerNodeCount,
    layerTextSlotCount,
    nativeComponentSignature,
    sanitizeBounds,
    sanitizeChildLayout,
    sanitizeReuseReadiness,
    sanitizeTopColors
  }
};
