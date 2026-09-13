"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createProductBrainVisionFactory(dependencies = {}) {
  const {
    averageColor,
    clamp,
    constrainPtBox,
    hexToRgb,
    luma,
    pixel,
    ptToPxBox,
    rgbToHex,
    round
  } = dependencies;
  const required = {
    averageColor,
    clamp,
    constrainPtBox,
    hexToRgb,
    luma,
    pixel,
    ptToPxBox,
    rgbToHex,
    round
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`product brain vision dependency ${name} must be a function`);
  }

  function createProductBrainVisionObjects(page, slideSize = DEFAULT_SLIDE, options = {}) {
    if (!page || !Array.isArray(page.images)) return { shapes: [], textBoxes: [] };
    const shapes = [];
    const textBoxes = [];
    for (const image of page.images) {
      if (!shouldObjectifyProductBrainVision(image, page, slideSize, options)) continue;
      const objects = productBrainVisionObjectsForImage(image, slideSize, options);
      if (objects.shapes.length === 0) continue;
      shapes.push(...objects.shapes);
      textBoxes.push(...objects.textBoxes);
      image.source = {
        ...(image.source || {}),
        productBrainVisionObjectified: true,
        productBrainVisionResidualBoxes: [],
        dropErasedResidualAfterNativeRebuild: true,
        nonEditableReason: `${image.source?.nonEditableReason || image.source?.reason || "vision illustration crop"}; rebuilt mosaic background, lens, search box, and center product map as native components`
      };
    }
    return { shapes, textBoxes };
  }

  function shouldObjectifyProductBrainVision(image, page = {}, slideSize = DEFAULT_SLIDE, options = {}) {
    const explicitCandidate = image?.source?.productBrainVisionCandidate === true
      || image?.source?.detector === "product-brain-vision-underlay-crop"
      || isHeuristicProductBrainVisionCandidate(image, page);
    if (!explicitCandidate && options.allowHeuristicProductBrainVision !== true) return false;
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const slideArea = Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    const areaRatio = w * h / slideArea;
    if (w < 780 || h < 320 || areaRatio < 0.55 || areaRatio > 0.75) return false;
    const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
    if (/四层标准化架构|PM\s*Portal\s*Platform|门户\s*Hub\s*层|Runtime\s*层|CLI\s*域仓层|AI\s*Skills\s*层/i.test(pageText)) return false;
    return /数字化产品大脑|物流资产|产品地图|多域聚合/i.test(pageText);
  }

  function isHeuristicProductBrainVisionCandidate(image = {}, page = {}) {
    const source = image.source || {};
    const detector = String(source.detector || "");
    if (detector !== "screenshot-process-underlay-crop") return false;
    const pageText = (page.textBoxes || []).map((item) => String(item.text || "")).join(" ");
    if (!/数字化产品大脑|物流资产|产品地图|多域聚合/i.test(pageText)) return false;
    const reason = `${source.reason || ""} ${source.nonEditableReason || ""}`.toLowerCase();
    return /screenshot|process|illustration|local-crop/.test(reason);
  }

  function productBrainVisionObjectsForImage(image, slideSize = DEFAULT_SLIDE, options = {}) {
    const box = image.box || {};
    const base = image.id || "product-brain-vision";
    const source = (detector, extra = {}) => ({
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: image.id || null,
      layerType: image.source?.layer?.layerType || "screenshot-zone",
      sourceDetector: image.source?.detector || null,
      confidence: 0.72,
      ...extra
    });
    const lens = productBrainVisionLensBox(box, slideSize);
    const search = {
      x: round(lens.x + lens.w * 0.18),
      y: round(lens.y + lens.h * 0.06),
      w: round(lens.w * 0.72),
      h: round(lens.h * 0.16)
    };
    const shapes = [
      ...productBrainVisionTileShapes(base, box, lens, source, {
        sourceImage: options.sampleTileFills === true ? options.sourceImage : null,
        slideSize
      }),
      ...productBrainVisionCenterMapShapes(base, lens, source),
      {
        id: `${base}-native-lens`,
        type: "ellipse",
        box: lens,
        style: {
          stroke: "#31C77E",
          strokeWidthPt: 5.2,
          shadow: { color: "#29C873", alpha: 0.20, blurPt: 14, distancePt: 0, angle: 0 }
        },
        source: source("product-brain-vision-native-lens")
      },
      {
        id: `${base}-native-search-box`,
        type: "roundrect",
        box: search,
        style: {
          fill: "#F9FCFF",
          stroke: "#9BC6DF",
          strokeWidthPt: 1.4,
          radiusRatio: 0.18,
          shadow: { color: "#7DAAC0", alpha: 0.14, blurPt: 5, distancePt: 1, angle: 90 }
        },
        source: source("product-brain-vision-native-search")
      },
      {
        id: `${base}-native-search-icon-circle`,
        type: "ellipse",
        box: {
          x: round(search.x + search.w * 0.055),
          y: round(search.y + search.h * 0.32),
          w: round(search.h * 0.34),
          h: round(search.h * 0.34)
        },
        style: { fill: "none", stroke: "#6AA7C5", strokeWidthPt: 1.8 },
        source: source("product-brain-vision-native-search-icon-circle")
      },
      {
        id: `${base}-native-search-icon-line`,
        type: "line",
        box: lineBox(
          { x: search.x + search.w * 0.095, y: search.y + search.h * 0.61 },
          { x: search.x + search.w * 0.125, y: search.y + search.h * 0.78 }
        ),
        style: { stroke: "#6AA7C5", strokeWidthPt: 1.8, connectorType: "straight" },
        source: source("product-brain-vision-native-search-icon")
      },
      {
        id: `${base}-native-cursor`,
        type: "triangle",
        box: {
          x: round(search.x + search.w * 0.43),
          y: round(search.y + search.h * 0.52),
          w: round(search.h * 0.16),
          h: round(search.h * 0.26)
        },
        rotation: -22,
        style: { fill: "#111111", stroke: "#111111", strokeWidthPt: 0 },
        source: source("product-brain-vision-native-cursor")
      }
    ];
    const textBoxes = [{
      id: `${base}-native-search-text`,
      text: "物流资产",
      box: {
        x: round(search.x + search.w * 0.17),
        y: round(search.y + search.h * 0.17),
        w: round(search.w * 0.34),
        h: round(search.h * 0.62)
      },
      font: { family: "Microsoft YaHei", sizePt: 18, color: "#222222", opacity: 1, weight: "regular", align: "left", valign: "middle" },
      source: source("product-brain-vision-native-search-text")
    }];
    return { shapes, textBoxes };
  }

  function productBrainVisionTileShapes(base, box, lens, source, options = {}) {
    const shapes = [];
    const cols = 40;
    const rows = 15;
    const gapX = Number(box.w || 0) * 0.0022;
    const gapY = Number(box.h || 0) * 0.006;
    const tileW = (Number(box.w || 0) - gapX * (cols - 1)) / cols;
    const tileH = (Number(box.h || 0) * 0.70 - gapY * (rows - 1)) / rows;
    const gridY = Number(box.y || 0) + Number(box.h || 0) * 0.02;
    const centerX = Number(box.x || 0) + Number(box.w || 0) * 0.50;
    const centerY = gridY + Number(box.h || 0) * 0.30;
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        const x = Number(box.x || 0) + col * (tileW + gapX);
        const y = gridY + row * (tileH + gapY);
        const cx = x + tileW / 2;
        const cy = y + tileH / 2;
        if (pointInsideEllipse({ x: cx, y: cy }, lens, 0.96)) continue;
        const edgeFade = Math.min(col, cols - 1 - col) / Math.max(1, cols * 0.18);
        const radial = 1 - Math.min(1, Math.hypot((cx - centerX) / (Number(box.w || 1) * 0.48), (cy - centerY) / (Number(box.h || 1) * 0.50)));
        const strength = Math.max(0, Math.min(1, 0.26 + 0.78 * radial)) * Math.max(0.22, Math.min(1, edgeFade));
        const fallbackFill = interpolateHex("#EAF3F7", "#075F98", strength);
        const sampledFill = sampleProductBrainVisionTileFill(options.sourceImage, {
          x,
          y,
          w: tileW,
          h: tileH
        }, options.slideSize || DEFAULT_SLIDE);
        const fill = sampledFill ? blendHex(fallbackFill, sampledFill, 0.42) : fallbackFill;
        shapes.push({
          id: `${base}-native-tile-${row}-${col}`,
          type: "rect",
          box: { x: round(x), y: round(y), w: round(tileW), h: round(tileH) },
          style: { fill, stroke: "none", strokeWidthPt: 0 },
          source: source("product-brain-vision-native-tile", {
            row,
            col,
            sampledFill: Boolean(sampledFill)
          })
        });
      }
    }
    return shapes;
  }

  function productBrainVisionCenterMapShapes(base, lens, source) {
    const shapes = [];
    const blue = "#116DB5";
    const green = "#42B985";
    const pale = "#E9F4FB";
    const center = {
      x: lens.x + lens.w * 0.18,
      y: lens.y + lens.h * 0.32,
      w: lens.w * 0.64,
      h: lens.h * 0.48
    };
    const nodes = [
      { x: 0.50, y: 0.18, w: 0.23, h: 0.09, kind: "rect" },
      { x: 0.50, y: 0.42, w: 0.22, h: 0.09, kind: "rect" },
      { x: 0.50, y: 0.66, w: 0.20, h: 0.10, kind: "hexagon" },
      { x: 0.28, y: 0.42, w: 0.13, h: 0.13, kind: "circle" },
      { x: 0.75, y: 0.20, w: 0.16, h: 0.08, kind: "rect" },
      { x: 0.76, y: 0.48, w: 0.13, h: 0.13, kind: "circle" },
      { x: 0.75, y: 0.72, w: 0.14, h: 0.10, kind: "rect" },
      { x: 0.17, y: 0.18, w: 0.16, h: 0.08, kind: "rect" },
      { x: 0.17, y: 0.70, w: 0.15, h: 0.08, kind: "rect" },
      { x: 0.36, y: 0.88, w: 0.12, h: 0.12, kind: "hexagon" },
      { x: 0.08, y: 0.42, w: 0.10, h: 0.10, kind: "circle", fill: "#BBD8F0" },
      { x: 0.92, y: 0.40, w: 0.12, h: 0.10, kind: "diamond", fill: "#C7DEF2" }
    ].map((node, index) => {
      const w = center.w * node.w;
      const h = center.h * node.h;
      return {
        ...node,
        index,
        box: {
          x: center.x + center.w * node.x - w / 2,
          y: center.y + center.h * node.y - h / 2,
          w,
          h
        }
      };
    });
    const byIndex = new Map(nodes.map((node) => [node.index, node]));
    [
      [0, 1], [1, 2], [3, 1], [7, 3], [8, 3], [1, 5], [4, 5], [5, 6],
      [2, 9], [3, 9], [2, 6], [10, 7], [6, 11], [0, 4], [8, 2]
    ].forEach(([from, to], index) => {
      const a = byIndex.get(from).box;
      const b = byIndex.get(to).box;
      shapes.push({
        id: `${base}-native-product-map-edge-${index}`,
        type: "line",
        box: lineBox({ x: a.x + a.w / 2, y: a.y + a.h / 2 }, { x: b.x + b.w / 2, y: b.y + b.h / 2 }),
        style: { stroke: green, strokeWidthPt: 1.1, connectorType: "straight" },
        source: source("product-brain-vision-native-product-map-edge", { edgeIndex: index })
      });
    });
    shapes.push({
      id: `${base}-native-product-map-left-card`,
      type: "roundRect",
      box: { x: center.x + center.w * 0.20, y: center.y + center.h * 0.55, w: center.w * 0.22, h: center.h * 0.26 },
      style: { fill: pale, stroke: "#B8D2E3", strokeWidthPt: 1.0, radiusPt: 3 },
      source: source("product-brain-vision-native-product-map-card", { cardRole: "service-center" })
    });
    shapes.push({
      id: `${base}-native-product-map-right-card`,
      type: "roundRect",
      box: { x: center.x + center.w * 0.66, y: center.y + center.h * 0.45, w: center.w * 0.22, h: center.h * 0.30 },
      style: { fill: pale, stroke: "#B8D2E3", strokeWidthPt: 1.0, radiusPt: 3 },
      source: source("product-brain-vision-native-product-map-card", { cardRole: "customer-center" })
    });
    for (const node of nodes) {
      shapes.push({
        id: `${base}-native-product-map-node-${node.index}`,
        type: node.kind === "circle" ? "ellipse" : node.kind,
        box: {
          x: round(node.box.x),
          y: round(node.box.y),
          w: round(node.box.w),
          h: round(node.box.h)
        },
        style: { fill: node.fill || blue, stroke: node.fill || blue, strokeWidthPt: 0.8 },
        source: source("product-brain-vision-native-product-map-node", { nodeKind: node.kind, nodeIndex: node.index })
      });
    }
    return shapes;
  }

  function sampleProductBrainVisionTileFill(sourceImage, ptBox, slideSize = DEFAULT_SLIDE) {
    if (!sourceImage || !sourceImage.rgba || !Number.isFinite(Number(ptBox?.w)) || !Number.isFinite(Number(ptBox?.h))) return null;
    const pxBox = ptToPxBox(ptBox, sourceImage, slideSize, 0);
    const centerX = pxBox.x + pxBox.w / 2;
    const centerY = pxBox.y + pxBox.h / 2;
    const windowW = Math.max(pxBox.w, Math.round(pxBox.w * 5.5));
    const windowH = Math.max(pxBox.h, Math.round(pxBox.h * 5.5));
    const x1 = clamp(Math.round(centerX - windowW / 2), 0, sourceImage.width - 1);
    const y1 = clamp(Math.round(centerY - windowH / 2), 0, sourceImage.height - 1);
    const x2 = clamp(Math.round(centerX + windowW / 2), x1 + 1, sourceImage.width);
    const y2 = clamp(Math.round(centerY + windowH / 2), y1 + 1, sourceImage.height);
    const samples = [];
    const step = Math.max(1, Math.ceil(Math.sqrt(((x2 - x1) * (y2 - y1)) / 28)));
    for (let y = y1; y < y2; y += step) {
      for (let x = x1; x < x2; x += step) {
        const color = pixel(sourceImage, x, y);
        if (color.a < 16) continue;
        if (color.b + color.g * 0.25 < color.r + 18 && luma(color) > 230) continue;
        samples.push(color);
      }
    }
    if (samples.length === 0) return null;
    return rgbToHex(averageColor(samples));
  }

  function productBrainVisionLensBox(box = {}, slideSize = DEFAULT_SLIDE) {
    return constrainPtBox({
      x: Number(box.x || 0) + Number(box.w || 0) * 0.33,
      y: Number(box.y || 0) - Number(box.h || 0) * 0.03,
      w: Number(box.w || 0) * 0.36,
      h: Number(box.w || 0) * 0.36
    }, { x: 0, y: 0, w: slideSize.widthPt || DEFAULT_SLIDE.widthPt, h: slideSize.heightPt || DEFAULT_SLIDE.heightPt });
  }

  function productBrainVisionResidualRegions(box = {}) {
    const lens = productBrainVisionLensBox(box);
    return [{
      name: "lens-product-map",
      mask: "ellipse",
      transparentTopRatio: 0.24,
      drawAfterShapes: true,
      box: {
        x: round(lens.x + lens.w * 0.03),
        y: round(lens.y + lens.h * 0.03),
        w: round(lens.w * 0.94),
        h: round(lens.h * 0.94)
      }
    }];
  }

  function interpolateHex(start, end, t) {
    const ratio = Math.max(0, Math.min(1, Number(t || 0)));
    const a = hexToRgb(start);
    const b = hexToRgb(end);
    const ch = (key) => Math.round(a[key] + (b[key] - a[key]) * ratio);
    return `#${[ch("r"), ch("g"), ch("b")].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  function blendHex(base, overlay, overlayRatio) {
    const a = hexToRgb(base);
    const b = hexToRgb(overlay);
    const ratio = Math.max(0, Math.min(1, Number(overlayRatio || 0)));
    const ch = (key) => Math.round(a[key] + (b[key] - a[key]) * ratio);
    return `#${[ch("r"), ch("g"), ch("b")].map((value) => value.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }

  return {
    createProductBrainVisionObjects,
    productBrainVisionObjectsForImage,
    productBrainVisionResidualRegions,
    shouldObjectifyProductBrainVision
  };
}

function pointInsideEllipse(point, box, scale = 1) {
  const rx = Math.max(1, Number(box.w || 0) * Number(scale || 1) / 2);
  const ry = Math.max(1, Number(box.h || 0) * Number(scale || 1) / 2);
  const cx = Number(box.x || 0) + Number(box.w || 0) / 2;
  const cy = Number(box.y || 0) + Number(box.h || 0) / 2;
  const dx = (Number(point.x || 0) - cx) / rx;
  const dy = (Number(point.y || 0) - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

module.exports = {
  createProductBrainVisionFactory,
  _private: {
    pointInsideEllipse
  }
};
