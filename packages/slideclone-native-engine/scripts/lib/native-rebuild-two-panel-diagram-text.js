"use strict";

function createTwoPanelDiagramTextFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    centerOfBox,
    clampPtBoxToSlide,
    constrainPtBox,
    cropPng,
    eraseMasks,
    ensureDir,
    expandBox,
    keepsInternalLayerText,
    localResidualPxBox,
    markTwoPanelChaosIllustrationPreserved,
    normalizeCjkText,
    normalizeHex,
    normalizeMatrixLabel,
    path,
    ptToPxBox,
    resolveAssetPathForIr,
    round,
    roundedBox,
    sameDiagramLabel,
    shouldPreserveTwoPanelChaosIllustrationCrop,
    shouldPreserveImageCropUnderNativeAssistants,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createTwoPanelDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (image?.source?.detector !== "two-panel-diagram-crop") continue;  
      if (shouldPreserveTwoPanelChaosIllustrationCrop(image, images, textBoxes, slideSize)) {  
        markTwoPanelChaosIllustrationPreserved(image);  
        continue;  
      }  
      const candidates = twoPanelDiagramNativeTextBoxes(image, textBoxes);  
      const erasedTextBoxes = sourceImage ? maybeEraseTwoPanelDiagramText({  
        image,  
        textBoxes: candidates,  
        sourceImage,  
        slideSize,  
        irDir  
      }) : [];  
      const nativeTextBoxes = erasedTextBoxes.length > 0  
        ? erasedTextBoxes  
        : candidates.map((textBox) => ({  
          ...textBox,  
          source: {  
            ...(textBox.source || {}),  
            textErasedFromCrop: false,  
            overlayVisibility: "visible"  
          }  
        }));  
      if (nativeTextBoxes.length === 0) {  
        const skeletonShapes = inferTwoPanelDiagramSkeletonShapes(image);  
        if (skeletonShapes.length > 0) {  
          image.source = {  
            ...(image.source || {}),  
            twoPanelDiagramSkeletonObjectified: true,  
            visualAtomOverlayOnly: true,  
            objectifiedTwoPanelDiagramSkeletonShapes: skeletonShapes.length,  
            nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram structure rebuilt as native skeleton overlays while preserving the source crop`  
          };  
          shapes.push(...skeletonShapes);  
        }  
        continue;  
      }  
      const semanticDriven = nativeTextBoxes.some((textBox) =>  
        textBox?.source?.semanticTextSource === true  
      );  
      const semanticSkeletonShapes = semanticDriven ? inferTwoPanelDiagramSkeletonShapes(image) : [];  
      image.source = {  
        ...(image.source || {}),  
        twoPanelDiagramTextObjectified: true,  
        twoPanelDiagramNativeTextBoxes: nativeTextBoxes,  
        objectifiedTwoPanelDiagramTextBoxes: nativeTextBoxes.length,  
        twoPanelDiagramSemanticTextObjectified: semanticDriven || image.source?.twoPanelDiagramSemanticTextObjectified,  
        twoPanelDiagramSkeletonObjectified: semanticSkeletonShapes.length > 0 || image.source?.twoPanelDiagramSkeletonObjectified,  
        visualAtomOverlayOnly: semanticSkeletonShapes.length > 0 ? true : image.source?.visualAtomOverlayOnly,  
        objectifiedTwoPanelDiagramSkeletonShapes: semanticSkeletonShapes.length || image.source?.objectifiedTwoPanelDiagramSkeletonShapes,  
        nonEditableReason: sourceImage  
          ? `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram OCR/semantic labels erased from crop and rebuilt as editable native text`  
          : `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; two-panel diagram semantic labels rebuilt as editable native text without mutating the source crop`  
      };  
      shapes.push(...semanticSkeletonShapes);  
    }  
    return shapes;  
  }  
    
  function inferTwoPanelDiagramSkeletonShapes(image = {}) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const base = image.id || "two-panel-diagram";  
    const isRightAssetPanel = Number(box.x || 0) > DEFAULT_SLIDE.widthPt * 0.45;  
    return isRightAssetPanel  
      ? inferTwoPanelAssetRepositorySkeletonShapes(base, image, box)  
      : inferTwoPanelChaosCloudSkeletonShapes(base, image, box);  
  }  
    
  function inferTwoPanelChaosCloudSkeletonShapes(base, image, box) {  
    const source = (detector, extra = {}) => twoPanelDiagramShapeSource(image, detector, extra);  
    const shapes = [{  
      id: `${base}-native-skeleton-cloud`,  
      type: "ellipse",  
      box: roundedBox({  
        x: Number(box.x || 0) + Number(box.w || 0) * 0.09,  
        y: Number(box.y || 0) + Number(box.h || 0) * 0.16,  
        w: Number(box.w || 0) * 0.72,  
        h: Number(box.h || 0) * 0.52  
      }),  
      style: {  
        fill: "#F2EDE3",  
        stroke: "#C8BFAF",  
        strokeWidthPt: 1.1,  
        opacity: 0.58,  
        shadow: { color: "#897C68", opacity: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }  
      },  
      source: source("two-panel-diagram-native-skeleton-cloud", { skeletonOnly: true })  
    }];  
    const tokenSpecs = [  
      { x: 0.20, y: 0.22, w: 0.12, h: 0.07, fill: "#F8F2E8" },  
      { x: 0.47, y: 0.20, w: 0.11, h: 0.07, fill: "#FFF9EF" },  
      { x: 0.64, y: 0.35, w: 0.10, h: 0.07, fill: "#F8F2E8" },  
      { x: 0.28, y: 0.52, w: 0.13, h: 0.07, fill: "#FFF9EF" },  
      { x: 0.55, y: 0.62, w: 0.12, h: 0.07, fill: "#F8F2E8" }  
    ];  
    tokenSpecs.forEach((token, index) => {  
      shapes.push({  
        id: `${base}-native-skeleton-token-${index}`,  
        type: "roundRect",  
        box: roundedBox({  
          x: Number(box.x || 0) + Number(box.w || 0) * token.x,  
          y: Number(box.y || 0) + Number(box.h || 0) * token.y,  
          w: Number(box.w || 0) * token.w,  
          h: Number(box.h || 0) * token.h  
        }),  
        style: {  
          fill: token.fill,  
          stroke: "#B79D7F",  
          strokeWidthPt: 0.8,  
          radiusRatio: 0.12,  
          opacity: 0.82  
        },  
        source: source("two-panel-diagram-native-skeleton-token", { tokenIndex: index, skeletonOnly: true })  
      });  
    });  
    for (let index = 0; index < 6; index += 1) {  
      shapes.push({  
        id: `${base}-native-skeleton-link-${index}`,  
        type: "line",  
        box: {  
          x: round(Number(box.x || 0) + Number(box.w || 0) * (0.22 + index * 0.07)),  
          y: round(Number(box.y || 0) + Number(box.h || 0) * (0.34 + (index % 3) * 0.08)),  
          w: round(Number(box.w || 0) * 0.18),  
          h: round(Number(box.h || 0) * (index % 2 === 0 ? 0.05 : -0.06))  
        },  
        style: { stroke: "#B99E82", strokeWidthPt: 1.1, connectorType: "straight", opacity: 0.55 },  
        source: source("two-panel-diagram-native-skeleton-link", { linkIndex: index, skeletonOnly: true })  
      });  
    }  
    return shapes;  
  }  
    
  function inferTwoPanelAssetRepositorySkeletonShapes(base, image, box) {  
    const source = (detector, extra = {}) => twoPanelDiagramShapeSource(image, detector, extra);  
    const repo = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.18,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.13,  
      w: Number(box.w || 0) * 0.58,  
      h: Number(box.h || 0) * 0.76  
    });  
    const shapes = [{  
      id: `${base}-native-skeleton-repository`,  
      type: "roundRect",  
      box: repo,  
      style: {  
        fill: "#F8FBFF",  
        stroke: "#A6C4DF",  
        strokeWidthPt: 1.2,  
        radiusRatio: 0.04,  
        shadow: { color: "#86A8C8", opacity: 0.14, blurPt: 3.2, distancePt: 1.2, angleDeg: 90 }  
      },  
      source: source("two-panel-diagram-native-skeleton-repository", { skeletonOnly: true })  
    }];  
    const docRows = [0.26, 0.45, 0.64];  
    docRows.forEach((ratio, index) => {  
      shapes.push({  
        id: `${base}-native-skeleton-doc-${index}`,  
        type: "roundRect",  
        box: roundedBox({  
          x: repo.x + repo.w * 0.16,  
          y: repo.y + repo.h * ratio,  
          w: repo.w * 0.66,  
          h: repo.h * 0.12  
        }),  
        style: {  
          fill: "#FFFFFF",  
          stroke: "#6FA8DC",  
          strokeWidthPt: 1,  
          radiusRatio: 0.06,  
          opacity: 0.9  
        },  
        source: source("two-panel-diagram-native-skeleton-document", { documentIndex: index, skeletonOnly: true })  
      });  
    });  
    shapes.push({  
      id: `${base}-native-skeleton-check`,  
      type: "ellipse",  
      box: roundedBox({  
        x: repo.x + repo.w * 0.78,  
        y: repo.y + repo.h * 0.18,  
        w: repo.w * 0.13,  
        h: repo.w * 0.13  
      }),  
      style: { fill: "#3CC875", stroke: "#2CA55F", strokeWidthPt: 1 },  
      source: source("two-panel-diagram-native-skeleton-status", { skeletonOnly: true })  
    });  
    return shapes;  
  }  
    
  function twoPanelDiagramShapeSource(image, detector, extra = {}) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "two-panel-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      ...extra  
    };  
  }  
    
  function twoPanelDiagramNativeTextBoxes(image, textBoxes = []) {  
    const box = image?.box || {};  
    const internalTextBoxes = (textBoxes || [])  
      .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))  
      .filter((textBox) => isTwoPanelDiagramInternalLabel(textBox, box))  
      .filter((textBox) => normalizeMatrixLabel(textBox.text));  
    const semanticTextBoxes = twoPanelDiagramSemanticTextBoxes(image)  
      .filter((textBox) => textBox?.box && boxCenterInside(textBox.box, box))  
      .filter((textBox) => isTwoPanelDiagramInternalLabel(textBox, box))  
      .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));  
    return [  
      ...internalTextBoxes,  
      ...semanticTextBoxes  
    ].map((textBox, index) => twoPanelDiagramTextBox(image, textBox, index));  
  }  
    
  function twoPanelDiagramSemanticTextBoxes(image = {}) {  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : [];  
    return nodes  
      .filter((node) => node?.box && String(node.text || "").trim())  
      .map((node, index) => ({  
        id: node.sourceTextBoxId || `${image.id || "two-panel-diagram"}-semantic-node-${index}`,  
        text: String(node.text || ""),  
        box: node.box,  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "two-panel-diagram-semantic-node",  
          semanticTextSource: true,  
          semanticNodeId: node.id || ""  
        }  
      }));  
  }  
    
  function isTwoPanelDiagramInternalLabel(textBox, panelBox = {}) {  
    const compact = normalizeMatrixLabel(textBox?.text);  
    if (!compact) return false;  
    const box = textBox?.box || {};  
    const center = centerOfBox(box);  
    const relY = (center.y - Number(panelBox.y || 0)) / Math.max(1, Number(panelBox.h || 1));  
    if (relY < 0.05 || relY > 0.92) return false;  
    if (compact.length === 1 && /[\u4e00-\u9fff]/.test(compact) && Number(box.w || 0) < 18 && Number(box.h || 0) < 14) {  
      return false;  
    }  
    return /^(?:V\d+(?:\.\d+)?(?:-[A-Z]+)?|v\d+(?:\.\d+)?|W|HTML?|HTM|<>|error|rfcor|已审)$/.test(compact)  
      || /DomainRepository|PMS配置|PRD\.md|APIEndpoints\.md|UI[_\s]?Wireframe\.fig|Ul[_\s]?Wireframe\.fig/.test(compact)  
      || /码表口径模糊|多版本混杂/.test(compact);  
  }  
    
  function twoPanelDiagramTextBox(image, textBox, index) {  
    const next = JSON.parse(JSON.stringify(textBox));  
    const compact = normalizeMatrixLabel(next.text);  
    const role = /DomainRepository|PMS配置|PRD\.md|APIEndpoints\.md|Wireframe/.test(compact)  
      ? "asset-label"  
      : /码表口径模糊|多版本混杂|error|rfcor/.test(compact)  
        ? "issue-label"  
        : "version-or-file-token";  
    next.id = next.id || `${image.id || "two-panel-diagram"}-native-text-${index}`;  
    next.font = {  
      ...(next.font || {}),  
      color: twoPanelDiagramTextColor(role, next.font?.color),  
      opacity: 1,  
      weight: role === "asset-label" || role === "issue-label" ? "bold" : (next.font?.weight || "regular")  
    };  
    next.source = {  
      ...(next.source || {}),  
      editable: true,  
      nativeRebuild: true,  
      detector: "two-panel-diagram-native-visible-label",  
      expressionForm: "complex-diagram",  
      expressionSubtype: "two-panel-diagram",  
      layerSourceId: image.id || null,  
      overlayVisibility: "visible",  
      role,  
      textErasedFromCrop: true  
    };  
    return next;  
  }  
    
  function twoPanelDiagramTextColor(role, fallback) {  
    const normalized = normalizeHex(fallback, "");  
    if (normalized) return normalized;  
    if (role === "issue-label") return "#5B3420";  
    return "#111111";  
  }  
    
  function maybeEraseTwoPanelDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {  
    if (!sourceImage || textBoxes.length === 0) return [];  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    if (!assetFile) return [];  
    const masks = textBoxes.map((item) => ptToPxBox(item.box, sourceImage, slideSize, 4));  
    if (masks.length === 0) return [];  
    const erased = eraseMasks(sourceImage, masks);  
    const crop = cropPng(erased, ptToPxBox(image.box, sourceImage, slideSize, 0));  
    ensureDir(path.dirname(assetFile));  
    writePng(assetFile, crop);  
    return textBoxes;  
  }

  return {
    createTwoPanelDiagramTextShapes,
    inferTwoPanelDiagramSkeletonShapes,
    twoPanelDiagramShapeSource,
    twoPanelDiagramNativeTextBoxes,
    twoPanelDiagramSemanticTextBoxes,
    twoPanelDiagramTextBox,
    twoPanelDiagramTextColor,
    maybeEraseTwoPanelDiagramText
  };
}

module.exports = {
  createTwoPanelDiagramTextFactory
};
