"use strict";

const { detectFishboneVisualComponents } = require("./fishbone-visual-atoms");
const { detectSemanticPieComponents } = require("./visual-pie-segments");
const { detectSemanticConcentricCircles } = require("./visual-concentric-circles");
const { detectSemanticQuadrantPanels } = require("./visual-quadrant-panels");
const { detectSemanticSankeyBands, detectSemanticSankeyNodes } = require("./visual-sankey-bands");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function extractVisualAtoms(image, regionBox = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!image?.rgba || !regionBox) return [];
  const pxRegion = ptToPxBox(regionBox, image, slideSize, 0);
  if (pxRegion.w < 8 || pxRegion.h < 8) return [];
  const bg = sampleBackground(image, pxRegion);
  const masks = (options.textBoxes || [])
    .map((item) => item?.box)
    .filter(Boolean)
    .filter((box) => overlapRatio(box, regionBox) >= 0.35)
    .map((box) => ptToPxBox(box, image, slideSize, 3));
  const connectedComponents = markDonutSegmentParts(foregroundComponents(image, pxRegion, bg, masks), pxRegion);
  const semanticRectChart = isSemanticRectChart(options.semanticHint);
  const semanticLayeredChart = semanticRectChart || isSemanticLayeredChart(options.semanticHint);
  const semanticCycleLoop = isSemanticCycleLoop(options.semanticHint);
  const semanticVenn = /venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠/i.test(String(options.semanticHint || ""));
  const semanticSankey = /sankey|alluvial|flow[-_\s]?(?:distribution|composition)|energy[-_\s]?flow|桑基图|流向图|流量分布|能量流/i.test(String(options.semanticHint || ""));
  const candidateColorSeparatedComponents = (semanticLayeredChart || semanticCycleLoop || semanticVenn || semanticSankey || shouldProbeColorSeparatedComponents(connectedComponents, pxRegion))
    ? foregroundComponentsBySeedColor(image, pxRegion, bg, masks)
    : [];
  const concentricColorSeparatedComponents = /concentric[-_\s]?circles?|onion[-_\s]?diagram|同心圆|洋葱图|圈层模型/i.test(String(options.semanticHint || ""))
    ? foregroundComponentsBySeedColor(image, pxRegion, bg, masks, 18)
    : candidateColorSeparatedComponents;
  const quadrantColorSeparatedComponents = /quadrant|impact[-_\s]?effort|priority[-_\s]?matrix|四象限|象限图|优先级矩阵/i.test(String(options.semanticHint || ""))
    ? foregroundComponentsBySeedColor(image, pxRegion, bg, masks, 18)
    : candidateColorSeparatedComponents;
  const fishboneComponents = detectFishboneVisualComponents(image, pxRegion, candidateColorSeparatedComponents, {
    semanticHint: options.semanticHint,
    masks
  });
  const colorSeparatedComponents = fishboneComponents.length > 0 || shouldUseColorSeparatedComponents(candidateColorSeparatedComponents, pxRegion)
    ? markDonutSegmentParts(markStackedBarParts(candidateColorSeparatedComponents, pxRegion), pxRegion)
    : [];
  const components = suppressCompositeComponents([...connectedComponents, ...colorSeparatedComponents], pxRegion);
  const axisLineComponents = detectAxisLineComponents(image, pxRegion, bg, masks);
  const columnBarComponents = detectBaselineColumnBarComponents(image, pxRegion, bg, masks, axisLineComponents);
  const semanticRectComponents = detectSemanticChartRectComponents(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticGaugeComponents = detectSemanticGaugeComponents(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticRadarComponents = detectSemanticRadarComponents(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticPieComponents = detectSemanticPieComponents(image, candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticConcentricComponents = detectSemanticConcentricCircles(concentricColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticQuadrantComponents = detectSemanticQuadrantPanels(quadrantColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticVennComponents = detectSemanticVennComponents(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticSankeyNodes = detectSemanticSankeyNodes(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticSankeyComponents = detectSemanticSankeyBands(candidateColorSeparatedComponents, pxRegion, options.semanticHint);
  const semanticChartComponents = [...semanticGaugeComponents, ...semanticRadarComponents, ...semanticPieComponents, ...semanticConcentricComponents, ...semanticQuadrantComponents, ...semanticVennComponents, ...semanticSankeyNodes, ...semanticSankeyComponents];
  const semanticSearchComponents = detectSemanticSearchComponents(
    image,
    pxRegion,
    bg,
    [...connectedComponents, ...candidateColorSeparatedComponents],
    options.semanticHint
  );
  const semanticConvergenceLineComponents = detectSemanticConvergenceLineComponents(
    candidateColorSeparatedComponents,
    pxRegion,
    semanticSearchComponents,
    options.semanticHint
  );
  const semanticConvergenceNodeComponents = detectSemanticConvergenceNodeComponents(
    candidateColorSeparatedComponents,
    pxRegion,
    semanticSearchComponents
  );
  const diagonalLineComponents = detectDiagonalLineComponents(connectedComponents, pxRegion);
  const effectiveAxisLineComponents = semanticSankey ? [] : axisLineComponents;
  const effectiveDiagonalLineComponents = semanticSankey ? [] : diagonalLineComponents;
  const lowContrastContainerComponents = detectLowContrastContainerComponents(image, pxRegion, bg, masks);
  const genericComponents = fishboneComponents.length > 0 ? [] : suppressSemanticSearchCompositeComponents([
    ...suppressSemanticSpecialChartComponents(
      suppressSemanticRectChartCompositeComponents(
        suppressColumnChartCompositeComponents(mergeCloseComponents(components, image), columnBarComponents),
        semanticRectComponents
      ),
      semanticChartComponents
    ),
    ...columnBarComponents,
    ...semanticRectComponents,
    ...semanticChartComponents,
    ...lowContrastContainerComponents,
    ...effectiveAxisLineComponents,
    ...effectiveDiagonalLineComponents
  ], [...semanticSearchComponents, ...semanticConvergenceLineComponents, ...semanticConvergenceNodeComponents]);
  const atoms = dedupeComponents([
    ...genericComponents,
    ...semanticConvergenceNodeComponents,
    ...semanticConvergenceLineComponents,
    ...semanticSearchComponents,
    ...fishboneComponents
  ])
    .filter((component) => isUsefulAtom(component, pxRegion))
    .slice(0, Number(options.maxAtoms || 80))
    .map((component, index) => {
      const ptBox = pxToPtBox(component.box, image, slideSize, 0);
      const shapeHint = component.shapeHint || inferShapeHint(component, pxRegion);
      const lineEndpoints = component.lineEndpointsPx
        ? pxLineEndpointsToPt(component.lineEndpointsPx, image, slideSize)
        : shapeHint === "line-diagonal"
          ? pxLineEndpointsToPt(inferDiagonalLineEndpoints(component), image, slideSize)
          : null;
      const kind = component.kind || classifyAtom(component, pxRegion, shapeHint);
      const arrowDirection = kind === "connector-arrow-candidate"
        ? inferArrowDirection(component)
        : null;
      return {
        id: `atom-${index + 1}`,
        kind,
        shapeHint,
        box: ptBox,
        pixelBox: component.box,
        areaRatio: round(component.box.w * component.box.h / Math.max(1, pxRegion.w * pxRegion.h)),
        density: round(component.pixelCount / Math.max(1, component.box.w * component.box.h)),
        color: component.color,
        axis: component.axis || null,
        arrowDirection,
        lineEndpoints,
        timelineMilestones: shapeHint === "timeline" ? inferTimelineMilestones(component, image, slideSize) : null,
        donutParentBox: component.donutParentBox ? pxToPtBox(component.donutParentBox, image, slideSize, 0) : null,
        donutSegmentAngles: component.donutSegmentAngles || null,
        pieParentBox: component.pieParentBox ? pxToPtBox(component.pieParentBox, image, slideSize, 0) : null,
        pieSegmentAngles: component.pieSegmentAngles || null,
        concentricLayerIndex: Number.isInteger(component.concentricLayerIndex) ? component.concentricLayerIndex : null,
        concentricLayerCount: Number.isInteger(component.concentricLayerCount) ? component.concentricLayerCount : null,
        quadrantRow: Number.isInteger(component.quadrantRow) ? component.quadrantRow : null,
        quadrantColumn: Number.isInteger(component.quadrantColumn) ? component.quadrantColumn : null,
        vennObservedBox: component.vennObservedBox ? pxToPtBox(component.vennObservedBox, image, slideSize, 0) : null,
        vennRecoveryConfidence: Number.isFinite(Number(component.vennRecoveryConfidence)) ? round(component.vennRecoveryConfidence) : null,
        sankeyBand: component.sankeyBand ? pxSankeyBandToPt(component.sankeyBand, image, slideSize) : null,
        gaugeHoleRatio: component.gaugeHoleRatio || null,
        radarVertices: component.radarVertices ? pxPointsToPt(component.radarVertices, image, slideSize) : null,
        nativeCandidate: [
          "native-rect-candidate",
          "native-ellipse-candidate",
          "native-diamond-candidate",
          "native-triangle-candidate",
          "native-chevron-candidate",
          "native-parallelogram-candidate",
          "native-cylinder-candidate",
          "native-cloud-candidate",
          "native-document-candidate",
          "native-folder-candidate",
          "native-screen-candidate",
          "native-phone-candidate",
          "native-person-candidate",
          "native-team-candidate",
          "native-gear-candidate",
          "native-search-candidate",
          "native-shield-candidate",
          "native-timeline-candidate",
          "native-funnel-candidate",
          "native-donut-candidate",
          "native-donut-segment-candidate",
          "native-pie-segment-candidate",
          "native-concentric-circle-candidate",
          "native-quadrant-panel-candidate",
          "native-venn-ellipse-candidate",
          "native-sankey-band-candidate",
          "native-arc-arrow-segment-candidate",
          "native-scatter-point-candidate",
          "native-cycle-arrow-candidate",
          "native-gauge-arc-candidate",
          "native-gauge-needle-candidate",
          "native-radar-frame-candidate",
          "native-radar-score-candidate",
          "connector-line-candidate",
          "connector-arrow-candidate",
          "grid-line-candidate"
        ].includes(kind),
        residualCandidate: kind === "icon-crop-candidate" || kind === "screenshot-crop-candidate" || kind === "complex-shape-crop-candidate"
      };
    });
  return augmentDenseLinkedNodeAtoms(
    promoteConnectorAdjacentRectIcons(recoverResidualArcArrowSegments(promoteArcArrowSegmentAtoms(atoms), options.semanticHint)),
    image,
    pxRegion,
    regionBox,
    slideSize,
    bg,
    masks,
    options
  );
}

function detectSemanticConvergenceLineComponents(components = [], region = {}, searchComponents = [], semanticHint = "") {
  const semantic = /lens|magnifier|focus|converge|analysis|放大镜|聚焦|收敛|分析|需求/.test(String(semanticHint || "").toLowerCase());
  if (!semantic && searchComponents.length === 0) return [];
  return components
    .filter((component) => {
      const overlapsFocus = searchComponents.some((search) =>
        intersectionArea(component.box, search.box) / Math.max(1, Math.min(
          component.box.w * component.box.h,
          search.box.w * search.box.h
        )) >= 0.72);
      if (overlapsFocus) return false;
      const longEnough = Math.max(Number(component.box?.w || 0), Number(component.box?.h || 0))
        >= Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.28;
      return longEnough && (looksLikeLine(component, region) || looksLikeDiagonalLine(component, region));
    })
    .map((component) => {
      const diagonal = looksLikeDiagonalLine(component, region);
      return {
        ...component,
        kind: "connector-line-candidate",
        shapeHint: diagonal ? "line-diagonal" : "line",
        ...(diagonal ? { lineEndpointsPx: inferDiagonalLineEndpoints(component) } : {}),
        semanticConvergencePart: true
      };
    })
    .slice(0, 8);
}

function detectSemanticVennComponents(components = [], region = {}, semanticHint = "") {
  if (!/venn|overlap|intersection|set[-_\s]?relation|集合|交集|重叠/.test(String(semanticHint || "").toLowerCase())) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const candidates = components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      return Number(box.w || 0) >= 48
        && Number(box.h || 0) >= 48
        && aspect >= 0.75
        && aspect <= 2.1
        && areaRatio >= 0.025
        && areaRatio <= 0.32
        && density >= 0.45
        && density <= 0.88;
    })
    .sort((left, right) => Number(left.box?.x || 0) - Number(right.box?.x || 0));
  if (candidates.length < 2 || candidates.length > 5) return [];
  const referenceHeight = median(candidates.map((component) => Number(component.box.h || 0)));
  if (referenceHeight <= 0 || candidates.some((component) => Math.abs(Number(component.box.h || 0) - referenceHeight) > referenceHeight * 0.12)) return [];
  const complete = candidates.filter((component) => {
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(component.box.w || 0) * Number(component.box.h || 0));
    return density >= 0.71 && density <= 0.84 && Number(component.box.w || 0) >= referenceHeight * 1.05;
  });
  if (complete.length === 0) return [];
  const referenceWidth = median(complete.map((component) => Number(component.box.w || 0)));
  if (referenceWidth < referenceHeight * 0.9 || referenceWidth > referenceHeight * 1.9) return [];
  const completeCenters = complete.map((component) => Number(component.box.x || 0) + Number(component.box.w || 0) / 2);
  return candidates.map((component) => {
    const observed = component.box;
    const observedWidth = Number(observed.w || 0);
    const observedCenter = Number(observed.x || 0) + observedWidth / 2;
    const nearestCompleteCenter = completeCenters
      .slice()
      .sort((left, right) => Math.abs(left - observedCenter) - Math.abs(right - observedCenter))[0];
    const truncated = observedWidth < referenceWidth * 0.9;
    const recoveredX = truncated && observedCenter > nearestCompleteCenter
      ? Number(observed.x || 0) + observedWidth - referenceWidth
      : Number(observed.x || 0);
    const recoveredBox = {
      x: Math.round(recoveredX),
      y: Number(observed.y || 0),
      w: Math.round(referenceWidth),
      h: Number(observed.h || 0)
    };
    const observedCoverage = component.pixelCount / Math.max(1, Math.PI * recoveredBox.w * recoveredBox.h / 4);
    return {
      ...component,
      box: recoveredBox,
      kind: "native-venn-ellipse-candidate",
      shapeHint: "ellipse",
      semanticChartPart: true,
      vennObservedBox: observed,
      vennRecoveryConfidence: truncated
        ? Math.max(0, Math.min(1, observedCoverage / 0.58))
        : Math.max(0, Math.min(1, observedCoverage / 0.82))
    };
  });
}

function detectSemanticConvergenceNodeComponents(components = [], region = {}, searchComponents = []) {
  if (searchComponents.length === 0) return [];
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      const overlapsFocus = searchComponents.some((search) =>
        intersectionArea(box, search.box) / Math.max(1, Number(box.w || 0) * Number(box.h || 0)) >= 0.55);
      return !overlapsFocus
        && Number(box.w || 0) >= 30
        && Number(box.h || 0) >= 18
        && aspect >= 1.4
        && aspect <= 5
        && areaRatio >= 0.006
        && areaRatio <= 0.12
        && density >= 0.62;
    })
    .map((component) => ({
      ...component,
      kind: "native-rect-candidate",
      shapeHint: "rect",
      semanticConvergencePart: true
    }))
    .slice(0, 8);
}

function detectSemanticSearchComponents(image = {}, region = {}, bg = [], connectedComponents = [], semanticHint = "") {
  const semantic = /lens|magnifier|search|focus|converge|analysis|放大镜|聚焦|收敛|分析|需求/.test(String(semanticHint || "").toLowerCase());
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const visualProbe = connectedComponents.some((component) => {
    const box = component?.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / regionArea;
    const density = Number(component?.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return aspect >= 0.65 && aspect <= 1.65 && areaRatio >= 0.025 && areaRatio <= 0.18 && density >= 0.14 && density <= 0.6;
  });
  if (!semantic && !visualProbe) return [];
  return foregroundComponentsBySeedColor(image, region, bg, [], 24)
    .filter((component) => looksLikeSearchIcon(component))
    .map((component) => ({
      ...component,
      kind: "native-search-candidate",
      shapeHint: "search",
      semanticSearchPart: true
    }))
    .slice(0, 2);
}

function suppressSemanticSearchCompositeComponents(components = [], searchComponents = []) {
  if (searchComponents.length === 0) return components;
  return components.filter((component) => !searchComponents.some((search) => {
    const overlap = intersectionArea(component.box, search.box) / Math.max(1, Math.min(
      component.box.w * component.box.h,
      search.box.w * search.box.h
    ));
    const areaRatio = component.box.w * component.box.h / Math.max(1, search.box.w * search.box.h);
    if (search.semanticConvergencePart === true) {
      const density = Number(component.pixelCount || 0) / Math.max(1, component.box.w * component.box.h);
      return overlap >= 0.82 && areaRatio >= 0.9 && density <= 0.38;
    }
    return overlap >= 0.82 && areaRatio >= 0.65 && areaRatio <= 1.35;
  }));
}

function isSemanticRectChart(value) {
  return /waterfall|variance[-_\s]?bridge|瀑布图|增减分析|treemap|area[-_\s]?composition|矩形树图|面积占比/i.test(String(value || ""));
}

function isSemanticLayeredChart(value) {
  return /gauge|speedometer|仪表盘|速度表|radar|spider[-_\s]?chart|web[-_\s]?chart|雷达图|蛛网图|(?:^|[^a-z])pie(?:[^a-z]|$)|饼图|扇区图|concentric[-_\s]?circles?|onion[-_\s]?diagram|同心圆|洋葱图|圈层模型/i.test(String(value || ""));
}

function isSemanticCycleLoop(value) {
  return /cycle|loop|circular|arc[-_\s]?arrow|闭环|循环|环形|圆弧|弧形|环状/i.test(String(value || ""));
}

function detectSemanticGaugeComponents(components = [], region = {}, semanticHint = "") {
  const explicitGauge = /gauge|speedometer|dial[-_\s]?chart|仪表图|速度表|半圆仪表/i.test(String(semanticHint || ""));
  const candidates = components
    .filter((component) => component?.box && Number(component.pixelCount || 0) >= 80)
    .sort((a, b) => Number(b.pixelCount || 0) - Number(a.pixelCount || 0));
  const arc = candidates.find((component) => {
    const box = component.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return aspect >= (explicitGauge ? 1.45 : 1.65)
      && aspect <= (explicitGauge ? 2.5 : 2.18)
      && density >= 0.12 && density <= 0.68
      && Number(box.w || 0) >= Number(region.w || 0) * 0.16;
  });
  const needle = candidates.find((component) => {
    if (component === arc) return false;
    const box = component.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    if (!(aspect >= 0.45 && aspect <= 3.2 && density >= 0.04 && density <= 0.42)) return false;
    return explicitGauge || (arc && isGaugeNeedleGeometry(component, arc));
  });
  if (!arc || !needle) return [];
  const diameter = Number(arc.box.w || 0);
  const arcBox = { x: arc.box.x, y: arc.box.y, w: diameter, h: diameter };
  const thickness = estimateGaugeRingThickness(arc);
  return [
    {
      ...arc,
      box: arcBox,
      kind: "native-gauge-arc-candidate",
      shapeHint: "gauge-arc",
      gaugeHoleRatio: clamp((diameter - thickness * 2) / Math.max(1, diameter), 0.3, 0.84),
      semanticChartPart: true
    },
    {
      ...needle,
      kind: "native-gauge-needle-candidate",
      shapeHint: "gauge-needle",
      lineEndpointsPx: inferDiagonalLineEndpoints(needle),
      semanticChartPart: true
    }
  ];
}

function isGaugeNeedleGeometry(component = {}, arc = {}) {
  const endpoints = inferDiagonalLineEndpoints(component);
  if (!endpoints?.from || !endpoints?.to || !arc?.box) return false;
  const center = {
    x: Number(arc.box.x || 0) + Number(arc.box.w || 0) / 2,
    y: Number(arc.box.y || 0) + Number(arc.box.h || 0)
  };
  const radius = Math.max(1, Number(arc.box.w || 0) / 2);
  const points = [endpoints.from, endpoints.to]
    .map((point) => ({ ...point, distance: Math.hypot(Number(point.x || 0) - center.x, Number(point.y || 0) - center.y) }))
    .sort((left, right) => left.distance - right.distance);
  return points[0].distance <= radius * 0.16
    && points[1].distance >= radius * 0.28
    && points[1].distance <= radius * 0.94
    && Number(points[1].y || 0) <= center.y + radius * 0.08;
}

function estimateGaugeRingThickness(component = {}) {
  const box = component.box || {};
  const centerX = Math.round(Number(box.x || 0) + Number(box.w || 0) / 2);
  const column = (component.colProfile || []).find((item) => Number(item.x) === centerX);
  if (!column) return Math.max(4, Number(box.h || 0) * 0.25);
  return Math.max(3, Number(column.maxY || 0) - Number(column.minY || 0) + 1);
}

function detectSemanticRadarComponents(components = [], region = {}, semanticHint = "") {
  if (!/radar|spider[-_\s]?chart|web[-_\s]?chart|雷达图|蛛网图/i.test(String(semanticHint || ""))) return [];
  const polygons = components
    .filter((component) => {
      const box = component?.box || {};
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
      const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
      return Number(component.pixelCount || 0) >= 160 && aspect >= 0.65 && aspect <= 1.45 && density >= 0.16 && density <= 0.72;
    })
    .sort((a, b) => Number(b.box?.w || 0) * Number(b.box?.h || 0) - Number(a.box?.w || 0) * Number(a.box?.h || 0));
  if (polygons.length < 2) return [];
  const frame = polygons[0];
  const score = polygons.find((component) => component !== frame && boxContains(frame.box, component.box, 3));
  if (!score) return [];
  const frameVertices = inferRadialPolygonVertices(frame, 5);
  const scoreVertices = inferRadialPolygonVertices(score, 5);
  if (frameVertices.length !== 5 || scoreVertices.length !== 5) return [];
  return [
    {
      ...frame,
      kind: "native-radar-frame-candidate",
      shapeHint: "radar-frame",
      radarVertices: frameVertices,
      semanticChartPart: true
    },
    {
      ...score,
      kind: "native-radar-score-candidate",
      shapeHint: "radar-score",
      radarVertices: scoreVertices,
      semanticChartPart: true
    }
  ];
}

function inferRadialPolygonVertices(component = {}, vertexCount = 5) {
  const box = component.box || {};
  const center = { x: Number(box.x || 0) + Number(box.w || 0) / 2, y: Number(box.y || 0) + Number(box.h || 0) / 2 };
  const boundary = [];
  for (const row of component.rowProfile || []) {
    boundary.push({ x: Number(row.minX || 0), y: Number(row.y || 0) }, { x: Number(row.maxX || 0), y: Number(row.y || 0) });
  }
  for (const column of component.colProfile || []) {
    boundary.push({ x: Number(column.x || 0), y: Number(column.minY || 0) }, { x: Number(column.x || 0), y: Number(column.maxY || 0) });
  }
  const step = 360 / vertexCount;
  return Array.from({ length: vertexCount }, (_, index) => {
    const target = -90 + index * step;
    return boundary
      .map((point) => ({ point, angleDelta: angularDeltaDegrees(Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI, target), radius: Math.hypot(point.x - center.x, point.y - center.y) }))
      .filter((candidate) => candidate.angleDelta <= step * 0.44)
      .sort((a, b) => b.radius - a.radius)[0]?.point || null;
  }).filter(Boolean);
}

function angularDeltaDegrees(left, right) {
  const delta = Math.abs(normalizeAngleDegrees(left) - normalizeAngleDegrees(right));
  return Math.min(delta, 360 - delta);
}

function normalizeAngleDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function suppressSemanticSpecialChartComponents(components = [], semanticParts = []) {
  if (semanticParts.length < 2) return components;
  const union = semanticParts.map((part) => part.box).reduce((current, box) => current ? unionBox(current, box) : box, null);
  return components.filter((component) => {
    if (component.semanticChartPart === true) return true;
    return intersectionArea(component.box, union) / Math.max(1, Number(component.box?.w || 0) * Number(component.box?.h || 0)) < 0.72;
  });
}

function detectSemanticChartRectComponents(components = [], region = {}, semanticHint = "") {
  if (!isSemanticRectChart(semanticHint)) return [];
  const waterfall = /waterfall|variance[-_\s]?bridge|瀑布图|增减分析/i.test(String(semanticHint || ""));
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const rectangles = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const area = width * height;
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    const aspect = width / Math.max(1, height);
    if (width < 8 || height < 8 || density < 0.9 || area / regionArea < 0.003 || area / regionArea > 0.58) return false;
    if (aspect < 0.1 || aspect > 12) return false;
    if (waterfall && width > Number(region.w || 0) * 0.22) return false;
    return true;
  }).map((component) => ({
    ...component,
    kind: "native-rect-candidate",
    shapeHint: waterfall ? "bar" : "rect",
      semanticRectChartPart: true,
      semanticChartPart: true
  }));
  const minimum = waterfall ? 4 : 3;
  return rectangles.length >= minimum && rectangles.length <= 64 ? rectangles : [];
}

function suppressSemanticRectChartCompositeComponents(components = [], semanticParts = []) {
  if (semanticParts.length < 3) return components;
  return components.filter((component) => {
    if (component.semanticRectChartPart === true) return true;
    const children = semanticParts.filter((part) => boxContains(component.box, part.box, 2));
    if (children.length < 3) return true;
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const childArea = children.reduce((sum, child) => sum + Number(child.box?.w || 0) * Number(child.box?.h || 0), 0);
    return childArea < area * 0.35;
  });
}

function detectBaselineColumnBarComponents(image, region, bg, masks, axisLines = []) {
  const horizontalAxes = axisLines
    .filter((line) => line.axis === "h" && Number(line.box?.y || 0) >= region.y + region.h * 0.48)
    .sort((a, b) => Number(b.box?.w || 0) - Number(a.box?.w || 0));
  const axis = horizontalAxes[0];
  const baseline = axis
    ? Math.round(Number(axis.box.y || 0))
    : detectDenseHorizontalBaseline(image, region, bg, masks);
  if (!Number.isFinite(baseline)) return [];
  const minimumHeight = Math.max(12, Math.round(region.h * 0.06));
  const columns = [];
  for (let x = region.x; x < region.x + region.w; x += 1) {
    let height = 0;
    for (let y = baseline - 1; y >= region.y; y -= 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) break;
      height += 1;
    }
    if (height >= minimumHeight) columns.push({ x, height });
  }
  const groups = [];
  for (const column of columns) {
    const last = groups[groups.length - 1];
    if (!last || column.x > last[last.length - 1].x + 1) groups.push([column]);
    else last.push(column);
  }
  const bars = groups.map((group) => {
    const width = group.length;
    const height = Math.round(median(group.map((column) => column.height)));
    if (width < Math.max(8, region.w * 0.015) || width > region.w * 0.2) return null;
    const x = group[0].x;
    const y = baseline - height;
    const offset = (Math.max(region.y, y + Math.floor(height / 2)) * image.width + Math.min(image.width - 1, x + Math.floor(width / 2))) * 4;
    return {
      box: { x, y, w: width, h: height },
      pixelCount: width * height,
      color: rgbToHex([image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]]),
      kind: "native-rect-candidate",
      shapeHint: "bar",
      columnBarPart: true
    };
  }).filter(Boolean);
  if (bars.length < 3 || bars.length > 16) return [];
  const heights = bars.map((bar) => bar.box.h);
  if (Math.max(...heights) - Math.min(...heights) < Math.max(16, region.h * 0.07)) return [];
  if (axis) return bars;
  const inferredAxis = inferHorizontalAxisAtBaseline(image, region, bg, masks, baseline);
  return inferredAxis ? [...bars, inferredAxis] : bars;
}

