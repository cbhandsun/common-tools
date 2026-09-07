"use strict";
const path = require("node:path");
const {roundedBox} = require("./prd-generation-shapes");
const {safeComponentToken} = require("./diagram-residual-crops");
const {centerOfBox, boxCenterInside, expandPtBox, ptToPxBox, pxToPtBox} = require("./raster-native-detection");
const {nearestNumericIndex, normalizeTextKey, normalizeStructuredCaseMatrixText, distanceBetweenBoxCenters} = require("./diagram-label-matching");
const {cropPng, writePng} = require("./png");
const {ensureDir} = require("./residual-primitive-erasure");
const {safeIdentifier} = require("./workflow-shape-primitives");
const DEFAULT_SLIDE = {widthPt: 960, heightPt: 540};

function createFourStepLandingPathObjects(page, rawTextBoxes = [], visibleTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyFourStepLandingPathPage(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const target = (page?.images || []).find((image) => isFourStepLandingPathUnderlay(image, slideSize));
  if (!target) return { shapes: [], textBoxes: [] };
  target.source = {
    ...(target.source || {}),
    fourStepLandingPathObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "four-step landing path"}; rebuilt four-step stage cards, arrows, badges, and OCR labels as native editable objects`
  };
  const base = target.id || "four-step-landing-path";
  const src = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.8,
    expressionForm: "process-roadmap",
    expressionSubtype: "four-step-landing-path",
    layerSourceId: target.id || null,
    ...extra
  });
  const shape = (id, detector, type, box, style, extra = {}) => ({
    id: `${base}-${id}`,
    type,
    box: roundedBox(box),
    style,
    source: src(detector, extra)
  });
  const layout = fourStepLandingPathLayout(
    target.box || {},
    rawTextBoxes,
    slideSize,
    target.source?.layer?.diagramUnderstanding?.nodes || []
  );
  const shapes = [];
  const images = [];
  layout.cards.forEach((card, index) => {
    shapes.push(fourStepLandingCardShape(shape, card, index, layout.variant));
    if (index < layout.cards.length - 1) {
      shapes.push(shape(`arrow-${index + 1}`, "four-step-landing-path-native-arrow", "freeform", layout.arrows[index], {
        fill: "#35B966",
        stroke: "#35B966",
        strokeWidthPt: 0.7,
        points: [
          { x: 0, y: 0.26 },
          { x: 0.68, y: 0.26 },
          { x: 0.68, y: 0 },
          { x: 1, y: 0.5 },
          { x: 0.68, y: 1 },
          { x: 0.68, y: 0.74 },
          { x: 0, y: 0.74 }
        ]
      }, { arrowIndex: index }));
    }
  });
  if (layout.variant === "square") {
    shapes.push(shape("flag-pole", "four-step-landing-path-native-flag", "rect", layout.flagPole, { fill: "#F47A1F", stroke: "none", strokeWidthPt: 0 }));
    shapes.push(shape("flag-wave", "four-step-landing-path-native-flag", "freeform", layout.flagWave, {
      fill: "#F47A1F",
      stroke: "#F47A1F",
      strokeWidthPt: 0.5,
      points: [
        { x: 0, y: 0.08 },
        { x: 0.28, y: 0 },
        { x: 0.56, y: 0.14 },
        { x: 1, y: 0.06 },
        { x: 1, y: 0.92 },
        { x: 0.58, y: 1 },
        { x: 0.28, y: 0.86 },
        { x: 0, y: 0.94 }
      ]
    }));
    const badges = [
      { id: "ai-badge", role: "ai-network", card: layout.cards[2] },
      { id: "growth-badge", role: "growth", card: layout.cards[3] }
    ];
    badges.forEach((badge) => {
      const badgeBox = { x: badge.card.x + badge.card.w * 0.82, y: badge.card.y - 26, w: 50, h: 50 };
      const cardIndex = layout.cards.indexOf(badge.card);
      const crop = createFourStepLandingPathBadgeCrop({
        box: badgeBox,
        options,
        slideSize,
        role: badge.role,
        id: `${base}-${badge.id}-crop`,
        component: fourStepLandingNativeComponentMetadata(target, `stage-${cardIndex}`, "badge")
      });
      if (crop) images.push(crop);
      else shapes.push({
        ...shape(badge.id, "four-step-landing-path-native-badge", "ellipse", badgeBox, { fill: "#1D70B8", stroke: "#FFFFFF", strokeWidthPt: 2.4 }),
        source: {
          ...src("four-step-landing-path-native-badge"),
          ...fourStepLandingNativeComponentMetadata(target, `stage-${cardIndex}`, "badge")
        }
      });
    });
  }
  const ocrTextBoxes = mergeFourStepLandingPathBodyFragments(
    fourStepLandingPathTextBoxes(rawTextBoxes, visibleTextBoxes, src, layout),
    layout
  );
  const semanticTextBoxes = fourStepLandingPathSemanticNodeTextBoxes(target, src, rawTextBoxes);
  annotateFourStepLandingVisibleNarratives(visibleTextBoxes, target, layout, slideSize);
  return {
    shapes: annotateFourStepLandingShapes(shapes, target, layout),
    textBoxes: annotateFourStepLandingTextBoxes(
      mergeFourStepLandingPathTextBoxes(ocrTextBoxes, semanticTextBoxes),
      target,
      layout
    ),
    images,
    layout
  };
}

function shouldObjectifyFourStepLandingPathPage(page, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const text = [...(rawTextBoxes || []), ...(page?.textBoxes || [])]
    .map((item) => String(item?.text || ""))
    .join(" ")
    .replace(/\s+/g, "");
  if (!/规模化落地路径/.test(text)) return false;
  if (!/建域仓|Init/.test(text) || !/接系统|Connect/.test(text) || !/固流程|沉淀流程|Embed/.test(text) || !/升平台|持续升级|Scale/.test(text)) return false;
  if (!/(01.*02.*03.*04)|(四步走战略)/.test(text)) return false;
  return (page?.images || []).some((image) => isFourStepLandingPathUnderlay(image, slideSize));
}

function isFourStepLandingPathUnderlay(image, slideSize = DEFAULT_SLIDE) {
  const detector = String(image?.source?.detector || "");
  if (!/visual-cluster-graphic-underlay-crop|content-foreground-graphic-underlay-crop|content-foreground-graphic-underlay-crop|foreground-graphic-underlay-crop/.test(detector)) return false;
  const box = image?.box || {};
  const w = Number(box.w || 0);
  const h = Number(box.h || 0);
  const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return w >= slideSize.widthPt * 0.75
    && h >= slideSize.heightPt * 0.32
    && areaRatio >= 0.32
    && areaRatio <= 0.68;
}

function createFourStepLandingPathBadgeCrop({ box, options = {}, slideSize = DEFAULT_SLIDE, role, id, component = {} } = {}) {
  if (!options.sourceImage || !options.assetDir || !box || Number(box.w || 0) <= 0 || Number(box.h || 0) <= 0) return null;
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-four-step-${role || "badge"}`, "four-step-badge");
  const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, cropPng(options.sourceImage, pxBox));
  return {
    id: id || `${base}-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "four-step-landing-path-badge-crop",
      strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "four-step-landing-path-badge",
      recommendedAction: "keep-local-crop-for-complex-icon",
      role,
      nonEditableReason: "complex four-step roadmap badge preserved as a local crop while stage cards and connectors remain editable",
      ...component
    }
  };
}

function annotateFourStepLandingShapes(shapes = [], target = {}, layout = {}) {
  return (Array.isArray(shapes) ? shapes : []).map((item) => {
    const detector = String(item?.source?.detector || "");
    let role = "";
    let part = detector.replace(/^four-step-landing-path-native-/, "") || "detail";
    if (detector === "four-step-landing-path-native-card") {
      const index = Number(item?.source?.cardIndex);
      role = `stage-${Number.isInteger(index) && index >= 0 && index <= 3 ? index : nearestFourStepCardIndex(item.box, layout.cards)}`;
    } else if (detector === "four-step-landing-path-native-flag") {
      role = "flag";
    } else if (detector === "four-step-landing-path-native-badge") {
      role = `stage-${nearestFourStepCardIndex(item.box, layout.cards)}`;
      part = "badge";
    }
    if (!role) return item;
    return {
      ...item,
      source: {
        ...(item.source || {}),
        ...fourStepLandingNativeComponentMetadata(target, role, part)
      }
    };
  });
}

function annotateFourStepLandingTextBoxes(textBoxes = [], target = {}, layout = {}) {
  return (Array.isArray(textBoxes) ? textBoxes : []).map((item) => {
    const textRole = String(item?.source?.textRole || fourStepLandingPathTextRole(item?.text));
    const role = textRole === "flag" ? "flag" : `stage-${nearestFourStepCardIndex(item?.box, layout.cards)}`;
    const annotated = applyFourStepLandingTextComponent(item, target, role, textRole === "flag" ? "flag-label" : "label");
    if (textRole !== "flag") return annotated;
    const base = target?.id || "four-step-landing-path";
    const flagRegion = layout?.flagWave ? expandPtBox(layout.flagWave, DEFAULT_SLIDE, 12, 12) : null;
    const embeddedNativeShapeId = flagRegion && boxCenterInside(item?.box || {}, flagRegion)
      ? `${base}-flag-wave`
      : `${base}-arrow-2`;
    annotated.source = { ...(annotated.source || {}), embeddedNativeShapeId };
    return annotated;
  });
}

function annotateFourStepLandingVisibleNarratives(textBoxes = [], target = {}, layout = {}, slideSize = DEFAULT_SLIDE) {
  const cards = Array.isArray(layout?.cards) ? layout.cards : [];
  if (cards.length !== 4) return textBoxes;
  const cardBottom = Math.max(...cards.map((card) => Number(card.y || 0) + Number(card.h || 0)));
  const maxY = Number(slideSize?.heightPt || DEFAULT_SLIDE.heightPt) * 0.92;
  const candidates = [];
  for (const item of Array.isArray(textBoxes) ? textBoxes : []) {
    const box = item?.box || {};
    const center = centerOfBox(box);
    if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) continue;
    if (center.y < cardBottom + 4 || center.y > maxY) continue;
    if (/规模化落地路径/.test(String(item?.text || ""))) continue;
    const stageIndex = nearestFourStepCardIndex(box, cards);
    const card = cards[stageIndex];
    if (center.x < Number(card.x || 0) - 28 || center.x > Number(card.x || 0) + Number(card.w || 0) + 28) continue;
    applyFourStepLandingTextComponent(item, target, `stage-${stageIndex}`, "narrative");
    candidates.push({ item, stageIndex });
  }
  const removed = new Set();
  for (let stageIndex = 0; stageIndex < cards.length; stageIndex += 1) {
    const group = candidates
      .filter((candidate) => candidate.stageIndex === stageIndex)
      .map((candidate) => candidate.item)
      .sort((left, right) => Number(left.box?.y || 0) - Number(right.box?.y || 0)
        || Number(left.box?.x || 0) - Number(right.box?.x || 0));
    if (group.length < 2) continue;
    const targetBox = group[0];
    const left = Math.min(...group.map((item) => Number(item.box?.x || 0)));
    const top = Math.min(...group.map((item) => Number(item.box?.y || 0)));
    const right = Math.max(...group.map((item) => Number(item.box?.x || 0) + Number(item.box?.w || 0)));
    const bottom = Math.max(...group.map((item) => Number(item.box?.y || 0) + Number(item.box?.h || 0)));
    const text = mergeFourStepNarrativeFragments(group.map((item) => item.text));
    const splitAt = text.indexOf("：");
    const evidenceBox = roundedBox({ x: left, y: top, w: right - left, h: bottom - top });
    targetBox.text = text;
    targetBox.box = evidenceBox;
    targetBox.font = {
      ...(targetBox.font || {}),
      family: "SimSun",
      sizePt: 13.5,
      weight: "regular",
      color: "#1F1F1F",
      align: "left",
      valign: "top",
      lineHeightMultiple: 1.32
    };
    targetBox.style = {
      ...(targetBox.style || {}),
      wrap: true,
      fit: "shrink",
      preserveTypography: true,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    };
    targetBox.runs = splitAt > 0
      ? [
        { text: text.slice(0, splitAt + 1), font: { family: "SimHei", weight: "bold" } },
        { text: text.slice(splitAt + 1), font: { family: "SimSun", weight: "regular" } }
      ]
      : null;
    targetBox.source = {
      ...(targetBox.source || {}),
      detector: "four-step-landing-path-native-narrative",
      mergedOcrFragments: group.length,
      evidenceBox,
      preserveTypography: true
    };
    group.slice(1).forEach((item) => removed.add(item));
  }
  if (removed.size > 0) {
    const retained = textBoxes.filter((item) => !removed.has(item));
    textBoxes.splice(0, textBoxes.length, ...retained);
  }
  return textBoxes;
}

function mergeFourStepNarrativeFragments(fragments = []) {
  return fragments
    .map((fragment) => String(fragment || "").trim())
    .filter(Boolean)
    .join("")
    .replace(/([\u3400-\u9FFF])([A-Za-z])/g, "$1 $2")
    .replace(/([A-Za-z])([\u3400-\u9FFF])/g, "$1 $2")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function applyFourStepLandingTextComponent(item, target, role, part) {
  const component = fourStepLandingNativeComponentMetadata(target, role, part);
  item.style = { ...(item.style || {}), nativeComponentGroupId: component.nativeComponentGroupId };
  item.source = { ...(item.source || {}), ...component };
  return item;
}

function nearestFourStepCardIndex(box, cards = []) {
  const x = centerOfBox(box || {}).x;
  const centers = (Array.isArray(cards) ? cards : []).map((card) => centerOfBox(card).x);
  return nearestNumericIndex(x, centers);
}

function fourStepLandingNativeComponentMetadata(target, role, part) {
  const base = safeComponentToken(target?.id || "four-step-landing-path");
  const safeRole = safeComponentToken(role);
  return {
    nativeComponentGroupId: `${base}-four-step-${safeRole}`,
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentArchetype: "four-step-roadmap",
    nativeComponentRole: safeRole,
    nativeComponentPart: safeComponentToken(part)
  };
}

function fourStepLandingPathLayout(box = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, semanticNodes = []) {
  const normalizedBox = {
    x: Number(box.x || slideSize.widthPt * 0.08),
    y: Number(box.y || slideSize.heightPt * 0.25),
    w: Number(box.w || slideSize.widthPt * 0.84),
    h: Number(box.h || slideSize.heightPt * 0.52)
  };
  const variant = normalizedBox.h >= slideSize.heightPt * 0.55 ? "chevron" : "square";
  if (variant === "square") {
    // Square-stage roadmaps reserve a wider, labelled midpoint between steps 02 and 03.
    // Treating all gaps uniformly turns that label into an unrelated cycle-shaped atom.
    const cardW = normalizedBox.w * 0.163;
    const cardH = normalizedBox.h * 0.73;
    const cardY = normalizedBox.y + normalizedBox.h * 0.23;
    const xRatios = [0.008, 0.251, 0.566, 0.811];
    const cards = xRatios.map((ratio, index) => ({
      x: normalizedBox.x + normalizedBox.w * ratio,
      y: cardY,
      w: cardW,
      h: cardH,
      semanticNode: semanticNodes.find((node) => String(node?.text || "") === `0${index + 1}`) || null
    }));
    const gapBoxes = [
      { x: normalizedBox.x + normalizedBox.w * 0.181, w: normalizedBox.w * 0.055 },
      { x: normalizedBox.x + normalizedBox.w * 0.423, w: normalizedBox.w * 0.137 },
      { x: normalizedBox.x + normalizedBox.w * 0.737, w: normalizedBox.w * 0.055 }
    ];
    const arrows = gapBoxes.map((gap) => ({
      x: gap.x,
      y: cardY + cardH * 0.38,
      w: gap.w,
      h: Math.max(34, cardH * 0.24)
    }));
    const flagLabel = [...(rawTextBoxes || []), ...(semanticNodes || [])]
      .filter((item) => /克服标准缺口/.test(String(item?.text || "")))
      .filter((item) => Number(item?.box?.y || 0) < cardY + cardH * 0.45)
      .sort((left, right) => Number(left?.box?.y || 0) - Number(right?.box?.y || 0))[0];
    const flagWave = flagLabel?.box
      ? {
        x: Number(flagLabel.box.x || 0) - 8,
        y: Number(flagLabel.box.y || 0) - 15,
        w: Math.max(92, Number(flagLabel.box.w || 0) + 16),
        h: 58
      }
      : { x: normalizedBox.x + normalizedBox.w * 0.515, y: normalizedBox.y + normalizedBox.h * 0.08, w: 92, h: 58 };
    const flagPole = { x: flagWave.x - 7, y: flagWave.y, w: 5, h: 102 };
    return { box: normalizedBox, cards, arrows, variant, flagWave, flagPole };
  }
  if (variant === "chevron") {
    // This source family uses uneven stage widths and a cropped left contour.
    // The OCR labels are good anchors; uniform division shifts stage one by
    // about 40pt and makes every native label look detached from its card.
    const cards = [
      { x: normalizedBox.x + slideSize.widthPt * 0.044, w: slideSize.widthPt * 0.188 },
      { x: normalizedBox.x + slideSize.widthPt * 0.246, w: slideSize.widthPt * 0.205 },
      { x: normalizedBox.x + slideSize.widthPt * 0.479, w: slideSize.widthPt * 0.207 },
      { x: normalizedBox.x + slideSize.widthPt * 0.716, w: slideSize.widthPt * 0.21 }
    ].map((item) => ({
      ...item,
      y: normalizedBox.y + normalizedBox.h * 0.12,
      h: normalizedBox.h * 0.76
    }));
    const arrows = cards.slice(0, 3).map((card, index) => {
      const next = cards[index + 1];
      const gap = Math.max(8, Number(next.x) - (Number(card.x) + Number(card.w)));
      return {
        x: card.x + card.w + gap * 0.14,
        y: card.y + card.h * 0.42,
        w: Math.max(24, gap * 0.9),
        h: Math.max(34, card.h * 0.24)
      };
    });
    return { box: normalizedBox, cards, arrows, variant };
  }
  const gap = 74;
  const cardY = variant === "chevron" ? normalizedBox.y + normalizedBox.h * 0.12 : normalizedBox.y + normalizedBox.h * 0.20;
  const cardH = variant === "chevron" ? normalizedBox.h * 0.76 : normalizedBox.h * 0.56;
  const cardW = (normalizedBox.w - gap * 3) / 4;
  const cards = [0, 1, 2, 3].map((index) => ({
    x: normalizedBox.x + index * (cardW + gap),
    y: cardY,
    w: cardW,
    h: cardH
  }));
  const arrows = cards.slice(0, 3).map((card, _index) => ({
    x: card.x + card.w + gap * 0.16,
    y: card.y + card.h * (variant === "chevron" ? 0.42 : 0.38),
    w: Math.max(24, gap * 0.68),
    h: Math.max(34, card.h * 0.24)
  }));
  return { box: normalizedBox, cards, arrows, variant };
}

function fourStepLandingCardShape(shape, card, index, variant) {
  const fill = variant === "square"
    ? "#1D70B8"
    : index === 0 ? "#1E75BD" : index === 1 ? "#1B66A7" : index === 2 ? "#185891" : "#124A7D";
  if (variant === "chevron") {
    return shape(`card-${index + 1}`, "four-step-landing-path-native-card", "freeform", card, {
      fill,
      stroke: "#DFF4F7",
      strokeWidthPt: 1.2,
      shadow: { type: "outer", color: "#7EAFC3", opacity: 0.18, blurPt: 2.2, distancePt: 1.2, angle: 45 },
      points: [
        { x: 0.03, y: 0 },
        { x: 0.94, y: 0 },
        { x: 1, y: 0.5 },
        { x: 0.94, y: 1 },
        { x: 0, y: 1 },
        { x: 0.07, y: 0.5 }
      ]
    }, { cardIndex: index, variant });
  }
  return shape(`card-${index + 1}`, "four-step-landing-path-native-card", "rect", card, {
    fill,
    stroke: fill,
    strokeWidthPt: 0.8,
    shadow: { type: "outer", color: "#6E9DBE", opacity: 0.12, blurPt: 1.6, distancePt: 0.8, angle: 45 }
  }, { cardIndex: index, variant });
}

function fourStepLandingPathTextBoxes(rawTextBoxes = [], _visibleTextBoxes = [], src = () => ({}), layout = {}) {
  const pageText = (rawTextBoxes || []).map((item) => String(item?.text || "")).join(" ");
  const squareVariant = /四步走战略/.test(pageText);
  return (rawTextBoxes || [])
    .filter((item) => isFourStepLandingPathDiagramText(item) || isFourStepLandingPathCardText(item, layout))
    .map((item, index) => {
      const role = fourStepLandingPathTextRole(item.text);
      const next = JSON.parse(JSON.stringify(item));
      next.id = `four-step-landing-path-text-${index}`;
      next.box = roundedBox(next.box || {});
      const card = layout?.cards?.[nearestFourStepCardIndex(next.box, layout.cards)];
      if ((role === "heading" || role === "subheading") && card) {
        next.box = roundedBox({
          ...next.box,
          x: card.x + 14,
          w: Math.max(40, card.w - 28),
          h: Math.max(next.box.h, role === "heading" ? 27 : 22)
        });
      }
      next.font = {
        ...(next.font || {}),
        family: "Microsoft YaHei",
        opacity: 1,
        color: fourStepLandingPathTextColor(role, next.box, squareVariant),
        weight: role === "number" || role === "heading" || role === "subheading" ? "bold" : "regular",
        align: role === "number" || role === "heading" || role === "subheading" ? "center" : "left",
        valign: "middle",
        sizePt: fourStepLandingPathFontSize(role, next.font?.sizePt)
      };
      next.style = {
        ...(next.style || {}),
        visibility: "visible",
        opacity: 1,
        fit: "shrink",
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      };
      next.source = src("four-step-landing-path-native-text", {
        textRole: role,
        originalOpacity: item?.font?.opacity ?? null
      });
      return next;
    });
}

function fourStepLandingPathSemanticNodeTextBoxes(image = {}, src = () => ({}), rawTextBoxes = []) {
  const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)
    ? image.source.layer.diagramUnderstanding.nodes
    : [];
  return nodes
    .filter((node) => node?.box && isFourStepLandingPathDiagramText(node))
    .map((node, index) => {
      const role = fourStepLandingPathTextRole(node.text);
      const evidence = findFourStepLandingPathTextEvidence(node, rawTextBoxes);
      if (evidence) return null;
      return {
        id: node.id || `${image.id || "four-step-landing-path"}-semantic-text-${index}`,
        text: normalizeStructuredCaseMatrixText(node.text),
        box: roundedBox(node.box || {}),
        font: {
          family: role === "number" ? "Microsoft YaHei" : "SimHei",
          opacity: 1,
          color: fourStepLandingPathTextColor(role, node.box, true),
          weight: role === "number" || role === "heading" ? "bold" : "regular",
          align: "center",
          valign: "middle",
          sizePt: fourStepLandingPathFontSize(role, evidence?.font?.sizePt ?? node.font?.sizePt)
        },
        style: {
          visibility: "visible",
          opacity: 1,
          fit: "shrink",
          marginLeftPt: 0,
          marginRightPt: 0,
          marginTopPt: 0,
          marginBottomPt: 0
        },
        source: src("four-step-landing-path-native-text", {
          textRole: role,
          semanticTextSource: true,
          semanticNodeId: node.id || "",
          originalOpacity: node?.font?.opacity ?? null
        })
      };
    })
    .filter(Boolean);
}

function findFourStepLandingPathTextEvidence(node = {}, rawTextBoxes = []) {
  const targetText = normalizeTextKey(node?.text);
  const targetBox = node?.box || {};
  return (Array.isArray(rawTextBoxes) ? rawTextBoxes : [])
    .filter((item) => normalizeTextKey(item?.text) === targetText)
    .sort((left, right) => {
      const leftDistance = distanceBetweenBoxCenters(left?.box, targetBox);
      const rightDistance = distanceBetweenBoxCenters(right?.box, targetBox);
      return leftDistance - rightDistance;
    })[0] || null;
}

function isFourStepLandingPathCardText(textBox = {}, layout = {}) {
  const cards = Array.isArray(layout?.cards) ? layout.cards : [];
  if (cards.length !== 4) return false;
  const box = textBox?.box || {};
  const center = centerOfBox(box);
  return cards.some((card) => center.x >= Number(card.x || 0) - 20
    && center.x <= Number(card.x || 0) + Number(card.w || 0) + 20
    && center.y >= Number(card.y || 0) + 6
    && center.y <= Number(card.y || 0) + Number(card.h || 0) + 8);
}

function filterTextBoxesClaimedByFourStepLandingPath(textBoxes = [], layout = {}) {
  return (Array.isArray(textBoxes) ? textBoxes : [])
    .filter((item) => !isFourStepLandingPathDiagramText(item) && !isFourStepLandingPathCardText(item, layout));
}

function mergeFourStepLandingPathTextBoxes(...groups) {
  const result = [];
  for (const group of groups || []) {
    for (const item of group || []) {
      const text = normalizeStructuredCaseMatrixText(item?.text);
      if (!text) continue;
      const box = item?.box || {};
      const alreadyClaimed = result.some((existing) =>
        normalizeStructuredCaseMatrixText(existing?.text) === text
        && fourStepLandingPathTextBoxesOverlap(existing?.box, box)
      );
      if (alreadyClaimed) continue;
      result.push(item);
    }
  }
  return result;
}

function mergeFourStepLandingPathBodyFragments(textBoxes = [], layout = {}) {
  const cards = Array.isArray(layout?.cards) ? layout.cards : [];
  if (cards.length !== 4) return textBoxes;
  const retained = [];
  for (let cardIndex = 0; cardIndex < cards.length; cardIndex += 1) {
    const card = cards[cardIndex];
    const body = (Array.isArray(textBoxes) ? textBoxes : [])
      .filter((item) => fourStepLandingPathTextRole(item?.text) === "body")
      .filter((item) => nearestFourStepCardIndex(item?.box, cards) === cardIndex)
      .filter((item) => centerOfBox(item?.box || {}).y >= Number(card.y || 0) + Number(card.h || 0) * 0.62)
      .sort((left, right) => Number(left?.box?.y || 0) - Number(right?.box?.y || 0)
        || Number(left?.box?.x || 0) - Number(right?.box?.x || 0));
    const bodySet = new Set(body);
    retained.push(...(Array.isArray(textBoxes) ? textBoxes : []).filter((item) => !bodySet.has(item) && nearestFourStepCardIndex(item?.box, cards) === cardIndex));
    if (body.length === 0) continue;
    const first = JSON.parse(JSON.stringify(body[0]));
    const top = Math.min(...body.map((item) => Number(item?.box?.y || 0)));
    const bottom = Math.max(...body.map((item) => Number(item?.box?.y || 0) + Number(item?.box?.h || 0)));
    const innerLeft = Number(card.x || 0) + 26;
    const sourceLeft = Math.min(...body.map((item) => Number(item?.box?.x || 0)));
    const x = Math.max(innerLeft, sourceLeft);
    first.id = `${first.id}-merged-card-body`;
    first.text = body.map((item) => String(item?.text || "").trim()).filter(Boolean).join("\n");
    first.box = roundedBox({ x, y: top, w: Math.max(36, Number(card.x || 0) + Number(card.w || 0) - x - 16), h: Math.max(20, bottom - top) });
    first.font = {
      ...(first.font || {}),
      family: "Microsoft YaHei",
      sizePt: 13,
      weight: "regular",
      align: "left",
      valign: "top",
      lineHeightMultiple: 1.16
    };
    first.style = {
      ...(first.style || {}),
      wrap: true,
      fit: "shrink",
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    };
    first.source = {
      ...(first.source || {}),
      mergedOcrFragments: body.length,
      textRole: "body",
      semanticCardIndex: cardIndex
    };
    retained.push(first);
  }
  return retained;
}

function fourStepLandingPathTextBoxesOverlap(left = {}, right = {}) {
  const leftCenter = centerOfBox(left);
  const rightCenter = centerOfBox(right);
  const maxHorizontalDistance = Math.max(Number(left.w || 0), Number(right.w || 0)) * 0.55 + 8;
  const maxVerticalDistance = Math.max(Number(left.h || 0), Number(right.h || 0)) * 0.55 + 6;
  return Math.abs(leftCenter.x - rightCenter.x) <= maxHorizontalDistance
    && Math.abs(leftCenter.y - rightCenter.y) <= maxVerticalDistance;
}

function isFourStepLandingPathDiagramText(textBox) {
  const text = String(textBox?.text || "").trim();
  if (!text || /^(TheDigitalArchitect|规模化落地路径)/.test(text)) return false;
  return /^(01|02|03|04)$|建域仓|接系统|固流程|升平台|统一资产容器|扩展业务入口|AI链路固化|集中演进|一键初始化|先建域仓|再接系统|沉淀流程|持续升级|选择高价值|连接现有系统|技能|sync-prds|骨架|常工作流|能力|仓库|业务域|域内|深度嵌入|运行时|初始化|入口|菜单|链路|边际成本|克服标准缺口/.test(text);
}

function fourStepLandingPathTextRole(text) {
  const value = String(text || "");
  if (/^(01|02|03|04)$/.test(value)) return "number";
  if (/建域仓|接系统|固流程|升平台/.test(value)) return "heading";
  if (/统一资产容器|扩展业务入口|AI链路固化|固化AI链路|集中演进|一键初始化/.test(value)) return "subheading";
  if (/克服标准缺口/.test(value)) return "flag";
  return "body";
}

function fourStepLandingPathTextColor(role, box = {}, squareVariant = false) {
  if (role === "flag") return "#FFFFFF";
  if (squareVariant && (role === "body" || Number(box.y || 0) >= 340)) return "#111111";
  return "#FFFFFF";
}

function fourStepLandingPathFontSize(role, fallback) {
  if (role === "number") return Math.max(26, Number(fallback || 0));
  if (role === "heading") return Math.min(16, Math.max(13.5, Number(fallback || 0)));
  if (role === "subheading") return Math.min(16, Math.max(13, Number(fallback || 0)));
  if (role === "flag") return Math.max(11, Number(fallback || 0));
  return Math.min(14, Math.max(10.5, Number(fallback || 12)));
}

module.exports = {createFourStepLandingPathObjects, annotateFourStepLandingShapes, fourStepLandingNativeComponentMetadata, nearestFourStepCardIndex, annotateFourStepLandingTextBoxes, applyFourStepLandingTextComponent, fourStepLandingPathTextRole, annotateFourStepLandingVisibleNarratives, mergeFourStepNarrativeFragments, createFourStepLandingPathBadgeCrop, fourStepLandingCardShape, fourStepLandingPathLayout, fourStepLandingPathSemanticNodeTextBoxes, findFourStepLandingPathTextEvidence, distanceBetweenBoxCenters, normalizeTextKey, fourStepLandingPathFontSize, fourStepLandingPathTextColor, isFourStepLandingPathDiagramText, normalizeStructuredCaseMatrixText, fourStepLandingPathTextBoxes, isFourStepLandingPathCardText, isFourStepLandingPathUnderlay, mergeFourStepLandingPathBodyFragments, mergeFourStepLandingPathTextBoxes, fourStepLandingPathTextBoxesOverlap, shouldObjectifyFourStepLandingPathPage, filterTextBoxesClaimedByFourStepLandingPath};
