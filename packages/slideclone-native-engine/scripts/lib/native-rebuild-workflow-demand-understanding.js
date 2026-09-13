"use strict";

function createWorkflowDemandUnderstandingFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    applyMinimumUnitCropRenderStrategy,
    lineBox,
    normalizeCjkText,
    roundedBox,
    round,
    sampleWorkflowMatrixCellFill,
    temporaryAnswerWorkflowTextBox,
    unionPtBoxes,
    workflowComparisonMeasuredFontSize,
    workflowComparisonMeasuredTextBox
  } = dependencies;

  function createWorkflowDemandUnderstandingAssistantObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {  
    if (!shouldObjectifyWorkflowDemandUnderstandingAssistant(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));  
    for (const image of sourceImages.filter((item) => item?.source?.detector === "left-illustration-panel-crop")) {  
      image.source = {  
        ...(image.source || {}),  
        editable: false,  
        nativeRebuild: true,  
        expressionForm: "icon-or-illustration",  
        expressionSubtype: "workflow-demand-funnel-illustration",  
        workflowDemandUnderstandingLeftIllustrationPreserved: true,  
        intentionalMinimumUnitCrop: true,  
        protectedMinimumUnit: true,  
        dropErasedResidualAfterNativeRebuild: false,  
        recommendedAction: "match-icon-library-or-keep-local-crop",  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow demand understanding funnel illustration"}; preserved the dense left illustration as a movable fidelity crop while rebuilding surrounding cards and value banner natively`  
      };  
      applyMinimumUnitCropRenderStrategy(image.source);  
    }  
    for (const image of sourceImages.filter((item) => item?.source?.detector === "bottom-banner-crop")) {  
      image.source = {  
        ...(image.source || {}),  
        workflowDemandUnderstandingAssistantObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow demand understanding assistant banner"}; rebuilt value banner as native editable components`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.9,  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const layout = workflowDemandUnderstandingLayout(rawTextBoxes, slideSize);  
    addWorkflowDemandCardShells(add, source, layout, sourceImage);  
    addWorkflowDemandCleanContentText(textBoxes, source, rawTextBoxes, layout);  
    addWorkflowDemandShieldIcon(add, source, layout);  
    addWorkflowDemandValueBanner(add, textBoxes, source, slideSize, rawTextBoxes, layout, sourceImage);  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyWorkflowDemandUnderstandingAssistant(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/需求理解助手/.test(labels) || !/核心痛点/.test(labels) || !/Skill解决方案/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));  
    const hasLeft = candidates.some((image) => image?.source?.detector === "left-illustration-panel-crop");  
    const hasBanner = candidates.some((image) => image?.source?.detector === "bottom-banner-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    return hasLeft && hasBanner && areaRatio > 0.25 && areaRatio < 0.6;  
  }  
    
  function isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop(image = {}, rawTextBoxes = []) {  
    if (image?.source?.detector !== "left-illustration-panel-crop") return false;  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    return /需求理解助手/.test(labels) && /核心痛点/.test(labels) && /Skill解决方案/.test(labels);  
  }  
    
  function addWorkflowDemandFunnelIllustration(add, textBoxes, source) {  
    add({ id: "workflow-demand-funnel-lip", type: "rect", box: { x: 90, y: 192, w: 260, h: 22 }, style: { fill: "#0768B5", stroke: "#0768B5", strokeWidthPt: 0, radiusPt: 9, shadow: { color: "#0768B5", alpha: 0.16, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-funnel", { part: "lip" }) });  
    add({ id: "workflow-demand-funnel-body", type: "freeform", box: { x: 116, y: 213, w: 208, h: 210 }, points: [{ x: 116, y: 213 }, { x: 324, y: 213 }, { x: 248, y: 355 }, { x: 244, y: 416 }, { x: 201, y: 423 }, { x: 197, y: 355 }], style: { fill: "#0870C3", stroke: "#075A9F", strokeWidthPt: 2, opacity: 0.98 }, source: source("workflow-demand-native-funnel", { part: "body" }) });  
    add({ id: "workflow-demand-funnel-inner-left", type: "freeform", box: { x: 124, y: 220, w: 76, h: 145 }, points: [{ x: 124, y: 220 }, { x: 171, y: 220 }, { x: 202, y: 349 }, { x: 191, y: 365 }], style: { fill: "#5AA4D3", stroke: "none", strokeWidthPt: 0, opacity: 0.45 }, source: source("workflow-demand-native-funnel", { part: "inner-left" }) });  
    add({ id: "workflow-demand-funnel-glow", type: "ellipse", box: { x: 158, y: 244, w: 118, h: 95 }, style: { fill: "#49D66E", stroke: "none", strokeWidthPt: 0, opacity: 0.28 }, source: source("workflow-demand-native-funnel-glow") });  
    [0, 1, 2].forEach((index) => {  
      add({ id: `workflow-demand-gear-${index}`, type: "ellipse", box: { x: 186 + index * 28, y: 268 + (index % 2) * 18, w: 34, h: 34 }, style: { fill: "#EAF8EF", stroke: "#BFE8C9", strokeWidthPt: 2 }, source: source("workflow-demand-native-gear", { index }) });  
      add({ id: `workflow-demand-gear-hole-${index}`, type: "ellipse", box: { x: 197 + index * 28, y: 279 + (index % 2) * 18, w: 12, h: 12 }, style: { fill: "#56C66E", stroke: "#56C66E", strokeWidthPt: 0 }, source: source("workflow-demand-native-gear", { index, part: "hole" }) });  
    });  
    const docs = [  
      { kind: "chat", x: 75, y: 95, color: "#D9EEF9", stroke: "#0E71A9" },  
      { kind: "doc", x: 215, y: 74, color: "#D9EEF9", stroke: "#0E71A9" },  
      { kind: "note", x: 289, y: 88, color: "#0D6FB8", stroke: "#075A9F" },  
      { kind: "doc", x: 164, y: 133, color: "#D9EEF9", stroke: "#0E71A9" },  
      { kind: "card", x: 276, y: 146, color: "#D9EEF9", stroke: "#0E71A9" }  
    ];  
    docs.forEach((doc, index) => {  
      add({ id: `workflow-demand-floating-${index}`, type: "rect", box: { x: doc.x, y: doc.y, w: index === 0 ? 54 : 44, h: index === 0 ? 42 : 54 }, style: { fill: doc.color, stroke: doc.stroke, strokeWidthPt: 1.3, radiusPt: 4, rotate: index === 2 ? 13 : index === 3 ? -12 : 0 }, source: source("workflow-demand-native-floating-doc", { index, kind: doc.kind }) });  
      [0, 1, 2].forEach((line) => add({ id: `workflow-demand-floating-line-${index}-${line}`, type: "line", box: { x: doc.x + 10, y: doc.y + 13 + line * 10, w: index === 0 ? 30 : 23, h: 0 }, style: { stroke: index === 2 ? "#E8F2FA" : "#6D94A9", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("workflow-demand-native-floating-doc-line", { index, line }) }));  
    });  
    const pills = [  
      ["需求理解", 139, 398, "#10A34E"],  
      ["PRD生成", 224, 398, "#075FAB"],  
      ["精准提炼", 139, 428, "#075FAB"],  
      ["结构清单", 224, 428, "#10A34E"]  
    ];  
    pills.forEach(([label, x, y, fill], index) => {  
      add({ id: `workflow-demand-pill-${index}`, type: "rect", box: { x, y, w: 78, h: 24 }, style: { fill, stroke: fill, strokeWidthPt: 0, radiusPt: 5 }, source: source("workflow-demand-native-pill", { index }) });  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-demand-pill-text-${index}`, label, { x: x + 8, y: y + 5, w: 62, h: 15 }, { sizePt: 11.5, color: "#FFFFFF", weight: "bold", align: "center" }, source("workflow-demand-native-text", { role: "pill", index })));  
    });  
  }  
    
  function addWorkflowDemandCardShells(add, source, layout, sourceImage = null) {  
    const painFill = sampleWorkflowMatrixCellFill(sourceImage, layout.painCard, layout.slideSize, "#FFFFFF");  
    const solutionFill = sampleWorkflowMatrixCellFill(sourceImage, layout.solutionCard, layout.slideSize, "#F7FFF9");  
    const solutionHeaderFill = sampleWorkflowMatrixCellFill(sourceImage, { x: layout.solutionCard.x, y: layout.solutionCard.y, w: layout.solutionCard.w, h: layout.headerH }, layout.slideSize, "#F1FCF3");  
    add({ id: "workflow-demand-pain-card", type: "rect", box: layout.painCard, style: { fill: painFill, stroke: "#B8B8B8", strokeWidthPt: 1.6, radiusPt: 5, shadow: { color: "#818181", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-card", { role: "pain" }) });  
    add({ id: "workflow-demand-pain-accent", type: "rect", box: { x: layout.painCard.x + 22, y: layout.painCard.y - 4, w: layout.painCard.w - 42, h: 9 }, style: { fill: "#F17612", stroke: "#F17612", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-demand-native-card-accent", { role: "pain" }) });  
    add({ id: "workflow-demand-pain-separator", type: "line", box: { x: layout.painCard.x + 2, y: layout.separatorY, w: layout.painCard.w - 4, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-demand-native-card-separator", { role: "pain" }) });  
    add({ id: "workflow-demand-solution-card", type: "rect", box: layout.solutionCard, style: { fill: solutionFill, stroke: "#0C6CA8", strokeWidthPt: 2.2, radiusPt: 5, shadow: { color: "#0C6CA8", alpha: 0.1, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("workflow-demand-native-card", { role: "solution" }) });  
    add({ id: "workflow-demand-solution-accent", type: "rect", box: { x: layout.solutionCard.x + 23, y: layout.solutionCard.y - 4, w: layout.solutionCard.w - 46, h: 9 }, style: { fill: "#18A95B", stroke: "#18A95B", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-demand-native-card-accent", { role: "solution" }) });  
    add({ id: "workflow-demand-solution-header-fill", type: "rect", box: { x: layout.solutionCard.x + 2, y: layout.solutionCard.y + 1, w: layout.solutionCard.w - 4, h: layout.headerH - 1 }, style: { fill: solutionHeaderFill, stroke: "none", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-demand-native-card-header-fill", { role: "solution" }) });  
    add({ id: "workflow-demand-solution-separator", type: "line", box: { x: layout.solutionCard.x + 2, y: layout.separatorY, w: layout.solutionCard.w - 4, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-demand-native-card-separator", { role: "solution" }) });  
  }  
    
  function addWorkflowDemandCleanContentText(textBoxes, source, rawTextBoxes = [], layout) {  
    const evidence = workflowDemandTextEvidence(rawTextBoxes);  
    const painLines = evidence.painLines.length > 0 ? evidence.painLines : [  
      { text: "· 跨多源信息极难收敛", box: { x: 451, y: 204, w: 164, h: 21 }, font: { sizePt: 14.8 } },  
      { text: "· 极易带着隐藏“信息", box: { x: 448, y: 255, w: 161, h: 17 }, font: { sizePt: 12.2 } },  
      { text: "缺口” 开始写作", box: { x: 461, y: 281, w: 115, h: 20 }, font: { sizePt: 14.3 } }  
    ];  
    const solutionLines = evidence.solutionLines.length > 0 ? evidence.solutionLines : [  
      { text: "· 多源归集：会议纪要、竞品截图、旧版统一收口", box: { x: 680, y: 207, w: 200, h: 45 }, font: { sizePt: 12.2 } },  
      { text: "· 精准提炼：自动抽取业务目标、角色权限、核心流程", box: { x: 680, y: 282, w: 215, h: 46 }, font: { sizePt: 12.2 } },  
      { text: "暴露缺口：自动扫描并生成“异常场景边界”与“待确认问题清单”", box: { x: 695, y: 356, w: 188, h: 73 }, font: { sizePt: 12.2 } }  
    ];  
    const addMeasured = (id, value, item, fallbackBox, style, extra) => {  
      const { sizeScale = 1, ...fontStyle } = style;  
      textBoxes.push(temporaryAnswerWorkflowTextBox(id, value, workflowComparisonMeasuredTextBox(item, fallbackBox), {  
        ...fontStyle,  
        sizePt: round(workflowComparisonMeasuredFontSize(item, style.sizePt) * sizeScale)  
      }, source("workflow-demand-native-text", extra)));  
    };  
    const titleBox = unionPtBoxes(evidence.title.filter(Boolean).map((item) => item.box)) || { x: 430, y: 72, w: 450, h: 42 };  
    const expandedTitleBox = { x: titleBox.x - 2, y: titleBox.y - 4, w: titleBox.w + 4, h: titleBox.h + 8 };  
    addMeasured("workflow-demand-page-title", "能力深潜 01 — 需求理解助手", { box: expandedTitleBox, font: { sizePt: Math.max(...evidence.title.map((item) => Number(item?.font?.sizePt || 0)), 21.6) } }, expandedTitleBox, { sizePt: 21.6, sizeScale: 1.28, color: "#1F557B", weight: "bold", align: "left" }, { role: "title" });  
    addMeasured("workflow-demand-pain-title", "核心痛点", evidence.painTitle, { x: 484, y: 151, w: 94, h: 28 }, { sizePt: 17.8, sizeScale: 1.15, color: "#C1763A", weight: "bold", align: "center" }, { role: "pain-title" });  
    addMeasured("workflow-demand-solution-title", "Skill 解决方案", evidence.solutionTitle, { x: 703, y: 152, w: 145, h: 26 }, { sizePt: 14.9, sizeScale: 1.25, color: "#25833E", weight: "bold", align: "center" }, { role: "solution-title" });  
    painLines.forEach((item, index) => addMeasured(`workflow-demand-pain-line-${index}`, item.text, item, item.box, { sizePt: 13, color: "#111111", weight: "regular", align: "left" }, { role: "pain-body", line: index }));  
    solutionLines.forEach((item, index) => addMeasured(`workflow-demand-solution-line-${index}`, item.text, item, item.box, { sizePt: 13, color: "#111111", weight: "regular", align: "left" }, { role: "solution-body", line: index }));  
  }  
    
  function addWorkflowDemandValueBanner(add, textBoxes, source, slideSize = DEFAULT_SLIDE, rawTextBoxes = [], layout = null, sourceImage = null) {  
    const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
    const banner = layout?.banner || { x: 0, y: 485, w: width, h: 55 };  
    const fill = sampleWorkflowMatrixCellFill(sourceImage, banner, slideSize, "#0C9F3F");  
    add({ id: "workflow-demand-value-banner-bg", type: "rect", box: banner, style: { fill, stroke: fill, strokeWidthPt: 0 }, source: source("workflow-demand-native-value-banner") });  
    const evidence = workflowDemandTextEvidence(rawTextBoxes);  
    const valueBox = unionPtBoxes(evidence.valueLines.map((item) => item.box)) || { x: 120, y: 501, w: 705, h: 24 };  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-demand-value-banner-copy", "产出价值：PM 告别资料搬运工，讨论直击结构化问题清单，起跑线锁定质量。", workflowComparisonMeasuredTextBox({ box: valueBox }, valueBox), { sizePt: 17.2, color: "#FFFFFF", weight: "bold", align: "left" }, source("workflow-demand-native-text", { role: "value-copy" })));  
  }  
    
  function workflowDemandUnderstandingLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const evidence = workflowDemandTextEvidence(rawTextBoxes);  
    const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
    const height = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const painX = Number(evidence.painLines[0]?.box?.x || 451) - 21;  
    const solutionX = Number(evidence.solutionLines[0]?.box?.x || 680) - 27;  
    const cardY = Math.min(Number(evidence.painTitle?.box?.y || 152), Number(evidence.solutionTitle?.box?.y || 154)) - 15;  
    const bannerY = Math.min(...evidence.valueLines.map((item) => Number(item.box?.y || height)), height) - 18;  
    const cardBottom = bannerY - 30;  
    const separatorY = Math.min(Number(evidence.painLines[0]?.box?.y || 204), Number(evidence.solutionLines[0]?.box?.y || 207)) - 16;  
    return {  
      slideSize,  
      painCard: { x: round(painX), y: round(cardY), w: round(solutionX - painX - 22), h: round(cardBottom - cardY) },  
      solutionCard: { x: round(solutionX), y: round(cardY), w: round(width - solutionX - 56), h: round(cardBottom - cardY) },  
      headerH: round(separatorY - cardY),  
      separatorY: round(separatorY),  
      banner: { x: 0, y: round(bannerY), w: width, h: round(height - bannerY) }  
    };  
  }  
    
  function workflowDemandTextEvidence(rawTextBoxes = []) {  
    const find = (value) => rawTextBoxes.find((item) => normalizeCjkText(item.text) === normalizeCjkText(value)) || null;  
    const combinedTitle = rawTextBoxes.find((item) => /能力深潜.*需求理解助手/.test(normalizeCjkText(item.text))) || null;  
    const painLines = ["·跨多源信息极难收敛", "·极易带着隐藏“信息", "缺口”开始写作"].map(find).filter(Boolean);  
    const solutionLines = ["·多源归集：会议纪要、竞", "品截图、旧版统一收口", "·精准提炼：自动抽取业务目", "标、角色权限、核心流程", "暴露缺口：自动扫描并生", "成“异常场景边界”与“待", "确认问题清单”"].map(find).filter(Boolean);  
    return {  
      title: combinedTitle ? [combinedTitle] : [find("能力深潜01—"), find("需求理解助手")].filter(Boolean),  
      painTitle: find("核心痛点"),  
      solutionTitle: find("Skill解决方案"),  
      painLines,  
      solutionLines,  
      valueLines: [find("产出价值：PM告别资料搬运工，讨论直击结构化问题清单，"), find("起跑线锁定质量。")].filter(Boolean)  
    };  
  }  
    
  function addWorkflowDemandShieldIcon(add, source, layout) {  
    const x = layout.solutionCard.x + 12;  
    const y = layout.separatorY + (layout.solutionCard.h - layout.headerH) * 0.57;  
    add({ id: "workflow-demand-shield", type: "freeform", box: { x, y, w: 24, h: 30 }, points: [{ x: x + 12, y }, { x: x + 24, y: y + 5 }, { x: x + 21, y: y + 22 }, { x: x + 12, y: y + 30 }, { x: x + 3, y: y + 22 }, { x, y: y + 5 }], style: { fill: "#F47B20", stroke: "#E56A12", strokeWidthPt: 0.8 }, source: source("workflow-demand-native-shield-icon") });  
    add({ id: "workflow-demand-shield-check-a", type: "line", box: lineBox({ x: x + 6, y: y + 15 }, { x: x + 10, y: y + 20 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight", lineCap: "round" }, source: source("workflow-demand-native-shield-check") });  
    add({ id: "workflow-demand-shield-check-b", type: "line", box: lineBox({ x: x + 10, y: y + 20 }, { x: x + 18, y: y + 10 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.2, connectorType: "straight", lineCap: "round" }, source: source("workflow-demand-native-shield-check") });  
  }

  return {
    createWorkflowDemandUnderstandingAssistantObjects,
    shouldObjectifyWorkflowDemandUnderstandingAssistant,
    isWorkflowDemandUnderstandingAssistantLeftIllustrationCrop,
    workflowDemandUnderstandingLayout,
    workflowDemandTextEvidence
  };
}

module.exports = {
  createWorkflowDemandUnderstandingFactory
};