function inferHorizontalAxisAtBaseline(image, region, bg, masks, baseline) {
  let minX = null;
  let maxX = null;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;
  for (let x = region.x; x < region.x + region.w; x += 1) {
    if (inAnyMask(x, baseline, masks) || !isForegroundPixel(image, x, baseline, bg)) continue;
    const offset = (baseline * image.width + x) * 4;
    minX = minX === null ? x : Math.min(minX, x);
    maxX = maxX === null ? x : Math.max(maxX, x);
    sumR += image.rgba[offset];
    sumG += image.rgba[offset + 1];
    sumB += image.rgba[offset + 2];
    count += 1;
  }
  if (minX === null || maxX - minX + 1 < region.w * 0.42) return null;
  const thickness = measureHorizontalLineThickness(image, region, bg, masks, baseline, minX, maxX);
  return {
    box: { x: minX, y: baseline, w: maxX - minX + 1, h: thickness },
    pixelCount: count,
    color: rgbToHex([
      Math.round(sumR / Math.max(1, count)),
      Math.round(sumG / Math.max(1, count)),
      Math.round(sumB / Math.max(1, count))
    ]),
    kind: "grid-line-candidate",
    shapeHint: "grid-line-horizontal",
    axis: "h",
    inferredChartBaseline: true
  };
}

function measureHorizontalLineThickness(image, region, bg, masks, baseline, minX, maxX) {
  const sampleX = Math.round((minX + maxX) / 2);
  let thickness = 0;
  for (let y = baseline; y < Math.min(region.y + region.h, baseline + 12); y += 1) {
    if (inAnyMask(sampleX, y, masks) || !isForegroundPixel(image, sampleX, y, bg)) break;
    thickness += 1;
  }
  return Math.max(3, thickness);
}

function detectDenseHorizontalBaseline(image, region, bg, masks) {
  const candidates = [];
  const startY = Math.round(region.y + region.h * 0.48);
  for (let y = startY; y < region.y + region.h; y += 1) {
    let count = 0;
    let minX = null;
    let maxX = null;
    for (let x = region.x; x < region.x + region.w; x += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      count += 1;
      minX = minX === null ? x : Math.min(minX, x);
      maxX = maxX === null ? x : Math.max(maxX, x);
    }
    const span = minX === null ? 0 : maxX - minX + 1;
    if (span >= region.w * 0.42 && count / Math.max(1, span) >= 0.55) candidates.push({ y, span });
  }
  if (candidates.length === 0) return null;
  const longest = Math.max(...candidates.map((candidate) => candidate.span));
  const matching = candidates.filter((candidate) => candidate.span >= longest * 0.94);
  return Math.min(...matching.map((candidate) => candidate.y));
}

function suppressColumnChartCompositeComponents(components = [], bars = []) {
  const columnBars = bars.filter((bar) => bar.columnBarPart === true);
  if (columnBars.length < 3) return components;
  return components.filter((component) => {
    const containedBars = columnBars.filter((bar) => boxContains(component.box, bar.box, 2));
    if (containedBars.length < 3) return true;
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    return density > 0.68;
  });
}

function augmentDenseLinkedNodeAtoms(atoms = [], image = {}, pxRegion = {}, regionBox = {}, slideSize = DEFAULT_SLIDE, bg = [255, 255, 255], masks = [], options = {}) {
  if (options.enableDenseLinkedNodes !== true) return atoms;
  const existingNodeCount = atoms.filter(isNativeNodeAtom).length;
  if (existingNodeCount >= Number(options.denseLinkedNodeMaxExistingNodes || 6)) return atoms;
  if (atoms.some((atom) => atom.kind === "screenshot-crop-candidate" && Number(atom.areaRatio || 0) >= 0.28)) return atoms;
  const target = dominantSaturatedForegroundColor(image, pxRegion, bg, masks);
  if (!target || target.coverageRatio < Number(options.denseLinkedNodeMinColorCoverage || 0.012)) return atoms;
  const denseAtoms = detectDenseLinkedNodeAtoms(image, regionBox, slideSize, {
    idPrefix: "dense-linked-atom",
    targetRgb: target.rgb,
    colorTolerance: Number(options.denseLinkedNodeColorTolerance || 72),
    minConnectedNodes: 8,
    minPeakDensity: Number(options.denseLinkedNodeMinPeakDensity || 0.46),
    maxNodes: Math.min(24, Number(options.maxAtoms || 80))
  }).filter((atom) => !atoms.some((existing) => existing.box && atom.box && overlapRatio(existing.box, atom.box) >= 0.62));
  if (denseAtoms.length < Number(options.denseLinkedNodeMinDetected || 6)) return atoms;
  const available = Math.max(0, Number(options.maxAtoms || 80) - atoms.length);
  if (available <= 0) return atoms;
  const appended = denseAtoms.slice(0, available).map((atom, index) => ({
    ...atom,
    id: `atom-${atoms.length + index + 1}`,
    color: rgbToHex(target.rgb),
    source: {
      ...(atom.source || {}),
      detector: "dense-linked-node-visual-atom",
      dominantColorCoverage: round(target.coverageRatio)
    }
  }));
  return [...atoms, ...appended];
}

