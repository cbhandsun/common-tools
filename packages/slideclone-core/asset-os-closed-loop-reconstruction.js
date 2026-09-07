"use strict";
const {boxCenterInside, round, unionPtBox, ptToPxBox, expandPtBox} = require("./raster-native-detection");
const {lineBox, safeIdentifier} = require("./workflow-shape-primitives");
const {normalizeCjkText} = require("./prd-generation-shapes");
const {resolveAssetOsClosedLoopLayout} = require("./closed-loop-hybrid");
const {clampPtBoxToSlide} = require("./structured-residual-splitting");
const {cropPng, writePng} = require("./png");
const {ensureDir} = require("./residual-primitive-erasure");
const path = require("node:path");
const {reclassifyImageSource} = require("./diagram-residual-crops");
const {eraseDarkPixelsInRects} = require("./text-mask-cleanup");
const {ptBoxOverlapAreaValue} = require("./diagram-geometry");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createSegmentedAssetOsClosedLoopCycleObjects(page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  const candidates = (page.images || [])
    .filter((image) => image?.source?.detector === "product-illustration-segment-crop")
    .filter((image) => image?.source?.assetOsClosedLoopCycleObjectified !== true);
  if (candidates.length < 4) return { shapes: [], textBoxes: [] };
  const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
  const normalized = normalizeCjkText(pageText);
  const hasClosedLoopIntent = /全链路|闭环|资产提炼|资产自动入库|工作流闭环/.test(normalized);
  const signalCount = [/需求理解/, /PRD生成/, /原型映射|原型/, /智能评审/, /资产自动入库|资产沉淀/]
    .filter((pattern) => pattern.test(normalized)).length;
  if (!hasClosedLoopIntent || signalCount < 4) return { shapes: [], textBoxes: [] };
  const sourceSemanticTextBoxes = (page.textBoxes || []).map((item) => ({ ...item, box: { ...(item.box || {}) } }));
  page.textBoxes = (page.textBoxes || []).map((item) => {
    const textValue = String(item?.text || "");
    if (!/AISkills不是/.test(textValue)) return item;
    return { ...item, text: textValue.replace(/AISkills不是/g, "AI Skills 不是") };
  });
  const visualBox = candidates.reduce((acc, image) => (acc ? unionPtBox(acc, image.box) : { ...image.box }), null);
  if (!visualBox) return { shapes: [], textBoxes: [] };
  const areaRatio = Number(visualBox.w || 0) * Number(visualBox.h || 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  if (areaRatio < 0.20 || areaRatio > 0.55) return { shapes: [], textBoxes: [] };

  // The ring contains custom arcs, badges, and micro-routes. Preserve it as one
  // local diagram crop when the source is available rather than stacking a weak
  // primitive approximation over the original visual.
  // Full-diagram preservation is now an explicit compatibility escape hatch.
  // The normal path keeps only irreducible pictorial atoms as local crops and
  // rebuilds the surrounding cycle structure as editable native objects.
  if (options.preserveFullClosedLoopCrop === true) {
    const fidelityBox = assetOsClosedLoopFidelityBounds(visualBox, page.textBoxes, slideSize);
    const fullFidelityCrop = createAssetOsClosedLoopFidelityCrop({
      sourceImage: options.sourceImage,
      visualBox: fidelityBox,
      slideSize,
      assetDir: options.assetDir,
      irDir: options.irDir,
      deckName: options.deckName,
      pageIndex: options.pageIndex,
      source: candidates[0]?.source
    });
    if (fullFidelityCrop) {
      filterTextBoxesClaimedByAssetOsClosedLoopCrop(page, fidelityBox, slideSize);
      markAssetOsClosedLoopCandidatesObjectified(candidates, "preserved the source-faithful closed-loop diagram by explicit compatibility policy");
      return { shapes: [], textBoxes: [], images: [fullFidelityCrop] };
    }
  }

  const base = "asset-os-closed-loop-cycle";
  const sourceIds = candidates.map((image) => image.id).filter(Boolean);
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: `${base}-native-component`,
    componentOwnerKind: "asset-os-closed-loop-cycle",
    layerSourceIds: sourceIds,
    layerType: "illustration-zone",
    sourceDetector: "product-illustration-segment-crop",
    confidence: 0.78,
    ...assetOsClosedLoopComponentMetadata(detector, extra),
    ...extra
  });
  const shape = (suffix, detector, type, box, style, extra = {}) => ({
    id: `${base}-${suffix}`,
    type,
    box: { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) },
    style,
    source: src(detector, extra)
  });
  const text = (suffix, value, box, font = {}, extra = {}) => {
    const component = assetOsClosedLoopComponentMetadata("asset-os-closed-loop-cycle-native-text", extra);
    return {
      id: `${base}-text-${suffix}`,
      text: value,
      box: { x: round(box.x), y: round(box.y), w: round(box.w), h: round(box.h) },
      font: {
        family: "Microsoft YaHei",
        sizePt: font.sizePt || 12,
        color: font.color || "#222222",
        weight: font.weight || "regular",
        align: font.align || "center",
        valign: font.valign || "middle",
        opacity: 1
      },
      style: { visibility: "visible", opacity: 1, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, fit: "shrink", nativeComponentGroupId: component.nativeComponentGroupId },
      source: src("asset-os-closed-loop-cycle-native-text", extra)
    };
  };
  const sourceBox = (pattern, fallback) => {
    const match = sourceSemanticTextBoxes.find((item) => pattern.test(normalizeCjkText(item?.text || "")));
    const box = match?.box;
    if (!box || ![box.x, box.y, box.w, box.h].every((value) => Number.isFinite(Number(value)))) return fallback;
    return { x: Number(box.x), y: Number(box.y), w: Number(box.w), h: Number(box.h) };
  };
  const layout = resolveAssetOsClosedLoopLayout(visualBox);
  const { x, y, w, h, ring } = layout;
  const cycleShiftX = 0;
  const cycleX = x + Math.max(0, cycleShiftX);
  const cx = layout.center.x;
  const cy = layout.center.y;
  const ringCy = ring.y + ring.h / 2;
  const nodeSize = layout.nodes.demand.size;
  const nodeDefs = [
    { key: "demand", label: "需求理解", color: "#3974EA", labelSide: "left", ...layout.nodes.demand },
    { key: "prd", label: "PRD 生成", color: "#3AB873", labelSide: "right", ...layout.nodes.prd },
    { key: "prototype", label: "原型映射", color: "#3974EA", labelSide: "left", ...layout.nodes.prototype },
    { key: "review", label: "智能评审", color: "#3AB873", labelSide: "right", ...layout.nodes.review }
  ];
  const pictorialCrops = createAssetOsClosedLoopPictorialCrops({
    sourceImage: options.sourceImage,
    regions: layout.pictorialRegions,
    slideSize,
    assetDir: options.assetDir,
    irDir: options.irDir,
    deckName: options.deckName,
    pageIndex: options.pageIndex,
    source: candidates[0]?.source
  });
  const preservePictorialAtoms = pictorialCrops.length > 0;
  // A single linear gradient cannot follow an elliptical path. Rebuild the
  // loop as editable cubic arc segments so the blue left and green right
  // sides retain the source's directional color language.
  const ringSegments = [
    {
      key: "top",
      color: "#3A9A9D",
      segments: [
        { type: "moveTo", points: [{ x: 0.5, y: 0 }] },
        { type: "cubicBezTo", points: [{ x: 0.776, y: 0 }, { x: 1, y: 0.224 }, { x: 1, y: 0.5 }] }
      ]
    },
    {
      key: "right",
      color: "#3AB873",
      segments: [
        { type: "moveTo", points: [{ x: 1, y: 0.5 }] },
        { type: "cubicBezTo", points: [{ x: 1, y: 0.776 }, { x: 0.776, y: 1 }, { x: 0.5, y: 1 }] }
      ]
    },
    {
      key: "bottom",
      color: "#3A9A9D",
      segments: [
        { type: "moveTo", points: [{ x: 0.5, y: 1 }] },
        { type: "cubicBezTo", points: [{ x: 0.224, y: 1 }, { x: 0, y: 0.776 }, { x: 0, y: 0.5 }] }
      ]
    },
    {
      key: "left",
      color: "#3974EA",
      segments: [
        { type: "moveTo", points: [{ x: 0, y: 0.5 }] },
        { type: "cubicBezTo", points: [{ x: 0, y: 0.224 }, { x: 0.224, y: 0 }, { x: 0.5, y: 0 }] }
      ]
    }
  ].map((segment) => shape(`ring-${segment.key}`, "asset-os-closed-loop-cycle-native-ring", "freeform", ring, {
    fill: "none",
    stroke: segment.color,
    strokeWidthPt: 7.5,
    closePath: false,
    freeformSegments: segment.segments
  }, { ringSegment: segment.key, minimumSemanticUnit: true }));
  const shapes = [
    shape("axis-dash-left", "asset-os-closed-loop-cycle-native-axis", "line", lineBox({ x: x + w * 0.16, y: ringCy }, { x: ring.x + ring.w * 0.49, y: ringCy }), { stroke: "#9AA0A6", strokeWidthPt: 1.5, connectorType: "straight", dash: "dash", endArrow: "triangle" }, { role: "input" }),
    shape("axis-dash-right", "asset-os-closed-loop-cycle-native-axis", "line", lineBox({ x: ring.x + ring.w * 0.51, y: ringCy }, { x: cycleX + w * 0.99, y: ringCy }), { stroke: "#9AA0A6", strokeWidthPt: 1.5, connectorType: "straight", dash: "dash" }, { role: "output" }),
    ...ringSegments,
    shape("center-card", "asset-os-closed-loop-cycle-native-center-card", "roundRect", { x: cx - w * 0.107, y: cy - h * 0.097, w: w * 0.214, h: h * 0.195 }, { fill: "#F8FFFB", stroke: "#3AB873", strokeWidthPt: 1.6, radiusPt: 5 }),
    shape("center-card-cap", "asset-os-closed-loop-cycle-native-center-card", "rect", { x: cx - w * 0.107, y: cy - h * 0.097, w: w * 0.214, h: h * 0.030 }, { fill: "#3AB873", stroke: "#3AB873", strokeWidthPt: 0 })
  ];
  const gem = (suffix, gx, gy, size, rotate = 0, color = "#35C776") => {
    shapes.push(shape(`gem-${suffix}`, "asset-os-closed-loop-cycle-native-gem", "diamond", { x: gx - size / 2, y: gy - size / 2, w: size, h: size }, { fill: color, stroke: "#15984E", strokeWidthPt: 0.8, rotate }));
    shapes.push(shape(`gem-shine-${suffix}`, "asset-os-closed-loop-cycle-native-gem-facet", "triangle", { x: gx - size * 0.18, y: gy - size * 0.30, w: size * 0.36, h: size * 0.30 }, { fill: "#7BE09E", stroke: "#7BE09E", strokeWidthPt: 0, rotate }));
  };
  if (!preservePictorialAtoms) [
    [-0.045, -0.020, 0.034, -12],
    [-0.010, -0.035, 0.038, 8],
    [0.030, -0.020, 0.034, 20],
    [-0.060, 0.025, 0.032, 18],
    [-0.020, 0.020, 0.048, 5],
    [0.025, 0.027, 0.040, -16],
    [0.065, 0.025, 0.034, 18]
  ].forEach(([dx, dy, scale, rotate], index) => gem(`center-${index}`, cx + w * dx, cy + h * dy, Math.min(w * scale, h * scale * 1.5), rotate));
  for (const [index, item] of nodeDefs.entries()) {
    const nx = item.x - nodeSize / 2;
    const ny = item.y - nodeSize / 2;
    shapes.push(shape(`node-${item.key}`, "asset-os-closed-loop-cycle-native-node", "ellipse", { x: nx, y: ny, w: nodeSize, h: nodeSize }, {
      fill: "#FFFFFF",
      stroke: item.color,
      strokeWidthPt: 1.5,
      shadow: { color: item.color, alpha: 0.10, blurPt: 3, distancePt: 0, angle: 0 }
    }, { role: item.key, index }));
    const iconBox = {
      x: nx + nodeSize * 0.30,
      y: ny + nodeSize * 0.28,
      w: nodeSize * 0.40,
      h: nodeSize * 0.40
    };
    if (!preservePictorialAtoms) shapes.push(shape(`node-icon-${item.key}`, "asset-os-closed-loop-cycle-native-node-icon", item.key === "review" ? "shield" : item.key === "prd" ? "rect" : "ellipse", iconBox, { fill: item.color, stroke: item.color, strokeWidthPt: 0 }, { role: item.key, index }));
    if (!preservePictorialAtoms && item.key === "demand") {
      shapes.push(shape("node-icon-demand-handle", "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.72, y: iconBox.y + iconBox.h * 0.72 }, { x: iconBox.x + iconBox.w * 1.05, y: iconBox.y + iconBox.h * 1.05 }), { stroke: "#249B66", strokeWidthPt: 2.5, connectorType: "straight" }, { role: item.key, index }));
    }
    if (!preservePictorialAtoms && item.key === "prd") {
      [0.28, 0.48, 0.68].forEach((lineY, detailIndex) => shapes.push(shape(`node-icon-prd-line-${detailIndex}`, "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.28, y: iconBox.y + iconBox.h * lineY }, { x: iconBox.x + iconBox.w * 0.70, y: iconBox.y + iconBox.h * lineY }), { stroke: "#FFFFFF", strokeWidthPt: 1.1, connectorType: "straight" }, { role: item.key, index, detailIndex })));
    }
    if (!preservePictorialAtoms && item.key === "prototype") {
      shapes.push(shape("node-icon-prototype-frame", "asset-os-closed-loop-cycle-native-node-icon-detail", "rect", { x: iconBox.x + iconBox.w * 0.13, y: iconBox.y + iconBox.h * 0.18, w: iconBox.w * 0.74, h: iconBox.h * 0.56 }, { fill: "none", stroke: item.color, strokeWidthPt: 1.3 }, { role: item.key, index }));
      shapes.push(shape("node-icon-prototype-x1", "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.18, y: iconBox.y + iconBox.h * 0.22 }, { x: iconBox.x + iconBox.w * 0.82, y: iconBox.y + iconBox.h * 0.70 }), { stroke: item.color, strokeWidthPt: 1.1, connectorType: "straight" }, { role: item.key, index }));
      shapes.push(shape("node-icon-prototype-x2", "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.82, y: iconBox.y + iconBox.h * 0.22 }, { x: iconBox.x + iconBox.w * 0.18, y: iconBox.y + iconBox.h * 0.70 }), { stroke: item.color, strokeWidthPt: 1.1, connectorType: "straight" }, { role: item.key, index }));
    }
    if (!preservePictorialAtoms && item.key === "review") {
      shapes.push(shape("node-icon-review-check", "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.25, y: iconBox.y + iconBox.h * 0.54 }, { x: iconBox.x + iconBox.w * 0.45, y: iconBox.y + iconBox.h * 0.73 }), { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight" }, { role: item.key, index }));
      shapes.push(shape("node-icon-review-check-2", "asset-os-closed-loop-cycle-native-node-icon-detail", "line", lineBox({ x: iconBox.x + iconBox.w * 0.43, y: iconBox.y + iconBox.h * 0.73 }, { x: iconBox.x + iconBox.w * 0.78, y: iconBox.y + iconBox.h * 0.30 }), { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight" }, { role: item.key, index }));
    }
  }
  const inputFidelityCrop = createAssetOsClosedLoopInputFidelityCrop({
    sourceImage: options.sourceImage,
    visualBox,
    textBoxes: sourceSemanticTextBoxes,
    slideSize,
    assetDir: options.assetDir,
    irDir: options.irDir,
    deckName: options.deckName,
    pageIndex: options.pageIndex,
    source: candidates[0]?.source
  });
  if (inputFidelityCrop) {
    inputFidelityCrop.source = { ...(inputFidelityCrop.source || {}), ...assetOsClosedLoopComponent("input", "fidelity-crop") };
  }
  if (!inputFidelityCrop) {
    const inputCards = [
      { x: 0.02, y: 0.425, w: 0.092, h: 0.052 },
      { x: 0.065, y: 0.49, w: 0.088, h: 0.052 },
      { x: 0.120, y: 0.425, w: 0.088, h: 0.052 },
      { x: 0.120, y: 0.555, w: 0.088, h: 0.052 }
    ];
    inputCards.forEach((card, index) => {
      shapes.push(shape(`input-fragment-${index}`, "asset-os-closed-loop-cycle-native-input-fragment", "roundRect", {
        x: x + w * card.x,
        y: y + h * card.y,
        w: w * card.w,
        h: h * card.h
      }, { fill: "#EEF3F6", stroke: "#B9C6CE", strokeWidthPt: 1.2, radiusPt: 4 }, { index }));
    });
    const inputRoutes = [
      [{ x: 0.112, y: 0.451 }, { x: 0.155, y: 0.451 }],
      [{ x: 0.153, y: 0.516 }, { x: 0.195, y: 0.516 }],
      [{ x: 0.164, y: 0.477 }, { x: 0.164, y: 0.555 }],
      [{ x: 0.120, y: 0.581 }, { x: 0.065, y: 0.581 }]
    ];
    inputRoutes.forEach(([from, to], index) => shapes.push(shape(`input-flow-${index}`, "asset-os-closed-loop-cycle-native-input-route", "line", lineBox({ x: x + w * from.x, y: y + h * from.y }, { x: x + w * to.x, y: y + h * to.y }), { stroke: "#B9C6CE", strokeWidthPt: 1.5, connectorType: "straight", endArrow: index < 2 ? "triangle" : undefined }, { index })));
  }
  const routes = [
    { key: "demand", from: { x: 0.543, y: 0.322 }, to: { x: 0.571, y: 0.359 } },
    { key: "prd", from: { x: 0.796, y: 0.322 }, to: { x: 0.747, y: 0.359 } },
    { key: "prototype", from: { x: 0.520, y: 0.704 }, to: { x: 0.571, y: 0.639 } },
    { key: "review", from: { x: 0.796, y: 0.704 }, to: { x: 0.747, y: 0.639 } }
  ];
  routes.forEach((route, index) => {
    const from = { x: cycleX + w * route.from.x, y: y + h * route.from.y };
    const to = { x: cycleX + w * route.to.x, y: y + h * route.to.y };
    shapes.push(shape(`gem-route-${route.key}`, "asset-os-closed-loop-cycle-native-route", "line", lineBox(from, to), { stroke: "#3AB873", strokeWidthPt: 2, connectorType: "straight", endArrow: "triangle" }, { role: route.key, index }));
    shapes.push(shape(`gem-route-trail-a-${route.key}`, "asset-os-closed-loop-cycle-native-route-trail", "line", lineBox({ x: from.x - Math.sign(to.x - from.x) * 8, y: from.y - 8 }, { x: from.x + (to.x - from.x) * 0.26, y: from.y + (to.y - from.y) * 0.26 - 8 }), { stroke: "#9FE3BF", strokeWidthPt: 1.8, connectorType: "straight" }, { role: route.key, index }));
    shapes.push(shape(`gem-route-trail-b-${route.key}`, "asset-os-closed-loop-cycle-native-route-trail", "line", lineBox({ x: from.x - Math.sign(to.x - from.x) * 14, y: from.y - 14 }, { x: from.x + (to.x - from.x) * 0.22, y: from.y + (to.y - from.y) * 0.22 - 14 }), { stroke: "#9FE3BF", strokeWidthPt: 1.5, connectorType: "straight" }, { role: route.key, index }));
    if (!preservePictorialAtoms) gem(`flow-${route.key}`, from.x + (to.x - from.x) * 0.34, from.y + (to.y - from.y) * 0.34, Math.min(w * 0.035, h * 0.052), index % 2 ? 14 : -12);
  });
  const textBoxes = [
    text("center", "资产自动入库沉淀", sourceBox(/资产自动入库|资产沉淀/, { x: cx - w * 0.13, y: cy + h * 0.055, w: w * 0.26, h: h * 0.055 }), { sizePt: 12.2, color: "#111111", weight: "bold" }, { role: "center" }),
    ...nodeDefs.map((item) => text(item.key, item.label, sourceBox({
      demand: /需求理解/,
      prd: /prd生成/i,
      prototype: /原型映射|原型/,
      review: /智能评审/
    }[item.key], {
      x: item.labelSide === "left" ? item.x - w * 0.18 : item.x + nodeSize * 0.58,
      y: item.y - h * 0.02,
      w: w * 0.14,
      h: h * 0.052
    }), { sizePt: 12.5, color: "#111111", weight: "bold", align: "left" }, { role: item.key })),
    text("input", "多源混沌输入", sourceBox(/多源混沌输入/, { x: x + w * 0.045, y: y + h * 0.61, w: w * 0.19, h: h * 0.055 }), { sizePt: 12.2, color: "#111111", weight: "bold" }, { role: "input" }),
    text("input-sub", "（飞书、代码、零散文档）", sourceBox(/飞书.*代码.*零散文/, { x: x + w * 0.005, y: y + h * 0.685, w: w * 0.23, h: h * 0.048 }), { sizePt: 10, color: "#111111" }, { role: "input-sub" }),
    text("output", "单点独立调用与热插拔", sourceBox(/单点独立调用|热插拔/, { x: cycleX + w * 1.03, y: y + h * 0.435, w: w * 0.30, h: h * 0.05 }), { sizePt: 10, color: "#111111", weight: "bold", align: "left" }, { role: "output" })
  ];
  const claimedTextBounds = {
    x: Math.max(0, x - w * 0.12),
    y: Math.max(0, y - h * 0.08),
    w: Math.min(Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt), w * 1.30),
    h: Math.min(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt), h * 1.18)
  };
  page.textBoxes = (page.textBoxes || []).filter((item) => {
    const label = normalizeCjkText(item?.text || "");
    if (!/需求理解|prd生成|原型映射|智能评审|资产自动入库|资产沉淀|多源混沌输入|单点独立调用|热插拔|飞书|零散文/i.test(label)) return true;
    return !boxCenterInside(item.box, claimedTextBounds);
  });
  markAssetOsClosedLoopCandidatesObjectified(candidates, "rebuilt segmented closed-loop asset refinement diagram as native editable cycle components");
  return { shapes, textBoxes, images: [...(inputFidelityCrop ? [inputFidelityCrop] : []), ...pictorialCrops] };
}

function markAssetOsClosedLoopCandidatesObjectified(candidates = [], outcome) {
  for (const image of candidates) {
    image.source = {
      ...(image.source || {}),
      assetOsClosedLoopCycleObjectified: true,
      assetHubCycleObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      visualAtomOverlayOnly: false,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset OS closed-loop segment"}; ${outcome}`
    };
  }
}

function assetOsClosedLoopComponentMetadata(detector, extra = {}) {
  const value = String(detector || "");
  const requestedRole = String(extra.role || "");
  let role = requestedRole;
  if (/^input(?:-|$)/.test(role) || /native-input-(?:fragment|route)/.test(value)) role = "input";
  else if (/^output(?:-|$)/.test(role)) role = "output";
  else if (!["demand", "prd", "prototype", "review"].includes(role)) role = "core";
  return assetOsClosedLoopComponent(role, requestedRole || value.replace(/^asset-os-closed-loop-cycle-native-/, "") || "detail");
}

function assetOsClosedLoopComponent(role, part) {
  return {
    nativeComponentGroupId: `asset-os-closed-loop-${role}`,
    nativeComponentParentId: "asset-os-closed-loop",
    nativeComponentArchetype: role === "core" ? "closed-loop-hub" : role === "input" || role === "output" ? "closed-loop-endpoint" : "closed-loop-stage",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role,
    nativeComponentPart: part || "detail"
  };
}

function assetOsClosedLoopPictorialRole(key) {
  const value = String(key || "");
  const match = value.match(/^(?:node|route)-(demand|prd|prototype|review)$/);
  return match ? match[1] : "core";
}

function filterTextBoxesClaimedByAssetOsClosedLoopCrop(page = {}, visualBox = {}, slideSize = DEFAULT_SLIDE) {
  const claimedBounds = {
    x: Math.max(0, Number(visualBox.x || 0) - 8),
    y: Math.max(0, Number(visualBox.y || 0) - 8),
    w: Math.min(Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt), Number(visualBox.w || 0) + 16),
    h: Math.min(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt), Number(visualBox.h || 0) + 16)
  };
  page.textBoxes = (page.textBoxes || []).filter((item) => {
    const label = normalizeCjkText(item?.text || "");
    if (!/需求理解|prd生成|原型映射|智能评审|资产自动入库|资产沉淀|多源混沌输入|单点独立调用|热插拔|飞书|零散文/i.test(label)) return true;
    return !boxCenterInside(item.box, claimedBounds);
  });
}

function assetOsClosedLoopFidelityBounds(visualBox = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const height = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);
  const initial = clampPtBoxToSlide(visualBox, slideSize);
  const expanded = {
    x: Math.max(0, initial.x - 90),
    y: Math.max(0, initial.y - 54),
    w: Math.min(width, initial.w + 270),
    h: Math.min(height, initial.h + 108)
  };
  const internalLabelPattern = /需求理解|prd生成|原型映射|智能评审|资产自动入库|资产沉淀|多源混沌输入|单点独立调用|热插拔|飞书|零散文/i;
  const bounds = (textBoxes || []).reduce((acc, item) => {
    if (!internalLabelPattern.test(normalizeCjkText(item?.text || ""))) return acc;
    if (!boxCenterInside(item?.box || {}, expanded)) return acc;
    return unionPtBox(acc, item.box);
  }, initial);
  return clampPtBoxToSlide(bounds, slideSize);
}

function createAssetOsClosedLoopFidelityCrop({ sourceImage, visualBox, slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName, pageIndex, source = {} } = {}) {
  if (!sourceImage || !visualBox || !assetDir) return null;
  const box = clampPtBoxToSlide(visualBox, slideSize);
  if (Number(box.w || 0) < 120 || Number(box.h || 0) < 120) return null;
  ensureDir(assetDir);
  const base = safeIdentifier(`${deckName || "deck"}-p${String(Number(pageIndex || 0) + 1).padStart(2, "0")}-asset-os-closed-loop`, "asset-os-closed-loop");
  const file = path.join(assetDir, `${base}-source-faithful-crop.png`);
  writePng(file, cropPng(sourceImage, ptToPxBox(box, sourceImage, slideSize, 0)));
  return {
    id: `asset-os-closed-loop-cycle-fidelity-crop-${pageIndex || 0}`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),
    box,
    source: reclassifyImageSource(source, box, {
      detector: "asset-os-closed-loop-fidelity-crop",
      strategy: "local-fidelity-crop",
      layerType: "diagram-zone",
      layer: {
        layerType: "diagram-zone",
        detector: "asset-os-closed-loop-fidelity-crop",
        expressionForm: "complex-diagram",
        expressionSubtype: "closed-loop-diagram-with-custom-routes",
        recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
        componentRenderStrategy: {
          mode: "preserve-local-crop",
          implementationMode: "fidelity-threshold-approved-exception",
          visualFidelityBias: "fidelity-first",
          reason: "native closed-loop reconstruction did not meet the source visual fidelity threshold"
        }
      },
      expressionForm: "complex-diagram",
      expressionSubtype: "closed-loop-diagram-with-custom-routes",
      recommendedAction: "preserve-fidelity-crop-until-subtype-rebuilder-is-confident",
      componentRenderStrategy: {
        mode: "preserve-local-crop",
        implementationMode: "fidelity-threshold-approved-exception",
        visualFidelityBias: "fidelity-first",
        reason: "native closed-loop reconstruction did not meet the source visual fidelity threshold"
      },
      largeFidelityCropApproved: true,
      largeFidelityCropApprovalReason: "native closed-loop reconstruction did not meet the source visual fidelity threshold",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      sourceFaithfulCrop: true,
      skipVisualAtomRebuild: true,
      nonEditableReason: "source-faithful closed-loop diagram preserved because native reconstruction did not meet the visual fidelity threshold"
    })
  };
}

function createAssetOsClosedLoopInputFidelityCrop({ sourceImage, visualBox, textBoxes = [], slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName, pageIndex, source = {} } = {}) {
  if (!sourceImage || !visualBox || !assetDir) return null;
  const box = resolveAssetOsClosedLoopLayout(visualBox).inputCrop;
  if (box.w < 32 || box.h < 24) return null;
  ensureDir(assetDir);
  const file = path.join(assetDir, `${deckName || "deck"}-p${String(Number(pageIndex || 0) + 1).padStart(2, "0")}-asset-os-cycle-input.png`);
  const textMasks = (Array.isArray(textBoxes) ? textBoxes : [])
    .filter((item) => /多源混沌输入|飞书|代码|零散文档/.test(normalizeCjkText(item?.text || "")))
    .filter((item) => item?.box && ptBoxOverlapAreaValue(box, item.box) > 0)
    .map((item) => ptToPxBox(expandPtBox(item.box, slideSize, 3, 3), sourceImage, slideSize, 0));
  const cleaned = eraseDarkPixelsInRects(sourceImage, textMasks, { maxLuma: 235 });
  writePng(file, cropPng(cleaned.image, ptToPxBox(box, sourceImage, slideSize, 0)));
  return {
    id: `asset-os-closed-loop-cycle-input-fidelity-crop-${pageIndex || 0}`,
    type: "fidelity-crop",
    assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),
    box,
    source: reclassifyImageSource(source, box, {
      detector: "asset-os-closed-loop-input-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "input-material-fragments",
      recommendedAction: "keep-local-crop",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      textErasedFromCrop: cleaned.erasedPixels > 0,
      erasedTextPixelCount: cleaned.erasedPixels,
      nonEditableReason: "source-faithful input material cluster preserved after native closed-loop reconstruction"
    })
  };
}

function createAssetOsClosedLoopPictorialCrops({ sourceImage, regions = [], slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName, pageIndex, source = {} } = {}) {
  if (!sourceImage || !assetDir || !Array.isArray(regions)) return [];
  ensureDir(assetDir);
  return regions.filter((region) => region?.box?.w >= 8 && region?.box?.h >= 8).map((region, index) => {
    const box = clampPtBoxToSlide(region.box, slideSize);
    const base = safeIdentifier(`${deckName || "deck"}-p${String(Number(pageIndex || 0) + 1).padStart(2, "0")}-asset-os-${region.key || index}`, "asset-os-atom");
    const file = path.join(assetDir, `${base}.png`);
    writePng(file, cropPng(sourceImage, ptToPxBox(box, sourceImage, slideSize, 0)));
    return {
      id: `asset-os-closed-loop-pictorial-${region.key || index}-${pageIndex || 0}`,
      type: "fidelity-crop",
      assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),
      box,
      source: reclassifyImageSource(source, box, {
        detector: "asset-os-closed-loop-pictorial-atom-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: region.key || "closed-loop-pictorial-atom",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        ...assetOsClosedLoopComponent(assetOsClosedLoopPictorialRole(region.key), "pictorial-atom"),
        nonEditableReason: "pictorial icon or gem preserved as the smallest faithful visual unit"
      })
    };
  });
}

module.exports = {createSegmentedAssetOsClosedLoopCycleObjects, assetOsClosedLoopComponent, assetOsClosedLoopComponentMetadata, assetOsClosedLoopFidelityBounds, createAssetOsClosedLoopFidelityCrop, createAssetOsClosedLoopInputFidelityCrop, createAssetOsClosedLoopPictorialCrops, assetOsClosedLoopPictorialRole, filterTextBoxesClaimedByAssetOsClosedLoopCrop, markAssetOsClosedLoopCandidatesObjectified};
