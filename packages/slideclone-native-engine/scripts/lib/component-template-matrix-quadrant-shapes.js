"use strict";

const {
  boxCenter,
  clampBox,
  clampInteger
} = require("./component-template-geometry");
const { paletteFromMatch } = require("./component-template-palette");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function matrixShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#B6C2D2"],
    neutral: "#B6C2D2",
    softFills: ["#F8FAFC", "#EEF6FF"]
  });
  const visualMatrix = matrixShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
  if (visualMatrix.length > 0) return visualMatrix;
  const guided = deps.templateGuidedMatrixShapes?.(image, match, box, palette, slideSize) || [];
  if (guided.length > 0) return guided;
  const fidelityOverlay = deps.isFidelityCropOverlay?.(image) === true;
  const cols = clampInteger(Math.round(Math.sqrt(match.childCount || match.shapeCount || 9)), 2, 4);
  const rows = clampInteger(Math.ceil((match.childCount || 9) / cols), 2, 4);
  const gap = Math.max(6, Math.min(14, Math.min(box.w, box.h) * 0.025));
  const cellW = (box.w - gap * (cols - 1)) / cols;
  const cellH = (box.h - gap * (rows - 1)) / rows;
  const shapes = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const fill = palette.softFills[(row + col) % palette.softFills.length];
      shapes.push(deps.nativeShape(image, match, "matrix-cell", index, "roundRect", {
        x: box.x + col * (cellW + gap),
        y: box.y + row * (cellH + gap),
        w: cellW,
        h: cellH
      }, fidelityOverlay ? deps.fidelityOverlayShellStyle({
        fill: "none",
        stroke: palette.neutral,
        strokeWidthPt: 0.85,
        radiusRatio: 0.06
      }) : {
        fill,
        stroke: palette.neutral,
        strokeWidthPt: 0.85,
        radiusRatio: 0.06
      }));
    }
  }
  return shapes;
}

function quadrantShapes(image = {}, match = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const box = deps.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2F80ED", "#22A76B", "#F97316", "#64748B"],
    neutral: "#8A9AAC",
    softFills: ["#EEF6FF", "#ECFDF5", "#FFF7ED", "#F8FAFC"]
  });
  const visualQuadrant = quadrantShapesFromVisualNodes(image, match, box, palette, slideSize, deps);
  if (visualQuadrant.length > 0) return visualQuadrant;
  const midX = box.x + box.w / 2;
  const midY = box.y + box.h / 2;
  const cellW = box.w / 2;
  const cellH = box.h / 2;
  const shapes = [];
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const index = row * 2 + col;
      shapes.push(deps.nativeShape(image, match, "quadrant-cell", index, "roundRect", {
        x: box.x + col * cellW,
        y: box.y + row * cellH,
        w: cellW,
        h: cellH
      }, {
        fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
        stroke: palette.neutral || "#8A9AAC",
        strokeWidthPt: 0.75,
        radiusRatio: 0.05
      }, {
        quadrantRow: row,
        quadrantColumn: col
      }));
    }
  }
  shapes.push(...quadrantAxisShapes(image, match, box, palette, slideSize, { x: midX, y: midY }, deps));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function quadrantShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const nodes = deps.treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 8);
  if (nodes.length < 4) return [];
  const selected = selectQuadrantNodes(nodes, targetBox);
  if (selected.length !== 4) return [];
  const centers = selected.map((node) => boxCenter(node.box));
  const midX = deps.median(centers.map((point) => point.x));
  const midY = deps.median(centers.map((point) => point.y));
  const shapes = selected.map((node, index) => {
    const center = boxCenter(node.box);
    return deps.nativeShape(image, match, "quadrant-cell", index, "roundRect", node.box, {
      fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
      stroke: palette.neutral || "#8A9AAC",
      strokeWidthPt: 0.75,
      radiusRatio: 0.05
    }, {
      quadrantRow: center.y < midY ? 0 : 1,
      quadrantColumn: center.x < midX ? 0 : 1,
      sourceVisualNodeId: node.id,
      layoutPreservation: "visual-node"
    });
  });
  shapes.push(...quadrantAxisShapes(
    image,
    match,
    targetBox,
    palette,
    slideSize,
    quadrantCenterFromAtoms(image, targetBox) || { x: midX, y: midY },
    deps
  ));
  return shapes.map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectQuadrantNodes(nodes = [], targetBox = {}) {
  const center = boxCenter(targetBox);
  const buckets = new Map();
  for (const node of nodes) {
    const point = boxCenter(node.box);
    const key = `${point.y < center.y ? 0 : 1}-${point.x < center.x ? 0 : 1}`;
    const current = buckets.get(key);
    const score = Math.abs(point.x - center.x) + Math.abs(point.y - center.y);
    if (!current || score > current.score) buckets.set(key, { node, score });
  }
  return ["0-0", "0-1", "1-0", "1-1"].map((key) => buckets.get(key)?.node).filter(Boolean);
}