function isNativeNodeAtom(atom = {}) {
  return [
    "native-rect-candidate",
    "native-ellipse-candidate",
    "native-diamond-candidate",
    "native-triangle-candidate",
    "native-chevron-candidate",
    "native-parallelogram-candidate",
    "native-cylinder-candidate",
    "native-cloud-candidate",
    "native-document-candidate",
    "native-screen-candidate",
    "native-phone-candidate",
    "native-person-candidate",
    "native-team-candidate",
    "native-timeline-candidate",
    "native-funnel-candidate",
    "native-donut-candidate",
    "native-scatter-point-candidate",
    "native-cycle-arrow-candidate"
  ].includes(atom?.kind);
}

function promoteArcArrowSegmentAtoms(atoms = []) {
  const segments = atoms.filter((atom) => atom.kind === "native-donut-segment-candidate" && atom.donutParentBox);
  if (segments.length < 2) return atoms;
  const parentBox = segments.reduce((box, atom) => unionBox(box, atom.donutParentBox || atom.box), segments[0].donutParentBox || segments[0].box);
  const hasArcConnector = atoms.some((atom) => {
    if (atom.kind !== "connector-line-candidate" || !atom.box) return false;
    const overlap = intersectionArea(atom.box, parentBox) / Math.max(1, Math.min(Number(atom.box.w || 0) * Number(atom.box.h || 0), Number(parentBox.w || 0) * Number(parentBox.h || 0)));
    return overlap >= 0.48 && Number(atom.box.w || 0) >= Number(parentBox.w || 0) * 0.55 && Number(atom.box.h || 0) >= Number(parentBox.h || 0) * 0.45;
  });
  if (!hasArcConnector) return atoms;
  return atoms.map((atom, index) => {
    if (!segments.includes(atom)) return atom;
    return {
      ...atom,
      kind: "native-arc-arrow-segment-candidate",
      shapeHint: "arc-arrow-segment",
      arcArrowHead: atom.arcArrowHead === true || index === 0 || index === segments.length - 1,
      nativeCandidate: true,
      residualCandidate: false
    };
  });
}

function recoverResidualArcArrowSegments(atoms = [], semanticHint = "") {
  const segments = atoms.filter((atom) => atom?.kind === "native-arc-arrow-segment-candidate" && atom.donutParentBox && atom.box);
  if (segments.length < 2 || segments.length > 7) return atoms;
  const parentBox = segments.reduce((box, atom) => unionBox(box, atom.donutParentBox), segments[0].donutParentBox);
  const parentAspect = Number(parentBox.w || 0) / Math.max(1, Number(parentBox.h || 0));
  if (parentAspect < 0.72 || parentAspect > 1.38) return atoms;
  const parentCenter = centerOfBox(parentBox);
  const parentRadius = Math.max(Number(parentBox.w || 0), Number(parentBox.h || 0)) / 2;
  const parentArea = Math.max(1, Number(parentBox.w || 0) * Number(parentBox.h || 0));
  return atoms.map((atom) => {
    if (!atom?.box || !["complex-shape-crop-candidate", "icon-crop-candidate"].includes(atom.kind)) return atom;
    const box = atom.box;
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / parentArea;
    const density = Number(atom.density || 0);
    const center = centerOfBox(box);
    const radialRatio = distanceBetweenPoints(center, parentCenter) / Math.max(1, parentRadius);
    const contained = intersectionArea(box, parentBox) / Math.max(1, Number(box.w || 0) * Number(box.h || 0)) >= 0.96;
    const boundaryDistance = Math.min(
      Math.abs(Number(box.x || 0) - Number(parentBox.x || 0)),
      Math.abs(Number(box.y || 0) - Number(parentBox.y || 0)),
      Math.abs(Number(box.x || 0) + Number(box.w || 0) - Number(parentBox.x || 0) - Number(parentBox.w || 0)),
      Math.abs(Number(box.y || 0) + Number(box.h || 0) - Number(parentBox.y || 0) - Number(parentBox.h || 0))
    );
    if (!contained
      || areaRatio < 0.035
      || areaRatio > 0.34
      || density < 0.2
      || density > 0.82
      || radialRatio < 0.48
      || radialRatio > 1.02
      || boundaryDistance > parentRadius * 0.14) return atom;
    return {
      ...atom,
      kind: "native-arc-arrow-segment-candidate",
      shapeHint: "arc-arrow-segment",
      donutParentBox: parentBox,
      donutSegmentAngles: inferDonutSegmentAngles(box, parentBox),
      arcArrowHead: false,
      nativeCandidate: true,
      residualCandidate: false,
      promotedFrom: atom.kind,
      promotionReason: "residual component completes a measured shared-radius cycle ring"
    };
  });
}

function promoteConnectorAdjacentRectIcons(atoms = []) {
  const connectors = atoms.filter((atom) => atom.kind === "connector-line-candidate" || atom.kind === "connector-arrow-candidate" || atom.kind === "grid-line-candidate");
  if (connectors.length === 0) return atoms;
  const treeRectIds = inferTreeRectIconAtomIds(atoms, connectors);
  return atoms.map((atom) => {
    if (atom.kind !== "icon-crop-candidate") return atom;
    if (atom.shapeHint !== "rect" && atom.shapeHint !== "pill") return atom;
    if (Number(atom.areaRatio || 0) < 0.014 || Number(atom.density || 0) < 0.75) return atom;
    if (!treeRectIds.has(atom.id) && !connectors.some((connector) => connectorNearBox(connector, atom))) return atom;
    return {
      ...atom,
      kind: "native-rect-candidate",
      nativeCandidate: true,
      residualCandidate: false,
      promotedFrom: "icon-crop-candidate",
      promotionReason: treeRectIds.has(atom.id)
        ? "rectangular visual atoms form a tree diagram structure"
        : "rectangular visual atom is adjacent to a connector endpoint"
    };
  });
}

function inferTreeRectIconAtomIds(atoms = [], connectors = []) {
  if (connectors.length < 1) return new Set();
  const rects = atoms
    .filter((atom) => atom.kind === "icon-crop-candidate" && (atom.shapeHint === "rect" || atom.shapeHint === "pill"))
    .filter((atom) => Number(atom.areaRatio || 0) >= 0.014 && Number(atom.density || 0) >= 0.75 && atom.box);
  if (rects.length < 4) return new Set();
  const sorted = [...rects].sort((a, b) => centerOfBox(a.box).y - centerOfBox(b.box).y);
  const root = sorted[0];
  const lower = sorted.filter((atom) => centerOfBox(atom.box).y > centerOfBox(root.box).y + Math.max(48, Number(root.box.h || 0) * 1.4));
  if (lower.length < 3) return new Set();
  const lowerCenters = lower.map((atom) => centerOfBox(atom.box));
  const lowerXs = lowerCenters.map((center) => center.x).sort((a, b) => a - b);
  const lowerYs = lowerCenters.map((center) => center.y);
  const spread = lowerXs[lowerXs.length - 1] - lowerXs[0];
  const union = rects.reduce((box, atom) => unionBox(box, atom.box), rects[0].box);
  const rootOffset = Math.abs(centerOfBox(root.box).x - average(lowerXs));
  const alignedChildren = Math.max(...lowerYs) - Math.min(...lowerYs) <= Math.max(72, union.h * 0.28);
  if (spread < Math.max(120, union.w * 0.55) || rootOffset > Math.max(70, union.w * 0.22) || !alignedChildren) return new Set();
  return new Set([root, ...lower].map((atom) => atom.id));
}

function connectorNearBox(connector, atom) {
  const box = atom.box || {};
  const cbox = connector.box || {};
  const horizontal = Number(cbox.w || 0) >= Number(cbox.h || 0);
  const points = horizontal
    ? [
      { x: Number(cbox.x || 0), y: Number(cbox.y || 0) + Number(cbox.h || 0) / 2 },
      { x: Number(cbox.x || 0) + Number(cbox.w || 0), y: Number(cbox.y || 0) + Number(cbox.h || 0) / 2 }
    ]
    : [
      { x: Number(cbox.x || 0) + Number(cbox.w || 0) / 2, y: Number(cbox.y || 0) },
      { x: Number(cbox.x || 0) + Number(cbox.w || 0) / 2, y: Number(cbox.y || 0) + Number(cbox.h || 0) }
    ];
  return points.some((point) => distanceToBox(point, box) <= 42);
}

function detectAxisLineComponents(image, region, bg, masks) {
  return [
    ...detectHorizontalLineComponents(image, region, bg, masks),
    ...detectVerticalLineComponents(image, region, bg, masks)
  ];
}

function detectHorizontalLineComponents(image, region, bg, masks) {
  const rows = [];
  for (let y = region.y; y < region.y + region.h; y += 1) {
    let count = 0;
    let minX = null;
    let maxX = null;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let x = region.x; x < region.x + region.w; x += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      count += 1;
      minX = minX === null ? x : Math.min(minX, x);
      maxX = maxX === null ? x : Math.max(maxX, x);
      sumR += image.rgba[offset];
      sumG += image.rgba[offset + 1];
      sumB += image.rgba[offset + 2];
    }
    const span = minX === null ? 0 : maxX - minX + 1;
    if (span >= region.w * 0.42 && count / Math.max(1, span) >= 0.42) {
      rows.push({ y, count, minX, maxX, sumR, sumG, sumB });
    }
  }
  return groupedAxisLineComponents(rows, "h", image, region);
}

function detectVerticalLineComponents(image, region, bg, masks) {
  const cols = [];
  for (let x = region.x; x < region.x + region.w; x += 1) {
    let count = 0;
    let minY = null;
    let maxY = null;
    let sumR = 0;
    let sumG = 0;
    let sumB = 0;
    for (let y = region.y; y < region.y + region.h; y += 1) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      count += 1;
      minY = minY === null ? y : Math.min(minY, y);
      maxY = maxY === null ? y : Math.max(maxY, y);
      sumR += image.rgba[offset];
      sumG += image.rgba[offset + 1];
      sumB += image.rgba[offset + 2];
    }
    const span = minY === null ? 0 : maxY - minY + 1;
    if (span >= region.h * 0.42 && count / Math.max(1, span) >= 0.42) {
      cols.push({ x, count, minY, maxY, sumR, sumG, sumB });
    }
  }
  return groupedAxisLineComponents(cols, "v", image, region);
}

function groupedAxisLineComponents(items, axis, image, region) {
  const result = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const total = group.reduce((sum, item) => sum + item.count, 0);
    if (axis === "h") {
      const minX = Math.min(...group.map((item) => item.minX));
      const maxX = Math.max(...group.map((item) => item.maxX));
      const minY = Math.min(...group.map((item) => item.y));
      const maxY = Math.max(...group.map((item) => item.y));
      if (maxX - minX + 1 >= region.w * 0.42 && maxY - minY + 1 <= Math.max(10, region.h * 0.035)) {
        result.push(axisLineComponent({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, group, total, image, "h"));
      }
    } else {
      const minX = Math.min(...group.map((item) => item.x));
      const maxX = Math.max(...group.map((item) => item.x));
      const minY = Math.min(...group.map((item) => item.minY));
      const maxY = Math.max(...group.map((item) => item.maxY));
      if (maxY - minY + 1 >= region.h * 0.42 && maxX - minX + 1 <= Math.max(10, region.w * 0.035)) {
        result.push(axisLineComponent({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, group, total, image, "v"));
      }
    }
    group = [];
  };
  const coordinate = axis === "h" ? "y" : "x";
  for (const item of items) {
    if (!group.length || item[coordinate] <= group[group.length - 1][coordinate] + 1) group.push(item);
    else {
      flush();
      group.push(item);
    }
  }
  flush();
  return result;
}

function axisLineComponent(box, group, pixelCount, image, axis) {
  const sums = group.reduce((acc, item) => {
    acc.r += item.sumR;
    acc.g += item.sumG;
    acc.b += item.sumB;
    return acc;
  }, { r: 0, g: 0, b: 0 });
  return {
    box: expandPxBox(box, image, 0),
    pixelCount,
    color: rgbToHex([
      Math.round(sums.r / Math.max(1, pixelCount)),
      Math.round(sums.g / Math.max(1, pixelCount)),
      Math.round(sums.b / Math.max(1, pixelCount))
    ]),
    kind: "grid-line-candidate",
    shapeHint: axis === "h" ? "grid-line-horizontal" : "grid-line-vertical",
    axis
  };
}

function detectDiagonalLineComponents(components = [], region = {}) {
  return (components || [])
    .filter((component) => looksLikeDiagonalLine(component, region))
    .map((component) => ({
      ...component,
      kind: "connector-line-candidate",
      shapeHint: "line-diagonal"
    }));
}

function detectLowContrastContainerComponents(image, region, bg, masks) {
  const visited = new Uint8Array(region.w * region.h);
  const stack = new Int32Array(region.w * region.h);
  const components = [];
  for (let ry = 0; ry < region.h; ry += 1) {
    for (let rx = 0; rx < region.w; rx += 1) {
      const localIndex = ry * region.w + rx;
      const x = region.x + rx;
      const y = region.y + ry;
      if (visited[localIndex] || inAnyMask(x, y, masks) || !isLowContrastContainerPixel(image, x, y, bg)) continue;
      const component = floodFillComponent(image, region, visited, x, y, masks, (candidateX, candidateY) =>
        isLowContrastContainerPixel(image, candidateX, candidateY, bg), stack
      );
      if (looksLikeLowContrastContainer(component, region)) {
        components.push({
          ...component,
          kind: "native-rect-candidate",
          shapeHint: "container-card",
          lowContrastContainer: true
        });
      }
    }
  }
  return components;
}

function foregroundComponents(image, region, bg, masks) {
  const visited = new Uint8Array(region.w * region.h);
  const stack = new Int32Array(region.w * region.h);
  const components = [];
  for (let ry = 0; ry < region.h; ry += 1) {
    for (let rx = 0; rx < region.w; rx += 1) {
      const localIndex = ry * region.w + rx;
      const x = region.x + rx;
      const y = region.y + ry;
      if (visited[localIndex] || inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      components.push(floodFillComponent(image, region, visited, x, y, masks, (candidateX, candidateY) =>
        isForegroundPixel(image, candidateX, candidateY, bg), stack
      ));
    }
  }
  return components;
}

function floodFillComponent(image, region, visited, startX, startY, masks, predicate, stack = new Int32Array(region.w * region.h)) {
  const hasMasks = Array.isArray(masks) && masks.length > 0;
  const startLocalIndex = (startY - region.y) * region.w + (startX - region.x);
  let stackSize = 1;
  stack[0] = startLocalIndex;
  visited[startLocalIndex] = 1;
  let minX = startX;
  let maxX = startX;
  let minY = startY;
  let maxY = startY;
  let pixelCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  const rowStats = new Map();
  const colStats = new Map();
  while (stackSize > 0) {
    const currentLocalIndex = stack[--stackSize];
    const currentRx = currentLocalIndex % region.w;
    const currentRy = Math.floor(currentLocalIndex / region.w);
    const cx = region.x + currentRx;
    const cy = region.y + currentRy;
    const offset = (cy * image.width + cx) * 4;
    pixelCount += 1;
    const stats = rowStats.get(cy) || { count: 0, minX: cx, maxX: cx };
    stats.count += 1;
    stats.minX = Math.min(stats.minX, cx);
    stats.maxX = Math.max(stats.maxX, cx);
    rowStats.set(cy, stats);
    const col = colStats.get(cx) || { count: 0, minY: cy, maxY: cy };
    col.count += 1;
    col.minY = Math.min(col.minY, cy);
    col.maxY = Math.max(col.maxY, cy);
    colStats.set(cx, col);
    sumR += image.rgba[offset];
    sumG += image.rgba[offset + 1];
    sumB += image.rgba[offset + 2];
    minX = Math.min(minX, cx);
    maxX = Math.max(maxX, cx);
    minY = Math.min(minY, cy);
    maxY = Math.max(maxY, cy);
    for (let direction = 0; direction < 4; direction += 1) {
      const nextRx = currentRx + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
      const nextRy = currentRy + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
      if (nextRx < 0 || nextRy < 0 || nextRx >= region.w || nextRy >= region.h) continue;
      const nextLocalIndex = nextRy * region.w + nextRx;
      const nx = region.x + nextRx;
      const ny = region.y + nextRy;
      if (hasMasks && inAnyMask(nx, ny, masks)) continue;
      if (visited[nextLocalIndex] || !predicate(nx, ny)) continue;
      visited[nextLocalIndex] = 1;
      stack[stackSize++] = nextLocalIndex;
    }
  }
  return {
    box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
    pixelCount,
    rowProfile: [...rowStats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, stats]) => ({ y, count: stats.count, minX: stats.minX, maxX: stats.maxX })),
    colProfile: [...colStats.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([x, stats]) => ({ x, count: stats.count, minY: stats.minY, maxY: stats.maxY })),
    color: rgbToHex([
      Math.round(sumR / Math.max(1, pixelCount)),
      Math.round(sumG / Math.max(1, pixelCount)),
      Math.round(sumB / Math.max(1, pixelCount))
    ])
  };
}

