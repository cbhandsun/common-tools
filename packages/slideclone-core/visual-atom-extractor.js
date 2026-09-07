"use strict";

const { overlapRatio, ptToPxBox, pxLineEndpointsToPt, pxPointsToPt, pxSankeyBandToPt, pxToPtBox, round, sampleBackground } = require("./visual-atom-utils");
const { classifyAtom, inferArrowDirection, inferDiagonalLineEndpoints, inferShapeHint, inferTimelineMilestones, isUsefulAtom } = require("./visual-atom-shape-recognition");
const { detectBaselineColumnBarComponents, detectSemanticChartRectComponents, detectSemanticConvergenceLineComponents, detectSemanticConvergenceNodeComponents, detectSemanticGaugeComponents, detectSemanticRadarComponents, detectSemanticSearchComponents, detectSemanticVennComponents, isSemanticCycleLoop, isSemanticLayeredChart, isSemanticRectChart, suppressColumnChartCompositeComponents, suppressSemanticRectChartCompositeComponents, suppressSemanticSearchCompositeComponents, suppressSemanticSpecialChartComponents } = require("./visual-atom-semantic-components");
const { detectAxisLineComponents, detectDiagonalLineComponents } = require("./visual-atom-line-components");
const { augmentDenseLinkedNodeAtoms, dedupeComponents, detectLowContrastContainerComponents, foregroundComponents, foregroundComponentsBySeedColor, markDonutSegmentParts, markStackedBarParts, mergeCloseComponents, promoteArcArrowSegmentAtoms, promoteConnectorAdjacentRectIcons, recoverResidualArcArrowSegments, shouldProbeColorSeparatedComponents, shouldUseColorSeparatedComponents, suppressCompositeComponents } = require("./visual-atom-components");
const { detectFishboneVisualComponents } = require("./fishbone-visual-atoms");
const { detectSemanticPieComponents } = require("./visual-pie-segments");
const { detectSemanticConcentricCircles } = require("./visual-concentric-circles");
const { detectSemanticQuadrantPanels } = require("./visual-quadrant-panels");
const { detectSemanticSankeyBands, detectSemanticSankeyNodes } = require("./visual-sankey-bands");
const { DEFAULT_SLIDE } = require("./visual-atom-constants");

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

module.exports = {
  extractVisualAtoms
};