function quadrantCenterFromAtoms(image = {}, targetBox = {}) {
  const atoms = image?.source?.layer?.diagramUnderstanding?.visualAtoms || [];
  const horizontal = atoms
    .filter((atom) => atom?.box && (atom.axis === "h" || atom.shapeHint === "grid-line-horizontal"))
    .map((atom) => atom.box)
    .sort((a, b) => Math.abs(boxCenter(a).y - boxCenter(targetBox).y) - Math.abs(boxCenter(b).y - boxCenter(targetBox).y))[0];
  const vertical = atoms
    .filter((atom) => atom?.box && (atom.axis === "v" || atom.shapeHint === "grid-line-vertical"))
    .map((atom) => atom.box)
    .sort((a, b) => Math.abs(boxCenter(a).x - boxCenter(targetBox).x) - Math.abs(boxCenter(b).x - boxCenter(targetBox).x))[0];
  if (!horizontal && !vertical) return null;
  return {
    x: vertical ? boxCenter(vertical).x : boxCenter(targetBox).x,
    y: horizontal ? boxCenter(horizontal).y : boxCenter(targetBox).y
  };
}

function quadrantAxisShapes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, center = {}, deps = {}) {
  const stroke = palette.neutral || "#8A9AAC";
  return [
    deps.nativeShape(image, match, "quadrant-axis", 0, "line", {
      x: targetBox.x,
      y: Number(center.y || boxCenter(targetBox).y),
      w: targetBox.w,
      h: 0.1
    }, {
      stroke,
      strokeWidthPt: 1.1,
      connectorType: "straight"
    }, {
      quadrantAxis: "horizontal",
      axis: "horizontal",
      layoutPreservation: "visual-node"
    }),
    deps.nativeShape(image, match, "quadrant-axis", 1, "line", {
      x: Number(center.x || boxCenter(targetBox).x),
      y: targetBox.y,
      w: 0.1,
      h: targetBox.h
    }, {
      stroke,
      strokeWidthPt: 1.1,
      connectorType: "straight"
    }, {
      quadrantAxis: "vertical",
      axis: "vertical",
      layoutPreservation: "visual-node"
    })
  ].map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function matrixShapesFromVisualNodes(image = {}, match = {}, targetBox = {}, palette = {}, slideSize = DEFAULT_SLIDE, deps = {}) {
  const nodes = deps.treeVisualNodes(image, targetBox, slideSize)
    .slice()
    .sort((a, b) => boxCenter(a.box).y - boxCenter(b.box).y || boxCenter(a.box).x - boxCenter(b.box).x)
    .slice(0, 36);
  if (nodes.length < 4) return [];
  const avgArea = nodes.reduce((sum, node) => sum + node.box.w * node.box.h, 0) / Math.max(1, nodes.length);
  const targetArea = Math.max(1, targetBox.w * targetBox.h);
  if (avgArea / targetArea > 0.28) return [];

  return nodes.map((node, index) => deps.nativeShape(image, match, "matrix-cell", index, "roundRect", node.box, {
    fill: palette.softFills?.[index % Math.max(1, palette.softFills.length)] || "#F8FAFC",
    stroke: palette.neutral || "#B6C2D2",
    strokeWidthPt: 0.85,
    radiusRatio: 0.06
  }, {
    sourceVisualNodeId: node.id,
    layoutPreservation: "visual-node"
  })).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

module.exports = {
  matrixShapes,
  matrixShapesFromVisualNodes,
  quadrantAxisShapes,
  quadrantCenterFromAtoms,
  quadrantShapes,
  quadrantShapesFromVisualNodes,
  selectQuadrantNodes
};