function foregroundComponentsBySeedColor(image, region, bg, masks, tolerance = 42) {
  const safeTolerance = Number.isFinite(Number(tolerance)) ? Math.max(8, Math.min(72, Number(tolerance))) : 42;
  const toleranceSquared = safeTolerance * safeTolerance;
  const visited = new Uint8Array(region.w * region.h);
  const stack = new Int32Array(region.w * region.h);
  const hasMasks = Array.isArray(masks) && masks.length > 0;
  const components = [];
  for (let ry = 0; ry < region.h; ry += 1) {
    for (let rx = 0; rx < region.w; rx += 1) {
      const localIndex = ry * region.w + rx;
      const x = region.x + rx;
      const y = region.y + ry;
      if (visited[localIndex] || (hasMasks && inAnyMask(x, y, masks)) || !isForegroundPixel(image, x, y, bg)) continue;
      const seedOffset = (y * image.width + x) * 4;
      const seedR = image.rgba[seedOffset];
      const seedG = image.rgba[seedOffset + 1];
      const seedB = image.rgba[seedOffset + 2];
      let stackSize = 1;
      stack[0] = localIndex;
      visited[localIndex] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let pixelCount = 0;
      let sumR = 0;
      let sumG = 0;
      let sumB = 0;
      const rowStats = new Map();
      const colStats = new Map();
      while (stackSize > 0) {
        const currentLocalIndex = stack[--stackSize];
        const currentRx = currentLocalIndex % region.w;
        const currentRy = Math.floor(currentLocalIndex / region.w);
        const cx = region.x + currentRx;
        const cy = region.y + currentRy;
        const offset = (cy * image.width + cx) * 4;
        pixelCount += 1;
        const stats = rowStats.get(cy) || { count: 0, minX: cx, maxX: cx };
        stats.count += 1;
        stats.minX = Math.min(stats.minX, cx);
        stats.maxX = Math.max(stats.maxX, cx);
        rowStats.set(cy, stats);
        const col = colStats.get(cx) || { count: 0, minY: cy, maxY: cy };
        col.count += 1;
        col.minY = Math.min(col.minY, cy);
        col.maxY = Math.max(col.maxY, cy);
        colStats.set(cx, col);
        sumR += image.rgba[offset];
        sumG += image.rgba[offset + 1];
        sumB += image.rgba[offset + 2];
        minX = Math.min(minX, cx);
        maxX = Math.max(maxX, cx);
        minY = Math.min(minY, cy);
        maxY = Math.max(maxY, cy);
        for (let direction = 0; direction < 4; direction += 1) {
          const nextRx = currentRx + (direction === 0 ? 1 : direction === 1 ? -1 : 0);
          const nextRy = currentRy + (direction === 2 ? 1 : direction === 3 ? -1 : 0);
          if (nextRx < 0 || nextRy < 0 || nextRx >= region.w || nextRy >= region.h) continue;
          const nextLocalIndex = nextRy * region.w + nextRx;
          const nx = region.x + nextRx;
          const ny = region.y + nextRy;
          if (hasMasks && inAnyMask(nx, ny, masks)) continue;
          if (visited[nextLocalIndex] || !isForegroundPixel(image, nx, ny, bg)) continue;
          const nextOffset = (ny * image.width + nx) * 4;
          const deltaR = image.rgba[nextOffset] - seedR;
          const deltaG = image.rgba[nextOffset + 1] - seedG;
          const deltaB = image.rgba[nextOffset + 2] - seedB;
          if (deltaR * deltaR + deltaG * deltaG + deltaB * deltaB > toleranceSquared) continue;
          visited[nextLocalIndex] = 1;
          stack[stackSize++] = nextLocalIndex;
        }
      }
      if (pixelCount < 18) continue;
      components.push({
        box: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
        pixelCount,
        colorSeparated: true,
        rowProfile: [...rowStats.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([yy, stats]) => ({ y: yy, count: stats.count, minX: stats.minX, maxX: stats.maxX })),
        colProfile: [...colStats.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([xx, stats]) => ({ x: xx, count: stats.count, minY: stats.minY, maxY: stats.maxY })),
        color: rgbToHex([
          Math.round(sumR / Math.max(1, pixelCount)),
          Math.round(sumG / Math.max(1, pixelCount)),
          Math.round(sumB / Math.max(1, pixelCount))
        ])
      });
    }
  }
  return components;
}

function hasCompositeConnectedComponent(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components.some((component) => {
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    return area / regionArea >= 0.08 && density <= 0.66;
  });
}

function shouldProbeColorSeparatedComponents(components = [], region = {}) {
  if (hasCompositeConnectedComponent(components, region)) return true;
  if (hasCircularCompositeConnectedComponent(components, region)) return true;
  if (hasSparseCircularCompositeConnectedComponent(components, region)) return true;
  if (hasDenseCardComponents(components, region)) return true;
  const denseHorizontalRows = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    return aspect >= 4
      && width >= Number(region.w || 0) * 0.12
      && height >= Math.max(10, Number(region.h || 0) * 0.035)
      && density >= 0.72;
  });
  return denseHorizontalRows.length >= 3;
}

function hasSparseCircularCompositeConnectedComponent(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components.some((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const area = width * height;
    const aspect = width / Math.max(1, height);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    return area / regionArea >= 0.018
      && area / regionArea <= 0.18
      && aspect >= 0.75 && aspect <= 1.33
      && density >= 0.2 && density < 0.62;
  });
}

function hasCircularCompositeConnectedComponent(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  return components.some((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const area = width * height;
    const aspect = width / Math.max(1, height);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    return area / regionArea >= 0.025
      && area / regionArea <= 0.55
      && aspect >= 0.78 && aspect <= 1.28
      && density >= 0.62 && density <= 0.86;
  });
}

function hasDenseCardComponents(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const cards = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    return aspect >= 1.15
      && aspect <= 7.5
      && areaRatio >= 0.018
      && areaRatio <= 0.48
      && density >= 0.58;
  });
  return cards.length >= 3;
}

function shouldUseColorSeparatedComponents(components = [], region = {}) {
  if (looksLikeHorizontalProcessColorParts(components, region)) return true;
  if (components.length < 7) {
    return looksLikeColumnChartParts(components, region)
      || looksLikeSeparatedCardParts(components, region)
      || looksLikeDonutSegmentParts(components, region);
  }
  if (looksLikeDonutSegmentParts(components, region)) return true;
  if (looksLikeStackedBarParts(components, region)) return true;
  if (looksLikeSeparatedCardParts(components, region)) return true;
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  let connectorCount = 0;
  let rectNodeCount = 0;
  for (const component of components) {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    if (areaRatio >= 0.045 && density <= 0.08) return false;
    if (looksLikeLine(component, region)) connectorCount += 1;
    else if (areaRatio >= 0.012 && density >= 0.72 && aspect >= 0.35 && aspect <= 8) rectNodeCount += 1;
  }
  return connectorCount >= 3 && rectNodeCount >= 4;
}

function looksLikeHorizontalProcessColorParts(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const cards = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    const areaRatio = width * height / regionArea;
    return width >= Number(region.w || 0) * 0.08
      && height >= Number(region.h || 0) * 0.06
      && aspect >= 0.75
      && aspect <= 5
      && areaRatio >= 0.008
      && areaRatio <= 0.18
      && density >= 0.72;
  }).sort((left, right) => Number(left.box?.x || 0) - Number(right.box?.x || 0));
  if (cards.length < 3 || cards.length > 16) return false;
  const centers = cards.map((card) => Number(card.box?.y || 0) + Number(card.box?.h || 0) / 2);
  const heights = cards.map((card) => Number(card.box?.h || 0));
  const medianHeight = medianNumber(heights);
  if (Math.max(...centers) - Math.min(...centers) > Math.max(10, medianHeight * 0.42)) return false;
  const bridges = components.filter((component) => {
    if (cards.includes(component)) return false;
    const box = component.box || {};
    const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
    const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
    return cards.slice(0, -1).some((card, index) => {
      const next = cards[index + 1];
      const left = Number(card.box?.x || 0) + Number(card.box?.w || 0);
      const right = Number(next.box?.x || 0);
      const rowCenter = (centers[index] + centers[index + 1]) / 2;
      return cx >= left - 3
        && cx <= right + 3
        && Math.abs(cy - rowCenter) <= medianHeight * 0.45
        && Number(box.w || 0) <= Math.max(8, (right - left) * 1.25)
        && Number(box.h || 0) <= medianHeight * 0.72;
    });
  });
  return bridges.length >= cards.length - 1;
}

function medianNumber(values = []) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function looksLikeDonutSegmentParts(components = [], region = {}) {
  const segments = donutSegmentComponents(components, region);
  return segments.length >= 2 && segments.length <= 8;
}

function markDonutSegmentParts(components = [], region = {}) {
  const segments = donutSegmentComponents(components, region);
  if (segments.length < 2 || segments.length > 8) return components;
  const parentBox = segments.reduce((box, component) => unionBox(box, component.box), segments[0].box);
  const arcArrowSegments = shouldPromoteArcArrowSegments(components, segments, parentBox);
  return components.map((component) => {
    if (!segments.includes(component)) return component;
    return {
      ...component,
      kind: arcArrowSegments ? "native-arc-arrow-segment-candidate" : "native-donut-segment-candidate",
      shapeHint: arcArrowSegments ? "arc-arrow-segment" : "donut-segment",
      donutParentBox: parentBox,
      donutSegmentAngles: inferDonutSegmentAngles(component.box, parentBox),
      arcArrowHead: arcArrowSegments && hasNearbyArcArrowHead(component, components, parentBox)
    };
  });
}

function shouldPromoteArcArrowSegments(components = [], segments = [], parentBox = {}) {
  if (!Array.isArray(segments) || segments.length < 2) return false;
  return segments.some((segment) => hasNearbyArcArrowHead(segment, components, parentBox))
    || segments.filter((segment) => hasArcArrowSegmentProtrusion(segment, parentBox)).length >= Math.min(2, segments.length);
}

function hasNearbyArcArrowHead(segment = {}, components = [], parentBox = {}) {
  const segmentCenter = centerOfBox(segment.box || {});
  const parentCenter = centerOfBox(parentBox || {});
  const parentRadius = Math.max(Number(parentBox.w || 0), Number(parentBox.h || 0)) / 2;
  return (components || []).some((component) => {
    if (component === segment || !component?.box) return false;
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const area = width * height;
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    const aspect = width / Math.max(1, height);
    if (width < 10 || height < 10 || area > Math.max(900, parentRadius * parentRadius * 0.36)) return false;
    if (aspect < 0.55 || aspect > 1.85 || density < 0.42) return false;
    const center = centerOfBox(box);
    const radialDistance = Math.hypot(center.x - parentCenter.x, center.y - parentCenter.y);
    const nearRing = radialDistance >= parentRadius * 0.48 && radialDistance <= parentRadius * 1.22;
    const nearSegment = distanceBetweenPoints(center, segmentCenter) <= Math.max(42, parentRadius * 0.58);
    return nearRing && nearSegment && (looksLikeTriangle(component) || component.shapeHint === "triangle");
  });
}

function hasArcArrowSegmentProtrusion(segment = {}, parentBox = {}) {
  const box = segment.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  if (width < 18 || height < 18) return false;
  const parentCenter = centerOfBox(parentBox || {});
  const center = centerOfBox(box);
  const parentRadius = Math.max(Number(parentBox.w || 0), Number(parentBox.h || 0)) / 2;
  const radialDistance = Math.hypot(center.x - parentCenter.x, center.y - parentCenter.y);
  const aspect = width / Math.max(1, height);
  const density = Number(segment.pixelCount || 0) / Math.max(1, width * height);
  const roughness = Math.max(
    profileEdgeRoughness(segment.rowProfile || [], width),
    profileEdgeRoughness(segment.colProfile || [], height, "col")
  );
  const protrusion = Math.max(
    profileOuterProtrusionRatio(segment.rowProfile || [], width),
    profileOuterProtrusionRatio(segment.colProfile || [], height, "col")
  );
  return radialDistance >= parentRadius * 0.34
    && aspect >= 0.48
    && aspect <= 2.45
    && density >= 0.22
    && density <= 0.72
    && (roughness >= 0.045 || protrusion >= 0.58);
}

function donutSegmentComponents(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const candidates = (components || []).filter((component) => {
    if (!component.box) return false;
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const areaRatio = width * height / regionArea;
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    return width >= 12
      && height >= 12
      && areaRatio >= 0.006
      && areaRatio <= 0.28
      && density >= 0.16
      && density <= 0.82;
  });
  if (candidates.length < 2 || candidates.length > 8) return [];
  const parentBox = candidates.reduce((box, component) => unionBox(box, component.box), candidates[0].box);
  const parentWidth = Number(parentBox.w || 0);
  const parentHeight = Number(parentBox.h || 0);
  const parentAspect = parentWidth / Math.max(1, parentHeight);
  const parentAreaRatio = parentWidth * parentHeight / regionArea;
  if (parentWidth < 40 || parentHeight < 40 || parentAspect < 0.72 || parentAspect > 1.38 || parentAreaRatio < 0.035 || parentAreaRatio > 0.42) return [];
  const center = centerOfBox(parentBox);
  const radius = Math.max(parentWidth, parentHeight) / 2;
  const minDistance = radius * 0.22;
  const maxDistance = radius * 0.82;
  const radialSegments = candidates.filter((component) => {
    const componentCenter = centerOfBox(component.box);
    const distance = Math.hypot(componentCenter.x - center.x, componentCenter.y - center.y);
    return distance >= minDistance && distance <= maxDistance;
  });
  const colors = new Set(radialSegments.map((component) => String(component.color || "").toLowerCase()).filter(Boolean));
  if (radialSegments.length < 2 || colors.size < 2) return [];
  const coveredPixels = radialSegments.reduce((sum, component) => sum + Number(component.pixelCount || 0), 0);
  const ringDensity = coveredPixels / Math.max(1, parentWidth * parentHeight);
  if (ringDensity < 0.16 || ringDensity > 0.68) return [];
  return radialSegments;
}

function inferDonutSegmentAngles(box = {}, parentBox = {}) {
  const center = centerOfBox(parentBox);
  const corners = [
    { x: Number(box.x || 0), y: Number(box.y || 0) },
    { x: Number(box.x || 0) + Number(box.w || 0), y: Number(box.y || 0) },
    { x: Number(box.x || 0) + Number(box.w || 0), y: Number(box.y || 0) + Number(box.h || 0) },
    { x: Number(box.x || 0), y: Number(box.y || 0) + Number(box.h || 0) }
  ];
  const angles = corners.map((point) => normalizeAngleDegrees(Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI));
  const sorted = angles.sort((a, b) => a - b);
  let largestGap = -1;
  let gapIndex = 0;
  for (let index = 0; index < sorted.length; index += 1) {
    const current = sorted[index];
    const next = sorted[(index + 1) % sorted.length] + (index === sorted.length - 1 ? 360 : 0);
    const gap = next - current;
    if (gap > largestGap) {
      largestGap = gap;
      gapIndex = index;
    }
  }
  const start = normalizeAngleDegrees(sorted[(gapIndex + 1) % sorted.length]);
  const end = normalizeAngleDegrees(sorted[gapIndex]);
  return { startDeg: round(start), endDeg: round(end) };
}

function normalizeAngleDegrees(value) {
  return ((Number(value || 0) % 360) + 360) % 360;
}

function looksLikeSeparatedCardParts(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const cards = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    return aspect >= 1.2
      && aspect <= 7.5
      && areaRatio >= 0.018
      && areaRatio <= 0.42
      && density >= 0.62;
  });
  if (cards.length < 3 || cards.length > 12) return false;
  const colors = new Set(cards.map((card) => String(card.color || "").toLowerCase()).filter(Boolean));
  const heights = cards.map((card) => Number(card.box?.h || 0));
  const medianHeight = median(heights);
  const similarHeightCards = cards.filter((card) => Math.abs(Number(card.box?.h || 0) - medianHeight) <= Math.max(18, medianHeight * 0.45));
  return colors.size >= 2 || similarHeightCards.length >= 3;
}

function looksLikeStackedBarParts(components = [], region = {}) {
  const parts = components.filter((component) => isStackedBarPartComponent(component, region));
  if (parts.length < 6 || parts.length > 36) return false;
  const rowClusters = clusterComponentsByAxis(parts, "y", Math.max(10, median(parts.map((part) => Number(part.box?.h || 0))) * 0.9));
  const rows = rowClusters.filter((row) => row.components.length >= 2);
  return rows.length >= 3;
}

