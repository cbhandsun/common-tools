"use strict";

function createHierarchyDiagramToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function createShapes(images = [], textBoxes = [], sourceImage = null, slideSize = ops.defaultSlide) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of Array.isArray(images) ? images : []) {
      if (!shouldObjectify(image)) continue;
      const hierarchy = infer(image, textBoxes, slideSize);
      if (!hierarchy) continue;
      image.source = {
        ...(image.source || {}),
        hierarchyDiagramObjectified: true,
        objectifiedHierarchyNodes: hierarchy.cards.length,
        objectifiedHierarchyConnectors: hierarchy.connectors.length,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt as native hierarchy diagram`
      };
      hierarchy.cards.forEach((card, index) => {
        shapes.push(shape(image, `native-card-${index}`, "roundRect", card.box, {
          fill: "#9BD8A8", stroke: "#2FA66A", strokeWidthPt: 2.2
        }, "hierarchy-diagram-native-card", { columnIndex: index }));
        shapes.push(shape(image, `native-divider-${index}`, "line", {
          x: ops.round(card.box.x + 10), y: ops.round(card.dividerY),
          w: ops.round(card.box.w - 20), h: 0.1
        }, { stroke: "#2FA66A", strokeWidthPt: 1.2, connectorType: "straight" },
        "hierarchy-diagram-native-divider", { columnIndex: index }));
      });
      hierarchy.stagePills.forEach((pill, index) => shapes.push(shape(
        image, `native-stage-pill-${index}`, "roundRect", pill.box,
        { fill: "#37B56C", stroke: "#2FA66A", strokeWidthPt: 0.8, radiusRatio: 0.42 },
        "hierarchy-diagram-native-stage-pill", { columnIndex: index }
      )));
      shapes.push(shape(image, "native-root", "triangle", hierarchy.root.box, {
        fill: "#BBDCF5", stroke: "#2C78C4", strokeWidthPt: 2
      }, "hierarchy-diagram-native-root"));
      hierarchy.root.dots.forEach((box, index) => shapes.push(shape(
        image, `native-root-dot-${index}`, "ellipse", box,
        { fill: "#2C78C4", stroke: "#2C78C4", strokeWidthPt: 0 },
        "hierarchy-diagram-native-root-dot", { dotIndex: index }
      )));
      hierarchy.connectors.forEach((connector, index) => shapes.push(shape(
        image, `native-connector-${index}`, "line", connector.box,
        {
          stroke: "#2FA66A",
          strokeWidthPt: connector.arrow ? 4.2 : 4,
          connectorType: "straight",
          endArrow: connector.arrow ? "triangle" : undefined
        },
        "hierarchy-diagram-native-connector", { connectorIndex: index }
      )));
    }
    return shapes;
  }

  function shouldObjectify(image) {
    const layer = image?.source?.layer || {};
    const box = image?.box || {};
    if (image?.source?.detector !== "sparse-diagram-graphic-underlay-crop") return false;
    if (layer.layerType !== "diagram-zone" || !positiveBox(box)) return false;
    const aspect = box.w / Math.max(1, box.h);
    if (aspect < 1.1 || aspect > 1.9 || box.w < 260 || box.h < 180) return false;
    if (layer.recommendedAction === "split-native-with-residual-crop") return true;

    const understanding = layer.diagramUnderstanding || {};
    const atoms = Array.isArray(understanding.visualAtoms) ? understanding.visualAtoms : [];
    const hasRootTriangle = atoms.some((atom) => atom?.shapeHint === "triangle"
      || atom?.kind === "native-triangle-candidate");
    const childCards = atoms.filter((atom) => /native-(?:rect|document)-candidate/.test(String(atom?.kind || "")));
    const nodes = Array.isArray(understanding.nodes) ? understanding.nodes : [];
    return hasRootTriangle
      && nodes.length >= 6
      && childCards.length >= 3
      && String(understanding.archetype || "") === "flow-card-chain";
  }

  function infer(image, textBoxes = [], slideSize = ops.defaultSlide) {
    const box = image?.box;
    if (!positiveBox(box)) return null;
    const internal = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((item) => item?.box && typeof item.text === "string" && item.text.trim())
      .filter((item) => ops.boxCenterInside(item.box, box))
      .filter((item) => item.box.w <= box.w * 0.35 && item.box.h <= box.h * 0.2)
      .sort((a, b) => centerX(a.box) - centerX(b.box));
    if (internal.length < 6) return null;

    const threshold = Math.max(44, Math.min(92, box.w * 0.18));
    const clusters = [];
    for (const textBox of internal) {
      const cx = centerX(textBox.box);
      const cluster = clusters.find((item) => Math.abs(item.cx - cx) <= threshold);
      if (cluster) {
        cluster.items.push(textBox);
        cluster.cx = cluster.items.reduce((sum, item) => sum + centerX(item.box), 0) / cluster.items.length;
      } else {
        clusters.push({ cx, items: [textBox] });
      }
    }
    const columns = clusters
      .filter((cluster) => cluster.items.length >= 2)
      .sort((a, b) => b.items.length - a.items.length)
      .slice(0, 3)
      .sort((a, b) => a.cx - b.cx);
    if (columns.length !== 3) return null;
    const spread = columns[2].cx - columns[0].cx;
    if (spread < box.w * 0.45 || spread > box.w * 0.92) return null;

    const atoms = Array.isArray(image?.source?.layer?.diagramUnderstanding?.visualAtoms)
      ? image.source.layer.diagramUnderstanding.visualAtoms
      : [];
    const visualCards = atoms
      .filter((atom) => /native-(?:rect|document)-candidate/.test(String(atom?.kind || "")))
      .filter((atom) => positiveBox(atom?.box));
    const cards = columns.map((column) => cardForColumn(
      column,
      visualCards.length >= 3 ? visualCards : [],
      box,
      slideSize
    ));
    const stagePills = columns.map((column) => {
      const top = column.items.slice().sort((a, b) => a.box.y - b.box.y)[0];
      return { box: ops.roundedBox(ops.expandPtBox(top.box, slideSize, 12, 5)), centerX: ops.round(column.cx) };
    });

    const rootW = ops.clamp(box.w * 0.14, 54, 78);
    const rootH = ops.clamp(box.h * 0.17, 46, 66);
    const rootBox = ops.expandPtBox({
      x: box.x + box.w / 2 - rootW / 2,
      y: box.y + box.h * 0.07,
      w: rootW,
      h: rootH
    }, slideSize, 0, 0);
    const branchY = ops.round(Math.min(...stagePills.map((pill) => pill.box.y)) - 48);
    const rootBottom = ops.round(rootBox.y + rootBox.h + 6);
    const leftX = ops.round(cards[0].centerX);
    const rightX = ops.round(cards[2].centerX);
    const rootCenterX = ops.round(box.x + box.w / 2);
    const connectors = [
      { box: { x: rootCenterX, y: rootBottom, w: 0.1, h: ops.round(branchY - rootBottom) }, arrow: false },
      { box: { x: leftX, y: branchY, w: ops.round(rightX - leftX), h: 0.1 }, arrow: false },
      ...cards.map((card, index) => ({
        box: { x: ops.round(card.centerX), y: branchY, w: 0.1, h: ops.round(stagePills[index].box.y - branchY - 4) },
        arrow: true
      }))
    ].filter((connector) => connector.box.w >= 0 && connector.box.h >= 0);
    const dotSize = 7;
    const dots = [
      { x: rootBox.x + rootBox.w / 2 - dotSize / 2, y: rootBox.y + 8, w: dotSize, h: dotSize },
      { x: rootBox.x + 10, y: rootBox.y + rootBox.h - 14, w: dotSize, h: dotSize },
      { x: rootBox.x + rootBox.w - 17, y: rootBox.y + rootBox.h - 14, w: dotSize, h: dotSize }
    ].map((item) => ops.expandPtBox(item, slideSize, 0, 0));
    return { cards, stagePills, connectors, root: { box: rootBox, dots } };
  }

  function cardForColumn(column, visualCards, diagramBox, slideSize) {
    const items = column.items.slice().sort((a, b) => a.box.y - b.box.y);
    const top = items[0].box;
    const bottom = items[items.length - 1].box;
    const visualCard = visualCards.slice().sort((a, b) => (
      Math.abs(centerX(a.box) - column.cx) - Math.abs(centerX(b.box) - column.cx)
    ))[0];
    if (visualCard && Math.abs(centerX(visualCard.box) - column.cx) <= diagramBox.w * 0.16) {
      return {
        centerX: ops.round(column.cx),
        box: ops.roundedBox(visualCard.box),
        dividerY: ops.round(visualCard.box.y + Math.min(38, Math.max(30, visualCard.box.h * 0.38)))
      };
    }
    const textUnion = items.map((item) => item.box).reduce((acc, item) => ops.unionPtBox(acc, item));
    const width = ops.clamp(Math.max(textUnion.w + 56, diagramBox.w * 0.22), diagramBox.w * 0.22, diagramBox.w * 0.31);
    const y = ops.clamp(top.y - 24, diagramBox.y + diagramBox.h * 0.48, diagramBox.y + diagramBox.h * 0.75);
    const bottomY = ops.clamp(Math.max(bottom.y + bottom.h + 30, y + diagramBox.h * 0.28), y + 80, diagramBox.y + diagramBox.h - 4);
    return {
      centerX: ops.round(column.cx),
      box: ops.expandPtBox({ x: column.cx - width / 2, y, w: width, h: bottomY - y }, slideSize, 0, 0),
      dividerY: ops.round((top.y + top.h + bottom.y) / 2)
    };
  }

  return Object.freeze({ createShapes, infer, shouldObjectify });

  function shape(image, suffix, type, box, style, detector, extra = {}) {
    return {
      id: `${image.id || "hierarchy"}-${suffix}`,
      type,
      box,
      style,
      source: { editable: true, nativeRebuild: true, detector, layerSourceId: image.id || null, ...extra }
    };
  }
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) {
    throw new TypeError("hierarchy diagram operations must be an object");
  }
  const required = ["boxCenterInside", "clamp", "expandPtBox", "round", "roundedBox", "unionPtBox"];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`hierarchy diagram operation ${name} must be a function`);
  }
  const defaultSlide = operations.defaultSlide;
  if (!defaultSlide || !Number.isFinite(defaultSlide.widthPt) || !Number.isFinite(defaultSlide.heightPt)
    || defaultSlide.widthPt <= 0 || defaultSlide.heightPt <= 0) {
    throw new TypeError("hierarchy diagram defaultSlide is invalid");
  }
  return Object.freeze({ ...operations, defaultSlide: Object.freeze({ ...defaultSlide }) });
}

function centerX(box) {
  return Number(box?.x || 0) + Number(box?.w || 0) / 2;
}

function positiveBox(box) {
  return Boolean(box)
    && [box.x, box.y, box.w, box.h].every(Number.isFinite)
    && box.w > 0
    && box.h > 0;
}

module.exports = { createHierarchyDiagramToolkit };
