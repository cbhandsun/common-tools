"use strict";
const { boxesOverlapRatio, isTriangleTopologyInternalPreservedCropLabel, normalizeTriangleTopologyDuplicateLabel, DEFAULT_SLIDE, isPrdPreservedSegmentText, mergeShiftLeftAbilityTextBoxes, normalizeWmsRouteChainTitle, assetOsKpiBenefitRefinedFontSize, assetOsKpiBenefitTextColor, assetOsKpiBenefitTextRole, isAssetOsKpiBenefitDiagramText, normalizedChromeEvidenceBox, isCollaborationFlowInternalLabel, isSaturatedDiagramInternalLabel, keepsInternalLayerText, removesInternalEditableText, shouldKeepAssetHubCycleEndpointLabel, shouldKeepFunnelHubDiagramText, shouldKeepFunnelHubTextInResidualCrop, shouldRemoveHighRiskInternalOverlayText, boxArea, intersectionArea, fitTriangleTopologyEvidenceFontSize, normalizeGenericNodeDiagramText, anchorSemanticTextBoxToNativeNodeShape, isSemanticLabelHostNativeShape, entropyChallengeFooterEntries, entropyChallengeNativeComponentMetadata, hasEntropyChallengeFooterEvidence, isAssetOsHighValueAssetMatrixTextEcho } = require("./page-text-rule-helpers");
const { boxCenterInside, expandPtBox, unionPtBox, constrainPtBox } = require("./raster-native-detection");
const { normalizeCjkText } = require("./prd-generation-shapes");
const { unionBox } = require("./residual-component-analysis");
const { isWmsRouteInternalLabel } = require("./wms-route-reconstruction");
const { normalizeMatrixLabel, normalizeTextKey } = require("./diagram-label-matching");
const { ptBoxOverlapAreaValue } = require("./diagram-geometry");
const { looksLikeTopTitle } = require("./native-text-style");
const { inferNativeComponentGroupForText } = require("./visual-atom-component-grouping");

function suppressGenericStructuredIllustrationObjectsForSpecialist(items = [], specialistActive = false) {
  if (!specialistActive) return items || [];
  return (items || []).filter((item) =>
    !String(item?.source?.detector || "").startsWith("structured-illustration-"));
}

function filterTextBoxesClaimedByTriangleTopology(textBoxes = [], images = []) {
  const items = Array.isArray(textBoxes) ? textBoxes : [];
  const preservedTriangleBoxes = (Array.isArray(images) ? images : [])
    .filter((image) => image?.source?.triangleTopologyObjectified === true
      && image?.source?.preserveResidualCropUnderNativeRebuild === true
      && image?.box)
    .map((image) => expandPtBox(image.box, DEFAULT_SLIDE, 8, 12));
  if (preservedTriangleBoxes.length > 0) {
    return items.filter((textBox) => {
      const detector = String(textBox?.source?.detector || "");
      if (/^triangle-topology-native-(?:center|top)-text$/.test(detector)) return true;
      if (!isTriangleTopologyInternalPreservedCropLabel(textBox?.text)) return true;
      return !preservedTriangleBoxes.some((box) => boxCenterInside(textBox?.box, box));
    });
  }
  const nativeLabels = items.filter((textBox) =>
    /^triangle-topology-native-/.test(String(textBox?.source?.detector || ""))
  );
  if (nativeLabels.length === 0) return items;
  return items.filter((textBox) => {
    const detector = String(textBox?.source?.detector || "");
    if (/^triangle-topology-native-/.test(detector)) return true;
    const normalized = normalizeTriangleTopologyDuplicateLabel(textBox?.text);
    if (!normalized) return true;
    return !nativeLabels.some((candidate) =>
      normalizeTriangleTopologyDuplicateLabel(candidate?.text) === normalized
      && boxesOverlapRatio(textBox?.box, candidate?.box) >= 0.65
    );
  });
}

function filterTextBoxesClaimedByPrdSegmentCrops(textBoxes = [], images = []) {
  const items = Array.isArray(textBoxes) ? textBoxes : [];
  const preservedSegmentBoxes = (Array.isArray(images) ? images : [])
    .filter((image) => image?.source?.prdGenerationSegmentCropPreserved === true && image?.box)
    .map((image) => expandPtBox(image.box, DEFAULT_SLIDE, 4, 4));
  if (preservedSegmentBoxes.length === 0) return items;
  return items.filter((textBox) => {
    if (!textBox?.box) return true;
    if (isPrdPreservedSegmentText(textBox, preservedSegmentBoxes)) return true;
    return !preservedSegmentBoxes.some((box) => boxCenterInside(textBox.box, box));
  });
}

function normalizePrdSegmentCropTextBoxes(textBoxes = [], images = []) {
  const preservedSegmentBoxes = (Array.isArray(images) ? images : [])
    .filter((image) => image?.source?.prdGenerationSegmentCropPreserved === true && image?.box)
    .map((image) => expandPtBox(image.box, DEFAULT_SLIDE, 4, 4));
  if (preservedSegmentBoxes.length === 0) return Array.isArray(textBoxes) ? textBoxes : [];
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => {
    if (!isPrdPreservedSegmentText(textBox, preservedSegmentBoxes)) return textBox;
    const text = String(textBox?.text || "").trim();
    const isLeftHeading = /^(?:InteractivePrototype|Interactive Prototype|Structured Brief)$/.test(text);
    const containingSegment = preservedSegmentBoxes.find((box) => boxCenterInside(textBox.box, box));
    const isHeader = text === "PRD";
    if (isLeftHeading) {
      return {
        ...textBox,
        text: text === "InteractivePrototype" ? "Interactive Prototype" : text,
        box: {
          ...(textBox.box || {}),
          x: containingSegment ? containingSegment.x + 10 : Number(textBox.box?.x || 0),
          w: containingSegment ? Math.max(120, containingSegment.w - 20) : Math.max(Number(textBox.box?.w || 0), 150),
          h: Math.max(Number(textBox.box?.h || 0), 20)
        },
        font: {
          ...(textBox.font || {}),
          family: "Microsoft YaHei",
          sizePt: 14.5,
          color: "#FFFFFF",
          weight: "regular",
          align: "center",
          valign: "middle",
          wrap: false
        },
        source: {
          ...(textBox.source || {}),
          overlayVisibility: "visible",
          prdSegmentCropTextRestored: true,
          role: "input-card-title"
        }
      };
    }
    return {
      ...textBox,
      box: {
        ...(textBox.box || {}),
        // Preserve OCR geometry where it already fits the four-character rows.
        // A small floor prevents OpenXML clipping without shifting their centers.
        w: isHeader ? Math.max(Number(textBox.box?.w || 0), 42) : Math.max(Number(textBox.box?.w || 0), 70),
        h: isHeader ? Math.max(Number(textBox.box?.h || 0), 18) : Math.max(Number(textBox.box?.h || 0), 22)
      },
      font: {
        ...(textBox.font || {}),
        family: "Microsoft YaHei",
        sizePt: isHeader ? 14 : 15,
        color: isHeader ? "#FFFFFF" : "#111111",
        weight: isHeader ? "regular" : "bold",
        align: "left",
        valign: "middle",
        wrap: false
      },
      source: {
        ...(textBox.source || {}),
        overlayVisibility: "visible",
        prdSegmentCropTextRestored: true
      }
    };
  });
}

