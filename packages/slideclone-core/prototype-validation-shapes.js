"use strict";

const { boxCenterInside, expandPtBox, clamp, round } = require("./raster-native-detection");
const { lineBox } = require("./workflow-shape-primitives");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createPrototypeValidationFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (shouldObjectifyPrototypeIntentPanel(image, textBoxes)) {
      const panel = inferPrototypeIntentPanel(image, textBoxes, slideSize);
      if (!panel) continue;
      image.source = {
        ...(image.source || {}),
        layer: {
          ...(image.source?.layer || {}),
          layerType: "diagram-zone",
          recommendedAction: "attempt-native-reconstruction"
        },
        prototypeIntentPanelObjectified: true,
        prototypeValidationFlowObjectified: true,
        objectifiedPrototypeIntentPanelShapes: panel.shapes.length,
        prototypeValidationResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "intent panel crop"}; rebuilt intent-to-interface document panel natively`
      };
      for (let index = 0; index < panel.shapes.length; index += 1) {
        const item = panel.shapes[index];
        shapes.push({
          id: `${image.id || "prototype-intent"}-native-intent-${index}`,
          type: item.type,
          box: item.box,
          style: item.style,
          source: {
            editable: true,
            nativeRebuild: true,
            detector: item.detector,
            layerSourceId: image.id || null,
            role: item.role || "prototype-intent-panel"
          }
        });
      }
      continue;
    }
    if (!shouldObjectifyPrototypeValidationFlow(image, textBoxes)) continue;
    const flow = inferPrototypeValidationFlow(image, textBoxes, slideSize);
    if (!flow) continue;
    image.source = {
      ...(image.source || {}),
      prototypeValidationFlowObjectified: true,
      objectifiedPrototypeValidationConnectors: flow.connectors.length,
      objectifiedPrototypeValidationPanels: flow.panels.length,
      objectifiedPrototypeValidationDecorations: flow.decorations.length,
      prototypeValidationResidualBoxes: flow.residualCrops,
      prototypeValidationNativeTextBoxes: flow.textBoxes.map((textBox) => ({
        ...textBox,
        source: {
          ...(textBox.source || {}),
          layerSourceId: image.id || null
        }
      })),
      dropErasedResidualAfterNativeRebuild: flow.residualCrops.length === 0 ? true : image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt prototype validation panels, connectors, labels, and wand decoration natively`
    };
    for (let index = 0; index < flow.panels.length; index += 1) {
      const panel = flow.panels[index];
      shapes.push({
        id: `${image.id || "prototype-validation"}-native-panel-${index}`,
        type: panel.type || "rect",
        box: panel.box,
        style: panel.style,
        source: {
          editable: true,
          nativeRebuild: true,
          detector: panel.detector || "prototype-validation-flow-native-panel",
          layerSourceId: image.id || null,
          panel: panel.name
        }
      });
    }
    for (let index = 0; index < flow.connectors.length; index += 1) {
      const connector = flow.connectors[index];
      shapes.push({
        id: `${image.id || "prototype-validation"}-native-connector-${index}`,
        type: "line",
        box: connector.box,
        style: {
          stroke: connector.stroke,
          strokeWidthPt: connector.strokeWidthPt,
          connectorType: "straight",
          endArrow: connector.endArrow,
          dash: connector.dashed ? "dash" : undefined
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "prototype-validation-flow-native-connector",
          layerSourceId: image.id || null,
          connectorIndex: index,
          dashed: connector.dashed === true
        }
      });
    }
    for (let index = 0; index < flow.decorations.length; index += 1) {
      const decoration = flow.decorations[index];
      shapes.push({
        id: `${image.id || "prototype-validation"}-native-decoration-${index}`,
        type: decoration.type,
        box: decoration.box,
        points: decoration.points,
        style: decoration.style,
        source: {
          editable: true,
          nativeRebuild: true,
          detector: decoration.detector,
          layerSourceId: image.id || null,
          role: decoration.role || "prototype-validation-decoration"
        }
      });
    }
    for (let index = 0; index < flow.labels.length; index += 1) {
      const label = flow.labels[index];
      shapes.push({
        id: `${image.id || "prototype-validation"}-native-label-${index}`,
        type: "roundRect",
        box: label.box,
        style: {
          fill: label.fill || "#FFFFFF",
          stroke: label.stroke,
          strokeWidthPt: label.strokeWidthPt ?? 2,
          radiusRatio: label.radiusRatio ?? 0.36
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "prototype-validation-flow-native-label",
          layerSourceId: image.id || null,
          label: label.text
        }
      });
    }
  }
  return shapes;
}

