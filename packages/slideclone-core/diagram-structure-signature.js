"use strict";

const { average, boxArea, boxCenterInside, centerOf, overlapRatio, round } = require("./diagram-geometry");
const { clusterVisualNodesByAxis } = require("./diagram-visual-topology");
const { connectorAtomCount, countBy } = require("./diagram-metrics");

function inferStructureSignature({ archetype = "", nodes = [], visualAtoms = [], visualNodes = [], visualConnectors = [], visualGrid = null, box = {} } = {}) {
  const chartSignature = inferChartStructureSignature({ archetype, visualAtoms, visualNodes, box });
  if (chartSignature) return chartSignature;
  const visualStructuralNodes = compactVisualStructureNodes(visualNodes, box);
  const structuralNodes = (visualStructuralNodes.length >= 2 ? visualStructuralNodes : nodes)
    .filter((node) => node?.box && node?.center)
    .sort((a, b) => a.center.x - b.center.x || a.center.y - b.center.y);
  if (archetype === "dashboard-card-grid") {
    const dashboardNodes = structuralNodes.length >= 4 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(dashboardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 2);
    const columns = Math.max(clusterVisualNodesByAxis(dashboardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "dashboard-card-grid",
      stepCount: Math.max(dashboardNodes.length, rows * columns, 4),
      rows,
      columns,
      direction: "metric-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "metric-cards",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(dashboardNodes.length ? ["dashboard-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "screenshot-card-grid") {
    const cardNodes = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 2),
      rows,
      columns,
      direction: "screenshot-gallery-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-screenshot-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["screenshot-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "visual-example-card-grid") {
    const cardNodes = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.12)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.1)).length, visualGrid?.columns || 0, 1);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "visual-example-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 2),
      rows,
      columns,
      direction: "pictorial-example-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-visual-example-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["visual-example-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "feature-icon-card-grid") {
    const cardNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "feature-icon-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 3),
      rows,
      columns,
      direction: "icon-card-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "editable-card-containers",
        "minimum-unit-icon-crops",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["feature-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "numbered-step-card-grid") {
    const cardNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const rows = Math.max(clusterVisualNodesByAxis(cardNodes, "y", Math.max(30, Number(box.h || 0) * 0.11)).length, visualGrid?.rows || 0, 1);
    const columns = Math.max(clusterVisualNodesByAxis(cardNodes, "x", Math.max(42, Number(box.w || 0) * 0.09)).length, visualGrid?.columns || 0, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "numbered-step-card-grid",
      stepCount: Math.max(cardNodes.length, rows * columns, 3),
      rows,
      columns,
      direction: columns >= rows ? "horizontal-numbered-steps" : "vertical-numbered-steps",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "editable-card-containers",
        "editable-step-badges",
        "editable-step-text",
        ...(visualGrid ? ["visual-grid"] : []),
        ...(cardNodes.length ? ["numbered-step-card-nodes"] : [])
      ]
    };
  }
  if (archetype === "quadrant-matrix") {
    const rows = visualGrid?.rows || 2;
    const columns = visualGrid?.columns || 2;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "quadrant",
      stepCount: 4,
      rows,
      columns,
      direction: "two-axis-positioning",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "two-axis-quadrants",
        ...(structuralNodes.length ? ["quadrant-content-nodes"] : [])
      ]
    };
  }
  if (archetype === "comparison-matrix") {
    const rows = Math.max(visualGrid?.rows || 0, clusterVisualNodesByAxis(structuralNodes, "y", Math.max(26, Number(box.h || 0) * 0.09)).length, 2);
    const columns = Math.max(visualGrid?.columns || 0, clusterVisualNodesByAxis(structuralNodes, "x", Math.max(36, Number(box.w || 0) * 0.08)).length, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "comparison-matrix",
      stepCount: Math.max(structuralNodes.length, rows * columns, 4),
      rows,
      columns,
      direction: "column-comparison",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "comparison-columns",
        ...(structuralNodes.length ? ["comparison-content-nodes"] : [])
      ]
    };
  }
  if (archetype === "heatmap-matrix") {
    const rows = Math.max(visualGrid?.rows || 0, clusterVisualNodesByAxis(structuralNodes, "y", Math.max(24, Number(box.h || 0) * 0.08)).length, 2);
    const columns = Math.max(visualGrid?.columns || 0, clusterVisualNodesByAxis(structuralNodes, "x", Math.max(30, Number(box.w || 0) * 0.07)).length, 2);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "heatmap-matrix",
      stepCount: Math.max(rows * columns, structuralNodes.length, 4),
      rows,
      columns,
      direction: "color-scale-grid",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(visualGrid ? ["visual-grid"] : []),
        "color-scale-cells",
        ...(structuralNodes.length ? ["heatmap-cell-nodes"] : [])
      ]
    };
  }
  if (archetype === "treemap-chart") {
    const treemapNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    const areas = treemapNodes.map((node) => boxArea(node.box || {})).filter((value) => value > 0);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "treemap",
      stepCount: Math.max(treemapNodes.length, 3),
      rows: Math.max(clusterVisualNodesByAxis(treemapNodes, "y", Math.max(28, Number(box.h || 0) * 0.09)).length, 1),
      columns: Math.max(clusterVisualNodesByAxis(treemapNodes, "x", Math.max(32, Number(box.w || 0) * 0.08)).length, 1),
      direction: "proportional-area-tiles",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "area-proportional-rectangles",
        ...(areas.length ? ["variable-area-tiles"] : [])
      ]
    };
  }
  if (archetype === "sankey-flow-chart") {
    const sankeyNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || []).filter((node) => node?.box && node?.center);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "sankey-flow",
      stepCount: Math.max(sankeyNodes.length, 3),
      rows: Math.max(clusterVisualNodesByAxis(sankeyNodes, "y", Math.max(28, Number(box.h || 0) * 0.09)).length, 1),
      columns: Math.max(clusterVisualNodesByAxis(sankeyNodes, "x", Math.max(42, Number(box.w || 0) * 0.11)).length, 2),
      direction: "weighted-source-to-target-flow",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "weighted-flow-bands",
        ...(sankeyNodes.length ? ["source-target-flow-nodes"] : [])
      ]
    };
  }
  if (archetype === "map-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "geo-map",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "geographic-region-composition",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "geographic-region-silhouette",
        "map-component-or-fidelity-crop"
      ]
    };
  }
  if (archetype === "word-cloud-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "word-cloud",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "weighted-keyword-size-cloud",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "weighted-keyword-cluster",
        "word-cloud-component-or-fidelity-crop"
      ]
    };
  }
  if (archetype === "machine-readable-code") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "machine-readable-code",
      stepCount: 1,
      rows: 1,
      columns: 1,
      direction: "scan-fidelity-raster",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "machine-readable-pattern",
        "preserve-exact-crop-for-scanability"
      ]
    };
  }
  if (archetype === "screenshot-annotation") {
    const atomKinds = countBy(visualAtoms, "kind");
    const overlayCount = connectorAtomCount(atomKinds)
      + (atomKinds["native-rect-candidate"] || 0)
      + (atomKinds["native-ellipse-candidate"] || 0)
      + (atomKinds["native-search-candidate"] || 0)
      + nodes.length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-annotation",
      stepCount: Math.max(overlayCount, 1),
      rows: 1,
      columns: Math.max(Math.min(overlayCount, 6), 1),
      direction: "base-crop-with-editable-overlays",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "base-screenshot-fidelity-crop",
        "editable-annotation-overlays"
      ]
    };
  }
  if (archetype === "screenshot-zoom-callout") {
    const atomKinds = countBy(visualAtoms, "kind");
    const overlayCount = connectorAtomCount(atomKinds)
      + (atomKinds["native-rect-candidate"] || 0)
      + (atomKinds["native-ellipse-candidate"] || 0)
      + (atomKinds["native-search-candidate"] || 0)
      + nodes.length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "screenshot-zoom-callout",
      stepCount: Math.max(overlayCount, 2),
      rows: 1,
      columns: 2,
      direction: "source-highlight-to-magnified-detail",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "medium",
      evidence: [
        "base-screenshot-fidelity-crop",
        "source-highlight-region",
        "magnified-detail-crop",
        "editable-zoom-connectors"
      ]
    };
  }
  if (archetype === "waterfall-chart") {
    const bars = (visualNodes || []).filter((node) => node?.box && node?.center);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "waterfall-chart",
      stepCount: Math.max(bars.length, 4),
      rows: 1,
      columns: Math.max(bars.length, 4),
      direction: "cumulative-positive-negative-bridge",
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "floating-variance-bars",
        ...(bars.length ? ["cumulative-step-bars"] : [])
      ]
    };
  }
  if (archetype === "gauge-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "gauge-chart",
      stepCount: Math.max((visualNodes || []).filter((node) => node?.box).length, 1),
      rows: 1,
      columns: 1,
      direction: "semi-circular-progress-dial",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "dial-progress-arc",
        "center-value-indicator"
      ]
    };
  }
  if (archetype === "radar-chart") {
    const axes = Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 5);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "radar-chart",
      stepCount: axes,
      rows: 1,
      columns: axes,
      direction: "radial-multi-axis-score-polygon",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "radial-score-axes",
        "multi-dimensional-score-polygon"
      ]
    };
  }
  if (archetype === "concentric-circles") {
    const rings = Math.max((visualNodes || []).filter((node) => node?.box).length, nodes.length, 3);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "concentric-circles",
      stepCount: rings,
      rows: 1,
      columns: rings,
      direction: "nested-layer-rings",
      connectorCount: visualConnectors.length,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "nested-concentric-rings",
        "layered-onion-model"
      ]
    };
  }
  if (visualGrid) {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "grid",
      stepCount: Number(visualGrid.rows || 0) * Number(visualGrid.columns || 0),
      rows: visualGrid.rows,
      columns: visualGrid.columns,
      direction: "grid",
      wholeGroupTemplatePriority: "high",
      evidence: ["visual-grid"]
    };
  }
  if (archetype === "cycle-loop") {
    const atomKinds = countBy(visualAtoms, "kind");
    const arcSegmentCount = atomKinds["native-arc-arrow-segment-candidate"] || 0;
    const cycleArrowCount = atomKinds["native-cycle-arrow-candidate"] || 0;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "cycle-loop",
      stepCount: Math.max(arcSegmentCount, cycleArrowCount, structuralNodes.length, 1),
      rows: 1,
      columns: 1,
      direction: "circular",
      connectorCount: Math.max(arcSegmentCount, cycleArrowCount, visualConnectors.length),
      regularSpacing: arcSegmentCount >= 4,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(arcSegmentCount ? ["arc-arrow-segments"] : []),
        ...(cycleArrowCount ? ["cycle-arrow-shape"] : []),
        ...(structuralNodes.length ? ["cycle-nodes"] : [])
      ]
    };
  }
  if (archetype === "funnel-lens-flow") {
    const atomKinds = countBy(visualAtoms, "kind");
    const lensNodeCount = (visualNodes || []).filter((node) => {
      const hint = String(node?.shapeHint || "").toLowerCase();
      return node?.box && (node.kind === "native-ellipse-candidate" || node.kind === "native-funnel-candidate" || /ellipse|circle|funnel|lens|search/.test(hint));
    }).length;
    const stepCount = Math.max(structuralNodes.length, lensNodeCount + Math.max(2, visualConnectors.length), 3);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "funnel-lens-flow",
      stepCount,
      rows: 1,
      columns: Math.max(3, Math.min(8, stepCount)),
      direction: "converge-focus-output",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        ...(lensNodeCount ? ["lens-or-funnel-node"] : []),
        ...(visualConnectors.length ? ["convergence-connectors"] : []),
        "analysis-flow"
      ]
    };
  }
  if (archetype === "fishbone-cause-effect") {
    const atomKinds = countBy(visualAtoms, "kind");
    const lineAtoms = (visualAtoms || []).filter((atom) => atom?.box && /connector-line-candidate|connector-arrow-candidate/.test(String(atom.kind || "")));
    const branchCount = lineAtoms.filter((atom) => {
      const hint = String(atom.shapeHint || "").toLowerCase();
      const atomBox = atom.box || {};
      const w = Number(atomBox.w || 0);
      const h = Number(atomBox.h || 0);
      return /diagonal|branch/.test(hint) || (w >= Number(box.w || 0) * 0.06 && h >= Number(box.h || 0) * 0.06 && w / Math.max(1, h) >= 0.35 && w / Math.max(1, h) <= 3.2);
    }).length;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "fishbone",
      stepCount: Math.max(branchCount, structuralNodes.length, 4),
      rows: 2,
      columns: Math.max(2, Math.ceil(Math.max(branchCount, 4) / 2)),
      direction: "spine-with-diagonal-causes",
      connectorCount: Math.max(lineAtoms.length, connectorAtomCount(atomKinds)),
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["main-spine", "diagonal-cause-branches", ...(structuralNodes.length ? ["cause-label-nodes"] : [])]
    };
  }
  if (archetype === "topology-diagram") {
    const atomKinds = countBy(visualAtoms, "kind");
    const topologyNodes = structuralNodes.length >= 3
      ? structuralNodes
      : (visualNodes || []).filter((node) => node?.box && node?.center);
    const xSpread = spread(topologyNodes.map((node) => node.center.x));
    const ySpread = spread(topologyNodes.map((node) => node.center.y));
    const compactTriangle = topologyNodes.length === 3
      && xSpread > Number(box.w || 0) * 0.22
      && ySpread > Number(box.h || 0) * 0.18;
    return {
      provider: "diagram-structure-signature-v1",
      layout: "topology",
      stepCount: Math.max(topologyNodes.length, 3),
      rows: ySpread > Number(box.h || 0) * 0.24 ? 2 : 1,
      columns: Math.max(3, clusterVisualNodesByAxis(topologyNodes, "x", Math.max(24, Number(box.w || 0) * 0.08)).length),
      direction: compactTriangle ? "triangular-closed-loop" : "network-links",
      connectorCount: Math.max(visualConnectors.length, connectorAtomCount(atomKinds)),
      regularSpacing: compactTriangle,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "topology-nodes",
        ...(compactTriangle ? ["triangle-layout"] : []),
        ...(visualConnectors.length || connectorAtomCount(atomKinds) ? ["topology-connectors"] : [])
      ]
    };
  }
  if (archetype === "layered-stack") {
    const layerNodeSource = structuralNodes.length >= 2 ? structuralNodes : (visualNodes || []);
    const layerNodes = layerNodeSource
      .filter((node) => node?.box)
      .filter((node) => /funnel|triangle|trapezoid|chevron|parallelogram|rect/.test(String(node.shapeHint || "").toLowerCase()) || node.kind === "native-funnel-candidate");
    const yClusters = clusterVisualNodesByAxis(layerNodes, "y", Math.max(18, Number(box.h || 0) * 0.08));
    const representativeLayers = yClusters.length >= 2
      ? yClusters.map((cluster) => cluster.nodes.sort((a, b) => Number(b.box?.w || 0) - Number(a.box?.w || 0))[0]).filter(Boolean)
      : layerNodes;
    const widths = representativeLayers
      .sort((a, b) => centerOf(a.box).y - centerOf(b.box).y)
      .map((node) => Number(node.box?.w || 0))
      .filter((value) => value > 0);
    const topW = widths[0] || 0;
    const bottomW = widths[widths.length - 1] || 0;
    const direction = bottomW > topW * 1.12 ? "pyramid-down"
      : topW > bottomW * 1.12 ? "funnel-down"
        : "layered";
    const layers = Math.max(yClusters.length, representativeLayers.length, structuralNodes.length, 1);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "layered-stack",
      stepCount: layers,
      rows: layers,
      columns: 1,
      direction,
      connectorCount: visualConnectors.length,
      regularSpacing: true,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["stacked-layers", ...(layerNodes.some((node) => node.kind === "native-funnel-candidate") ? ["funnel-shapes"] : [])]
    };
  }
  if (archetype === "venn-overlap") {
    const ellipseNodes = (visualNodes || [])
      .filter((node) => node?.box)
      .filter((node) => node.kind === "native-ellipse-candidate" || /ellipse|circle/.test(String(node.shapeHint || "").toLowerCase()));
    let overlapPairs = 0;
    for (let i = 0; i < ellipseNodes.length; i += 1) {
      for (let j = i + 1; j < ellipseNodes.length; j += 1) {
        if (Math.min(overlapRatio(ellipseNodes[i].box, ellipseNodes[j].box), overlapRatio(ellipseNodes[j].box, ellipseNodes[i].box)) >= 0.12) overlapPairs += 1;
      }
    }
    return {
      provider: "diagram-structure-signature-v1",
      layout: "venn-overlap",
      stepCount: Math.max(ellipseNodes.length, structuralNodes.length, 2),
      rows: 1,
      columns: Math.max(ellipseNodes.length, 2),
      direction: "overlapping-sets",
      connectorCount: overlapPairs,
      regularSpacing: false,
      spacingVariance: null,
      wholeGroupTemplatePriority: "high",
      evidence: ["overlapping-ellipses", ...(overlapPairs ? ["set-intersections"] : [])]
    };
  }
  if (archetype === "timeline-roadmap") {
    const timelineNodes = structuralNodes.length >= 3 ? structuralNodes : (visualNodes || [])
      .filter((node) => node?.box && node?.center)
      .sort((a, b) => a.center.x - b.center.x);
    const spacing = spacingProfile(timelineNodes.map((node) => node.center.x));
    const ySpread = spread(timelineNodes.map((node) => node.center.y));
    return {
      provider: "diagram-structure-signature-v1",
      layout: "timeline",
      stepCount: Math.max(timelineNodes.length, structuralNodes.length, 3),
      rows: ySpread > Math.max(58, Number(box.h || 0) * 0.18) ? 2 : 1,
      columns: Math.max(timelineNodes.length, structuralNodes.length, 3),
      direction: "left-to-right-milestones",
      connectorCount: visualConnectors.length,
      regularSpacing: spacing.regular,
      spacingVariance: spacing.variance,
      wholeGroupTemplatePriority: "high",
      evidence: ["milestone-nodes", ...(spacing.regular ? ["regular-spacing"] : []), ...(visualConnectors.length ? ["timeline-axis-or-connectors"] : [])]
    };
  }
  if (archetype === "gantt-roadmap") {
    const bars = (visualNodes || []).filter((node) => {
      const nodeBox = node?.box || {};
      const width = Number(nodeBox.w || 0);
      const height = Number(nodeBox.h || 0);
      return node?.box && width > height * 2;
    }).sort((a, b) => a.center.y - b.center.y);
    const rowClusters = clusterVisualNodesByAxis(bars, "y", Math.max(20, Number(box.h || 0) * 0.07));
    const xStarts = bars.map((node) => Number(node.box.x || 0));
    const widths = bars.map((node) => Number(node.box.w || 0));
    return {
      provider: "diagram-structure-signature-v1",
      layout: "gantt-roadmap",
      stepCount: Math.max(bars.length, rowClusters.length, 3),
      rows: Math.max(rowClusters.length, 3),
      columns: Math.max(clusterNodeCenters(bars, "x", Math.max(36, Number(box.w || 0) * 0.08)).length, 3),
      direction: "left-to-right-schedule-bars",
      connectorCount: visualConnectors.length,
      regularSpacing: spacingProfile(bars.map((node) => node.center.y)).regular,
      spacingVariance: spacingProfile(bars.map((node) => node.center.y)).variance,
      wholeGroupTemplatePriority: "high",
      evidence: [
        "schedule-bars",
        ...(spread(xStarts) ? ["staggered-starts"] : []),
        ...(spread(widths) ? ["variable-duration-bars"] : []),
        ...(visualConnectors.length ? ["timeline-axis-or-connectors"] : [])
      ]
    };
  }
  if (structuralNodes.length < 2) return null;
  const clustersX = clusterNodeCenters(structuralNodes, "x", Math.max(42, Number(box.w || 0) * 0.08));
  const clustersY = clusterNodeCenters(structuralNodes, "y", Math.max(34, Number(box.h || 0) * 0.11));
  const xSpread = spread(structuralNodes.map((node) => node.center.x));
  const ySpread = spread(structuralNodes.map((node) => node.center.y));
  const layout = inferSignatureLayout(archetype, structuralNodes, clustersX, clustersY, xSpread, ySpread);
  const direction = layout === "vertical-process" ? "top-to-bottom"
    : layout === "swimlane" ? "left-to-right-by-lane"
      : layout === "tree" ? "top-down-branching"
        : layout === "radial" ? "center-out"
          : "left-to-right";
  const spacing = layout === "vertical-process"
    ? spacingProfile(structuralNodes.map((node) => node.center.y))
    : spacingProfile(structuralNodes.map((node) => node.center.x));
  const connectorCount = visualConnectors.length;
  const stepCount = structuralNodes.length;
  const evidence = [];
  if (connectorCount > 0) evidence.push("visual-connectors");
  if (spacing.regular) evidence.push("regular-spacing");
  if (clustersY.length > 1) evidence.push("row-clusters");
  if (clustersX.length > 1) evidence.push("column-clusters");
  const wholeGroupTemplatePriority = ["linear-process", "vertical-process", "swimlane", "timeline", "tree", "radial"].includes(layout)
    && stepCount >= 3
    ? "high"
    : stepCount >= 3 ? "medium" : "low";
  return {
    provider: "diagram-structure-signature-v1",
    layout,
    stepCount,
    rows: clustersY.length,
    columns: clustersX.length,
    direction,
    connectorCount,
    regularSpacing: spacing.regular,
    spacingVariance: spacing.variance,
    wholeGroupTemplatePriority,
    evidence
  };
}

