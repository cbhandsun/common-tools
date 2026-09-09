"use strict";

const path = require("node:path");
const { safeComponentToken } = require("@common-tools/slideclone-core/diagram-residual-crops");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { normalizeCjkText } = require("@common-tools/slideclone-core/prd-generation-shapes");
const { lineBox, safeIdentifier } = require("@common-tools/slideclone-core/workflow-shape-primitives");
const { createValueQuadrantGemShapes } = require("./native-rebuild-value-quadrant");

function createAssetOsFlowFactory(dependencies = {}) {
  const {
    boxCenterInside,
    constrainPtBox,
    ensureDir,
    expandPtBox,
    ptToPxBox,
    pxToPtBox,
    refineGraphicCrop,
    round,
    writePng
  } = dependencies;
  const required = {
    boxCenterInside,
    constrainPtBox,
    ensureDir,
    expandPtBox,
    ptToPxBox,
    pxToPtBox,
    refineGraphicCrop,
    round,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`asset OS flow dependency ${name} must be a function`);
  }

  function createAssetOsFlowObjects(images = [], textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    const shapes = [];
    const iconImages = [];
    const nativeTextBoxes = [];
    for (const image of images || []) {
      if (!shouldObjectifyAssetOsFlow(image, textBoxes, slideSize)) continue;
      const flow = inferAssetOsFlowLayout(image, textBoxes, slideSize, options);
      if (!flow) continue;
      image.source = {
        ...(image.source || {}),
        assetOsFlowObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        objectifiedAssetOsFlowShapes: flow.shapes.length,
        objectifiedAssetOsFlowIconCrops: Array.isArray(flow.images) ? flow.images.length : 0,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset OS flow crop"}; rebuilt asset flow structure as native editable components while preserving complex icons as local crops`
      };
      shapes.push(...flow.shapes);
      iconImages.push(...(flow.images || []));
      nativeTextBoxes.push(...(flow.textBoxes || []));
    }
    return { shapes, textBoxes: nativeTextBoxes, images: iconImages };
  }

  function shouldObjectifyAssetOsFlow(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    if (!box.w || !box.h || box.w < 360 || box.h < 240) return false;
    const layer = image.source?.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    const detector = String(image.source?.detector || "");
    if (String(layer.layerType || "") !== "diagram-zone") return false;
    if (understanding.archetype !== "flow-card-chain" && !/sparse-diagram/.test(detector)) return false;
    const labels = normalizedTextsInsideBox(textBoxes, expandPtBox(box, slideSize, 18, 18), boxCenterInside);
    return ["标准化PRD", "交互原型", "操作手册", "业务需求", "历史文档", "飞书截图"]
      .every((label) => labels.has(normalizeCjkText(label)));
  }

  function inferAssetOsFlowLayout(image = {}, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    const b = image.box || {};
    const inside = (textBoxes || []).filter((item) =>
      item?.box && boxCenterInside(item.box, expandPtBox(b, slideSize, 20, 20)));
    const topLabels = ["标准化PRD", "交互原型", "操作手册"]
      .map((label) => ({ label, textBox: findTextBoxByNormalizedText(inside, label) }))
      .filter((item) => item.textBox?.box)
      .sort((a, bItem) => a.textBox.box.x - bItem.textBox.box.x);
    const bottomLabels = ["业务需求", "历史文档", "飞书截图"]
      .map((label) => ({ label, textBox: findTextBoxByNormalizedText(inside, label) }))
      .filter((item) => item.textBox?.box)
      .sort((a, bItem) => a.textBox.box.x - bItem.textBox.box.x);
    if (topLabels.length < 3 || bottomLabels.length < 3) return null;

    const prefix = image.id || "asset-os-flow";
    const iconImages = [];
    const nativeTextBoxes = [];
    const shield = {
      x: round(b.x + b.w * 0.405),
      y: round(b.y + b.h * 0.322),
      w: round(b.w * 0.193),
      h: round(b.h * 0.305)
    };
    const shapes = [];
    topLabels.forEach((item, index) => {
      const labelBox = item.textBox.box;
      const gemBox = constrainPtBox({
        x: round(labelBox.x - 50),
        y: round(labelBox.y - 21),
        w: 56,
        h: 54
      }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });
      const gemCrop = createAssetOsFlowIconCrop({
        image,
        box: gemBox,
        options,
        slideSize,
        id: `${prefix}-input-gem-crop-${index}`,
        role: "input-gem",
        label: item.label,
        cropName: `input-gem-${index + 1}`,
        padPt: 0.5
      });
      if (gemCrop) {
        iconImages.push(gemCrop);
      } else {
        shapes.push(...createValueQuadrantGemShapes({ id: prefix }, { name: `asset-${index + 1}`, label: item.label, box: gemBox })
          .map((shape) => ({
            ...shape,
            source: { ...(shape.source || {}), detector: "asset-os-flow-native-gem", role: "input-gem", layerSourceId: image.id || null }
          })));
      }
      shapes.push(assetOsShape(`${prefix}-input-label-${index}`, "roundRect", {
        x: round(labelBox.x - 6),
        y: round(labelBox.y - 2),
        w: round(labelBox.w + 16),
        h: round(labelBox.h + 8)
      }, {
        fill: "#21AA68",
        stroke: "#21AA68",
        strokeWidthPt: 0,
        radiusRatio: 0.18
      }, image, { role: "input-label-backplate", label: item.label }));
      nativeTextBoxes.push(assetOsFlowTextBox(`${prefix}-input-label-text-${index}`, item.label, {
        x: round(labelBox.x - 1),
        y: round(labelBox.y - 1),
        w: round(labelBox.w + 4),
        h: round(labelBox.h + 3)
      }, { sizePt: 12.2, color: "#FFFFFF", weight: "regular", align: "center" }, image, { role: "input-label", label: item.label }));
      const gemBottom = { x: gemBox.x + gemBox.w * 0.5, y: gemBox.y + gemBox.h * 0.95 };
      const trunkY = b.y + b.h * 0.235;
      const shieldTargets = [shield.x + shield.w * 0.23, shield.x + shield.w * 0.50, shield.x + shield.w * 0.77];
      const turnX = index === 1 ? gemBottom.x : shieldTargets[index];
      shapes.push(assetOsShape(`${prefix}-gem-route-vertical-${index}`, "line", lineBox(gemBottom, { x: gemBottom.x, y: trunkY }), {
        stroke: "#20AA62",
        strokeWidthPt: 9,
        connectorType: "straight",
        lineCap: "round"
      }, image, { role: "input-route", label: item.label }));
      if (Math.abs(turnX - gemBottom.x) > 5) {
        shapes.push(assetOsShape(`${prefix}-gem-route-horizontal-${index}`, "line", lineBox({ x: gemBottom.x, y: trunkY }, { x: turnX, y: trunkY }), {
          stroke: "#20AA62",
          strokeWidthPt: 9,
          connectorType: "straight",
          lineCap: "round"
        }, image, { role: "input-route", label: item.label }));
      }
      shapes.push(assetOsShape(`${prefix}-gem-route-down-${index}`, "line", lineBox({ x: turnX, y: trunkY }, { x: shieldTargets[index], y: shield.y + shield.h * 0.08 }), {
        stroke: "#20AA62",
        strokeWidthPt: 9,
        connectorType: "straight",
        lineCap: "round"
      }, image, { role: "input-route", label: item.label }));
    });

    const shieldCrop = createAssetOsFlowIconCrop({
      image,
      box: shield,
      options,
      slideSize,
      id: `${prefix}-central-shield-crop`,
      role: "central-shield",
      label: "中枢盾牌",
      cropName: "central-shield",
      padPt: 1
    });
    if (shieldCrop) {
      iconImages.push(shieldCrop);
    } else {
      shapes.push(...assetOsShieldShapes(prefix, shield, image));
    }
    bottomLabels.forEach((item, index) => {
      const labelBox = item.textBox.box;
      const card = {
        x: round(labelBox.x - b.w * 0.08),
        y: round(labelBox.y - b.h * 0.21),
        w: round(b.w * 0.30),
        h: round(b.h * 0.30)
      };
      shapes.push(assetOsShape(`${prefix}-output-card-${index}`, "roundRect", card, {
        fill: "#F1F1F1",
        stroke: "#E4E4E4",
        strokeWidthPt: 0.8,
        radiusRatio: 0.06,
        shadow: { color: "#000000", alpha: 0.07, blurPt: 6, distancePt: 1.2, angle: 45 }
      }, image, { role: "output-card", label: item.label }));
      const outputIconBox = {
        x: round(card.x + card.w * 0.27),
        y: round(card.y + card.h * 0.12),
        w: round(card.w * 0.46),
        h: round(card.h * 0.48)
      };
      const outputIconCrop = createAssetOsFlowIconCrop({
        image,
        box: outputIconBox,
        options,
        slideSize,
        id: `${prefix}-output-icon-crop-${index}`,
        role: "output-icon",
        label: item.label,
        cropName: `output-icon-${index + 1}`,
        padPt: 0.5
      });
      if (outputIconCrop) iconImages.push(outputIconCrop);
      else shapes.push(...assetOsOutputIconShapes(prefix, card, image, item.label, index));
      nativeTextBoxes.push(assetOsFlowTextBox(`${prefix}-output-label-text-${index}`, item.label, {
        x: round(card.x + card.w * 0.12),
        y: round(card.y + card.h * 0.72),
        w: round(card.w * 0.76),
        h: round(card.h * 0.23)
      }, { sizePt: 14.5, color: "#111111", weight: "regular", align: "center" }, image, { role: "output-label", label: item.label }));
      shapes.push(assetOsShape(`${prefix}-shield-to-output-${index}`, "line", lineBox(
        { x: shield.x + shield.w * 0.5, y: shield.y + shield.h },
        { x: card.x + card.w * 0.5, y: card.y }
      ), {
        stroke: "#D7DBE0",
        strokeWidthPt: 1.4,
        connectorType: "straight",
        dash: "dash"
      }, image, { role: "output-guide", label: item.label }));
    });

    return { shapes, images: iconImages, textBoxes: nativeTextBoxes };
  }

  function createAssetOsFlowIconCrop({ image, box, options = {}, slideSize = DEFAULT_SLIDE, id, role, label, cropName, padPt = 2 } = {}) {
    if (!options.sourceImage || !options.assetDir || !box || Number(box.w || 0) <= 0 || Number(box.h || 0) <= 0) return null;
    ensureDir(options.assetDir);
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image?.id || "asset-os-flow"}-${cropName || role || "icon"}`, "asset-os-flow-icon");
    const pxBox = ptToPxBox(expandPtBox(box, slideSize, padPt, padPt), options.sourceImage, slideSize, 0);
    const refinement = refineGraphicCrop(options.sourceImage, pxBox);
    const file = path.join(options.assetDir, `${base}.png`);
    writePng(file, refinement.image);
    const refinedPxBox = { x: pxBox.x + refinement.box.x, y: pxBox.y + refinement.box.y, w: refinement.box.w, h: refinement.box.h };
    return {
      id,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(refinedPxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "asset-os-flow-icon-crop",
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "asset-os-flow-icon",
        recommendedAction: "keep-local-crop-for-complex-icon",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        iconCropRefined: refinement.refined,
        removedNeighborPixels: refinement.removedNeighborPixels,
        retainedDetailComponents: refinement.retainedDetailComponents,
        layerSourceId: image?.id || null,
        ...assetOsFlowNativeComponentMetadata(image, role, label, "icon-crop"),
        role,
        label,
        nonEditableReason: "complex icon retained as a local crop; flow rebuilt natively"
      }
    };
  }

  function assetOsFlowTextBox(id, text, box, font, image, extra = {}) {
    const component = assetOsFlowNativeComponentMetadata(image, extra.role, extra.label, "label");
    return {
      id,
      text,
      box,
      font: {
        family: "Microsoft YaHei",
        opacity: 1,
        valign: "middle",
        ...font
      },
      style: { wrap: false, fit: "shrink", nativeComponentGroupId: component.nativeComponentGroupId },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "asset-os-flow-native-text",
        layerSourceId: image?.id || null,
        ...component,
        ...extra
      }
    };
  }

  function assetOsShape(id, type, box, style, image, extra = {}) {
    const component = assetOsFlowNativeComponentMetadata(image, extra.role, extra.label, extra.part || type);
    return {
      id,
      type,
      box,
      style,
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "asset-os-flow-native-component",
        layerSourceId: image?.id || null,
        layerType: image?.source?.layer?.layerType || "diagram-zone",
        ...component,
        ...(extra.role === "input-route" ? { preserveMeasuredSegments: true } : {}),
        ...extra
      }
    };
  }

  function assetOsShieldShapes(prefix, box, image) {
    const outer = assetOsShape(`${prefix}-shield-outer`, "freeform", box, {
      fill: "#1F7DD4",
      stroke: "#1266B8",
      strokeWidthPt: 1.2,
      shadow: { color: "#1F7DD4", alpha: 0.18, blurPt: 5, distancePt: 0, angle: 0 }
    }, image, { role: "central-shield" });
    outer.points = [
      { x: 0.5, y: 0.00 },
      { x: 0.94, y: 0.14 },
      { x: 0.86, y: 0.58 },
      { x: 0.70, y: 0.82 },
      { x: 0.50, y: 1.00 },
      { x: 0.30, y: 0.82 },
      { x: 0.14, y: 0.58 },
      { x: 0.06, y: 0.14 }
    ];
    const inner = assetOsShape(`${prefix}-shield-inner`, "freeform", {
      x: round(box.x + box.w * 0.27),
      y: round(box.y + box.h * 0.21),
      w: round(box.w * 0.46),
      h: round(box.h * 0.58)
    }, {
      fill: "#FFFFFF",
      stroke: "#FFFFFF",
      strokeWidthPt: 0
    }, image, { role: "central-shield-inner" });
    inner.points = [
      { x: 0.5, y: 0.00 },
      { x: 0.92, y: 0.16 },
      { x: 0.82, y: 0.62 },
      { x: 0.50, y: 1.00 },
      { x: 0.18, y: 0.62 },
      { x: 0.08, y: 0.16 }
    ];
    return [outer, inner];
  }

  function assetOsOutputIconShapes(prefix, card, image, label, index) {
    const cx = card.x + card.w * 0.5;
    const icon = { x: round(cx - card.w * 0.17), y: round(card.y + card.h * 0.20), w: round(card.w * 0.34), h: round(card.h * 0.30) };
    if (/历史/.test(label)) {
      const folder = assetOsShape(`${prefix}-folder-tab-${index}`, "freeform", icon, {
        fill: "#9EA7B1",
        stroke: "#9EA7B1",
        strokeWidthPt: 0
      }, image, { role: "output-icon", label, part: "folder" });
      folder.points = [
        { x: 0, y: 0.22 },
        { x: 0.30, y: 0.22 },
        { x: 0.38, y: 0.08 },
        { x: 0.66, y: 0.08 },
        { x: 0.76, y: 0.22 },
        { x: 1, y: 0.22 },
        { x: 1, y: 1 },
        { x: 0, y: 1 }
      ];
      return [folder];
    }
    if (/截图/.test(label)) {
      const mountain = assetOsShape(`${prefix}-image-mountain-${index}`, "freeform", {
        x: round(icon.x + icon.w * 0.30),
        y: round(icon.y + icon.h * 0.42),
        w: round(icon.w * 0.60),
        h: round(icon.h * 0.34)
      }, { fill: "#6F7883", stroke: "#6F7883", strokeWidthPt: 0 }, image, { role: "output-icon", label, part: "image-mountain" });
      mountain.points = [{ x: 0, y: 1 }, { x: 0.34, y: 0.28 }, { x: 0.55, y: 0.72 }, { x: 0.73, y: 0.40 }, { x: 1, y: 1 }];
      return [
        assetOsShape(`${prefix}-chat-bubble-${index}`, "ellipse", {
          x: round(icon.x - icon.w * 0.16),
          y: round(icon.y - icon.h * 0.10),
          w: round(icon.w * 0.58),
          h: round(icon.h * 0.58)
        }, { fill: "#3D83D6", stroke: "#3D83D6", strokeWidthPt: 0 }, image, { role: "output-icon", label, part: "chat" }),
        assetOsShape(`${prefix}-image-frame-${index}`, "rect", {
          x: round(icon.x + icon.w * 0.20),
          y: round(icon.y + icon.h * 0.25),
          w: round(icon.w * 0.82),
          h: round(icon.h * 0.62)
        }, { fill: "#ADB6C1", stroke: "#ADB6C1", strokeWidthPt: 0 }, image, { role: "output-icon", label, part: "image" }),
        mountain
      ];
    }
    return [
      assetOsShape(`${prefix}-doc-page-${index}`, "document", icon, {
        fill: "#B6BEC8",
        stroke: "#B6BEC8",
        strokeWidthPt: 0
      }, image, { role: "output-icon", label, part: "document" }),
      assetOsShape(`${prefix}-doc-gear-${index}`, "ellipse", {
        x: round(icon.x + icon.w * 0.58),
        y: round(icon.y + icon.h * 0.60),
        w: round(icon.w * 0.34),
        h: round(icon.w * 0.34)
      }, {
        fill: "#8F98A3",
        stroke: "#8F98A3",
        strokeWidthPt: 0
      }, image, { role: "output-icon", label, part: "gear-dot" })
    ];
  }

  return {
    createAssetOsFlowObjects,
    inferAssetOsFlowLayout,
    shouldObjectifyAssetOsFlow
  };
}

function assetOsFlowNativeComponentMetadata(image, role, label, part) {
  const normalizedRole = String(role || "");
  let componentRole = null;
  let archetype = null;
  if (/^input-/.test(normalizedRole)) {
    componentRole = `input-${assetOsFlowSemanticKey(label)}`;
    archetype = "asset-os-input-stage";
  } else if (/^central-shield/.test(normalizedRole)) {
    componentRole = "core";
    archetype = "asset-os-core";
  } else if (/^output-/.test(normalizedRole)) {
    componentRole = `output-${assetOsFlowSemanticKey(label)}`;
    archetype = "asset-os-output-stage";
  }
  if (!componentRole) return {};
  const base = safeComponentToken(image?.id || "asset-os-flow");
  return {
    nativeComponentGroupId: `${base}-asset-flow-${componentRole}`,
    nativeComponentParentId: `${base}-asset-flow`,
    nativeComponentArchetype: archetype,
    nativeComponentInstance: true,
    nativeComponentMinimumUnit: "semantic-component",
    nativeComponentRole: componentRole,
    nativeComponentPart: String(part || normalizedRole || "detail")
  };
}

function assetOsFlowSemanticKey(label) {
  const normalized = normalizeCjkText(label);
  const known = [
    [/标准化PRD/i, "standard-prd"],
    [/交互原型/, "interactive-prototype"],
    [/操作手册/, "operation-manual"],
    [/业务需求/, "business-requirement"],
    [/历史文档/, "historical-document"],
    [/飞书截图/, "feishu-screenshot"]
  ].find(([pattern]) => pattern.test(normalized));
  return known ? known[1] : safeComponentToken(label || "unknown");
}

function normalizedTextsInsideBox(textBoxes = [], box = {}, boxCenterInside) {
  if (typeof boxCenterInside !== "function") throw new TypeError("boxCenterInside must be a function");
  return new Set((textBoxes || [])
    .filter((item) => item?.box && boxCenterInside(item.box, box))
    .map((item) => normalizeCjkText(item.text))
    .filter(Boolean));
}

function findTextBoxByNormalizedText(textBoxes = [], text = "") {
  const target = normalizeCjkText(text);
  return (textBoxes || []).find((item) => normalizeCjkText(item.text) === target) || null;
}

module.exports = {
  createAssetOsFlowFactory,
  _private: {
    assetOsFlowNativeComponentMetadata,
    assetOsFlowSemanticKey,
    findTextBoxByNormalizedText
  }
};