function shouldObjectifyPrototypeIntentPanel(image, textBoxes = []) {
  const box = image?.box || {};
  const detector = image?.source?.detector;
  if (detector !== "prototype-validation-flow-residual-crop" && detector !== "foreground-graphic-crop") return false;
  if (!box.w || !box.h || box.w < 240 || box.h < 130) return false;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box)
    .map((item) => String(item.text || "").trim()));
  if (!hasPrototypeValidationPageContext(textBoxes, labels)) return false;
  return (textBoxes || []).some((item) => {
    const label = String(item?.text || "").replace(/\s+/g, "");
    return isPrototypeIntentLabel(label) && item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 12, 12));
  });
}

function inferPrototypeIntentPanel(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const label = (textBoxes || []).find((item) => {
    const text = String(item?.text || "").replace(/\s+/g, "");
    return isPrototypeIntentLabel(text) && item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 12, 12));
  });
  if (!label) return null;
  const labelGap = Math.max(16, label.box.x - box.x - 18);
  const cardW = clamp(labelGap, Math.min(150, box.w * 0.55), Math.min(190, box.w * 0.62));
  const cardH = Math.min(box.h * 0.92, Math.max(146, box.h - 14));
  const card = expandPtBox({
    x: box.x + 4,
    y: box.y + 4,
    w: cardW,
    h: cardH
  }, slideSize, 0, 0);
  const headerH = Math.max(28, card.h * 0.13);
  const shapes = [
    {
      type: "roundRect",
      box: card,
      style: {
        fill: "#DDECF6",
        stroke: "#DDECF6",
        strokeWidthPt: 0,
        radiusRatio: 0.025
      },
      detector: "prototype-validation-flow-native-intent-card",
      role: "intent-card"
    },
    {
      type: "rect",
      box: expandPtBox({ x: card.x, y: card.y, w: card.w, h: headerH }, slideSize, 0, 0),
      style: {
        fill: "#1F76B9",
        stroke: "none",
        strokeWidthPt: 0
      },
      detector: "prototype-validation-flow-native-intent-header",
      role: "intent-header"
    }
  ];
  const groups = [
    { y: card.y + headerH + card.h * 0.10, title: 0.35, lines: [0.83, 0.83, 0.62] },
    { y: card.y + headerH + card.h * 0.35, title: 0.35, lines: [0.83, 0.83, 0.65] },
    { y: card.y + headerH + card.h * 0.60, title: 0.35, lines: [0.83, 0.83, 0.48] }
  ];
  const intentConnectorY = Math.max(card.y + headerH + 24, label.box.y - 13);
  shapes.push({
    type: "line",
    box: lineBox(
      { x: card.x + card.w - 1, y: intentConnectorY },
      { x: Math.min(box.x + box.w - 10, label.box.x + label.box.w + 70), y: intentConnectorY }
    ),
    style: {
      stroke: "#2B78A5",
      strokeWidthPt: 3.6,
      connectorType: "straight"
    },
    detector: "prototype-validation-flow-native-connector",
    role: "intent-output-connector"
  });
  shapes.push({
    type: "roundRect",
    box: expandPtBox(label.box, slideSize, 14, 6),
    style: {
      fill: "#FFFFFF",
      stroke: "#2B78A5",
      strokeWidthPt: 1.2,
      radiusRatio: 0.5
    },
    detector: "prototype-validation-flow-native-intent-label-pill",
    role: "intent-label-pill"
  });
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const x = card.x + card.w * 0.08;
    const w = card.w * 0.74;
    shapes.push({
      type: "rect",
      box: expandPtBox({ x, y: group.y, w: w * group.title, h: 4.5 }, slideSize, 0, 0),
      style: { fill: "#1F76B9", stroke: "none", strokeWidthPt: 0 },
      detector: "prototype-validation-flow-native-intent-title-line",
      role: "intent-title-line"
    });
    for (let lineIndex = 0; lineIndex < group.lines.length; lineIndex += 1) {
      shapes.push({
        type: "rect",
        box: expandPtBox({
          x,
          y: group.y + 17 + lineIndex * 9.5,
          w: w * group.lines[lineIndex],
          h: 3.7
        }, slideSize, 0, 0),
        style: { fill: "#AEB9C2", stroke: "none", strokeWidthPt: 0 },
        detector: "prototype-validation-flow-native-intent-body-line",
        role: "intent-body-line"
      });
    }
  }
  return { shapes };
}