function arbitrateSparseFlowCardChainNativeOwnership(items = []) {
  if (!Array.isArray(items) || items.length === 0) return [];
  const sparseOwners = items
    .filter((item) => /^sparse-flow-card-chain-native-/.test(String(item?.source?.detector || "")))
  const ownerLayerIds = new Set(sparseOwners
    .map((item) => String(item?.source?.layerSourceId || ""))
    .filter(Boolean));
  if (ownerLayerIds.size === 0) return items;
  return items.filter((item) => {
    const detector = String(item?.source?.detector || "");
    const layerId = String(item?.source?.layerSourceId || "");
    if (!ownerLayerIds.has(layerId)) return true;
    return !/^(?:dense-complex-diagram-native-scaffold|visual-atom-native-|linear-process-native-)/.test(detector);
  }).filter((item) => {
    const detector = String(item?.source?.detector || "");
    if (detector) return true;
    const normalized = normalizeCjkText(item?.text);
    if (!normalized) return true;
    return !sparseOwners.some((owner) =>
      normalizeCjkText(owner?.text) === normalized
      && boxesOverlapRatio(item?.box, owner?.box) >= 0.45
    );
  });
}

function normalizeCommonOcrTextBoxLabels(textBoxes = []) {
  if (!Array.isArray(textBoxes)) return [];
  const pageText = textBoxes.map((item) => normalizeCjkText(item?.text)).join(" ");
  const isWorkflowCover = /核心能力矩阵/.test(pageText) && /重塑产品交付工作流/.test(pageText);
  const isWorkflowClosing = /从个人的/.test(pageText) && /PMPortalPlatform的终极意义/.test(pageText);
  const isAssetEntropyChallenge = /系统爆炸时代/.test(pageText) && /理解偏差/.test(pageText) && /风险遗漏/.test(pageText);
  const isWmsRouteChain = /物流WMS/.test(pageText) && /复杂主链路增量/.test(pageText) && /隐性风险/.test(pageText);
  const normalizedInput = /痛点/.test(pageText) && /能力/.test(pageText) && /执行逻辑校验/.test(pageText)
    && /扫描异常分支/.test(pageText) && /Shift-Left/i.test(pageText)
    ? mergeShiftLeftAbilityTextBoxes(textBoxes)
    : textBoxes;
  const normalized = normalizedInput.map((textBox) => {
    const text = String(textBox?.text || "");
    let correctedText = null;
    if (isWorkflowCover && /Skills/i.test(text) && /核心能力矩阵/.test(text)) {
      correctedText = "AI Skills 核心能力矩阵";
    } else if (isWorkflowCover && /重塑产品交付工作流/.test(normalizeCjkText(text))) {
      correctedText = "重塑产品交付工作流 —— 从经验依赖到数智赋能";
    } else if (isWorkflowClosing && /^为[“"]?AI工作台/.test(normalizeCjkText(text))) {
      correctedText = "“AI 工作台”，迈向企业的“数字化产品智能大脑”";
    } else if (isWorkflowClosing && /PMPortalPlatform的终极意义/.test(normalizeCjkText(text))) {
      correctedText = "PM Portal Platform 的终极意义，绝不仅是为了让一份文档写得更快。";
    } else if (isWorkflowClosing && /用AI让美好发生/.test(normalizeCjkText(text))) {
      correctedText = "用 AI 让美好发生，数智向光，做组织进化的效率先锋。";
    } else if (isAssetEntropyChallenge && /系统爆炸时代/.test(text) && /产研资产增/.test(text)) {
      correctedText = text.replace(/产研资产增/g, "产研资产熵增");
    }
    if (correctedText) {
      return {
        ...textBox,
        text: correctedText,
        source: {
          ...(textBox.source || {}),
          normalizedOcrText: true,
          semanticPageContext: isWorkflowCover ? "workflow-cover" : isWorkflowClosing ? "workflow-closing" : "asset-entropy-challenge",
          originalText: text
        }
      };
    }
    if (text === "智能评审" && Number(textBox?.box?.w || 0) < 92) {
      return {
        ...textBox,
        box: {
          ...(textBox.box || {}),
          w: 104
        },
        style: {
          ...(textBox.style || {}),
          wrap: false
        },
        source: {
          ...(textBox.source || {}),
          normalizedOcrTextBox: true,
          originalBox: textBox.box || null
        }
      };
    }
    if (/AISkills不是/.test(text)) {
      return {
        ...textBox,
        text: text.replace(/AISkills不是/g, "AI Skills 不是"),
        source: {
          ...(textBox.source || {}),
          normalizedOcrText: true,
          originalText: text
        }
      };
    }
    if (/^Alskills:\s*$/i.test(text)) {
      return {
        ...textBox,
        text: "AI Skills:",
        source: {
          ...(textBox.source || {}),
          normalizedOcrText: true,
          originalText: text
        }
      };
    }
    if (/基于AlSkills提炼/i.test(text)) {
      return {
        ...textBox,
        text: text.replace(/AlSkills/gi, "AI Skills"),
        source: {
          ...(textBox.source || {}),
          normalizedOcrText: true,
          originalText: text
        }
      };
    }
    if (/产品版图/.test(text) && /SystemMap/.test(text)) {
      return {
        ...textBox,
        text: text.replace(/SystemMap/g, "System Map"),
        source: {
          ...(textBox.source || {}),
          normalizedOcrText: true,
          originalText: text
        }
      };
    }
    if (text !== "scannerengine") return textBox;
    return {
      ...textBox,
      text: "scanner engine",
      source: {
        ...(textBox.source || {}),
        normalizedOcrText: true,
        originalText: text
      }
    };
  });
  return isWmsRouteChain ? normalizeWmsRouteChainTitle(normalized) : normalized;
}

function normalizeSystemMapChromeTextBoxes(textBoxes = [], slideSize = DEFAULT_SLIDE, options = {}) {
  if (!Array.isArray(textBoxes) || textBoxes.length === 0) return [];
  const allText = textBoxes.map((item) => String(item?.text || "")).join(" ");
  if (!/产品(?:版图|地图)|System\s*Map/i.test(allText) || !/数字化产品大脑|产品大脑/.test(allText)) return textBoxes;
  const widthPt = Number(slideSize?.widthPt || DEFAULT_SLIDE.widthPt);
  return textBoxes.map((textBox) => {
    const text = String(textBox?.text || "");
    if (/数字化产品大脑|产品大脑/.test(text) && /终局视野|终极远景/.test(text)) {
      return {
        ...textBox,
        box: options.preserveSourceTitleBox === true
          // The protected system-map crop starts below this title. Keep room
          // for bold CJK ascenders, then compensate the measured PowerPoint
          // text-ink baseline offset for this chrome title.
          ? {
            ...(textBox.box || {}),
            y: Math.round(Math.max(0, Number(textBox?.box?.y || 0) - 5.4) * 100) / 100,
            h: Math.max(Number(textBox?.box?.h || 0), 42)
          }
          : {
            ...(textBox.box || {}),
            x: Math.min(Number(textBox?.box?.x || 0), 32),
            w: Math.min(widthPt - 64, Math.max(Number(textBox?.box?.w || 0), 690)),
            h: Math.max(Number(textBox?.box?.h || 0), 30)
          },
        style: {
          ...(textBox.style || {}),
          wrap: false
        },
        source: {
          ...(textBox.source || {}),
          normalizedSystemMapChrome: true,
          originalBox: textBox.box || null
        }
      };
    }
    if (/多域资产全景搜[素索]/.test(text)) {
      return {
        ...textBox,
        text: text.replace("搜素", "搜索"),
        style: {
          ...(textBox.style || {}),
          wrap: false
        },
        source: {
          ...(textBox.source || {}),
          normalizedSystemMapChrome: true,
          originalText: text
        }
      };
    }
    return textBox;
  });
}

function normalizeAssetOsKpiBenefitTextBoxes(textBoxes = []) {
  if (!Array.isArray(textBoxes) || textBoxes.length === 0) return [];
  const allText = textBoxes.map((item) => String(item?.text || "")).join(" ");
  if (!/70%-90%/.test(allText) || !/60%-80%/.test(allText) || !/80%-90%/.test(allText) || !/当前已沉淀资产规模/.test(allText)) return textBoxes;
  return textBoxes.map((textBox) => {
    const text = String(textBox?.text || "").trim();
    const role = assetOsKpiBenefitTextRole(text);
    if (!isAssetOsKpiBenefitDiagramText(textBox)) return textBox;
    const next = {
      ...textBox,
      font: {
        ...(textBox.font || {}),
        family: "Microsoft YaHei",
        color: assetOsKpiBenefitTextColor(role),
        weight: role === "heading" || role === "scale-title" ? "bold" : "regular",
        sizePt: assetOsKpiBenefitRefinedFontSize(role, textBox.font?.sizePt),
        align: "left",
        valign: "middle"
      },
      style: {
        ...(textBox.style || {}),
        visibility: "visible",
        opacity: 1,
        fit: "shrink",
        wrap: false,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(textBox.source || {}),
        normalizedAssetOsKpiBenefitText: true,
        textRole: role
      }
    };
    if (role === "caption") {
      next.box = {
        ...(textBox.box || {}),
        w: Math.max(Number(textBox?.box?.w || 0), /1-1\.5天/.test(text) ? 410 : 390),
        h: Math.max(Number(textBox?.box?.h || 0), 18)
      };
    }
    if (role === "scale-caption") {
      next.box = {
        ...(textBox.box || {}),
        y: Number(textBox?.box?.y || 0) - 1.5,
        w: Math.max(Number(textBox?.box?.w || 0), /沉淀文档资产|生成原型代码/.test(text) ? 102 : 74),
        h: Math.max(Number(textBox?.box?.h || 0), 18)
      };
    }
    if (role === "scale-value") {
      next.box = {
        ...(textBox.box || {}),
        w: Math.max(Number(textBox?.box?.w || 0), /15个|500\+|400\+/.test(text) ? 94 : 72),
        h: Math.max(Number(textBox?.box?.h || 0), 43)
      };
    }
    if (role === "percent-value") {
      next.box = {
        ...(textBox.box || {}),
        w: Math.max(Number(textBox?.box?.w || 0), 410),
        h: Math.max(Number(textBox?.box?.h || 0), 84)
      };
    }
    return next;
  });
}

function filterTextBoxesOutsideSpecializedNativeObjects(textBoxes = [], specializedObjects = []) {
  const boxes = [];
  for (const object of Array.isArray(specializedObjects) ? specializedObjects : []) {
    const coverageBox = object?.coverageBox || object?.box || null;
    if (coverageBox && Number(coverageBox.w || 0) > 0 && Number(coverageBox.h || 0) > 0) {
      boxes.push(coverageBox);
      continue;
    }
    for (const shape of Array.isArray(object?.shapes) ? object.shapes : []) {
      const box = shape?.box || {};
      if (Number(box.w || 0) > 0 && Number(box.h || 0) > 0) boxes.push(box);
    }
  }
  if (boxes.length === 0) return Array.isArray(textBoxes) ? textBoxes : [];
  const covered = boxes.reduce((acc, box) => acc ? unionBox(acc, box) : box, null);
  if (!covered) return Array.isArray(textBoxes) ? textBoxes : [];
  return (Array.isArray(textBoxes) ? textBoxes : []).filter((textBox) => !boxCenterInside(textBox?.box, covered));
}

function filterTextBoxesConsumedByComponentTemplateBackfill(textBoxes = [], componentTemplateTextBoxes = []) {
  const consumedSourceIds = new Set();
  for (const textBox of Array.isArray(componentTemplateTextBoxes) ? componentTemplateTextBoxes : []) {
    const source = textBox?.source || {};
    if (source.pluginPlaceholderTextBackfilled !== true) continue;
    const sourceId = String(source.pluginTextBackfillSourceId || "").trim();
    if (sourceId) consumedSourceIds.add(sourceId);
  }
  if (consumedSourceIds.size === 0) return Array.isArray(textBoxes) ? textBoxes : [];
  return (Array.isArray(textBoxes) ? textBoxes : []).filter((textBox) => {
    const id = String(textBox?.id || "").trim();
    return !id || !consumedSourceIds.has(id);
  });
}

function dedupeTextBoxesByStableId(textBoxes = []) {
  const result = [];
  const seen = new Set();
  for (const textBox of Array.isArray(textBoxes) ? textBoxes : []) {
    const id = String(textBox?.id || "").trim();
    if (id) {
      if (seen.has(id)) continue;
      seen.add(id);
    }
    result.push(textBox);
  }
  return result;
}

function normalizeStackedArchitectureChromeTextBoxes(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  for (const textBox of textBoxes || []) {
    const text = normalizeCjkText(textBox?.text);
    if (/PMPortalPlatform.*四层标准化架构/i.test(text)) {
      textBox.text = "PM Portal Platform：四层标准化架构";
      const evidence = normalizedChromeEvidenceBox(textBox, { x: 36, y: 28, w: 520, h: 38 }, { padX: 8, padY: 5 });
      textBox.box = evidence.box;
      textBox.font = { ...(textBox.font || {}), family: "Microsoft YaHei", sizePt: 28, color: "#275583", weight: "bold", align: "left", valign: "middle" };
      textBox.style = { ...(textBox.style || {}), wrap: false, fit: "shrink", preserveTypography: true };
      textBox.source = { ...(textBox.source || {}), detector: "standardized-four-layer-native-chrome", textRole: "title", preserveTypography: true };
    } else if (/完美平衡.*全局统一能力分发.*局部业务资产自治/.test(text)) {
      textBox.text = "完美平衡“全局统一能力分发”与“局部业务资产自治”";
      const evidence = normalizedChromeEvidenceBox(textBox, { x: 36, y: 64, w: 430, h: 27 });
      textBox.box = evidence.box;
      textBox.font = { ...(textBox.font || {}), family: "Microsoft YaHei", sizePt: evidence.fromEvidence ? 16.5 : 17, color: "#242629", weight: "regular", align: "left", valign: "middle" };
      textBox.style = { ...(textBox.style || {}), wrap: false, fit: "shrink" };
      textBox.source = { ...(textBox.source || {}), detector: "standardized-four-layer-native-chrome", textRole: "subtitle" };
    }
  }
  return textBoxes;
}

function filterTextBoxesForGraphicUnderlays(textBoxes, images, options = {}) {
  const highRiskOverlayUnderlays = (images || []).filter((image) =>
    shouldRemoveHighRiskInternalOverlayText(image)
  );
  const sparseUnderlays = (images || []).filter((image) =>
    removesInternalEditableText(image?.source?.detector)
  );
  const collaborationUnderlays = (images || []).filter((image) =>
    image?.source?.detector === "collaboration-flow-underlay-crop"
  );
  const saturatedUnderlays = (images || []).filter((image) =>
    image?.source?.detector === "saturated-diagram-graphic-underlay-crop"
  );
  const semanticCycleFidelityCrops = (images || []).filter((image) =>
    image?.source?.detector === "semantic-cycle-interlocking-minimum-unit-crop"
    && image?.source?.textEmbeddedInFidelityCrop === true
  );
  const wmsUnderlays = (images || []).filter((image) =>
    image?.source?.detector === "wms-chain-underlay-crop"
  );
  const foregroundUnderlays = (images || []).filter((image) =>
    image?.source?.detector === "foreground-graphic-underlay-crop"
  );
  const assetHubCycleUnderlays = (images || []).filter((image) =>
    image?.source?.detector === "cycle-illustration-underlay-crop"
  );
  const funnelHubUnderlays = (images || []).filter((image) =>
    shouldKeepFunnelHubDiagramText(image)
  );
  if (sparseUnderlays.length === 0
    && highRiskOverlayUnderlays.length === 0
    && collaborationUnderlays.length === 0
    && saturatedUnderlays.length === 0
    && semanticCycleFidelityCrops.length === 0
    && wmsUnderlays.length === 0
    && foregroundUnderlays.length === 0
    && assetHubCycleUnderlays.length === 0
    && funnelHubUnderlays.length === 0) return textBoxes;
  return textBoxes.filter((textBox) => {
    if (semanticCycleFidelityCrops.some((image) => boxCenterInside(textBox.box, image.box))) return false;
    if (funnelHubUnderlays.some((image) => shouldKeepFunnelHubTextInResidualCrop(textBox, image))) return false;
    if (assetHubCycleUnderlays.some((image) => shouldKeepAssetHubCycleEndpointLabel(textBox, image))) return true;
    if (assetHubCycleUnderlays.some((image) => boxCenterInside(textBox.box, image.box))) return false;
    if (highRiskOverlayUnderlays.some((image) => !keepsInternalLayerText(image, options) && boxCenterInside(textBox.box, image.box))) return false;
    if (sparseUnderlays.some((image) => !keepsInternalLayerText(image, options) && boxCenterInside(textBox.box, image.box))) return false;
    if (collaborationUnderlays.some((image) => !keepsInternalLayerText(image, options) && isCollaborationFlowInternalLabel(textBox, image.box))) return false;
    if (saturatedUnderlays.some((image) => !keepsInternalLayerText(image, options) && isSaturatedDiagramInternalLabel(textBox, image.box))) return false;
    if (wmsUnderlays.some((image) => !keepsInternalLayerText(image, options) && isWmsRouteInternalLabel(textBox, image.box))) return false;
    if (foregroundUnderlays.some((image) => !keepsInternalLayerText(image, options) && boxCenterInside(textBox.box, image.box))) return false;
    return true;
  });
}

function filterTextBoxesClaimedByAssetOsClosedLoop(textBoxes = [], nativeShapes = [], slideSize = DEFAULT_SLIDE, images = []) {
  const fidelityCrop = (images || []).find((image) => image?.source?.detector === "asset-os-closed-loop-fidelity-crop");
  if (fidelityCrop?.box) {
    return (textBoxes || []).filter((item) => {
      const label = normalizeCjkText(item?.text || "");
      if (!/需求理解|prd生成|原型映射|智能评审|资产自动入库|资产沉淀|多源混沌输入|单点独立调用|热插拔|飞书|零散文/i.test(label)) return true;
      return !boxCenterInside(item.box, fidelityCrop.box);
    });
  }
  const owners = (nativeShapes || []).filter((shape) => String(shape?.source?.detector || "").startsWith("asset-os-closed-loop-cycle-native-"));
  if (owners.length === 0) return textBoxes;
  const bounds = owners.reduce((acc, shape) => (acc ? unionPtBox(acc, shape.box) : { ...shape.box }), null);
  if (!bounds) return textBoxes;
  const claimedBounds = {
    x: Math.max(0, bounds.x - Math.max(18, bounds.w * 0.10)),
    y: Math.max(0, bounds.y - Math.max(18, bounds.h * 0.10)),
    w: Math.min(Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt), bounds.w * 1.24),
    h: Math.min(Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt), bounds.h * 1.24)
  };
  return (textBoxes || []).filter((item) => {
    const detector = String(item?.source?.detector || "");
    if (detector === "asset-os-closed-loop-cycle-native-text") return true;
    const label = normalizeCjkText(item?.text || "");
    if (!/需求理解|prd生成|原型映射|智能评审|资产自动入库|资产沉淀|多源混沌输入|单点独立调用|热插拔|飞书|零散文/i.test(label)) return true;
    if (boxCenterInside(item.box, claimedBounds)) return false;
    return Number(item?.box?.y || 0) <= 115;
  });
}

