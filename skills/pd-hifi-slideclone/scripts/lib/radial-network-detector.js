"use strict";

const { createDetectionResult } = require("./detection-result");

const MAX_RASTER_PIXELS = 64_000_000;
const MAX_NETWORK_NODES = 140;
const MAX_COMPONENT_PIXELS = 20_000;

function createRadialNetworkDetector(operations = {}) {
  const ops = validateOperations(operations);

  function shouldObjectify(image = {}) {
    const source = objectValue(image?.source);
    const layer = objectValue(source.layer);
    const understanding = objectValue(layer.diagramUnderstanding);
    const kindCounts = objectValue(understanding.visualAtomKindCounts);
    const visualGridLineCount = finiteNumber(kindCounts["grid-line-candidate"], 0);
    const areaRatio = finiteNumber(layer.areaRatio, 0);
    const aggregateDiagram = source.detector === "foreground-aggregate-crop" && layer.layerType === "diagram-zone";
    const denseCandidate = aggregateDiagram && areaRatio >= 0.42 && visualGridLineCount >= 10;
    return ops.isTerminalCandidate(image) === true
      || (aggregateDiagram && (layer.recommendedAction === "split-native-with-residual-crop" || denseCandidate));
  }

  function infer(image = {}, sourceImage = null, slideSize = ops.defaultSlide) {
    const imageBox = validBox(image?.box) ? image.box : null;
    const safeSlide = validSlide(slideSize, ops.defaultSlide);
    if (!imageBox || !validRaster(sourceImage)) return null;
    const crop = boundedPixelBox(ops.ptToPxBox(imageBox, sourceImage, safeSlide, 0), sourceImage);
    if (!crop) return null;
    const center = {
      x: imageBox.x + imageBox.w / 2,
      y: imageBox.y + imageBox.h * 0.52
    };
    const nodes = detectNodes(sourceImage, crop, safeSlide, center)
      .sort((left, right) => (left.box.y - right.box.y) || (left.box.x - right.box.x))
      .slice(0, MAX_NETWORK_NODES);
    if (nodes.length < 12) return null;
    const centerBox = inferCenterBox(nodes, imageBox);
    return {
      nodes,
      center,
      centerBox,
      detectionResult: createDetectionResult({
        matched: true,
        confidence: Math.min(0.98, 0.7 + nodes.length / 500),
        bounds: imageBox,
        evidence: [{ code: "radial-network.node-density", score: Math.min(1, nodes.length / 80), box: imageBox }],
        reasonCodes: ["radial-network.matched"],
        claimedRegions: [{ id: "radial-network", box: imageBox, purpose: "native-rebuild", dropResidual: false }],
        diagnostics: { "node-count": nodes.length }
      })
    };
  }

  function inferSearchBox(image = {}, network = {}, sourceImage = null, slideSize = ops.defaultSlide) {
    const box = validBox(image?.box) ? image.box : null;
    const nodes = Array.isArray(network?.nodes) ? network.nodes.filter((node) => validPoint(node?.center)) : [];
    const safeSlide = validSlide(slideSize, ops.defaultSlide);
    if (!box || nodes.length < 24 || !validRaster(sourceImage)) return null;
    const rightNodeCount = nodes.filter((node) => node.center.x > box.x + box.w * 0.60).length;
    if (rightNodeCount < 3 && nodes.length < 60) return null;
    const candidate = ops.constrainPtBox({
      x: box.x + box.w * 0.75,
      y: box.y + box.h * 0.43,
      w: ops.clamp(box.w * 0.24, 170, 220),
      h: ops.clamp(box.h * 0.13, 38, 56)
    }, { x: 0, y: 0, w: safeSlide.widthPt, h: safeSlide.heightPt });
    if (!validBox(candidate) || candidate.x + candidate.w > box.x + box.w + 4) return null;
    if (!hasSearchEvidence(sourceImage, candidate, safeSlide)) return null;
    const result = {
      box: roundedBox(candidate),
      iconBox: roundedBox({
        x: candidate.x + candidate.h * 0.35,
        y: candidate.y + candidate.h * 0.28,
        w: candidate.h * 0.34,
        h: candidate.h * 0.34
      }),
      cursorBox: {
        x: ops.round(candidate.x + candidate.h * 0.92),
        y: ops.round(candidate.y + candidate.h * 0.24),
        w: 0,
        h: ops.round(candidate.h * 0.48)
      }
    };
    return {
      ...result,
      detectionResult: createDetectionResult({
        matched: true,
        confidence: 0.82,
        bounds: result.box,
        evidence: [{ code: "radial-network.search-chrome", score: 0.82, box: result.box }],
        reasonCodes: ["radial-network.search-control-matched"],
        claimedRegions: [{ id: "radial-search-control", box: result.box, purpose: "native-rebuild", dropResidual: false }],
        diagnostics: { "network-node-count": nodes.length }
      })
    };
  }

  function detectNodes(image, crop, slideSize, centerPoint) {
    const safeCrop = boundedPixelBox(crop, image);
    const safeSlide = validSlide(slideSize, ops.defaultSlide);
    if (!validRaster(image) || !safeCrop || !validPoint(centerPoint)) return [];
    crop = safeCrop;
    slideSize = safeSlide;
    const visited = new Uint8Array(image.width * image.height);
    const candidates = [];
    for (let y = crop.y; y < crop.y + crop.h; y += 2) {
      for (let x = crop.x; x < crop.x + crop.w; x += 2) {
        const index = y * image.width + x;
        if (visited[index] || !isNodeSeed(image, x, y, crop, slideSize, centerPoint)) continue;
        const queue = [[x, y]];
        visited[index] = 1;
        let queueIndex = 0;
        let minX = x;
        let maxX = x;
        let minY = y;
        let maxY = y;
        const colors = [];
        while (queueIndex < queue.length && colors.length < MAX_COMPONENT_PIXELS) {
          const [currentX, currentY] = queue[queueIndex++];
          colors.push(ops.pixel(image, currentX, currentY));
          minX = Math.min(minX, currentX);
          maxX = Math.max(maxX, currentX);
          minY = Math.min(minY, currentY);
          maxY = Math.max(maxY, currentY);
          for (const [nextX, nextY] of [[currentX + 2, currentY], [currentX - 2, currentY], [currentX, currentY + 2], [currentX, currentY - 2]]) {
            if (nextX < crop.x || nextY < crop.y || nextX >= crop.x + crop.w || nextY >= crop.y + crop.h) continue;
            const nextIndex = nextY * image.width + nextX;
            if (visited[nextIndex] || !isNodeSeed(image, nextX, nextY, crop, slideSize, centerPoint)) continue;
            visited[nextIndex] = 1;
            queue.push([nextX, nextY]);
          }
        }
        const expanded = ops.expandPxBox({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 }, image, 1);
        const nodeBox = boundedPixelBox(expanded, image);
        if (!nodeBox || !isUsefulNodeBox(nodeBox, crop)) continue;
        const ptBox = ops.pxToPtBox(nodeBox, image, slideSize, 0);
        if (!validBox(ptBox)) continue;
        candidates.push({
          box: { ...ptBox },
          center: { x: ops.round(ptBox.x + ptBox.w / 2), y: ops.round(ptBox.y + ptBox.h / 2) },
          color: ops.rgbToHex(ops.averageColor(colors))
        });
      }
    }
    return mergeNodes(candidates);
  }

  function hasSearchEvidence(sourceImage, searchBox, slideSize = ops.defaultSlide) {
    if (!validRaster(sourceImage) || !validBox(searchBox)) return false;
    const pxBox = boundedPixelBox(ops.ptToPxBox(searchBox, sourceImage, validSlide(slideSize, ops.defaultSlide), 0), sourceImage);
    if (!pxBox) return false;
    let grayChrome = 0;
    let sampled = 0;
    for (let y = pxBox.y; y < pxBox.y + pxBox.h; y += 3) {
      for (let x = pxBox.x; x < pxBox.x + pxBox.w; x += 3) {
        const color = ops.pixel(sourceImage, x, y);
        if (!validColor(color)) continue;
        sampled += 1;
        if (ops.saturation(color) < 0.18 && ops.luma(color) >= 45 && ops.luma(color) <= 235) grayChrome += 1;
      }
    }
    return sampled > 0 && grayChrome >= Math.max(6, sampled * 0.006);
  }

  function isNodeSeed(image, x, y, crop, slideSize, centerPoint) {
    const color = ops.pixel(image, x, y);
    if (!isNetworkColor(color)) return false;
    const point = ops.pxToPtBox({ x, y, w: 1, h: 1 }, image, slideSize, 0);
    if (!validPoint(point)) return false;
    const cropWidthPt = crop.w * slideSize.widthPt / image.width;
    const cropHeightPt = crop.h * slideSize.heightPt / image.height;
    if (Math.abs(point.x - centerPoint.x) < cropWidthPt * 0.23 && Math.abs(point.y - centerPoint.y) < cropHeightPt * 0.34) return false;
    return localColorDensity(image, x, y, crop) >= 0.42;
  }

  function localColorDensity(image, x, y, crop) {
    let hits = 0;
    let total = 0;
    const radius = 8;
    for (let yy = Math.max(crop.y, y - radius); yy <= Math.min(crop.y + crop.h - 1, y + radius); yy += 2) {
      for (let xx = Math.max(crop.x, x - radius); xx <= Math.min(crop.x + crop.w - 1, x + radius); xx += 2) {
        total += 1;
        if (isNetworkColor(ops.pixel(image, xx, yy))) hits += 1;
      }
    }
    return hits / Math.max(1, total);
  }

  function isNetworkColor(color) {
    if (!validColor(color) || color.a < 64) return false;
    const hsl = ops.rgbToHsl(color);
    if (!hsl || ![hsl.h, hsl.s, hsl.l].every(Number.isFinite) || hsl.l < 0.22 || hsl.l > 0.72 || hsl.s < 0.38) return false;
    return (hsl.h >= 135 && hsl.h <= 175) || (hsl.h >= 190 && hsl.h <= 220);
  }

  function mergeNodes(nodes) {
    const merged = [];
    for (const node of nodes) {
      const existing = merged.find((item) => ops.boxesNearPt(item.box, node.box, 3));
      if (!existing) {
        merged.push({ ...node });
        continue;
      }
      const box = ops.unionPtBox(existing.box, node.box);
      if (!validBox(box)) continue;
      existing.box = box;
      existing.center = { x: ops.round(box.x + box.w / 2), y: ops.round(box.y + box.h / 2) };
    }
    return merged.filter((node) => node.box.w >= 3 && node.box.h >= 3);
  }

  function inferCenterBox(nodes, imageBox) {
    const midpoint = imageBox.x + imageBox.w / 2;
    const leftNodes = nodes.filter((node) => node.center.x < midpoint).map((node) => node.center.x);
    const rightNodes = nodes.filter((node) => node.center.x >= midpoint).map((node) => node.center.x);
    const left = Math.max(...leftNodes, imageBox.x + imageBox.w * 0.22);
    const right = Math.min(...rightNodes, imageBox.x + imageBox.w * 0.78);
    const denseNetwork = nodes.length >= 80;
    const inferredWidth = Math.max(denseNetwork ? imageBox.w * 0.36 : 80, right - left);
    const inferredCenter = (left + right) / 2;
    return {
      x: ops.round(ops.clamp(inferredCenter - inferredWidth / 2, imageBox.x + imageBox.w * 0.08, imageBox.x + imageBox.w * 0.92 - inferredWidth)),
      y: ops.round(imageBox.y + imageBox.h * (denseNetwork ? 0.04 : 0.08)),
      w: ops.round(inferredWidth),
      h: ops.round(imageBox.h * (denseNetwork ? 0.9 : 0.84))
    };
  }

  function roundedBox(box) {
    return { x: ops.round(box.x), y: ops.round(box.y), w: ops.round(box.w), h: ops.round(box.h) };
  }

  return Object.freeze({ detectNodes, hasSearchEvidence, infer, inferSearchBox, shouldObjectify });
}

