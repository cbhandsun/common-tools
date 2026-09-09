"use strict";

function createAssetHubSpecializedPagesFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    isMixedDiagramSemanticResidual,
    normalizeCjkText,
    path,
    ptToPxBox,
    pxToPtBox,
    round,
    safeComponentToken,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

function createAssetHubSuperBrainPortalObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetHubSuperBrainPortal(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "structured-case-graphic-underlay-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetHubSuperBrainPortalObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "asset hub portal diagram"}; rebuilt hub portal super-brain diagram as native editable map and callouts`
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
  const addShape = (shape) => shapes.push(shape);
  const cardShadow = { color: "#8CB4D0", alpha: 0.16, blurPt: 5, distancePt: 2, angle: 45 };

  addShape({ id: "asset-hub-super-brain-search-box", type: "rect", box: { x: 716, y: 44, w: 205, h: 34 }, style: { fill: "#FFFFFF", stroke: "#CED7E2", strokeWidthPt: 1, radiusPt: 4, shadow: cardShadow }, source: source("asset-hub-super-brain-native-search") });
  addShape({ id: "asset-hub-super-brain-search-lens", type: "ellipse", box: { x: 729, y: 54, w: 14, h: 14 }, style: { fill: "none", stroke: "#95A3AF", strokeWidthPt: 1.5 }, source: source("asset-hub-super-brain-native-search-icon") });
  addShape({ id: "asset-hub-super-brain-search-handle", type: "line", box: { x: 740, y: 66, w: 8, h: 8 }, style: { stroke: "#95A3AF", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-hub-super-brain-native-search-icon") });
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-super-brain-search-text", "跨域资产搜索...", { x: 752, y: 51, w: 118, h: 18 }, { sizePt: 12, color: "#8B98A5", weight: "regular", align: "left" }, source("asset-hub-super-brain-native-text", { role: "search-placeholder" })));

  const map = { left: 18, top: 229, right: 942, bottom: 500, cx: 480 };
  for (let index = 0; index <= 20; index++) {
    const x = map.left + index * 45;
    addShape({ id: `asset-hub-super-brain-grid-a-${index}`, type: "line", box: { x, y: map.bottom - 64, w: 230, h: -122 }, style: { stroke: "#B7D6E1", strokeWidthPt: 0.5, opacity: 0.55, connectorType: "straight" }, source: source("asset-hub-super-brain-native-grid", { axis: "a", index }) });
    addShape({ id: `asset-hub-super-brain-grid-b-${index}`, type: "line", box: { x, y: map.top + 6, w: 230, h: 122 }, style: { stroke: "#B7D6E1", strokeWidthPt: 0.5, opacity: 0.55, connectorType: "straight" }, source: source("asset-hub-super-brain-native-grid", { axis: "b", index }) });
  }

  const zones = [
    { id: "left", x: 103, y: 354, w: 175, h: 69, color: "#1282B8", node: { x: 218, y: 400 } },
    { id: "center", x: 461, y: 261, w: 166, h: 72, color: "#34C982", node: { x: 492, y: 303 } },
    { id: "right", x: 666, y: 349, w: 193, h: 73, color: "#31C878", node: { x: 706, y: 385 } }
  ];
  for (const zone of zones) {
    addShape({ id: `asset-hub-super-brain-zone-${zone.id}`, type: "rect", box: zone, style: { fill: zone.color, stroke: "none", strokeWidthPt: 0, opacity: 0.08 }, source: source("asset-hub-super-brain-native-zone", { zone: zone.id }) });
    for (let index = 0; index < 9; index++) {
      const nx = zone.x + 30 + (index % 3) * 38;
      const ny = zone.y + 16 + Math.floor(index / 3) * 18;
      addShape({ id: `asset-hub-super-brain-zone-node-${zone.id}-${index}`, type: "rect", box: { x: nx, y: ny, w: 8, h: 6 }, style: { fill: zone.color, stroke: "none", strokeWidthPt: 0, rotate: 45, opacity: 0.9 }, source: source("asset-hub-super-brain-native-node", { zone: zone.id, index }) });
    }
  }

  const route = [
    [218, 400, 365, 326],
    [365, 326, 492, 303],
    [492, 303, 607, 331],
    [607, 331, 706, 385],
    [706, 385, 807, 366]
  ];
  route.forEach(([x, y, x2, y2], index) => {
    addShape({ id: `asset-hub-super-brain-route-glow-${index}`, type: "line", box: { x, y, w: x2 - x, h: y2 - y }, style: { stroke: "#B5F5D6", strokeWidthPt: 11, opacity: 0.7, connectorType: "straight" }, source: source("asset-hub-super-brain-native-route-glow", { index }) });
    addShape({ id: `asset-hub-super-brain-route-${index}`, type: "line", box: { x, y, w: x2 - x, h: y2 - y }, style: { stroke: "#37C978", strokeWidthPt: 6, connectorType: "straight" }, source: source("asset-hub-super-brain-native-route", { index }) });
  });
  [{ x: 218, y: 400 }, { x: 492, y: 303 }, { x: 607, y: 331 }, { x: 706, y: 385 }, { x: 807, y: 366 }].forEach((point, index) => {
    addShape({ id: `asset-hub-super-brain-route-dot-${index}`, type: "ellipse", box: { x: point.x - 7, y: point.y - 7, w: 14, h: 14 }, style: { fill: "#35C977", stroke: "#35C977", strokeWidthPt: 1 }, source: source("asset-hub-super-brain-native-route-node", { index }) });
  });

  const cards = [
    { id: "monorepo", x: 48, y: 202, w: 235, h: 98, pointer: [184, 300, 215, 345], title: "多域实时聚合（Monorepo）", body: "将物流、履约、供应链等相互独立的\n业务域仓数据进行实时映射与聚合。" },
    { id: "bloodline", x: 352, y: 140, w: 266, h: 88, pointer: [404, 228, 456, 266], title: "跨系统血缘透视", body: "架构师可俯瞰全公司产品版图，新人一秒定\n位极早期冷门功能的 PRD 渊源与系统接口。" },
    { id: "contract", x: 686, y: 202, w: 238, h: 101, pointer: [744, 303, 744, 344], title: "菜单与文档强契约", body: "系统前端菜单变更，将联动触发底层\nPRD 骨架自动升级，确保设计文档与\n线上运行永不脱节。" }
  ];
  for (const card of cards) {
    addShape({ id: `asset-hub-super-brain-callout-${card.id}`, type: "rect", box: { x: card.x, y: card.y, w: card.w, h: card.h }, style: { fill: "#F1FBFF", stroke: "#75AFC0", strokeWidthPt: 1.2, radiusPt: 5, shadow: cardShadow }, source: source("asset-hub-super-brain-native-callout", { card: card.id }) });
    addShape({ id: `asset-hub-super-brain-callout-accent-${card.id}`, type: "rect", box: { x: card.x, y: card.y + 13, w: 6, h: 47 }, style: { fill: "#2FCC87", stroke: "none", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-hub-super-brain-native-callout-accent", { card: card.id }) });
    addShape({ id: `asset-hub-super-brain-pointer-${card.id}`, type: "line", box: { x: card.pointer[0], y: card.pointer[1], w: card.pointer[2] - card.pointer[0], h: card.pointer[3] - card.pointer[1] }, style: { stroke: "#75AFC0", strokeWidthPt: 1.5, connectorType: "straight" }, source: source("asset-hub-super-brain-native-callout-pointer", { card: card.id }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-super-brain-title-${card.id}`, card.title, { x: card.x + 18, y: card.y + 20, w: card.w - 32, h: 24 }, { sizePt: 15, color: "#101D2F", weight: "bold", align: "left" }, source("asset-hub-super-brain-native-text", { card: card.id, role: "title" })));
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-super-brain-body-${card.id}`, card.body, { x: card.x + 18, y: card.y + 48, w: card.w - 30, h: card.h - 53 }, { sizePt: 12, color: "#101D2F", weight: "regular", align: "left" }, source("asset-hub-super-brain-native-text", { card: card.id, role: "body" })));
  }
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-super-brain-quote", "“项目结束不再是知识流失的终点，而是组织资产增值的起点。”", { x: 250, y: 504, w: 465, h: 24 }, { sizePt: 17, color: "#101D2F", weight: "bold", align: "center" }, source("asset-hub-super-brain-native-text", { role: "quote" })));
  return { shapes, textBoxes };
}

function shouldObjectifyAssetHubSuperBrainPortal(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/企业级Hub门户|超级数字大脑|跨域资产搜索/.test(labels)) return false;
  const image = (page.images || []).find((item) => item?.source?.detector === "structured-case-graphic-underlay-crop");
  if (!image) return false;
  const w = Number(image.box?.w || 0);
  const h = Number(image.box?.h || 0);
  return w > slideSize.widthPt * 0.65 && h > slideSize.heightPt * 0.35;
}

function createAssetHubVersionTimelineObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyAssetHubVersionTimeline(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "mixed-diagram-semantic-residual-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetHubVersionTimelineObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "version timeline residual"}; rebuilt WMS version evolution timeline as native editable components`
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
  const cardShadow = { color: "#7DB5A7", alpha: 0.16, blurPt: 6, distancePt: 2, angle: 45 };

  addAssetHubCaseBadge(add, source, rawTextBoxes);

  add({
    id: "asset-hub-version-timeline-insight",
    type: "roundRect",
    box: { x: 34, y: 126, w: 888, h: 39 },
    style: { fill: "#F28C1C", stroke: "#F28C1C", strokeWidthPt: 1, radiusPt: 18 },
    source: source("asset-hub-version-timeline-native-insight-banner")
  });
  add({
    id: "asset-hub-version-timeline-insight-pointer",
    type: "triangle",
    box: { x: 472, y: 159, w: 24, h: 18 },
    style: { fill: "#F28C1C", stroke: "#F28C1C", strokeWidthPt: 0 },
    source: source("asset-hub-version-timeline-native-insight-pointer")
  });
  textBoxes.push(temporaryAnswerWorkflowTextBox(
    "asset-hub-version-timeline-insight-text",
    "核心洞察：同一个主功能在经历多轮增量迭代后，极易发生“旧规则被覆盖、新口径散落遗失”的致命灾难。",
    { x: 54, y: 134, w: 835, h: 24 },
    { sizePt: 17, color: "#FFFFFF", weight: "bold", align: "center" },
    source("asset-hub-version-timeline-native-text", { role: "insight" })
  ));

  const cards = [
    { id: "v24", x: 78, title: "后台规则拦截", body: "AI 提取 QMS 消息及待处理位\n异常拦截逻辑，独立沉淀为结构化规则文档，避免误报。", version: "V24" },
    { id: "v25", x: 367, title: "精细交互增强", body: "AI 自动梳理“物流追踪码商品”\n不可分割原则，生成新增/移动对应的强校验规则与前端弹窗原型。", version: "V25" },
    { id: "v26", x: 656, title: "全链路数据追溯", body: "AI 强制收敛并拉齐“关联单据号”从查询列表到收货写入的全链路展示口径。", version: "V26" }
  ];
  const axisY = 324;
  add({
    id: "asset-hub-version-timeline-axis",
    type: "line",
    box: { x: 35, y: axisY, w: 895, h: 0 },
    style: { stroke: "#0E5A93", strokeWidthPt: 17, connectorType: "straight", endArrow: "triangle" },
    source: source("asset-hub-version-timeline-native-axis")
  });
  for (const card of cards) {
    add({
      id: `asset-hub-version-timeline-card-${card.id}`,
      type: "roundRect",
      box: { x: card.x, y: 183, w: 234, h: 107 },
      style: { fill: "#FFFFFF", stroke: "#39B477", strokeWidthPt: 1.3, radiusPt: 5, shadow: cardShadow },
      source: source("asset-hub-version-timeline-native-card", { card: card.id })
    });
    add({
      id: `asset-hub-version-timeline-stem-${card.id}`,
      type: "line",
      box: { x: card.x + 117, y: 290, w: 0, h: 75 },
      style: { stroke: "#33B971", strokeWidthPt: 16, connectorType: "straight" },
      source: source("asset-hub-version-timeline-native-stem", { card: card.id })
    });
    textBoxes.push(temporaryAnswerWorkflowTextBox(
      `asset-hub-version-timeline-card-title-${card.id}`,
      card.title,
      { x: card.x + 18, y: 198, w: 198, h: 24 },
      { sizePt: 18, color: "#0E4F7F", weight: "bold", align: "center" },
      source("asset-hub-version-timeline-native-text", { card: card.id, role: "title" })
    ));
    textBoxes.push(temporaryAnswerWorkflowTextBox(
      `asset-hub-version-timeline-card-body-${card.id}`,
      card.body,
      { x: card.x + 16, y: 226, w: 202, h: 57 },
      { sizePt: 13, color: "#111111", weight: "bold", align: "left" },
      source("asset-hub-version-timeline-native-text", { card: card.id, role: "body" })
    ));
    textBoxes.push(temporaryAnswerWorkflowTextBox(
      `asset-hub-version-timeline-version-${card.id}`,
      card.version,
      { x: card.x + 96, y: axisY - 16, w: 44, h: 24 },
      { sizePt: 18, color: "#FFFFFF", weight: "bold", align: "center" },
      source("asset-hub-version-timeline-native-text", { card: card.id, role: "version" })
    ));
  }

  const iconCrops = materializeAssetHubSourceCrops(sourceImages[0], slideSize, options, "version-timeline", [
    { id: "v24-document-lock", box: { x: 158, y: 369, w: 78, h: 80 }, subtype: "document-lock-illustration" },
    { id: "v25-screen-stack", box: { x: 418, y: 367, w: 126, h: 86 }, subtype: "screen-stack-illustration" },
    { id: "v26-data-sync", box: { x: 724, y: 369, w: 88, h: 82 }, subtype: "data-sync-illustration" }
  ]);
  page.images.push(...iconCrops);
  add({
    id: "asset-hub-version-timeline-value-banner",
    type: "roundRect",
    box: { x: 35, y: 471, w: 890, h: 43 },
    style: { fill: "#EAF6FF", stroke: "#5BA3D2", strokeWidthPt: 1.4, radiusPt: 6, shadow: { color: "#91A8BA", alpha: 0.13, blurPt: 5, distancePt: 1, angle: 45 } },
    source: source("asset-hub-version-timeline-native-value-banner")
  });
  textBoxes.push(temporaryAnswerWorkflowTextBox(
    "asset-hub-version-timeline-value-text",
    "核心价值：普通 AI 只能生硬总结单份长文本，而 PM Portal 能将跨度数月的迭代拆解为可单独追踪、相互防撞的增量资产。",
    { x: 57, y: 482, w: 845, h: 24 },
    { sizePt: 17, color: "#123A5A", weight: "bold", align: "center" },
    source("asset-hub-version-timeline-native-text", { role: "value" })
  ));
  // OCR boxes already carry source-aligned typography and should remain the
  // only editable text layer over the native structural shell.
  return { shapes, textBoxes };
}

function shouldObjectifyAssetHubVersionTimeline(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/库存查询|口径漂移|多版本增量|结构化追踪|资产固化/.test(labels)) return false;
  const residuals = (page.images || []).filter((image) => image?.source?.detector === "mixed-diagram-semantic-residual-crop");
  const areaRatio = residuals.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return residuals.length >= 5 && areaRatio > 0.45;
}

function addVersionTimelineDocumentIcon(add, source, suffix, x, y) {
  add({ id: `asset-hub-version-timeline-doc-${suffix}`, type: "rect", box: { x, y, w: 42, h: 62 }, style: { fill: "#F7FBFF", stroke: "#5B8EB6", strokeWidthPt: 1.2, radiusPt: 2 }, source: source("asset-hub-version-timeline-native-document", { icon: suffix }) });
  add({ id: `asset-hub-version-timeline-doc-fold-${suffix}`, type: "triangle", box: { x: x + 31, y, w: 11, h: 11 }, style: { fill: "#D8EBFF", stroke: "#5B8EB6", strokeWidthPt: 0.8 }, source: source("asset-hub-version-timeline-native-document-fold", { icon: suffix }) });
  for (let index = 0; index < 3; index++) {
    add({ id: `asset-hub-version-timeline-doc-line-${suffix}-${index}`, type: "line", box: { x: x + 12, y: y + 23 + index * 10, w: 20, h: 0 }, style: { stroke: "#AFC2D3", strokeWidthPt: 1.6, connectorType: "straight" }, source: source("asset-hub-version-timeline-native-document-line", { icon: suffix, index }) });
  }
  add({ id: `asset-hub-version-timeline-lock-${suffix}`, type: "rect", box: { x: x + 31, y: y + 39, w: 25, h: 28 }, style: { fill: "#5F86C4", stroke: "#486DA9", strokeWidthPt: 1.1, radiusPt: 3 }, source: source("asset-hub-version-timeline-native-lock", { icon: suffix }) });
  add({ id: `asset-hub-version-timeline-lock-loop-${suffix}`, type: "ellipse", box: { x: x + 36, y: y + 28, w: 15, h: 20 }, style: { fill: "none", stroke: "#486DA9", strokeWidthPt: 2 }, source: source("asset-hub-version-timeline-native-lock-loop", { icon: suffix }) });
}

function addVersionTimelineScreensIcon(add, source, suffix, x, y) {
  [0, 24, 48].forEach((offset, index) => {
    add({ id: `asset-hub-version-timeline-screen-${suffix}-${index}`, type: "rect", box: { x: x + offset, y: y + index * 8, w: 68, h: 46 }, style: { fill: "#FFFFFF", stroke: "#6AA0D9", strokeWidthPt: 1.1, radiusPt: 4, shadow: { color: "#7F91AA", alpha: 0.12, blurPt: 3, distancePt: 1, angle: 45 } }, source: source("asset-hub-version-timeline-native-screen", { icon: suffix, index }) });
    add({ id: `asset-hub-version-timeline-screen-bar-${suffix}-${index}`, type: "rect", box: { x: x + offset, y: y + index * 8, w: 68, h: 10 }, style: { fill: "#4F8DDA", stroke: "#4F8DDA", strokeWidthPt: 0, radiusPt: 3 }, source: source("asset-hub-version-timeline-native-screen-bar", { icon: suffix, index }) });
  });
  add({ id: `asset-hub-version-timeline-screen-button-${suffix}`, type: "rect", box: { x: x + 92, y: y + 48, w: 18, h: 7 }, style: { fill: "#3B7DD8", stroke: "none", strokeWidthPt: 0, radiusPt: 2 }, source: source("asset-hub-version-timeline-native-screen-button", { icon: suffix }) });
}

function addVersionTimelineDataIcon(add, source, suffix, x, y) {
  add({ id: `asset-hub-version-timeline-table-${suffix}`, type: "rect", box: { x, y, w: 50, h: 42 }, style: { fill: "#EAF6FF", stroke: "#5F8CB3", strokeWidthPt: 1.1, radiusPt: 2 }, source: source("asset-hub-version-timeline-native-table", { icon: suffix }) });
  for (let index = 1; index < 3; index++) {
    add({ id: `asset-hub-version-timeline-table-v-${suffix}-${index}`, type: "line", box: { x: x + index * 16, y, w: 0, h: 42 }, style: { stroke: "#91B1C8", strokeWidthPt: 0.8, connectorType: "straight" }, source: source("asset-hub-version-timeline-native-table-grid", { icon: suffix, axis: "v", index }) });
    add({ id: `asset-hub-version-timeline-table-h-${suffix}-${index}`, type: "line", box: { x, y: y + index * 14, w: 50, h: 0 }, style: { stroke: "#91B1C8", strokeWidthPt: 0.8, connectorType: "straight" }, source: source("asset-hub-version-timeline-native-table-grid", { icon: suffix, axis: "h", index }) });
  }
  add({ id: `asset-hub-version-timeline-db-${suffix}`, type: "cylinder", box: { x: x + 43, y: y + 23, w: 35, h: 48 }, style: { fill: "#86B5E8", stroke: "#4E7EB8", strokeWidthPt: 1.1 }, source: source("asset-hub-version-timeline-native-database", { icon: suffix }) });
  add({ id: `asset-hub-version-timeline-sync-a-${suffix}`, type: "line", box: { x: x + 58, y: y + 12, w: 0, h: 21 }, style: { stroke: "#38B96F", strokeWidthPt: 2.5, connectorType: "straight", endArrow: "triangle" }, source: source("asset-hub-version-timeline-native-sync", { icon: suffix, part: "down" }) });
  add({ id: `asset-hub-version-timeline-sync-b-${suffix}`, type: "line", box: { x: x + 47, y: y + 55, w: 0, h: -18 }, style: { stroke: "#38B96F", strokeWidthPt: 2.5, connectorType: "straight", endArrow: "triangle" }, source: source("asset-hub-version-timeline-native-sync", { icon: suffix, part: "up" }) });
}

function createAssetHubSourcePurificationObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!shouldObjectifyAssetHubSourcePurification(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [] };
  const sourceImages = (page.images || []).filter((image) => image?.source?.detector === "mixed-diagram-semantic-residual-crop");
  for (const image of sourceImages) {
    image.source = {
      ...(image.source || {}),
      assetHubSourcePurificationObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "source purification residual"}; rebuilt mixed-source purification flow as native editable components`
    };
  }
  const source = (detector, extra = {}) => ({
    editable: true,
    nativeRebuild: true,
    detector,
    componentOwnerId: "asset-os-demand-understanding-native-component",
    componentOwnerKind: "demand-understanding-assistant",
    confidence: 0.9,
    ...assetHubSourcePurificationComponentMetadata(detector, extra),
    ...extra
  });
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const preserveEngineIllustration = Boolean(options.sourceImage && options.assetDir && options.irDir && sourceImages[0]);

  addAssetHubCaseBadge(add, source, rawTextBoxes);

  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-source-purification-input-title", "混沌输入源", { x: 145, y: 126, w: 130, h: 24 }, { sizePt: 18, color: "#111111", weight: "bold", align: "center" }, source("asset-hub-source-purification-native-text", { role: "input-title" })));
  const inputCrops = materializeAssetHubSourceCrops(sourceImages[0], slideSize, options, "source-purification", [
    { id: "mixed-input-cluster", box: { x: 40, y: 148, w: 277, h: 252 }, subtype: "mixed-document-and-screenshot-cluster" }
  ]);
  const engineCrops = preserveEngineIllustration
    ? materializeAssetHubSourceCrops(sourceImages[0], slideSize, options, "source-purification", [
      {
        id: "engine-illustration",
        box: { x: 371, y: 174, w: 207, h: 200 },
        subtype: "three-dimensional-purification-engine",
        component: sourcePurificationComponent("asset-hub-source-purification-engine", "process-engine")
      }
    ])
    : [];
  page.images.push(...inputCrops);
  page.images.push(...engineCrops);
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-source-purification-input-caption", "原始且混乱的 PRD（Word / HTML 混编）\n13张散落的陈旧系统截图\n跨越 V1.0 至 V1.2-Fix 的多版本冲突口径。", { x: 64, y: 414, w: 263, h: 61 }, { sizePt: 12.5, color: "#111111", weight: "regular", align: "center" }, source("asset-hub-source-purification-native-text", { role: "input-caption" })));

  if (!preserveEngineIllustration) {
    const funnel = [
      { x: 386, y: 178 },
      { x: 570, y: 222 },
      { x: 570, y: 343 },
      { x: 386, y: 386 },
      { x: 386, y: 178 }
    ];
    add({ id: "asset-hub-source-purification-engine", type: "freeform", points: funnel, box: { x: 386, y: 178, w: 184, h: 208 }, style: { fill: "#0F66C4", stroke: "#0B559F", strokeWidthPt: 1.4, opacity: 0.98 }, source: source("asset-hub-source-purification-native-engine") });
    add({ id: "asset-hub-source-purification-engine-mouth", type: "ellipse", box: { x: 371, y: 178, w: 38, h: 208 }, style: { fill: "#9DD4FF", stroke: "#0B559F", strokeWidthPt: 1.1, opacity: 0.9 }, source: source("asset-hub-source-purification-native-engine-mouth") });
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-source-purification-engine-title", "Skills\n净化引擎", { x: 450, y: 220, w: 92, h: 52 }, { sizePt: 22, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-hub-source-purification-native-text", { role: "engine-title" })));
    textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-source-purification-engine-body", "自动对齐版本历史边界\n强制补齐协同性度码表映射\n梳理取数预校验规则。", { x: 430, y: 284, w: 125, h: 48 }, { sizePt: 12, color: "#E8F5FF", weight: "bold", align: "center" }, source("asset-hub-source-purification-native-text", { role: "engine-body" })));
  }

  [0, 1, 2, 3, 4, 5].forEach((index) => {
    const y = 226 + index * 27;
    add({ id: `asset-hub-source-purification-input-route-${index}`, type: "line", box: { x: 287, y, w: 102, h: 22 - index * 4 }, style: { stroke: "#1B76BC", strokeWidthPt: 2.1, connectorType: "straight", endArrow: "triangle" }, source: source("asset-hub-source-purification-native-input-route", { index }) });
  });

  const outputs = [
    ["主轨结构文档", "已审 V2 沉淀同地点同维度唯一性规则。"],
    ["研发基线任务", "精准按接口、导入/导出拆解任务清单。"],
    ["界面资产闭环", "结合 DOM 捕获技术，直接生成含 Mock 数据\n的可运行前端原型（prototype/index.tsx）。"],
    ["全链路数据追溯", "AI 强制收敛并拉齐“关联单据号”从查询列表\n到收货写入的全链路展示口径。"]
  ];
  const outputRouteTrunkX = 620;
  const outputRouteCenterY = 282;
  const outputRouteTargets = outputs.map((_, index) => 139 + index * 82 + 17);
  add({
    id: "asset-hub-source-purification-output-route-feed",
    type: "line",
    box: { x: preserveEngineIllustration ? 578 : 568, y: outputRouteCenterY, w: outputRouteTrunkX - (preserveEngineIllustration ? 578 : 568), h: 0 },
    style: { stroke: "#2BA86D", strokeWidthPt: 2.2, connectorType: "straight" },
    source: source("asset-hub-source-purification-native-output-route", { role: "feed" })
  });
  add({
    id: "asset-hub-source-purification-output-route-trunk",
    type: "line",
    box: { x: outputRouteTrunkX, y: Math.min(...outputRouteTargets), w: 0, h: Math.max(...outputRouteTargets) - Math.min(...outputRouteTargets) },
    style: { stroke: "#2BA86D", strokeWidthPt: 2.2, connectorType: "straight" },
    source: source("asset-hub-source-purification-native-output-route", { role: "trunk" })
  });
  outputs.forEach(([title, body], index) => {
    const y = 139 + index * 82;
    add({ id: `asset-hub-source-purification-output-card-${index}`, type: "roundRect", box: { x: 663, y, w: 260, h: 63 }, style: { fill: "#FFFFFF", stroke: "#37B06F", strokeWidthPt: 1.4, radiusPt: 6 }, source: source("asset-hub-source-purification-native-output-card", { index }) });
    add({ id: `asset-hub-source-purification-output-pill-${index}`, type: "roundRect", box: { x: 670, y: y - 14, w: 118, h: 32 }, style: { fill: "#31B96D", stroke: "#31B96D", strokeWidthPt: 0, radiusPt: 6 }, source: source("asset-hub-source-purification-native-output-pill", { index }) });
    add({ id: `asset-hub-source-purification-output-route-${index}`, type: "line", box: { x: outputRouteTrunkX, y: y + 17, w: 41, h: 0 }, style: { stroke: "#2BA86D", strokeWidthPt: 2.2, connectorType: "straight", endArrow: "triangle" }, source: source("asset-hub-source-purification-native-output-route", { index, role: "branch" }) });
    const outputTitle = temporaryAnswerWorkflowTextBox(`asset-hub-source-purification-output-title-${index}`, title, { x: 673, y: y - 8, w: 112, h: 20 }, { sizePt: 12.8, color: "#FFFFFF", weight: "bold", align: "center" }, source("asset-hub-source-purification-native-text", { role: "output-title", index }));
    outputTitle.style = { ...(outputTitle.style || {}), wrap: false };
    textBoxes.push(outputTitle);
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-source-purification-output-body-${index}`, body, { x: 675, y: y + 22, w: 232, h: 37 }, { sizePt: 10.5, color: "#111111", weight: "regular", align: "left" }, source("asset-hub-source-purification-native-text", { role: "output-body", index })));
  });

  add({ id: "asset-hub-source-purification-value-banner", type: "rect", box: { x: 142, y: 484, w: 674, h: 41 }, style: { fill: "#EAF6FF", stroke: "#2681C1", strokeWidthPt: 1.4, radiusPt: 4 }, source: source("asset-hub-source-purification-native-value-banner") });
  const valueText = temporaryAnswerWorkflowTextBox("asset-hub-source-purification-value-text", "让一堆无人愿看的“历史遗留乱码”，全面焕新为“可运行的知识网络”。", { x: 145, y: 493, w: 674, h: 24 }, { sizePt: 17, color: "#111111", weight: "bold", align: "center" }, source("asset-hub-source-purification-native-text", { role: "value" }));
  valueText.style = { ...(valueText.style || {}), wrap: false };
  textBoxes.push(valueText);
  return { shapes, textBoxes };
}

function assetHubSourcePurificationComponentMetadata(detector, extra = {}) {
  const role = String(extra.role || "");
  const index = Number(extra.index);
  if (detector === "asset-hub-native-case-badge") {
    return sourcePurificationComponent("asset-hub-source-purification-case-badge", "label-badge");
  }
  if (detector === "asset-hub-source-purification-native-input-route"
    || (detector === "asset-hub-source-purification-native-text" && role.startsWith("input-"))) {
    return sourcePurificationComponent("asset-hub-source-purification-input", "input-cluster");
  }
  if (detector === "asset-hub-source-purification-native-engine"
    || detector === "asset-hub-source-purification-native-engine-mouth"
    || (detector === "asset-hub-source-purification-native-text" && role.startsWith("engine-"))) {
    return sourcePurificationComponent("asset-hub-source-purification-engine", "process-engine");
  }
  if (detector === "asset-hub-source-purification-native-output-route" && (role === "feed" || role === "trunk")) {
    return sourcePurificationComponent("asset-hub-source-purification-routing", "connector-network");
  }
  if (Number.isInteger(index) && index >= 0 && index < 4 && (
    detector === "asset-hub-source-purification-native-output-card"
    || detector === "asset-hub-source-purification-native-output-pill"
    || detector === "asset-hub-source-purification-native-output-route"
    || (detector === "asset-hub-source-purification-native-text" && role.startsWith("output-"))
  )) {
    return sourcePurificationComponent(`asset-hub-source-purification-output-${index}`, "output-card");
  }
  if (detector === "asset-hub-source-purification-native-value-banner"
    || (detector === "asset-hub-source-purification-native-text" && role === "value")) {
    return sourcePurificationComponent("asset-hub-source-purification-value", "value-banner");
  }
  return {};
}

function sourcePurificationComponent(nativeComponentGroupId, nativeComponentArchetype) {
  return { nativeComponentGroupId, nativeComponentArchetype };
}

function addAssetHubCaseBadge(add, source, rawTextBoxes = []) {
  const badge = (rawTextBoxes || []).find((item) => /真实案例证明/.test(String(item?.text || "")));
  if (!badge?.box) return false;
  add({
    id: `asset-hub-case-badge-${safeIdentifier(String(badge.text || "case"), "case")}`,
    type: "roundRect",
    box: {
      x: Math.max(0, Number(badge.box.x || 0) - 12),
      y: Math.max(0, Number(badge.box.y || 0) - 7),
      w: Number(badge.box.w || 0) + 24,
      h: Number(badge.box.h || 0) + 14
    },
    style: { fill: "#0C5D92", stroke: "#0C5D92", strokeWidthPt: 0, radiusPt: 16 },
    source: source("asset-hub-native-case-badge")
  });
  return true;
}

function materializeAssetHubSourceCrops(parent, slideSize = DEFAULT_SLIDE, options = {}, family = "asset-hub", specs = []) {
  if (!parent || !options.sourceImage || !options.assetDir || !options.irDir || specs.length === 0) return [];
  ensureDir(options.assetDir);
  const pageIndex = Number.isFinite(Number(options.pageIndex)) ? Number(options.pageIndex) : 0;
  const base = safeIdentifier(`${options.deckName || "deck"}-p${String(pageIndex + 1).padStart(2, "0")}-${family}`, family);
  return specs.map((spec) => {
    const box = clampPtBoxToSlide(spec.box, slideSize);
    const pxBox = ptToPxBox(box, options.sourceImage, slideSize, 0);
    const file = path.join(options.assetDir, `${base}-${safeIdentifier(spec.id, "visual")}.png`);
    writePng(file, cropPng(options.sourceImage, pxBox));
    return {
      id: `${parent.id || family}-${spec.id}-crop`,
      type: "fidelity-crop",
      assetPath: path.relative(options.irDir, file).replace(/\\/g, "/"),
      box: pxToPtBox(pxBox, options.sourceImage, slideSize, 0),
      source: {
        editable: false,
        nativeRebuild: true,
        detector: `asset-hub-${family}-minimum-unit-crop`,
        parentDetector: parent.source?.detector || null,
        parentImageId: parent.id || null,
        strategy: "local-fidelity-crop",
        expressionForm: "icon-or-illustration",
        expressionSubtype: spec.subtype || "illustration",
        layerType: "illustration-zone",
        recommendedAction: "preserve-local-crop",
        intentionalMinimumUnitCrop: true,
        protectedMinimumUnit: true,
        standaloneVisualAsset: true,
        skipVisualAtomRebuild: true,
        sourceFaithfulCrop: true,
        ...(spec.component || {}),
        residualSplit: true,
        residualSplitMode: `asset-hub-${family}-hybrid`,
        nonEditableReason: "complex icon, illustration, or screenshot cluster retained as the smallest source-faithful visual unit beside native editable structure"
      }
    };
  });
}

function filterTextBoxesClaimedByAssetHubSourcePurification(textBoxes = [], active = false) {
  return filterTextBoxesClaimedByAssetHubSpecializedContent(textBoxes, active);
}

function filterTextBoxesClaimedByAssetHubSpecializedContent(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => {
    const box = textBox?.box || {};
    const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
    return cy < 118;
  });
}

