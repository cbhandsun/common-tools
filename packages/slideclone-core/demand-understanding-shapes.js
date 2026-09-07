"use strict";

const { boxCenterInside, expandPtBox, clamp, constrainPtBox, round, ptToPxBox, pxToPtBox } = require("./raster-native-detection");
const { lineBox, safeIdentifier } = require("./workflow-shape-primitives");
const { safeComponentToken } = require("./diagram-residual-crops");
const { ensureDir } = require("./residual-primitive-erasure");
const { clampPtBoxToSlide } = require("./structured-residual-splitting");
const path = require("path");
const { writePng, cropPng } = require("./png");
const DEFAULT_SLIDE = { widthPt: 960, heightPt: 540 };

function createDemandUnderstandingFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!sourceImage) return [];
  const shapes = [];
  const preservedImages = [];
  for (const image of images || []) {
    if (!shouldObjectifyDemandUnderstandingFlow(image, textBoxes)) continue;
    const flow = inferDemandUnderstandingFlow(image, textBoxes, slideSize);
    if (!flow) continue;
    const layerSourceId = image.id || null;
    const materialTiles = (flow.materialTiles || []).map((tile, index) => ({
      ...tile,
      layerSourceId,
      materialIndex: tile.materialIndex ?? index
    }));
    const cards = (flow.cards || []).map((card, index) => ({ ...card, layerSourceId, cardIndex: index }));
    image.source = {
      ...(image.source || {}),
      ...demandUnderstandingComponentSource(image.id || null),
      demandUnderstandingFlowObjectified: true,
      objectifiedDemandCards: cards.length,
      objectifiedDemandConnectors: flow.connectors.length,
      objectifiedDemandMaterials: materialTiles.length,
      objectifiedDemandLensParts: (flow.lensShapes || []).filter((item) => /native-(?:lens|lens-facet|lens-highlight|handle)$/.test(String(item?.detector || ""))).length,
      preservedDemandIllustrations: (flow.illustrationRegions || []).length,
      demandUnderstandingResidualBoxes: flow.residualCrops,
      demandUnderstandingNativeTextBoxes: [
        ...demandUnderstandingMaterialTextBoxes(materialTiles),
        ...demandUnderstandingCardTextBoxes(cards),
        ...demandUnderstandingWarningTextBoxes(cards)
      ],
      dropErasedResidualAfterNativeRebuild: flow.dropResidual === true ? true : image.source?.dropErasedResidualAfterNativeRebuild,
      nonEditableReason: flow.dropResidual === true
        ? `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt demand understanding materials, lens, output cards, and routing natively`
        : `${image.source?.nonEditableReason || image.source?.reason || "diagram underlay"}; rebuilt demand understanding output cards and branch connectors natively while preserving input and lens graphics`
    };
    preservedImages.push(...materializeDemandUnderstandingIllustrationCrops(image, flow.illustrationRegions, slideSize, options));
    for (let index = 0; index < (flow.lensShapes || []).length; index += 1) {
      const item = flow.lensShapes[index];
      shapes.push({
        id: `${image.id || "demand-understanding"}-native-lens-${index}`,
        type: item.type || "rect",
        box: item.box,
        rotation: item.rotation,
        style: item.style,
        source: {
          editable: true,
          nativeRebuild: true,
          ...demandUnderstandingComponentSource(image.id || null),
          detector: item.detector,
          layerSourceId: image.id || null,
          partIndex: index,
          ...demandUnderstandingNativeComponentMetadata(image.id, "convergence-beam", item.detector)
        }
      });
    }
    for (let index = 0; index < (flow.inputShapes || []).length; index += 1) {
      const item = flow.inputShapes[index];
      shapes.push({
        id: `${image.id || "demand-understanding"}-native-input-${index}`,
        type: item.type || "rect",
        box: item.box,
        rotation: item.rotation,
        style: item.style,
        source: {
          editable: true,
          nativeRebuild: true,
          ...demandUnderstandingComponentSource(image.id || null),
          detector: item.detector,
          layerSourceId: image.id || null,
          materialIndex: item.materialIndex ?? undefined,
          ...demandUnderstandingNativeComponentMetadata(
            image.id,
            item.materialIndex === undefined ? "input-background" : `input-material-${item.materialIndex}`,
            item.detector
          )
        }
      });
    }
    for (let index = 0; index < cards.length; index += 1) {
      const card = cards[index];
      shapes.push({
        id: `${image.id || "demand-understanding"}-native-card-${index}`,
        type: "roundRect",
        box: card.box,
        style: {
          fill: card.fill,
          stroke: card.fill,
          strokeWidthPt: 0,
          radiusRatio: 0.08,
          shadow: {
            color: "#000000",
            alpha: 0.12,
            blurPt: 7,
            distancePt: 2,
            angle: 45
          }
        },
        source: {
          editable: true,
          nativeRebuild: true,
          ...demandUnderstandingComponentSource(image.id || null),
          detector: "demand-understanding-flow-native-card",
          layerSourceId: image.id || null,
          label: card.label,
          ...demandUnderstandingNativeComponentMetadata(image.id, `output-card-${index}`, "card")
        }
      });
      if (card.warningBadge) {
        shapes.push({
          id: `${image.id || "demand-understanding"}-native-warning-${index}`,
          type: "ellipse",
          box: card.warningBadge,
          style: {
            fill: "#F47B20",
            stroke: "#F47B20",
            strokeWidthPt: 0,
            shadow: {
              color: "#000000",
              alpha: 0.14,
              blurPt: 4,
              distancePt: 1,
              angle: 45
            }
          },
          source: {
            editable: true,
            nativeRebuild: true,
            ...demandUnderstandingComponentSource(image.id || null),
            detector: "demand-understanding-flow-native-warning-badge",
            layerSourceId: image.id || null,
            label: card.label,
            ...demandUnderstandingNativeComponentMetadata(image.id, `output-card-${index}`, "warning-badge")
          }
        });
      }
    }
    for (let index = 0; index < flow.connectors.length; index += 1) {
      shapes.push({
        id: `${image.id || "demand-understanding"}-native-connector-${index}`,
        type: "line",
        box: flow.connectors[index],
        style: {
          stroke: "#2B78C2",
          strokeWidthPt: 3,
          connectorType: "straight",
          endArrow: index > 0 ? "triangle" : undefined
        },
        source: {
          editable: true,
          nativeRebuild: true,
          ...demandUnderstandingComponentSource(image.id || null),
          detector: "demand-understanding-flow-native-connector",
          layerSourceId: image.id || null,
          connectorIndex: index,
          ...demandUnderstandingNativeComponentMetadata(image.id, "output-routing", "connector")
        }
      });
    }
  }
  shapes.images = preservedImages;
  return shapes;
}