function isPrototypeIntentLabel(value = "") {
  const normalized = String(value || "").replace(/\s+/g, "");
  return normalized === "意图转界面" || normalized === "意转界面";
}

function shouldObjectifyPrototypeValidationFlow(image, textBoxes = []) {
  const box = image?.box || {};
  if (image?.source?.detector !== "foreground-graphic-crop") return false;
  if (!box.w || !box.h || box.w < 480 || box.h < 240) return false;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 12, 12)))
    .map((item) => String(item.text || "").trim()));
  const hasInternalLabels = labels.has("LiveWebpage")
    && (labels.has("U精准捕获") || labels.has("UI精准捕获"))
    && labels.has("路由自动接入");
  if (hasInternalLabels) return true;
  return image?.source?.layer?.layerType === "diagram-zone"
    && image?.source?.layer?.recommendedAction === "split-native-with-residual-crop"
    && hasPrototypeValidationPageContext(textBoxes);
}

function hasPrototypeValidationPageContext(textBoxes = [], labels = null) {
  const labelSet = labels || new Set((textBoxes || []).map((item) => String(item?.text || "").trim()));
  const hasFullInternalLabels = labelSet.has("LiveWebpage")
    && (labelSet.has("U精准捕获") || labelSet.has("UI精准捕获"))
    && labelSet.has("路由自动接入");
  if (hasFullInternalLabels) return true;
  const joined = (textBoxes || []).map((item) => String(item?.text || "")).join(" ");
  return /原型|高仿|可视化验证|实体/.test(joined) && /意图转界面/.test(joined);
}

