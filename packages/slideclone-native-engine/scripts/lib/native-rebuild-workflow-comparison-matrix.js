"use strict";

function createWorkflowComparisonMatrixFactory(dependencies = {}) {
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
    pixel,
    protectProductCollaborationChallengeCrop,
    ptToPxBox,
    pxToPtBox,
    readPng,
    resolveAssetPathForIr,
    round,
    roundedBox,
    roundRatio,
    rgbToHex,
    safeIdentifier,
    shouldObjectifyProductCollaborationChallenge,
    splitResidualLayerSource,
    temporaryAnswerWorkflowTextBox,
    workflowCollaborationBranchGlowStyle,
    workflowCollaborationHubLayerStyle,
    workflowSupplyChainTwoPanelEvidenceText,
    writePng
  } = dependencies;

  function createWorkflowComparisonMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, sourceImage = null) {  
    if (!shouldObjectifyWorkflowComparisonMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    for (const image of page.images || []) {  
      image.source = {  
        ...(image.source || {}),  
        workflowComparisonMatrixObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow comparison matrix"}; rebuilt four-column comparison matrix as native editable table component`  
      };  
    }  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.9,  
      expressionForm: "comparison-matrix",  
      expressionSubtype: "workflow-ai-skills-comparison",  
      ...extra  
    });  
    const shapes = [];  
    const textBoxes = [];  
    const add = (shape) => shapes.push(shape);  
    const table = workflowComparisonMatrixLayout(slideSize, rawTextBoxes);  
    addWorkflowComparisonMatrixCells(add, source, table, sourceImage);  
    addWorkflowComparisonMatrixChecks(add, source, table, rawTextBoxes);  
    addWorkflowComparisonMatrixText(textBoxes, source, table, rawTextBoxes);  
    return { shapes, textBoxes };  
  }  
    
  function shouldObjectifyWorkflowComparisonMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");  
    if (!/传统工作方式/.test(labels) || !/普通AI工具/.test(labels) || !/PMPortalAISkills/.test(labels)) return false;  
    if (!/场景理解/.test(labels) || !/流程引擎/.test(labels) || !/质量控制/.test(labels) || !/资产沉淀/.test(labels)) return false;  
    if (!/深度结合真实系统架构与沉淀资产/.test(labels) || !/产出自动落盘为标准分布式域仓资产/.test(labels)) return false;  
    const area = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    return (page.images || []).some((image) => {  
      const box = image.box || {};  
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, area);  
      if (areaRatio < 0.45) return false;  
      const detector = String(image.source?.detector || image.source?.reason || "");  
      return /comparison-matrix|source-background|underlay|full-slide/i.test(detector)  
        || image.source?.editable === false;  
    }) || rawTextBoxes.length >= 16;  
  }  
    
  function workflowComparisonMatrixLayout(slideSize = DEFAULT_SLIDE, rawTextBoxes = []) {  
    const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
    const height = Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const evidence = workflowComparisonMatrixTextEvidence(rawTextBoxes);  
    const fallback = {  
      x: width * 0.0594,  
      y: height * 0.099,  
      w: width * 0.8813,  
      gap: width * 0.0042,  
      headerH: height * 0.0972,  
      rowH: height * 0.1713  
    };  
    const rowCenters = evidence.rows.map((row) => median(row.filter(Boolean).map((item) => boxCenterY(item.box)))).filter(Number.isFinite);  
    const rowSteps = rowCenters.slice(1).map((center, index) => center - rowCenters[index]).filter((step) => step > 20);  
    const gap = round(clamp(fallback.gap, 3, 6));  
    const rowStep = rowSteps.length > 0 ? median(rowSteps) : fallback.rowH + gap;  
    const rowH = round(clamp(rowStep - gap, height * 0.14, height * 0.2));  
    const headerCenter = evidence.headers.length > 0  
      ? median(evidence.headers.map((item) => boxCenterY(item.box)))  
      : fallback.y + fallback.headerH / 2;  
    const firstRowCenter = rowCenters[0] || (fallback.y + fallback.headerH + gap + rowH / 2);  
    const headerH = round(clamp(2 * (firstRowCenter - headerCenter - gap) - rowH, height * 0.075, height * 0.12));  
    const rowHeaderBoxes = evidence.rows.map((row) => row[0]).filter(Boolean);  
    const portalBoxes = evidence.rows.map((row) => row[3]).filter(Boolean);  
    const minRowHeaderX = rowHeaderBoxes.length > 0 ? Math.min(...rowHeaderBoxes.map((item) => Number(item.box?.x || Infinity))) : Infinity;  
    const maxPortalRight = portalBoxes.length > 0 ? Math.max(...portalBoxes.map((item) => Number(item.box?.x || 0) + Number(item.box?.w || 0))) : -Infinity;  
    const tableX = Number.isFinite(minRowHeaderX) ? minRowHeaderX - width * 0.0174 : fallback.x;  
    const tableRight = Number.isFinite(maxPortalRight) ? maxPortalRight + width * 0.016 : fallback.x + fallback.w;  
    const table = {  
      x: round(clamp(tableX, 0, width - 1)),  
      y: round(clamp(headerCenter - headerH / 2, 0, height - 1)),  
      w: round(clamp(tableRight - tableX, width * 0.75, width * 0.94)),  
      h: round(headerH + gap + 4 * rowH + 3 * gap)  
    };  
    const availableW = table.w - gap * 3;  
    const ratios = [0.1232, 0.2301, 0.2606, 0.3861];  
    const colW = ratios.map((ratio) => round(availableW * ratio));  
    colW[colW.length - 1] = round(availableW - colW.slice(0, -1).reduce((sum, value) => sum + value, 0));  
    const xs = [table.x];  
    for (let index = 0; index < colW.length - 1; index += 1) xs.push(xs[index] + colW[index] + gap);  
    const ys = [table.y, table.y + headerH + gap];  
    for (let index = 1; index < 4; index += 1) ys.push(ys[1] + index * (rowH + gap));  
    return { table, gap, headerH, rowH, colW, xs, ys, slideSize, evidence };  
  }  
    
  function addWorkflowComparisonMatrixCells(add, source, layout, sourceImage = null) {  
    const { xs, ys, colW, headerH, rowH } = layout;  
    const grayHeader = sampleWorkflowMatrixCellFill(sourceImage, { x: xs[1], y: ys[0], w: colW[1], h: headerH }, layout.slideSize, "#C9C9C9");  
    const rowHeader = sampleWorkflowMatrixCellFill(sourceImage, { x: xs[0], y: ys[1], w: colW[0], h: rowH }, layout.slideSize, "#E6E6E6");  
    const body = sampleWorkflowMatrixCellFill(sourceImage, { x: xs[1], y: ys[1], w: colW[1], h: rowH }, layout.slideSize, "#ECECEC");  
    const blue = sampleWorkflowMatrixCellFill(sourceImage, { x: xs[3], y: ys[1], w: colW[3], h: rowH }, layout.slideSize, "#005EB8");  
    const stroke = "#FFFFFF";  
    for (let col = 1; col < 4; col += 1) {  
      add({  
        id: `workflow-comparison-header-${col}`,  
        type: "rect",  
        box: { x: xs[col], y: ys[0], w: colW[col], h: headerH },  
        style: { fill: col === 3 ? blue : grayHeader, stroke, strokeWidthPt: 1 },  
        source: source("workflow-comparison-matrix-native-cell", { role: "header", col })  
      });  
    }  
    for (let row = 0; row < 4; row += 1) {  
      for (let col = 0; col < 4; col += 1) {  
        add({  
          id: `workflow-comparison-cell-${row}-${col}`,  
          type: "rect",  
          box: { x: xs[col], y: ys[row + 1], w: colW[col], h: rowH },  
          style: { fill: col === 3 ? blue : (col === 0 ? rowHeader : body), stroke, strokeWidthPt: 1 },  
          source: source("workflow-comparison-matrix-native-cell", { role: col === 0 ? "row-header" : "body", row, col })  
        });  
      }  
    }  
  }  
    
  function addWorkflowComparisonMatrixChecks(add, source, layout, rawTextBoxes = []) {  
    const { xs, ys, colW, rowH } = layout;  
    const evidence = workflowComparisonMatrixTextEvidence(rawTextBoxes);  
    for (let row = 0; row < 4; row += 1) {  
      const portalText = evidence.rows[row]?.[3];  
      const cx = portalText ? Number(portalText.box.x) - 17 : xs[3] + 31;  
      const cy = portalText ? boxCenterY(portalText.box) : ys[row + 1] + rowH / 2;  
      const size = 24;  
      add({ id: `workflow-comparison-check-bg-${row}`, type: "rect", box: { x: cx - size / 2, y: cy - size / 2, w: size, h: size }, style: { fill: "#28A946", stroke: "#1E8F3A", strokeWidthPt: 0.8, radiusPt: 4, shadow: { color: "#095C2B", alpha: 0.18, blurPt: 2, distancePt: 1, angle: 45 } }, source: source("workflow-comparison-matrix-native-check", { row, part: "bg" }) });  
      add({ id: `workflow-comparison-check-a-${row}`, type: "line", box: lineBox({ x: cx - 7, y: cy - 1 }, { x: cx - 2, y: cy + 6 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.6, connectorType: "straight", lineCap: "round" }, source: source("workflow-comparison-matrix-native-check-mark", { row, part: "a" }) });  
      add({ id: `workflow-comparison-check-b-${row}`, type: "line", box: lineBox({ x: cx - 2, y: cy + 6 }, { x: cx + 8, y: cy - 8 }), style: { stroke: "#FFFFFF", strokeWidthPt: 2.6, connectorType: "straight", lineCap: "round" }, source: source("workflow-comparison-matrix-native-check-mark", { row, part: "b" }) });  
    }  
    add({ id: "workflow-comparison-blue-column-highlight", type: "rect", box: { x: xs[3], y: ys[1], w: colW[3], h: ys[4] + rowH - ys[1] }, style: { fill: "none", stroke: "#004D9C", strokeWidthPt: 1.3 }, source: source("workflow-comparison-matrix-native-blue-column-outline") });  
  }  
    
  function addWorkflowComparisonMatrixText(textBoxes, source, layout, rawTextBoxes = []) {  
    const { xs, ys, colW, headerH, rowH } = layout;  
    const evidence = workflowComparisonMatrixTextEvidence(rawTextBoxes);  
    const text = (id, value, box, font = {}, extra = {}) => textBoxes.push(temporaryAnswerWorkflowTextBox(  
      `workflow-comparison-${id}`,  
      value,  
      box,  
      {  
        family: "Microsoft YaHei",  
        sizePt: font.sizePt || 18,  
        color: font.color || "#111111",  
        weight: font.weight || "regular",  
        align: font.align || "center",  
        valign: "middle"  
      },  
      source("workflow-comparison-matrix-native-text", extra)  
    ));  
    const headers = ["", "传统工作方式", "普通 AI 工具", "PM Portal AI Skills"];  
    headers.forEach((value, col) => {  
      if (!value) return;  
      const measured = evidence.headers[col - 1];  
      text(`header-${col}`, value, workflowComparisonMeasuredTextBox(measured, { x: xs[col] + 10, y: ys[0] + 10, w: colW[col] - 20, h: headerH - 20 }), {  
        sizePt: workflowComparisonMeasuredFontSize(measured, col === 3 ? 22 : 20),  
        color: col === 3 ? "#FFFFFF" : "#555555",  
        weight: "bold"  
      }, { role: "header", col });  
    });  
    const rows = [  
      ["场景理解", "人工翻阅大量历史材料", "缺少公司上下文与域仓目录", "深度结合真实系统架构与沉淀资产"],  
      ["流程引擎", "手动推进各断裂环节", "碎片化、一次性的临时问答", "需求→PRD→评审→原型无缝串联"],  
      ["质量控制", "依赖评审会人工纠错", "仅生成文字，缺乏严谨逻辑校验", "前置拦截风险，强制扫描完整性"],  
      ["资产沉淀", "结果散落个人电脑各处", "会话结束数据即刻丢失", "产出自动落盘为标准分布式域仓资产"]  
    ];  
    rows.forEach((row, rowIndex) => {  
      row.forEach((value, col) => {  
        const isPortal = col === 3;  
        const isRowHeader = col === 0;  
        const leftPad = isPortal ? 68 : (isRowHeader ? 0 : 12);  
        const measured = evidence.rows[rowIndex]?.[col];  
        text(`row-${rowIndex}-col-${col}`, value, workflowComparisonMeasuredTextBox(measured, {  
          x: xs[col] + leftPad,  
          y: ys[rowIndex + 1] + 31,  
          w: colW[col] - leftPad - 12,  
          h: rowH - 58  
        }), {  
          sizePt: workflowComparisonMeasuredFontSize(measured, isPortal ? 14.2 : (isRowHeader ? 18.5 : 16.5)),  
          color: isPortal ? "#FFFFFF" : (isRowHeader ? "#5E5E5E" : "#111111"),  
          weight: isPortal || isRowHeader ? "bold" : "regular",  
          align: isRowHeader ? "center" : "left"  
        }, { role: isRowHeader ? "row-header" : "cell", row: rowIndex, col });  
      });  
    });  
  }  
    
  function workflowComparisonMatrixTextEvidence(rawTextBoxes = []) {  
    const find = (value) => rawTextBoxes.find((item) => normalizeCjkText(item.text) === normalizeCjkText(value)) || null;  
    const headers = ["传统工作方式", "普通AI工具", "PMPortalAISkills"].map(find).filter(Boolean);  
    const rows = [  
      ["场景理解", "人工翻阅大量历史材料", "缺少公司上下文与域仓目录", "深度结合真实系统架构与沉淀资产"],  
      ["流程引擎", "手动推进各断裂环节", "碎片化、一次性的临时问答", "需求→PRD→评审→原型无缝串联"],  
      ["质量控制", "依赖评审会人工纠错", "仅生成文字，缺乏严谨逻辑校验", "前置拦截风险，强制扫描完整性"],  
      ["资产沉淀", "结果散落个人电脑各处", "会话结束数据即刻丢失", "产出自动落盘为标准分布式域仓资产"]  
    ].map((row) => row.map(find));  
    return { headers, rows };  
  }  
    
  function workflowComparisonMeasuredTextBox(item, fallback) {  
    if (!item?.box) return fallback;  
    return {  
      x: round(Number(item.box.x || 0) - 1.5),  
      y: round(Number(item.box.y || 0) - 1.5),  
      w: round(Number(item.box.w || 0) + 3),  
      h: round(Number(item.box.h || 0) + 3)  
    };  
  }  
    
  function workflowComparisonMeasuredFontSize(item, fallback) {  
    return measuredFontSize(item, fallback, { minimum: 7, maximum: 400 });  
  }  
    
  function sampleWorkflowMatrixCellFill(sourceImage, ptBox, slideSize, fallback) {  
    if (!sourceImage?.rgba || !sourceImage.width || !sourceImage.height) return fallback;  
    const box = ptToPxBox(ptBox, sourceImage, slideSize, 0);  
    const insetX = Math.max(2, Math.round(box.w * 0.08));  
    const insetY = Math.max(2, Math.round(box.h * 0.12));  
    const buckets = new Map();  
    const step = Math.max(1, Math.ceil(Math.sqrt((box.w * box.h) / 1600)));  
    for (let y = box.y + insetY; y < box.y + box.h - insetY; y += step) {  
      for (let x = box.x + insetX; x < box.x + box.w - insetX; x += step) {  
        const color = pixel(sourceImage, x, y);  
        if (color.a < 64) continue;  
        const key = `${Math.round(color.r / 8)},${Math.round(color.g / 8)},${Math.round(color.b / 8)}`;  
        const value = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };  
        value.count += 1;  
        value.r += color.r;  
        value.g += color.g;  
        value.b += color.b;  
        buckets.set(key, value);  
      }  
    }  
    const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];  
    if (!dominant || dominant.count < 4) return fallback;  
    return rgbToHex({  
      r: Math.round(dominant.r / dominant.count),  
      g: Math.round(dominant.g / dominant.count),  
      b: Math.round(dominant.b / dominant.count)  
    });  
  }

  return {
    createWorkflowComparisonMatrixObjects,
    sampleWorkflowMatrixCellFill,
    workflowComparisonMeasuredTextBox,
    workflowComparisonMeasuredFontSize,
    shouldObjectifyWorkflowComparisonMatrix
  };
}

module.exports = {
  createWorkflowComparisonMatrixFactory
};
