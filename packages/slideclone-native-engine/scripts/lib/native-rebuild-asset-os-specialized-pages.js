"use strict";

function createAssetOsSpecializedPagesFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    applyMinimumUnitCropRenderStrategy,
    clamp,
    clampPtBoxToSlide,
    cropPng,
    createEntropyChallengeAnnotationObjects,
    createEntropyChallengeFooterBulletShapes,
    createEntropyChallengeFragmentShapes,
    createEntropyChallengeIslandShapes,
    ensureDir,
    findTextBoxByNormalizedText,
    markTwoPanelChaosIllustrationPreserved,
    markProtectedComplexDiagramMinimumUnit,
    normalizeCjkText,
    path,
    ptToPxBox,
    pxToPtBox,
    readPng,
    refineGraphicCrop,
    resolveAssetPathForIr,
    round,
    roundedBox,
    sampleWorkflowMatrixCellFill,
    safeIdentifier,
    shouldAutoObjectifyEntropyIsland,
    splitResidualLayerSource,
    temporaryAnswerWorkflowTextBox,
    workflowComparisonMeasuredFontSize,
    workflowComparisonMeasuredTextBox,
    writePng
  } = dependencies;

  function createAssetOsDemandUnderstandingAssistantObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!shouldObjectifyAssetOsDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");  
    if (options.allowNativeApproximation !== true) {  
      markProtectedComplexDiagramMinimumUnit(sourceImages, {  
        detector: "asset-os-demand-understanding-protected-diagram-crop",  
        expressionSubtype: "asset-os-demand-understanding-diagram",  
        reason: "multi-icon demand-understanding assistant diagram kept as protected visual units; current native approximation is lower-fidelity than the crops"  
      });  
      return { shapes: [], textBoxes: [] };  
    }  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        assetOsDemandUnderstandingAssistantObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "demand understanding assistant diagram"}; rebuilt demand-understanding assistant diagram as native editable components`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      componentOwnerId: "asset-os-demand-understanding-native-component",  
      componentOwnerKind: "demand-understanding-assistant",  
      confidence: 0.9,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const images = [];  
    const add = (shape) => shapes.push(shape);  
    
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-title", "需求理解助手：将混沌输入转化为结构化认知", { x: 52, y: 51, w: 612, h: 42 }, { sizePt: 29, color: "#1E6FA8", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "title" })));  
    const gemIconCrop = createAssetOsDemandUnderstandingIconCrop({  
      box: { x: 52, y: 105, w: 50, h: 40 },  
      options,  
      slideSize,  
      role: "gem",  
      cropName: "gem-icon"  
    });  
    if (gemIconCrop) images.push(gemIconCrop);  
    else {  
      add({ id: "asset-os-demand-understanding-gem-band-icon-bg", type: "rect", box: { x: 52, y: 105, w: 50, h: 40 }, style: { fill: "#D8F0DF", stroke: "none", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-os-demand-understanding-native-gem-band") });  
      addAssetOsDemandGem(add, source, 62, 112);  
    }  
    add({ id: "asset-os-demand-understanding-gem-band", type: "rect", box: { x: 101, y: 105, w: 627, h: 40 }, style: { fill: "#16A65F", stroke: "#149452", strokeWidthPt: 1, radiusPt: 3 }, source: source("asset-os-demand-understanding-native-gem-band") });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-gem-text", "【Gem 提炼】：输出包含目标、流程、角色与异常边界的可审查蓝图（Brief）。", { x: 112, y: 114, w: 606, h: 22 }, { sizePt: 13.2, color: "#FFFFFF", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "gem-band" })));  
    
    const notes = inferAssetOsDemandUnderstandingNoteLayout(rawTextBoxes);  
    notes.forEach((note, index) => {  
      add({ id: `asset-os-demand-understanding-note-${index}`, type: "rect", box: { x: note.x, y: note.y, w: note.w, h: note.h }, style: { fill: "#F1F2F3", stroke: "#9A9A9A", strokeWidthPt: 1.1, radiusPt: 3, rotate: note.rotate, shadow: { color: "#A4A4A4", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("asset-os-demand-understanding-native-input-note", { index }) });  
      add({ id: `asset-os-demand-understanding-note-fold-${index}`, type: "triangle", box: { x: note.x + note.w - 19, y: note.y + note.h - 14, w: 20, h: 15 }, style: { fill: "#D9DADB", stroke: "#A1A1A1", strokeWidthPt: 0.8, rotate: note.rotate + 90 }, source: source("asset-os-demand-understanding-native-input-note-fold", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-demand-understanding-note-text-${index}`, note.label, { x: note.x + 12, y: note.textY + 1, w: note.w - 24, h: 20 }, { sizePt: 12.4, color: "#111111", weight: "regular", align: "center", rotate: note.rotate }, source("asset-os-demand-understanding-native-text", { role: "input-note", index })));  
    });  
    
    // A filled Bezier brace preserves the source's converging silhouette; four  
    // straight connector segments looked like a blocky letter instead.  
    add({  
      id: "asset-os-demand-understanding-brace",  
      type: "freeform",  
      box: { x: 278, y: 199, w: 58, h: 238 },  
      style: {  
        fill: "#B7B7B7",  
        stroke: "none",  
        closePath: true,  
        freeformSegments: [  
          { type: "moveTo", points: [{ x: 0.60, y: 0 }] },  
          { type: "lnTo", points: [{ x: 1, y: 0 }] },  
          { type: "cubicBezTo", points: [{ x: 0.82, y: 0.08 }, { x: 0.82, y: 0.28 }, { x: 0.82, y: 0.40 }] },  
          { type: "cubicBezTo", points: [{ x: 0.82, y: 0.46 }, { x: 1, y: 0.47 }, { x: 1, y: 0.50 }] },  
          { type: "cubicBezTo", points: [{ x: 1, y: 0.53 }, { x: 0.82, y: 0.54 }, { x: 0.82, y: 0.60 }] },  
          { type: "cubicBezTo", points: [{ x: 0.82, y: 0.72 }, { x: 0.82, y: 0.92 }, { x: 1, y: 1 }] },  
          { type: "lnTo", points: [{ x: 0.60, y: 1 }] },  
          { type: "cubicBezTo", points: [{ x: 0.68, y: 0.91 }, { x: 0.68, y: 0.69 }, { x: 0.68, y: 0.61 }] },  
          { type: "cubicBezTo", points: [{ x: 0.68, y: 0.55 }, { x: 0.51, y: 0.53 }, { x: 0.20, y: 0.50 }] },  
          { type: "cubicBezTo", points: [{ x: 0.51, y: 0.47 }, { x: 0.68, y: 0.45 }, { x: 0.68, y: 0.39 }] },  
          { type: "cubicBezTo", points: [{ x: 0.68, y: 0.31 }, { x: 0.68, y: 0.09 }, { x: 0.60, y: 0 }] },  
          { type: "close" }  
        ]  
      },  
      source: source("asset-os-demand-understanding-native-brace")  
    });  
    
    const skillIconCrop = createAssetOsDemandUnderstandingIconCrop({  
      box: { x: 436, y: 264, w: 100, h: 74 },  
      options,  
      slideSize,  
      role: "skill-icon",  
      cropName: "skill-icon"  
    });  
    if (skillIconCrop) images.push(skillIconCrop);  
    addAssetOsDemandSkillCard(add, source, { preserveIconCrop: Boolean(skillIconCrop) });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-skill-title", "需求理解\nAI Skill", { x: 445, y: 342, w: 118, h: 48 }, { sizePt: 14.5, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-demand-understanding-native-text", { role: "skill-title" })));  
    
    const outputs = inferAssetOsDemandUnderstandingOutputLayout(rawTextBoxes);  
    outputs.forEach((card, index) => {  
      const centerY = round(card.y + card.h / 2);  
      add({ id: `asset-os-demand-understanding-output-arrow-${index}`, type: "line", box: { x: 588, y: centerY, w: card.x - 598, h: 0 }, style: { stroke: "#21A963", strokeWidthPt: 5, connectorType: "straight", endArrow: "triangle" }, source: source("asset-os-demand-understanding-native-output-arrow", { index }) });  
      add({ id: `asset-os-demand-understanding-output-card-${index}`, type: "rect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#FFFFFF", stroke: "#14A75E", strokeWidthPt: 2.3, radiusPt: 5 }, source: source("asset-os-demand-understanding-native-output-card", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-demand-understanding-output-text-${index}`, card.label, { x: card.x + 10, y: card.textY + 1, w: card.w - 20, h: 21 }, { sizePt: 12.6, color: "#111111", weight: "bold", align: "center" }, source("asset-os-demand-understanding-native-text", { role: "output", index })));  
    });  
    
    const warningIconCrop = createAssetOsDemandUnderstandingIconCrop({  
      box: { x: 878, y: 405, w: 60, h: 57 },  
      options,  
      slideSize,  
      role: "warning",  
      cropName: "warning-icon"  
    });  
    if (warningIconCrop) images.push(warningIconCrop);  
    else {  
      add({ id: "asset-os-demand-understanding-warning", type: "triangle", box: { x: 885, y: 413, w: 44, h: 40 }, style: { fill: "#F58212", stroke: "#D46B00", strokeWidthPt: 1.1 }, source: source("asset-os-demand-understanding-native-warning") });  
      add({ id: "asset-os-demand-understanding-warning-bang", type: "line", box: { x: 907, y: 424, w: 0, h: 13 }, style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-warning-mark") });  
      add({ id: "asset-os-demand-understanding-warning-dot", type: "ellipse", box: { x: 904, y: 441, w: 6, h: 6 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("asset-os-demand-understanding-native-warning-mark") });  
    }  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-demand-understanding-warning-text", "前置拦截：AI 提前暴露出信息缺口，\n防止带着模糊认知进入开发", { x: 690, y: 462, w: 248, h: 36 }, { sizePt: 12.3, color: "#CF7A13", weight: "bold", align: "left" }, source("asset-os-demand-understanding-native-text", { role: "warning" })));  
    return { shapes, textBoxes: options.reuseSourceText === true ? [] : textBoxes, images };  
  }  
    
  function inferAssetOsDemandUnderstandingNoteLayout(rawTextBoxes = []) {  
    const specs = [  
      { label: "杂乱会议纪要", x: 63, y: 192, w: 137, h: 63, rotate: -4 },  
      { label: "口语化业务描述", x: 117, y: 257, w: 137, h: 63, rotate: 4 },  
      { label: "散落的竞品截图", x: 54, y: 322, w: 137, h: 63, rotate: -3 },  
      { label: "旧系统无头说明", x: 119, y: 382, w: 137, h: 63, rotate: 4 }  
    ];  
    return specs.map((spec) => {  
      const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);  
      const anchored = inferBoxFromTextAnchor(raw, spec, {  
        padX: 14,  
        extraW: 28,  
        extraH: 33,  
        anchorYRatio: 0.30,  
        minW: 126,  
        maxW: 145,  
        minH: 60,  
        maxH: 70,  
        minX: 45,  
        maxX: 130,  
        minY: 185,  
        maxY: 390  
      });  
      return {  
        ...spec,  
        ...anchored,  
        textY: round(raw?.box?.y ?? spec.y + 27)  
      };  
    });  
  }  
    
  function inferAssetOsDemandUnderstandingOutputLayout(rawTextBoxes = []) {  
    const specs = [  
      { label: "结构化业务流程与核心规则", x: 691, y: 202, w: 217, h: 66 },  
      { label: "清晰的角色与系统边界", x: 691, y: 286, w: 217, h: 66 },  
      { label: "待确认遗漏问题池", x: 691, y: 371, w: 217, h: 66 }  
    ];  
    return specs.map((spec) => {  
      const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);  
      const anchored = inferBoxFromTextAnchor(raw, spec, {  
        fixedW: spec.w,  
        fixedH: spec.h,  
        padX: 13,  
        padTop: 27,  
        minX: spec.x,  
        maxX: spec.x,  
        minY: 190,  
        maxY: 380  
      });  
      return {  
        ...spec,  
        ...anchored,  
        textY: round(raw?.box?.y ?? spec.y + 22)  
      };  
    });  
  }  
    
  function shouldObjectifyAssetOsDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/需求理解助手|Gem提炼|需求理解|AISkill|混沌输入|结构化认知|遗漏问题池/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    return candidates.length >= 3 && areaRatio > 0.35;  
  }  
    
  function shouldAutoObjectifyAssetOsDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (options.objectifyLayerConnectors !== true || options.objectifyStructuredVisualAtomText !== true) return false;  
    if (!shouldObjectifyAssetOsDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return false;  
    const labels = new Set((rawTextBoxes || []).map((item) => normalizeCjkText(item?.text)));  
    const requiredLabels = [  
      "杂乱会议纪要",  
      "口语化业务描述",  
      "散落的竞品截图",  
      "旧系统无头说明",  
      "结构化业务流程与核心规则",  
      "清晰的角色与系统边界",  
      "待确认遗漏问题池"  
    ];  
    const hasSkillLabel = labels.has("需求理解AISkill")  
      || (labels.has("需求理解") && [...labels].some((label) => /^a[li]skill$/i.test(label)));  
    return requiredLabels.every((label) => labels.has(label)) && hasSkillLabel;  
  }  
    
    
    
  function addAssetOsDemandGem(add, source, x, y) {  
    add({ id: "asset-os-demand-understanding-gem-top", type: "freeform", points: [{ x, y: y + 8 }, { x: x + 15, y }, { x: x + 31, y: y + 8 }, { x: x + 16, y: y + 30 }, { x, y: y + 8 }], box: { x, y, w: 31, h: 30 }, style: { fill: "#10B86B", stroke: "#0D8E53", strokeWidthPt: 1 }, source: source("asset-os-demand-understanding-native-gem") });  
    add({ id: "asset-os-demand-understanding-gem-shine", type: "line", box: { x: x + 8, y: y + 8, w: 14, h: 0 }, style: { stroke: "#B7FFD5", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-gem-shine") });  
  }  
    
  function createAssetOsDemandUnderstandingIconCrop({ box, options = {}, slideSize = DEFAULT_SLIDE, role, cropName } = {}) {  
    if (!options.sourceImage || !options.assetDir || !box || Number(box.w || 0) <= 0 || Number(box.h || 0) <= 0) return null;  
    ensureDir(options.assetDir);  
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;  
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-asset-os-demand-understanding-${cropName || role || "icon"}`, "asset-os-demand-understanding-icon");  
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);  
    const refinement = refineGraphicCrop(options.sourceImage, pxBox);  
    const file = path.join(options.assetDir, `${base}.png`);  
    writePng(file, refinement.image);  
    const refinedPxBox = {  
      x: pxBox.x + refinement.box.x,  
      y: pxBox.y + refinement.box.y,  
      w: refinement.box.w,  
      h: refinement.box.h  
    };  
    return {  
      id: `asset-os-demand-understanding-${cropName || role || "icon"}-crop`,  
      type: "fidelity-crop",  
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),  
      box: pxToPtBox(refinedPxBox, options.sourceImage, slideSize, 0),  
      source: {  
        editable: false,  
        nativeRebuild: true,  
        detector: "asset-os-demand-understanding-icon-crop",  
        strategy: "local-fidelity-crop",  
        expressionForm: "icon-or-illustration",  
        expressionSubtype: "asset-os-demand-understanding-icon",  
        recommendedAction: "keep-local-crop-for-complex-icon",  
        iconCropRefined: refinement.refined,  
        removedNeighborPixels: refinement.removedNeighborPixels, retainedDetailComponents: refinement.retainedDetailComponents,  
        role,  
        nonEditableReason: "complex icon retained as a local crop; flow remains editable"  
      }  
    };  
  }  
    
  function addAssetOsDemandSkillCard(add, source, { preserveIconCrop = false } = {}) {  
    add({ id: "asset-os-demand-understanding-skill-card", type: "rect", box: { x: 383, y: 222, w: 194, h: 196 }, style: { fill: "#0B72D9", stroke: "#0756A6", strokeWidthPt: 2, radiusPt: 8, shadow: { color: "#0B72D9", alpha: 0.18, blurPt: 7, distancePt: 1, angle: 45 } }, source: source("asset-os-demand-understanding-native-skill-card") });  
    add({ id: "asset-os-demand-understanding-skill-inner", type: "rect", box: { x: 396, y: 242, w: 167, h: 157 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 3, radiusPt: 7 }, source: source("asset-os-demand-understanding-native-skill-inner") });  
    if (preserveIconCrop) return;  
    add({ id: "asset-os-demand-understanding-skill-lens", type: "ellipse", box: { x: 460, y: 286, w: 42, h: 42 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-lens") });  
    add({ id: "asset-os-demand-understanding-skill-lens-handle", type: "line", box: { x: 493, y: 320, w: 30, h: 29 }, style: { stroke: "#FFFFFF", strokeWidthPt: 5, connectorType: "straight" }, source: source("asset-os-demand-understanding-native-skill-lens-handle") });  
    add({ id: "asset-os-demand-understanding-skill-gear-a", type: "ellipse", box: { x: 443, y: 319, w: 23, h: 23 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-gear") });  
    add({ id: "asset-os-demand-understanding-skill-gear-b", type: "ellipse", box: { x: 496, y: 270, w: 27, h: 27 }, style: { fill: "none", stroke: "#FFFFFF", strokeWidthPt: 4 }, source: source("asset-os-demand-understanding-native-skill-gear") });  
  }  
    
  function createAssetOsEntropyChallengeObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    if (!shouldObjectifyAssetOsEntropyChallenge(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => /^(?:split-wide-residual-crop|document-node-residual-crop)$/.test(image?.source?.detector || ""));  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        assetOsEntropyChallengeObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset entropy challenge diagram"}; rebuilt entropy challenge diagram as native editable document cards, risk nodes, dashboard, and connectors`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      componentOwnerId: "asset-os-entropy-challenge-native-component",  
      componentOwnerKind: "entropy-challenge-diagram",  
      confidence: 0.91,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const line = (id, from, to, stroke = "#C7CED7", width = 2.4, extra = {}) => {  
      const box = {  
        x: Math.min(from.x, to.x),  
        y: Math.min(from.y, to.y),  
        w: Math.abs(to.x - from.x),  
        h: Math.abs(to.y - from.y)  
      };  
      add({ id, type: "line", box, style: { stroke, strokeWidthPt: width, connectorType: "straight", endArrow: extra.endArrow || "triangle", opacity: extra.opacity || 0.95 }, source: source("asset-os-entropy-challenge-native-connector", extra) });  
    };  
    
    const notes = inferAssetOsEntropyNoteLayout(rawTextBoxes);  
    notes.forEach((note, index) => {  
      add({ id: `asset-os-entropy-note-${index}`, type: "rect", box: { x: note.x, y: note.y, w: note.w, h: note.h }, style: { fill: "#D6DCE4", stroke: "#CAD1DA", strokeWidthPt: 1, rotate: note.rotate, shadow: { color: "#8C98A6", alpha: 0.16, blurPt: 3, distancePt: 2, angle: 45 } }, source: source("asset-os-entropy-challenge-native-note", { index }) });  
      add({ id: `asset-os-entropy-note-fold-${index}`, type: "triangle", box: { x: note.x + note.w - 23, y: note.y + note.h - 17, w: 22, h: 18 }, style: { fill: "#BEC7D2", stroke: "#AEB8C5", strokeWidthPt: 0.8, rotate: note.rotate + 90 }, source: source("asset-os-entropy-challenge-native-note-fold", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-entropy-note-text-${index}`, note.label, { x: note.x + note.textInsetX, y: note.textY, w: note.w - note.textInsetX * 2, h: 24 }, { sizePt: index === 1 ? 17 : 16, color: "#111111", weight: "regular", align: "center", rotate: note.rotate }, source("asset-os-entropy-challenge-native-text", { role: "note", index })));  
    });  
    
    const risks = inferAssetOsEntropyRiskLayout(rawTextBoxes);  
    risks.forEach((risk, index) => {  
      add({ id: `asset-os-entropy-risk-${index}`, type: "ellipse", box: { x: risk.x, y: risk.y, w: risk.w, h: risk.h }, style: { fill: "#FF5B0A", stroke: "#F05B0A", strokeWidthPt: 1, shadow: { color: "#FF5B0A", alpha: 0.15, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("asset-os-entropy-challenge-native-risk", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-entropy-risk-text-${index}`, risk.label, { x: risk.x + 22, y: risk.y + 61, w: risk.w - 44, h: 28 }, { sizePt: 25, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "risk", index })));  
    });  
    
    const riskAnchors = risks.map((risk) => ({ x: risk.x + 6, y: risk.y + risk.h / 2 }));  
    const noteAnchors = notes.map((note) => ({ x: note.x + note.w + 1, y: note.y + note.h / 2 }));  
    line("asset-os-entropy-line-meeting-risk", noteAnchors[0], riskAnchors[0], "#C8D0D9", 2.2, { route: "meeting-to-bias" });  
    line("asset-os-entropy-line-prd-risk-a", noteAnchors[1], riskAnchors[0], "#C8D0D9", 2.2, { route: "prd-to-bias" });  
    line("asset-os-entropy-line-prd-risk-b", noteAnchors[1], riskAnchors[1], "#C8D0D9", 2.2, { route: "prd-to-rework" });  
    line("asset-os-entropy-line-feedback-risk-a", noteAnchors[2], riskAnchors[0], "#C8D0D9", 2.2, { route: "feedback-to-bias" });  
    line("asset-os-entropy-line-feedback-risk-b", noteAnchors[2], riskAnchors[1], "#C8D0D9", 2.2, { route: "feedback-to-rework" });  
    line("asset-os-entropy-line-screenshot-risk-a", noteAnchors[3], riskAnchors[2], "#C8D0D9", 2.2, { route: "screenshot-to-risk" });  
    line("asset-os-entropy-line-screenshot-risk-b", noteAnchors[3], { x: risks[2].x + 4, y: risks[2].y + 80 }, "#C8D0D9", 2.2, { route: "screenshot-to-risk-inner" });  
    
    const dashboard = inferAssetOsEntropyDashboardLayout(rawTextBoxes, slideSize);  
    line("asset-os-entropy-line-risk-dashboard", { x: 599, y: 342 }, { x: dashboard.x - 10, y: 342 }, "#D2D6DD", 3.2, { route: "risk-to-dashboard" });  
    add({ id: "asset-os-entropy-dashboard-frame", type: "rect", box: dashboard, style: { fill: "#FFFFFF", stroke: "#8195AB", strokeWidthPt: 7.2, radiusPt: 6 }, source: source("asset-os-entropy-challenge-native-dashboard") });  
    const header = { x: dashboard.x + 4, y: dashboard.y + 4, w: dashboard.w - 8, h: 50 };  
    add({ id: "asset-os-entropy-dashboard-header", type: "rect", box: header, style: { fill: "#8295AB", stroke: "#8295AB", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-os-entropy-challenge-native-dashboard-header") });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-entropy-dashboard-title", "交付看板", { x: header.x + 18, y: header.y + 13, w: header.w - 36, h: 30 }, { sizePt: 24, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "dashboard" })));  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-entropy-question", "?", { x: dashboard.x + dashboard.w * 0.31, y: dashboard.y + dashboard.h * 0.27, w: dashboard.w * 0.38, h: dashboard.h * 0.34 }, { sizePt: 92, color: "#FF5B0A", weight: "bold", align: "center" }, source("asset-os-entropy-challenge-native-text", { role: "question" })));  
    addAssetOsEntropyBrokenLink(add, source, dashboard);  
    return { shapes, textBoxes };  
  }  
    
  function inferAssetOsEntropyNoteLayout(rawTextBoxes = []) {  
    const specs = [  
      { label: "飞书会议记录", x: 154, y: 161, w: 136, h: 67, rotate: 9 },  
      { label: "旧版 PRD", x: 55, y: 271, w: 126, h: 84, rotate: -11 },  
      { label: "口头反馈", x: 158, y: 350, w: 132, h: 78, rotate: -12 },  
      { label: "业务截图", x: 258, y: 430, w: 132, h: 66, rotate: -14 }  
    ];  
    return specs.map((spec) => {  
      const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label) || findTextBoxByNormalizedText(rawTextBoxes, spec.label.replace(/\s+/g, ""));  
      const fallback = { ...spec, textInsetX: 14, textY: round(spec.y + spec.h * 0.38) };  
      const anchored = inferBoxFromTextAnchor(raw, fallback, {  
        padX: 14,  
        extraW: 34,  
        extraH: 30,  
        anchorYRatio: 0.38,  
        minW: Math.min(spec.w, 118),  
        maxW: Math.max(spec.w, 146),  
        minH: 62,  
        maxH: Math.max(spec.h, 84),  
        minX: 35,  
        maxX: 320,  
        minY: 145,  
        maxY: 430  
      });  
      return {  
        ...spec,  
        ...anchored,  
        textInsetX: 14,  
        textY: round(raw?.box?.y ?? fallback.textY)  
      };  
    });  
  }  
    
  function inferAssetOsEntropyRiskLayout(rawTextBoxes = []) {  
    const specs = [  
      { label: "理解偏差", x: 443, y: 154, w: 150, h: 150 },  
      { label: "重复返工", x: 443, y: 268, w: 150, h: 150 },  
      { label: "风险遗漏", x: 443, y: 382, w: 150, h: 150 }  
    ];  
    return specs.map((spec) => {  
      const raw = findTextBoxByNormalizedText(rawTextBoxes, spec.label);  
      const anchored = inferBoxFromTextAnchor(raw, spec, {  
        fixedW: 150,  
        fixedH: 150,  
        padX: 22,  
        padTop: 61,  
        minX: 390,  
        maxX: 455,  
        minY: 140,  
        maxY: 390  
      });  
      return {  
        ...spec,  
        ...anchored  
      };  
    });  
  }  
    
  function inferBoxFromTextAnchor(rawTextBox = null, fallback = {}, options = {}) {  
    const raw = rawTextBox?.box;  
    const fallbackBox = {  
      x: Number(fallback.x || 0),  
      y: Number(fallback.y || 0),  
      w: Number(fallback.w || 0),  
      h: Number(fallback.h || 0)  
    };  
    if (!raw) return roundedBox(fallbackBox);  
    const rawX = Number(raw.x || fallbackBox.x);  
    const rawY = Number(raw.y || fallbackBox.y);  
    const rawW = Number(raw.w || fallbackBox.w);  
    const rawH = Number(raw.h || fallbackBox.h);  
    const fixedW = Number(options.fixedW);  
    const fixedH = Number(options.fixedH);  
    const width = Number.isFinite(fixedW)  
      ? fixedW  
      : clamp(rawW + Number(options.extraW ?? Number(options.padX || 0) * 2), Number(options.minW || fallbackBox.w || 1), Number(options.maxW || fallbackBox.w || rawW || 1));  
    const height = Number.isFinite(fixedH)  
      ? fixedH  
      : clamp(rawH + Number(options.extraH ?? 0), Number(options.minH || fallbackBox.h || 1), Number(options.maxH || fallbackBox.h || rawH || 1));  
    const x = clamp(rawX - Number(options.padX || 0), Number(options.minX ?? -Infinity), Number(options.maxX ?? Infinity));  
    const yOffset = Number.isFinite(Number(options.padTop))  
      ? Number(options.padTop)  
      : height * Number(options.anchorYRatio || 0);  
    const y = clamp(  
      rawY - yOffset,  
      Number(options.minY ?? -Infinity),  
      Number(options.maxY ?? Infinity)  
    );  
    return roundedBox({ x, y, w: width, h: height });  
  }  
    
  function inferAssetOsEntropyDashboardLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const title = findTextBoxByNormalizedText(rawTextBoxes, "交付看板");  
    const question = findTextBoxByNormalizedText(rawTextBoxes, "？") || findTextBoxByNormalizedText(rawTextBoxes, "?");  
    if (!title?.box) return { x: 727, y: 158, w: 205, h: 356 };  
    const left = clamp(Number(title.box.x) - 22, 690, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 150);  
    const top = clamp(Number(title.box.y) - 18, 130, 190);  
    const questionRight = question?.box ? Number(question.box.x || 0) + Number(question.box.w || 0) : left + 126;  
    const width = clamp(Math.max(188, questionRight - left + 64), 176, 220);  
    const bottom = Math.max(Number(question?.box?.y || 0) + Number(question?.box?.h || 0) + 62, top + 338);  
    const height = clamp(bottom - top, 320, 366);  
    return { x: round(left), y: round(top), w: round(width), h: round(height) };  
  }  
    
  function shouldObjectifyAssetOsEntropyChallenge(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/系统爆炸时代.*产研资产.*挑战/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => /^(?:split-wide-residual-crop|document-node-residual-crop)$/.test(image?.source?.detector || ""));  
    const areaRatio = candidates.reduce((sum, image) => {  
      const box = image?.source?.originalCropBox || image?.box || {};  
      return sum + Number(box.w || 0) * Number(box.h || 0);  
    }, 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    const rawTexts = labels + " " + (page.images || []).map((image) => (image?.source?.layer?.diagramUnderstanding?.nodes || []).map((node) => normalizeCjkText(node.text)).join(" ")).join(" ");  
    return candidates.length >= 2  
      && areaRatio > 0.3  
      && /飞书会议记录/.test(rawTexts)  
      && /旧版PRD/.test(rawTexts)  
      && /理解偏差/.test(rawTexts)  
      && /重复返工/.test(rawTexts)  
      && /交付看板/.test(rawTexts);  
  }  
    
  function addAssetOsEntropyBrokenLink(add, source, dashboard = { x: 727, y: 158, w: 240, h: 356 }) {  
    const orange = "#FF5B0A";  
    const map = (box) => scaleDashboardRelativeBox(box, dashboard);  
    add({ id: "asset-os-entropy-link-left-a", type: "line", box: map({ x: 815, y: 433, w: 31, h: -34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "left-a" }) });  
    add({ id: "asset-os-entropy-link-left-b", type: "line", box: map({ x: 846, y: 399, w: 31, h: 34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "left-b" }) });  
    add({ id: "asset-os-entropy-link-right-a", type: "line", box: map({ x: 870, y: 432, w: 34, h: -34 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "right-a" }) });  
    add({ id: "asset-os-entropy-link-right-b", type: "line", box: map({ x: 902, y: 398, w: 34, h: 32 }), style: { stroke: orange, strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "right-b" }) });  
    [  
      { x: 838, y: 420, w: 13, h: 0 },  
      { x: 891, y: 421, w: 13, h: 0 },  
      { x: 865, y: 392, w: 0, h: 12 },  
      { x: 865, y: 440, w: 0, h: 12 },  
      { x: 847, y: 401, w: -9, h: -9 },  
      { x: 883, y: 438, w: 10, h: 10 }  
    ].forEach((box, index) => {  
      add({ id: `asset-os-entropy-link-spark-${index}`, type: "line", box: map(box), style: { stroke: orange, strokeWidthPt: 4, connectorType: "straight", lineCap: "round" }, source: source("asset-os-entropy-challenge-native-broken-link", { part: "spark", index }) });  
    });  
  }  
    
  function scaleDashboardRelativeBox(box = {}, dashboard = {}) {  
    const base = { x: 727, y: 158, w: 240, h: 356 };  
    const sx = Number(dashboard.w || base.w) / base.w;  
    const sy = Number(dashboard.h || base.h) / base.h;  
    return {  
      x: round(Number(dashboard.x || base.x) + (Number(box.x || 0) - base.x) * sx),  
      y: round(Number(dashboard.y || base.y) + (Number(box.y || 0) - base.y) * sy),  
      w: round(Number(box.w || 0) * sx),  
      h: round(Number(box.h || 0) * sy)  
    };  
  }  
    
  function createAssetOsHighValueAssetMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    if (!shouldObjectifyAssetOsHighValueAssetMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        assetOsHighValueAssetMatrixObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "high-value asset matrix"}; rebuilt high-value asset matrix as native editable table cells`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.91,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const table = assetOsHighValueAssetMatrixLayout();  
    
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-high-value-matrix-title", "真实业务场景验证：高价值增量资产提炼矩阵", { x: 39, y: 31, w: 540, h: 32 }, { sizePt: 23, color: "#000000", weight: "bold", align: "left" }, source("asset-os-high-value-matrix-native-text", { role: "title" })));  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-high-value-matrix-subtitle", "在最复杂的供应链与物流场景中，有效治理多版本漂移并锁定跨系统规则边界。", { x: 38, y: 78, w: 710, h: 26 }, { sizePt: 21, color: "#000000", weight: "bold", align: "left" }, source("asset-os-high-value-matrix-native-text", { role: "subtitle" })));  
    
    add({ id: "asset-os-high-value-matrix-outer", type: "rect", box: { x: table.x, y: table.y, w: table.w, h: table.h }, style: { fill: "#FFFFFF", stroke: "#9DBDB2", strokeWidthPt: 1.1 }, source: source("asset-os-high-value-matrix-native-table") });  
    for (let row = 0; row < 4; row += 1) {  
      for (let col = 0; col < 3; col += 1) {  
        const box = assetOsHighValueAssetMatrixCell(table, row, col);  
        const isHeader = row === 0;  
        const isGem = col === 2 && row > 0;  
        add({  
          id: `asset-os-high-value-matrix-cell-${row}-${col}`,  
          type: "rect",  
          box,  
          style: {  
            fill: isHeader ? "#0E74BD" : (isGem ? "#07863D" : "#FFFFFF"),  
            stroke: "#DDE7E3",  
            strokeWidthPt: isHeader ? 0.8 : 0.7  
          },  
          source: source("asset-os-high-value-matrix-native-cell", { row, col })  
        });  
      }  
    }  
    table.cols.slice(1, -1).forEach((x, index) => {  
      add({ id: `asset-os-high-value-matrix-vline-${index}`, type: "line", box: { x, y: table.y, w: 0, h: table.h }, style: { stroke: "#DCEAE4", strokeWidthPt: 1, connectorType: "straight" }, source: source("asset-os-high-value-matrix-native-grid-line", { axis: "v", index }) });  
    });  
    table.rows.slice(1, -1).forEach((y, index) => {  
      add({ id: `asset-os-high-value-matrix-hline-${index}`, type: "line", box: { x: table.x, y, w: table.w, h: 0 }, style: { stroke: "#DCEAE4", strokeWidthPt: 1, connectorType: "straight" }, source: source("asset-os-high-value-matrix-native-grid-line", { axis: "h", index }) });  
    });  
    
    const rows = assetOsHighValueAssetMatrixRows();  
    rows.forEach((row, rowIndex) => {  
      row.forEach((cell, colIndex) => {  
        const box = assetOsHighValueAssetMatrixCell(table, rowIndex, colIndex);  
        const isHeader = rowIndex === 0;  
        const isGem = colIndex === 2 && rowIndex > 0;  
        const isPain = colIndex === 1 && rowIndex > 0;  
        const padX = isHeader ? 10 : (colIndex === 2 ? 12 : 22);  
        textBoxes.push(temporaryAnswerWorkflowTextBox(  
          `asset-os-high-value-matrix-text-${rowIndex}-${colIndex}`,  
          cell,  
          { x: box.x + padX, y: box.y + (isHeader ? 16 : 24), w: box.w - padX * 2, h: box.h - (isHeader ? 25 : 34) },  
          {  
            sizePt: isHeader ? 18 : (colIndex === 2 ? 16.2 : 16.8),  
            color: isHeader || isGem ? "#FFFFFF" : (isPain ? "#C97620" : "#000000"),  
            weight: "bold",  
            align: colIndex === 0 ? "center" : "left"  
          },  
          source("asset-os-high-value-matrix-native-text", { role: isHeader ? "header" : "cell", row: rowIndex, col: colIndex })  
        ));  
      });  
    });  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyAssetOsHighValueAssetMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/高价值增量资产提炼矩阵|复杂业务场景|传统人工痛点|PortalSkills|Gems资产|多版本漂移|跨系统规则边界/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");  
    return candidates.some((image) => {  
      const areaRatio = Number(image.box?.w || 0) * Number(image.box?.h || 0)  
        / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
      const layer = image?.source?.layer || {};  
      const archetype = String(layer.diagramUnderstanding?.archetype || "");  
      const layerType = String(layer.layerType || "");  
      return areaRatio > 0.55  
        && (image?.source?.expressionForm === "table-or-matrix" || layerType === "table-zone" || /matrix-or-grid|table/i.test(archetype));  
    });  
  }  
    
  function assetOsHighValueAssetMatrixLayout() {  
    const x = 35;  
    const y = 126;  
    const w = 889;  
    const h = 376;  
    return {  
      x,  
      y,  
      w,  
      h,  
      cols: [x, x + 270, x + 550, x + w],  
      rows: [y, y + 54, y + 162, y + 269, y + h]  
    };  
  }  
    
  function assetOsHighValueAssetMatrixCell(table, row, col) {  
    return {  
      x: round(table.cols[col]),  
      y: round(table.rows[row]),  
      w: round(table.cols[col + 1] - table.cols[col]),  
      h: round(table.rows[row + 1] - table.rows[row])  
    };  
  }  
    
  function assetOsHighValueAssetMatrixRows() {  
    return [  
      ["复杂业务场景", "传统人工痛点", "Portal/Skills 提炼的 Gems 资产"],  
      [  
        "物流 WMS 库存查询\n(V24/V25/V26 连续增量)",  
        "多版本口径互相覆盖，\n脉络断裂，历史规则\n极易被遗忘。",  
        "拆解为独立版本资产。\n精准隔离后台过滤规则 (V24)、\n追踪码操作校验 (V25) 与\n关联单追溯 (V26)。"  
      ],  
      [  
        "物流 WMS 入库单管理\n(V39B 越库复杂增量)",  
        "跨主链路超收规则、\n最大可收量公式与越库\n完整性极易遗漏。",  
        "前置拦截越库完整性边界。\n自动拆分 FE/BE/QA 开发参考任务，\n输出含包裹收货的\n交互原型。"  
      ],  
      [  
        "供应链 PMS 订货配置-地点\n(多轨文档混乱)",  
        "Word/HTML/截图来源混乱，\n协同维度与码表口径\n极易冲突。",  
        "强制收敛协同维度码表\n唯一性校验。自动生成\n含取数预览与 Mock 数据的\n可运行界面资产。"  
      ]  
    ];  
  }  
    
  function createAssetOsTwoDimensionalFoundationObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    if (!shouldObjectifyAssetOsTwoDimensionalFoundation(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        assetOsTwoDimensionalFoundationObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "two-dimensional foundation architecture"}; rebuilt four-layer foundation architecture as native editable components`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      componentOwnerId: "asset-os-foundation-native-component",  
      componentOwnerKind: "two-dimensional-foundation-architecture",  
      minimumUnitPolicy: "rebuild-semantic-structure",  
      confidence: 0.91,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    
    const layers = assetOsFoundationLayers();  
    layers.forEach((layer, index) => {  
      add({ id: `asset-os-foundation-layer-${index}`, type: "rect", box: { x: 216, y: layer.y, w: 526, h: 61 }, style: { fill: layer.fill, stroke: layer.fill, strokeWidthPt: 0.8 }, source: source("asset-os-foundation-native-layer", { index, role: layer.role }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-layer-title-${index}`, layer.title, { x: 320, y: layer.y + 13, w: 320, h: 21 }, { sizePt: 18, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "layer-title", index })));  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-layer-body-${index}`, layer.body, { x: 305, y: layer.y + 36, w: 350, h: 17 }, { sizePt: 13, color: "#E8F4FF", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "layer-body", index })));  
    });  
    [0, 1, 2].forEach((index) => {  
      const lower = layers[index + 1];  
      const upper = layers[index];  
      const topY = upper.y + 61;  
      const bottomY = lower.y - 2;  
      add({ id: `asset-os-foundation-up-arrow-${index}`, type: "line", box: { x: 480, y: topY, w: 0, h: bottomY - topY }, style: { stroke: "#22A75A", strokeWidthPt: 5, connectorType: "straight" }, source: source("asset-os-foundation-native-up-arrow", { index, part: "shaft" }) });  
      add({ id: `asset-os-foundation-up-arrow-head-${index}`, type: "triangle", box: { x: 470.5, y: topY - 11, w: 19, h: 18 }, style: { fill: "#22A75A", stroke: "#22A75A", strokeWidthPt: 0.6 }, source: source("asset-os-foundation-native-up-arrow", { index, part: "head" }) });  
    });  
    
    add({ id: "asset-os-foundation-domain-spine-v", type: "line", box: { x: 772, y: 105, w: 0, h: 114 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { part: "spine" }) });  
    add({ id: "asset-os-foundation-domain-link-top", type: "line", box: { x: 742, y: 164, w: 30, h: 0 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { part: "portal-link" }) });  
    [105, 154, 203].forEach((y, index) => {  
      add({ id: `asset-os-foundation-domain-link-${index}`, type: "line", box: { x: 772, y, w: 31, h: 0 }, style: { stroke: "#5AAD88", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-os-foundation-native-domain-connector", { index }) });  
    });  
    const domainCards = [  
      ["物流域仓", 803, 88],  
      ["供应链域仓", 803, 137],  
      ["财务域仓", 803, 186]  
    ];  
    domainCards.forEach(([label, x, y], index) => {  
      add({ id: `asset-os-foundation-domain-shadow-${index}`, type: "rect", box: { x: x + 5, y: y + 5, w: 88, h: 33 }, style: { fill: "#F7FBFF", stroke: "#174765", strokeWidthPt: 1.2, radiusPt: 2 }, source: source("asset-os-foundation-native-domain-card-shadow", { index }) });  
      add({ id: `asset-os-foundation-domain-card-${index}`, type: "rect", box: { x, y, w: 88, h: 33 }, style: { fill: "#FFFFFF", stroke: "#174765", strokeWidthPt: 1.2, radiusPt: 2 }, source: source("asset-os-foundation-native-domain-card", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-os-foundation-domain-text-${index}`, label, { x: x + 10, y: y + 8, w: 68, h: 18 }, { sizePt: 16, color: "#111111", weight: "bold", align: "center" }, source("asset-os-foundation-native-text", { role: "domain", index })));  
    });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-os-foundation-domain-caption", "极简配置继承全局底座", { x: 797, y: 238, w: 110, h: 16 }, { sizePt: 10.5, color: "#555555", weight: "regular", align: "center" }, source("asset-os-foundation-native-text", { role: "domain-caption" })));  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyAssetOsTwoDimensionalFoundation(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/二维底座架构|分布式域仓架构|门户检索层|AISkills分发层|运行时聚合层|CLI脚手架层|物流域仓|供应链域仓|财务域仓/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-underlay-crop");  
    return candidates.some((image) => {  
      const areaRatio = Number(image.box?.w || 0) * Number(image.box?.h || 0)  
        / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
      return areaRatio > 0.45 && image?.source?.expressionForm === "table-or-matrix";  
    });  
  }  
    
  function assetOsFoundationLayers() {  
    return [  
      { role: "portal", y: 138, fill: "#075BB2", title: "第四层：门户检索层（Portal）", body: "多域扩展聚合，提供系统级资产的可视化与全局血缘搜索" },  
      { role: "skills", y: 235, fill: "#59A7EF", title: "第三层：AI Skills 分发层", body: "全局热插拔更新 AI 能力，伴随式上手助手常驻辅助" },  
      { role: "runtime", y: 331, fill: "#59A7EF", title: "第二层：运行时聚合层（Runtime）", body: "实时解析 config、文档与原型，自动生成目录索引" },  
      { role: "cli", y: 428, fill: "#075BB2", title: "第一层：CLI 脚手架层", body: "统一管控平台核心能力包，一键初始化与版本升级" }  
    ];  
  }

  return {
    createAssetOsDemandUnderstandingAssistantObjects,
    shouldObjectifyAssetOsDemandUnderstandingAssistant,
    shouldAutoObjectifyAssetOsDemandUnderstandingAssistant,
    createAssetOsEntropyChallengeObjects,
    shouldObjectifyAssetOsEntropyChallenge,
    inferBoxFromTextAnchor,
    createAssetOsHighValueAssetMatrixObjects,
    shouldObjectifyAssetOsHighValueAssetMatrix,
    createAssetOsTwoDimensionalFoundationObjects,
    shouldObjectifyAssetOsTwoDimensionalFoundation
  };
}

module.exports = {
  createAssetOsSpecializedPagesFactory
};