function demandUnderstandingComponentSource(layerSourceId = null) {
  return {
    componentTemplateFamilyApplied: "process-chain",
    componentTemplateTargetMotifs: ["lens-funnel-flow", "branch-card-flow", "linear-arrow-chain"],
    componentTemplateApplicationMode: "specialized-native-process-component-candidate",
    componentRenderStrategy: {
      provider: "specialized-native-component-signal-v1",
      mode: "plugin-component-template",
      templateFamily: "process-chain",
      targetMotifs: ["lens-funnel-flow", "branch-card-flow", "linear-arrow-chain"],
      sourcePreference: ["islide-search", "officeplus-search", "native-specialized-rebuild"]
    },
    ...(layerSourceId ? { componentAssetLayerKey: String(layerSourceId) } : {})
  };
}

function demandUnderstandingNativeComponentMetadata(layerSourceId, role, part) {
  const base = safeComponentToken(layerSourceId || "demand-understanding-flow");
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `${base}-demand-flow-${safeRole}`,
    nativeComponentParentId: `${base}-demand-flow`,
    nativeComponentArchetype: "demand-understanding-flow",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role || "unknown",
    nativeComponentPart: part || "detail"
  };
}

function shouldObjectifyDemandUnderstandingFlow(image, textBoxes = []) {
  const box = image?.box || {};
  if (image?.source?.detector !== "foreground-graphic-underlay-crop") return false;
  if (!box.w || !box.h || box.w < 760 || box.h < 250) return false;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 12, 12)))
    .map((item) => String(item.text || "").trim()));
  const hasFullDemandFlowSemantics = labels.has("会议纪要")
    && labels.has("业务截图")
    && labels.has("业务目标")
    && labels.has("角色关系")
    && labels.has("核心流程")
    && labels.has("异常与盲区暴露");
  if (hasFullDemandFlowSemantics) return true;
  if (shouldRespectGridNativeAtomStrategy(image)) return false;
  return image?.source?.layer?.layerType === "table-zone"
    && image?.source?.layer?.recommendedAction === "attempt-native-reconstruction"
    && /需求理解|业务描述|结构化蓝图/.test((textBoxes || []).map((item) => String(item?.text || "")).join(" "));
}