function validateOperations(operations) {
  if (!operations || typeof operations !== "object" || Array.isArray(operations)) throw new TypeError("radial network detector operations must be an object");
  const required = [
    "averageColor", "boxesNearPt", "clamp", "constrainPtBox", "expandPxBox", "isTerminalCandidate",
    "luma", "pixel", "ptToPxBox", "pxToPtBox", "rgbToHex", "rgbToHsl", "round", "saturation", "unionPtBox"
  ];
  for (const name of required) {
    if (typeof operations[name] !== "function") throw new TypeError(`radial network detector operation ${name} must be a function`);
  }
  if (!validSlide(operations.defaultSlide, null)) throw new TypeError("radial network detector defaultSlide must contain positive finite dimensions");
  return Object.freeze({ ...operations, defaultSlide: Object.freeze({ ...operations.defaultSlide }) });
}

function isUsefulNodeBox(box, crop) {
  const minSize = Math.max(6, Math.min(crop.w, crop.h) * 0.012);
  const maxSize = Math.max(18, Math.min(crop.w, crop.h) * 0.055);
  const ratio = box.w / Math.max(1, box.h);
  return ratio >= 0.55 && ratio <= 1.65 && box.w >= minSize && box.h >= minSize && box.w <= maxSize && box.h <= maxSize;
}

