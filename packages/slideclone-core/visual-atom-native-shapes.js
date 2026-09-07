"use strict";
const {applyPluginChartStyleToVisualAtomShape, isVisualChartLegendMarker, donutSegmentFreeformPoints, normalizedDonutSegmentAngles, normalizeDegrees, visualChartLegendMarkerIndex, pieSegmentFreeformPoints} = require("./native-chart-shell-shapes");
const {round, darkerHex} = require("./raster-native-detection");
const {clampPtBoxToSlide} = require("./structured-residual-splitting");
const {lineBox} = require("./workflow-shape-primitives");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function visualAtomNativeShape(image, atom, index, understanding = {}) {
  let shape;
  if (isVisualChartLegendMarker(image, atom, understanding)) {
    shape = visualAtomLegendMarkerShape(image, atom, index, understanding);
  } else if (atom.kind === "connector-line-candidate" || atom.kind === "connector-arrow-candidate" || atom.kind === "grid-line-candidate") {
    shape = visualAtomConnectorShape(image, atom, index, understanding);
  } else if (atom.kind === "native-ellipse-candidate") {
    shape = visualAtomEllipseShape(image, atom, index);
  } else if (atom.kind === "native-scatter-point-candidate") {
    shape = visualAtomScatterPointShape(image, atom, index);
  } else if (atom.kind === "native-diamond-candidate") {
    shape = visualAtomDiamondShape(image, atom, index);
  } else if (atom.kind === "native-triangle-candidate") {
    shape = visualAtomTriangleShape(image, atom, index);
  } else if (atom.kind === "native-chevron-candidate") {
    shape = visualAtomChevronShape(image, atom, index);
  } else if (atom.kind === "native-parallelogram-candidate") {
    shape = visualAtomParallelogramShape(image, atom, index);
  } else if (atom.kind === "native-cylinder-candidate") {
    shape = visualAtomCylinderShape(image, atom, index);
  } else if (atom.kind === "native-cloud-candidate") {
    shape = visualAtomCloudShape(image, atom, index);
  } else if (atom.kind === "native-document-candidate") {
    shape = visualAtomDocumentShape(image, atom, index);
  } else if (atom.kind === "native-folder-candidate") {
    shape = visualAtomFolderShape(image, atom, index);
  } else if (atom.kind === "native-screen-candidate") {
    shape = visualAtomScreenShape(image, atom, index);
  } else if (atom.kind === "native-phone-candidate") {
    shape = visualAtomPhoneShape(image, atom, index);
  } else if (atom.kind === "native-person-candidate") {
    shape = visualAtomPersonShapes(image, atom, index);
  } else if (atom.kind === "native-team-candidate") {
    shape = visualAtomTeamShapes(image, atom, index);
  } else if (atom.kind === "native-gear-candidate") {
    shape = visualAtomGearShapes(image, atom, index);
  } else if (atom.kind === "native-search-candidate") {
    shape = visualAtomSearchShapes(image, atom, index);
  } else if (atom.kind === "native-shield-candidate") {
    shape = visualAtomShieldShape(image, atom, index);
  } else if (atom.kind === "native-timeline-candidate") {
    shape = visualAtomTimelineShapes(image, atom, index);
  } else if (atom.kind === "native-funnel-candidate") {
    shape = visualAtomFunnelShape(image, atom, index);
  } else if (atom.kind === "native-cycle-arrow-candidate") {
    shape = visualAtomCycleArrowShape(image, atom, index);
  } else if (atom.kind === "native-right-arrow-candidate") {
    shape = visualAtomRightArrowShape(image, atom, index);
  } else if (atom.kind === "native-donut-candidate") {
    shape = visualAtomDonutShape(image, atom, index, understanding);
  } else if (atom.kind === "native-donut-segment-candidate") {
    shape = visualAtomDonutSegmentShape(image, atom, index, understanding);
  } else if (atom.kind === "native-pie-segment-candidate") {
    shape = visualAtomPieSegmentShape(image, atom, index, understanding);
  } else if (atom.kind === "native-arc-arrow-segment-candidate") {
    shape = visualAtomArcArrowSegmentShapes(image, atom, index, understanding);
  } else if (atom.kind === "native-return-loop-candidate") {
    shape = visualAtomReturnLoopShapes(image, atom, index);
  } else {
    shape = visualAtomRectShape(image, atom, index);
  }
  return applyPluginChartStyleToVisualAtomShape(shape, image, atom, index, understanding);
}