function compactVisualStructureNodes(visualNodes = [], regionBox = {}) {
  if (!Array.isArray(visualNodes) || visualNodes.length === 0) return [];
  const regionArea = Math.max(1, Number(regionBox.w || 0) * Number(regionBox.h || 0));
  const stepLike = visualNodes
    .filter((node) => node?.box && node?.center)
    .filter((node) => isStructureStepVisualNode(node, regionArea));
  const source = stepLike.length >= 2 ? stepLike : visualNodes.filter((node) => node?.box && node?.center);
  return source.filter((node) => !source.some((other) => {
    if (other === node || !other?.box || !node?.box) return false;
    const nodeArea = boxArea(node.box);
    const otherArea = boxArea(other.box);
    if (otherArea < nodeArea * 2.5) return false;
    return overlapRatio(node.box, other.box) >= 0.78 || boxCenterInside(node.box, other.box);
  }));
}

function isStructureStepVisualNode(node = {}, regionArea = 1) {
  const kind = String(node.kind || "");
  const shapeHint = String(node.shapeHint || "").toLowerCase();
  if (/scatter|donut-segment|pie-segment|cycle-arrow/.test(kind)) return false;
  if (/triangle|chevron|arc-arrow|line/.test(shapeHint)) return false;
  const areaRatio = boxArea(node.box || {}) / Math.max(1, regionArea);
  if (areaRatio >= 0.006) return true;
  return /screen|phone|document|cloud|cylinder|timeline|funnel|person|team/.test(shapeHint)
    && areaRatio >= 0.0025;
}