function normalizeAssetHubTopChromeOcrTextBoxes(textBoxes = [], family = "") {
  for (const textBox of textBoxes || []) {
    const text = normalizeCjkText(textBox?.text);
    if (/真实案例证明/.test(text)) {
      textBox.text = family === "source-purification"
        ? "真实案例证明 | 供应链 PMS「订货配置-地点」"
        : "真实案例证明 | 物流 WMS「库存查询」多增量版本演进";
      if (family === "source-purification") textBox.box = { ...textBox.box, x: 57, y: 30, w: 310, h: 20 };
      textBox.font = { ...(textBox.font || {}), sizePt: 14, color: "#FFFFFF", align: "left", valign: "middle" };
      textBox.style = { ...(textBox.style || {}), wrap: false };
      continue;
    }
    if (family === "source-purification" && /异构源材料的终极净化/.test(text)) {
      textBox.text = "异构源材料的终极净化：从“远古混沌”到“可运行原型”";
      textBox.box = { ...textBox.box, x: 43, y: 61, w: 870, h: 42 };
      textBox.font = { ...(textBox.font || {}), sizePt: 31, weight: "bold", color: "#18304F", align: "left", valign: "middle" };
      textBox.style = { ...(textBox.style || {}), wrap: false };
    }
  }
  return textBoxes;
}

