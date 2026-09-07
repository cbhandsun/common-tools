"use strict";

const { unionPtBox, boxCenterInside, expandPtBox, ptToPxBox, clamp, pxToPtBox, round } = require("./raster-native-detection");
const { lineBox, safeIdentifier } = require("./workflow-shape-primitives");
const { resolveAssetPathForIr, ensureDir } = require("./residual-primitive-erasure");
const fs = require("fs");
const { readPng, cropPng, writePng } = require("./png");
const path = require("path");
const { clampPtBoxToSlide } = require("./structured-residual-splitting");
const { detectHorizontalColorBands } = require("./color-component-bounds");
const { createPrdAutoGenerationNarrativeTextBoxes } = require("./prd-auto-generation-narrative");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function hexToRgb(value) {
  const hex = String(value || "").replace(/[^0-9a-f]/gi, "").padEnd(6, "0").slice(0, 6);
  return {
    r: parseInt(hex.slice(0, 2), 16),
    g: parseInt(hex.slice(2, 4), 16),
    b: parseInt(hex.slice(4, 6), 16)
  };
}

function createPrdGenerationFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!sourceImage) return [];
  const shapes = [];
  const segmentedFlow = inferSegmentedPrdGenerationFlow(images, textBoxes, slideSize);
  if (segmentedFlow) {
    if (segmentedFlow.preserveSegmentCrops === true) {
      restorePrdGenerationInputCardCrop(segmentedFlow.leftImage, sourceImage, slideSize, textBoxes, options);
      restorePrdGenerationDocumentCrop(segmentedFlow.docImage, sourceImage, slideSize, textBoxes, options);
    }
    const restoredNodeCrop = segmentedFlow.preserveSegmentCrops === true
      ? restorePrdGenerationCenterMinimumUnit(segmentedFlow.nodeImage, sourceImage, slideSize, options)
      : false;
    for (const image of segmentedFlow.images) {
      const preserveSegments = segmentedFlow.preserveSegmentCrops === true;
      const isCenterMinimumUnit = restoredNodeCrop && image === segmentedFlow.nodeImage;
      image.source = preserveSegments
        ? {
          ...(image.source || {}),
          prdGenerationSegmentCropPreserved: true,
          prdGenerationConnectorOverlayOnly: true,
          objectifiedPrdFlowConnectors: segmentedFlow.shapes.filter((shape) => shape.source?.detector === "prd-generation-flow-native-connector").length,
          objectifiedPrdFlowPanels: 0,
          prdGenerationResidualBoxes: [],
          preserveResidualCropUnderNativeRebuild: true,
          dropErasedResidualAfterNativeRebuild: false,
          ...(isCenterMinimumUnit ? {
            expressionForm: "icon-or-illustration",
            expressionSubtype: "prd-generation-engine-icon",
            protectedMinimumUnit: true,
            recommendedAction: "preserve-as-minimum-unit-crop"
          } : {}),
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "segmented product illustration"}; preserved segmented PRD illustration crop and rebuilt only confident connector overlays`
        }
        : {
          ...(image.source || {}),
          prdGenerationFlowObjectified: true,
          objectifiedPrdFlowConnectors: segmentedFlow.shapes.filter((shape) => shape.source?.detector === "prd-generation-flow-native-connector").length,
          objectifiedPrdFlowPanels: segmentedFlow.shapes.filter((shape) => /prd-generation-flow-native-(card|input-card|doc-row)/.test(shape.source?.detector || "")).length,
          prdGenerationResidualBoxes: [],
          dropErasedResidualAfterNativeRebuild: true,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "segmented product illustration"}; rebuilt segmented PRD generation illustration natively`
        };
    }
    shapes.push(...segmentedFlow.shapes);
    return shapes;
  }
  const titleFallbackFlow = inferPrdAutoGenerationTitleFallbackFlow(images, textBoxes, slideSize, options.rawTextBoxes, sourceImage, options);
  if (titleFallbackFlow) {
    for (const image of titleFallbackFlow.images) {
      image.source = {
        ...(image.source || {}),
        prdGenerationFlowObjectified: true,
        prdAutoGenerationFallbackObjectified: true,
        prdGenerationNativeTextBoxes: titleFallbackFlow.textBoxes,
        objectifiedPrdFlowConnectors: titleFallbackFlow.shapes.filter((shape) => shape.source?.detector === "prd-generation-flow-native-connector").length,
        objectifiedPrdFlowPanels: titleFallbackFlow.shapes.filter((shape) => /prd-generation-flow-native-(card|input-card|doc-row|machine)/.test(shape.source?.detector || "")).length,
        objectifiedPrdFlowTextBoxes: titleFallbackFlow.textBoxes.length,
        prdGenerationResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "PRD auto-generation diagram crop"}; rebuilt title-matched PRD auto-generation diagram natively`
      };
    }
    shapes.push(...titleFallbackFlow.shapes);
    return shapes;
  }
  for (const image of images || []) {
    if (!shouldObjectifyPrdGenerationFlow(image, textBoxes)) continue;
    const flow = inferPrdGenerationFlow(image, textBoxes, slideSize);
    if (!flow) continue;
    image.source = {
      ...(image.source || {}),
      prdGenerationFlowObjectified: true,
      objectifiedPrdFlowConnectors: flow.connectors.length,
      objectifiedPrdFlowDividers: flow.dividers.length,
      prdGenerationResidualBoxes: flow.residualCrops,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt PRD generation flow card, node, and connectors natively while preserving screenshot crops`
    };
    shapes.push({
      id: `${image.id || "prd-generation-flow"}-native-card`,
      type: "roundRect",
      box: flow.documentCard,
      style: {
        fill: "#FFFFFF",
        stroke: "#20B06B",
        strokeWidthPt: 2.2,
        radiusRatio: 0.04,
        shadow: {
          color: "#000000",
          alpha: 0.10,
          blurPt: 7,
          distancePt: 2,
          angle: 45
        }
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "prd-generation-flow-native-card",
        layerSourceId: image.id || null
      }
    });
    shapes.push({
      id: `${image.id || "prd-generation-flow"}-native-header`,
      type: "rect",
      box: flow.header,
      style: {
        fill: "#20B06B",
        stroke: "#20B06B",
        strokeWidthPt: 0
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "prd-generation-flow-native-header",
        layerSourceId: image.id || null
      }
    });
    for (let index = 0; index < flow.dividers.length; index += 1) {
      shapes.push({
        id: `${image.id || "prd-generation-flow"}-native-divider-${index}`,
        type: "line",
        box: flow.dividers[index],
        style: {
          stroke: "#D8EEDF",
          strokeWidthPt: 1.1,
          connectorType: "straight"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "prd-generation-flow-native-divider",
          layerSourceId: image.id || null,
          dividerIndex: index
        }
      });
    }
    shapes.push({
      id: `${image.id || "prd-generation-flow"}-native-node`,
      type: "diamond",
      box: flow.node,
      style: {
        fill: "#0E71BE",
        stroke: "#0E71BE",
        strokeWidthPt: 0,
        shadow: {
          color: "#0E71BE",
          alpha: 0.18,
          blurPt: 8,
          distancePt: 0,
          angle: 0
        }
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "prd-generation-flow-native-node",
        layerSourceId: image.id || null
      }
    });
    for (let index = 0; index < flow.connectors.length; index += 1) {
      shapes.push({
        id: `${image.id || "prd-generation-flow"}-native-connector-${index}`,
        type: "line",
        box: flow.connectors[index],
        style: {
          stroke: "#2D7DBD",
          strokeWidthPt: 3.3,
          connectorType: "straight",
          endArrow: "triangle"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "prd-generation-flow-native-connector",
          layerSourceId: image.id || null,
          connectorIndex: index
        }
      });
    }
  }
  return shapes;
}