function inferSignatureLayout(archetype, nodes, clustersX, clustersY, xSpread, ySpread) {
  if (archetype === "tree-structure") return "tree";
  if (archetype === "cycle-loop") return "cycle-loop";
  if (archetype === "hub-spoke") return "radial";
  if (archetype === "swimlane-flow") return "swimlane";
  if (/timeline/.test(String(archetype || ""))) return "timeline";
  if (clustersY.length >= 2 && clustersY.some((cluster) => cluster.nodes.length >= 2)) return "swimlane";
  if (ySpread > xSpread * 1.15 && clustersX.length <= 2) return "vertical-process";
  if (nodes.length >= 3 && xSpread >= ySpread) return "linear-process";
  return "node-cluster";
}

function inferChartStructureSignature({ archetype = "", visualAtoms = [], visualNodes = [], box = {} } = {}) {
  const chartType = String(archetype || "");
  if (!/^(bar-chart|line-chart|scatter-chart|donut-chart|pie-chart)$/.test(chartType)) return null;
  const atomKinds = countBy(visualAtoms, "kind");
  const rectNodes = (visualNodes || []).filter((node) => {
    const kind = String(node?.kind || "");
    const hint = String(node?.shapeHint || "");
    return node?.box && (kind === "native-rect-candidate" || /rect|bar/.test(hint));
  });
  if (chartType === "bar-chart") {
    const verticalBars = rectNodes.filter((node) => {
      const nodeBox = node.box || {};
      const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
      return aspect >= 0.18 && aspect <= 1.25;
    });
    const horizontalBars = rectNodes.filter((node) => {
      const nodeBox = node.box || {};
      const aspect = Number(nodeBox.w || 0) / Math.max(1, Number(nodeBox.h || 0));
      return aspect >= 1.35 && aspect <= 16;
    });
    const stacked = horizontalBars.length >= 6 && clusterNodeCenters(horizontalBars, "y", Math.max(18, Number(box.h || 0) * 0.07)).length >= 2;
    const direction = stacked ? "stacked-horizontal-bars"
      : horizontalBars.length > verticalBars.length ? "horizontal-bars"
        : "vertical-bars";
    const stepCount = Math.max(verticalBars.length, horizontalBars.length, rectNodes.length);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "bar-chart",
      stepCount,
      rows: direction === "stacked-horizontal-bars" ? clusterNodeCenters(horizontalBars, "y", Math.max(18, Number(box.h || 0) * 0.07)).length : 1,
      columns: stepCount,
      direction,
      connectorCount: connectorAtomCount(atomKinds),
      regularSpacing: stepCount >= 3,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-bars", ...(connectorAtomCount(atomKinds) ? ["chart-axis"] : [])]
    };
  }
  if (chartType === "line-chart") {
    const lineSegments = (visualAtoms || []).filter((atom) => atom?.kind === "connector-line-candidate" && atom?.shapeHint === "line-diagonal" && atom.lineEndpoints);
    const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "line-chart",
      stepCount: Math.max(points.length, lineSegments.length + 1),
      rows: 1,
      columns: Math.max(points.length, lineSegments.length + 1),
      direction: "trend-line",
      connectorCount: lineSegments.length,
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-line-segments", ...(points.length ? ["chart-points"] : [])]
    };
  }
  if (chartType === "scatter-chart") {
    const points = (visualAtoms || []).filter((atom) => atom?.kind === "native-scatter-point-candidate" && atom.box);
    return {
      provider: "diagram-structure-signature-v1",
      layout: "scatter-chart",
      stepCount: points.length,
      rows: 1,
      columns: points.length,
      direction: "point-cloud",
      connectorCount: connectorAtomCount(atomKinds),
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: ["chart-points", ...(connectorAtomCount(atomKinds) ? ["chart-axis"] : [])]
    };
  }
  const donutSegments = (visualAtoms || []).filter((atom) => ["native-donut-segment-candidate", "native-pie-segment-candidate"].includes(atom?.kind) && atom.box);
  const donutRings = (visualAtoms || []).filter((atom) => atom?.kind === "native-donut-candidate" && atom.box);
  const stepCount = Math.max(donutSegments.length, donutRings.length);
  if (chartType === "pie-chart") {
    return {
      provider: "diagram-structure-signature-v1",
      layout: "pie-chart",
      stepCount,
      rows: 1,
      columns: stepCount,
      direction: donutSegments.length >= 2 ? "segmented-pie" : "pie",
      connectorCount: 0,
      regularSpacing: false,
      wholeGroupTemplatePriority: "high",
      evidence: [donutSegments.length >= 2 ? "chart-pie-segments" : "chart-pie"]
    };
  }
  return {
    provider: "diagram-structure-signature-v1",
    layout: "donut-chart",
    stepCount,
    rows: 1,
    columns: stepCount,
    direction: donutSegments.length >= 2 ? "segmented-ring" : "ring",
    connectorCount: 0,
    regularSpacing: false,
    wholeGroupTemplatePriority: "high",
    evidence: [donutSegments.length >= 2 ? "chart-donut-segments" : "chart-donut-rings"]
  };
}

