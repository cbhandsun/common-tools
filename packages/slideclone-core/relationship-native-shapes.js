"use strict";
const { nativeSource, roundedBox, safeColor, safeId, round, lineBox, cycleDonutSegmentPoints, cyclePointOnBox } = require("./relationship-native-geometry");

function flowNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-flow-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-flow-node", { nodeIndex: index })
  };
}

function concentricLayerShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index === 0 ? "#DBEAFE" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-concentric-layer-${index}`,
    type: "ellipse",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-concentric-layer", {
      layerIndex: index,
      layerCount: atom.concentricLayerCount || null
    })
  };
}

function quadrantPanelShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index % 3 === 0 ? "#DBEAFE" : "#BFDBFE");
  return {
    id: `${safeId(image.id)}-relationship-quadrant-panel-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-quadrant-panel", {
      row: atom.quadrantRow,
      column: atom.quadrantColumn
    })
  };
}

function quadrantAxisShape(image = {}, atom = {}, axis, understanding = {}) {
  const box = atom.box;
  const line = axis === "h"
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    id: `${safeId(image.id)}-relationship-quadrant-axis-${axis}`,
    type: "line",
    box: roundedBox(line),
    style: {
      stroke: safeColor(atom.color, "#64748B"),
      strokeWidthPt: round(Math.max(1, Math.min(5, axis === "h" ? box.h : box.w))),
      connectorType: "straight"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-quadrant-axis", { axis })
  };
}

function comparisonCellShape(image = {}, cell = {}, index = 0, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-comparison-cell-${index}`,
    type: "rect",
    box: roundedBox(cell.box),
    style: { fill: safeColor(cell.fill, "#FFFFFF"), stroke: safeColor(cell.fill, "#FFFFFF"), strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, cell, understanding, "visual-relationship-native-comparison-cell", { row: cell.row, column: cell.column })
  };
}

function comparisonGridLineShape(image = {}, box = {}, axis, index, stroke, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-comparison-grid-${axis}-${index}`,
    type: "line",
    box: roundedBox(box),
    style: { stroke, strokeWidthPt: 1.5, connectorType: "straight" },
    source: nativeSource(image, {}, understanding, "visual-relationship-native-comparison-grid-line", { axis, lineIndex: index })
  };
}

function timelineAxisShape(image = {}, atom = {}, centerY, strokeWidth, color, understanding = {}) {
  return {
    id: `${safeId(image.id)}-relationship-timeline-axis`,
    type: "line",
    box: roundedBox({ x: atom.box.x, y: centerY, w: atom.box.w, h: 0 }),
    style: { stroke: color, strokeWidthPt: round(strokeWidth), connectorType: "straight" },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-timeline-axis", { part: "axis" })
  };
}

function timelineMilestoneShape(image = {}, atom = {}, milestone = {}, centerY, color, index, understanding = {}) {
  const size = Math.min(Number(atom.box?.h || milestone.widthPt), Number(milestone.widthPt) + 2);
  return {
    id: `${safeId(image.id)}-relationship-timeline-milestone-${index}`,
    type: "ellipse",
    box: roundedBox({ x: milestone.x - size / 2, y: centerY - size / 2, w: size, h: size }),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-timeline-milestone", { part: "milestone", milestoneIndex: index })
  };
}

function branchCardNodeShape(image = {}, atom = {}, index, isSource, understanding = {}) {
  const shape = topologyNodeShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-branch-card-node-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-branch-card-node", {
      nodeIndex: index,
      role: isSource ? "source" : "target",
      nodeKind: atom.kind
    })
  };
}

