"use strict";

const MAX_STANDARD_NETWORK_NODES = 512;

function createNetworkNativeShapeToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function createStandardShapes(image = {}, network = {}, searchBox = null) {
    if (!validPoint(network?.center)) return [];
    const base = safeToken(ops.safeComponentToken(image?.id || "network"));
    const layerSourceId = typeof image?.id === "string" ? image.id : null;
    const nodes = validNodes(network?.nodes).slice(0, MAX_STANDARD_NETWORK_NODES);
    const rays = nodes.map((node, index) => ({
      id: `${base}-native-ray-${index}`,
      type: "line",
      box: {
        x: ops.round(network.center.x),
        y: ops.round(network.center.y),
        w: ops.round(node.center.x - network.center.x),
        h: ops.round(node.center.y - network.center.y)
      },
      style: {
        stroke: node.color,
        strokeWidthPt: 0.75,
        connectorType: "straight"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "network-diagram-native-ray",
        layerSourceId,
        nodeIndex: index
      }
    }));
    const nodeShapes = nodes.map((node, index) => ({
      id: `${base}-native-node-${index}`,
      type: "rect",
      box: { ...node.box },
      style: {
        fill: node.color,
        stroke: node.color,
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "network-diagram-native-node",
        layerSourceId,
        nodeIndex: index
      }
    }));
    return [
      ...rays,
      ...nodeShapes,
      ...(searchBox ? createSearchShapes(image, searchBox) : []),
      ...createCenterShapes(image, network)
    ];
  }

  function createCenterShapes(image = {}, network = {}) {
    const box = validBox(network?.centerBox) ? network.centerBox : null;
    if (!box || !validPoint(network?.center)) return [];
    const base = safeToken(ops.safeComponentToken(image?.id || "network"));
    const maxSize = Math.min(box.w, box.h);
    const understanding = objectValue(image?.source?.layer?.diagramUnderstanding);
    const visualAtomKindCounts = objectValue(understanding.visualAtomKindCounts);
    const denseNetwork = validNodes(network?.nodes).length >= 48
      || (finiteNumber(image?.source?.layer?.areaRatio, 0) >= 0.42
        && finiteNumber(visualAtomKindCounts["grid-line-candidate"], 0) >= 10);
    const levels = denseNetwork
      ? [
          { type: "freeform", points: safePoints(ops.regularPolygonPoints(8, Math.PI / 8)), scale: 0.98, width: 5.6, fill: "#FFFFFF" },
          { type: "diamond", scale: 0.86, width: 4.6, fill: "none" },
          { type: "freeform", points: safePoints(ops.regularPolygonPoints(8, Math.PI / 8)), scale: 0.74, width: 4.0, fill: "none" },
          { type: "diamond", scale: 0.62, width: 3.5, fill: "none" },
          { type: "freeform", points: safePoints(ops.regularPolygonPoints(8, Math.PI / 8)), scale: 0.50, width: 3.1, fill: "none" },
          { type: "diamond", scale: 0.38, width: 2.8, fill: "none" },
          { type: "freeform", points: safePoints(ops.regularPolygonPoints(8, Math.PI / 8)), scale: 0.27, width: 2.5, fill: "none" },
          { type: "diamond", scale: 0.18, width: 2.2, fill: "none" },
          { type: "rect", scale: 0.10, width: 2.0, fill: "none" }
        ]
      : [
          { type: "hexagon", scale: 0.92, width: 8.5, fill: "#FFFFFF" },
          { type: "diamond", scale: 0.68, width: 7.2, fill: "#FFFFFF" },
          { type: "hexagon", scale: 0.50, width: 6.4, fill: "#FFFFFF" },
          { type: "diamond", scale: 0.34, width: 5.5, fill: "#FFFFFF" },
          { type: "rect", scale: 0.17, width: 4.6, fill: "#FFFFFF" }
        ];
    return levels.map((level, index) => {
      const size = maxSize * level.scale;
      return {
        id: `${base}-native-center-emblem-${index}`,
        type: level.type,
        box: {
          x: ops.round(network.center.x - size / 2),
          y: ops.round(network.center.y - size / 2),
          w: ops.round(size),
          h: ops.round(size)
        },
        ...(level.points?.length ? { points: level.points } : {}),
        style: {
          fill: level.fill,
          stroke: "#0A73E8",
          strokeWidthPt: level.width,
          shadow: index === 0 ? { color: "#0A73E8", alpha: 0.14, blurPt: 5, distancePt: 0, angle: 0 } : undefined
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "network-diagram-native-center-emblem",
          layerSourceId: typeof image?.id === "string" ? image.id : null,
          emblemIndex: index,
          denseNetworkCenter: denseNetwork
        }
      };
    });
  }

  function createSearchShapes(image = {}, searchBox = {}) {
    if (!validBox(searchBox?.box) || !validBox(searchBox?.iconBox) || !validLineBox(searchBox?.cursorBox)) return [];
    const base = safeToken(ops.safeComponentToken(image?.id || "network"));
    const icon = { ...searchBox.iconBox };
    const iconCenter = { x: icon.x + icon.w / 2, y: icon.y + icon.h / 2 };
    const handleStart = {
      x: ops.round(iconCenter.x + icon.w * 0.30),
      y: ops.round(iconCenter.y + icon.h * 0.30)
    };
    const handleEnd = {
      x: ops.round(handleStart.x + icon.w * 0.34),
      y: ops.round(handleStart.y + icon.h * 0.34)
    };
    const baseSource = {
      editable: true,
      nativeRebuild: true,
      layerSourceId: typeof image?.id === "string" ? image.id : null,
      nativeComponentGroupId: `${base}-network-search-control`,
      nativeComponentParentId: `${base}-dense-radial-network`,
      nativeComponentArchetype: "search-control",
      nativeComponentInstance: true,
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentRole: "search-control"
    };
    return [
      {
        id: `${base}-native-search-box`,
        type: "roundRect",
        box: { ...searchBox.box },
        style: {
          fill: "#FFFFFF",
          stroke: "#D9DEE8",
          strokeWidthPt: 0.8,
          radiusRatio: 0.12,
          shadow: { color: "#000000", alpha: 0.14, blurPt: 6, distancePt: 1.2, angle: 45 }
        },
        source: { ...baseSource, detector: "network-diagram-native-search-box", nativeComponentPart: "container" }
      },
      {
        id: `${base}-native-search-icon`,
        type: "ellipse",
        box: icon,
        style: { fill: "#FFFFFF", stroke: "#6A717A", strokeWidthPt: 2 },
        source: { ...baseSource, detector: "network-diagram-native-search-icon", nativeComponentPart: "lens" }
      },
      {
        id: `${base}-native-search-handle`,
        type: "line",
        box: {
          x: handleStart.x,
          y: handleStart.y,
          w: ops.round(handleEnd.x - handleStart.x),
          h: ops.round(handleEnd.y - handleStart.y)
        },
        style: { stroke: "#6A717A", strokeWidthPt: 2, connectorType: "straight" },
        source: { ...baseSource, detector: "network-diagram-native-search-handle", nativeComponentPart: "handle" }
      },
      {
        id: `${base}-native-search-cursor`,
        type: "line",
        box: { ...searchBox.cursorBox },
        style: { stroke: "#222222", strokeWidthPt: 1.5, connectorType: "straight" },
        source: { ...baseSource, detector: "network-diagram-native-search-cursor", nativeComponentPart: "cursor" }
      }
    ];
  }

  return Object.freeze({ createCenterShapes, createSearchShapes, createStandardShapes });
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("network native shape operations must be an object");
  for (const name of ["regularPolygonPoints", "round", "safeComponentToken"]) {
    if (typeof operations[name] !== "function") throw new TypeError(`network native shape operation ${name} must be a function`);
  }
  return Object.freeze({ ...operations });
}

function validNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).filter((node) => validPoint(node?.center) && validBox(node?.box)).map((node) => ({
    center: { ...node.center },
    box: { ...node.box },
    color: validColor(node.color) ? node.color : "#2378D4"
  }));
}

function validPoint(point) {
  return Boolean(point) && boundedNumber(point.x) && boundedNumber(point.y);
}

function validBox(box) {
  return Boolean(box) && boundedNumber(box.x) && boundedNumber(box.y)
    && boundedNumber(box.w) && boundedNumber(box.h) && box.w > 0 && box.h > 0;
}

function validLineBox(box) {
  return Boolean(box) && boundedNumber(box.x) && boundedNumber(box.y)
    && boundedNumber(box.w) && boundedNumber(box.h);
}

function boundedNumber(value) {
  return Number.isFinite(value) && Math.abs(value) <= 100000;
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function validColor(value) {
  return typeof value === "string" && /^(?:#[0-9A-F]{6}|none)$/i.test(value);
}

function safePoints(points) {
  return (Array.isArray(points) ? points : []).filter(validPoint).slice(0, 64).map((point) => ({ ...point }));
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function safeToken(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : "network";
}

module.exports = { MAX_STANDARD_NETWORK_NODES, createNetworkNativeShapeToolkit };
