"use strict";

const { average, boxContains, boxesNear, centerOfBox, colorDistance, distanceBetweenPoints, distanceToBox, expandPxBox, hexToRgb, inAnyMask, intersectionArea, median, overlapRatio, rgbToHex, round, unionBox } = require("./visual-atom-utils");
const { dedupeComponentPriority, looksLikeLine, looksLikeTriangle, profileEdgeRoughness, profileOuterProtrusionRatio } = require("./visual-atom-shape-recognition");
const { isForegroundPixel, isLowContrastContainerPixel } = require("./visual-atom-line-components");
const { detectDenseLinkedNodeAtoms, dominantSaturatedForegroundColor } = require("./visual-atom-dense-nodes");
const { DEFAULT_SLIDE } = require("./visual-atom-constants");

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

function recoverResidualArcArrowSegments(atoms = [], _semanticHint = "") {
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

module.exports = {
  augmentDenseLinkedNodeAtoms,
  isNativeNodeAtom,
  promoteArcArrowSegmentAtoms,
  recoverResidualArcArrowSegments,
  promoteConnectorAdjacentRectIcons,
  inferTreeRectIconAtomIds,
  connectorNearBox,
  detectLowContrastContainerComponents,
  foregroundComponents,
  floodFillComponent,
  foregroundComponentsBySeedColor,
  hasCompositeConnectedComponent,
  shouldProbeColorSeparatedComponents,
  hasSparseCircularCompositeConnectedComponent,
  hasCircularCompositeConnectedComponent,
  hasDenseCardComponents,
  shouldUseColorSeparatedComponents,
  looksLikeHorizontalProcessColorParts,
  medianNumber,
  looksLikeDonutSegmentParts,
  markDonutSegmentParts,
  shouldPromoteArcArrowSegments,
  hasNearbyArcArrowHead,
  hasArcArrowSegmentProtrusion,
  donutSegmentComponents,
  inferDonutSegmentAngles,
  normalizeAngleDegrees,
  looksLikeSeparatedCardParts,
  looksLikeStackedBarParts,
  markStackedBarParts,
  isStackedBarPartComponent,
  clusterComponentsByAxis,
  looksLikeColumnChartParts,
  suppressCompositeComponents,
  looksLikeHorizontalProcessCompositeParent,
  looksLikeStackedBarParent,
  looksLikeLowContrastContainer,
  mergeCloseComponents,
  shouldMergeVisualComponents,
  isThinLineComponent,
  isDenseHorizontalBandComponent,
  mergeRowProfiles,
  mergeColProfiles,
  dedupeComponents
};