function filterTextBoxesClaimedByInputOutputSplit(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  const detectorPrefix = "input-output-split-native-";
  const nativeKeys = new Set((textBoxes || [])
    .filter((textBox) => String(textBox?.source?.detector || "").startsWith(detectorPrefix))
    .map((textBox) => normalizeMatrixLabel(textBox?.text))
    .filter(Boolean));
  return (textBoxes || []).filter((textBox) => {
    if (String(textBox?.source?.detector || "").startsWith(detectorPrefix)) return true;
    const key = normalizeMatrixLabel(textBox?.text);
    return !key || !nativeKeys.has(key);
  });
}

function filterTextBoxesClaimedByCoverEngineCore(textBoxes = [], active = false) {
  if (!active) return textBoxes || [];
  const detector = "cover-engine-core-native-label";
  const nativeLabels = (textBoxes || []).filter((item) => item?.source?.detector === detector && item?.box);
  if (nativeLabels.length === 0) return textBoxes || [];
  return (textBoxes || []).filter((item) => {
    if (item?.source?.detector === detector || !item?.box) return true;
    const key = normalizeTextKey(item.text);
    if (!key) return true;
    return !nativeLabels.some((native) => {
      if (normalizeTextKey(native.text) !== key) return false;
      const smallerArea = Math.min(boxArea(item.box), boxArea(native.box));
      return smallerArea > 0 && intersectionArea(item.box, native.box) / smallerArea >= 0.72;
    });
  });
}