function inferSegmentedPrdGenerationFlow(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const segments = (images || [])
    .filter((image) => image?.source?.detector === "product-illustration-segment-crop" && image?.box)
    .sort((a, b) => a.box.x - b.box.x);
  if (segments.length < 3) return null;
  const labels = new Set((textBoxes || []).map((item) => String(item.text || "").trim()));
  const required = ["InteractivePrototype", "Structured Brief", "PRD", "业务背景", "字段规则", "异常场景", "验收口径"];
  if (!required.every((label) => labels.has(label))) return null;

  const byText = new Map((textBoxes || []).map((item) => [String(item.text || "").trim(), item.box]));
  const leftSignalBox = unionPtBox(byText.get("InteractivePrototype"), byText.get("Structured Brief"));
  const leftImage = segments.find((image) => boxOverlapArea(image.box, leftSignalBox) > 0)
    || segments[0];
  const docImage = segments.find((image) => boxCenterInside(byText.get("PRD"), expandPtBox(image.box, slideSize, 20, 20)))
    || segments[segments.length - 1];
  const nodeImage = segments.find((image) => image !== leftImage && image !== docImage)
    || segments[Math.floor(segments.length / 2)];
  if (!leftImage || !docImage || !nodeImage || leftImage === docImage) return null;

  const preserveSegmentCrops = [leftImage, nodeImage, docImage].every((image) => shouldPreservePrdSegmentCrop(image));
  const shapes = preserveSegmentCrops
    ? prdSegmentedConnectorShapes({ leftImage, nodeImage, docImage })
    : [
      ...prdInputIllustrationShapes(leftImage),
      ...prdDocumentIllustrationShapes(docImage),
      ...prdNodeIllustrationShapes(nodeImage),
      ...prdSegmentedConnectorShapes({ leftImage, nodeImage, docImage })
    ];
  return {
    images: [...new Set([leftImage, nodeImage, docImage])],
    shapes,
    preserveSegmentCrops,
    nodeImage,
    leftImage
  };
}

function restorePrdGenerationInputCardCrop(leftImage, sourceImage, slideSize = DEFAULT_SLIDE, textBoxes = [], options = {}) {
  if (!leftImage?.box || !sourceImage || !options.irDir || !leftImage.assetPath) return false;
  const assetFile = resolveAssetPathForIr(leftImage.assetPath, options.irDir);
  if (!assetFile) return false;
  const pristineSource = readPrdGenerationPristineSourceImage(textBoxes) || sourceImage;
  const cropBox = ptToPxBox(leftImage.box, pristineSource, slideSize, 0);
  const crop = cropPng(pristineSource, cropBox);
  const titles = (textBoxes || []).filter((item) =>
    item?.box && /^(?:InteractivePrototype|Interactive Prototype|Structured Brief)$/.test(String(item.text || "").trim())
  );
  for (const title of titles) {
    const mask = ptToPxBox(expandPtBox(title.box, slideSize, 5, 3), pristineSource, slideSize, 0);
    paintPngRect(crop, {
      x: mask.x - cropBox.x,
      y: mask.y - cropBox.y,
      w: mask.w,
      h: mask.h
    }, "#2E83C4");
  }
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return true;
}

function restorePrdGenerationDocumentCrop(docImage, sourceImage, slideSize = DEFAULT_SLIDE, textBoxes = [], options = {}) {
  if (!docImage?.box || !sourceImage || !options.irDir || !docImage.assetPath) return false;
  const assetFile = resolveAssetPathForIr(docImage.assetPath, options.irDir);
  if (!assetFile) return false;
  const pristineSource = readPrdGenerationPristineSourceImage(textBoxes) || sourceImage;
  const cropBox = ptToPxBox(docImage.box, pristineSource, slideSize, 0);
  const crop = cropPng(pristineSource, cropBox);
  const labels = (textBoxes || []).filter((item) =>
    item?.box && /^(?:PRD|业务背景|字段规则|异常场景|验收口径)$/.test(String(item.text || "").trim())
  );
  for (const label of labels) {
    const isHeader = String(label.text || "").trim() === "PRD";
    const mask = ptToPxBox(expandPtBox(label.box, slideSize, isHeader ? 5 : 4, isHeader ? 3 : 2), pristineSource, slideSize, 0);
    paintPngRect(crop, {
      x: mask.x - cropBox.x,
      y: mask.y - cropBox.y,
      w: mask.w,
      h: mask.h
    }, isHeader ? "#3AAF78" : "#FFFFFF");
  }
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, crop);
  return true;
}

function readPrdGenerationPristineSourceImage(textBoxes = []) {
  const sourceFile = (textBoxes || [])
    .map((item) => String(item?.source?.pageImage || ""))
    .find((file) => file && fs.existsSync(file));
  if (!sourceFile) return null;
  try {
    return readPng(sourceFile);
  } catch {
    return null;
  }
}

function paintPngRect(image, box, color) {
  const rgb = hexToRgb(color) || { r: 46, g: 131, b: 196 };
  const x1 = clamp(Math.floor(Number(box.x || 0)), 0, image.width);
  const y1 = clamp(Math.floor(Number(box.y || 0)), 0, image.height);
  const x2 = clamp(Math.ceil(Number(box.x || 0) + Number(box.w || 0)), x1, image.width);
  const y2 = clamp(Math.ceil(Number(box.y || 0) + Number(box.h || 0)), y1, image.height);
  for (let y = y1; y < y2; y += 1) {
    for (let x = x1; x < x2; x += 1) {
      const offset = (y * image.width + x) * 4;
      image.rgba[offset] = rgb.r;
      image.rgba[offset + 1] = rgb.g;
      image.rgba[offset + 2] = rgb.b;
      image.rgba[offset + 3] = 255;
    }
  }
}

function restorePrdGenerationCenterMinimumUnit(nodeImage, sourceImage, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!nodeImage?.box || !sourceImage || !options.irDir || !nodeImage.assetPath) return false;
  const assetFile = resolveAssetPathForIr(nodeImage.assetPath, options.irDir);
  if (!assetFile) return false;
  const original = nodeImage.box;
  const box = clampPtBoxToSlide({
    x: original.x + original.w * 0.10,
    y: original.y + original.h * 0.085,
    w: original.w * 0.80,
    h: original.h * 0.83
  }, slideSize);
  const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);
  ensureDir(path.dirname(assetFile));
  writePng(assetFile, cropPng(sourceImage, pxBox));
  nodeImage.box = pxToPtBox(pxBox, sourceImage, slideSize, 0);
  nodeImage.source = {
    ...(nodeImage.source || {}),
    prdGenerationMinimumUnitBox: { ...nodeImage.box },
    expressionForm: "icon-or-illustration",
    expressionSubtype: "prd-generation-engine-icon",
    layerType: "illustration-zone",
    recommendedAction: "match-icon-library-or-keep-local-crop",
    intentionalMinimumUnitCrop: true,
    protectedMinimumUnit: true,
    layer: {
      ...(nodeImage.source?.layer || {}),
      layerType: "illustration-zone",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "prd-generation-engine-icon",
      recommendedAction: "match-icon-library-or-keep-local-crop"
    }
  };
  return true;
}

function shouldPreservePrdSegmentCrop(image = {}) {
  if (image?.source?.forcePrdSegmentNative === true) return false;
  return image?.source?.componentRenderStrategy?.mode === "preserve-local-crop"
    || image?.source?.layer?.recommendedAction === "preserve-local-crop"
    || image?.source?.layer?.layerType === "screenshot-zone";
}