function markStackedBarParts(components = [], region = {}) {
  if (!looksLikeStackedBarParts(components, region)) return components;
  return components.map((component) => (
    isStackedBarPartComponent(component, region)
      ? { ...component, stackedBarPart: true }
      : component
  ));
}

function isStackedBarPartComponent(component = {}, region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const areaRatio = width * height / regionArea;
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  return aspect >= 0.7
    && aspect <= 8
    && areaRatio >= 0.004
    && density >= 0.72
    && height >= Math.max(10, Number(region.h || 0) * 0.035);
}

function clusterComponentsByAxis(components = [], axis, tolerance) {
  const coordinate = axis === "x" ? "x" : "y";
  const clusters = [];
  for (const component of [...components].sort((a, b) => centerOfBox(a.box)[coordinate] - centerOfBox(b.box)[coordinate])) {
    const value = centerOfBox(component.box)[coordinate];
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(value - last.center) > tolerance) {
      clusters.push({ components: [component], center: value });
    } else {
      last.components.push(component);
      last.center = average(last.components.map((item) => centerOfBox(item.box)[coordinate]));
    }
  }
  return clusters;
}

function looksLikeColumnChartParts(components = [], region = {}) {
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const axisLines = components.filter((component) => {
    const box = component.box || {};
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    return aspect >= 12 && Number(box.w || 0) >= Number(region.w || 0) * 0.42;
  });
  if (axisLines.length < 1) return false;
  const bars = components.filter((component) => {
    const box = component.box || {};
    const width = Number(box.w || 0);
    const height = Number(box.h || 0);
    const aspect = width / Math.max(1, height);
    const areaRatio = width * height / regionArea;
    const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
    return aspect >= 0.18 && aspect <= 1.25 && areaRatio >= 0.01 && density >= 0.72;
  });
  if (bars.length < 3 || bars.length > 16) return false;
  const bottoms = bars.map((component) => Number(component.box?.y || 0) + Number(component.box?.h || 0));
  const baselineSpread = Math.max(...bottoms) - Math.min(...bottoms);
  if (baselineSpread > Math.max(12, Number(region.h || 0) * 0.04)) return false;
  const heights = bars.map((component) => Number(component.box?.h || 0));
  return Math.max(...heights) - Math.min(...heights) >= Math.max(18, Number(region.h || 0) * 0.08);
}

function suppressCompositeComponents(components = [], region = {}) {
  const colorParts = components.filter((component) => component.colorSeparated === true);
  if (colorParts.length === 0) return components;
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const compositeParents = new Set();
  for (const component of components) {
    if (component.colorSeparated === true) continue;
    const area = Number(component.box?.w || 0) * Number(component.box?.h || 0);
    const density = Number(component.pixelCount || 0) / Math.max(1, area);
    const children = colorParts.filter((part) => part !== component && boxContains(component.box, part.box, 2));
    const childPixels = children.reduce((sum, part) => sum + Number(part.pixelCount || 0), 0);
    const distinctColors = new Set(children.map((part) => String(part.color || "").toLowerCase())).size;
    const stackedBarParent = looksLikeStackedBarParent(component, children);
    const donutSegmentParent = looksLikeDonutSegmentParts(children, region);
    const horizontalProcessParent = looksLikeHorizontalProcessCompositeParent(component, children, region);
    if (!stackedBarParent && !donutSegmentParent && !horizontalProcessParent && (area / regionArea < 0.08 || density > 0.66)) continue;
    if (((children.length >= 4 && distinctColors >= 2) || stackedBarParent || donutSegmentParent || horizontalProcessParent) && childPixels >= Number(component.pixelCount || 0) * 0.82) {
      compositeParents.add(component);
    }
  }
  return components.filter((component) => {
    if (component.colorSeparated !== true) return !compositeParents.has(component);
    const parent = components.find((candidate) => candidate.colorSeparated !== true && boxContains(candidate.box, component.box, 2));
    return parent ? compositeParents.has(parent) : true;
  });
}

function looksLikeHorizontalProcessCompositeParent(parent = {}, children = [], region = {}) {
  if (!Array.isArray(children) || children.length < 2 || children.length > 4) return false;
  const parentBox = parent.box || {};
  const width = Number(parentBox.w || 0);
  const height = Number(parentBox.h || 0);
  const aspect = width / Math.max(1, height);
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  if (aspect < 1.8 || width * height / regionArea < 0.018 || height < 18) return false;
  const denseCards = children.filter((child) => {
    const box = child.box || {};
    const childAspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const density = Number(child.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
    return Number(box.h || 0) >= height * 0.72 && childAspect >= 0.75 && childAspect <= 5 && density >= 0.72;
  });
  const bridges = children.filter((child) => {
    const box = child.box || {};
    const childAspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, width * height);
    return child !== denseCards[0] && childAspect >= 1.2 && areaRatio <= 0.42;
  });
  if (denseCards.length !== 1 || bridges.length < 1) return false;
  const card = denseCards[0].box;
  return bridges.every((bridge) => {
    const box = bridge.box || {};
    const bridgeCenter = Number(box.x || 0) + Number(box.w || 0) / 2;
    const cardCenter = Number(card.x || 0) + Number(card.w || 0) / 2;
    return Math.abs(bridgeCenter - cardCenter) >= Number(card.w || 0) * 0.35;
  });
}

function looksLikeStackedBarParent(parent = {}, children = []) {
  if (!Array.isArray(children) || children.length < 2) return false;
  const parentBox = parent.box || {};
  const parentWidth = Number(parentBox.w || 0);
  const parentHeight = Number(parentBox.h || 0);
  const parentAspect = parentWidth / Math.max(1, parentHeight);
  if (parentAspect < 4 || parentHeight < 10) return false;
  const colors = new Set(children.map((part) => String(part.color || "").toLowerCase()).filter(Boolean));
  if (colors.size < 2) return false;
  const sorted = [...children].sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  return sorted.every((child, index) => {
    const box = child.box || {};
    const height = Number(box.h || 0);
    const density = Number(child.pixelCount || 0) / Math.max(1, Number(box.w || 0) * height);
    if (Math.abs(height - parentHeight) > Math.max(4, parentHeight * 0.24) || density < 0.72) return false;
    if (index === 0) return true;
    const previous = sorted[index - 1].box || {};
    const gap = Number(box.x || 0) - (Number(previous.x || 0) + Number(previous.w || 0));
    return gap <= Math.max(4, parentHeight * 0.25);
  });
}

function isForegroundPixel(image, x, y, bg) {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3];
  if (alpha < 16) return false;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
  const lum = luminance(rgb);
  const sat = saturation(rgb);
  const bgDistance = colorDistance(rgb, bg);
  if (lum > 248 && sat < 0.06) return false;
  return bgDistance > 26 || sat > 0.18 || lum < 210;
}

function isLowContrastContainerPixel(image, x, y, bg) {
  const offset = (y * image.width + x) * 4;
  const alpha = image.rgba[offset + 3];
  if (alpha < 16) return false;
  const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
  const lum = luminance(rgb);
  const sat = saturation(rgb);
  const bgDistance = colorDistance(rgb, bg);
  return bgDistance >= 8
    && bgDistance <= 32
    && lum >= 210
    && lum <= 248
    && sat <= 0.18;
}

function looksLikeLowContrastContainer(component = {}, region = {}) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const areaRatio = width * height / regionArea;
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  const touchesHorizontalEdges = box.x <= region.x + 2 && box.x + width >= region.x + Number(region.w || 0) - 2;
  const touchesVerticalEdges = box.y <= region.y + 2 && box.y + height >= region.y + Number(region.h || 0) - 2;
  return width >= Math.max(28, Number(region.w || 0) * 0.06)
    && height >= Math.max(18, Number(region.h || 0) * 0.045)
    && areaRatio >= 0.006
    && areaRatio <= 0.42
    && aspect >= 0.35
    && aspect <= 9
    && density >= 0.72
    && !(touchesHorizontalEdges && touchesVerticalEdges);
}

function mergeCloseComponents(components, image) {
  const sorted = [...components].sort((a, b) => b.box.w * b.box.h - a.box.w * a.box.h);
  const merged = [];
  for (const component of sorted) {
    const existing = merged.find((item) => {
      const gap = item.colorSeparated === true || component.colorSeparated === true ? 8 : 8;
      return boxesNear(item.box, component.box, gap) && shouldMergeVisualComponents(item, component);
    });
    if (existing) {
      const total = existing.pixelCount + component.pixelCount;
      existing.box = expandPxBox(unionBox(existing.box, component.box), image, 0);
      existing.pixelCount = total;
      existing.rowProfile = mergeRowProfiles(existing.rowProfile, component.rowProfile);
      existing.colProfile = mergeColProfiles(existing.colProfile, component.colProfile);
    } else {
      merged.push({ ...component });
    }
  }
  return merged.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

function shouldMergeVisualComponents(a = {}, b = {}) {
  if (a.stackedBarPart === true || b.stackedBarPart === true) return false;
  if ((isThinLineComponent(a) && isDenseHorizontalBandComponent(b)) || (isThinLineComponent(b) && isDenseHorizontalBandComponent(a))) return false;
  if (a.colorSeparated === true || b.colorSeparated === true) {
    if (!a.color || !b.color) return false;
    return colorDistance(hexToRgb(a.color), hexToRgb(b.color)) <= 28;
  }
  if (a.color && b.color && colorDistance(hexToRgb(a.color), hexToRgb(b.color)) > 58) {
    if (intersectionArea(a.box || {}, b.box || {}) === 0) return false;
    if (isThinLineComponent(a) || isThinLineComponent(b)) return false;
    const aArea = Math.max(1, Number(a.box?.w || 0) * Number(a.box?.h || 0));
    const bArea = Math.max(1, Number(b.box?.w || 0) * Number(b.box?.h || 0));
    const aDensity = Number(a.pixelCount || 0) / aArea;
    const bDensity = Number(b.pixelCount || 0) / bArea;
    const densityGap = Math.abs(aDensity - bDensity);
    const sizeGap = Math.max(aArea, bArea) / Math.max(1, Math.min(aArea, bArea));
    if ((aDensity < 0.18 || bDensity < 0.18) && densityGap > 0.35 && sizeGap >= 8) return false;
  }
  return true;
}

function isThinLineComponent(component = {}) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  return (aspect >= 6 && height <= 12) || (aspect <= 1 / 6 && width <= 12);
}

function isDenseHorizontalBandComponent(component = {}) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  return aspect >= 4 && height >= 10 && density >= 0.72;
}

function mergeRowProfiles(a = [], b = []) {
  const byY = new Map();
  for (const row of [...(a || []), ...(b || [])]) {
    if (!row || row.y === undefined) continue;
    const existing = byY.get(row.y) || { y: row.y, count: 0, minX: Number.POSITIVE_INFINITY, maxX: Number.NEGATIVE_INFINITY };
    existing.count += Number(row.count || 0);
    existing.minX = Math.min(existing.minX, Number(row.minX || 0));
    existing.maxX = Math.max(existing.maxX, Number(row.maxX || 0));
    byY.set(row.y, existing);
  }
  return [...byY.values()].sort((left, right) => left.y - right.y);
}

function mergeColProfiles(a = [], b = []) {
  const byX = new Map();
  for (const col of [...(a || []), ...(b || [])]) {
    if (!col || col.x === undefined) continue;
    const existing = byX.get(col.x) || { x: col.x, count: 0, minY: Number.POSITIVE_INFINITY, maxY: Number.NEGATIVE_INFINITY };
    existing.count += Number(col.count || 0);
    existing.minY = Math.min(existing.minY, Number(col.minY || 0));
    existing.maxY = Math.max(existing.maxY, Number(col.maxY || 0));
    byX.set(col.x, existing);
  }
  return [...byX.values()].sort((left, right) => left.x - right.x);
}

function dedupeComponents(components) {
  const sorted = [...components].sort((a, b) => {
    const aPriority = dedupeComponentPriority(a);
    const bPriority = dedupeComponentPriority(b);
    return aPriority - bPriority || (b.box.w * b.box.h) - (a.box.w * a.box.h);
  });
  const result = [];
  for (const component of sorted) {
    const duplicate = result.some((existing) => {
      const ratio = intersectionArea(existing.box, component.box) / Math.max(1, Math.min(
        existing.box.w * existing.box.h,
        component.box.w * component.box.h
      ));
      const nestedConcentricLayers = existing.kind === "native-concentric-circle-candidate"
        && component.kind === "native-concentric-circle-candidate"
        && Math.max(existing.box.w * existing.box.h, component.box.w * component.box.h)
          >= Math.min(existing.box.w * existing.box.h, component.box.w * component.box.h) * 1.18;
      return !nestedConcentricLayers && ratio >= 0.82 && (
        existing.kind === component.kind
        || existing.kind === "grid-line-candidate"
        || existing.semanticRectChartPart === true
        || (existing.semanticChartPart === true && component.semanticChartPart !== true)
      );
    });
    if (!duplicate) result.push(component);
  }
  return result.sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

function dedupeComponentPriority(component) {
  if (component?.semanticRectChartPart === true || component?.semanticChartPart === true) return -2;
  if (!component?.kind && looksLikeTimeline(component, { w: Number.POSITIVE_INFINITY, h: Number.POSITIVE_INFINITY })) return -1;
  if (!component?.kind && looksLikeDiagonalLine(component, component.box || {})) return -1;
  if (!component?.kind && looksLikeCycleArrow(component)) return -1;
  if (!component?.kind && looksLikePerson(component)) return -1;
  if (!component?.kind && looksLikeFunnel(component)) return -1;
  return component?.kind === "grid-line-candidate" ? 0 : 1;
}

function isUsefulAtom(component, region) {
  const area = component.box.w * component.box.h;
  const regionArea = Math.max(1, region.w * region.h);
  if (area < 32) return false;
  if (component.box.w < 3 || component.box.h < 3) return false;
  if (area / regionArea > 0.75) return false;
  return true;
}

function classifyAtom(component, region, shapeHint = inferShapeHint(component, region)) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const areaRatio = w * h / Math.max(1, region.w * region.h);
  const density = component.pixelCount / Math.max(1, w * h);
  if (shapeHint === "timeline") return "native-timeline-candidate";
  if (shapeHint === "arrow-horizontal" || shapeHint === "arrow-vertical") return "connector-arrow-candidate";
  if (shapeHint === "line-diagonal") return "connector-line-candidate";
  if (shapeHint === "line" && aspect >= 4 && density >= 0.72 && h >= Math.max(12, Number(region.h || 0) * 0.04) && areaRatio >= 0.008) {
    return "native-rect-candidate";
  }
  if ((aspect >= 7 && h <= Math.max(10, region.h * 0.08)) || (aspect <= 0.14 && w <= Math.max(10, region.w * 0.08))) {
    return isGridLikeLine(component, region) ? "grid-line-candidate" : "connector-line-candidate";
  }
  if (shapeHint === "pill" && areaRatio >= 0.012 && density >= 0.28 && aspect >= 2.4) return "native-rect-candidate";
  if (shapeHint === "ellipse") return "native-ellipse-candidate";
  if (shapeHint === "diamond") return "native-diamond-candidate";
  if (shapeHint === "triangle") return "native-triangle-candidate";
  if (shapeHint === "chevron-right" || shapeHint === "chevron-left") return "native-chevron-candidate";
  if (shapeHint === "parallelogram-right" || shapeHint === "parallelogram-left") return "native-parallelogram-candidate";
  if (shapeHint === "cylinder") return "native-cylinder-candidate";
  if (shapeHint === "cloud") return "native-cloud-candidate";
  if (shapeHint === "document") return "native-document-candidate";
  if (shapeHint === "folder") return "native-folder-candidate";
  if (shapeHint === "screen") return "native-screen-candidate";
  if (shapeHint === "phone") return "native-phone-candidate";
  if (shapeHint === "person") return "native-person-candidate";
  if (shapeHint === "team") return "native-team-candidate";
  if (shapeHint === "gear") return "native-gear-candidate";
  if (shapeHint === "search") return "native-search-candidate";
  if (shapeHint === "shield") return "native-shield-candidate";
  if (shapeHint === "funnel") return "native-funnel-candidate";
  if (shapeHint === "cycle-arrow") return "native-cycle-arrow-candidate";
  if (shapeHint === "donut") return "native-donut-candidate";
  if (shapeHint === "scatter-point") return "native-scatter-point-candidate";
  if (component.stackedBarPart === true && aspect >= 0.7 && aspect <= 8 && areaRatio >= 0.004 && density >= 0.72 && w >= 18 && h >= 10) return "native-rect-candidate";
  if (aspect >= 2.4 && aspect <= 8 && areaRatio >= 0.012 && density >= 0.72) return "native-rect-candidate";
  if (shapeHint === "rect" && areaRatio >= 0.01 && density >= 0.55 && aspect >= 0.16 && aspect <= 8) {
    return "native-rect-candidate";
  }
  if (areaRatio >= 0.035 && density >= 0.55 && aspect >= 0.45 && aspect <= 8) {
    return "native-rect-candidate";
  }
  if (areaRatio >= 0.08 && density < 0.55) return "screenshot-crop-candidate";
  if (areaRatio <= 0.035 && aspect >= 0.45 && aspect <= 2.3) return "icon-crop-candidate";
  return "complex-shape-crop-candidate";
}