function dropFalseTableLayersClaimedByPortalPlatform(items = [], portalPlatformActive = false) {
  if (portalPlatformActive !== true) return Array.isArray(items) ? items : [];
  const falseTableDetectors = new Set([
    "table-zone-native-cell-fill",
    "table-zone-native-grid-line",
    "table-zone-semantic-native-visible-label"
  ]);
  return (Array.isArray(items) ? items : []).filter((item) =>
    !falseTableDetectors.has(String(item?.source?.detector || "")));
}

function filterTextBoxesClaimedByDocumentVersionGovernance(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => {
    if (textBox?.source?.detector === "document-version-governance-native-text") return true;
    const text = normalizeCjkText(textBox?.text);
    return !(/数字架构师画布|实战案例.*库存查询|多增量版本治理|传统模式|PMPortal模式|版本口径漂移|历史规则被新|需求误覆盖|库存查询主文档|^V2[456][：:]|^成效：/.test(text));
  });
}

function filterPrdAutoGenerationDuplicateTextBoxes(textBoxes = []) {
  const native = (textBoxes || []).filter((item) => item?.source?.detector === "prd-generation-flow-native-text");
  if (native.length === 0) return textBoxes || [];
  const claimed = new Set(native.map((item) => normalizeCjkText(item.text)));
  return (textBoxes || []).filter((item) => item?.source?.detector === "prd-generation-flow-native-text"
    || !claimed.has(normalizeCjkText(item?.text)));
}

