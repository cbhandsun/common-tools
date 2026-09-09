"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createTemporaryAnswerWorkflowMatrixFactory(dependencies = {}) {
  const {
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    normalizeCjkText,
    ptToPxBox,
    pxToPtBox,
    round,
    safeIdentifier,
    writePng
  } = dependencies;
  const required = {
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    normalizeCjkText,
    ptToPxBox,
    pxToPtBox,
    round,
    safeIdentifier,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild temporary answer workflow matrix dependency ${name} must be a function`);
    }
  }

  function createTemporaryAnswerWorkflowMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    if (!shouldObjectifyTemporaryAnswerWorkflowMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [], tables: [] };
    const sourceImages = (page.images || []).filter(isTemporaryAnswerWorkflowMatrixSourceImage);
    for (const image of sourceImages) {
      image.source = {
        ...(image.source || {}),
        temporaryAnswerWorkflowMatrixObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "workflow matrix residual"}; rebuilt temporary-answer-to-professional-workflow matrix as native editable table`
      };
    }
    const table = temporaryAnswerWorkflowMatrixLayout(slideSize);
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      confidence: 0.92,
      ...extra
    });
    const headerIcon = materializeTemporaryAnswerWorkflowHeaderIcon(sourceImages[0], slideSize, options);
    return {
      shapes: [],
      textBoxes: [temporaryAnswerWorkflowMatrixQuoteTextBox(table, source)],
      images: headerIcon ? [headerIcon] : [],
      tables: [temporaryAnswerWorkflowNativeTable(table, source)]
    };
  }
  
  
  
  function materializeTemporaryAnswerWorkflowHeaderIcon(parentImage = {}, slideSize = DEFAULT_SLIDE, options = {}) {
    if (!options.sourceImage || !options.assetDir) return null;
    ensureDir(options.assetDir);
    const box = clampPtBoxToSlide({ x: 690, y: 108, w: 27, h: 27 }, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-temporary-answer-workflow-header-icon`, "temporary-answer-workflow-header-icon");
    const file = path.join(options.assetDir, `${base}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parentImage.id || "temporary-answer-workflow"}-portal-header-icon-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: "temporary-answer-workflow-portal-header-icon-crop",
        parentDetector: parentImage.source?.detector || null,
        parentImageId: parentImage.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "portal-star-header-icon",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nativeComponentInstance: true,
        nativeComponentGroupId: "temporary-answer-workflow-comparison-table",
        nativeComponentParentId: "temporary-answer-workflow-matrix",
        nativeComponentArchetype: "editable-comparison-table",
        nonEditableReason: "source portal star retained as the minimum source-faithful icon while the comparison matrix remains native editable"
      }
    };
  }
  
  function shouldObjectifyTemporaryAnswerWorkflowMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
    if (!/临时问答/.test(labels) || !/专业AI工作流/.test(labels)) return false;
    if (!/传统工作方式/.test(labels) || !/普通AI大模型工具/.test(labels) || !/PMPortalPlatform|PM\s*Portal\s*Platform/i.test(labels)) return false;
    const residuals = (page.images || []).filter(isTemporaryAnswerWorkflowMatrixSourceImage);
    const rowBands = residuals.filter((image) =>
      image?.source?.detector === "structured-case-row-band-residual-crop"
      || image?.source?.residualSplitMode === "structured-case-row-band-residual"
    );
    const parentUnderlay = residuals.some((image) => {
      const w = Number(image.box?.w || 0);
      const h = Number(image.box?.h || 0);
      return image?.source?.detector === "structured-case-graphic-underlay-crop"
        && w > slideSize.widthPt * 0.65
        && h > slideSize.heightPt * 0.35;
    });
    return (rowBands.length >= 3 && rowBands.some((image) => Number(image.box?.w || 0) > slideSize.widthPt * 0.7))
      || parentUnderlay;
  }
  
  function isTemporaryAnswerWorkflowMatrixSourceImage(image = {}) {
    return image?.source?.detector === "structured-case-row-band-residual-crop"
      || image?.source?.residualSplitMode === "structured-case-row-band-residual"
      || image?.source?.detector === "structured-case-graphic-underlay-crop";
  }

  function temporaryAnswerWorkflowMatrixLayout(slideSize = DEFAULT_SLIDE) {
    const x = 40.8;
    const y = 98.5;
    const w = slideSize.widthPt * 0.89;
    const h = slideSize.heightPt * 0.62;
    return {
      cols: [x, x + w * 0.145, x + w * 0.43, x + w * 0.715, x + w],
      rows: [y, y + h * 0.12, y + h * 0.33, y + h * 0.54, y + h * 0.75, y + h],
      quote: { x: slideSize.widthPt * 0.075, y: slideSize.heightPt * 0.875, w: slideSize.widthPt * 0.84, h: slideSize.heightPt * 0.052 }
    };
  }
  
  function temporaryAnswerWorkflowMatrixRows() {
    return [
      ["维度", "传统工作方式", "普通 AI 大模型工具", "PM Portal Platform"],
      ["业务认知", "强依赖产品经理个人记忆\n与经验", "无业务上下文，单次对话\n容易产生“幻觉”", "挂载分布式域仓、系统\n菜单与历史文档资产"],
      ["流程推进", "纯手工推进、复制粘贴排\n版", "点状提效，仅能总结文\n字，无法串联完整链路", "链式 Skills 引擎（理解\n→生成→评审→原型）"],
      ["质量校验", "完全依赖人工评审，风险\n发现极晚", "仅做文字润色，不验证底\n层业务逻辑闭环", "智能边界审查，风险前置\n拦截与口径统一"],
      ["产物归宿", "散落个人电脑或飞书，离\n职即流失", "停留在关闭即销毁的聊天\n窗口记录中", "自动按标准落盘，生成全\n组织 Hub 大门户检索"]
    ];
  }
  
  function temporaryAnswerWorkflowMatrixQuoteTextBox(table, source) {
    return temporaryAnswerWorkflowTextBox(
      "temporary-answer-workflow-quote",
      "“真正要提升的，不是按下一个按钮写一篇文档的速度，而是产品经理的整条工作流。”",
      { ...table.quote, x: 70, w: 820 },
      { sizePt: 22, color: "#111111", weight: "regular", align: "center" },
      source("temporary-answer-workflow-native-quote", { preserveTypography: true })
    );
  }
  
  
  
  function temporaryAnswerWorkflowNativeTable(table, source) {
    const rows = temporaryAnswerWorkflowMatrixRows();
    const cellStyles = rows.map((row, rowIndex) => row.map((_, colIndex) => {
      const isHeader = rowIndex === 0;
      const isLeft = colIndex === 0;
      const isPortal = colIndex === 3;
      return {
        fill: isHeader ? "#075AA6" : (isPortal ? "#EFF9F0" : "#FFFFFF"),
        stroke: isPortal ? "#18A85B" : "#D6DEE8",
        fontFamily: "Microsoft YaHei",
        fontSizePt: isHeader ? 19 : (isLeft ? 19.5 : (isPortal ? 21 : 20)),
        fontWeight: isHeader || isLeft || isPortal ? "bold" : "regular",
        textColor: isHeader ? "#FFFFFF" : "#111111",
        textAlign: isHeader || isLeft ? "center" : "left",
        textValign: "middle",
        paddingLeftPt: isHeader ? (isPortal ? 42 : 6) : (isLeft || isPortal ? 6 : 28),
        paddingRightPt: 8,
        paddingTopPt: 4,
        paddingBottomPt: 4
      };
    }));
    return {
      id: "temporary-answer-workflow-native-table",
      type: "table",
      box: {
        x: table.cols[0],
        y: table.rows[0],
        w: table.cols[table.cols.length - 1] - table.cols[0],
        h: table.rows[table.rows.length - 1] - table.rows[0]
      },
      rows,
      style: {
        fill: "#FFFFFF",
        stroke: "#D6DEE8",
        strokeWidthPt: 0.85,
        fontFamily: "Microsoft YaHei",
        fontSizePt: 20,
        headerFontSizePt: 19,
        textAlign: "left",
        textValign: "middle",
        columnWidthsPt: table.cols.slice(0, -1).map((value, index) => round(table.cols[index + 1] - value)),
        rowHeightsPt: table.rows.slice(0, -1).map((value, index) => round(table.rows[index + 1] - value)),
        cellStyles
      },
      source: source("temporary-answer-workflow-native-table", {
        nativeTable: true,
        rowCount: rows.length,
        columnCount: rows[0].length,
        nativeComponentInstance: true,
        nativeComponentGroupId: "temporary-answer-workflow-comparison-table",
        nativeComponentParentId: "temporary-answer-workflow-matrix",
        nativeComponentArchetype: "editable-comparison-table",
        preserveTypography: true
      })
    };
  }

  function temporaryAnswerWorkflowTextBox(id, text, box, font = {}, source = {}) {
    return {
      id,
      text,
      box,
      font: {
        family: font.family || "Microsoft YaHei",
        sizePt: font.sizePt || 16,
        color: font.color || "#111111",
        opacity: 1,
        weight: font.weight || "regular",
        align: font.align || "left",
        valign: "middle",
        lineHeightMultiple: 1.08
      },
      source
    };
  }

  return {
    createTemporaryAnswerWorkflowMatrixObjects
  };
}

module.exports = { createTemporaryAnswerWorkflowMatrixFactory };
