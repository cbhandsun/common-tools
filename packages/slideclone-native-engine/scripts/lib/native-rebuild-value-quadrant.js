"use strict";

const path = require("path");
const { normalizeTextKey } = require("@common-tools/slideclone-core/diagram-label-matching");
const { safeComponentToken } = require("@common-tools/slideclone-core/diagram-residual-crops");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const {
  ensureDir
} = require("@common-tools/slideclone-core/residual-primitive-erasure");
const {
  boxCenterInside,
  boxesNearPt,
  clamp,
  constrainPtBox,
  expandPtBox,
  ptToPxBox,
  pxToPtBox,
  round
} = require("@common-tools/slideclone-core/raster-native-detection");
const { lineBox, safeIdentifier } = require("@common-tools/slideclone-core/workflow-shape-primitives");
const { cropPng, writePng } = require("./png");

function createValueQuadrantShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
  if (!sourceImage) return [];
  const shapes = [];
  for (const image of images || []) {
    if (!shouldObjectifyValueQuadrant(image, textBoxes)) continue;
    const quadrant = inferValueQuadrant(image, textBoxes, slideSize);
    if (!quadrant) continue;
    image.source = {
      ...(image.source || {}),
      valueQuadrantObjectified: true,
      valueQuadrantNativeTextBoxes: quadrant.textBoxes,
      valueQuadrantResidualBoxes: quadrant.residualCrops,
      objectifiedValueQuadrantDividers: quadrant.dividers.length,
      objectifiedValueQuadrantGems: quadrant.gems.length,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "value quadrant"}; rebuilt quadrant dividers, labels, and gem icons natively`
    };
    for (const gem of quadrant.gems) {
      shapes.push(...createValueQuadrantGemShapes(image, gem));
    }
    for (let index = 0; index < quadrant.dividers.length; index += 1) {
      shapes.push({
        id: `${image.id || "value-quadrant"}-divider-${index}`,
        type: "line",
        box: quadrant.dividers[index],
        style: {
          stroke: "#145B73",
          strokeWidthPt: 1.4,
          connectorType: "straight"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "value-quadrant-native-divider",
          layerSourceId: image.id || null
        }
      });
    }
  }
  return shapes;
}

function createValueQuadrantGemsObjects(page, rawTextBoxes = [], visibleTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const image = (page?.images || []).find((item) => shouldObjectifyValueQuadrantGemsPageImage(item, rawTextBoxes, slideSize));
  if (!image) return { shapes: [], textBoxes: [], images: [] };
  const quadrant = inferValueQuadrant(image, rawTextBoxes, slideSize);
  if (!quadrant) return { shapes: [], textBoxes: [], images: [] };
  const gemCrops = options.forceValueQuadrantGemNative === true
    ? []
    : materializeValueQuadrantGemCrops(image, quadrant.gems, slideSize, options);
  const preserveGemCrops = gemCrops.length === quadrant.gems.length && gemCrops.length > 0;
  const quadrantCenter = valueQuadrantComponentCenter(quadrant);
  for (const crop of gemCrops) {
    const role = valueQuadrantRoleForBox(crop.box, quadrantCenter);
    crop.source = { ...(crop.source || {}), ...valueQuadrantNativeComponentMetadata(image.id, role, "gem-icon") };
  }
  image.source = {
    ...(image.source || {}),
    valueQuadrantGemsObjectified: true,
    valueQuadrantObjectified: true,
    valueQuadrantNativeTextBoxes: quadrant.textBoxes,
    valueQuadrantResidualBoxes: [],
    objectifiedValueQuadrantDividers: quadrant.dividers.length,
    objectifiedValueQuadrantGems: preserveGemCrops ? 0 : quadrant.gems.length,
    preservedValueQuadrantGemCrops: preserveGemCrops ? gemCrops.length : 0,
    valueQuadrantGemCropsPreserved: preserveGemCrops,
    dropErasedResidualAfterNativeRebuild: true,
    nonEditableReason: preserveGemCrops
      ? `${image.source?.nonEditableReason || image.source?.reason || "value quadrant gems"}; rebuilt quadrant dividers and labels natively while preserving gem icons as local fidelity crops`
      : `${image.source?.nonEditableReason || image.source?.reason || "value quadrant gems"}; rebuilt quadrant dividers, labels, and gem icons natively`
  };
  const shapes = [];
  if (!preserveGemCrops) {
    for (const gem of quadrant.gems) {
      shapes.push(...createValueQuadrantGemShapes(image, gem, valueQuadrantRoleForBox(gem.box, quadrantCenter)));
    }
  }
  for (let index = 0; index < quadrant.dividers.length; index += 1) {
    shapes.push({
      id: `${image.id || "value-quadrant-gems"}-divider-${index}`,
      type: "line",
      box: quadrant.dividers[index],
      style: {
        stroke: "#145B73",
        strokeWidthPt: 1.4,
        connectorType: "straight"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "value-quadrant-gems-native-divider",
        layerSourceId: image.id || null,
        ...valueQuadrantNativeComponentMetadata(image.id, "quadrant-grid", "divider")
      }
    });
  }
  const visibleKeys = new Set((visibleTextBoxes || []).map((item) => normalizeTextKey(item?.text)));
  const textBoxes = quadrant.textBoxes
    .filter((item) => !visibleKeys.has(normalizeTextKey(item.text)))
    .map((item, index) => {
      const role = valueQuadrantRoleForBox(item.box, quadrantCenter);
      const metadata = valueQuadrantNativeComponentMetadata(image.id, role, "label");
      return {
        ...item,
        id: `value-quadrant-gems-text-${index}`,
        style: { ...(item.style || {}), nativeComponentGroupId: metadata.nativeComponentGroupId },
        source: {
          ...(item.source || {}),
          detector: "value-quadrant-gems-native-text",
          ...metadata
        }
      };
    });
  return { shapes, textBoxes, images: gemCrops };
}

function valueQuadrantComponentCenter(quadrant = {}) {
  const vertical = (quadrant.dividers || []).find((box) => Math.abs(Number(box.w || 0)) < Math.abs(Number(box.h || 0)));
  const horizontal = (quadrant.dividers || []).find((box) => Math.abs(Number(box.w || 0)) >= Math.abs(Number(box.h || 0)));
  return {
    x: Number(vertical?.x || 0) + Number(vertical?.w || 0) / 2,
    y: Number(horizontal?.y || 0) + Number(horizontal?.h || 0) / 2
  };
}

function valueQuadrantRoleForBox(box = {}, center = {}) {
  const x = Number(box.x || 0) + Number(box.w || 0) / 2;
  const y = Number(box.y || 0) + Number(box.h || 0) / 2;
  return `${y < Number(center.y || 0) ? "top" : "bottom"}-${x < Number(center.x || 0) ? "left" : "right"}`;
}

function valueQuadrantNativeComponentMetadata(layerSourceId, role, part) {
  const base = safeComponentToken(layerSourceId || "value-quadrant");
  const safeRole = safeComponentToken(role || "unknown");
  return {
    nativeComponentGroupId: `${base}-value-quadrant-${safeRole}`,
    nativeComponentParentId: `${base}-value-quadrant`,
    nativeComponentArchetype: "value-quadrant",
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: role || "unknown",
    nativeComponentPart: part || "detail"
  };
}

function materializeValueQuadrantGemCrops(image = {}, gems = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir || !Array.isArray(gems) || gems.length === 0) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(image.pageIndex || 0);
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || "value-quadrant"}-gem`, "value-quadrant-gem");
  const crops = [];
  gems.forEach((gem, index) => {
    const box = expandPtBox(gem.box, slideSize, 2.5, 2.5);
    if (Number(box.w || 0) < 4 || Number(box.h || 0) < 4) return;
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${String(index + 1).padStart(2, "0")}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    crops.push({
      id: `${image.id || "value-quadrant"}-gem-crop-${index}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: false,
        detector: "value-quadrant-gem-crop",
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "gem-icon",
        recommendedAction: "preserve-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        layerSourceId: image.id || null,
        valueQuadrantGemCropIndex: index,
        nonEditableReason: "decorative gem icon preserved as a local crop; quadrant dividers and labels remain native editable"
      }
    });
  });
  return crops;
}

function shouldObjectifyValueQuadrantGemsPageImage(image, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyValueQuadrant(image, rawTextBoxes)) return false;
  const text = (rawTextBoxes || []).map((item) => String(item?.text || "")).join(" ").replace(/\s+/g, "");
  if (!/核心价值|组织复利|个人效能/.test(text)) return false;
  const box = image?.box || {};
  const areaRatio = Number(box.w || 0) * Number(box.h || 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return areaRatio >= 0.48 && areaRatio <= 0.72;
}

function shouldObjectifyValueQuadrant(image, textBoxes = []) {
  const box = image?.box || {};
  if (image?.source?.detector !== "cycle-illustration-underlay-crop") return false;
  if (!box.w || !box.h || box.w < 760 || box.h < 300) return false;
  const labels = new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 10, 10)))
    .map((item) => String(item.text || "").replace(/\s+/g, "").trim()));
  return ["效率跃升", "质量前置", "知识沉淀"].every((label) => labels.has(label))
    && [...labels].some((label) => /标准统|标准统一/.test(label));
}

function inferValueQuadrant(image, textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const box = image.box;
  const inside = (textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 8, 8)));
  const titleBoxes = inside.filter((item) => {
    const label = String(item.text || "").replace(/\s+/g, "");
    return /效率跃升|质量前置|标准统|知识沉淀/.test(label);
  });
  if (titleBoxes.length < 4) return null;
  const textBoxesNative = inside.map((item) => valueQuadrantTextBox(item, titleBoxes));
  const dividers = [
    lineBox({ x: box.x + box.w * 0.50, y: box.y }, { x: box.x + box.w * 0.50, y: box.y + box.h }),
    lineBox({ x: box.x, y: box.y + box.h * 0.50 }, { x: box.x + box.w, y: box.y + box.h * 0.50 })
  ];
  const gems = titleBoxes.map((titleBox, index) => {
    const label = String(titleBox.text || "").replace(/\s+/g, "");
    const iconBox = {
      x: titleBox.box.x - clamp(box.w * 0.127, 104, 112),
      y: titleBox.box.y - 2,
      w: clamp(box.w * 0.102, 82, 90),
      h: clamp(box.h * 0.222, 78, 86)
    };
    return {
      name: `gem-${index + 1}`,
      label,
      box: constrainPtBox(iconBox, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt })
    };
  });
  return { dividers, textBoxes: textBoxesNative, gems, residualCrops: [] };
}

function createValueQuadrantGemShapes(image, gem, componentRole = "unknown") {
  const palette = valueQuadrantGemPalette(gem.label);
  const facets = [
    { name: "top-left", fill: palette[0], points: [{ x: 0.05, y: 0.36 }, { x: 0.24, y: 0.08 }, { x: 0.34, y: 0.36 }] },
    { name: "top-center", fill: palette[1], points: [{ x: 0.24, y: 0.08 }, { x: 0.52, y: 0.08 }, { x: 0.34, y: 0.36 }] },
    { name: "top-right", fill: palette[2], points: [{ x: 0.52, y: 0.08 }, { x: 0.78, y: 0.08 }, { x: 0.67, y: 0.36 }, { x: 0.34, y: 0.36 }] },
    { name: "right-cap", fill: palette[3], points: [{ x: 0.78, y: 0.08 }, { x: 0.96, y: 0.36 }, { x: 0.67, y: 0.36 }] },
    { name: "bottom-left", fill: palette[4], points: [{ x: 0.05, y: 0.36 }, { x: 0.34, y: 0.36 }, { x: 0.52, y: 0.98 }] },
    { name: "bottom-center", fill: palette[5], points: [{ x: 0.34, y: 0.36 }, { x: 0.67, y: 0.36 }, { x: 0.52, y: 0.98 }] },
    { name: "bottom-right", fill: palette[6], points: [{ x: 0.67, y: 0.36 }, { x: 0.96, y: 0.36 }, { x: 0.52, y: 0.98 }] }
  ];
  return facets.map((facet) => ({
    id: `${image.id || "value-quadrant"}-${gem.name}-${facet.name}`,
    type: "freeform",
    box: gem.box,
    points: facet.points,
    style: {
      fill: facet.fill,
      stroke: "#FFFFFF",
      strokeWidthPt: 1.6
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "value-quadrant-native-gem-facet",
      layerSourceId: image.id || null,
      gem: gem.name,
      facet: facet.name,
      ...valueQuadrantNativeComponentMetadata(image.id, componentRole, "gem-facet")
    }
  }));
}

function valueQuadrantGemPalette(label = "") {
  if (/质量前置/.test(label)) {
    return ["#F68C2A", "#F57C13", "#F07906", "#E96C02", "#F5821C", "#FF8C1E", "#F07105"];
  }
  if (/标准统|知识沉淀/.test(label)) {
    return ["#2C8FCA", "#1E7DB7", "#1B75AE", "#1767A2", "#1E80BC", "#2388C8", "#176FA8"];
  }
  return ["#43B97C", "#37A86E", "#2F965F", "#288852", "#35A96D", "#43BC7C", "#2E985E"];
}

function valueQuadrantTextBox(item, titleBoxes = []) {
  const label = String(item.text || "").replace(/\s+/g, "");
  const isTitle = titleBoxes.some((title) => title.text === item.text && boxesNearPt(title.box, item.box, 1));
  const sourceBox = item.box || {};
  const expandedWidth = isTitle
    ? Math.max(Number(sourceBox.w || 0) + 34, 138)
    : Math.max(Number(sourceBox.w || 0) + 58, 248);
  const expandedHeight = isTitle
    ? Math.max(Number(sourceBox.h || 0), 28)
    : Math.max(Number(sourceBox.h || 0), 21);
  return {
    text: item.text,
    box: {
      x: round(sourceBox.x),
      y: round(sourceBox.y),
      w: round(expandedWidth),
      h: round(expandedHeight)
    },
    font: {
      family: "Microsoft YaHei",
      sizePt: isTitle ? 23.5 : 17.2,
      color: "#111111",
      opacity: 1,
      weight: isTitle ? "bold" : "regular",
      align: "left",
      valign: "middle"
    },
    style: {
      marginLeftPt: 0,
      marginRightPt: 0,
      marginTopPt: 0,
      marginBottomPt: 0,
      wrap: false
    },
    source: {
      editable: true,
      nativeRebuild: true,
      detector: "value-quadrant-native-label",
      role: isTitle ? "quadrant-title" : "quadrant-body",
      normalizedLabel: label
    }
  };
}

module.exports = {
  createValueQuadrantGemShapes,
  createValueQuadrantGemsObjects,
  createValueQuadrantShapes
};