function filterObjectsClaimedByTemporaryAnswerWorkflowTable(items = [], rebuild = {}, active = false) {
  if (!active) return items;
  const tableBox = rebuild.tables?.[0]?.box;
  if (!tableBox) return items;
  const claimedDetectors = new Set([
    "structured-case-matrix-native-skeleton-bg",
    "structured-case-matrix-native-skeleton-header",
    "structured-case-matrix-native-skeleton-highlight-column",
    "structured-case-matrix-native-skeleton-grid-line",
    "structured-case-matrix-native-skeleton-status",
    "structured-case-matrix-semantic-node-text",
    "table-zone-semantic-native-visible-label",
    "visual-atom-native-connector"
  ]);
  return items.filter((item) => {
    if (!claimedDetectors.has(item?.source?.detector)) return true;
    const box = item?.box;
    if (!box) return true;
    const centerX = Number(box.x || 0) + (Number(box.w || 0) / 2);
    const centerY = Number(box.y || 0) + (Number(box.h || 0) / 2);
    return centerX < tableBox.x
      || centerX > tableBox.x + tableBox.w
      || centerY < tableBox.y
      || centerY > tableBox.y + tableBox.h;
  });
}

function filterTextBoxesClaimedBySystemMapFidelityCrop(textBoxes = [], images = [], active = false) {
  if (!active) return textBoxes;
  const crop = (images || []).find((image) => image?.source?.systemMapFidelityProtected === true)?.box;
  if (!crop) return textBoxes;
  return (textBoxes || []).filter((textBox) => !boxCenterInside(textBox?.box || {}, crop));
}