function branchCardCurveShape(image = {}, atom = {}, curve = {}, index, measured = {}, understanding = {}) {
  const points = Array.isArray(curve.points) ? curve.points.map((point) => ({ x: Number(point.x), y: Number(point.y) })) : [];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const box = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(1, Math.max(...xs) - Math.min(...xs)),
    h: Math.max(1, Math.max(...ys) - Math.min(...ys))
  };
  const normalize = (point) => ({
    x: round((point.x - box.x) / box.w),
    y: round((point.y - box.y) / box.h)
  });
  const segments = [{ type: "moveTo", points: [normalize(points[0])] }];
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    const p0 = points[Math.max(0, pointIndex - 1)];
    const p1 = points[pointIndex];
    const p2 = points[pointIndex + 1];
    const p3 = points[Math.min(points.length - 1, pointIndex + 2)];
    segments.push({
      type: "cubicBezTo",
      points: [
        normalize({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }),
        normalize({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }),
        normalize(p2)
      ]
    });
  }
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const thickness = Math.max(1.2, Math.min(8, horizontal ? Number(atom.box?.h || 2) : Number(atom.box?.w || 2)));
  return {
    id: `${safeId(image.id)}-relationship-branch-card-connector-${index}`,
    type: "freeform",
    box: roundedBox(box),
    points: points.map(normalize),
    style: {
      fill: "none",
      stroke: safeColor(measured.routeColor || atom.color, "#2563EB"),
      strokeWidthPt: round(thickness),
      lineCap: "round",
      freeformSegments: segments,
      ...connectorArrowStyle(atom)
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-branch-card-connector", {
      connectorIndex: index,
      measurementMode: "pixel-anchor-centerline",
      measurementConfidence: round(curve.confidence),
      routeColor: measured.routeColor || null,
      routeColorMode: measured.routeColorMode || null,
      routeColorConfidence: Number.isFinite(Number(measured.routeColorConfidence)) ? round(measured.routeColorConfidence) : null,
      branchDirection: measured.direction || null
    })
  };
}

function hubSpokeNodeShape(image = {}, atom = {}, index, isHub, understanding = {}) {
  const color = safeColor(atom.color, isHub ? "#2563EB" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-hub-spoke-node-${index}`,
    type: atom.kind === "native-ellipse-candidate" ? "ellipse" : "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-hub-spoke-node", { nodeIndex: index, role: isHub ? "hub" : "spoke" })
  };
}

function hubSpokeConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const horizontal = atom.box.w >= atom.box.h;
  const box = horizontal
    ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
    : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  return {
    id: `${safeId(image.id)}-relationship-hub-spoke-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, horizontal ? atom.box.h : atom.box.w))),
      connectorType: "straight",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-hub-spoke-connector", { connectorIndex: index })
  };
}

function topologyNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const typeByKind = {
    "native-ellipse-candidate": "ellipse",
    "native-diamond-candidate": "diamond",
    "native-triangle-candidate": "triangle",
    "native-chevron-candidate": "chevron",
    "native-parallelogram-candidate": "parallelogram",
    "native-cylinder-candidate": "cylinder",
    "native-cloud-candidate": "cloud",
    "native-document-candidate": "document",
    "native-screen-candidate": "rect",
    "native-phone-candidate": "roundRect"
  };
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-topology-node-${index}`,
    type: typeByKind[atom.kind] || "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-topology-node", { nodeIndex: index, nodeKind: atom.kind })
  };
}

function topologyConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const measuredFrom = atom?.lineEndpoints?.from;
  const measuredTo = atom?.lineEndpoints?.to;
  const hasMeasuredEndpoints = [measuredFrom?.x, measuredFrom?.y, measuredTo?.x, measuredTo?.y].every((value) => Number.isFinite(Number(value)));
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const box = hasMeasuredEndpoints
    ? lineBox(measuredFrom, measuredTo)
    : horizontal
      ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
      : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  const thickness = hasMeasuredEndpoints
    ? Math.max(1.2, Math.min(6, Math.min(Number(atom.box?.w || 0), Number(atom.box?.h || 0)) * 0.42))
    : Math.max(1.2, Math.min(6, horizontal ? Number(atom.box?.h || 0) : Number(atom.box?.w || 0)));
  return {
    id: `${safeId(image.id)}-relationship-topology-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(thickness),
      connectorType: "straight",
      lineCap: "round",
      ...connectorArrowStyle(atom)
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-topology-connector", { connectorIndex: index, measuredEndpoints: hasMeasuredEndpoints })
  };
}

