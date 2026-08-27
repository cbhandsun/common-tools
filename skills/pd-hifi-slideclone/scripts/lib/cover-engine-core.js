"use strict";

const CARD_LABELS = Object.freeze(["文档", "原型", "代码"]);

function createCoverEngineCoreToolkit(operations = {}) {
  const ops = validateOperations(operations);

  function createShapes(images = [], textBoxes = [], sourceImage = null, slideSize = ops.defaultSlide) {
    if (!sourceImage) return [];
    const effectiveSlideSize = normalizeSlideSize(slideSize, ops.defaultSlide);
    const safeTextBoxes = Array.isArray(textBoxes) ? textBoxes : [];
    const shapes = [];
    let matchedCover = false;
    for (const image of Array.isArray(images) ? images : []) {
      if (!shouldObjectify(image, safeTextBoxes)) continue;
      const diagram = infer(image, safeTextBoxes, effectiveSlideSize, sourceImage);
      if (!diagram) continue;
      matchedCover = true;
      image.source = {
        ...(image.source || {}),
        coverEngineCoreObjectified: true,
        objectifiedCoverEngineCards: diagram.cards.length,
        coverEngineCoreNativeTextBoxes: diagram.cards.map((card) => cardTextBox(card, image.id)),
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt as native cover engine core diagram`
      };
      shapes.push(shape(image, "native-shield", "freeform", diagram.shield, {
        fill: "#087AD8",
        gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#2F8DE8" }, { position: 1, color: "#0870C8" }] },
        stroke: "none",
        strokeWidthPt: 0
      }, "cover-engine-core-native-shield", componentMetadata("core", "outer-shield"), shieldPoints(diagram.shield, false)));
      shapes.push(shape(image, "native-inner", "freeform", diagram.innerShield, {
        fill: "#2F97EA",
        gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#4AA7F2" }, { position: 1, color: "#278DDF" }] },
        stroke: "none",
        strokeWidthPt: 0
      }, "cover-engine-core-native-inner", componentMetadata("core", "inner-shield"), shieldPoints(diagram.innerShield, true)));
      shapes.push(shape(image, "native-axis", "line", diagram.axis, {
        stroke: "#18B86E",
        strokeWidthPt: 22,
        connectorType: "straight",
        startArrow: "triangle",
        endArrow: "triangle"
      }, "cover-engine-core-native-axis", componentMetadata("core", "delivery-axis")));
      diagram.cards.forEach((card, index) => shapes.push(shape(image, `native-card-${index}`, "rect", card.box, {
        fill: "#FFFFFF",
        stroke: "#2375C8",
        strokeWidthPt: 3,
        shadow: { color: "#000000", alpha: 0.12, blurPt: 8, distancePt: 2, angle: 45 }
      }, "cover-engine-core-native-card", {
        label: card.label,
        ...componentMetadata(`card-${card.label}`, "card")
      })));
    }
    if (matchedCover) {
      ops.normalizeChromeTextBoxes(safeTextBoxes, sourceImage, effectiveSlideSize);
      const avatar = ops.detectAvatarBox(sourceImage, effectiveSlideSize);
      if (positiveBox(avatar)) {
        shapes.push({
          id: "cover-engine-core-native-avatar-circle",
          type: "ellipse",
          box: avatar,
          style: { fill: "#FF5A17", stroke: "#F04B10", strokeWidthPt: 0.8 },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "cover-engine-core-native-avatar",
            layerSourceId: "cover-engine-core-page-chrome",
            evidenceBox: avatar,
            ...componentMetadata("avatar", "circle")
          }
        });
      }
    }
    return shapes;
  }

  function shouldObjectify(image, textBoxes = []) {
    const layer = image?.source?.layer || {};
    const box = image?.box || {};
    if (image?.source?.detector !== "foreground-graphic-crop" || layer.layerType !== "diagram-zone") return false;
    if (layer.recommendedAction !== "split-native-with-residual-crop" && layer.recommendedAction !== "preserve-local-crop") return false;
    if (!boundedDiagramBox(box, ops.defaultSlide)) return false;
    const aspect = box.w / box.h;
    if (aspect < 0.75 || aspect > 1.05 || box.w < 300 || box.h < 360) return false;
    const neighborhood = ops.expandPtBox(box, ops.defaultSlide, 8, 8);
    const labels = new Set((Array.isArray(textBoxes) ? textBoxes : [])
      .filter((item) => item?.box && ops.boxCenterInside(item.box, neighborhood))
      .map((item) => String(item.text || "").trim()));
    return CARD_LABELS.every((label) => labels.has(label));
  }

  function infer(image, textBoxes = [], slideSize = ops.defaultSlide, sourceImage = null) {
    const box = image?.box;
    if (!boundedDiagramBox(box, ops.defaultSlide)) return null;
    const effectiveSlideSize = normalizeSlideSize(slideSize, ops.defaultSlide);
    const neighborhood = ops.expandPtBox(box, effectiveSlideSize, 8, 8);
    const labelBoxes = new Map((Array.isArray(textBoxes) ? textBoxes : [])
      .filter((item) => item?.box && ops.boxCenterInside(item.box, neighborhood))
      .map((item) => [String(item.text || "").trim(), item]));
    const cards = CARD_LABELS.map((label) => {
      const evidence = labelBoxes.get(label);
      if (!evidence) return null;
      const detected = ops.detectCardBox(sourceImage, effectiveSlideSize, evidence.box, box);
      return { label, evidence, box: positiveBox(detected) ? detected : cardBox(label, evidence.box, box, effectiveSlideSize) };
    }).filter(Boolean);
    if (cards.length !== CARD_LABELS.length) return null;
    const detectedAxis = ops.detectAxis(sourceImage, effectiveSlideSize, box);
    const validAxis = positiveBox(detectedAxis);
    const centerX = validAxis ? detectedAxis.x + detectedAxis.w / 2 : box.x + box.w * 0.50;
    return {
      shield: ops.expandPtBox({ x: box.x + box.w * 0.21, y: box.y + box.h * 0.13, w: box.w * 0.60, h: box.h * 0.66 }, effectiveSlideSize, 0, 0),
      innerShield: ops.expandPtBox({ x: box.x + box.w * 0.30, y: box.y + box.h * 0.24, w: box.w * 0.42, h: box.h * 0.46 }, effectiveSlideSize, 0, 0),
      axis: validAxis
        ? { x: ops.round(centerX), y: ops.round(detectedAxis.y + detectedAxis.h), w: 0.1, h: ops.round(-detectedAxis.h) }
        : { x: ops.round(centerX), y: ops.round(box.y + box.h * 0.98), w: 0.1, h: ops.round(-box.h * 0.94) },
      cards
    };
  }

  function cardTextBox(card, layerSourceId = null) {
    const box = card.box;
    const evidence = card.evidence?.box;
    return {
      id: `cover-engine-core-native-label-${card.label}`,
      role: "diagram-label",
      text: card.label,
      box: evidence || { x: ops.round(box.x + box.w * 0.18), y: ops.round(box.y + box.h * 0.33), w: ops.round(box.w * 0.64), h: ops.round(box.h * 0.28) },
      font: { family: "Microsoft YaHei", sizePt: 22, color: "#08223D", weight: "regular", align: evidence ? "left" : "center", valign: "middle" },
      style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, fit: "shrink" },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "cover-engine-core-native-label",
        layerSourceId: layerSourceId || null,
        evidenceBox: evidence || undefined,
        ...componentMetadata(`card-${card.label}`, "label")
      }
    };
  }

  function cardBox(label, textBox, imageBox, slideSize = ops.defaultSlide) {
    const baseW = label === "文档" ? imageBox.w * 0.28 : imageBox.w * 0.30;
    const baseH = label === "代码" ? imageBox.h * 0.25 : imageBox.h * 0.26;
    return ops.expandPtBox({
      x: textBox.x + textBox.w / 2 - baseW / 2,
      y: textBox.y + textBox.h / 2 - baseH / 2,
      w: baseW,
      h: baseH
    }, slideSize, 0, 0);
  }

  return Object.freeze({ cardTextBox, componentMetadata, createShapes, infer, shouldObjectify });

  function shape(image, suffix, type, box, style, detector, extra = {}, points = null) {
    return {
      id: `${image.id || "cover-engine"}-${suffix}`,
      type,
      box,
      ...(points ? { points } : {}),
      style,
      source: { editable: true, nativeRebuild: true, detector, layerSourceId: image.id || null, ...extra }
    };
  }
}

function componentMetadata(group, part) {
  const safeGroup = String(group || "core").replace(/[^a-z0-9\u4e00-\u9fff_-]+/gi, "-");
  return {
    nativeComponentInstance: true,
    nativeComponentGroupId: `cover-engine-core-${safeGroup}`,
    nativeComponentArchetype: "cover-engine-core",
    nativeComponentRole: part
  };
}

function shieldPoints(box, inner = false) {
  const shoulder = inner ? 0.2 : 0.18;
  return [
    { x: box.x + box.w * 0.5, y: box.y },
    { x: box.x + box.w, y: box.y + box.h * shoulder },
    { x: box.x + box.w * 0.94, y: box.y + box.h * 0.58 },
    { x: box.x + box.w * 0.78, y: box.y + box.h * 0.82 },
    { x: box.x + box.w * 0.5, y: box.y + box.h },
    { x: box.x + box.w * 0.22, y: box.y + box.h * 0.82 },
    { x: box.x + box.w * 0.06, y: box.y + box.h * 0.58 },
    { x: box.x, y: box.y + box.h * shoulder }
  ];
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("cover engine core operations must be an object");
  const required = ["boxCenterInside", "detectAvatarBox", "detectAxis", "detectCardBox", "expandPtBox", "normalizeChromeTextBoxes", "round"];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`cover engine core operation ${name} must be a function`);
  }
  const defaultSlide = operations.defaultSlide;
  if (!positiveSlideSize(defaultSlide)) throw new TypeError("cover engine core defaultSlide is invalid");
  return Object.freeze({ ...operations, defaultSlide: Object.freeze({ ...defaultSlide }) });
}

function boundedDiagramBox(box, slideSize) {
  return positiveBox(box)
    && Math.abs(box.x) <= slideSize.widthPt * 2
    && Math.abs(box.y) <= slideSize.heightPt * 2
    && box.w <= slideSize.widthPt * 2
    && box.h <= slideSize.heightPt * 2;
}

function positiveBox(box) {
  return Boolean(box) && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0;
}

function positiveSlideSize(value) {
  return Boolean(value) && Number.isFinite(value.widthPt) && Number.isFinite(value.heightPt) && value.widthPt > 0 && value.heightPt > 0;
}

function normalizeSlideSize(value, fallback) {
  return positiveSlideSize(value) && value.widthPt <= fallback.widthPt * 4 && value.heightPt <= fallback.heightPt * 4 ? value : fallback;
}

module.exports = { createCoverEngineCoreToolkit };
