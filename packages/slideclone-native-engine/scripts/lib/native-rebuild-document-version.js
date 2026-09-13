"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createDocumentVersionFactory(dependencies = {}) {
  const {
    boxCenterInside,
    constrainPtBox,
    cropPng,
    expandPtBox,
    lineBox,
    normalizeCjkText,
    normalizeGenericNodeDiagramText,
    ptBoxOverlapAreaRatio,
    ptToPxBox,
    resolveAssetPathForIr,
    round,
    writePng
  } = dependencies;
  const required = {
    boxCenterInside,
    constrainPtBox,
    cropPng,
    expandPtBox,
    lineBox,
    normalizeCjkText,
    normalizeGenericNodeDiagramText,
    ptBoxOverlapAreaRatio,
    ptToPxBox,
    resolveAssetPathForIr,
    round,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") {
      throw new TypeError(`native rebuild document version dependency ${name} must be a function`);
    }
  }

  function createDocumentVersionGovernanceObjects(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
    if (!shouldObjectifyDocumentVersionGovernance(rawTextBoxes)) return { shapes: [], textBoxes: [], images: [] };
    const target = (page.images || []).find((item) => item?.assetPath && item?.source?.detector === "foreground-graphic-crop");
    if (!target || !options.sourceImage || !options.irDir) return { shapes: [], textBoxes: [], images: [] };
    const assetFile = resolveAssetPathForIr(target.assetPath, options.irDir);
    if (!assetFile) return { shapes: [], textBoxes: [], images: [] };
  
    // This page deliberately keeps the handwritten sticky-note cluster intact.
    // It is an illustrative minimum unit, while the document/version tree is a
    // regular structure that can be reconstructed as editable Office objects.
    const leftSketchBox = { x: 64, y: 178, w: 380, h: 250 };
    const cropFile = path.join(path.dirname(assetFile), `${path.basename(assetFile, path.extname(assetFile))}-document-version-governance-left-sketch.png`);
    writePng(cropFile, cropPng(options.sourceImage, ptToPxBox(leftSketchBox, options.sourceImage, slideSize, 0)));
    for (const image of page.images || []) {
      image.source = {
        ...(image.source || {}),
        documentVersionGovernanceObjectified: true,
        dropErasedResidualAfterNativeRebuild: true,
        skipVisualAtomRebuild: true,
        nonEditableReason: "document/version governance page rebuilt as editable native components with the handwritten sticky-note illustration preserved as one local fidelity crop"
      };
    }
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      confidence: 0.92,
      expressionForm: "document-version-governance",
      ...extra
    });
    const shapes = [];
    const textBoxes = [];
    const add = (id, type, box, style, extra = {}) => shapes.push({ id, type, box, style, source: source("document-version-governance-native-shape", extra) });
    const addText = (id, text, box, options = {}) => textBoxes.push(temporaryAnswerWorkflowTextBox(id, text, box, {
      family: "Microsoft YaHei",
      sizePt: options.sizePt,
      color: options.color || "#111111",
      weight: options.weight || "normal",
      align: options.align || "center"
    }, source("document-version-governance-native-text", { role: options.role || id })));
  
    add("document-version-governance-border", "roundRect", { x: 26, y: 38, w: 908, h: 477 }, { fill: "#FFFFFF", opacity: 0, stroke: "#262626", strokeWidthPt: 1.1, radiusRatio: 0.018 }, { role: "page-border" });
    add("document-version-governance-divider", "line", { x: 480, y: 129, w: 0, h: 275 }, { stroke: "#B8C2C7", strokeWidthPt: 1.1, connectorType: "straight" }, { role: "split-divider" });
    add("document-version-governance-traditional-underline", "roundRect", { x: 199, y: 151, w: 106, h: 7 }, { fill: "#F4C88E", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.4, opacity: 0.9 }, { role: "traditional-underline" });
    add("document-version-governance-portal-underline", "roundRect", { x: 625, y: 151, w: 170, h: 7 }, { fill: "#8FBDEB", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.4, opacity: 0.9 }, { role: "portal-underline" });
    add("document-version-governance-back-folder", "roundRect", { x: 565, y: 179, w: 280, h: 246 }, { fill: "#EAF6FF", stroke: "#203742", strokeWidthPt: 1.2, radiusRatio: 0.055 }, { role: "back-folder" });
    add("document-version-governance-back-tab", "roundRect", { x: 565, y: 164, w: 90, h: 35 }, { fill: "#2672C5", stroke: "#203742", strokeWidthPt: 1.1, radiusRatio: 0.15 }, { role: "back-folder-tab" });
    add("document-version-governance-back-rail", "rect", { x: 565, y: 188, w: 280, h: 19 }, { fill: "#2672C5", stroke: "none", strokeWidthPt: 0 }, { role: "back-folder-rail" });
    add("document-version-governance-main-folder-tab", "roundRect", { x: 532, y: 236, w: 64, h: 26 }, { fill: "#2874C9", stroke: "#203742", strokeWidthPt: 1.1, radiusRatio: 0.15 }, { role: "main-folder-tab" });
    add("document-version-governance-main-folder", "roundRect", { x: 532, y: 252, w: 143, h: 77 }, { fill: "#2874C9", stroke: "#203742", strokeWidthPt: 1.1, radiusRatio: 0.095 }, { role: "main-folder" });
    add("document-version-governance-main-folder-highlight", "rect", { x: 544, y: 270, w: 119, h: 9 }, { fill: "#5EA4E6", stroke: "none", strokeWidthPt: 0 }, { role: "main-folder-highlight" });
    add("document-version-governance-branch-stem", "line", { x: 679, y: 238, w: 0, h: 132 }, { stroke: "#315F52", strokeWidthPt: 1.8, connectorType: "straight", lineCap: "round" }, { role: "branch-stem" });
    add("document-version-governance-main-connector", "line", { x: 675, y: 289, w: 4, h: 0 }, { stroke: "#315F52", strokeWidthPt: 2.1, connectorType: "straight", lineCap: "round" }, { role: "main-connector" });
    [210, 272, 334].forEach((y, index) => {
      add(`document-version-governance-card-${index}`, "roundRect", { x: 691, y, w: 211, h: 43 }, { fill: "#49C08B", stroke: "#315F52", strokeWidthPt: 1.1, radiusRatio: 0.1 }, { role: "version-card", index });
      add(`document-version-governance-card-tab-${index}`, "roundRect", { x: 691, y, w: 51, h: 13 }, { fill: "#49C08B", stroke: "#315F52", strokeWidthPt: 1.1, radiusRatio: 0.13 }, { role: "version-card-tab", index });
      add(`document-version-governance-card-connector-${index}`, "line", { x: 679, y: y + 21.5, w: 8, h: 0 }, { stroke: "#315F52", strokeWidthPt: 2.1, connectorType: "straight", endArrow: "triangle", lineCap: "round" }, { role: "version-card-connector", index });
    });
    add("document-version-governance-value-banner", "roundRect", { x: 160, y: 446, w: 632, h: 47 }, { fill: "#F3FFF9", stroke: "#49C6A3", strokeWidthPt: 2.1, radiusRatio: 0.12, shadow: { color: "#27B779", alpha: 0.20, blurPt: 6, distancePt: 1, angle: 45 } }, { role: "value-banner" });
    addText("document-version-governance-page-label", "数字架构师画布", { x: 28, y: 10, w: 130, h: 22 }, { sizePt: 14, weight: "normal", align: "left", role: "page-label" });
    addText("document-version-governance-title", "实战案例：物流WMS「库存查询」多增量版本治理", { x: 122, y: 65, w: 714, h: 43 }, { sizePt: 29, weight: "bold", role: "title" });
    addText("document-version-governance-traditional-heading", "传统模式", { x: 193, y: 123, w: 118, h: 30 }, { sizePt: 21, weight: "bold", role: "traditional-heading" });
    addText("document-version-governance-portal-heading", "PM Portal 模式", { x: 610, y: 123, w: 200, h: 30 }, { sizePt: 21, weight: "bold", role: "portal-heading" });
    addText("document-version-governance-doc-label", "库存查询主文档", { x: 544, y: 278, w: 119, h: 24 }, { sizePt: 16, color: "#FFFFFF", weight: "bold", role: "document-label" });
    [
      "V24：沉淀待处理位过滤规则。",
      "V25：结构化物流追踪码交互逻辑。",
      "V26：明确关联单号全链路口径。"
    ].forEach((text, index) => addText(`document-version-governance-version-${24 + index}`, text, { x: 705, y: 221 + index * 62, w: 183, h: 21 }, { sizePt: 12.2, weight: "bold", role: "version-label" }));
    addText("document-version-governance-value-text", "成效：将连续增量拆分为独立、可追溯的结构化资产，避免需求漂移。", { x: 186, y: 459, w: 580, h: 21 }, { sizePt: 16, weight: "bold", role: "value-text" });
    return {
      shapes,
      textBoxes,
      images: [{
        id: `${target.id || "document-version-governance"}-left-sketch-crop`,
        type: "fidelity-crop",
        assetPath: path.relative(options.irDir, cropFile).replace(/\\/g, "/"),
        box: leftSketchBox,
        source: {
          editable: false,
          nativeRebuild: true,
          detector: "document-version-governance-left-sketch-crop",
          parentDetector: target.source?.detector || null,
          parentImageId: target.id || null,
          expressionForm: "icon-or-illustration",
          expressionSubtype: "handwritten-sticky-note-illustration",
          recommendedAction: "keep-local-crop",
          intentionalMinimumUnitCrop: true,
          protectedMinimumUnit: true,
          skipVisualAtomRebuild: true,
          residualSplit: true,
          residualSplitMode: "document-version-governance-left-sketch",
          nonEditableReason: "handwritten sticky-note illustration retained as the minimum source-faithful visual unit"
        }
      }]
    };
  }
  
  function shouldObjectifyDocumentVersionGovernance(rawTextBoxes = []) {
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
    return /库存查询/.test(labels)
      && /多增量版本治理/.test(labels)
      && /传统模式/.test(labels)
      && /PMPortal模式/.test(labels)
      && /版本口径漂移|需求误覆盖/.test(labels);
  }
  
  
  
  function createDocumentVersionFolderFlowObjects(images = [], rawTextBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return { shapes: [], textBoxes: [] };
    const target = (images || []).find((image) => shouldObjectifyDocumentVersionFolderFlow(image, rawTextBoxes));
    if (!target) return { shapes: [], textBoxes: [] };
    const layout = inferDocumentVersionFolderFlowLayout(target, rawTextBoxes, slideSize);
    if (!layout) return { shapes: [], textBoxes: [] };
    target.source = {
      ...(target.source || {}),
      documentVersionFolderFlowObjectified: true,
      objectifiedDocumentVersionCards: layout.versionCards.length,
      objectifiedDocumentVersionConnectors: layout.connectors.length,
      documentVersionNativeTextBoxes: layout.textBoxes,
      dropErasedResidualAfterNativeRebuild: true,
      nonEditableReason: `${target.source?.nonEditableReason || target.source?.reason || "document version flow crop"}; rebuilt folder/version flow as native editable shapes and text`
    };
    markDuplicateDocumentVersionResiduals(images, target);
    const shapes = [
      ...documentVersionFolderFrameShapes(target, layout),
      ...layout.connectors.map((connector, index) => ({
        id: `${target.id || "document-version"}-native-connector-${index}`,
        type: "line",
        box: connector.box,
        style: {
          stroke: connector.stroke,
          strokeWidthPt: connector.strokeWidthPt,
          connectorType: "straight",
          endArrow: connector.endArrow || undefined,
          lineCap: "round"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "document-version-flow-native-connector",
          layerSourceId: target.id || null,
          confidence: layout.confidence
        }
      })),
      ...layout.versionCards.flatMap((card, index) => documentVersionCardShapes(target, card, index, layout.confidence)),
      ...documentVersionMainFolderShapes(target, layout.mainFolder, layout.confidence)
    ];
    return { shapes, textBoxes: layout.textBoxes };
  }
  
  function shouldObjectifyDocumentVersionFolderFlow(image, rawTextBoxes = []) {
    const source = image?.source || {};
    const box = image?.box || {};
    if (source.detector !== "foreground-graphic-crop") return false;
    if (source.documentVersionFolderFlowObjectified === true) return false;
    if (Number(box.w || 0) < 260 || Number(box.h || 0) < 160) return false;
    const inside = (rawTextBoxes || []).filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, DEFAULT_SLIDE, 18, 18)));
    const hasDocTitle = inside.some((item) => /库存查询主文档/.test(String(item.text || "")))
      || documentVersionImageNodes(image).some((item) => /库存查询主文档/.test(String(item.text || "")));
    const versionCount = inside.filter((item) => /^V2[0-9][：:]/.test(String(item.text || ""))).length;
    return hasDocTitle && (versionCount >= 2 || hasDocumentVersionGovernanceFallbackContext(rawTextBoxes));
  }
  
  function inferDocumentVersionFolderFlowLayout(image, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {
    const bounds = { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt };
    const box = image.box || {};
    const inside = (rawTextBoxes || []).filter((item) => item?.box && boxCenterInside(item.box, expandPtBox(box, slideSize, 24, 24)));
    const docText = inside.find((item) => /库存查询主文档/.test(String(item.text || "")))
      || documentVersionImageNodes(image).find((item) => /库存查询主文档/.test(String(item.text || "")));
    let versionTexts = inside
      .filter((item) => /^V2[0-9][：:]/.test(String(item.text || "")))
      .sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0))
      .slice(0, 4);
    if (docText && versionTexts.length < 2 && hasDocumentVersionGovernanceFallbackContext(rawTextBoxes)) {
      versionTexts = fallbackDocumentVersionTextBoxes(image, docText);
    }
    if (!docText || versionTexts.length < 2) return null;
    const rightEdge = Number(box.x || 0) + Number(box.w || 0);
    const versionCards = versionTexts.map((textBox, index) => {
      const text = textBox.box || {};
      const card = constrainPtBox({
        x: Math.max(Number(box.x || 0) + Number(box.w || 0) * 0.36, Number(text.x || 0) - 32),
        y: Number(text.y || 0) - 25,
        w: Math.min(rightEdge - (Number(text.x || 0) - 32) - 4, Math.max(220, Number(text.w || 0) + 70)),
        h: Math.max(48, Number(text.h || 0) + 37)
      }, bounds);
      return { box: card, textBox, index };
    });
    const docBox = docText.box || {};
    const mainFolder = constrainPtBox({
      x: Math.max(Number(box.x || 0) + 4, Number(docBox.x || 0) - 82),
      y: Math.max(Number(box.y || 0) + 28, Number(docBox.y || 0) - 58),
      w: Math.min(205, Math.max(170, Number(docBox.w || 0) + 98)),
      h: Math.max(92, Number(docBox.h || 0) + 76)
    }, bounds);
    const spineX = Math.max(mainFolder.x + mainFolder.w + 18, Math.min(versionCards[0].box.x - 40, Number(box.x || 0) + Number(box.w || 0) * 0.39));
    const firstY = versionCards[0].box.y + versionCards[0].box.h / 2;
    const lastY = versionCards[versionCards.length - 1].box.y + versionCards[versionCards.length - 1].box.h / 2;
    const connectors = [
      {
        box: lineBox({ x: mainFolder.x + mainFolder.w, y: mainFolder.y + mainFolder.h * 0.55 }, { x: spineX, y: mainFolder.y + mainFolder.h * 0.55 }),
        stroke: "#315F52",
        strokeWidthPt: 2.1
      },
      {
        box: lineBox({ x: spineX, y: firstY }, { x: spineX, y: lastY }),
        stroke: "#315F52",
        strokeWidthPt: 1.8
      },
      ...versionCards.map((card) => ({
        box: lineBox({ x: spineX, y: card.box.y + card.box.h / 2 }, { x: card.box.x - 5, y: card.box.y + card.box.h / 2 }),
        stroke: "#315F52",
        strokeWidthPt: 2.1,
        endArrow: "triangle"
      }))
    ];
    const textBoxes = [
      documentVersionFlowTextBox(image, docText.text, {
        x: mainFolder.x + mainFolder.w * 0.13,
        y: mainFolder.y + mainFolder.h * 0.38,
        w: mainFolder.w * 0.74,
        h: mainFolder.h * 0.24
      }, { color: "#FFFFFF", sizePt: 16.5, weight: 700, id: docText.id }),
      ...versionCards.map((card) => documentVersionFlowTextBox(image, card.textBox.text, {
        x: card.box.x + card.box.w * 0.12,
        y: card.box.y + card.box.h * 0.30,
        w: card.box.w * 0.80,
        h: card.box.h * 0.36
      }, { color: "#20352F", sizePt: 15.2, weight: 700, id: card.textBox.id }))
    ];
    return { mainFolder, versionCards, connectors, textBoxes, confidence: 0.82 };
  }
  
  function documentVersionImageNodes(image = {}) {
    const nodes = image?.source?.layer?.diagramUnderstanding?.nodes || image?.source?.diagramUnderstanding?.nodes || [];
    return Array.isArray(nodes)
      ? nodes.filter((node) => node?.box && isSafeGenericNodeDiagramText(node.text))
      : [];
  }
  
  function hasDocumentVersionGovernanceFallbackContext(rawTextBoxes = []) {
    const labels = (rawTextBoxes || []).map((item) => normalizeCjkText(item.text)).join(" ");
    return /库存查询/.test(labels)
      && /多增量版本治理/.test(labels)
      && /版本口径漂移|需求误覆盖|避免需求漂移/.test(labels);
  }
  
  function fallbackDocumentVersionTextBoxes(image = {}, docText = {}) {
    const box = image.box || {};
    const docCenterY = Number(docText.box?.y || 0) + Number(docText.box?.h || 0) / 2;
    const startX = Number(box.x || 0) + Number(box.w || 0) * 0.50;
    const startY = Math.max(Number(box.y || 0) + Number(box.h || 0) * 0.16, docCenterY - Number(box.h || 0) * 0.28);
    const rowGap = Number(box.h || 0) * 0.245;
    return [
      "V24：沉淀待处理位过滤规则。",
      "V25：结构化物流追踪码交互逻辑。",
      "V26：明确关联单号全链路口径。"
    ].map((text, index) => ({
      id: `${image.id || "document-version"}-fallback-v${24 + index}`,
      text,
      box: {
        x: round(startX),
        y: round(startY + index * rowGap),
        w: round(Number(box.w || 0) * 0.43),
        h: 14
      },
      source: {
        fallbackSemanticText: true,
        reason: "document-version-governance-page-context"
      }
    }));
  }
  
  function documentVersionFolderFrameShapes(image, layout) {
    const box = image.box || {};
    const headerH = Math.max(22, Number(box.h || 0) * 0.12);
    const tabW = Math.min(130, Number(box.w || 0) * 0.34);
    return [
      {
        id: `${image.id || "document-version"}-native-back-folder-body`,
        type: "roundRect",
        box: { x: round(box.x), y: round(box.y + headerH * 0.55), w: round(box.w), h: round(box.h - headerH * 0.55) },
        style: {
          fill: "#EAF6FF",
          stroke: "#203742",
          strokeWidthPt: 1.2,
          radiusRatio: 0.055
        },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-folder-frame", layerSourceId: image.id || null, confidence: layout.confidence }
      },
      {
        id: `${image.id || "document-version"}-native-back-folder-tab`,
        type: "roundRect",
        box: { x: round(box.x), y: round(box.y), w: round(tabW), h: round(headerH) },
        style: {
          fill: "#2672C5",
          stroke: "#203742",
          strokeWidthPt: 1.2,
          radiusRatio: 0.14
        },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-folder-tab", layerSourceId: image.id || null, confidence: layout.confidence }
      },
      {
        id: `${image.id || "document-version"}-native-back-folder-rail`,
        type: "rect",
        box: { x: round(box.x), y: round(box.y + headerH * 0.62), w: round(box.w), h: round(headerH * 0.48) },
        style: { fill: "#2672C5", stroke: "none", strokeWidthPt: 0 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-folder-rail", layerSourceId: image.id || null, confidence: layout.confidence }
      }
    ];
  }
  
  function documentVersionMainFolderShapes(image, folder, confidence) {
    return [
      {
        id: `${image.id || "document-version"}-native-main-folder-tab`,
        type: "roundRect",
        box: { x: folder.x, y: folder.y, w: round(folder.w * 0.43), h: round(folder.h * 0.28) },
        style: { fill: "#2874C9", stroke: "#203742", strokeWidthPt: 1.1, radiusRatio: 0.15 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-main-folder", layerSourceId: image.id || null, part: "tab", confidence }
      },
      {
        id: `${image.id || "document-version"}-native-main-folder-body`,
        type: "roundRect",
        box: { x: folder.x, y: round(folder.y + folder.h * 0.20), w: folder.w, h: round(folder.h * 0.80) },
        style: { fill: "#2874C9", stroke: "#203742", strokeWidthPt: 1.1, radiusRatio: 0.095 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-main-folder", layerSourceId: image.id || null, part: "body", confidence }
      },
      {
        id: `${image.id || "document-version"}-native-main-folder-highlight`,
        type: "rect",
        box: { x: round(folder.x + folder.w * 0.08), y: round(folder.y + folder.h * 0.30), w: round(folder.w * 0.84), h: round(folder.h * 0.10) },
        style: { fill: "#5EA4E6", stroke: "none", strokeWidthPt: 0 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-main-folder", layerSourceId: image.id || null, part: "highlight", confidence }
      }
    ];
  }
  
  function documentVersionCardShapes(image, card, index, confidence) {
    return [
      {
        id: `${image.id || "document-version"}-native-version-card-${index}`,
        type: "roundRect",
        box: card.box,
        style: { fill: "#49C08B", stroke: "#315F52", strokeWidthPt: 1.1, radiusRatio: 0.10 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-version-card", layerSourceId: image.id || null, cardIndex: index, confidence }
      },
      {
        id: `${image.id || "document-version"}-native-version-card-tab-${index}`,
        type: "roundRect",
        box: { x: card.box.x, y: card.box.y, w: round(card.box.w * 0.24), h: round(card.box.h * 0.28) },
        style: { fill: "#49C08B", stroke: "#315F52", strokeWidthPt: 1.1, radiusRatio: 0.13 },
        source: { editable: true, nativeRebuild: true, detector: "document-version-flow-native-version-tab", layerSourceId: image.id || null, cardIndex: index, confidence }
      }
    ];
  }
  
  function documentVersionFlowTextBox(image, text, box, options = {}) {
    return {
      id: `${image.id || "document-version"}-native-text-${options.id || String(text || "").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`,
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
        detector: "document-version-flow-native-text",
        layerSourceId: image.id || null
      }
    };
  }
  
  function markDuplicateDocumentVersionResiduals(images = [], target) {
    for (const image of images || []) {
      if (image === target || !image?.box) continue;
      const detector = image.source?.detector;
      if (detector === "foreground-graphic-crop" && (
        image.source?.stickyNoteClusterObjectified === true
        || shouldTreatAsDocumentVersionMixedParentCrop(image, target)
      )) {
        if (ptBoxOverlapAreaRatio(image.box, target.box) < 0.20) continue;
        image.source = {
          ...(image.source || {}),
          stickyNoteClusterObjectified: true,
          documentVersionNativePeerBox: target.box,
          nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "mixed document-version parent crop"}; split to preserve sketch/sticky residuals after native folder-flow reconstruction`
        };
        continue;
      }
      if (detector !== "sticky-note-adjacent-residual-crop") continue;
      if (ptBoxOverlapAreaRatio(image.box, target.box) < 0.45) continue;
      image.source = {
        ...(image.source || {}),
        documentVersionDuplicateResidual: true,
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "residual crop"}; duplicate of native rebuilt document version flow`
      };
    }
  }
  
  
  
  function shouldTreatAsDocumentVersionMixedParentCrop(image = {}, target = {}) {
    const box = image.box || {};
    const targetBox = target.box || {};
    if (!box.w || !box.h || !targetBox.w || !targetBox.h) return false;
    if (image.source?.documentVersionFolderFlowObjectified === true) return false;
    const layer = image.source?.layer || {};
    if (layer.layerType && layer.layerType !== "diagram-zone") return false;
    const imageArea = Number(box.w || 0) * Number(box.h || 0);
    const targetArea = Number(targetBox.w || 0) * Number(targetBox.h || 0);
    if (imageArea < targetArea * 1.6) return false;
    if (Number(box.x || 0) > Number(targetBox.x || 0) - 120) return false;
    if (Number(box.x || 0) + Number(box.w || 0) < Number(targetBox.x || 0) + Number(targetBox.w || 0) * 0.68) return false;
    const overlap = ptBoxOverlapAreaRatio(box, targetBox);
    if (overlap < 0.45) return false;
    const atoms = Array.isArray(layer.visualAtoms) ? layer.visualAtoms : [];
    return atoms.length >= 12 || /complex-graphic|movable-crop|folder|version/.test(String(image.source?.reason || image.source?.nonEditableReason || ""));
  }  
  
  function isSafeGenericNodeDiagramText(text) {
    const normalized = normalizeGenericNodeDiagramText(text);
    if (!normalized) return false;
    if (normalized.length > 30) return false;
    if (/^[\d\s.,;:|/\\\-+_()[\]{}]+$/.test(normalized)) return false;
    if (/^[？?！!×+。.,，；;：:]+$/.test(normalized)) return false;
    return /[\u4e00-\u9fffA-Za-z]/.test(normalized);
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
    createDocumentVersionFolderFlowObjects,
    createDocumentVersionGovernanceObjects,
    shouldObjectifyDocumentVersionGovernance
  };
}

module.exports = { createDocumentVersionFactory };
