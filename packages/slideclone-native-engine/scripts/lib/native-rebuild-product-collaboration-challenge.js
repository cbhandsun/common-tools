"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createProductCollaborationChallengeFactory(dependencies = {}) {
  const {
    comparisonWarningShapes,
    constrainPtBox,
    cropPng,
    createProductCollaborationProtectedCrops,
    ensureDir,
    expandPtBox,
    isFidelityFirstMinimumVisualUnit,
    lineBox,
    normalizeMatrixLabel,
    protectProductCollaborationChallengeCrop,
    ptToPxBox,
    pxToPtBox,
    round,
    safeIdentifier,
    shouldObjectifyProductCollaborationChallenge,
    writePng
  } = dependencies;
  const required = {
    comparisonWarningShapes,
    constrainPtBox,
    cropPng,
    createProductCollaborationProtectedCrops,
    ensureDir,
    expandPtBox,
    isFidelityFirstMinimumVisualUnit,
    lineBox,
    normalizeMatrixLabel,
    protectProductCollaborationChallengeCrop,
    ptToPxBox,
    pxToPtBox,
    round,
    safeIdentifier,
    shouldObjectifyProductCollaborationChallenge,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild product collaboration challenge dependency ${name} must be a function`);
    }
  }

  function createProductCollaborationChallengeObjects(images = [], rawTextBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
    if (!sourceImage) return { shapes: [], textBoxes: [], images: [] };
    const target = (images || []).find((image) => shouldObjectifyProductCollaborationChallenge(image, rawTextBoxes, slideSize));
    if (!target) return { shapes: [], textBoxes: [], images: [] };
    const semanticSignatureVerified = shouldObjectifyProductCollaborationChallenge(target, rawTextBoxes, slideSize);
    // Recognizing a complete diagram is not proof that primitive reconstruction is faithful.
    // Keep the source visual unit unless a caller deliberately opts into the approximation path.
    if (options.allowNativeApproximation !== true) {
      protectProductCollaborationChallengeCrop(target);
      const protectedCrops = createProductCollaborationProtectedCrops(target, sourceImage, slideSize, options);
      if (protectedCrops.length > 0) {
        target.source = {
          ...(target.source || {}),
          productCollaborationChallengeObjectified: true,
          productCollaborationChallengeProtectedSplit: true
        };
      }
      return { shapes: [], textBoxes: [], images: protectedCrops };
    }
    const layout = inferProductCollaborationChallengeLayout(target, rawTextBoxes, slideSize);
    const blindBoxCrop = createProductCollaborationBlindBoxCrop(target, layout.blindBox, sourceImage, slideSize, options);
    target.source = {
      ...(target.source || {}),
      productCollaborationChallengeObjectified: true,
      productCollaborationChallengeAutoApproved: undefined,
      productCollaborationChallengeSemanticSignatureVerified: semanticSignatureVerified || undefined,
      objectifiedProductChallengeCards: layout.inputCards.length,
      objectifiedProductChallengeWarnings: layout.warningCenters.length,
      productCollaborationChallengeNativeTextBoxes: layout.textBoxes,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "collaboration challenge crop"}; rebuilt fragmented inputs, warning flow, callouts, blind-box output, and bottom banner natively`
    };
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      componentOwnerId: "product-collaboration-challenge-native-component",
      componentOwnerKind: "product-collaboration-challenge",
      layerSourceId: target.id || null,
      confidence: layout.confidence,
      ...extra
    });
    const shapes = [
      ...layout.inputCards.map((card, index) => ({
        id: `${target.id || "product-challenge"}-input-card-${index}`,
        type: "rect",
        box: card.box,
        style: {
          fill: "#276CC4",
          stroke: "#1455A4",
          strokeWidthPt: 1.2,
          rotation: card.rotation,
          shadow: { color: "#000000", alpha: 0.18, blurPt: 6, distancePt: 2, angle: 45 }
        },
        source: source("product-collaboration-challenge-input-card", { cardIndex: index, label: card.label })
      })),
      ...layout.callouts.map((callout, index) => ({
        id: `${target.id || "product-challenge"}-callout-${index}`,
        type: "roundRect",
        box: callout,
        style: {
          fill: "#F16922",
          stroke: "#C84B12",
          strokeWidthPt: 1,
          radiusRatio: 0.08,
          shadow: { color: "#000000", alpha: 0.12, blurPt: 5, distancePt: 1.5, angle: 45 }
        },
        source: source("product-collaboration-challenge-callout", { calloutIndex: index })
      })),
      ...layout.calloutPointers.map((pointer, index) => ({
        id: `${target.id || "product-challenge"}-callout-pointer-${index}`,
        type: "freeform",
        box: pointer.box,
        points: pointer.points,
        style: { fill: "#F16922", stroke: "#C84B12", strokeWidthPt: 1 },
        source: source("product-collaboration-challenge-callout-pointer", { pointerIndex: index })
      })),
      ...layout.flowLines.map((line, index) => ({
        id: `${target.id || "product-challenge"}-flow-line-${index}`,
        type: "freeform",
        box: line.box,
        points: line.points,
        style: { fill: "none", stroke: "#2E73BF", strokeWidthPt: 2.2, lineCap: "round" },
        source: source("product-collaboration-challenge-zigzag-flow", { lineIndex: index })
      })),
      ...layout.warningCenters.flatMap((center, index) =>
        productCollaborationWarningShapes(target, center, index, slideSize, source)
      ),
      ...layout.sparkLines.map((line, index) => ({
        id: `${target.id || "product-challenge"}-spark-${index}`,
        type: "line",
        box: line.box,
        style: { stroke: "#F16922", strokeWidthPt: 2, connectorType: "straight" },
        source: source("product-collaboration-challenge-warning-spark", { sparkIndex: index })
      })),
      ...(blindBoxCrop ? [] : productCollaborationBlindBoxShapes(target, layout.blindBox, slideSize, source)),
      {
        id: `${target.id || "product-challenge"}-bottom-banner`,
        type: "roundRect",
        box: layout.bottomBanner,
        style: {
          fill: "#286ACF",
          stroke: "#1558B5",
          strokeWidthPt: 1,
          radiusRatio: 0.035,
          shadow: { color: "#000000", alpha: 0.08, blurPt: 4, distancePt: 1.2, angle: 45 }
        },
        source: source("product-collaboration-challenge-bottom-banner")
      }
    ];
    return {
      shapes,
      textBoxes: productCollaborationChallengeTextBoxes(target, rawTextBoxes, layout.inputCards, layout.callouts, layout.bottomBanner, {
        preserveBlindBoxCrop: Boolean(blindBoxCrop)
      }),
      images: blindBoxCrop ? [blindBoxCrop] : []
    };
  }

  function shouldAutoAllowProductCollaborationChallengeNativeApproximation(image = {}) {
    if (isFidelityFirstMinimumVisualUnit(image)) return false;
    const source = image.source || {};
    const layer = source.layer || {};
    const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
    const mode = String(strategy.mode || "");
    const visualAtoms = Array.isArray(layer.visualAtoms) ? layer.visualAtoms : [];
    const nativeConfidence = Number(layer.nativeConfidence ?? source.nativeConfidence ?? 0);
    const editBenefit = Number(layer.editBenefit ?? source.editBenefit ?? 0);
    const hasStructureStrategy = /plugin-component-template|native-visual-atom-rebuild|native-matrix/.test(mode);
    const strongVisualEvidence = visualAtoms.length >= 10 || nativeConfidence >= 0.65 || editBenefit >= 0.85;
    return hasStructureStrategy && strongVisualEvidence;
  }

  function inferProductCollaborationChallengeLayout(image, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
    const b = image.box || {};
    const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
    const sx = (n) => b.x + b.w * n;
    const sy = (n) => b.y + b.h * n;
    const sw = (n) => b.w * n;
    const sh = (n) => b.h * n;
    const inputCards = [
      { label: "飞书需求", x: 0.055, y: 0.055, w: 0.122, h: 0.155, rotation: -8 },
      { label: "会议截图", x: 0.125, y: 0.205, w: 0.125, h: 0.155, rotation: 8 },
      { label: "口头反馈", x: 0.035, y: 0.350, w: 0.125, h: 0.155, rotation: -7 },
      { label: "过期旧 PRD", x: 0.135, y: 0.505, w: 0.135, h: 0.155, rotation: 7 }
    ].map((card) => ({
      ...card,
      box: constrainPtBox({ x: sx(card.x), y: sy(card.y), w: sw(card.w), h: sh(card.h) }, bounds)
    }));
    const callouts = [
      { x: 0.340, y: -0.018, w: 0.360, h: 0.090 },
      { x: 0.390, y: 0.720, w: 0.395, h: 0.095 },
      { x: 0.460, y: 0.145, w: 0.380, h: 0.090 }
    ].map((box) => constrainPtBox({ x: sx(box.x), y: sy(box.y), w: sw(box.w), h: sh(box.h) }, bounds));
    const calloutPointers = [
      productChallengePointerBox(callouts[0], { x: sx(0.55), y: sy(0.23) }),
      productChallengePointerBox(callouts[1], { x: sx(0.53), y: sy(0.60) }),
      productChallengePointerBox(callouts[2], { x: sx(0.66), y: sy(0.43) })
    ];
    const flowLines = [
      productChallengePolylineBox([
        [0.31, 0.42], [0.38, 0.42], [0.44, 0.36], [0.48, 0.42], [0.54, 0.42], [0.59, 0.34]
      ], b),
      productChallengePolylineBox([
        [0.31, 0.42], [0.39, 0.58], [0.48, 0.61], [0.54, 0.58], [0.61, 0.62], [0.68, 0.53]
      ], b),
      productChallengePolylineBox([
        [0.60, 0.42], [0.67, 0.42], [0.73, 0.34], [0.77, 0.42], [0.84, 0.42]
      ], b),
      productChallengePolylineBox([
        [0.70, 0.58], [0.77, 0.51], [0.84, 0.53]
      ], b)
    ];
    const warningCenters = [
      { x: sx(0.34), y: sy(0.42), size: sw(0.038) },
      { x: sx(0.43), y: sy(0.31), size: sw(0.042) },
      { x: sx(0.53), y: sy(0.42), size: sw(0.060), big: true },
      { x: sx(0.53), y: sy(0.66), size: sw(0.052), big: true },
      { x: sx(0.62), y: sy(0.40), size: sw(0.038) },
      { x: sx(0.66), y: sy(0.60), size: sw(0.040) },
      { x: sx(0.78), y: sy(0.42), size: sw(0.038) }
    ];
    const sparkLines = warningCenters
      .filter((center) => center.big)
      .flatMap((center, index) => productChallengeSparkLines(center, index));
    const blindBox = constrainPtBox({ x: sx(0.835), y: sy(0.26), w: sw(0.135), h: sh(0.300) }, bounds);
    const bottomBanner = constrainPtBox({ x: slideSize.widthPt * 0.03, y: slideSize.heightPt * 0.868, w: slideSize.widthPt * 0.94, h: slideSize.heightPt * 0.085 }, bounds);
    return {
      inputCards,
      callouts,
      calloutPointers,
      flowLines,
      warningCenters,
      sparkLines,
      blindBox,
      bottomBanner,
      textBoxes: productCollaborationChallengeTextBoxes(image, rawTextBoxes, inputCards, callouts, bottomBanner),
      confidence: 0.86
    };
  }

  function productChallengePointerBox(callout, tip) {
    const left = Math.min(callout.x + callout.w * 0.35, tip.x);
    const top = Math.min(callout.y + callout.h * 0.85, tip.y);
    const right = Math.max(callout.x + callout.w * 0.55, tip.x);
    const bottom = Math.max(callout.y + callout.h * 0.85, tip.y);
    const box = { x: round(left), y: round(top), w: round(right - left), h: round(Math.max(8, bottom - top)) };
    return {
      box,
      points: [
        { x: 0.20, y: 0 },
        { x: 0.46, y: 0 },
        { x: 1, y: 1 },
        { x: 0.34, y: 0.38 }
      ]
    };
  }

  function productChallengePolylineBox(points, baseBox) {
    const abs = points.map(([x, y]) => ({ x: baseBox.x + baseBox.w * x, y: baseBox.y + baseBox.h * y }));
    const minX = Math.min(...abs.map((p) => p.x));
    const minY = Math.min(...abs.map((p) => p.y));
    const maxX = Math.max(...abs.map((p) => p.x));
    const maxY = Math.max(...abs.map((p) => p.y));
    return {
      box: { x: round(minX), y: round(minY), w: round(maxX - minX), h: round(maxY - minY || 1) },
      points: abs.map((p) => ({
        x: (p.x - minX) / Math.max(1, maxX - minX),
        y: (p.y - minY) / Math.max(1, maxY - minY)
      }))
    };
  }

  function productCollaborationWarningShapes(target, center, index, slideSize, source) {
    const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
    return comparisonWarningShapes({ x: center.x, y: center.y }, bounds).map((shape, partIndex) => ({
      id: `${target.id || "product-challenge"}-warning-${index}-${partIndex}`,
      ...shape,
      box: partIndex === 0
        ? constrainPtBox({ x: center.x - center.size / 2, y: center.y - center.size / 2, w: center.size, h: center.size }, bounds)
        : shape.box,
      source: source("product-collaboration-challenge-warning", { warningIndex: index, warningPart: shape.statusKind })
    }));
  }

  function productChallengeSparkLines(center, groupIndex) {
    const offsets = [
      [-22, -18, -10, -8], [18, -18, 8, -8], [-24, 0, -10, 0], [24, 0, 10, 0], [-18, 18, -8, 8], [18, 18, 8, 8]
    ];
    return offsets.map(([x1, y1, x2, y2], index) => ({
      box: lineBox({ x: center.x + x1, y: center.y + y1 }, { x: center.x + x2, y: center.y + y2 }),
      groupIndex,
      index
    }));
  }

  function productCollaborationBlindBoxShapes(target, box, slideSize, source) {
    const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
    return [
      { id: "box-body", type: "rect", box: { x: box.x + box.w * 0.12, y: box.y + box.h * 0.35, w: box.w * 0.76, h: box.h * 0.48 }, fill: "#C9D4E3", stroke: "#AAB8C9" },
      { id: "box-left-flap", type: "freeform", box: { x: box.x, y: box.y + box.h * 0.24, w: box.w * 0.56, h: box.h * 0.30 }, fill: "#E4EAF2", stroke: "#B7C3D1", points: [{ x: 0.15, y: 0.25 }, { x: 1, y: 0 }, { x: 0.78, y: 1 }, { x: 0, y: 0.70 }] },
      { id: "box-right-flap", type: "freeform", box: { x: box.x + box.w * 0.44, y: box.y + box.h * 0.24, w: box.w * 0.56, h: box.h * 0.30 }, fill: "#D9E1EC", stroke: "#B7C3D1", points: [{ x: 0, y: 0 }, { x: 0.85, y: 0.25 }, { x: 1, y: 0.70 }, { x: 0.22, y: 1 }] },
      { id: "box-question", type: "textBackplate", box: { x: box.x + box.w * 0.38, y: box.y - box.h * 0.02, w: box.w * 0.25, h: box.h * 0.38 }, fill: "none", stroke: "none" }
    ].map((shape) => ({
      id: `${target.id || "product-challenge"}-${shape.id}`,
      type: shape.type === "textBackplate" ? "rect" : shape.type,
      box: constrainPtBox(shape.box, bounds),
      ...(shape.points ? { points: shape.points } : {}),
      style: {
        fill: shape.fill,
        stroke: shape.stroke,
        strokeWidthPt: shape.stroke === "none" ? 0 : 1,
        opacity: shape.id === "box-question" ? 0 : 1
      },
      source: source("product-collaboration-challenge-blind-box", { boxPart: shape.id })
    }));
  }

  function createProductCollaborationBlindBoxCrop(target, box, sourceImage, slideSize, options = {}) {
    if (!sourceImage || !options.assetDir) return null;
    ensureDir(options.assetDir);
    const paddedBox = expandPtBox(box, slideSize, 3, 3);
    const pxBox = ptToPxBox(paddedBox, sourceImage, slideSize, 0);
    const crop = cropPng(sourceImage, pxBox);
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-${target.id || "product-challenge"}-blind-box`, "product-challenge-blind-box");
    const file = path.join(options.assetDir, `${base}.png`);
    writePng(file, crop);
    return {
      id: `${target.id || "product-challenge"}-blind-box-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "product-collaboration-challenge-blind-box-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "blind-box-illustration",
        recommendedAction: "preserve-local-crop",
        protectedMinimumUnit: true,
        intentionalMinimumUnitCrop: true,
        nonEditableReason: "complex blind-box illustration retained as a local fidelity crop while the surrounding collaboration flow is rebuilt natively"
      }
    };
  }

  function productCollaborationChallengeTextBoxes(image, rawTextBoxes = [], inputCards = [], callouts = [], bottomBanner, options = {}) {
    const b = image.box || {};
    const inside = (rawTextBoxes || []).filter((item) => {
      const box = item?.box || {};
      const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
      const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
      return cx >= b.x - 8 && cx <= b.x + b.w + 8 && cy >= b.y - 8 && cy <= b.y + b.h + 8;
    });
    const rawByLabel = new Map(inside.map((item) => [normalizeMatrixLabel(item.text), item]));
    const result = [];
    for (let index = 0; index < inputCards.length; index += 1) {
      const card = inputCards[index];
      const text = card.label;
      result.push(productChallengeTextBox(image, text, {
        x: card.box.x + card.box.w * 0.12,
        y: card.box.y + card.box.h * 0.34,
        w: card.box.w * 0.76,
        h: card.box.h * 0.30
      }, "input-card", index, { color: "#FFFFFF", sizePt: 15.5, weight: "bold", align: "center", rotation: card.rotation }));
    }
    const calloutTexts = [
      "协作断层：文档分散，查找与核对成本极高",
      "版本漂移：规则散落，同功能增量极易互相覆盖",
      "评审低效：依赖人工经验，风险往往暴露太晚"
    ];
    calloutTexts.forEach((text, index) => {
      const box = callouts[index];
      result.push(productChallengeTextBox(image, text, {
        x: box.x + box.w * 0.08,
        y: box.y + box.h * 0.23,
        w: box.w * 0.86,
        h: box.h * 0.50
      }, "callout", index, { color: "#FFFFFF", sizePt: index === 2 ? 12.4 : 13.2, weight: "bold" }));
    });
    [
      ["碎片化输入（飞书需求、会议截图、口头反馈、过期旧PRD）", { x: b.x + b.w * 0.02, y: b.y + b.h * 0.722, w: b.w * 0.23, h: b.h * 0.11 }],
      ["盲盒式交付（交付标准完全依赖个人经验，质量极不稳定）", { x: b.x + b.w * 0.78, y: b.y + b.h * 0.724, w: b.w * 0.20, h: b.h * 0.12 }]
    ].forEach(([text, box], index) => {
      result.push(productChallengeTextBox(image, text, box, "caption", index, { color: "#202936", sizePt: 13.6, weight: "bold", align: "left" }));
    });
    const bottomRaw = rawByLabel.get(normalizeMatrixLabel("核心矛盾：瓶颈已不是“缺工具”，而是缺乏一条贯穿需求、文档、原型和评审的标准化资产链路"));
    result.push(productChallengeTextBox(image, bottomRaw?.text || "核心矛盾：瓶颈已不是“缺工具”，而是缺乏一条贯穿需求、文档、原型和评审的标准化资产链路。", {
      x: bottomBanner.x + bottomBanner.w * 0.025,
      y: bottomBanner.y + bottomBanner.h * 0.20,
      w: bottomBanner.w * 0.95,
      h: bottomBanner.h * 0.58
    }, "bottom-banner", 0, { color: "#FFFFFF", sizePt: 17, weight: "bold", align: "left" }));
    if (options.preserveBlindBoxCrop !== true) {
      result.push(productChallengeTextBox(image, "?", { x: b.x + b.w * 0.875, y: b.y + b.h * 0.22, w: b.w * 0.08, h: b.h * 0.18 }, "question", 0, { color: "#9BAABE", sizePt: 58, weight: "bold", align: "center" }));
    }
    return result;
  }

  function productChallengeTextBox(image, text, box, role, index, font = {}) {
    return {
      id: `${image.id || "product-challenge"}-native-text-${role}-${index}`,
      text,
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(box.w),
        h: round(box.h)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: font.sizePt || 14,
        color: font.color || "#111827",
        opacity: 1,
        weight: font.weight || "regular",
        align: font.align || "center",
        valign: "middle"
      },
      style: {
        fit: "shrink",
        rotation: font.rotation || 0,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "product-collaboration-challenge-native-text",
        componentOwnerId: "product-collaboration-challenge-native-component",
        componentOwnerKind: "product-collaboration-challenge",
        layerSourceId: image.id || null,
        role,
        confidence: 0.86
      }
    };
  }

  return {
    createProductCollaborationChallengeObjects,
    inferProductCollaborationChallengeLayout,
    productCollaborationChallengeTextBoxes,
    shouldAutoAllowProductCollaborationChallengeNativeApproximation
  };
}

module.exports = { createProductCollaborationChallengeFactory };