function connectorArrowStyle(atom = {}) {
  if (atom.kind !== "connector-arrow-candidate") return {};
  return atom.arrowDirection === "left" || atom.arrowDirection === "up"
    ? { startArrow: "triangle" }
    : { endArrow: "triangle" };
}

function measuredGenericNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const shape = topologyNodeShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-generic-node-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-generic-node", {
      nodeIndex: index,
      nodeKind: atom.kind
    })
  };
}

function measuredGenericConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const shape = topologyConnectorShape(image, atom, index, understanding);
  return {
    ...shape,
    id: `${safeId(image.id)}-relationship-generic-connector-${index}`,
    source: nativeSource(image, atom, understanding, "visual-relationship-native-generic-connector", {
      connectorIndex: index,
      measuredEndpoints: true
    })
  };
}

function funnelLensNodeShape(image = {}, atom = {}, index, role, understanding = {}) {
  const typeByKind = {
    "native-ellipse-candidate": "ellipse",
    "native-diamond-candidate": "diamond",
    "native-chevron-candidate": "chevron",
    "native-parallelogram-candidate": "parallelogram",
    "native-document-candidate": "document"
  };
  const color = safeColor(atom.color, role === "focus-content" ? "#EFF6FF" : "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-funnel-lens-${role}-${index}`,
    type: typeByKind[atom.kind] || "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-node", {
      nodeIndex: index,
      role
    })
  };
}

function funnelLensConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const from = atom?.lineEndpoints?.from;
  const to = atom?.lineEndpoints?.to;
  const measured = [from?.x, from?.y, to?.x, to?.y].every((value) => Number.isFinite(Number(value)));
  const horizontal = Number(atom.box?.w || 0) >= Number(atom.box?.h || 0);
  const box = measured
    ? lineBox(from, to)
    : horizontal
      ? { x: atom.box.x, y: atom.box.y + atom.box.h / 2, w: atom.box.w, h: 0 }
      : { x: atom.box.x + atom.box.w / 2, y: atom.box.y, w: 0, h: atom.box.h };
  const thickness = measured
    ? Math.max(1.2, Math.min(6, Math.min(Number(atom.box?.w || 0), Number(atom.box?.h || 0)) * 0.42))
    : Math.max(1.2, Math.min(6, horizontal ? Number(atom.box?.h || 0) : Number(atom.box?.w || 0)));
  return {
    id: `${safeId(image.id)}-relationship-funnel-lens-connector-${index}`,
    type: "line",
    box: roundedBox(box),
    style: {
      stroke: safeColor(atom.color, "#60A5FA"),
      strokeWidthPt: round(thickness),
      connectorType: "straight",
      lineCap: "round",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-connector", {
      connectorIndex: index,
      measuredEndpoints: measured
    })
  };
}