function boundedPixelBox(box, image) {
  if (!box || !validRaster(image) || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  const x = Math.max(0, Math.min(image.width, Math.floor(box.x)));
  const y = Math.max(0, Math.min(image.height, Math.floor(box.y)));
  const right = Math.max(x, Math.min(image.width, Math.ceil(box.x + box.w)));
  const bottom = Math.max(y, Math.min(image.height, Math.ceil(box.y + box.h)));
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function validRaster(image) {
  return Boolean(image) && Number.isInteger(image.width) && Number.isInteger(image.height)
    && image.width > 0 && image.height > 0 && image.width * image.height <= MAX_RASTER_PIXELS;
}

function validSlide(value, fallback) {
  if (value && Number.isFinite(value.widthPt) && Number.isFinite(value.heightPt) && value.widthPt > 0 && value.heightPt > 0) return value;
  return fallback;
}

function validBox(box) {
  return Boolean(box) && [box.x, box.y, box.w, box.h].every(Number.isFinite) && box.w > 0 && box.h > 0
    && [box.x, box.y, box.w, box.h].every((value) => Math.abs(value) <= 100000);
}

function validPoint(point) {
  return Boolean(point) && Number.isFinite(point.x) && Number.isFinite(point.y)
    && Math.abs(point.x) <= 100000 && Math.abs(point.y) <= 100000;
}

function validColor(color) {
  return Boolean(color) && [color.r, color.g, color.b, color.a].every(Number.isFinite);
}

function finiteNumber(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  MAX_NETWORK_NODES,
  MAX_RASTER_PIXELS,
  createRadialNetworkDetector
};