function nativeGearApproximationShapes({ id, cx, cy, size, fill, stroke, source, slideSize = DEFAULT_SLIDE }) {
  const shapes = [];
  const toothW = size * 0.16;
  const toothH = size * 0.22;
  for (let index = 0; index < 8; index += 1) {
    const angle = index * 45;
    const radians = angle * Math.PI / 180;
    const tx = cx + Math.cos(radians) * size * 0.44 - toothW / 2;
    const ty = cy + Math.sin(radians) * size * 0.44 - toothH / 2;
    const toothBox = clampPtBoxToSlide({ x: tx, y: ty, w: toothW, h: toothH }, slideSize);
    shapes.push({
      id: `${id}-tooth-${index}`,
      type: "rect",
      box: toothBox,
      rotation: angle,
      style: { fill, stroke, strokeWidthPt: 0.7, opacity: 0.96 },
      source: source(`tooth-${index}`, toothBox)
    });
  }
  const ringBox = clampPtBoxToSlide({ x: cx - size / 2, y: cy - size / 2, w: size, h: size }, slideSize);
  const holeSize = size * 0.36;
  const holeBox = clampPtBoxToSlide({ x: cx - holeSize / 2, y: cy - holeSize / 2, w: holeSize, h: holeSize }, slideSize);
  shapes.push({
    id: `${id}-ring`,
    type: "donut",
    box: ringBox,
    style: { fill, stroke, strokeWidthPt: 1.2, opacity: 0.98 },
    source: source("ring", ringBox)
  });
  shapes.push({
    id: `${id}-hole`,
    type: "ellipse",
    box: holeBox,
    style: { fill: "#F8FAFC", stroke, strokeWidthPt: 0.8, opacity: 1 },
    source: source("hole", holeBox)
  });
  return shapes;
}

function visualAtomRectShape(image, atom, index) {
  if (!atom?.box) return null;
  const componentStyle = visualAtomComponentNodeStyle(image, atom, "rect");
  return {
    id: `${image.id || "layer"}-visual-atom-rect-${index}`,
    type: "roundRect",
    box: atom.box,
    style: {
      fill: atom.color || "#D9EAF7",
      stroke: atom.color || "#D9EAF7",
      strokeWidthPt: 0,
      radiusRatio: atom.shapeHint === "pill" ? 0.5 : 0.08,
      ...componentStyle
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-rect",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      containerAtomId: atom.containerAtomId || null,
      topologyRole: atom.topologyRole || null,
      containedAtomIds: Array.isArray(atom.containedAtomIds) ? atom.containedAtomIds : []
    }
  };
}

function visualAtomDiamondShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-diamond-${index}`,
    type: "diamond",
    box: atom.box,
    style: {
      fill: atom.color || "#D9EAF7",
      stroke: atom.color || "#D9EAF7",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-diamond",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      containerAtomId: atom.containerAtomId || null,
      topologyRole: atom.topologyRole || null,
      containedAtomIds: Array.isArray(atom.containedAtomIds) ? atom.containedAtomIds : []
    }
  };
}

function visualAtomEllipseShape(image, atom, index) {
  if (!atom?.box) return null;
  const componentStyle = visualAtomComponentNodeStyle(image, atom, "ellipse");
  return {
    id: `${image.id || "layer"}-visual-atom-ellipse-${index}`,
    type: "ellipse",
    box: atom.box,
    style: {
      fill: atom.color || "#D9EAF7",
      stroke: atom.color || "#D9EAF7",
      strokeWidthPt: 0,
      ...componentStyle
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-ellipse",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomComponentNodeStyle(image = {}, atom = {}, shapeType = "rect") {
  if (!isHighConfidenceGridMatrixVisualAtomNode(image, atom)) return {};
  const box = atom.box || {};
  const width = Number(box.w || 0);
  const height = Number(box.h || 0);
  const area = width * height;
  const isContainer = atom.topologyRole === "container" || Array.isArray(atom.containedAtomIds) && atom.containedAtomIds.length > 0;
  const isTinyDetail = area < 520 || width < 18 || height < 12;
  if (isTinyDetail) return {};
  const isLargeNode = area >= 2600 || width >= 80 || height >= 38;
  if (!isContainer && !isLargeNode && Number(atom.density || 0) < 0.72) return {};
  const fill = atom.color || "#D9EAF7";
  const style = {
    stroke: softenVisualAtomStroke(fill),
    strokeWidthPt: isContainer ? 0.45 : 0.25,
    shadow: {
      color: "#2A4D72",
      alpha: isContainer ? 0.09 : 0.12,
      blurPt: isContainer ? 5 : 3.5,
      distancePt: isContainer ? 1.1 : 0.8,
      angle: 45
    }
  };
  if (shapeType === "rect" && atom.shapeHint !== "pill") {
    style.radiusRatio = isContainer ? 0.045 : 0.11;
  }
  return style;
}

function isHighConfidenceGridMatrixVisualAtomNode(image = {}, atom = {}) {
  const layer = image?.source?.layer || {};
  const understanding = layer.diagramUnderstanding || {};
  const archetype = String(understanding.archetype || image?.source?.componentRenderStrategy?.archetype || "");
  const layerType = String(layer.layerType || image?.source?.layerType || "");
  if (layerType !== "table-zone" && layerType !== "diagram-zone") return false;
  if (!/matrix|grid|table/i.test(archetype)) return false;
  if (atom.residualCandidate === true) return false;
  if (!/native-(?:rect|ellipse)-candidate/.test(String(atom.kind || ""))) return false;
  const confidence = Number(atom.density ?? atom.confidence ?? 0);
  if (confidence < 0.16 && atom.topologyRole !== "container") return false;
  return true;
}

function softenVisualAtomStroke(fill = "#D9EAF7") {
  const hex = String(fill || "").replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return fill;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const mix = (value) => Math.round(value * 0.78 + 255 * 0.22).toString(16).padStart(2, "0");
  return `#${mix(r)}${mix(g)}${mix(b)}`.toUpperCase();
}

function visualAtomScatterPointShape(image, atom, index) {
  const shape = visualAtomEllipseShape(image, atom, index);
  if (!shape) return null;
  return {
    ...shape,
    source: {
      ...shape.source,
      detector: "visual-atom-native-scatter-point"
    }
  };
}

function visualAtomLegendMarkerShape(image, atom, index, understanding = {}) {
  if (!atom?.box) return null;
  const markerShape = String(atom.shapeHint || "").includes("circle") || atom.kind === "native-scatter-point-candidate"
    ? visualAtomEllipseShape(image, atom, index)
    : visualAtomRectShape(image, atom, index);
  if (!markerShape) return null;
  return {
    ...markerShape,
    type: markerShape.type === "roundRect" && Number(atom.box?.w || 0) <= Number(atom.box?.h || 0) * 1.3 ? "rect" : markerShape.type,
    style: {
      ...markerShape.style,
      radiusRatio: markerShape.type === "roundRect" ? 0.12 : markerShape.style.radiusRatio
    },
    source: {
      ...markerShape.source,
      detector: "visual-atom-native-legend-marker",
      chartArchetype: understanding.archetype || null,
      legendMarker: true,
      legendIndex: visualChartLegendMarkerIndex(atom, index, understanding)
    }
  };
}

function visualAtomTriangleShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-triangle-${index}`,
    type: "triangle",
    box: atom.box,
    style: {
      fill: atom.color || "#F59E0B",
      stroke: atom.color || "#F59E0B",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-triangle",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomChevronShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-chevron-${index}`,
    type: "chevron",
    box: atom.box,
    rotation: atom.shapeHint === "chevron-left" ? 180 : 0,
    style: {
      fill: atom.color || "#3B82F6",
      stroke: atom.color || "#3B82F6",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-chevron",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomRightArrowShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-right-arrow-${index}`,
    type: "rightArrow",
    box: atom.box,
    style: {
      fill: atom.color || "#22B164",
      stroke: atom.color || "#22B164",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-right-arrow",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      promotedFrom: atom.promotedFrom || null,
      promotionReason: atom.promotionReason || null
    }
  };
}

function visualAtomParallelogramShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-parallelogram-${index}`,
    type: "parallelogram",
    box: atom.box,
    rotation: atom.shapeHint === "parallelogram-left" ? 180 : 0,
    style: {
      fill: atom.color || "#60A5FA",
      stroke: atom.color || "#60A5FA",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-parallelogram",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomCylinderShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-cylinder-${index}`,
    type: "cylinder",
    box: atom.box,
    style: {
      fill: atom.color || "#93C5FD",
      stroke: atom.color || "#93C5FD",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-cylinder",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomCloudShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-cloud-${index}`,
    type: "cloud",
    box: atom.box,
    style: {
      fill: atom.color || "#DBEAFE",
      stroke: atom.color || "#DBEAFE",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-cloud",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomDocumentShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-document-${index}`,
    type: "document",
    box: atom.box,
    style: {
      fill: atom.color || "#F8FAFC",
      stroke: atom.color || "#F8FAFC",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-document",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomFolderShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-folder-${index}`,
    type: "freeform",
    box: atom.box,
    points: [
      { x: 0, y: 0.18 },
      { x: 0, y: 0.08 },
      { x: 0.34, y: 0.08 },
      { x: 0.42, y: 0.18 },
      { x: 1, y: 0.18 },
      { x: 1, y: 1 },
      { x: 0, y: 1 }
    ],
    style: {
      fill: atom.color || "#3B82F6",
      stroke: atom.color || "#3B82F6",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-folder",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomScreenShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-screen-${index}`,
    type: "screen",
    box: atom.box,
    style: {
      fill: atom.color || "#E2E8F0",
      stroke: atom.color || "#E2E8F0",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-screen",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomPhoneShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-phone-${index}`,
    type: "phone",
    box: atom.box,
    style: {
      fill: atom.color || "#111827",
      stroke: atom.color || "#111827",
      strokeWidthPt: 0,
      radiusRatio: 0.16
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-phone",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomPersonShapes(image, atom, index) {
  if (!atom?.box) return null;
  const color = atom.color || "#1F2937";
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-person",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null
  };
  return personGlyphShapes(`${image.id || "layer"}-visual-atom-person-${index}`, atom.box, color, baseSource);
}

function visualAtomTeamShapes(image, atom, index) {
  if (!atom?.box) return null;
  const box = atom.box;
  const color = atom.color || "#1F2937";
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-team",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null
  };
  const sideW = Number(box.w || 0) * 0.36;
  const sideH = Number(box.h || 0) * 0.78;
  const centerW = Number(box.w || 0) * 0.42;
  const centerH = Number(box.h || 0) * 0.9;
  const members = [
    {
      name: "left",
      box: { x: Number(box.x || 0), y: Number(box.y || 0) + Number(box.h || 0) * 0.14, w: sideW, h: sideH }
    },
    {
      name: "right",
      box: { x: Number(box.x || 0) + Number(box.w || 0) - sideW, y: Number(box.y || 0) + Number(box.h || 0) * 0.14, w: sideW, h: sideH }
    },
    {
      name: "center",
      box: { x: Number(box.x || 0) + (Number(box.w || 0) - centerW) / 2, y: Number(box.y || 0), w: centerW, h: centerH }
    }
  ];
  return members.flatMap((member) =>
    personGlyphShapes(
      `${image.id || "layer"}-visual-atom-team-${member.name}-${index}`,
      member.box,
      color,
      { ...baseSource, member: member.name }
    )
  );
}

function visualAtomGearShapes(image, atom, index) {
  if (!atom?.box) return null;
  const box = atom.box;
  const size = Math.min(Number(box.w || 0), Number(box.h || 0));
  const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
  const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
  const fill = atom.color || "#CBD5E1";
  const stroke = darkerHex(fill, 0.42) || fill;
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-gear",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null
  };
  return nativeGearApproximationShapes({
    id: `${image.id || "layer"}-visual-atom-gear-${index}`,
    cx,
    cy,
    size,
    fill,
    stroke,
    source: (part, partBox) => ({ ...baseSource, part, partBox }),
    slideSize: DEFAULT_SLIDE
  });
}

function visualAtomSearchShapes(image, atom, index) {
  if (!atom?.box) return null;
  const box = atom.box;
  const color = atom.color || "#64748B";
  const lensSize = Math.min(Number(box.w || 0) * 0.68, Number(box.h || 0) * 0.68);
  const lensBox = {
    x: round(Number(box.x || 0) + Number(box.w || 0) * 0.08),
    y: round(Number(box.y || 0) + Number(box.h || 0) * 0.08),
    w: round(lensSize),
    h: round(lensSize)
  };
  const handleStart = {
    x: round(lensBox.x + lensBox.w * 0.72),
    y: round(lensBox.y + lensBox.h * 0.72)
  };
  const handleEnd = {
    x: round(Number(box.x || 0) + Number(box.w || 0) * 0.9),
    y: round(Number(box.y || 0) + Number(box.h || 0) * 0.9)
  };
  const strokeWidth = Math.max(1.4, Math.min(5.5, Math.min(Number(box.w || 0), Number(box.h || 0)) * 0.09));
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-search",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null
  };
  return [
    {
      id: `${image.id || "layer"}-visual-atom-search-lens-${index}`,
      type: "ellipse",
      box: lensBox,
      style: {
        fill: "none",
        stroke: color,
        strokeWidthPt: strokeWidth,
        opacity: 0.98
      },
      source: { ...baseSource, part: "lens" }
    },
    {
      id: `${image.id || "layer"}-visual-atom-search-handle-${index}`,
      type: "line",
      box: lineBox(handleStart, handleEnd),
      style: {
        stroke: color,
        strokeWidthPt: strokeWidth,
        connectorType: "straight",
        lineCap: "round",
        opacity: 0.98
      },
      source: { ...baseSource, part: "handle" }
    }
  ];
}

function visualAtomShieldShape(image, atom, index) {
  if (!atom?.box) return null;
  const color = atom.color || "#2563EB";
  return {
    id: `${image.id || "layer"}-visual-atom-shield-${index}`,
    type: "freeform",
    box: atom.box,
    points: [
      { x: 0.50, y: 0.00 },
      { x: 0.92, y: 0.15 },
      { x: 0.86, y: 0.58 },
      { x: 0.72, y: 0.82 },
      { x: 0.50, y: 1.00 },
      { x: 0.28, y: 0.82 },
      { x: 0.14, y: 0.58 },
      { x: 0.08, y: 0.15 }
    ],
    style: {
      fill: color,
      stroke: darkerHex(color, 0.28) || color,
      strokeWidthPt: Math.max(0.6, Math.min(2.2, Math.min(Number(atom.box.w || 0), Number(atom.box.h || 0)) * 0.025)),
      opacity: 0.98
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-shield",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomTimelineShapes(image, atom, index) {
  if (!atom?.box) return null;
  const box = atom.box;
  const color = atom.color || "#64748B";
  const centerY = round(Number(box.y || 0) + Number(box.h || 0) / 2);
  const lineHeight = Math.max(2, Math.min(6, Number(box.h || 0) * 0.12));
  const milestoneSize = Math.max(8, Math.min(Number(box.h || 0) * 0.76, Number(box.w || 0) * 0.08));
  const milestoneXs = Array.isArray(atom.timelineMilestones) && atom.timelineMilestones.length >= 3
    ? atom.timelineMilestones.map((item) => Number(item.x || 0)).filter((value) => Number.isFinite(value))
    : [0.18, 0.39, 0.61, 0.82].map((ratio) => Number(box.x || 0) + Number(box.w || 0) * ratio);
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-timeline",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null
  };
  return [
    {
      id: `${image.id || "layer"}-visual-atom-timeline-axis-${index}`,
      type: "line",
      box: {
        x: round(Number(box.x || 0)),
        y: centerY,
        w: round(Number(box.w || 0)),
        h: 0
      },
      style: { stroke: color, strokeWidthPt: lineHeight, endArrow: undefined },
      source: { ...baseSource, part: "axis" }
    },
    ...milestoneXs.map((x, milestoneIndex) => ({
      id: `${image.id || "layer"}-visual-atom-timeline-node-${index}-${milestoneIndex}`,
      type: "ellipse",
      box: {
        x: round(x - milestoneSize / 2),
        y: round(centerY - milestoneSize / 2),
        w: round(milestoneSize),
        h: round(milestoneSize)
      },
      style: {
        fill: color,
        stroke: color,
        strokeWidthPt: 0
      },
      source: { ...baseSource, part: "milestone", milestoneIndex }
    }))
  ];
}

function personGlyphShapes(idPrefix, box, color, baseSource) {
  const headSize = Math.min(Number(box.w || 0) * 0.46, Number(box.h || 0) * 0.32);
  const headBox = {
    x: round(Number(box.x || 0) + (Number(box.w || 0) - headSize) / 2),
    y: round(Number(box.y || 0)),
    w: round(headSize),
    h: round(headSize)
  };
  const bodyTop = Number(box.y || 0) + headSize * 0.72;
  const bodyBox = {
    x: round(Number(box.x || 0) + Number(box.w || 0) * 0.08),
    y: round(bodyTop),
    w: round(Number(box.w || 0) * 0.84),
    h: round(Number(box.y || 0) + Number(box.h || 0) - bodyTop)
  };
  return [
    {
      id: `${idPrefix}-head`,
      type: "ellipse",
      box: headBox,
      style: { fill: color, stroke: color, strokeWidthPt: 0 },
      source: { ...baseSource, part: "head" }
    },
    {
      id: `${idPrefix}-body`,
      type: "roundRect",
      box: bodyBox,
      style: { fill: color, stroke: color, strokeWidthPt: 0, radiusRatio: 0.38 },
      source: { ...baseSource, part: "body" }
    }
  ];
}

function visualAtomFunnelShape(image, atom, index) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-funnel-${index}`,
    type: "funnel",
    box: atom.box,
    style: {
      fill: atom.color || "#60A5FA",
      stroke: atom.color || "#60A5FA",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-funnel",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomDonutShape(image, atom, index, understanding = {}) {
  if (!atom?.box) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-donut-${index}`,
    type: "donut",
    box: atom.box,
    style: {
      fill: atom.color || "#60A5FA",
      stroke: atom.color || "#60A5FA",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: String(understanding?.archetype || "") === "donut-chart" ? "visual-chart-native-donut" : "visual-atom-native-donut",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomDonutSegmentShape(image, atom, index, understanding = {}) {
  if (!atom?.box) return null;
  const parentBox = atom.donutParentBox || atom.box;
  const angles = normalizedDonutSegmentAngles(atom, index, 1);
  return {
    id: `${image.id || "layer"}-visual-atom-donut-segment-${index}`,
    type: "freeform",
    box: parentBox,
    points: donutSegmentFreeformPoints(angles.startDeg, angles.endDeg, Number(atom.holeRatio || 0.52)),
    style: {
      fill: atom.color || "#60A5FA",
      stroke: atom.color || "#60A5FA",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: String(understanding?.archetype || "") === "donut-chart" ? "visual-chart-native-donut-segment" : "visual-atom-native-donut-segment",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      startDeg: angles.startDeg,
      endDeg: angles.endDeg
    }
  };
}

function visualAtomPieSegmentShape(image, atom, index, understanding = {}) {
  if (!atom?.pieParentBox || !atom?.pieSegmentAngles) return null;
  return {
    id: `${image.id || "layer"}-visual-atom-pie-segment-${index}`,
    type: "freeform",
    box: atom.pieParentBox,
    points: pieSegmentFreeformPoints(atom.pieSegmentAngles.startDeg, atom.pieSegmentAngles.endDeg),
    style: { fill: atom.color || "#60A5FA", stroke: atom.color || "#60A5FA", strokeWidthPt: 0 },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: String(understanding?.archetype || "") === "pie-chart" ? "visual-chart-native-pie-segment" : "visual-atom-native-pie-segment",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "chart-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomArcArrowSegmentShapes(image, atom, index, _understanding = {}) {
  if (!atom?.box) return null;
  const parentBox = atom.donutParentBox || atom.box;
  const angles = normalizedDonutSegmentAngles(atom, index, 1);
  const color = atom.color || "#38BDF8";
  const baseSource = {
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-arc-arrow-segment",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || null,
    confidence: atom.density ?? null,
    startDeg: angles.startDeg,
    endDeg: angles.endDeg
  };
  const arc = {
    id: `${image.id || "layer"}-visual-atom-arc-arrow-segment-${index}`,
    type: "freeform",
    box: parentBox,
    points: donutSegmentFreeformPoints(angles.startDeg, angles.endDeg, Number(atom.holeRatio || 0.62)),
    style: {
      fill: color,
      stroke: color,
      strokeWidthPt: 0
    },
    source: { ...baseSource, part: "arc" }
  };
  if (atom.arcArrowHead !== true) return arc;
  return [
    arc,
    {
      id: `${image.id || "layer"}-visual-atom-arc-arrow-head-${index}`,
      type: "freeform",
      box: arcArrowHeadBox(parentBox, angles.endDeg),
      points: [
        { x: 1.0, y: 0.5 },
        { x: 0.0, y: 0.0 },
        { x: 0.0, y: 1.0 }
      ],
      style: {
        fill: color,
        stroke: color,
        strokeWidthPt: 0,
        rotation: round(Number(angles.endDeg || 0))
      },
      source: { ...baseSource, part: "arrowhead" }
    }
  ];
}

function arcArrowHeadBox(parentBox = {}, angleDeg = 0) {
  const size = Math.max(10, Math.min(28, Math.max(Number(parentBox.w || 0), Number(parentBox.h || 0)) * 0.16));
  const radius = Math.max(Number(parentBox.w || 0), Number(parentBox.h || 0)) * 0.48;
  const point = pointOnBoxCircle(parentBox, angleDeg, radius);
  return {
    x: round(point.x - size / 2),
    y: round(point.y - size / 2),
    w: round(size),
    h: round(size)
  };
}

function pointOnBoxCircle(box = {}, deg = 0, radius = 0) {
  const radians = normalizeDegrees(deg) * Math.PI / 180;
  return {
    x: Number(box.x || 0) + Number(box.w || 0) / 2 + Math.cos(radians) * radius,
    y: Number(box.y || 0) + Number(box.h || 0) / 2 + Math.sin(radians) * radius
  };
}

function visualAtomCycleArrowShape(image, atom, index) {
  if (!atom?.box) return null;
  const box = visualAtomCycleArrowOfficeBox(image, atom);
  return {
    id: `${image.id || "layer"}-visual-atom-cycle-arrow-${index}`,
    type: "circularArrow",
    box,
    style: {
      fill: atom.color || "#60A5FA",
      stroke: atom.color || "#60A5FA",
      strokeWidthPt: 0
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-cycle-arrow",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null
    }
  };
}

function visualAtomCycleArrowOfficeBox(image = {}, atom = {}) {
  const box = atom.box || {};
  const layerType = String(image?.source?.layer?.layerType || "");
  const confidence = Number(atom.density ?? 1);
  const largeIllustrationAtom = layerType === "illustration-zone"
    && confidence < 0.5
    && Math.max(Number(box.w || 0), Number(box.h || 0)) >= 120;
  if (!largeIllustrationAtom) return box;
  const shrinkX = Number(box.w || 0) * 0.16;
  const shrinkY = Number(box.h || 0) * 0.14;
  return {
    x: round(Number(box.x || 0) + shrinkX),
    y: round(Number(box.y || 0) + shrinkY),
    w: round(Number(box.w || 0) - shrinkX * 2),
    h: round(Number(box.h || 0) - shrinkY * 2)
  };
}

function visualAtomConnectorShape(image, atom, index, understanding = {}) {
  if (!atom?.box) return null;
  const box = atom.box;
  const endpoints = atom.lineEndpoints?.from && atom.lineEndpoints?.to ? atom.lineEndpoints : null;
  const horizontal = Number(box.w || 0) >= Number(box.h || 0);
  const isArrow = atom.kind === "connector-arrow-candidate" || /^arrow-/.test(String(atom.shapeHint || ""));
  const visualConnector = Array.isArray(understanding.visualConnectors)
    ? understanding.visualConnectors.find((item) => item.atomId === atom.id)
    : null;
  return {
    id: `${image.id || "layer"}-visual-atom-connector-${index}`,
    type: "line",
    box: endpoints
      ? {
        x: Number(endpoints.from.x || 0),
        y: Number(endpoints.from.y || 0),
        w: Number(endpoints.to.x || 0) - Number(endpoints.from.x || 0),
        h: Number(endpoints.to.y || 0) - Number(endpoints.from.y || 0)
      }
      : horizontal
        ? { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 }
        : { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h },
    style: {
      stroke: atom.color || "#6B7280",
      strokeWidthPt: Math.max(1, Math.min(4, horizontal ? Number(box.h || 1) : Number(box.w || 1))),
      connectorType: "straight",
      ...(isArrow ? { endArrow: "triangle" } : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "visual-atom-native-connector",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "diagram-zone",
      atomId: atom.id,
      atomKind: atom.kind,
      shapeHint: atom.shapeHint || null,
      confidence: atom.density ?? null,
      axis: endpoints ? "diagonal" : horizontal ? "horizontal" : "vertical",
      fromAtomId: visualConnector?.fromAtomId || atom.fromAtomId || null,
      toAtomId: visualConnector?.toAtomId || atom.toAtomId || null,
      visualConnectorId: visualConnector?.id || null
    }
  };
}

function visualAtomReturnLoopShapes(image, atom, index) {
  if (!atom?.box) return [];
  const box = atom.box;
  const color = atom.color || "#55B98D";
  const strokeWidth = Math.max(1.5, Math.min(3.5, Number(box.h || 0) * 0.045));
  const x1 = Number(box.x || 0) + Number(box.w || 0) * 0.18;
  const x2 = Number(box.x || 0) + Number(box.w || 0) * 0.88;
  const y1 = Number(box.y || 0) + Number(box.h || 0) * 0.28;
  const y2 = Number(box.y || 0) + Number(box.h || 0) * 0.78;
  const prefix = `${image.id || "layer"}-visual-atom-return-loop-${index}`;
  const source = (segment) => ({
    editable: true,
    nativeRebuild: true,
    detector: "visual-atom-native-connector",
    layerSourceId: image.id || null,
    layerType: image.source?.layer?.layerType || "diagram-zone",
    atomId: atom.id,
    atomKind: atom.kind,
    shapeHint: atom.shapeHint || "return-loop",
    confidence: atom.density ?? null,
    axis: segment,
    promotedFrom: atom.promotedFrom || null
  });
  return [
    {
      id: `${prefix}-top`,
      type: "line",
      box: { x: round(x2), y: round(y1), w: round(x1 - x2), h: 0 },
      style: { stroke: color, strokeWidthPt: strokeWidth, connectorType: "straight", startArrow: "triangle" },
      source: source("return-loop-top")
    },
    {
      id: `${prefix}-right`,
      type: "line",
      box: { x: round(x2), y: round(y1), w: 0, h: round(y2 - y1) },
      style: { stroke: color, strokeWidthPt: strokeWidth, connectorType: "straight" },
      source: source("return-loop-right")
    },
    {
      id: `${prefix}-bottom`,
      type: "line",
      box: { x: round(x1), y: round(y2), w: round(x2 - x1), h: 0 },
      style: { stroke: color, strokeWidthPt: strokeWidth, connectorType: "straight" },
      source: source("return-loop-bottom")
    }
  ];
}

module.exports = { visualAtomNativeShape, visualAtomArcArrowSegmentShapes, arcArrowHeadBox, pointOnBoxCircle, visualAtomChevronShape, visualAtomCloudShape, visualAtomConnectorShape, visualAtomCycleArrowShape, visualAtomCycleArrowOfficeBox, visualAtomCylinderShape, visualAtomDiamondShape, visualAtomDocumentShape, visualAtomDonutSegmentShape, visualAtomDonutShape, visualAtomEllipseShape, visualAtomComponentNodeStyle, isHighConfidenceGridMatrixVisualAtomNode, softenVisualAtomStroke, visualAtomFolderShape, visualAtomFunnelShape, visualAtomGearShapes, nativeGearApproximationShapes, visualAtomLegendMarkerShape, visualAtomRectShape, visualAtomParallelogramShape, visualAtomPersonShapes, personGlyphShapes, visualAtomPhoneShape, visualAtomPieSegmentShape, visualAtomReturnLoopShapes, visualAtomRightArrowShape, visualAtomScatterPointShape, visualAtomScreenShape, visualAtomSearchShapes, visualAtomShieldShape, visualAtomTeamShapes, visualAtomTimelineShapes, visualAtomTriangleShape };
