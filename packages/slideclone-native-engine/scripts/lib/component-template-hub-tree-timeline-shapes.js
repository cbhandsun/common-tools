"use strict";

const {
  mergeTemplateStyle,
  nativeTypeForTemplateStyle
} = require("./component-template-style");
const {
  paletteFromMatch
} = require("./component-template-palette");
const {
  angleAround,
  anchorAxisBetween,
  boxCenter,
  clampBox,
  clampInteger,
  distance,
  isInsideUnitBox,
  lineBoxBetween,
  radialAnchor,
  scaleRelativeBox
} = require("./component-template-geometry");
const {
  appliedChildStructureRole,
  isTemplateConnectorDecorationStyle
} = require("./component-template-applied-layout-replay");
const { safeColorOrNone, safeText } = require("./component-template-sanitizers");
const { componentTemplateTargetMotifs } = require("./component-template-motifs");
const {
  treeVisualNodes,
  visualConnectorDegreeCenter,
  visualConnectorsBetweenNodes
} = require("./component-template-visual-graph");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createHubTreeTimelineShapeGenerators(deps = {}) {
  const nativeShape = requiredDependency(deps, "nativeShape");
  const safeBox = requiredDependency(deps, "safeBox");
  const selectTemplateNodeBoxes = requiredDependency(deps, "selectTemplateNodeBoxes");
  const templateGuidedChildSource = requiredDependency(deps, "templateGuidedChildSource");
  const median = requiredDependency(deps, "median");

  function hubSpokeConnectorMetadata(nodeIndex, centerBox = {}, nodeBox = {}) {
    const center = boxCenter(centerBox);
    const node = boxCenter(nodeBox);
    return {
      connectorSemantic: "hub-spoke",
      fromNodeIndex: "center",
      toNodeIndex: nodeIndex,
      fromAnchor: radialAnchor(center, node),
      toAnchor: radialAnchor(node, center),
      connectorAxis: "radial"
    };
  }

  function hubSpokeShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
    const box = safeBox(image.box, slideSize);
    if (!box) return [];
    const palette = paletteFromMatch(match, {
      accents: ["#2F80ED", "#22A76B", "#F97316"],
      neutral: "#94A3B8",
      softFills: ["#EAF3FF", "#F0FDF4", "#FFF7ED"]
    });
    if (componentTemplateTargetMotifs(image, match).includes("tree-link")) {
      const tree = treeLinkShapes(image, match, box, palette, slideSize);
      if (tree.length > 0) return tree;
    }
    const visualHub = hubSpokeShapesFromVisualNodes(image, match, box, palette, slideSize);
    if (visualHub.length > 0) return visualHub;
    const guided = templateGuidedHubSpokeShapes(image, match, box, palette, slideSize);
    if (guided.length > 0) return guided;
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const spokeCount = clampInteger(match.connectorCount || match.childCount || 6, 4, 8);
    const radiusX = box.w * 0.36;
    const radiusY = box.h * 0.34;
    const nodeW = Math.max(34, Math.min(76, box.w * 0.16));
    const nodeH = Math.max(24, Math.min(52, box.h * 0.13));
    const centerBox = { x: cx - nodeW * 0.62, y: cy - nodeH * 0.62, w: nodeW * 1.24, h: nodeH * 1.24 };
    const shapes = [
      nativeShape(image, match, "hub-center", 0, "ellipse", centerBox, {
        fill: palette.softFills[0],
        stroke: palette.accents[0],
        strokeWidthPt: 1.2
      })
    ];
    for (let index = 0; index < spokeCount; index += 1) {
      const angle = -Math.PI / 2 + (Math.PI * 2 * index / spokeCount);
      const nx = cx + Math.cos(angle) * radiusX;
      const ny = cy + Math.sin(angle) * radiusY;
      const nodeBox = {
        x: nx - nodeW / 2,
        y: ny - nodeH / 2,
        w: nodeW,
        h: nodeH
      };
      shapes.push(nativeShape(image, match, "hub-spoke", index, "line", {
        x: Math.min(cx, nx),
        y: Math.min(cy, ny),
        w: Math.max(0.1, Math.abs(nx - cx)),
        h: Math.max(0.1, Math.abs(ny - cy))
      }, {
        stroke: palette.neutral,
        strokeWidthPt: 1.0,
        connectorType: "straight"
      }, hubSpokeConnectorMetadata(index, centerBox, nodeBox)));
      shapes.push(nativeShape(image, match, "hub-node", index, "roundRect", nodeBox, {
        fill: palette.softFills[(index + 1) % palette.softFills.length],
        stroke: palette.accents[(index + 1) % palette.accents.length],
        strokeWidthPt: 0.95,
        radiusRatio: 0.20
      }));
    }
    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function hubSpokeShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
    const nodes = treeVisualNodes(image, targetBox, slideSize);
    if (nodes.length < 4) return [];
    const centerPoint = boxCenter(targetBox);
    const center = visualConnectorDegreeCenter(image, nodes) || nodes.reduce((best, node) => {
      const score = hubCenterScore(node, nodes, centerPoint);
      if (!best || score < best.score) return { node, score };
      return best;
    }, null)?.node;
    if (!center) return [];
    const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 16 });
    const hubEdges = visualEdges
      .map((edge) => {
        if (edge.from.id === center.id) return { ...edge, hub: edge.from, node: edge.to };
        if (edge.to.id === center.id) return { ...edge, hub: edge.to, node: edge.from };
        return null;
      })
      .filter(Boolean);
    const connectedPeripheralIds = new Set(hubEdges.map((edge) => edge.node.id));
    const peripherals = (hubEdges.length >= 3
      ? hubEdges.map((edge) => edge.node)
      : nodes.filter((node) => node !== center))
      .filter((node) => node !== center)
      .sort((a, b) => angleAround(boxCenter(center.box), boxCenter(a.box)) - angleAround(boxCenter(center.box), boxCenter(b.box)))
      .slice(0, 9);
    if (peripherals.length < 3) return [];

    const shapes = [
      nativeShape(image, match, "hub-center", 0, "ellipse", center.box, {
        fill: palette.softFills?.[0] || "#EAF3FF",
        stroke: palette.accents?.[0] || "#2F80ED",
        strokeWidthPt: 1.2
      }, {
        sourceVisualNodeId: center.id,
        layoutPreservation: "visual-node"
      })
    ];
    peripherals.forEach((node, index) => {
      const edge = hubEdges.find((candidate) => candidate.node.id === node.id) || null;
      shapes.push(nativeShape(image, match, "hub-spoke", index, "line", lineBoxBetween(center.box, node.box), {
        stroke: palette.neutral || "#94A3B8",
        strokeWidthPt: 1.0,
        connectorType: "straight"
      }, {
        ...hubSpokeConnectorMetadata(index, center.box, node.box),
        sourceVisualConnectorId: edge?.id,
        sourceVisualNodeId: node.id,
        layoutPreservation: "visual-node"
      }));
      shapes.push(nativeShape(image, match, "hub-node", index, "roundRect", node.box, {
        fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
        stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
        strokeWidthPt: 0.95,
        radiusRatio: 0.20
      }, {
        sourceVisualNodeId: node.id,
        layoutPreservation: "visual-node"
      }));
    });
    if (hubEdges.length >= 3 && connectedPeripheralIds.size !== peripherals.length) {
      image.source = {
        ...(image.source || {}),
        componentTemplateConnectorPartialReason: "visual connector graph had extra non-hub edges; hub shell kept center-linked spokes"
      };
    }
    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function hubCenterScore(node = {}, nodes = [], targetCenter = {}) {
    const center = boxCenter(node.box);
    const targetDistance = distance(center, targetCenter);
    const averageDistance = nodes.reduce((sum, other) => {
      if (other === node) return sum;
      return sum + distance(center, boxCenter(other.box));
    }, 0) / Math.max(1, nodes.length - 1);
    return targetDistance * 0.65 + averageDistance * 0.35;
  }

  function treeLinkShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
    const nodes = treeVisualNodes(image, targetBox, slideSize);
    if (nodes.length < 4) return [];
    const root = visualConnectorDegreeCenter(image, nodes) || nodes.reduce((best, node) => {
      if (!best) return node;
      const nodeCenter = boxCenter(node.box);
      const bestCenter = boxCenter(best.box);
      if (nodeCenter.y !== bestCenter.y) return nodeCenter.y < bestCenter.y ? node : best;
      return nodeCenter.x < bestCenter.x ? node : best;
    }, null);
    if (!root) return [];
    const children = nodes
      .filter((node) => node !== root)
      .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
      .slice(0, 9);
    if (children.length < 3) return [];
    const visualEdges = visualConnectorsBetweenNodes(image, nodes, { max: 18 });
    const childIndexById = new Map(children.map((child, index) => [child.id, index]));
    const treeEdges = visualEdges
      .map((edge) => {
        const fromIsRoot = edge.from.id === root.id;
        const toIsRoot = edge.to.id === root.id;
        const child = fromIsRoot ? edge.to : toIsRoot ? edge.from : null;
        const childIndex = child ? childIndexById.get(child.id) : undefined;
        if (!child || childIndex === undefined) return null;
        return { ...edge, child, childIndex };
      })
      .filter(Boolean);
    const connectorChildren = treeEdges.length >= 1
      ? treeEdges
      : children.map((child, index) => ({ child, childIndex: index }));

    const shapes = [
      nativeShape(image, match, "tree-root", 0, "roundRect", root.box, {
        fill: palette.softFills?.[0] || "#EAF3FF",
        stroke: palette.accents?.[0] || "#2F80ED",
        strokeWidthPt: 1.15,
        radiusRatio: 0.2,
        shadow: { color: "#1F2937", alpha: 0.08, blurPt: 4, distancePt: 1.1, angleDeg: 90 }
      }, {
        sourceVisualNodeId: root.id,
        layoutPreservation: "visual-node"
      })
    ];

    connectorChildren.forEach((edge, index) => {
      const child = edge.child;
      const childIndex = edge.childIndex;
      const axis = anchorAxisBetween(root.box, child.box);
      shapes.push(nativeShape(image, match, "tree-connector", index, "line", lineBoxBetween(root.box, child.box), {
        stroke: palette.neutral || "#94A3B8",
        strokeWidthPt: 1.05,
        connectorType: "elbow",
        endArrow: "triangle"
      }, {
        connectorSemantic: "tree-link",
        fromNodeIndex: "root",
        toNodeIndex: childIndex,
        fromAnchor: axis === "vertical" ? "bottom" : "right",
        toAnchor: axis === "vertical" ? "top" : "left",
        connectorAxis: axis,
        sourceVisualConnectorId: edge.id,
        sourceVisualNodeId: child.id,
        layoutPreservation: "visual-node"
      }));
    });
    children.forEach((child, index) => {
      shapes.push(nativeShape(image, match, "tree-node", index, "roundRect", child.box, {
        fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
        stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
        strokeWidthPt: 0.95,
        radiusRatio: 0.18
      }, {
        sourceVisualNodeId: child.id,
        layoutPreservation: "visual-node"
      }));
    });

    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function treeLinkShapes(image = {}, match = {}, box = null, palette = {}, slideSize = DEFAULT_SLIDE) {
    const targetBox = box || safeBox(image.box, slideSize);
    if (!targetBox) return [];
    const visualTree = treeLinkShapesFromVisualNodes(image, match, targetBox, palette, slideSize);
    if (visualTree.length > 0) return visualTree;
    const childCount = clampInteger((match.childCount || match.connectorCount || 5) - 1, 3, 7);
    const rootW = Math.max(70, Math.min(150, targetBox.w * 0.24));
    const rootH = Math.max(30, Math.min(54, targetBox.h * 0.15));
    const childW = Math.max(54, Math.min(116, targetBox.w * 0.18));
    const childH = Math.max(26, Math.min(48, targetBox.h * 0.13));
    const rootBox = clampBox({
      x: targetBox.x + targetBox.w / 2 - rootW / 2,
      y: targetBox.y + targetBox.h * 0.08,
      w: rootW,
      h: rootH
    }, slideSize);
    const childY = targetBox.y + targetBox.h * 0.68;
    const usableW = targetBox.w * 0.88;
    const startX = targetBox.x + (targetBox.w - usableW) / 2;
    const gap = childCount <= 1 ? 0 : (usableW - childW * childCount) / (childCount - 1);
    const shapes = [
      nativeShape(image, match, "tree-root", 0, "roundRect", rootBox, {
        fill: palette.softFills?.[0] || "#EAF3FF",
        stroke: palette.accents?.[0] || "#2F80ED",
        strokeWidthPt: 1.15,
        radiusRatio: 0.2,
        shadow: { color: "#1F2937", alpha: 0.08, blurPt: 4, distancePt: 1.1, angleDeg: 90 }
      })
    ];
    for (let index = 0; index < childCount; index += 1) {
      const childBox = clampBox({
        x: startX + index * (childW + Math.max(8, gap)),
        y: childY,
        w: childW,
        h: childH
      }, slideSize);
      shapes.push(nativeShape(image, match, "tree-connector", index, "line", lineBoxBetween(rootBox, childBox), {
        stroke: palette.neutral || "#94A3B8",
        strokeWidthPt: 1.05,
        connectorType: "elbow",
        endArrow: "triangle"
      }, {
        connectorSemantic: "tree-link",
        fromNodeIndex: "root",
        toNodeIndex: index,
        fromAnchor: "bottom",
        toAnchor: "top",
        connectorAxis: "vertical"
      }));
      shapes.push(nativeShape(image, match, "tree-node", index, "roundRect", childBox, {
        fill: palette.softFills?.[(index + 1) % Math.max(1, palette.softFills.length)] || "#F0FDF4",
        stroke: palette.accents?.[(index + 1) % Math.max(1, palette.accents.length)] || "#22A76B",
        strokeWidthPt: 0.95,
        radiusRatio: 0.18
      }));
    }
    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function templateGuidedHubSpokeShapes(image, match, box, palette, slideSize) {
    const nodes = selectTemplateNodeBoxes(match, box, slideSize, {
      max: 9,
      requireInsideUnit: true,
      excludeDecorations: true,
      excludeRoleDecorationsOnly: true
    });
    const radial = selectRadialTemplateNodes(nodes, box);
    if (!radial) return [];
    const templateSpokes = selectTemplateHubSpokeConnectorBoxes(match, box, radial, slideSize);
    const useTemplateSpokes = templateSpokes.length >= Math.min(3, radial.peripherals.length);
    const shapes = [
      nativeShape(image, match, "hub-center", 0, nativeTypeForTemplateStyle(radial.center.style, "ellipse"), radial.center.box, mergeTemplateStyle(radial.center.style, {
        fill: palette.softFills[0],
        stroke: palette.accents[0],
        strokeWidthPt: 1.2
      }), templateGuidedChildSource(radial.center, "component-child-layout"))
    ];
    if (useTemplateSpokes) {
      templateSpokes.forEach((spoke, index) => {
        const metadata = hubSpokeConnectorMetadata(spoke.peripheralIndex, radial.center.box, spoke.peripheral.box);
        shapes.push(nativeShape(
          image,
          match,
          "hub-spoke",
          index,
          spoke.kind === "connector" ? "line" : nativeTypeForTemplateStyle(spoke.style, "line"),
          spoke.box,
          mergeTemplateStyle(spoke.style, {
            fill: safeColorOrNone(spoke.style.fill) || "none",
            stroke: safeColorOrNone(spoke.style.stroke) || palette.neutral,
            strokeWidthPt: 1.0,
            connectorType: "straight"
          }),
          {
            ...metadata,
            ...templateGuidedChildSource(spoke, "component-child-layout"),
            connectorSource: "plugin-child-layout"
          }
        ));
      });
    }
    radial.peripherals.forEach((node, index) => {
      if (!useTemplateSpokes) {
        shapes.push(nativeShape(image, match, "hub-spoke", index, "line", lineBoxBetween(radial.center.box, node.box), {
          stroke: palette.neutral,
          strokeWidthPt: 1.0,
          connectorType: "straight"
        }, hubSpokeConnectorMetadata(index, radial.center.box, node.box)));
      }
      shapes.push(nativeShape(image, match, "hub-node", index, nativeTypeForTemplateStyle(node.style, "roundRect"), node.box, mergeTemplateStyle(node.style, {
        fill: palette.softFills[(index + 1) % palette.softFills.length],
        stroke: palette.accents[(index + 1) % palette.accents.length],
        strokeWidthPt: 0.95,
        radiusRatio: 0.20
      }), templateGuidedChildSource(node, "component-child-layout")));
    });
    return shapes;
  }

  function selectTemplateHubSpokeConnectorBoxes(match = {}, targetBox = {}, radial = null, slideSize = DEFAULT_SLIDE) {
    if (!radial?.center || !Array.isArray(radial.peripherals) || radial.peripherals.length < 3) return [];
    const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
    const centerPoint = boxCenter(radial.center.box);
    const candidates = children
      .map((child, index) => ({
        index,
        kind: String(child?.kind || ""),
        relativeBox: child?.box,
        box: scaleRelativeBox(child?.box, targetBox, slideSize),
        style: child?.style || {},
        structureRole: appliedChildStructureRole({
          kind: child?.kind,
          relativeBox: child?.box,
          style: child?.style || {}
        })
      }))
      .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
      .filter((child) => {
        if (child.kind === "connector") return true;
        const shapeType = safeText(child.style?.shapeType).toLowerCase();
        return child.kind === "shape"
          && child.structureRole === "decoration"
          && /line|arrow|chevron|arc|blockarc/.test(shapeType);
      })
      .map((child) => {
        const childCenter = boxCenter(child.box);
        const peripheral = closestRadialPeripheralForConnector(childCenter, centerPoint, radial.peripherals);
        if (!peripheral) return null;
        const radialDistance = distance(childCenter, centerPoint);
        const peripheralDistance = distance(boxCenter(peripheral.node.box), centerPoint);
        if (radialDistance < peripheralDistance * 0.14 || radialDistance > peripheralDistance * 1.10) return null;
        return {
          ...child,
          peripheral: peripheral.node,
          peripheralIndex: peripheral.index,
          angleDelta: peripheral.angleDelta,
          radialDistance
        };
      })
      .filter(Boolean)
      .filter((child) => child.angleDelta <= Math.PI / 5)
      .sort((a, b) => a.peripheralIndex - b.peripheralIndex || a.angleDelta - b.angleDelta || a.index - b.index);
    const byPeripheral = new Map();
    for (const candidate of candidates) {
      if (!byPeripheral.has(candidate.peripheralIndex)) byPeripheral.set(candidate.peripheralIndex, candidate);
    }
    return Array.from(byPeripheral.values()).slice(0, radial.peripherals.length);
  }

  function closestRadialPeripheralForConnector(point = {}, center = {}, peripherals = []) {
    const angle = angleAround(center, point);
    return peripherals
      .map((node, index) => {
        const peripheralAngle = angleAround(center, boxCenter(node.box));
        return {
          node,
          index,
          angleDelta: angularDistance(angle, peripheralAngle)
        };
      })
      .sort((a, b) => a.angleDelta - b.angleDelta)[0] || null;
  }

  function angularDistance(a, b) {
    const diff = Math.abs(Number(a || 0) - Number(b || 0)) % (Math.PI * 2);
    return Math.min(diff, Math.PI * 2 - diff);
  }

  function selectRadialTemplateNodes(nodes = [], targetBox = {}) {
    if (!Array.isArray(nodes) || nodes.length < 5) return null;
    const targetCenter = {
      x: targetBox.x + targetBox.w / 2,
      y: targetBox.y + targetBox.h / 2
    };
    const withCenters = nodes.map((node) => ({
      ...node,
      center: boxCenter(node.box),
      distanceToTargetCenter: distance(boxCenter(node.box), targetCenter)
    }));
    const xValues = withCenters.map((node) => node.center.x);
    const yValues = withCenters.map((node) => node.center.y);
    const spreadX = Math.max(...xValues) - Math.min(...xValues);
    const spreadY = Math.max(...yValues) - Math.min(...yValues);
    if (spreadX < targetBox.w * 0.38 || spreadY < targetBox.h * 0.30) return null;
    const center = withCenters
      .filter((node) => node.distanceToTargetCenter <= Math.max(targetBox.w, targetBox.h) * 0.18)
      .sort((a, b) => a.distanceToTargetCenter - b.distanceToTargetCenter)[0];
    if (!center) return null;
    const peripherals = withCenters
      .filter((node) => node.index !== center.index)
      .filter((node) => distance(node.center, center.center) >= Math.min(targetBox.w, targetBox.h) * 0.18)
      .sort((a, b) => angleAround(center.center, a.center) - angleAround(center.center, b.center))
      .slice(0, 8);
    if (peripherals.length < 4) return null;
    return { center, peripherals };
  }

  function timelineShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE) {
    const box = safeBox(image.box, slideSize);
    if (!box) return [];
    const palette = paletteFromMatch(match, {
      accents: ["#2F80ED", "#27AE60"],
      neutral: "#64748B",
      softFills: ["#EAF3FF", "#EAFBF2"]
    });
    const visualTimeline = timelineShapesFromVisualNodes(image, match, box, palette, slideSize);
    if (visualTimeline.length > 0) return visualTimeline;
    const guided = templateGuidedTimelineShapes(image, match, box, palette, slideSize);
    if (guided.length > 0) return guided;
    const count = clampInteger(match.childCount || 5, 3, 7);
    const y = box.y + box.h * 0.5;
    const left = box.x + box.w * 0.08;
    const right = box.x + box.w * 0.92;
    const shapes = [
      nativeShape(image, match, "timeline-axis", 0, "line", { x: left, y, w: right - left, h: 0.1 }, {
        stroke: palette.neutral,
        strokeWidthPt: 1.6,
        connectorType: "straight"
      })
    ];
    for (let index = 0; index < count; index += 1) {
      const x = left + ((right - left) * index / Math.max(1, count - 1));
      shapes.push(nativeShape(image, match, "timeline-dot", index, "ellipse", {
        x: x - 8,
        y: y - 8,
        w: 16,
        h: 16
      }, {
        fill: palette.accents[index % palette.accents.length],
        stroke: "#FFFFFF",
        strokeWidthPt: 1.4
      }));
    }
    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function timelineShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE) {
    const nodes = treeVisualNodes(image, targetBox, slideSize)
      .slice()
      .sort((a, b) => boxCenter(a.box).x - boxCenter(b.box).x || boxCenter(a.box).y - boxCenter(b.box).y)
      .slice(0, 12);
    if (nodes.length < 3) return [];
    const centers = nodes.map((node) => boxCenter(node.box));
    const xSpread = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
    const ySpread = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
    const avgNodeH = nodes.reduce((sum, node) => sum + node.box.h, 0) / Math.max(1, nodes.length);
    if (xSpread < targetBox.w * 0.28 || ySpread > Math.max(avgNodeH * 1.9, targetBox.h * 0.24)) return [];

    const left = Math.min(...centers.map((point) => point.x));
    const right = Math.max(...centers.map((point) => point.x));
    const y = median(centers.map((point) => point.y));
    const shapes = [
      nativeShape(image, match, "timeline-axis", 0, "line", { x: left, y, w: Math.max(0.1, right - left), h: 0.1 }, {
        stroke: palette.neutral || "#64748B",
        strokeWidthPt: 1.6,
        connectorType: "straight"
      }, {
        layoutPreservation: "visual-node"
      })
    ];
    nodes.forEach((node, index) => {
      shapes.push(nativeShape(image, match, "timeline-dot", index, "ellipse", node.box, {
        fill: palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2F80ED",
        stroke: "#FFFFFF",
        strokeWidthPt: 1.4
      }, {
        sourceVisualNodeId: node.id,
        layoutPreservation: "visual-node"
      }));
    });
    return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
  }

  function templateGuidedTimelineShapes(image, match, box, palette, slideSize) {
    const milestones = selectTimelineMilestoneBoxes(match, box, slideSize);
    if (milestones.length < 3) return [];
    const centers = milestones.map((item) => boxCenter(item.box));
    const left = Math.min(...centers.map((point) => point.x));
    const right = Math.max(...centers.map((point) => point.x));
    const y = median(centers.map((point) => point.y));
    const axis = selectTemplateTimelineAxisBox(match, box, milestones, slideSize);
    const shapes = [
      nativeShape(image, match, "timeline-axis", 0, axis ? nativeTypeForTemplateStyle(axis.style, "line") : "line", axis?.box || { x: left, y, w: Math.max(0.1, right - left), h: 0.1 }, mergeTemplateStyle(axis?.style || {}, {
        stroke: palette.neutral,
        strokeWidthPt: 1.6,
        connectorType: "straight"
      }), axis ? {
        ...templateGuidedChildSource(axis, "component-child-layout"),
        timelineAxisSource: "plugin-child-layout"
      } : {})
    ];
    milestones.forEach((milestone, index) => {
      shapes.push(nativeShape(image, match, "timeline-dot", index, nativeTypeForTemplateStyle(milestone.style, "ellipse"), milestone.box, mergeTemplateStyle(milestone.style, {
        fill: palette.accents[index % palette.accents.length],
        stroke: "#FFFFFF",
        strokeWidthPt: 1.4
      }), templateGuidedChildSource(milestone, "component-child-layout")));
    });
    return shapes;
  }

  function selectTemplateTimelineAxisBox(match = {}, targetBox = {}, milestones = [], slideSize = DEFAULT_SLIDE) {
    const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
    if (!Array.isArray(milestones) || milestones.length < 3) return null;
    const milestoneCenters = milestones.map((item) => boxCenter(item.box));
    const left = Math.min(...milestoneCenters.map((point) => point.x));
    const right = Math.max(...milestoneCenters.map((point) => point.x));
    const y = median(milestoneCenters.map((point) => point.y));
    return children
      .map((child, index) => ({
        index,
        kind: String(child?.kind || ""),
        relativeBox: child?.box,
        box: scaleRelativeBox(child?.box, targetBox, slideSize),
        style: child?.style || {}
      }))
      .filter((child) => child.box && child.box.w > 0 && child.box.h > 0)
      .filter((child) => child.kind === "connector" || isTemplateConnectorDecorationStyle(child.style))
      .filter((child) => isLikelyTimelineAxisBox(child.box, { left, right, y }, targetBox))
      .sort((a, b) => (b.box.w * b.box.h) - (a.box.w * a.box.h) || a.index - b.index)[0] || null;
  }

  function isLikelyTimelineAxisBox(box = {}, milestoneSpan = {}, targetBox = {}) {
    const center = boxCenter(box);
    const widthRatio = Number(box.w || 0) / Math.max(1, Number(targetBox.w || 0));
    const heightRatio = Number(box.h || 0) / Math.max(1, Number(targetBox.h || 0));
    const milestoneWidth = Math.max(1, Number(milestoneSpan.right || 0) - Number(milestoneSpan.left || 0));
    const coversMilestones = Number(box.x || 0) <= Number(milestoneSpan.left || 0) + milestoneWidth * 0.14
      && Number(box.x || 0) + Number(box.w || 0) >= Number(milestoneSpan.right || 0) - milestoneWidth * 0.14;
    return widthRatio >= 0.34
      && heightRatio <= 0.18
      && coversMilestones
      && Math.abs(center.y - Number(milestoneSpan.y || 0)) <= Math.max(18, Number(targetBox.h || 0) * 0.20);
  }

  function selectTimelineMilestoneBoxes(match = {}, targetBox = {}, slideSize = DEFAULT_SLIDE) {
    const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
    const boxes = children
      .map((child, index) => ({
        index,
        kind: String(child.kind || ""),
        relativeBox: child.box,
        box: scaleRelativeBox(child.box, targetBox, slideSize),
        style: child.style || {}
      }))
      .filter((child) => child.kind === "shape" && isInsideUnitBox(child.relativeBox))
      .filter((child) => !isTemplateConnectorDecorationStyle(child.style))
      .filter((child) => isUsefulTimelineMilestoneBox(child.box, targetBox))
      .sort((a, b) => a.box.x - b.box.x || a.index - b.index)
      .slice(0, 10);
    if (boxes.length < 3) return [];
    const centers = boxes.map((item) => boxCenter(item.box));
    const spreadX = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
    const spreadY = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
    if (spreadX < targetBox.w * 0.45) return [];
    if (spreadY > targetBox.h * 0.55) return [];
    return boxes;
  }

  function isUsefulTimelineMilestoneBox(box, targetBox) {
    if (!box || box.w <= 4 || box.h <= 4) return false;
    const areaRatio = (box.w * box.h) / Math.max(1, targetBox.w * targetBox.h);
    const widthRatio = box.w / Math.max(1, targetBox.w);
    const heightRatio = box.h / Math.max(1, targetBox.h);
    return areaRatio >= 0.0008
      && areaRatio <= 0.08
      && widthRatio >= 0.012
      && widthRatio <= 0.20
      && heightRatio >= 0.025
      && heightRatio <= 0.35;
  }

  return { hubSpokeShapes, timelineShapes };
}

function requiredDependency(deps = {}, name = "") {
  const value = deps[name];
  if (typeof value !== "function") throw new TypeError(`${name} dependency is required`);
  return value;
}

module.exports = {
  createHubTreeTimelineShapeGenerators
};