function clusterNodeCenters(nodes = [], axis = "x", tolerance = 40) {
  const entries = nodes
    .map((node) => ({ node, value: Number(node.center?.[axis] || 0) }))
    .sort((a, b) => a.value - b.value);
  const clusters = [];
  for (const entry of entries) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(entry.value - last.center) > tolerance) {
      clusters.push({ center: entry.value, nodes: [entry.node] });
    } else {
      last.nodes.push(entry.node);
      last.center = average(last.nodes.map((node) => Number(node.center?.[axis] || 0)));
    }
  }
  return clusters;
}

function spacingProfile(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length < 3) return { regular: false, variance: null };
  const gaps = [];
  for (let index = 1; index < sorted.length; index += 1) gaps.push(sorted[index] - sorted[index - 1]);
  const avg = average(gaps);
  const variance = average(gaps.map((gap) => Math.abs(gap - avg))) / Math.max(1, avg);
  return {
    regular: variance <= 0.18,
    variance: round(variance)
  };
}

function spread(values = []) {
  const finite = values.filter(Number.isFinite);
  if (finite.length === 0) return 0;
  return Math.max(...finite) - Math.min(...finite);
}

function inferVisualGridStructure(visualAtoms = [], regionBox = {}) {
  const gridLines = (visualAtoms || []).filter((atom) => atom?.kind === "grid-line-candidate" && atom.box);
  if (gridLines.length < 4) return null;
  const horizontal = clusterGridLines(gridLines.filter((atom) => atom.axis === "h" || atom.shapeHint === "grid-line-horizontal"), "h");
  const vertical = clusterGridLines(gridLines.filter((atom) => atom.axis === "v" || atom.shapeHint === "grid-line-vertical"), "v");
  if (horizontal.length < 2 || vertical.length < 2) return null;
  const xLines = vertical.map((line) => line.position).sort((a, b) => a - b);
  const yLines = horizontal.map((line) => line.position).sort((a, b) => a - b);
  const bounds = {
    x: round(Math.min(...xLines)),
    y: round(Math.min(...yLines)),
    w: round(Math.max(...xLines) - Math.min(...xLines)),
    h: round(Math.max(...yLines) - Math.min(...yLines))
  };
  if (bounds.w < Math.max(80, Number(regionBox.w || 0) * 0.22) || bounds.h < Math.max(50, Number(regionBox.h || 0) * 0.18)) return null;
  const coverageRatio = round((bounds.w * bounds.h) / Math.max(1, Number(regionBox.w || 0) * Number(regionBox.h || 0)));
  if (coverageRatio < 0.12) return null;
  const stroke = dominantValue(gridLines.map((atom) => atom.color).filter(Boolean)) || "#8A8F98";
  return {
    provider: "visual-grid-structure-v1",
    rows: Math.max(1, yLines.length - 1),
    columns: Math.max(1, xLines.length - 1),
    xLines: xLines.map(round),
    yLines: yLines.map(round),
    bounds,
    coverageRatio,
    lineCount: horizontal.length + vertical.length,
    stroke
  };
}