function inferPrdAutoGenerationTitleFallbackFlow(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE, rawTextBoxes = [], sourceImage = null, options = {}) {
  const allText = (textBoxes || []).map((item) => String(item.text || "")).join(" ");
  if (!/PRD自动生成/.test(allText) || !/标准化表达/.test(allText)) return null;
  const image = (images || []).find((item) => {
    const box = item?.box || {};
    const area = Number(box.w || 0) * Number(box.h || 0);
    const slideArea = Math.max(1, Number(slideSize.widthPt || 0) * Number(slideSize.heightPt || 0));
    return area / slideArea > 0.45
      && /screenshot-process-underlay-crop|graphic-underlay|document-generation-flow/i.test(String(item?.source?.detector || item?.source?.reason || ""));
  });
  if (!image) return null;
  const b = image.box;
  const prefix = image.id || "prd-auto-generation";
  const shapes = [];
  const blue = "#1579C9";
  const deepBlue = "#0F63A7";
  const green = "#25A861";
  const gray = "#9E9E9E";
  const source = { editable: true, nativeRebuild: true, layerSourceId: image.id || null, confidence: 0.84 };
  const measured = measurePrdAutoGenerationLayout(b, rawTextBoxes, sourceImage, slideSize);
  const { inputCard, inputPills, machine, conveyor, doc, documentRows } = measured;
  shapes.push(prdNativeShape(`${prefix}-fallback-input-card`, "roundRect", inputCard, {
    fill: "none",
    stroke: gray,
    strokeWidthPt: 1.6,
    radiusPt: 5
  }, "prd-generation-flow-native-input-card", image, { ...source, role: "fallback-input-card" }));
  shapes.push(prdNativeShape(`${prefix}-fallback-input-header`, "rect", {
    x: inputCard.x,
    y: inputCard.y,
    w: inputCard.w,
    h: inputCard.h * 0.24
  }, {
    fill: "#A8A8A8",
    stroke: "#A8A8A8",
    strokeWidthPt: 0
  }, "prd-generation-flow-native-input-card", image, { ...source, role: "fallback-input-header" }));
  [0.36, 0.52, 0.68, 0.84].forEach((ratio, index) => {
    shapes.push(prdNativeShape(`${prefix}-fallback-input-pill-${index}`, "roundRect", inputPills[index] || {
      x: inputCard.x + inputCard.w * 0.29, y: inputCard.y + inputCard.h * ratio, w: inputCard.w * 0.42, h: inputCard.h * 0.105
    }, {
      fill: deepBlue,
      stroke: deepBlue,
      strokeWidthPt: 0,
      radiusRatio: 0.36
    }, "prd-generation-flow-native-input-card", image, { ...source, role: "fallback-input-pill", pillIndex: index }));
  });
  shapes.push(...prdAutoGenerationConveyorShapes(prefix, conveyor, image, source));
  const engineCrop = materializePrdAutoGenerationEngineCrop(machine, image, sourceImage, slideSize, options);
  if (engineCrop) options.generatedImages?.push(engineCrop);
  else shapes.push(...prdAutoGenerationMachineShapes(prefix, machine, image, source));
  const inputRouteEndX = engineCrop
    ? engineCrop.box.x - 5
    : machine.x - b.w * 0.020;
  shapes.push(prdNativeShape(`${prefix}-fallback-blue-arrow`, "line", lineBox(
    { x: inputCard.x + inputCard.w + b.w * 0.020, y: inputCard.y + inputCard.h * 0.58 },
    { x: inputRouteEndX, y: inputCard.y + inputCard.h * 0.58 }
  ), {
    stroke: blue,
    strokeWidthPt: 8.5,
    connectorType: "straight",
    endArrow: "triangle"
  }, "prd-generation-flow-native-connector", image, { ...source, role: "input-to-machine" }));
  shapes.push(prdNativeShape(`${prefix}-fallback-green-route-a`, "line", lineBox(
    { x: machine.x + machine.w, y: machine.y + machine.h * 0.52 },
    { x: doc.x - b.w * 0.055, y: machine.y + machine.h * 0.52 }
  ), {
    stroke: green,
    strokeWidthPt: 7,
    connectorType: "straight"
  }, "prd-generation-flow-native-connector", image, { ...source, role: "machine-output-horizontal" }));
  shapes.push(prdNativeShape(`${prefix}-fallback-green-route-b`, "line", lineBox(
    { x: doc.x - b.w * 0.055, y: machine.y + machine.h * 0.52 },
    { x: doc.x - b.w * 0.055, y: doc.y + doc.h * 0.10 }
  ), {
    stroke: green,
    strokeWidthPt: 7,
    connectorType: "straight"
  }, "prd-generation-flow-native-connector", image, { ...source, role: "machine-output-vertical" }));
  shapes.push(prdNativeShape(`${prefix}-fallback-green-route-c`, "line", lineBox(
    { x: doc.x - b.w * 0.055, y: doc.y + doc.h * 0.10 },
    { x: doc.x, y: doc.y + doc.h * 0.10 }
  ), {
    stroke: green,
    strokeWidthPt: 7,
    connectorType: "straight",
    endArrow: "triangle"
  }, "prd-generation-flow-native-connector", image, { ...source, role: "machine-output-arrow" }));
  shapes.push(...prdAutoGenerationDocumentShapes(prefix, doc, image, source, documentRows));
  return {
    images: [image],
    shapes,
    textBoxes: [
      ...prdAutoGenerationTextBoxes(prefix, { inputCard, machine, doc, b }, image, source, rawTextBoxes, { omitMachineText: Boolean(engineCrop) }),
      ...createPrdAutoGenerationNarrativeTextBoxes(rawTextBoxes)
    ]
  };
}

function prdAutoGenerationTextBoxes(prefix, layout, image, source = {}, evidenceTextBoxes = [], options = {}) {
  const { inputCard, machine, doc, b } = layout;
  const inputPills = ["目标", "流程", "规则", "角色"].map((text, index) => prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-input-pill-${index}`, text, evidenceTextBoxes, {
    x: inputCard.x + inputCard.w * 0.29,
    y: inputCard.y + inputCard.h * (0.36 + index * 0.16),
    w: inputCard.w * 0.42,
    h: inputCard.h * 0.105
  }, { sizePt: 11.5, color: "#FFFFFF", weight: "bold", align: "center" }, image, source));
  const documentRows = ["业务背景", "功能说明", "异常场景", "验收口径"].map((text, index) => prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-doc-row-${index}`, text, evidenceTextBoxes, {
    x: doc.x + doc.w * 0.10,
    y: doc.y + doc.h * (0.235 + index * 0.185),
    w: doc.w * 0.58,
    h: doc.h * 0.050
  }, { sizePt: 15.2, color: "#FFFFFF", weight: "bold", align: "left" }, image, source));
  const result = [
    prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-input-title`, "结构化需求", evidenceTextBoxes, {
      x: inputCard.x + inputCard.w * 0.10,
      y: inputCard.y + inputCard.h * 0.045,
      w: inputCard.w * 0.80,
      h: inputCard.h * 0.18
    }, { sizePt: 15.8, color: "#FFFFFF", weight: "bold", align: "center" }, image, source),
    ...inputPills,
    prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-machine-title-prd`, "PRD生成", evidenceTextBoxes, {
      x: machine.x + machine.w * 0.34, y: machine.y + machine.h * 0.28, w: machine.w * 0.42, h: machine.h * 0.12
    }, { sizePt: 17.3, color: "#FFFFFF", weight: "bold", align: "center" }, image, source),
    prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-machine-title-skill`, "Skill", evidenceTextBoxes, {
      x: machine.x + machine.w * 0.42, y: machine.y + machine.h * 0.42, w: machine.w * 0.20, h: machine.h * 0.11
    }, { sizePt: 16.5, color: "#FFFFFF", weight: "bold", align: "center" }, image, source),
    prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-doc-title`, "标准 PRD", evidenceTextBoxes, {
      x: doc.x + doc.w * 0.16,
      y: doc.y + doc.h * 0.035,
      w: doc.w * 0.68,
      h: doc.h * 0.110
    }, { sizePt: 22.5, color: "#25A861", weight: "bold", align: "center" }, image, source),
    ...documentRows,
    prdAutoGenerationTextBoxFromEvidence(`${prefix}-native-text-exception-callout`, "异常场景", evidenceTextBoxes, {
      x: b.x + b.w + 6,
      y: doc.y + doc.h * 0.495,
      w: 70,
      h: 22
    }, { sizePt: 13.0, color: "#C46C2B", weight: "bold", align: "left" }, image, source, "rightmost")
  ];
  return options.omitMachineText
    ? result.filter((item) => !/native-text-machine-title-(?:prd|skill)$/.test(String(item.id || "")))
    : result;
}

