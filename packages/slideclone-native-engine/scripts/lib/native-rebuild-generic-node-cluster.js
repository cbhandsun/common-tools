"use strict";

function createGenericNodeClusterFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    centerOfBox,
    comparisonMatrixVisualAtoms,
    darkenHexColor,
    detectColorComponents,
    detectHorizontalColorBands,
    expandPtBox,
    lineBox,
    normalizeGenericNodeDiagramText,
    normalizeHexColor,
    pixelBoxToSlide,
    round,
    roundedBox,
    safeComponentToken
  } = dependencies;

  function createGenericNodeDiagramSkeletonShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyGenericNodeDiagramSkeleton(image, textBoxes)) continue;  
      const localShapes = inferGenericNodeDiagramSkeletonShapes(image, textBoxes);  
      const localTextBoxes = genericNodeDiagramSemanticTextBoxes(image);  
      if (localShapes.length === 0 && localTextBoxes.length === 0) continue;  
      image.source = {  
        ...(image.source || {}),  
        genericNodeDiagramSkeletonObjectified: true,  
        genericNodeDiagramTextObjectified: localTextBoxes.length > 0,  
        genericNodeDiagramNativeTextBoxes: localTextBoxes,  
        visualAtomOverlayOnly: true,  
        objectifiedGenericNodeDiagramSkeletonShapes: localShapes.length,  
        objectifiedGenericNodeDiagramTextBoxes: localTextBoxes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; generic node diagram rebuilt as native hub, node, connector, label-line skeleton overlays, and editable semantic labels while preserving the source crop`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function shouldObjectifyGenericNodeDiagramSkeleton(image, textBoxes = []) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    const box = image?.box || {};  
    if (source.detector !== "foreground-graphic-crop") return false;  
    if (layer.layerType !== "diagram-zone") return false;  
    if (!["generic-node-diagram", "multi-cluster-diagram", "hub-spoke"].includes(String(understanding.archetype || ""))) return false;  
    if (Number(understanding.confidence || 0) < 0.9) return false;  
    if (!box.w || !box.h || Number(box.w) < 260 || Number(box.h) < 220) return false;  
    if (/screenshot|ui|photo/i.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;  
    const visualAtoms = comparisonMatrixVisualAtoms(image);  
    const structuralAtoms = visualAtoms.filter((atom) => /(?:connector|grid-line|native-(?:rect|ellipse|circle))-candidate/.test(String(atom?.kind || ""))).length;  
    const internalTextCount = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).length;  
    const semanticNodeCount = Array.isArray(understanding.nodes) ? understanding.nodes.length : 0;  
    const safeSemanticNodeCount = genericNodeDiagramSemanticNodes(image).length;  
    if (understanding.archetype === "hub-spoke") {  
      return safeSemanticNodeCount >= 3 && (structuralAtoms >= 3 || internalTextCount >= 3);  
    }  
    return Number(understanding.nodeCount || 0) >= 3 || semanticNodeCount >= 3 || structuralAtoms >= 3 || internalTextCount >= 3;  
  }  
    
  function inferGenericNodeDiagramSkeletonShapes(image, textBoxes = []) {  
    if (image?.source?.allowSyntheticGenericNodeSkeleton !== true) return [];  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const understanding = image.source?.layer?.diagramUnderstanding || image.source?.diagramUnderstanding || {};  
    if (understanding.archetype === "multi-cluster-diagram") {  
      return inferMultiClusterDiagramSkeletonShapes(image);  
    }  
    const base = image.id || "generic-node-diagram";  
    const x = Number(box.x || 0);  
    const y = Number(box.y || 0);  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const landscape = w >= h * 1.15;  
    const cardW = Math.min(w * (landscape ? 0.24 : 0.34), 150);  
    const cardH = Math.min(h * (landscape ? 0.24 : 0.20), 74);  
    const hubSize = Math.min(w, h) * 0.22;  
    const hub = {  
      x: x + w * (landscape ? 0.34 : 0.50) - hubSize / 2,  
      y: y + h * 0.50 - hubSize / 2,  
      w: hubSize,  
      h: hubSize  
    };  
    const nodeBoxes = landscape ? [  
      { x: x + w * 0.06, y: y + h * 0.36, w: cardW, h: cardH },  
      { x: x + w * 0.66, y: y + h * 0.18, w: cardW, h: cardH },  
      { x: x + w * 0.66, y: y + h * 0.60, w: cardW, h: cardH }  
    ] : [  
      { x: x + w * 0.50 - cardW / 2, y: y + h * 0.10, w: cardW, h: cardH },  
      { x: x + w * 0.12, y: y + h * 0.66, w: cardW, h: cardH },  
      { x: x + w * 0.88 - cardW, y: y + h * 0.66, w: cardW, h: cardH }  
    ];  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "generic-node-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const shapes = [{  
      id: `${base}-native-skeleton-hub`,  
      type: "ellipse",  
      box: roundedBox(hub),  
      style: {  
        fill: "#F4FAFF",  
        stroke: "#2E86D1",  
        strokeWidthPt: 1.5,  
        opacity: 0.86,  
        shadow: { color: "#4B91C9", alpha: 0.14, blurPt: 3, distancePt: 1, angleDeg: 90 }  
      },  
      source: source("generic-node-diagram-native-skeleton-hub")  
    }];  
    const hubCenter = centerOfBox(hub);  
    nodeBoxes.forEach((nodeBox, index) => {  
      const node = roundedBox(nodeBox);  
      const nodeCenter = centerOfBox(node);  
      shapes.push({  
        id: `${base}-native-skeleton-connector-${index}`,  
        type: "line",  
        box: {  
          x: round(hubCenter.x),  
          y: round(hubCenter.y),  
          w: round(nodeCenter.x - hubCenter.x),  
          h: round(nodeCenter.y - hubCenter.y)  
        },  
        style: { stroke: "#7DB7E8", strokeWidthPt: 1.4, connectorType: "straight", endArrow: "triangle", opacity: 0.78 },  
        source: source("generic-node-diagram-native-skeleton-connector", { nodeIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-node-${index}`,  
        type: "roundRect",  
        box: node,  
        style: {  
          fill: index === 0 ? "#FFFFFF" : "#F7FBFF",  
          stroke: "#73B3E7",  
          strokeWidthPt: 1.1,  
          radiusRatio: 0.08,  
          opacity: 0.82,  
          shadow: { color: "#6EA6D8", alpha: 0.10, blurPt: 2.4, distancePt: 0.8, angleDeg: 90 }  
        },  
        source: source("generic-node-diagram-native-skeleton-node", { nodeIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-node-icon-${index}`,  
        type: "ellipse",  
        box: roundedBox({  
          x: node.x + node.w * 0.08,  
          y: node.y + node.h * 0.28,  
          w: node.h * 0.32,  
          h: node.h * 0.32  
        }),  
        style: { fill: "#E8F6FF", stroke: "#2E86D1", strokeWidthPt: 0.8, opacity: 0.86 },  
        source: source("generic-node-diagram-native-skeleton-node-icon", { nodeIndex: index })  
      });  
      for (let lineIndex = 0; lineIndex < 2; lineIndex += 1) {  
        shapes.push({  
          id: `${base}-native-skeleton-node-label-line-${index}-${lineIndex}`,  
          type: "line",  
          box: {  
            x: round(node.x + node.w * 0.30),  
            y: round(node.y + node.h * (0.38 + lineIndex * 0.20)),  
            w: round(node.w * (lineIndex === 0 ? 0.54 : 0.42)),  
            h: 0  
          },  
          style: { stroke: lineIndex === 0 ? "#3F80BA" : "#A9CBE8", strokeWidthPt: lineIndex === 0 ? 1.2 : 0.9, connectorType: "straight", opacity: 0.74 },  
          source: source("generic-node-diagram-native-skeleton-label-line", { nodeIndex: index, lineIndex })  
        });  
      }  
    });  
    const internal = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)).slice(0, 3);  
    internal.forEach((textBox, index) => {  
      shapes.push({  
        id: `${base}-native-skeleton-text-anchor-${index}`,  
        type: "rect",  
        box: roundedBox({  
          x: Number(textBox.box?.x || x),  
          y: Number(textBox.box?.y || y),  
          w: Math.max(16, Number(textBox.box?.w || 0)),  
          h: Math.max(3, Number(textBox.box?.h || 0) * 0.18)  
        }),  
        style: { fill: "#2E86D1", stroke: "none", strokeWidthPt: 0, opacity: 0.25 },  
        source: source("generic-node-diagram-native-skeleton-text-anchor", { textIndex: index })  
      });  
    });  
    return shapes;  
  }  
    
  function genericNodeDiagramSemanticTextBoxes(image = {}) {  
    const seen = new Set();  
    return genericNodeDiagramSemanticNodes(image)  
      .map((node, index) => {  
        const text = normalizeGenericNodeDiagramText(node.text);  
        const key = text.replace(/\s+/g, "");  
        if (seen.has(key)) return null;  
        seen.add(key);  
        return genericNodeDiagramTextBox(image, node, text, index);  
      })  
      .filter(Boolean)  
      .slice(0, 12);  
  }  
    
  function genericNodeDiagramSemanticNodes(image = {}) {  
    const box = image?.box || {};  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : Array.isArray(image?.source?.diagramUnderstanding?.nodes)  
        ? image.source.diagramUnderstanding.nodes  
        : [];  
    return nodes  
      .filter((node) => node?.box && boxCenterInside(node.box, box))  
      .filter((node) => isSafeGenericNodeDiagramText(node.text));  
  }  
    
  function inferMultiClusterDiagramSkeletonShapes(image = {}) {  
    const box = image?.box || {};  
    const nodes = genericNodeDiagramSemanticNodes(image);  
    if (nodes.length < 3) return [];  
    const base = image.id || "multi-cluster-diagram";  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "multi-cluster-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const shapes = [];  
    const centerX = Number(box.x || 0) + Number(box.w || 0) * 0.55;  
    const leftNodes = nodes.filter((node) => centerOfBox(node.box).x < centerX);  
    const rightNodes = nodes.filter((node) => centerOfBox(node.box).x >= centerX);  
    const nearestRightNode = (node) => {  
      if (rightNodes.length === 0) return null;  
      const from = centerOfBox(node.box);  
      return [...rightNodes].sort((a, b) =>  
        Math.abs(centerOfBox(a.box).y - from.y) - Math.abs(centerOfBox(b.box).y - from.y)  
      )[0];  
    };  
    leftNodes.forEach((node, index) => {  
      const target = nearestRightNode(node);  
      if (!target) return;  
      const from = centerOfBox(node.box);  
      const to = centerOfBox(target.box);  
      shapes.push({  
        id: `${base}-native-cluster-connector-${index}`,  
        type: "line",  
        box: {  
          x: round(from.x),  
          y: round(from.y),  
          w: round(to.x - from.x),  
          h: round(to.y - from.y)  
        },  
        style: { stroke: "#B8C4D0", strokeWidthPt: 1.8, connectorType: "straight", endArrow: "triangle", opacity: 0.76 },  
        source: source("multi-cluster-diagram-native-connector", {  
          fromText: normalizeGenericNodeDiagramText(node.text),  
          toText: normalizeGenericNodeDiagramText(target.text),  
          connectorIndex: index  
        })  
      });  
    });  
    nodes.forEach((node, index) => {  
      const text = normalizeGenericNodeDiagramText(node.text);  
      const kind = String(node.kind || "");  
      const nodeBox = roundedBox(expandPtBox(node.box, DEFAULT_SLIDE, 10, 6));  
      const isRisk = /decision|risk/.test(kind) || /理解偏差|重复返工|风险遗漏/.test(text);  
      const isDocument = /document|screenshot/.test(kind) || /会议记录|业务截图|旧版PRD|口头反馈/.test(text);  
      shapes.push({  
        id: `${base}-native-cluster-node-${index}`,  
        type: isRisk ? "roundRect" : "rect",  
        box: nodeBox,  
        style: {  
          fill: isRisk ? "#FFF2E8" : isDocument ? "#F4F7FA" : "#FFFFFF",  
          stroke: isRisk ? "#FF7A24" : "#9AA9B8",  
          strokeWidthPt: isRisk ? 1.4 : 1.1,  
          radiusRatio: isRisk ? 0.16 : 0.04,  
          opacity: 0.88,  
          shadow: { color: isRisk ? "#FF7A24" : "#7B8A99", alpha: 0.10, blurPt: 2.8, distancePt: 1, angleDeg: 90 }  
        },  
        source: source("multi-cluster-diagram-native-node", {  
          nodeIndex: index,  
          semanticNodeId: node.id || "",  
          nodeRole: isRisk ? "risk" : isDocument ? "input-artifact" : "process"  
        })  
      });  
      if (isDocument) {  
        shapes.push({  
          id: `${base}-native-cluster-node-fold-${index}`,  
          type: "triangle",  
          box: roundedBox({  
            x: nodeBox.x + nodeBox.w - 15,  
            y: nodeBox.y,  
            w: 15,  
            h: 15  
          }),  
          style: { fill: "#D7E0E8", stroke: "#9AA9B8", strokeWidthPt: 0.8, rotate: 90, opacity: 0.9 },  
          source: source("multi-cluster-diagram-native-document-fold", { nodeIndex: index })  
        });  
      }  
    });  
    return shapes;  
  }  
    
  function isSafeGenericNodeDiagramText(text) {  
    const normalized = normalizeGenericNodeDiagramText(text);  
    if (!normalized) return false;  
    if (normalized.length > 30) return false;  
    if (/^[\d\s.,;:|/\\\-+_()[\]{}]+$/.test(normalized)) return false;  
    if (/^[？?！!×+。.,，；;：:]+$/.test(normalized)) return false;  
    return /[\u4e00-\u9fffA-Za-z]/.test(normalized);  
  }  
    
    
    
  function genericNodeDiagramTextBox(image, node, text, index) {  
    const nodeBox = roundedBox(node.box || {});  
    const fontSize = Math.max(8, Math.min(14, Math.min(Number(nodeBox.h || 0) * 0.44 || 10.5, Number(nodeBox.w || 0) / Math.max(2.2, text.length * 0.9))));  
    const sourceId = image?.id || "generic-node-diagram";  
    return {  
      id: node.sourceTextBoxId || `${sourceId}-native-generic-node-text-${index}`,  
      text,  
      box: {  
        x: nodeBox.x,  
        y: nodeBox.y,  
        w: Math.max(22, nodeBox.w),  
        h: Math.max(12, nodeBox.h)  
      },  
      font: {  
        family: "SimHei",  
        sizePt: fontSize,  
        color: "#17324D",  
        weight: text.length <= 8 ? "bold" : "regular",  
        opacity: 1  
      },  
      align: "center",  
      verticalAlign: "middle",  
      source: {  
        editable: true,  
        nativeRebuild: true,  
        detector: "generic-node-diagram-semantic-node-text",  
        expressionForm: "complex-diagram",  
        expressionSubtype: "generic-node-diagram",  
        layerSourceId: image?.id || null,  
        layerType: image?.source?.layer?.layerType || "diagram-zone",  
        semanticTextSource: true,  
        semanticNodeId: node.id || "",  
        overlayVisibility: "visible"  
      }  
    };  
  }  
    
  function createVisualClusterStackShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE, pageTextBoxes = []) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyVisualClusterStack(image)) continue;  
      const portalFourLayer = isPortalFourLayerCluster(pageTextBoxes);  
      const portalLayout = portalFourLayer ? measurePortalFourLayerLayout(sourceImage, pageTextBoxes, slideSize) : null;  
      const localShapes = portalFourLayer  
        ? inferPortalFourLayerClusterShapes(image, pageTextBoxes, slideSize, portalLayout)  
        : inferVisualClusterStackShapes(image);  
      const localTextBoxes = portalFourLayer  
        ? portalFourLayerClusterTextBoxes(image, pageTextBoxes, slideSize, portalLayout)  
        : visualClusterStackTextBoxes(image);  
      if (localShapes.length === 0 && localTextBoxes.length === 0) continue;  
      image.source = {  
        ...(image.source || {}),  
        visualClusterStackObjectified: true,  
        visualClusterStackTextObjectified: localTextBoxes.length > 0,  
        visualClusterStackNativeTextBoxes: localTextBoxes,  
        visualAtomOverlayOnly: false,  
        dropErasedResidualAfterNativeRebuild: true,  
        objectifiedVisualClusterStackShapes: localShapes.length,  
        objectifiedVisualClusterStackTextBoxes: localTextBoxes.length,  
        portalFourLayerClusterObjectified: portalFourLayer,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "visual cluster stack"}; visual cluster stack rebuilt as native layered cards and editable labels`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function isPortalFourLayerCluster(textBoxes = []) {  
    const text = (textBoxes || []).map((item) => String(item?.text || "")).join(" ").replace(/\s+/g, "");  
    return /PMPortal平台四层架构解析/i.test(text)  
      && /统一展示门户/.test(text)  
      && /Skills能力网/i.test(text)  
      && /运行时引擎/.test(text)  
      && /CLI脚手架/i.test(text)  
      && /全资产统一检索/.test(text)  
      && /多域快速扩展/.test(text);  
  }  
    
  function portalFourLayerComponentMetadata(image, role, part) {  
    const base = safeComponentToken(image?.id || "portal-four-layer");  
    return {  
      nativeComponentGroupId: `${base}-portal-four-layer-${safeComponentToken(role)}`,  
      nativeComponentArchetype: "portal-four-layer-architecture",  
      nativeComponentInstance: true,  
      nativeComponentMinimumUnit: "semantic-component",  
      nativeComponentRole: role,  
      nativeComponentPart: part  
    };  
  }  
    
  function inferPortalFourLayerClusterShapes(image = {}, pageTextBoxes = [], slideSize = DEFAULT_SLIDE, measuredLayout = null) {  
    const sx = Number(slideSize.widthPt || 960) / 960;  
    const sy = Number(slideSize.heightPt || 540) / 540;  
    const atoms = visualClusterStackRectAtoms(image);  
    const layerRoles = ["portal", "skills", "runtime", "cli"];  
    const layout = measuredLayout || measurePortalFourLayerLayout(null, pageTextBoxes, slideSize);  
    const measuredBarFills = ["#6CB2E6", "#549FD9", "#3483C5", "#1E68A5"];  
    const measuredCalloutFills = ["#2067A2", "#2067A2", "#1B6097", "#175588"];  
    const shapes = [];  
    const source = (detector, role, part, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "chart-or-diagram",  
      expressionSubtype: "portal-four-layer-architecture",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "chart-zone",  
      ...portalFourLayerComponentMetadata(image, role, part),  
      ...extra  
    });  
    
    layerRoles.forEach((role, index) => {  
      const fill = measuredBarFills[index] || normalizeHexColor(atoms[index]?.color) || visualClusterStackFallbackColor(index);  
      const bar = layout.bars[index];  
      shapes.push({  
        id: `${image.id || "portal-four-layer"}-native-${role}-bar`,  
        type: "rect",  
        box: roundedBox(bar),  
        style: {  
          fill,  
          stroke: "none",  
          strokeWidthPt: 0  
        },  
        source: source("portal-four-layer-native-bar", `layer-${role}`, "bar", { layerIndex: index, sampledColor: fill })  
      });  
      shapes.push({  
        id: `${image.id || "portal-four-layer"}-native-${role}-callout`,  
        type: "rect",  
        box: roundedBox(layout.callouts[index]),  
        style: { fill: measuredCalloutFills[index], stroke: "none", strokeWidthPt: 0 },  
        source: source("portal-four-layer-native-callout", `layer-${role}`, "callout", { layerIndex: index })  
      });  
      if (index < layerRoles.length - 1) {  
        layout.arrows.slice(index * 3, index * 3 + 3).forEach((box, arrowIndex) => {  
          shapes.push({  
            id: `${image.id || "portal-four-layer"}-native-${role}-arrow-${arrowIndex}`,  
            type: "upArrow",  
            box: roundedBox(box),  
            style: { fill: "#32B96B", stroke: "#239B56", strokeWidthPt: 0.6 },  
            source: source("portal-four-layer-native-arrow", "capability-routing", "up-arrow", { layerIndex: index, arrowIndex })  
          });  
        });  
      }  
    });  
    
    layout.bullets.forEach((box, index) => shapes.push({  
      id: `${image.id || "portal-four-layer"}-native-bullet-${index}`,  
      type: "ellipse",  
      box: roundedBox(box),  
      style: { fill: "#9A9A9A", stroke: "#9A9A9A", strokeWidthPt: 0.2 },  
      source: source("portal-four-layer-native-bullet", `narrative-${index + 1}`, "bullet", { bulletIndex: index })  
    }));  
    
    return shapes;  
  }  
    
  function portalFourLayerClusterTextBoxes(image = {}, pageTextBoxes = [], slideSize = DEFAULT_SLIDE, measuredLayout = null) {  
    const roles = ["portal", "skills", "runtime", "cli"];  
    const layout = measuredLayout || measurePortalFourLayerLayout(null, pageTextBoxes, slideSize);  
    const layerTextBoxes = visualClusterStackSemanticNodes(image).slice(0, 4).map((node, index) => {  
      const textBox = visualClusterStackTextBox(image, node, normalizeGenericNodeDiagramText(node.text), index);  
      const evidence = findPortalTextEvidence(pageTextBoxes, node.text);  
      textBox.box = roundedBox(evidence?.box || layout.layerLabels[index]);  
      textBox.font = {  
        ...textBox.font,  
        family: evidence?.font?.family || textBox.font?.family || "Microsoft YaHei",  
        sizePt: Math.max(12, Number(evidence?.font?.sizePt || textBox.font?.sizePt || 13.5)),  
        weight: "regular",  
        align: "center",  
        valign: "middle"  
      };  
      textBox.source = {  
        ...textBox.source,  
        detector: "portal-four-layer-native-layer-text",  
        expressionSubtype: "portal-four-layer-architecture",  
        ...portalFourLayerComponentMetadata(image, `layer-${roles[index]}`, "label")  
      };  
      return textBox;  
    });  
    const calloutSpecs = [  
      [/全资产统一检索/, "portal"],  
      [/AI能力精准分发/i, "skills"],  
      [/目录实时聚合/, "runtime"],  
      [/多域快速扩展/, "cli"]  
    ];  
    const calloutTextBoxes = calloutSpecs.map(([pattern, role], index) => {  
      const original = (pageTextBoxes || []).find((candidate) => pattern.test(String(candidate?.text || "")));  
      if (!original) return null;  
      return {  
        id: `${original.id || image.id || "portal-four-layer"}-native-callout-${index}`,  
        text: original.text,  
        box: roundedBox(original.box || layout.calloutLabels[index]),  
        font: {  
          family: original.font?.family || "SimHei",  
          sizePt: Math.max(10, Math.min(16, Number(original.font?.sizePt || 13))),  
          color: "#FFFFFF",  
          weight: "regular",  
          opacity: 1,  
          align: "center",  
          valign: "middle"  
        },  
        align: "center",  
        verticalAlign: "middle",  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "portal-four-layer-native-callout-text",  
          expressionForm: "chart-or-diagram",  
          expressionSubtype: "portal-four-layer-architecture",  
          layerSourceId: image.id || null,  
          semanticTextSource: true,  
          overlayVisibility: "visible",  
          ...portalFourLayerComponentMetadata(image, `layer-${role}`, "callout-text")  
        }  
      };  
    }).filter(Boolean);  
    return [...layerTextBoxes, ...calloutTextBoxes];  
  }  
    
    
    
  function measurePortalFourLayerLayout(sourceImage, pageTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const sx = Number(slideSize.widthPt || 960) / 960;  
    const sy = Number(slideSize.heightPt || 540) / 540;  
    const fallbackBars = [156, 236.6, 317.6, 398.6].map((y) => roundedBox({ x: 386.1 * sx, y: y * sy, w: 420.2 * sx, h: 45.7 * sy }));  
    let bars = fallbackBars;  
    let arrows = [205.1, 286.1, 367.1].flatMap((y) => [475.7, 577.1, 678.9].map((x) => roundedBox({ x: x * sx, y: y * sy, w: 27 * sx, h: 28.2 * sy })));  
    if (sourceImage?.rgba && sourceImage.width && sourceImage.height) {  
      const blue = (r, g, b, a) => a > 200 && b > 120 && b - r > 25 && b - g > 5 && g > 70;  
      const green = (r, g, b, a) => a > 200 && g > 130 && g > r * 1.35 && g > b * 1.15 && r < 110;  
      const pxBands = detectHorizontalColorBands(sourceImage, {  
        predicate: blue,  
        stride: 2,  
        region: { x: sourceImage.width * 0.35, y: sourceImage.height * 0.2, w: sourceImage.width * 0.63, h: sourceImage.height * 0.72 },  
        minRowCoverage: 0.28,  
        minBandHeightPx: sourceImage.height * 0.035,  
        maxBands: 4  
      });  
      if (pxBands.length === 4) bars = pxBands.map((box) => pixelBoxToSlide(box, sourceImage, slideSize));  
      const pxArrows = detectColorComponents(sourceImage, {  
        predicate: green,  
        stride: 2,  
        region: { x: sourceImage.width * 0.42, y: sourceImage.height * 0.32, w: sourceImage.width * 0.36, h: sourceImage.height * 0.45 },  
        minAreaPx: sourceImage.width * sourceImage.height * 0.00045  
      }).filter((box) => box.w >= sourceImage.width * 0.018 && box.w <= sourceImage.width * 0.04 && box.h >= sourceImage.height * 0.035 && box.h <= sourceImage.height * 0.075);  
      if (pxArrows.length === 9) arrows = pxArrows.map((box) => pixelBoxToSlide(box, sourceImage, slideSize));  
    }  
    const calloutPatterns = [/全资产统一检索/, /AI能力精准分发/i, /目录实时聚合/, /多域快速扩展/];  
    const calloutLabels = calloutPatterns.map((pattern, index) => roundedBox(findPortalPatternEvidence(pageTextBoxes, pattern)?.box || { x: 782 * sx, y: (168 + index * 81) * sy, w: 102 * sx, h: 19 * sy }));  
    const callouts = calloutLabels.map((box) => roundedBox({ x: box.x - 8 * sx, y: box.y - 4.5 * sy, w: box.w + 16 * sx, h: box.h + 9 * sy }));  
    const layerPatterns = [/统一展示门户/, /Skills能力网/i, /运行时引擎/, /CLI脚手架/i];  
    const layerLabels = layerPatterns.map((pattern, index) => roundedBox(findPortalPatternEvidence(pageTextBoxes, pattern)?.box || { x: bars[index].x + bars[index].w * 0.35, y: bars[index].y + 7 * sy, w: bars[index].w * 0.3, h: 26 * sy }));  
    const narrativePatterns = [/^敏捷构建：/, /^实时运转：/, /^智能中枢：/, /^(?:[·•・]\s*)?全局可见：/];  
    const bullets = narrativePatterns.map((pattern, index) => {  
      const evidence = findPortalPatternEvidence(pageTextBoxes, pattern);  
      return roundedBox({ x: 74.5 * sx, y: Number(evidence?.box?.y ?? (169 + index * 80.5)) + 4.2 * sy, w: 7.4 * sx, h: 7.4 * sy });  
    });  
    return { bars, arrows, callouts, calloutLabels, layerLabels, bullets };  
  }  
    
  function findPortalTextEvidence(items, text) {  
    const key = normalizeGenericNodeDiagramText(text).replace(/\s+/g, "").toLowerCase();  
    return (items || []).find((item) => normalizeGenericNodeDiagramText(item?.text).replace(/\s+/g, "").toLowerCase() === key) || null;  
  }  
  function findPortalPatternEvidence(items, pattern) { return (items || []).find((item) => pattern.test(String(item?.text || ""))) || null; }  
    
    
  function shouldObjectifyVisualClusterStack(image = {}) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || {};  
    const box = visualClusterStackImageBox(image);  
    if (source.detector !== "visual-cluster-graphic-underlay-crop") return false;  
    if (layer.layerType !== "chart-zone" && layer.layerType !== "diagram-zone") return false;  
    if (understanding.archetype !== "hub-spoke") return false;  
    if (Number(understanding.confidence || 0) < 0.9) return false;  
    if (!box.w || !box.h || Number(box.w) < 260 || Number(box.h) < 180) return false;  
    if (/screenshot|document|prototype|ui/.test(String(source.expressionForm || source.expressionSubtype || ""))) return false;  
    const rectAtoms = visualClusterStackRectAtoms(image);  
    const nodes = visualClusterStackSemanticNodes(image);  
    return rectAtoms.length >= 4 && nodes.length >= 4;  
  }  
    
  function visualClusterStackImageBox(image = {}) {  
    const candidates = [  
      image?.box,  
      image,  
      image?.source?.layer?.diagramUnderstanding?.evidence?.regionBox,  
      image?.source?.layer?.box  
    ];  
    for (const candidate of candidates) {  
      const x = Number(candidate?.x);  
      const y = Number(candidate?.y);  
      const w = Number(candidate?.w);  
      const h = Number(candidate?.h);  
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {  
        return { x, y, w, h };  
      }  
    }  
    return {};  
  }  
    
  function visualClusterStackRectAtoms(image = {}) {  
    const imageBox = visualClusterStackImageBox(image);  
    return comparisonMatrixVisualAtoms(image)  
      .filter((atom) => String(atom?.kind || "") === "native-rect-candidate")  
      .filter((atom) => atom?.box && boxCenterInside(atom.box, imageBox))  
      .sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0));  
  }  
    
  function visualClusterStackSemanticNodes(image = {}) {  
    const imageBox = visualClusterStackImageBox(image);  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : [];  
    return nodes  
      .filter((node) => node?.box && boxCenterInside(node.box, imageBox))  
      .filter((node) => isSafeGenericNodeDiagramText(node.text))  
      .sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0));  
  }  
    
  function inferVisualClusterStackShapes(image = {}) {  
    const atoms = visualClusterStackRectAtoms(image);  
    const base = image.id || "visual-cluster-stack";  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "chart-or-diagram",  
      expressionSubtype: "visual-cluster-stack",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "chart-zone",  
      skeletonOnly: true,  
      ...extra  
    });  
    const shapes = [];  
    atoms.forEach((atom, index) => {  
      const box = roundedBox(atom.box || {});  
      const fill = normalizeHexColor(atom.color) || visualClusterStackFallbackColor(index);  
      shapes.push({  
        id: `${base}-native-stack-layer-${index}`,  
        type: "roundRect",  
        box,  
        style: {  
          fill,  
          stroke: darkenHexColor(fill, 0.16),  
          strokeWidthPt: 0.9,  
          radiusRatio: Math.min(0.42, Math.max(0.12, Number(box.h || 1) / Math.max(1, Number(box.w || 1)) * 0.9)),  
          opacity: 0.80,  
          shadow: { color: "#1F4E79", alpha: 0.10, blurPt: 2.8, distancePt: 0.8, angleDeg: 90 }  
        },  
        source: source("visual-cluster-stack-native-layer", { layerIndex: index, sampledColor: fill })  
      });  
      if (index > 0) {  
        const prev = centerOfBox(roundedBox(atoms[index - 1].box || {}));  
        const current = centerOfBox(box);  
        shapes.push({  
          id: `${base}-native-stack-connector-${index}`,  
          type: "line",  
          box: lineBox({ x: prev.x, y: prev.y + Number(atoms[index - 1].box?.h || 0) * 0.28 }, { x: current.x, y: current.y - Number(box.h || 0) * 0.28 }),  
          style: { stroke: "#D7ECFA", strokeWidthPt: 1.1, connectorType: "straight", endArrow: "triangle", opacity: 0.58 },  
          source: source("visual-cluster-stack-native-connector", { layerIndex: index })  
        });  
      }  
    });  
    return shapes;  
  }  
    
  function visualClusterStackTextBoxes(image = {}) {  
    const seen = new Set();  
    return visualClusterStackSemanticNodes(image)  
      .map((node, index) => {  
        const text = normalizeGenericNodeDiagramText(node.text);  
        const key = text.replace(/\s+/g, "");  
        if (seen.has(key)) return null;  
        seen.add(key);  
        return visualClusterStackTextBox(image, node, text, index);  
      })  
      .filter(Boolean)  
      .slice(0, 8);  
  }  
    
  function visualClusterStackTextBox(image, node, text, index) {  
    const nodeBox = roundedBox(node.box || {});  
    const fontSize = Math.max(9, Math.min(15, Math.min(Number(nodeBox.h || 0) * 0.46 || 12, Number(nodeBox.w || 0) / Math.max(2.1, text.length * 0.82))));  
    const sourceId = image?.id || "visual-cluster-stack";  
    return {  
      id: node.sourceTextBoxId || `${sourceId}-native-stack-label-${index}`,  
      text,  
      box: {  
        x: nodeBox.x,  
        y: nodeBox.y,  
        w: Math.max(28, nodeBox.w),  
        h: Math.max(13, nodeBox.h)  
      },  
      font: {  
        family: "SimHei",  
        sizePt: fontSize,  
        color: "#FFFFFF",  
        weight: "bold",  
        opacity: 1  
      },  
      align: "center",  
      verticalAlign: "middle",  
      source: {  
        editable: true,  
        nativeRebuild: true,  
        detector: "visual-cluster-stack-native-label",  
        expressionForm: "chart-or-diagram",  
        expressionSubtype: "visual-cluster-stack",  
        layerSourceId: image?.id || null,  
        layerType: image?.source?.layer?.layerType || "chart-zone",  
        semanticTextSource: true,  
        semanticNodeId: node.id || "",  
        overlayVisibility: "visible"  
      }  
    };  
  }  
    
  function visualClusterStackFallbackColor(index) {  
    return ["#6FB1E2", "#599FD5", "#3C84C0", "#286CA4"][index % 4];  
  }

  return {
    createGenericNodeDiagramSkeletonShapes,
    createVisualClusterStackShapes,
    shouldObjectifyGenericNodeDiagramSkeleton,
    shouldObjectifyVisualClusterStack
  };
}

module.exports = { createGenericNodeClusterFactory };