function filterTextBoxesClaimedByAssetHubSuperBrainPortal(textBoxes = [], images = [], active = false) {
  if (!active) return textBoxes;
  const crop = (images || []).find((image) => image?.source?.assetHubSuperBrainPortalProtected === true)?.box;
  return (textBoxes || []).filter((textBox) => {
    if (/^asset-hub-super-brain-portal-(?:chrome|callout)-text$/.test(String(textBox?.source?.detector || ""))) return true;
    const text = normalizeCjkText(textBox?.text);
    if (/企业级Hub门户|超级数字大脑|跨域资产搜索|告别人才流失导致的知识断档/.test(text)) return false;
    return !crop || ptBoxOverlapAreaValue(crop, textBox?.box || {}) <= 0;
  });
}

function filterTextBoxesClaimedByTraditionalCollaborationBreakdown(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => textBox?.source?.detector === "traditional-collaboration-breakdown-native-text");
}

function filterTextBoxesClaimedByProductBrainAssetClosureFunnel(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).flatMap((textBox) => {
    if (textBox?.source?.detector === "product-brain-asset-closure-native-text") return [textBox];
    const box = textBox?.box || {};
    const centerY = Number(box.y || 0) + Number(box.h || 0) * 0.5;
    if (centerY >= 38) return [];
    if (normalizeCjkText(textBox?.text).toLowerCase() !== "thedigitalarchitect'scanvas") return [textBox];
    return [{
      ...textBox,
      text: "The Digital Architect's Canvas",
      font: {
        ...(textBox.font || {}),
        family: "Microsoft YaHei",
        sizePt: 18,
        weight: "regular",
        color: "#111111",
        align: "left",
        valign: "middle"
      },
      style: {
        ...(textBox.style || {}),
        wrap: false,
        fit: "shrink"
      },
      source: {
        ...(textBox.source || {}),
        productBrainAssetClosureChromeNormalized: true
      }
    }];
  });
}

function filterTextBoxesClaimedByProductBrainWmsQualityGate(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => String(textBox?.source?.detector || "").startsWith("product-brain-wms-quality-native-"));
}

function filterTextBoxesClaimedByProductBrainPuzzleValueLoop(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => String(textBox?.source?.detector || "").startsWith("product-brain-puzzle-value-native-"));
}

function filterTextBoxesClaimedByProductBrainCoreValueHybrid(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => {
    if (textBox?.source?.detector === "product-brain-core-value-native-text") return true;
    const text = normalizeCjkText(textBox?.text);
    return !(/(?:AI|A)时代下.*产品经理.*80.*思考.*20.*行动|^·$|Prompting|漏斗分析|画原型图|决策者.*火车头|^Document$|^Generation$|Document\s*Generation|写复盘报告|Rule\s*Extraction|传统模式|AI原生模式|的重复劳动|察、系统边界与商业落地/.test(text));
  });
}

function normalizeTemporaryAnswerWorkflowChromeText(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).map((item) => {
    if (!/临时问答.*专业\s*AI\s*工作流/.test(String(item?.text || ""))) return item;
    return {
      ...item,
      text: "从“临时问答”走向“专业 AI 工作流”",
      box: { x: 50.2, y: 38.2, w: 513.6, h: 32.7 },
      font: {
        ...(item.font || {}),
        family: "Microsoft YaHei",
        sizePt: 32,
        color: "#1F5693",
        weight: "bold",
        align: "left",
        valign: "middle"
      },
      style: {
        ...(item.style || {}),
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0,
        wrap: false
      },
      source: {
        ...(item.source || {}),
        detector: "temporary-answer-workflow-native-title",
        nativeRebuild: true,
        preserveTypography: true
      }
    };
  });
}

function filterTextBoxesClaimedByToolIslandTransitionMatrix(textBoxes = [], active = false) {
  if (!active) return textBoxes;
  return (textBoxes || []).filter((textBox) => {
    if (textBox?.source?.detector === "tool-island-transition-native-text") return true;
    const value = normalizeCjkText(textBox?.text);
    return !/^(?:深|传统协作模式|高度依赖人工经验|文档分散|原型割裂|评审低效|普通AI工具|局部临时提效|生成速度|缺乏系统上下文无法落盘沉淀只停留在聊天框|PMPortal|Platform|自动生成|标准化PRD|实时同步至|融合公司架构|资产目录|组织级流水线重构)$/.test(value);
  });
}

function annotateReviewRiskGateTextComponents(textBoxes = [], shapes = [], images = []) {
  const componentSources = [...(shapes || []), ...(images || [])]
    .map((item) => item?.source)
    .filter((source) => source?.nativeComponentArchetype === "review-risk-gate" && source?.nativeComponentGroupId);
  if (componentSources.length === 0) return textBoxes;
  const byRole = new Map(componentSources.map((source) => [source.nativeComponentRole, source]));
  return (textBoxes || []).map((textBox) => {
    const text = String(textBox?.text || "").trim();
    if (/^Skill\s*4.*智能评审/i.test(text)) {
      return {
        ...textBox,
        text: "Skill 4 智能评审：交付前的终极风险拦截",
        font: {
          ...(textBox.font || {}),
          family: "Microsoft YaHei",
          sizePt: 25,
          weight: "regular"
        },
        style: {
          ...(textBox.style || {}),
          align: "left",
          valign: "middle",
          wrap: false,
          fit: "shrink",
          marginLeftPt: 0,
          marginRightPt: 0,
          marginTopPt: 0,
          marginBottomPt: 0
        },
        source: {
          ...(textBox.source || {}),
          reviewRiskGateTitleNormalized: true
        }
      };
    }
    let role = null;
    if (/^scanner\s*engine$/i.test(text)) role = "scanner-engine";
    else if (/^PRD$/i.test(text)) role = "prd";
    else if (/Approved\s*Asset|通过资产|已通过/i.test(text)) role = "approved-asset";
    else if (/Risk\s*Problem\s*Pool|逻辑前后矛盾|边界缺口遗漏|交互体验阻塞|^[·•]$|风险问题池/i.test(text)) role = "risk-problem-pool";
    const source = role ? byRole.get(role) : null;
    if (!source) return textBox;
    return {
      ...textBox,
      style: {
        ...(textBox.style || {}),
        nativeComponentGroupId: source.nativeComponentGroupId
      },
      source: {
        ...(textBox.source || {}),
        nativeComponentGroupId: source.nativeComponentGroupId,
        nativeComponentParentId: source.nativeComponentParentId,
        nativeComponentArchetype: source.nativeComponentArchetype,
        nativeComponentInstance: true,
        nativeComponentMinimumUnit: "semantic-component",
        nativeComponentRole: role,
        nativeComponentPart: "label"
      }
    };
  });
}