function materializePrdAutoGenerationEngineCrop(machine = {}, parentImage = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!sourceImage?.rgba || !options.assetDir || !options.irDir) return null;
  const box = clampPtBoxToSlide({
    // The inferred machine extent includes the preceding input arrow. Keep the
    // connector native so the fidelity crop starts at the engine body itself.
    x: Number(machine.x || 0) + Number(machine.w || 0) * 0.12,
    y: Number(machine.y || 0) - 6,
    w: Number(machine.w || 0) * 0.85,
    h: Number(machine.h || 0) * 0.82
  }, slideSize);
  if (box.w < 120 || box.h < 90) return null;
  const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);
  const crop = cropPng(sourceImage, pxBox);
  ensureDir(options.assetDir);
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-prd-generation-engine`, "prd-generation-engine");
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, crop);
  const cropBox = pxToPtBox(pxBox, sourceImage, slideSize, 0);
  return {
    id: `${parentImage.id || "prd-auto-generation"}-engine-illustration-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
    box: cropBox,
    source: {
      editable: false,
      nativeRebuild: true,
      detector: "prd-auto-generation-engine-illustration-crop",
      strategy: "local-fidelity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "prd-generation-engine-illustration",
      recommendedAction: "keep-local-crop",
      parentImageId: parentImage.id || null,
      layerSourceId: parentImage.id || null,
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      nonEditableReason: "complex PRD-generation engine circuit and gear illustration retained as one source-faithful minimum unit",
      ...prdAutoGenerationComponentMetadata("prd-generation-flow-native-machine", { role: "engine-illustration-crop" })
    }
  };
}

function prdAutoGenerationTextBoxFromEvidence(id, text, evidenceTextBoxes, fallbackBox, font, image, source, pick = "leftmost") {
  const candidates = (evidenceTextBoxes || []).filter((item) => normalizeCjkText(item?.text) === normalizeCjkText(text));
  const ordered = candidates.slice().sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));
  const evidence = candidates.length <= 1 ? candidates[0] : pick === "rightmost" ? ordered[ordered.length - 1] : ordered[0];
  const box = evidence?.box || fallbackBox;
  return prdAutoGenerationTextBox(id, text, box, {
    ...font,
    sizePt: Number(evidence?.font?.sizePt || font?.sizePt || 12),
    family: evidence?.font?.family || font?.family
  }, image, source);
}

function prdAutoGenerationTextBox(id, text, box, font = {}, image, source = {}) {
  return {
    id,
    text,
    box: {
      x: round(box.x),
      y: round(box.y),
      w: round(Math.max(1, box.w)),
      h: round(Math.max(1, box.h))
    },
    font: {
      family: font.family || "Microsoft YaHei",
      sizePt: font.sizePt || 12,
      color: font.color || "#111111",
      opacity: 1,
      weight: font.weight || "regular",
      align: font.align || "center",
      valign: "middle"
    },
    style: {
      visibility: "visible",
      opacity: 1,
      wrap: true,
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0
    },
    source: {
      ...source,
      detector: "prd-generation-flow-native-text",
      layerSourceId: image?.id || null,
      ...prdAutoGenerationComponentMetadata("prd-generation-flow-native-text", source, id)
    }
  };
}

