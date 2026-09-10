"use strict";

function createStructuredIllustrationResidualsFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    averageColor,
    clamp,
    clampPtBoxToSlide,
    fs,
    lineBox,
    luma,
    pixel,
    readPng,
    resolveAssetPathForIr,
    rgbToHex,
    round,
    saturation,
    structuredIllustrationGearPersonGearShapes,
    structuredIllustrationGearPersonHumanShapes,
    structuredIllustrationGearPersonMotionShapes,
    structuredIllustrationWarningIconShapes
  } = dependencies;

  function createStructuredIllustrationResidualLineShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {  
    if (!page || !Array.isArray(page.images)) return [];  
    const shapes = [];  
    const nextImages = [];  
    for (const image of page.images) {  
      const lineShape = structuredIllustrationResidualLineShape(image, irDir, shapes.length, slideSize);  
      if (!lineShape) {  
        nextImages.push(image);  
        continue;  
      }  
      shapes.push(lineShape);  
      image.source = {  
        ...(image.source || {}),  
        structuredIllustrationResidualLineObjectified: true,  
        residualSplitDropped: true,  
        residualSplitDropReason: "structured-illustration-line-residual-rebuilt-as-native-shape"  
      };  
    }  
    page.images = nextImages;  
    return shapes;  
  }
  
  function structuredIllustrationResidualLineShape(image = {}, irDir = null, index = 0, slideSize = DEFAULT_SLIDE) {  
    const source = image.source || {};  
    if (source.detector !== "structured-illustration-sparse-residual-crop") return null;  
    if (source.residualSplitMode !== "structured-illustration-sparse-residual") return null;  
    const box = image.box || {};  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const horizontal = w >= 96 && h <= Math.max(14, w * 0.08);  
    const vertical = h >= 120 && w <= Math.max(28, h * 0.08);  
    if (!horizontal && !vertical) return null;  
    const areaRatio = w * h / Math.max(1, slideSize.widthPt * slideSize.heightPt);  
    if (areaRatio > 0.025) return null;  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    const color = assetFile && fs.existsSync(assetFile)  
      ? sampleStructuredResidualLineColor(readPng(assetFile), horizontal ? "h" : "v")  
      : "#CBD5E1";  
    return {  
      id: `${image.id || "structured-illustration-residual"}-native-line-${index}`,  
      type: "rect",  
      box: clampPtBoxToSlide(box, slideSize),  
      style: {  
        fill: color,  
        stroke: "none",  
        strokeWidthPt: 0,  
        opacity: 0.82  
      },  
      source: {  
        editable: true,  
        nativeRebuild: true,  
        detector: "structured-illustration-residual-native-line",  
        layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,  
        layerType: source.layer?.layerType || "illustration-zone",  
        residualSourceId: image.id || null,  
        residualDetector: source.detector,  
        confidence: 0.9,  
        regionBox: box  
      }  
    };  
  }
  
  function sampleStructuredResidualLineColor(image, axis) {  
    if (!image) return "#CBD5E1";  
    const samples = [];  
    const stepX = axis === "h" ? 3 : 1;  
    const stepY = axis === "h" ? 1 : 3;  
    for (let y = 0; y < image.height; y += stepY) {  
      for (let x = 0; x < image.width; x += stepX) {  
        const color = pixel(image, x, y);  
        if (color.a < 64) continue;  
        const lightness = luma(color);  
        const sat = saturation(color);  
        if (lightness > 248 && sat < 0.1) continue;  
        samples.push(color);  
        if (samples.length >= 256) break;  
      }  
      if (samples.length >= 256) break;  
    }  
    return samples.length > 0 ? rgbToHex(averageColor(samples)) : "#CBD5E1";  
  }
  
  function createStructuredIllustrationResidualIconShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {  
    if (!page || !Array.isArray(page.images)) return [];  
    const shapes = [];  
    const nextImages = [];  
    for (const image of page.images) {  
      const iconShapes = structuredIllustrationWarningIconShapes(image, irDir, shapes.length, slideSize);  
      if (iconShapes.length === 0) {  
        nextImages.push(image);  
        continue;  
      }  
      shapes.push(...iconShapes);  
      image.source = {  
        ...(image.source || {}),  
        structuredIllustrationWarningIconObjectified: true,  
        residualSplitDropped: true,  
        residualSplitDropReason: "structured-illustration-warning-icon-rebuilt-as-native-shapes"  
      };  
    }  
    page.images = nextImages;  
    return shapes;  
  }
  
  function createStructuredIllustrationResidualSketchLineShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {  
    if (!page || !Array.isArray(page.images)) return [];  
    const shapes = [];  
    const nextImages = [];  
    for (const image of page.images) {  
      const lineShapes = structuredIllustrationResidualSketchLineShapes(image, irDir, shapes.length, slideSize);  
      if (lineShapes.length === 0) {  
        nextImages.push(image);  
        continue;  
      }  
      shapes.push(...lineShapes);  
      image.source = {  
        ...(image.source || {}),  
        structuredIllustrationSketchLineObjectified: true,  
        residualSplitDropped: true,  
        residualSplitDropReason: "structured-illustration-sketch-line-residual-rebuilt-as-native-lines"  
      };  
    }  
    page.images = nextImages;  
    return shapes;  
  }
  
  function structuredIllustrationResidualSketchLineShapes(image = {}, irDir = null, startIndex = 0, slideSize = DEFAULT_SLIDE) {  
    const source = image.source || {};  
    if (source.detector !== "structured-illustration-sparse-residual-crop") return [];  
    if (source.residualSplitMode !== "structured-illustration-sparse-residual") return [];  
    const box = image.box || {};  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    if (w < 8 || h < 8 || w > 42 || h > 48) return [];  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    if (!assetFile || !fs.existsSync(assetFile)) return [];  
    const png = readPng(assetFile);  
    const decision = structuredIllustrationTinySketchLineDecision(png);  
    if (!decision.accept) return [];  
    const base = image.id || `structured-sketch-${startIndex}`;  
    const regionBox = clampPtBoxToSlide(box, slideSize);  
    const scaleX = regionBox.w / Math.max(1, png.width);  
    const scaleY = regionBox.h / Math.max(1, png.height);  
    return decision.components.map((component, offset) => {  
      const start = {  
        x: regionBox.x + component.start.x * scaleX,  
        y: regionBox.y + component.start.y * scaleY  
      };  
      const end = {  
        x: regionBox.x + component.end.x * scaleX,  
        y: regionBox.y + component.end.y * scaleY  
      };  
      return {  
        id: `${base}-native-sketch-line-${startIndex + offset}`,  
        type: "line",  
        box: lineBox(start, end),  
        style: {  
          stroke: decision.color,  
          strokeWidthPt: component.strokeWidthPt,  
          connectorType: "straight",  
          lineCap: "round",  
          opacity: 0.9  
        },  
        source: {  
          editable: true,  
          nativeRebuild: true,  
          detector: "structured-illustration-sketch-native-line",  
          layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,  
          layerType: source.layer?.layerType || "illustration-zone",  
          residualSourceId: image.id || null,  
          residualDetector: source.detector,  
          confidence: 0.82,  
          regionBox  
        }  
      };  
    });  
  }
  
  function structuredIllustrationTinySketchLineDecision(image) {  
    if (!image || image.width < 8 || image.height < 8 || image.width > 90 || image.height > 90) {  
      return { accept: false, components: [], color: "#334155" };  
    }  
    const ink = new Uint8Array(image.width * image.height);  
    const colors = [];  
    let total = 0;  
    let inkCount = 0;  
    let saturatedCount = 0;  
    for (let y = 0; y < image.height; y += 1) {  
      for (let x = 0; x < image.width; x += 1) {  
        const color = pixel(image, x, y);  
        if (color.a < 64) continue;  
        total += 1;  
        const lightness = luma(color);  
        const sat = saturation(color);  
        if (sat > 0.22 && lightness < 235) saturatedCount += 1;  
        const isInk = lightness < 165 || (sat < 0.14 && lightness < 218);  
        if (!isInk) continue;  
        ink[y * image.width + x] = 1;  
        inkCount += 1;  
        if (lightness < 230 && colors.length < 256) colors.push(color);  
      }  
    }  
    const safeTotal = Math.max(1, total);  
    const inkRatio = inkCount / safeTotal;  
    const saturatedRatio = saturatedCount / safeTotal;  
    if (inkRatio < 0.025 || inkRatio > 0.24 || saturatedRatio > 0.04) {  
      return { accept: false, components: [], color: "#334155" };  
    }  
    const components = connectedTinySketchLineComponents(ink, image.width, image.height)  
      .filter((component) => component.area >= 3 && component.area <= 220)  
      .map((component) => componentToSketchLine(component))  
      .filter(Boolean)  
      .sort((a, b) => (a.minY - b.minY) || (a.minX - b.minX))  
      .slice(0, 4);  
    if (components.length === 0 || components.length > 4) {  
      return { accept: false, components: [], color: "#334155" };  
    }  
    return {  
      accept: true,  
      components,  
      color: colors.length > 0 ? rgbToHex(averageColor(colors)) : "#334155"  
    };  
  }
  
  function connectedTinySketchLineComponents(ink, width, height) {  
    const visited = new Uint8Array(width * height);  
    const components = [];  
    const queue = [];  
    const neighbors = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];  
    for (let y = 0; y < height; y += 1) {  
      for (let x = 0; x < width; x += 1) {  
        const startIndex = y * width + x;  
        if (!ink[startIndex] || visited[startIndex]) continue;  
        const component = { minX: x, maxX: x, minY: y, maxY: y, area: 0, sumX: 0, sumY: 0, sumXX: 0, sumYY: 0, sumXY: 0 };  
        queue.length = 0;  
        queue.push({ x, y });  
        visited[startIndex] = 1;  
        for (let head = 0; head < queue.length; head += 1) {  
          const point = queue[head];  
          component.area += 1;  
          component.minX = Math.min(component.minX, point.x);  
          component.maxX = Math.max(component.maxX, point.x);  
          component.minY = Math.min(component.minY, point.y);  
          component.maxY = Math.max(component.maxY, point.y);  
          component.sumX += point.x;  
          component.sumY += point.y;  
          component.sumXX += point.x * point.x;  
          component.sumYY += point.y * point.y;  
          component.sumXY += point.x * point.y;  
          for (const [dx, dy] of neighbors) {  
            const nx = point.x + dx;  
            const ny = point.y + dy;  
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;  
            const nextIndex = ny * width + nx;  
            if (!ink[nextIndex] || visited[nextIndex]) continue;  
            visited[nextIndex] = 1;  
            queue.push({ x: nx, y: ny });  
          }  
        }  
        components.push(component);  
      }  
    }  
    return components;  
  }
  
  function componentToSketchLine(component) {  
    const w = component.maxX - component.minX + 1;  
    const h = component.maxY - component.minY + 1;  
    const span = Math.hypot(w, h);  
    if (span < 4) return null;  
    const fillRatio = component.area / Math.max(1, w * h);  
    if (fillRatio > 0.72 && w > 5 && h > 5) return null;  
    const cx = component.sumX / component.area;  
    const cy = component.sumY / component.area;  
    const covXX = component.sumXX / component.area - cx * cx;  
    const covYY = component.sumYY / component.area - cy * cy;  
    const covXY = component.sumXY / component.area - cx * cy;  
    const angle = 0.5 * Math.atan2(2 * covXY, covXX - covYY);  
    const dx = Math.cos(angle);  
    const dy = Math.sin(angle);  
    const halfLength = Math.max(2, span * 0.5);  
    const start = {  
      x: clamp(cx - dx * halfLength, component.minX, component.maxX),  
      y: clamp(cy - dy * halfLength, component.minY, component.maxY)  
    };  
    const end = {  
      x: clamp(cx + dx * halfLength, component.minX, component.maxX),  
      y: clamp(cy + dy * halfLength, component.minY, component.maxY)  
    };  
    const strokeWidthPt = clamp(Math.min(w, h) * 0.45, 0.8, 2.2);  
    return { ...component, start, end, strokeWidthPt: round(strokeWidthPt) };  
  }
  
  function createStructuredIllustrationGearPersonShapes(page = {}, irDir = null, slideSize = DEFAULT_SLIDE) {  
    if (!page || !Array.isArray(page.images)) return [];  
    const shapes = [];  
    const nextImages = [];  
    for (const image of page.images) {  
      const rebuilt = structuredIllustrationGearPersonShapes(image, irDir, shapes.length, slideSize);  
      if (rebuilt.length === 0) {  
        nextImages.push(image);  
        continue;  
      }  
      shapes.push(...rebuilt);  
      image.source = {  
        ...(image.source || {}),  
        structuredIllustrationGearPersonObjectified: true,  
        residualSplitDropped: true,  
        residualSplitDropReason: "structured-illustration-gear-person-rebuilt-as-native-shapes"  
      };  
    }  
    page.images = nextImages;  
    return shapes;  
  }
  
  function structuredIllustrationGearPersonShapes(image = {}, irDir = null, startIndex = 0, slideSize = DEFAULT_SLIDE) {  
    const source = image.source || {};  
    if (source.detector !== "structured-illustration-sparse-residual-crop") return [];  
    if (source.residualSplitMode !== "structured-illustration-sparse-residual") return [];  
    const box = image.box || {};  
    const w = Number(box.w || 0);  
    const h = Number(box.h || 0);  
    const aspect = w / Math.max(1, h);  
    if (w < 90 || h < 80 || w > 230 || h > 190 || aspect < 0.75 || aspect > 1.45) return [];  
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);  
    if (!assetFile || !fs.existsSync(assetFile)) return [];  
    const png = readPng(assetFile);  
    const decision = structuredIllustrationGearPersonDecision(png);  
    if (!decision.accept) return [];  
    const regionBox = clampPtBoxToSlide(box, slideSize);  
    const base = image.id || `structured-gear-person-${startIndex}`;  
    const baseSource = (part, partBox) => ({  
      editable: true,  
      nativeRebuild: true,  
      detector: "structured-illustration-gear-person-native",  
      layerSourceId: source.parentImageId || source.layerSourceId || image.id || null,  
      layerType: source.layer?.layerType || "illustration-zone",  
      residualSourceId: image.id || null,  
      residualDetector: source.detector,  
      illustrationPart: part,  
      confidence: decision.confidence,  
      regionBox: partBox || regionBox  
    });  
    const gearShapes = structuredIllustrationGearPersonGearShapes(base, regionBox, baseSource, slideSize);  
    const personShapes = structuredIllustrationGearPersonHumanShapes(base, regionBox, baseSource);  
    const motionShapes = structuredIllustrationGearPersonMotionShapes(base, regionBox, baseSource);  
    return [...gearShapes, ...personShapes, ...motionShapes];  
  }
  
  function structuredIllustrationGearPersonDecision(image) {  
    if (!image || image.width < 96 || image.height < 80 || image.width > 360 || image.height > 300) {  
      return { accept: false, confidence: 0 };  
    }  
    let total = 0;  
    let white = 0;  
    let gray = 0;  
    let darkBlueGray = 0;  
    let orange = 0;  
    let saturated = 0;  
    for (let y = 0; y < image.height; y += 1) {  
      for (let x = 0; x < image.width; x += 1) {  
        const color = pixel(image, x, y);  
        if (color.a < 64) continue;  
        total += 1;  
        const lightness = luma(color);  
        const sat = saturation(color);  
        if (lightness > 242 && sat < 0.12) white += 1;  
        if (sat < 0.28 && lightness >= 70 && lightness <= 225) gray += 1;  
        if (sat < 0.36 && lightness < 125 && color.b >= color.r && color.g >= color.r * 0.92) darkBlueGray += 1;  
        if (sat > 0.35) saturated += 1;  
        if (sat > 0.35 && color.r > color.g * 1.25 && color.r > color.b * 1.6) orange += 1;  
      }  
    }  
    const safeTotal = Math.max(1, total);  
    const whiteRatio = white / safeTotal;  
    const grayRatio = gray / safeTotal;  
    const darkRatio = darkBlueGray / safeTotal;  
    const saturatedRatio = saturated / safeTotal;  
    const orangeRatio = orange / safeTotal;  
    const accept = whiteRatio >= 0.28  
      && grayRatio >= 0.22  
      && darkRatio >= 0.08  
      && saturatedRatio <= 0.16  
      && orangeRatio <= 0.04;  
    return {  
      accept,  
      confidence: accept ? round(clamp(0.74 + darkRatio * 0.45 + grayRatio * 0.18, 0.74, 0.9)) : 0  
    };  
  }

  return {
    createStructuredIllustrationResidualLineShapes,
    createStructuredIllustrationResidualIconShapes,
    createStructuredIllustrationResidualSketchLineShapes,
    createStructuredIllustrationGearPersonShapes
  };
}

module.exports = { createStructuredIllustrationResidualsFactory };