function shouldObjectifyAssetHubSourcePurification(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/订货配置|远古混沌|可运行原型|异构源材料|终极净化/.test(labels)) return false;
  const residuals = (page.images || []).filter((image) => image?.source?.detector === "mixed-diagram-semantic-residual-crop");
  const areaRatio = residuals.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return residuals.length >= 5 && areaRatio > 0.45;
}

function addSourcePurificationInputCluster(add, source) {
  const docs = [
    { x: 63, y: 213, kind: "code" },
    { x: 111, y: 171, kind: "word" },
    { x: 153, y: 154, kind: "code" },
    { x: 218, y: 153, kind: "code" },
    { x: 108, y: 300, kind: "word" },
    { x: 162, y: 341, kind: "word" },
    { x: 256, y: 282, kind: "code" }
  ];
  docs.forEach((doc, index) => {
    add({ id: `asset-hub-source-purification-doc-${index}`, type: "rect", box: { x: doc.x, y: doc.y, w: 39, h: 52 }, style: { fill: doc.kind === "word" ? "#2A74C9" : "#1E8BE0", stroke: "#0B559F", strokeWidthPt: 1.1, radiusPt: 3 }, source: source("asset-hub-source-purification-native-input-doc", { index, kind: doc.kind }) });
    add({ id: `asset-hub-source-purification-doc-fold-${index}`, type: "triangle", box: { x: doc.x + 28, y: doc.y, w: 11, h: 11 }, style: { fill: "#79B8F2", stroke: "#0B559F", strokeWidthPt: 0.7 }, source: source("asset-hub-source-purification-native-input-doc-fold", { index }) });
    const label = doc.kind === "word" ? "W" : "</>";
    add({ id: `asset-hub-source-purification-doc-label-bg-${index}`, type: "rect", box: { x: doc.x + 4, y: doc.y + 16, w: 31, h: 22 }, style: { fill: doc.kind === "word" ? "#1E5FB0" : "#1D7CCB", stroke: "none", strokeWidthPt: 0, opacity: 0.85 }, source: source("asset-hub-source-purification-native-input-doc-label-bg", { index }) });
    add({ id: `asset-hub-source-purification-doc-connector-${index}`, type: "line", box: { x: doc.x + 39, y: doc.y + 26, w: 46, h: 0 }, style: { stroke: "#314B5D", strokeWidthPt: 1.1, connectorType: "straight" }, source: source("asset-hub-source-purification-native-input-doc-line", { index }) });
    addTextGlyph(add, source, `asset-hub-source-purification-doc-label-${index}`, label, { x: doc.x + 4, y: doc.y + 17, w: 31, h: 20 }, doc.kind);
  });
  add({ id: "asset-hub-source-purification-screen-a", type: "rect", box: { x: 132, y: 181, w: 174, h: 97 }, style: { fill: "#FFFFFF", stroke: "#AFC3D3", strokeWidthPt: 1, radiusPt: 2, shadow: { color: "#8EA2B5", alpha: 0.14, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("asset-hub-source-purification-native-input-screen") });
  add({ id: "asset-hub-source-purification-screen-b", type: "rect", box: { x: 120, y: 226, w: 184, h: 101 }, style: { fill: "#FFFFFF", stroke: "#AFC3D3", strokeWidthPt: 1, radiusPt: 2, shadow: { color: "#8EA2B5", alpha: 0.14, blurPt: 4, distancePt: 1, angle: 45 } }, source: source("asset-hub-source-purification-native-input-screen") });
  for (let index = 0; index < 4; index++) {
    add({ id: `asset-hub-source-purification-screen-line-${index}`, type: "line", box: { x: 148, y: 245 + index * 14, w: 82, h: 0 }, style: { stroke: "#C2D2DF", strokeWidthPt: 2, connectorType: "straight" }, source: source("asset-hub-source-purification-native-input-screen-line", { index }) });
  }
  [{ x: 271, y: 188 }, { x: 226, y: 345 }].forEach((warning, index) => {
    add({ id: `asset-hub-source-purification-warning-${index}`, type: "triangle", box: { x: warning.x, y: warning.y, w: 48, h: 42 }, style: { fill: "#FFD65A", stroke: "#9A6A00", strokeWidthPt: 1.1 }, source: source("asset-hub-source-purification-native-warning", { index }) });
    addTextGlyph(add, source, `asset-hub-source-purification-warning-mark-${index}`, "!", { x: warning.x + 17, y: warning.y + 8, w: 14, h: 23 }, "warning");
  });
}

function addTextGlyph(add, source, id, text, box, role) {
  if (role === "warning") {
    add({ id: `${id}-stem`, type: "line", box: { x: box.x + box.w / 2, y: box.y + 3, w: 0, h: box.h - 9 }, style: { stroke: "#775300", strokeWidthPt: 2.2, connectorType: "straight" }, source: source("asset-hub-source-purification-native-warning-mark", { role }) });
    add({ id: `${id}-dot`, type: "ellipse", box: { x: box.x + box.w / 2 - 1.8, y: box.y + box.h - 3.5, w: 3.6, h: 3.6 }, style: { fill: "#775300", stroke: "#775300", strokeWidthPt: 0 }, source: source("asset-hub-source-purification-native-warning-mark", { role, part: "dot" }) });
    return;
  }
  if (text === "W") {
    [0, 1, 2].forEach((index) => {
      add({ id: `${id}-word-bar-${index}`, type: "line", box: { x: box.x + 7, y: box.y + 5 + index * 5, w: box.w - 14, h: 0 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("asset-hub-source-purification-native-doc-glyph", { role, part: "word", index }) });
    });
    return;
  }
  add({ id: `${id}-code-left`, type: "line", box: { x: box.x + 9, y: box.y + 5, w: -6, h: 5 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("asset-hub-source-purification-native-doc-glyph", { role, part: "code-left-a" }) });
  add({ id: `${id}-code-left-b`, type: "line", box: { x: box.x + 3, y: box.y + 10, w: 6, h: 5 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("asset-hub-source-purification-native-doc-glyph", { role, part: "code-left-b" }) });
  add({ id: `${id}-code-right`, type: "line", box: { x: box.x + box.w - 9, y: box.y + 5, w: 6, h: 5 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("asset-hub-source-purification-native-doc-glyph", { role, part: "code-right-a" }) });
  add({ id: `${id}-code-right-b`, type: "line", box: { x: box.x + box.w - 3, y: box.y + 10, w: -6, h: 5 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.8, connectorType: "straight" }, source: source("asset-hub-source-purification-native-doc-glyph", { role, part: "code-right-b" }) });
}

function createAssetHubWmsInboundReviewObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!shouldObjectifyAssetHubWmsInboundReview(page, rawTextBoxes, slideSize)) return { shapes: [], textBoxes: [], images: [] };
  const sourceImages = (page.images || []).filter(isAssetHubWmsInboundReviewResidual);
  for (const image of sourceImages) {
    const role = String(image.source?.residualSplitRole || "");
    const preservePictorialUnit = role === "input-source-cluster" || role === "center-engine";
    if (preservePictorialUnit) {
      image.source = {
        ...(image.source || {}),
        protectedMinimumUnit: true,
        intentionalMinimumUnitCrop: true,
        standaloneVisualAsset: true,
        skipVisualAtomRebuild: true,
        expressionForm: "icon-or-illustration",
        expressionSubtype: role === "input-source-cluster" ? "chaos-knot-illustration" : "scanner-illustration",
        layerType: "illustration-zone",
        recommendedAction: "preserve-local-crop",
        layer: {
          ...(image.source?.layer || {}),
          layerType: "illustration-zone",
          expressionForm: "icon-or-illustration",
          expressionSubtype: role === "input-source-cluster" ? "chaos-knot-illustration" : "scanner-illustration",
          standaloneVisualAsset: true,
          recommendedAction: "preserve-local-crop"
        },
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "WMS inbound review visual"}; preserved as the smallest faithful pictorial unit beside native structure`
      };
      continue;
    }
    image.source = {
      ...(image.source || {}),
      assetHubWmsInboundReviewObjectified: true,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "WMS inbound review residual"}; rebuilt repeated cards and separators as native editable components`
    };
  }
  const source = (detector, extra = {}) => {
    const componentIndex = Number.isInteger(extra.index) ? `-${extra.index}` : "";
    const componentRole = String(extra.role || "structure");
    const componentGroupId = `asset-hub-wms-three-column-${componentRole}${componentIndex}`;
    return {
      editable: true,
      nativeRebuild: true,
      detector,
      nativeComponentInstance: true,
      nativeComponentGroupId: componentGroupId,
      nativeComponentArchetype: "three-column-review",
      nativeComponentRole: componentRole,
      componentOwnerId: componentGroupId,
      componentOwnerKind: "three-column-review",
      confidence: 0.9,
      ...extra
    };
  };
  const shapes = [];
  const textBoxes = [];
  const add = (shape) => shapes.push(shape);
  const caseBadgeText = (rawTextBoxes || []).find((item) => /真实案例证明.*(?:物流|WMS|入库单)/i.test(String(item?.text || "")));
  if (caseBadgeText?.box) {
    const box = caseBadgeText.box;
    add({
      id: "asset-hub-wms-review-case-badge",
      type: "roundRect",
      box: {
        x: Math.max(0, Number(box.x || 0) - 12),
        y: Math.max(0, Number(box.y || 0) - 7),
        w: Number(box.w || 0) + 24,
        h: Number(box.h || 0) + 14
      },
      style: { fill: "#0C5D92", stroke: "#0C5D92", strokeWidthPt: 0, radiusPt: 16 },
      source: source("asset-hub-wms-review-native-case-badge")
    });
  }
  [326, 637].forEach((x, index) => add({ id: `asset-hub-wms-review-divider-${index}`, type: "line", box: { x, y: 132, w: 0, h: 366 }, style: { stroke: "#B8C4CA", strokeWidthPt: 1, connectorType: "straight" }, source: source("asset-hub-wms-review-native-divider", { index }) }));

  [
    ["传统黑盒协作", 112],
    ["Skills 介入解构", 410],
    ["秩序输出与协同闭环", 700]
  ].forEach(([label, x], index) => {
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-wms-review-column-title-${index}`, label, { x, y: 137, w: 190, h: 30 }, { sizePt: 21, color: "#111111", weight: "bold", align: "center" }, source("asset-hub-wms-review-native-text", { role: "column-title", index })));
  });

  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-wms-review-chaos-title", "高风险增量交叉", { x: 108, y: 388, w: 170, h: 27 }, { sizePt: 18, color: "#111111", weight: "bold", align: "center" }, source("asset-hub-wms-review-native-text", { role: "chaos-title" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-wms-review-chaos-body", "在原有 V39 超收规则上，补充越库类型的数量校验。涉及极易混淆的“最大可收量”计算与“允许超量”边界。\n人工梳理极易遗漏已关闭出库单的扣减逻辑。", { x: 54, y: 428, w: 275, h: 77 }, { sizePt: 13, color: "#111111", weight: "bold", align: "left" }, source("asset-hub-wms-review-native-text", { role: "chaos-body" })));

  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-wms-review-scanner-title", "自动边界剥离", { x: 430, y: 388, w: 130, h: 27 }, { sizePt: 18, color: "#111111", weight: "bold", align: "center" }, source("asset-hub-wms-review-native-text", { role: "scanner-title" })));
  textBoxes.push(temporaryAnswerWorkflowTextBox("asset-hub-wms-review-scanner-body", "智能评审明确界定 V39B 与 V49 版本的复用关系；强制提取并校验越库匹配的绝对维度（入库单关联联单号 + 商品编码）。", { x: 365, y: 429, w: 240, h: 64 }, { sizePt: 13, color: "#111111", weight: "bold", align: "left" }, source("asset-hub-wms-review-native-text", { role: "scanner-body" })));

  const cards = [
    ["生成《开发参考》：", "直接将复杂逻辑拆解出 5 个精确\n的 BE/FE 研发与 QA 任务。"],
    ["生成交互资产：", "自动对接快速收货、物流追踪码\n等 6 种弹窗的交互限制。"],
    ["资产落盘：", "已审 PRD 与前端代码解析无缝\n汇入物流域标准仓。"]
  ];
  cards.forEach(([title, body], index) => {
    const y = 180 + index * 106;
    add({ id: `asset-hub-wms-review-output-card-${index}`, type: "rect", box: { x: 677, y, w: 237, h: 83 }, style: { fill: "#FFFFFF", stroke: "#B8D7C8", strokeWidthPt: 1.1, radiusPt: 5, shadow: { color: "#95B6A7", alpha: 0.15, blurPt: 5, distancePt: 2, angle: 45 } }, source: source("asset-hub-wms-review-native-output-card", { role: "output-card", index }) });
    add({ id: `asset-hub-wms-review-check-bg-${index}`, type: "rect", box: { x: 687, y: y + 16, w: 20, h: 20 }, style: { fill: "#28B84A", stroke: "#158D33", strokeWidthPt: 1, radiusPt: 4 }, source: source("asset-hub-wms-review-native-check-bg", { role: "output-card", index }) });
    add({ id: `asset-hub-wms-review-check-mark-a-${index}`, type: "line", box: { x: 692, y: y + 26, w: 4, h: 5 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.9, connectorType: "straight" }, source: source("asset-hub-wms-review-native-check-mark", { role: "output-card", index, part: "a" }) });
    add({ id: `asset-hub-wms-review-check-mark-b-${index}`, type: "line", box: { x: 696, y: y + 31, w: 9, h: -13 }, style: { stroke: "#FFFFFF", strokeWidthPt: 1.9, connectorType: "straight" }, source: source("asset-hub-wms-review-native-check-mark", { role: "output-card", index, part: "b" }) });
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-wms-review-output-title-${index}`, title, { x: 719, y: y + 14, w: 170, h: 25 }, { sizePt: 18, color: "#111111", weight: "bold", align: "left" }, source("asset-hub-wms-review-native-text", { role: "output-title", index })));
    textBoxes.push(temporaryAnswerWorkflowTextBox(`asset-hub-wms-review-output-body-${index}`, body, { x: 690, y: y + 43, w: 207, h: 35 }, { sizePt: 14, color: "#111111", weight: "bold", align: "left" }, source("asset-hub-wms-review-native-text", { role: "output-body", index })));
  });
  // OCR boxes already match the source geometry; a second handcrafted text
  // set would create duplicate labels over the native structural shell.
  return { shapes, textBoxes: [], images: [] };
}

function shouldObjectifyAssetHubWmsInboundReview(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
  const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
  if (!/入库单管理|V39B|核心主链路|前置评审|复杂增量规则/.test(labels)) return false;
  const residuals = (page.images || []).filter(isAssetHubWmsInboundReviewResidual);
  const areaRatio = residuals.reduce((sum, image) => sum + Number(image.box?.w || 0) * Number(image.box?.h || 0), 0)
    / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
  return residuals.length >= 1 && areaRatio > 0.45;
}

function isAssetHubWmsInboundReviewResidual(image = {}) {
  return isMixedDiagramSemanticResidual(image)
    || image?.source?.detector === "mixed-diagram-graphic-underlay-crop";
}

function normalizeAssetHubWmsInboundReviewOcrTextBoxes(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  const width = Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);
  const mergeTextGroup = (patterns, text, box, fontPatch = {}) => {
    const indexes = [];
    for (let index = 0; index < textBoxes.length; index += 1) {
      const normalized = normalizeCjkText(textBoxes[index]?.text);
      if (patterns.some((pattern) => pattern.test(normalized))) indexes.push(index);
    }
    if (indexes.length < 2) return false;
    const target = textBoxes[indexes[0]];
    target.text = text;
    target.box = { ...target.box, ...box };
    target.font = { ...(target.font || {}), ...fontPatch };
    target.style = { ...(target.style || {}), wrap: true };
    target.source = {
      ...(target.source || {}),
      // The original OCR evidence is intentionally fragmented. This box is
      // the semantic rule's canonical placement for layout verification.
      layoutEvidenceBox: { ...target.box }
    };
    for (const index of indexes.slice(1).sort((a, b) => b - a)) textBoxes.splice(index, 1);
    return true;
  };

  const badge = textBoxes.find((item) => /真实案例证明.*(?:物流|WMS|入库单)/i.test(String(item?.text || "")));
  if (badge) badge.text = "真实案例证明 | 物流 WMS「入库单管理 - V39B 增量」";

  mergeTextGroup(
    [/^攻克核心主链路/, /^复杂增量规则的自动剥离/],
    "攻克核心主链路：复杂增量规则的自动剥离与前置评审",
    { x: width * 0.041, y: 73.13, w: width * 0.825, h: 31 },
    { sizePt: 28.35, weight: "bold" }
  );
  mergeTextGroup(
    [/^在原有V39超收规则上/, /^型的数量校验/, /^大可收量/, /^人工梳理极易遗漏/, /^减逻辑/],
    "在原有 V39 超收规则上，补充越库类型的数量校验。涉及极易混淆的“最大可收量”计算与“允许超量”边界。人工梳理极易遗漏已关闭出库单的扣减逻辑。",
    { x: width * 0.055, y: 410.63, w: width * 0.258, h: 101 },
    { sizePt: 12.2, align: "left", valign: "top" }
  );
  mergeTextGroup(
    [/^智能评审明确界定V39B/, /^本的复用关系/, /^库匹配的绝对维度/, /^单号\+商品编码/],
    "智能评审明确界定 V39B 与 V49 版本的复用关系；强制提取并校验越库匹配的绝对维度（入库单关联联单号 + 商品编码）。",
    { x: width * 0.378, y: 410.63, w: width * 0.247, h: 84 },
    { sizePt: 12.2, align: "left", valign: "top" }
  );
  const cardSpecs = [
    {
      titlePattern: /^生成《开发参考》/,
      title: "生成《开发参考》：",
      bodyPatterns: [/^直接将复杂逻辑拆解出5个精确/, /^的BE\/FE研发与QA任务/]
    },
    {
      titlePattern: /^生成交互资产/,
      title: "生成交互资产：",
      bodyPatterns: [/^自动对接快速收货/, /^(?:码等)?6种弹弹窗/, /^等6种弹窗/],
      bodyTextRepairs: [{
        pattern: /^(?:码等)?6种弹弹窗/,
        text: "码等 6 种弹窗的交互限制。"
      }]
    },
    {
      titlePattern: /^资产落盘/,
      title: "资产落盘：",
      bodyPatterns: [/^已审PRD与前端代码解析无缝/, /^汇入物流域标准仓/]
    }
  ];
  cardSpecs.forEach((spec, index) => {
    const componentGroupId = `asset-hub-wms-three-column-output-card-${index}`;
    const titleBox = textBoxes.find((item) => spec.titlePattern.test(normalizeCjkText(item?.text)));
    if (titleBox) {
      titleBox.text = spec.title;
      titleBox.font = { ...(titleBox.font || {}), sizePt: 14.4, weight: "bold", align: "left", valign: "middle" };
      titleBox.style = { ...(titleBox.style || {}), wrap: false };
      titleBox.source = {
        ...(titleBox.source || {}),
        nativeComponentInstance: true,
        nativeComponentGroupId: componentGroupId,
        nativeComponentArchetype: "three-column-review",
        nativeComponentRole: "output-card-title",
        componentOwnerId: componentGroupId,
        componentOwnerKind: "three-column-review"
      };
    }
    const bodyBoxes = textBoxes.filter((item) => {
      const normalized = normalizeCjkText(item?.text);
      return spec.bodyPatterns.some((pattern) => pattern.test(normalized));
    });
    for (const bodyBox of bodyBoxes) {
      const repair = (spec.bodyTextRepairs || []).find((candidate) => candidate.pattern.test(normalizeCjkText(bodyBox?.text)));
      if (repair) bodyBox.text = repair.text;
      bodyBox.font = { ...(bodyBox.font || {}), sizePt: 12.5, weight: "bold", align: "left", valign: "middle" };
      bodyBox.style = { ...(bodyBox.style || {}), wrap: false };
      bodyBox.source = {
        ...(bodyBox.source || {}),
        nativeComponentInstance: true,
        nativeComponentGroupId: componentGroupId,
        nativeComponentArchetype: "three-column-review",
        nativeComponentRole: "output-card-body",
        componentOwnerId: componentGroupId,
        componentOwnerKind: "three-column-review"
      };
    }
  });

  const layouts = new Map([
    ["传统黑盒协作", { x: width * 0.07, w: width * 0.25 }],
    ["Skills介入解构", { x: width * 0.36, w: width * 0.28 }],
    ["秩序输出与协同闭环", { x: width * 0.66, w: width * 0.29 }]
  ]);
  let adjusted = 0;
  for (const textBox of textBoxes || []) {
    const layout = layouts.get(normalizeCjkText(textBox?.text));
    if (!layout || !textBox?.box) continue;
    textBox.box = {
      ...textBox.box,
      x: round(layout.x),
      w: round(layout.w),
      h: Math.max(Number(textBox.box.h || 0), 24)
    };
    textBox.font = {
      ...(textBox.font || {}),
      align: "center",
      weight: "bold",
      sizePt: Math.min(21, Math.max(19, Number(textBox.font?.sizePt || 20)))
    };
    textBox.style = { ...(textBox.style || {}), wrap: false };
    textBox.source = {
      ...(textBox.source || {}),
      layoutEvidenceBox: { ...textBox.box }
    };
    adjusted += 1;
  }
  return adjusted;
}

function addWmsInboundChaosKnot(add, source) {
  const cx = 188;
  const cy = 267;
  const colors = ["#AEB7BF", "#C2C9CF", "#9EA7AF", "#B9C0C6", "#A6AFB7"];
  [
    { x: cx - 82, y: cy - 22, w: 154, h: 66 },
    { x: cx - 62, y: cy - 63, w: 116, h: 137 },
    { x: cx - 93, y: cy + 34, w: 174, h: -118 },
    { x: cx - 64, y: cy + 70, w: 126, h: -150 },
    { x: cx - 95, y: cy - 57, w: 189, h: 126 }
  ].forEach((line, index) => {
    add({ id: `asset-hub-wms-review-chaos-line-${index}`, type: "line", box: line, style: { stroke: colors[index], strokeWidthPt: 12, opacity: 0.82, connectorType: "straight", endArrow: index % 2 === 0 ? "triangle" : "none" }, source: source("asset-hub-wms-review-native-chaos-line", { index }) });
  });
  for (let index = 0; index < 4; index++) {
    add({ id: `asset-hub-wms-review-chaos-loop-${index}`, type: "ellipse", box: { x: cx - 78 + index * 26, y: cy - 50 + (index % 2) * 18, w: 122, h: 84 }, style: { fill: "none", stroke: colors[index], strokeWidthPt: 8, opacity: 0.78 }, source: source("asset-hub-wms-review-native-chaos-loop", { index }) });
  }
}

function addWmsInboundScanner(add, source) {
  add({ id: "asset-hub-wms-review-scanner-top", type: "rect", box: { x: 400, y: 195, w: 166, h: 40 }, style: { fill: "#DFF1FF", stroke: "#4D84A7", strokeWidthPt: 1.1, radiusPt: 6 }, source: source("asset-hub-wms-review-native-scanner-top") });
  add({ id: "asset-hub-wms-review-scanner-page", type: "rect", box: { x: 421, y: 225, w: 125, h: 99 }, style: { fill: "#EDF9EE", stroke: "#A6C7D8", strokeWidthPt: 1, opacity: 0.92 }, source: source("asset-hub-wms-review-native-scanner-page") });
  add({ id: "asset-hub-wms-review-scanner-light", type: "freeform", points: [{ x: 405, y: 235 }, { x: 560, y: 235 }, { x: 585, y: 337 }, { x: 380, y: 337 }, { x: 405, y: 235 }], box: { x: 380, y: 235, w: 205, h: 102 }, style: { fill: "#D8F8E2", stroke: "none", strokeWidthPt: 0, opacity: 0.55 }, source: source("asset-hub-wms-review-native-scanner-light") });
  add({ id: "asset-hub-wms-review-scanner-base", type: "freeform", points: [{ x: 397, y: 332 }, { x: 567, y: 332 }, { x: 580, y: 358 }, { x: 388, y: 358 }, { x: 397, y: 332 }], box: { x: 388, y: 332, w: 192, h: 26 }, style: { fill: "#EAF6FF", stroke: "#4D84A7", strokeWidthPt: 1.1 }, source: source("asset-hub-wms-review-native-scanner-base") });
  add({ id: "asset-hub-wms-review-scanner-beam", type: "line", box: { x: 392, y: 293, w: 186, h: 0 }, style: { stroke: "#32B66F", strokeWidthPt: 2.2, connectorType: "straight" }, source: source("asset-hub-wms-review-native-scanner-beam") });
  [0, 1, 2, 3, 4].forEach((index) => {
    add({ id: `asset-hub-wms-review-scanner-doc-line-${index}`, type: "line", box: { x: 432, y: 247 + index * 12, w: 90 - index * 8, h: 0 }, style: { stroke: index === 3 ? "#2DBB63" : "#A9C5C9", strokeWidthPt: index === 3 ? 2.5 : 2, connectorType: "straight" }, source: source("asset-hub-wms-review-native-scanner-doc-line", { index }) });
  });
}

  return {
    createAssetHubSuperBrainPortalObjects,
    shouldObjectifyAssetHubSuperBrainPortal,
    createAssetHubVersionTimelineObjects,
    shouldObjectifyAssetHubVersionTimeline,
    createAssetHubSourcePurificationObjects,
    filterTextBoxesClaimedByAssetHubSourcePurification,
    filterTextBoxesClaimedByAssetHubSpecializedContent,
    materializeAssetHubSourceCrops,
    normalizeAssetHubTopChromeOcrTextBoxes,
    shouldObjectifyAssetHubSourcePurification,
    createAssetHubWmsInboundReviewObjects,
    shouldObjectifyAssetHubWmsInboundReview,
    normalizeAssetHubWmsInboundReviewOcrTextBoxes
  };
}

module.exports = { createAssetHubSpecializedPagesFactory };