function shouldRespectGridNativeAtomStrategy(image = {}) {
  const source = image?.source || {};
  const strategy = source.componentRenderStrategy || source.layer?.componentRenderStrategy || {};
  const family = String(strategy.templateFamily || source.layer?.templateFamily || source.layer?.diagramUnderstanding?.componentStrategy?.templateFamily || "").toLowerCase();
  const archetype = String(source.layer?.diagramUnderstanding?.archetype || source.expressionSubtype || "").toLowerCase();
  return strategy.mode === "native-visual-atom-rebuild"
    && (/grid-or-matrix|matrix|grid|table/.test(family) || /matrix-or-grid|table-grid/.test(archetype));
}

function inferDemandUnderstandingFlow(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const byText = new Map((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 12, 12)))
    .map((item) => [String(item.text || "").trim(), item.box]));
  const outputLabels = ["业务目标", "角色关系", "核心流程", "异常与盲区暴露"];
  const outputs = outputLabels.map((label) => ({ label, textBox: byText.get(label) })).filter((item) => item.textBox);
  const materialLabels = ["会议纪要", "旧版说明", "业务截图", "飞书对话"]
    .map((label) => ({ label, textBox: byText.get(label) }))
    .filter((item) => item.textBox);
  if (outputs.length !== 4 || materialLabels.length < 3) {
    return inferDemandUnderstandingFlowFromLayout(image, slideSize);
  }

  const cardW = clamp(box.w * 0.23, 128, 178);
  const cardH = clamp(box.h * 0.16, 45, 62);
  const cards = outputs.map((item, index) => {
    const text = item.textBox;
    const cardBox = expandPtBox({
      x: text.x + text.w / 2 - cardW / 2,
      y: text.y + text.h / 2 - cardH / 2,
      w: cardW,
      h: cardH
    }, slideSize, 0, 0);
    return {
      label: item.label,
      fill: index === outputs.length - 1 ? "#1F6FB9" : "#3278D5",
      box: cardBox,
      connectorTargetX: cardBox.x - 4,
      warningBadge: demandUnderstandingWarningBadgeBox(cardBox, item.label)
    };
  });

  const lensBox = expandPtBox({
    x: box.x + box.w * 0.38,
    y: box.y + box.h * 0.22,
    w: box.w * 0.30,
    h: box.h * 0.70
  }, slideSize, 0, 0);
  const inputBox = expandPtBox({
    x: box.x,
    y: box.y + box.h * 0.02,
    w: box.w * 0.36,
    h: box.h * 0.96
  }, slideSize, 0, 0);
  const materialTileW = clamp(inputBox.w * 0.38, 108, 136);
  const materialTileH = clamp(inputBox.h * 0.27, 68, 86);
  const materialTiles = materialLabels.map((item) => {
    const text = item.textBox;
    return {
      name: materialResidualName(item.label),
      label: item.label,
      box: expandPtBox({
        x: text.x + text.w / 2 - materialTileW / 2,
        y: text.y + text.h / 2 - materialTileH / 2,
        w: materialTileW,
        h: materialTileH
      }, slideSize, 0, 0)
    };
  });
  const inputBeam = expandPtBox({
    x: inputBox.x + inputBox.w * 0.70,
    y: inputBox.y + inputBox.h * 0.35,
    w: Math.max(78, lensBox.x - (inputBox.x + inputBox.w * 0.70) + 28),
    h: inputBox.h * 0.34
  }, slideSize, 0, 0);
  const trunkStart = { x: lensBox.x + lensBox.w * 0.77, y: lensBox.y + lensBox.h * 0.43 };
  const branchX = cards[0].box.x - 36;
  const trunkY = trunkStart.y;
  const topY = cards[0].box.y + cards[0].box.h / 2;
  const bottomY = cards[cards.length - 1].box.y + cards[cards.length - 1].box.h / 2;
  const connectors = [
    lineBox(trunkStart, { x: branchX, y: trunkY }),
    lineBox({ x: branchX, y: topY }, { x: branchX, y: bottomY }),
    ...cards.map((card) => lineBox({ x: branchX, y: card.box.y + card.box.h / 2 }, { x: card.connectorTargetX, y: card.box.y + card.box.h / 2 }))
  ];
  const lensShapes = demandUnderstandingLensShapes({ inputBeam, lensBox, trunkStart });
  return {
    residualCrops: [],
    dropResidual: true,
    materialTiles,
    inputShapes: demandUnderstandingInputShapes({ inputBox, materialTiles }),
    lensShapes: lensShapes.filter((item) => /native-(?:beam|beam-guide)$/.test(String(item?.detector || ""))),
    illustrationRegions: [{
      name: "gem-lens",
      box: demandUnderstandingLensIllustrationBox(lensBox),
      expressionSubtype: "faceted-gem-magnifier",
      nonEditableReason: "faceted gemstone magnifier retained as one source-faithful illustration instead of approximating its facets and handle with generic Office shapes"
    }],
    cards,
    connectors
  };
}

