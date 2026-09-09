"use strict";

function createWorkflowSupplyChainFactory(dependencies = {}) {
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

  function createWorkflowSupplyChainTwoPanelObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!shouldObjectifyWorkflowSupplyChainTwoPanel(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "two-panel-diagram-crop");  
    const sortedImages = [...sourceImages].sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));  
    const leftImage = sortedImages[0] || null;  
    if (leftImage) {  
      markTwoPanelChaosIllustrationPreserved(leftImage);  
      leftImage.source.nonEditableReason = `${leftImage.source?.nonEditableReason || leftImage.source?.reason || "supply-chain chaotic source panel"}; preserved as an intentional fidelity crop because the mixed Word/HTML/image/version scribble illustration is too dense for reliable primitive reconstruction`;  
    }  
    for (const image of sourceImages.filter((item) => item !== leftImage)) {  
      image.source = {  
        ...(image.source || {}),  
        workflowSupplyChainTwoPanelObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "supply-chain governed repository panel"}; rebuilt governed repository panel as native editable components`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.84,  
      expressionForm: "workflow-case-two-panel",  
      ...workflowSupplyChainNativeComponentMetadata(detector, extra),  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const repositoryImage = sortedImages[1] || null;  
    // Folder and file glyphs are compact visual assets, not diagram structure.  
    // Keep them as source-faithful minimum crops while reconstructing the tree,  
    // labels, connectors, and panel as editable PowerPoint objects.  
    const images = createWorkflowSupplyChainRepositoryIconCrops({  
      image: repositoryImage,  
      sourceImage: options.sourceImage,  
      slideSize,  
      irDir: options.irDir  
    });  
    const preservedIconKeys = new Set(images.map((item) => item?.source?.workflowSupplyChainIconKey).filter(Boolean));  
    
    addWorkflowSupplyChainTitle(add, textBoxes, source, slideSize);  
    addWorkflowSupplyChainRepositoryPanel(add, textBoxes, source, preservedIconKeys);  
    addWorkflowSupplyChainBottomSummary(add, textBoxes, source);  
    return { shapes, textBoxes, images };  
  }  
    
  function createWorkflowSupplyChainRepositoryIconCrops({ image = null, sourceImage = null, slideSize = DEFAULT_SLIDE, irDir = null } = {}) {  
    if (!image || !sourceImage || !irDir) return [];  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    if (!assetFile) return [];  
    const iconSpecs = [  
      { key: "root-folder", box: { x: 536, y: 136, w: 47, h: 38 } },  
      { key: "row-0-folder", box: { x: 580, y: 185, w: 47, h: 38 } },  
      { key: "row-1-file", box: { x: 632, y: 238, w: 31, h: 34 } },  
      { key: "row-2-file", box: { x: 632, y: 292, w: 31, h: 34 } },  
      { key: "row-3-file", box: { x: 632, y: 346, w: 31, h: 34 } }  
    ];  
    const outDir = path.dirname(assetFile);  
    const base = path.basename(assetFile, path.extname(assetFile));  
    ensureDir(outDir);  
    return iconSpecs.map((spec, index) => {  
      const file = path.join(outDir, `${base}-repository-icon-${String(index + 1).padStart(2, "0")}.png`);  
      writePng(file, cropPng(sourceImage, ptToPxBox(spec.box, sourceImage, slideSize, 0)));  
      return {  
        id: `${image.id || "workflow-supply-chain-repository"}-icon-crop-${index}`,  
        type: "fidelity-crop",  
        assetPath: path.relative(irDir, file).replace(/\\/g, "/"),  
        box: roundedBox(spec.box),  
        source: {  
          ...(image.source || {}),  
          ...workflowSupplyChainNativeComponentMetadata("workflow-supply-chain-icon-residual-crop", { role: "repository-icon", part: spec.key }),  
          layer: splitResidualLayerSource(image.source?.layer, spec.box, "workflow-supply-chain-icon-residual-crop"),  
          editable: false,  
          detector: "workflow-supply-chain-icon-residual-crop",  
          parentDetector: image.source?.detector || null,  
          parentImageId: image.id || null,  
          expressionForm: "icon-or-illustration",  
          expressionSubtype: "icon",  
          recommendedAction: "keep-local-crop",  
          intentionalMinimumUnitCrop: true,  
          protectedMinimumUnit: true,  
          // Do not inherit the parent panel's deletion marker. The panel is  
          // replaced, but these newly created local icon units must survive the  
          // generic residual-splitting pass.  
          workflowSupplyChainTwoPanelObjectified: undefined,  
          dropErasedResidualAfterNativeRebuild: false,  
          visualAtomObjectified: false,  
          workflowSupplyChainIconKey: spec.key,  
          residualSplit: true,  
          residualSplitMode: "workflow-supply-chain-repository-icon",  
          residualSplitIndex: index,  
          residualSplitCount: iconSpecs.length,  
          nonEditableReason: "source-faithful repository icon retained as the minimum visual unit after native tree reconstruction"  
        }  
      };  
    });  
  }  
    
  function workflowSupplyChainNativeComponentMetadata(detector, extra = {}) {  
    const normalizedDetector = String(detector || "");  
    const semanticRole = String(extra.role || "");  
    let role = null;  
    let archetype = null;  
    if (/title-accent/.test(normalizedDetector) || semanticRole === "title") {  
      role = "title";  
      archetype = "section-title";  
    } else if (/summary/.test(normalizedDetector) || /^summary-/.test(semanticRole)) {  
      role = "summary";  
      archetype = "three-column-summary";  
    } else if (/repository|tree|reviewed|review-loop|icon-residual|native-folder|native-file-icon/.test(normalizedDetector)  
      || /^(repo-|root-label|reviewed-tag|repository-icon|file-symbol)/.test(semanticRole)) {  
      role = "repository";  
      archetype = "governed-repository-tree";  
    }  
    if (!role) return {};  
    return {  
      nativeComponentGroupId: `workflow-supply-chain-${role}`,  
      nativeComponentParentId: "workflow-supply-chain-case",  
      nativeComponentArchetype: archetype,  
      nativeComponentInstance: true,  
      nativeComponentMinimumUnit: "semantic-component",  
      nativeComponentRole: role,  
      nativeComponentPart: String(extra.part || semanticRole || "detail")  
    };  
  }  
    
    
    
    
    
  function shouldObjectifyWorkflowSupplyChainTwoPanel(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = workflowSupplyChainTwoPanelEvidenceText(page, rawTextBoxes);  
    if (!/供应链PMS订货配置/.test(labels)) return false;  
    if (!/DomainRepository|供应链PMS配置/.test(labels)) return false;  
    if (!/多版本混杂|码表口径模糊|PRD\.md|APIEndpoints/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "two-panel-diagram-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    return candidates.length === 2 && areaRatio > 0.45 && areaRatio < 0.72;  
  }  
    
    
    
  function addWorkflowSupplyChainTitle(add, textBoxes, source, slideSize = DEFAULT_SLIDE) {  
    add({ id: "workflow-supply-chain-title-accent-blue", type: "line", box: { x: 34, y: 62, w: 43, h: 0 }, style: { stroke: "#2F80C9", strokeWidthPt: 3.4, connectorType: "straight", lineCap: "round" }, source: source("workflow-supply-chain-native-title-accent", { part: "blue" }) });  
    add({ id: "workflow-supply-chain-title-accent-dot", type: "ellipse", box: { x: 83, y: 59.7, w: 5, h: 5 }, style: { fill: "#4BB989", stroke: "#4BB989", strokeWidthPt: 0 }, source: source("workflow-supply-chain-native-title-accent", { part: "dot" }) });  
    const width = Math.max(690, Math.min(880, Number(slideSize?.widthPt || DEFAULT_SLIDE.widthPt) - 68));  
    const title = temporaryAnswerWorkflowTextBox("workflow-supply-chain-title", "场景实战 I：供应链 PMS 订货配置（治理“输入侧熵增”）", { x: 34, y: 20, w: width, h: 41 }, { sizePt: 23, color: "#000000", weight: "bold", align: "left" }, source("workflow-supply-chain-native-text", { role: "title" }));  
    // This is a single-line headline in the source component. Keep enough  
    // horizontal room and shrink only as a last resort instead of wrapping it.  
    title.style = { wrap: false, fit: "shrink", marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 };  
    title.wrap = false;  
    textBoxes.push(title);  
  }  
    
  function addWorkflowSupplyChainChaosPanel(add, textBoxes, source) {  
    add({ id: "workflow-supply-chain-chaos-bg", type: "rect", box: { x: 25, y: 78, w: 446, h: 350 }, style: { fill: "#FCE9D1", stroke: "#DF5A16", strokeWidthPt: 2.2, radiusPt: 8, opacity: 0.82 }, source: source("workflow-supply-chain-native-chaos-panel") });  
    [0, 1, 2, 3, 4].forEach((index) => {  
      add({ id: `workflow-supply-chain-chaos-texture-${index}`, type: "line", box: { x: 42 + index * 67, y: 96 + index * 43, w: 74, h: 18 - index * 4 }, style: { stroke: "#E8B389", strokeWidthPt: 0.9, opacity: 0.38, connectorType: "straight" }, source: source("workflow-supply-chain-native-chaos-texture", { index }) });  
    });  
    const docs = [  
      { x: 92, y: 138, r: -13, kind: "word" },  
      { x: 246, y: 133, r: 7, kind: "word" },  
      { x: 82, y: 326, r: -10, kind: "word" },  
      { x: 254, y: 314, r: 8, kind: "word" },  
      { x: 160, y: 148, r: -8, kind: "html" },  
      { x: 287, y: 232, r: 11, kind: "html" },  
      { x: 113, y: 232, r: 2, kind: "image" },  
      { x: 205, y: 218, r: -1, kind: "image" },  
      { x: 346, y: 146, r: 7, kind: "image" },  
      { x: 348, y: 306, r: 11, kind: "image" }  
    ];  
    docs.forEach((doc, index) => addWorkflowSupplyChainDocument(add, textBoxes, source, doc, index));  
    [  
      { text: "V1.0", x: 135, y: 121, w: 55, h: 31 },  
      { text: "V1.1", x: 294, y: 114, w: 54, h: 30 },  
      { text: "V1.0", x: 395, y: 128, w: 52, h: 29 },  
      { text: "V1.2", x: 276, y: 232, w: 55, h: 30 },  
      { text: "V1.1", x: 403, y: 241, w: 53, h: 29 },  
      { text: "V1.2-FIX", x: 49, y: 269, w: 83, h: 29 },  
      { text: "多版本混杂", x: 151, y: 385, w: 105, h: 28 },  
      { text: "码表口径模糊", x: 332, y: 374, w: 113, h: 27 }  
    ].forEach((tag, index) => {  
      add({ id: `workflow-supply-chain-chaos-tag-${index}`, type: "rect", box: { x: tag.x, y: tag.y, w: tag.w, h: tag.h }, style: { fill: "#F45B12", stroke: "#F45B12", strokeWidthPt: 0, radiusPt: 4, shadow: { color: "#9F3B12", alpha: 0.18, blurPt: 2, distancePt: 1, angle: 45 } }, source: source("workflow-supply-chain-native-version-tag", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-chaos-tag-text-${index}`, tag.text, { x: tag.x + 3, y: tag.y + 5, w: tag.w - 6, h: tag.h - 8 }, { sizePt: tag.text.length > 5 ? 14 : 18, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "version-tag", index })));  
    });  
    [  
      [135, 171, 44, 27], [254, 190, -22, 42], [250, 187, 96, -24], [332, 184, 24, -34],  
      [113, 273, 66, -42], [157, 278, 72, -11], [224, 283, -91, 29], [242, 260, 73, 69],  
      [312, 334, 47, -44], [358, 310, 37, -43]  
    ].forEach(([x, y, w, h], index) => {  
      add({ id: `workflow-supply-chain-chaos-arrow-${index}`, type: "line", box: { x, y, w, h }, style: { stroke: "#C9362E", strokeWidthPt: 1.7, connectorType: "straight", endArrow: "triangle", lineCap: "round", opacity: 0.88 }, source: source("workflow-supply-chain-native-chaos-arrow", { index }) });  
    });  
    [  
      [145, 286, 110, -18], [155, 296, 125, -8], [160, 306, 132, -21], [175, 315, 104, -34]  
    ].forEach(([x, y, w, h], index) => {  
      add({ id: `workflow-supply-chain-chaos-scribble-${index}`, type: "line", box: { x, y, w, h }, style: { stroke: "#C9362E", strokeWidthPt: 2.1, connectorType: "straight", lineCap: "round", opacity: 0.78 }, source: source("workflow-supply-chain-native-chaos-scribble", { index }) });  
    });  
    [["?", 223, 126], ["?", 294, 203], ["?", 418, 220], ["?", 56, 306]].forEach(([text, x, y], index) => {  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-chaos-question-${index}`, text, { x, y, w: 24, h: 30 }, { sizePt: 24, color: "#C9362E", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "question", index })));  
    });  
  }  
    
  function addWorkflowSupplyChainRepositoryPanel(add, textBoxes, source, preservedIconKeys = new Set()) {  
    add({ id: "workflow-supply-chain-repo-bg", type: "rect", box: { x: 489, y: 78, w: 445, h: 350 }, style: { fill: "#EEF9F1", stroke: "#28A766", strokeWidthPt: 2.2, radiusPt: 8, opacity: 0.88 }, source: source("workflow-supply-chain-native-repository-panel") });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-supply-chain-repo-title", "Domain Repository", { x: 593, y: 118, w: 170, h: 24 }, { sizePt: 15, color: "#6A6A6A", weight: "regular", align: "center" }, source("workflow-supply-chain-native-text", { role: "repo-title" })));  
    if (!preservedIconKeys.has("root-folder")) addWorkflowSupplyChainFolder(add, source, 538, 146, 42, 30, "root");  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-supply-chain-root-label", "供应链 PMS 配置（已治理）", { x: 592, y: 146, w: 300, h: 27 }, { sizePt: 16.5, color: "#111111", weight: "bold", align: "left" }, source("workflow-supply-chain-native-text", { role: "root-label" })));  
    add({ id: "workflow-supply-chain-tree-spine", type: "line", box: { x: 551, y: 176, w: 0, h: 191 }, style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("workflow-supply-chain-native-tree-line", { part: "spine" }) });  
    const rows = [  
      { y: 198, kind: "folder", label: "供应链 PMS 配置", tag: null },  
      { y: 251, kind: "doc-check", label: "PRD.md", tag: "已审" },  
      { y: 306, kind: "doc-link", label: "API Endpoints.md", tag: null },  
      { y: 362, kind: "doc-fig", label: "UI_Wireframe.fig", tag: null }  
    ];  
    rows.forEach((row, index) => {  
      add({ id: `workflow-supply-chain-tree-branch-${index}`, type: "line", box: { x: 551, y: row.y + 12, w: 49, h: 0 }, style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight", endArrow: "triangle" }, source: source("workflow-supply-chain-native-tree-line", { index }) });  
      if (row.kind === "folder") {  
        if (!preservedIconKeys.has(`row-${index}-folder`)) addWorkflowSupplyChainFolder(add, source, 582, row.y, 42, 29, `row-${index}`);  
      } else if (!preservedIconKeys.has(`row-${index}-file`)) {  
        addWorkflowSupplyChainFileIcon(add, textBoxes, source, 635, row.y - 2, row.kind, index);  
      }  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-repo-label-${index}`, row.label, { x: row.kind === "folder" ? 625 : 669, y: row.y + 1, w: 170, h: 25 }, { sizePt: 16, color: "#111111", weight: "regular", align: "left" }, source("workflow-supply-chain-native-text", { role: "repo-row", index })));  
      if (row.tag) {  
        add({ id: "workflow-supply-chain-reviewed-tag", type: "rect", box: { x: 811, y: row.y + 3, w: 39, h: 21 }, style: { fill: "#DAF3DE", stroke: "#DAF3DE", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-supply-chain-native-reviewed-tag") });  
        textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-supply-chain-reviewed-tag-text", row.tag, { x: 817, y: row.y + 5, w: 28, h: 16 }, { sizePt: 14, color: "#1C7D42", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "reviewed-tag" })));  
      }  
    });  
    add({ id: "workflow-supply-chain-review-loop-a", type: "line", box: { x: 786, y: 208, w: 87, h: 0 }, style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight", endArrow: "triangle" }, source: source("workflow-supply-chain-native-review-loop", { part: "top" }) });  
    add({ id: "workflow-supply-chain-review-loop-b", type: "line", box: { x: 873, y: 208, w: 0, h: 55 }, style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("workflow-supply-chain-native-review-loop", { part: "side" }) });  
    add({ id: "workflow-supply-chain-review-loop-c", type: "line", box: { x: 850, y: 263, w: 23, h: 0 }, style: { stroke: "#30A76B", strokeWidthPt: 1.5, connectorType: "straight", endArrow: "triangle" }, source: source("workflow-supply-chain-native-review-loop", { part: "return" }) });  
  }  
    
  function addWorkflowSupplyChainBottomSummary(add, textBoxes, source) {  
    add({ id: "workflow-supply-chain-summary-bg", type: "rect", box: { x: 25, y: 438, w: 910, h: 84 }, style: { fill: "#FFFFFF", stroke: "#D4DADF", strokeWidthPt: 0.9, radiusPt: 5, shadow: { color: "#8C98A0", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-supply-chain-native-summary-bg") });  
    [329, 638].forEach((x, index) => add({ id: `workflow-supply-chain-summary-divider-${index}`, type: "line", box: { x, y: 451, w: 0, h: 59 }, style: { stroke: "#DADDE0", strokeWidthPt: 0.8, connectorType: "straight" }, source: source("workflow-supply-chain-native-summary-divider", { index }) }));  
    [  
      { title: "挑战", color: "#D76821", body: "供应链配置材料跨越多版本，混合 Word/图片，人工极难收敛口径。", x: 44, w: 250 },  
      { title: "AI 介入", color: "#2EAA64", body: "自动梳理版本脉络，提取核心复杂规则（协同维度码表映射、取数预览不落库）。", x: 348, w: 270 },  
      { title: "交付资产", color: "#2EAA64", body: "杂乱信息彻底降维，转化为结构化已审 PRD、按版本的开发参考，以及可运行界面资产。", x: 646, w: 270 }  
    ].forEach((item, index) => {  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-summary-title-${index}`, item.title, { x: item.x + 100, y: 447, w: 82, h: 22 }, { sizePt: 14.5, color: item.color, weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "summary-title", index })));  
      add({ id: `workflow-supply-chain-summary-rule-${index}`, type: "line", box: { x: item.x - 3, y: 478, w: item.w, h: 0 }, style: { stroke: "#DADDE0", strokeWidthPt: 0.8, connectorType: "straight" }, source: source("workflow-supply-chain-native-summary-rule", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-summary-body-${index}`, item.body, { x: item.x, y: 487, w: item.w, h: 35 }, { sizePt: 11.5, color: "#111111", weight: "regular", align: "left" }, source("workflow-supply-chain-native-text", { role: "summary-body", index })));  
    });  
  }  
    
  function addWorkflowSupplyChainDocument(add, textBoxes, source, doc, index) {  
    const box = { x: doc.x, y: doc.y, w: doc.kind === "html" ? 70 : 62, h: doc.kind === "html" ? 76 : 72 };  
    add({ id: `workflow-supply-chain-doc-${index}`, type: "rect", box, style: { fill: doc.kind === "html" ? "#FFF7EF" : "#FFFFFF", stroke: "#6D8499", strokeWidthPt: 1.2, radiusPt: 2, rotate: doc.r, shadow: { color: "#776E66", alpha: 0.13, blurPt: 2, distancePt: 1, angle: 45 } }, source: source("workflow-supply-chain-native-doc", { index, kind: doc.kind }) });  
    if (doc.kind === "word") {  
      add({ id: `workflow-supply-chain-word-badge-${index}`, type: "rect", box: { x: doc.x - 13, y: doc.y + 19, w: 34, h: 43 }, style: { fill: "#245EAD", stroke: "#245EAD", strokeWidthPt: 0, rotate: doc.r - 7 }, source: source("workflow-supply-chain-native-word-badge", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-word-text-${index}`, "W", { x: doc.x - 8, y: doc.y + 29, w: 25, h: 24 }, { sizePt: 21, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "word-badge", index })));  
      [0, 1, 2].forEach((line) => add({ id: `workflow-supply-chain-doc-line-${index}-${line}`, type: "line", box: { x: doc.x + 26, y: doc.y + 26 + line * 10, w: 26, h: 0 }, style: { stroke: "#D0D8DF", strokeWidthPt: 2, connectorType: "straight" }, source: source("workflow-supply-chain-native-doc-line", { index, line }) }));  
    } else if (doc.kind === "html") {  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-html-code-${index}`, "</>", { x: doc.x + 16, y: doc.y + 22, w: 40, h: 28 }, { sizePt: 24, color: "#C7632A", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "html-code", index })));  
      add({ id: `workflow-supply-chain-html-ribbon-${index}`, type: "rect", box: { x: doc.x + 7, y: doc.y + 54, w: 56, h: 24 }, style: { fill: "#E37C34", stroke: "#E37C34", strokeWidthPt: 0, rotate: doc.r }, source: source("workflow-supply-chain-native-html-ribbon", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-html-text-${index}`, "HTML", { x: doc.x + 14, y: doc.y + 58, w: 44, h: 17 }, { sizePt: 13, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "html-ribbon", index })));  
    } else {  
      add({ id: `workflow-supply-chain-image-sky-${index}`, type: "rect", box: { x: doc.x + 7, y: doc.y + 8, w: 48, h: 47 }, style: { fill: "#E7F4FC", stroke: "#2BA66B", strokeWidthPt: 1, rotate: doc.r }, source: source("workflow-supply-chain-native-image-frame", { index }) });  
      add({ id: `workflow-supply-chain-image-mountain-${index}`, type: "triangle", box: { x: doc.x + 14, y: doc.y + 30, w: 35, h: 25 }, style: { fill: "#37A85E", stroke: "#37A85E", strokeWidthPt: 0, rotate: doc.r }, source: source("workflow-supply-chain-native-image-mountain", { index }) });  
      add({ id: `workflow-supply-chain-image-sun-${index}`, type: "ellipse", box: { x: doc.x + 39, y: doc.y + 15, w: 10, h: 10 }, style: { fill: "#FFD052", stroke: "#FFD052", strokeWidthPt: 0 }, source: source("workflow-supply-chain-native-image-sun", { index }) });  
    }  
  }  
    
  function addWorkflowSupplyChainFolder(add, source, x, y, w, h, key) {  
    add({ id: `workflow-supply-chain-folder-tab-${key}`, type: "rect", box: { x: x + 4, y, w: w * 0.43, h: h * 0.22 }, style: { fill: "#25AE64", stroke: "#25AE64", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-supply-chain-native-folder", { key, part: "tab" }) });  
    add({ id: `workflow-supply-chain-folder-body-${key}`, type: "rect", box: { x, y: y + h * 0.18, w, h: h * 0.78 }, style: { fill: "#25AE64", stroke: "#25AE64", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-supply-chain-native-folder", { key, part: "body" }) });  
  }  
    
  function addWorkflowSupplyChainFileIcon(add, textBoxes, source, x, y, kind, index) {  
    add({ id: `workflow-supply-chain-file-icon-${index}`, type: "rect", box: { x, y, w: 28, h: 30 }, style: { fill: "#2EAF69", stroke: "#2EAF69", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-supply-chain-native-file-icon", { kind, index }) });  
    const symbol = kind === "doc-check" ? "✓" : kind === "doc-link" ? "↗" : "▧";  
    textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-supply-chain-file-symbol-${index}`, symbol, { x: x + 5, y: y + 5, w: 18, h: 18 }, { sizePt: 15, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-supply-chain-native-text", { role: "file-symbol", kind, index })));  
  }

  return {
    createWorkflowSupplyChainTwoPanelObjects,
    shouldObjectifyWorkflowSupplyChainTwoPanel
  };
}

module.exports = {
  createWorkflowSupplyChainFactory
};
