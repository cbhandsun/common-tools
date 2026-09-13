"use strict";

const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");

function createFunnelHubResidualFactory(dependencies = {}) {
  const { round } = dependencies;
  if (typeof round !== "function") throw new TypeError("funnel hub residual dependency round must be a function");

  function createFunnelHubResidualNativeShapes(page, slideSize = DEFAULT_SLIDE) {
    if (!page || !Array.isArray(page.images)) return [];
    const shapes = [];
    const keptImages = [];
    for (const image of page.images) {
      const localShapes = funnelHubResidualNativeShapesForImage(image, slideSize);
      if (localShapes.length === 0) {
        keptImages.push(image);
        continue;
      }
      shapes.push(...localShapes);
      image.source = {
        ...(image.source || {}),
        funnelHubResidualObjectified: true,
        residualSplitDropped: true,
        dropErasedResidualAfterNativeRebuild: true
      };
    }
    if (shapes.length > 0) page.images = keptImages;
    return shapes;
  }
  
  function funnelHubResidualNativeShapesForImage(image, slideSize = DEFAULT_SLIDE) {
    if (image?.source?.detector !== "funnel-hub-residual-crop") return [];
    if (image?.source?.protectedMinimumUnit === true || image?.source?.intentionalMinimumUnitCrop === true) return [];
    const id = String(image.id || "");
    const box = image.box || {};
    const w = Number(box.w || 0);
    const h = Number(box.h || 0);
    const areaRatio = w * h / Math.max(1, Number(slideSize.widthPt || DEFAULT_SLIDE.widthPt) * Number(slideSize.heightPt || DEFAULT_SLIDE.heightPt));
    if (id.includes("left-output-icon") || id.includes("right-output-icon")) {
      if (w < 70 || h < 55 || w > 160 || h > 120 || areaRatio > 0.026) return [];
      if (id.includes("left-output-icon")) return funnelHubNativeDocumentIconShapes(image);
      return funnelHubNativeDeviceIconShapes(image);
    }
    if (id.includes("input-docs-html") || id.includes("input-screenshots") || id.includes("input-mock-data")) {
      if (w < 120 || h < 65 || w > 230 || h > 125 || areaRatio > 0.05) return [];
      if (id.includes("input-docs-html")) return funnelHubNativeInputDocsHtmlShapes(image);
      if (id.includes("input-screenshots")) return funnelHubNativeInputScreenshotsShapes(image);
      return funnelHubNativeInputMockDataShapes(image);
    }
    return [];
  }
  
  function funnelHubNativeSource(image, detector, extra = {}) {
    return {
      editable: true,
      nativeRebuild: true,
      detector,
      layerSourceId: image.source?.parentImageId || image.id || null,
      sourceResidualId: image.id || null,
      sourceResidualDetector: image.source?.detector || null,
      confidence: 0.66,
      ...extra
    };
  }
  
  function funnelHubNativeDocumentIconShapes(image) {
    const box = image.box || {};
    const base = image.id || "funnel-hub-output-document";
    const card = {
      x: box.x + box.w * 0.22,
      y: box.y + box.h * 0.08,
      w: box.w * 0.42,
      h: box.h * 0.74
    };
    const source = (detector, extra = {}) => funnelHubNativeSource(image, detector, { confidence: 0.68, ...extra });
    return [
      {
        id: `${base}-native-document-shadow`,
        type: "roundRect",
        box: { x: round(card.x + box.w * 0.025), y: round(card.y + box.h * 0.055), w: round(card.w), h: round(card.h) },
        style: { fill: "#DCEFEF", stroke: "none", strokeWidthPt: 0, radiusRatio: 0.05 },
        source: source("funnel-hub-residual-native-document-shadow")
      },
      {
        id: `${base}-native-document-card`,
        type: "roundRect",
        box: { x: round(card.x), y: round(card.y), w: round(card.w), h: round(card.h) },
        style: { fill: "#F8FBFC", stroke: "#5C6F71", strokeWidthPt: 1.2, radiusRatio: 0.04 },
        source: source("funnel-hub-residual-native-document-card")
      },
      {
        id: `${base}-native-document-accent`,
        type: "rect",
        box: { x: round(card.x + card.w * 0.08), y: round(card.y + card.h * 0.34), w: round(card.w * 0.74), h: round(card.h * 0.18) },
        style: { fill: "#36B979", stroke: "#22965F", strokeWidthPt: 0.5 },
        source: source("funnel-hub-residual-native-document-accent")
      },
      ...[0, 1, 2].map((index) => ({
        id: `${base}-native-document-line-${index}`,
        type: "line",
        box: {
          x: round(card.x + card.w * 0.12),
          y: round(card.y + card.h * (0.17 + index * 0.19)),
          w: round(card.w * (index === 0 ? 0.58 : 0.68)),
          h: 0
        },
        style: { stroke: "#68797C", strokeWidthPt: 1, connectorType: "straight" },
        source: source("funnel-hub-residual-native-document-line", { lineIndex: index })
      })),
      {
        id: `${base}-native-document-base`,
        type: "line",
        box: { x: round(box.x + box.w * 0.12), y: round(box.y + box.h * 0.86), w: round(box.w * 0.72), h: 0 },
        style: { stroke: "#8DD7D1", strokeWidthPt: 2, connectorType: "straight" },
        source: source("funnel-hub-residual-native-document-base")
      }
    ];
  }
  
  function funnelHubNativeDeviceIconShapes(image) {
    const box = image.box || {};
    const base = image.id || "funnel-hub-output-device";
    const device = {
      x: box.x + box.w * 0.22,
      y: box.y + box.h * 0.08,
      w: box.w * 0.54,
      h: box.h * 0.72
    };
    const source = (detector, extra = {}) => funnelHubNativeSource(image, detector, { confidence: 0.67, ...extra });
    return [
      {
        id: `${base}-native-device-body`,
        type: "roundRect",
        box: { x: round(device.x), y: round(device.y), w: round(device.w), h: round(device.h) },
        style: { fill: "#EEF5F5", stroke: "#5D6367", strokeWidthPt: 1.4, radiusRatio: 0.08 },
        source: source("funnel-hub-residual-native-device-body")
      },
      {
        id: `${base}-native-device-header`,
        type: "rect",
        box: { x: round(device.x + device.w * 0.05), y: round(device.y + device.h * 0.06), w: round(device.w * 0.8), h: round(device.h * 0.18) },
        style: { fill: "#2E78B9", stroke: "none", strokeWidthPt: 0 },
        source: source("funnel-hub-residual-native-device-header")
      },
      {
        id: `${base}-native-device-screen`,
        type: "rect",
        box: { x: round(device.x + device.w * 0.15), y: round(device.y + device.h * 0.30), w: round(device.w * 0.52), h: round(device.h * 0.38) },
        style: { fill: "#41B878", stroke: "#27985F", strokeWidthPt: 0.6 },
        source: source("funnel-hub-residual-native-device-screen")
      },
      {
        id: `${base}-native-device-button`,
        type: "ellipse",
        box: { x: round(device.x + device.w * 0.82), y: round(device.y + device.h * 0.46), w: round(device.w * 0.08), h: round(device.w * 0.08) },
        style: { fill: "#D6DEE0", stroke: "#5D6367", strokeWidthPt: 0.8 },
        source: source("funnel-hub-residual-native-device-button")
      },
      {
        id: `${base}-native-device-base`,
        type: "line",
        box: { x: round(box.x + box.w * 0.12), y: round(box.y + box.h * 0.86), w: round(box.w * 0.76), h: 0 },
        style: { stroke: "#8DD7D1", strokeWidthPt: 2, connectorType: "straight" },
        source: source("funnel-hub-residual-native-device-base")
      }
    ];
  }
  
  function funnelHubNativeInputDocsHtmlShapes(image) {
    const box = image.box || {};
    const base = image.id || "funnel-hub-input-docs-html";
    const source = (detector, extra = {}) => funnelHubNativeSource(image, detector, { confidence: 0.62, ...extra });
    const doc = { x: box.x + box.w * 0.08, y: box.y + box.h * 0.02, w: box.w * 0.34, h: box.h * 0.58 };
    const html = { x: box.x + box.w * 0.58, y: box.y + box.h * 0.12, w: box.w * 0.27, h: box.h * 0.43 };
    const bucket = { x: box.x + box.w * 0.02, y: box.y + box.h * 0.46, w: box.w * 0.46, h: box.h * 0.44 };
    return [
      {
        id: `${base}-native-bucket-body`,
        type: "ellipse",
        box: { x: round(bucket.x), y: round(bucket.y), w: round(bucket.w), h: round(bucket.h * 0.95) },
        style: { fill: "#3D8ED0", stroke: "#32383D", strokeWidthPt: 1.1 },
        source: source("funnel-hub-residual-native-input-docs-bucket")
      },
      {
        id: `${base}-native-bucket-mask`,
        type: "rect",
        box: { x: round(bucket.x + bucket.w * 0.06), y: round(bucket.y), w: round(bucket.w * 0.88), h: round(bucket.h * 0.42) },
        style: { fill: "#9D9C9E", stroke: "none", strokeWidthPt: 0 },
        source: source("funnel-hub-residual-native-input-docs-occlusion")
      },
      {
        id: `${base}-native-doc-card`,
        type: "rect",
        box: { x: round(doc.x), y: round(doc.y), w: round(doc.w), h: round(doc.h) },
        style: { fill: "#EFF5F7", stroke: "#303943", strokeWidthPt: 1.2, rotation: -12 },
        source: source("funnel-hub-residual-native-input-doc-card")
      },
      {
        id: `${base}-native-doc-fold`,
        type: "rect",
        box: { x: round(doc.x + doc.w * 0.72), y: round(doc.y), w: round(doc.w * 0.22), h: round(doc.h * 0.18) },
        style: { fill: "#2D74B5", stroke: "#303943", strokeWidthPt: 0.8, rotation: -12 },
        source: source("funnel-hub-residual-native-input-doc-fold")
      },
      {
        id: `${base}-native-doc-mark`,
        type: "line",
        box: { x: round(doc.x + doc.w * 0.25), y: round(doc.y + doc.h * 0.48), w: round(doc.w * 0.42), h: 0 },
        style: { stroke: "#2E6FA8", strokeWidthPt: 3, connectorType: "straight" },
        source: source("funnel-hub-residual-native-input-doc-mark")
      },
      ...[0, 1].map((index) => ({
        id: `${base}-native-doc-line-${index}`,
        type: "line",
        box: {
          x: round(doc.x + doc.w * 0.50),
          y: round(doc.y + doc.h * (0.32 + index * 0.18)),
          w: round(doc.w * 0.32),
          h: 0
        },
        style: { stroke: "#596B77", strokeWidthPt: 1.2, connectorType: "straight" },
        source: source("funnel-hub-residual-native-input-doc-line", { lineIndex: index })
      })),
      {
        id: `${base}-native-html-card`,
        type: "rect",
        box: { x: round(html.x), y: round(html.y), w: round(html.w), h: round(html.h) },
        style: { fill: "#F3F7F7", stroke: "#343C42", strokeWidthPt: 1.1, rotation: 6 },
        source: source("funnel-hub-residual-native-input-html-card")
      },
      {
        id: `${base}-native-html-fold`,
        type: "rect",
        box: { x: round(html.x + html.w * 0.73), y: round(html.y), w: round(html.w * 0.22), h: round(html.h * 0.22) },
        style: { fill: "#F1A443", stroke: "#343C42", strokeWidthPt: 0.8, rotation: 6 },
        source: source("funnel-hub-residual-native-input-html-fold")
      },
      {
        id: `${base}-native-html-chevron-left`,
        type: "line",
        box: { x: round(html.x + html.w * 0.30), y: round(html.y + html.h * 0.50), w: round(html.w * 0.12), h: round(html.h * -0.13) },
        style: { stroke: "#D58A3B", strokeWidthPt: 2, connectorType: "straight" },
        source: source("funnel-hub-residual-native-input-html-chevron")
      },
      {
        id: `${base}-native-html-chevron-right`,
        type: "line",
        box: { x: round(html.x + html.w * 0.56), y: round(html.y + html.h * 0.37), w: round(html.w * 0.12), h: round(html.h * 0.13) },
        style: { stroke: "#D58A3B", strokeWidthPt: 2, connectorType: "straight" },
        source: source("funnel-hub-residual-native-input-html-chevron")
      },
      {
        id: `${base}-native-foreground-mask`,
        type: "rect",
        box: { x: round(box.x + box.w * 0.35), y: round(box.y + box.h * 0.40), w: round(box.w * 0.66), h: round(box.h * 0.62) },
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
        source: source("funnel-hub-residual-native-input-docs-white-mask")
      }
    ];
  }
  
  function funnelHubNativeInputScreenshotsShapes(image) {
    const box = image.box || {};
    const base = image.id || "funnel-hub-input-screenshots";
    const source = (detector, extra = {}) => funnelHubNativeSource(image, detector, { confidence: 0.64, ...extra });
    const rear = { x: box.x + box.w * -0.02, y: box.y + box.h * 0.00, w: box.w * 0.52, h: box.h * 0.38 };
    const front = { x: box.x + box.w * 0.15, y: box.y + box.h * 0.23, w: box.w * 0.74, h: box.h * 0.48 };
    return [
      {
        id: `${base}-native-rear-window`,
        type: "rect",
        box: { x: round(rear.x), y: round(rear.y), w: round(rear.w), h: round(rear.h) },
        style: { fill: "#F9FBFB", stroke: "#343A3F", strokeWidthPt: 1.1, rotation: -2 },
        source: source("funnel-hub-residual-native-input-screenshot-window")
      },
      {
        id: `${base}-native-rear-header`,
        type: "rect",
        box: { x: round(rear.x + rear.w * 0.04), y: round(rear.y + rear.h * 0.08), w: round(rear.w * 0.56), h: round(rear.h * 0.10) },
        style: { fill: "#D9DDDD", stroke: "#343A3F", strokeWidthPt: 0.6, rotation: -2 },
        source: source("funnel-hub-residual-native-input-screenshot-header")
      },
      ...[0, 1, 2].map((index) => ({
        id: `${base}-native-rear-line-${index}`,
        type: "line",
        box: {
          x: round(rear.x + rear.w * 0.08),
          y: round(rear.y + rear.h * (0.34 + index * 0.16)),
          w: round(rear.w * (index === 1 ? 0.38 : 0.46)),
          h: 0
        },
        style: { stroke: index === 1 ? "#B54D57" : "#31383F", strokeWidthPt: 1.1, connectorType: "straight" },
        source: source("funnel-hub-residual-native-input-screenshot-line", { lineIndex: index })
      })),
      {
        id: `${base}-native-front-window`,
        type: "rect",
        box: { x: round(front.x), y: round(front.y), w: round(front.w), h: round(front.h) },
        style: { fill: "#EFF3F4", stroke: "#30373C", strokeWidthPt: 1.2 },
        source: source("funnel-hub-residual-native-input-screenshot-window-front")
      },
      {
        id: `${base}-native-front-toolbar`,
        type: "rect",
        box: { x: round(front.x), y: round(front.y), w: round(front.w), h: round(front.h * 0.18) },
        style: { fill: "#C8CECF", stroke: "#30373C", strokeWidthPt: 0.8 },
        source: source("funnel-hub-residual-native-input-screenshot-toolbar")
      },
      ...[0, 1, 2].map((index) => ({
        id: `${base}-native-front-dot-${index}`,
        type: "ellipse",
        box: {
          x: round(front.x + front.w * (0.08 + index * 0.075)),
          y: round(front.y + front.h * 0.055),
          w: round(front.h * 0.055),
          h: round(front.h * 0.055)
        },
        style: { fill: "#EEF4F4", stroke: "#4B5357", strokeWidthPt: 0.6 },
        source: source("funnel-hub-residual-native-input-screenshot-dot", { dotIndex: index })
      })),
      {
        id: `${base}-native-blue-card`,
        type: "rect",
        box: { x: round(front.x + front.w * 0.13), y: round(front.y + front.h * 0.28), w: round(front.w * 0.22), h: round(front.h * 0.58) },
        style: { fill: "#2D73B6", stroke: "#2B4E73", strokeWidthPt: 0.7 },
        source: source("funnel-hub-residual-native-input-screenshot-blue-card")
      },
      {
        id: `${base}-native-small-card`,
        type: "rect",
        box: { x: round(front.x + front.w * 0.52), y: round(front.y + front.h * 0.55), w: round(front.w * 0.19), h: round(front.h * 0.25) },
        style: { fill: "#E0E5E5", stroke: "#30373C", strokeWidthPt: 0.8 },
        source: source("funnel-hub-residual-native-input-screenshot-card")
      },
      {
        id: `${base}-native-callout-card`,
        type: "rect",
        box: { x: round(front.x + front.w * 0.70), y: round(front.y + front.h * 0.28), w: round(front.w * 0.24), h: round(front.h * 0.26) },
        style: { fill: "#EFE6DF", stroke: "#30373C", strokeWidthPt: 0.8 },
        source: source("funnel-hub-residual-native-input-screenshot-callout")
      },
      {
        id: `${base}-native-arrow-red`,
        type: "line",
        box: { x: round(box.x + box.w * 0.30), y: round(box.y + box.h * 0.16), w: round(box.w * 0.28), h: round(box.h * 0.20) },
        style: { stroke: "#9B3E45", strokeWidthPt: 1.4, connectorType: "straight", endArrow: "triangle" },
        source: source("funnel-hub-residual-native-input-screenshot-arrow-red")
      },
      {
        id: `${base}-native-arrow-black`,
        type: "line",
        box: { x: round(front.x + front.w * 0.40), y: round(front.y + front.h * 0.52), w: round(front.w * 0.22), h: round(front.h * -0.12) },
        style: { stroke: "#30373C", strokeWidthPt: 1.2, connectorType: "straight", endArrow: "triangle" },
        source: source("funnel-hub-residual-native-input-screenshot-arrow-black")
      },
      {
        id: `${base}-native-bottom-mask`,
        type: "rect",
        box: { x: round(box.x), y: round(box.y + box.h * 0.70), w: round(box.w), h: round(box.h * 0.31) },
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
        source: source("funnel-hub-residual-native-input-screenshot-white-mask")
      }
    ];
  }
  
  function funnelHubNativeInputMockDataShapes(image) {
    const box = image.box || {};
    const base = image.id || "funnel-hub-input-mock-data";
    const source = (detector, extra = {}) => funnelHubNativeSource(image, detector, { confidence: 0.58, ...extra });
    return [
      {
        id: `${base}-native-left-film-strip`,
        type: "rect",
        box: { x: round(box.x), y: round(box.y + box.h * 0.02), w: round(box.w * 0.12), h: round(box.h * 0.37) },
        style: { fill: "#E6ECED", stroke: "#313A40", strokeWidthPt: 1.1 },
        source: source("funnel-hub-residual-native-input-mock-film-strip")
      },
      ...[0, 1].map((index) => ({
        id: `${base}-native-left-film-cell-${index}`,
        type: "rect",
        box: {
          x: round(box.x + box.w * 0.035),
          y: round(box.y + box.h * (0.07 + index * 0.17)),
          w: round(box.w * 0.06),
          h: round(box.h * 0.11)
        },
        style: { fill: "#2F77B6", stroke: "#2F4A5F", strokeWidthPt: 0.6 },
        source: source("funnel-hub-residual-native-input-mock-film-cell", { cellIndex: index })
      })),
      {
        id: `${base}-native-orange-partial-disc`,
        type: "ellipse",
        box: { x: round(box.x + box.w * 0.43), y: round(box.y + box.h * 0.55), w: round(box.w * 0.15), h: round(box.h * 0.42) },
        style: { fill: "#F6A63E", stroke: "#313A40", strokeWidthPt: 1.1 },
        source: source("funnel-hub-residual-native-input-mock-disc")
      },
      {
        id: `${base}-native-white-mask`,
        type: "rect",
        box: { x: round(box.x + box.w * 0.50), y: round(box.y), w: round(box.w * 0.50), h: round(box.h) },
        style: { fill: "#FFFFFF", stroke: "none", strokeWidthPt: 0 },
        source: source("funnel-hub-residual-native-input-mock-white-mask")
      }
    ];
  }

  return {
    createFunnelHubResidualNativeShapes
  };
}

module.exports = {
  createFunnelHubResidualFactory
};
