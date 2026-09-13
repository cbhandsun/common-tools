"use strict";

function createLayerVisualPrimitivesFactory(dependencies = {}) {
  const {
    DEFAULT_SLIDE,
    averageColor,
    boxCenterInside,
    clamp,
    colorBlockShapesForImage,
    colorDistance,
    constrainPtBox,
    expandPtBox,
    inferTableGridFromVisualAtoms,
    isProtectedFidelityDiagramDetector,
    isUsableVisualTableGrid,
    lineBox,
    luma,
    pixel,
    pointInsidePtBox,
    ptBoxOverlapAreaRatio,
    ptToPxBox,
    rgbToHex,
    round,
    sampleMaskBackgroundColor,
    saturation,
    shouldKeepFunnelHubDiagramText
  } = dependencies;

  function shouldObjectifyTableGrid(image) {
    const layer = image?.source?.layer || {};
    if (isProtectedFidelityDiagramDetector(image?.source?.detector)) return false;
    if (layer.layerType !== "table-zone" || layer.recommendedAction !== "attempt-native-reconstruction") return false;
    return image?.source?.textObjectified === true || hasStrongTableGridEvidence(image);
  }

  function hasStrongTableGridEvidence(image = {}) {
    const visualGrid = image?.source?.layer?.diagramUnderstanding?.visualGrid;
    if (isUsableVisualTableGrid(visualGrid, image?.box)) return true;
    return inferTableGridFromVisualAtoms(image) !== null;
  }

  function createLayerColorBlockShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyLayerColorBlocks(image)) continue;
      const blocks = colorBlockShapesForImage(image, sourceImage, slideSize, {
        detector: "layer-native-color-block",
        idPrefix: "layer-color-block",
        minAreaRatio: 0.018,
        maxAreaRatio: 0.42,
        minSampledDensity: 0.22
      });
      if (blocks.length === 0) continue;
      shapes.push(...blocks);
      image.source = {
        ...(image.source || {}),
        colorBlockObjectified: true,
        objectifiedColorBlocks: blocks.length
      };
    }
    return shapes;
  }

  function createMatrixColorBlockShapes(images = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyMatrixColorBlocks(image)) continue;
      const blocks = colorBlockShapesForImage(image, sourceImage, slideSize, {
        detector: "matrix-color-block-native-rect",
        idPrefix: "matrix-color-block",
        minAreaRatio: 0.006,
        maxAreaRatio: 0.34,
        minSampledDensity: 0.32
      }).filter((shape) => isMatrixColorBlockShape(shape, image));
      const summary = summarizeMatrixColorBlocks(blocks, image);
      if (!isConfidentMatrixColorBlockSummary(summary)) continue;
      shapes.push(...blocks.map((shape, index) => ({
        ...shape,
        id: `${image.id || "matrix"}-native-matrix-color-block-${index}`,
        source: {
          ...(shape.source || {}),
          detector: "matrix-color-block-native-rect",
          layerSourceId: image.id || null,
          confidence: summary.confidence
        }
      })));
      image.source = {
        ...(image.source || {}),
        matrixColorBlocksObjectified: true,
        objectifiedMatrixColorBlocks: blocks.length,
        matrixColorBlockCoverage: round(summary.coverageRatio, 4),
        dropErasedResidualAfterNativeRebuild: summary.dropResidual === true ? true : image.source?.dropErasedResidualAfterNativeRebuild,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "local fidelity crop"}; matrix color blocks rebuilt as native rectangles`
      };
    }
    return shapes;
  }

  function shouldObjectifyMatrixColorBlocks(image) {
    const source = image?.source || {};
    const layer = source.layer || {};
    const understanding = layer.diagramUnderstanding || {};
    if (source.textObjectified !== true) return false;
    if (source.detector !== "foreground-graphic-underlay-crop") return false;
    if (source.matrixColorBlocksObjectified === true || source.tableGridObjectified === true) return false;
    if (isProtectedFidelityDiagramDetector(source.detector)) return false;
    if (layer.layerType !== "table-zone") return false;
    if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") return false;
    return understanding.archetype === "matrix-or-grid" || understanding.nativeReadiness === "native-rebuild";
  }

  function isMatrixColorBlockShape(shape, image) {
    const box = shape?.box || {};
    const imageBox = image?.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    if (w < 28 || h < 18) return false;
    const areaRatio = (w * h) / Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
    if (areaRatio < 0.015 || areaRatio > 0.58) return false;
    const aspect = w / Math.max(1, h);
    if (aspect < 0.22 || aspect > 8.5) return false;
    const centerX = Number(box.x || 0) + w / 2;
    const centerY = Number(box.y || 0) + h / 2;
    return pointInsidePtBox(centerX, centerY, imageBox);
  }

  function summarizeMatrixColorBlocks(blocks = [], image = {}) {
    const imageBox = image.box || {};
    const imageArea = Math.max(1, Number(imageBox.w || 0) * Number(imageBox.h || 0));
    const coverageRatio = blocks.reduce((sum, shape) => {
      const box = shape.box || {};
      return sum + Number(box.w || 0) * Number(box.h || 0);
    }, 0) / imageArea;
    const xBands = clusteredCenters(blocks.map((shape) => Number(shape.box?.x || 0) + Number(shape.box?.w || 0) / 2), Math.max(18, Number(imageBox.w || 0) * 0.055));
    const yBands = clusteredCenters(blocks.map((shape) => Number(shape.box?.y || 0) + Number(shape.box?.h || 0) / 2), Math.max(14, Number(imageBox.h || 0) * 0.06));
    const alignedRatio = blocks.length === 0
      ? 0
      : blocks.filter((shape) => {
        const box = shape.box || {};
        const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
        const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
        return nearestDistance(cx, xBands) <= Math.max(20, Number(imageBox.w || 0) * 0.07)
          && nearestDistance(cy, yBands) <= Math.max(16, Number(imageBox.h || 0) * 0.075);
      }).length / blocks.length;
    const distinctColors = new Set(blocks.map((shape) => String(shape.style?.fill || "").toUpperCase())).size;
    const gridEvidence = image?.source?.layer?.diagramUnderstanding?.visualGrid;
    const hasGridEvidence = isUsableVisualTableGrid(gridEvidence, imageBox);
    const confidence = clamp(
      coverageRatio * 1.7
        + alignedRatio * 0.35
        + Math.min(0.18, distinctColors * 0.045)
        + (hasGridEvidence ? 0.14 : 0),
      0,
      1
    );
    return {
      count: blocks.length,
      coverageRatio,
      alignedRatio,
      distinctColors,
      confidence,
      dropResidual: blocks.length >= 3 && coverageRatio >= 0.22 && alignedRatio >= 0.78 && confidence >= 0.72
    };
  }

  function isConfidentMatrixColorBlockSummary(summary) {
    if (!summary || summary.count < 3) return false;
    if (summary.coverageRatio < 0.14) return false;
    if (summary.alignedRatio < 0.70) return false;
    if (summary.distinctColors < 2) return false;
    return summary.confidence >= 0.58;
  }

  function clusteredCenters(values = [], tolerance = 16) {
    const sorted = values
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => a - b);
    const clusters = [];
    for (const value of sorted) {
      const last = clusters[clusters.length - 1];
      if (!last || Math.abs(value - last.center) > tolerance) {
        clusters.push({ center: value, count: 1 });
        continue;
      }
      last.center = (last.center * last.count + value) / (last.count + 1);
      last.count += 1;
    }
    return clusters.map((cluster) => cluster.center);
  }

  function nearestDistance(value, centers = []) {
    if (!centers.length) return Infinity;
    return centers.reduce((best, center) => Math.min(best, Math.abs(value - center)), Infinity);
  }

  function shouldObjectifyLayerColorBlocks(image) {
    const layer = image?.source?.layer || {};
    if (image?.source?.textObjectified !== true) return false;
    if (image?.source?.detector !== "foreground-graphic-underlay-crop") return false;
    if (image?.source?.matrixColorBlocksObjectified === true) return false;
    if (image?.source?.tableGridObjectified === true || image?.source?.tableCellBackgroundObjectified === true) return false;
    if (image?.source?.assetOsFlowObjectified === true || image?.source?.portalPlatformDiagramObjectified === true) return false;
    if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") return false;
    return layer.layerType === "diagram-zone" || layer.layerType === "table-zone";
  }

  function createLayerContainerShapes(images = [], textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyLayerContainers(image)) continue;
      const internalTextBoxes = (textBoxes || []).filter((textBox) => boxCenterInside(textBox.box, image.box));
      const containers = inferLayerContainers(image, internalTextBoxes, sourceImage, slideSize);
      if (containers.length === 0) continue;
      image.source = {
        ...(image.source || {}),
        containerObjectified: true,
        objectifiedContainers: containers.length
      };
      for (let index = 0; index < containers.length; index += 1) {
        const container = containers[index];
        shapes.push({
          id: `${image.id || "layer"}-native-container-${index}`,
          type: container.shapeType,
          box: container.box,
          style: {
            fill: container.fill,
            stroke: container.stroke,
            strokeWidthPt: container.strokeWidthPt,
            radiusRatio: container.radiusRatio
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "layer-native-container",
            layerSourceId: image.id || null,
            layerType: image.source?.layer?.layerType || "unknown",
            confidence: container.confidence,
            textBoxCount: container.textBoxCount
          }
        });
      }
    }
    return shapes;
  }

  function shouldObjectifyLayerContainers(image) {
    const layer = image?.source?.layer || {};
    if (image?.source?.textObjectified !== true) return false;
    if (image?.source?.skipVisualAtomRebuild === true || image?.source?.semanticSplitOwnsLayer === true) return false;
    if (shouldKeepFunnelHubDiagramText(image)) return false;
    if (image?.source?.assetOsFlowObjectified === true || image?.source?.portalPlatformDiagramObjectified === true) return false;
    if (layer.recommendedAction !== "attempt-native-reconstruction" && layer.recommendedAction !== "split-native-with-residual-crop") {
      return false;
    }
    return layer.layerType === "diagram-zone" || layer.layerType === "table-zone";
  }

  function createLayerConnectorShapes(images = [], containerShapes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage || !Array.isArray(containerShapes) || containerShapes.length < 2) return [];
    const shapes = [];
    for (const image of images || []) {
      if (!shouldObjectifyLayerConnectors(image)) continue;
      const containers = containerShapes.filter((shape) =>
        shape?.source?.detector === "layer-native-container"
        && shape.source.layerSourceId === (image.id || null)
        && boxCenterInside(shape.box, image.box)
      );
      const connectors = inferLayerConnectors(image, containers, sourceImage, slideSize);
      if (connectors.length === 0) continue;
      image.source = {
        ...(image.source || {}),
        connectorObjectified: true,
        objectifiedConnectors: connectors.length
      };
      for (let index = 0; index < connectors.length; index += 1) {
        const connector = connectors[index];
        shapes.push({
          id: `${image.id || "layer"}-native-connector-${index}`,
          type: "line",
          box: connector.box,
          style: {
            stroke: connector.stroke,
            strokeWidthPt: connector.strokeWidthPt,
            connectorType: "straight",
            endArrow: "triangle"
          },
          source: {
            editable: true,
            nativeRebuild: true,
            detector: "layer-native-connector",
            layerSourceId: image.id || null,
            layerType: image.source?.layer?.layerType || "unknown",
            confidence: connector.confidence,
            from: connector.from,
            to: connector.to,
            axis: connector.axis
          }
        });
      }
    }
    return shapes;
  }

  function shouldObjectifyLayerConnectors(image) {
    const layer = image?.source?.layer || {};
    return image?.source?.containerObjectified === true
      && layer.layerType === "diagram-zone"
      && (layer.recommendedAction === "attempt-native-reconstruction" || layer.recommendedAction === "split-native-with-residual-crop");
  }

  function inferLayerContainers(image, textBoxes = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!image?.box || !sourceImage) return [];
    const candidates = (textBoxes || [])
      .filter((textBox) => isContainerCandidateTextBox(textBox, image.box))
      .map((textBox) => inferTextBoxContainer(image.box, textBox, sourceImage, slideSize))
      .filter(Boolean)
      .sort((a, b) => (b.confidence - a.confidence) || (b.box.w * b.box.h - a.box.w * a.box.h));
    const accepted = [];
    for (const candidate of candidates) {
      if (accepted.some((item) => ptBoxOverlapAreaRatio(item.box, candidate.box) > 0.68)) continue;
      accepted.push(candidate);
      if (accepted.length >= 18) break;
    }
    return accepted.sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  }

  function inferLayerConnectors(image, containers = [], sourceImage = null, slideSize = DEFAULT_SLIDE) {
    if (!image?.box || !sourceImage || !Array.isArray(containers) || containers.length < 2) return [];
    const candidates = [];
    const sorted = containers
      .filter((shape) => shape?.box && boxCenterInside(shape.box, image.box))
      .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const candidate = inferConnectorBetweenContainers(sorted[i], sorted[j], sourceImage, slideSize);
        if (!candidate) continue;
        if (candidates.some((item) => connectorBoxesNear(item.box, candidate.box))) continue;
        candidates.push(candidate);
      }
    }
    return candidates
      .sort((a, b) => (b.confidence - a.confidence) || (a.box.y - b.box.y) || (a.box.x - b.box.x))
      .slice(0, 12)
      .sort((a, b) => (a.box.y - b.box.y) || (a.box.x - b.box.x));
  }

  function inferConnectorBetweenContainers(a, b, sourceImage, slideSize) {
    const aBox = a.box || {};
    const bBox = b.box || {};
    const aCx = Number(aBox.x || 0) + Number(aBox.w || 0) / 2;
    const bCx = Number(bBox.x || 0) + Number(bBox.w || 0) / 2;
    const aCy = Number(aBox.y || 0) + Number(aBox.h || 0) / 2;
    const bCy = Number(bBox.y || 0) + Number(bBox.h || 0) / 2;
    const horizontal = Math.abs(aCy - bCy) <= Math.max(16, Math.min(Number(aBox.h || 0), Number(bBox.h || 0)) * 0.42);
    const vertical = Math.abs(aCx - bCx) <= Math.max(16, Math.min(Number(aBox.w || 0), Number(bBox.w || 0)) * 0.25);
    if (horizontal) {
      const left = aCx <= bCx ? a : b;
      const right = left === a ? b : a;
      const gap = Number(right.box.x || 0) - (Number(left.box.x || 0) + Number(left.box.w || 0));
      if (gap < 6 || gap > 260) return null;
      const y = round((Number(left.box.y || 0) + Number(left.box.h || 0) / 2 + Number(right.box.y || 0) + Number(right.box.h || 0) / 2) / 2);
      const probe = { x: Number(left.box.x || 0) + Number(left.box.w || 0), y: y - 6, w: gap, h: 12 };
      const ink = sampleConnectorInk(sourceImage, probe, slideSize);
      if (!ink) return null;
      return {
        axis: "horizontal",
        box: { x: round(probe.x + 2), y, w: round(Math.max(1, gap - 4)), h: 0 },
        stroke: ink.stroke,
        strokeWidthPt: ink.strokeWidthPt,
        confidence: ink.confidence,
        from: left.id || null,
        to: right.id || null
      };
    }
    if (vertical) {
      const top = aCy <= bCy ? a : b;
      const bottom = top === a ? b : a;
      const gap = Number(bottom.box.y || 0) - (Number(top.box.y || 0) + Number(top.box.h || 0));
      if (gap < 6 || gap > 220) return null;
      const x = round((Number(top.box.x || 0) + Number(top.box.w || 0) / 2 + Number(bottom.box.x || 0) + Number(bottom.box.w || 0) / 2) / 2);
      const probe = { x: x - 6, y: Number(top.box.y || 0) + Number(top.box.h || 0), w: 12, h: gap };
      const ink = sampleConnectorInk(sourceImage, probe, slideSize);
      if (!ink) return null;
      return {
        axis: "vertical",
        box: { x, y: round(probe.y + 2), w: 0, h: round(Math.max(1, gap - 4)) },
        stroke: ink.stroke,
        strokeWidthPt: ink.strokeWidthPt,
        confidence: ink.confidence,
        from: top.id || null,
        to: bottom.id || null
      };
    }
    return null;
  }

  function sampleConnectorInk(image, ptProbeBox, slideSize) {
    const pxBox = ptToPxBox(ptProbeBox, image, slideSize, 1);
    const background = sampleMaskBackgroundColor(image, pxBox);
    const ink = [];
    const total = Math.max(1, pxBox.w * pxBox.h);
    for (let y = pxBox.y; y < pxBox.y + pxBox.h; y += 1) {
      for (let x = pxBox.x; x < pxBox.x + pxBox.w; x += 1) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        if (colorDistance(color, background) >= 34 && luma(color) < 245) ink.push(color);
      }
    }
    const ratio = ink.length / total;
    if (ink.length < 6 || ratio < 0.035) return null;
    const averaged = averageColor(ink);
    return {
      stroke: rgbToHex(averaged),
      strokeWidthPt: round(clamp(Math.sqrt(ratio) * 4.5, 0.65, 2.5)),
      confidence: round(clamp(0.56 + ratio * 2.4 + colorDistance(averaged, background) / 420, 0.56, 0.94))
    };
  }

  function connectorBoxesNear(a, b) {
    return Math.abs(Number(a.x || 0) - Number(b.x || 0)) <= 4
      && Math.abs(Number(a.y || 0) - Number(b.y || 0)) <= 4
      && Math.abs(Number(a.w || 0) - Number(b.w || 0)) <= 6
      && Math.abs(Number(a.h || 0) - Number(b.h || 0)) <= 6;
  }

  function isContainerCandidateTextBox(textBox, imageBox) {
    const text = String(textBox?.text || "").trim();
    const box = textBox?.box || {};
    if (text.length < 2) return false;
    if (/^[+\-—–·•|/\\]+$/.test(text)) return false;
    if (Number(box.w || 0) < 26 || Number(box.h || 0) < 8) return false;
    if (Number(box.w || 0) > Number(imageBox.w || 0) * 0.92) return false;
    if (Number(box.h || 0) > Number(imageBox.h || 0) * 0.35) return false;
    return true;
  }

  function inferTextBoxContainer(imageBox, textBox, sourceImage, slideSize) {
    const textBoxWidth = Number(textBox?.box?.w || 0);
    const textBoxHeight = Number(textBox?.box?.h || 0);
    const base = expandPtBox(
      textBox.box,
      slideSize,
      Math.max(18, Math.min(38, textBoxWidth * 0.35)),
      Math.max(10, Math.min(22, textBoxHeight * 0.9))
    );
    const box = constrainPtBox(base, imageBox);
    if (box.w < 46 || box.h < 18) return null;
    const pxBox = ptToPxBox(box, sourceImage, slideSize, 0);
    const innerColor = dominantRegionColor(sourceImage, pxBox, 2);
    const outsideColor = sampleMaskBackgroundColor(sourceImage, pxBox);
    const contrast = colorDistance(innerColor, outsideColor);
    const innerSat = saturation(innerColor);
    const outsideSat = saturation(outsideColor);
    const hasVisibleFill = contrast >= 18 || innerSat >= outsideSat + 0.10 || luma(innerColor) < luma(outsideColor) - 18;
    if (!hasVisibleFill) return null;
    const isLightCard = luma(innerColor) > 228 && luma(outsideColor) > 228 && contrast < 32;
    if (isLightCard) return null;
    const aspect = box.w / Math.max(1, box.h);
    const radiusRatio = aspect > 5 ? 0.12 : 0.08;
    const confidence = round(Math.min(0.95, 0.58 + contrast / 180 + Math.min(0.15, innerSat * 0.18)));
    return {
      box,
      shapeType: "roundRect",
      fill: rgbToHex(innerColor),
      stroke: inferContainerStroke(innerColor, outsideColor),
      strokeWidthPt: contrast < 28 ? 0.65 : 0,
      radiusRatio,
      confidence,
      textBoxCount: 1
    };
  }

  function dominantRegionColor(image, box, step = 2) {
    const buckets = new Map();
    const x2 = Math.min(image.width, box.x + box.w);
    const y2 = Math.min(image.height, box.y + box.h);
    for (let y = Math.max(0, box.y); y < y2; y += step) {
      for (let x = Math.max(0, box.x); x < x2; x += step) {
        const color = pixel(image, x, y);
        if (color.a < 64) continue;
        const key = `${Math.round(color.r / 14)},${Math.round(color.g / 14)},${Math.round(color.b / 14)}`;
        const entry = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
        entry.count += 1;
        entry.r += color.r;
        entry.g += color.g;
        entry.b += color.b;
        buckets.set(key, entry);
      }
    }
    const dominant = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
    if (!dominant || dominant.count < 4) return { r: 255, g: 255, b: 255 };
    return {
      r: Math.round(dominant.r / dominant.count),
      g: Math.round(dominant.g / dominant.count),
      b: Math.round(dominant.b / dominant.count)
    };
  }

  function inferContainerStroke(innerColor, outsideColor) {
    if (colorDistance(innerColor, outsideColor) < 28) {
      return luma(innerColor) > 210 ? "#D8D8D8" : rgbToHex(innerColor);
    }
    return "none";
  }

  return {
    createLayerColorBlockShapes,
    createLayerConnectorShapes,
    createLayerContainerShapes,
    createMatrixColorBlockShapes,
    dominantRegionColor,
    hasStrongTableGridEvidence,
    inferLayerConnectors,
    inferLayerContainers,
    shouldObjectifyTableGrid
  };
}

module.exports = { createLayerVisualPrimitivesFactory };