function funnelLensFocusShapes(image = {}, atom = {}, understanding = {}) {
  const color = safeColor(atom.color, "#2563EB");
  if (atom.kind === "native-funnel-candidate") {
    return [{
      id: `${safeId(image.id)}-relationship-funnel-lens-focus`,
      type: "funnel",
      box: roundedBox(atom.box),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "funnel" })
    }];
  }
  if (atom.kind === "native-donut-candidate") {
    return [{
      id: `${safeId(image.id)}-relationship-funnel-lens-focus`,
      type: "donut",
      box: roundedBox(atom.box),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "lens" })
    }];
  }
  const box = atom.box;
  const lensSize = Math.min(Number(box.w || 0) * 0.7, Number(box.h || 0) * 0.7);
  const lensBox = {
    x: Number(box.x || 0),
    y: Number(box.y || 0),
    w: lensSize,
    h: lensSize
  };
  const handleStart = { x: lensBox.x + lensBox.w * 0.68, y: lensBox.y + lensBox.h * 0.68 };
  const handleEnd = {
    x: Number(box.x || 0) + Number(box.w || 0) * 0.96,
    y: Number(box.y || 0) + Number(box.h || 0) * 0.96
  };
  const strokeWidth = round(Math.max(2, Math.min(24, Math.min(Number(box.w || 0), Number(box.h || 0)) * 0.12)));
  return [
    {
      id: `${safeId(image.id)}-relationship-funnel-lens-focus-lens`,
      type: "donut",
      box: roundedBox(lensBox),
      style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 0.98 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "lens" })
    },
    {
      id: `${safeId(image.id)}-relationship-funnel-lens-focus-handle`,
      type: "line",
      box: roundedBox(lineBox(handleStart, handleEnd)),
      style: { stroke: color, strokeWidthPt: strokeWidth, connectorType: "straight", lineCap: "round", opacity: 0.98 },
      source: nativeSource(image, atom, understanding, "visual-relationship-native-funnel-lens-focus", { role: "focus", part: "handle" })
    }
  ];
}

function vennEllipseShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, index % 2 === 0 ? "#60A5FA" : "#34D399");
  return {
    id: `${safeId(image.id)}-relationship-venn-ellipse-${index}`,
    type: "ellipse",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-venn-ellipse", {
      setIndex: index,
      observedBox: roundedBox(atom.vennObservedBox),
      recoveryConfidence: round(atom.vennRecoveryConfidence)
    })
  };
}

function vennSupplementaryShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-venn-supplementary-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-venn-supplementary", {
      supplementaryIndex: index
    })
  };
}

function sankeyNodeShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#334155");
  return {
    id: `${safeId(image.id)}-relationship-sankey-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-sankey-node", {
      nodeIndex: index
    })
  };
}

function sankeyBandShape(image = {}, atom = {}, attachment = {}, index, understanding = {}) {
  const band = atom.sankeyBand;
  const box = {
    x: band.sourceX,
    y: Math.min(band.sourceTop, band.targetTop),
    w: band.targetX - band.sourceX,
    h: Math.max(band.sourceBottom, band.targetBottom) - Math.min(band.sourceTop, band.targetTop)
  };
  const safeHeight = Math.max(0.1, box.h);
  const y = (value) => round((Number(value || 0) - box.y) / safeHeight);
  const sourceTop = y(band.sourceTop);
  const sourceBottom = y(band.sourceBottom);
  const targetTop = y(band.targetTop);
  const targetBottom = y(band.targetBottom);
  const freeformSegments = [
    { type: "moveTo", points: [{ x: 0, y: sourceTop }] },
    { type: "cubicBezTo", points: [{ x: 0.42, y: sourceTop }, { x: 0.58, y: targetTop }, { x: 1, y: targetTop }] },
    { type: "lnTo", points: [{ x: 1, y: targetBottom }] },
    { type: "cubicBezTo", points: [{ x: 0.58, y: targetBottom }, { x: 0.42, y: sourceBottom }, { x: 0, y: sourceBottom }] },
    { type: "close", points: [] }
  ];
  const color = safeColor(atom.color, "#93C5FD");
  return {
    id: `${safeId(image.id)}-relationship-sankey-band-${index}`,
    type: "freeform",
    box: roundedBox(box),
    points: [{ x: 0, y: sourceTop }, { x: 1, y: targetTop }, { x: 1, y: targetBottom }, { x: 0, y: sourceBottom }],
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0,
      opacity: 1,
      closePath: true,
      freeformSegments
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-sankey-band", {
      bandIndex: index,
      sourceNodeId: attachment.source.id,
      targetNodeId: attachment.target.id,
      sourceThickness: round(band.sourceThickness),
      targetThickness: round(band.targetThickness),
      geometryConfidence: round(band.confidence)
    })
  };
}

function swimlaneNodeShape(image = {}, atom = {}, laneIndex, laneColumn, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-swimlane-node-${laneIndex}-${laneColumn}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-swimlane-node", { laneIndex, laneColumn })
  };
}

function layeredStackShape(image = {}, atom = {}, index, understanding = {}) {
  const color = safeColor(atom.color, "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-layered-stack-${index}`,
    type: atom.kind === "native-funnel-candidate" ? "funnel" : "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-layered-stack-layer", {
      layerIndex: index,
      layerCount: Number(understanding.structureSignature?.stepCount || 0) || null
    })
  };
}

