"use strict";

function createStructuredIllustrationCardsFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    clampPtBoxToSlide,
    constrainPtBox,
    freeformBounds,
    lineBox,
    ptBoxOverlapAreaRatio,
    round,
    roundRatio,
    shouldPreserveImageCropUnderNativeAssistants,
    structuredIllustrationCardShellBoxes,
    structuredIllustrationSmallWarningTriangleBox,
    structuredIllustrationWaveWarningIconShapes
  } = dependencies;

  function createStructuredIllustrationCardShellShapes(images = [], slideSize = DEFAULT_SLIDE) {  
    const shapes = [];  
    for (const image of images || []) {  
      if (!shouldObjectifyStructuredIllustrationCardShell(image)) continue;  
      const cardBoxes = structuredIllustrationCardShellBoxes(image, slideSize);  
      if (cardBoxes.length < 2 || cardBoxes.length > 5) continue;  
      image.source = {  
        ...(image.source || {}),  
        structuredIllustrationShellObjectified: true,  
        objectifiedStructuredIllustrationShells: cardBoxes.length  
      };  
      for (let index = 0; index < cardBoxes.length; index += 1) {  
        shapes.push(...structuredIllustrationCardShellShapesForBox(image, cardBoxes[index], index, slideSize));  
      }  
    }  
    return shapes;  
  }
  
  function shouldObjectifyStructuredIllustrationCardShell(image = {}) {  
    const source = image?.source || {};  
    const layer = source.layer || {};  
    const understanding = layer.diagramUnderstanding || {};  
    return source.editable !== true  
      && String(source.detector || "") === "illustration-card-graphic-underlay-crop"  
      && layer.layerType === "illustration-zone"  
      && layer.recommendedAction === "split-native-with-residual-crop"  
      && understanding.archetype === "process-with-screenshots"  
      && Number(understanding.confidence || 0) >= 0.82  
      && Number(image?.box?.w || 0) >= Number(image?.box?.h || 0) * 1.6;  
  }
  
  function structuredIllustrationCardShellShapesForBox(image, card, index, slideSize = DEFAULT_SLIDE) {  
    const base = image.id || "structured-illustration";  
    const accent = "#F97316";  
    const border = "#5B6B78";  
    const background = "#FFFFFF";  
    const preserveCrop = shouldPreserveImageCropUnderNativeAssistants(image);  
    const source = (detector, part, box) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector,  
      layerSourceId: image.id || null,  
      layerType: image.source?.layer?.layerType || "illustration-zone",  
      cardIndex: index,  
      cardPart: part,  
      confidence: 0.88,  
      regionBox: box  
    });  
    const topH = Math.max(3.2, Math.min(5.4, card.h * 0.010));  
    return [  
      {  
        id: `${base}-structured-card-${index}-background`,  
        type: "roundRect",  
        box: { x: card.x, y: card.y, w: card.w, h: card.h },  
        style: {  
          fill: preserveCrop ? "none" : background,  
          stroke: border,  
          strokeWidthPt: 0.9,  
          radiusRatio: 0.018,  
          ...(preserveCrop ? {} : { shadow: { color: "#1F2937", alpha: 0.20, blurPt: 5.5, distancePt: 1.4, angleDeg: 90 } })  
        },  
        source: source("structured-illustration-card-native-background", "background", card)  
      },  
      {  
        id: `${base}-structured-card-${index}-top-accent`,  
        type: "rect",  
        box: { x: card.x, y: card.y, w: card.w, h: topH },  
        style: { fill: accent, stroke: "none", strokeWidthPt: 0 },  
        source: source("structured-illustration-card-native-accent", "top-accent", card)  
      }  
    ].map((shape) => ({  
      ...shape,  
      box: clampPtBoxToSlide(shape.box, slideSize)  
    }));  
  }
  
  function createStructuredIllustrationCardTitleWarningShapes(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {  
    const expectedTitles = ["混沌的输入端", "瓶颈的处理端", "割裂的输出端"];  
    const normalizedText = (textBoxes || []).map((item) => String(item?.text || "")).join("\n");  
    if (!expectedTitles.every((title) => normalizedText.includes(title))) return [];  
    const cardBackgrounds = (cardShellShapes || [])  
      .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))  
      .slice(0, expectedTitles.length);  
    if (cardBackgrounds.length < expectedTitles.length) return [];  
    return cardBackgrounds.flatMap((shape, index) => structuredIllustrationCardTitleWarningShapes(shape.box, index, slideSize));  
  }
  
  function structuredIllustrationCardTitleWarningShapes(cardBox = {}, index = 0, slideSize = DEFAULT_SLIDE) {  
    const x = Number(cardBox.x || 0);  
    const y = Number(cardBox.y || 0);  
    const w = Number(cardBox.w || 0);  
    const h = Number(cardBox.h || 0);  
    if (w <= 0 || h <= 0) return [];  
    const size = round(Math.min(32, Math.max(24, Math.min(w * 0.115, h * 0.085))));  
    const triangleBox = {  
      x: round(x + w * 0.058),  
      y: round(y + h * 0.052),  
      w: size,  
      h: round(size * 0.92)  
    };  
    const bar = {  
      x: round(triangleBox.x + triangleBox.w * 0.46),  
      y: round(triangleBox.y + triangleBox.h * 0.26),  
      w: round(Math.max(2.2, triangleBox.w * 0.10)),  
      h: round(triangleBox.h * 0.38)  
    };  
    const dot = {  
      x: round(triangleBox.x + triangleBox.w * 0.455),  
      y: round(triangleBox.y + triangleBox.h * 0.72),  
      w: round(Math.max(2.8, triangleBox.w * 0.13)),  
      h: round(Math.max(2.8, triangleBox.h * 0.13))  
    };  
    const source = (part, partBox) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-warning-icon-native",  
      iconPart: part,  
      warningVariant: "card-title-warning",  
      confidence: 0.9,  
      regionBox: partBox  
    });  
    return [  
      {  
        id: `structured-illustration-card-title-warning-triangle-${index}`,  
        type: "triangle",  
        box: clampPtBoxToSlide(triangleBox, slideSize),  
        style: { fill: "#F97316", stroke: "none", strokeWidthPt: 0, opacity: 1 },  
        source: source("triangle", triangleBox)  
      },  
      {  
        id: `structured-illustration-card-title-warning-bar-${index}`,  
        type: "rect",  
        box: clampPtBoxToSlide(bar, slideSize),  
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.1 },  
        source: source("exclamation-bar", bar)  
      },  
      {  
        id: `structured-illustration-card-title-warning-dot-${index}`,  
        type: "ellipse",  
        box: clampPtBoxToSlide(dot, slideSize),  
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },  
        source: source("exclamation-dot", dot)  
      }  
    ];  
  }
  
  function createStructuredIllustrationProcessingWarningShapes(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {  
    const hasProcessingTitle = (textBoxes || []).some((item) => /瓶颈的处理端/.test(String(item.text || "")));  
    if (!hasProcessingTitle) return [];  
    const cardBackgrounds = (cardShellShapes || [])  
      .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));  
    const middleCard = cardBackgrounds[1]?.box || null;  
    if (!middleCard?.w || !middleCard?.h) return [];  
    const box = clampPtBoxToSlide({  
      x: round(Number(middleCard.x || 0) + Number(middleCard.w || 0) * 0.31),  
      y: round(Number(middleCard.y || 0) + Number(middleCard.h || 0) * 0.14),  
      w: round(Number(middleCard.w || 0) * 0.35),  
      h: round(Number(middleCard.h || 0) * 0.17)  
    }, slideSize);  
    const source = (part, partBox) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-warning-icon-native",  
      layerType: "illustration-zone",  
      iconPart: part,  
      warningVariant: "processing-warning-beacon",  
      confidence: 0.86,  
      regionBox: partBox  
    });  
    return structuredIllustrationWaveWarningIconShapes({  
      base: "structured-illustration-processing-warning",  
      box,  
      fill: "#F97316",  
      source,  
      index: 0,  
      slideSize  
    });  
  }
  
  function createStructuredIllustrationOutputDocumentShapes(page = {}, textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {  
    const cardBackgrounds = (cardShellShapes || [])  
      .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));  
    if (cardBackgrounds.length < 3) return [];  
    const hasOutputTitle = (textBoxes || []).some((item) => /割裂的输出端/.test(String(item.text || "")));  
    if (!hasOutputTitle) return [];  
    const outputCard = cardBackgrounds[cardBackgrounds.length - 1].box;  
    if (!outputCard?.w || !outputCard?.h) return [];  
    const existingNative = (page.shapes || []).some((shape) =>  
      shape?.source?.detector === "structured-illustration-output-document-native"  
      || shape?.source?.detector === "visual-atom-native-document"  
    );  
    if (existingNative) return [];  
    const bounds = { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt };  
    const base = "structured-illustration-output-document";  
    const doc = constrainPtBox({  
      x: outputCard.x + outputCard.w * 0.31,  
      y: outputCard.y + outputCard.h * 0.20,  
      w: outputCard.w * 0.40,  
      h: outputCard.h * 0.34  
    }, bounds);  
    const source = (part, box, confidence = 0.62) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-output-document-native",  
      layerSourceId: cardBackgrounds[cardBackgrounds.length - 1].source?.layerSourceId || null,  
      layerType: "illustration-zone",  
      iconPart: part,  
      confidence,  
      regionBox: box  
    });  
    const shapes = [  
      {  
        id: `${base}-back-page-blue`,  
        type: "rect",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.07, y: doc.y - doc.h * 0.04, w: doc.w * 0.86, h: doc.h * 0.90 }, bounds),  
        style: { fill: "#DBEAFE", stroke: "#2F80ED", strokeWidthPt: 1.1, opacity: 0.96 },  
        source: source("document-back-page", doc, 0.62)  
      },  
      {  
        id: `${base}-back-page-offset`,  
        type: "rect",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.13, y: doc.y + doc.h * 0.02, w: doc.w * 0.86, h: doc.h * 0.86 }, bounds),  
        style: { fill: "#BFDBFE", stroke: "#2F80ED", strokeWidthPt: 1, opacity: 0.92 },  
        source: source("document-back-page", doc, 0.6)  
      },  
      {  
        id: `${base}-page`,  
        type: "document",  
        box: doc,  
        style: { fill: "#F8FAFC", stroke: "#2F80ED", strokeWidthPt: 1.6 },  
        source: source("document-page", doc, 0.66)  
      },  
      {  
        id: `${base}-fold-corner`,  
        type: "right-triangle",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.74, y: doc.y + doc.h * 0.02, w: doc.w * 0.23, h: doc.h * 0.23 }, bounds),  
        style: { fill: "#E2E8F0", stroke: "#64748B", strokeWidthPt: 1.1, opacity: 0.98 },  
        source: source("document-fold-corner", doc, 0.62)  
      },  
      {  
        id: `${base}-chart-dot`,  
        type: "ellipse",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.17, y: doc.y + doc.h * 0.20, w: doc.w * 0.24, h: doc.w * 0.24 }, bounds),  
        style: { fill: "#F97316", stroke: "#F97316", strokeWidthPt: 0 },  
        source: source("document-chart", doc)  
      },  
      {  
        id: `${base}-chart-slice`,  
        type: "rect",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.29, y: doc.y + doc.h * 0.20, w: doc.w * 0.12, h: doc.w * 0.12 }, bounds),  
        style: { fill: "#2F80ED", stroke: "none", strokeWidthPt: 0 },  
        source: source("document-chart-slice", doc)  
      },  
      {  
        id: `${base}-chart-line-a`,  
        type: "line",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.52, y: doc.y + doc.h * 0.24, w: doc.w * 0.26, h: 0 }, bounds),  
        style: { stroke: "#2F80ED", strokeWidthPt: 1.3, connectorType: "straight" },  
        source: source("document-line", doc)  
      },  
      {  
        id: `${base}-chart-line-b`,  
        type: "line",  
        box: constrainPtBox({ x: doc.x + doc.w * 0.52, y: doc.y + doc.h * 0.38, w: doc.w * 0.20, h: 0 }, bounds),  
        style: { stroke: "#94A3B8", strokeWidthPt: 1.1, connectorType: "straight" },  
        source: source("document-line", doc)  
      }  
    ];  
    [0.50, 0.59, 0.68].forEach((ratio, index) => {  
      const lineBox = constrainPtBox({  
        x: doc.x + doc.w * 0.18,  
        y: doc.y + doc.h * ratio,  
        w: doc.w * (index === 2 ? 0.42 : 0.56),  
        h: 0  
      }, bounds);  
      shapes.push({  
        id: `${base}-body-line-${index}`,  
        type: "line",  
        box: lineBox,  
        style: { stroke: "#CBD5E1", strokeWidthPt: 1.1, connectorType: "straight" },  
        source: source("document-body-line", lineBox, 0.6)  
      });  
    });  
    const barBaseY = doc.y + doc.h * 0.79;  
    [  
      { x: 0.58, h: 0.12, color: "#94A3B8" },  
      { x: 0.69, h: 0.23, color: "#CBD5E1" },  
      { x: 0.80, h: 0.34, color: "#2F80ED" }  
    ].forEach((bar, index) => {  
      const barBox = constrainPtBox({  
        x: doc.x + doc.w * bar.x,  
        y: barBaseY - doc.h * bar.h,  
        w: doc.w * 0.07,  
        h: doc.h * bar.h  
      }, bounds);  
      shapes.push({  
        id: `${base}-bar-chart-${index}`,  
        type: "rect",  
        box: barBox,  
        style: { fill: bar.color, stroke: "#64748B", strokeWidthPt: 0.6, opacity: 0.96 },  
        source: source("document-bar-chart", barBox, 0.62)  
      });  
    });  
    const particleColors = ["#2F80ED", "#94A3B8", "#CBD5E1"];  
    const particles = [  
      [0.18, 0.56], [0.33, 0.60], [0.49, 0.58], [0.64, 0.63], [0.78, 0.59],  
      [0.25, 0.72], [0.42, 0.76], [0.59, 0.73], [0.74, 0.78],  
      [0.33, 0.89], [0.52, 0.91], [0.68, 0.88]  
    ];  
    particles.forEach(([rx, ry], index) => {  
      const size = outputCard.w * (index % 3 === 0 ? 0.020 : 0.016);  
      const box = constrainPtBox({  
        x: outputCard.x + outputCard.w * (0.30 + rx * 0.38),  
        y: outputCard.y + outputCard.h * (0.47 + ry * 0.22),  
        w: size,  
        h: size  
      }, bounds);  
      shapes.push({  
        id: `${base}-particle-${index}`,  
        type: "rect",  
        box,  
        style: { fill: particleColors[index % particleColors.length], stroke: "none", strokeWidthPt: 0 },  
        source: source("document-particle", box, 0.58)  
      });  
    });  
    return shapes;  
  }
  
  function createStructuredIllustrationInputDocumentShapes(page = {}, textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {  
    if (!page || !Array.isArray(page.images)) return [];  
    const cardBackgrounds = (cardShellShapes || [])  
      .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0));  
    if (cardBackgrounds.length < 3) return [];  
    const hasInputTitle = (textBoxes || []).some((item) => /混沌的输入端/.test(String(item.text || "")));  
    if (!hasInputTitle) return [];  
    const inputCard = cardBackgrounds[0].box;  
    const bounds = { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt };  
    const candidates = [];  
    const keptImages = [];  
    for (const image of page.images || []) {  
      if (isStructuredIllustrationInputDocumentResidual(image, inputCard)) candidates.push(image);  
      else keptImages.push(image);  
    }  
    if (candidates.length < 3) {  
      return createStructuredIllustrationInputDocumentFallbackShapes(page, inputCard, slideSize);  
    }  
    page.images = keptImages;  
    return candidates.flatMap((image, index) => structuredIllustrationInputDocumentResidualShapes(image, index, bounds));  
  }
  
  function createStructuredIllustrationInputDocumentFallbackShapes(page = {}, inputCard = {}, slideSize = DEFAULT_SLIDE) {  
    const hasStructuredCardResidual = (page.images || []).some((image) =>  
      image?.source?.detector === "structured-illustration-card-residual-crop"  
      && ptBoxOverlapAreaRatio(image.box || {}, inputCard) >= 0.45);  
    if (!hasStructuredCardResidual) return [];  
    const boxes = [  
      { x: 0.16, y: 0.26, w: 0.18, h: 0.20, r: -12 },  
      { x: 0.42, y: 0.22, w: 0.20, h: 0.24, r: 9 },  
      { x: 0.58, y: 0.42, w: 0.18, h: 0.21, r: -7 },  
      { x: 0.25, y: 0.57, w: 0.22, h: 0.18, r: 8 }  
    ];  
    const sourceImage = {  
      id: "structured-illustration-input-fallback",  
      source: {  
        detector: "structured-illustration-card-residual-crop",  
        residualFallback: true,  
        layer: { layerType: "illustration-zone" }  
      }  
    };  
    return boxes.flatMap((ratioBox, index) => {  
      const box = {  
        x: inputCard.x + inputCard.w * ratioBox.x,  
        y: inputCard.y + inputCard.h * ratioBox.y,  
        w: inputCard.w * ratioBox.w,  
        h: inputCard.h * ratioBox.h  
      };  
      return structuredIllustrationInputDocumentResidualShapes(  
        { ...sourceImage, id: `structured-illustration-input-fallback-${index}`, box, rotation: ratioBox.r },  
        index,  
        { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt }  
      );  
    });  
  }
  
  function createStructuredIllustrationInputChaosShapes(inputCard = {}, slideSize = DEFAULT_SLIDE) {  
    if (!inputCard?.w || !inputCard?.h) return [];  
    const x = Number(inputCard.x || 0);  
    const y = Number(inputCard.y || 0);  
    const w = Number(inputCard.w || 0);  
    const h = Number(inputCard.h || 0);  
    const paths = [  
      [[0.30, 0.37], [0.47, 0.42], [0.39, 0.55], [0.55, 0.50], [0.49, 0.65]],  
      [[0.46, 0.36], [0.58, 0.48], [0.50, 0.58], [0.62, 0.68], [0.53, 0.74]],  
      [[0.24, 0.52], [0.36, 0.49], [0.44, 0.64], [0.34, 0.72]],  
      [[0.61, 0.40], [0.70, 0.51], [0.60, 0.59], [0.72, 0.70]]  
    ];  
    const source = (index) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-input-chaos-native",  
      layerType: "illustration-zone",  
      iconPart: "chaos-zigzag",  
      confidence: 0.58,  
      pathIndex: index  
    });  
    return paths.map((path, index) => {  
      const absolutePoints = path.map(([px, py]) => ({ x: round(x + w * px), y: round(y + h * py) }));  
      const box = freeformBounds(absolutePoints);  
      const points = absolutePoints.map((point) => ({  
        x: roundRatio((point.x - box.x) / Math.max(0.1, box.w)),  
        y: roundRatio((point.y - box.y) / Math.max(0.1, box.h))  
      }));  
      return {  
        id: `structured-illustration-input-chaos-${index}`,  
        type: "polyline",  
        points,  
        box,  
        style: { stroke: "#F97316", strokeWidthPt: 1.8, fill: "none", lineCap: "round", opacity: 0.95 },  
        source: source(index)  
      };  
    }).map((shape) => ({  
      ...shape,  
      box: clampPtBoxToSlide(shape.box, slideSize)  
    }));  
  }
  
  function createStructuredIllustrationInputChaosGlyphObjects(textBoxes = [], cardShellShapes = [], slideSize = DEFAULT_SLIDE) {  
    const hasInputTitle = (textBoxes || []).some((item) => /混沌的输入端/.test(String(item.text || "")));  
    if (!hasInputTitle) return { shapes: [], textBoxes: [] };  
    const inputCardShape = (cardShellShapes || [])  
      .filter((shape) => shape?.source?.detector === "structured-illustration-card-native-background")  
      .sort((a, b) => Number(a.box?.x || 0) - Number(b.box?.x || 0))[0];  
    const inputCard = inputCardShape?.box || {};  
    if (!inputCard.w || !inputCard.h) return { shapes: [], textBoxes: [] };  
    const x = Number(inputCard.x || 0);  
    const y = Number(inputCard.y || 0);  
    const w = Number(inputCard.w || 0);  
    const h = Number(inputCard.h || 0);  
    const source = (part, regionBox, confidence = 0.64) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-input-chaos-native",  
      layerType: "illustration-zone",  
      iconPart: part,  
      confidence,  
      regionBox  
    });  
    const shape = (id, type, ratioBox, style, part, confidence) => {  
      const box = clampPtBoxToSlide({  
        x: round(x + w * ratioBox.x),  
        y: round(y + h * ratioBox.y),  
        w: round(w * ratioBox.w),  
        h: round(h * ratioBox.h)  
      }, slideSize);  
      return {  
        id: `structured-illustration-input-chaos-${id}`,  
        type,  
        box,  
        style,  
        source: source(part, box, confidence)  
      };  
    };  
    const glyphText = (id, text, ratioBox, color, sizeRatio, part) => {  
      const box = clampPtBoxToSlide({  
        x: round(x + w * ratioBox.x),  
        y: round(y + h * ratioBox.y),  
        w: round(w * ratioBox.w),  
        h: round(h * ratioBox.h)  
      }, slideSize);  
      return {  
        id: `structured-illustration-input-chaos-${id}`,  
        text,  
        box,  
        font: {  
          family: "SimHei",  
          sizePt: round(Math.max(12, w * sizeRatio)),  
          weight: "bold",  
          color,  
          align: "center",  
          valign: "middle"  
        },  
        style: { marginLeftPt: 0, marginRightPt: 0, marginTopPt: 0, marginBottomPt: 0, wrap: false },  
        source: source(part, box, 0.62)  
      };  
    };  
    const shapes = [  
      ...createStructuredIllustrationInputChaosShapes(inputCard, slideSize),  
      shape("bubble-left", "roundRect", { x: 0.19, y: 0.31, w: 0.17, h: 0.075 }, {  
        fill: "#FFFFFF",  
        stroke: "#94A3B8",  
        strokeWidthPt: 1.1,  
        radiusRatio: 0.28,  
        opacity: 0.95  
      }, "chat-bubble", 0.62),  
      shape("bubble-left-tail", "triangle", { x: 0.29, y: 0.37, w: 0.045, h: 0.04 }, {  
        fill: "#FFFFFF",  
        stroke: "#94A3B8",  
        strokeWidthPt: 1.1,  
        opacity: 0.95,  
        rotation: 32  
      }, "chat-bubble-tail", 0.58),  
      shape("bubble-right", "roundRect", { x: 0.57, y: 0.34, w: 0.16, h: 0.07 }, {  
        fill: "#FFFFFF",  
        stroke: "#F97316",  
        strokeWidthPt: 1.05,  
        radiusRatio: 0.28,  
        opacity: 0.94  
      }, "chat-bubble", 0.62),  
      shape("question-halo", "ellipse", { x: 0.22, y: 0.48, w: 0.095, h: 0.062 }, {  
        fill: "#FFF7ED",  
        stroke: "#F97316",  
        strokeWidthPt: 1,  
        opacity: 0.92  
      }, "question-halo", 0.6),  
      shape("alert-halo", "ellipse", { x: 0.66, y: 0.54, w: 0.082, h: 0.055 }, {  
        fill: "#FFF7ED",  
        stroke: "#F97316",  
        strokeWidthPt: 1,  
        opacity: 0.92  
      }, "alert-halo", 0.6)  
    ];  
    const textBoxesOut = [  
      glyphText("bubble-left-line-a", "…", { x: 0.215, y: 0.323, w: 0.06, h: 0.028 }, "#F97316", 0.055, "chat-bubble-text"),  
      glyphText("bubble-left-line-b", "…", { x: 0.275, y: 0.323, w: 0.06, h: 0.028 }, "#94A3B8", 0.055, "chat-bubble-text"),  
      glyphText("bubble-right-line", "!", { x: 0.615, y: 0.342, w: 0.04, h: 0.05 }, "#F97316", 0.072, "alert-mark"),  
      glyphText("question-mark", "?", { x: 0.229, y: 0.475, w: 0.075, h: 0.07 }, "#F97316", 0.085, "question-mark"),  
      glyphText("alert-mark", "!", { x: 0.675, y: 0.528, w: 0.05, h: 0.07 }, "#F97316", 0.082, "alert-mark")  
    ];  
    return { shapes, textBoxes: textBoxesOut };  
  }
  
  function dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers(page = {}, shapes = []) {  
    if (!page || !Array.isArray(page.images) || page.images.length === 0) return false;  
    const residualCount = page.images.filter((image) =>  
      image?.source?.detector === "structured-illustration-card-residual-crop"  
    ).length;  
    if (residualCount < 3) return false;  
    if (!structuredIllustrationNativeTemplateCoversCards(shapes)) return false;  
    page.images = page.images.filter((image) => {  
      if (image?.source?.detector !== "structured-illustration-card-residual-crop") return true;  
      image.source = {  
        ...(image.source || {}),  
        residualSplitDropped: true,  
        residualSplitDropReason: "structured-illustration-card-residual-covered-by-native-archetype-template"  
      };  
      return false;  
    });  
    return true;  
  }
  
  function structuredIllustrationNativeTemplateCoversCards(shapes = []) {  
    const countByDetector = (detector) => (shapes || [])  
      .filter((shape) => shape?.source?.detector === detector)  
      .length;  
    const cardBackgroundCount = countByDetector("structured-illustration-card-native-background");  
    const inputDocumentCount = countByDetector("structured-illustration-input-document-native");  
    const outputDocumentCount = countByDetector("structured-illustration-output-document-native");  
    const gearPersonCount = countByDetector("structured-illustration-card-gear-person-native")  
      + countByDetector("structured-illustration-gear-person-native");  
    const cycleArrowCount = (shapes || []).filter((shape) =>  
      /^visual-atom-native-cycle-arrow/.test(String(shape?.source?.detector || ""))  
    ).length;  
    const inputChaosCount = (shapes || []).filter((shape) =>  
      shape?.source?.detector === "structured-illustration-input-chaos-native"  
      && shape?.source?.iconPart === "chaos-zigzag"  
    ).length;  
    return cardBackgroundCount >= 3  
      && inputDocumentCount >= 12  
      && outputDocumentCount >= 14  
      && gearPersonCount >= 18  
      && (cycleArrowCount >= 1 || inputChaosCount >= 4);  
  }
  
  function isStructuredIllustrationInputDocumentResidual(image = {}, inputCard = {}) {  
    const source = image.source || {};  
    const box = image.box || {};  
    if (source.detector !== "structured-illustration-sparse-residual-crop") return false;  
    if (source.residualSplitMode !== "structured-illustration-sparse-residual") return false;  
    if (!box.w || !box.h || !inputCard.w || !inputCard.h) return false;  
    const centerX = Number(box.x || 0) + Number(box.w || 0) / 2;  
    const centerY = Number(box.y || 0) + Number(box.h || 0) / 2;  
    if (centerX < inputCard.x + inputCard.w * 0.02 || centerX > inputCard.x + inputCard.w * 0.95) return false;  
    if (centerY < inputCard.y + inputCard.h * 0.12 || centerY > inputCard.y + inputCard.h * 0.78) return false;  
    const areaRatio = Number(box.w || 0) * Number(box.h || 0) / Math.max(1, inputCard.w * inputCard.h);  
    const aspect = Number(box.w || 0) / Math.max(1, Number(box.h || 0));  
    return areaRatio >= 0.002  
      && areaRatio <= 0.055  
      && aspect >= 0.25  
      && aspect <= 3.2;  
  }
  
  function structuredIllustrationInputDocumentResidualShapes(image = {}, index = 0, bounds = DEFAULT_SLIDE) {  
    const box = image.box || {};  
    const base = image.id || `structured-input-document-${index}`;  
    const stroke = index % 2 === 0 ? "#94A3B8" : "#2F80ED";  
    const fill = index % 3 === 0 ? "#F8FAFC" : "#EFF6FF";  
    const doc = constrainPtBox({  
      x: Number(box.x || 0) + Number(box.w || 0) * 0.08,  
      y: Number(box.y || 0) + Number(box.h || 0) * 0.05,  
      w: Number(box.w || 0) * 0.76,  
      h: Number(box.h || 0) * 0.82  
    }, bounds);  
    const source = (part, partBox) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-input-document-native",  
      layerSourceId: image.source?.parentImageId || image.id || null,  
      residualSourceId: image.id || null,  
      residualDetector: image.source?.detector || null,  
      layerType: image.source?.layer?.layerType || "illustration-zone",  
      iconPart: part,  
      confidence: 0.58,  
      regionBox: partBox  
    });  
    const shapes = [  
      structuredIllustrationInputPaperShape(base, doc, index, fill, stroke, source)  
    ];  
    [0.28, 0.46, 0.64].forEach((ratio, lineIndex) => {  
      const lineBox = constrainPtBox({  
        x: doc.x + doc.w * 0.18,  
        y: doc.y + doc.h * ratio,  
        w: doc.w * (lineIndex === 2 ? 0.42 : 0.58),  
        h: 0  
      }, bounds);  
      shapes.push({  
        id: `${base}-native-document-line-${index}-${lineIndex}`,  
        type: "line",  
        box: lineBox,  
        rotation: index % 2 === 0 ? -14 : 10,  
        style: { stroke: lineIndex === 0 ? "#F97316" : stroke, strokeWidthPt: 0.9, connectorType: "straight" },  
        source: source("document-line", lineBox)  
      });  
    });  
    const scribble = structuredIllustrationInputPaperScribbleShape(base, doc, index, stroke, source, bounds);  
    if (scribble) shapes.push(scribble);  
    if (Number(box.w || 0) > Number(box.h || 0) * 1.8) {  
      const chipBox = constrainPtBox({ x: box.x + box.w * 0.10, y: box.y + box.h * 0.40, w: box.w * 0.72, h: Math.max(3, box.h * 0.16) }, bounds);  
      shapes.push({  
        id: `${base}-native-material-strip-${index}`,  
        type: "rect",  
        box: chipBox,  
        style: { fill: "#CBD5E1", stroke: "none", strokeWidthPt: 0 },  
        source: source("material-strip", chipBox)  
      });  
    }  
    return shapes;  
  }
  
  function structuredIllustrationInputPaperShape(base, doc, index, fill, stroke, source) {  
    const torn = index % 2 === 0;  
    const points = torn  
      ? [  
        { x: 0.10, y: 0.00 },  
        { x: 0.94, y: 0.06 },  
        { x: 0.88, y: 0.82 },  
        { x: 0.70, y: 0.78 },  
        { x: 0.62, y: 0.94 },  
        { x: 0.44, y: 0.84 },  
        { x: 0.28, y: 0.98 },  
        { x: 0.10, y: 0.88 },  
        { x: 0.00, y: 0.14 }  
      ]  
      : [  
        { x: 0.00, y: 0.00 },  
        { x: 0.78, y: 0.00 },  
        { x: 1.00, y: 0.20 },  
        { x: 0.95, y: 1.00 },  
        { x: 0.10, y: 0.94 },  
        { x: 0.00, y: 0.00 }  
      ];  
    return {  
      id: `${base}-native-document-${index}`,  
      type: "freeform",  
      points,  
      box: doc,  
      rotation: index % 2 === 0 ? -14 : 10,  
      style: { fill, stroke, strokeWidthPt: 1.1 },  
      source: source(torn ? "torn-document-page" : "folded-document-page", doc)  
    };  
  }
  
  function structuredIllustrationInputPaperScribbleShape(base, doc, index, stroke, source, bounds = DEFAULT_SLIDE) {  
    if (!doc?.w || !doc?.h) return null;  
    const box = constrainPtBox({  
      x: Number(doc.x || 0) + Number(doc.w || 0) * 0.18,  
      y: Number(doc.y || 0) + Number(doc.h || 0) * 0.68,  
      w: Number(doc.w || 0) * 0.46,  
      h: Number(doc.h || 0) * 0.12  
    }, bounds);  
    return {  
      id: `${base}-native-document-scribble-${index}`,  
      type: "polyline",  
      points: [  
        { x: 0.00, y: 0.50 },  
        { x: 0.24, y: 0.18 },  
        { x: 0.42, y: 0.62 },  
        { x: 0.64, y: 0.36 },  
        { x: 1.00, y: 0.54 }  
      ],  
      box,  
      rotation: index % 2 === 0 ? -14 : 10,  
      style: { stroke: index % 2 === 0 ? "#64748B" : stroke, strokeWidthPt: 0.85, fill: "none", lineCap: "round" },  
      source: source("document-scribble", box)  
    };  
  }

  return {
    createStructuredIllustrationCardShellShapes,
    createStructuredIllustrationCardTitleWarningShapes,
    createStructuredIllustrationProcessingWarningShapes,
    dropStructuredIllustrationCardResidualCropsWhenNativeTemplateCovers,
    createStructuredIllustrationOutputDocumentShapes,
    createStructuredIllustrationInputDocumentShapes,
    createStructuredIllustrationInputChaosGlyphObjects
  };
}

module.exports = { createStructuredIllustrationCardsFactory };