function demandUnderstandingLensIllustrationBox(lensBox = {}) {
  const cx = Number(lensBox.x || 0) + Number(lensBox.w || 0) * 0.50;
  const cy = Number(lensBox.y || 0) + Number(lensBox.h || 0) * 0.40;
  const radius = Math.min(Number(lensBox.w || 0) * 0.25, Number(lensBox.h || 0) * 0.34);
  return {
    x: cx - radius * 1.16,
    y: cy - radius * 1.24,
    w: radius * 3.08,
    h: radius * 3.58
  };
}

function materializeDemandUnderstandingIllustrationCrops(parentImage = {}, regions = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir || !Array.isArray(regions) || regions.length === 0) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-demand-understanding`, "demand-understanding");
  return regions.map((region, index) => {
    const box = clampPtBoxToSlide(region.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${region.name || index}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parentImage.id || "demand-understanding"}-${region.name || index}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "demand-understanding-flow-illustration-crop",
        parentDetector: parentImage.source?.detector || null,
        parentImageId: parentImage.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: region.expressionSubtype || "demand-understanding-illustration",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: region.nonEditableReason || "source-faithful demand-understanding illustration retained as one minimum visual unit"
      }
    };
  });
}

function inferDemandUnderstandingFlowFromLayout(image, slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  if (!box?.w || !box?.h) return null;
  const outputLabels = ["业务目标", "角色关系", "核心流程", "异常与盲区暴露"];
  const cardW = clamp(box.w * 0.22, 168, 210);
  const cardH = clamp(box.h * 0.15, 38, 52);
  const cardX = box.x + box.w * 0.77;
  const yRatios = [0.04, 0.32, 0.60, 0.88];
  const cards = outputLabels.map((label, index) => {
    const cardBox = constrainPtBox({
      x: cardX,
      y: box.y + box.h * yRatios[index] - cardH * 0.18,
      w: cardW,
      h: cardH
    }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });
    return {
      label,
      fill: index === outputLabels.length - 1 ? "#1F6FB9" : "#3278D5",
      box: cardBox,
      connectorTargetX: cardBox.x - 4,
      warningBadge: demandUnderstandingWarningBadgeBox(cardBox, label)
    };
  });
  const branchX = cards[0].box.x - 42;
  const trunkStart = { x: box.x + box.w * 0.66, y: box.y + box.h * 0.52 };
  const topY = cards[0].box.y + cards[0].box.h / 2;
  const bottomY = cards[cards.length - 1].box.y + cards[cards.length - 1].box.h / 2;
  const connectors = [
    lineBox(trunkStart, { x: branchX, y: trunkStart.y }),
    lineBox({ x: branchX, y: topY }, { x: branchX, y: bottomY }),
    ...cards.map((card) => lineBox({ x: branchX, y: card.box.y + card.box.h / 2 }, { x: card.connectorTargetX, y: card.box.y + card.box.h / 2 }))
  ];
  return {
    residualCrops: [
      { name: "input-materials", box: constrainPtBox({ x: box.x, y: box.y + box.h * 0.03, w: box.w * 0.34, h: box.h * 0.91 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) },
      { name: "lens-funnel", box: constrainPtBox({ x: box.x + box.w * 0.30, y: box.y + box.h * 0.22, w: box.w * 0.39, h: box.h * 0.75 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }) }
    ],
    cards,
    connectors
  };
}

function demandUnderstandingInputShapes({ inputBox, materialTiles = [] }) {
  const shapes = [];
  const backplates = [
    { x: inputBox.x + inputBox.w * 0.00, y: inputBox.y + inputBox.h * 0.28, w: inputBox.w * 0.28, h: inputBox.h * 0.25, fill: "#1559A6" },
    { x: inputBox.x + inputBox.w * 0.16, y: inputBox.y + inputBox.h * 0.59, w: inputBox.w * 0.42, h: inputBox.h * 0.25, fill: "#2B75C7" },
    { x: inputBox.x + inputBox.w * 0.36, y: inputBox.y + inputBox.h * 0.06, w: inputBox.w * 0.54, h: inputBox.h * 0.28, fill: "#2B75C7" },
    { x: inputBox.x + inputBox.w * 0.72, y: inputBox.y + inputBox.h * 0.20, w: inputBox.w * 0.25, h: inputBox.h * 0.25, fill: "#174E94" },
    { x: inputBox.x + inputBox.w * 0.72, y: inputBox.y + inputBox.h * 0.55, w: inputBox.w * 0.25, h: inputBox.h * 0.28, fill: "#1E62AD" },
    { x: inputBox.x + inputBox.w * 0.42, y: inputBox.y + inputBox.h * 0.00, w: inputBox.w * 0.24, h: inputBox.h * 0.97, fill: "#D6D8DC", alpha: 0.70 }
  ];
  backplates.forEach((box, _index) => {
    shapes.push({
      type: "roundRect",
      box,
      detector: "demand-understanding-flow-native-backplate",
      style: {
        fill: box.fill,
        stroke: box.fill,
        opacity: box.alpha || 1,
        strokeWidthPt: 0,
        radiusRatio: 0.04
      }
    });
  });
  materialTiles.forEach((tile, index) => {
    const headerH = Math.max(14, tile.box.h * 0.22);
    shapes.push({
      type: "roundRect",
      box: tile.box,
      detector: "demand-understanding-flow-native-material-card",
      materialIndex: index,
      style: {
        fill: "#F3FAFF",
        stroke: "#D7EAF8",
        strokeWidthPt: 0.4,
        radiusRatio: 0.04,
        shadow: { color: "#000000", alpha: 0.12, blurPt: 5, distancePt: 1, angle: 45 }
      }
    });
    shapes.push({
      type: "rect",
      box: {
        x: tile.box.x + Math.max(2, tile.box.w * 0.025),
        y: tile.box.y + headerH,
        w: Math.max(1, tile.box.w - Math.max(4, tile.box.w * 0.05)),
        h: Math.max(1, tile.box.h - headerH - Math.max(3, tile.box.h * 0.04))
      },
      detector: "demand-understanding-flow-native-material-body-tint",
      materialIndex: index,
      style: {
        fill: index % 2 === 0 ? "#ECF8FF" : "#F6FBFF",
        stroke: index % 2 === 0 ? "#ECF8FF" : "#F6FBFF",
        opacity: 0.72,
        strokeWidthPt: 0
      }
    });
    shapes.push({
      type: "rect",
      box: {
        x: tile.box.x,
        y: tile.box.y,
        w: tile.box.w,
        h: headerH
      },
      detector: "demand-understanding-flow-native-material-header",
      materialIndex: index,
      style: {
        fill: index % 2 === 0 ? "#2A78D2" : "#1F5FA9",
        stroke: index % 2 === 0 ? "#2A78D2" : "#1F5FA9",
        strokeWidthPt: 0
      }
    });
  });
  return shapes;
}

function demandUnderstandingLensShapes({ inputBeam, lensBox, trunkStart }) {
  const cx = lensBox.x + lensBox.w * 0.50;
  const cy = lensBox.y + lensBox.h * 0.40;
  const radius = Math.min(lensBox.w * 0.25, lensBox.h * 0.34);
  const outer = { x: cx - radius, y: cy - radius, w: radius * 2, h: radius * 2 };
  const inner = expandPtBox(outer, DEFAULT_SLIDE, -12, -12);
  const beamStart = {
    x: inputBeam.x - inputBeam.w * 0.10,
    y: inputBeam.y + inputBeam.h * 0.50
  };
  const beamEnd = { x: cx - radius * 0.30, y: cy };
  const beamWidth = Math.max(40, inputBeam.h * 0.82);
  const greenY = cy;
  const guideStartX = beamStart.x + inputBeam.w * 0.02;
  const guideFocus = { x: cx - radius * 0.44, y: greenY };
  const guideStartTop = { x: guideStartX, y: greenY - beamWidth * 0.34 };
  const guideStartBottom = { x: guideStartX, y: greenY + beamWidth * 0.34 };
  return [
    {
      type: "freeform",
      box: {
        x: beamStart.x,
        y: beamEnd.y - beamWidth / 2,
        w: Math.max(60, beamEnd.x - beamStart.x + beamWidth * 0.18),
        h: beamWidth
      },
      points: [
        { x: 0, y: 0 },
        { x: 0.86, y: 0.38 },
        { x: 1, y: 0.5 },
        { x: 0.86, y: 0.62 },
        { x: 0, y: 1 }
      ],
      detector: "demand-understanding-flow-native-beam",
      style: {
        fill: "#2A78D2",
        stroke: "#2A78D2",
        strokeWidthPt: 0,
        opacity: 0.96
      }
    },
    ...demandUnderstandingBeamGuideShapes({
      top: guideStartTop,
      middle: { x: guideStartX, y: greenY },
      bottom: guideStartBottom,
      focus: guideFocus,
      trunkEnd: { x: trunkStart.x + 4, y: greenY }
    }),
    {
      type: "ellipse",
      box: outer,
      detector: "demand-understanding-flow-native-lens",
      style: {
        fill: "#2A78D2",
        stroke: "#1D5FA9",
        strokeWidthPt: 2,
        opacity: 0.95,
        shadow: { color: "#1D5FA9", alpha: 0.18, blurPt: 4, distancePt: 1, angle: 45 }
      }
    },
    ...demandUnderstandingLensFacetShapes({ cx, cy, radius }),
    {
      type: "ellipse",
      box: inner,
      detector: "demand-understanding-flow-native-lens",
      style: {
        fill: "#F8FDFF",
        stroke: "#1B5EA7",
        strokeWidthPt: 4,
        opacity: 0.92
      }
    },
    {
      type: "ellipse",
      box: {
        x: inner.x + inner.w * 0.25,
        y: inner.y + inner.h * 0.18,
        w: inner.w * 0.28,
        h: inner.h * 0.18
      },
      detector: "demand-understanding-flow-native-lens-highlight",
      style: {
        fill: "#FFFFFF",
        stroke: "#FFFFFF",
        strokeWidthPt: 0,
        opacity: 0.75
      }
    },
    {
      type: "line",
      box: lineBox({ x: cx + radius * 0.63, y: cy + radius * 0.62 }, { x: cx + radius * 1.60, y: cy + radius * 1.55 }),
      detector: "demand-understanding-flow-native-handle",
      style: {
        stroke: "#2A78D2",
        strokeWidthPt: 16,
        connectorType: "straight"
      }
    },
    {
      type: "rect",
      box: {
        x: cx + radius * 1.35,
        y: cy + radius * 1.33,
        w: radius * 0.32,
        h: radius * 0.32
      },
      rotation: 45,
      detector: "demand-understanding-flow-native-handle",
      style: {
        fill: "#2367B6",
        stroke: "#2367B6",
        strokeWidthPt: 0,
        rotation: 45
      }
    }
  ];
}

function demandUnderstandingBeamGuideShapes({ top, middle, bottom, focus, trunkEnd } = {}) {
  const guideStyle = {
    stroke: "#2FBE72",
    strokeWidthPt: 2.6,
    opacity: 0.86,
    connectorType: "straight"
  };
  const centerStyle = {
    stroke: "#2FBE72",
    strokeWidthPt: 4.2,
    opacity: 0.92,
    connectorType: "straight"
  };
  return [
    {
      type: "line",
      box: lineBox(top, focus),
      detector: "demand-understanding-flow-native-beam-guide",
      guideRole: "upper-converging",
      style: guideStyle
    },
    {
      type: "line",
      box: lineBox(bottom, focus),
      detector: "demand-understanding-flow-native-beam-guide",
      guideRole: "lower-converging",
      style: guideStyle
    },
    {
      type: "line",
      box: lineBox(middle, trunkEnd),
      detector: "demand-understanding-flow-native-beam-guide",
      guideRole: "center-throughput",
      style: centerStyle
    }
  ];
}

function demandUnderstandingLensFacetShapes({ cx = 0, cy = 0, radius = 0 } = {}) {
  const segments = [
    { a1: 225, a2: 252, color: "#58A7EE", width: 6.2, alpha: 0.55 },
    { a1: 258, a2: 287, color: "#1F5DA8", width: 7.4, alpha: 0.62 },
    { a1: 292, a2: 324, color: "#77BDF4", width: 6.0, alpha: 0.48 },
    { a1: 332, a2: 18, color: "#1C63B1", width: 8.2, alpha: 0.56 },
    { a1: 24, a2: 56, color: "#5AABF0", width: 6.4, alpha: 0.46 },
    { a1: 62, a2: 94, color: "#174F9B", width: 7.0, alpha: 0.52 },
    { a1: 102, a2: 132, color: "#73B9F3", width: 5.4, alpha: 0.42 },
    { a1: 142, a2: 174, color: "#1F66B7", width: 7.2, alpha: 0.52 }
  ];
  const ringRadius = radius * 0.93;
  return segments.map((segment, index) => {
    const start = pointOnCircle(cx, cy, ringRadius, segment.a1);
    const end = pointOnCircle(cx, cy, ringRadius, segment.a2);
    return {
      type: "line",
      box: lineBox(start, end),
      detector: "demand-understanding-flow-native-lens-facet",
      facetIndex: index,
      style: {
        stroke: segment.color,
        strokeWidthPt: segment.width,
        opacity: segment.alpha,
        connectorType: "straight"
      }
    };
  });
}

function pointOnCircle(cx = 0, cy = 0, radius = 0, angleDeg = 0) {
  const radians = (Number(angleDeg || 0) - 90) * Math.PI / 180;
  return {
    x: cx + Math.cos(radians) * radius,
    y: cy + Math.sin(radians) * radius
  };
}

function demandUnderstandingCardTextBoxes(cards = []) {
  return (cards || []).map((card, index) => ({
    text: card.label,
    box: {
      x: round(card.box.x + card.box.w * 0.14),
      y: round(card.box.y + card.box.h * 0.21),
      w: round(card.box.w * 0.74),
      h: round(card.box.h * 0.58)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: index === cards.length - 1 ? 17.5 : 18.5,
      color: "#EAF5F8",
      opacity: 1,
      weight: "regular",
      align: "center",
      valign: "middle"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      ...demandUnderstandingComponentSource(card.layerSourceId || null),
      detector: "demand-understanding-flow-native-label",
      layerSourceId: card.layerSourceId || null,
      label: card.label,
      ...demandUnderstandingNativeComponentMetadata(card.layerSourceId, `output-card-${card.cardIndex ?? index}`, "label")
    }
  }));
}

function demandUnderstandingMaterialTextBoxes(materialTiles = []) {
  return (materialTiles || []).map((tile, index) => ({
    text: tile.label,
    box: {
      x: round(tile.box.x + tile.box.w * 0.12),
      y: round(tile.box.y + tile.box.h * 0.35),
      w: round(tile.box.w * 0.76),
      h: round(tile.box.h * 0.38)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: 18.5,
      color: "#111111",
      opacity: 1,
      weight: "regular",
      align: "center",
      valign: "middle"
    },
    source: {
      editable: true,
      nativeRebuild: true,
      ...demandUnderstandingComponentSource(tile.layerSourceId || null),
      detector: "demand-understanding-flow-native-material-label",
      layerSourceId: tile.layerSourceId || null,
      label: tile.label,
      ...demandUnderstandingNativeComponentMetadata(tile.layerSourceId, `input-material-${tile.materialIndex ?? index}`, "label")
    }
  }));
}

function demandUnderstandingWarningTextBoxes(cards = []) {
  return (cards || [])
    .filter((card) => card?.warningBadge)
    .map((card) => ({
      text: "!",
      box: {
        x: round(card.warningBadge.x),
        y: round(card.warningBadge.y + card.warningBadge.h * 0.06),
        w: round(card.warningBadge.w),
        h: round(card.warningBadge.h * 0.86)
      },
      font: {
        family: "Microsoft YaHei",
        sizePt: Math.max(12, Math.min(18, Number(card.warningBadge.h || 20) * 0.72)),
        color: "#FFFFFF",
        opacity: 1,
        weight: "bold",
        align: "center",
        valign: "middle"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        ...demandUnderstandingComponentSource(card.layerSourceId || null),
        detector: "demand-understanding-flow-native-warning-label",
        layerSourceId: card.layerSourceId || null,
        label: card.label,
        ...demandUnderstandingNativeComponentMetadata(card.layerSourceId, `output-card-${card.cardIndex ?? 0}`, "warning-label")
      }
    }));
}

function demandUnderstandingWarningBadgeBox(cardBox = {}, label = "") {
  if (!/异常|盲区|风险|告警|警告/.test(String(label || ""))) return null;
  const size = clamp(Math.min(Number(cardBox.w || 0), Number(cardBox.h || 0)) * 0.46, 18, 28);
  return {
    x: round(Number(cardBox.x || 0) + Number(cardBox.w || 0) - size * 0.55),
    y: round(Number(cardBox.y || 0) - size * 0.35),
    w: round(size),
    h: round(size)
  };
}

function materialResidualName(label) {
  if (label === "会议纪要") return "meeting-note";
  if (label === "旧版说明") return "legacy-doc";
  if (label === "业务截图") return "business-screenshot";
  if (label === "飞书对话") return "chat-screenshot";
  return String(label || "material").replace(/[^\w-]+/g, "-");
}

module.exports = { createDemandUnderstandingFlowShapes, shouldObjectifyDemandUnderstandingFlow, shouldRespectGridNativeAtomStrategy, inferDemandUnderstandingFlow, inferDemandUnderstandingFlowFromLayout, demandUnderstandingWarningBadgeBox, materialResidualName, demandUnderstandingLensShapes, demandUnderstandingBeamGuideShapes, demandUnderstandingLensFacetShapes, pointOnCircle, demandUnderstandingInputShapes, demandUnderstandingLensIllustrationBox, demandUnderstandingComponentSource, demandUnderstandingMaterialTextBoxes, demandUnderstandingNativeComponentMetadata, demandUnderstandingCardTextBoxes, demandUnderstandingWarningTextBoxes, materializeDemandUnderstandingIllustrationCrops };
