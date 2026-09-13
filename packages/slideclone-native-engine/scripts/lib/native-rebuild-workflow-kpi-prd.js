"use strict";

function createWorkflowKpiPrdFactory(dependencies = {}) {
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
    workflowComparisonMeasuredFontSize,
    workflowComparisonMeasuredTextBox,
    workflowSupplyChainTwoPanelEvidenceText,
    writePng
  } = dependencies;

  function createWorkflowKpiEvidenceObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const objectifyFullPage = shouldObjectifyWorkflowKpiEvidence(page, rawTextBoxes, slideSize);  
    const conclusionOnlyCrop = objectifyFullPage ? null : workflowKpiEvidenceConclusionResidualCrop(page, rawTextBoxes, slideSize);  
    if (!objectifyFullPage && !conclusionOnlyCrop) return { shapes: [], textBoxes: [] };  
    const sourceImages = objectifyFullPage  
      ? (page.images || []).filter((image) => image?.source?.detector === "kpi-evidence-crop")  
      : [conclusionOnlyCrop];  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        workflowKpiEvidenceObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        preserveKpiEvidenceCropUnderNativeText: false,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow KPI evidence crop"}; rebuilt ${objectifyFullPage ? "KPI evidence cards and conclusion banner" : "KPI evidence conclusion banner"} as native editable components`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.9,  
      expressionForm: "kpi-evidence-layout",  
      expressionSubtype: "workflow-data-evidence",  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    if (!objectifyFullPage) {  
      addWorkflowKpiEvidenceConclusion(add, textBoxes, source, conclusionOnlyCrop?.box);  
      return { shapes, textBoxes };  
    }  
    addWorkflowKpiEvidenceTitle(add, textBoxes, source, rawTextBoxes);  
    addWorkflowKpiEvidenceCards(add, textBoxes, source, rawTextBoxes);  
    addWorkflowKpiEvidenceConclusion(add, textBoxes, source, null, rawTextBoxes);  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyWorkflowKpiEvidence(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = [  
      ...(rawTextBoxes || []).map((item) => item?.text),  
      ...(page.textBoxes || []).map((item) => item?.text),  
      ...(page.images || []).flatMap((image) => [image?.source?.pageText, image?.source?.allText, image?.source?.ocrText])  
    ].map((item) => normalizeCjkText(item)).join(" ");  
    if (!/数据见证/.test(labels) || !/规模化企业底座/.test(labels)) return false;  
    if (!/9大/.test(labels) || !/15个/.test(labels) || !/500\+份/.test(labels) || !/400\+个/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "kpi-evidence-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    if (candidates.length === 3 && areaRatio > 0.52 && areaRatio < 0.75) return true;  
    // OCR can retain all KPI labels while upstream splitting leaves only the bottom conclusion strip.  
    const residual = candidates[0]?.box || {};  
    const metricTextBoxes = (rawTextBoxes || []).filter((textBox) => {  
      const value = normalizeCjkText(textBox?.text);  
      return /9大|15个|500\+份|400\+个/.test(value)  
        && Number(textBox?.box?.y || 0) < Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.82;  
    });  
    return candidates.length <= 1  
      && metricTextBoxes.length >= 4  
      && Number(residual.w || 0) >= Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * 0.68  
      && Number(residual.h || 0) <= Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.14;  
  }  
    
  function workflowKpiEvidenceConclusionResidualCrop(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
    const height = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const textEvidence = [  
      ...(rawTextBoxes || []).map((item) => item?.text),  
      ...(page.textBoxes || []).map((item) => item?.text),  
      ...(page.images || []).flatMap((image) => [  
        image?.source?.pageText,  
        image?.source?.allText,  
        image?.source?.ocrText  
      ])  
    ].map((item) => normalizeCjkText(item)).join(" ");  
    if (!/数据见证/.test(textEvidence) || !/规模化企业底座/.test(textEvidence)) return null;  
    if (!/9大/.test(textEvidence) || !/15个/.test(textEvidence) || !/500\+份/.test(textEvidence) || !/400\+个/.test(textEvidence)) return null;  
    if (!/复杂高密度业务场景/.test(textEvidence) && !/企业级基础设施/.test(textEvidence)) return null;  
    const candidates = (page.images || []).filter((image) => image?.source?.detector === "kpi-evidence-crop");  
    if (candidates.length !== 1) return null;  
    const image = candidates[0];  
    const box = image.box || {};  
    const x = Number(box.x || 0);  
    const y = Number(box.y || 0);  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const isBottomConclusionBanner = w >= width * 0.68  
      && h >= height * 0.07  
      && h <= height * 0.14  
      && x >= width * 0.06  
      && y >= height * 0.78;  
    return isBottomConclusionBanner ? image : null;  
  }  
    
  function workflowKpiEvidenceTextAnchor(textBoxes = [], matcher) {  
    const matches = matcher instanceof RegExp  
      ? (text) => {  
        matcher.lastIndex = 0;  
        return matcher.test(text);  
      }  
      : typeof matcher === "function"  
        ? matcher  
        : () => false;  
    return (textBoxes || []).find((item) => matches(normalizeCjkText(item?.text))) || null;  
  }  
    
  function workflowKpiEvidenceAnchorY(anchor, fallback, offset) {  
    const y = Number(anchor?.box?.y);  
    return Number.isFinite(y) ? round(y + offset) : fallback;  
  }  
    
  function workflowKpiEvidenceFontSize(anchor, fallback, options = {}) {  
    const explicit = Number(anchor?.font?.sizePt);  
    const height = Number(anchor?.box?.h);  
    const heightRatio = Number(options.heightRatio || 0);  
    const inferred = Number.isFinite(height) && heightRatio > 0 ? height * heightRatio : 0;  
    const evidenceValue = Math.max(Number.isFinite(explicit) ? explicit : 0, inferred);  
    const value = evidenceValue > 0 ? evidenceValue : Number(fallback || 0);  
    const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 6;  
    const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 96;  
    return round(Math.max(min, Math.min(max, value)));  
  }  
    
  function addWorkflowKpiEvidenceTitle(add, textBoxes, source, rawTextBoxes = []) {  
    const titleAnchor = workflowKpiEvidenceTextAnchor(rawTextBoxes, (text) => /数据见证/.test(text));  
    const titleSize = Math.max(34, workflowKpiEvidenceFontSize(titleAnchor, 34, { heightRatio: 1.25, min: 30, max: 36 }));  
    add({ id: "workflow-kpi-evidence-title-bar", type: "rect", box: { x: 48, y: 39, w: 4, h: 38 }, style: { fill: "#0B66C3", stroke: "#0B66C3", strokeWidthPt: 0 }, source: source("workflow-kpi-evidence-native-title-accent", { part: "bar" }) });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-kpi-evidence-title", "数据见证：从“概念试点”到“规模化企业底座”", { x: 61, y: workflowKpiEvidenceAnchorY(titleAnchor, 36, -12), w: 850, h: 48 }, { family: "Microsoft YaHei", sizePt: titleSize, color: "#10233A", weight: "bold", align: "left", wrap: false }, source("workflow-kpi-evidence-native-text", { role: "title" })));  
  }  
    
  function addWorkflowKpiEvidenceCards(add, textBoxes, source, rawTextBoxes = []) {  
    const cards = [  
      // Card bounds are sampled from the source border pixels, independent of OCR text boxes.  
      { key: "domains", value: "9 大", valueMatcher: /^9大$/, body: "确立跨域产品资产底座（物流、供应链、履约等）", bodyMatcher: /确立跨域产品资产/, x: 49, y: 109, w: 424, h: 159, valueSize: 72 },  
      { key: "systems", value: "15 个", valueMatcher: /^15个$/, body: "核心配置系统深度接入", bodyMatcher: /核心配置系统/, x: 486, y: 109, w: 425, h: 159, valueSize: 70 },  
      { key: "docs", value: "500+ 份", valueMatcher: /^500\+份$/, body: "结构化主轨与评审 PRD 文档沉淀", bodyMatcher: /结构化主轨与评审/, x: 49, y: 283, w: 424, h: 159, valueSize: 73 },  
      { key: "ui", value: "400+ 个", valueMatcher: /^400\+个$/, body: "精准回流的高保真原型 UI 组件代码", bodyMatcher: /精准回流的高保真/, x: 486, y: 283, w: 425, h: 159, valueSize: 73 }  
    ];  
    // Calibrated from PowerPoint ink bounds for this native KPI component. CJK and  
    // numeric glyphs have materially different YaHei widths, so one global size  
    // would make at least one card visibly drift from the source.  
    const powerPointValueCalibration = {  
      domains: { sizePtAdjustment: -2.2, yAdjustment: 6 },  
      systems: { sizePtAdjustment: -2.8, yAdjustment: 6 },  
      docs: { sizePtAdjustment: 1.9, yAdjustment: 6 },  
      ui: { sizePtAdjustment: 6.4, yAdjustment: 5.4 }  
    };  
    cards.forEach((card, index) => {  
      const valueAnchor = workflowKpiEvidenceTextAnchor(rawTextBoxes, card.valueMatcher);  
      const bodyAnchor = workflowKpiEvidenceTextAnchor(rawTextBoxes, card.bodyMatcher);  
      const calibration = powerPointValueCalibration[card.key] || { sizePtAdjustment: 0, yAdjustment: 0 };  
      const valueSize = round(workflowKpiEvidenceFontSize(valueAnchor, card.valueSize, { heightRatio: 0.95, min: 54, max: 74 }) + 2 + calibration.sizePtAdjustment);  
      const bodySize = 17;  
      const valueFallbackY = card.y + (index < 2 ? 23 : 20);  
      add({ id: `workflow-kpi-evidence-card-${card.key}`, type: "roundRect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#FFFFFF", stroke: "#D4D8DE", strokeWidthPt: 1.25, radiusPt: 6, shadow: { color: "#9AA8B3", alpha: 0.16, blurPt: 3.6, distancePt: 1.1, angle: 45 } }, source: source("workflow-kpi-evidence-native-card", { index, key: card.key }) });  
      // PowerPoint's YaHei vertical metrics place ink lower than the OCR box.  
      // These per-card offsets are measured against the source pixel ink bounds.  
      const valueOffsets = [-13, -16, -15, -20];  
      const captionOffsets = [-6, -7, -8, -8];  
      const valueOffset = valueOffsets[index] + calibration.yAdjustment;  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-kpi-evidence-value-${card.key}`, card.value, { x: card.x + 32, y: workflowKpiEvidenceAnchorY(valueAnchor, valueFallbackY, valueOffset), w: card.w - 64, h: 88 }, { family: "Microsoft YaHei", sizePt: valueSize, color: "#075FC4", weight: "bold", align: "center" }, source("workflow-kpi-evidence-native-text", { role: "value", key: card.key })));  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-kpi-evidence-caption-${card.key}`, card.body, { x: card.x + 24, y: workflowKpiEvidenceAnchorY(bodyAnchor, card.y + 117, captionOffsets[index]), w: card.w - 48, h: 29 }, { family: "Microsoft YaHei", sizePt: bodySize, color: "#111111", weight: "regular", align: "center" }, source("workflow-kpi-evidence-native-text", { role: "caption", key: card.key })));  
    });  
  }  
    
  function addWorkflowKpiEvidenceConclusion(add, textBoxes, source, cropBox = null, rawTextBoxes = []) {  
    const box = cropBox  
      ? { x: Number(cropBox.x || 98) + 2, y: Number(cropBox.y || 462) + 2, w: Math.max(20, Number(cropBox.w || 764) - 4), h: Math.max(12, Number(cropBox.h || 52) - 4) }  
      : { x: 98, y: 462, w: 764, h: 52 };  
    add({ id: "workflow-kpi-evidence-conclusion-bg", type: "roundRect", box, style: { fill: "#EFF8FF", stroke: "#0B66C3", strokeWidthPt: 1.6, radiusPt: 6 }, source: source("workflow-kpi-evidence-native-conclusion-banner", { conclusionOnlyResidual: Boolean(cropBox) }) });  
    const conclusionAnchor = workflowKpiEvidenceTextAnchor(rawTextBoxes, (text) => /AI\s*Skills|AISkills/i.test(text) && /企业级基础设施/.test(text));  
    const defaultY = box.y + Math.max(8, (box.h - 24) / 2);  
    const conclusionSize = 16.5;  
    const conclusion = temporaryAnswerWorkflowTextBox("workflow-kpi-evidence-conclusion-text", "AI Skills 已在复杂高密度业务场景中被验证，成为具备强大复制能力的企业级基础设施。", { x: box.x + 18, y: workflowKpiEvidenceAnchorY(conclusionAnchor, defaultY, -4), w: Math.max(20, box.w - 36), h: 28 }, { family: "Microsoft YaHei", sizePt: conclusionSize, color: "#111111", weight: "regular", align: "center", wrap: false }, source("workflow-kpi-evidence-native-text", { role: "conclusion", conclusionOnlyResidual: Boolean(cropBox) }));  
    conclusion.runs = [  
      { text: "AI Skills", font: { family: "Microsoft YaHei", sizePt: conclusionSize, color: "#075FC4", weight: "bold" } },  
      { text: " 已在", font: { family: "Microsoft YaHei", sizePt: conclusionSize, color: "#111111", weight: "regular" } },  
      { text: "复杂高密度业务场景", font: { family: "Microsoft YaHei", sizePt: conclusionSize, color: "#075FC4", weight: "bold" } },  
      { text: "中被验证，成为具备强大复制能力的企业级基础设施。", font: { family: "Microsoft YaHei", sizePt: conclusionSize, color: "#111111", weight: "regular" } }  
    ];  
    textBoxes.push(conclusion);  
  }  
    
  function addWorkflowChallengeInputChaosIllustration(add, textBoxes, source, box) {  
    const x = Number(box.x || 88.83);  
    const y = Number(box.y || 130.51);  
    const w = Number(box.w || 228.56);  
    const h = Number(box.h || 202.88);  
    const sx = w / 228.56;  
    const sy = h / 202.88;  
    const pt = (px, py, pw, ph) => ({ x: x + px * sx, y: y + py * sy, w: pw * sx, h: ph * sy });  
    addWorkflowChallengeMiniPaper(add, source, pt(22, 8, 46, 44), -13, "input-chaos", 0);  
    addWorkflowChallengeMiniPaper(add, source, pt(39, 110, 54, 58), -11, "input-chaos", 1);  
    addWorkflowChallengeMiniPaper(add, source, pt(150, 111, 58, 56), 12, "input-chaos", 2);  
    add({ id: "workflow-challenge-input-chat-a", type: "rect", box: pt(18, 74, 47, 30), style: { fill: "#4EA2E5", stroke: "#0C68A8", strokeWidthPt: 1.2, radiusPt: 4 }, source: source("workflow-challenge-triad-native-chat", { card: "input", index: 0 }) });  
    add({ id: "workflow-challenge-input-chat-tail", type: "triangle", box: pt(30, 96, 18, 16), style: { fill: "#4EA2E5", stroke: "#0C68A8", strokeWidthPt: 1, rotate: 180 }, source: source("workflow-challenge-triad-native-chat", { card: "input", part: "tail" }) });  
    add({ id: "workflow-challenge-input-question-chat", type: "rect", box: pt(156, 42, 45, 31), style: { fill: "#FFD95F", stroke: "#81702B", strokeWidthPt: 1.1, radiusPt: 4 }, source: source("workflow-challenge-triad-native-chat", { card: "input", index: 1 }) });  
    add({ id: "workflow-challenge-input-question-tail", type: "triangle", box: pt(183, 66, 18, 16), style: { fill: "#FFD95F", stroke: "#81702B", strokeWidthPt: 1, rotate: 180 }, source: source("workflow-challenge-triad-native-chat", { card: "input", part: "question-tail" }) });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-challenge-input-question-mark", "?", pt(176, 49, 18, 18), { sizePt: 14, color: "#2F3E4C", weight: "bold", align: "center" }, source("workflow-challenge-triad-native-text", { card: "input", symbol: "question" })));  
    const orange = "#F26A21";  
    [  
      [95, 45, 32, 42], [126, 86, -44, 34], [93, 120, 54, -26], [147, 94, 42, 44],  
      [90, 75, -35, 22], [129, 52, 45, 14], [112, 130, 34, 30]  
    ].forEach(([lx, ly, lw, lh], index) => {  
      add({ id: `workflow-challenge-input-zigzag-${index}`, type: "line", box: pt(lx, ly, lw, lh), style: { stroke: orange, strokeWidthPt: 2.2, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-chaos-line", { index }) });  
    });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-challenge-input-bang", "!?", pt(188, 88, 18, 30), { sizePt: 24, color: "#F05A1A", weight: "bold", align: "center" }, source("workflow-challenge-triad-native-text", { card: "input", symbol: "bang-question" })));  
  }  
    
  function addWorkflowChallengeProcessingBottleneckIllustration(add, source, box) {  
    const x = Number(box.x || 365.35);  
    const y = Number(box.y || 130.51);  
    const w = Number(box.w || 228.56);  
    const h = Number(box.h || 202.88);  
    const sx = w / 228.56;  
    const sy = h / 202.88;  
    const pt = (px, py, pw, ph) => ({ x: x + px * sx, y: y + py * sy, w: pw * sx, h: ph * sy });  
    add({ id: "workflow-challenge-processing-warning", type: "triangle", box: pt(90, 8, 60, 54), style: { fill: "#FF5B1A", stroke: "#FF5B1A", strokeWidthPt: 1.2 }, source: source("workflow-challenge-triad-native-warning", { card: "processing" }) });  
    add({ id: "workflow-challenge-processing-warning-bang", type: "line", box: pt(120, 24, 0, 18), style: { stroke: "#FFFFFF", strokeWidthPt: 4, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-warning-mark", { part: "bang" }) });  
    add({ id: "workflow-challenge-processing-warning-dot", type: "ellipse", box: pt(117, 47, 7, 7), style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("workflow-challenge-triad-native-warning-mark", { part: "dot" }) });  
    [[50, 21, 28, 24], [151, 21, 28, 24]].forEach(([lx, ly, lw, lh], index) => {  
      [0, 1, 2].forEach((ring) => add({ id: `workflow-challenge-processing-wave-${index}-${ring}`, type: "arc", box: pt(lx + ring * (index === 0 ? -7 : 7), ly - ring * 3, lw + ring * 5, lh + ring * 8), style: { stroke: "#F8B499", strokeWidthPt: 2, fill: "none", opacity: 0.55, flipH: index === 0 }, source: source("workflow-challenge-triad-native-warning-wave", { index, ring }) }));  
    });  
    const gears = [  
      [38, 91, 45], [82, 121, 43], [118, 88, 43], [151, 105, 55], [63, 151, 34], [127, 158, 43], [176, 148, 30]  
    ];  
    gears.forEach(([gx, gy, size], index) => addWorkflowChallengeGear(add, source, pt(gx, gy, size, size), index));  
    add({ id: "workflow-challenge-processing-person-head", type: "ellipse", box: pt(96, 105, 18, 18), style: { fill: "#34424D", stroke: "#34424D", strokeWidthPt: 0 }, source: source("workflow-challenge-triad-native-stuck-person", { part: "head" }) });  
    add({ id: "workflow-challenge-processing-person-body", type: "line", box: pt(103, 121, 28, 30), style: { stroke: "#34424D", strokeWidthPt: 9, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-stuck-person", { part: "body" }) });  
    add({ id: "workflow-challenge-processing-person-arm", type: "line", box: pt(111, 127, -38, 24), style: { stroke: "#34424D", strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-stuck-person", { part: "arm" }) });  
    add({ id: "workflow-challenge-processing-person-leg-a", type: "line", box: pt(126, 150, -18, 36), style: { stroke: "#34424D", strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-stuck-person", { part: "leg-a" }) });  
    add({ id: "workflow-challenge-processing-person-leg-b", type: "line", box: pt(129, 150, 31, 23), style: { stroke: "#34424D", strokeWidthPt: 7, connectorType: "straight", lineCap: "round" }, source: source("workflow-challenge-triad-native-stuck-person", { part: "leg-b" }) });  
  }  
    
  function addWorkflowChallengeOutputFragmentationIllustration(add, source, box) {  
    const x = Number(box.x || 663.23);  
    const y = Number(box.y || 130.51);  
    const w = Number(box.w || 221.44);  
    const h = Number(box.h || 202.88);  
    const sx = w / 221.44;  
    const sy = h / 202.88;  
    const pt = (px, py, pw, ph) => ({ x: x + px * sx, y: y + py * sy, w: pw * sx, h: ph * sy });  
    addWorkflowChallengeReportPage(add, source, pt(75, 12, 88, 116), 0);  
    addWorkflowChallengeReportPage(add, source, pt(88, 4, 88, 116), 1);  
    add({ id: "workflow-challenge-output-chart-pie", type: "pie", box: pt(105, 48, 31, 31), style: { fill: "#347ED1", stroke: "#347ED1", strokeWidthPt: 1 }, source: source("workflow-challenge-triad-native-report-chart", { chart: "pie" }) });  
    [0, 1, 2].forEach((index) => add({ id: `workflow-challenge-output-report-line-${index}`, type: "line", box: pt(141, 48 + index * 9, 43, 0), style: { stroke: "#C8D2DC", strokeWidthPt: 2, connectorType: "straight" }, source: source("workflow-challenge-triad-native-report-line", { index }) }));  
    [0, 1, 2].forEach((index) => add({ id: `workflow-challenge-output-bar-${index}`, type: "rect", box: pt(151 + index * 11, 91 - index * 9, 7, 28 + index * 9), style: { fill: index === 2 ? "#2E7FD0" : "#B9C6D2", stroke: "none", strokeWidthPt: 0 }, source: source("workflow-challenge-triad-native-report-bar", { index }) }));  
    const squares = [  
      [90, 124, 8, "#2E7FD0"], [107, 132, 10, "#FFFFFF"], [126, 121, 9, "#9EB9DA"], [145, 136, 11, "#4C8CD4"],  
      [164, 126, 8, "#6A7480"], [184, 139, 9, "#FFFFFF"], [116, 153, 9, "#2E7FD0"], [137, 159, 8, "#B7D1F0"],  
      [157, 156, 8, "#FFFFFF"], [177, 169, 9, "#9EB9DA"], [103, 176, 7, "#D9E1EC"], [148, 183, 7, "#9EB9DA"]  
    ];  
    squares.forEach(([sx0, sy0, size, fill], index) => {  
      const stroke = fill === "#FFFFFF" ? "#6D7B88" : fill;  
      add({ id: `workflow-challenge-output-fragment-${index}`, type: "rect", box: pt(sx0, sy0, size, size), style: { fill, stroke, strokeWidthPt: 0.9, opacity: index > 8 ? 0.62 : 0.95 }, source: source("workflow-challenge-triad-native-fragment", { index }) });  
    });  
  }  
    
  function addWorkflowChallengeMiniPaper(add, source, box, rotate, card, index) {  
    add({ id: `workflow-challenge-paper-${card}-${index}`, type: "rect", box, style: { fill: "#EDF4F8", stroke: "#4F5D66", strokeWidthPt: 1.1, radiusPt: 1.5, rotate }, source: source("workflow-challenge-triad-native-paper", { card, index }) });  
    add({ id: `workflow-challenge-paper-fold-${card}-${index}`, type: "triangle", box: { x: box.x + box.w - 12, y: box.y, w: 12, h: 12 }, style: { fill: "#D8E2EA", stroke: "#4F5D66", strokeWidthPt: 0.7, rotate: rotate + 90 }, source: source("workflow-challenge-triad-native-paper-fold", { card, index }) });  
    [0, 1, 2].forEach((line) => add({ id: `workflow-challenge-paper-line-${card}-${index}-${line}`, type: "line", box: { x: box.x + 9, y: box.y + 14 + line * 9, w: box.w - 22, h: 0 }, style: { stroke: "#6F7C85", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("workflow-challenge-triad-native-paper-line", { card, index, line }) }));  
  }  
    
  function addWorkflowChallengeGear(add, source, box, index) {  
    add({ id: `workflow-challenge-gear-${index}`, type: "ellipse", box, style: { fill: "#D5DEE6", stroke: "#54616B", strokeWidthPt: 1.5 }, source: source("workflow-challenge-triad-native-gear", { index }) });  
    add({ id: `workflow-challenge-gear-hole-${index}`, type: "ellipse", box: { x: box.x + box.w * 0.31, y: box.y + box.h * 0.31, w: box.w * 0.38, h: box.h * 0.38 }, style: { fill: "#FFFFFF", stroke: "#54616B", strokeWidthPt: 1.2 }, source: source("workflow-challenge-triad-native-gear-hole", { index }) });  
    for (let tooth = 0; tooth < 8; tooth += 1) {  
      const angle = tooth * 45;  
      const tx = box.x + box.w / 2 + Math.cos(angle * Math.PI / 180) * box.w * 0.43 - box.w * 0.05;  
      const ty = box.y + box.h / 2 + Math.sin(angle * Math.PI / 180) * box.h * 0.43 - box.h * 0.05;  
      add({ id: `workflow-challenge-gear-tooth-${index}-${tooth}`, type: "rect", box: { x: tx, y: ty, w: box.w * 0.1, h: box.h * 0.1 }, style: { fill: "#D5DEE6", stroke: "#54616B", strokeWidthPt: 0.7, rotate: angle }, source: source("workflow-challenge-triad-native-gear-tooth", { index, tooth }) });  
    }  
  }  
    
  function addWorkflowChallengeReportPage(add, source, box, index) {  
    add({ id: `workflow-challenge-output-report-${index}`, type: "rect", box, style: { fill: "#FFFFFF", stroke: "#3B7DC7", strokeWidthPt: 1.8, radiusPt: 2 }, source: source("workflow-challenge-triad-native-report", { index }) });  
    add({ id: `workflow-challenge-output-report-header-${index}`, type: "rect", box: { x: box.x + 8, y: box.y + 11, w: box.w - 16, h: 10 }, style: { fill: "#3B7DC7", stroke: "#3B7DC7", strokeWidthPt: 0 }, source: source("workflow-challenge-triad-native-report-header", { index }) });  
    add({ id: `workflow-challenge-output-report-fold-${index}`, type: "triangle", box: { x: box.x + box.w - 19, y: box.y, w: 20, h: 20 }, style: { fill: "#DDE7EF", stroke: "#54616B", strokeWidthPt: 0.9, rotate: 90 }, source: source("workflow-challenge-triad-native-report-fold", { index }) });  
  }  
    
  function createWorkflowPrdAutoGenerationObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    if (!shouldObjectifyWorkflowPrdAutoGeneration(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const sourceImages = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));  
    for (const image of sourceImages.filter((item) => item?.source?.detector === "left-illustration-panel-crop")) {  
      image.source = {  
        ...(image.source || {}),  
        editable: false,  
        nativeRebuild: true,  
        expressionForm: "icon-or-illustration",  
        expressionSubtype: "workflow-prd-document-flow-illustration",  
        workflowPrdAutoGenerationLeftIllustrationPreserved: true,  
        intentionalMinimumUnitCrop: true,  
        protectedMinimumUnit: true,  
        dropErasedResidualAfterNativeRebuild: false,  
        recommendedAction: "match-icon-library-or-keep-local-crop",  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow PRD auto generation document flow"}; preserved the dense left illustration as a movable fidelity crop while rebuilding surrounding cards and value banner natively`  
      };  
      applyMinimumUnitCropRenderStrategy(image.source);  
    }  
    for (const image of sourceImages.filter((item) => item?.source?.detector === "bottom-banner-crop")) {  
      image.source = {  
        ...(image.source || {}),  
        workflowPrdAutoGenerationObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow PRD auto generation banner"}; rebuilt value banner as native editable components`  
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
    
    addWorkflowPrdCardShells(add, source);  
    addWorkflowPrdCleanContentText(textBoxes, source, rawTextBoxes);  
    addWorkflowPrdValueBanner(add, textBoxes, source, slideSize);  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyWorkflowPrdAutoGeneration(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/PRD自动生成/.test(labels) || !/核心痛点/.test(labels) || !/Skill解决方案/.test(labels)) return false;  
    const candidates = (page.images || []).filter((image) => /^(?:left-illustration-panel-crop|bottom-banner-crop)$/.test(image?.source?.detector || ""));  
    const hasLeft = candidates.some((image) => image?.source?.detector === "left-illustration-panel-crop");  
    const hasBanner = candidates.some((image) => image?.source?.detector === "bottom-banner-crop");  
    const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)  
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    return hasLeft && hasBanner && areaRatio > 0.25 && areaRatio < 0.6;  
  }  
    
  function isWorkflowPrdAutoGenerationLeftIllustrationCrop(image = {}, rawTextBoxes = []) {  
    if (image?.source?.detector !== "left-illustration-panel-crop") return false;  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    return /PRD自动生成/.test(labels) && /核心痛点/.test(labels) && /Skill解决方案/.test(labels);  
  }  
    
  function createLeftIllustrationPanelSkeletonShapes(images = [], namespace = "left-illustration") {  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyLeftIllustrationPanelSkeleton(image)) continue;  
      const localShapes = inferLeftIllustrationPanelSkeletonShapes(image, namespace);  
      if (localShapes.length === 0) continue;  
      image.source = {  
        ...(image.source || {}),  
        leftIllustrationPanelSkeletonObjectified: true,  
        visualAtomOverlayOnly: true,  
        objectifiedLeftIllustrationPanelSkeletonShapes: localShapes.length,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "left workflow illustration"}; rebuilt key illustration structure as native skeleton overlays while preserving the source crop`  
      };  
      shapes.push(...localShapes);  
    }  
    return shapes;  
  }  
    
  function shouldObjectifyLeftIllustrationPanelSkeleton(image = {}) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};  
    const box = image?.box || {};  
    if (source.detector !== "left-illustration-panel-crop") return false;  
    if (layer.layerType && layer.layerType !== "illustration-zone") return false;  
    if (!/^(?:generic-node-diagram|matrix-or-grid)$/.test(String(understanding.archetype || ""))) return false;  
    if (Number(understanding.confidence || 0) < 0.9) return false;  
    if (!box.w || !box.h || Number(box.w) < 240 || Number(box.h) < 300) return false;  
    const visualAtoms = comparisonMatrixVisualAtoms(image);  
    const gridLines = visualAtoms.filter((atom) => String(atom?.kind || "") === "grid-line-candidate").length;  
    const connectors = visualAtoms.filter((atom) => /connector-line-candidate|connector-arrow-candidate/.test(String(atom?.kind || ""))).length;  
    if (understanding.archetype === "matrix-or-grid") return gridLines >= 6 || Number(understanding.nodeCount || 0) >= 5;  
    return connectors >= 2 || gridLines >= 5 || Number(understanding.connectorCount || 0) >= 2;  
  }  
    
  function inferLeftIllustrationPanelSkeletonShapes(image = {}, namespace = "left-illustration") {  
    const archetype = String(image?.source?.layer?.diagramUnderstanding?.archetype || image?.source?.diagramUnderstanding?.archetype || "");  
    return archetype === "matrix-or-grid"  
      ? inferLeftIllustrationPanelMatrixSkeletonShapes(image, namespace)  
      : inferLeftIllustrationPanelNodeSkeletonShapes(image, namespace);  
  }  
    
  function leftIllustrationPanelShapeSource(image, namespace, detector, extra = {}) {  
    return {  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "icon-or-illustration",  
      expressionSubtype: "left-illustration-panel-skeleton",  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "illustration-zone",  
      skeletonOnly: true,  
      namespace,  
      ...extra  
    };  
  }  
    
  function inferLeftIllustrationPanelNodeSkeletonShapes(image = {}, namespace = "left-illustration") {  
    const box = image.box || {};  
    if (!box.w || !box.h) return [];  
    const base = `${namespace}-${image.id || "left-panel"}`;  
    const x = Number(box.x || 0);  
    const y = Number(box.y || 0);  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const source = (detector, extra = {}) => leftIllustrationPanelShapeSource(image, namespace, detector, extra);  
    const shapes = [{  
      id: `${base}-native-skeleton-backplate`,  
      type: "roundRect",  
      box: roundedBox({ x: x + w * 0.08, y: y + h * 0.07, w: w * 0.84, h: h * 0.82 }),  
      style: { fill: "#F7FBFF", stroke: "#A8C7E0", strokeWidthPt: 1, radiusRatio: 0.05, opacity: 0.36 },  
      source: source("left-illustration-panel-native-skeleton-backplate")  
    }];  
    const hub = roundedBox({ x: x + w * 0.38, y: y + h * 0.39, w: w * 0.24, h: w * 0.24 });  
    shapes.push({  
      id: `${base}-native-skeleton-hub`,  
      type: "ellipse",  
      box: hub,  
      style: { fill: "#EAF7FF", stroke: "#2E86D1", strokeWidthPt: 1.4, opacity: 0.84, shadow: { color: "#2E86D1", alpha: 0.12, blurPt: 3, distancePt: 1, angleDeg: 90 } },  
      source: source("left-illustration-panel-native-skeleton-hub")  
    });  
    const nodes = [  
      { x: x + w * 0.17, y: y + h * 0.15 },  
      { x: x + w * 0.57, y: y + h * 0.16 },  
      { x: x + w * 0.16, y: y + h * 0.66 },  
      { x: x + w * 0.58, y: y + h * 0.66 }  
    ].map((point, index) => roundedBox({ ...point, w: w * 0.26, h: h * 0.12, index }));  
    const hubCenter = centerOfBox(hub);  
    nodes.forEach((node, index) => {  
      const nodeCenter = centerOfBox(node);  
      shapes.push({  
        id: `${base}-native-skeleton-connector-${index}`,  
        type: "line",  
        box: lineBox(hubCenter, nodeCenter),  
        style: { stroke: "#69AEE4", strokeWidthPt: 1.3, connectorType: "straight", endArrow: index < 2 ? "triangle" : undefined, opacity: 0.72 },  
        source: source("left-illustration-panel-native-skeleton-connector", { nodeIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-node-${index}`,  
        type: "roundRect",  
        box: node,  
        style: { fill: "#FFFFFF", stroke: "#7DB7E8", strokeWidthPt: 1, radiusRatio: 0.10, opacity: 0.82 },  
        source: source("left-illustration-panel-native-skeleton-node", { nodeIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-node-dot-${index}`,  
        type: "ellipse",  
        box: roundedBox({ x: node.x + node.h * 0.22, y: node.y + node.h * 0.32, w: node.h * 0.25, h: node.h * 0.25 }),  
        style: { fill: index % 2 === 0 ? "#20B765" : "#2E86D1", stroke: "none", strokeWidthPt: 0, opacity: 0.86 },  
        source: source("left-illustration-panel-native-skeleton-node-dot", { nodeIndex: index })  
      });  
      shapes.push({  
        id: `${base}-native-skeleton-node-line-${index}`,  
        type: "line",  
        box: { x: round(node.x + node.w * 0.34), y: round(node.y + node.h * 0.50), w: round(node.w * 0.44), h: 0 },  
        style: { stroke: "#A8C7E0", strokeWidthPt: 1.2, connectorType: "straight", opacity: 0.75 },  
        source: source("left-illustration-panel-native-skeleton-node-line", { nodeIndex: index })  
      });  
    });  
    return shapes;  
  }  
    
  function inferLeftIllustrationPanelMatrixSkeletonShapes(image = {}, namespace = "left-illustration") {  
    const box = image.box || {};  
    if (!box.w || !box.h) return [];  
    const base = `${namespace}-${image.id || "left-panel"}`;  
    const x = Number(box.x || 0);  
    const y = Number(box.y || 0);  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const source = (detector, extra = {}) => leftIllustrationPanelShapeSource(image, namespace, detector, extra);  
    const table = roundedBox({ x: x + w * 0.12, y: y + h * 0.14, w: w * 0.76, h: h * 0.58 });  
    const shapes = [{  
      id: `${base}-native-skeleton-table-bg`,  
      type: "roundRect",  
      box: table,  
      style: { fill: "#FFFFFF", stroke: "#2E86D1", strokeWidthPt: 1.2, radiusRatio: 0.04, opacity: 0.78, shadow: { color: "#2E86D1", alpha: 0.10, blurPt: 3, distancePt: 1, angleDeg: 90 } },  
      source: source("left-illustration-panel-native-skeleton-table-bg")  
    }, {  
      id: `${base}-native-skeleton-table-header`,  
      type: "rect",  
      box: roundedBox({ x: table.x, y: table.y, w: table.w, h: table.h * 0.18 }),  
      style: { fill: "#EAF7FF", stroke: "none", strokeWidthPt: 0, opacity: 0.92 },  
      source: source("left-illustration-panel-native-skeleton-table-header")  
    }];  
    [1, 2, 3].forEach((col) => {  
      shapes.push({  
        id: `${base}-native-skeleton-table-v-${col}`,  
        type: "line",  
        box: { x: round(table.x + table.w * col / 4), y: round(table.y), w: 0, h: round(table.h) },  
        style: { stroke: "#A8C7E0", strokeWidthPt: 0.9, connectorType: "straight", opacity: 0.82 },  
        source: source("left-illustration-panel-native-skeleton-table-line", { axis: "v", index: col })  
      });  
    });  
    [1, 2, 3, 4].forEach((row) => {  
      shapes.push({  
        id: `${base}-native-skeleton-table-h-${row}`,  
        type: "line",  
        box: { x: round(table.x), y: round(table.y + table.h * row / 5), w: round(table.w), h: 0 },  
        style: { stroke: row === 1 ? "#7DB7E8" : "#C4D9EA", strokeWidthPt: row === 1 ? 1.1 : 0.8, connectorType: "straight", opacity: 0.82 },  
        source: source("left-illustration-panel-native-skeleton-table-line", { axis: "h", index: row })  
      });  
    });  
    for (let index = 0; index < 3; index += 1) {  
      shapes.push({  
        id: `${base}-native-skeleton-status-${index}`,  
        type: "ellipse",  
        box: roundedBox({ x: table.x + table.w * (0.18 + index * 0.28), y: table.y + table.h * 0.80, w: table.h * 0.055, h: table.h * 0.055 }),  
        style: { fill: index === 2 ? "#20B765" : "#F4A23A", stroke: "none", strokeWidthPt: 0, opacity: 0.88 },  
        source: source("left-illustration-panel-native-skeleton-status-dot", { index })  
      });  
    }  
    shapes.push({  
      id: `${base}-native-skeleton-output-card`,  
      type: "roundRect",  
      box: roundedBox({ x: x + w * 0.23, y: y + h * 0.78, w: w * 0.54, h: h * 0.10 }),  
      style: { fill: "#F2FBF6", stroke: "#20B765", strokeWidthPt: 1, radiusRatio: 0.16, opacity: 0.82 },  
      source: source("left-illustration-panel-native-skeleton-output-card")  
    });  
    return shapes;  
  }  
    
  function addWorkflowPrdBriefDocument(add, textBoxes, source) {  
    add({ id: "workflow-prd-brief-page", type: "rect", box: { x: 53, y: 150, w: 155, h: 282 }, style: { fill: "#FFFFFF", stroke: "#AEB4B8", strokeWidthPt: 1.8, radiusPt: 4, shadow: { color: "#6F7A80", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-prd-auto-native-document", { side: "brief" }) });  
    add({ id: "workflow-prd-brief-title-box", type: "rect", box: { x: 70, y: 166, w: 120, h: 57 }, style: { fill: "#FFFFFF", stroke: "#BFC4C7", strokeWidthPt: 1.4 }, source: source("workflow-prd-auto-native-document-title-box", { side: "brief" }) });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-prd-brief-title", "极简 Brief", { x: 86, y: 185, w: 88, h: 27 }, { sizePt: 18, color: "#3A3A3A", weight: "bold", align: "center" }, source("workflow-prd-auto-native-text", { role: "brief-title" })));  
    [238, 283, 332].forEach((y, group) => {  
      add({ id: `workflow-prd-brief-block-${group}`, type: "rect", box: { x: 70, y, w: 48, h: 9 }, style: { fill: "#B6B8BA", stroke: "none", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-prd-auto-native-brief-line", { group, role: "heading" }) });  
      [0, 1, 2].forEach((line) => {  
        add({ id: `workflow-prd-brief-line-${group}-${line}`, type: "line", box: { x: 70, y: y + 18 + line * 10, w: line === 1 ? 118 : 96, h: 0 }, style: { stroke: "#A7AAAD", strokeWidthPt: 2.4, connectorType: "straight", lineCap: "round" }, source: source("workflow-prd-auto-native-brief-line", { group, line }) });  
      });  
    });  
  }  
    
  function addWorkflowPrdTransformAxis(add, source) {  
    add({ id: "workflow-prd-axis-glow", type: "line", box: { x: 222, y: 100, w: 0, h: 380 }, style: { stroke: "#6DE795", strokeWidthPt: 38, connectorType: "straight", opacity: 0.25, lineCap: "round" }, source: source("workflow-prd-auto-native-transform-axis", { part: "glow" }) });  
    add({ id: "workflow-prd-axis-core", type: "line", box: { x: 222, y: 105, w: 0, h: 370 }, style: { stroke: "#22C869", strokeWidthPt: 14, connectorType: "straight", lineCap: "round" }, source: source("workflow-prd-auto-native-transform-axis", { part: "core" }) });  
  }  
    
  function addWorkflowPrdOutputDocument(add, textBoxes, source) {  
    add({ id: "workflow-prd-output-page", type: "rect", box: { x: 240, y: 150, w: 150, h: 282 }, style: { fill: "#FDFEFF", stroke: "#0B6EA8", strokeWidthPt: 2, radiusPt: 4, shadow: { color: "#0A6CA8", alpha: 0.12, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("workflow-prd-auto-native-document", { side: "prd" }) });  
    add({ id: "workflow-prd-output-window-bar", type: "rect", box: { x: 240, y: 150, w: 150, h: 22 }, style: { fill: "#0D6FAE", stroke: "#0D6FAE", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-prd-auto-native-document-window-bar") });  
    [0, 1, 2].forEach((index) => add({ id: `workflow-prd-output-dot-${index}`, type: "ellipse", box: { x: 250 + index * 11, y: 159, w: 5, h: 5 }, style: { fill: "#B7D8EA", stroke: "#B7D8EA", strokeWidthPt: 0 }, source: source("workflow-prd-auto-native-document-window-dot", { index }) }));  
    const sections = [  
      { title: "1. 背景", y: 183 },  
      { title: "2. 目标", y: 224 },  
      { title: "3. 流程", y: 265 },  
      { title: "4. 功能点", y: 329 }  
    ];  
    sections.forEach((section, index) => {  
      textBoxes.push(temporaryAnswerWorkflowTextBox(`workflow-prd-output-section-${index}`, section.title, { x: 254, y: section.y, w: 62, h: 16 }, { sizePt: 10.5, color: "#1B1B1B", weight: "bold", align: "left" }, source("workflow-prd-auto-native-text", { role: "prd-section", index })));  
      add({ id: `workflow-prd-output-line-bg-${index}`, type: "rect", box: { x: 255, y: section.y + 22, w: 118, h: 17 }, style: { fill: "#D7EEF7", stroke: "#D7EEF7", strokeWidthPt: 0, radiusPt: 1 }, source: source("workflow-prd-auto-native-prd-text-block", { index }) });  
      add({ id: `workflow-prd-output-line-a-${index}`, type: "line", box: { x: 260, y: section.y + 28, w: 98, h: 0 }, style: { stroke: "#71A6C0", strokeWidthPt: 2, connectorType: "straight", lineCap: "round" }, source: source("workflow-prd-auto-native-prd-line", { index, line: 0 }) });  
      add({ id: `workflow-prd-output-line-b-${index}`, type: "line", box: { x: 260, y: section.y + 34, w: 76, h: 0 }, style: { stroke: "#71A6C0", strokeWidthPt: 2, connectorType: "straight", lineCap: "round" }, source: source("workflow-prd-auto-native-prd-line", { index, line: 1 }) });  
    });  
    addWorkflowPrdMiniTable(add, source, 255, 285, 118, 43, "flow");  
    addWorkflowPrdMiniTable(add, source, 255, 349, 118, 32, "rules");  
    addWorkflowPrdMiniTable(add, source, 255, 393, 118, 25, "api");  
  }  
    
  function addWorkflowPrdMiniTable(add, source, x, y, w, h, role) {  
    add({ id: `workflow-prd-table-${role}`, type: "rect", box: { x, y, w, h }, style: { fill: "#EAF7FB", stroke: "#2C84AE", strokeWidthPt: 0.9 }, source: source("workflow-prd-auto-native-table", { role }) });  
    add({ id: `workflow-prd-table-header-${role}`, type: "rect", box: { x, y, w, h: Math.min(15, h * 0.42) }, style: { fill: "#0D6FAE", stroke: "#0D6FAE", strokeWidthPt: 0 }, source: source("workflow-prd-auto-native-table-header", { role }) });  
    [1, 2].forEach((col) => add({ id: `workflow-prd-table-v-${role}-${col}`, type: "line", box: { x: x + col * (w / 3), y, w: 0, h }, style: { stroke: "#2C84AE", strokeWidthPt: 0.8, connectorType: "straight" }, source: source("workflow-prd-auto-native-table-line", { role, axis: "v", col }) }));  
    [1, 2, 3].forEach((row) => {  
      if (y + row * (h / 4) >= y + h - 2) return;  
      add({ id: `workflow-prd-table-h-${role}-${row}`, type: "line", box: { x, y: y + row * (h / 4), w, h: 0 }, style: { stroke: "#74AFC8", strokeWidthPt: 0.7, connectorType: "straight" }, source: source("workflow-prd-auto-native-table-line", { role, axis: "h", row }) });  
    });  
  }  
    
  function addWorkflowPrdCardShells(add, source) {  
    add({ id: "workflow-prd-pain-card", type: "rect", box: { x: 430, y: 136, w: 200, h: 317 }, style: { fill: "#FFFFFF", stroke: "#B8B8B8", strokeWidthPt: 1.6, radiusPt: 5, shadow: { color: "#818181", alpha: 0.1, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("workflow-prd-auto-native-card", { role: "pain" }) });  
    add({ id: "workflow-prd-pain-accent", type: "rect", box: { x: 452, y: 133, w: 158, h: 9 }, style: { fill: "#F17612", stroke: "#F17612", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-prd-auto-native-card-accent", { role: "pain" }) });  
    add({ id: "workflow-prd-pain-separator", type: "line", box: { x: 432, y: 188, w: 196, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-prd-auto-native-card-separator", { role: "pain" }) });  
    add({ id: "workflow-prd-solution-card", type: "rect", box: { x: 653, y: 136, w: 247, h: 317 }, style: { fill: "#F7FFF9", stroke: "#15A75B", strokeWidthPt: 2.2, radiusPt: 5, shadow: { color: "#15A75B", alpha: 0.11, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("workflow-prd-auto-native-card", { role: "solution" }) });  
    add({ id: "workflow-prd-solution-accent", type: "rect", box: { x: 676, y: 133, w: 198, h: 9 }, style: { fill: "#18A95B", stroke: "#18A95B", strokeWidthPt: 0, radiusPt: 2 }, source: source("workflow-prd-auto-native-card-accent", { role: "solution" }) });  
    add({ id: "workflow-prd-solution-header-fill", type: "rect", box: { x: 655, y: 136, w: 243, h: 51 }, style: { fill: "#F1FCF3", stroke: "none", strokeWidthPt: 0, radiusPt: 4 }, source: source("workflow-prd-auto-native-card-header-fill", { role: "solution" }) });  
    add({ id: "workflow-prd-solution-separator", type: "line", box: { x: 655, y: 188, w: 243, h: 0 }, style: { stroke: "#DADADA", strokeWidthPt: 0.9, connectorType: "straight" }, source: source("workflow-prd-auto-native-card-separator", { role: "solution" }) });  
  }  
    
  function addWorkflowPrdCleanContentText(textBoxes, source, rawTextBoxes = []) {  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-prd-page-title", "能力深潜 02 — PRD 自动生成", { x: 430, y: 72, w: 450, h: 42 }, { sizePt: 31, color: "#1F557B", weight: "bold", align: "left" }, source("workflow-prd-auto-native-text", { role: "title" })));  
    textBoxes.push(workflowPrdMeasuredTextBox("workflow-prd-pain-title", "核心痛点", /核心痛点/, rawTextBoxes, { x: 488, y: 152, w: 85, h: 25 }, { sizePt: 17.8, color: "#C1763A", weight: "bold", align: "center" }, source, "pain-title"));  
    textBoxes.push(workflowPrdMeasuredTextBox("workflow-prd-solution-title", "Skill 解决方案", /Skill解决方案/i, rawTextBoxes, { x: 712, y: 154, w: 130, h: 21 }, { sizePt: 14.9, color: "#25833E", weight: "bold", align: "center" }, source, "solution-title"));  
    const lines = [  
      ["pain-1", "· 结构排版耗时费力", /结构排版耗时费力/, { x: 452, y: 205, w: 140, h: 20 }, 14.3],  
      ["pain-2", "· 团队间口径“千人千面”", /团队间口径/, { x: 449, y: 254, w: 162, h: 20 }, 14.3],  
      ["pain-3", "研发理解困难", /研发理解困难/, { x: 463, y: 283, w: 147, h: 17 }, 12.2],  
      ["solution-1", "· 一键成型：基于Brief自动", /一键成型.*基于Brief自动/, { x: 681, y: 207, w: 205, h: 17 }, 12.2],  
      ["solution-2", "生成背景、目标、流程标准", /生成背景.*流程标准/, { x: 692, y: 231, w: 200, h: 21 }, 15.1],  
      ["solution-3", "文档", /^文档$/, { x: 692, y: 257, w: 36, h: 23 }, 16.5],  
      ["solution-4", "· 规则补全：自动补全基础字段", /规则补全.*自动补全基础字/, { x: 682, y: 309, w: 208, h: 17 }, 12.2],  
      ["solution-5", "段校验与异常验收规则", /段校验与异常验收规则/, { x: 694, y: 335, w: 164, h: 20 }, 14.3],  
      ["solution-6", "· 非暴力覆盖：支持合并更新", /非暴力覆盖.*支持合并更新/, { x: 681, y: 384, w: 209, h: 17 }, 12.2],  
      ["solution-7", "既有PRD，精准识别增量", /既有PRD.*精准识别增量/, { x: 694, y: 410, w: 185, h: 20 }, 14.3]  
    ];  
    for (const [key, text, pattern, box, sizePt] of lines) {  
      textBoxes.push(workflowPrdMeasuredTextBox(`workflow-prd-${key}`, text, pattern, rawTextBoxes, box, { sizePt, color: "#111111", weight: "regular", align: "left" }, source, key.startsWith("pain") ? "pain-body-line" : "solution-body-line"));  
    }  
  }  
    
  function workflowPrdMeasuredTextBox(id, text, pattern, rawTextBoxes, fallbackBox, font, source, role) {  
    const anchor = (rawTextBoxes || []).find((item) => pattern.test(normalizeCjkText(item?.text || "")));  
    const box = anchor?.box  
      ? { ...anchor.box, w: Math.max(Number(anchor.box.w || 0), Number(fallbackBox.w || 0)) }  
      : fallbackBox;  
    const measuredSize = Number(anchor?.font?.sizePt);  
    return temporaryAnswerWorkflowTextBox(id, text, box, {  
      ...font,  
      sizePt: Number.isFinite(measuredSize) && measuredSize >= 6 ? measuredSize : font.sizePt  
    }, source("workflow-prd-auto-native-text", {  
      role,  
      ocrLineGeometry: Boolean(anchor),  
      ocrAnchorText: anchor ? String(anchor.text || "").slice(0, 120) : undefined  
    }));  
  }  
    
  function addWorkflowPrdValueBanner(add, textBoxes, source, slideSize = DEFAULT_SLIDE) {  
    const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
    // The source banner occupies only the page footer. Keeping it below the  
    // two content cards preserves the intended whitespace and hierarchy.  
    add({ id: "workflow-prd-value-banner-bg", type: "rect", box: { x: 0, y: 486, w: width, h: 54 }, style: { fill: "#0368AF", stroke: "#0368AF", strokeWidthPt: 0 }, source: source("workflow-prd-auto-native-value-banner") });  
    add({ id: "workflow-prd-value-banner-depth", type: "rect", box: { x: 0, y: 486, w: width, h: 7 }, style: { fill: "#024D84", stroke: "#024D84", strokeWidthPt: 0, opacity: 0.65 }, source: source("workflow-prd-auto-native-value-banner", { part: "depth" }) });  
    add({ id: "workflow-prd-value-banner-glow", type: "ellipse", box: { x: 77, y: 491, w: 125, h: 43 }, style: { fill: "#2ACD75", stroke: "none", strokeWidthPt: 0, opacity: 0.16 }, source: source("workflow-prd-auto-native-value-banner-glow") });  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-prd-value-banner-percent", "60%-80%", { x: 75, y: 494, w: 173, h: 35 }, { sizePt: 25, color: "#EFFFF1", weight: "bold", align: "center" }, source("workflow-prd-auto-native-text", { role: "value-percent" })));  
    textBoxes.push(temporaryAnswerWorkflowTextBox("workflow-prd-value-banner-copy", "产出价值：减少初期写作时间。PM 精力从低效码字回归到核心业务判断。", { x: 254, y: 501, w: 670, h: 22 }, { sizePt: 16, color: "#FFFFFF", weight: "bold", align: "left" }, source("workflow-prd-auto-native-text", { role: "value-copy" })));  
  }

  return {
    createWorkflowKpiEvidenceObjects,
    shouldObjectifyWorkflowKpiEvidence,
    workflowKpiEvidenceConclusionResidualCrop,
    workflowKpiEvidenceFontSize,
    createWorkflowPrdAutoGenerationObjects,
    shouldObjectifyWorkflowPrdAutoGeneration,
    isWorkflowPrdAutoGenerationLeftIllustrationCrop,
    createLeftIllustrationPanelSkeletonShapes,
    shouldObjectifyLeftIllustrationPanelSkeleton,
    inferLeftIllustrationPanelSkeletonShapes
  };
}

module.exports = {
  createWorkflowKpiPrdFactory
};