function inferPrototypeValidationFlow(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const byText = new Map((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 12, 12)))
    .map((item) => [String(item.text || "").trim(), item.box]));
  const live = byText.get("LiveWebpage");
  const capture = byText.get("U精准捕获") || byText.get("UI精准捕获");
  const route = byText.get("路由自动接入");
  if (!live || !capture || !route) return inferPrototypeValidationFlowFromLayout(image, slideSize);

  const liveCard = expandPtBox({
    x: live.x - 48,
    y: Math.max(box.y, live.y - 24),
    w: Math.max(160, live.w + 104),
    h: 88
  }, slideSize, 0, 0);
  const webpageX = Math.max(box.x + box.w * 0.525, capture.x - 154);
  const webpageY = Math.max(box.y + box.h * 0.45, capture.y + 66);
  const webpageRight = Math.min(slideSize.widthPt - 16, box.x + box.w + 42, capture.x + capture.w + 112);
  const webpage = expandPtBox({
    x: webpageX,
    y: webpageY,
    w: Math.max(210, webpageRight - webpageX),
    h: Math.max(166, box.y + box.h + 18 - webpageY)
  }, slideSize, 0, 0);
  const wand = expandPtBox({
    x: box.x + box.w * 0.05,
    y: box.y + box.h * 0.42,
    w: box.w * 0.27,
    h: box.h * 0.45
  }, slideSize, 0, 0);
  const routeLabel = expandPtBox(route, slideSize, 22, 8);
  const captureLabel = expandPtBox(capture, slideSize, 20, 8);
  const elbowX = box.x + box.w * 0.18;
  const topY = liveCard.y + liveCard.h * 0.46;
  const wandCenter = { x: wand.x + wand.w * 0.52, y: wand.y + wand.h * 0.56 };
  const wandIconBox = prototypeValidationWandIconBox(wand, slideSize);
  const webpageLeft = { x: webpage.x - 8, y: wandCenter.y };
  const liveDropY = Math.min(wand.y + 8, liveCard.y + liveCard.h + 55);
  return {
    residualCrops: prototypeValidationResidualCrops({ wand }, slideSize),
    panels: prototypeValidationPanels({ liveCard, webpage, captureLabel, routeLabel, box }),
    decorations: [],
    textBoxes: prototypeValidationTextBoxes({ live, capture, route, liveCard, captureLabel, routeLabel }),
    labels: [
      { text: "U精准捕获", box: captureLabel, fill: "#F47A24", stroke: "#F47A24", strokeWidthPt: 0, radiusRatio: 0.5 },
      { text: "路由自动接入", box: routeLabel, stroke: "#2B78A5" }
    ],
    connectors: [
      {
        box: lineBox({ x: box.x + box.w * 0.18, y: wandCenter.y }, { x: wandIconBox.x - 2, y: wandCenter.y }),
        stroke: "#2B78A5",
        strokeWidthPt: 3.6
      },
      {
        box: lineBox({ x: wandIconBox.x + wandIconBox.w + 6, y: wandCenter.y }, webpageLeft),
        stroke: "#2B78A5",
        strokeWidthPt: 3.6
      },
      {
        box: lineBox({ x: elbowX, y: liveDropY }, { x: elbowX, y: topY }),
        stroke: "#2B78A5",
        strokeWidthPt: 2.4
      },
      {
        box: lineBox({ x: elbowX, y: topY }, { x: liveCard.x, y: topY }),
        stroke: "#2B78A5",
        strokeWidthPt: 2.4
      },
      {
        box: lineBox({ x: liveCard.x + liveCard.w + 4, y: liveCard.y + liveCard.h * 0.30 }, { x: webpage.x + webpage.w * 0.60, y: liveCard.y + liveCard.h * 0.30 }),
        stroke: "#F0832A",
        strokeWidthPt: 2.8,
        dashed: true
      },
      {
        box: lineBox({ x: webpage.x + webpage.w * 0.60, y: liveCard.y + liveCard.h * 0.30 }, { x: webpage.x + webpage.w * 0.60, y: webpage.y - 10 }),
        stroke: "#F0832A",
        strokeWidthPt: 2.8,
        dashed: true,
        endArrow: "triangle"
      }
    ].filter((connector) => Math.abs(connector.box.w) + Math.abs(connector.box.h) > 8)
  };
}

