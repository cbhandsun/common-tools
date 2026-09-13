"use strict";

function createWorkflowChallengeTriadFactory(dependencies = {}) {
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

  function createWorkflowChallengeTriadIllustrationObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!shouldObjectifyWorkflowChallengeTriadIllustrations(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "structured-illustration-card-illustration-residual-crop");  
    materializeWorkflowChallengeTriadInputIllustrationCrop(sourceImages, {  
      sourceImage: options.sourceImage,  
      slideSize,  
      assetDir: options.assetDir,  
      irDir: options.irDir,  
      deckName: options.deckName,  
      pageIndex: options.pageIndex  
    });  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        detector: "workflow-challenge-triad-illustration-crop",  
        parentDetector: image.source?.detector || null,  
        editable: false,  
        expressionForm: "illustration",  
        expressionSubtype: "workflow-challenge-triad-illustration",  
        recommendedAction: "preserve-local-crop",  
        skipVisualAtomRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow challenge triad illustration"}; preserved dense mixed card illustration as an intentional fidelity crop while keeping the surrounding card chrome and explanatory text editable`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.88,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    addWorkflowChallengeTriadCardShellsAndText(add, textBoxes, source);  
    return { shapes, textBoxes };  
  }  
    
  function materializeWorkflowChallengeTriadInputIllustrationCrop(sourceImages = [], options = {}) {  
    const inputIllustration = sourceImages[0];  
    const { sourceImage, slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName = "deck", pageIndex = 0 } = options;  
    if (!inputIllustration || !sourceImage || !assetDir || !irDir) return;  
    
    // The generic residual split includes the first card's right frame and clips  
    // its left paper glyph. Re-sample only the illustration's safe inner region  
    // so the native card frame remains the sole visible frame.  
    const originalBox = roundedBox(inputIllustration.box || {});  
    const cropBox = {  
      x: Math.max(0, Number(originalBox.x || 0) - 20),  
      y: Number(originalBox.y || 0),  
      w: Number(originalBox.w || 0) + 2,  
      h: Number(originalBox.h || 0) + 34  
    };  
    const file = path.join(assetDir, `${deckName}-p${String(Number(pageIndex || 0) + 1).padStart(2, "0")}-workflow-challenge-input-illustration.png`);  
    ensureDir(path.dirname(file));  
    writePng(file, cropPng(sourceImage, ptToPxBox(cropBox, sourceImage, slideSize, 0)));  
    inputIllustration.assetPath = path.relative(irDir, file).replace(/\\/g, "/");  
    inputIllustration.box = roundedBox(cropBox);  
    inputIllustration.source = {  
      ...(inputIllustration.source || {}),  
      originalResidualCropBox: inputIllustration.source?.originalResidualCropBox || originalBox,  
      workflowChallengeTriadInputCropResampled: true,  
      workflowChallengeTriadCropBox: roundedBox(cropBox)  
    };  
  }  
    
  function addWorkflowChallengeTriadCardShellsAndText(add, textBoxes, source) {  
    const cards = [  
      {  
        key: "input",  
        title: "混沌的输入端",  
        x: 43,  
        bullets: ["· 信息“熵增”严重", "· 材料极度分散，需人工收敛口径", "· 历史规则极易遗漏"]  
      },  
      {  
        key: "processing",  
        title: "瓶颈的处理端",  
        x: 342,  
        bullets: ["· 重复写作与风险后置", "· 大量时间消耗于套模板排版", "· 逻辑漏洞与边界缺失在开发期才暴露"]  
      },  
      {  
        key: "output",  
        title: "割裂的输出端",  
        x: 641,  
        bullets: ["· 资产割裂与流失", "· 文档、原型、口径完全分离", "· 项目结束即变“零散文件”，无复用价值"]  
      }  
    ];  
    cards.forEach((card, index) => {  
      add({ id: `workflow-challenge-card-${card.key}`, type: "rect", box: { x: card.x, y: 45, w: 276, h: 455 }, style: { fill: "#FFFFFF", stroke: "#5A6A72", strokeWidthPt: 1.4, radiusPt: 5, shadow: { color: "#ADB7BE", alpha: 0.12, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("workflow-challenge-triad-native-card", { index, key: card.key }) });  
      add({ id: `workflow-challenge-card-accent-${card.key}`, type: "rect", box: { x: card.x, y: 45, w: 276, h: 7 }, style: { fill: "#FF5B1A", stroke: "#FF5B1A", strokeWidthPt: 0, radiusPt: 3 }, source: source("workflow-challenge-triad-native-card-accent", { index, key: card.key }) });  
      add({ id: `workflow-challenge-card-separator-${card.key}`, type: "line", box: { x: card.x + 20, y: 398, w: 236, h: 0 }, style: { stroke: "#E0E0E0", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-challenge-triad-native-card-separator", { index, key: card.key }) });  
      addWorkflowChallengeWarningIcon(add, source, card.x + 34, 71, card.key);  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-challenge-title-${card.key}`, card.title, { x: card.x + 70, y: 72, w: 170, h: 30 }, { sizePt: 22, color: "#111111", weight: "bold", align: "left" }, source("workflow-challenge-triad-native-text", { role: "title", key: card.key })));  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-challenge-bullets-${card.key}`, card.bullets.join("\n"), { x: card.x + 24, y: 419, w: 235, h: 58 }, { sizePt: 13.5, color: "#111111", weight: "regular", align: "left" }, source("workflow-challenge-triad-native-text", { role: "bullets", key: card.key })));  
    });  
  }  
    
  function addWorkflowChallengeWarningIcon(add, source, x, y, key) {  
    add({ id: `workflow-challenge-warning-${key}`, type: "triangle", box: { x, y, w: 40, h: 36 }, style: { fill: "#FF5B1A", stroke: "#FF5B1A", strokeWidthPt: 1 }, source: source("workflow-challenge-triad-native-warning-icon", { key }) });  
    add({ id: `workflow-challenge-warning-bang-${key}`, type: "line", box: { x: x + 20, y: y + 10, w: 0, h: 13 }, style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-warning-icon-mark", { key, part: "bang" }) });  
    add({ id: `workflow-challenge-warning-dot-${key}`, type: "ellipse", box: { x: x + 17, y: y + 26, w: 6, h: 6 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("workflow-challenge-triad-native-warning-icon-mark", { key, part: "dot" }) });  
  }  
    
  function shouldObjectifyWorkflowChallengeTriadIllustrations(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/混沌的输入端/.test(labels) || !/瓶颈的处理端/.test(labels) || !/割裂的输出端/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "structured-illustration-card-illustration-residual-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    return candidates.length === 3 && areaRatio > 0.18 && areaRatio < 0.35;  
  }  
    
  function filterWorkflowChallengeTriadIllustrationOcrTextBoxes(textBoxes = []) {  
    return (textBoxes || []).filter((textBox) => {  
      const text = normalizeCjkText(textBox.text);  
      const box = textBox.box || {};  
      const inIllustrationZone = Number(box.y || 0) >= 120 && Number(box.y || 0) <= 335;  
      if (inIllustrationZone && /^[…!?!?]+$/.test(text)) return false;  
      return true;  
    });  
  }

  return {
    createWorkflowChallengeTriadIllustrationObjects,
    materializeWorkflowChallengeTriadInputIllustrationCrop,
    shouldObjectifyWorkflowChallengeTriadIllustrations,
    filterWorkflowChallengeTriadIllustrationOcrTextBoxes
  };
}

module.exports = {
  createWorkflowChallengeTriadFactory
};
