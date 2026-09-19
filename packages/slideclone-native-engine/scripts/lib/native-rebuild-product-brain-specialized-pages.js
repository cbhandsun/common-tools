"use strict";

function createProductBrainSpecializedPagesFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    clampPtBoxToSlide,
    cropPng,
    createAssetClosureFunnelObjects,
    ensureDir,
    markProtectedComplexDiagramMinimumUnit,
    normalizeCjkText,
    normalizeSmartReviewTextBoxes,
    path,
    ptToPxBox,
    pxToPtBox,
    safeComponentToken,
    safeIdentifier,
    smartReviewPictorialRegions,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

function createProductBrainAssetClosureFunnelObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const generic = createAssetClosureFunnelObjects(page, rawTextBoxes, slideSize, options);
  if (generic.matched) return generic;
  if (!shouldObjectifyProductBrainAssetClosureFunnel(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) =>
    image?.source?.detector === "structured-case-graphic-underlay-crop"
    || image?.source?.detector === "cycle-illustration-underlay-crop"
  );
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      productBrainAssetClosureFunnelObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset closure funnel"}; rebuilt product brain asset-closure funnel as native editable components`
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
  const images = materializeProductBrainAssetClosureFunnelCrops(sourceImages[0], slideSize, options);

  add({ id: "product-brain-asset-closure-frame", type: "rect", box: { x: 27, y: 38, w: 906, h: 476 }, style: { fill: "none", stroke: "#222222", strokeWidthPt: 1.1, radiusPt: 5 }, source: source("product-brain-asset-closure-native-frame") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-title", "实战案例：供应链PMS「订货配置」资产闭环", { x: 145, y: 70, w: 670, h: 48 }, { sizePt: 29, color: "#000000", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "title" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-docs-label", "DOCs", { x: 254, y: 164, w: 70, h: 24 }, { sizePt: 16, color: "#111111", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "input-label" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-mock-label", "Mock Data", { x: 653, y: 164, w: 118, h: 24 }, { sizePt: 16, color: "#111111", weight: "regular", align: "center" }, source("product-brain-asset-closure-native-text", { role: "input-label" })));

  const funnelPoints = [{ x: 305, y: 230 }, { x: 657, y: 230 }, { x: 592, y: 338 }, { x: 518, y: 427 }, { x: 444, y: 427 }, { x: 368, y: 338 }, { x: 305, y: 230 }];
  add({ id: "product-brain-asset-closure-funnel", type: "freeform", points: funnelPoints, box: { x: 305, y: 230, w: 352, h: 197 }, style: { fill: "#0F66C4", stroke: "#0B559F", strokeWidthPt: 1.2, opacity: 0.97 }, source: source("product-brain-asset-closure-native-funnel") });
  add({ id: "product-brain-asset-closure-funnel-lower", type: "freeform", points: [{ x: 368, y: 338 }, { x: 592, y: 338 }, { x: 518, y: 427 }, { x: 444, y: 427 }, { x: 368, y: 338 }], box: { x: 368, y: 338, w: 224, h: 89 }, style: { fill: "#31B877", stroke: "#238E5B", strokeWidthPt: 0.9, opacity: 0.97 }, source: source("product-brain-asset-closure-native-funnel-lower") });
  add({ id: "product-brain-asset-closure-funnel-stem", type: "cylinder", box: { x: 447, y: 347, w: 70, h: 77 }, style: { fill: "#2EB878", stroke: "#177F4E", strokeWidthPt: 1.1, opacity: 0.95 }, source: source("product-brain-asset-closure-native-funnel-stem") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-engine-title", "Skills 处理引擎", { x: 382, y: 262, w: 202, h: 32 }, { sizePt: 21, color: "#FFFFFF", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "engine-title" })));

  const pills = [
    ["提取映射规则", 282, 305, "#1A75BB"],
    ["提取校验逻辑", 426, 315, "#31A96C"],
    ["提取唯一性约束", 570, 305, "#1A75BB"]
  ];
  pills.forEach(([label, x, y, fill], index) => {
    add({ id: `product-brain-asset-closure-pill-${index}`, type: "rect", box: { x, y, w: 114, h: 28 }, style: { fill, stroke: "#0E5A93", strokeWidthPt: 1, radiusPt: 3 }, source: source("product-brain-asset-closure-native-pill", { index }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`product-brain-asset-closure-pill-text-${index}`, label, { x: x + 8, y: y + 5, w: 98, h: 18 }, { sizePt: 13, color: "#FFFFFF", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "pill", index })));
  });
  [[396, 318, -34, -23], [482, 343, 0, 55], [551, 318, 35, -23]].forEach(([x, y, w, h], index) => {
    add({ id: `product-brain-asset-closure-rule-arrow-${index}`, type: "line", box: { x, y, w, h }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-asset-closure-native-rule-arrow", { index }) });
  });

  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-doc-output", "主轨结构化文档", { x: 184, y: 390, w: 150, h: 25 }, { sizePt: 16, color: "#111111", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "doc-output" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-prototype-output", "可运行原型入口", { x: 682, y: 390, w: 140, h: 25 }, { sizePt: 16, color: "#111111", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "prototype-output" })));
  add({ id: "product-brain-asset-closure-output-route-left", type: "line", box: { x: 478, y: 391, w: -145, h: 0 }, style: { stroke: "#3AAF73", strokeWidthPt: 2, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-asset-closure-native-output-route", { side: "left" }) });
  add({ id: "product-brain-asset-closure-output-route-right", type: "line", box: { x: 478, y: 391, w: 100, h: 0 }, style: { stroke: "#3AAF73", strokeWidthPt: 2, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-asset-closure-native-output-route", { side: "right" }) });

  add({ id: "product-brain-asset-closure-value-banner", type: "rect", box: { x: 175, y: 448, w: 610, h: 61 }, style: { fill: "#EAF6FF", stroke: "#3AAE82", strokeWidthPt: 2, radiusPt: 8, shadow: { color: "#60D09A", alpha: 0.25, blurPt: 9, distancePt: 0, angle: 0 } }, source: source("product-brain-asset-closure-native-value-banner") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-asset-closure-value-text", "将复杂的协同维度码表与取数逻辑，从原始材料转化为\n“文档+原型+Mock数据”三位一体的供应链域可检索资产。", { x: 198, y: 463, w: 565, h: 36 }, { sizePt: 18, color: "#111111", weight: "bold", align: "center" }, source("product-brain-asset-closure-native-text", { role: "value" })));
  return { shapes, textBoxes, images };
}

function materializeProductBrainAssetClosureFunnelCrops(parentImage = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir) return [];
  ensureDir(options.assetDir);
  const cropSpecs = [
    { id: "input-assembly", box: { x: 300, y: 127, w: 352, h: 103 }, subtype: "asset-input-materials-funnel-assembly", reason: "DOC, HTML, screenshot, mock-data, and funnel-rim artwork retained as one coherent source-faithful input illustration" },
    { id: "document-output", box: { x: 312, y: 354, w: 79, h: 90 }, subtype: "structured-document-output-icon", reason: "structured document and gear retained as one source-faithful output icon" },
    { id: "prototype-output", box: { x: 580, y: 354, w: 102, h: 86 }, subtype: "runnable-prototype-output-icon", reason: "runnable prototype device retained as one source-faithful output icon" }
  ];
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-product-brain-asset-closure`, "product-brain-asset-closure");
  return cropSpecs.map((spec) => {
    const box = clampPtBoxToSlide(spec.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${spec.id}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parentImage.id || "product-brain-asset-closure"}-${spec.id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir || options.assetDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `product-brain-asset-closure-${spec.id}-crop`,
        parentDetector: parentImage.source?.detector || null,
        parentImageId: parentImage.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: spec.subtype,
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: spec.reason
      }
    };
  });
}

function shouldObjectifyProductBrainAssetClosureFunnel(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/订货配置|资产闭环|Skills处理引擎|MockData|可运行原型/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) =>
    image?.source?.detector === "structured-case-graphic-underlay-crop"
    || image?.source?.detector === "cycle-illustration-underlay-crop"
  );
  return candidates.some((image) => Number(image.box?.w || 0) > slideSize.widthPt * 0.55 && Number(image.box?.h || 0) > slideSize.heightPt * 0.35);
}

function addProductBrainAssetClosureInputs(add, source) {
  [{ x: 315, y: 151, kind: "word" }, { x: 390, y: 164, kind: "html" }].forEach((doc, index) => {
    add({ id: `product-brain-asset-closure-input-doc-${index}`, type: "rect", box: { x: doc.x, y: doc.y, w: 40, h: 56 }, style: { fill: doc.kind === "word" ? "#E8F4FF" : "#FFF3DE", stroke: "#3F6685", strokeWidthPt: 1, radiusPt: 3, rotate: index === 0 ? -15 : 8 }, source: source("product-brain-asset-closure-native-input-doc", { index, kind: doc.kind }) });
    add({ id: `product-brain-asset-closure-input-doc-badge-${index}`, type: "rect", box: { x: doc.x + 5, y: doc.y + 34, w: 35, h: 18 }, style: { fill: doc.kind === "word" ? "#2E72B8" : "#E58B25", stroke: "none", strokeWidthPt: 0, rotate: index === 0 ? -15 : 8 }, source: source("product-brain-asset-closure-native-input-doc-badge", { index }) });
  });
  [0, 1].forEach((index) => {
    add({ id: `product-brain-asset-closure-screenshot-${index}`, type: "rect", box: { x: 475 + index * 38, y: 145 + index * 14, w: 88, h: 54 }, style: { fill: "#F5F7FA", stroke: "#333333", strokeWidthPt: 1, rotate: index === 0 ? -6 : 2 }, source: source("product-brain-asset-closure-native-screenshot", { index }) });
    add({ id: `product-brain-asset-closure-screenshot-bar-${index}`, type: "rect", box: { x: 479 + index * 38, y: 150 + index * 14, w: 80, h: 8 }, style: { fill: "#DDE6EE", stroke: "none", strokeWidthPt: 0, rotate: index === 0 ? -6 : 2 }, source: source("product-brain-asset-closure-native-screenshot-bar", { index }) });
  });
  [0, 1].forEach((index) => {
    add({ id: `product-brain-asset-closure-mock-${index}`, type: "rect", box: { x: 596 + index * 29, y: 151 + index * 27, w: 58, h: 46 }, style: { fill: "#D5DFE8", stroke: "#333333", strokeWidthPt: 1, rotate: index === 0 ? -8 : 14 }, source: source("product-brain-asset-closure-native-mock-card", { index }) });
    add({ id: `product-brain-asset-closure-mock-cell-${index}`, type: "rect", box: { x: 604 + index * 29, y: 166 + index * 27, w: 9, h: 9 }, style: { fill: index === 0 ? "#2F85D6" : "#F0A33B", stroke: "#555555", strokeWidthPt: 0.6, rotate: index === 0 ? -8 : 14 }, source: source("product-brain-asset-closure-native-mock-cell", { index }) });
  });
}

function addProductBrainAssetClosureOutputs(add, source) {
  add({ id: "product-brain-asset-closure-output-doc", type: "rect", box: { x: 320, y: 365, w: 45, h: 61 }, style: { fill: "#F7FBFF", stroke: "#2A8C6C", strokeWidthPt: 1.2, radiusPt: 3 }, source: source("product-brain-asset-closure-native-output-doc") });
  add({ id: "product-brain-asset-closure-output-doc-header", type: "rect", box: { x: 330, y: 382, w: 24, h: 9 }, style: { fill: "#34B47A", stroke: "none", strokeWidthPt: 0 }, source: source("product-brain-asset-closure-native-output-doc-header") });
  [0, 1, 2].forEach((index) => add({ id: `product-brain-asset-closure-output-doc-line-${index}`, type: "line", box: { x: 330, y: 398 + index * 10, w: 24, h: 0 }, style: { stroke: "#9BB1BF", strokeWidthPt: 1.4, connectorType: "straight" }, source: source("product-brain-asset-closure-native-output-doc-line", { index }) }));
  add({ id: "product-brain-asset-closure-output-gear", type: "ellipse", box: { x: 356, y: 402, w: 24, h: 24 }, style: { fill: "#48BA89", stroke: "#2B7F61", strokeWidthPt: 1 }, source: source("product-brain-asset-closure-native-output-gear") });
  add({ id: "product-brain-asset-closure-output-screen", type: "rect", box: { x: 584, y: 365, w: 91, h: 65 }, style: { fill: "#D8DEE6", stroke: "#333333", strokeWidthPt: 1.2, radiusPt: 4 }, source: source("product-brain-asset-closure-native-output-screen") });
  add({ id: "product-brain-asset-closure-output-screen-inner", type: "rect", box: { x: 594, y: 380, w: 62, h: 32 }, style: { fill: "#44BE80", stroke: "#166A4A", strokeWidthPt: 1 }, source: source("product-brain-asset-closure-native-output-screen-inner") });
  add({ id: "product-brain-asset-closure-output-play", type: "triangle", box: { x: 619, y: 388, w: 18, h: 18 }, style: { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0, rotate: 90 }, source: source("product-brain-asset-closure-native-output-play") });
}

function createProductBrainWmsQualityGateObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyProductBrainWmsQualityGate(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
  const sourceImages = (page.images || []).filter((image) =>
    image?.source?.detector === "cycle-illustration-underlay-crop"
    || image?.source?.detector === "structured-case-graphic-underlay-crop"
  );
  const preserveInputComplexityAsMinimumUnit = Boolean(options.sourceImage && options.assetDir && options.irDir && sourceImages[0]);
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      productBrainWmsQualityGateObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: preserveInputComplexityAsMinimumUnit
        ? `${image.source?.nonEditableReason || image.source?.reason || "WMS quality-gate diagram"}; preserved the intentionally tangled input network as one minimum visual unit and rebuilt the structured output natively`
        : `${image.source?.nonEditableReason || image.source?.reason || "WMS quality-gate diagram"}; rebuilt input-complexity to portal-output diagram as native editable components`
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
  const images = preserveInputComplexityAsMinimumUnit
    ? [materializeProductBrainWmsQualityGateInputCrop(sourceImages[0], slideSize, options)]
    : [];

  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-brand", "The Digital Architect's Canvas", { x: 28, y: 13, w: 190, h: 18 }, { sizePt: 12, color: "#111111", weight: "regular", align: "left" }, source("product-brain-wms-quality-native-text", { role: "brand" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-title", "实战案例：物流WMS「入库单管理」的质量前置", { x: 132, y: 66, w: 710, h: 50 }, { sizePt: 31, color: "#000000", weight: "bold", align: "center" }, source("product-brain-wms-quality-native-text", { role: "title" })));
  add({ id: "product-brain-wms-quality-divider", type: "line", box: { x: 480, y: 129, w: 0, h: 275 }, style: { stroke: "#B8C2C7", strokeWidthPt: 1, connectorType: "straight" }, source: source("product-brain-wms-quality-native-divider") });

  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-input-heading", "Input Complexity", { x: 145, y: 136, w: 230, h: 31 }, { family: "Arial", sizePt: 22, color: "#111111", weight: "bold", align: "center" }, source("product-brain-wms-quality-native-text", { role: "input-heading" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-output-heading", "Portal Output", { x: 626, y: 136, w: 190, h: 31 }, { family: "Arial", sizePt: 22, color: "#111111", weight: "bold", align: "center" }, source("product-brain-wms-quality-native-text", { role: "output-heading" })));
  add({ id: "product-brain-wms-quality-input-underline", type: "rect", box: { x: 151, y: 160, w: 200, h: 10 }, style: { fill: "#C8CDD1", stroke: "none", strokeWidthPt: 0, radiusPt: 2, opacity: 0.85 }, source: source("product-brain-wms-quality-native-heading-underline", { side: "input" }) });
  add({ id: "product-brain-wms-quality-output-underline", type: "rect", box: { x: 627, y: 160, w: 169, h: 10 }, style: { fill: "#9DC5E7", stroke: "none", strokeWidthPt: 0, radiusPt: 2, opacity: 0.9 }, source: source("product-brain-wms-quality-native-heading-underline", { side: "output" }) });

  if (!preserveInputComplexityAsMinimumUnit) {
    addProductBrainWmsInputNetwork(add, source);
    textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-label-v39", "V39超收规则", { x: 70, y: 280, w: 125, h: 28 }, { sizePt: 20, color: "#111111", weight: "bold", align: "left" }, source("product-brain-wms-quality-native-text", { role: "input-label" })));
    textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-label-v39b", "V39B越库校验", { x: 312, y: 224, w: 152, h: 27 }, { sizePt: 19, color: "#111111", weight: "bold", align: "left" }, source("product-brain-wms-quality-native-text", { role: "input-label" })));
    textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-label-v49", "V49复用关系", { x: 199, y: 368, w: 140, h: 27 }, { sizePt: 20, color: "#111111", weight: "bold", align: "left" }, source("product-brain-wms-quality-native-text", { role: "input-label" })));
  }

  addProductBrainWmsOutputCards(add, textBoxes, source);

  add({ id: "product-brain-wms-quality-pain-rule", type: "line", box: { x: 43, y: 433, w: 407, h: 0 }, style: { stroke: "#8FA0A8", strokeWidthPt: 3, connectorType: "straight" }, source: source("product-brain-wms-quality-native-bottom-rule", { side: "pain" }) });
  add({ id: "product-brain-wms-quality-value-rule-a", type: "line", box: { x: 509, y: 433, w: 165, h: 0 }, style: { stroke: "#0E84CC", strokeWidthPt: 3, connectorType: "straight" }, source: source("product-brain-wms-quality-native-bottom-rule", { side: "value-blue" }) });
  add({ id: "product-brain-wms-quality-value-rule-b", type: "line", box: { x: 674, y: 433, w: 226, h: 0 }, style: { stroke: "#32B56E", strokeWidthPt: 3, connectorType: "straight" }, source: source("product-brain-wms-quality-native-bottom-rule", { side: "value-green" }) });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-pain", "跨模块规则极易遗漏（越库完整性、最大可\n收量公式）。", { x: 107, y: 455, w: 339, h: 58 }, { sizePt: 16.5, color: "#111111", weight: "regular", align: "left" }, source("product-brain-wms-quality-native-text", { role: "pain" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-pain-prefix", "痛点：", { x: 58, y: 455, w: 61, h: 24 }, { sizePt: 16.5, color: "#111111", weight: "bold", align: "left" }, source("product-brain-wms-quality-native-text", { role: "pain-prefix" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-value", "Skills提前澄清超量规则边界，自动提炼开发\n任务清单，大幅降低研发返工率。", { x: 558, y: 455, w: 349, h: 58 }, { sizePt: 16.5, color: "#111111", weight: "regular", align: "left" }, source("product-brain-wms-quality-native-text", { role: "value" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-wms-quality-value-prefix", "价值：", { x: 509, y: 455, w: 61, h: 24 }, { sizePt: 16.5, color: "#1AA36C", weight: "bold", align: "left" }, source("product-brain-wms-quality-native-text", { role: "value-prefix" })));

  return { shapes, textBoxes, images };
}

function materializeProductBrainWmsQualityGateInputCrop(target, slideSize = DEFAULT_SLIDE, options = {}) {
  const box = clampPtBoxToSlide({ x: 65, y: 180, w: 393, h: 230 }, slideSize);
  const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-wms-input-complexity`, "wms-input-complexity");
  const file = path.join(options.assetDir, `${base}.png`);
  writePng(file, cropPng(options.sourceImage, pxBox));
  return {
    id: `${target?.id || "product-brain-wms-quality"}-input-complexity-crop`,
    type: "fidelity-crop",
    assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
    box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
    source: {
      editable: false,
      detector: "product-brain-wms-quality-input-complexity-crop",
      expressionForm: "icon-or-illustration",
      expressionSubtype: "intentionally-tangled-dependency-network",
      intentionalMinimumUnitCrop: true,
      protectedMinimumUnit: true,
      skipVisualAtomRebuild: true,
      recommendedAction: "keep-local-crop",
      nonEditableReason: "intentionally tangled dependency network and its internal labels preserved as one minimum diagram unit"
    }
  };
}

function shouldObjectifyProductBrainWmsQualityGate(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/入库单管理|质量前置|InputComplexity|PortalOutput|Clearcalculationformulas|FEBEQA|开发参考|交互验证/.test(labels)) return false;
  const candidates = (page.images || []).filter((image) =>
    image?.source?.detector === "cycle-illustration-underlay-crop"
    || image?.source?.detector === "structured-case-graphic-underlay-crop"
  );
  return candidates.some((image) => Number(image.box?.w || 0) > slideSize.widthPt * 0.45 && Number(image.box?.h || 0) > slideSize.heightPt * 0.3);
}

function addProductBrainWmsInputNetwork(add, source) {
  const lines = [
    { x: 89, y: 194, w: 160, h: 76, arrow: true },
    { x: 126, y: 257, w: 169, h: -44, arrow: true },
    { x: 176, y: 226, w: 184, h: 129, arrow: true },
    { x: 172, y: 357, w: 118, h: -126, arrow: true },
    { x: 102, y: 380, w: 242, h: -153, arrow: true },
    { x: 200, y: 255, w: 164, h: 68, arrow: false },
    { x: 252, y: 222, w: 113, h: 141, arrow: true },
    { x: 358, y: 319, w: 18, h: -67, arrow: true },
    { x: 183, y: 225, w: 193, h: 169, arrow: true },
    { x: 337, y: 397, w: -182, h: -37, arrow: true }
  ];
  lines.forEach((line, index) => {
    add({ id: `product-brain-wms-quality-network-line-${index}`, type: "line", box: { x: line.x, y: line.y, w: line.w, h: line.h }, style: { stroke: "#879098", strokeWidthPt: 2.2, opacity: 0.82, connectorType: "straight", endArrow: line.arrow ? "triangle" : "none" }, source: source("product-brain-wms-quality-native-network-line", { index }) });
  });
  [
    { x: 120, y: 190, w: 162, h: 107 },
    { x: 124, y: 182, w: 238, h: 181 },
    { x: 100, y: 191, w: 286, h: 121 },
    { x: 130, y: 330, w: 72, h: 45 },
    { x: 240, y: 188, w: 123, h: 184 }
  ].forEach((loop, index) => {
    add({ id: `product-brain-wms-quality-network-loop-${index}`, type: "ellipse", box: loop, style: { fill: "none", stroke: "#9AA3AA", strokeWidthPt: 2.2, opacity: 0.75 }, source: source("product-brain-wms-quality-native-network-loop", { index }) });
  });
  [
    { x: 169, y: 217 },
    { x: 250, y: 205 },
    { x: 165, y: 352 },
    { x: 360, y: 316 }
  ].forEach((node, index) => {
    add({ id: `product-brain-wms-quality-network-node-${index}`, type: "ellipse", box: { x: node.x, y: node.y, w: 18, h: 18 }, style: { fill: "#BFC6CB", stroke: "#788189", strokeWidthPt: 1.1 }, source: source("product-brain-wms-quality-native-network-node", { index }) });
  });
}

function addProductBrainWmsOutputCards(add, textBoxes, source) {
  const rows = [
    { y: 183, label: "已审PRD", body: "Clear calculation formulas", colors: ["#0B79D8", "#286BC9"], icon: true },
    { y: 266, label: "开发参考", body: "FE/BE/QA tasks\nautomatically extracted", colors: ["#197ED2", "#31BD78"], icon: false },
    { y: 348, label: "交互验证", body: "Prototypes linked to logic", colors: ["#197ED2", "#31BD78"], icon: false }
  ];
  rows.forEach((row, index) => {
    const component = productBrainWmsQualityComponent(`output-card-${index}`, "portal-output-card");
    const border = index === 0 ? "#215D75" : "#2A9876";
    add({ id: `product-brain-wms-quality-output-left-${index}`, type: "rect", box: { x: 524, y: row.y, w: 158, h: 57 }, style: { fill: row.colors[0], gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: row.colors[0] }, { position: 1, color: row.colors[1] }] }, stroke: border, strokeWidthPt: 1, opacity: 0.98 }, source: source("product-brain-wms-quality-native-output-left", { index, ...component, nativeComponentRole: "label-background" }) });
    add({ id: `product-brain-wms-quality-output-right-${index}`, type: "rect", box: { x: 682, y: row.y, w: 219, h: 57 }, style: { fill: "#F8FCFB", gradient: { type: "linear", angleDeg: 0, stops: [{ position: 0, color: "#FAFDFD" }, { position: 1, color: "#F1F8F7" }] }, stroke: border, strokeWidthPt: 1.1 }, source: source("product-brain-wms-quality-native-output-right", { index, ...component, nativeComponentRole: "body-background" }) });
    if (row.icon) {
      add({ id: "product-brain-wms-quality-output-doc-icon", type: "rect", box: { x: 545, y: row.y + 17, w: 18, h: 23 }, style: { fill: "#E9F7FF", stroke: "#FFFFFF", strokeWidthPt: 0.8, radiusPt: 2 }, source: source("product-brain-wms-quality-native-output-icon", { ...component, nativeComponentRole: "icon" }) });
      [0, 1, 2].forEach((lineIndex) => add({ id: `product-brain-wms-quality-output-doc-line-${lineIndex}`, type: "line", box: { x: 550, y: row.y + 25 + lineIndex * 5, w: 9, h: 0 }, style: { stroke: "#0D76D8", strokeWidthPt: 1, connectorType: "straight" }, source: source("product-brain-wms-quality-native-output-icon-line", { lineIndex, ...component, nativeComponentRole: `icon-line-${lineIndex}` }) }));
    }
    const labelBox = index === 0
      ? { x: 566, y: row.y + 13, w: 96, h: 31 }
      : { x: 552, y: row.y + 13, w: 110, h: 31 };
    textBoxes.push(temporaryAnswerWorkflowTextBox(`product-brain-wms-quality-output-label-${index}`, row.label, labelBox, { sizePt: 20, color: "#FFFFFF", weight: "bold", align: "center", nativeComponentGroupId: component.nativeComponentGroupId }, source("product-brain-wms-quality-native-text", { role: "output-label", index, ...component, nativeComponentRole: "label" })));
    textBoxes.push(temporaryAnswerWorkflowTextBox(`product-brain-wms-quality-output-body-${index}`, row.body, { x: 695, y: row.y + 13, w: 193, h: 36 }, { family: "Arial", sizePt: 15.5, color: "#111111", weight: "regular", align: "left", nativeComponentGroupId: component.nativeComponentGroupId }, source("product-brain-wms-quality-native-text", { role: "output-body", index, ...component, nativeComponentRole: "body" })));
    if (index < rows.length - 1) {
      const flow = productBrainWmsQualityComponent("output-routing", "portal-output-routing");
      add({ id: `product-brain-wms-quality-output-down-${index}`, type: "line", box: { x: 603, y: row.y + 57, w: 0, h: 26 }, style: { stroke: "#34B777", strokeWidthPt: 1.8, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-wms-quality-native-output-flow", { index, ...flow, nativeComponentRole: `connector-${index}` }) });
    }
  });
}

function productBrainWmsQualityComponent(role, archetype) {
  const safeRole = safeComponentToken(role || "component");
  const groupId = `product-brain-wms-quality-${safeRole}`;
  return {
    nativeComponentInstance: true,
    nativeComponentGroupId: groupId,
    nativeComponentArchetype: archetype || "wms-quality-gate",
    nativeComponentRole: safeRole,
    componentOwnerId: groupId,
    componentOwnerKind: archetype || "wms-quality-gate"
  };
}

function createProductBrainSmartReviewRiskGateObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyProductBrainSmartReviewRiskGate(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  if (shouldPreserveProductBrainSmartReviewRiskGateAsMinimumUnit(page, rawTextBoxes, slideSize)) {
    markProtectedComplexDiagramMinimumUnit(sourceImages, {
      detector: "product-brain-smart-review-protected-diagram-crop",
      expressionSubtype: "smart-review-risk-gate-illustration",
      reason: "SmartReview risk-gate is an icon/diagram expression unit; preserving the local crops is higher fidelity than rebuilding it from approximate native primitives"
    });
    return { shapes: [], textBoxes: [], images: [] };
  }
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      productBrainSmartReviewRiskGateObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "SmartReview risk-gate diagram"}; rebuilt smart-review risk gate as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "product-brain-smart-review-native-component",
    componentOwnerKind: "smart-review-risk-gate",
    confidence: 0.9,
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const images = materializeProductBrainSmartReviewPictorialCrops(sourceImages[0], slideSize, options);
  add({ id: "product-brain-smart-review-banner", type: "roundRect", box: { x: 55, y: 107, w: 706, h: 40 }, style: { fill: "#24B36B", stroke: "#24A963", strokeWidthPt: 0.8, radiusPt: 5 }, source: source("product-brain-smart-review-native-banner") });
  add({ id: "product-brain-smart-review-banner-accent", type: "roundRect", box: { x: 55, y: 107, w: 52, h: 40 }, style: { fill: "#CBECDC", stroke: "none", strokeWidthPt: 0, radiusPt: 5 }, source: source("product-brain-smart-review-native-banner-accent") });
  addProductBrainSmartReviewSourceBlueprint(add, source);
  addProductBrainSmartReviewSourceSkillCard(add, source);
  addProductBrainSmartReviewSourcePrdAsset(add, source);
  addProductBrainSmartReviewSourceRiskPool(add, source);
  addProductBrainSmartReviewSourceRoutes(add, source);
  if (images.length > 0) {
    const approximatePictorialDetectors = new Set([
      "product-brain-smart-review-native-skill-lens",
      "product-brain-smart-review-native-skill-lens-handle",
      "product-brain-smart-review-native-card-icon",
      "product-brain-smart-review-native-skill-doc",
      "product-brain-smart-review-native-doc-fold",
      "product-brain-smart-review-native-skill-doc-panel",
      "product-brain-smart-review-native-skill-doc-line",
      "product-brain-smart-review-native-prd-gem",
      "product-brain-smart-review-native-prd-gem-facet"
    ]);
    for (let index = shapes.length - 1; index >= 0; index -= 1) {
      if (approximatePictorialDetectors.has(String(shapes[index]?.source?.detector || ""))) shapes.splice(index, 1);
    }
  }
  if (Array.isArray(page.textBoxes)) page.textBoxes = normalizeSmartReviewTextBoxes(page.textBoxes);
  const normalizedRawTextBoxes = normalizeSmartReviewTextBoxes(rawTextBoxes);
  rawTextBoxes.splice(0, rawTextBoxes.length, ...normalizedRawTextBoxes);
  filterProductBrainSmartReviewClaimedText(page, rawTextBoxes);
  return { shapes, textBoxes, images };
}

function materializeProductBrainSmartReviewPictorialCrops(parentImage = {}, slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-smart-review`, "smart-review");
  return smartReviewPictorialRegions().map((region) => {
    const box = clampPtBoxToSlide(region.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${region.id}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parentImage?.id || "smart-review"}-${region.id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `product-brain-smart-review-${region.id}-crop`,
        parentDetector: parentImage?.source?.detector || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: region.subtype,
        strategy: "local-fidelity-crop",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: "source-faithful pictorial atom retained because approximate native primitives reduce visual fidelity"
      }
    };
  });
}

function materializeAssetOsFragmentedAssetChainCrops(parentImage = {}, regions = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!options.sourceImage || !options.assetDir || !options.irDir || !Array.isArray(regions)) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-fragmented-asset-chain`, "fragmented-asset-chain");
  return regions.map((region) => {
    const box = clampPtBoxToSlide(region.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${safeIdentifier(region.id, "icon")}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parentImage?.id || "fragmented-asset-chain"}-${region.id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `asset-os-fragmented-chain-${region.id}-crop`,
        parentDetector: parentImage?.source?.detector || null,
        expressionForm: "icon-or-illustration",
        expressionSubtype: region.subtype,
        strategy: "local-fidelity-crop",
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        ...(region.component || {}),
        nonEditableReason: "standalone pictorial icon retained as a source-faithful minimum unit"
      }
    };
  });
}

function addProductBrainSmartReviewSourceBlueprint(add, source) {
  add({ id: "product-brain-smart-review-blueprint-card", type: "roundRect", box: { x: 54, y: 250, w: 160, h: 190 }, style: { fill: "#FFFFFF", stroke: "#B8BFC5", strokeWidthPt: 1.4, radiusPt: 6 }, source: source("product-brain-smart-review-native-doc") });
  add({ id: "product-brain-smart-review-blueprint-header", type: "rect", box: { x: 65, y: 264, w: 136, h: 20 }, style: { fill: "#1C72C8", stroke: "#1763AF", strokeWidthPt: 0.6, radiusPt: 2 }, source: source("product-brain-smart-review-native-doc-header") });
  add({ id: "product-brain-smart-review-blueprint-hero", type: "rect", box: { x: 71, y: 299, w: 123, h: 45 }, style: { fill: "#FFFFFF", stroke: "#BBBBBB", strokeWidthPt: 1.1 }, source: source("product-brain-smart-review-native-doc-panel") });
  add({ id: "product-brain-smart-review-blueprint-hero-a", type: "line", box: { x: 72, y: 300, w: 121, h: 43 }, style: { stroke: "#C8C8C8", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-doc-line") });
  add({ id: "product-brain-smart-review-blueprint-hero-b", type: "line", box: { x: 193, y: 300, w: -121, h: 43 }, style: { stroke: "#C8C8C8", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-doc-line") });
  add({ id: "product-brain-smart-review-blueprint-thumb", type: "rect", box: { x: 71, y: 360, w: 38, h: 37 }, style: { fill: "#FFFFFF", stroke: "#C8C8C8", strokeWidthPt: 1.1 }, source: source("product-brain-smart-review-native-doc-panel") });
  add({ id: "product-brain-smart-review-blueprint-thumb-a", type: "line", box: { x: 72, y: 361, w: 36, h: 35 }, style: { stroke: "#C8C8C8", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-doc-line") });
  add({ id: "product-brain-smart-review-blueprint-thumb-b", type: "line", box: { x: 108, y: 361, w: -36, h: 35 }, style: { stroke: "#C8C8C8", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-doc-line") });
  [0, 1, 2].forEach((index) => {
    add({ id: `product-brain-smart-review-blueprint-dot-${index}`, type: "ellipse", box: { x: 123, y: 365 + index * 14, w: 6, h: 6 }, style: { fill: "#2C78B8", stroke: "#2C78B8", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-doc-dot", { index }) });
    add({ id: `product-brain-smart-review-blueprint-line-${index}`, type: "line", box: { x: 138, y: 368 + index * 14, w: 42, h: 0 }, style: { stroke: "#B8B8B8", strokeWidthPt: 2.4, connectorType: "straight", lineCap: "round" }, source: source("product-brain-smart-review-native-doc-line", { index }) });
  });
  add({ id: "product-brain-smart-review-blueprint-footer", type: "rect", box: { x: 55, y: 405, w: 158, h: 34 }, style: { fill: "#F2F2F2", stroke: "#DDDDDD", strokeWidthPt: 0.8 }, source: source("product-brain-smart-review-native-doc-footer") });
}

function addProductBrainSmartReviewSourceSkillCard(add, source) {
  add({ id: "product-brain-smart-review-skill-card", type: "roundRect", box: { x: 292, y: 172, w: 202, h: 315 }, style: { fill: "#126CC7", stroke: "#0B5DA9", strokeWidthPt: 1.2, radiusPt: 8, shadow: { color: "#1368B8", alpha: 0.28, blurPt: 12, distancePt: 0, angle: 0 } }, source: source("product-brain-smart-review-native-skill-card") });
  add({ id: "product-brain-smart-review-skill-card-glow", type: "rect", box: { x: 314, y: 334, w: 160, h: 50 }, style: { fill: "#4CF29B", stroke: "none", strokeWidthPt: 0, opacity: 0.38 }, source: source("product-brain-smart-review-native-skill-scan") });
  add({ id: "product-brain-smart-review-skill-doc", type: "rect", box: { x: 349, y: 305, w: 86, h: 107 }, style: { fill: "#DDF1FF", stroke: "#9AB5C7", strokeWidthPt: 1.2, radiusPt: 3 }, source: source("product-brain-smart-review-native-skill-doc") });
  add({ id: "product-brain-smart-review-skill-doc-fold", type: "triangle", box: { x: 416, y: 305, w: 19, h: 19 }, style: { fill: "#B7C9D7", stroke: "#9AB5C7", strokeWidthPt: 0.8, rotate: 90 }, source: source("product-brain-smart-review-native-doc-fold") });
  add({ id: "product-brain-smart-review-skill-doc-panel", type: "rect", box: { x: 356, y: 330, w: 67, h: 31 }, style: { fill: "#DDF1FF", stroke: "#9AB5C7", strokeWidthPt: 1.1 }, source: source("product-brain-smart-review-native-skill-doc-panel") });
  add({ id: "product-brain-smart-review-skill-doc-panel-a", type: "line", box: { x: 357, y: 331, w: 65, h: 29 }, style: { stroke: "#9AB5C7", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-skill-doc-line") });
  add({ id: "product-brain-smart-review-skill-doc-panel-b", type: "line", box: { x: 422, y: 331, w: -65, h: 29 }, style: { stroke: "#9AB5C7", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-smart-review-native-skill-doc-line") });
  add({ id: "product-brain-smart-review-skill-lens", type: "ellipse", box: { x: 370, y: 188, w: 42, h: 42 }, style: { fill: "none", stroke: "#DDF3FF", strokeWidthPt: 4 }, source: source("product-brain-smart-review-native-skill-lens") });
  add({ id: "product-brain-smart-review-skill-lens-handle", type: "line", box: { x: 402, y: 221, w: 22, h: 21 }, style: { stroke: "#DDF3FF", strokeWidthPt: 5, connectorType: "straight" }, source: source("product-brain-smart-review-native-skill-lens-handle") });
  add({ id: "product-brain-smart-review-skill-gear", type: "ellipse", box: { x: 363, y: 192, w: 18, h: 18 }, style: { fill: "#DDF3FF", stroke: "#DDF3FF", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-card-icon") });
}

function addProductBrainSmartReviewSourcePrdAsset(add, source) {
  add({ id: "product-brain-smart-review-prd-asset-card", type: "roundRect", box: { x: 586, y: 172, w: 342, h: 148 }, style: { fill: "#FFFFFF", stroke: "#25A760", strokeWidthPt: 3, radiusPt: 6 }, source: source("product-brain-smart-review-native-prd-asset-card") });
  add({ id: "product-brain-smart-review-prd-divider", type: "line", box: { x: 654, y: 198, w: 0, h: 96 }, style: { stroke: "#D8D8D8", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("product-brain-smart-review-native-prd-divider") });
  add({ id: "product-brain-smart-review-prd-gem", type: "diamond", box: { x: 603, y: 226, w: 45, h: 45 }, style: { fill: "#1FB56D", stroke: "#0C8B4D", strokeWidthPt: 1.1 }, source: source("product-brain-smart-review-native-prd-gem") });
  add({ id: "product-brain-smart-review-prd-gem-facet", type: "triangle", box: { x: 606, y: 228, w: 40, h: 18 }, style: { fill: "#8EF0B8", stroke: "none", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-prd-gem-facet") });
  [[662, 235, 654], [798, 235, 790], [662, 268, 654], [798, 268, 790]].forEach(([x, y, checkX], index) => {
    add({ id: `product-brain-smart-review-prd-pill-${index}`, type: "roundRect", box: { x, y, w: 126, h: 26 }, style: { fill: "#DFF2E6", stroke: "none", strokeWidthPt: 0, radiusPt: 5 }, source: source("product-brain-smart-review-native-prd-pill", { index }) });
    add({ id: `product-brain-smart-review-prd-check-${index}`, type: "ellipse", box: { x: checkX, y: y + 5, w: 16, h: 16 }, style: { fill: "#2EB96D", stroke: "#2EB96D", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-pass-check", { index }) });
    add({ id: `product-brain-smart-review-prd-check-a-${index}`, type: "line", box: { x: checkX + 4, y: y + 13, w: 4, h: 4 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("product-brain-smart-review-native-pass-check-mark", { index, part: "a" }) });
    add({ id: `product-brain-smart-review-prd-check-b-${index}`, type: "line", box: { x: checkX + 8, y: y + 17, w: 8, h: -10 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("product-brain-smart-review-native-pass-check-mark", { index, part: "b" }) });
  });
}

function addProductBrainSmartReviewSourceRiskPool(add, source) {
  add({ id: "product-brain-smart-review-risk-pool", type: "roundRect", box: { x: 586, y: 358, w: 160, h: 136 }, style: { fill: "#FFFFFF", stroke: "#F07800", strokeWidthPt: 3, radiusPt: 5 }, source: source("product-brain-smart-review-native-risk-pool") });
  add({ id: "product-brain-smart-review-risk-header", type: "rect", box: { x: 586, y: 358, w: 160, h: 38 }, style: { fill: "#F07800", stroke: "#F07800", strokeWidthPt: 0, radiusPt: 4 }, source: source("product-brain-smart-review-native-risk-header") });
  [[606, 412], [606, 445], [606, 475]].forEach(([x, y], index) => {
    add({ id: `product-brain-smart-review-risk-card-${index}`, type: "ellipse", box: { x, y, w: 18, h: 18 }, style: { fill: "#F07800", stroke: "#F07800", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-risk-card", { index }) });
    add({ id: `product-brain-smart-review-risk-x-a-${index}`, type: "line", box: { x: x + 5, y: y + 5, w: 8, h: 8 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("product-brain-smart-review-native-risk-warning-mark", { index, part: "a" }) });
    add({ id: `product-brain-smart-review-risk-x-b-${index}`, type: "line", box: { x: x + 13, y: y + 5, w: -8, h: 8 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("product-brain-smart-review-native-risk-warning-mark", { index, part: "b" }) });
  });
}

function addProductBrainSmartReviewSourceRoutes(add, source) {
  add({ id: "product-brain-smart-review-input-arrow", type: "line", box: { x: 207, y: 344, w: 82, h: 0 }, style: { stroke: "#1F78C8", strokeWidthPt: 6, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-smart-review-native-soft-arrow") });
  add({ id: "product-brain-smart-review-skill-scan", type: "line", box: { x: 313, y: 343, w: 160, h: 0 }, style: { stroke: "#4CF29B", strokeWidthPt: 6, connectorType: "straight", opacity: 0.75 }, source: source("product-brain-smart-review-native-skill-scan") });
  add({ id: "product-brain-smart-review-pass-route-a", type: "line", box: { x: 494, y: 343, w: 40, h: 0 }, style: { stroke: "#20A95A", strokeWidthPt: 7, connectorType: "straight" }, source: source("product-brain-smart-review-native-pass-route", { part: "a" }) });
  add({ id: "product-brain-smart-review-pass-route-b", type: "line", box: { x: 534, y: 343, w: 0, h: -95 }, style: { stroke: "#20A95A", strokeWidthPt: 7, connectorType: "straight" }, source: source("product-brain-smart-review-native-pass-route", { part: "b" }) });
  add({ id: "product-brain-smart-review-pass-route-c", type: "line", box: { x: 534, y: 248, w: 52, h: 0 }, style: { stroke: "#20A95A", strokeWidthPt: 7, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-smart-review-native-pass-route", { part: "c" }) });
  add({ id: "product-brain-smart-review-risk-route-a", type: "line", box: { x: 494, y: 350, w: 44, h: 0 }, style: { stroke: "#F07800", strokeWidthPt: 6, connectorType: "straight" }, source: source("product-brain-smart-review-native-risk-route", { part: "a" }) });
  add({ id: "product-brain-smart-review-risk-route-b", type: "line", box: { x: 538, y: 350, w: 0, h: 72 }, style: { stroke: "#F07800", strokeWidthPt: 6, connectorType: "straight" }, source: source("product-brain-smart-review-native-risk-route", { part: "b" }) });
  add({ id: "product-brain-smart-review-risk-route-c", type: "line", box: { x: 538, y: 422, w: 48, h: 0 }, style: { stroke: "#F07800", strokeWidthPt: 6, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-smart-review-native-risk-route", { part: "c" }) });
}

function filterProductBrainSmartReviewClaimedText(page = {}, rawTextBoxes = []) {
  const claimed = /DraftDocument|通过项|逻辑矛盾|异常路径缺失|操作体验阻塞|风险闭环|Portal模式/i;
  if (Array.isArray(page.textBoxes)) {
    page.textBoxes = page.textBoxes.filter((item) => !claimed.test(normalizeCjkText(item?.text || "")));
  }
  if (Array.isArray(rawTextBoxes)) {
    for (let index = rawTextBoxes.length - 1; index >= 0; index -= 1) {
      if (claimed.test(normalizeCjkText(rawTextBoxes[index]?.text || ""))) rawTextBoxes.splice(index, 1);
    }
  }
}

function pushProductBrainSmartReviewTextIfMissing(output = [], rawTextBoxes = [], id, text, box, font, source, role = "") {
  if (smartReviewTextExists(rawTextBoxes, text, role)) return false;
  output.push(temporaryAnswerWorkflowTextBox(id, text, box, font, source));
  return true;
}

function smartReviewTextExists(rawTextBoxes = [], text = "", role = "") {
  const target = normalizeCjkText(text);
  if (!target) return false;
  const pageText = normalizeCjkText((Array.isArray(rawTextBoxes) ? rawTextBoxes : [])
    .map((item) => item?.text || "")
    .join(" "));
  if (role === "title" && /智能评审|SmartReview|风险拦截/.test(pageText)) return true;
  if ((role === "traditional" || role === "portal" || role === "portal-prefix")
    && /后置补救|交付前拦截|返工成本|风险拦截/.test(pageText)) return true;
  return (Array.isArray(rawTextBoxes) ? rawTextBoxes : []).some((item) => {
    const value = normalizeCjkText(item?.text);
    return value && (value === target || value.includes(target) || target.includes(value));
  });
}

function shouldObjectifyProductBrainSmartReviewRiskGate(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  // A Skills capability overview can mention review as one of several stages;
  // it is not the dedicated SmartReview risk-gate layout this builder models.
  if (/Skills能力矩阵|重塑智能产品工作流/.test(labels)) return false;
  const hasStrongRiskGateSignal = /SmartReview|PRD评审Skill|风险拦截|逻辑矛盾|异常路径缺失|操作体验阻塞|DraftDocument/.test(labels);
  const hasContextualSmartReviewSignal = /智能评审/.test(labels)
    && /PRD评审|交付风险|风险拦截|逻辑矛盾|异常路径|操作体验|阻塞|前置评审/.test(labels);
  if (!hasStrongRiskGateSignal && !hasContextualSmartReviewSignal) return false;
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return candidates.length >= 3 && areaRatio > 0.25;
}

function shouldPreserveProductBrainSmartReviewRiskGateAsMinimumUnit(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = normalizeCjkText((rawTextBoxes || []).map((item) => item?.text || "").join(" "));
  const hasRiskGateStructure = /(?:scannerengine|PRD评审Skill|评审Skill)/i.test(labels)
    && /(?:ApprovedAsset|通过项|已通过项)/i.test(labels)
    && /(?:RiskProblemPool|风险问题池|逻辑矛盾|异常路径缺失|操作体验阻塞)/i.test(labels)
    && /(?:PRD|DraftDocument|需求文档|交付文档)/i.test(labels);
  if (!hasRiskGateStructure) return false;
  const candidates = (page.images || []).filter((image) => image?.source?.detector === "product-illustration-segment-crop");
  const areaRatio = candidates.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  const spansDiagram = candidates.length >= 3 && areaRatio > 0.25;
  if (!spansDiagram) return false;
  const hasDecorativeOrScreenshotAtoms = candidates.some((image) => {
    const sourceText = [
      image?.source?.layer?.layerType,
      image?.source?.layer?.recommendedAction,
      image?.source?.expressionForm,
      image?.source?.expressionSubtype,
      image?.source?.reason,
      image?.source?.nonEditableReason
    ].map((value) => String(value || "")).join(" ");
    return /screenshot|document|icon|illustration|preserve-local-crop|图标|图示|截图|插画/i.test(sourceText);
  });
  return hasDecorativeOrScreenshotAtoms || /scannerengine|ApprovedAsset|RiskProblemPool/i.test(labels);
}

function addProductBrainSmartReviewDraftDoc(add, source) {
  add({ id: "product-brain-smart-review-doc-page", type: "rect", box: { x: 86, y: 193, w: 53, h: 69 }, style: { fill: "#F5F7F8", stroke: "#7E8992", strokeWidthPt: 1.5, radiusPt: 3 }, source: source("product-brain-smart-review-native-doc") });
  add({ id: "product-brain-smart-review-doc-fold", type: "triangle", box: { x: 121, y: 193, w: 18, h: 18 }, style: { fill: "#D9DEE1", stroke: "#7E8992", strokeWidthPt: 1, rotate: 90 }, source: source("product-brain-smart-review-native-doc-fold") });
  [0, 1, 2, 3].forEach((index) => add({ id: `product-brain-smart-review-doc-line-${index}`, type: "line", box: { x: 98, y: 219 + index * 10, w: 30 - index * 2, h: 0 }, style: { stroke: "#7E8992", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("product-brain-smart-review-native-doc-line", { index }) }));
}

function addProductBrainSmartReviewSkillCard(add, source) {
  add({ id: "product-brain-smart-review-skill-card", type: "rect", box: { x: 267, y: 153, w: 142, h: 147 }, style: { fill: "#1BAE68", stroke: "#107A4B", strokeWidthPt: 2, radiusPt: 8, shadow: { color: "#1BAE68", alpha: 0.25, blurPt: 10, distancePt: 0, angle: 0 } }, source: source("product-brain-smart-review-native-skill-card") });
  add({ id: "product-brain-smart-review-skill-doc", type: "rect", box: { x: 297, y: 186, w: 90, h: 81 }, style: { fill: "none", stroke: "#9BF2B9", strokeWidthPt: 2, radiusPt: 5, opacity: 0.85 }, source: source("product-brain-smart-review-native-skill-doc") });
  [0, 1, 2, 3].forEach((index) => add({ id: `product-brain-smart-review-skill-doc-line-${index}`, type: "line", box: { x: 310, y: 201 + index * 14, w: 56 - index * 5, h: 0 }, style: { stroke: "#9BF2B9", strokeWidthPt: 2, connectorType: "straight", opacity: 0.9 }, source: source("product-brain-smart-review-native-skill-doc-line", { index }) }));
  add({ id: "product-brain-smart-review-skill-lens", type: "ellipse", box: { x: 334, y: 212, w: 36, h: 36 }, style: { fill: "none", stroke: "#C8F5DA", strokeWidthPt: 3 }, source: source("product-brain-smart-review-native-skill-lens") });
  add({ id: "product-brain-smart-review-skill-lens-handle", type: "line", box: { x: 363, y: 241, w: 23, h: 24 }, style: { stroke: "#C8F5DA", strokeWidthPt: 4, connectorType: "straight" }, source: source("product-brain-smart-review-native-skill-lens-handle") });
  add({ id: "product-brain-smart-review-skill-scan", type: "line", box: { x: 284, y: 226, w: 132, h: 0 }, style: { stroke: "#B7FFD1", strokeWidthPt: 4, connectorType: "straight", opacity: 0.9 }, source: source("product-brain-smart-review-native-skill-scan") });
}

function addProductBrainSmartReviewRiskCards(add, textBoxes, source, rawTextBoxes = []) {
  const cards = [
    ["逻辑矛盾", 646, 231],
    ["异常路径缺失", 646, 289],
    ["操作体验阻塞", 646, 350]
  ];
  cards.forEach(([label, x, y], index) => {
    add({ id: `product-brain-smart-review-risk-card-${index}`, type: "rect", box: { x, y, w: 128, h: 38 }, style: { fill: "#FF8213", stroke: "#E87300", strokeWidthPt: 1.1, radiusPt: 3 }, source: source("product-brain-smart-review-native-risk-card", { index }) });
    for (let tooth = 0; tooth < 8; tooth += 1) {
      add({ id: `product-brain-smart-review-risk-card-tooth-${index}-${tooth}`, type: "triangle", box: { x: x + tooth * 16, y: y - 6, w: 12, h: 9 }, style: { fill: "#FF8213", stroke: "#FF8213", strokeWidthPt: 0 }, source: source("product-brain-smart-review-native-risk-card-tooth", { index, tooth, side: "top" }) });
      add({ id: `product-brain-smart-review-risk-card-bottom-tooth-${index}-${tooth}`, type: "triangle", box: { x: x + tooth * 16, y: y + 35, w: 12, h: 9 }, style: { fill: "#FF8213", stroke: "#FF8213", strokeWidthPt: 0, rotate: 180 }, source: source("product-brain-smart-review-native-risk-card-tooth", { index, tooth, side: "bottom" }) });
    }
    pushProductBrainSmartReviewTextIfMissing(textBoxes, rawTextBoxes, `product-brain-smart-review-risk-card-label-${index}`, label, { x: x + 14, y: y + 8, w: 100, h: 22 }, { sizePt: 18, color: "#FFFFFF", weight: "bold", align: "center" }, source("product-brain-smart-review-native-text", { role: "risk-card", index }));
    if (index < cards.length - 1) {
      add({ id: `product-brain-smart-review-risk-down-${index}`, type: "line", box: { x: x + 64, y: y + 38, w: 0, h: 24 }, style: { stroke: "#F07B00", strokeWidthPt: 3, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-smart-review-native-risk-down", { index }) });
    }
  });
  add({ id: "product-brain-smart-review-risk-vertical", type: "line", box: { x: 594, y: 243, w: 0, h: 132 }, style: { stroke: "#F07B00", strokeWidthPt: 4, connectorType: "straight" }, source: source("product-brain-smart-review-native-risk-branch") });
  [251, 309, 370].forEach((y, index) => add({ id: `product-brain-smart-review-risk-branch-${index}`, type: "line", box: { x: 594, y, w: 52, h: 0 }, style: { stroke: "#F07B00", strokeWidthPt: 4, connectorType: "straight", endArrow: "triangle" }, source: source("product-brain-smart-review-native-risk-branch", { index }) }));
}

function createProductBrainPuzzleValueLoopObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  const normalized = normalizeCjkText((rawTextBoxes || []).map((item) => item?.text || "").join(" "));
  const labelSignals = [/效率提升/, /质量提升/, /标准统/, /知识沉淀/];
  if (!/核心价值闭环.*重塑组织级产品生产力/.test(normalized) || labelSignals.filter((pattern) => pattern.test(normalized)).length < 4) {
    return { shapes: [], textBoxes: [], images: [] };
  }
  if (!options.sourceImage || !options.assetDir || !options.irDir) return { shapes: [], textBoxes: [], images: [] };

  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.97,
    expressionForm: "interlocking-puzzle-value-loop",
    expressionSubtype: "four-panel-jigsaw",
    ...extra
  });
  const panel = (id, box, absolutePoints, fill, role) => ({
    id: `product-brain-puzzle-value-${id}`,
    type: "freeform",
    box,
    points: absolutePoints.map(([px, py]) => ({ x: px / box.w, y: py / box.h })),
    style: { fill, stroke: "#FFFFFF", strokeWidthPt: 3.5 },
    source: source("product-brain-puzzle-value-native-panel", { role })
  });
  const shapes = [
    panel("efficiency", { x: 184, y: 118, w: 361, h: 208 }, [
      [0, 0], [327, 0], [327, 79], [361, 79], [361, 127], [327, 127],
      [327, 208], [190, 208], [190, 174], [140, 174], [140, 208], [0, 208]
    ], "#1EA270", "efficiency"),
    panel("quality", { x: 511, y: 118, w: 327, h: 242 }, [
      [0, 0], [327, 0], [327, 208], [190, 208], [190, 242], [140, 242], [140, 208],
      [0, 208], [0, 127], [34, 127], [34, 79], [0, 79]
    ], "#ED8516", "quality"),
    panel("standard", { x: 184, y: 291, w: 361, h: 228 }, [
      [140, 0], [190, 0], [190, 34], [327, 34], [327, 80], [361, 80], [361, 127],
      [327, 127], [327, 228], [0, 228], [0, 34], [140, 34]
    ], "#21559E", "standard"),
    panel("knowledge", { x: 511, y: 325, w: 327, h: 194 }, [
      [0, 0], [140, 0], [140, 34], [190, 34], [190, 0], [327, 0], [327, 194],
      [0, 194], [0, 127], [34, 127], [34, 80], [0, 80]
    ], "#1767BE", "knowledge")
  ];

  const makeText = (id, text, box, font, role) => ({
    id: `product-brain-puzzle-value-text-${id}`,
    text,
    box,
    font: {
      family: "Microsoft YaHei",
      sizePt: font.sizePt,
      color: font.color || "#FFFFFF",
      opacity: 1,
      weight: font.weight || "regular",
      align: font.align || "left",
      valign: "middle"
    },
    style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0 },
    source: source("product-brain-puzzle-value-native-text", { role })
  });
  const textBoxes = [
    makeText("title", "核心价值闭环：重塑组织级产品生产力", { x: 178, y: 37, w: 610, h: 42 }, { sizePt: 29, color: "#111111", weight: "bold" }, "title"),
    makeText("efficiency-heading", "效率提升", { x: 278, y: 146, w: 118, h: 31 }, { sizePt: 21, weight: "bold" }, "efficiency-heading"),
    makeText("efficiency-label", "效率提升", { x: 193, y: 184, w: 110, h: 25 }, { sizePt: 16.5, weight: "bold" }, "efficiency-label"),
    makeText("efficiency-body", "减少重复排版与格式整理，让\nPM回归业务判断。", { x: 193, y: 214, w: 268, h: 51 }, { sizePt: 14 }, "efficiency-body"),
    makeText("quality-heading", "质量提升", { x: 586, y: 147, w: 118, h: 31 }, { sizePt: 21, weight: "bold" }, "quality-heading"),
    makeText("quality-label", "质量提升", { x: 521, y: 184, w: 110, h: 25 }, { sizePt: 16.5, weight: "bold" }, "quality-label"),
    makeText("quality-body", "智能评审拦截逻辑缺陷，风险\n前置，减少研发返工。", { x: 521, y: 211, w: 267, h: 54 }, { sizePt: 14 }, "quality-body"),
    makeText("standard-heading", "标准统一", { x: 278, y: 344, w: 118, h: 31 }, { sizePt: 21, weight: "bold" }, "standard-heading"),
    makeText("standard-label", "标准统一", { x: 193, y: 381, w: 110, h: 25 }, { sizePt: 16.5, weight: "bold" }, "standard-label"),
    makeText("standard-body", "统一域仓、目录与交付口径，\n消除部门间协作壁垒。", { x: 193, y: 408, w: 260, h: 54 }, { sizePt: 14 }, "standard-body"),
    makeText("knowledge-heading", "知识沉淀", { x: 585, y: 345, w: 118, h: 31 }, { sizePt: 21, weight: "bold" }, "knowledge-heading"),
    makeText("knowledge-label", "知识沉淀", { x: 503, y: 381, w: 110, h: 25 }, { sizePt: 16.5, weight: "bold" }, "knowledge-label"),
    makeText("knowledge-body", "单次交付自动转化为可检索资产，\n经验脱离个人大脑，归属组织。", { x: 503, y: 408, w: 273, h: 54 }, { sizePt: 14 }, "knowledge-body")
  ];

  const iconRegions = [
    { role: "efficiency", box: { x: 198, y: 128, w: 70, h: 55 } },
    { role: "quality", box: { x: 531, y: 128, w: 62, h: 55 } },
    { role: "standard", box: { x: 198, y: 329, w: 68, h: 50 } },
    { role: "knowledge", box: { x: 526, y: 329, w: 68, h: 50 } }
  ];
  ensureDir(options.assetDir);
  const images = iconRegions.map((region, index) => {
    const crop = cropPng(options.sourceImage, ptToPxBox(region.box, options.sourceImage, slideSize, 0));
    const base = safeIdentifier(`${options.deckName || "deck"}-p${String(Number(options.pageIndex || 0) + 1).padStart(2, "0")}-puzzle-${region.role}`, "puzzle-icon");
    const file = path.join(options.assetDir, `${base}.png`);
    writePng(file, crop);
    return {
      id: `product-brain-puzzle-value-icon-${region.role}`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: region.box,
      source: {
        detector: "product-brain-puzzle-value-icon-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: "panel-symbol",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        recommendedAction: "keep-local-crop",
        residualSplitIndex: index,
        residualSplitCount: iconRegions.length,
        nonEditableReason: "source-faithful panel symbol preserved as one minimum visual unit"
      }
    };
  });
  return { shapes, textBoxes, images };
}

function createProductBrainCoreValueHybridObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyProductBrainCoreValueSplit(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
  if (!options.sourceImage || !options.assetDir || !options.irDir) return { shapes: [], textBoxes: [], images: [] };
  const target = (page.images || []).find((item) => item?.source?.detector === "structured-case-graphic-underlay-crop");
  if (!target) return { shapes: [], textBoxes: [], images: [] };
  const images = materializeProductBrainCoreValueHybridCrops(target, slideSize, options);
  if (images.length !== 4) return { shapes: [], textBoxes: [], images: [] };

  target.source = {
    ...(target.source || {}),
    productBrainCoreValueHybridObjectified: true,
    dropErasedResidualAfterNativeRebuild: true,
    skipVisualAtomRebuild: true,
    nonEditableReason: "80/20 product-manager value diagram split into a protected left illustration crop, three source-faithful icon crops, and native editable flow components"
  };
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    confidence: 0.94,
    layerSourceId: target.id || null,
    expressionForm: "hybrid-diagram",
    expressionSubtype: "product-brain-core-value-split",
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const orange = "#DB7C20";
  const green = "#14A866";
  const paleGreen = "#D8F5E5";

  add({ id: "product-brain-core-value-divider", type: "line", box: { x: 480, y: 64, w: 0, h: 447 }, style: { stroke: "#B8B8B8", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("product-brain-core-value-native-divider") });
  addProductBrainAiNativeFlow(add, textBoxes, source, green, paleGreen, { preserveOutputIconCrops: true });
  add({ id: "product-brain-core-value-left-caption", type: "rect", box: { x: 39, y: 451, w: 405, h: 58 }, style: { fill: "#FFFFFF", stroke: "#DBA563", strokeWidthPt: 1.5, radiusPt: 5 }, source: source("product-brain-core-value-native-caption", { side: "traditional" }) });
  add({ id: "product-brain-core-value-right-caption", type: "rect", box: { x: 517, y: 451, w: 405, h: 58 }, style: { fill: "#FFFFFF", stroke: "#2BAE75", strokeWidthPt: 1.5, radiusPt: 5 }, source: source("product-brain-core-value-native-caption", { side: "ai-native" }) });
  textBoxes.push(
    temporaryAnswerWorkflowTextBox("product-brain-core-value-title", "AI时代下，产品经理的核心价值在于“80%思考，20%行动”", { x: 48, y: 24, w: 868, h: 42 }, { family: "Microsoft YaHei", sizePt: 29, color: "#000000", weight: "bold", align: "left" }, source("product-brain-core-value-native-text", { role: "title" })),
    temporaryAnswerWorkflowTextBox("product-brain-core-value-left-caption-text", "传统模式：管理“确定性”，深陷排版与格式\n的重复劳动。", { x: 48, y: 462, w: 382, h: 42 }, { family: "Microsoft YaHei", sizePt: 16, color: "#000000", weight: "bold", align: "left" }, source("product-brain-core-value-native-text", { role: "caption", side: "traditional" })),
    temporaryAnswerWorkflowTextBox("product-brain-core-value-right-caption-text", "AI原生模式：管理“不确定性”，专注需求洞\n察、系统边界与商业落地。", { x: 527, y: 462, w: 382, h: 42 }, { family: "Microsoft YaHei", sizePt: 16, color: "#000000", weight: "bold", align: "left" }, source("product-brain-core-value-native-text", { role: "caption", side: "ai-native" }))
  );
  return { shapes, textBoxes, images };
}

function materializeProductBrainCoreValueHybridCrops(target, slideSize = DEFAULT_SLIDE, options = {}) {
  ensureDir(options.assetDir);
  const cropSpecs = [
    { id: "left-illustration", box: { x: 52, y: 92, w: 396, h: 347 }, subtype: "complex-traditional-workflow-illustration", reason: "complex traditional-mode illustration retained as the minimum source-faithful visual unit" },
    { id: "prompting-icon", box: { x: 824, y: 105, w: 63, h: 48 }, subtype: "chat-cursor-icon", reason: "source icon retained to avoid a lower-fidelity primitive approximation" },
    { id: "document-generation-icon", box: { x: 826, y: 226, w: 60, h: 47 }, subtype: "printer-icon", reason: "source icon retained to avoid a lower-fidelity primitive approximation" },
    { id: "rule-extraction-icon", box: { x: 823, y: 346, w: 68, h: 46 }, subtype: "rule-search-icon", reason: "source icon retained to avoid a lower-fidelity primitive approximation" }
  ];
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-product-brain-core-value`, "product-brain-core-value");
  return cropSpecs.map((spec) => {
    const box = clampPtBoxToSlide(spec.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${spec.id}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${target.id || "product-brain-core-value"}-${spec.id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `product-brain-core-value-${spec.id}-crop`,
        parentDetector: target.source?.detector || null,
        parentImageId: target.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: spec.subtype,
        recommendedAction: "keep-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        skipVisualAtomRebuild: true,
        residualSplit: true,
        residualSplitMode: "product-brain-core-value-hybrid",
        nonEditableReason: spec.reason
      }
    };
  });
}

function createProductBrainCoreValueSplitObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyProductBrainCoreValueSplit(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "structured-case-graphic-underlay-crop");
  if (options.allowNativeApproximation !== true) {
    markProtectedComplexDiagramMinimumUnit(sourceImages, {
      detector: "product-brain-core-value-protected-diagram-crop",
      expressionSubtype: "product-brain-core-value-diagram",
      reason: "complex 80/20 product-manager value diagram kept as a protected visual unit; current native approximation is lower-fidelity than the crop"
    });
    return { shapes: [], textBoxes: [] };
  }
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      productBrainCoreValueSplitObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "product brain core value split diagram"}; rebuilt 80/20 product-manager value diagram as native editable components`
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
  const orange = "#DB7C20";
  const green = "#14A866";
  const paleGreen = "#D8F5E5";

  add({ id: "product-brain-core-value-divider", type: "line", box: { x: 480, y: 64, w: 0, h: 447 }, style: { stroke: "#B8B8B8", strokeWidthPt: 1.2, connectorType: "straight" }, source: source("product-brain-core-value-native-divider") });
  addProductBrainTraditionalChaos(add, textBoxes, source, orange);
  addProductBrainAiNativeFlow(add, textBoxes, source, green, paleGreen);
  add({ id: "product-brain-core-value-left-caption", type: "rect", box: { x: 39, y: 451, w: 405, h: 58 }, style: { fill: "#FFFFFF", stroke: "#DBA563", strokeWidthPt: 1.5, radiusPt: 5 }, source: source("product-brain-core-value-native-caption", { side: "traditional" }) });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-core-value-left-caption-text", "传统模式：管理“确定性”，深陷排版与格式\n的重复劳动。", { x: 48, y: 462, w: 382, h: 42 }, { sizePt: 20, color: "#000000", weight: "bold", align: "left" }, source("product-brain-core-value-native-text", { role: "caption", side: "traditional" })));
  add({ id: "product-brain-core-value-right-caption", type: "rect", box: { x: 517, y: 451, w: 405, h: 58 }, style: { fill: "#FFFFFF", stroke: "#2BAE75", strokeWidthPt: 1.5, radiusPt: 5 }, source: source("product-brain-core-value-native-caption", { side: "ai-native" }) });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-core-value-right-caption-text", "AI原生模式：管理“不确定性”，专注需求洞\n察、系统边界与商业落地。", { x: 527, y: 462, w: 382, h: 42 }, { sizePt: 20, color: "#000000", weight: "bold", align: "left" }, source("product-brain-core-value-native-text", { role: "caption", side: "ai-native" })));
  return { shapes, textBoxes };
}

function shouldObjectifyProductBrainCoreValueSplit(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/(?:AI|A)时代下.*产品经理.*80%思考.*20%行动/.test(labels)) return false;
  return (page.images || []).some((image) => {
    const areaRatio = Number(image.box?.w || 0) * Number(image.box?.h || 0)
      / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    return image?.source?.detector === "structured-case-graphic-underlay-crop" && areaRatio > 0.5;
  });
}

function shouldAutoAllowProductBrainCoreValueNativeApproximation(image = {}) {
  const source = image.source || {};
  const layer = source.layer || {};
  const strategy = source.componentRenderStrategy || layer.componentRenderStrategy || {};
  const mode = String(strategy.mode || "");
  const action = String(layer.recommendedAction || source.recommendedAction || "");
  const visualAtoms = Array.isArray(layer.visualAtoms) ? layer.visualAtoms : [];
  const nativeConfidence = Number(layer.nativeConfidence ?? source.nativeConfidence ?? 0);
  const editBenefit = Number(layer.editBenefit ?? source.editBenefit ?? 0);
  const hasStructureStrategy = /plugin-component-template|native-visual-atom-rebuild|native-matrix/.test(mode)
    || /attempt-native-reconstruction|split-native-with-residual-crop/.test(action);
  const strongVisualEvidence = visualAtoms.length >= 20 || nativeConfidence >= 0.62 || editBenefit >= 0.85;
  return hasStructureStrategy && strongVisualEvidence;
}

function addProductBrainTraditionalChaos(add, textBoxes, source, orange) {
  const center = { x: 250, y: 305 };
  const chaosLines = [
    [76, 327, 335, -128], [99, 202, 286, 54], [147, 390, 265, -228], [128, 438, 250, -85],
    [190, 216, 224, 205], [144, 274, 277, 110], [263, 196, -132, 194], [295, 214, -170, 36],
    [324, 332, -221, -45], [347, 393, -220, 19], [341, 178, 82, 154], [370, 255, -244, 97],
    [234, 440, 168, -80], [180, 152, 170, 183], [60, 278, 335, 146], [250, 380, 146, 70]
  ];
  chaosLines.forEach(([x, y, w, h], index) => {
    add({ id: `product-brain-core-value-chaos-line-${index}`, type: "line", box: { x, y, w, h }, style: { stroke: orange, strokeWidthPt: index % 3 === 0 ? 3.2 : 2.5, opacity: 0.9, connectorType: "straight", lineCap: "round" }, source: source("product-brain-core-value-native-chaos-line", { index }) });
  });
  add({ id: "product-brain-core-value-person-head", type: "ellipse", box: { x: center.x - 32, y: center.y - 92, w: 64, h: 64 }, style: { fill: "#FF8B1C", stroke: orange, strokeWidthPt: 1.2 }, source: source("product-brain-core-value-native-person") });
  add({ id: "product-brain-core-value-person-body", type: "freeform", box: { x: center.x - 60, y: center.y - 35, w: 120, h: 96 }, points: [{ x: center.x - 38, y: center.y - 35 }, { x: center.x + 38, y: center.y - 35 }, { x: center.x + 60, y: center.y + 61 }, { x: center.x - 60, y: center.y + 61 }], style: { fill: "#FF8B1C", stroke: orange, strokeWidthPt: 1.2 }, source: source("product-brain-core-value-native-person") });
  add({ id: "product-brain-core-value-person-left-arm", type: "line", box: { x: center.x - 51, y: center.y - 25, w: -55, h: -52 }, style: { stroke: "#FF8B1C", strokeWidthPt: 18, connectorType: "straight", lineCap: "round" }, source: source("product-brain-core-value-native-person", { part: "arm-left" }) });
  add({ id: "product-brain-core-value-person-right-arm", type: "line", box: { x: center.x + 51, y: center.y - 25, w: 55, h: -54 }, style: { stroke: "#FF8B1C", strokeWidthPt: 18, connectorType: "straight", lineCap: "round" }, source: source("product-brain-core-value-native-person", { part: "arm-right" }) });
  addProductBrainMiniIcon(add, textBoxes, source, { kind: "funnel", label: "漏斗分析", x: 78, y: 120 });
  addProductBrainMiniIcon(add, textBoxes, source, { kind: "prototype", label: "画原型图", x: 342, y: 125 });
  addProductBrainMiniIcon(add, textBoxes, source, { kind: "prototype", label: "画原型图", x: 68, y: 345 });
  addProductBrainMiniIcon(add, textBoxes, source, { kind: "doc", label: "写复盘报告", x: 355, y: 351 });
}

function addProductBrainMiniIcon(add, textBoxes, source, item) {
  const orange = "#DB7C20";
  add({ id: `product-brain-core-value-icon-${item.kind}-${item.x}-${item.y}`, type: "rect", box: { x: item.x, y: item.y, w: 64, h: 44 }, style: { fill: "#FFB260", stroke: orange, strokeWidthPt: 1.8, radiusPt: 4 }, source: source("product-brain-core-value-native-icon", { kind: item.kind }) });
  if (item.kind === "funnel") {
    const cone = { x: item.x + 14, y: item.y + 8, w: 37, h: 34 };
    add({ id: "product-brain-core-value-funnel-cone", type: "freeform", box: cone, points: [{ x: cone.x, y: cone.y }, { x: cone.x + cone.w, y: cone.y }, { x: cone.x + cone.w * 0.62, y: cone.y + cone.h * 0.55 }, { x: cone.x + cone.w * 0.62, y: cone.y + cone.h }, { x: cone.x + cone.w * 0.38, y: cone.y + cone.h }, { x: cone.x + cone.w * 0.38, y: cone.y + cone.h * 0.55 }], style: { fill: "#FFB260", stroke: orange, strokeWidthPt: 1.5 }, source: source("product-brain-core-value-native-icon", { kind: "funnel", part: "cone" }) });
    [0, 1, 2].forEach((index) => add({ id: `product-brain-core-value-funnel-dot-${index}`, type: "ellipse", box: { x: item.x + 15 + index * 18, y: item.y - 12 + (index % 2) * 4, w: 7, h: 7 }, style: { fill: "#FFB260", stroke: orange, strokeWidthPt: 1.2 }, source: source("product-brain-core-value-native-icon", { kind: "funnel", part: "dot", index }) }));
  } else if (item.kind === "doc") {
    add({ id: "product-brain-core-value-doc-fold", type: "triangle", box: { x: item.x + 47, y: item.y, w: 16, h: 16 }, style: { fill: "#FFE3B7", stroke: orange, strokeWidthPt: 1 }, source: source("product-brain-core-value-native-icon", { kind: "doc", part: "fold" }) });
    add({ id: "product-brain-core-value-doc-lens", type: "ellipse", box: { x: item.x + 36, y: item.y + 24, w: 24, h: 24 }, style: { fill: "#FFF4DD", stroke: orange, strokeWidthPt: 2 }, source: source("product-brain-core-value-native-icon", { kind: "doc", part: "lens" }) });
    add({ id: "product-brain-core-value-doc-handle", type: "line", box: { x: item.x + 56, y: item.y + 44, w: 12, h: 10 }, style: { stroke: orange, strokeWidthPt: 3, connectorType: "straight" }, source: source("product-brain-core-value-native-icon", { kind: "doc", part: "handle" }) });
  } else {
    [1, 2].forEach((index) => add({ id: `product-brain-core-value-prototype-h-${item.x}-${index}`, type: "line", box: { x: item.x + 8, y: item.y + 14 + index * 10, w: 48, h: 0 }, style: { stroke: "#8E6B3B", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-core-value-native-icon", { kind: "prototype", axis: "h", index }) }));
    [1, 2].forEach((index) => add({ id: `product-brain-core-value-prototype-v-${item.x}-${index}`, type: "line", box: { x: item.x + 18 + index * 16, y: item.y + 9, w: 0, h: 30 }, style: { stroke: "#8E6B3B", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("product-brain-core-value-native-icon", { kind: "prototype", axis: "v", index }) }));
    add({ id: `product-brain-core-value-pencil-${item.x}`, type: "line", box: { x: item.x + 43, y: item.y + 32, w: 18, h: -20 }, style: { stroke: orange, strokeWidthPt: 5, connectorType: "straight", lineCap: "round" }, source: source("product-brain-core-value-native-icon", { kind: "prototype", part: "pencil" }) });
  }
  textBoxes.push(temporaryAnswerWorkflowTextBox(`product-brain-core-value-icon-label-${item.x}-${item.y}`, item.label, { x: item.x - 12, y: item.y + 55, w: 95, h: 24 }, { sizePt: 17, color: "#111111", weight: "bold", align: "center" }, source("product-brain-core-value-native-text", { role: "icon-label", label: item.label })));
}

function addProductBrainAiNativeFlow(add, textBoxes, source, green, paleGreen, options = {}) {
  const outputs = [
    { label: "Prompting", x: 777, y: 99, icon: "chat" },
    { label: "Document\nGeneration", x: 777, y: 219, icon: "printer" },
    { label: "Rule Extraction", x: 777, y: 338, icon: "rule" }
  ];
  const routes = [
    { id: "stem-up", box: { x: 612, y: 153, w: 0, h: 70 } },
    { id: "top", box: { x: 612, y: 153, w: 165, h: 0 }, endArrow: "triangle" },
    { id: "mid", box: { x: 707, y: 269, w: 70, h: 0 }, endArrow: "triangle" },
    { id: "stem-down", box: { x: 612, y: 317, w: 0, h: 69 } },
    { id: "bottom", box: { x: 612, y: 386, w: 165, h: 0 }, endArrow: "triangle" }
  ];
  routes.forEach((route, index) => {
    add({
      id: `product-brain-core-value-route-${route.id}`,
      type: "line",
      box: route.box,
      style: { stroke: green, strokeWidthPt: 12, connectorType: "straight", ...(route.endArrow ? { endArrow: route.endArrow } : {}) },
      source: source("product-brain-core-value-native-route", { index, route: route.id })
    });
  });
  add({ id: "product-brain-core-value-decision-card", type: "rect", box: { x: 517, y: 223, w: 190, h: 94 }, style: { fill: green, stroke: "#078E54", strokeWidthPt: 2, radiusPt: 7, shadow: { color: "#0BA362", alpha: 0.12, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("product-brain-core-value-native-decision-card") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("product-brain-core-value-decision-text", "决策者/火车头", { x: 529, y: 256, w: 166, h: 28 }, { sizePt: 20, color: "#FFFFFF", weight: "bold", align: "center" }, source("product-brain-core-value-native-text", { role: "decision" })));
  outputs.forEach((card, index) => {
    add({ id: `product-brain-core-value-output-card-${index}`, type: "rect", box: { x: card.x, y: card.y, w: 146, h: 96 }, style: { fill: paleGreen, stroke: "#1DA568", strokeWidthPt: 2, radiusPt: 7 }, source: source("product-brain-core-value-native-output-card", { index, icon: card.icon }) });
    if (options.preserveOutputIconCrops !== true) addProductBrainOutputIcon(add, source, card.icon, card.x + 51, card.y + 18, index);
    textBoxes.push(temporaryAnswerWorkflowTextBox(`product-brain-core-value-output-text-${index}`, card.label, { x: card.x + 13, y: card.y + 58, w: 120, h: 35 }, { sizePt: 14.5, color: "#111111", weight: "regular", align: "center" }, source("product-brain-core-value-native-text", { role: "output", index })));
  });
}

function addProductBrainOutputIcon(add, source, icon, x, y, index) {
  const green = "#139A60";
  if (icon === "chat") {
    add({ id: `product-brain-core-value-chat-${index}`, type: "rect", box: { x, y, w: 44, h: 30 }, style: { fill: "#25B66F", stroke: "#087C49", strokeWidthPt: 1.4, radiusPt: 4 }, source: source("product-brain-core-value-native-output-icon", { icon }) });
    add({ id: `product-brain-core-value-chat-tail-${index}`, type: "triangle", box: { x: x + 11, y: y + 25, w: 16, h: 14 }, style: { fill: "#25B66F", stroke: "#087C49", strokeWidthPt: 1, rotate: 180 }, source: source("product-brain-core-value-native-output-icon", { icon, part: "tail" }) });
    add({ id: `product-brain-core-value-chat-cursor-${index}`, type: "triangle", box: { x: x + 32, y: y + 19, w: 25, h: 32 }, style: { fill: "#087C49", stroke: "#087C49", strokeWidthPt: 1, rotate: 315 }, source: source("product-brain-core-value-native-output-icon", { icon, part: "cursor" }) });
  } else if (icon === "printer") {
    add({ id: `product-brain-core-value-printer-body-${index}`, type: "rect", box: { x: x + 3, y: y + 17, w: 45, h: 27 }, style: { fill: "#22AE6C", stroke: "#087C49", strokeWidthPt: 1.4, radiusPt: 3 }, source: source("product-brain-core-value-native-output-icon", { icon }) });
    add({ id: `product-brain-core-value-printer-paper-${index}`, type: "rect", box: { x: x + 13, y, w: 27, h: 22 }, style: { fill: "#CFF2DF", stroke: "#087C49", strokeWidthPt: 1.2 }, source: source("product-brain-core-value-native-output-icon", { icon, part: "paper" }) });
    add({ id: `product-brain-core-value-printer-out-${index}`, type: "rect", box: { x: x + 13, y: y + 32, w: 27, h: 25 }, style: { fill: "#CFF2DF", stroke: "#087C49", strokeWidthPt: 1.2 }, source: source("product-brain-core-value-native-output-icon", { icon, part: "out" }) });
  } else {
    for (let row = 0; row < 3; row += 1) {
      for (let col = 0; col < 3; col += 1) {
        add({ id: `product-brain-core-value-rule-cell-${index}-${row}-${col}`, type: "rect", box: { x: x + col * 13, y: y + row * 12, w: 10, h: 8 }, style: { fill: "#25B66F", stroke: green, strokeWidthPt: 0.8, radiusPt: 1 }, source: source("product-brain-core-value-native-output-icon", { icon, row, col }) });
      }
    }
    add({ id: `product-brain-core-value-rule-lens-${index}`, type: "ellipse", box: { x: x + 30, y: y + 20, w: 32, h: 32 }, style: { fill: "none", stroke: green, strokeWidthPt: 5 }, source: source("product-brain-core-value-native-output-icon", { icon, part: "lens" }) });
    add({ id: `product-brain-core-value-rule-handle-${index}`, type: "line", box: { x: x + 55, y: y + 46, w: 15, h: 15 }, style: { stroke: green, strokeWidthPt: 5, connectorType: "straight" }, source: source("product-brain-core-value-native-output-icon", { icon, part: "handle" }) });
  }
}

  return {
    createProductBrainAssetClosureFunnelObjects,
    materializeProductBrainAssetClosureFunnelCrops,
    createProductBrainWmsQualityGateObjects,
    shouldObjectifyProductBrainWmsQualityGate,
    createProductBrainSmartReviewRiskGateObjects,
    createProductBrainPuzzleValueLoopObjects,
    createProductBrainCoreValueHybridObjects,
    createProductBrainCoreValueSplitObjects,
    materializeAssetOsFragmentedAssetChainCrops,
    shouldAutoAllowProductBrainCoreValueNativeApproximation
  };
}

module.exports = { createProductBrainSpecializedPagesFactory };