function inferShapeHint(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const density = component.pixelCount / Math.max(1, w * h);
  const areaRatio = w * h / Math.max(1, region.w * region.h);
  if (looksLikeTimeline(component, region)) return "timeline";
  if (looksLikeArrow(component, region)) return aspect >= 1 ? "arrow-horizontal" : "arrow-vertical";
  if (looksLikeSearchIcon(component) && areaRatio >= 0.008) return "search";
  if (looksLikeLine(component, region)) return "line";
  if (looksLikeDiagonalLine(component, region)) return "line-diagonal";
  const chevron = inferChevronHint(component);
  if (chevron && areaRatio >= 0.012) return chevron;
  const parallelogram = inferParallelogramHint(component);
  if (parallelogram && areaRatio >= 0.012) return parallelogram;
  if (looksLikeFolder(component) && areaRatio >= 0.012) return "folder";
  if (looksLikeShield(component) && areaRatio >= 0.01) return "shield";
  if (aspect >= 2.4 && density >= 0.62 && density <= 0.96 && areaRatio >= 0.012) return "pill";
  if (aspect >= 2.4 && density >= 0.28 && density < 0.62 && areaRatio >= 0.012) return "pill";
  if (looksLikeFunnel(component) && areaRatio >= 0.01) return "funnel";
  if (looksLikeCycleArrow(component) && areaRatio >= 0.01) return "cycle-arrow";
  if (looksLikeGear(component) && areaRatio >= 0.01) return "gear";
  if (looksLikeDonut(component) && areaRatio >= 0.01) return "donut";
  if (looksLikeScatterPoint(component, region)) return "scatter-point";
  if (looksLikeTeam(component) && areaRatio >= 0.012) return "team";
  if (looksLikePerson(component) && areaRatio >= 0.008) return "person";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.42 && density <= 0.62 && areaRatio >= 0.008 && looksLikeTriangle(component)) return "triangle";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.38 && density <= 0.58 && areaRatio >= 0.012) return "diamond";
  if (looksLikePhone(component) && areaRatio >= 0.008) return "phone";
  if (looksLikeCylinder(component) && areaRatio >= 0.012) return "cylinder";
  if (looksLikeCloud(component) && areaRatio >= 0.012) return "cloud";
  if (looksLikeDocument(component) && areaRatio >= 0.012) return "document";
  if (looksLikeScreen(component) && areaRatio >= 0.012) return "screen";
  if (aspect >= 0.72 && aspect <= 1.38 && density >= 0.58 && density <= 0.86 && areaRatio >= 0.008) return "ellipse";
  if (density >= 0.72 && aspect >= 0.16 && aspect < 0.45 && w >= Math.max(14, Number(region.w || 0) * 0.025)) return "rect";
  if (density >= 0.55 && aspect >= 0.45 && aspect <= 5.5) return "rect";
  return "complex";
}

function inferChevronHint(component) {
  const box = component.box || {};
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  if (aspect < 1.05 || aspect > 4.8 || density < 0.46 || density > 0.86) return null;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 12) return null;
  const top = averageRowBand(profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.18))));
  const middleStart = Math.floor(profile.length * 0.42);
  const middle = averageRowBand(profile.slice(middleStart, middleStart + Math.max(2, Math.ceil(profile.length * 0.16))));
  const bottom = averageRowBand(profile.slice(Math.floor(profile.length * 0.82)));
  const minShift = Number(box.w || 0) * 0.12;
  const topBottomAligned = Math.abs(top.minX - bottom.minX) <= Number(box.w || 0) * 0.08
    && Math.abs(top.maxX - bottom.maxX) <= Number(box.w || 0) * 0.08;
  if (!topBottomAligned) return null;
  if (middle.minX > top.minX + minShift && middle.maxX > top.maxX + minShift) return "chevron-right";
  if (middle.minX < top.minX - minShift && middle.maxX < top.maxX - minShift) return "chevron-left";
  return null;
}

function inferParallelogramHint(component) {
  const box = component.box || {};
  const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(box.w || 0) * Number(box.h || 0));
  if (aspect < 1.05 || aspect > 5.5 || density < 0.58 || density > 0.94) return null;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 12) return null;
  const top = averageRowBand(profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.2))));
  const bottom = averageRowBand(profile.slice(Math.floor(profile.length * 0.8)));
  const width = Number(box.w || 0);
  const minShift = width * 0.08;
  const leftShift = bottom.minX - top.minX;
  const rightShift = bottom.maxX - top.maxX;
  const parallelEdges = Math.abs(leftShift - rightShift) <= width * 0.08;
  if (!parallelEdges) return null;
  if (leftShift > minShift && rightShift > minShift) return "parallelogram-right";
  if (leftShift < -minShift && rightShift < -minShift) return "parallelogram-left";
  return null;
}

function averageRowBand(rows) {
  const safeRows = rows.filter(Boolean);
  const divisor = Math.max(1, safeRows.length);
  return safeRows.reduce((acc, row) => {
    acc.minX += Number(row.minX || 0) / divisor;
    acc.maxX += Number(row.maxX || 0) / divisor;
    acc.count += Number(row.count || 0) / divisor;
    return acc;
  }, { minX: 0, maxX: 0, count: 0 });
}

function looksLikeScatterPoint(component, region = {}) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const area = width * height;
  const regionArea = Math.max(1, Number(region.w || 0) * Number(region.h || 0));
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, area);
  const minSize = Math.max(5, Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.012);
  const maxSize = Math.max(18, Math.min(Number(region.w || 0), Number(region.h || 0)) * 0.085);
  const areaRatio = area / regionArea;
  return width >= minSize
    && height >= minSize
    && width <= maxSize
    && height <= maxSize
    && aspect >= 0.72
    && aspect <= 1.38
    && density >= 0.58
    && density <= 0.9
    && areaRatio >= 0.00012
    && areaRatio <= 0.012;
}

function looksLikeCylinder(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.45 || aspect > 0.95 || density < 0.66 || density > 0.985) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.14));
  const top = averageRowBand(profile.slice(0, band));
  const middleStart = Math.floor(profile.length * 0.43);
  const middle = averageRowBand(profile.slice(middleStart, middleStart + band));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const capsAligned = Math.abs(top.minX - bottom.minX) <= width * 0.08
    && Math.abs(top.maxX - bottom.maxX) <= width * 0.08;
  return capsAligned
    && middleWidth >= width * 0.88
    && topWidth <= middleWidth * 0.86
    && bottomWidth <= middleWidth * 0.86;
}

function looksLikeCloud(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.8 || density < 0.48 || density > 0.86) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 14) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.13));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.22), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.45), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.66), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const maxInteriorWidth = Math.max(upperWidth, middleWidth, lowerWidth);
  const lobedTop = topWidth <= maxInteriorWidth * 0.72 && upperWidth >= maxInteriorWidth * 0.68;
  const roundedBottom = bottomWidth <= maxInteriorWidth * 0.82 && lowerWidth >= maxInteriorWidth * 0.78;
  const sideBulges = Math.abs(upper.minX - lower.minX) >= width * 0.04 || Math.abs(upper.maxX - lower.maxX) >= width * 0.04;
  return lobedTop && roundedBottom && sideBulges;
}

function looksLikeDocument(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 3.5 || density < 0.78 || density > 0.985) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 16) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.42), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.76), Math.floor(profile.length * 0.88)));
  const bottomRows = profile.slice(profile.length - Math.max(5, Math.ceil(profile.length * 0.18)));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomCounts = bottomRows.map((row) => Number(row.count || 0));
  const minBottom = Math.min(...bottomCounts);
  const maxBottom = Math.max(...bottomCounts);
  const bottomVariance = maxBottom - minBottom;
  const straightBody = topWidth >= width * 0.9 && middleWidth >= width * 0.92 && lowerWidth >= width * 0.84;
  const wavyBottom = minBottom <= middleWidth * 0.74 && maxBottom >= middleWidth * 0.88 && bottomVariance >= width * 0.14;
  const sidesAligned = Math.abs(top.minX - middle.minX) <= width * 0.06 && Math.abs(top.maxX - middle.maxX) <= width * 0.06;
  return straightBody && wavyBottom && sidesAligned;
}

function looksLikeFolder(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.35 || aspect > 5.2 || density < 0.62 || density > 0.96) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 16) return false;
  const topBand = profile.slice(0, Math.max(2, Math.ceil(profile.length * 0.16)));
  const shoulderStart = Math.floor(profile.length * 0.24);
  const shoulderBand = profile.slice(shoulderStart, shoulderStart + Math.max(2, Math.ceil(profile.length * 0.12)));
  const middleStart = Math.floor(profile.length * 0.45);
  const middleBand = profile.slice(middleStart, middleStart + Math.max(2, Math.ceil(profile.length * 0.18)));
  const top = averageRowBand(topBand);
  const shoulder = averageRowBand(shoulderBand);
  const middle = averageRowBand(middleBand);
  const left = Number(box.x || 0);
  const right = left + width;
  const topWidth = top.maxX - top.minX + 1;
  const shoulderWidth = shoulder.maxX - shoulder.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  if (middleWidth < width * 0.72 || shoulderWidth < width * 0.72) return false;
  if (topWidth >= middleWidth * 0.82 || topWidth <= width * 0.18) return false;
  const tabStartsNearLeft = Math.abs(top.minX - left) <= width * 0.12;
  const tabEndsBeforeRight = top.maxX <= right - width * 0.18;
  const bodyStartsNearLeft = Math.abs(middle.minX - left) <= width * 0.12;
  const bodyEndsNearRight = Math.abs(middle.maxX - right) <= width * 0.12;
  return tabStartsNearLeft && tabEndsBeforeRight && bodyStartsNearLeft && bodyEndsNearRight;
}

function looksLikeScreen(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.4 || density < 0.58 || density > 0.9) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.34), Math.floor(profile.length * 0.54)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.72), Math.floor(profile.length * 0.84)));
  const base = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const baseWidth = base.maxX - base.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const neckCenter = (neck.minX + neck.maxX) / 2;
  const baseCenter = (base.minX + base.maxX) / 2;
  const widePanel = topWidth >= width * 0.88 && middleWidth >= width * 0.9;
  const centeredStand = neckWidth <= middleWidth * 0.35
    && baseWidth >= middleWidth * 0.35
    && baseWidth <= middleWidth * 0.72
    && Math.abs(neckCenter - center) <= width * 0.08
    && Math.abs(baseCenter - center) <= width * 0.08;
  return widePanel && centeredStand;
}

function looksLikePhone(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.36 || aspect > 0.66 || density < 0.72 || density > 0.995) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.34)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.66), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const straightBody = upperWidth >= width * 0.9
    && middleWidth >= width * 0.92
    && lowerWidth >= width * 0.9
    && Math.abs(upper.minX - lower.minX) <= width * 0.06
    && Math.abs(upper.maxX - lower.maxX) <= width * 0.06;
  const roundedEnds = topWidth >= middleWidth * 0.46
    && topWidth <= middleWidth * 0.96
    && bottomWidth >= middleWidth * 0.46
    && bottomWidth <= middleWidth * 0.96;
  return straightBody && roundedEnds;
}

function looksLikePerson(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.38 || aspect > 0.92 || density < 0.38 || density > 0.93) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const head = averageRowBand(profile.slice(Math.floor(profile.length * 0.18), Math.floor(profile.length * 0.34)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.36), Math.floor(profile.length * 0.48)));
  const torso = averageRowBand(profile.slice(Math.floor(profile.length * 0.58), Math.floor(profile.length * 0.78)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const headWidth = head.maxX - head.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const torsoWidth = torso.maxX - torso.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const headCenter = (head.minX + head.maxX) / 2;
  const torsoCenter = (torso.minX + torso.maxX) / 2;
  const roundedHead = headWidth >= width * 0.42
    && headWidth <= width * 0.88
    && topWidth <= headWidth * 0.86;
  const broaderTorso = torsoWidth >= headWidth * 1.12
    && torsoWidth >= width * 0.68
    && bottomWidth >= torsoWidth * 0.72;
  const centeredParts = Math.abs(headCenter - center) <= width * 0.12
    && Math.abs(torsoCenter - center) <= width * 0.1;
  const neckTransition = neckWidth <= torsoWidth * 1.02
    && neckWidth >= headWidth * 0.46;
  return roundedHead && broaderTorso && centeredParts && neckTransition;
}

function looksLikeTeam(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 1.05 || aspect > 2.15 || density < 0.38 || density > 0.9) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.1));
  const top = averageRowBand(profile.slice(0, band));
  const heads = averageRowBand(profile.slice(Math.floor(profile.length * 0.18), Math.floor(profile.length * 0.34)));
  const neck = averageRowBand(profile.slice(Math.floor(profile.length * 0.36), Math.floor(profile.length * 0.5)));
  const torso = averageRowBand(profile.slice(Math.floor(profile.length * 0.58), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const headsWidth = heads.maxX - heads.minX + 1;
  const neckWidth = neck.maxX - neck.minX + 1;
  const torsoWidth = torso.maxX - torso.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const headsCenter = (heads.minX + heads.maxX) / 2;
  const torsoCenter = (torso.minX + torso.maxX) / 2;
  const multipleHeads = headsWidth >= width * 0.58
    && headsWidth <= width * 0.95
    && topWidth >= headsWidth * 0.15
    && topWidth <= headsWidth * 0.82;
  const sharedTorso = torsoWidth >= headsWidth * 0.95
    && torsoWidth >= width * 0.72
    && bottomWidth >= torsoWidth * 0.74;
  const centeredGroup = Math.abs(headsCenter - center) <= width * 0.08
    && Math.abs(torsoCenter - center) <= width * 0.08;
  const neckTransition = neckWidth >= headsWidth * 0.7
    && neckWidth <= torsoWidth * 1.04;
  return multipleHeads && sharedTorso && centeredGroup && neckTransition;
}

function looksLikeFunnel(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.65 || aspect > 1.85 || density < 0.34 || density > 0.72) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 20) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.34)));
  const waist = averageRowBand(profile.slice(Math.floor(profile.length * 0.48), Math.floor(profile.length * 0.6)));
  const stem = averageRowBand(profile.slice(Math.floor(profile.length * 0.72), Math.floor(profile.length * 0.9)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const waistWidth = waist.maxX - waist.minX + 1;
  const stemWidth = stem.maxX - stem.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const stemCenter = (stem.minX + stem.maxX) / 2;
  const bottomCenter = (bottom.minX + bottom.maxX) / 2;
  const taperedBowl = topWidth >= width * 0.82
    && upperWidth <= topWidth * 0.9
    && waistWidth <= topWidth * 0.58
    && waistWidth >= topWidth * 0.22;
  const centeredStem = stemWidth <= topWidth * 0.34
    && bottomWidth <= topWidth * 0.34
    && stemWidth >= topWidth * 0.12
    && Math.abs(stemCenter - center) <= width * 0.08
    && Math.abs(bottomCenter - center) <= width * 0.08;
  return taperedBowl && centeredStem;
}

function looksLikeDonut(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.72 || aspect > 1.38 || density < 0.28 || density > 0.64) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.22), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.78)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const roundedOuterProfile = middleWidth >= width * 0.82
    && upperWidth >= middleWidth * 0.72
    && lowerWidth >= middleWidth * 0.72
    && topWidth >= middleWidth * 0.18
    && topWidth <= middleWidth * 0.72
    && bottomWidth >= middleWidth * 0.18
    && bottomWidth <= middleWidth * 0.72;
  const topBottomSymmetry = Math.abs(topWidth - bottomWidth) <= middleWidth * 0.18
    && Math.abs(upperWidth - lowerWidth) <= middleWidth * 0.16;
  return roundedOuterProfile && topBottomSymmetry;
}

