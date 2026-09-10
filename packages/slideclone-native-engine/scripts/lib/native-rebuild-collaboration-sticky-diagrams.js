"use strict";

function createCollaborationStickyDiagramsFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    averageColor,
    boxCenterInside,
    boxOverlapRatio,
    centerOfBox,
    connectedColorComponents,
    cropPng,
    ensureDir,
    eraseMasks,
    expandPxBox,
    expandPtBox,
    isCollaborationFlowInternalLabel,
    luma,
    localPxBoxToSlidePt,
    normalizeCjkText,
    normalizeHex,
    normalizeMatrixLabel,
    path,
    pixel,
    ptToPxBox,
    resolveAssetPathForIr,
    rgbToHex,
    round,
    roundedBox,
    sameDiagramLabel,
    saturation,
    unionBox,
    writePng
  } = dependencies;

  function createCollaborationFlowShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyCollaborationFlow(image, textBoxes)) continue;  
      const localShapes = inferCollaborationFlowShapes(image, textBoxes);  
      if (localShapes.length === 0) continue;  
      const candidateTextBoxes = collaborationFlowNativeTextBoxes(image, textBoxes);  
      const erasedTextBoxes = maybeEraseCollaborationFlowText({  
        image,  
        textBoxes: candidateTextBoxes,  
        sourceImage,  
        slideSize,  
        irDir  
      });  
      const nativeTextBoxes = erasedTextBoxes.length > 0  
        ? erasedTextBoxes  
        : candidateTextBoxes.map((textBox) => ({  
          ...textBox,  
          source: {  
            ...(textBox.source || {}),  
            textErasedFromCrop: false,  
            overlayVisibility: "visible"  
          }  
        }));  
      image.source = {  
        ...(image.source || {}),  
        collaborationFlowObjectified: true,  
        visualAtomOverlayOnly: shouldDropCollaborationFlowResidual(localShapes, nativeTextBoxes) ? false : true,  
        dropErasedResidualAfterNativeRebuild: shouldDropCollaborationFlowResidual(localShapes, nativeTextBoxes)  
          ? true  
          : image.source?.dropErasedResidualAfterNativeRebuild,  
        objectifiedCollaborationFlowShapes: localShapes.length,  
        collaborationFlowTextObjectified: nativeTextBoxes.length > 0,  
        collaborationFlowNativeTextBoxes: nativeTextBoxes,  
        objectifiedCollaborationFlowTextBoxes: nativeTextBoxes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; collaboration flow branch connectors and OCR-backed editable labels rebuilt over fidelity crop`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function shouldObjectifyCollaborationFlow(image, textBoxes = []) {  
    const source = image?.source || {};  
    const box = image?.box || {};  
    if (source.detector !== "collaboration-flow-underlay-crop") return false;  
    if (!box.w || !box.h || Number(box.w) < 700 || Number(box.h) < 240) return false;  
    const internal = [  
      ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)),  
      ...collaborationFlowSemanticTextBoxes(image).filter((textBox) => boxCenterInside(textBox.box, box))  
    ];  
    const text = internal.map((item) => String(item.text || "")).join("\n");  
    const roleSignals = [/后端研发\s*BE/i, /前端研发\s*FE/i, /测试\s*QA/i]  
      .filter((pattern) => pattern.test(text)).length;  
    const hasEngine = /PM\s*Skills|PMSkills|处理引擎/i.test(text);  
    if (roleSignals >= 2 || hasEngine) return true;  
    return source.expressionSubtype === "collaboration-flow-diagram"  
      || source.componentTemplateGroupApplied === true  
      || source.collaborationFlowCandidate === true;  
  }  
    
  function inferCollaborationFlowShapes(image, textBoxes = []) {  
    const box = image?.box || {};  
    const base = image.id || "collaboration-flow";  
    const internal = [  
      ...(textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, box)),  
      ...collaborationFlowSemanticTextBoxes(image).filter((textBox) => boxCenterInside(textBox.box, box))  
    ];  
    const roleLabels = [  
      { key: "be", pattern: /后端研发\s*BE/i, stroke: "#2E86D1", icon: "database" },  
      { key: "fe", pattern: /前端研发\s*FE/i, stroke: "#1F78D1", icon: "browser" },  
      { key: "qa", pattern: /测试\s*QA/i, stroke: "#2B8CE5", icon: "clipboard" }  
    ].map((role) => ({  
      ...role,  
      textBox: internal.find((item) => role.pattern.test(String(item.text || "")))  
    })).filter((role) => role.textBox);  
    const hubLabel = internal.find((item) => /PM\s*Skills|PMSkills|处理引擎/i.test(String(item.text || "")));  
    const hub = inferCollaborationHubBox(box, hubLabel);  
    const cards = inferCollaborationCards(box, roleLabels);  
    if (cards.length < 2) return inferCollaborationFlowSkeletonShapes(image);  
    return [  
      ...collaborationHubShapes(base, image, hub),  
      ...cards.flatMap((card, index) => [  
        ...collaborationBranchShapes(base, image, hub, card, index),  
        ...collaborationCardShapes(base, image, card, index)  
      ])  
    ];  
  }  
    
  function inferCollaborationFlowSkeletonShapes(image) {  
    const box = image?.box || {};  
    if (!box.w || !box.h) return [];  
    const base = image.id || "collaboration-flow";  
    const hubSize = Math.min(Number(box.h || 0) * 0.38, Number(box.w || 0) * 0.18);  
    const hub = roundedBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.18 - hubSize / 2,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.50 - hubSize / 2,  
      w: hubSize,  
      h: hubSize  
    });  
    const roles = [  
      { key: "be", stroke: "#2E86D1", icon: "database" },  
      { key: "fe", stroke: "#1F78D1", icon: "browser" },  
      { key: "qa", stroke: "#2B8CE5", icon: "clipboard" }  
    ];  
    const cardX = round(Number(box.x || 0) + Number(box.w || 0) * 0.48);  
    const cardW = round(Number(box.w || 0) * 0.48);  
    const cardH = round(Math.max(70, Math.min(104, Number(box.h || 0) * 0.23)));  
    const cardYs = [0.08, 0.39, 0.70].map((ratio) => round(Number(box.y || 0) + Number(box.h || 0) * ratio));  
    const cards = roles.map((role, index) => ({  
      role,  
      x: cardX,  
      y: cardYs[index],  
      w: cardW,  
      h: cardH  
    }));  
    return [  
      ...collaborationHubShapes(base, image, hub),  
      ...cards.flatMap((card, index) => [  
        ...collaborationBranchShapes(base, image, hub, card, index),  
        ...collaborationCardShapes(base, image, card, index)  
      ])  
    ].map((shape) => ({  
      ...shape,  
      id: shape.id.replace("-native-", "-native-skeleton-"),  
      source: {  
        ...(shape.source || {}),  
        detector: String(shape.source?.detector || "").replace("collaboration-flow-native-", "collaboration-flow-native-skeleton-"),  
        skeletonOnly: true  
      }  
    }));  
  }  
    
  function shouldDropCollaborationFlowResidual(shapes = [], nativeTextBoxes = []) {  
    const detectors = new Set((shapes || []).map((shape) => shape?.source?.detector || shape?.detector || ""));  
    const cardCount = (shapes || []).filter((shape) =>  
      (shape?.source?.detector || shape?.detector) === "collaboration-flow-native-recipient-card"  
    ).length;  
    const branchCount = (shapes || []).filter((shape) =>  
      (shape?.source?.detector || shape?.detector) === "collaboration-flow-native-branch"  
    ).length;  
    const roles = new Set((nativeTextBoxes || []).map((textBox) => textBox?.source?.role || ""));  
    return cardCount >= 3  
      && branchCount >= 6  
      && detectors.has("collaboration-flow-native-hub-core")  
      && roles.has("engine-label")  
      && roles.has("recipient-title")  
      && roles.has("recipient-body")  
      && nativeTextBoxes.length >= 11;  
  }  
    
  function inferCollaborationHubBox(box, hubLabel) {  
    const labelCenter = hubLabel?.box ? centerOfBox(hubLabel.box) : null;  
    const size = Math.min(Number(box.h || 0) * 0.44, Number(box.w || 0) * 0.19);  
    const centerX = labelCenter?.x || Number(box.x || 0) + Number(box.w || 0) * 0.2;  
    const centerY = labelCenter?.y || Number(box.y || 0) + Number(box.h || 0) * 0.52;  
    return {  
      x: round(centerX - size / 2),  
      y: round(centerY - size / 2),  
      w: round(size),  
      h: round(size)  
    };  
  }  
    
  function inferCollaborationCards(box, roleLabels = []) {  
    const cardX = round(Number(box.x || 0) + Number(box.w || 0) * 0.47);  
    const cardW = round(Number(box.w || 0) * 0.51);  
    return roleLabels.map((role, index) => {  
      const labelBox = role.textBox.box;  
      const cardH = round(Math.max(76, Math.min(106, Number(box.h || 0) * 0.26)));  
      const y = round(Math.max(Number(box.y || 0) + 4, labelBox.y - cardH * 0.24));  
      return {  
        role,  
        x: cardX,  
        y,  
        w: cardW,  
        h: cardH  
      };  
    });  
  }  
    
  function collaborationHubShapes(base, image, hub) {  
    const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);  
    return [{  
      id: `${base}-native-hub-glow`,  
      type: "ellipse",  
      box: expandPtBox(hub, DEFAULT_SLIDE, 58, 58),  
      style: { fill: "#BDF4D3", stroke: "none", strokeWidthPt: 0, opacity: 0.36 },  
      source: source("collaboration-flow-native-hub-glow")  
    }, {  
      id: `${base}-native-hub-ring`,  
      type: "ellipse",  
      box: expandPtBox(hub, DEFAULT_SLIDE, 30, 30),  
      style: { fill: "#7BE5A8", stroke: "none", strokeWidthPt: 0, opacity: 0.34 },  
      source: source("collaboration-flow-native-hub-ring")  
    }, {  
      id: `${base}-native-hub-core`,  
      type: "ellipse",  
      box: hub,  
      style: {  
        fill: "#20C66B",  
        stroke: "#19A95A",  
        strokeWidthPt: 1,  
        opacity: 0.94  
      },  
      source: source("collaboration-flow-native-hub-core")  
    }, {  
      id: `${base}-native-hub-chip`,  
      type: "roundRect",  
      box: {  
        x: round(hub.x + hub.w * 0.38),  
        y: round(hub.y + hub.h * 0.18),  
        w: round(hub.w * 0.24),  
        h: round(hub.h * 0.2)  
      },  
      style: { fill: "#F4FFF8", stroke: "#BEECCF", strokeWidthPt: 0.7, radiusRatio: 0.08, opacity: 0.88 },  
      source: source("collaboration-flow-native-hub-icon")  
    }];  
  }  
    
  function collaborationCardShapes(base, image, card, index) {  
    const iconBox = {  
      x: round(card.x + card.w * 0.05),  
      y: round(card.y + card.h * 0.24),  
      w: round(card.w * 0.12),  
      h: round(card.h * 0.48)  
    };  
    const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);  
    return [{  
      id: `${base}-native-card-${card.role.key}`,  
      type: "roundRect",  
      box: { x: card.x, y: card.y, w: card.w, h: card.h },  
      style: {  
        fill: "#FFFFFF",  
        stroke: "#B9D0E2",  
        strokeWidthPt: 0.8,  
        radiusRatio: 0.035,  
        opacity: 0.98,  
        shadow: { color: "#7B91A6", opacity: 0.16, blurPt: 4, distancePt: 1.6, angleDeg: 90 }  
      },  
      source: source("collaboration-flow-native-recipient-card", { role: card.role.key, cardIndex: index })  
    }, {  
      id: `${base}-native-card-accent-${card.role.key}`,  
      type: "rect",  
      box: { x: card.x, y: card.y, w: card.w, h: 1.4 },  
      style: { fill: card.role.stroke, stroke: "none", strokeWidthPt: 0, opacity: 0.42 },  
      source: source("collaboration-flow-native-card-accent", { role: card.role.key, cardIndex: index })  
    }, {  
      id: `${base}-native-card-icon-${card.role.key}`,  
      type: "roundRect",  
      box: iconBox,  
      style: { fill: "#EAF5FF", stroke: card.role.stroke, strokeWidthPt: 1.1, radiusRatio: 0.08, opacity: 0.86 },  
      source: source("collaboration-flow-native-card-icon", { role: card.role.key, icon: card.role.icon })  
    }, {  
      id: `${base}-native-card-icon-line-${card.role.key}-1`,  
      type: "line",  
      box: { x: round(iconBox.x + iconBox.w * 0.18), y: round(iconBox.y + iconBox.h * 0.34), w: round(iconBox.w * 0.64), h: 0 },  
      style: { stroke: "#94BEE8", strokeWidthPt: 0.9, connectorType: "straight", opacity: 0.58 },  
      source: source("collaboration-flow-native-card-icon-line", { role: card.role.key, lineIndex: 1 })  
    }, {  
      id: `${base}-native-card-icon-line-${card.role.key}-2`,  
      type: "line",  
      box: { x: round(iconBox.x + iconBox.w * 0.18), y: round(iconBox.y + iconBox.h * 0.56), w: round(iconBox.w * 0.64), h: 0 },  
      style: { stroke: "#94BEE8", strokeWidthPt: 0.9, connectorType: "straight", opacity: 0.58 },  
      source: source("collaboration-flow-native-card-icon-line", { role: card.role.key, lineIndex: 2 })  
    }];  
  }  
    
  function collaborationBranchShapes(base, image, hub, card, index) {  
    const from = {  
      x: hub.x + hub.w * 0.82,  
      y: hub.y + hub.h * (index === 0 ? 0.22 : index === 1 ? 0.5 : 0.78)  
    };  
    const to = {  
      x: card.x + card.w * 0.02,  
      y: card.y + card.h * 0.5  
    };  
    const midX = round(from.x + (to.x - from.x) * 0.48);  
    const source = (detector, extra = {}) => collaborationFlowShapeSource(image, detector, extra);  
    return [{  
      id: `${base}-native-branch-${card.role.key}-a`,  
      type: "line",  
      box: { x: round(from.x), y: round(from.y), w: round(midX - from.x), h: 0 },  
      style: { stroke: "#0577DF", strokeWidthPt: 7.2, connectorType: "straight", lineCap: "round", opacity: 0.9 },  
      source: source("collaboration-flow-native-branch", { role: card.role.key, branchIndex: index, segment: "a" })  
    }, {  
      id: `${base}-native-branch-${card.role.key}-b`,  
      type: "line",  
      box: { x: midX, y: round(from.y), w: round(to.x - midX), h: round(to.y - from.y) },  
      style: { stroke: "#0577DF", strokeWidthPt: 7.2, connectorType: "straight", lineCap: "round", opacity: 0.9 },  
      source: source("collaboration-flow-native-branch", { role: card.role.key, branchIndex: index, segment: "b" })  
    }];  
  }  
    
  function collaborationFlowShapeSource(image, detector, extra = {}) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "collaboration-flow-diagram",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "diagram-zone",  
      ...extra  
    };  
  }  
    
  function collaborationFlowNativeTextBoxes(image, textBoxes = []) {  
    const box = image?.box || {};  
    const internalTextBoxes = (textBoxes || [])  
      .filter((textBox) => boxCenterInside(textBox.box, box))  
      .filter((textBox) => isCollaborationFlowInternalLabel(textBox, box))  
      .filter((textBox) => normalizeMatrixLabel(textBox.text))  
      .filter((textBox) => String(textBox.text || "").trim());  
    const semanticTextBoxes = collaborationFlowSemanticTextBoxes(image)  
      .filter((textBox) => boxCenterInside(textBox.box, box))  
      .filter((textBox) => isCollaborationFlowInternalLabel(textBox, box))  
      .filter((textBox) => !internalTextBoxes.some((existing) => sameDiagramLabel(existing, textBox)));  
    return [  
      ...internalTextBoxes,  
      ...semanticTextBoxes  
    ]  
      .map((textBox, index) => collaborationFlowTextBox(image, textBox, index));  
  }  
    
  function collaborationFlowSemanticTextBoxes(image = {}) {  
    const nodes = Array.isArray(image?.source?.layer?.diagramUnderstanding?.nodes)  
      ? image.source.layer.diagramUnderstanding.nodes  
      : [];  
    return nodes  
      .filter((node) => node?.box && String(node.text || "").trim())  
      .map((node, index) => ({  
        id: node.sourceTextBoxId || `${image.id || "collaboration-flow"}-semantic-node-${index}`,  
        text: String(node.text || ""),  
        box: node.box,  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "collaboration-flow-semantic-node",  
          semanticNodeId: node.id || ""  
        }  
      }));  
  }  
    
    
    
  function collaborationFlowTextBox(image, textBox, index) {  
    const next = JSON.parse(JSON.stringify(textBox));  
    const text = String(next.text || "");  
    const role = /PMSkills|PMSkill|处理引擎/i.test(text.replace(/\s+/g, ""))  
      ? "engine-label"  
      : /^To/i.test(text.replace(/\s+/g, ""))  
        ? "recipient-title"  
        : "recipient-body";  
    next.id = next.id || `${image.id || "collaboration-flow"}-native-text-${index}`;  
    next.font = {  
      ...(next.font || {}),  
      color: collaborationFlowTextColor(role, next.font?.color),  
      opacity: 1,  
      weight: role === "recipient-title" || role === "engine-label" ? "bold" : (next.font?.weight || "regular")  
    };  
    next.source = {  
      ...(next.source || {}),  
      editable: true,  
      nativeRebuild: true,  
      detector: "collaboration-flow-native-visible-label",  
      expressionForm: "complex-diagram",  
      expressionSubtype: "collaboration-flow-diagram",  
      layerSourceId: image.id || null,  
      overlayVisibility: "visible",  
      role,  
      textErasedFromCrop: true  
    };  
    return next;  
  }  
    
  function collaborationFlowTextColor(role, fallback) {  
    const normalized = normalizeHex(fallback, "");  
    if (normalized) return normalized;  
    if (role === "engine-label") return "#FFFFFF";  
    if (role === "recipient-title") return "#0E3A63";  
    return "#22384D";  
  }  
    
  function maybeEraseCollaborationFlowText({ image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null }) {  
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
    
  function createStickyNoteClusterShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage) return [];  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyStickyNoteCluster(image)) continue;  
      const notes = detectStickyNoteComponents(sourceImage, image.box, slideSize);  
      if (notes.length < 3) continue;  
      image.source = {  
        ...(image.source || {}),  
        stickyNoteClusterObjectified: true,  
        objectifiedStickyNotes: notes.length,  
        stickyNoteClusterRegionBox: stickyNoteClusterRegionBox(notes, slideSize),  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "diagram crop"}; sticky-note color blocks rebuilt as native shapes with sketch details preserved as residual crops`  
      };  
      for (let index = 0; index < notes.length; index += 1) {  
        const note = notes[index];  
        shapes.push({  
          id: `${image.id || "sticky-note-cluster"}-native-sticky-note-${index}`,  
          type: "rect",  
          box: note.box,  
          rotation: note.rotation,  
          style: {  
            fill: note.fill,  
            stroke: note.stroke,  
            strokeWidthPt: 0.9,  
            shadow: { color: "#2A2A2A", alpha: 0.12, blurPt: 2.5, distancePt: 0.7, angleDeg: 90 }  
          },  
          source: {  
            editable: true,  
            nativeRebuild: true,  
            detector: "sticky-note-cluster-native-note",  
            layerSourceId: image.id || null,  
            noteIndex: index,  
            colorFamily: note.colorFamily  
          }  
        });  
      }  
    }  
    return shapes;  
  }  
    
  function shouldObjectifyStickyNoteCluster(image) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    const box = image?.box || {};  
    if (source.detector !== "foreground-graphic-crop" && source.detector !== "content-foreground-graphic-underlay-crop") return false;  
    if (layer.layerType !== "diagram-zone") return false;  
    if (understanding.archetype !== "flow-card-chain" && understanding.archetype !== "unclassified-diagram") return false;  
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, DEFAULT_SLIDE.widthPt * DEFAULT_SLIDE.heightPt);  
    return areaRatio >= 0.14 && areaRatio <= 0.52;  
  }  
    
  function stickyNoteClusterRegionBox(notes = [], slideSize = DEFAULT_SLIDE) {  
    const boxes = notes.map((note) => note.box).filter(Boolean);  
    if (boxes.length === 0) return null;  
    const union = boxes.reduce((acc, box) => unionBox(acc, box));  
    return expandPtBox(union, slideSize, 28, 34);  
  }  
    
  function detectStickyNoteComponents(sourceImage, ptBox, slideSize = DEFAULT_SLIDE) {  
    if (!sourceImage || !ptBox) return [];  
    const local = ptToPxBox(ptBox, sourceImage, slideSize, 0);  
    const visited = new Uint8Array(local.w * local.h);  
    const components = [];  
    for (let y = 0; y < local.h; y += 3) {  
      for (let x = 0; x < local.w; x += 3) {  
        const idx = y * local.w + x;  
        if (visited[idx]) continue;  
        const color = pixel(sourceImage, local.x + x, local.y + y);  
        const family = stickyNoteColorFamily(color);  
        if (!family) continue;  
        const queue = [[x, y]];  
        visited[idx] = 1;  
        let qi = 0;  
        let minX = x;  
        let minY = y;  
        let maxX = x;  
        let maxY = y;  
        let count = 0;  
        const samples = [];  
        while (qi < queue.length && count < 220000) {  
          const [cx, cy] = queue[qi++];  
          count += 1;  
          minX = Math.min(minX, cx);  
          minY = Math.min(minY, cy);  
          maxX = Math.max(maxX, cx);  
          maxY = Math.max(maxY, cy);  
          if (samples.length < 80) samples.push(pixel(sourceImage, local.x + cx, local.y + cy));  
          for (const [nx, ny] of [[cx + 3, cy], [cx - 3, cy], [cx, cy + 3], [cx, cy - 3]]) {  
            if (nx < 0 || ny < 0 || nx >= local.w || ny >= local.h) continue;  
            const nextIdx = ny * local.w + nx;  
            if (visited[nextIdx]) continue;  
            const nextColor = pixel(sourceImage, local.x + nx, local.y + ny);  
            if (stickyNoteColorFamily(nextColor) !== family) continue;  
            visited[nextIdx] = 1;  
            queue.push([nx, ny]);  
          }  
        }  
        const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, { width: local.w, height: local.h }, 6);  
        const areaRatio = box.w * box.h / Math.max(1, local.w * local.h);  
        if (areaRatio < 0.018 || areaRatio > 0.28 || box.w < 42 || box.h < 36) continue;  
        const slideBox = localPxBoxToSlidePt(box, { width: local.w, height: local.h }, ptBox);  
        components.push({  
          box: slideBox,  
          fill: rgbToHex(averageColor(samples)),  
          stroke: family === "orange" ? "#8B5A1E" : "#656B70",  
          colorFamily: family,  
          rotation: stickyNoteRotationHint(slideBox, components.length)  
        });  
      }  
    }  
    return dedupeStickyNoteComponents(components)  
      .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x))  
      .slice(0, 10);  
  }  
    
  function stickyNoteColorFamily(color) {  
    if (color.a < 64) return null;  
    const lightness = luma(color);  
    const sat = saturation(color);  
    if (color.r > 185 && color.g >= 95 && color.g <= 190 && color.b < 105 && sat > 0.45) return "orange";  
    if (lightness >= 115 && lightness <= 215 && sat < 0.18 && Math.abs(color.r - color.g) < 26 && Math.abs(color.g - color.b) < 26) return "gray";  
    return null;  
  }  
    
  function stickyNoteRotationHint(box, index) {  
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));  
    const base = aspect > 1.35 ? -2 : 1.5;  
    return round(base + ((index % 3) - 1) * 1.1);  
  }  
    
  function dedupeStickyNoteComponents(components) {  
    const out = [];  
    for (const component of components) {  
      if (out.some((existing) => boxOverlapRatio(existing.box, component.box) > 0.62)) continue;  
      out.push(component);  
    }  
    return out;  
  }

  return {
    createCollaborationFlowShapes,
    createStickyNoteClusterShapes,
    shouldObjectifyCollaborationFlow
  };
}

module.exports = { createCollaborationStickyDiagramsFactory };