function prdAutoGenerationConveyorShapes(prefix, conveyor, image, source = {}) {
  const shapes = [
    prdNativeShape(`${prefix}-fallback-conveyor-body`, "roundRect", conveyor, {
      fill: "#2892DD",
      stroke: "#126FB4",
      strokeWidthPt: 3,
      radiusRatio: 0.28
    }, "prd-generation-flow-native-conveyor", image, { ...source, role: "conveyor-body" }),
    prdNativeShape(`${prefix}-fallback-conveyor-cap`, "ellipse", {
      x: conveyor.x + conveyor.h * 0.12,
      y: conveyor.y + conveyor.h * 0.20,
      w: conveyor.h * 0.60,
      h: conveyor.h * 0.60
    }, {
      fill: "#126FB4",
      stroke: "#126FB4",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-conveyor", image, { ...source, role: "conveyor-cap" })
  ];
  for (let index = 0; index < 7; index += 1) {
    const x = conveyor.x + conveyor.w * (0.18 + index * 0.105);
    const y = conveyor.y + conveyor.h * 0.22;
    shapes.push(prdNativeShape(`${prefix}-fallback-conveyor-chevron-${index}`, "freeform", {
      x,
      y,
      w: conveyor.w * 0.045,
      h: conveyor.h * 0.56
    }, {
      fill: "#126FB4",
      stroke: "#126FB4",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-conveyor", image, { ...source, role: "conveyor-chevron", index }));
    shapes[shapes.length - 1].points = [
      { x: 0, y: 0 },
      { x: 0.58, y: 0 },
      { x: 1, y: 0.5 },
      { x: 0.58, y: 1 },
      { x: 0, y: 1 },
      { x: 0.42, y: 0.5 }
    ];
  }
  return shapes;
}

function prdAutoGenerationMachineShapes(prefix, machine, image, source = {}) {
  const shapes = [];
  const layers = [
    { dx: 0.09, dy: -0.18, w: 0.62, h: 0.28 },
    { dx: -0.08, dy: 0.02, w: 0.72, h: 0.45 },
    { dx: 0.04, dy: -0.05, w: 0.82, h: 0.56 },
    { dx: 0.13, dy: 0.04, w: 0.87, h: 0.64 }
  ];
  layers.forEach((layer, index) => {
    shapes.push(prdNativeShape(`${prefix}-fallback-machine-layer-${index}`, "roundRect", {
      x: machine.x + machine.w * layer.dx,
      y: machine.y + machine.h * layer.dy,
      w: machine.w * layer.w,
      h: machine.h * layer.h
    }, {
      fill: index === layers.length - 1 ? "#218FE4" : "#177FCE",
      stroke: "#126FB4",
      strokeWidthPt: 1.2,
      radiusPt: 4,
      shadow: index === layers.length - 1 ? { color: "#126FB4", alpha: 0.18, blurPt: 6, distancePt: 1, angle: 45 } : undefined
    }, "prd-generation-flow-native-machine", image, { ...source, role: "machine-layer", index }));
  });
  shapes.push(...prdAutoGenerationGearShapes(prefix, {
    x: machine.x + machine.w * 0.06,
    y: machine.y + machine.h * 0.70,
    w: machine.w * 0.17,
    h: machine.w * 0.17
  }, image, source, "large"));
  shapes.push(...prdAutoGenerationGearShapes(prefix, {
    x: machine.x + machine.w * 0.30,
    y: machine.y + machine.h * 0.79,
    w: machine.w * 0.10,
    h: machine.w * 0.10
  }, image, source, "small"));
  [
    [0.48, 0.08, 0.66, 0.08], [0.66, 0.08, 0.73, 0.18], [0.56, 0.20, 0.74, 0.20],
    [0.75, 0.67, 0.84, 0.67], [0.84, 0.67, 0.90, 0.62], [0.76, 0.78, 0.90, 0.78]
  ].forEach(([x1, y1, x2, y2], index) => {
    shapes.push(prdNativeShape(`${prefix}-fallback-machine-circuit-${index}`, "line", lineBox(
      { x: machine.x + machine.w * x1, y: machine.y + machine.h * y1 },
      { x: machine.x + machine.w * x2, y: machine.y + machine.h * y2 }
    ), {
      stroke: "#0E5E9E",
      strokeWidthPt: 2,
      connectorType: "straight",
      lineCap: "round"
    }, "prd-generation-flow-native-machine", image, { ...source, role: "machine-circuit", index }));
  });
  return shapes;
}

function prdAutoGenerationGearShapes(prefix, box, image, source = {}, role) {
  return [
    prdNativeShape(`${prefix}-fallback-gear-${role}-outer`, role === "large" ? "gear9" : "gear6", box, {
      fill: "#126FB4",
      stroke: "#126FB4",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-machine", image, { ...source, role: `gear-${role}` }),
    prdNativeShape(`${prefix}-fallback-gear-${role}-inner`, "ellipse", {
      x: box.x + box.w * 0.30,
      y: box.y + box.h * 0.30,
      w: box.w * 0.40,
      h: box.h * 0.40
    }, {
      fill: "#218FE4",
      stroke: "#218FE4",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-machine", image, { ...source, role: `gear-${role}-hole` })
  ];
}

function prdAutoGenerationDocumentShapes(prefix, doc, image, source = {}, measuredRows = []) {
  const shapes = [
    prdNativeShape(`${prefix}-fallback-document-card`, "roundRect", doc, {
      fill: "#FFFFFF",
      stroke: "#25A861",
      strokeWidthPt: 2.6,
      radiusPt: 6,
      shadow: { color: "#000000", alpha: 0.08, blurPt: 5, distancePt: 1, angle: 45 }
    }, "prd-generation-flow-native-card", image, { ...source, role: "standard-prd-document" })
  ];
  const rowH = doc.h * 0.155;
  for (let index = 0; index < 4; index += 1) {
    const row = measuredRows[index] || {
      x: doc.x + doc.w * 0.06,
      y: doc.y + doc.h * (0.22 + index * 0.185),
      w: doc.w * 0.88,
      h: rowH
    };
    shapes.push(prdNativeShape(`${prefix}-fallback-document-row-${index}`, "roundRect", row, {
      fill: "#EFF0F0",
      stroke: "#EFF0F0",
      strokeWidthPt: 0,
      radiusPt: 4
    }, "prd-generation-flow-native-doc-row", image, { ...source, rowIndex: index }));
    shapes.push(prdNativeShape(`${prefix}-fallback-document-row-header-${index}`, "rect", {
      x: row.x,
      y: row.y,
      w: row.w,
      h: row.h * 0.38
    }, {
      fill: "#25A861",
      stroke: "#25A861",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-doc-row", image, { ...source, rowIndex: index, role: "row-header" }));
    [0.56, 0.76].forEach((ratio, lineIndex) => {
      shapes.push(prdNativeShape(`${prefix}-fallback-document-row-line-${index}-${lineIndex}`, "roundRect", {
        x: row.x + row.w * 0.06,
        y: row.y + row.h * ratio,
        w: row.w * (lineIndex === 0 ? 0.82 : 0.58),
        h: row.h * 0.09
      }, {
        fill: "#CFCFCF",
        stroke: "#CFCFCF",
        strokeWidthPt: 0,
        radiusRatio: 0.18
      }, "prd-generation-flow-native-doc-row", image, { ...source, rowIndex: index, role: "text-line" }));
    });
  }
  shapes.push(prdNativeShape(`${prefix}-fallback-exception-dot`, "ellipse", {
    x: doc.x + doc.w * 0.945,
    y: doc.y + doc.h * 0.505,
    w: doc.w * 0.075,
    h: doc.w * 0.075
  }, {
    fill: "#F37021",
    stroke: "#F37021",
    strokeWidthPt: 0
  }, "prd-generation-flow-native-doc-row", image, { ...source, role: "exception-marker" }));
  shapes.push(prdNativeShape(`${prefix}-fallback-exception-line`, "line", lineBox(
    { x: doc.x + doc.w * 1.02, y: doc.y + doc.h * 0.54 },
    { x: doc.x + doc.w * 1.18, y: doc.y + doc.h * 0.54 }
  ), {
    stroke: "#C46C2B",
    strokeWidthPt: 1.8,
    connectorType: "straight"
  }, "prd-generation-flow-native-connector", image, { ...source, role: "exception-callout" }));
  return shapes;
}

function measurePrdAutoGenerationLayout(fallbackBox, evidenceTextBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  const find = (text, pick = 0) => (evidenceTextBoxes || []).filter((item) => normalizeCjkText(item?.text) === normalizeCjkText(text))[pick] || null;
  const inputEvidence = [find("结构化需求"), find("目标"), find("流程"), find("规则"), find("角色")].filter((item) => item?.box);
  const inputUnion = inputEvidence.reduce((acc, item) => acc ? unionPtBox(acc, item.box) : { ...item.box }, null);
  const inputTitle = find("结构化需求");
  const inputCard = inputUnion && inputTitle?.box ? roundedBox({
    x: inputTitle.box.x - 17,
    y: inputTitle.box.y - 8,
    w: inputTitle.box.w + 34,
    h: inputUnion.y + inputUnion.h - (inputTitle.box.y - 8) + 14
  }) : roundedBox({ x: fallbackBox.x + fallbackBox.w * 0.075, y: fallbackBox.y + fallbackBox.h * 0.105, w: fallbackBox.w * 0.15, h: fallbackBox.h * 0.315 });
  const inputPills = [find("目标"), find("流程"), find("规则"), find("角色")].map((item, index) => item?.box ? roundedBox({
    x: item.box.x - 4,
    y: item.box.y - 2,
    w: item.box.w + 8,
    h: item.box.h + 4
  }) : roundedBox({ x: inputCard.x + inputCard.w * 0.29, y: inputCard.y + inputCard.h * (0.36 + index * 0.16), w: inputCard.w * 0.42, h: inputCard.h * 0.105 }));

  const prdTextBox = find("PRD生成")?.box;
  const skillTextBox = find("Skill")?.box;
  const machineText = prdTextBox && skillTextBox ? unionPtBox(prdTextBox, skillTextBox) : null;
  let machine = roundedBox({ x: fallbackBox.x + fallbackBox.w * 0.315, y: fallbackBox.y + fallbackBox.h * 0.275, w: fallbackBox.w * 0.305, h: fallbackBox.h * 0.320 });
  if (machineText) {
    const front = { x: machineText.x - 60, y: machineText.y - 37, w: machineText.w + 120, h: machineText.h + 89 };
    const baseW = front.w / 0.87;
    const baseH = front.h / 0.64;
    machine = roundedBox({ x: front.x - baseW * 0.13, y: front.y - baseH * 0.04, w: baseW, h: baseH });
  }

  const docTitle = find("标准 PRD");
  const docLabels = [find("业务背景"), find("功能说明"), find("异常场景", 0), find("验收口径")].filter((item) => item?.box);
  const outsideException = (evidenceTextBoxes || []).filter((item) => normalizeCjkText(item?.text) === normalizeCjkText("异常场景")).sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))[1];
  let doc = roundedBox({ x: fallbackBox.x + fallbackBox.w * 0.745, y: fallbackBox.y + fallbackBox.h * 0.035, w: fallbackBox.w * 0.280, h: fallbackBox.h * 0.705 });
  if (docTitle?.box && docLabels.length === 4) {
    const x = Math.min(docTitle.box.x, ...docLabels.map((item) => item.box.x)) - 15;
    const y = docTitle.box.y - 20;
    const right = Number(outsideException?.box?.x || (x + 218)) - 20;
    const bottom = docLabels[3].box.y + docLabels[3].box.h + 67;
    doc = roundedBox({ x, y, w: Math.max(180, right - x), h: Math.max(300, bottom - y) });
  }
  const documentRows = docLabels.map((item, index) => roundedBox({
    x: doc.x + 11,
    y: item.box.y - 5,
    w: doc.w - 22,
    h: index < docLabels.length - 1 ? Math.max(54, docLabels[index + 1].box.y - item.box.y - 10) : 63
  }));

  let conveyor = roundedBox({ x: fallbackBox.x + fallbackBox.w * 0.005, y: fallbackBox.y + fallbackBox.h * 0.530, w: fallbackBox.w * 0.385, h: fallbackBox.h * 0.120 });
  if (sourceImage?.rgba) {
    const blue = (r, g, b, a) => a > 200 && b > 115 && b - r > 22 && b - g > 4 && g > 55;
    const bands = detectHorizontalColorBands(sourceImage, {
      predicate: blue,
      stride: 2,
      region: { x: sourceImage.width * 0.04, y: sourceImage.height * 0.50, w: sourceImage.width * 0.56, h: sourceImage.height * 0.24 },
      minRowCoverage: 0.28,
      minBandHeightPx: sourceImage.height * 0.035,
      maxBands: 4
    }).map((box) => pixelBoxToSlide(box, sourceImage, slideSize)).filter((box) => box.w / Math.max(1, box.h) >= 4);
    if (bands.length > 0) conveyor = bands.sort((a, b) => b.w - a.w)[0];
  }
  return { inputCard, inputPills, machine, conveyor, doc, documentRows };
}

function prdNativeShape(id, type, box, style, detector, image, extraSource = {}) {
  return {
    id,
    type,
    box,
    style,
    source: {
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: image?.id || null,
      ...prdAutoGenerationComponentMetadata(detector, extraSource, id),
      ...extraSource
    }
  };
}

function prdAutoGenerationComponentMetadata(detector = "", extraSource = {}, id = "") {
  const key = `${detector} ${extraSource?.role || ""} ${id}`.toLowerCase();
  let owner = "structure";
  if (/input-card|input-header|input-pill|native-text-input/.test(key)) owner = "input";
  else if (/conveyor/.test(key)) owner = "conveyor";
  else if (/connector|input-to-machine|machine-output|exception-callout/.test(key)) owner = "routing";
  else if (/machine|gear-|native-text-machine/.test(key)) owner = "machine";
  else if (/doc-row|document|native-text-doc|exception/.test(key)) owner = "document";
  return {
    nativeComponentGroupId: `prd-auto-generation-${owner}`,
    nativeComponentArchetype: "prd-auto-generation-flow",
    nativeComponentRole: String(extraSource?.role || detector || "part")
  };
}

function prdInputIllustrationShapes(image) {
  const b = image.box;
  const cardW = b.w * 0.92;
  const cardH = b.h * 0.38;
  const top = { x: b.x + b.w * 0.04, y: b.y + b.h * 0.02, w: cardW, h: cardH };
  const bottom = { x: b.x + b.w * 0.04, y: b.y + b.h * 0.56, w: cardW, h: cardH };
  const shapes = [];
  [top, bottom].forEach((card, index) => {
    const prefix = `${image.id || "prd-input"}-${index}`;
    shapes.push(prdNativeShape(`${prefix}-card`, "roundRect", card, {
      fill: "#FFFFFF",
      stroke: "#2E75A5",
      strokeWidthPt: 2,
      radiusRatio: 0.05,
      shadow: { color: "#2E75A5", alpha: 0.12, blurPt: 6, distancePt: 1, angle: 45 }
    }, "prd-generation-flow-native-input-card", image, { panelIndex: index }));
    shapes.push(prdNativeShape(`${prefix}-header`, "rect", {
      x: card.x + 2,
      y: card.y + 2,
      w: card.w - 4,
      h: Math.max(26, card.h * 0.23)
    }, {
      fill: "#DDF2F1",
      stroke: "#DDF2F1",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-input-header", image, { panelIndex: index }));
  });

  shapes.push(...prdBrowserMockShapes(image, top));
  shapes.push(...prdFlowTreeMockShapes(image, bottom));
  return shapes;
}

function prdBrowserMockShapes(image, card) {
  const base = `${image.id || "prd-browser"}-browser`;
  const x = card.x + card.w * 0.08;
  const y = card.y + card.h * 0.30;
  const w = card.w * 0.78;
  const h = card.h * 0.50;
  const shapes = [
    prdNativeShape(`${base}-window`, "rect", { x, y, w, h }, {
      fill: "#F4FAFC",
      stroke: "#2D6686",
      strokeWidthPt: 1.4
    }, "prd-generation-flow-native-ui-placeholder", image),
    prdNativeShape(`${base}-sidebar`, "rect", { x, y: y + h * 0.25, w: w * 0.25, h: h * 0.75 }, {
      fill: "#E8F3F7",
      stroke: "#2D6686",
      strokeWidthPt: 1
    }, "prd-generation-flow-native-ui-placeholder", image),
    prdNativeShape(`${base}-dot`, "ellipse", { x: x + 8, y: y + 6, w: 10, h: 10 }, {
      fill: "#2E7FC3",
      stroke: "#2E7FC3",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-ui-placeholder", image)
  ];
  for (let index = 0; index < 3; index += 1) {
    shapes.push(prdNativeShape(`${base}-tab-${index}`, "roundRect", {
      x: x + w * (0.46 + index * 0.13),
      y: y + 8,
      w: w * 0.08,
      h: 5
    }, {
      fill: "#2E7FC3",
      stroke: "#2E7FC3",
      strokeWidthPt: 0,
      radiusRatio: 0.5
    }, "prd-generation-flow-native-ui-placeholder", image));
  }
  for (let index = 0; index < 3; index += 1) {
    shapes.push(prdNativeShape(`${base}-field-${index}`, "rect", {
      x: x + w * (0.33 + index * 0.2),
      y: y + h * 0.36,
      w: w * 0.16,
      h: h * 0.18
    }, {
      fill: "#E9F6FA",
      stroke: "#2D6686",
      strokeWidthPt: 1
    }, "prd-generation-flow-native-ui-placeholder", image));
  }
  shapes.push(prdNativeShape(`${base}-wide-field`, "rect", {
    x: x + w * 0.33,
    y: y + h * 0.64,
    w: w * 0.55,
    h: h * 0.16
  }, {
    fill: "#E9F6FA",
    stroke: "#2D6686",
    strokeWidthPt: 1
  }, "prd-generation-flow-native-ui-placeholder", image));
  shapes.push(prdNativeShape(`${base}-button`, "roundRect", {
    x: x + w * 0.51,
    y: y + h * 0.84,
    w: w * 0.17,
    h: h * 0.10
  }, {
    fill: "#2E7FC3",
    stroke: "#2E7FC3",
    strokeWidthPt: 0,
    radiusRatio: 0.5
  }, "prd-generation-flow-native-ui-placeholder", image));
  return shapes;
}

function prdFlowTreeMockShapes(image, card) {
  const shapes = [];
  const cx = card.x + card.w * 0.52;
  const topY = card.y + card.h * 0.38;
  const nodeStyle = { fill: "#97C7DF", stroke: "#2D6686", strokeWidthPt: 1.2 };
  const root = { x: cx - 10, y: topY, w: 20, h: 20 };
  const nodes = [
    root,
    { x: cx - 70, y: topY + 45, w: 19, h: 19 },
    { x: cx - 12, y: topY + 45, w: 19, h: 19 },
    { x: cx + 48, y: topY + 45, w: 19, h: 19 },
    { x: cx - 105, y: topY + 92, w: 19, h: 19 },
    { x: cx - 42, y: topY + 92, w: 19, h: 19 },
    { x: cx + 86, y: topY + 92, w: 19, h: 19 }
  ];
  const lineStyle = { stroke: "#2D6686", strokeWidthPt: 1.5, connectorType: "straight" };
  [
    lineBox({ x: cx, y: topY + 20 }, { x: cx, y: topY + 40 }),
    lineBox({ x: cx - 60, y: topY + 40 }, { x: cx + 58, y: topY + 40 }),
    lineBox({ x: cx - 60, y: topY + 40 }, { x: cx - 60, y: topY + 45 }),
    lineBox({ x: cx, y: topY + 40 }, { x: cx, y: topY + 45 }),
    lineBox({ x: cx + 58, y: topY + 40 }, { x: cx + 58, y: topY + 45 }),
    lineBox({ x: cx - 60, y: topY + 64 }, { x: cx - 95, y: topY + 92 }),
    lineBox({ x: cx - 60, y: topY + 64 }, { x: cx - 32, y: topY + 92 }),
    lineBox({ x: cx + 58, y: topY + 64 }, { x: cx + 96, y: topY + 92 })
  ].forEach((box, index) => {
    shapes.push(prdNativeShape(`${image.id || "prd-tree"}-line-${index}`, "line", box, lineStyle, "prd-generation-flow-native-connector", image, { internal: true }));
  });
  nodes.forEach((box, index) => {
    shapes.push(prdNativeShape(`${image.id || "prd-tree"}-node-${index}`, "ellipse", box, nodeStyle, "prd-generation-flow-native-ui-placeholder", image));
  });
  return shapes;
}

function prdDocumentIllustrationShapes(image) {
  const b = image.box;
  const card = { x: b.x + b.w * 0.03, y: b.y + b.h * 0.02, w: b.w * 0.94, h: b.h * 0.94 };
  const shapes = [
    prdNativeShape(`${image.id || "prd-doc"}-card`, "roundRect", card, {
      fill: "#FFFFFF",
      stroke: "#25A36C",
      strokeWidthPt: 2.2,
      radiusRatio: 0.04,
      shadow: { color: "#25A36C", alpha: 0.10, blurPt: 7, distancePt: 1, angle: 45 }
    }, "prd-generation-flow-native-card", image),
    prdNativeShape(`${image.id || "prd-doc"}-header`, "rect", {
      x: card.x + 2,
      y: card.y + 2,
      w: card.w - 4,
      h: card.h * 0.13
    }, {
      fill: "#22AD70",
      stroke: "#22AD70",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-header", image)
  ];
  for (let index = 1; index < 4; index += 1) {
    shapes.push(prdNativeShape(`${image.id || "prd-doc"}-divider-${index}`, "line", {
      x: card.x,
      y: card.y + card.h * (0.13 + index * 0.218),
      w: card.w,
      h: 0.1
    }, {
      stroke: "#25A36C",
      strokeWidthPt: 1.2,
      connectorType: "straight"
    }, "prd-generation-flow-native-divider", image));
  }
  for (let index = 0; index < 4; index += 1) {
    const y = card.y + card.h * (0.18 + index * 0.218);
    shapes.push(prdNativeShape(`${image.id || "prd-doc"}-label-${index}`, "rect", {
      x: card.x + card.w * 0.01,
      y,
      w: card.w * 0.30,
      h: card.h * 0.12
    }, {
      fill: "#DDF2E8",
      stroke: "#DDF2E8",
      strokeWidthPt: 0
    }, "prd-generation-flow-native-doc-row", image, { rowIndex: index }));
    shapes.push(prdNativeShape(`${image.id || "prd-doc"}-line-a-${index}`, "roundRect", {
      x: card.x + card.w * 0.07,
      y: y + card.h * 0.12,
      w: card.w * 0.86,
      h: 6
    }, {
      fill: "#D7F1E5",
      stroke: "#D7F1E5",
      strokeWidthPt: 0,
      radiusRatio: 0.5
    }, "prd-generation-flow-native-doc-row", image, { rowIndex: index }));
    shapes.push(prdNativeShape(`${image.id || "prd-doc"}-line-b-${index}`, "roundRect", {
      x: card.x + card.w * 0.07,
      y: y + card.h * 0.20,
      w: card.w * 0.60,
      h: 6
    }, {
      fill: "#D7F1E5",
      stroke: "#D7F1E5",
      strokeWidthPt: 0,
      radiusRatio: 0.5
    }, "prd-generation-flow-native-doc-row", image, { rowIndex: index }));
  }
  return shapes;
}

function prdNodeIllustrationShapes(image) {
  const b = image.box;
  const size = Math.min(b.w * 0.58, b.h * 0.78);
  const node = { x: b.x + b.w / 2 - size / 2, y: b.y + b.h * 0.08, w: size, h: size };
  return [prdNativeShape(`${image.id || "prd-node"}-hex`, "hexagon", node, {
    fill: "#2E7FC3",
    stroke: "#2E7FC3",
    strokeWidthPt: 0,
    shadow: { color: "#2E7FC3", alpha: 0.16, blurPt: 6, distancePt: 0, angle: 0 }
  }, "prd-generation-flow-native-node", image)];
}

function prdSegmentedConnectorShapes({ leftImage, nodeImage, docImage }) {
  const shapes = [];
  const leftRight = leftImage.box.x + leftImage.box.w;
  const nodeLeft = nodeImage.box.x;
  const nodeRight = nodeImage.box.x + nodeImage.box.w;
  const elbowX = leftRight + (nodeLeft - leftRight) * 0.45;
  const topStartY = leftImage.box.y + leftImage.box.h * 0.232;
  const bottomStartY = leftImage.box.y + leftImage.box.h * 0.762;
  const topTargetY = nodeImage.box.y + nodeImage.box.h * 0.39;
  const bottomTargetY = nodeImage.box.y + nodeImage.box.h * 0.61;
  const outputY = nodeImage.box.y + nodeImage.box.h * 0.50;
  const lines = [
    { from: { x: leftRight, y: topStartY }, to: { x: elbowX, y: topStartY }, stroke: "#2E7FC3" },
    { from: { x: elbowX, y: topStartY }, to: { x: elbowX, y: topTargetY }, stroke: "#2E7FC3" },
    { from: { x: elbowX, y: topTargetY }, to: { x: nodeLeft, y: topTargetY }, stroke: "#2E7FC3", arrow: true },
    { from: { x: leftRight, y: bottomStartY }, to: { x: elbowX, y: bottomStartY }, stroke: "#2E7FC3" },
    { from: { x: elbowX, y: bottomStartY }, to: { x: elbowX, y: bottomTargetY }, stroke: "#2E7FC3" },
    { from: { x: elbowX, y: bottomTargetY }, to: { x: nodeLeft, y: bottomTargetY }, stroke: "#2E7FC3", arrow: true },
    { from: { x: nodeRight, y: outputY }, to: { x: docImage.box.x, y: outputY }, stroke: "#28A76D", arrow: true }
  ];
  lines.forEach((line, index) => {
    shapes.push(prdNativeShape(`${nodeImage.id || "prd-segment"}-connector-${index}`, "line", lineBox(line.from, line.to), {
      stroke: line.stroke,
      strokeWidthPt: 3,
      connectorType: "straight",
      ...(line.arrow ? { endArrow: "triangle" } : {})
    }, "prd-generation-flow-native-connector", index < 2 ? leftImage : nodeImage, { connectorIndex: index }));
  });
  return shapes;
}

function shouldObjectifyPrdGenerationFlow(image, textBoxes = []) {
  const box = image?.box || {};
  if (image?.source?.detector !== "foreground-graphic-underlay-crop") return false;
  if (!box.w || !box.h || box.w < 700 || box.h < 250) return false;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 10, 10)))
    .map((item) => String(item.text || "").trim()));
  return labels.has("InteractivePrototype")
    && labels.has("Structured Brief")
    && labels.has("PRD")
    && labels.has("业务背景")
    && labels.has("字段规则")
    && labels.has("异常场景")
    && labels.has("验收口径");
}

function inferPrdGenerationFlow(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const byText = new Map((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 12, 12)))
    .map((item) => [String(item.text || "").trim(), item.box]));
  const prd = byText.get("PRD");
  const labels = ["业务背景", "字段规则", "异常场景", "验收口径"].map((label) => byText.get(label)).filter(Boolean);
  const nodeText = byText.get("馆");
  const proto = byText.get("InteractivePrototype");
  const brief = byText.get("Structured Brief");
  if (!prd || labels.length !== 4 || !nodeText || !proto || !brief) return null;

  const labelUnion = labels.reduce((acc, item) => unionPtBox(acc, item), prd);
  const docLeft = clamp(Math.min(prd.x, labelUnion.x) - 26, box.x + box.w * 0.58, box.x + box.w * 0.78);
  const docTop = clamp(prd.y - 16, box.y, box.y + box.h * 0.18);
  const docRight = clamp(Math.max(labelUnion.x + labelUnion.w + 118, box.x + box.w * 0.95), docLeft + 190, box.x + box.w);
  const docBottom = clamp(labels[labels.length - 1].y + labels[labels.length - 1].h + 42, docTop + 220, box.y + box.h);
  const documentCard = expandPtBox({ x: docLeft, y: docTop, w: docRight - docLeft, h: docBottom - docTop }, slideSize, 0, 0);
  const header = expandPtBox({ x: documentCard.x, y: documentCard.y, w: documentCard.w, h: Math.max(34, prd.h + 22) }, slideSize, 0, 0);
  const dividers = labels.slice(0, -1).map((label) => ({
    x: round(documentCard.x + 14),
    y: round(label.y + label.h + 25),
    w: round(documentCard.w - 28),
    h: 0.1
  }));
  const nodeSize = clamp(Math.max(nodeText.w, nodeText.h) + 26, 58, 82);
  const node = expandPtBox({
    x: nodeText.x + nodeText.w / 2 - nodeSize / 2,
    y: nodeText.y + nodeText.h / 2 - nodeSize / 2,
    w: nodeSize,
    h: nodeSize
  }, slideSize, 0, 0);
  const leftTop = { x: proto.x + proto.w + 38, y: proto.y + proto.h / 2 + 30 };
  const leftBottom = { x: brief.x + brief.w + 38, y: brief.y + brief.h / 2 - 26 };
  const nodeLeft = { x: node.x - 3, y: node.y + node.h / 2 };
  const nodeRight = { x: node.x + node.w + 3, y: node.y + node.h / 2 };
  const docAnchor = { x: documentCard.x - 8, y: documentCard.y + documentCard.h * 0.50 };
  return {
    documentCard,
    header,
    dividers,
    node,
    residualCrops: [
      {
        name: "prototype-panel",
        box: expandPtBox({
          x: box.x,
          y: box.y,
          w: Math.max(proto.x + proto.w + 24 - box.x, box.w * 0.22),
          h: Math.max(proto.y + proto.h + 104 - box.y, box.h * 0.38)
        }, slideSize, 0, 0)
      },
      {
        name: "brief-panel",
        box: expandPtBox({
          x: box.x,
          y: Math.max(box.y + box.h * 0.48, brief.y - 32),
          w: Math.max(brief.x + brief.w + 34 - box.x, box.w * 0.22),
          h: Math.min(box.y + box.h, brief.y + brief.h + 106) - Math.max(box.y + box.h * 0.48, brief.y - 32)
        }, slideSize, 0, 0)
      }
    ],
    connectors: [
      lineBox(leftTop, nodeLeft),
      lineBox(leftBottom, nodeLeft),
      lineBox(nodeRight, docAnchor)
    ]
  };
}

function pixelBoxToSlide(box, image, slideSize) { return roundedBox({ x: box.x * slideSize.widthPt / image.width, y: box.y * slideSize.heightPt / image.height, w: box.w * slideSize.widthPt / image.width, h: box.h * slideSize.heightPt / image.height }); }

function normalizeCjkText(value = "") {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/Al/g, "AI")
    .trim();
}

function boxOverlapArea(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(Number(a.x || 0), Number(b.x || 0));
  const y1 = Math.max(Number(a.y || 0), Number(b.y || 0));
  const x2 = Math.min(Number(a.x || 0) + Number(a.w || 0), Number(b.x || 0) + Number(b.w || 0));
  const y2 = Math.min(Number(a.y || 0) + Number(a.h || 0), Number(b.y || 0) + Number(b.h || 0));
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

function roundedBox(box = {}) {
  return {
    x: round(Number(box.x || 0)),
    y: round(Number(box.y || 0)),
    w: round(Math.max(0.1, Number(box.w || 0))),
    h: round(Math.max(0.1, Number(box.h || 0)))
  };
}

module.exports = { createPrdGenerationFlowShapes, inferSegmentedPrdGenerationFlow, boxOverlapArea, shouldPreservePrdSegmentCrop, prdSegmentedConnectorShapes, prdNativeShape, prdAutoGenerationComponentMetadata, prdInputIllustrationShapes, prdBrowserMockShapes, prdFlowTreeMockShapes, prdDocumentIllustrationShapes, prdNodeIllustrationShapes, restorePrdGenerationInputCardCrop, readPrdGenerationPristineSourceImage, paintPngRect, hexToRgb, restorePrdGenerationDocumentCrop, restorePrdGenerationCenterMinimumUnit, inferPrdAutoGenerationTitleFallbackFlow, measurePrdAutoGenerationLayout, normalizeCjkText, roundedBox, pixelBoxToSlide, prdAutoGenerationConveyorShapes, materializePrdAutoGenerationEngineCrop, prdAutoGenerationMachineShapes, prdAutoGenerationGearShapes, prdAutoGenerationDocumentShapes, prdAutoGenerationTextBoxes, prdAutoGenerationTextBoxFromEvidence, prdAutoGenerationTextBox, shouldObjectifyPrdGenerationFlow, inferPrdGenerationFlow };
