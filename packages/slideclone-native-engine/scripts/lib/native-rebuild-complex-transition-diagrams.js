"use strict";

function createComplexTransitionDiagramsFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    path,
    ptToPxBox,
    pxToPtBox,
    round,
    roundedBox,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createShiftLeftDebuggerDiagramObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    if (!shouldObjectifyShiftLeftDebuggerDiagram(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };  
    const image = (page.images || []).find((item) => isShiftLeftDebuggerTopComplexImage(item, slideSize));  
    if (!image) return { shapes: [], textBoxes: [] };  
    if (shouldPreserveShiftLeftDebuggerAsScreenshot(image, rawTextBoxes, slideSize)) {  
      const {  
        componentTemplateGroupApplied,  
        componentTemplateFamilyApplied,  
        componentTemplateGroupId,  
        componentTemplateGroupScore,  
        componentTemplateAssetMotifReady,  
        componentTemplateTargetMotifs,  
        componentTemplateWholeProcessApplied,  
        componentTemplateNativeShapes,  
        componentTemplateApplicationMode,  
        componentTemplateCropReplacedByNative,  
        componentTemplateCropReplacementReason,  
        ...preservedSource  
      } = image.source || {};  
      image.source = {  
        ...preservedSource,  
        shiftLeftDebuggerDiagramObjectified: false,  
        shiftLeftDebuggerScreenshotPreserved: true,  
        nativeRebuildDeferredReason: "dense debugger UI is a screenshot-like demonstration; preserve the crop and keep editable OCR text outside the screenshot instead of redrawing a loose native approximation",  
        recommendedAction: "keep-local-crop-and-overlay-external-text-only",  
        expressionForm: "screenshot-or-document",  
        expressionSubtype: "debugger-window-screenshot",  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "top complex diagram crop"}; preserved as intentional screenshot demonstration to avoid low-fidelity native reconstruction`,  
        componentRenderStrategy: {  
          provider: "component-render-strategy-v1",  
          mode: "preserve-local-crop",  
          implementationMode: "native-generator-safe-fallback",  
          editableExpectation: "raster-screenshot-or-document-with-editable-text-overlays",  
          visualFidelityBias: "fidelity-first",  
          reason: "dense debugger UI is a screenshot-like demonstration, so the crop is preserved instead of being replaced by a mismatched plugin component"  
        }  
      };  
      return { shapes: [], textBoxes: [] };  
    }  
    image.source = {  
      ...(image.source || {}),  
      shiftLeftDebuggerDiagramObjectified: true,  
      dropErasedResidualAfterNativeRebuild: true,  
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "top complex diagram crop"}; rebuilt shift-left debugger diagram as native editable document, callout, and suggestion components`  
    };  
    const base = image.id || "shift-left-debugger";  
    const src = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.86,  
      expressionForm: "complex-diagram",  
      expressionSubtype: "shift-left-debugger-window",  
      layerSourceId: image.id || null,  
      ...extra  
    });  
    const shape = (id, detector, type, box, style, extra = {}) => ({  
      id: `${base}-${id}`,  
      type,  
      box: roundedBox(box),  
      style,  
      source: src(detector, extra)  
    });  
    const b = image.box || { x: 74, y: 32, w: 848, h: 346 };  
    const shapes = [  
      shape("shadow", "shift-left-debugger-native-window-shadow", "roundRect", rb(b, 0.135, 0.055, 0.72, 0.87), {  
        fill: "#DDE5ED",  
        stroke: "none",  
        strokeWidthPt: 0,  
        radiusRatio: 0.035,  
        opacity: 0.42  
      }),  
      shape("window", "shift-left-debugger-native-window", "roundRect", rb(b, 0.125, 0.045, 0.73, 0.89), {  
        fill: "#FFFFFF",  
        stroke: "#C4D0DB",  
        strokeWidthPt: 1,  
        radiusRatio: 0.035  
      }),  
      shape("window-header", "shift-left-debugger-native-window-header", "rect", rb(b, 0.125, 0.045, 0.73, 0.095), {  
        fill: "#234D72",  
        stroke: "#234D72",  
        strokeWidthPt: 0  
      }),  
      shape("left-rail", "shift-left-debugger-native-sidebar", "rect", rb(b, 0.125, 0.14, 0.075, 0.75), {  
        fill: "#E9F2FA",  
        stroke: "#D6E2EC",  
        strokeWidthPt: 0.7  
      }),  
      shape("document-panel", "shift-left-debugger-native-document-panel", "rect", rb(b, 0.205, 0.14, 0.505, 0.75), {  
        fill: "#FBFCFE",  
        stroke: "#D7E0E8",  
        strokeWidthPt: 0.85  
      }),  
      shape("fix-panel", "shift-left-debugger-native-fix-panel", "roundRect", rb(b, 0.715, 0.33, 0.245, 0.55), {  
        fill: "#F7FAFD",  
        stroke: "#C9D6E0",  
        strokeWidthPt: 1,  
        radiusRatio: 0.045  
      }),  
      shape("fix-title-band", "shift-left-debugger-native-fix-title", "roundRect", rb(b, 0.735, 0.37, 0.155, 0.075), {  
        fill: "#168957",  
        stroke: "none",  
        strokeWidthPt: 0,  
        radiusRatio: 0.18  
      }),  
      shape("red-callout", "shift-left-debugger-native-risk-callout", "roundRect", rb(b, 0.365, 0.455, 0.305, 0.072), {  
        fill: "#F86C55",  
        stroke: "#C84435",  
        strokeWidthPt: 1,  
        radiusRatio: 0.18  
      }),  
      shape("red-highlight", "shift-left-debugger-native-risk-highlight", "roundRect", rb(b, 0.225, 0.43, 0.47, 0.12), {  
        fill: "none",  
        stroke: "#E35A47",  
        strokeWidthPt: 2.2,  
        radiusRatio: 0.04  
      }),  
      shape("orange-callout", "shift-left-debugger-native-boundary-callout", "roundRect", rb(b, 0.32, 0.835, 0.34, 0.072), {  
        fill: "#F1A942",  
        stroke: "#C98525",  
        strokeWidthPt: 1,  
        radiusRatio: 0.18  
      }),  
      shape("orange-highlight", "shift-left-debugger-native-boundary-highlight", "roundRect", rb(b, 0.225, 0.715, 0.48, 0.14), {  
        fill: "none",  
        stroke: "#E0A136",  
        strokeWidthPt: 2.1,  
        radiusRatio: 0.04  
      }),  
      ...shiftLeftDebuggerDocumentLines(shape, b),  
      ...shiftLeftDebuggerSuggestionItems(shape, b)  
    ];  
    const textBoxes = shiftLeftDebuggerTextBoxes(b, src);  
    return { shapes, textBoxes };  
  }
  
  function shouldObjectifyShiftLeftDebuggerDiagram(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const text = [...(rawTextBoxes || []), ...(page.textBoxes || [])]  
      .map((item) => String(item?.text || ""))  
      .join(" ")  
      .replace(/\s+/g, "");  
    if (!/DebuggerWindow/i.test(text)) return false;  
    const signals = [/修复建议/, /前后矛盾/, /边界缺失/, /自动补充超量收货阻断规则/, /质量左移|Shift-Left/i]  
      .filter((pattern) => pattern.test(text)).length;  
    return signals >= 4 && (page.images || []).some((image) => isShiftLeftDebuggerTopComplexImage(image, slideSize));  
  }
  
  function shouldPreserveShiftLeftDebuggerAsScreenshot(image = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const box = image.box || {};  
    const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, slideArea);  
    const insideCount = (rawTextBoxes || []).filter((textBox) => {  
      const text = String(textBox?.text || "").trim();  
      if (!text) return false;  
      return boxCenterInside(textBox.box || {}, box);  
    }).length;  
    const screenshotSignals = (rawTextBoxes || [])  
      .map((item) => String(item?.text || ""))  
      .join(" ")  
      .replace(/\s+/g, "");  
    const hasUiChrome = /DebuggerWindow|PRD|修复建议|自动补充超量收货阻断规则/i.test(screenshotSignals);  
    return areaRatio >= 0.35 && insideCount >= 14 && hasUiChrome;  
  }
  
  function isShiftLeftDebuggerTopComplexImage(image = {}, slideSize = DEFAULT_SLIDE) {  
    const detector = String(image?.source?.detector || "");  
    const box = image?.box || {};  
    const area = Number(box.w || 0) * Number(box.h || 0);  
    const slideArea = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    return detector === "top-complex-diagram-crop"  
      && area / Math.max(1, slideArea) > 0.4  
      && Number(box.y || 0) < Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) * 0.18;  
  }
  
  function shiftLeftDebuggerDocumentLines(shape, b) {  
    const lines = [];  
    const yValues = [0.25, 0.30, 0.355, 0.405, 0.505, 0.565, 0.63, 0.70, 0.765, 0.825];  
    yValues.forEach((relY, index) => {  
      lines.push(shape(`doc-line-${index}`, "shift-left-debugger-native-document-line", "rect", rb(b, 0.25, relY, index % 3 === 0 ? 0.32 : 0.42, 0.012), {  
        fill: index === 3 || index === 8 ? "#F2B8AE" : "#DDE5EC",  
        stroke: "none",  
        strokeWidthPt: 0,  
        radiusRatio: 0.5,  
        opacity: index === 3 || index === 8 ? 0.78 : 0.88  
      }, { lineIndex: index }));  
    });  
    [0.24, 0.34, 0.44, 0.54, 0.64, 0.74, 0.84].forEach((relY, index) => {  
      lines.push(shape(`line-number-${index}`, "shift-left-debugger-native-line-number", "rect", rb(b, 0.155, relY, 0.025, 0.012), {  
        fill: "#C8D4DE",  
        stroke: "none",  
        strokeWidthPt: 0,  
        radiusRatio: 0.5,  
        opacity: 0.9  
      }, { lineIndex: index }));  
    });  
    return lines;  
  }
  
  function shiftLeftDebuggerSuggestionItems(shape, b) {  
    const shapes = [];  
    [0.515, 0.63, 0.755].forEach((relY, index) => {  
      shapes.push(  
        shape(`fix-check-${index}`, "shift-left-debugger-native-check-icon", "ellipse", rb(b, 0.735, relY, 0.032, 0.078), {  
          fill: "#2FB66D",  
          stroke: "#1F9B58",  
          strokeWidthPt: 0.7  
        }, { itemIndex: index }),  
        shape(`fix-card-${index}`, "shift-left-debugger-native-suggestion-card", "roundRect", rb(b, 0.775, relY - 0.01, 0.16, 0.085), {  
          fill: "#FFFFFF",  
          stroke: "#DBE6EF",  
          strokeWidthPt: 0.8,  
          radiusRatio: 0.12  
        }, { itemIndex: index })  
      );  
    });  
    return shapes;  
  }
  
  function shiftLeftDebuggerTextBoxes(b, src) {  
    const text = (id, value, box, font = {}, extra = {}) => temporaryAnswerWorkflowTextBox(  
      `shift-left-debugger-${id}`,  
      value,  
      roundedBox(box),  
      {  
        sizePt: font.sizePt || 12,  
        color: font.color || "#111111",  
        weight: font.weight || "regular",  
        align: font.align || "left"  
      },  
      src("shift-left-debugger-native-text", extra)  
    );  
    return [  
      text("window-title", "Debugger Window", rb(b, 0.39, 0.072, 0.19, 0.05), { sizePt: 13, color: "#FFFFFF", align: "center" }, { role: "window-title" }),  
      text("tab", "PRD", rb(b, 0.215, 0.155, 0.08, 0.04), { sizePt: 12, weight: "bold", color: "#174B76" }, { role: "tab" }),  
      text("section-bg", "1. 背景", rb(b, 0.235, 0.255, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),  
      text("section-goal", "2. 目标", rb(b, 0.235, 0.375, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),  
      text("section-flow", "3. 流程", rb(b, 0.235, 0.515, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),  
      text("section-feature", "4. 功能点", rb(b, 0.235, 0.68, 0.13, 0.04), { sizePt: 10.5, weight: "bold", color: "#2E3F4F" }, { role: "document-heading" }),  
      text("risk", "前后矛盾：权限与上文角色定义不一致", rb(b, 0.38, 0.462, 0.28, 0.055), { sizePt: 10.5, weight: "bold", color: "#FFFFFF" }, { role: "risk-callout" }),  
      text("boundary", "边界缺失：未定义超量收货时的阻断逻辑", rb(b, 0.335, 0.842, 0.31, 0.052), { sizePt: 10.2, weight: "bold", color: "#FFFFFF" }, { role: "boundary-callout" }),  
      text("fix-title", "修复建议", rb(b, 0.75, 0.382, 0.12, 0.045), { sizePt: 12.5, weight: "bold", color: "#FFFFFF", align: "center" }, { role: "fix-title" }),  
      text("fix-1", "自动补充超量收货阻断规则", rb(b, 0.785, 0.525, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" }),  
      text("fix-2", "统一角色权限定义", rb(b, 0.785, 0.64, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" }),  
      text("fix-3", "建议修改权限配置", rb(b, 0.785, 0.765, 0.16, 0.04), { sizePt: 10.3, color: "#244254" }, { role: "suggestion" })  
    ];  
  }
  
  function rb(box = {}, x, y, w, h) {  
    return {  
      x: Number(box.x || 0) + Number(box.w || 0) * x,  
      y: Number(box.y || 0) + Number(box.h || 0) * y,  
      w: Number(box.w || 0) * w,  
      h: Number(box.h || 0) * h  
    };  
  }
  
  function createToolIslandTransitionMatrixObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!shouldObjectifyToolIslandTransitionMatrix(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };  
    const sourceImages = (page.images || []).filter(isToolIslandTransitionSourceImage);  
    if (sourceImages.length === 0) return { shapes: [], textBoxes: [], images: [] };  
    for (const image of sourceImages) {  
      image.source = {  
        ...(image.source || {}),  
        toolIslandTransitionMatrixObjectified: true,  
        dropErasedResidualAfterNativeRebuild: true,  
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "mixed diagram residual"}; rebuilt tool-island transition matrix as native editable rows, icons, and loop components`  
      };  
    }  
    const base = "tool-island-transition";  
    const src = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      confidence: 0.88,  
      expressionForm: "comparison-matrix",  
      expressionSubtype: "tool-island-transition",  
      ...extra  
    });  
    const shape = (id, detector, type, box, style, extra = {}) => ({  
      id: `${base}-${id}`,  
      type,  
      box: roundedBox(box),  
      style,  
      source: src(detector, extra)  
    });  
    const layout = toolIslandTransitionLayout(rawTextBoxes, slideSize);  
    const images = materializeToolIslandTransitionMinimumUnits(sourceImages[0], slideSize, options);  
    const useMinimumUnits = images.length > 0;  
    const shapes = [  
      ...toolIslandTransitionRowShapes(shape, layout),  
      ...(useMinimumUnits ? [] : toolIslandTraditionalIconShapes(shape, layout.rows[0])),  
      ...(useMinimumUnits ? [] : toolIslandAiToolIconShapes(shape, layout.rows[1])),  
      ...(useMinimumUnits ? [] : toolIslandPortalLoopShapes(shape, layout.rows[2]))  
    ];  
    const textBoxes = toolIslandTransitionTextBoxes(layout, rawTextBoxes, src, { portalLoopIncludesText: useMinimumUnits });  
    return { shapes, textBoxes, images };  
  }
  
  function shouldObjectifyToolIslandTransitionMatrix(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const text = [...(rawTextBoxes || []), ...(page.textBoxes || [])]  
      .map((item) => String(item?.text || ""))  
      .join(" ")  
      .replace(/\s+/g, "");  
    if (!/跨越工具孤岛/.test(text)) return false;  
    const signals = [/传统协作模式/, /普通AI工具/, /PMPortal|PM\s*Portal/i, /文档分散/, /原型割裂/, /评审低效/, /缺乏系统上下文/, /全链路资产沉淀/]  
      .filter((pattern) => pattern.test(text)).length;  
    const wideResiduals = (page.images || []).filter(isToolIslandTransitionSourceImage);  
    const area = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
    const coverage = wideResiduals.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0) / Math.max(1, area);  
    return signals >= 5 && (  
      wideResiduals.some((image) => image.source?.detector === "mixed-diagram-graphic-underlay-crop" && coverage >= 0.5)  
      || (wideResiduals.length >= 4 && coverage >= 0.42)  
    );  
  }
  
  function isToolIslandTransitionSourceImage(image = {}) {  
    return image?.source?.detector === "mixed-diagram-graphic-underlay-crop"  
      || isToolIslandTransitionResidual(image);  
  }
  
  function isToolIslandTransitionResidual(image = {}) {  
    const source = image.source || {};  
    return source.detector === "mixed-diagram-semantic-residual-crop"  
      && source.parentDetector === "mixed-diagram-graphic-underlay-crop"  
      && source.residualSplitMode === "mixed-diagram-semantic-residual";  
  }
  
  function isMixedDiagramSemanticResidual(image = {}) {  
    const source = image.source || {};  
    return source.parentDetector === "mixed-diagram-graphic-underlay-crop"  
      && source.residualSplitMode === "mixed-diagram-semantic-residual";  
  }
  
  function toolIslandTransitionLayout(rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const find = (pattern) => (rawTextBoxes || []).find((item) => pattern.test(String(item?.text || "")));  
    const labels = [find(/传统协作模式/), find(/普通AI工具/), find(/PM\s*Portal/i)];  
    const values = [find(/高度依赖人工经验/), find(/局部临时提效/), find(/组织级流水线重构/)];  
    const centers = labels.map((item, index) => item?.box  
      ? Number(item.box.y || 0) + Number(item.box.h || 0) / 2  
      : [143, 283, 421][index]);  
    const x = Math.max(18, Math.min(...labels.filter(Boolean).map((item) => Number(item.box.x || 47))) - 15);  
    const right = Math.min(  
      Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) - 18,  
      Math.max(...values.filter(Boolean).map((item) => Number(item.box.x || 0) + Number(item.box.w || 0)), 913) + 15  
    );  
    const dividerX = Math.max(  
      x + 140,  
      Math.min(...labels.filter(Boolean).map((item) => Number(item.box.x || 0) + Number(item.box.w || 0) + 15), 191)  
    );  
    const rowTops = [centers[0] - 62.5, centers[1] - 60.5, centers[2] - 68.5];  
    const rowBottoms = [centers[0] + 65.5, centers[1] + 60.5, Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt) - 21.5];  
    const rows = rowTops.map((top, index) => ({  
      x,  
      y: top,  
      w: right - x,  
      h: rowBottoms[index] - top,  
      label: { x, y: top, w: dividerX - x, h: rowBottoms[index] - top },  
      content: { x: dividerX, y: top, w: right - dividerX, h: rowBottoms[index] - top }  
    }));  
    return {  
      x,  
      y: rows[0].y,  
      w: right - x,  
      labelW: dividerX - x,  
      contentX: dividerX,  
      contentW: right - dividerX,  
      rows  
    };  
  }
  
  function toolIslandTransitionRowShapes(shape, layout) {  
    const shapes = [];  
    layout.rows.forEach((row, index) => {  
      const blue = index === 2;  
      shapes.push(  
        shape(`row-label-fill-${index}`, "tool-island-transition-native-row-label", "roundRect", row, {  
          fill: "#E7E7E7",  
          stroke: "none",  
          strokeWidthPt: 0,  
          radiusRatio: 0.045  
        }, { row: index }),  
        shape(`row-content-fill-${index}`, "tool-island-transition-native-row-content", "rect", {  
          x: row.content.x,  
          y: row.y + 1,  
          w: row.content.w - 1,  
          h: row.h - 2  
        }, {  
          fill: "#FFFFFF",  
          stroke: "none",  
          strokeWidthPt: 0  
        }, { row: index }),  
        shape(`row-${index}`, "tool-island-transition-native-row", "roundRect", row, {  
          fill: "none",  
          stroke: blue ? "#1C5F9D" : "#8A8A8A",  
          strokeWidthPt: blue ? 1.6 : 1.1,  
          radiusRatio: 0.045  
        }, { row: index }),  
        shape(`row-divider-${index}`, "tool-island-transition-native-divider", "line", { x: row.content.x, y: row.y, w: 0, h: row.h }, {  
          stroke: blue ? "#1C5F9D" : "#8A8A8A",  
          strokeWidthPt: 1.1,  
          connectorType: "straight"  
        }, { row: index })  
      );  
    });  
    return shapes;  
  }
  
  function toolIslandTraditionalIconShapes(shape, row) {  
    const c = row.content;  
    const orange = "#E9872D";  
    return [  
      shape("folder", "tool-island-transition-native-folder", "roundRect", { x: c.x + 70, y: c.y + 44, w: 82, h: 42 }, { fill: "#F3A34B", stroke: "#C97825", strokeWidthPt: 1.2, radiusRatio: 0.12 }),  
      shape("folder-tab", "tool-island-transition-native-folder-tab", "rect", { x: c.x + 82, y: c.y + 31, w: 43, h: 18 }, { fill: "#F8BA66", stroke: "#C97825", strokeWidthPt: 1 }),  
      ...[0, 1].map((index) => shape(`doc-${index}`, "tool-island-transition-native-document", "rect", { x: c.x + 43 + index * 44, y: c.y + 18 - index * 6, w: 46, h: 58 }, { fill: "#FFF8ED", stroke: "#C97825", strokeWidthPt: 1.1, rotation: index === 0 ? -12 : 10 }, { index })),  
      ...[0, 1].map((index) => shape(`break-link-${index}`, "tool-island-transition-native-broken-link", "arc", { x: c.x + 220 + index * 162, y: c.y + 35, w: 44, h: 40 }, { fill: "none", stroke: orange, strokeWidthPt: 5, opacity: 0.95 }, { index })),  
      shape("phone", "tool-island-transition-native-broken-phone", "roundRect", { x: c.x + 382, y: c.y + 22, w: 58, h: 78 }, { fill: "#FFF3E8", stroke: orange, strokeWidthPt: 3, radiusRatio: 0.08 }),  
      shape("phone-crack-1", "tool-island-transition-native-crack", "line", { x: c.x + 410, y: c.y + 23, w: -14, h: 32 }, { stroke: orange, strokeWidthPt: 2.2, connectorType: "straight" }),  
      shape("phone-crack-2", "tool-island-transition-native-crack", "line", { x: c.x + 396, y: c.y + 55, w: 24, h: 22 }, { stroke: orange, strokeWidthPt: 2.2, connectorType: "straight" }),  
      ...toolIslandPeopleShapes(shape, c.x + 560, c.y + 36, orange)  
    ];  
  }
  
  function toolIslandAiToolIconShapes(shape, row) {  
    const c = row.content;  
    const orange = "#F58220";  
    const green = "#22A966";  
    return [  
      shape("robot-head", "tool-island-transition-native-robot", "roundRect", { x: c.x + 52, y: c.y + 38, w: 62, h: 50 }, { fill: "#D8D8D8", stroke: "#999999", strokeWidthPt: 1.2, radiusRatio: 0.16 }),  
      shape("robot-eye-l", "tool-island-transition-native-robot-eye", "ellipse", { x: c.x + 68, y: c.y + 56, w: 8, h: 8 }, { fill: "#FFFFFF", stroke: "#888888", strokeWidthPt: 0.8 }),  
      shape("robot-eye-r", "tool-island-transition-native-robot-eye", "ellipse", { x: c.x + 92, y: c.y + 56, w: 8, h: 8 }, { fill: "#FFFFFF", stroke: "#888888", strokeWidthPt: 0.8 }),  
      shape("robot-bubble", "tool-island-transition-native-chat", "roundRect", { x: c.x + 112, y: c.y + 27, w: 42, h: 30 }, { fill: "#BFBFBF", stroke: "#8F8F8F", strokeWidthPt: 1, radiusRatio: 0.18 }),  
      shape("speed-check", "tool-island-transition-native-check", "ellipse", { x: c.x + 190, y: c.y + 38, w: 52, h: 52 }, { fill: green, stroke: "#13884F", strokeWidthPt: 1 }),  
      ...[0, 1, 2].map((index) => shape(`warning-${index}`, "tool-island-transition-native-warning", "triangle", { x: c.x + 315 + index * 120, y: c.y + 36, w: 60, h: 55 }, { fill: orange, stroke: "#D56B12", strokeWidthPt: 1.2 }, { index }))  
    ];  
  }
  
  function toolIslandPortalLoopShapes(shape, row) {  
    const c = row.content;  
    const blue = "#0E64AE";  
    const green = "#24A96D";  
    return [  
      shape("loop-left", "tool-island-transition-native-loop-band", "arc", { x: c.x + 38, y: c.y + 28, w: 260, h: 70 }, { fill: "none", stroke: blue, strokeWidthPt: 18, opacity: 0.98 }),  
      shape("loop-right", "tool-island-transition-native-loop-band", "arc", { x: c.x + 405, y: c.y + 28, w: 260, h: 70 }, { fill: "none", stroke: blue, strokeWidthPt: 18, opacity: 0.98 }),  
      shape("loop-cross-1", "tool-island-transition-native-loop-band", "line", { x: c.x + 260, y: c.y + 90, w: 170, h: -70 }, { stroke: blue, strokeWidthPt: 18, connectorType: "straight" }),  
      shape("loop-cross-2", "tool-island-transition-native-loop-band", "line", { x: c.x + 300, y: c.y + 25, w: 175, h: 70 }, { stroke: blue, strokeWidthPt: 18, connectorType: "straight" }),  
      shape("building", "tool-island-transition-native-building", "rect", { x: c.x + 78, y: c.y + 58, w: 42, h: 38 }, { fill: "#2E7DBC", stroke: "#0E5C96", strokeWidthPt: 1 }),  
      shape("doc-gear", "tool-island-transition-native-doc-gear", "rect", { x: c.x + 180, y: c.y + 48, w: 38, h: 48 }, { fill: "#FFFFFF", stroke: "#236AA5", strokeWidthPt: 1.4 }),  
      shape("server", "tool-island-transition-native-server", "rect", { x: c.x + 590, y: c.y + 44, w: 52, h: 48 }, { fill: "#2E7DBC", stroke: "#0E5C96", strokeWidthPt: 1 }),  
      ...[0, 1, 2].map((index) => shape(`portal-check-${index}`, "tool-island-transition-native-check", "ellipse", { x: c.x + 128 + index * 230, y: c.y + 54, w: 46, h: 46 }, { fill: green, stroke: "#13884F", strokeWidthPt: 1 }, { index }))  
    ];  
  }
  
  function toolIslandPeopleShapes(shape, x, y, color) {  
    const parts = [];  
    [0, 1, 2].forEach((index) => {  
      parts.push(shape(`people-head-${index}`, "tool-island-transition-native-people", "ellipse", { x: x + index * 34, y, w: 16, h: 16 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1 }, { index }));  
      parts.push(shape(`people-body-${index}`, "tool-island-transition-native-people", "roundRect", { x: x - 7 + index * 34, y: y + 22, w: 30, h: 24 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1, radiusRatio: 0.25 }, { index }));  
    });  
    parts.push(shape("people-table", "tool-island-transition-native-people-table", "rect", { x: x - 10, y: y + 18, w: 94, h: 7 }, { fill: "#F8B15A", stroke: color, strokeWidthPt: 1 }));  
    return parts;  
  }
  
  function toolIslandTransitionTextBoxes(layout, rawTextBoxes, src, options = {}) {  
    const text = (id, value, box, font = {}, extra = {}) => temporaryAnswerWorkflowTextBox(  
      `tool-island-transition-${id}`,  
      value,  
      roundedBox(box),  
      {  
        sizePt: font.sizePt || 15,  
        color: font.color || "#111111",  
        weight: font.weight || "regular",  
        align: font.align || "center"  
      },  
      src("tool-island-transition-native-text", extra)  
    );  
    const [r0, r1, r2] = layout.rows;  
    const findBox = (pattern, fallback) => {  
      const match = (rawTextBoxes || []).find((item) => pattern.test(String(item?.text || "")) && item?.box);  
      return match ? { ...match.box } : fallback;  
    };  
    const boxes = [  
      text("label-traditional", "传统协作模式", findBox(/传统协作模式/, { x: r0.label.x + 15, y: r0.y + 49, w: r0.label.w - 30, h: 28 }), { sizePt: 18, weight: "bold" }, { role: "row-label" }),  
      text("label-ai", "普通AI工具", findBox(/普通AI工具/, { x: r1.label.x + 20, y: r1.y + 49, w: r1.label.w - 40, h: 28 }), { sizePt: 18, weight: "bold" }, { role: "row-label" }),  
      text("label-portal", "PM Portal\nPlatform", { x: r2.label.x + 18, y: r2.y + 59, w: r2.label.w - 36, h: 56 }, { sizePt: 18, weight: "bold" }, { role: "row-label" }),  
      text("traditional-1", "文档分散", findBox(/文档分散/, { x: r0.content.x + 55, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),  
      text("traditional-2", "原型割裂", findBox(/原型割裂/, { x: r0.content.x + 250, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),  
      text("traditional-3", "评审低效", findBox(/评审低效/, { x: r0.content.x + 440, y: r0.y + 95, w: 85, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "pain" }),  
      text("traditional-value", "高度依赖人工经验", findBox(/高度依赖人工经验/, { x: r0.x + r0.w - 190, y: r0.y + 51, w: 170, h: 25 }), { sizePt: 18, weight: "bold" }, { role: "value" }),  
      text("ai-speed", "生成速度", findBox(/生成速度/, { x: r1.content.x + 132, y: r1.y + 80, w: 75, h: 22 }), { sizePt: 15, weight: "bold" }, { role: "ai-benefit" }),  
      text("ai-context", "缺乏系统上下文", { x: r1.content.x + 205, y: r1.y + 82, w: 116, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),  
      text("ai-land", "无法落盘沉淀", { x: r1.content.x + 328, y: r1.y + 82, w: 105, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),  
      text("ai-chat", "只停留在聊天框", { x: r1.content.x + 440, y: r1.y + 82, w: 115, h: 22 }, { sizePt: 14.5, weight: "bold" }, { role: "ai-limit" }),  
      text("ai-value", "局部临时提效", findBox(/局部临时提效/, { x: r1.x + r1.w - 160, y: r1.y + 50, w: 140, h: 26 }), { sizePt: 18, weight: "bold" }, { role: "value" }),  
      text("portal-value", "组织级流水线重构", findBox(/组织级流水线重构/, { x: r2.x + r2.w - 190, y: r2.y + 70, w: 170, h: 26 }), { sizePt: 18, weight: "bold" }, { role: "value" })  
    ];  
    if (!options.portalLoopIncludesText) {  
      boxes.push(  
        text("portal-1", "融合公司架构", { x: r2.content.x + 50, y: r2.y + 108, w: 120, h: 22 }, { sizePt: 14, weight: "bold" }, { role: "portal-capability" }),  
        text("portal-2", "自动生成\n标准化PRD", { x: r2.content.x + 175, y: r2.y + 92, w: 100, h: 42 }, { sizePt: 13, weight: "bold" }, { role: "portal-capability" }),  
        text("portal-3", "实时同步至\n资产目录", { x: r2.content.x + 430, y: r2.y + 92, w: 110, h: 42 }, { sizePt: 13, weight: "bold" }, { role: "portal-capability" })  
      );  
    }  
    return boxes;  
  }
  
  function materializeToolIslandTransitionMinimumUnits(target, slideSize = DEFAULT_SLIDE, options = {}) {  
    if (!target || !options.sourceImage || !options.assetDir || !options.irDir) return [];  
    ensureDir(options.assetDir);  
    const specs = [  
      ["documents", { x: 229, y: 91, w: 120, h: 84 }, "documents-folder-icon"],  
      ["broken-link-left", { x: 369, y: 109, w: 55, h: 48 }, "broken-link-icon"],  
      ["broken-prototype", { x: 443, y: 91, w: 76, h: 86 }, "broken-prototype-icon"],  
      ["broken-link-right", { x: 551, y: 109, w: 55, h: 48 }, "broken-link-icon"],  
      ["reviewers", { x: 615, y: 94, w: 119, h: 83 }, "review-panel-icon"],  
      ["robot", { x: 210, y: 232, w: 113, h: 82 }, "chat-robot-icon"],  
      ["speed-check", { x: 332, y: 243, w: 62, h: 60 }, "check-icon"],  
      ["warning-context", { x: 439, y: 244, w: 60, h: 59 }, "warning-icon"],  
      ["warning-persistence", { x: 552, y: 244, w: 60, h: 59 }, "warning-icon"],  
      ["warning-chat", { x: 665, y: 244, w: 60, h: 59 }, "warning-icon"],  
      ["portal-loop", { x: 203, y: 367, w: 542, h: 140 }, "double-loop-relationship-diagram"]  
    ];  
    const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;  
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-tool-island`, "tool-island");  
    return specs.map(([id, rawBox, subtype]) => {  
      const box = clampPtBoxToSlide(rawBox, slideSize);  
      const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);  
      const file = path.join(options.assetDir, `${base}-${id}.png`);  
      writePng(file, cropPng(options.sourceImage, pxBox));  
      return {  
        id: `${target.id || "tool-island"}-${id}-crop`,  
        type: "fidelity-crop",  
        assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),  
        box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),  
        source: {  
          editable: false,  
          nativeRebuild: true,  
          detector: `tool-island-transition-${id}-minimum-unit-crop`,  
          parentDetector: target.source?.detector || null,  
          parentImageId: target.id || null,  
          strategy: "local-fidelity-crop",  
          expressionForm: subtype === "double-loop-relationship-diagram" ? "diagram" : "icon-or-illustration",  
          expressionSubtype: subtype,  
          recommendedAction: "keep-local-crop",  
          intentionalMinimumUnitCrop: true,  
          protectedMinimumUnit: true,  
          skipVisualAtomRebuild: true,  
          residualSplit: true,  
          residualSplitMode: "tool-island-transition-hybrid",  
          nonEditableReason: subtype === "double-loop-relationship-diagram"  
            ? "double-loop relationship diagram is retained as one source-faithful semantic visual unit"  
            : "source icon is retained as the smallest faithful visual unit instead of a lower-quality primitive approximation"  
        }  
      };  
    });  
  }

  return {
    createShiftLeftDebuggerDiagramObjects,
    createToolIslandTransitionMatrixObjects,
    isMixedDiagramSemanticResidual
  };
}

module.exports = { createComplexTransitionDiagramsFactory };
