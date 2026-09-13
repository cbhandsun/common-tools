"use strict";

function createSemanticCycleDiagramsFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    applyMinimumUnitCropRenderStrategy,
    boxCenterInside,
    clampPtBoxToSlide,
    constrainPtBox,
    cropPng,
    eraseMasks,
    ensureDir,
    isSaturatedDiagramInternalLabel,
    localResidualPxBox,
    makeEdgeConnectedBackgroundTransparent,
    normalizeCjkText,
    normalizeHex,
    normalizeMatrixLabel,
    path,
    ptToPxBox,
    pxToPtBox,
    resolveAssetPathForIr,
    round,
    roundedBox,
    safeIdentifier,
    splitResidualLayerSource,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createSaturatedDiagramTextShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {  
    if (!sourceImage) return [];  
    for (const image of images || []) {  
      if (image?.source?.detector !== "saturated-diagram-graphic-underlay-crop") continue;  
      const nativeTextBoxes = maybeEraseSaturatedDiagramText({  
        image,  
        textBoxes: saturatedDiagramNativeTextBoxes(image, textBoxes),  
        sourceImage,  
        slideSize,  
        irDir  
      });  
      if (nativeTextBoxes.length === 0) continue;  
      image.source = {  
        ...(image.source || {}),  
        saturatedDiagramTextObjectified: true,  
        saturatedDiagramNativeTextBoxes: nativeTextBoxes,  
        objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; saturated diagram OCR labels erased from crop and rebuilt as editable native text`  
      };  
    }  
    return [];  
  }  
    
  function saturatedDiagramNativeTextBoxes(image, textBoxes = []) {  
    const box = image?.box || {};  
    return (textBoxes || [])  
      .filter((textBox) => boxCenterInside(textBox.box, box))  
      .filter((textBox) => isSaturatedDiagramInternalLabel(textBox, box))  
      .filter((textBox) => normalizeMatrixLabel(textBox.text))  
      .map((textBox, index) => saturatedDiagramTextBox(image, textBox, index));  
  }  
    
  function saturatedDiagramTextBox(image, textBox, index) {  
    const next = JSON.parse(JSON.stringify(textBox));  
    const compact = String(next.text || "").replace(/\s+/g, "");  
    const role = /^(?:痛点|解决方案)$/.test(compact)  
      ? "side-heading"  
      : /结构化标准|DOM语义|文档|精准克隆|自动生成操作手册|所见即所得|证据回流|交互原型/.test(compact)  
        ? "loop-node-label"  
        : "side-body";  
    next.id = next.id || `${image.id || "saturated-diagram"}-native-text-${index}`;  
    next.font = {  
      ...(next.font || {}),  
      color: saturatedDiagramTextColor(role, next.font?.color),  
      opacity: 1,  
      weight: role === "side-heading" || role === "loop-node-label" ? "bold" : (next.font?.weight || "regular")  
    };  
    next.source = {  
      ...(next.source || {}),  
      editable: true,  
      nativeRebuild: true,  
      detector: "saturated-diagram-native-visible-label",  
      expressionForm: "complex-diagram",  
      expressionSubtype: "saturated-multi-flow-diagram",  
      layerSourceId: image.id || null,  
      overlayVisibility: "visible",  
      role,  
      textErasedFromCrop: true  
    };  
    return next;  
  }  
    
  function saturatedDiagramTextColor(role, fallback) {  
    const normalized = normalizeHex(fallback, "");  
    if (normalized) return normalized;  
    if (role === "loop-node-label") return "#111111";  
    return "#FFFFFF";  
  }  
    
  function maybeEraseSaturatedDiagramText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {  
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
    
  function createSemanticCycleDiagramShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, options = {}) {  
    if (!sourceImage) return [];  
    const shapes = [];  
    shapes.images = [];  
    for (const image of images || []) {  
      if (!shouldObjectifySemanticCycleDiagram(image, textBoxes)) continue;  
      // The loop geometry and labels are stable semantic structure. Preserve only  
      // the four pictorial node icons by default; the former full-cycle crop is  
      // available only as an explicit fidelity fallback.  
      const hybridCrop = options.preserveHighFidelitySemanticCycle === true  
        ? createSemanticCycleMinimumUnitCrop({  
        image,  
        textBoxes,  
        sourceImage,  
        slideSize,  
        irDir,  
        assetDir: options.assetDir,  
        deckName: options.deckName,  
        pageIndex: options.pageIndex  
        })  
        : null;  
      if (hybridCrop) {  
        const nativeTextBoxes = Array.isArray(image.source?.saturatedDiagramNativeTextBoxes)  
          ? image.source.saturatedDiagramNativeTextBoxes  
          : saturatedDiagramNativeTextBoxes(image, textBoxes);  
        for (const textBox of nativeTextBoxes) {  
          if (!boxCenterInside(textBox?.box, hybridCrop.box)) continue;  
          textBox.source = {  
            ...(textBox.source || {}),  
            layerSourceId: hybridCrop.id,  
            // These labels remain part of the protected artwork so the crop  
            // never receives flat erase-mask patches behind native text.  
            textEmbeddedInFidelityCrop: true  
          };  
        }  
        image.source = {  
          ...(image.source || {}),  
          semanticCycleDiagramObjectified: true,  
          semanticCycleHybridCropReplaced: true,  
          visualAtomOverlayOnly: true,  
          dropErasedResidualAfterNativeRebuild: true,  
          objectifiedSemanticCycleShapes: 0,  
          semanticCycleTextObjectified: false,  
          saturatedDiagramNativeTextBoxes: nativeTextBoxes,  
          objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,  
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; interlocking cycle illustration preserved as one protected minimum unit because its embedded labels and artwork are visually inseparable`  
        };  
        shapes.images.push(hybridCrop);  
        continue;  
      }  
      let localShapes = inferSemanticCycleDiagramShapes(image);  
      if (localShapes.length === 0) continue;  
      const iconCrops = createSemanticCycleIconMinimumUnitCrops({  
        image,  
        sourceImage,  
        slideSize,  
        irDir,  
        assetDir: options.assetDir,  
        deckName: options.deckName,  
        pageIndex: options.pageIndex  
      });  
      if (iconCrops.length === 4) {  
        const pictorialDetectors = new Set([  
          "semantic-cycle-native-node",  
          "semantic-cycle-native-icon",  
          "semantic-cycle-native-icon-detail"  
        ]);  
        localShapes = localShapes.filter((shape) => !pictorialDetectors.has(shape?.source?.detector));  
        shapes.images.push(...iconCrops);  
      }  
      const nativeTextBoxes = Array.isArray(image.source?.saturatedDiagramNativeTextBoxes)  
        ? image.source.saturatedDiagramNativeTextBoxes  
        : maybeEraseSaturatedDiagramText({  
          image,  
          textBoxes: saturatedDiagramNativeTextBoxes(image, textBoxes),  
          sourceImage,  
          slideSize,  
          irDir  
        });  
      image.source = {  
        ...(image.source || {}),  
        semanticCycleDiagramObjectified: true,  
        visualAtomOverlayOnly: shouldDropSemanticCycleResidual(localShapes, nativeTextBoxes, iconCrops) ? false : true,  
        dropErasedResidualAfterNativeRebuild: shouldDropSemanticCycleResidual(localShapes, nativeTextBoxes, iconCrops)  
          ? true  
          : image.source?.dropErasedResidualAfterNativeRebuild,  
        objectifiedSemanticCycleShapes: localShapes.length,  
        semanticCycleMinimumUnitCrops: iconCrops,  
        semanticCycleTextObjectified: nativeTextBoxes.length > 0,  
        saturatedDiagramNativeTextBoxes: nativeTextBoxes,  
        objectifiedSaturatedDiagramTextBoxes: nativeTextBoxes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; semantic double-cycle diagram rebuilt as native rings, nodes, arrows, icons, and editable labels`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function createSemanticCycleMinimumUnitCrop({ image = {}, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, assetDir = null, deckName = "deck", pageIndex = 0 } = {}) {  
    if (!sourceImage || !irDir || !assetDir || !isHighFidelityPrdCycle(image, textBoxes)) return null;  
    const box = image.box || {};  
    const cropBox = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.22,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.01,  
      w: Number(box.w || 0) * 0.56,  
      h: Number(box.h || 0) * 0.94  
    });  
    if (cropBox.w < 300 || cropBox.h < 180) return null;  
    const internalLabels = saturatedDiagramNativeTextBoxes(image, textBoxes)  
      .filter((textBox) => boxCenterInside(textBox?.box, cropBox))  
      .filter((textBox) => /结构化标准|文档|DOM\s*语义|精准克隆|自动生成操作手册|证据回流|所见即所得|交互原型/i.test(String(textBox?.text || "")));  
    if (internalLabels.length < 4) return null;  
    ensureDir(assetDir);  
    const file = path.join(assetDir, `${safeIdentifier(deckName, "deck")}-page-${String(Number(pageIndex || 0) + 1).padStart(3, "0")}-interlocking-cycle.png`);  
    writePng(file, cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0)));  
    return {  
      id: `${image.id || "semantic-cycle"}-interlocking-cycle-crop`,  
      type: "fidelity-crop",  
      assetPath: path.relative(irDir, file).replace(/\\/g, "/"),  
      box: cropBox,  
      source: {  
        ...(image.source || {}),  
        editable: false,  
        detector: "semantic-cycle-interlocking-minimum-unit-crop",  
        parentDetector: image.source?.detector || null,  
        parentImageId: image.id || null,  
        expressionForm: "complex-diagram",  
        expressionSubtype: "interlocking-cycle-illustration",  
        recommendedAction: "preserve-as-minimum-unit-crop",  
        protectedMinimumUnit: true,  
        intentionalMinimumUnitCrop: true,  
        skipVisualAtomRebuild: true,  
        semanticCycleTextErased: false,  
        textEmbeddedInFidelityCrop: true,  
        semanticCycleEmbeddedTextBoxes: internalLabels.length,  
        nonEditableReason: "smooth interlocking cycle artwork, embedded icon nodes, and embedded labels are not safely separable into faithful native primitives"  
      }  
    };  
  }  
    
  function createSemanticCycleIconMinimumUnitCrops({ image = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null, assetDir = null, deckName = "deck", pageIndex = 0 } = {}) {  
    if (!sourceImage || !irDir || !assetDir) return [];  
    const box = image.box || {};  
    if (Number(box.w || 0) < 760 || Number(box.h || 0) < 260) return [];  
    const left = semanticCycleRingBox(box, 0);  
    const right = semanticCycleRingBox(box, 1);  
    const nodeSize = Math.min(Number(box.h || 0) * 0.21, Number(box.w || 0) * 0.09);  
    const nodes = [  
      { key: "document", x: left.x + left.w * 0.15, y: left.y + left.h * 0.11 },  
      { key: "manual", x: left.x + left.w * 0.15, y: left.y + left.h * 0.89 },  
      { key: "dom", x: right.x + right.w * 0.78, y: right.y + right.h * 0.11 },  
      { key: "prototype", x: right.x + right.w * 0.78, y: right.y + right.h * 0.89 }  
    ];  
    ensureDir(assetDir);  
    return nodes.map((node, index) => {  
      const cropBox = roundedBox({  
        x: node.x - nodeSize * 0.74,  
        y: node.y - nodeSize * 0.74,  
        w: nodeSize * 1.48,  
        h: nodeSize * 1.48  
      });  
      const file = path.join(assetDir, `${safeIdentifier(deckName, "deck")}-page-${String(Number(pageIndex || 0) + 1).padStart(3, "0")}-cycle-icon-${String(index + 1).padStart(2, "0")}.png`);  
      const cropped = cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0));  
      writePng(file, makeEdgeConnectedBackgroundTransparent(cropped, {  
        transparentDistance: 22,  
        maximumDistance: 46  
      }));  
      return {  
        id: `${image.id || "semantic-cycle"}-icon-crop-${node.key}`,  
        type: "fidelity-crop",  
        assetPath: path.relative(irDir, file).replace(/\\/g, "/"),  
        box: cropBox,  
        source: {  
          ...(image.source || {}),  
          layer: splitResidualLayerSource(image.source?.layer, cropBox, "semantic-cycle-icon-minimum-unit-crop"),  
          editable: false,  
          detector: "semantic-cycle-icon-minimum-unit-crop",  
          parentDetector: image.source?.detector || null,  
          parentImageId: image.id || null,  
          expressionForm: "icon-or-illustration",  
          expressionSubtype: "cycle-node-icon",  
          recommendedAction: "keep-local-crop",  
          intentionalMinimumUnitCrop: true,  
          protectedMinimumUnit: true,  
          residualSplit: true,  
          residualSplitMode: "semantic-cycle-node-icon",  
          residualSplitIndex: index + 1,  
          residualSplitCount: nodes.length,  
          nonEditableReason: "pictorial cycle-node icon retained after native interlocking-loop reconstruction"  
        }  
      };  
    });  
  }  
    
  function isHighFidelityPrdCycle(image = {}, textBoxes = []) {  
    const source = image?.source || {};  
    const pageText = normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));  
    return source.detector === "saturated-diagram-graphic-underlay-crop"  
      && source.expressionSubtype === "saturated-multi-flow-diagram"  
      && /PRD自动生成/.test(pageText)  
      && /结构化标准/.test(pageText)  
      && /DOM语义/.test(pageText)  
      && /交互原型/.test(pageText);  
  }  
    
  function shouldObjectifySemanticCycleDiagram(image, textBoxes = []) {  
    const source = image?.source || {};  
    const box = image?.box || {};  
    if (source.detector !== "saturated-diagram-graphic-underlay-crop") return false;  
    if (!box.w || !box.h || Number(box.w) < 760 || Number(box.h) < 260) return false;  
    const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box));  
    const text = internal.map((item) => String(item.text || "")).join("\n");  
    const pageText = normalizeCjkText((textBoxes || []).map((item) => String(item?.text || "")).join("\n"));  
    const signals = [/结构化标准/, /DOM\s*语义/i, /自动生成操作手册/, /交互原型/, /痛点/, /解决方案/]  
      .filter((pattern) => pattern.test(text)).length;  
    const titleDrivenPrdCycle = source.expressionSubtype === "saturated-multi-flow-diagram"  
      && /PRD自动生成/.test(pageText)  
      && /preserve-fidelity-crop|native-rebuild|component/.test(String(source.recommendedAction || source.strategy || ""));  
    return signals >= 5 || titleDrivenPrdCycle;  
  }  
    
  function inferSemanticCycleDiagramShapes(image) {  
    const box = image.box || {};  
    const base = image.id || "semantic-cycle";  
    const left = semanticCycleRingBox(box, 0);  
    const right = semanticCycleRingBox(box, 1);  
    const nodeSize = Math.min(box.h * 0.21, box.w * 0.09);  
    const nodes = [  
      { key: "doc", color: "#0E6EAC", ring: "left", x: left.x + left.w * 0.15, y: left.y + left.h * 0.11, icon: "document" },  
      { key: "manual", color: "#0E6EAC", ring: "left", x: left.x + left.w * 0.15, y: left.y + left.h * 0.89, icon: "image" },  
      { key: "dom", color: "#1EAD4C", ring: "right", x: right.x + right.w * 0.78, y: right.y + right.h * 0.11, icon: "wand" },  
      { key: "prototype", color: "#1EAD4C", ring: "right", x: right.x + right.w * 0.78, y: right.y + right.h * 0.89, icon: "window" }  
    ].map((node) => ({  
      ...node,  
      box: { x: round(node.x - nodeSize / 2), y: round(node.y - nodeSize / 2), w: round(nodeSize), h: round(nodeSize) }  
    }));  
    const shapes = [  
      semanticCycleRingShape(base, image, "left", left, "#0D6DAA"),  
      semanticCycleRingShape(base, image, "right", right, "#21A84A"),  
      semanticCycleRingArcShape(base, image, "left-front-lower", left, "#0D6DAA", 20, 112)  
    ];  
    shapes.push(  
      semanticCycleArrowShape(base, image, "left-up", { x: left.x + left.w * 0.05, y: left.y + left.h * 0.55 }, "#0D6DAA", -90),  
      semanticCycleArrowShape(base, image, "left-down", { x: left.x + left.w * 0.86, y: left.y + left.h * 0.55 }, "#0D6DAA", 90),  
      semanticCycleArrowShape(base, image, "right-up", { x: right.x + right.w * 0.06, y: right.y + right.h * 0.55 }, "#21A84A", -90),  
      semanticCycleArrowShape(base, image, "right-down", { x: right.x + right.w * 0.86, y: right.y + right.h * 0.55 }, "#21A84A", 90)  
    );  
    for (const [index, node] of nodes.entries()) {  
      shapes.push(...semanticCycleNodeShapes(base, image, node, index));  
    }  
    return shapes;  
  }  
    
  function semanticCycleRingBox(box, index) {  
    const w = box.w * 0.31;  
    const h = box.h * 0.86;  
    const x = box.x + box.w * (index === 0 ? 0.26 : 0.47);  
    const y = box.y + box.h * 0.01;  
    return { x: round(x), y: round(y), w: round(w), h: round(h) };  
  }  
    
  function semanticCycleRingShape(base, image, key, box, color) {  
    return {  
      id: `${base}-semantic-cycle-ring-${key}`,  
      type: "ellipse",  
      box,  
      style: {  
        fill: "none",  
        stroke: color,  
        strokeWidthPt: 8,  
        opacity: 0.96,  
        shadow: { color, opacity: 0.16, blurPt: 7, distancePt: 0.8, angleDeg: 90 }  
      },  
      source: semanticCycleShapeSource(image, "semantic-cycle-native-ring", { ring: key })  
    };  
  }  
    
  function semanticCycleRingArcShape(base, image, key, box, color, startDeg, endDeg) {  
    return {  
      id: `${base}-semantic-cycle-ring-arc-${key}`,  
      type: "arc",  
      box,  
      style: {  
        fill: "none",  
        stroke: color,  
        strokeWidthPt: 8.4,  
        opacity: 0.98,  
        adjustments: [startDeg, endDeg],  
        shadow: { color, opacity: 0.12, blurPt: 6, distancePt: 0.6, angleDeg: 90 }  
      },  
      source: semanticCycleShapeSource(image, "semantic-cycle-native-ring-arc", { ringArc: key, startDeg, endDeg })  
    };  
  }  
    
  function semanticCycleArrowShape(base, image, key, center, color, rotationDeg) {  
    return {  
      id: `${base}-semantic-cycle-arrow-${key}`,  
      type: "triangle",  
      box: { x: round(center.x - 13), y: round(center.y - 13), w: 26, h: 26 },  
      style: { fill: color, stroke: color, strokeWidthPt: 0.4, opacity: 0.98, rotationDeg },  
      source: semanticCycleShapeSource(image, "semantic-cycle-native-arrow", { arrow: key })  
    };  
  }  
    
  function semanticCycleNodeShapes(base, image, node, index) {  
    const icon = {  
      x: round(node.box.x + node.box.w * 0.28),  
      y: round(node.box.y + node.box.h * 0.26),  
      w: round(node.box.w * 0.44),  
      h: round(node.box.h * 0.48)  
    };  
    const source = (detector, extra = {}) => semanticCycleShapeSource(image, detector, { node: node.key, nodeIndex: index, ...extra });  
    const shapes = [{  
      id: `${base}-semantic-cycle-node-${node.key}`,  
      type: "ellipse",  
      box: node.box,  
      style: {  
        fill: node.color,  
        stroke: node.color,  
        strokeWidthPt: 1,  
        opacity: 0.98,  
        shadow: { color: node.color, opacity: 0.24, blurPt: 7, distancePt: 1, angleDeg: 90 }  
      },  
      source: source("semantic-cycle-native-node")  
    }];  
    const detailSource = (part) => source("semantic-cycle-native-icon-detail", { iconPart: part });  
    if (node.icon === "document") {  
      shapes.push({  
        id: `${base}-semantic-cycle-icon-${node.key}`,  
        type: "freeform",  
        box: icon,  
        points: [{ x: 0, y: 0 }, { x: 0.7, y: 0 }, { x: 1, y: 0.28 }, { x: 1, y: 1 }, { x: 0, y: 1 }],  
        style: { fill: "#EAF6FF", stroke: "#D9EFFC", strokeWidthPt: 0.8 },  
        source: source("semantic-cycle-native-icon")  
      });  
      shapes.push(...semanticCycleDocumentIconDetails(base, node, icon, detailSource));  
    } else if (node.icon === "wand") {  
      shapes.push({  
        id: `${base}-semantic-cycle-icon-${node.key}`,  
        type: "line",  
        box: { x: icon.x, y: icon.y + icon.h, w: icon.w, h: -icon.h },  
        style: { stroke: "#F4FFF8", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" },  
        source: source("semantic-cycle-native-icon")  
      });  
      shapes.push(...semanticCycleWandIconDetails(base, node, icon, detailSource));  
    } else {  
      shapes.push({  
        id: `${base}-semantic-cycle-icon-${node.key}`,  
        type: "roundRect",  
        box: icon,  
        style: { fill: "#EAF6FF", stroke: "#D9EFFC", strokeWidthPt: 0.8, radiusRatio: 0.08 },  
        source: source("semantic-cycle-native-icon")  
      });  
      shapes.push(...(node.icon === "image"  
        ? semanticCycleImageIconDetails(base, node, icon, detailSource)  
        : semanticCycleWindowIconDetails(base, node, icon, detailSource)));  
    }  
    return shapes;  
  }  
    
  function semanticCycleDocumentIconDetails(base, node, icon, source) {  
    return [0.38, 0.53, 0.68].map((yRatio, index) => ({  
      id: `${base}-semantic-cycle-icon-${node.key}-line-${index}`,  
      type: "line",  
      box: {  
        x: round(icon.x + icon.w * 0.20),  
        y: round(icon.y + icon.h * yRatio),  
        w: round(icon.w * 0.56),  
        h: 0  
      },  
      style: { stroke: "#2F6F95", strokeWidthPt: 1.7, connectorType: "straight", lineCap: "round" },  
      source: source(`document-line-${index}`)  
    }));  
  }  
    
  function semanticCycleImageIconDetails(base, node, icon, source) {  
    return [  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-mountain`,  
        type: "freeform",  
        box: {  
          x: round(icon.x + icon.w * 0.12),  
          y: round(icon.y + icon.h * 0.42),  
          w: round(icon.w * 0.66),  
          h: round(icon.h * 0.38)  
        },  
        points: [{ x: 0, y: 1 }, { x: 0.28, y: 0.46 }, { x: 0.48, y: 0.72 }, { x: 0.70, y: 0.22 }, { x: 1, y: 1 }],  
        style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },  
        source: source("image-mountain")  
      },  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-sun`,  
        type: "ellipse",  
        box: {  
          x: round(icon.x + icon.w * 0.70),  
          y: round(icon.y + icon.h * 0.18),  
          w: round(icon.w * 0.16),  
          h: round(icon.w * 0.16)  
        },  
        style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },  
        source: source("image-sun")  
      }  
    ];  
  }  
    
  function semanticCycleWandIconDetails(base, node, icon, source) {  
    const spark = (name, x, y, size) => ({  
      id: `${base}-semantic-cycle-icon-${node.key}-${name}`,  
      type: "freeform",  
      box: { x: round(x), y: round(y), w: round(size), h: round(size) },  
      points: [{ x: 0.5, y: 0 }, { x: 0.62, y: 0.38 }, { x: 1, y: 0.5 }, { x: 0.62, y: 0.62 }, { x: 0.5, y: 1 }, { x: 0.38, y: 0.62 }, { x: 0, y: 0.5 }, { x: 0.38, y: 0.38 }],  
      style: { fill: "#F4FFF8", stroke: "#F4FFF8", strokeWidthPt: 0 },  
      source: source(name)  
    });  
    return [  
      spark("wand-spark-large", icon.x + icon.w * 0.72, icon.y + icon.h * 0.10, icon.w * 0.18),  
      spark("wand-spark-small", icon.x + icon.w * 0.88, icon.y + icon.h * 0.28, icon.w * 0.12),  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-code-left`,  
        type: "freeform",  
        box: {  
          x: round(icon.x + icon.w * 0.44),  
          y: round(icon.y + icon.h * 0.62),  
          w: round(icon.w * 0.16),  
          h: round(icon.h * 0.22)  
        },  
        points: [{ x: 1, y: 0 }, { x: 0, y: 0.5 }, { x: 1, y: 1 }],  
        style: { fill: "none", stroke: "#F4FFF8", strokeWidthPt: 1.5, lineCap: "round" },  
        source: source("code-left")  
      },  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-code-right`,  
        type: "freeform",  
        box: {  
          x: round(icon.x + icon.w * 0.72),  
          y: round(icon.y + icon.h * 0.62),  
          w: round(icon.w * 0.16),  
          h: round(icon.h * 0.22)  
        },  
        points: [{ x: 0, y: 0 }, { x: 1, y: 0.5 }, { x: 0, y: 1 }],  
        style: { fill: "none", stroke: "#F4FFF8", strokeWidthPt: 1.5, lineCap: "round" },  
        source: source("code-right")  
      }  
    ];  
  }  
    
  function semanticCycleWindowIconDetails(base, node, icon, source) {  
    return [  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-browser-bar`,  
        type: "rect",  
        box: {  
          x: round(icon.x + icon.w * 0.10),  
          y: round(icon.y + icon.h * 0.18),  
          w: round(icon.w * 0.80),  
          h: round(icon.h * 0.18)  
        },  
        style: { fill: "#7BB0D8", stroke: "#7BB0D8", strokeWidthPt: 0 },  
        source: source("window-bar")  
      },  
      {  
        id: `${base}-semantic-cycle-icon-${node.key}-cursor`,  
        type: "freeform",  
        box: {  
          x: round(icon.x + icon.w * 0.54),  
          y: round(icon.y + icon.h * 0.52),  
          w: round(icon.w * 0.22),  
          h: round(icon.h * 0.30)  
        },  
        points: [{ x: 0, y: 0 }, { x: 1, y: 0.55 }, { x: 0.55, y: 0.65 }, { x: 0.78, y: 1 }, { x: 0.50, y: 1 }, { x: 0.30, y: 0.70 }],  
        style: { fill: "#1EAD4C", stroke: "#1EAD4C", strokeWidthPt: 0 },  
        source: source("window-cursor")  
      }  
    ];  
  }  
    
  function shouldDropSemanticCycleResidual(shapes = [], nativeTextBoxes = [], minimumUnitCrops = []) {  
    const count = (detector) => (shapes || []).filter((shape) =>  
      (shape?.source?.detector || shape?.detector) === detector  
    ).length;  
    const roles = new Set((nativeTextBoxes || []).map((textBox) => textBox?.source?.role || ""));  
    const hasNodeVisuals = count("semantic-cycle-native-node") >= 4  
      || (minimumUnitCrops || []).filter((crop) => crop?.source?.detector === "semantic-cycle-icon-minimum-unit-crop").length >= 4;  
    return count("semantic-cycle-native-ring") >= 2  
      && hasNodeVisuals  
      && count("semantic-cycle-native-arrow") >= 4  
      && roles.has("loop-node-label")  
      && roles.has("side-heading")  
      && nativeTextBoxes.length >= 8;  
  }  
    
  function semanticCycleShapeSource(image, detector, extra = {}) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "saturated-multi-flow-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      ...extra  
    };  
  }

  return {
    createSaturatedDiagramTextShapes,
    saturatedDiagramNativeTextBoxes,
    saturatedDiagramTextBox,
    saturatedDiagramTextColor,
    maybeEraseSaturatedDiagramText,
    createSemanticCycleDiagramShapes,
    createSemanticCycleMinimumUnitCrop,
    createSemanticCycleIconMinimumUnitCrops,
    isHighFidelityPrdCycle,
    shouldObjectifySemanticCycleDiagram,
    inferSemanticCycleDiagramShapes,
    shouldDropSemanticCycleResidual,
    semanticCycleShapeSource
  };
}

module.exports = {
  createSemanticCycleDiagramsFactory
};
