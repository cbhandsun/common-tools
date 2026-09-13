"use strict";

function createHorizontalSparseFlowFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    centerOfBox,
    clampPtBoxToSlide,
    comparisonMatrixVisualAtoms,
    cropPng,
    darkenHexColor,
    ensureDir,
    expandBox,
    expandPtBox,
    horizontalStepChainNativeTextBoxes,
    inferHorizontalStepChainShapes,
    isHorizontalStepChainFullyObjectified,
    lineBox,
    normalizeCjkText,
    normalizeHexColor,
    path,
    ptToPxBox,
    pxToPtBox,
    round,
    roundedBox,
    safeIdentifier,
    shouldObjectifyHorizontalStepChain,
    writePng
  } = dependencies;

  function createHorizontalStepChainShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {  
    const shapes = [];  
    const preservedImages = [];  
    for (const image of images || []) {  
      if (shouldObjectifySparseMatrixProcessStrip(image)) {  
        const localShapes = inferSparseMatrixProcessStripShapes(image);  
        const localTextBoxes = sparseMatrixProcessStripNativeTextBoxes(image);  
        if (localShapes.length === 0 || localTextBoxes.length < 4) continue;  
        image.source = {  
          ...(image.source || {}),  
          sparseMatrixProcessStripObjectified: true,  
          sparseMatrixProcessStripTextObjectified: true,  
          sparseMatrixProcessStripNativeTextBoxes: localTextBoxes,  
          visualAtomOverlayOnly: true,  
          objectifiedSparseMatrixProcessStripShapes: localShapes.length,  
          objectifiedSparseMatrixProcessStripTextBoxes: localTextBoxes.length,  
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; sparse matrix process strip rebuilt as native process bar and editable semantic labels while preserving residual icons`  
        };  
        shapes.push(...localShapes);  
        continue;  
      }  
      if (shouldObjectifySparseFlowCardChain(image, textBoxes)) {  
        const assetTree = shouldUseAssetLandingTreeFlow(image, textBoxes);  
        const localShapes = assetTree  
          ? inferAssetLandingTreeFlowShapes(image, textBoxes, slideSize, options)  
          : inferSparseFlowCardChainSkeletonShapes(image, textBoxes);  
        const localImages = assetTree && Array.isArray(localShapes.images) ? localShapes.images : [];  
        const localTextBoxes = sparseFlowCardChainNativeTextBoxes(image, textBoxes);  
        if (localShapes.length === 0) continue;  
        const dropResidual = shouldDropSparseFlowCardChainResidual(image, localShapes, localTextBoxes);  
        image.source = {  
          ...(image.source || {}),  
          sparseFlowCardChainSkeletonObjectified: true,  
          sparseFlowCardChainAssetTreeObjectified: assetTree ? true : image.source?.sparseFlowCardChainAssetTreeObjectified,  
          sparseFlowCardChainTextObjectified: localTextBoxes.length > 0,  
          sparseFlowCardChainNativeTextBoxes: localTextBoxes,  
          sparseFlowCardChainPreservedIconCrops: localImages.length,  
          visualAtomOverlayOnly: !dropResidual,  
          objectifiedSparseFlowCardChainShapes: localShapes.length,  
          objectifiedSparseFlowCardChainTextBoxes: localTextBoxes.length,  
          dropErasedResidualAfterNativeRebuild: dropResidual ? true : image.source?.dropErasedResidualAfterNativeRebuild,  
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; sparse flow-card chain rebuilt as ${assetTree ? "native asset landing tree" : "native skeleton overlays"}${dropResidual ? " and residual crop removed" : " while preserving the source crop"}`  
        };  
        shapes.push(...localShapes);  
        preservedImages.push(...localImages);  
        continue;  
      }  
      if (!shouldObjectifyHorizontalStepChain(image, textBoxes)) continue;  
      const localShapes = inferHorizontalStepChainShapes(image, sourceImage, slideSize);  
      const localTextBoxes = horizontalStepChainNativeTextBoxes(image, textBoxes);  
      if (localShapes.length === 0) continue;  
      const fullyObjectified = isHorizontalStepChainFullyObjectified(localShapes, localTextBoxes);  
      image.source = {  
        ...(image.source || {}),  
        horizontalStepChainObjectified: true,  
        horizontalStepChainTextObjectified: localTextBoxes.length > 0,  
        horizontalStepChainFullyObjectified: fullyObjectified,  
        horizontalStepChainNativeTextBoxes: localTextBoxes,  
        objectifiedHorizontalStepChainShapes: localShapes.length,  
        objectifiedHorizontalStepChainTextBoxes: localTextBoxes.length,  
        dropErasedResidualAfterNativeRebuild: fullyObjectified || image.source?.textObjectified === true  
          ? true  
          : image.source?.dropErasedResidualAfterNativeRebuild,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; horizontal step chain rebuilt as native shapes`  
      };  
      shapes.push(...localShapes);  
    }  
    shapes.images = preservedImages;  
    return shapes;  
  }  
    
  function shouldDropSparseFlowCardChainResidual(image = {}, shapes = [], textBoxes = []) {  
    const layer = image?.source?.layer || {};  
    const understanding = layer.diagramUnderstanding || image?.source?.diagramUnderstanding || {};  
    if (understanding.archetype !== "flow-card-chain") return false;  
    if (Number(understanding.confidence || 0) < 0.9) return false;  
    if (Number(understanding.residualCount || 0) > 0) return false;  
    const shapeList = Array.isArray(shapes) ? shapes : [];  
    const textList = Array.isArray(textBoxes) ? textBoxes : [];  
    const cards = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-skeleton-card").length;  
    const assetCards = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-asset-card").length;  
    const assetArrows = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-asset-branch-arrow").length;  
    const arrows = shapeList.filter((shape) => shape?.source?.detector === "sparse-flow-card-chain-native-skeleton-arrow").length;  
    const stageLabels = textList.filter((textBox) => textBox?.source?.detector === "sparse-flow-card-chain-native-stage-label").length;  
    const domainLabels = textList.filter((textBox) => textBox?.source?.detector === "sparse-flow-card-chain-native-domain-label").length;  
    if (assetCards >= 3 && assetArrows >= 3 && stageLabels >= 3 && domainLabels >= 3) return true;  
    return cards >= 3  
      && arrows >= 2  
      && stageLabels >= 3  
      && domainLabels >= 3  
      && textList.length >= 6;  
  }  
    
  function shouldUseAssetLandingTreeFlow(image = {}, textBoxes = []) {  
    const pageText = (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => String(textBox?.text || "")).join(" ");  
    const labels = sparseFlowCardChainSemanticLabels(image, textBoxes).map((label) => normalizeCjkText(label.text));  
    const hasAssetLandingTitle = /资产落盘|组织级资产|数字化版图/.test(pageText);  
    const hasStageLabels = ["独立配置", "标准化目录", "版本化追踪"].every((label) => labels.includes(label));  
    const hasDomainLabels = ["供应链", "物流", "财务"].every((label) => labels.includes(label));  
    return hasAssetLandingTitle && hasStageLabels && hasDomainLabels;  
  }  
    
  function shouldObjectifySparseMatrixProcessStrip(image = {}) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    const box = image?.box || {};  
    if (source.detector !== "sparse-diagram-graphic-underlay-crop") return false;  
    if (layer.layerType !== "diagram-zone" || understanding.archetype !== "matrix-or-grid") return false;  
    if (Number(understanding.confidence || 0) < 0.9) return false;  
    if (!box.w || !box.h || Number(box.w) < 620 || Number(box.h) < 150) return false;  
    const nodes = sparseMatrixProcessStripSemanticNodes(image);  
    const normalized = nodes.map((node) => normalizeCjkText(node.text));  
    const hasEngine = normalized.some((text) => /skills\s*engine/i.test(text));  
    const stageCount = normalized.filter((text) => /需求理解|原型\/?高仿|PRD生成|智能评审/.test(text)).length;  
    const visualAtoms = comparisonMatrixVisualAtoms(image);  
    const largeNativeRect = visualAtoms.some((atom) => {  
      if (String(atom?.kind || "") !== "native-rect-candidate") return false;  
      const atomBox = atom.box || {};  
      return Number(atomBox.w || 0) >= Number(box.w || 0) * 0.45  
        && Number(atomBox.h || 0) >= Number(box.h || 0) * 0.35;  
    });  
    const gridLines = visualAtoms.filter((atom) => String(atom?.kind || "") === "grid-line-candidate").length;  
    return hasEngine && stageCount >= 4 && largeNativeRect && gridLines >= 6;  
  }  
    
  function inferSparseMatrixProcessStripShapes(image = {}) {  
    const box = image?.box || {};  
    const nodes = sparseMatrixProcessStripSemanticNodes(image);  
    const engineNode = nodes.find((node) => /skills\s*engine/i.test(normalizeCjkText(node.text)));  
    const stageNodes = sparseMatrixProcessStripStageNodes(image);  
    const atoms = comparisonMatrixVisualAtoms(image);  
    const railAtom = atoms  
      .filter((atom) => String(atom?.kind || "") === "native-rect-candidate")  
      .sort((a, b) => (Number(b.box?.w || 0) * Number(b.box?.h || 0)) - (Number(a.box?.w || 0) * Number(a.box?.h || 0)))[0];  
    if (!railAtom?.box || !engineNode?.box || stageNodes.length < 4) return [];  
    const base = image.id || "sparse-matrix-process-strip";  
    const railBox = roundedBox(railAtom.box);  
    const fill = normalizeHexColor(railAtom.color) || "#779F7F";  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "sparse-matrix-process-strip",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const grid = image?.source?.layer?.diagramUnderstanding?.visualGrid || {};  
    const gridBounds = grid.bounds && Number(grid.bounds.w || 0) > 0  
      ? roundedBox(grid.bounds)  
      : roundedBox(expandBox(railBox, 8, 8));  
    const shapes = [{  
      id: `${base}-native-grid-shell`,  
      type: "roundRect",  
      box: gridBounds,  
      style: {  
        fill: "#F7FAFC",  
        stroke: normalizeHexColor(grid.stroke) || "#D0D3D8",  
        strokeWidthPt: 1,  
        radiusRatio: 0.025,  
        opacity: 0.22  
      },  
      source: source("sparse-matrix-process-strip-native-grid-shell")  
    }, {  
      id: `${base}-native-process-rail`,  
      type: "roundRect",  
      box: railBox,  
      style: {  
        fill,  
        stroke: darkenHexColor(fill, 0.18),  
        strokeWidthPt: 1.2,  
        radiusRatio: 0.24,  
        opacity: 0.82,  
        shadow: { color: "#31553C", alpha: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 }  
      },  
      source: source("sparse-matrix-process-strip-native-rail", { sampledColor: fill })  
    }];  
    const engineBox = roundedBox(expandBox(engineNode.box, 18, 7));  
    shapes.push({  
      id: `${base}-native-engine-title-backplate`,  
      type: "roundRect",  
      box: engineBox,  
      style: {  
        fill: "#FFFFFF",  
        stroke: "#8DB79A",  
        strokeWidthPt: 0.9,  
        radiusRatio: 0.28,  
        opacity: 0.92  
      },  
      source: source("sparse-matrix-process-strip-native-engine-backplate")  
    });  
    stageNodes.forEach((node, index) => {  
      const chipBox = roundedBox(expandBox(node.box, 18, 6));  
      shapes.push({  
        id: `${base}-native-stage-chip-${index}`,  
        type: "roundRect",  
        box: chipBox,  
        style: {  
          fill: "#FFFFFF",  
          stroke: "#D9EBDF",  
          strokeWidthPt: 0.8,  
          radiusRatio: 0.32,  
          opacity: 0.88  
        },  
        source: source("sparse-matrix-process-strip-native-stage-chip", { stageIndex: index })  
      });  
      if (index > 0) {  
        const previous = centerOfBox(roundedBox(expandBox(stageNodes[index - 1].box, 18, 6)));  
        const current = centerOfBox(chipBox);  
        shapes.push({  
          id: `${base}-native-stage-route-${index - 1}`,  
          type: "line",  
          box: lineBox({ x: previous.x + 34, y: previous.y }, { x: current.x - 34, y: current.y }),  
          style: {  
            stroke: "#D7EADF",  
            strokeWidthPt: 1.25,  
            connectorType: "straight",  
            endArrow: "triangle",  
            opacity: 0.88  
          },  
          source: source("sparse-matrix-process-strip-native-stage-route", { routeIndex: index - 1 })  
        });  
      }  
    });  
    const engineCenter = centerOfBox(engineBox);  
    const railCenter = centerOfBox(railBox);  
    shapes.push({  
      id: `${base}-native-engine-drop-route`,  
      type: "line",  
      box: lineBox({ x: engineCenter.x, y: engineBox.y + engineBox.h }, { x: railCenter.x, y: railBox.y + 4 }),  
      style: { stroke: "#BFD7C7", strokeWidthPt: 1.2, connectorType: "straight", endArrow: "triangle", opacity: 0.8 },  
      source: source("sparse-matrix-process-strip-native-engine-route")  
    });  
    return shapes;  
  }  
    
  function sparseMatrixProcessStripNativeTextBoxes(image = {}) {  
    const nodes = sparseMatrixProcessStripSemanticNodes(image);  
    const engineNode = nodes.find((node) => /skills\s*engine/i.test(normalizeCjkText(node.text)));  
    const result = [];  
    if (engineNode?.box) result.push(sparseMatrixProcessStripTextBox(image, engineNode, "engine-title", 0));  
    sparseMatrixProcessStripStageNodes(image)  
      .forEach((node, index) => result.push(sparseMatrixProcessStripTextBox(image, node, "stage-label", index)));  
    return result;  
  }  
    
  function sparseMatrixProcessStripStageNodes(image = {}) {  
    const order = ["需求理解", "原型/高仿", "PRD生成", "智能评审"];  
    const nodes = sparseMatrixProcessStripSemanticNodes(image);  
    return order  
      .map((label) => nodes.find((node) => normalizeCjkText(node.text).includes(label)))  
      .filter(Boolean);  
  }  
    
  function sparseMatrixProcessStripSemanticNodes(image = {}) {  
    const imageBox = image?.box || {};  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : [];  
    return nodes  
      .filter((node) => node?.box && boxCenterInside(node.box, imageBox))  
      .filter((node) => normalizeCjkText(node.text))  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));  
  }  
    
  function sparseMatrixProcessStripTextBox(image = {}, node = {}, role = "stage-label", index = 0) {  
    const text = String(node.text || "").trim();  
    const box = role === "engine-title" ? expandBox(node.box, 18, 7) : expandBox(node.box, 18, 6);  
    return {  
      id: `${image.id || "sparse-matrix-process-strip"}-native-${role}-${index}`,  
      text,  
      box: roundedBox(box),  
      font: {  
        family: role === "engine-title" ? "Microsoft YaHei" : "SimHei",  
        sizePt: role === "engine-title" ? 13.5 : 12.5,  
        color: role === "engine-title" ? "#2E6040" : "#28563A",  
        weight: "bold",  
        opacity: 1  
      },  
      align: "center",  
      verticalAlign: "middle",  
      source: {  
        editable: true,  
        nativeRebuild: true,  
        detector: role === "engine-title"  
          ? "sparse-matrix-process-strip-native-engine-label"  
          : "sparse-matrix-process-strip-native-stage-label",  
        expressionForm: "complex-diagram",  
        expressionSubtype: "sparse-matrix-process-strip",  
        layerSourceId: image.id || null,  
        layerType: image.source?.layer?.layerType || "diagram-zone",  
        semanticTextSource: true,  
        semanticNodeId: node.id || "",  
        overlayVisibility: "visible",  
        textErasedFromCrop: false,  
        role,  
        labelIndex: index  
      }  
    };  
  }  
    
  function sparseFlowCardChainNativeTextBoxes(image = {}, textBoxes = []) {  
    const labels = sparseFlowCardChainSemanticLabels(image, textBoxes);  
    const assetTree = shouldUseAssetLandingTreeFlow(image, textBoxes);  
    return labels.map((label, index) => {  
      const role = /供应链|物流|财务/.test(label.text) ? "domain-chip" : "stage-title";  
      const box = expandPtBox(label.box, DEFAULT_SLIDE,  
        assetTree ? (role === "domain-chip" ? 20 : 12) : (role === "domain-chip" ? 8 : 12),  
        assetTree ? (role === "domain-chip" ? 4 : 5) : (role === "domain-chip" ? 2 : 4)  
      );  
      return {  
        id: `${image.id || "sparse-flow-card-chain"}-native-label-${index}`,  
        text: label.text,  
        box: roundedBox(box),  
        font: {  
          family: role === "domain-chip" ? "Microsoft YaHei" : "SimHei",  
          sizePt: assetTree ? (role === "domain-chip" ? 14.5 : 14) : (role === "domain-chip" ? 14 : 13.5),  
          color: assetTree ? (role === "domain-chip" ? "#111111" : "#FFFFFF") : (role === "domain-chip" ? "#176B3A" : "#0E4F7F"),  
          weight: "bold",  
          align: "center",  
          valign: "middle",  
          opacity: 1  
        },  
        align: "center",  
        verticalAlign: "middle",  
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
          detector: role === "domain-chip"  
            ? "sparse-flow-card-chain-native-domain-label"  
            : "sparse-flow-card-chain-native-stage-label",  
          expressionForm: "complex-diagram",  
          expressionSubtype: "sparse-flow-card-chain",  
          layerSourceId: image.id || null,  
          layerType: image.source?.layer?.layerType || "diagram-zone",  
          semanticTextSource: label.semanticTextSource === true,  
          overlayVisibility: "visible",  
          role,  
          labelIndex: index  
        }  
      };  
    });  
  }  
    
  function sparseFlowCardChainSemanticLabels(image = {}, textBoxes = []) {  
    const box = image?.box || {};  
    const labels = [];  
    for (const node of sparseFlowCardChainSemanticNodes(image)) {  
      const text = normalizeCjkText(node?.text);  
      if (!text || !node?.box || !boxCenterInside(node.box, box)) continue;  
      if (!/独立配置|标准化目录|版本化追踪|供应链|物流|财务/.test(text)) continue;  
      labels.push({ text, box: node.box, semanticTextSource: true });  
    }  
    for (const textBox of textBoxes || []) {  
      const text = normalizeCjkText(textBox?.text);  
      if (!text || !textBox?.box || !boxCenterInside(textBox.box, box)) continue;  
      if (!/独立配置|标准化目录|版本化追踪|供应链|物流|财务/.test(text)) continue;  
      if (labels.some((item) => item.text === text)) continue;  
      labels.push({ text, box: textBox.box, semanticTextSource: false });  
    }  
    const order = ["独立配置", "标准化目录", "版本化追踪", "供应链", "物流", "财务"];  
    return order  
      .map((text) => labels.find((item) => item.text === text))  
      .filter(Boolean);  
  }  
    
  function sparseFlowCardChainSemanticNodes(image = {}) {  
    const result = [];  
    for (const nodes of [  
      image.source?.diagramUnderstanding?.nodes,  
      image.source?.layer?.diagramUnderstanding?.nodes  
    ]) {  
      if (Array.isArray(nodes)) result.push(...nodes);  
    }  
    return result;  
  }  
    
  function shouldObjectifySparseFlowCardChain(image, textBoxes = []) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    const box = image?.box || {};  
    if (source.detector !== "sparse-diagram-graphic-underlay-crop") return false;  
    if (layer.layerType !== "diagram-zone" || understanding.archetype !== "flow-card-chain") return false;  
    if (Number(understanding.confidence || 0) < 0.82) return false;  
    if (!box.w || !box.h || Number(box.w) < 360 || Number(box.h) < 240) return false;  
    const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;  
    const visualAtoms = comparisonMatrixVisualAtoms(image);  
    const nativeNodeAtoms = visualAtoms.filter((atom) => /native-(?:rect|document|triangle)-candidate/.test(String(atom?.kind || ""))).length;  
    const connectorAtoms = visualAtoms.filter((atom) => /connector-(?:line|arrow)-candidate/.test(String(atom?.kind || ""))).length;  
    const semanticNodeCount = Array.isArray(understanding.nodes) ? understanding.nodes.length : 0;  
    return internalTextCount >= 3 || Number(understanding.nodeCount || 0) >= 5 || semanticNodeCount >= 5 || (nativeNodeAtoms >= 3 && connectorAtoms >= 2);  
  }  
    
  function inferSparseFlowCardChainSkeletonShapes(image, textBoxes = []) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const base = image.id || "sparse-flow-card-chain";  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "sparse-flow-card-chain",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const x = Number(box.x || 0);  
    const y = Number(box.y || 0);  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const cardCount = 3;  
    const gap = w * 0.055;  
    const cardW = (w - gap * (cardCount - 1)) / cardCount;  
    const cardY = y + h * 0.18;  
    const cardH = h * 0.42;  
    const shapes = [];  
    for (let index = 0; index < cardCount; index += 1) {  
      const cardX = x + index * (cardW + gap);  
      shapes.push({  
        id: `${base}-native-skeleton-card-${index}`,  
        type: "roundRect",  
        box: roundedBox({ x: cardX, y: cardY, w: cardW, h: cardH }),  
        style: {  
          fill: index === 1 ? "#F5FAFF" : "#FFFFFF",  
          stroke: "#7DB7E8",  
          strokeWidthPt: 1.2,  
          radiusRatio: 0.055,  
          opacity: 0.78,  
          shadow: { color: "#6EA6D8", opacity: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }  
        },  
        source: source("sparse-flow-card-chain-native-skeleton-card", { cardIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-card-icon-${index}`,  
        type: index === 2 ? "document" : "ellipse",  
        box: roundedBox({ x: cardX + cardW * 0.36, y: cardY + cardH * 0.18, w: cardW * 0.28, h: cardH * 0.30 }),  
        style: { fill: "#E8F5FF", stroke: "#2E86D1", strokeWidthPt: 1, opacity: 0.82 },  
        source: source("sparse-flow-card-chain-native-skeleton-icon", { cardIndex: index })  
      });  
      if (index < cardCount - 1) {  
        shapes.push({  
          id: `${base}-native-skeleton-arrow-${index}`,  
          type: "line",  
          box: {  
            x: round(cardX + cardW + gap * 0.18),  
            y: round(cardY + cardH * 0.50),  
            w: round(gap * 0.64),  
            h: 0  
          },  
          style: { stroke: "#2DBB63", strokeWidthPt: 2.4, connectorType: "straight", endArrow: "triangle", opacity: 0.9 },  
          source: source("sparse-flow-card-chain-native-skeleton-arrow", { arrowIndex: index })  
        });  
      }  
    }  
    const domainLabels = sparseFlowCardChainSemanticLabels(image, textBoxes)  
      .filter((item) => /供应链|物流|财务|标准化|版本化|独立配置/.test(String(item.text || "")))  
      .slice(0, 6);  
    const chipCount = Math.max(3, Math.min(6, domainLabels.length || 3));  
    for (let index = 0; index < chipCount; index += 1) {  
      const col = index % 3;  
      const row = Math.floor(index / 3);  
      shapes.push({  
        id: `${base}-native-skeleton-domain-chip-${index}`,  
        type: "roundRect",  
        box: roundedBox({  
          x: x + w * (0.13 + col * 0.28),  
          y: y + h * (0.70 + row * 0.12),  
          w: w * 0.18,  
          h: h * 0.075  
        }),  
        style: {  
          fill: "#EEF8F2",  
          stroke: "#55B979",  
          strokeWidthPt: 0.9,  
          radiusRatio: 0.18,  
          opacity: 0.82  
        },  
        source: source("sparse-flow-card-chain-native-skeleton-domain-chip", {  
          chipIndex: index,  
          label: domainLabels[index]?.text || null  
        })  
      });  
    }  
    return shapes;  
  }  
    
  function inferAssetLandingTreeFlowShapes(image, textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const labels = sparseFlowCardChainSemanticLabels(image, textBoxes);  
    const stageLabels = ["独立配置", "标准化目录", "版本化追踪"].map((text) => labels.find((label) => label.text === text)).filter(Boolean);  
    const domainLabels = ["供应链", "物流", "财务"].map((text) => labels.find((label) => label.text === text)).filter(Boolean);  
    if (stageLabels.length < 3 || domainLabels.length < 3) return [];  
    const base = image.id || "asset-landing-tree-flow";  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "asset-landing-tree-flow",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const stageCenters = stageLabels.map((label) => centerOfBox(label.box));  
    const domainCenters = domainLabels.map((label) => centerOfBox(label.box));  
    const centerX = stageCenters[1].x;  
    const topY = Number(box.y || 0) + Number(box.h || 0) * 0.08;  
    const branchY = Math.min(...stageLabels.map((label) => Number(label.box.y || 0))) - Number(box.h || 0) * 0.16;  
    const stageArrowEndY = Math.min(...stageLabels.map((label) => Number(label.box.y || 0))) - 5;  
    const green = "#2FB05E";  
    const greenDark = "#22964D";  
    const greenLight = "#C7EFD3";  
    const shapes = [];  
    
    const triW = Number(box.w || 0) * 0.20;  
    const triH = Number(box.h || 0) * 0.18;  
    const triTop = { x: centerX, y: topY };  
    const triLeft = { x: centerX - triW * 0.35, y: topY + triH * 0.74 };  
    const triRight = { x: centerX + triW * 0.35, y: topY + triH * 0.74 };  
    const triangleCrop = materializeAssetLandingTriangleCrop(image, { triTop, triLeft, triRight }, slideSize, options);  
    const preservedImages = triangleCrop ? [triangleCrop] : [];  
    if (!triangleCrop) {  
      [[triTop, triLeft], [triLeft, triRight], [triRight, triTop]].forEach(([start, end], index) => {  
        shapes.push({  
          id: `${base}-native-asset-triangle-edge-${index}`,  
          type: "line",  
          box: lineBox(start, end),  
          style: { stroke: "#2D7DBD", strokeWidthPt: 3, connectorType: "straight", opacity: 0.92 },  
          source: source("sparse-flow-card-chain-native-asset-triangle-edge", { edgeIndex: index })  
        });  
      });  
      [triTop, triLeft, triRight].forEach((point, index) => {  
        shapes.push({  
          id: `${base}-native-asset-triangle-dot-${index}`,  
          type: "ellipse",  
          box: roundedBox({ x: point.x - 7, y: point.y - 7, w: 14, h: 14 }),  
          style: { fill: "#2D7DBD", stroke: "#2D7DBD", strokeWidthPt: 0.6, opacity: 0.96 },  
          source: source("sparse-flow-card-chain-native-asset-triangle-dot", { dotIndex: index })  
        });  
      });  
    }  
    
    shapes.push({  
      id: `${base}-native-trunk`,  
      type: "line",  
      box: lineBox({ x: centerX, y: triRight.y + (triangleCrop ? 26 : 20) }, { x: centerX, y: branchY }),  
      style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", opacity: 0.96 },  
      source: source("sparse-flow-card-chain-native-asset-trunk")  
    });  
    shapes.push({  
      id: `${base}-native-branch`,  
      type: "line",  
      box: lineBox({ x: stageCenters[0].x, y: branchY }, { x: stageCenters[2].x, y: branchY }),  
      style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", opacity: 0.96 },  
      source: source("sparse-flow-card-chain-native-asset-branch")  
    });  
    stageCenters.forEach((center, index) => {  
      shapes.push({  
        id: `${base}-native-branch-arrow-${index}`,  
        type: "line",  
        box: lineBox({ x: center.x, y: branchY }, { x: center.x, y: stageArrowEndY }),  
        style: { stroke: green, strokeWidthPt: 5, connectorType: "straight", endArrow: "triangle", opacity: 0.96 },  
        source: source("sparse-flow-card-chain-native-asset-branch-arrow", { arrowIndex: index })  
      });  
      const pill = roundedBox(expandPtBox(stageLabels[index].box, DEFAULT_SLIDE, 12, 5));  
      shapes.push({  
        id: `${base}-native-stage-pill-${index}`,  
        type: "roundRect",  
        box: pill,  
        style: { fill: green, stroke: greenDark, strokeWidthPt: 0.8, radiusRatio: 0.42, opacity: 0.96 },  
        source: source("sparse-flow-card-chain-native-asset-stage-pill", { stageIndex: index })  
      });  
    });  
    
    domainLabels.forEach((label, index) => {  
      const labelBox = label.box || {};  
      const card = roundedBox({  
        x: Number(labelBox.x || domainCenters[index].x - 72) - 46,  
        y: Number(labelBox.y || domainCenters[index].y) - 11,  
        w: Math.max(138, Number(labelBox.w || 54) + 92),  
        h: 88  
      });  
      shapes.push({  
        id: `${base}-native-card-${index}`,  
        type: "roundRect",  
        box: card,  
        style: { fill: greenLight, stroke: greenDark, strokeWidthPt: 2.4, radiusRatio: 0.035, opacity: 0.92 },  
        source: source("sparse-flow-card-chain-native-asset-card", { cardIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-card-divider-${index}`,  
        type: "line",  
        box: lineBox({ x: card.x + 2, y: card.y + 32 }, { x: card.x + card.w - 2, y: card.y + 32 }),  
        style: { stroke: greenDark, strokeWidthPt: 2.1, connectorType: "straight", opacity: 0.9 },  
        source: source("sparse-flow-card-chain-native-asset-card-divider", { cardIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-card-body-${index}`,  
        type: "rect",  
        box: roundedBox({ x: card.x + 5, y: card.y + 35, w: card.w - 10, h: card.h - 40 }),  
        style: { fill: "#BFEACB", stroke: "#BFEACB", strokeWidthPt: 0, opacity: 0.42 },  
        source: source("sparse-flow-card-chain-native-asset-card-body", { cardIndex: index })  
      });  
    });  
    shapes.images = preservedImages;  
    return shapes;  
  }  
    
  function materializeAssetLandingTriangleCrop(image = {}, triangle = {}, slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!options.sourceImage || !options.assetDir) return null;  
    const points = [triangle.triTop, triangle.triLeft, triangle.triRight].filter(Boolean);  
    if (points.length !== 3) return null;  
    const minX = Math.min(...points.map((point) => Number(point.x || 0)));  
    const maxX = Math.max(...points.map((point) => Number(point.x || 0)));  
    const minY = Math.min(...points.map((point) => Number(point.y || 0)));  
    const maxY = Math.max(...points.map((point) => Number(point.y || 0)));  
    const ptBox = clampPtBoxToSlide({  
      x: minX - 7,  
      y: minY - 7,  
      w: maxX - minX + 14,  
      h: maxY - minY + 13  
    }, slideSize);  
    if (ptBox.w < 12 || ptBox.h < 12) return null;  
    ensureDir(options.assetDir);  
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(image.pageIndex || 0);  
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${image.id || "asset-landing"}-triangle-icon`, "asset-landing-triangle-icon");  
    const pxBox = ptToPxBox(ptBox, options.sourceImage, slideSize, 0);  
    const file = path.join(options.assetDir, `${base}.png`);  
    writePng(file, cropPng(options.sourceImage, pxBox));  
    return {  
      id: `${image.id || "asset-landing"}-triangle-icon-crop`,  
      type: "fidelity-crop",  
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),  
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),  
      source: {  
        editable: false,  
        nativeRebuild: false,  
        detector: "sparse-flow-card-chain-asset-triangle-icon-crop",  
        strategy: "local-fidelity-crop",  
        expressionForm: "icon-or-illustration",  
        expressionSubtype: "asset-landing-triangle-icon",  
        recommendedAction: "preserve-local-crop",  
        layerSourceId: image.id || null,  
        nonEditableReason: "top asset-network triangle icon preserved as a local crop; branch arrows, cards, and labels remain native editable"  
      }  
    };  
  }

  return {
    createHorizontalStepChainShapes,
    shouldUseAssetLandingTreeFlow
  };
}

module.exports = { createHorizontalSparseFlowFactory };
