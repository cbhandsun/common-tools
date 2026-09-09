"use strict";

function createWorkflowCollaborationMultiplierFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    applyMinimumUnitCropRenderStrategy,
    boxCenterY,
    clamp,
    clampPtBoxToSlide,
    comparisonWarningShapes,
    constrainPtBox,
    cropPng,
    createPrdAutoGenerationNarrativeTextBoxes,
    createProductCollaborationProtectedCrops,
    ensureDir,
    expandPtBox,
    fs,
    isFidelityFirstMinimumVisualUnit,
    lineBox,
    makeEdgeConnectedBackgroundTransparent,
    markTwoPanelChaosIllustrationPreserved,
    materializeOcrGridIcon,
    measureBranchCurvesFromAnchors,
    measuredFontSize,
    median,
    normalizeCjkText,
    normalizeMatrixLabel,
    path,
    protectProductCollaborationChallengeCrop,
    ptToPxBox,
    pxToPtBox,
    readPng,
    resolveAssetPathForIr,
    round,
    roundedBox,
    roundRatio,
    safeIdentifier,
    shouldObjectifyProductCollaborationChallenge,
    splitResidualLayerSource,
    temporaryAnswerWorkflowTextBox,
    workflowCollaborationBranchGlowStyle,
    workflowCollaborationHubLayerStyle,
    workflowSupplyChainTwoPanelEvidenceText,
    writePng
  } = dependencies;

  function createWorkflowCollaborationMultiplierObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!shouldObjectifyWorkflowCollaborationMultiplier(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    for (const image of page.images || []) {  
      image.source = {  
        ...(image.source || {}),  
        workflowCollaborationMultiplierObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow collaboration multiplier"}; rebuilt hub-and-branch collaboration diagram as native editable component`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.88,  
      expressionForm: "hub-and-branch-diagram",  
      expressionSubtype: "workflow-collaboration-multiplier",  
      ...extra  
    });  
    let shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    // This diagram has a measured cubic route implementation. Keep only the  
    // four authored pictorial icons as crops; the hub, branches, and cards stay  
    // native by default. A caller can still explicitly preserve the full left  
    // illustration when visual validation says the source is too irregular.  
    const leftGraphicCrop = options.preserveWorkflowCollaborationGraphic === true  
      ? createWorkflowCollaborationMultiplierGraphicCrop(page, slideSize, options)  
      : null;  
    const iconCrops = createWorkflowCollaborationIconCrops(page, slideSize, {  
      ...options,  
      includeHub: !leftGraphicCrop  
    });  
    const measuredBranches = measureWorkflowCollaborationBranches(page, slideSize);  
    if (leftGraphicCrop) page.images.push(leftGraphicCrop);  
    if (iconCrops.length > 0) page.images.push(...iconCrops);  
    addWorkflowCollaborationTitle(add, textBoxes, source);  
    if (!leftGraphicCrop) {  
      addWorkflowCollaborationBranches(add, source, measuredBranches);  
      addWorkflowCollaborationHub(add, textBoxes, source, iconCrops.length > 0);  
    }  
    addWorkflowCollaborationCards(add, textBoxes, source, iconCrops.length > 0);  
    addWorkflowCollaborationBottomBanner(add, textBoxes, source, slideSize);  
    return { shapes, textBoxes };  
  }  
    
  function measureWorkflowCollaborationBranches(page = {}, slideSize = DEFAULT_SLIDE) {  
    const sourceImageFile = page.sourceImage;  
    if (!sourceImageFile || !fs.existsSync(sourceImageFile)) return null;  
    const result = measureBranchCurvesFromAnchors(readPng(sourceImageFile), {  
      slideSize,  
      sourceBox: { x: 96, y: 216, w: 148, h: 148 },  
      targetBoxes: workflowCollaborationCards().map((card) => ({ x: 448, y: card.y, w: 482, h: 103 })),  
      sampleCount: 11,  
      searchRadiusPt: 58,  
      minimumCoverage: 0.72  
    });  
    return result.ok && result.confidence >= 0.72  
      ? {  
        ...result,  
        curves: result.curves.map((curve) => ({  
          ...curve,  
          routeColor: result.routeColor,  
          routeColorMode: result.routeColorMode,  
          routeColorConfidence: result.routeColorConfidence  
        }))  
      }  
      : null;  
  }  
    
  function createWorkflowCollaborationIconCrops(page = {}, slideSize = DEFAULT_SLIDE, options = {}) {  
    const sourceImageFile = page.sourceImage || options.sourceImage;  
    if (!sourceImageFile || !fs.existsSync(sourceImageFile)) return [];  
    const deckName = options.deckName || "deck";  
    const pageNumber = Number.isFinite(Number(options.pageIndex))  
      ? Number(options.pageIndex) + 1  
      : Number(page.pageIndex || 0) + 1;  
    const assetDir = options.assetDir || (options.irDir ? path.join(options.irDir, `${deckName}.assets`) : null);  
    if (!assetDir) return [];  
    const sourceImage = readPng(sourceImageFile);  
    const units = [  
      { key: "hub", box: { x: 137, y: 217, w: 67, h: 59 }, subtype: "processor-chip-icon" },  
      { key: "be", box: { x: 468, y: 113, w: 80, h: 80 }, subtype: "database-server-icon" },  
      { key: "fe", box: { x: 468, y: 237, w: 80, h: 80 }, subtype: "browser-window-icon" },  
      { key: "qa", box: { x: 468, y: 360, w: 82, h: 88 }, subtype: "qa-checklist-icon" }  
    ];  
    ensureDir(assetDir);  
    return units  
      .filter((unit) => options.includeHub !== false || unit.key !== "hub")  
      .map((unit) => {  
      const fileName = `${deckName}-p${String(pageNumber).padStart(2, "0")}-workflow-collab-${unit.key}-icon.png`;  
      const cropped = cropPng(sourceImage, ptToPxBox(unit.box, sourceImage, slideSize, 0));  
      const isolated = unit.key === "hub"  
        ? makeEdgeConnectedBackgroundTransparent(cropped, { transparentDistance: 12, maximumDistance: 68 })  
        : cropped;  
      writePng(path.join(assetDir, fileName), isolated);  
      return {  
        id: `workflow-collab-${unit.key}-icon-crop`,  
        type: "fidelity-crop",  
        assetPath: `${deckName}.assets/${fileName}`,  
        box: unit.box,  
        source: {  
          editable: false,  
          detector: "workflow-collab-icon-minimum-unit-crop",  
          confidence: 0.94,  
          expressionForm: "icon-or-illustration",  
          expressionSubtype: unit.subtype,  
          strategy: "minimum-visual-unit-crop",  
          recommendedAction: "match-icon-library-or-keep-local-crop",  
          skipVisualAtomRebuild: true,  
          nonEditableReason: "complex pictorial icon preserved as one minimum visual unit while its card, text, and connecting route remain native editable"  
        }  
      };  
      });  
  }  
    
  function createWorkflowCollaborationMultiplierGraphicCrop(page = {}, slideSize = DEFAULT_SLIDE, options = {}) {  
    const sourceImageFile = page.sourceImage || options.sourceImage;  
    if (!sourceImageFile || !fs.existsSync(sourceImageFile)) return null;  
    const deckName = options.deckName || "deck";  
    const pageNumber = Number.isFinite(Number(options.pageIndex))  
      ? Number(options.pageIndex) + 1  
      : Number(page.pageIndex || 0) + 1;  
    const assetDir = options.assetDir || (options.irDir ? path.join(options.irDir, `${deckName}.assets`) : null);  
    if (!assetDir) return null;  
    const sourceImage = readPng(sourceImageFile);  
    // Stop at the card edge so the crop cannot reintroduce card text or chrome.  
    const cropBox = { x: 36, y: 145, w: 412, h: 300 };  
    const pxBox = ptToPxBox(cropBox, sourceImage, slideSize, 0);  
    ensureDir(assetDir);  
    const fileName = `${deckName}-p${String(pageNumber).padStart(2, "0")}-workflow-collab-left-graphic.png`;  
    const file = path.join(assetDir, fileName);  
    writePng(file, cropPng(sourceImage, pxBox));  
    return {  
      id: "workflow-collab-left-graphic-crop",  
      type: "fidelity-crop",  
      assetPath: `${deckName}.assets/${fileName}`,  
      box: cropBox,  
      source: {  
        editable: false,  
        detector: "workflow-collab-left-graphic-crop",  
        reason: "hub-and-curved-branches-preserved-as-local-component-crop",  
        strategy: "local-fidelity-crop",  
        expressionForm: "hub-and-branch-diagram",  
        expressionSubtype: "workflow-collaboration-multiplier-left-graphic",  
        recommendedAction: "preserve-local-crop",  
        skipVisualAtomRebuild: true,  
        nonEditableReason: "PM Skills hub and curved branch graphic preserved as a local crop because the current OpenXML generator only supports straight/elbow connectors; right cards and banner remain native editable"  
      }  
    };  
  }  
    
  function createWorkflowCollaborationCardBackgroundCrop(page = {}, nativeTextBoxes = [], rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    const sourceImageFile = page.sourceImage || options.sourceImage;  
    if (!sourceImageFile || !fs.existsSync(sourceImageFile)) return null;  
    const deckName = options.deckName || "deck";  
    const pageNumber = Number.isFinite(Number(options.pageIndex))  
      ? Number(options.pageIndex) + 1  
      : Number(page.pageIndex || 0) + 1;  
    const assetDir = options.assetDir || (options.irDir ? path.join(options.irDir, `${deckName}.assets`) : null);  
    if (!assetDir) return null;  
    const sourceImage = readPng(sourceImageFile);  
    const cardRegion = { x: 448, y: 96, w: 482, h: 356 };  
    const nativeMasks = (nativeTextBoxes || [])  
      .filter((textBox) => textBox?.source?.role === "card-title" || textBox?.source?.role === "card-body")  
      .map((textBox) => ptToPxBox(expandPtBox(textBox.box, slideSize, 9, 7), sourceImage, slideSize, 0));  
    const rawMasks = (rawTextBoxes || [])  
      .filter((textBox) => boxCenterInside(textBox.box, cardRegion))  
      .map((textBox) => ptToPxBox(expandPtBox(textBox.box, slideSize, 8, 6), sourceImage, slideSize, 0));  
    const textMasks = [...nativeMasks, ...rawMasks];  
    const erased = textMasks.length > 0 ? eraseMasks(sourceImage, textMasks) : sourceImage;  
    const crop = cropPng(erased, ptToPxBox(cardRegion, sourceImage, slideSize, 0));  
    ensureDir(assetDir);  
    const fileName = `${deckName}-p${String(pageNumber).padStart(2, "0")}-workflow-collab-card-backgrounds.png`;  
    const file = path.join(assetDir, fileName);  
    writePng(file, crop);  
    return {  
      id: "workflow-collab-card-backgrounds-crop",  
      type: "fidelity-crop",  
      assetPath: `${deckName}.assets/${fileName}`,  
      box: cardRegion,  
      source: {  
        editable: false,  
        detector: "workflow-collab-card-backgrounds-crop",  
        reason: "right-card-backgrounds-icons-shadows-preserved-with-text-erased",  
        strategy: "local-fidelity-crop",  
        expressionForm: "card-stack-component",  
        expressionSubtype: "workflow-collaboration-multiplier-card-backgrounds",  
        recommendedAction: "keep-local-crop-and-overlay-external-text-only",  
        skipVisualAtomRebuild: true,  
        textErasedFromCrop: textMasks.length > 0,  
        nonEditableReason: "right card chrome, icons, shadows, and accents preserved as a text-erased local crop while titles and descriptions remain native editable text"  
      }  
    };  
  }  
    
  function isWorkflowCollaborationCardChromeShape(shape = {}) {  
    const detector = String(shape.source?.detector || "");  
    return detector === "workflow-collab-multiplier-native-card-shadow"  
      || detector === "workflow-collab-multiplier-native-card"  
      || detector === "workflow-collab-multiplier-native-card-accent"  
      || detector === "workflow-collab-multiplier-native-card-icon"  
      || detector === "workflow-collab-multiplier-native-card-icon-detail";  
  }  
    
  function markWorkflowCollaborationCardTextAsErasedOverlay(textBoxes = [], cardBackground = {}) {  
    for (const textBox of textBoxes || []) {  
      const role = textBox?.source?.role;  
      if (role !== "card-title" && role !== "card-body") continue;  
      textBox.source = {  
        ...(textBox.source || {}),  
        layerSourceId: cardBackground.id,  
        textErasedFromCrop: true  
      };  
    }  
  }  
    
  function shouldObjectifyWorkflowCollaborationMultiplier(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/协同倍增器/.test(labels) || !/下游研发视角/.test(labels)) return false;  
    if (!/PMSkills/.test(labels) || !/处理引擎/.test(labels)) return false;  
    const roleHits = [/To后端研发BE/, /To前端研发FE/, /To测试QA/].filter((pattern) => pattern.test(labels)).length;  
    if (roleHits < 3) return false;  
    if (!/研发返工率大幅降低/.test(labels) || !/全链路降本/.test(labels)) return false;  
    const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const hasUsefulRaster = (page.images || []).some((image) => {  
      const box = image.box || {};  
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, slideArea);  
      const detector = String(image.source?.detector || image.source?.reason || "");  
      return areaRatio > 0.2 || /collaboration-flow|source-background|underlay|full-slide/i.test(detector);  
    });  
    return hasUsefulRaster || rawTextBoxes.length >= 12;  
  }  
    
  function addWorkflowCollaborationTitle(add, textBoxes, source) {  
    add({  
      id: "workflow-collab-top-rail-blue",  
      type: "rect",  
      box: { x: 0, y: 0, w: 807, h: 5 },  
      style: { fill: "#0B74D1", stroke: "#0B74D1", strokeWidthPt: 0 },  
      source: source("workflow-collab-multiplier-native-top-rail", { part: "blue" })  
    });  
    add({  
      id: "workflow-collab-top-rail-green",  
      type: "rect",  
      box: { x: 818, y: 0, w: 142, h: 5 },  
      style: { fill: "#22B873", stroke: "#22B873", strokeWidthPt: 0 },  
      source: source("workflow-collab-multiplier-native-top-rail", { part: "green" })  
    });  
    textBoxes.push(temporaryAnswerWorkflowTextBox(  
      "workflow-collab-title",  
      "协同倍增器：下游研发视角的“隐藏红利”",  
      { x: 45, y: 39, w: 575, h: 39 },  
      { sizePt: 29, color: "#000000", weight: "bold", align: "left" },  
      source("workflow-collab-multiplier-native-text", { role: "title" })  
    ));  
  }  
    
  function addWorkflowCollaborationHub(add, textBoxes, source, preserveIcon = false) {  
    const hub = { x: 96, y: 216, w: 148, h: 148 };  
    const hubLayers = workflowCollaborationHubLayerStyle();  
    add({ id: "workflow-collab-hub-glow-outer", type: "ellipse", box: { x: 47, y: 167, w: 246, h: 246 }, style: { fill: "#BFF2D2", stroke: "none", strokeWidthPt: 0, opacity: 0.28 }, source: source("workflow-collab-multiplier-native-hub-glow", { ring: "outer" }) });  
    add({ id: "workflow-collab-hub-glow-inner", type: "ellipse", box: { x: 72, y: 192, w: 196, h: 196 }, style: { fill: "#83E7AE", stroke: "none", strokeWidthPt: 0, opacity: 0.34 }, source: source("workflow-collab-multiplier-native-hub-glow", { ring: "inner" }) });  
    add({ id: "workflow-collab-hub-core", type: "ellipse", box: hub, style: { fill: "#21C86B", stroke: "#159955", strokeWidthPt: 1.2, opacity: 0.97, shadow: { color: "#139353", alpha: 0.16, blurPt: 5, distancePt: 1.2, angle: 45 } }, source: source("workflow-collab-multiplier-native-hub-core") });  
    add({ id: "workflow-collab-hub-highlight", type: "ellipse", box: { x: 106, y: 222, w: 128, h: 82 }, style: { ...hubLayers.highlight, stroke: "none", strokeWidthPt: 0 }, source: source("workflow-collab-multiplier-native-hub-tone", { layer: "highlight" }) });  
    add({ id: "workflow-collab-hub-shade", type: "ellipse", box: { x: 106, y: 292, w: 128, h: 62 }, style: { ...hubLayers.shade, stroke: "none", strokeWidthPt: 0 }, source: source("workflow-collab-multiplier-native-hub-tone", { layer: "shade" }) });  
    if (!preserveIcon) {  
      add({ id: "workflow-collab-hub-chip", type: "roundRect", box: { x: 146, y: 232, w: 48, h: 35 }, style: { fill: "#F3FFF8", stroke: "#BFECCF", strokeWidthPt: 0.7, radiusRatio: 0.08, opacity: 0.92 }, source: source("workflow-collab-multiplier-native-hub-icon") });  
      add({ id: "workflow-collab-hub-chip-line-1", type: "line", box: { x: 155, y: 245, w: 29, h: 0 }, style: { stroke: "#66C894", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("workflow-collab-multiplier-native-hub-icon-line", { lineIndex: 1 }) });  
      add({ id: "workflow-collab-hub-chip-line-2", type: "line", box: { x: 155, y: 255, w: 23, h: 0 }, style: { stroke: "#66C894", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("workflow-collab-multiplier-native-hub-icon-line", { lineIndex: 2 }) });  
    }  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-collab-hub-pm-skills", "PM Skills", { x: 106, y: 280, w: 128, h: 25 }, { sizePt: 21, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-collab-multiplier-native-text", { role: "hub-label" })));  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-collab-hub-engine", "处理引擎", { x: 111, y: 309, w: 118, h: 29 }, { sizePt: 21, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-collab-multiplier-native-text", { role: "hub-label" })));  
  }  
    
  function addWorkflowCollaborationCards(add, textBoxes, source, preserveIcons = false) {  
    workflowCollaborationCards().forEach((card, index) => {  
      const cardBox = { x: 448, y: card.y, w: 482, h: 103 };  
      addWorkflowCollaborationCard(add, textBoxes, source, cardBox, card, index, preserveIcons);  
    });  
  }  
    
  function workflowCollaborationCards() {  
    return [  
      {  
        key: "be",  
        y: 100,  
        title: "To 后端研发 BE",  
        body: "消除模糊地带。输出清晰的后端接口拆解建议（单\n据策略读取、已关闭出库单数量查询）。",  
        icon: "database"  
      },  
      {  
        key: "fe",  
        y: 224,  
        title: "To 前端研发 FE",  
        body: "告别交互拉扯。直接供给明确的阻断校验规则、边\n界值计算公式及高保真原型。",  
        icon: "screen"  
      },  
      {  
        key: "qa",  
        y: 347,  
        title: "To 测试 QA",  
        body: "更严密的用例参考。通过前置暴露异常场景（越库\n失败、发货扣减），直接转化为高覆盖率测试依据。",  
        icon: "checklist"  
      }  
    ];  
  }  
    
  function addWorkflowCollaborationBranches(add, source, measuredBranches = null) {  
    workflowCollaborationCards().forEach((card, index) => {  
      const cardBox = { x: 448, y: card.y, w: 482, h: 103 };  
      addWorkflowCollaborationBranch(add, source, cardBox, index, card.key, measuredBranches?.curves?.[index] || null);  
    });  
  }  
    
  function addWorkflowCollaborationBranch(add, source, cardBox, index, key, measuredCurve = null) {  
    const from = { x: 236, y: index === 0 ? 244 : index === 1 ? 290 : 334 };  
    const to = { x: cardBox.x + 8, y: cardBox.y + cardBox.h / 2 };  
    if (Array.isArray(measuredCurve?.points) && measuredCurve.points.length >= 5) {  
      const branch = workflowCollaborationMeasuredCurve(  
        `workflow-collab-branch-${key}`,  
        measuredCurve.points,  
        source,  
        key,  
        measuredCurve  
      );  
      addWorkflowCollaborationBranchGlow(add, source, branch, key);  
      add(branch);  
      return;  
    }  
    const controls = index === 0  
      ? [{ x: 324, y: 244 }, { x: 330, y: to.y }]  
      : index === 1  
        ? [{ x: 318, y: 290 }, { x: 365, y: to.y }]  
        : [{ x: 320, y: 334 }, { x: 332, y: to.y }];  
    const branch = workflowCollaborationCurve(`workflow-collab-branch-${key}`, from, controls[0], controls[1], to, source, key);  
    addWorkflowCollaborationBranchGlow(add, source, branch, key);  
    add(branch);  
  }  
    
  function addWorkflowCollaborationBranchGlow(add, source, branch, key) {  
    // PowerPoint has no reliable freeform blur across renderers. A wider,  
    // translucent curve gives the source's soft blue-green falloff while  
    // keeping the route independently editable.  
    add({  
      ...branch,  
      id: `${branch.id}-glow`,  
      style: {  
        ...branch.style,  
        ...workflowCollaborationBranchGlowStyle()  
      },  
      source: source("workflow-collab-multiplier-native-branch-glow", { role: key, layer: "soft-underlay" })  
    });  
  }  
    
  function workflowCollaborationMeasuredCurve(id, measuredPoints, source, role, measurement = {}) {  
    const points = measuredPoints.map((point) => ({ x: Number(point.x), y: Number(point.y) }));  
    const xs = points.map((point) => point.x);  
    const ys = points.map((point) => point.y);  
    const box = {  
      x: Math.min(...xs),  
      y: Math.min(...ys),  
      w: Math.max(1, Math.max(...xs) - Math.min(...xs)),  
      h: Math.max(1, Math.max(...ys) - Math.min(...ys))  
    };  
    const normalize = (point) => ({  
      x: roundRatio((point.x - box.x) / box.w),  
      y: roundRatio((point.y - box.y) / box.h)  
    });  
    const segments = [{ type: "moveTo", points: [normalize(points[0])] }];  
    for (let index = 0; index < points.length - 1; index += 1) {  
      const p0 = points[Math.max(0, index - 1)];  
      const p1 = points[index];  
      const p2 = points[index + 1];  
      const p3 = points[Math.min(points.length - 1, index + 2)];  
      segments.push({  
        type: "cubicBezTo",  
        points: [  
          normalize({ x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }),  
          normalize({ x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }),  
          normalize(p2)  
        ]  
      });  
    }  
    return {  
      id,  
      type: "freeform",  
      box,  
      points: points.map(normalize),  
      style: workflowCollaborationCurveStyle(segments),  
      source: source("workflow-collab-multiplier-native-branch", {  
        role,  
        segment: "pixel-measured-cubic",  
        measurementMode: "pixel-anchor-centerline",  
        measurementConfidence: roundRatio(measurement.confidence),  
        routeColor: measurement.routeColor || null,  
        routeColorMode: measurement.routeColorMode || null,  
        routeColorConfidence: Number.isFinite(Number(measurement.routeColorConfidence))  
          ? roundRatio(measurement.routeColorConfidence)  
          : null  
      })  
    };  
  }  
    
  function workflowCollaborationCurve(id, from, control1, control2, to, source, role) {  
    const points = [from, control1, control2, to];  
    const xs = points.map((point) => point.x);  
    const ys = points.map((point) => point.y);  
    const box = {  
      x: Math.min(...xs),  
      y: Math.min(...ys),  
      w: Math.max(1, Math.max(...xs) - Math.min(...xs)),  
      h: Math.max(1, Math.max(...ys) - Math.min(...ys))  
    };  
    const normalize = (point) => ({  
      x: roundRatio((point.x - box.x) / box.w),  
      y: roundRatio((point.y - box.y) / box.h)  
    });  
    return {  
      id,  
      type: "freeform",  
      box,  
      points: points.map(normalize),  
      style: workflowCollaborationCurveStyle([  
        { type: "moveTo", points: [normalize(from)] },  
        { type: "cubicBezTo", points: [normalize(control1), normalize(control2), normalize(to)] }  
      ]),  
      source: source("workflow-collab-multiplier-native-branch", { role, segment: "cubic", measurementMode: "semantic-template" })  
    };  
  }  
    
  function workflowCollaborationCurveStyle(freeformSegments) {  
    return {  
      fill: "none",  
      stroke: "#0578DD",  
      strokeWidthPt: 10,  
      closePath: false,  
      lineCap: "round",  
      lineJoin: "round",  
      opacity: 0.9,  
      freeformSegments  
    };  
  }  
    
  function addWorkflowCollaborationCard(add, textBoxes, source, cardBox, card, index, preserveIcon = false) {  
    add({ id: `workflow-collab-card-shadow-${card.key}`, type: "roundRect", box: { x: cardBox.x + 3, y: cardBox.y + 5, w: cardBox.w, h: cardBox.h }, style: { fill: "#9FAEBC", stroke: "none", strokeWidthPt: 0, radiusPt: 8, opacity: 0.28 }, source: source("workflow-collab-multiplier-native-card-shadow", { role: card.key, cardIndex: index }) });  
    add({ id: `workflow-collab-card-${card.key}`, type: "roundRect", box: cardBox, style: { fill: "#FFFFFF", stroke: "#B8C8D4", strokeWidthPt: 1.35, radiusPt: 8, opacity: 1 }, source: source("workflow-collab-multiplier-native-card", { role: card.key, cardIndex: index }) });  
    add({ id: `workflow-collab-card-accent-${card.key}`, type: "rect", box: { x: cardBox.x + cardBox.w - 198, y: cardBox.y, w: 190, h: 7 }, style: { fill: "#0878D7", stroke: "#0878D7", strokeWidthPt: 0, opacity: 0.98, radiusPt: 3 }, source: source("workflow-collab-multiplier-native-card-accent", { role: card.key }) });  
    if (!preserveIcon) addWorkflowCollaborationCardIcon(add, source, { x: cardBox.x + 24, y: cardBox.y + 27, w: 68, h: 55 }, card);  
    // The source OCR anchors show a consistent PowerPoint baseline offset for  
    // the card copy. Keep the card geometry fixed and align only its text ink.  
    textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-collab-card-title-${card.key}`, card.title, { x: 562, y: cardBox.y + 15, w: 230, h: 27 }, { sizePt: 21, color: "#000000", weight: "bold", align: "left" }, source("workflow-collab-multiplier-native-text", { role: "card-title", key: card.key })));  
    textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-collab-card-body-${card.key}`, card.body, { x: 562, y: cardBox.y + 44, w: 352, h: 45 }, { sizePt: 15.2, color: "#000000", weight: "regular", align: "left" }, source("workflow-collab-multiplier-native-text", { role: "card-body", key: card.key })));  
  }  
    
  function addWorkflowCollaborationCardIcon(add, source, box, card) {  
    add({ id: `workflow-collab-card-icon-bg-${card.key}`, type: "roundRect", box, style: { fill: "#EAF5FF", stroke: "#4FA0E2", strokeWidthPt: 1.2, radiusPt: 5, opacity: 0.95 }, source: source("workflow-collab-multiplier-native-card-icon", { role: card.key, icon: card.icon }) });  
    if (card.icon === "database") {  
      add({ id: `workflow-collab-card-icon-db-stack-${card.key}`, type: "rect", box: { x: box.x + 6, y: box.y + 7, w: 31, h: 34 }, style: { fill: "#2F86D8", stroke: "#2F86D8", strokeWidthPt: 0, radiusPt: 3, opacity: 0.92 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "database-stack" }) });  
      [0, 1, 2].forEach((lineIndex) => add({ id: `workflow-collab-card-icon-db-line-${card.key}-${lineIndex}`, type: "line", box: { x: box.x + 12, y: box.y + 14 + lineIndex * 10, w: 21, h: 0 }, style: { stroke: "#BFE0FF", strokeWidthPt: 2, connectorType: "straight", lineCap: "round" }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "database-line", lineIndex }) }));  
      add({ id: `workflow-collab-card-icon-db-cylinder-${card.key}`, type: "ellipse", box: { x: box.x + 37, y: box.y + 19, w: 28, h: 16 }, style: { fill: "#66A8E7", stroke: "#2F86D8", strokeWidthPt: 1.2 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "database-cylinder" }) });  
      return;  
    }  
    if (card.icon === "screen") {  
      add({ id: `workflow-collab-card-icon-screen-${card.key}`, type: "rect", box: { x: box.x + 7, y: box.y + 8, w: 53, h: 37 }, style: { fill: "#FFFFFF", stroke: "#2F86D8", strokeWidthPt: 2 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "screen" }) });  
      add({ id: `workflow-collab-card-icon-screen-head-${card.key}`, type: "rect", box: { x: box.x + 11, y: box.y + 13, w: 45, h: 8 }, style: { fill: "#A8D2F6", stroke: "none", strokeWidthPt: 0 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "screen-head" }) });  
      add({ id: `workflow-collab-card-icon-screen-pane-${card.key}`, type: "rect", box: { x: box.x + 12, y: box.y + 25, w: 19, h: 15 }, style: { fill: "#CDE5FA", stroke: "none", strokeWidthPt: 0 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "screen-pane" }) });  
      return;  
    }  
    add({ id: `workflow-collab-card-icon-board-${card.key}`, type: "rect", box: { x: box.x + 15, y: box.y + 7, w: 32, h: 39 }, style: { fill: "#EAF5FF", stroke: "#2F86D8", strokeWidthPt: 2, radiusPt: 3 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "board" }) });  
    add({ id: `workflow-collab-card-icon-check-bg-${card.key}`, type: "ellipse", box: { x: box.x + 39, y: box.y + 29, w: 29, h: 29 }, style: { fill: "#2F86D8", stroke: "#2F86D8", strokeWidthPt: 0 }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "check-bg" }) });  
    add({ id: `workflow-collab-card-icon-check-a-${card.key}`, type: "line", box: lineBox({ x: box.x + 47, y: box.y + 43 }, { x: box.x + 53, y: box.y + 49 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "check-a" }) });  
    add({ id: `workflow-collab-card-icon-check-b-${card.key}`, type: "line", box: lineBox({ x: box.x + 53, y: box.y + 49 }, { x: box.x + 64, y: box.y + 36 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("workflow-collab-multiplier-native-card-icon-detail", { role: card.key, part: "check-b" }) });  
  }  
    
  function addWorkflowCollaborationBottomBanner(add, textBoxes, source, slideSize = DEFAULT_SLIDE) {  
    const width = Math.min(904, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 56);  
    add({ id: "workflow-collab-bottom-banner", type: "roundRect", box: { x: 28, y: 468, w: width, h: 43 }, style: { fill: "#0575D9", stroke: "#0569C5", strokeWidthPt: 0.9, radiusPt: 4, opacity: 0.98 }, source: source("workflow-collab-multiplier-native-bottom-banner") });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-collab-bottom-banner-text", "研发返工率大幅降低，实现从单兵提效到全链路降本。", { x: 215, y: 481, w: 510, h: 23 }, { sizePt: 18, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-collab-multiplier-native-text", { role: "bottom-banner" })));  
  }

  return {
    createWorkflowCollaborationMultiplierObjects,
    shouldObjectifyWorkflowCollaborationMultiplier
  };
}

module.exports = {
  createWorkflowCollaborationMultiplierFactory
};