function looksLikeGear(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 28 || height < 28 || aspect < 0.72 || aspect > 1.38) return false;
  if (density < 0.24 || density > 0.72) return false;
  if (!looksLikeDonut(component)) return false;
  const rowRoughness = profileEdgeRoughness(component.rowProfile || [], width);
  const colRoughness = profileEdgeRoughness(component.colProfile || [], height, "col");
  const rowProtrusion = profileOuterProtrusionRatio(component.rowProfile || [], width);
  const colProtrusion = profileOuterProtrusionRatio(component.colProfile || [], height, "col");
  return Math.max(rowRoughness, colRoughness) >= 0.01
    && Math.min(rowProtrusion, colProtrusion) >= 0.19;
}

function looksLikeSearchIcon(component) {
  return searchIconEvidence(component).matched;
}

function searchIconEvidence(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 26 || height < 26 || aspect < 0.72 || aspect > 1.65) return { matched: false, reason: "bounds", width, height, aspect, density };
  if (density < 0.16 || density > 0.58) return { matched: false, reason: "density", width, height, aspect, density };
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return { matched: false, reason: "profile", width, height, aspect, density, profileLength: profile.length };
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const middleInkRatio = middle.count / Math.max(1, middleWidth);
  const middleCenter = (middle.minX + middle.maxX) / 2;
  const lowerCenter = (lower.minX + lower.maxX) / 2;
  const bottomCenter = (bottom.minX + bottom.maxX) / 2;
  const completeLensLike = upperWidth >= width * 0.42
    && middleWidth >= width * 0.48
    && topWidth >= width * 0.10
    && topWidth <= middleWidth * 0.72
    && middleInkRatio <= 0.82;
  // Text or output cards frequently occlude the right half of a magnifier.
  // Preserve the ring-plus-handle interpretation when the upper arc remains
  // broad and the visible middle fragment sits well left of the handle.
  const occludedLensLike = topWidth >= width * 0.22
    && upperWidth >= width * 0.38
    && middleWidth >= width * 0.12
    && middleWidth <= upperWidth * 0.62
    && lowerWidth >= width * 0.22
    && middleCenter <= lowerCenter - width * 0.25
    && upperWidth >= topWidth * 0.95;
  const lensLike = completeLensLike || occludedLensLike;
  const handleLike = bottomWidth >= width * 0.08
    && bottomWidth <= width * 0.48
    && lowerWidth <= Math.max(middleWidth * 0.9, bottomWidth * 2.8)
    && lowerCenter >= middleCenter + width * 0.08
    && bottomCenter >= middleCenter + width * 0.16
    && bottom.minX >= Number(box.x || 0) + width * 0.42
    && bottom.maxX >= Number(box.x || 0) + width * 0.72;
  return {
    matched: lensLike && handleLike,
    reason: lensLike ? (handleLike ? "matched" : "handle") : "lens",
    width,
    height,
    aspect,
    density,
    topWidth,
    upperWidth,
    middleWidth,
    lowerWidth,
    bottomWidth,
    middleInkRatio,
    middleCenter,
    lowerCenter,
    bottomCenter,
    bottomMinX: bottom.minX,
    bottomMaxX: bottom.maxX,
    lensLike,
    completeLensLike,
    occludedLensLike,
    handleLike
  };
}

function looksLikeShield(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (width < 28 || height < 34 || aspect < 0.58 || aspect > 1.28) return false;
  if (density < 0.42 || density > 0.86) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 24) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.10));
  const top = averageRowBand(profile.slice(0, band));
  const shoulder = averageRowBand(profile.slice(Math.floor(profile.length * 0.16), Math.floor(profile.length * 0.30)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.42), Math.floor(profile.length * 0.58)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.68), Math.floor(profile.length * 0.82)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const shoulderWidth = shoulder.maxX - shoulder.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const center = Number(box.x || 0) + width / 2;
  const centers = [top, shoulder, middle, lower, bottom].map((item) => (item.minX + item.maxX) / 2);
  const centered = centers.every((value) => Math.abs(value - center) <= width * 0.12);
  const broadTop = shoulderWidth >= width * 0.78
    && topWidth >= width * 0.28
    && topWidth <= shoulderWidth * 1.05;
  const shieldTaper = middleWidth >= shoulderWidth * 0.70
    && middleWidth <= shoulderWidth * 1.02
    && lowerWidth <= middleWidth * 0.72
    && lowerWidth >= shoulderWidth * 0.28
    && bottomWidth <= shoulderWidth * 0.34;
  const pointedBottom = bottom.count / Math.max(1, bottomWidth) >= 0.72
    && bottomWidth <= width * 0.34;
  return centered && broadTop && shieldTaper && pointedBottom;
}

function profileEdgeRoughness(profile = [], span, axis = "row") {
  if (!Array.isArray(profile) || profile.length < 18 || !span) return 0;
  const widths = profile.map((item) => axis === "col"
    ? Number(item.maxY || 0) - Number(item.minY || 0) + 1
    : Number(item.maxX || 0) - Number(item.minX || 0) + 1);
  let total = 0;
  let count = 0;
  for (let index = 2; index < widths.length - 2; index += 1) {
    const localAverage = (widths[index - 2] + widths[index - 1] + widths[index + 1] + widths[index + 2]) / 4;
    total += Math.abs(widths[index] - localAverage) / Math.max(1, span);
    count += 1;
  }
  return total / Math.max(1, count);
}

function profileOuterProtrusionRatio(profile = [], span, axis = "row") {
  if (!Array.isArray(profile) || profile.length < 18 || !span) return 0;
  const widths = profile.map((item) => axis === "col"
    ? Number(item.maxY || 0) - Number(item.minY || 0) + 1
    : Number(item.maxX || 0) - Number(item.minX || 0) + 1);
  const maxWidth = Math.max(...widths);
  const band = Math.max(2, Math.ceil(widths.length * 0.08));
  const edgeWidth = Math.max(
    average(widths.slice(0, band)),
    average(widths.slice(widths.length - band))
  );
  return edgeWidth / Math.max(1, maxWidth);
}

function looksLikeCycleArrow(component) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const aspect = width / Math.max(1, height);
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (aspect < 0.72 || aspect > 1.38 || density < 0.18 || density > 0.58) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 18) return false;
  const band = Math.max(3, Math.ceil(profile.length * 0.12));
  const top = averageRowBand(profile.slice(0, band));
  const upper = averageRowBand(profile.slice(Math.floor(profile.length * 0.2), Math.floor(profile.length * 0.36)));
  const middle = averageRowBand(profile.slice(Math.floor(profile.length * 0.44), Math.floor(profile.length * 0.56)));
  const lower = averageRowBand(profile.slice(Math.floor(profile.length * 0.64), Math.floor(profile.length * 0.8)));
  const bottom = averageRowBand(profile.slice(profile.length - band));
  const topWidth = top.maxX - top.minX + 1;
  const upperWidth = upper.maxX - upper.minX + 1;
  const middleWidth = middle.maxX - middle.minX + 1;
  const lowerWidth = lower.maxX - lower.minX + 1;
  const bottomWidth = bottom.maxX - bottom.minX + 1;
  const outerWidth = Math.max(topWidth, upperWidth, middleWidth, lowerWidth, bottomWidth);
  if (outerWidth < width * 0.72) return false;
  const middleInkRatio = middle.count / Math.max(1, middleWidth);
  const upperInkRatio = upper.count / Math.max(1, upperWidth);
  const lowerInkRatio = lower.count / Math.max(1, lowerWidth);
  const hasOpenCenter = Math.min(upperInkRatio, lowerInkRatio) <= 0.68
    || (middleWidth <= outerWidth * 0.58 && middleInkRatio <= 0.9);
  if (!hasOpenCenter) return false;
  const roundedBand = upperWidth >= outerWidth * 0.56
    && lowerWidth >= outerWidth * 0.56
    && topWidth >= outerWidth * 0.12
    && bottomWidth >= outerWidth * 0.12;
  if (!roundedBand) return false;
  const center = (bandStats) => (bandStats.minX + bandStats.maxX) / 2;
  const widthAsymmetry = Math.max(
    Math.abs(topWidth - bottomWidth),
    Math.abs(upperWidth - lowerWidth)
  );
  const centerAsymmetry = Math.max(
    Math.abs(center(top) - center(bottom)),
    Math.abs(center(upper) - center(lower))
  );
  return widthAsymmetry >= outerWidth * 0.16 || centerAsymmetry >= width * 0.07;
}

function looksLikeTriangle(component) {
  const box = component.box || {};
  const expected = Number(box.w || 0) * Number(box.h || 0) / 2;
  if (expected <= 0) return false;
  const ratio = Number(component.pixelCount || 0) / expected;
  if (ratio < 0.72 || ratio > 1.28) return false;
  const profile = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  if (profile.length < 8) return false;
  const maxCount = Math.max(...profile.map((row) => row.count));
  const maxIndex = profile.findIndex((row) => row.count === maxCount);
  const edgeBand = Math.max(2, Math.ceil(profile.length * 0.22));
  return maxIndex < edgeBand || maxIndex >= profile.length - edgeBand;
}

function looksLikeLine(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  return (aspect >= 7 && h <= Math.max(10, region.h * 0.08))
    || (aspect <= 0.14 && w <= Math.max(10, region.w * 0.08));
}

function looksLikeDiagonalLine(component, region) {
  const box = component.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  if (width < Math.max(28, Number(region.w || 0) * 0.045) || height < Math.max(18, Number(region.h || 0) * 0.04)) return false;
  const aspect = width / Math.max(1, height);
  // Shallow connectors can legitimately span more than four widths per
  // height. Linear-fit evidence below still rejects ordinary long boxes.
  if (aspect < 0.16 || aspect > 6.5) return false;
  const density = Number(component.pixelCount || 0) / Math.max(1, width * height);
  if (density < 0.012 || density > 0.34) return false;
  const fit = inferDiagonalLineFit(component);
  return fit && fit.coverage >= 0.58 && fit.monotonicity >= 0.72 && fit.errorRatio <= 0.16;
}

function inferDiagonalLineFit(component) {
  const box = component.box || {};
  const rows = (component.rowProfile || [])
    .filter((row) => Number(row.count || 0) > 0)
    .map((row) => ({
      y: Number(row.y || 0),
      x: (Number(row.minX || 0) + Number(row.maxX || 0)) / 2
    }))
    .sort((a, b) => a.y - b.y);
  if (rows.length < Math.max(8, Number(box.h || 0) * 0.35)) return null;
  const first = rows[0];
  const last = rows[rows.length - 1];
  const dy = last.y - first.y;
  if (Math.abs(dy) < 4) return null;
  const slope = (last.x - first.x) / dy;
  let totalError = 0;
  let monotonicSteps = 0;
  const direction = Math.sign(last.x - first.x) || 1;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expected = first.x + slope * (row.y - first.y);
    totalError += Math.abs(row.x - expected);
    if (index === 0 || (rows[index].x - rows[index - 1].x) * direction >= -1.5) monotonicSteps += 1;
  }
  const coverage = rows.length / Math.max(1, Number(box.h || 0));
  const monotonicity = monotonicSteps / Math.max(1, rows.length);
  const errorRatio = totalError / Math.max(1, rows.length * Math.max(1, Number(box.w || 0)));
  return { coverage, monotonicity, errorRatio, first, last };
}

function inferDiagonalLineEndpoints(component) {
  const fit = inferDiagonalLineFit(component);
  if (!fit) return null;
  return {
    from: { x: round(fit.first.x), y: round(fit.first.y) },
    to: { x: round(fit.last.x), y: round(fit.last.y) }
  };
}

function looksLikeTimeline(component, region) {
  const { w, h } = component.box || {};
  const aspect = Number(w || 0) / Math.max(1, Number(h || 0));
  const density = Number(component.pixelCount || 0) / Math.max(1, Number(w || 0) * Number(h || 0));
  if (aspect < 4.2 || Number(h || 0) > Math.max(34, Number(region.h || 0) * 0.18)) return false;
  if (density < 0.16 || density > 0.68) return false;
  const rows = Array.isArray(component.rowProfile) ? component.rowProfile : [];
  const cols = Array.isArray(component.colProfile) ? component.colProfile : [];
  if (rows.length < 5 || cols.length < 40) return false;
  const maxRowCount = Math.max(...rows.map((row) => Number(row.count || 0)));
  const rowSpan = Math.max(...rows.map((row) => Number(row.maxX || 0))) - Math.min(...rows.map((row) => Number(row.minX || 0))) + 1;
  const hasMainAxis = maxRowCount >= rowSpan * 0.72;
  return hasMainAxis && inferTimelineMilestones(component).length >= 3;
}

function inferTimelineMilestones(component, image = null, slideSize = DEFAULT_SLIDE) {
  const cols = Array.isArray(component.colProfile) ? component.colProfile : [];
  const box = component.box || {};
  if (cols.length === 0) return [];
  const counts = cols.map((col) => Number(col.count || 0)).sort((a, b) => a - b);
  const baseline = counts[Math.floor(counts.length * 0.35)] || 1;
  const minPeak = Math.max(baseline * 1.8, Number(box.h || 0) * 0.34, 5);
  const groups = [];
  let group = [];
  const flush = () => {
    if (!group.length) return;
    const minX = Math.min(...group.map((col) => Number(col.x || 0)));
    const maxX = Math.max(...group.map((col) => Number(col.x || 0)));
    const maxCount = Math.max(...group.map((col) => Number(col.count || 0)));
    if (maxX - minX + 1 >= Math.max(4, Number(box.h || 0) * 0.18)) {
      const centerPx = (minX + maxX + 1) / 2;
      const x = image ? round(centerPx * Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width) : centerPx;
      const widthPx = maxX - minX + 1;
      const widthPt = image ? round(widthPx * Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width) : widthPx;
      groups.push({ x, widthPx, widthPt, strength: round(maxCount / Math.max(1, Number(box.h || 0))) });
    }
    group = [];
  };
  for (const col of cols) {
    if (Number(col.count || 0) >= minPeak) {
      if (!group.length || Number(col.x || 0) <= Number(group[group.length - 1].x || 0) + 2) group.push(col);
      else {
        flush();
        group.push(col);
      }
    } else {
      flush();
    }
  }
  flush();
  return groups
    .filter((group, index, all) => !all.some((other, otherIndex) =>
      otherIndex !== index && Math.abs(other.x - group.x) < 4 && other.widthPx > group.widthPx
    ))
    .slice(0, 12);
}

function looksLikeArrow(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const density = component.pixelCount / Math.max(1, w * h);
  if (density >= 0.72) return false;
  if (aspect >= 3.2 && h <= Math.max(28, region.h * 0.16)) {
    return arrowProfileEvidence(component.colProfile, "vertical-span");
  }
  if (aspect <= 0.31 && w <= Math.max(28, region.w * 0.16)) {
    return arrowProfileEvidence(component.rowProfile, "horizontal-span");
  }
  return false;
}

function inferArrowDirection(component = {}) {
  const horizontal = Number(component.box?.w || 0) >= Number(component.box?.h || 0);
  const profile = horizontal ? component.colProfile : component.rowProfile;
  const spans = profileSpans(profile, horizontal ? "vertical-span" : "horizontal-span");
  if (spans.length < 5) return horizontal ? "right" : "down";
  const windowSize = Math.max(2, Math.floor(spans.length * 0.2));
  const start = Math.max(...spans.slice(0, windowSize));
  const end = Math.max(...spans.slice(-windowSize));
  if (horizontal) return start > end * 1.12 ? "left" : "right";
  return start > end * 1.12 ? "up" : "down";
}

function arrowProfileEvidence(profile = [], spanKind) {
  const spans = profileSpans(profile, spanKind);
  if (spans.length < 8) return false;
  const windowSize = Math.max(2, Math.floor(spans.length * 0.2));
  const middleStart = windowSize;
  const middleEnd = Math.max(middleStart + 1, spans.length - windowSize);
  const shaftSpan = median(spans.slice(middleStart, middleEnd));
  const startSpan = Math.max(...spans.slice(0, windowSize));
  const endSpan = Math.max(...spans.slice(-windowSize));
  const headSpan = Math.max(startSpan, endSpan);
  const tailSpan = Math.min(startSpan, endSpan);
  return shaftSpan >= 1
    && headSpan >= Math.max(shaftSpan * 1.45, shaftSpan + 3)
    && headSpan >= tailSpan * 1.18;
}

function profileSpans(profile = [], spanKind) {
  return (profile || []).map((entry) => spanKind === "vertical-span"
    ? Math.max(1, Number(entry.maxY || 0) - Number(entry.minY || 0) + 1)
    : Math.max(1, Number(entry.maxX || 0) - Number(entry.minX || 0) + 1));
}

function isGridLikeLine(component, region) {
  const { w, h } = component.box;
  const aspect = w / Math.max(1, h);
  const longAxisRatio = aspect >= 1 ? w / Math.max(1, region.w) : h / Math.max(1, region.h);
  return longAxisRatio >= 0.72;
}