function clusterGridLines(lines = [], axis) {
  const tolerance = axis === "h" ? 5 : 5;
  const entries = lines
    .map((atom) => {
      const box = atom.box || {};
      const position = axis === "h"
        ? Number(box.y || 0) + Number(box.h || 0) / 2
        : Number(box.x || 0) + Number(box.w || 0) / 2;
      const span = axis === "h" ? Number(box.w || 0) : Number(box.h || 0);
      return { atom, position, span };
    })
    .filter((entry) => Number.isFinite(entry.position) && entry.span > 0)
    .sort((a, b) => a.position - b.position);
  const clusters = [];
  for (const entry of entries) {
    const last = clusters[clusters.length - 1];
    if (!last || Math.abs(entry.position - last.position) > tolerance) {
      clusters.push({ entries: [entry], position: entry.position, span: entry.span });
    } else {
      last.entries.push(entry);
      const totalSpan = last.entries.reduce((sum, item) => sum + item.span, 0);
      last.position = last.entries.reduce((sum, item) => sum + item.position * item.span, 0) / Math.max(1, totalSpan);
      last.span = Math.max(last.span, entry.span);
    }
  }
  return clusters.map((cluster) => ({
    position: round(cluster.position),
    span: round(cluster.span),
    atoms: cluster.entries.map((entry) => entry.atom.id).filter(Boolean)
  }));
}

function dominantValue(values = []) {
  const counts = new Map();
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

module.exports = {
  inferStructureSignature,
  compactVisualStructureNodes,
  isStructureStepVisualNode,
  inferSignatureLayout,
  inferChartStructureSignature,
  clusterNodeCenters,
  spacingProfile,
  spread,
  inferVisualGridStructure,
  clusterGridLines,
  dominantValue
};
