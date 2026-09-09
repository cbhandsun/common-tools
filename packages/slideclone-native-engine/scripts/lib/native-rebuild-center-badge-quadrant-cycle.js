"use strict";

function createCenterBadgeQuadrantCycleFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    boxCenterInside,
    centerOfBox,
    clampPtBoxToSlide,
    constrainPtBox,
    cropPng,
    darkerHex,
    eraseDarkPixelsInRects,
    ensureDir,
    expandPtBox,
    hexToRgb,
    normalizeCjkText,
    path,
    pixel,
    parseHex,
    ptBoxOverlapAreaValue,
    ptToPxBox,
    pxToPtBox,
    rgbToHex,
    round,
    roundedBox,
    sampleInkColor,
    safeIdentifier,
    temporaryAnswerWorkflowTextBox,
    writePng
  } = dependencies;

  function createCenterBadgeQuadrantCycleObjects(page = {}, rawTextBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE, options = {}) {  
    const layout = inferCenterBadgeQuadrantCycleLayout(page, rawTextBoxes, slideSize);  
    if (!layout) return { shapes: [], textBoxes: [] };  
    const { image, box, centerTextBox, quadrantTextBoxes } = layout;  
    const fidelityCrop = createCenterBadgeQuadrantCycleFidelityCrop({  
      sourceImage,  
      box,  
      externalTextBoxes: (rawTextBoxes || []).filter((item) => item?.box && !boxCenterInside(item.box, box)),  
      slideSize,  
      assetDir: options.assetDir,  
      irDir: options.irDir,  
      deckName: options.deckName,  
      pageIndex: options.pageIndex,  
      sourceImageId: image.id  
    });  
    image.source = {  
      ...(image.source || {}),  
      editable: false,  
      nativeRebuild: true,  
      centerBadgeQuadrantCycleObjectified: true,  
      dropErasedResidualAfterNativeRebuild: true,  
      expressionForm: fidelityCrop ? "screenshot-or-document" : "structured-diagram",  
      expressionSubtype: "center-badge-quadrant-cycle",  
      recommendedAction: fidelityCrop ? "keep-local-crop" : "rebuild-native-quadrants-arrows-badge-and-text",  
      nonEditableReason: fidelityCrop  
        ? `${image.source?.nonEditableReason || image.source?.reason || "quadrant cycle underlay"}; central authored cycle illustration retained as one protected fidelity crop with embedded labels`  
        : `${image.source?.nonEditableReason || image.source?.reason || "quadrant cycle underlay"}; fully replaced by measured native quadrant-cycle minimum units`  
    };  
    const source = (detector, extra = {}) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      expressionForm: "structured-diagram",  
      expressionSubtype: "center-badge-quadrant-cycle",  
      confidence: 0.93,  
      ...extra  
    });  
    if (fidelityCrop) {  
      const externalTextBoxes = centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes, box, sourceImage, slideSize, source);  
      return { shapes: [], textBoxes: externalTextBoxes, images: [fidelityCrop], box };  
    }  
    const sampledColors = sampleCenterBadgeQuadrantCycleColors(sourceImage, box, slideSize);  
    const quarterColors = [sampledColors.topLeft, sampledColors.topRight, sampledColors.bottomLeft, sampledColors.bottomRight];  
    const quarterKeys = ["top-left", "top-right", "bottom-left", "bottom-right"];  
    const componentMetadata = (role, part) => ({  
      nativeComponentGroupId: `center-badge-quadrant-cycle-${role}`,  
      nativeComponentParentId: "center-badge-quadrant-cycle",  
      nativeComponentArchetype: role === "center" ? "quadrant-cycle-center" : "quadrant-cycle-segment",  
      nativeComponentInstance: true,  
      nativeComponentMinimumUnit: "semantic-component",  
      nativeComponentRole: role,  
      nativeComponentPart: part  
    });  
    const shapes = quarterKeys.map((key, index) => ({  
      id: `center-badge-cycle-quadrant-${key}`,  
      type: "freeform",  
      box: { ...box },  
      style: {  
        fill: quarterColors[index],  
        stroke: "none",  
        strokeWidthPt: 0,  
        freeformSegments: centerBadgeQuadrantSegments(key)  
      },  
      source: source("center-badge-quadrant-cycle-native-quadrant", {  
        quadrant: key,  
        sampledFill: quarterColors[index],  
        ...componentMetadata(key, "segment")  
      })  
    }));  
    shapes.push(  
      {  
        id: "center-badge-cycle-divider-horizontal",  
        type: "line",  
        box: { x: box.x, y: box.y + box.h / 2, w: box.w, h: 0 },  
        style: { stroke: "#FFFFFF", strokeWidthPt: Math.max(6, box.h * 0.018), connectorType: "straight" },  
        source: source("center-badge-quadrant-cycle-native-divider", { axis: "horizontal", ...componentMetadata("center", "divider") })  
      },  
      {  
        id: "center-badge-cycle-divider-vertical",  
        type: "line",  
        box: { x: box.x + box.w / 2, y: box.y, w: 0, h: box.h },  
        style: { stroke: "#FFFFFF", strokeWidthPt: Math.max(6, box.w * 0.018), connectorType: "straight" },  
        source: source("center-badge-quadrant-cycle-native-divider", { axis: "vertical", ...componentMetadata("center", "divider") })  
      }  
    );  
    for (const key of quarterKeys) {  
      shapes.push({  
        id: `center-badge-cycle-arrow-${key}`,  
        type: "freeform",  
        box: { ...box },  
        style: {  
          fill: "none",  
          stroke: sampledColors.arrow,  
          strokeWidthPt: Math.max(10, box.w * 0.026),  
          closePath: false,  
          endArrow: "triangle",  
          freeformSegments: centerBadgeCycleArrowSegments(key),  
          shadow: { color: sampledColors.arrow, alpha: 0.14, blurPt: 2.5, distancePt: 1, angle: 45 }  
        },  
        source: source("center-badge-quadrant-cycle-native-arrow", {  
          quadrant: key,  
          sampledStroke: sampledColors.arrow,  
          ...componentMetadata(key, "arrow")  
        })  
      });  
    }  
    const badgeSize = Math.min(box.w, box.h) * 0.255;  
    const badgeBox = {  
      x: box.x + box.w / 2 - badgeSize / 2,  
      y: box.y + box.h / 2 - badgeSize / 2,  
      w: badgeSize,  
      h: badgeSize  
    };  
    const innerInset = badgeSize * 0.075;  
    shapes.push(  
      {  
        id: "center-badge-cycle-badge-ring",  
        type: "ellipse",  
        box: badgeBox,  
        style: { fill: "#FFFFFF", stroke: "#E4E7EA", strokeWidthPt: 1.2, shadow: { color: "#6C7680", alpha: 0.2, blurPt: 5, distancePt: 2, angle: 45 } },  
        source: source("center-badge-quadrant-cycle-native-badge", { part: "ring", ...componentMetadata("center", "badge") })  
      },  
      {  
        id: "center-badge-cycle-badge-core",  
        type: "ellipse",  
        box: { x: badgeBox.x + innerInset, y: badgeBox.y + innerInset, w: badgeBox.w - innerInset * 2, h: badgeBox.h - innerInset * 2 },  
        style: { fill: sampledColors.badge, stroke: darkerHex(sampledColors.badge, 0.18), strokeWidthPt: 1.1 },  
        source: source("center-badge-quadrant-cycle-native-badge", { part: "core", sampledFill: sampledColors.badge, ...componentMetadata("center", "badge") })  
      }  
    );  
    const externalTextBoxes = centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes, box, sourceImage, slideSize, source, componentMetadata);  
    const textBoxes = quadrantTextBoxes.flatMap((items, quadrantIndex) => items.map((item, lineIndex) => {  
      const sampledInk = sourceImage ? sampleInkColor(sourceImage, item.box, slideSize, quadrantIndex === 1 || quadrantIndex === 2 ? "#FFFFFF" : "#102A43") : (quadrantIndex === 1 || quadrantIndex === 2 ? "#FFFFFF" : "#102A43");  
      const repairedText = repairCenterBadgeCycleOcrText(item.text);  
      const internalTypography = normalizeCenterBadgeCycleInternalLabel(repairedText, item.box);  
      return temporaryAnswerWorkflowTextBox(  
        `center-badge-cycle-label-${quadrantIndex + 1}-${lineIndex + 1}`,  
        repairedText,  
        internalTypography.box,  
        {  
          family: item.font?.family || "Microsoft YaHei",  
          sizePt: Number(item.font?.sizePt || (lineIndex === 0 ? 18 : 13.5)),  
          color: sampledInk,  
          weight: lineIndex === 0 ? "bold" : "regular",  
          align: "center"  
        },  
        source("center-badge-quadrant-cycle-native-text", {  
          quadrantIndex,  
          lineIndex,  
          ocrLineGeometry: true,  
          ...(repairedText !== item.text ? { ocrSourceText: item.text, ocrTextRepaired: true } : {}),  
          ...componentMetadata(quarterKeys[quadrantIndex], "internal-text")  
        })  
      );  
    }));  
    textBoxes.push(temporaryAnswerWorkflowTextBox(  
      "center-badge-cycle-center-label",  
      centerTextBox.text,  
      { x: badgeBox.x + badgeSize * 0.12, y: badgeBox.y + badgeSize * 0.22, w: badgeSize * 0.76, h: badgeSize * 0.56 },  
      { family: centerTextBox.font?.family || "Microsoft YaHei", sizePt: Math.max(34, Number(centerTextBox.font?.sizePt || 30) * 1.28), color: "#FFFFFF", weight: "bold", align: "center" },  
      source("center-badge-quadrant-cycle-native-text", {  
        role: "center-badge",  
        ocrLineGeometry: true,  
        ...componentMetadata("center", "center-text")  
      })  
    ));  
    textBoxes.unshift(...externalTextBoxes);  
    return { shapes, textBoxes, box };  
  }  
    
  function createCenterBadgeQuadrantCycleFidelityCrop({ sourceImage, box, externalTextBoxes = [], slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName = "deck", pageIndex = 0, sourceImageId = null } = {}) {  
    if (!sourceImage || !assetDir || !box?.w || !box?.h) return null;  
    ensureDir(assetDir);  
    const cropBox = clampPtBoxToSlide(box, slideSize);  
    // External captions can deliberately overlap the outer edge of the circle.  
    // Remove their source glyphs before adding native editable text above the crop.  
    const overlappingExternalText = (externalTextBoxes || [])  
      .filter((item) => item?.box && ptBoxOverlapAreaValue(cropBox, item.box) > 0);  
    const textMasks = overlappingExternalText  
      .map((item) => ptToPxBox(expandPtBox(item.box, slideSize, 2, 2), sourceImage, slideSize, 0));  
    const cleanedSource = textMasks.length > 0  
      ? eraseDarkPixelsInRects(sourceImage, textMasks, { maxLuma: 235 })  
      : { image: sourceImage, erasedPixels: 0 };  
    const file = path.join(assetDir, `${safeIdentifier(`${deckName}-p${String(Number(pageIndex) + 1).padStart(2, "0")}-center-badge-cycle`, "center-badge-cycle")}.png`);  
    const cropPixels = ptToPxBox(cropBox, sourceImage, slideSize, 0);  
    writePng(file, cropPng(cleanedSource.image, cropPixels));  
    return {  
      id: `center-badge-quadrant-cycle-fidelity-crop-${Number(pageIndex) || 0}`,  
      type: "fidelity-crop",  
      assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),  
      // The extracted raster is integer-pixel aligned. Use its projected bounds  
      // so the presentation renderer does not rescale the diagram by a fraction  
      // of a pixel and introduce a visible halo along the circular edge.  
      box: pxToPtBox(cropPixels, sourceImage, slideSize, 0),  
      source: {  
        editable: false,  
        nativeRebuild: true,  
        detector: "center-badge-quadrant-cycle-fidelity-crop",  
        expressionForm: "screenshot-or-document",  
        expressionSubtype: "center-badge-quadrant-cycle-illustration",  
        recommendedAction: "keep-local-crop",  
        textEmbeddedInFidelityCrop: true,  
        textErasedFromCrop: overlappingExternalText.length > 0,  
        erasedExternalTextBoxCount: overlappingExternalText.length,  
        erasedTextPixelCount: cleanedSource.erasedPixels,  
        protectedMinimumUnit: true,  
        intentionalMinimumUnitCrop: true,  
        parentImageId: sourceImageId,  
        nonEditableReason: "four-quadrant circular illustration retained as a protected local crop; its embedded labels are intentionally not duplicated as native text"  
      }  
    };  
  }  
    
  function centerBadgeQuadrantCycleExternalTextBoxes(rawTextBoxes = [], box = {}, sourceImage = null, slideSize = DEFAULT_SLIDE, source = () => ({}), componentMetadata = () => ({})) {  
    return (rawTextBoxes || [])  
      .filter((item) => !boxCenterInside(item?.box, box))  
      .map((item, index) => {  
        const itemCenterX = Number(item.box?.x || 0) + Number(item.box?.w || 0) / 2;  
        const itemCenterY = Number(item.box?.y || 0) + Number(item.box?.h || 0) / 2;  
        const quadrant = `${itemCenterY < box.y + box.h / 2 ? "top" : "bottom"}-${itemCenterX < box.x + box.w / 2 ? "left" : "right"}`;  
        const repairedText = repairCenterBadgeCycleOcrText(item.text);  
        const externalTypography = normalizeCenterBadgeCycleExternalTitle(repairedText, item.box, quadrant);  
        return temporaryAnswerWorkflowTextBox(  
          `center-badge-cycle-external-text-${index + 1}`,  
          externalTypography.text,  
          externalTypography.box,  
          {  
            family: item.font?.family || "Microsoft YaHei",  
            sizePt: Number(externalTypography.font?.sizePt || item.font?.sizePt || 14),  
            color: sourceImage ? sampleInkColor(sourceImage, item.box, slideSize, "#102A43") : "#102A43",  
            weight: externalTypography.font?.weight || inferWeight(item, "regular"),  
            align: "left"  
          },  
          source("center-badge-quadrant-cycle-native-text", {  
            role: "external-explanation",  
            sourceTextId: item.id || null,  
            ocrLineGeometry: true,  
            ...(externalTypography.text !== item.text ? { ocrSourceText: item.text, ocrTextRepaired: true } : {}),  
            ...componentMetadata(quadrant, "external-text")  
          })  
        );  
      });  
  }  
    
  function normalizeCenterBadgeCycleExternalTitle(text, box = {}, quadrant = "") {  
    const value = String(text || "");  
    const compact = value.replace(/\s+/g, "").replace(/[（(]/g, "(").replace(/[）)]/g, ")");  
    const normalizedText = /^(?:资产复利|效率提速)\(.+\)$/.test(compact)  
      ? compact.replace(/^(资产复利|效率提速)\(/, "$1 (").replace("KnowledgeAsset)", "Knowledge Asset)")  
      : normalizeCenterBadgeCycleExternalCopy(value);  
    if (!/^(?:资产复利|效率提速) \(.+\)$/.test(normalizedText)) {  
      return {  
        text: normalizedText,  
        box,  
        font: {}  
      };  
    }  
    const minWidth = quadrant === "top-left" ? 285 : 225;  
    return {  
      text: normalizedText,  
      box: { ...box, w: Math.max(Number(box.w || 0), minWidth) },  
      font: { weight: "bold" }  
    };  
  }  
    
  function normalizeCenterBadgeCycleExternalCopy(value) {  
    const compact = String(value || "").replace(/\s+/g, "");  
    if (/^60%-90%时间$/.test(compact)) return "60%-90% 时间";  
    if (/^项目落幕不再是资产的终结[，,]?$/.test(compact)) return "项目落幕不再是资产的终结，";  
    if (/^质量控制全线左移[（(]Shift-Left[）)]$/.test(compact)) return "质量控制全线左移 (Shift-Left)";  
    return String(value || "");  
  }  
    
  function normalizeCenterBadgeCycleInternalLabel(text, box = {}) {  
    // LibreOffice/PowerPoint can wrap the final parenthesis in the narrow OCR  
    // evidence box. Preserve its center but give this known label one safe line.  
    if (text !== "(Efficiency)") return { box };  
    const width = Math.max(Number(box.w || 0), 112);  
    const center = Number(box.x || 0) + Number(box.w || 0) / 2;  
    return {  
      box: {  
        ...box,  
        x: round(center - width / 2),  
        w: width  
      }  
    };  
  }  
    
  function repairCenterBadgeCycleOcrText(value) {  
    const text = String(value || "").trim();  
    if (!text) return text;  
    const compact = text.replace(/\s+/g, "").replace(/[（(]/g, "(").replace(/[）)]/g, ")");  
    if (/^资产复利\(KnowledgeAsset\)$/.test(compact)) return "资产复利（Knowledge Asset）";  
    if (/^\(KnowledgeAsset\)$/.test(compact)) return "(Knowledge Asset)";  
    if (/^\(Efficiency\)+$/.test(compact)) return "(Efficiency)";  
    if (/^\(Standardization\)+$/.test(compact)) return "(Standardization)";  
    if (/^\(Quality\)+$/.test(compact)) return "(Quality)";  
    if (/^标准统[—一-]?$/.test(text)) return "标准统一";  
    return text;  
  }  
    
  function inferCenterBadgeQuadrantCycleLayout(page = {}, rawTextBoxes = [], slideSize = DEFAULT_SLIDE) {  
    const slideArea = Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));  
    for (const image of page.images || []) {  
      const box = image?.box || {};  
      const areaRatio = Number(box.w || 0) * Number(box.h || 0) / slideArea;  
      const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));  
      if (areaRatio < 0.28 || areaRatio > 0.5 || aspect < 0.82 || aspect > 1.18) continue;  
      if (!/(?:underlay|diagram|graphic|process)/i.test(String(image?.source?.detector || ""))) continue;  
      const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;  
      const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;  
      const internal = (rawTextBoxes || []).filter((item) => boxCenterInside(item?.box, box));  
      if (internal.length < 9 || internal.length > 16) continue;  
      const centerCandidates = internal.filter((item) => {  
        const itemBox = item?.box || {};  
        const itemCenterX = Number(itemBox.x || 0) + Number(itemBox.w || 0) / 2;  
        const itemCenterY = Number(itemBox.y || 0) + Number(itemBox.h || 0) / 2;  
        const shortLabel = normalizeCjkText(item?.text || "").length >= 1 && normalizeCjkText(item?.text || "").length <= 6;  
        return shortLabel  
          && Math.abs(itemCenterX - centerX) <= Number(box.w || 0) * 0.14  
          && Math.abs(itemCenterY - centerY) <= Number(box.h || 0) * 0.14;  
      });  
      if (centerCandidates.length !== 1) continue;  
      const centerTextBox = centerCandidates[0];  
      const buckets = [[], [], [], []];  
      for (const item of internal) {  
        if (item === centerTextBox) continue;  
        const itemBox = item?.box || {};  
        const itemCenterX = Number(itemBox.x || 0) + Number(itemBox.w || 0) / 2;  
        const itemCenterY = Number(itemBox.y || 0) + Number(itemBox.h || 0) / 2;  
        const index = itemCenterY < centerY ? (itemCenterX < centerX ? 0 : 1) : (itemCenterX < centerX ? 2 : 3);  
        buckets[index].push(item);  
      }  
      if (!buckets.every((items) => items.length === 2)) continue;  
      const ordered = buckets.map((items) => [...items].sort((a, b) => Number(a.box?.y || 0) - Number(b.box?.y || 0)));  
      const pairedLines = ordered.every((items) => {  
        const gap = Math.abs(Number(items[1].box?.y || 0) - Number(items[0].box?.y || 0));  
        return gap >= 14 && gap <= Number(box.h || 0) * 0.13;  
      });  
      if (!pairedLines) continue;  
      return { image, box: roundedBox(box), centerTextBox, quadrantTextBoxes: ordered };  
    }  
    return null;  
  }  
    
  function centerBadgeQuadrantSegments(key) {  
    // Exact cubic-Bezier handle offset for a quarter circle with radius 0.5.  
    // The previous empirically rounded value flattened the outer quadrants and  
    // made the native cycle visibly diverge from the circular source artwork.  
    const k = 0.223857;  
    const paths = {  
      "top-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0, y: k }, { x: k, y: 0 }, { x: 0.5, y: 0 }] }],  
      "top-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0.5, y: 0 }] }, { type: "cubicBezTo", points: [{ x: 1 - k, y: 0 }, { x: 1, y: k }, { x: 1, y: 0.5 }] }],  
      "bottom-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 0.5, y: 1 }] }, { type: "cubicBezTo", points: [{ x: k, y: 1 }, { x: 0, y: 1 - k }, { x: 0, y: 0.5 }] }],  
      "bottom-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.5 }] }, { type: "lnTo", points: [{ x: 1, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 1, y: 1 - k }, { x: 1 - k, y: 1 }, { x: 0.5, y: 1 }] }]  
    };  
    return [...(paths[key] || []), { type: "close" }];  
  }  
    
  function centerBadgeCycleArrowSegments(key) {  
    const paths = {  
      "top-left": [{ type: "moveTo", points: [{ x: 0.11, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0.11, y: 0.285 }, { x: 0.285, y: 0.11 }, { x: 0.5, y: 0.11 }] }],  
      "top-right": [{ type: "moveTo", points: [{ x: 0.5, y: 0.11 }] }, { type: "cubicBezTo", points: [{ x: 0.715, y: 0.11 }, { x: 0.89, y: 0.285 }, { x: 0.89, y: 0.5 }] }],  
      "bottom-right": [{ type: "moveTo", points: [{ x: 0.89, y: 0.5 }] }, { type: "cubicBezTo", points: [{ x: 0.89, y: 0.715 }, { x: 0.715, y: 0.89 }, { x: 0.5, y: 0.89 }] }],  
      "bottom-left": [{ type: "moveTo", points: [{ x: 0.5, y: 0.89 }] }, { type: "cubicBezTo", points: [{ x: 0.285, y: 0.89 }, { x: 0.11, y: 0.715 }, { x: 0.11, y: 0.5 }] }]  
    };  
    return paths[key] || [];  
  }  
    
  function sampleCenterBadgeQuadrantCycleColors(sourceImage, box, slideSize = DEFAULT_SLIDE) {  
    const sample = (xRatio, yRatio, fallback) => {  
      if (!sourceImage?.rgba || !sourceImage.width || !sourceImage.height) return fallback;  
      const sx = sourceImage.width / Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt);  
      const sy = sourceImage.height / Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt);  
      const x = clamp(Math.round((box.x + box.w * xRatio) * sx), 0, sourceImage.width - 1);  
      const y = clamp(Math.round((box.y + box.h * yRatio) * sy), 0, sourceImage.height - 1);  
      const colors = [];  
      for (let dy = -3; dy <= 3; dy += 1) {  
        for (let dx = -3; dx <= 3; dx += 1) {  
          colors.push(pixel(sourceImage, clamp(x + dx, 0, sourceImage.width - 1), clamp(y + dy, 0, sourceImage.height - 1)));  
        }  
      }  
      return rgbToHex(averageColor(colors));  
    };  
    const sampleQuadrant = (points, fallback) => {  
      if (!sourceImage?.rgba || !sourceImage.width || !sourceImage.height) return fallback;  
      const colors = points.map(([x, y]) => parseHex(sample(x, y, fallback)))  
        .filter((color) => !(color.g > color.r * 1.12 && color.g > color.b * 1.08))  
        .filter((color) => luma(color) < 250 && luma(color) > 35);  
      return colors.length > 0 ? rgbToHex(averageColor(colors)) : fallback;  
    };  
    const arrowCandidate = parseHex(sample(0.5, 0.17, "#34C76B"));  
    const badgeCandidate = parseHex(sample(0.5, 0.5, "#E60032"));  
    return {  
      topLeft: sampleQuadrant([[0.16, 0.27], [0.22, 0.18], [0.28, 0.12]], "#E1E7EF"),  
      topRight: sampleQuadrant([[0.84, 0.27], [0.78, 0.18], [0.72, 0.12]], "#14599A"),  
      bottomLeft: sampleQuadrant([[0.16, 0.73], [0.22, 0.82], [0.28, 0.88]], "#14599A"),  
      bottomRight: sampleQuadrant([[0.84, 0.73], [0.78, 0.82], [0.72, 0.88]], "#E1E7EF"),  
      arrow: arrowCandidate.g > arrowCandidate.r * 1.15 && arrowCandidate.g > arrowCandidate.b * 1.1 ? rgbToHex(arrowCandidate) : "#34C76B",  
      badge: badgeCandidate.r > badgeCandidate.g * 1.35 && badgeCandidate.r > badgeCandidate.b * 1.2 ? rgbToHex(badgeCandidate) : "#E60032"  
    };  
  }

  return {
    createCenterBadgeQuadrantCycleObjects,
    createCenterBadgeQuadrantCycleFidelityCrop,
    centerBadgeQuadrantCycleExternalTextBoxes,
    normalizeCenterBadgeCycleExternalTitle,
    normalizeCenterBadgeCycleExternalCopy,
    normalizeCenterBadgeCycleInternalLabel,
    repairCenterBadgeCycleOcrText,
    inferCenterBadgeQuadrantCycleLayout,
    centerBadgeQuadrantSegments,
    centerBadgeCycleArrowSegments,
    sampleCenterBadgeQuadrantCycleColors
  };
}

module.exports = {
  createCenterBadgeQuadrantCycleFactory
};
