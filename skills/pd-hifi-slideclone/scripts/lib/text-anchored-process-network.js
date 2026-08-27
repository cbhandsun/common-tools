"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { cropPng, writePng } = require("./png");

const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createTextAnchoredProcessNetworkObjects(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!sourceImage || !options.assetDir || !options.irDir) return emptyResult();
  const target = (images || []).find((image) => isCandidateUnderlay(image, slideSize));
  if (!target) return emptyResult();
  const model = inferTextAnchoredProcessNetwork(target.box, textBoxes, slideSize);
  if (!model) return emptyResult();
  model.sideInputIconBoxes = detectSideInputIconBoxes(sourceImage, model, target.box, slideSize);

  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    layerSourceId: target.id || null,
    componentOwnerId: `${target.id || "process-network"}-native-component`,
    confidence: model.confidence,
    ...extra
  });
  const sourceNode = model.nodes.find((node) => node.role === "source");
  const shapes = [
    ...model.sideInputIconBoxes.map((box, index) => ({
      id: `${target.id || "process-network"}-input-connector-${index}`,
      type: "line",
      box: lineConnector(rightMid(box), { x: sourceNode.box.x, y: centerY(box) }, "source-input", true).box,
      style: {
        stroke: "#111111",
        strokeWidthPt: 1.7,
        connectorType: "straight",
        endArrow: "triangle",
        lineCap: "round"
      },
      source: source("text-anchored-process-native-input-connector", { connectorIndex: index, connectorRole: "source-input" })
    })),
    ...model.connectors.map((connector, index) => ({
      id: `${target.id || "process-network"}-connector-${index}`,
      type: "line",
      box: connector.box,
      style: {
        stroke: connector.stroke || "#111111",
        strokeWidthPt: connector.strokeWidthPt || 1.8,
        connectorType: "straight",
        endArrow: connector.endArrow || undefined,
        lineCap: "round"
      },
      source: source("text-anchored-process-native-connector", { connectorIndex: index, connectorRole: connector.role })
    })),
    ...model.nodes.map((node, index) => ({
      id: `${target.id || "process-network"}-node-${index}`,
      type: "roundRect",
      box: node.box,
      style: {
        fill: node.role === "branch" ? "#087BEF" : "#E4F0FD",
        stroke: node.role === "branch" ? "#076ED6" : "#D3E5F8",
        strokeWidthPt: 0.9,
        radiusRatio: node.role === "branch" ? 0.09 : 0.08,
        shadow: node.role === "branch" ? undefined : {
          color: "#5A7894",
          alpha: 0.08,
          blurPt: 4,
          distancePt: 1,
          angle: 45
        }
      },
      source: source("text-anchored-process-native-node", { nodeIndex: index, nodeRole: node.role })
    }))
  ];
  const nativeTextBoxes = model.nodes.flatMap((node, nodeIndex) => node.labels.map((label, labelIndex) => ({
    ...label,
    id: `${target.id || "process-network"}-node-${nodeIndex}-text-${labelIndex}`,
    font: {
      ...(label.font || {}),
      color: node.role === "branch" ? "#FFFFFF" : "#111111",
      opacity: 1
    },
    style: {
      ...(label.style || {}),
      visibility: "visible",
      opacity: 1
    },
    source: source("text-anchored-process-native-text", { nodeIndex, labelIndex, nodeRole: node.role })
  })));
  const fidelityImages = [
    ...materializeNodeIconCrops(target, model, sourceImage, slideSize, options),
    ...materializeSideInputIconCrops(target, model.sideInputIconBoxes, sourceImage, slideSize, options)
  ];
  target.source = {
    ...(target.source || {}),
    textAnchoredProcessNetworkObjectified: true,
    objectifiedProcessNodeCount: model.nodes.length,
    objectifiedProcessConnectorCount: model.connectors.length,
    preservedProcessIconCropCount: fidelityImages.length,
    nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "flattened process graphic"}; rebuilt OCR-anchored branch/join network as native cards and connectors with pictorial icons preserved as minimum-unit crops`
  };
  return { matched: true, targetId: target.id || null, shapes, textBoxes: nativeTextBoxes, images: fidelityImages, model };
}

function detectSideInputIconBoxes(image, model, regionBox, slideSize = DEFAULT_SLIDE) {
  const sourceNode = model?.nodes?.find((node) => node.role === "source");
  if (!image?.rgba || !sourceNode || !validBox(regionBox)) return [];
  const availableWidth = sourceNode.box.x - regionBox.x;
  if (availableWidth < 42 || sourceNode.box.h < regionBox.h * 0.75) return [];
  const zone = constrainBox({
    x: regionBox.x + 1,
    y: regionBox.y + 1,
    w: availableWidth * 0.66,
    h: regionBox.h - 2
  }, slideSize);
  const px = ptToPxBox(zone, image, slideSize);
  const rowCounts = [];
  for (let y = px.y; y < px.y + px.h; y += 1) {
    let count = 0;
    for (let x = px.x; x < px.x + px.w; x += 1) {
      if (isIconForegroundPixel(image, x, y)) count += 1;
    }
    rowCounts.push(count);
  }
  const threshold = Math.max(4, Math.floor(px.w * 0.055));
  const intervals = activeIntervals(rowCounts, threshold, Math.max(3, Math.round(px.h * 0.008)))
    .filter(([start, end]) => end - start + 1 >= px.h * 0.055 && end - start + 1 <= px.h * 0.24);
  if (intervals.length < 3 || intervals.length > 6) return [];
  return intervals.map(([start, end]) => {
    let minX = px.x + px.w - 1;
    let maxX = px.x;
    for (let y = px.y + start; y <= px.y + end; y += 1) {
      for (let x = px.x; x < px.x + px.w; x += 1) {
        if (!isIconForegroundPixel(image, x, y)) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
      }
    }
    const padX = Math.max(2, Math.round(image.width / slideSize.widthPt * 2));
    const padY = Math.max(2, Math.round(image.height / slideSize.heightPt * 2));
    return pxToPtBox({
      x: Math.max(px.x, minX - padX),
      y: Math.max(px.y, px.y + start - padY),
      w: Math.min(px.x + px.w - 1, maxX + padX) - Math.max(px.x, minX - padX) + 1,
      h: Math.min(px.y + px.h - 1, px.y + end + padY) - Math.max(px.y, px.y + start - padY) + 1
    }, image, slideSize);
  }).map(roundBox);
}

function materializeSideInputIconCrops(target, boxes, sourceImage, slideSize, options) {
  return (boxes || []).map((box, index) => {
    const file = path.join(options.assetDir, `${safeId(options.deckName || "deck")}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-process-input-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, cropPng(sourceImage, ptToPxBox(box, sourceImage, slideSize)));
    return {
      id: `${target.id || "process-network"}-input-icon-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "text-anchored-process-input-icon-minimum-unit-crop",
        parentImageId: target.id || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "process-input-icon",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        recommendedAction: "keep-local-crop",
        nonEditableReason: "standalone pictorial input icon preserved as a faithful minimum visual unit"
      }
    };
  });
}

function activeIntervals(values, threshold, maxGap) {
  const intervals = [];
  let start = -1;
  let lastActive = -1;
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] >= threshold) {
      if (start < 0) start = index;
      lastActive = index;
    } else if (start >= 0 && index - lastActive > maxGap) {
      intervals.push([start, lastActive]);
      start = -1;
      lastActive = -1;
    }
  }
  if (start >= 0) intervals.push([start, lastActive]);
  return intervals;
}

function isIconForegroundPixel(image, x, y) {
  const offset = (y * image.width + x) * 4;
  if (offset < 0 || offset + 3 >= image.rgba.length || image.rgba[offset + 3] < 64) return false;
  const r = image.rgba[offset];
  const g = image.rgba[offset + 1];
  const b = image.rgba[offset + 2];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const saturation = max === 0 ? 0 : (max - min) / max;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma < 220 || (saturation >= 0.16 && luma < 250);
}

function inferTextAnchoredProcessNetwork(regionBox = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!validBox(regionBox)) return null;
  const labels = (textBoxes || [])
    .filter((item) => validBox(item?.box) && centerInside(item.box, regionBox))
    .filter(isCompactNodeLabel)
    .map((item) => ({ ...item, centerX: centerX(item.box), centerY: centerY(item.box) }));
  if (labels.length < 7) return null;
  const compactRatio = labels.length / Math.max(1, (textBoxes || []).filter((item) => validBox(item?.box) && centerInside(item.box, regionBox)).length);
  if (compactRatio < 0.68) return null;

  const merged = mergeMultilineLabels(labels);
  const branchGroups = groupByCloseX(merged, Math.max(14, regionBox.w * 0.025))
    .filter((group) => group.length >= 3 && span(group.map((item) => item.centerY)) >= regionBox.h * 0.30);
  if (branchGroups.length !== 1) return null;
  const branchNodes = branchGroups[0].sort((a, b) => a.centerY - b.centerY);
  const branchSet = new Set(branchNodes.flatMap((node) => node.labels));
  const remaining = merged.filter((node) => !node.labels.some((label) => branchSet.has(label)));
  const row = densestHorizontalRow(remaining, Math.max(14, regionBox.h * 0.07));
  if (row.length < 4) return null;
  const rowSpread = span(row.map((node) => node.centerX));
  if (rowSpread < regionBox.w * 0.62) return null;
  const branchX = average(branchNodes.map((node) => node.centerX));
  const left = row.filter((node) => node.centerX < branchX).sort((a, b) => a.centerX - b.centerX);
  const right = row.filter((node) => node.centerX > branchX).sort((a, b) => a.centerX - b.centerX);
  if (left.length < 2 || right.length < 2) return null;

  const rowNodes = row.sort((a, b) => a.centerX - b.centerX).map((node, index, values) => {
    const isFirst = index === 0;
    const width = clamp(Math.max(86, node.box.w + 22), 86, 104);
    const height = isFirst ? regionBox.h * 0.98 : clamp(regionBox.h * 0.42, 86, 104);
    const bottomInset = isFirst ? 12 : 11;
    return {
      ...node,
      role: isFirst ? "source" : (index === values.length - 1 ? "sink" : "stage"),
      box: roundBox({
        x: node.centerX - width / 2,
        y: isFirst ? regionBox.y + regionBox.h * 0.01 : node.box.y + node.box.h - height + bottomInset,
        w: width,
        h: height
      })
    };
  });
  const nativeBranchNodes = branchNodes.map((node) => ({
    ...node,
    role: "branch",
    box: roundBox({ x: node.centerX - 46, y: node.centerY - 20, w: 92, h: 40 })
  }));
  const leftHub = [...rowNodes].filter((node) => node.centerX < branchX).sort((a, b) => b.centerX - a.centerX)[0];
  const rightHub = [...rowNodes].filter((node) => node.centerX > branchX).sort((a, b) => a.centerX - b.centerX)[0];
  const connectors = [];
  for (let i = 0; i < rowNodes.length - 1; i += 1) {
    const a = rowNodes[i];
    const b = rowNodes[i + 1];
    if (a === leftHub && b === rightHub) continue;
    connectors.push(lineConnector(rightMid(a.box), leftMid(b.box), "main-chain", true));
  }
  for (const branch of nativeBranchNodes) {
    connectors.push(...elbowConnector(rightMid(leftHub.box), leftMid(branch.box), "branch-out"));
    connectors.push(...elbowConnector(rightMid(branch.box), leftMid(rightHub.box), "branch-in", true));
  }
  const downstream = rowNodes.filter((node) => node.centerX > rightHub.centerX).sort((a, b) => a.centerX - b.centerX);
  const feedbackNode = downstream[0];
  const sinkNode = downstream[downstream.length - 1];
  if (feedbackNode) {
    const topY = regionBox.y + 1;
    connectors.push(...orthogonalPath([
      topMid(feedbackNode.box),
      { x: centerX(feedbackNode.box), y: topY },
      { x: centerX(nativeBranchNodes[0].box), y: topY },
      topMid(nativeBranchNodes[0].box)
    ], "feedback-top", true));
    const bottomY = regionBox.y + regionBox.h - 1;
    connectors.push(...orthogonalPath([
      bottomMid(feedbackNode.box),
      { x: centerX(feedbackNode.box), y: bottomY },
      { x: centerX(rightHub.box), y: bottomY },
      bottomMid(rightHub.box)
    ], "feedback-bottom", true));
    connectors.push(...orthogonalPath([bottomMid(feedbackNode.box), { x: centerX(feedbackNode.box), y: bottomY }], "tool-output", true));
  }
  if (sinkNode && sinkNode !== feedbackNode) {
    connectors.push(...orthogonalPath([bottomMid(sinkNode.box), { x: centerX(sinkNode.box), y: regionBox.y + regionBox.h - 1 }], "tool-output", true));
  }
  return {
    nodes: [...rowNodes, ...nativeBranchNodes],
    connectors,
    confidence: 0.84,
    archetype: "text-anchored-branch-join-process",
    evidence: { compactLabels: labels.length, rowNodes: rowNodes.length, branchNodes: nativeBranchNodes.length }
  };
}

function materializeNodeIconCrops(target, model, sourceImage, slideSize, options) {
  fs.mkdirSync(options.assetDir, { recursive: true });
  return model.nodes.filter((node) => node.role !== "branch").map((node, index) => {
    const minLabelY = Math.min(...node.labels.map((label) => Number(label.box.y || node.box.y + node.box.h)));
    const iconY = node.box.y + (node.role === "source" ? 8 : 9);
    const iconBox = {
      x: node.box.x + (node.role === "source" ? 8 : 14),
      y: iconY,
      w: node.box.w - (node.role === "source" ? 16 : 28),
      h: Math.max(12, minLabelY - iconY - 8)
    };
    const safeBox = constrainBox(iconBox, slideSize);
    const file = path.join(options.assetDir, `${safeId(options.deckName || "deck")}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-process-icon-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, cropPng(sourceImage, ptToPxBox(safeBox, sourceImage, slideSize)));
    return {
      id: `${target.id || "process-network"}-icon-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: safeBox,
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "text-anchored-process-icon-minimum-unit-crop",
        parentImageId: target.id || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: "process-node-icon",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        recommendedAction: "keep-local-crop",
        nonEditableReason: "pictorial process-node icon preserved as one faithful minimum visual unit"
      }
    };
  });
}

function isCandidateUnderlay(image, slideSize) {
  const detector = String(image?.source?.detector || "");
  const box = image?.box || {};
  return detector === "screenshot-process-underlay-crop"
    && Number(box.w || 0) >= Number(slideSize.widthPt || 960) * 0.72
    && Number(box.h || 0) >= Number(slideSize.heightPt || 540) * 0.34;
}

function isCompactNodeLabel(item) {
  const text = String(item?.text || "").replace(/\s+/g, "").trim();
  if (text.length < 2 || text.length > 18) return false;
  if (/^<\/?|pd-|manual-generate|uiclone/i.test(text)) return false;
  return Number(item.box.w || 0) <= 170 && Number(item.box.h || 0) <= 48;
}

function mergeMultilineLabels(labels) {
  const sorted = [...labels].sort((a, b) => a.centerX - b.centerX || a.centerY - b.centerY);
  const used = new Set();
  const result = [];
  for (const label of sorted) {
    if (used.has(label)) continue;
    const group = sorted.filter((other) => !used.has(other)
      && Math.abs(other.centerX - label.centerX) <= 18
      && verticalGap(other.box, label.box) <= 8
      && Math.max(other.box.y + other.box.h, label.box.y + label.box.h) - Math.min(other.box.y, label.box.y) <= 52);
    const members = [label, ...group.filter((item) => item !== label)];
    members.forEach((item) => used.add(item));
    const box = unionBoxes(members.map((item) => item.box));
    result.push({ labels: members, box, centerX: centerX(box), centerY: centerY(box) });
  }
  return result;
}

function groupByCloseX(nodes, tolerance) {
  const groups = [];
  for (const node of [...nodes].sort((a, b) => a.centerX - b.centerX)) {
    const group = groups.find((items) => Math.abs(average(items.map((item) => item.centerX)) - node.centerX) <= tolerance);
    if (group) group.push(node);
    else groups.push([node]);
  }
  return groups;
}

function densestHorizontalRow(nodes, tolerance) {
  let best = [];
  for (const pivot of nodes) {
    const row = nodes.filter((node) => Math.abs(node.centerY - pivot.centerY) <= tolerance);
    if (row.length > best.length || (row.length === best.length && span(row.map((node) => node.centerX)) > span(best.map((node) => node.centerX)))) best = row;
  }
  return best;
}

function elbowConnector(from, to, role, endArrow = false) {
  const midX = round((from.x + to.x) / 2);
  return [
    lineConnector(from, { x: midX, y: from.y }, role, false),
    lineConnector({ x: midX, y: from.y }, { x: midX, y: to.y }, role, false),
    lineConnector({ x: midX, y: to.y }, to, role, endArrow)
  ].filter((item) => item.box.w > 0.1 || item.box.h > 0.1);
}

function lineConnector(from, to, role, endArrow = false) {
  return {
    role,
    box: roundBox({ x: Math.min(from.x, to.x), y: Math.min(from.y, to.y), w: Math.abs(to.x - from.x), h: Math.abs(to.y - from.y) }),
    endArrow: endArrow ? "triangle" : undefined,
    strokeWidthPt: 1.8
  };
}

function orthogonalPath(points, role, endArrow = false) {
  const result = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    result.push(lineConnector(points[index], points[index + 1], role, endArrow && index === points.length - 2));
  }
  return result.filter((item) => item.box.w > 0.1 || item.box.h > 0.1);
}

function rightMid(box) { return { x: box.x + box.w, y: box.y + box.h / 2 }; }
function leftMid(box) { return { x: box.x, y: box.y + box.h / 2 }; }
function topMid(box) { return { x: box.x + box.w / 2, y: box.y }; }
function bottomMid(box) { return { x: box.x + box.w / 2, y: box.y + box.h }; }
function centerX(box) { return Number(box.x || 0) + Number(box.w || 0) / 2; }
function centerY(box) { return Number(box.y || 0) + Number(box.h || 0) / 2; }
function centerInside(box, region) { const x = centerX(box); const y = centerY(box); return x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h; }
function validBox(box) { return box && [box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value))) && Number(box.w) > 0 && Number(box.h) > 0; }
function unionBoxes(boxes) { const x1 = Math.min(...boxes.map((b) => b.x)); const y1 = Math.min(...boxes.map((b) => b.y)); const x2 = Math.max(...boxes.map((b) => b.x + b.w)); const y2 = Math.max(...boxes.map((b) => b.y + b.h)); return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }; }
function span(values) { return values.length ? Math.max(...values) - Math.min(...values) : 0; }
function verticalGap(a, b) { return Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h)); }
function average(values) { return values.reduce((sum, value) => sum + Number(value || 0), 0) / Math.max(1, values.length); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value))); }
function round(value) { return Math.round(Number(value || 0) * 100) / 100; }
function roundBox(box) { return { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) }; }
function constrainBox(box, slideSize) { const x = clamp(box.x, 0, slideSize.widthPt); const y = clamp(box.y, 0, slideSize.heightPt); return roundBox({ x, y, w: clamp(box.w, 1, slideSize.widthPt - x), h: clamp(box.h, 1, slideSize.heightPt - y) }); }
function ptToPxBox(box, image, slideSize) { return { x: Math.max(0, Math.round(box.x * image.width / slideSize.widthPt)), y: Math.max(0, Math.round(box.y * image.height / slideSize.heightPt)), w: Math.max(1, Math.round(box.w * image.width / slideSize.widthPt)), h: Math.max(1, Math.round(box.h * image.height / slideSize.heightPt)) }; }
function pxToPtBox(box, image, slideSize) { return { x: box.x * slideSize.widthPt / image.width, y: box.y * slideSize.heightPt / image.height, w: box.w * slideSize.widthPt / image.width, h: box.h * slideSize.heightPt / image.height }; }
function safeId(value) { return String(value || "deck").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "deck"; }
function emptyResult() { return { matched: false, targetId: null, shapes: [], textBoxes: [], images: [], model: null }; }

module.exports = {
  createTextAnchoredProcessNetworkObjects,
  inferTextAnchoredProcessNetwork,
  _private: { activeIntervals, detectSideInputIconBoxes, isCompactNodeLabel, mergeMultilineLabels }
};
