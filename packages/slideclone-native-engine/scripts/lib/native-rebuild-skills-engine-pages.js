"use strict";

function createSkillsEnginePagesFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    lineBox,
    normalizeCjkText,
    path,
    ptToPxBox,
    pxToPtBox,
    round,
    safeIdentifier,
    shouldObjectifySkillsEngineAiComparisonMatrix,
    skillsEngineAiComparisonMatrixTarget,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createSkillsEngineCoverTriadObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
    if (!shouldObjectifySkillsEngineCoverTriad(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
    const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "foreground-graphic-crop");
    for (const image of sourceImages) {
      image.source = {
        ...(image.source || {}),
        skillsEngineCoverTriadObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "skills engine cover triad"}; rebuilt document/prototype/code shield diagram as native editable components`
      };
    }
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      componentOwnerId: "skills-engine-cover-triad-native-component",
      componentOwnerKind: "skills-engine-cover-triad",
      confidence: 0.9,
      ...extra
    });
    const shapes = [];
    const textBoxes = [];
    const add = (shape) => shapes.push(shape);

    add({ id: "skills-engine-cover-shield-back", type: "freeform", box: { x: 371, y: 184, w: 214, h: 258 }, points: [{ x: 478, y: 184 }, { x: 585, y: 253 }, { x: 565, y: 372 }, { x: 478, y: 442 }, { x: 391, y: 372 }, { x: 371, y: 253 }], style: { fill: "#0A67BD", stroke: "#0A67BD", strokeWidthPt: 1.2, opacity: 0.98 }, source: source("skills-engine-cover-native-shield", { part: "back" }) });
    add({ id: "skills-engine-cover-shield-inner", type: "freeform", box: { x: 407, y: 223, w: 142, h: 196 }, points: [{ x: 478, y: 223 }, { x: 549, y: 259 }, { x: 539, y: 352 }, { x: 478, y: 419 }, { x: 417, y: 352 }, { x: 407, y: 259 }], style: { fill: "#2389E6", stroke: "#2389E6", strokeWidthPt: 1, opacity: 0.88 }, source: source("skills-engine-cover-native-shield", { part: "inner" }) });
    add({ id: "skills-engine-cover-arrow-shaft", type: "line", box: { x: 480, y: 162, w: 0, h: 330 }, style: { stroke: "#12B965", strokeWidthPt: 18, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-cover-native-axis-arrow", { part: "shaft" }) });
    add({ id: "skills-engine-cover-arrow-head-top", type: "triangle", box: { x: 452, y: 124, w: 56, h: 52 }, style: { fill: "#12B965", stroke: "#12B965", strokeWidthPt: 0.8 }, source: source("skills-engine-cover-native-axis-arrow", { part: "top" }) });
    add({ id: "skills-engine-cover-arrow-head-bottom", type: "triangle", box: { x: 452, y: 478, w: 56, h: 52 }, style: { fill: "#12B965", stroke: "#12B965", strokeWidthPt: 0.8, rotate: 180 }, source: source("skills-engine-cover-native-axis-arrow", { part: "bottom" }) });

    const cards = [
      { label: "文档", x: 294, y: 175, w: 98, h: 116 },
      { label: "原型", x: 568, y: 167, w: 98, h: 116 },
      { label: "代码", x: 520, y: 352, w: 98, h: 116 }
    ];
    cards.forEach((card, index) => {
      add({ id: `skills-engine-cover-card-shadow-${index}`, type: "rect", box: { x: card.x + 6, y: card.y + 6, w: card.w, h: card.h }, style: { fill: "#DCE8F4", stroke: "none", strokeWidthPt: 0, opacity: 0.35, radiusPt: 3 }, source: source("skills-engine-cover-native-card-shadow", { index }) });
      add({ id: `skills-engine-cover-card-${index}`, type: "rect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#FFFFFF", stroke: "#1A75BC", strokeWidthPt: 2.3, radiusPt: 2 }, source: source("skills-engine-cover-native-card", { index }) });
      textBoxes.push(temporaryAnswerWorkflowTextBox(`skills-engine-cover-card-text-${index}`, card.label, { x: card.x + 18, y: card.y + 44, w: card.w - 36, h: 34 }, { sizePt: 28, color: "#083354", weight: "regular", align: "center" }, source("skills-engine-cover-native-text", { role: "card", index })));
    });
    return { shapes, textBoxes };
  }

  function shouldObjectifySkillsEngineCoverTriad(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
    if (!/PMPortalSkills引擎|AI原生产品交付基座/.test(labels)) return false;
    return (page.images || []).some((image) => {
      if (image?.source?.detector !== "foreground-graphic-crop") return false;
      const box = image.box || {};
      const areaRatio = Number(box.w || 0) * Number(box.h || 0)
        / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
      if (areaRatio < 0.25 || areaRatio > 0.38) return false;
      const nodeText = (image.source?.layer?.diagramUnderstanding?.nodes || []).map((node) => normalizeCjkText(node.text)).join(" ");
      return /文档/.test(nodeText) && /原型/.test(nodeText) && /代码/.test(nodeText);
    });
  }

  function createSkillsEngineAiComparisonMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    if (!shouldObjectifySkillsEngineAiComparisonMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [], tables: [] };
    const target = skillsEngineAiComparisonMatrixTarget(page);
    if (!target) return { shapes: [], textBoxes: [], images: [], tables: [] };
    const layout = skillsEngineAiComparisonMatrixLayout(target.box || {}, slideSize);
    const statusIconCrops = materializeSkillsEngineAiComparisonStatusIconCrops(target, layout, slideSize, options);
    const preserveStatusIconCrops = statusIconCrops.length === 9;
    target.source = {
      ...(target.source || {}),
      skillsEngineAiComparisonMatrixObjectified: true,
      skillsEngineAiComparisonStatusIconCropsPreserved: preserveStatusIconCrops,
      preservedSkillsEngineAiComparisonStatusIconCrops: preserveStatusIconCrops ? statusIconCrops.length : 0,
      dropErasedResidualAfterNativeRebuild: true,
      expressionForm: "comparison-matrix",
      expressionSubtype: "skills-engine-ai-comparison-matrix",
      nonEditableReason: preserveStatusIconCrops
        ? `${target.source?.nonEditableReason || target.source?.reason || "skills engine AI comparison matrix"}; rebuilt comparison table as native editable grid and text while preserving status icons as local crops`
        : `${target.source?.nonEditableReason || target.source?.reason || "skills engine AI comparison matrix"}; rebuilt comparison table as native editable grid, text, and status icons`
    };
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      confidence: 0.87,
      layerSourceId: target.id || null,
      expressionForm: "comparison-matrix",
      expressionSubtype: "skills-engine-ai-comparison-matrix",
      ...extra
    });
    const shapes = [];
    const add = (shape) => shapes.push(shape);
    const tables = [createSkillsEngineAiComparisonNativeTable(source, layout)];
    if (!preserveStatusIconCrops) addSkillsEngineAiComparisonMatrixStatusIcons(add, source, layout);
    return { shapes, textBoxes: [], images: statusIconCrops, tables, coverageBox: layout.coverageBox };
  }

  function createSkillsEngineAiComparisonNativeTable(source, layout) {
    const headers = ["", "传统手工推进", "普通对话式AI", "PM Portal Skills 引擎"];
    const rows = [
      ["上下文感知", "依赖个人记忆", "无系统/历史知识", "实时挂载全域资产"],
      ["质量校验与拦截", "依赖人工评审", "仅做文字润色", "智能预校验逻辑边界"],
      ["资产落盘", "散落各处", "停留在对话窗", "自动推入标准域仓"]
    ];
    const top = layout.headerY - 28;
    const columnWidthsPt = layout.colBounds.map((column) => round(column.w));
    const rowHeightsPt = [
      round(layout.horizontals[0] - top),
      round(layout.horizontals[1] - layout.horizontals[0]),
      round(layout.horizontals[2] - layout.horizontals[1]),
      round(layout.bottom - layout.horizontals[2])
    ];
    const blue = "#0E557A";
    const cellStyles = [headers, ...rows].map((row, rowIndex) => row.map((_, columnIndex) => ({
      fill: "#FFFFFF",
      strokeLeft: columnIndex > 0 ? blue : "none",
      strokeRight: "none",
      strokeTop: rowIndex > 0 ? blue : "none",
      strokeBottom: "none",
      fontFamily: "Microsoft YaHei",
      fontSizePt: rowIndex === 0 ? (columnIndex === 3 ? 15.5 : 17.5) : 16,
      fontWeight: rowIndex === 0 || columnIndex === 0 ? "bold" : "regular",
      textColor: rowIndex === 0 || columnIndex === 0 ? blue : "#111111",
      textAlign: rowIndex === 0 ? "center" : "left",
      textValign: "middle",
      paddingLeftPt: rowIndex === 0 ? 5 : 10,
      paddingRightPt: rowIndex > 0 && columnIndex > 0 ? 38 : 8,
      paddingTopPt: 2,
      paddingBottomPt: 2
    })));
    const component = {
      nativeComponentInstance: true,
      nativeComponentGroupId: "skills-engine-ai-comparison-table",
      nativeComponentArchetype: "editable-comparison-table",
      nativeComponentRole: "table",
      componentOwnerId: "skills-engine-ai-comparison-table",
      componentOwnerKind: "comparison-table"
    };
    return {
      id: "skills-engine-ai-comparison-native-table",
      type: "table",
      box: { x: round(layout.left), y: round(top), w: round(layout.right - layout.left), h: round(layout.bottom - top) },
      rows: [headers, ...rows],
      style: {
        fill: "none",
        stroke: "none",
        strokeWidthPt: 1.15,
        gridStroke: blue,
        gridMode: "overlay-lines",
        gridInteriorOnly: true,
        textMode: "overlay-textboxes",
        fontFamily: "Microsoft YaHei",
        fontSizePt: 16,
        textAlign: "left",
        textValign: "middle",
        columnWidthsPt,
        rowHeightsPt,
        cellStyles
      },
      source: source("skills-engine-ai-comparison-native-table", component)
    };
  }

  function skillsEngineAiComparisonMatrixLayout(box = {}, slideSize = DEFAULT_SLIDE) {
    const x = Number(box.x || 46.5);
    const y = Number(box.y || 120.8);
    const w = Number(box.w || 865.5);
    const h = Number(box.h || 366.4);
    const top = y + h * 0.178;
    const bottom = y + h * 0.99;
    const verticals = [
      x + w * 0.198,
      x + w * 0.446,
      x + w * 0.709
    ];
    const horizontals = [
      top,
      y + h * 0.451,
      y + h * 0.721
    ];
    const left = x + w * 0.018;
    const right = x + w * 0.984;
    const headerY = y + h * 0.085;
    const rowCenters = [
      (horizontals[0] + horizontals[1]) / 2,
      (horizontals[1] + horizontals[2]) / 2,
      (horizontals[2] + bottom) / 2
    ];
    const colBounds = [
      { x: left, w: verticals[0] - left },
      { x: verticals[0], w: verticals[1] - verticals[0] },
      { x: verticals[1], w: verticals[2] - verticals[1] },
      { x: verticals[2], w: right - verticals[2] }
    ];
    const coverageBox = {
      x: left,
      y: headerY - 24,
      w: right - left,
      h: bottom - headerY + 26
    };
    return { box: { x, y, w, h }, coverageBox, left, right, top, bottom, verticals, horizontals, headerY, rowCenters, colBounds, slideSize };
  }

  function addSkillsEngineAiComparisonMatrixStatusIcons(add, source, layout) {
    for (const icon of skillsEngineAiComparisonStatusIconCenters(layout)) {
      if (icon.kind === "warning") addSkillsEngineAiWarningIcon(add, source, icon.center, icon.row);
      if (icon.kind === "cross") addSkillsEngineAiCrossIcon(add, source, icon.center, icon.row);
      if (icon.kind === "check") addSkillsEngineAiCheckIcon(add, source, icon.center, icon.row);
    }
  }

  function skillsEngineAiComparisonStatusIconCenters(layout) {
    const icons = [];
    for (let row = 0; row < 3; row += 1) {
      const y = layout.rowCenters[row];
      icons.push({ row, kind: "warning", center: { x: layout.colBounds[1].x + layout.colBounds[1].w * 0.78, y } });
      icons.push({ row, kind: "cross", center: { x: layout.colBounds[2].x + layout.colBounds[2].w * 0.85, y } });
      icons.push({ row, kind: "check", center: { x: layout.colBounds[3].x + layout.colBounds[3].w * 0.93, y } });
    }
    return icons;
  }

  function materializeSkillsEngineAiComparisonStatusIconCrops(target = {}, layout = null, slideSize = DEFAULT_SLIDE, options = {}) {
    if (!layout || !options.sourceImage || !options.assetDir) return [];
    ensureDir(options.assetDir);
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : Number(target.pageIndex || 0);
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${target.id || "skills-engine-ai-comparison"}-status-icon`, "skills-engine-ai-comparison-status-icon");
    const crops = [];
    for (const icon of skillsEngineAiComparisonStatusIconCenters(layout)) {
      const pad = icon.kind === "warning" ? 30 : 27;
      const ptBox = clampPtBoxToSlide({
        x: icon.center.x - pad,
        y: icon.center.y - pad,
        w: pad * 2,
        h: pad * 2
      }, slideSize);
      const pxBox = ptToPxBox(ptBox, options.sourceImage, slideSize, 0);
      const file = path.join(options.assetDir, `${base}-${icon.kind}-${String(icon.row + 1).padStart(2, "0")}.png`);
      writePng(file, cropPng(options.sourceImage, pxBox));
      crops.push({
        id: `${target.id || "skills-engine-ai-comparison"}-${icon.kind}-status-crop-${icon.row}`,
        type: "fidelity-crop",
        assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
        box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
        source: {
          editable: false,
          nativeRebuild: false,
          detector: "skills-engine-ai-comparison-status-icon-crop",
          strategy: "local-fidelity-crop",
          expressionForm: "icon-or-illustration",
          expressionSubtype: `${icon.kind}-status-icon`,
          recommendedAction: "preserve-local-crop",
          layerSourceId: target.id || null,
          statusIconKind: icon.kind,
          statusIconRow: icon.row,
          tableOverlay: true,
          nonEditableReason: "comparison matrix status icon preserved as a local crop; grid and text remain native editable"
        }
      });
    }
    return crops;
  }

  function addSkillsEngineAiWarningIcon(add, source, center, row) {
    const size = 34;
    add({ id: `skills-engine-ai-warning-${row}`, type: "triangle", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill: "#F58620", stroke: "#F58620", strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-warning", { row }) });
    add({ id: `skills-engine-ai-warning-bang-${row}`, type: "line", box: { x: round(center.x), y: round(center.y - 9), w: 0, h: 12 }, style: { stroke: "#FFFFFF", strokeWidthPt: 2.5, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-warning-mark", { row, part: "bang" }) });
    add({ id: `skills-engine-ai-warning-dot-${row}`, type: "ellipse", box: { x: round(center.x - 2.2), y: round(center.y + 8), w: 4.4, h: 4.4 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0 }, source: source("skills-engine-ai-comparison-native-warning-mark", { row, part: "dot" }) });
  }

  function addSkillsEngineAiCrossIcon(add, source, center, row) {
    const size = 34;
    add({ id: `skills-engine-ai-cross-bg-${row}`, type: "ellipse", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill: "#8E8E8E", stroke: "#8E8E8E", strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-status-circle", { row, kind: "cross" }) });
    add({ id: `skills-engine-ai-cross-a-${row}`, type: "line", box: lineBox({ x: center.x - 9, y: center.y - 9 }, { x: center.x + 9, y: center.y + 9 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "cross", part: "a" }) });
    add({ id: `skills-engine-ai-cross-b-${row}`, type: "line", box: lineBox({ x: center.x + 9, y: center.y - 9 }, { x: center.x - 9, y: center.y + 9 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "cross", part: "b" }) });
  }

  function addSkillsEngineAiCheckIcon(add, source, center, row) {
    const size = 34;
    const fill = row === 0 ? "#0D65A4" : "#20A75A";
    add({ id: `skills-engine-ai-check-bg-${row}`, type: "ellipse", box: { x: round(center.x - size / 2), y: round(center.y - size / 2), w: size, h: size }, style: { fill, stroke: fill, strokeWidthPt: 0.8 }, source: source("skills-engine-ai-comparison-native-status-circle", { row, kind: "check" }) });
    add({ id: `skills-engine-ai-check-a-${row}`, type: "line", box: lineBox({ x: center.x - 10, y: center.y - 1 }, { x: center.x - 3, y: center.y + 8 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "check", part: "a" }) });
    add({ id: `skills-engine-ai-check-b-${row}`, type: "line", box: lineBox({ x: center.x - 3, y: center.y + 8 }, { x: center.x + 12, y: center.y - 11 }), style: { stroke: "#FFFFFF", strokeWidthPt: 3, connectorType: "straight", lineCap: "round" }, source: source("skills-engine-ai-comparison-native-status-mark", { row, kind: "check", part: "b" }) });
  }

  return {
    createSkillsEngineAiComparisonMatrixObjects,
    createSkillsEngineCoverTriadObjects
  };
}

module.exports = { createSkillsEnginePagesFactory };