function inferPrototypeValidationFlowFromLayout(image, slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  if (!box?.w || !box?.h) return null;
  const liveCard = expandPtBox({
    x: box.x + box.w * 0.40,
    y: box.y + box.h * 0.02,
    w: box.w * 0.40,
    h: box.h * 0.30
  }, slideSize, 0, 0);
  const webpage = expandPtBox({
    x: box.x + box.w * 0.60,
    y: box.y + box.h * 0.45,
    w: Math.min(box.w * 0.46, slideSize.widthPt - (box.x + box.w * 0.60) - 16),
    h: box.h * 0.55
  }, slideSize, 0, 0);
  const wand = expandPtBox({
    x: box.x + box.w * 0.05,
    y: box.y + box.h * 0.42,
    w: box.w * 0.27,
    h: box.h * 0.45
  }, slideSize, 0, 0);
  const routeLabel = expandPtBox({
    x: box.x + box.w * 0.29,
    y: box.y + box.h * 0.77,
    w: box.w * 0.24,
    h: box.h * 0.10
  }, slideSize, 0, 0);
  const captureLabel = expandPtBox({
    x: box.x + box.w * 0.83,
    y: box.y + box.h * 0.22,
    w: box.w * 0.18,
    h: box.h * 0.11
  }, slideSize, 0, 0);
  const live = {
    text: "LiveWebpage",
    x: liveCard.x + liveCard.w * 0.10,
    y: liveCard.y + liveCard.h * 0.08,
    w: liveCard.w * 0.80,
    h: liveCard.h * 0.20
  };
  const capture = { text: "UI精准捕获", ...captureLabel };
  const route = { text: "路由自动接入", ...routeLabel };
  const elbowX = box.x + box.w * 0.18;
  const topY = liveCard.y + liveCard.h * 0.46;
  const wandCenter = { x: wand.x + wand.w * 0.52, y: wand.y + wand.h * 0.56 };
  const wandIconBox = prototypeValidationWandIconBox(wand, slideSize);
  const webpageLeft = { x: webpage.x - 8, y: wandCenter.y };
  const liveDropY = Math.min(wand.y + 8, liveCard.y + liveCard.h + 55);
  return {
    residualCrops: prototypeValidationResidualCrops({ wand }, slideSize),
    panels: prototypeValidationPanels({ liveCard, webpage, captureLabel, routeLabel, box }),
    decorations: [],
    textBoxes: prototypeValidationTextBoxes({ live, capture, route, liveCard, captureLabel, routeLabel }),
    labels: [
      { text: "UI精准捕获", box: captureLabel, fill: "#F47A24", stroke: "#F47A24", strokeWidthPt: 0, radiusRatio: 0.5 },
      { text: "路由自动接入", box: routeLabel, stroke: "#2B78A5" }
    ],
    connectors: [
      {
        box: lineBox({ x: box.x + box.w * 0.02, y: wandCenter.y }, { x: wandIconBox.x - 2, y: wandCenter.y }),
        stroke: "#2B78A5",
        strokeWidthPt: 3.6
      },
      {
        box: lineBox({ x: wandIconBox.x + wandIconBox.w + 6, y: wandCenter.y }, webpageLeft),
        stroke: "#2B78A5",
        strokeWidthPt: 3.6
      },
      {
        box: lineBox({ x: elbowX, y: liveDropY }, { x: elbowX, y: topY }),
        stroke: "#2B78A5",
        strokeWidthPt: 2.4
      },
      {
        box: lineBox({ x: elbowX, y: topY }, { x: liveCard.x, y: topY }),
        stroke: "#2B78A5",
        strokeWidthPt: 2.4
      },
      {
        box: lineBox({ x: liveCard.x + liveCard.w + 4, y: liveCard.y + liveCard.h * 0.30 }, { x: webpage.x + webpage.w * 0.60, y: liveCard.y + liveCard.h * 0.30 }),
        stroke: "#F0832A",
        strokeWidthPt: 2.8,
        dashed: true
      },
      {
        box: lineBox({ x: webpage.x + webpage.w * 0.60, y: liveCard.y + liveCard.h * 0.30 }, { x: webpage.x + webpage.w * 0.60, y: webpage.y - 10 }),
        stroke: "#F0832A",
        strokeWidthPt: 2.8,
        dashed: true,
        endArrow: "triangle"
      }
    ].filter((connector) => Math.abs(connector.box.w) + Math.abs(connector.box.h) > 8)
  };
}

function prototypeValidationResidualCrops({ wand }, slideSize = DEFAULT_SLIDE) {
  if (!wand || Number(wand.w || 0) <= 0 || Number(wand.h || 0) <= 0) return [];
  return [{
    name: "wand-icon",
    box: prototypeValidationWandIconBox(wand, slideSize),
    role: "preserve-high-fidelity-icon"
  }];
}

function prototypeValidationWandIconBox(wand, slideSize = DEFAULT_SLIDE) {
  const x = clamp(Number(wand.x || 0) - 9, 0, slideSize.widthPt);
  const y = clamp(Number(wand.y || 0) + 7, 0, slideSize.heightPt);
  const right = clamp(Number(wand.x || 0) + Number(wand.w || 0) * 0.70, x + 1, slideSize.widthPt);
  const bottom = clamp(Number(wand.y || 0) + Number(wand.h || 0) + 7, y + 1, slideSize.heightPt);
  return {
    x: round(x),
    y: round(y),
    w: round(right - x),
    h: round(bottom - y)
  };
}