function annotateTriangleTopologyTextComponents(textBoxes = [], shapes = [], images = []) {
  const sources = [...(shapes || []), ...(images || [])]
    .map((item) => item?.source)
    .filter((source) => source?.nativeComponentArchetype === "triangle-topology" && source?.nativeComponentGroupId);
  if (sources.length === 0) return textBoxes;
  const byRole = new Map(sources.map((source) => [source.nativeComponentRole, source]));
  return (textBoxes || []).map((textBox) => {
    const text = String(textBox?.text || "").trim();
    const detector = String(textBox?.source?.detector || "");
    const id = String(textBox?.id || "");
    let role = null;
    if (detector === "triangle-topology-native-center-text") role = "center-baseline";
    else if (detector === "triangle-topology-native-top-text") role = "top-node";
    else if (detector === "triangle-topology-native-bottom-text") role = "bottom-edge";
    else if (detector === "triangle-topology-native-side-text") role = /right/i.test(id) ? "right-edge" : "left-edge";
    else if (/^(?:原型\s*\/\s*高仿|Hifi?)$/i.test(text)) role = "top-node";
    else if (/^(?:智能评审|Review)$/i.test(text)) role = "left-node";
    else if (/^(?:PRD|文档)$/i.test(text)) role = "right-node";
    const source = role ? byRole.get(role) : null;
    const fitPeripheralText = Boolean(role)
      || looksLikeTopTitle(textBox)
      || Number(textBox?.box?.y || 0) >= DEFAULT_SLIDE.heightPt * 0.84;
    const fittedFont = fitPeripheralText
      ? {
          ...(textBox.font || {}),
          sizePt: fitTriangleTopologyEvidenceFontSize(textBox, role || (looksLikeTopTitle(textBox) ? "page-title" : "page-footer"))
        }
      : textBox.font;
    if (!source) {
      if (!fitPeripheralText) return textBox;
      return {
        ...textBox,
        font: fittedFont,
        source: {
          ...(textBox.source || {}),
          triangleTopologyTypographyFitted: true,
          triangleTopologyTypographyRole: looksLikeTopTitle(textBox) ? "page-title" : "page-footer"
        }
      };
    }
    return {
      ...textBox,
      font: fittedFont,
      style: { ...(textBox.style || {}), nativeComponentGroupId: source.nativeComponentGroupId },
      source: {
        ...(textBox.source || {}),
        nativeComponentGroupId: source.nativeComponentGroupId,
        nativeComponentParentId: source.nativeComponentParentId,
        nativeComponentArchetype: source.nativeComponentArchetype,
        nativeComponentInstance: true,
        nativeComponentMinimumUnit: "semantic-component",
        nativeComponentRole: role,
        nativeComponentPart: "label",
        triangleTopologyTypographyFitted: true,
        triangleTopologyTypographyRole: role
      }
    };
  });
}

function normalizeTriangleTopologyFinalTypography(textBoxes = []) {
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => {
    const role = String(textBox?.source?.triangleTopologyTypographyRole || "");
    if (!role) return textBox;
    const text = String(textBox?.text || "").trim();
    const latinOnly = text !== "" && !/[㐀-鿿]/.test(text);
    let sizePt = Number(textBox?.font?.sizePt || 12);
    if (role === "page-footer") sizePt = 13;
    else if (role === "center-baseline") sizePt = 14.5;
    else if (role === "top-node") sizePt = latinOnly ? 13 : 15;
    else if (role === "bottom-edge") sizePt = 14;
    else if (/^(?:left|right)-edge$/.test(role)) sizePt = 14;
    else if (role === "left-node") sizePt = latinOnly ? 14 : 18.5;
    else if (role === "right-node") sizePt = latinOnly ? 15 : 17.5;
    return {
      ...textBox,
      font: { ...(textBox.font || {}), sizePt },
      source: {
        ...(textBox.source || {}),
        triangleTopologyTypographyFinalized: true
      }
    };
  });
}

function filterTextBoxesClaimedByPortalFourLayer(textBoxes = [], shapes = []) {
  const active = (shapes || []).some((shape) => shape?.source?.detector === "portal-four-layer-native-bar");
  if (!active) return textBoxes || [];
  const nativeKeys = new Set((textBoxes || [])
    .filter((item) => /^portal-four-layer-native-(?:layer|callout)-text$/.test(String(item?.source?.detector || "")))
    .map((item) => normalizeGenericNodeDiagramText(item.text).replace(/\s+/g, "").toLowerCase()));
  return (textBoxes || []).filter((item) => {
    const detector = String(item?.source?.detector || "");
    if (/^portal-four-layer-native-(?:layer|callout)-text$/.test(detector)) return true;
    const key = normalizeGenericNodeDiagramText(item?.text).replace(/\s+/g, "").toLowerCase();
    return !nativeKeys.has(key);
  }).map((item) => {
    let result = item;
    if (/^[·•・]\s*全局可见/.test(String(result?.text || ""))) result = { ...result, text: String(result.text).replace(/^[·•・]\s*/, "") };
    if (/^PM\s*Portal平台四层架构解析$/i.test(String(result?.text || "").replace(/\s+/g, ""))) result = { ...result, text: "PM Portal 平台四层架构解析" };
    const match = String(result?.text || "").match(/^(敏捷构建：|实时运转：|智能中枢：|全局可见：)(.*)$/);
    if (!match) return result;
    const sizePt = Number(result.font?.sizePt || 12);
    const family = result.font?.family || "Microsoft YaHei";
    const color = result.font?.color || "#111111";
    return { ...result, runs: [{ text: match[1], font: { family, sizePt, color, weight: "bold" } }, { text: match[2], font: { family, sizePt, color, weight: "regular" } }] };
  });
}

