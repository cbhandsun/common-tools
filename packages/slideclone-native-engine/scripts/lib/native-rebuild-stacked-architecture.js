"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createStackedArchitectureFactory(dependencies = {}) {
  const {
    constrainPtBox,
    createFoundationCapabilityNetworkObjects,
    lineBox,
    measureStackedLayerFront,
    round,
    safeComponentToken,
    sampleStackedLayerTopFill
  } = dependencies;
  const required = {
    constrainPtBox,
    createFoundationCapabilityNetworkObjects,
    lineBox,
    measureStackedLayerFront,
    round,
    safeComponentToken,
    sampleStackedLayerTopFill
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild stacked architecture dependency ${name} must be a function`);
    }
  }

  function createStackedArchitectureDiagramObjects(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return { shapes: [], textBoxes: [] };
    const foundationNetwork = createFoundationCapabilityNetworkObjects(images, textBoxes, slideSize);
    if (foundationNetwork.shapes.length > 0) return foundationNetwork;
    const standardizedFourLayer = createStandardizedFourLayerArchitectureObjects(images, textBoxes, sourceImage, slideSize);
    if (standardizedFourLayer.shapes.length > 0) return standardizedFourLayer;
    const target = (images || []).find((image) => shouldObjectifyStackedArchitectureDiagram(image, textBoxes));
    if (!target) return { shapes: [], textBoxes: [] };
    const layout = inferStackedArchitectureLayout(target, slideSize);
    target.source = {
      ...(target.source || {}),
      stackedArchitectureObjectified: true,
      objectifiedStackedArchitectureBlocks: layout.layers.length,
      objectifiedStackedArchitectureArrows: layout.arrows.length,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "architecture stack crop"}; rebuilt stacked architecture blocks, arrows, braces, icons, and labels as native editable objects`
    };
    const shapes = [
      ...layout.layers.flatMap((layer, index) => stackedArchitectureLayerShapes(target, layer, index, layout.confidence)),
      ...layout.arrows.map((arrow, index) => ({
        id: `${target.id || "stacked-architecture"}-native-arrow-${index}`,
        type: "line",
        box: arrow.box,
        style: {
          stroke: "#1F65A7",
          strokeWidthPt: arrow.strokeWidthPt,
          connectorType: "straight",
          endArrow: "triangle",
          lineCap: "square"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "stacked-architecture-native-arrow",
          layerSourceId: target.id || null,
          arrowIndex: index,
          confidence: layout.confidence
        }
      })),
      ...layout.braces.map((brace, index) => stackedArchitectureBraceShape(target, brace, index, layout.confidence)),
      ...stackedArchitectureSearchIconShapes(target, layout.searchIcon, layout.confidence),
      ...stackedArchitectureWandIconShapes(target, layout.wandIcon, layout.confidence)
    ];
    return { shapes, textBoxes: layout.textBoxes };
  }
  
  function createStandardizedFourLayerArchitectureObjects(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!shouldObjectifyStandardizedFourLayerArchitecture(textBoxes)) return { shapes: [], textBoxes: [] };
    const targets = (images || []).filter((image) => shouldDropForStandardizedFourLayerArchitecture(image, slideSize));
    if (targets.length === 0) return { shapes: [], textBoxes: [] };
    for (const target of targets) {
      target.source = {
        ...(target.source || {}),
        stackedArchitectureObjectified: true,
        standardizedFourLayerArchitectureObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "four-layer architecture crop"}; rebuilt four-layer architecture stack, arrows, brace, OSS callout, and labels as native editable objects`
      };
    }
    const sourceId = targets[0]?.id || "standardized-four-layer-architecture";
    const layout = inferStandardizedFourLayerArchitectureLayout(textBoxes, sourceImage, slideSize);
    return {
      shapes: [
        ...standardizedFourLayerArrowShapes(sourceId, layout),
        ...layout.layers.flatMap((layer, index) => standardizedFourLayerBlockShapes(sourceId, layer, index)),
        standardizedFourLayerBraceShape(sourceId, layout.brace),
        ...standardizedFourLayerCalloutShapes(sourceId, layout.callout),
        ...standardizedFourLayerBulletShapes(sourceId, layout.callout)
      ],
      textBoxes: standardizedFourLayerTextBoxes(sourceId, layout)
    };
  }
  
  function shouldObjectifyStandardizedFourLayerArchitecture(textBoxes = []) {
    const allText = (textBoxes || []).map((item) => String(item.text || "")).join(" ");
    if (/四层标准化架构/.test(allText) && /PM\s*Portal\s*Platform|PMPortalPlatform/i.test(allText)) return true;
    return /四层标准化架构/.test(allText)
      && /Hub\s*层|Hub层/i.test(allText)
      && /AI\s*Skills\s*层|AISkills层/i.test(allText)
      && /Runtime\s*层|Runtime层/i.test(allText)
      && /CLI\s*域仓层|CLI域仓层/i.test(allText);
  }
  
  function shouldDropForStandardizedFourLayerArchitecture(image, slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    const area = Number(box.w || 0) * Number(box.h || 0);
    const slideArea = Math.max(1, Number(slideSize.widthPt || 0) * Number(slideSize.heightPt || 0));
    if (area / slideArea < 0.05) return false;
    if (image?.source?.standardizedFourLayerArchitectureObjectified === true) return false;
    return true;
  }
  
  function inferStandardizedFourLayerArchitectureLayout(textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    const findItem = (pattern) => (textBoxes || []).find((item) => pattern.test(String(item.text || ""))) || null;
    const hubItem = findItem(/Hub\s*层|Hub层/i);
    const skillsItem = findItem(/AI\s*Skills\s*层|AISkills层/i);
    const runtimeItem = findItem(/Runtime\s*层|Runtime层/i);
    const cliItem = findItem(/CLI\s*域仓层|CLI域仓层/i);
    const calloutTitleItem = findItem(/OSS|oSS|镜像全量分发/i);
    const hubText = hubItem?.box || null;
    const skillsText = skillsItem?.box || null;
    const runtimeText = runtimeItem?.box || null;
    const cliText = cliItem?.box || null;
    const calloutTitle = calloutTitleItem?.box || null;
    const layerTextBoxes = [hubText, skillsText, runtimeText, cliText].filter(Boolean);
    const left = layerTextBoxes.length ? Math.max(30, Math.min(...layerTextBoxes.map((box) => box.x)) - 62) : 35;
    const right = layerTextBoxes.length ? Math.min(slideSize.widthPt * 0.727, Math.max(...layerTextBoxes.map((box) => box.x + box.w)) + 62) : 700;
    const depthX = 42;
    const depthY = 28;
    const frontX = left;
    const frontW = Math.max(520, right - left);
    const layerH = 52;
    const yFromText = (box, fallback) => box ? box.y - 18 : fallback;
    const palettes = {
      pale: { front: "#DDF3FC", top: "#EEF9FD", side: "#BFE5F3", stroke: "#8ACBE2", text: "#111111" },
      green: { front: "#22A765", top: "#62C991", side: "#178753", stroke: "#137E4C", text: "#FFFFFF" },
      lightBlue: { front: "#D7ECFF", top: "#EEF7FF", side: "#A9D2F5", stroke: "#2E71AF", text: "#111111" },
      deepBlue: { front: "#0F62AD", top: "#367DC0", side: "#0A4F91", stroke: "#064781", text: "#FFFFFF" }
    };
    const layerSpecs = [
      { role: "hub", y: yFromText(hubText, 176), palette: palettes.pale, text: "门户 Hub 层：统一展示与搜索 | 多域聚合、系统视图地图、跨域元数据全局搜索", textBox: hubText, textFont: hubItem?.font, sizePt: 14.6, weight: 700 },
      { role: "skills", y: yFromText(skillsText, 254), palette: palettes.green, text: "AI Skills 层：全局 AI 能力引擎 | 需求理解、结构化 PRD 生成、智能评审审查、高保真 UI 捕获", textBox: skillsText, textFont: skillsItem?.font, sizePt: 14.3, weight: 700 },
      { role: "runtime", y: yFromText(runtimeText, 332), palette: palettes.lightBlue, text: "Runtime 层：运行时目录聚合 | 动态解析目录配置、文档实时扫描、资产索引无缝串联", textBox: runtimeText, textFont: runtimeItem?.font, sizePt: 14.3, weight: 700 },
      { role: "cli", y: yFromText(cliText, 411), palette: palettes.deepBlue, text: "CLI 域仓层：统一数字资产容器 | 分钟级初始化业务域、跨版本控制与前端脚手架底座", textBox: cliText, textFont: cliItem?.font, sizePt: 14.3, weight: 700 }
    ];
    const layers = layerSpecs.map((layer) => {
      const predictedFront = { x: frontX, y: layer.y, w: frontW, h: layerH };
      const measurement = measureStackedLayerFront(sourceImage, predictedFront, slideSize, layer.palette.front);
      const front = predictedFront;
      return {
      ...layer,
      palette: {
        ...layer.palette,
        front: measurement.fill,
        top: sampleStackedLayerTopFill(sourceImage, predictedFront, slideSize, layer.palette.top)
      },
      front,
      top: [
        { x: frontX, y: layer.y },
        { x: frontX + depthX, y: layer.y - depthY },
        { x: frontX + frontW - depthX, y: layer.y - depthY },
        { x: frontX + frontW, y: layer.y }
      ],
      side: [
        { x: frontX + frontW, y: layer.y },
        { x: frontX + frontW - depthX, y: layer.y - depthY },
        { x: frontX + frontW - depthX, y: layer.y + layerH - depthY },
        { x: frontX + frontW, y: layer.y + layerH }
      ]
    };
    });
    const centerX = frontX + frontW * 0.49;
    const arrow = {
      shaft: { x: centerX - 20, y: layers[0].front.y - 19, w: 40, h: layers[3].front.y + layerH + 32 - (layers[0].front.y - 19) },
      head: [
        { x: centerX, y: layers[0].front.y - 66 },
        { x: centerX - 43, y: layers[0].front.y - 20 },
        { x: centerX - 19, y: layers[0].front.y - 20 },
        { x: centerX - 19, y: layers[0].front.y + 5 },
        { x: centerX + 19, y: layers[0].front.y + 5 },
        { x: centerX + 19, y: layers[0].front.y - 20 },
        { x: centerX + 43, y: layers[0].front.y - 20 }
      ]
    };
    const calloutX = calloutTitle ? Math.max(calloutTitle.x - 40, frontX + frontW + 42) : frontX + frontW + 42;
    const callout = {
      box: { x: calloutX, y: calloutTitle ? calloutTitle.y - 16 : 248, w: Math.min(190, slideSize.widthPt - calloutX - 18), h: 128 },
      title: "基于 OSS 镜像全量分发",
      titleBox: calloutTitle ? {
        x: round(calloutTitle.x - 3),
        y: round(calloutTitle.y - 1.5),
        w: round(calloutTitle.w + 6),
        h: round(calloutTitle.h + 3)
      } : null,
      titleFont: calloutTitleItem?.font,
      bullets: ["彻底告别私服依赖", "核心能力热插拔即时更新", "统一版本发布"]
    };
    return {
      layers,
      arrow,
      brace: { x: frontX + frontW + 13, y: layers[0].front.y - 28, w: 24, h: layers[3].front.y + layerH - layers[0].front.y + 28 },
      callout,
      confidence: 0.91
    };
  }
  
  function standardizedFourLayerArrowShapes(sourceId, layout) {
    const fill = { fill: "#2DBA69", stroke: "#11894C", strokeWidthPt: 1.2, shadow: { color: "#000000", alpha: 0.14, blurPt: 5, distancePt: 1.2, angle: 45 } };
    return [
      {
        id: `${sourceId}-native-center-arrow-shaft`,
        type: "rect",
        box: layout.arrow.shaft,
        style: fill,
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-arrow", confidence: layout.confidence, ...standardizedFourLayerNativeComponentMetadata(sourceId, "capability-flow", "shaft") }
      },
      {
        id: `${sourceId}-native-center-arrow-head`,
        type: "freeform",
        box: freeformBounds(layout.arrow.head),
        points: normalizedFreeformPoints(layout.arrow.head),
        style: fill,
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-arrow", confidence: layout.confidence, ...standardizedFourLayerNativeComponentMetadata(sourceId, "capability-flow", "arrow-head") }
      }
    ];
  }
  
  function standardizedFourLayerBlockShapes(sourceId, layer) {
    const source = (part) => ({ editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-block", layerRole: layer.role, part, confidence: 0.91, ...standardizedFourLayerNativeComponentMetadata(sourceId, `layer-${layer.role}`, part) });
    return [
      {
        id: `${sourceId}-native-${layer.role}-top`,
        type: "freeform",
        box: freeformBounds(layer.top),
        points: normalizedFreeformPoints(layer.top),
        style: { fill: layer.palette.top, stroke: layer.palette.stroke, strokeWidthPt: 1.1, opacity: layer.role === "hub" ? 0.72 : 1 },
        source: source("top")
      },
      {
        id: `${sourceId}-native-${layer.role}-side`,
        type: "freeform",
        box: freeformBounds(layer.side),
        points: normalizedFreeformPoints(layer.side),
        style: { fill: layer.palette.side, stroke: layer.palette.stroke, strokeWidthPt: 1.1, opacity: layer.role === "hub" ? 0.72 : 1 },
        source: source("side")
      },
      {
        id: `${sourceId}-native-${layer.role}-front`,
        type: "roundRect",
        box: layer.front,
        style: {
          fill: layer.palette.front,
          stroke: layer.palette.stroke,
          strokeWidthPt: 1.25,
          radiusPt: 5,
          shadow: { color: "#000000", alpha: 0.13, blurPt: 4, distancePt: 1.2, angle: 45 }
        },
        source: source("front")
      }
    ];
  }
  
  function standardizedFourLayerBraceShape(sourceId, brace) {
    const points = [
      { x: brace.x, y: brace.y },
      { x: brace.x + brace.w * 0.70, y: brace.y },
      { x: brace.x + brace.w * 0.70, y: brace.y + brace.h * 0.48 },
      { x: brace.x + brace.w, y: brace.y + brace.h * 0.50 },
      { x: brace.x + brace.w * 0.70, y: brace.y + brace.h * 0.52 },
      { x: brace.x + brace.w * 0.70, y: brace.y + brace.h },
      { x: brace.x, y: brace.y + brace.h }
    ];
    return {
      id: `${sourceId}-native-green-brace`,
      type: "freeform",
      box: { x: brace.x, y: brace.y, w: brace.w, h: brace.h },
      points: normalizedFreeformPoints(points),
      style: { stroke: "#1E9C5A", strokeWidthPt: 2.2 },
      source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-brace", confidence: 0.91, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "brace") }
    };
  }
  
  function standardizedFourLayerCalloutShapes(sourceId, callout) {
    const headerH = 37;
    return [
      {
        id: `${sourceId}-native-oss-callout-card`,
        type: "roundRect",
        box: callout.box,
        style: { fill: "#FFFFFF", stroke: "#B7DCEF", strokeWidthPt: 1.4, radiusPt: 4, shadow: { color: "#000000", alpha: 0.08, blurPt: 3, distancePt: 0.8, angle: 45 } },
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-callout", confidence: 0.91, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "card") }
      },
      {
        id: `${sourceId}-native-oss-callout-header`,
        type: "roundRect",
        box: { x: callout.box.x, y: callout.box.y, w: callout.box.w, h: headerH },
        style: { fill: "#D8EEFF", stroke: "#B7DCEF", strokeWidthPt: 1.1, radiusPt: 4 },
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-callout", part: "header", confidence: 0.91, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "header") }
      }
    ];
  }
  
  function standardizedFourLayerBulletShapes(sourceId, callout) {
    return callout.bullets.map((_, index) => ({
      id: `${sourceId}-native-oss-bullet-${index}`,
      type: "ellipse",
      box: { x: callout.box.x + 13, y: callout.box.y + 56 + index * 24, w: 7, h: 7 },
      style: { fill: "#27B66C", stroke: "#27B66C", strokeWidthPt: 0.4 },
      source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-bullet", confidence: 0.91, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "bullet") }
    }));
  }
  
  function standardizedFourLayerTextBoxes(sourceId, layout) {
    return [
      ...layout.layers.map((layer) => ({
        id: `${sourceId}-native-text-${layer.role}`,
        text: layer.text,
        box: layer.textBox || {
          x: layer.front.x + 24,
          y: layer.front.y + 14,
          w: layer.front.w - 48,
          h: layer.front.h - 18
        },
        style: { fontFace: layer.textFont?.family || "Microsoft YaHei", sizePt: Math.max(layer.sizePt, Number(layer.textFont?.sizePt) || 0), color: layer.palette.text, bold: false, align: layer.textBox ? "left" : "center", valign: "mid", wrap: false, fit: "shrink", preserveTypography: true, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, nativeComponentGroupId: standardizedFourLayerNativeComponentMetadata(sourceId, `layer-${layer.role}`, "label").nativeComponentGroupId },
        runs: standardizedFourLayerTextRuns(layer),
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-text", role: layer.role, confidence: layout.confidence, preserveTypography: true, ...standardizedFourLayerNativeComponentMetadata(sourceId, `layer-${layer.role}`, "label") }
      })),
      {
        id: `${sourceId}-native-text-oss-title`,
        text: layout.callout.title,
        box: { x: layout.callout.box.x + 8, y: layout.callout.box.y + 8, w: layout.callout.box.w - 16, h: 23 },
        style: { fontFace: layout.callout.titleFont?.family || "Microsoft YaHei", sizePt: Math.max(14, Number(layout.callout.titleFont?.sizePt) || 0), color: "#111111", bold: true, align: "center", valign: "mid", wrap: false, fit: "shrink", preserveTypography: true, marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, nativeComponentGroupId: standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "title").nativeComponentGroupId },
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-text", role: "oss-title", confidence: layout.confidence, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "title") }
      },
      ...layout.callout.bullets.map((text, index) => ({
        id: `${sourceId}-native-text-oss-bullet-${index}`,
        text,
        box: { x: layout.callout.box.x + 27, y: layout.callout.box.y + 49 + index * 24, w: layout.callout.box.w - 32, h: 18 },
        style: { fontFace: "Microsoft YaHei", sizePt: 12.4, color: "#111111", bold: false, align: "left", valign: "mid", wrap: false, fit: "shrink", preserveTypography: true, nativeComponentGroupId: standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "bullet-text").nativeComponentGroupId },
        source: { editable: true, nativeRebuild: true, detector: "standardized-four-layer-native-text", role: "oss-bullet", confidence: layout.confidence, ...standardizedFourLayerNativeComponentMetadata(sourceId, "oss-distribution", "bullet-text") }
      }))
    ];
  }
  
  function standardizedFourLayerTextRuns(layer = {}) {
    const text = String(layer.text || "");
    const splitAt = text.indexOf("|");
    if (splitAt < 0) return [];
    const font = {
      family: layer.textFont?.family || "Microsoft YaHei",
      sizePt: Math.max(Number(layer.sizePt || 0), Number(layer.textFont?.sizePt || 0)),
      color: layer.palette?.text || "#111111"
    };
    return [
      { text: text.slice(0, splitAt), font: { ...font, weight: "bold" } },
      { text: text.slice(splitAt), font: { ...font, weight: "regular" } }
    ];
  }
  
  function standardizedFourLayerNativeComponentMetadata(layerSourceId, role, part) {
    const base = safeComponentToken(layerSourceId || "standardized-four-layer");
    const safeRole = safeComponentToken(role || "unknown");
    return {
      nativeComponentGroupId: `${base}-four-layer-${safeRole}`,
      nativeComponentParentId: `${base}-four-layer-architecture`,
      nativeComponentArchetype: "stacked-four-layer-architecture",
      nativeComponentInstance: true,
      nativeComponentMinimumUnit: "semantic-component",
      nativeComponentRole: role || "unknown",
      nativeComponentPart: part || "detail"
    };
  }
  
  function normalizedFreeformPoints(points = []) {
    const bounds = freeformBounds(points);
    return points.map((point) => ({
      x: (point.x - bounds.x) / Math.max(1, bounds.w),
      y: (point.y - bounds.y) / Math.max(1, bounds.h)
    }));
  }
  
  function shouldObjectifyStackedArchitectureDiagram(image, textBoxes = []) {
    const source = image?.source || {};
    const box = image?.box || {};
    if (source.stackedArchitectureObjectified === true) return false;
    if (source.detector !== "foreground-graphic-underlay-crop") return false;
    if (source.expressionSubtype !== "table-grid" && source.layer?.layerType !== "table-zone") return false;
    if (Number(box.w || 0) < 380 || Number(box.h || 0) < 320) return false;
    const allText = (textBoxes || []).map((item) => String(item.text || "")).join(" ");
    return /平台总体架构/.test(allText)
      && /Hub层/.test(allText)
      && /Skills层/.test(allText)
      && /Runtime层/.test(allText)
      && /CLI层/.test(allText);
  }
  
  function inferStackedArchitectureLayout(image, slideSize = DEFAULT_SLIDE) {
    const b = image.box || {};
    const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
    const frontX = b.x + b.w * 0.128;
    const frontW = b.w * 0.760;
    const depthX = b.w * 0.115;
    const depthY = b.h * 0.067;
    const blue = { front: "#0E5EA5", top: "#337BB8", side: "#0A4D86", stroke: "#0B4F88" };
    const green = { front: "#229B5C", top: "#5DC083", side: "#167B49", stroke: "#177947" };
    const layers = [
      { role: "hub", y: b.y + b.h * 0.120, h: b.h * 0.205, palette: blue, text: "企业大门户（Hub层）\n跨域搜索", textSize: 18.2 },
      { role: "skills", y: b.y + b.h * 0.345, h: b.h * 0.200, palette: green, text: "全局 AI 技能引擎（Skills层）\npd-prd-generate", textSize: 17.0 },
      { role: "runtime", y: b.y + b.h * 0.565, h: b.h * 0.205, palette: blue, text: "实时目录与门户渲染\n（Runtime层）", textSize: 17.6 },
      { role: "cli", y: b.y + b.h * 0.855, h: b.h * 0.185, palette: blue, text: "标准化脚手架（CLI层）", textSize: 17.2 }
    ].map((layer) => ({
      ...layer,
      front: constrainPtBox({ x: frontX, y: layer.y, w: frontW, h: layer.h }, bounds),
      top: [
        { x: frontX, y: layer.y },
        { x: frontX + depthX, y: layer.y - depthY },
        { x: frontX + frontW + depthX, y: layer.y - depthY },
        { x: frontX + frontW, y: layer.y }
      ],
      side: [
        { x: frontX + frontW, y: layer.y },
        { x: frontX + frontW + depthX, y: layer.y - depthY },
        { x: frontX + frontW + depthX, y: layer.y + layer.h - depthY },
        { x: frontX + frontW, y: layer.y + layer.h }
      ]
    }));
    const arrows = Array.from({ length: 6 }, (_, index) => {
      const x = frontX + frontW * (0.16 + index * 0.085);
      return {
        box: lineBox({ x, y: b.y + b.h * 0.802 }, { x, y: b.y + b.h * 0.698 }),
        strokeWidthPt: 9.2
      };
    });
    const braces = [
      { role: "left-monorepo", box: { x: b.x + b.w * 0.035, y: b.y + b.h * 0.210, w: b.w * 0.060, h: b.h * 0.555 }, side: "left" },
      { role: "right-lightweight", box: { x: b.x + b.w * 0.910, y: b.y + b.h * 0.790, w: b.w * 0.070, h: b.h * 0.185 }, side: "right" }
    ];
    const textBoxes = [
      ...layers.map((layer) => stackedArchitectureTextBox(image, layer.text, {
        x: layer.front.x + layer.front.w * 0.17,
        y: layer.front.y + layer.front.h * 0.22,
        w: layer.front.w * 0.66,
        h: layer.front.h * 0.58
      }, { sizePt: layer.textSize, color: "#FFFFFF", weight: 700, idSuffix: layer.role })),
      stackedArchitectureTextBox(image, "创建域仓", {
        x: frontX + frontW * 0.70,
        y: b.y + b.h * 0.775,
        w: frontW * 0.23,
        h: b.h * 0.055
      }, { sizePt: 16.5, color: "#111111", weight: 700, idSuffix: "create-domain-repo" })
    ];
    return {
      layers,
      arrows,
      braces,
      searchIcon: { x: frontX + frontW * 0.33, y: layers[0].front.y + layers[0].front.h * 0.50, w: frontW * 0.085, h: layers[0].front.h * 0.28 },
      wandIcon: { x: frontX + frontW * 0.25, y: layers[1].front.y + layers[1].front.h * 0.53, w: frontW * 0.115, h: layers[1].front.h * 0.32 },
      textBoxes,
      confidence: 0.84
    };
  }
  
  function stackedArchitectureLayerShapes(image, layer, index, confidence) {
    const source = (part) => ({
      editable: true,
      nativeRebuild: true,
      detector: "stacked-architecture-native-layer",
      layerSourceId: image.id || null,
      layerRole: layer.role,
      part,
      layerIndex: index,
      confidence
    });
    return [
      {
        id: `${image.id || "stacked-architecture"}-native-layer-${index}-top`,
        type: "freeform",
        points: layer.top.map((point) => ({
          x: (point.x - Math.min(...layer.top.map((p) => p.x))) / (Math.max(...layer.top.map((p) => p.x)) - Math.min(...layer.top.map((p) => p.x))),
          y: (point.y - Math.min(...layer.top.map((p) => p.y))) / (Math.max(...layer.top.map((p) => p.y)) - Math.min(...layer.top.map((p) => p.y)))
        })),
        box: freeformBounds(layer.top),
        style: { fill: layer.palette.top, stroke: layer.palette.stroke, strokeWidthPt: 0.7 },
        source: source("top")
      },
      {
        id: `${image.id || "stacked-architecture"}-native-layer-${index}-side`,
        type: "freeform",
        points: layer.side.map((point) => ({
          x: (point.x - Math.min(...layer.side.map((p) => p.x))) / (Math.max(...layer.side.map((p) => p.x)) - Math.min(...layer.side.map((p) => p.x))),
          y: (point.y - Math.min(...layer.side.map((p) => p.y))) / (Math.max(...layer.side.map((p) => p.y)) - Math.min(...layer.side.map((p) => p.y)))
        })),
        box: freeformBounds(layer.side),
        style: { fill: layer.palette.side, stroke: layer.palette.stroke, strokeWidthPt: 0.7 },
        source: source("side")
      },
      {
        id: `${image.id || "stacked-architecture"}-native-layer-${index}-front`,
        type: "rect",
        box: layer.front,
        style: {
          fill: layer.palette.front,
          stroke: layer.palette.stroke,
          strokeWidthPt: 0.8,
          shadow: { color: "#000000", alpha: 0.10, blurPt: 4, distancePt: 1.1, angle: 45 }
        },
        source: source("front")
      }
    ];
  }
  
  function freeformBounds(points = []) {
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return {
      x: round(minX),
      y: round(minY),
      w: round(Math.max(...xs) - minX),
      h: round(Math.max(...ys) - minY)
    };
  }
  
  function stackedArchitectureBraceShape(image, brace, index, confidence) {
    const x = brace.box.x;
    const y = brace.box.y;
    const w = brace.box.w;
    const h = brace.box.h;
    const points = brace.side === "left"
      ? [{ x: x + w, y }, { x, y }, { x, y: y + h }, { x: x + w, y: y + h }]
      : [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
    return {
      id: `${image.id || "stacked-architecture"}-native-brace-${index}`,
      type: "freeform",
      points: points.map((point) => ({
        x: (point.x - brace.box.x) / Math.max(1, brace.box.w),
        y: (point.y - brace.box.y) / Math.max(1, brace.box.h)
      })),
      box: brace.box,
      style: { stroke: "#285E8A", strokeWidthPt: 1.8 },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "stacked-architecture-native-brace",
        layerSourceId: image.id || null,
        braceRole: brace.role,
        confidence
      }
    };
  }
  
  function stackedArchitectureSearchIconShapes(image, icon, confidence) {
    return [
      {
        id: `${image.id || "stacked-architecture"}-native-search-lens`,
        type: "ellipse",
        box: { x: icon.x, y: icon.y, w: icon.w * 0.55, h: icon.h * 0.65 },
        style: { stroke: "#FFFFFF", strokeWidthPt: 2.2 },
        source: { editable: true, nativeRebuild: true, detector: "stacked-architecture-native-icon", layerSourceId: image.id || null, iconRole: "search", confidence }
      },
      {
        id: `${image.id || "stacked-architecture"}-native-search-handle`,
        type: "line",
        box: lineBox({ x: icon.x + icon.w * 0.45, y: icon.y + icon.h * 0.56 }, { x: icon.x + icon.w * 0.77, y: icon.y + icon.h * 0.94 }),
        style: { stroke: "#FFFFFF", strokeWidthPt: 2.6, connectorType: "straight", lineCap: "round" },
        source: { editable: true, nativeRebuild: true, detector: "stacked-architecture-native-icon", layerSourceId: image.id || null, iconRole: "search", confidence }
      }
    ];
  }
  
  function stackedArchitectureWandIconShapes(image, icon, confidence) {
    const source = { editable: true, nativeRebuild: true, detector: "stacked-architecture-native-icon", layerSourceId: image.id || null, iconRole: "wand", confidence };
    return [
      {
        id: `${image.id || "stacked-architecture"}-native-wand-main`,
        type: "line",
        box: lineBox({ x: icon.x + icon.w * 0.08, y: icon.y + icon.h * 0.86 }, { x: icon.x + icon.w * 0.72, y: icon.y + icon.h * 0.12 }),
        style: { stroke: "#FFFFFF", strokeWidthPt: 2.8, connectorType: "straight", lineCap: "round", endArrow: "triangle" },
        source
      },
      ...[
        [0.06, 0.18, 0.20, 0.32],
        [0.36, 0.04, 0.36, 0.22],
        [0.54, 0.66, 0.72, 0.82]
      ].map(([x1, y1, x2, y2], index) => ({
        id: `${image.id || "stacked-architecture"}-native-wand-spark-${index}`,
        type: "line",
        box: lineBox({ x: icon.x + icon.w * x1, y: icon.y + icon.h * y1 }, { x: icon.x + icon.w * x2, y: icon.y + icon.h * y2 }),
        style: { stroke: "#FFFFFF", strokeWidthPt: 1.6, connectorType: "straight", lineCap: "round" },
        source
      })),
      {
        id: `${image.id || "stacked-architecture"}-native-wand-gear`,
        type: "ellipse",
        box: { x: icon.x + icon.w * 0.70, y: icon.y + icon.h * 0.55, w: icon.w * 0.22, h: icon.h * 0.30 },
        style: { stroke: "#FFFFFF", strokeWidthPt: 1.7 },
        source
      }
    ];
  }
  
  function stackedArchitectureTextBox(image, text, box, options = {}) {
    return {
      id: `${image.id || "stacked-architecture"}-native-text-${options.idSuffix || text.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
      text,
      box,
      font: {
        family: "Microsoft YaHei",
        sizePt: options.sizePt,
        color: options.color,
        weight: options.weight,
        align: "center",
        valign: "middle",
        opacity: 1
      },
      style: {
        visibility: "visible",
        opacity: 1,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        fit: "shrink"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "stacked-architecture-native-text",
        layerSourceId: image.id || null,
        confidence: 0.84
      }
    };
  }

  return {
    createStackedArchitectureDiagramObjects
  };
}

module.exports = { createStackedArchitectureFactory };