function prototypeValidationPanels({ liveCard, webpage, captureLabel: _captureLabel, routeLabel: _routeLabel, box: _box }) {
  const panels = [];
  const add = (name, type, panelBox, style, detector = "prototype-validation-flow-native-panel") => {
    panels.push({ name, type, box: panelBox, style, detector });
  };
  add("live-card", "roundRect", liveCard, {
    fill: "#EEF3F4",
    stroke: "#D8E1E5",
    strokeWidthPt: 0.6,
    radiusRatio: 0.12
  }, "prototype-validation-flow-native-live-card");
  add("live-card-header", "rect", {
    x: liveCard.x,
    y: liveCard.y,
    w: liveCard.w,
    h: Math.min(34, liveCard.h * 0.34)
  }, {
    fill: "#F47A24",
    stroke: "#F47A24",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-live-card-header");
  add("live-card-image", "rect", {
    x: liveCard.x + liveCard.w * 0.09,
    y: liveCard.y + liveCard.h * 0.42,
    w: liveCard.w * 0.25,
    h: liveCard.h * 0.34
  }, {
    fill: "#CBD4D8",
    stroke: "#CBD4D8",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-ui-placeholder");
  [0.45, 0.58, 0.70].forEach((ratio, index) => add(`live-card-line-${index}`, "rect", {
    x: liveCard.x + liveCard.w * 0.42,
    y: liveCard.y + liveCard.h * ratio,
    w: liveCard.w * (index === 2 ? 0.33 : 0.50),
    h: 5
  }, {
    fill: "#C5CED2",
    stroke: "#C5CED2",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-ui-placeholder"));

  add("webpage", "rect", webpage, {
    fill: "#EFF6F2",
    stroke: "#2AA56E",
    strokeWidthPt: 2.2
  }, "prototype-validation-flow-native-webpage");
  add("webpage-header", "rect", {
    x: webpage.x,
    y: webpage.y,
    w: webpage.w,
    h: webpage.h * 0.18
  }, {
    fill: "#23A866",
    stroke: "#23A866",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-header");
  add("webpage-header-diamond", "diamond", {
    x: webpage.x + webpage.w * 0.05,
    y: webpage.y + webpage.h * 0.045,
    w: webpage.w * 0.07,
    h: webpage.h * 0.07
  }, {
    fill: "#9ADBBB",
    stroke: "#9ADBBB",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-header-icon");
  add("webpage-header-title", "rect", {
    x: webpage.x + webpage.w * 0.66,
    y: webpage.y + webpage.h * 0.055,
    w: webpage.w * 0.30,
    h: webpage.h * 0.045
  }, {
    fill: "#A8E0C1",
    stroke: "#A8E0C1",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-top-line");
  add("webpage-header-button", "rect", {
    x: webpage.x + webpage.w * 0.90,
    y: webpage.y + webpage.h * 0.045,
    w: webpage.w * 0.06,
    h: webpage.h * 0.07
  }, {
    fill: "#8FD7B4",
    stroke: "#8FD7B4",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-header-icon");
  add("webpage-sidebar", "rect", {
    x: webpage.x,
    y: webpage.y + webpage.h * 0.18,
    w: webpage.w * 0.24,
    h: webpage.h * 0.82
  }, {
    fill: "#BDE6D1",
    stroke: "#BDE6D1",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-sidebar");
  [0, 1, 2].forEach((index) => add(`webpage-side-icon-${index}`, "rect", {
    x: webpage.x + webpage.w * 0.035,
    y: webpage.y + webpage.h * (0.30 + index * 0.10),
    w: webpage.w * 0.04,
    h: webpage.h * 0.04
  }, {
    fill: "#38B779",
    stroke: "#38B779",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-webpage-side-icon"));
  add("webpage-title", "rect", {
    x: webpage.x + webpage.w * 0.31,
    y: webpage.y + webpage.h * 0.26,
    w: webpage.w * 0.23,
    h: webpage.h * 0.08
  }, {
    fill: "#27A96B",
    stroke: "#27A96B",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-ui-placeholder");
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      add(`webpage-grid-${row}-${col}`, "rect", {
        x: webpage.x + webpage.w * (0.31 + col * 0.16),
        y: webpage.y + webpage.h * (0.42 + row * 0.22),
        w: webpage.w * 0.13,
        h: webpage.h * 0.16
      }, {
        fill: "#A9DEC1",
        stroke: "#A9DEC1",
        strokeWidthPt: 0
      }, "prototype-validation-flow-native-ui-placeholder");
    }
  }
  [0, 1, 2, 3].forEach((index) => add(`webpage-side-line-${index}`, "rect", {
    x: webpage.x + webpage.w * 0.04,
    y: webpage.y + webpage.h * (0.28 + index * 0.13),
    w: index === 0 ? webpage.w * 0.20 : webpage.w * 0.13,
    h: 4
  }, {
    fill: "#25A96B",
    stroke: "#25A96B",
    strokeWidthPt: 0
  }, "prototype-validation-flow-native-ui-placeholder"));
  for (let index = 0; index < 2; index += 1) {
    const cardX = webpage.x + webpage.w * (0.30 + index * 0.39);
    const cardY = webpage.y + webpage.h * 0.78;
    const cardW = webpage.w * 0.29;
    const cardH = webpage.h * 0.14;
    add(`webpage-bottom-card-${index}`, "rect", {
      x: cardX,
      y: cardY,
      w: cardW,
      h: cardH
    }, {
      fill: "#E6EBEA",
      stroke: "#E6EBEA",
      strokeWidthPt: 0
    }, "prototype-validation-flow-native-webpage-content-card");
    add(`webpage-bottom-thumb-${index}`, "rect", {
      x: cardX + cardW * 0.06,
      y: cardY + cardH * 0.18,
      w: cardW * 0.25,
      h: cardH * 0.58
    }, {
      fill: "#A6DDBF",
      stroke: "#A6DDBF",
      strokeWidthPt: 0
    }, "prototype-validation-flow-native-webpage-content-thumb");
    add(`webpage-bottom-title-${index}`, "rect", {
      x: cardX + cardW * 0.42,
      y: cardY + cardH * 0.18,
      w: cardW * 0.26,
      h: cardH * 0.08
    }, {
      fill: "#24A669",
      stroke: "#24A669",
      strokeWidthPt: 0
    }, "prototype-validation-flow-native-webpage-content-line");
    [0, 1, 2].forEach((lineIndex) => add(`webpage-bottom-line-${index}-${lineIndex}`, "rect", {
      x: cardX + cardW * 0.42,
      y: cardY + cardH * (0.38 + lineIndex * 0.15),
      w: cardW * (lineIndex === 2 ? 0.36 : 0.46),
      h: cardH * 0.055
    }, {
      fill: "#AEBBC0",
      stroke: "#AEBBC0",
      strokeWidthPt: 0
    }, "prototype-validation-flow-native-webpage-content-line"));
  }
  return panels;
}

function prototypeValidationTextBoxes({ live: _live, capture, route, liveCard, captureLabel, routeLabel }) {
  return [
    {
      text: "Live Webpage",
      box: { x: liveCard.x + 12, y: liveCard.y + 5, w: liveCard.w - 24, h: Math.min(26, liveCard.h * 0.30) },
      color: "#FFFFFF",
      sizePt: 18,
      detector: "prototype-validation-flow-native-live-label"
    },
    {
      text: String(capture ? "UI精准捕获" : "U精准捕获"),
      box: { x: captureLabel.x + 8, y: captureLabel.y + 5, w: captureLabel.w - 16, h: captureLabel.h - 10 },
      color: "#FFFFFF",
      sizePt: 14,
      detector: "prototype-validation-flow-native-label-text"
    },
    {
      text: route?.text || "路由自动接入",
      box: { x: routeLabel.x + 10, y: routeLabel.y + 5, w: routeLabel.w - 20, h: routeLabel.h - 10 },
      color: "#2B6078",
      sizePt: 15,
      detector: "prototype-validation-flow-native-label-text"
    }
  ].map((item, index) => ({
    id: `prototype-validation-native-text-${index}`,
    role: "diagram-label",
    text: item.text,
    box: {
      x: round(item.box.x),
      y: round(item.box.y),
      w: round(item.box.w),
      h: round(item.box.h)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: item.sizePt,
      color: item.color,
      weight: "regular",
      align: "center",
      valign: "middle"
    },
    style: {
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0,
      fit: "shrink"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: item.detector
    }
  }));
}

module.exports = { createPrototypeValidationFlowShapes, shouldObjectifyPrototypeIntentPanel, hasPrototypeValidationPageContext, isPrototypeIntentLabel, inferPrototypeIntentPanel, shouldObjectifyPrototypeValidationFlow, inferPrototypeValidationFlow, inferPrototypeValidationFlowFromLayout, prototypeValidationWandIconBox, prototypeValidationResidualCrops, prototypeValidationPanels, prototypeValidationTextBoxes };