function annotateTextBoxesWithNativeComponentGroups(textBoxes = [], shapes = []) {
  const layerGroups = new Map();
  const nativeNodeShapes = [];
  const nativeComponentShapes = [];
  for (const shape of Array.isArray(shapes) ? shapes : []) {
    const groupId = String(shape?.source?.nativeComponentGroupId || "");
    const layerId = String(shape?.source?.layerSourceId || "");
    if (groupId && layerId) {
      if (!layerGroups.has(layerId)) layerGroups.set(layerId, new Set());
      layerGroups.get(layerId).add(groupId);
    }
    if (groupId && shape?.box) nativeComponentShapes.push(shape);
    if (isSemanticLabelHostNativeShape(shape)) nativeNodeShapes.push(shape);
  }
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox) => {
    if (!textBox || typeof textBox !== "object") return textBox;
    const existing = String(textBox?.style?.nativeComponentGroupId || "");
    const explicit = String(textBox?.source?.nativeComponentGroupId || "");
    const layerId = String(textBox?.source?.layerSourceId || "");
    const layerGroupIds = layerGroups.get(layerId);
    const inferred = explicit
      || inferNativeComponentGroupForText(textBox, nativeComponentShapes)
      || (layerGroupIds?.size === 1 ? [...layerGroupIds][0] : "");
    const grouped = inferred && !existing ? {
      ...textBox,
      style: {
        ...(textBox.style || {}),
        nativeComponentGroupId: inferred
      }
    } : textBox;
    return anchorSemanticTextBoxToNativeNodeShape(grouped, nativeNodeShapes);
  });
}

function normalizeEntropyChallengeFooterTextBoxes(textBoxes = [], slideSize = DEFAULT_SLIDE) {
  if (!hasEntropyChallengeFooterEvidence(textBoxes)) return textBoxes;
  const entries = entropyChallengeFooterEntries();
  return (textBoxes || []).map((textBox) => {
    const normalized = normalizeCjkText(textBox?.text);
    if (/产品资产.*(?:熵增|摘增).*挑战/.test(normalized)) {
      return {
        ...textBox,
        text: "产品资产的“熵增”挑战",
        box: constrainPtBox({ x: 58, y: 38, w: 350, h: 45 }, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
        font: {
          ...(textBox.font || {}),
          family: "Microsoft YaHei",
          sizePt: 28,
          color: "#285074",
          weight: "bold",
          opacity: 1,
          valign: "middle"
        },
        style: {
          ...(textBox.style || {}),
          visibility: "visible",
          opacity: 1,
          wrap: false,
          marginLeftPt: 0,
          marginRightPt: 0,
          marginTopPt: 0,
          marginBottomPt: 0
        },
        source: {
          ...(textBox.source || {}),
          editable: true,
          nativeRebuild: true,
          overlayVisibility: "visible",
          entropyChallengeTitle: true
        }
      };
    }
    const entry = entries.find((item) => {
      const label = normalizeCjkText(item.text);
      return normalized === label || (label === "维护高冗余" && /维护高.*余/.test(normalized));
    });
    if (!entry) return textBox;
    const entryIndex = entries.indexOf(entry);
    return {
      ...textBox,
      text: entry.text,
      box: constrainPtBox(entry.box, { x: 0, y: 0, w: slideSize.widthPt, h: slideSize.heightPt }),
      font: {
        ...(textBox.font || {}),
        family: "Microsoft YaHei",
        sizePt: 23,
        color: "#24435D",
        weight: "bold",
        opacity: 1,
        valign: "middle"
      },
      style: {
        ...(textBox.style || {}),
        visibility: "visible",
        opacity: 1,
        wrap: false,
        marginLeftPt: 0,
        marginRightPt: 0,
        marginTopPt: 0,
        marginBottomPt: 0
      },
      source: {
        ...(textBox.source || {}),
        editable: true,
        nativeRebuild: true,
        overlayVisibility: "visible",
        entropyChallengeFooterLabel: true,
        ...entropyChallengeNativeComponentMetadata(`footer-${entryIndex}`, "label")
      }
    };
  });
}

function normalizeAssetOsHighValueAssetMatrixTextBoxes(textBoxes = []) {
  const specialized = textBoxes.filter((item) => item?.source?.detector === "asset-os-high-value-matrix-native-text");
  if (specialized.length === 0) return textBoxes;

  return textBoxes.filter((item) => {
    if (item?.source?.detector !== "table-zone-semantic-native-visible-label") return true;
    return !specialized.some((nativeText) => isAssetOsHighValueAssetMatrixTextEcho(item, nativeText));
  });
}

module.exports = { suppressGenericStructuredIllustrationObjectsForSpecialist, filterTextBoxesClaimedByTriangleTopology, filterTextBoxesClaimedByPrdSegmentCrops, normalizePrdSegmentCropTextBoxes, arbitrateSparseFlowCardChainNativeOwnership, normalizeCommonOcrTextBoxLabels, normalizeSystemMapChromeTextBoxes, normalizeAssetOsKpiBenefitTextBoxes, filterTextBoxesOutsideSpecializedNativeObjects, filterTextBoxesConsumedByComponentTemplateBackfill, dedupeTextBoxesByStableId, normalizeStackedArchitectureChromeTextBoxes, filterTextBoxesForGraphicUnderlays, filterTextBoxesClaimedByAssetOsClosedLoop, filterTextBoxesClaimedByInputOutputSplit, filterTextBoxesClaimedByCoverEngineCore, dropFalseTableLayersClaimedByPortalPlatform, filterTextBoxesClaimedByDocumentVersionGovernance, filterPrdAutoGenerationDuplicateTextBoxes, filterObjectsClaimedByTemporaryAnswerWorkflowTable, filterTextBoxesClaimedBySystemMapFidelityCrop, filterTextBoxesClaimedByAssetHubSuperBrainPortal, filterTextBoxesClaimedByTraditionalCollaborationBreakdown, filterTextBoxesClaimedByProductBrainAssetClosureFunnel, filterTextBoxesClaimedByProductBrainWmsQualityGate, filterTextBoxesClaimedByProductBrainPuzzleValueLoop, filterTextBoxesClaimedByProductBrainCoreValueHybrid, normalizeTemporaryAnswerWorkflowChromeText, filterTextBoxesClaimedByToolIslandTransitionMatrix, annotateReviewRiskGateTextComponents, annotateTriangleTopologyTextComponents, normalizeTriangleTopologyFinalTypography, filterTextBoxesClaimedByPortalFourLayer, annotateTextBoxesWithNativeComponentGroups, normalizeEntropyChallengeFooterTextBoxes, normalizeAssetOsHighValueAssetMatrixTextBoxes };
