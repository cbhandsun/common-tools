"use strict";

const fs = require("fs");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createStickySketchResidualFactory(dependencies = {}) {
  const {
    averageColor,
    expandPxBox,
    pixel,
    readPng,
    resolveAssetPathForIr,
    rgbToHex,
    rgbToHsl,
    round
  } = dependencies;
  const required = {
    averageColor,
    expandPxBox,
    pixel,
    readPng,
    resolveAssetPathForIr,
    rgbToHex,
    rgbToHsl,
    round
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`sticky sketch residual dependency ${name} must be a function`);
  }

  function createStickySketchResidualNativeShapes(page, irDir, slideSize = DEFAULT_SLIDE) {
    if (!page || !Array.isArray(page.images)) return [];
    const shapes = [];
    const keptImages = [];
    for (const image of page.images) {
      const nativeShapes = stickySketchResidualNativeShapesForImage(image, irDir, slideSize);
      if (nativeShapes.length === 0) {
        keptImages.push(image);
        continue;
      }
      shapes.push(...nativeShapes);
      image.source = {
        ...(image.source || {}),
        stickySketchResidualObjectified: true,
        residualSplitDropped: true,
        dropErasedResidualAfterNativeRebuild: true
      };
    }
    if (shapes.length > 0) page.images = keptImages;
    return shapes;
  }
  
  function stickySketchResidualNativeShapesForImage(image, irDir, slideSize = DEFAULT_SLIDE) {
    const strokeShapes = stickySketchResidualNativeStrokeShapes(image, irDir, slideSize);
    if (strokeShapes.length > 0) return strokeShapes;
    const shape = stickySketchResidualNativeShape(image, irDir, slideSize);
    return shape ? [shape] : [];
  }
  
  function stickySketchResidualNativeShape(image, irDir, slideSize = DEFAULT_SLIDE) {
    const detector = image?.source?.detector;
    if (detector !== "sticky-note-sketch-residual-crop" && !isResidualNativeLineDetector(detector)) return null;
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const lineShape = stickySketchResidualNativeLineShape(image, irDir, slideSize);
    if (lineShape) return lineShape;
    const frameShape = residualNativeExplanationFrameShape(image, irDir, slideSize);
    if (frameShape) return frameShape;
    if (detector !== "sticky-note-sketch-residual-crop") return null;
    if (w < 280 || h < 36 || h > 95 || w / Math.max(1, h) < 5.5) return null;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile || !fs.existsSync(assetFile)) return null;
    const residual = readPng(assetFile);
    const color = dominantNonWhiteColor(residual);
    if (!isPaleStickyBannerColor(color)) return null;
    const fill = rgbToHex(color);
    return {
      id: `${image.id || "sticky-sketch"}-native-banner`,
      type: "roundRect",
      box: {
        x: round(box.x + Math.min(4, w * 0.01)),
        y: round(box.y + Math.min(7, h * 0.12)),
        w: round(w - Math.min(8, w * 0.02)),
        h: round(h * 0.62)
      },
      style: {
        fill,
        stroke: "none",
        strokeWidthPt: 0,
        radiusRatio: 0.08,
        shadow: {
          color: "#49C08B",
          alpha: 0.16,
          blurPt: 8,
          distancePt: 2,
          angle: 45
        }
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "sticky-note-sketch-native-banner",
        layerSourceId: image.source?.parentImageId || image.id || null,
        sourceResidualId: image.id || null,
        confidence: 0.82
      }
    };
  }
  
  function stickySketchResidualNativeStrokeShapes(image, irDir, slideSize = DEFAULT_SLIDE) {
    if (image?.source?.detector !== "sticky-note-sketch-residual-crop") return [];
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const slideArea = Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const areaRatio = w * h / slideArea;
    if (areaRatio > 0.035 || w < 18 || h < 18 || w > 180 || h > 130) return [];
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile || !fs.existsSync(assetFile)) return [];
    const residual = readPng(assetFile);
    const components = stickySketchStrokeComponents(residual);
    if (components.length < 2 || components.length > 6) return [];
    const totalInk = stickySketchStrokeInkCount(residual);
    const coveredInk = components.reduce((sum, component) => sum + component.pixels, 0);
    if (totalInk < 40 || coveredInk / Math.max(1, totalInk) < 0.86) return [];
    const scaleX = w / Math.max(1, residual.width);
    const scaleY = h / Math.max(1, residual.height);
    const scale = (scaleX + scaleY) / 2;
    const shapes = [];
    const sorted = components.slice().sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    for (const [index, component] of sorted.entries()) {
      const crop = stickySketchStrokeComponentCrop(residual, component);
      const stats = residualLinearInkStats(crop);
      if (!stats || stats.pixels < 16 || stats.eigenRatio < 7) return [];
      const lineLength = Math.hypot(stats.lineBox.w, stats.lineBox.h);
      if (lineLength < 10 || stats.strokeWidthPx > Math.max(14, lineLength * 0.58)) return [];
      const fullLine = {
        x: component.box.x + stats.lineBox.x,
        y: component.box.y + stats.lineBox.y,
        w: stats.lineBox.w,
        h: stats.lineBox.h
      };
      const axis = Math.abs(fullLine.w) > Math.abs(fullLine.h) * 2.4
        ? "horizontal"
        : Math.abs(fullLine.h) > Math.abs(fullLine.w) * 2.4
          ? "vertical"
          : "diagonal";
      shapes.push({
        id: `${image.id || "sticky-sketch"}-native-stroke-${index}`,
        type: "line",
        box: {
          x: round(box.x + fullLine.x * scaleX),
          y: round(box.y + fullLine.y * scaleY),
          w: round(fullLine.w * scaleX),
          h: round(fullLine.h * scaleY)
        },
        style: {
          stroke: rgbToHex(stats.color || dominantNonWhiteColor(crop) || { r: 120, g: 120, b: 120, a: 255 }),
          strokeWidthPt: Math.max(1, Math.min(5.5, stats.strokeWidthPx * scale)),
          connectorType: "straight"
        },
        source: {
          editable: true,
          nativeRebuild: true,
          detector: "sticky-note-sketch-native-stroke-line",
          layerSourceId: image.source?.parentImageId || image.id || null,
          sourceResidualId: image.id || null,
          sourceResidualDetector: image.source?.detector || null,
          confidence: 0.72,
          axis,
          strokeComponentIndex: index,
          strokeComponentCount: sorted.length,
          eigenRatio: round(stats.eigenRatio)
        }
      });
    }
    return shapes;
  }
  
  function isResidualNativeLineDetector(detector) {
    return detector === "process-with-screenshots-residual-crop";
  }
  
  function residualNativeExplanationFrameShape(image, irDir, slideSize = DEFAULT_SLIDE) {
    if (image?.source?.detector !== "process-with-screenshots-residual-crop") return null;
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    if (w < 260 || h < 40 || h > 95 || areaRatio > 0.08) return null;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile || !fs.existsSync(assetFile)) return null;
    const residual = readPng(assetFile);
    const stats = residualFrameStats(residual);
    if (!stats || stats.density < 0.018 || stats.density > 0.13 || stats.edgeRatio < 0.32) return null;
    const color = stats.color || dominantNonWhiteColor(residual);
    if (!color) return null;
    const hsl = rgbToHsl(color);
    if (hsl.s < 0.14 || hsl.l < 0.2 || hsl.l > 0.78) return null;
    return {
      id: `${image.id || "residual"}-native-frame`,
      type: "roundRect",
      box: {
        x: round(box.x),
        y: round(box.y),
        w: round(w),
        h: round(h)
      },
      style: {
        fill: "#FFFFFF",
        stroke: rgbToHex(color),
        strokeWidthPt: 1.8,
        radiusRatio: 0.08,
        shadow: {
          color: rgbToHex(color),
          alpha: 0.12,
          blurPt: 4,
          distancePt: 1,
          angle: 45
        }
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "residual-native-explanation-frame",
        layerSourceId: image.source?.parentImageId || image.id || null,
        sourceResidualId: image.id || null,
        sourceResidualDetector: image.source?.detector || null,
        confidence: 0.78
      }
    };
  }
  
  function stickySketchResidualNativeLineShape(image, irDir, slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const horizontal = w >= h * 3.2;
    const vertical = h >= w * 3.2;
    const detector = image?.source?.detector;
    const diagonalCandidate = detector === "sticky-note-sketch-residual-crop" && areaRatio <= 0.0065 && Math.max(w, h) >= 45;
    if (((!horizontal && !vertical) || Math.min(w, h) > 24) && !diagonalCandidate) return null;
    if ((horizontal || vertical) && (areaRatio > 0.01 || Math.max(w, h) < 28 || Math.min(w, h) > 24)) return null;
    const assetFile = resolveAssetPathForIr(image.assetPath, irDir);
    if (!assetFile || !fs.existsSync(assetFile)) return null;
    const residual = readPng(assetFile);
    if (!horizontal && !vertical) {
      return stickySketchResidualNativeDiagonalLineShape(image, residual, slideSize);
    }
    const ink = residualInkStats(residual);
    if (!ink || ink.pixels < 12 || ink.density < 0.08) return null;
    const inkAspect = ink.box.w / Math.max(1, ink.box.h);
    if (horizontal && inkAspect < 2.2) return null;
    if (vertical && inkAspect > 0.45) return null;
    const color = dominantNonWhiteColor(residual) || { r: 120, g: 120, b: 120, a: 255 };
    const strokeWidthPt = Math.max(1, Math.min(4, horizontal ? h * Math.min(0.45, ink.box.h / Math.max(1, residual.height)) : w * Math.min(0.45, ink.box.w / Math.max(1, residual.width))));
    const nativeDetector = detector === "sticky-note-sketch-residual-crop"
      ? "sticky-note-sketch-native-line"
      : "residual-native-line";
    return {
      id: `${image.id || "sticky-sketch"}-native-line`,
      type: "line",
      box: horizontal
        ? {
          x: round(box.x + (ink.box.x / residual.width) * w),
          y: round(box.y + ((ink.box.y + ink.box.h / 2) / residual.height) * h),
          w: round((ink.box.w / residual.width) * w),
          h: 0
        }
        : {
          x: round(box.x + ((ink.box.x + ink.box.w / 2) / residual.width) * w),
          y: round(box.y + (ink.box.y / residual.height) * h),
          w: 0,
          h: round((ink.box.h / residual.height) * h)
        },
      style: {
        stroke: rgbToHex(color),
        strokeWidthPt,
        connectorType: "straight"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: nativeDetector,
        layerSourceId: image.source?.parentImageId || image.id || null,
        sourceResidualId: image.id || null,
        sourceResidualDetector: detector || null,
        confidence: 0.76,
        axis: horizontal ? "horizontal" : "vertical"
      }
    };
  }
  
  function stickySketchResidualNativeDiagonalLineShape(image, residual, _slideSize = DEFAULT_SLIDE) {
    const box = image?.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const stats = residualLinearInkStats(residual);
    if (!stats || stats.pixels < 50 || stats.density < 0.05 || stats.density > 0.55 || stats.eigenRatio < 18) return null;
    if (Math.abs(stats.lineBox.w) < 6 || Math.abs(stats.lineBox.h) < 18) return null;
    const color = stats.color || dominantNonWhiteColor(residual) || { r: 120, g: 120, b: 120, a: 255 };
    return {
      id: `${image.id || "sticky-sketch"}-native-diagonal-line`,
      type: "line",
      box: {
        x: round(box.x + (stats.lineBox.x / residual.width) * w),
        y: round(box.y + (stats.lineBox.y / residual.height) * h),
        w: round((stats.lineBox.w / residual.width) * w),
        h: round((stats.lineBox.h / residual.height) * h)
      },
      style: {
        stroke: rgbToHex(color),
        strokeWidthPt: Math.max(1, Math.min(4, stats.strokeWidthPx / Math.max(1, residual.width) * w)),
        connectorType: "straight"
      },
      source: {
        editable: true,
        nativeRebuild: true,
        detector: "sticky-note-sketch-native-diagonal-line",
        layerSourceId: image.source?.parentImageId || image.id || null,
        sourceResidualId: image.id || null,
        sourceResidualDetector: image.source?.detector || null,
        confidence: 0.74,
        axis: "diagonal",
        eigenRatio: round(stats.eigenRatio)
      }
    };
  }
  
  function residualFrameStats(image) {
    let ink = 0;
    let edge = 0;
    const edgeColors = [];
    const edgeBand = Math.max(6, Math.round(Math.min(image.width, image.height) * 0.05));
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        const hsl = rgbToHsl(color);
        if (isNearWhiteFrameBackground(color, hsl)) continue;
        ink += 1;
        const onEdge = x < edgeBand || y < edgeBand || x >= image.width - edgeBand || y >= image.height - edgeBand;
        if (onEdge) {
          edge += 1;
          if (hsl.s >= 0.12 && hsl.l >= 0.18 && hsl.l <= 0.82) edgeColors.push(color);
        }
      }
    }
    if (ink < 20) return null;
    return {
      density: ink / Math.max(1, image.width * image.height),
      edgeRatio: edge / Math.max(1, ink),
      color: averageColor(edgeColors)
    };
  }
  
  function residualLinearInkStats(image) {
    const points = [];
    const colors = [];
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        const hsl = rgbToHsl(color);
        if (isNearWhiteFrameBackground(color, hsl)) continue;
        points.push({ x, y });
        if (hsl.s >= 0.05 && hsl.l >= 0.12 && hsl.l <= 0.86) colors.push(color);
      }
    }
    if (points.length < 12) return null;
    let sx = 0;
    let sy = 0;
    for (const point of points) {
      sx += point.x;
      sy += point.y;
    }
    const mx = sx / points.length;
    const my = sy / points.length;
    let xx = 0;
    let yy = 0;
    let xy = 0;
    for (const point of points) {
      const dx = point.x - mx;
      const dy = point.y - my;
      xx += dx * dx;
      yy += dy * dy;
      xy += dx * dy;
    }
    xx /= points.length;
    yy /= points.length;
    xy /= points.length;
    const trace = xx + yy;
    const determinant = xx * yy - xy * xy;
    const discriminant = Math.sqrt(Math.max(0, trace * trace / 4 - determinant));
    const eigen1 = trace / 2 + discriminant;
    const eigen2 = trace / 2 - discriminant;
    const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let minT = Infinity;
    let maxT = -Infinity;
    let maxPerp = 0;
    for (const point of points) {
      const dx = point.x - mx;
      const dy = point.y - my;
      const t = dx * ux + dy * uy;
      const p = Math.abs(-dx * uy + dy * ux);
      minT = Math.min(minT, t);
      maxT = Math.max(maxT, t);
      maxPerp = Math.max(maxPerp, p);
    }
    const x1 = mx + minT * ux;
    const y1 = my + minT * uy;
    const x2 = mx + maxT * ux;
    const y2 = my + maxT * uy;
    return {
      pixels: points.length,
      density: points.length / Math.max(1, image.width * image.height),
      eigenRatio: eigen1 / Math.max(1, eigen2),
      strokeWidthPx: Math.max(1, maxPerp * 2),
      color: averageColor(colors),
      lineBox: {
        x: x1,
        y: y1,
        w: x2 - x1,
        h: y2 - y1
      }
    };
  }
  
  function isNearWhiteFrameBackground(color, hsl = rgbToHsl(color)) {
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    return (max > 244 && max - min < 28) || (hsl.l > 0.9 && hsl.s < 0.36);
  }
  
  function residualInkStats(image) {
    let minX = image.width;
    let minY = image.height;
    let maxX = -1;
    let maxY = -1;
    let pixels = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        const hsl = rgbToHsl(color);
        if (hsl.l > 0.96 && hsl.s < 0.12) continue;
        pixels += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
    if (maxX < minX || maxY < minY) return null;
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    return {
      box,
      pixels,
      density: pixels / Math.max(1, box.w * box.h)
    };
  }
  
  function dominantNonWhiteColor(image) {
    const buckets = new Map();
    for (let y = 0; y < image.height; y += 3) {
      for (let x = 0; x < image.width; x += 3) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        const hsl = rgbToHsl(color);
        if (hsl.l > 0.965 && hsl.s < 0.10) continue;
        const key = `${Math.round(color.r / 12)},${Math.round(color.g / 12)},${Math.round(color.b / 12)}`;
        const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        entry.count += 1;
        entry.r += color.r;
        entry.g += color.g;
        entry.b += color.b;
        buckets.set(key, entry);
      }
    }
    const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant || dominant.count < 6) return null;
    return {
      r: Math.round(dominant.r / dominant.count),
      g: Math.round(dominant.g / dominant.count),
      b: Math.round(dominant.b / dominant.count),
      a: 255
    };
  }
  
  function isPaleStickyBannerColor(color) {
    if (!color) return false;
    const hsl = rgbToHsl(color);
    return hsl.h >= 170 && hsl.h <= 215 && hsl.s >= 0.12 && hsl.s <= 0.95 && hsl.l >= 0.74 && hsl.l <= 0.95;
  }
  
  function stickySketchStrokeComponents(image) {
    const visited = new Uint8Array(image.width * image.height);
    const components = [];
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        const startIdx = y * image.width + x;
        if (visited[startIdx] || !isStickySketchStrokePixel(pixel(image, x, y))) continue;
        const queue = [[x, y]];
        visited[startIdx] = 1;
        let qi = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        let count = 0;
        const points = [];
        while (qi < queue.length && count < 80000) {
          const [cx, cy] = queue[qi++];
          count += 1;
          points.push({ x: cx, y: cy });
          minX = Math.min(minX, cx);
          maxX = Math.max(maxX, cx);
          minY = Math.min(minY, cy);
          maxY = Math.max(maxY, cy);
          for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
              if (ox === 0 && oy === 0) continue;
              const nx = cx + ox;
              const ny = cy + oy;
              if (nx < 0 || ny < 0 || nx >= image.width || ny >= image.height) continue;
              const idx = ny * image.width + nx;
              if (visited[idx] || !isStickySketchStrokePixel(pixel(image, nx, ny))) continue;
              visited[idx] = 1;
              queue.push([nx, ny]);
            }
          }
        }
        if (count < 14) continue;
        const box = expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, 1);
        const areaRatio = box.w * box.h / Math.max(1, image.width * image.height);
        if (areaRatio < 0.001 || areaRatio > 0.98) continue;
        components.push({ box, pixels: count, points });
      }
    }
    return components.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  }
  
  function stickySketchStrokeComponentCrop(image, component) {
    const box = component?.box || { x: 0, y: 0, w: image.width, h: image.height };
    const crop = {
      width: Math.max(1, Number(box.w || 1)),
      height: Math.max(1, Number(box.h || 1)),
      rgba: Buffer.alloc(Math.max(1, Number(box.w || 1)) * Math.max(1, Number(box.h || 1)) * 4, 255)
    };
    for (let offset = 3; offset < crop.rgba.length; offset += 4) crop.rgba[offset] = 0;
    const points = Array.isArray(component?.points) ? component.points : [];
    for (const point of points) {
      const x = point.x - box.x;
      const y = point.y - box.y;
      if (x < 0 || y < 0 || x >= crop.width || y >= crop.height) continue;
      const sourceOffset = (point.y * image.width + point.x) * 4;
      const targetOffset = (y * crop.width + x) * 4;
      crop.rgba[targetOffset] = image.rgba[sourceOffset];
      crop.rgba[targetOffset + 1] = image.rgba[sourceOffset + 1];
      crop.rgba[targetOffset + 2] = image.rgba[sourceOffset + 2];
      crop.rgba[targetOffset + 3] = image.rgba[sourceOffset + 3];
    }
    return crop;
  }
  
  function stickySketchStrokeInkCount(image) {
    let count = 0;
    for (let y = 0; y < image.height; y += 1) {
      for (let x = 0; x < image.width; x += 1) {
        if (isStickySketchStrokePixel(pixel(image, x, y))) count += 1;
      }
    }
    return count;
  }
  
  function isStickySketchStrokePixel(color) {
    if (color.a < 64) return false;
    const hsl = rgbToHsl(color);
    if (isNearWhiteFrameBackground(color, hsl)) return false;
    const max = Math.max(color.r, color.g, color.b);
    const min = Math.min(color.r, color.g, color.b);
    const neutralStroke = max < 235 && max - min < 36;
    return hsl.l < 0.88 || hsl.s > 0.18 || neutralStroke;
  }

  return {
    createStickySketchResidualNativeShapes,
    residualLinearInkStats,
    stickySketchResidualNativeStrokeShapes,
    stickySketchStrokeComponents
  };
}

module.exports = {
  createStickySketchResidualFactory
};
