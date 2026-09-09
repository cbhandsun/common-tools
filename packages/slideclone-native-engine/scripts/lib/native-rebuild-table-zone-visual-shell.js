"use strict";

function createTableZoneVisualShellFactory(dependencies = {}) {
  const {
    boxCenterInside,
    centerOfBox,
    expandBox,
    normalizeTextKey,
    round,
    roundedBox,
    tableZoneSemanticNodeInsideImage
  } = dependencies;
  const required = {
    boxCenterInside,
    centerOfBox,
    expandBox,
    normalizeTextKey,
    round,
    roundedBox,
    tableZoneSemanticNodeInsideImage
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`table zone visual shell dependency ${name} must be a function`);
  }

  function shouldObjectifyTableZoneVisualAtomShell(image = {}) {
    const source = image?.source || {};
    const layer = source.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    if (source.detector !== "foreground-graphic-underlay-crop") return false;
    if (layer.layerType !== "table-zone") return false;
    if (!/^(?:matrix-or-grid|table-grid)$/.test(String(understanding.archetype || source.expressionSubtype || ""))) return false;
    if (Number(understanding.confidence || 0) < 0.84) return false;
    const nodes = tableZoneVisualAtomShellNodes(image);
    const atoms = tableZoneVisualAtomShellAtoms(image);
    const rectAtoms = atoms.filter((atom) => atom.kind === "native-rect-candidate" && atom.box);
    const gridAtoms = atoms.filter((atom) => atom.kind === "grid-line-candidate" && atom.box);
    const text = nodes.map((node) => String(node.text || "")).join(" ");
    return nodes.length >= 8
      && rectAtoms.length >= 3
      && gridAtoms.length >= 3
      && /init|add-system|sync-prds|upgrade|业务系统|域仓模板/i.test(text);
  }
  
  function tableZoneVisualAtomShellShapes(image = {}) {
    const base = image.id || "table-zone-visual-atom-shell";
    const atoms = tableZoneVisualAtomShellAtoms(image);
    const nodes = tableZoneVisualAtomShellNodes(image);
    const rectAtoms = atoms.filter((atom) => atom.kind === "native-rect-candidate" && atom.box);
    const gridAtoms = atoms.filter((atom) => atom.kind === "grid-line-candidate" && atom.box);
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      expressionForm: "table-or-matrix",
      expressionSubtype: "table-zone-visual-atom-shell",
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "table-zone",
      skeletonOnly: true,
      ...extra
    });
    const shapes = [];
    for (const atom of gridAtoms) {
      const box = atom.box || {};
      const axis = atom.axis === "h" || /horizontal/.test(String(atom.shapeHint || "")) ? "horizontal" : "vertical";
      const position = axis === "vertical"
        ? Number(box.x || 0) + Number(box.w || 0) / 2
        : Number(box.y || 0) + Number(box.h || 0) / 2;
      const lineBoxValue = axis === "vertical"
        ? { x: round(position), y: round(Number(box.y || image.box?.y || 0)), w: 0, h: round(Number(box.h || image.box?.h || 0)) }
        : { x: round(Number(box.x || image.box?.x || 0)), y: round(position), w: round(Number(box.w || image.box?.w || 0)), h: 0 };
      shapes.push({
        id: `${base}-native-visual-grid-${atom.id || shapes.length}`,
        type: "line",
        box: lineBoxValue,
        style: {
          stroke: atom.color || "#8EA5B6",
          strokeWidthPt: axis === "vertical" ? 1.1 : 0.9,
          connectorType: "straight",
          opacity: 0.72
        },
        source: source("table-zone-visual-atom-shell-grid-line", { axis, atomId: atom.id || "" })
      });
    }
    rectAtoms.forEach((atom, index) => {
      shapes.push({
        id: `${base}-native-command-pill-${index}`,
        type: "roundRect",
        box: roundedBox(atom.box || {}),
        style: {
          fill: atom.color || "#505050",
          stroke: "none",
          strokeWidthPt: 0,
          radiusRatio: 0.48,
          opacity: 0.82,
          shadow: { color: "#303030", alpha: 0.10, blurPt: 2.5, distancePt: 0.8, angleDeg: 90 }
        },
        source: source("table-zone-visual-atom-shell-command-pill", { atomId: atom.id || "", commandIndex: index })
      });
    });
    const commandKeys = new Set(rectAtoms.map((atom) => {
      const center = centerOfBox(atom.box || {});
      const closest = closestTableZoneNode(nodes, center);
      return closest ? normalizeTextKey(closest.text) : "";
    }).filter(Boolean));
    nodes
      .filter((node) => !commandKeys.has(normalizeTextKey(node.text)))
      .forEach((node, index) => {
        const text = String(node.text || "");
        const role = /业务系统/.test(text)
          ? "system"
          : /域仓模板|配置|菜单|文档|原型/.test(text)
            ? "asset"
            : "node";
        const nodeBox = expandBox(node.box || {}, role === "system" ? 16 : 12, role === "system" ? 8 : 7);
        const fill = role === "system" ? "#F2F7FA" : role === "asset" ? "#F8FBF7" : "#FFFFFF";
        const stroke = role === "system" ? "#8BA5B4" : role === "asset" ? "#88BE96" : "#B9CAD8";
        shapes.push({
          id: `${base}-native-node-card-${index}`,
          type: "roundRect",
          box: roundedBox(nodeBox),
          style: {
            fill,
            stroke,
            strokeWidthPt: 0.9,
            radiusRatio: role === "system" ? 0.12 : 0.16,
            opacity: 0.74
          },
          source: source("table-zone-visual-atom-shell-node-card", { role, semanticNodeId: node.id || "" })
        });
      });
    return shapes;
  }
  
  function tableZoneVisualAtomShellAtoms(image = {}) {
    const layer = image?.source?.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    const direct = Array.isArray(layer.visualAtoms) ? layer.visualAtoms : [];
    const understood = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
    return direct.length > 0 ? direct : understood;
  }
  
  function tableZoneVisualAtomShellNodes(image = {}) {
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
      ? image.source.layer.diagramUnderstanding.nodes
      : [];
    return nodes
      .filter((node) => node?.box && boxCenterInside(node.box, image.box || {}))
      .filter((node) => tableZoneSemanticNodeInsideImage(node, image));
  }
  
  function closestTableZoneNode(nodes = [], point = {}) {
    let best = null;
    let bestDistance = Infinity;
    for (const node of nodes) {
      const center = centerOfBox(node.box || {});
      const distance = Math.hypot(Number(center.x || 0) - Number(point.x || 0), Number(center.y || 0) - Number(point.y || 0));
      if (distance < bestDistance) {
        best = node;
        bestDistance = distance;
      }
    }
    return best;
  }

  return {
    shouldObjectifyTableZoneVisualAtomShell,
    tableZoneVisualAtomShellShapes
  };
}

module.exports = {
  createTableZoneVisualShellFactory
};
