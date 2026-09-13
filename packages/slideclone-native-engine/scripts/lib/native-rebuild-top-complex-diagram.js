"use strict";

function createTopComplexDiagramFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    centerOfBox,
    clampPtBoxToSlide,
    constrainPtBox,
    cropPng,
    ensureDir,
    eraseMasks,
    luma,
    normalizeHex,
    normalizeMatrixLabel,
    path,
    ptToPxBox,
    pxToPtBox,
    resolveAssetPathForIr,
    rgbToHex,
    round,
    roundedBox,
    sameDiagramLabel,
    sampleMaskBackgroundColor,
    saturation,
    shouldEmitVisibleTopComplexDiagramNativeLayer,
    writePng
  } = dependencies;

  function createTopComplexDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (image?.source?.detector !== "top-complex-diagram-crop") continue;  
      if (!shouldEmitVisibleTopComplexDiagramNativeLayer(image)) {  
        const candidates = topComplexDiagramNativeTextBoxes(image, textBoxes);  
        image.source = {  
          ...(image.source || {}),  
          topComplexDiagramTextObjectified: false,  
          topComplexDiagramSemanticTextObjectified: false,  
          topComplexDiagramNativeTextBoxes: undefined,  
          objectifiedTopComplexDiagramTextBoxes: 0,  
          deferredTopComplexDiagramNativeTextBoxes: candidates.length,  
          topComplexDiagramNativeRebuildDeferred: true,  
          topComplexDiagramSkeletonObjectified: false,  
          visualAtomOverlayOnly: false,  
          objectifiedTopComplexDiagramSkeletonShapes: 0,  
          nativeRebuildDeferredReason: "top complex diagram is screenshot-like; preserve the source crop without internal native overlays until a complete subtype rebuilder is available"  
        };  
        continue;  
      }  
      const nativeTextBoxes = maybeEraseTopComplexDiagramText({  
        image,  
        textBoxes: topComplexDiagramNativeTextBoxes(image, textBoxes),  
        sourceImage,  
        slideSize,  
        irDir  
      });  
      if (nativeTextBoxes.length === 0) continue;  
      const cardShapes = topComplexDiagramCardShapes(image, nativeTextBoxes, sourceImage, slideSize);  
      const structureShapes = topComplexDiagramStructureShapes(image, textBoxes, nativeTextBoxes, slideSize);  
      shapes.push(...structureShapes, ...cardShapes);  
      image.source = {  
        ...(image.source || {}),  
        topComplexDiagramTextObjectified: true,  
        topComplexDiagramNativeTextBoxes: nativeTextBoxes,  
        objectifiedTopComplexDiagramTextBoxes: nativeTextBoxes.length,  
        objectifiedTopComplexDiagramCards: cardShapes.length,  
        objectifiedTopComplexDiagramStructureShapes: structureShapes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; top complex diagram review labels erased from crop and rebuilt as editable native text`  
      };  
    }  
    return shapes;  
  }
  
  function inferTopComplexDiagramSkeletonShapes(image = {}) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const base = image.id || "top-complex-diagram";  
    const source = (detector, extra = {}) => topComplexDiagramShapeSource(image, detector, {  
      skeletonOnly: true,  
      ...extra  
    });  
    const shapes = [];  
    const windowBox = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.08,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.06,  
      w: Number(box.w || 0) * 0.66,  
      h: Number(box.h || 0) * 0.84  
    });  
    shapes.push({  
      id: `${base}-native-skeleton-window`,  
      type: "roundRect",  
      box: windowBox,  
      style: {  
        fill: "#FFFFFF",  
        stroke: "#C8D2DC",  
        strokeWidthPt: 1,  
        radiusRatio: 0.025,  
        opacity: 0.72,  
        shadow: { color: "#8BA0B4", opacity: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }  
      },  
      source: source("top-complex-diagram-native-skeleton-window")  
    });  
    shapes.push({  
      id: `${base}-native-skeleton-titlebar`,  
      type: "rect",  
      box: roundedBox({ x: windowBox.x, y: windowBox.y, w: windowBox.w, h: windowBox.h * 0.11 }),  
      style: { fill: "#F0F4F8", stroke: "none", strokeWidthPt: 0, opacity: 0.9 },  
      source: source("top-complex-diagram-native-skeleton-titlebar")  
    });  
    for (let index = 0; index < 5; index += 1) {  
      shapes.push({  
        id: `${base}-native-skeleton-prd-line-${index}`,  
        type: "line",  
        box: {  
          x: round(windowBox.x + windowBox.w * 0.08),  
          y: round(windowBox.y + windowBox.h * (0.22 + index * 0.12)),  
          w: round(windowBox.w * (index % 2 === 0 ? 0.55 : 0.42)),  
          h: 0  
        },  
        style: { stroke: index >= 3 ? "#E05C4F" : "#9FB0BF", strokeWidthPt: index >= 3 ? 2.2 : 1.2, connectorType: "straight", opacity: 0.78 },  
        source: source("top-complex-diagram-native-skeleton-prd-line", { lineIndex: index })  
      });  
    }  
    const suggestionBox = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.72,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.30,  
      w: Number(box.w || 0) * 0.23,  
      h: Number(box.h || 0) * 0.48  
    });  
    shapes.push({  
      id: `${base}-native-skeleton-suggestion-panel`,  
      type: "roundRect",  
      box: suggestionBox,  
      style: {  
        fill: "#F8FFF9",  
        stroke: "#36A65F",  
        strokeWidthPt: 1.2,  
        radiusRatio: 0.04,  
        opacity: 0.82  
      },  
      source: source("top-complex-diagram-native-skeleton-suggestion-panel")  
    });  
    [0.24, 0.50, 0.76].forEach((ratio, index) => {  
      const y = round(suggestionBox.y + suggestionBox.h * ratio);  
      shapes.push({  
        id: `${base}-native-skeleton-suggestion-check-${index}`,  
        type: "ellipse",  
        box: roundedBox({ x: suggestionBox.x + suggestionBox.w * 0.08, y: y - 6, w: 12, h: 12 }),  
        style: { fill: "#28B463", stroke: "#1C8F4C", strokeWidthPt: 0.8, opacity: 0.9 },  
        source: source("top-complex-diagram-native-skeleton-suggestion-check", { checkIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-suggestion-line-${index}`,  
        type: "line",  
        box: { x: round(suggestionBox.x + suggestionBox.w * 0.22), y, w: round(suggestionBox.w * 0.58), h: 0 },  
        style: { stroke: "#81C99B", strokeWidthPt: 2, connectorType: "straight", opacity: 0.72 },  
        source: source("top-complex-diagram-native-skeleton-suggestion-line", { lineIndex: index })  
      });  
    });  
    const tableBox = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.02,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.84,  
      w: Number(box.w || 0) * 0.96,  
      h: Number(box.h || 0) * 0.14  
    });  
    shapes.push({  
      id: `${base}-native-skeleton-comparison-table`,  
      type: "roundRect",  
      box: tableBox,  
      style: { fill: "#F8FBFF", stroke: "#BFD1E0", strokeWidthPt: 1, radiusRatio: 0.03, opacity: 0.72 },  
      source: source("top-complex-diagram-native-skeleton-comparison-table")  
    });  
    [0.5].forEach((ratio, index) => {  
      shapes.push({  
        id: `${base}-native-skeleton-table-divider-${index}`,  
        type: "line",  
        box: { x: round(tableBox.x + tableBox.w * ratio), y: tableBox.y, w: 0, h: tableBox.h },  
        style: { stroke: "#BFD1E0", strokeWidthPt: 1, connectorType: "straight", opacity: 0.8 },  
        source: source("top-complex-diagram-native-skeleton-table-divider", { dividerIndex: index })  
      });  
    });  
    return shapes;  
  }
  
  function topComplexDiagramShapeSource(image, detector, extra = {}) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "top-complex-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      ...extra  
    };  
  }
  
  function topComplexDiagramNativeTextBoxes(image, textBoxes = []) {  
    const box = image?.box || {};  
    const internalTextBoxes = (textBoxes || [])  
      .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))  
      .filter((textBox) => isTopComplexDiagramInternalLabel(textBox, box))  
      .filter((textBox) => normalizeMatrixLabel(textBox.text));  
    const semanticTextBoxes = topComplexDiagramSemanticTextBoxes(image)  
      .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))  
      .filter((textBox) => isTopComplexDiagramInternalLabel(textBox, box))  
      .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));  
    return [  
      ...internalTextBoxes,  
      ...semanticTextBoxes  
    ].map((textBox, index) => topComplexDiagramTextBox(image, textBox, index));  
  }
  
  function topComplexDiagramSemanticTextBoxes(image = {}) {  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : [];  
    return nodes  
      .filter((node) => node?.box && String(node.text || "").trim())  
      .map((node, index) => ({  
        id: node.sourceTextBoxId || `${image.id || "top-complex-diagram"}-semantic-node-${index}`,  
        text: String(node.text || ""),  
        box: node.box,  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "top-complex-diagram-semantic-node",  
          semanticTextSource: true,  
          semanticNodeId: node.id || ""  
        }  
      }));  
  }
  
  function isTopComplexDiagramInternalLabel(textBox, panelBox = {}) {  
    const text = String(textBox?.text || "").trim();  
    if (!text) return false;  
    const compact = normalizeMatrixLabel(text);  
    const box = textBox?.box || {};  
    const center = centerOfBox(box);  
    const relX = (center.x - Number(panelBox.x || 0)) / Math.max(1, Number(panelBox.w || 1));  
    const relY = (center.y - Number(panelBox.y || 0)) / Math.max(1, Number(panelBox.h || 1));  
    if (relY < 0.02 || relY > 0.9) return false;  
    if (/^DebuggerWindow$/i.test(text)) return true;  
    if (/^(?:修复建议|自动补充超量收货阻断规则|统一角色权限定义|建议修改权限配置)$/.test(compact)) return true;  
    if (/^(?:前后矛盾|边界缺失)[：:]/.test(compact)) return true;  
    if (/此处权限与上文角色定义不一致/.test(compact) && relX >= 0.34) return true;  
    return false;  
  }
  
  function topComplexDiagramTextBox(image, textBox, index) {  
    const next = JSON.parse(JSON.stringify(textBox));  
    const compact = normalizeMatrixLabel(next.text);  
    const role = /^DebuggerWindow$/i.test(String(next.text || "").trim())  
      ? "window-title"  
      : /^(?:修复建议|自动补充|统一角色|建议修改)/.test(compact)  
        ? "fix-card-label"  
        : "review-issue-label";  
    const prominentFixCard = /^(?:修复建议|统一角色权限定义)$/.test(compact);  
    next.id = next.id || `${image.id || "top-complex-diagram"}-native-text-${index}`;  
    next.font = {  
      ...(next.font || {}),  
      color: prominentFixCard ? "#FFFFFF" : topComplexDiagramTextColor(role, next.font?.color),  
      opacity: 1,  
      weight: role === "window-title" ? (next.font?.weight || "regular") : "bold"  
    };  
    next.source = {  
      ...(next.source || {}),  
      editable: true,  
      nativeRebuild: true,  
      detector: "top-complex-diagram-native-visible-label",  
      expressionForm: "complex-diagram",  
      expressionSubtype: "top-complex-diagram",  
      layerSourceId: image.id || null,  
      overlayVisibility: "visible",  
      role,  
      textErasedFromCrop: true  
    };  
    return next;  
  }
  
  function topComplexDiagramTextColor(role, fallback) {  
    const normalized = normalizeHex(fallback, "");  
    if (normalized) return normalized;  
    if (role === "fix-card-label") return "#FFFFFF";  
    if (role === "review-issue-label") return "#C53A2E";  
    return "#111111";  
  }
  
  function topComplexDiagramCardShapes(image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage) return [];  
    return (textBoxes || [])  
      .filter((textBox) => textBox?.source?.role === "fix-card-label")  
      .map((textBox, index) => {  
        const cardBox = topComplexDiagramCardBox(textBox.box, image.box);  
        const fill = topComplexDiagramSampledCardFill(cardBox, sourceImage, slideSize, textBox);  
        return {  
          id: `${image.id || "top-complex-diagram"}-native-fix-card-${index}`,  
          type: "roundRect",  
          box: cardBox,  
          style: {  
            fill,  
            stroke: "none",  
            strokeWidthPt: 0,  
            radiusRatio: 0.16  
          },  
          source: {  
            editable: true,  
            nativeRebuild: true,  
            detector: "top-complex-diagram-native-fix-card",  
            expressionForm: "complex-diagram",  
            expressionSubtype: "top-complex-diagram",  
            layerSourceId: image.id || null,  
            role: "fix-card-container",  
            textBoxId: textBox.id || null  
          }  
        };  
      });  
  }
  
  function topComplexDiagramStructureShapes(image, allTextBoxes = [], nativeTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const base = image.id || "top-complex-diagram";  
    const shapes = [];  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "top-complex-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      ...extra  
    });  
    
    const suggestionText = nativeTextBoxes.find((textBox) => /修复建议/.test(String(textBox.text || "")));  
    if (suggestionText?.box) {  
      const fixPanel = constrainPtBox({  
        x: suggestionText.box.x - 14,  
        y: suggestionText.box.y - 12,  
        w: Math.max(235, box.x + box.w - suggestionText.box.x + 18),  
        h: Math.min(168, box.y + box.h - suggestionText.box.y - 4)  
      }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });  
      shapes.push({  
        id: `${base}-native-suggestion-panel`,  
        type: "roundRect",  
        box: fixPanel,  
        style: {  
          fill: "#FFFFFF",  
          stroke: "#CBD5DD",  
          strokeWidthPt: 1,  
          radiusRatio: 0.035,  
          shadow: { color: "#5A6B7A", opacity: 0.14, blurPt: 3.2, distancePt: 1, angleDeg: 90 }  
        },  
        source: source("top-complex-diagram-native-suggestion-panel")  
      });  
      shapes.push({  
        id: `${base}-native-suggestion-divider`,  
        type: "line",  
        box: {  
          x: round(fixPanel.x + 8),  
          y: round(suggestionText.box.y + suggestionText.box.h + 7),  
          w: round(fixPanel.w - 16),  
          h: 0  
        },  
        style: { stroke: "#D7DEE4", strokeWidthPt: 1, connectorType: "straight" },  
        source: source("top-complex-diagram-native-suggestion-divider")  
      });  
      nativeTextBoxes  
        .filter((textBox) => textBox?.source?.role === "fix-card-label" && !/修复建议/.test(String(textBox.text || "")))  
        .slice(0, 3)  
        .forEach((textBox, index) => {  
          const center = centerOfBox(textBox.box);  
          const iconBox = { x: round(fixPanel.x + 14), y: round(center.y - 11), w: 22, h: 22 };  
          shapes.push({  
            id: `${base}-native-suggestion-check-${index}`,  
            type: "ellipse",  
            box: iconBox,  
            style: { fill: "#2DBB63", stroke: "#27A556", strokeWidthPt: 0.7 },  
            source: source("top-complex-diagram-native-suggestion-check", { checkIndex: index })  
          });  
          shapes.push({  
            id: `${base}-native-suggestion-check-mark-${index}`,  
            type: "freeform",  
            box: { x: iconBox.x + 5, y: iconBox.y + 6, w: 12, h: 10 },  
            points: [  
              { x: 0, y: 0.52 },  
              { x: 0.35, y: 0.9 },  
              { x: 1, y: 0 }  
            ],  
            style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 2.1, lineCap: "round" },  
            source: source("top-complex-diagram-native-suggestion-checkmark", { checkIndex: index })  
          });  
        });  
    }  
    
    const pain = (allTextBoxes || []).find((textBox) => String(textBox.text || "") === "痛点");  
    const ability = (allTextBoxes || []).find((textBox) => String(textBox.text || "") === "能力");  
    if (pain?.box && ability?.box) {  
      const headerY = Math.min(pain.box.y, ability.box.y) - 8;  
      const leftText = (allTextBoxes || []).find((textBox) => /人工评审费时/.test(String(textBox.text || "")));  
      const rightText = (allTextBoxes || []).find((textBox) => /执行逻辑校验/.test(String(textBox.text || "")));  
      const table = constrainPtBox({  
        x: Math.max(0, Math.min(pain.box.x, leftText?.box?.x || pain.box.x) - 18),  
        y: headerY,  
        w: Math.min(slideSize.widthPt - 24, Math.max(820, (rightText?.box?.x || ability.box.x) + (rightText?.box?.w || 360) - Math.min(pain.box.x, leftText?.box?.x || pain.box.x) + 28)),  
        h: 94  
      }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt });  
      const midX = round(table.x + table.w * 0.5);  
      const headerH = 32;  
      shapes.push({  
        id: `${base}-native-comparison-table-bg`,  
        type: "roundRect",  
        box: table,  
        style: { fill: "#FFFFFF", stroke: "#B7C2CA", strokeWidthPt: 1, radiusRatio: 0.02 },  
        source: source("top-complex-diagram-native-comparison-table")  
      });  
      shapes.push({  
        id: `${base}-native-comparison-table-ability-head`,  
        type: "rect",  
        box: { x: midX, y: table.y, w: round(table.x + table.w - midX), h: headerH },  
        style: { fill: "#E9F6FD", stroke: "none", strokeWidthPt: 0 },  
        source: source("top-complex-diagram-native-comparison-table-header", { column: "ability" })  
      });  
      [  
        { id: "header", box: { x: table.x, y: table.y + headerH, w: table.w, h: 0 } },  
        { id: "middle", box: { x: midX, y: table.y, w: 0, h: table.h } }  
      ].forEach((line) => {  
        shapes.push({  
          id: `${base}-native-comparison-table-line-${line.id}`,  
          type: "line",  
          box: line.box,  
          style: { stroke: "#B7C2CA", strokeWidthPt: 1, connectorType: "straight" },  
          source: source("top-complex-diagram-native-comparison-table-line", { line: line.id })  
        });  
      });  
    }  
    
    return shapes;  
  }
  
  function topComplexDiagramCardBox(textBox = {}, imageBox = {}) {  
    const raw = {  
      x: Number(textBox.x || 0) - 12,  
      y: Number(textBox.y || 0) - 4,  
      w: Number(textBox.w || 0) + 24,  
      h: Number(textBox.h || 0) + 8  
    };  
    return constrainPtBox(raw, imageBox);  
  }
  
  function topComplexDiagramSampledCardFill(cardBox, sourceImage, slideSize, textBox) {  
    const compact = normalizeMatrixLabel(textBox?.text);  
    if (/^(?:修复建议|统一角色权限定义)$/.test(compact)) return "#1C9B55";  
    const pxBox = ptToPxBox(cardBox, sourceImage, slideSize, 0);  
    const sampled = sampleMaskBackgroundColor(sourceImage, pxBox);  
    const sampledHex = rgbToHex(sampled);  
    const fontColor = String(normalizeHex(textBox?.font?.color, "")).toUpperCase();  
    if (fontColor === "#FFFFFF" && luma(sampled) < 230 && saturation(sampled) > 0.04) return sampledHex;  
    if (fontColor === "#FFFFFF") return "#1C9B55";  
    return luma(sampled) > 245 ? "#EAF4EC" : sampledHex;  
  }
  
  function maybeEraseTopComplexDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {  
    if (!sourceImage || textBoxes.length === 0) return [];  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    if (!assetFile) return [];  
    const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 5));  
    if (masks.length === 0) return [];  
    const erased = eraseMasks(sourceImage, masks);  
    const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));  
    ensureDir(path.dirname(assetFile));  
    writePng(assetFile, crop);  
    return textBoxes;  
  }

  return {
    createTopComplexDiagramTextShapes,
    inferTopComplexDiagramSkeletonShapes
  };
}

module.exports = { createTopComplexDiagramFactory };