function sampleBackground(image, region) {
  const points = [
    [region.x + 2, region.y + 2],
    [region.x + region.w - 3, region.y + 2],
    [region.x + 2, region.y + region.h - 3],
    [region.x + region.w - 3, region.y + region.h - 3]
  ].map(([x, y]) => sampleRgb(image, clamp(x, 0, image.width - 1), clamp(y, 0, image.height - 1)));
  return [
    median(points.map((rgb) => rgb[0])),
    median(points.map((rgb) => rgb[1])),
    median(points.map((rgb) => rgb[2]))
  ];
}

function sampleRgb(image, x, y) {
  const offset = (y * image.width + x) * 4;
  return [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
}

function ptToPxBox(box, image, slideSize = DEFAULT_SLIDE, pad = 0) {
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const x = clamp(Math.floor(Number(box.x || 0) * scaleX - pad), 0, image.width - 1);
  const y = clamp(Math.floor(Number(box.y || 0) * scaleY - pad), 0, image.height - 1);
  const w = clamp(Math.ceil(Number(box.w || 0) * scaleX + pad * 2), 1, image.width - x);
  const h = clamp(Math.ceil(Number(box.h || 0) * scaleY + pad * 2), 1, image.height - y);
  return { x, y, w, h };
}

function pxToPtBox(box, image, slideSize = DEFAULT_SLIDE, pad = 0) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    x: round(Math.max(0, box.x * scaleX - pad)),
    y: round(Math.max(0, box.y * scaleY - pad)),
    w: round(box.w * scaleX + pad * 2),
    h: round(box.h * scaleY + pad * 2)
  };
}

function pxLineEndpointsToPt(endpoints, image, slideSize = DEFAULT_SLIDE) {
  if (!endpoints?.from || !endpoints?.to) return null;
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    from: {
      x: round(Number(endpoints.from.x || 0) * scaleX),
      y: round(Number(endpoints.from.y || 0) * scaleY)
    },
    to: {
      x: round(Number(endpoints.to.x || 0) * scaleX),
      y: round(Number(endpoints.to.y || 0) * scaleY)
    }
  };
}

function pxPointsToPt(points, image, slideSize = DEFAULT_SLIDE) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return (points || []).map((point) => ({
    x: round(Number(point.x || 0) * scaleX),
    y: round(Number(point.y || 0) * scaleY)
  }));
}

function pxSankeyBandToPt(band = {}, image, slideSize = DEFAULT_SLIDE) {
  const scaleX = Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt) / image.width;
  const scaleY = Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt) / image.height;
  return {
    sourceX: round(Number(band.sourceX || 0) * scaleX),
    targetX: round(Number(band.targetX || 0) * scaleX),
    sourceTop: round(Number(band.sourceTop || 0) * scaleY),
    sourceBottom: round(Number(band.sourceBottom || 0) * scaleY),
    sourceCenterY: round(Number(band.sourceCenterY || 0) * scaleY),
    targetTop: round(Number(band.targetTop || 0) * scaleY),
    targetBottom: round(Number(band.targetBottom || 0) * scaleY),
    targetCenterY: round(Number(band.targetCenterY || 0) * scaleY),
    sourceThickness: round(Number(band.sourceThickness || 0) * scaleY),
    targetThickness: round(Number(band.targetThickness || 0) * scaleY),
    confidence: round(band.confidence)
  };
}

function overlapRatio(a = {}, b = {}) {
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1) / Math.max(1, Number(a.w || 0) * Number(a.h || 0));
}

function inAnyMask(x, y, masks = []) {
  return masks.some((mask) => x >= mask.x && x < mask.x + mask.w && y >= mask.y && y < mask.y + mask.h);
}

function boxesNear(a, b, gap) {
  return !(a.x + a.w + gap < b.x || b.x + b.w + gap < a.x || a.y + a.h + gap < b.y || b.y + b.h + gap < a.y);
}

function boxContains(outer = {}, inner = {}, pad = 0) {
  return Number(inner.x || 0) >= Number(outer.x || 0) - pad
    && Number(inner.y || 0) >= Number(outer.y || 0) - pad
    && Number(inner.x || 0) + Number(inner.w || 0) <= Number(outer.x || 0) + Number(outer.w || 0) + pad
    && Number(inner.y || 0) + Number(inner.h || 0) <= Number(outer.y || 0) + Number(outer.h || 0) + pad;
}

function unionBox(a, b) {
  const x1 = Math.min(a.x, b.x);
  const y1 = Math.min(a.y, b.y);
  const x2 = Math.max(a.x + a.w, b.x + b.w);
  const y2 = Math.max(a.y + a.h, b.y + b.h);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function intersectionArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function distanceToBox(point, box = {}) {
  const x = Number(point.x || 0);
  const y = Number(point.y || 0);
  const left = Number(box.x || 0);
  const top = Number(box.y || 0);
  const right = left + Number(box.w || 0);
  const bottom = top + Number(box.h || 0);
  const dx = x < left ? left - x : x > right ? x - right : 0;
  const dy = y < top ? top - y : y > bottom ? y - bottom : 0;
  return Math.hypot(dx, dy);
}

function distanceBetweenPoints(a = {}, b = {}) {
  return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.y || 0) - Number(b.y || 0));
}

function centerOfBox(box = {}) {
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2,
    y: Number(box.y || 0) + Number(box.h || 0) / 2
  };
}

function expandPxBox(box, image, pad) {
  const x = clamp(box.x - pad, 0, image.width - 1);
  const y = clamp(box.y - pad, 0, image.height - 1);
  return {
    x,
    y,
    w: clamp(box.w + pad * 2, 1, image.width - x),
    h: clamp(box.h + pad * 2, 1, image.height - y)
  };
}

function dominantSaturatedForegroundColor(image = {}, region = {}, bg = [255, 255, 255], masks = []) {
  if (!image?.rgba || !region?.w || !region?.h) return null;
  const bins = new Map();
  let sampled = 0;
  const step = Math.max(1, Math.ceil(Math.max(region.w, region.h) / 260));
  for (let y = region.y; y < region.y + region.h; y += step) {
    for (let x = region.x; x < region.x + region.w; x += step) {
      if (inAnyMask(x, y, masks) || !isForegroundPixel(image, x, y, bg)) continue;
      const offset = (y * image.width + x) * 4;
      const rgb = [image.rgba[offset], image.rgba[offset + 1], image.rgba[offset + 2]];
      if (saturation(rgb) < 0.24 || luminance(rgb) < 34 || luminance(rgb) > 235) continue;
      const key = rgb.map((value) => Math.round(value / 24) * 24).join(",");
      const entry = bins.get(key) || { count: 0, sum: [0, 0, 0] };
      entry.count += 1;
      entry.sum[0] += rgb[0];
      entry.sum[1] += rgb[1];
      entry.sum[2] += rgb[2];
      bins.set(key, entry);
      sampled += 1;
    }
  }
  const best = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  if (!best || best.count < 24) return null;
  return {
    rgb: best.sum.map((value) => Math.round(value / best.count)),
    coverageRatio: best.count / Math.max(1, sampled)
  };
}

function detectDenseLinkedNodeAtoms(image = {}, regionBox = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!image?.rgba || !image.width || !image.height || !regionBox?.w || !regionBox?.h) return [];
  const baseRegion = ptToPxBox(regionBox, image, slideSize, 0);
  const ratios = options.subRegionRatios || {};
  const region = {
    x: clamp(Math.floor(baseRegion.x + baseRegion.w * Number(ratios.x || 0)), 0, image.width - 1),
    y: clamp(Math.floor(baseRegion.y + baseRegion.h * Number(ratios.y || 0)), 0, image.height - 1),
    w: clamp(Math.ceil(baseRegion.w * Number(ratios.w || 1)), 1, image.width),
    h: clamp(Math.ceil(baseRegion.h * Number(ratios.h || 1)), 1, image.height)
  };
  region.w = clamp(region.w, 1, image.width - region.x);
  region.h = clamp(region.h, 1, image.height - region.y);
  if (region.w < 12 || region.h < 12) return [];
  const isTargetPixel = typeof options.isTargetPixel === "function"
    ? (x, y) => options.isTargetPixel(image, x, y)
    : targetColorPixelPredicate(image, options);
  const connected = detectDenseLinkedNodeConnectedComponents(image, region, slideSize, isTargetPixel, options);
  const nodes = connected.length >= Number(options.minConnectedNodes || 8)
    ? connected
    : detectDenseLinkedNodeDensityPeaks(image, region, slideSize, isTargetPixel, options);
  return nodes
    .slice(0, Number(options.maxNodes || 28))
    .map((node, index) => ({
      id: `${options.idPrefix || "dense-linked-node"}-${index + 1}`,
      kind: "native-rect-candidate",
      shapeHint: node.kind === "circle" ? "ellipse" : "rect",
      box: {
        x: round(node.x - node.size / 2),
        y: round(node.y - node.size / 2),
        w: round(node.size),
        h: round(node.size)
      },
      center: { x: round(node.x), y: round(node.y) },
      density: node.confidence,
      nativeCandidate: true,
      residualCandidate: false,
      source: {
        detector: "dense-linked-node-atom",
        sourceImageDetected: true,
        method: node.method || "unknown"
      }
    }));
}

function detectDenseLinkedNodeConnectedComponents(image, region, slideSize, isTargetPixel, options = {}) {
  const blueMask = new Uint8Array(region.w * region.h);
  const denseMask = new Uint8Array(region.w * region.h);
  for (let y = 0; y < region.h; y += 1) {
    for (let x = 0; x < region.w; x += 1) {
      blueMask[y * region.w + x] = isTargetPixel(region.x + x, region.y + y) ? 1 : 0;
    }
  }
  for (let y = 1; y < region.h - 1; y += 1) {
    for (let x = 1; x < region.w - 1; x += 1) {
      const index = y * region.w + x;
      if (!blueMask[index]) continue;
      const neighbors = blueMask[index - region.w - 1]
        + blueMask[index - region.w]
        + blueMask[index - region.w + 1]
        + blueMask[index - 1]
        + blueMask[index]
        + blueMask[index + 1]
        + blueMask[index + region.w - 1]
        + blueMask[index + region.w]
        + blueMask[index + region.w + 1];
      if (neighbors >= Number(options.minDenseNeighbors || 6)) denseMask[index] = 1;
    }
  }
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const visited = new Uint8Array(region.w * region.h);
  const components = [];
  const queue = [];
  for (let startY = 0; startY < region.h; startY += 1) {
    for (let startX = 0; startX < region.w; startX += 1) {
      const startIndex = startY * region.w + startX;
      if (!denseMask[startIndex] || visited[startIndex]) continue;
      visited[startIndex] = 1;
      queue.length = 0;
      queue.push(startIndex);
      let area = 0;
      let minX = startX;
      let maxX = startX;
      let minY = startY;
      let maxY = startY;
      for (let head = 0; head < queue.length; head += 1) {
        const index = queue[head];
        const x = index % region.w;
        const y = Math.floor(index / region.w);
        area += 1;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        for (const delta of [-1, 1, -region.w, region.w]) {
          const next = index + delta;
          if (next < 0 || next >= denseMask.length || visited[next] || !denseMask[next]) continue;
          if ((delta === -1 && x === 0) || (delta === 1 && x === region.w - 1)) continue;
          visited[next] = 1;
          queue.push(next);
        }
      }
      const boxW = maxX - minX + 1;
      const boxH = maxY - minY + 1;
      const fillRatio = area / Math.max(1, boxW * boxH);
      const slideW = boxW / scaleX;
      const slideH = boxH / scaleY;
      if (area < Number(options.minComponentPixels || 28)
        || slideW < Number(options.minNodeSizePt || 4.5)
        || slideH < Number(options.minNodeSizePt || 4.5)
        || slideW > Number(options.maxNodeSizePt || 24)
        || slideH > Number(options.maxNodeSizePt || 24)
        || fillRatio < Number(options.minFillRatio || 0.34)) continue;
      components.push({
        x: round((region.x + minX + boxW / 2) / scaleX),
        y: round((region.y + minY + boxH / 2) / scaleY),
        size: round(clamp(Math.max(slideW, slideH) + Number(options.nodePadPt || 2.2), Number(options.outputMinSizePt || 7), Number(options.outputMaxSizePt || 15))),
        kind: Math.abs(slideW - slideH) <= 2 && fillRatio > 0.58 ? "circle" : "rect",
        confidence: round(Math.min(0.98, 0.55 + fillRatio * 0.42)),
        method: "connected-component"
      });
    }
  }
  return components.sort((a, b) => a.y - b.y || a.x - b.x);
}

function detectDenseLinkedNodeDensityPeaks(image, region, slideSize, isTargetPixel, options = {}) {
  const scaleX = image.width / Math.max(1, slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const scaleY = image.height / Math.max(1, slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const windowSize = Math.round(clamp(Math.min(scaleX, scaleY) * Number(options.windowSizePt || 11.5), Number(options.minWindowPx || 22), Number(options.maxWindowPx || 34)));
  const step = Math.max(5, Math.round(windowSize * Number(options.windowStepRatio || 0.26)));
  const candidates = [];
  for (let y = region.y; y <= region.y + region.h - windowSize; y += step) {
    for (let x = region.x; x <= region.x + region.w - windowSize; x += step) {
      let targetCount = 0;
      let sumX = 0;
      let sumY = 0;
      let samples = 0;
      for (let yy = 0; yy < windowSize; yy += 2) {
        for (let xx = 0; xx < windowSize; xx += 2) {
          samples += 1;
          if (!isTargetPixel(x + xx, y + yy)) continue;
          targetCount += 1;
          sumX += x + xx;
          sumY += y + yy;
        }
      }
      const density = targetCount / Math.max(1, samples);
      if (density < Number(options.minPeakDensity || 0.42) || targetCount < Number(options.minPeakPixels || 40)) continue;
      candidates.push({ x: sumX / targetCount, y: sumY / targetCount, density, targetCount });
    }
  }
  candidates.sort((a, b) => b.density === a.density ? b.targetCount - a.targetCount : b.density - a.density);
  const kept = [];
  const keptPixels = [];
  const minDistance = Math.max(windowSize * Number(options.nmsWindowRatio || 0.82), Number(options.minNmsDistancePx || 24));
  for (const candidate of candidates) {
    if (keptPixels.some((item) => Math.hypot(item.x - candidate.x, item.y - candidate.y) < minDistance)) continue;
    keptPixels.push({ x: candidate.x, y: candidate.y });
    kept.push({
      x: round(candidate.x / scaleX),
      y: round(candidate.y / scaleY),
      size: round(clamp(windowSize / Math.min(scaleX, scaleY) * Number(options.outputWindowScale || 0.72), Number(options.outputMinSizePt || 7.5), Number(options.outputMaxSizePt || 13.5))),
      kind: "rect",
      confidence: round(Math.min(0.96, 0.56 + candidate.density * 0.38)),
      method: "density-peak"
    });
    if (kept.length >= Number(options.maxNodes || 28)) break;
  }
  return kept.sort((a, b) => a.y - b.y || a.x - b.x);
}

function targetColorPixelPredicate(image = {}, options = {}) {
  const targetRgb = Array.isArray(options.targetRgb)
    ? options.targetRgb
    : hexToRgb(options.targetColor || "#126CB4");
  const tolerance = Number(options.colorTolerance || 92);
  return (x, y) => {
    const offset = (y * image.width + x) * 4;
    return offset >= 0 && colorDistance(targetRgb, [
      image.rgba?.[offset] ?? 255,
      image.rgba?.[offset + 1] ?? 255,
      image.rgba?.[offset + 2] ?? 255
    ]) <= tolerance;
  };
}

function luminance([r, g, b]) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

function saturation([r, g, b]) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function rgbToHex(rgb) {
  return `#${rgb.map((value) => clamp(value, 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const normalized = String(hex || "").replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [0, 0, 0];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 255;
}

function average(values = []) {
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function round(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

module.exports = {
  extractVisualAtoms,
  detectDenseLinkedNodeAtoms,
  _private: {
    classifyAtom,
    detectDenseLinkedNodeAtoms,
    detectSemanticSearchComponents,
    detectSemanticGaugeComponents,
    detectSemanticRadarComponents,
    foregroundComponents,
    foregroundComponentsBySeedColor,
    inferDiagonalLineFit,
    inferRadialPolygonVertices,
    isForegroundPixel,
    looksLikeSearchIcon,
    searchIconEvidence,
    recoverResidualArcArrowSegments,
    ptToPxBox,
    pxToPtBox
  }
};