function cycleLoopSegmentShapes(image = {}, atom = {}, angle = {}, index, understanding = {}) {
  const parentBox = roundedBox(atom.donutParentBox);
  const color = safeColor(atom.color, "#38BDF8");
  const source = nativeSource(image, atom, understanding, "visual-relationship-native-cycle-loop-segment", {
    segmentIndex: index,
    startDeg: angle.startDeg,
    endDeg: angle.endDeg
  });
  const shapes = [{
    id: `${safeId(image.id)}-relationship-cycle-loop-segment-${index}`,
    type: "freeform",
    box: parentBox,
    points: cycleDonutSegmentPoints(angle.startDeg, angle.endDeg, 0.62),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: { ...source, part: "arc" }
  }];
  if (atom.arcArrowHead !== true) return shapes;
  const headSize = Math.max(10, Math.min(28, Math.max(parentBox.w, parentBox.h) * 0.16));
  const endpoint = cyclePointOnBox(parentBox, angle.endDeg, Math.max(parentBox.w, parentBox.h) * 0.48);
  shapes.push({
    id: `${safeId(image.id)}-relationship-cycle-loop-head-${index}`,
    type: "freeform",
    box: roundedBox({ x: endpoint.x - headSize / 2, y: endpoint.y - headSize / 2, w: headSize, h: headSize }),
    points: [{ x: 1, y: 0.5 }, { x: 0, y: 0 }, { x: 0, y: 1 }],
    style: { fill: color, stroke: color, strokeWidthPt: 0, rotation: round(angle.endDeg), opacity: 1 },
    source: { ...source, part: "arrowhead" }
  });
  return shapes;
}

function swimlaneConnectorShape(image = {}, atom = {}, index, understanding = {}) {
  const centerY = atom.box.y + atom.box.h / 2;
  return {
    id: `${safeId(image.id)}-relationship-swimlane-connector-${index}`,
    type: "line",
    box: roundedBox({ x: atom.box.x, y: centerY, w: atom.box.w, h: 0 }),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, atom.box.h))),
      connectorType: "straight",
      ...(atom.kind === "connector-arrow-candidate" ? { endArrow: "triangle" } : {})
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-swimlane-connector", { connectorIndex: index })
  };
}

function flowConnectorShape(image = {}, fromAtom = {}, toAtom = {}, bridgeAtom = null, index = 0, understanding = {}) {
  const from = fromAtom.box;
  const to = toAtom.box;
  const y = ((from.y + from.h / 2) + (to.y + to.h / 2)) / 2;
  const stroke = safeColor(bridgeAtom?.color, "#94A3B8");
  const thickness = bridgeAtom?.box
    ? Math.max(1.2, Math.min(5, Number(bridgeAtom.box.h || 2) * 0.42))
    : 1.8;
  return {
    id: `${safeId(image.id)}-relationship-flow-connector-${index}`,
    type: "line",
    box: roundedBox({ x: from.x + from.w, y, w: to.x - (from.x + from.w), h: 0 }),
    style: { stroke, strokeWidthPt: round(thickness), connectorType: "straight", endArrow: "triangle", lineCap: "round" },
    source: nativeSource(image, bridgeAtom || fromAtom, understanding, "visual-relationship-native-flow-connector", { connectorIndex: index })
  };
}

function treeNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, index === 0 ? "#2563EB" : "#60A5FA");
  return {
    id: `${safeId(image.id)}-relationship-tree-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-tree-node", { nodeIndex: index })
  };
}

function treeConnectorShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const box = atom.box;
  const horizontal = box.w >= box.h;
  const lineBox = horizontal
    ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
    : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h };
  return {
    id: `${safeId(image.id)}-relationship-tree-connector-${index}`,
    type: "line",
    box: roundedBox(lineBox),
    style: {
      stroke: safeColor(atom.color, "#94A3B8"),
      strokeWidthPt: round(Math.max(1, Math.min(6, horizontal ? box.h : box.w))),
      connectorType: "straight"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-tree-connector", { connectorIndex: index })
  };
}

function fishboneNodeShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const color = safeColor(atom.color, "#DBEAFE");
  return {
    id: `${safeId(image.id)}-relationship-fishbone-node-${index}`,
    type: "rect",
    box: roundedBox(atom.box),
    style: { fill: color, stroke: color, strokeWidthPt: 0, opacity: 1 },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-node", { nodeIndex: index })
  };
}

function fishboneSpineShape(image = {}, atom = {}, understanding = {}) {
  const from = atom.lineEndpoints?.from || { x: atom.box.x, y: atom.box.y + atom.box.h / 2 };
  const to = atom.lineEndpoints?.to || { x: atom.box.x + atom.box.w, y: atom.box.y + atom.box.h / 2 };
  return {
    id: `${safeId(image.id)}-relationship-fishbone-spine`,
    type: "line",
    box: lineBox(from, to),
    style: {
      stroke: safeColor(atom.color, "#2563EB"),
      strokeWidthPt: round(Math.max(1.5, Math.min(8, atom.box.h))),
      connectorType: "straight",
      endArrow: "triangle",
      lineCap: "round"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-spine")
  };
}

function fishboneBranchShape(image = {}, atom = {}, index = 0, understanding = {}) {
  const from = atom.lineEndpoints.from;
  const to = atom.lineEndpoints.to;
  const thickness = Number(atom.pixelBox?.w || 0) > 0
    ? Math.min(Number(atom.pixelBox.w || 1), Number(atom.pixelBox.h || 1))
    : Math.min(Number(atom.box.w || 1), Number(atom.box.h || 1));
  return {
    id: `${safeId(image.id)}-relationship-fishbone-branch-${index}`,
    type: "line",
    box: lineBox(from, to),
    style: {
      stroke: safeColor(atom.color, "#2563EB"),
      strokeWidthPt: round(Math.max(1.5, Math.min(7, thickness * 0.11))),
      connectorType: "straight",
      lineCap: "round"
    },
    source: nativeSource(image, atom, understanding, "visual-relationship-native-fishbone-connector", { connectorIndex: index })
  };
}

module.exports = { flowNodeShape, concentricLayerShape, quadrantPanelShape, quadrantAxisShape, comparisonCellShape, comparisonGridLineShape, timelineAxisShape, timelineMilestoneShape, branchCardNodeShape, branchCardCurveShape, hubSpokeNodeShape, hubSpokeConnectorShape, topologyNodeShape, topologyConnectorShape, connectorArrowStyle, measuredGenericNodeShape, measuredGenericConnectorShape, funnelLensNodeShape, funnelLensConnectorShape, funnelLensFocusShapes, vennEllipseShape, vennSupplementaryShape, sankeyNodeShape, sankeyBandShape, swimlaneNodeShape, layeredStackShape, cycleLoopSegmentShapes, swimlaneConnectorShape, flowConnectorShape, treeNodeShape, treeConnectorShape, fishboneNodeShape, fishboneSpineShape, fishboneBranchShape };
