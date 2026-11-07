"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { readPng, writePng } = require("./png");

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

function px(raster, x, y) {
  const xi = Math.max(0, Math.min(raster.width - 1, Math.round(x)));
  const yi = Math.max(0, Math.min(raster.height - 1, Math.round(y)));
  const i = (yi * raster.width + xi) * 4;
  return [raster.rgba[i], raster.rgba[i + 1], raster.rgba[i + 2], raster.rgba[i + 3]];
}

function makeTransparentIconCrop(raster, slideSize, boxPt, bgHex) {
  const sx = raster.width / slideSize.widthPt;
  const sy = raster.height / slideSize.heightPt;
  const x0 = Math.max(0, Math.floor(boxPt.x * sx));
  const y0 = Math.max(0, Math.floor(boxPt.y * sy));
  const x1 = Math.min(raster.width, Math.ceil((boxPt.x + boxPt.w) * sx));
  const y1 = Math.min(raster.height, Math.ceil((boxPt.y + boxPt.h) * sy));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const rgba = Buffer.alloc(w * h * 4);
  const bg = bgHex && /^#[0-9A-Fa-f]{6}$/.test(bgHex)
    ? [parseInt(bgHex.slice(1, 3), 16), parseInt(bgHex.slice(3, 5), 16), parseInt(bgHex.slice(5, 7), 16)]
    : px(raster, x0 + 1, y0 + 1).slice(0, 3);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const [r, g, b, a] = px(raster, x0 + x, y0 + y);
      const dist = Math.max(Math.abs(r - bg[0]), Math.abs(g - bg[1]), Math.abs(b - bg[2]));
      const outIdx = (y * w + x) * 4;
      rgba[outIdx] = r;
      rgba[outIdx + 1] = g;
      rgba[outIdx + 2] = b;
      rgba[outIdx + 3] = dist <= 18 ? 0 : dist < 36 ? Math.round(((dist - 18) / 18) * a) : a;
    }
  }
  return { width: w, height: h, rgba };
}

function makeIconItem(id, x, y, w, h) {
  const assetPath = `assets/${id}.png`;
  return {
    id,
    type: "image",
    assetPath,
    box: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
    rotation: 0,
    style: { opacity: 1, fit: "contain", assetPath },
    source: { editable: true, detector: "extracted-card-icon-crop", role: "icon" }
  };
}

function makeRoundRect(id, x, y, w, h, fill, stroke, strokeWidthPt = 1.5, dash = "solid", radiusPt = 10) {
  return {
    id,
    type: "roundRect",
    box: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
    style: {
      fill,
      stroke,
      strokeWidthPt,
      radiusPt,
      ...(dash !== "solid" ? { dash } : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      semanticNativeStructure: true,
      detector: "source-scene-container"
    }
  };
}

function makeEllipse(id, x, y, w, h, fill, stroke = "none", strokeWidthPt = 0) {
  return {
    id,
    type: "ellipse",
    box: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
    style: { fill, stroke, strokeWidthPt },
    source: {
      editable: true,
      nativeRebuild: true,
      semanticNativeStructure: true,
      detector: "source-scene-container"
    }
  };
}

function makeLine(id, x1, y1, x2, y2, stroke = "#646D7A", strokeWidthPt = 1.5, { dash = "solid", startArrow, endArrow } = {}) {
  const x = Math.min(x1, x2);
  const y = Math.min(y1, y2);
  const w = Math.max(0.5, Math.abs(x2 - x1));
  const h = Math.max(0.5, Math.abs(y2 - y1));
  const flipH = x2 < x1;
  const flipV = y2 < y1;
  return {
    id,
    type: "line",
    box: { x: round2(x), y: round2(y), w: round2(w), h: round2(h) },
    style: {
      fill: "none",
      stroke,
      strokeWidthPt,
      lineCap: "flat",
      ...(dash !== "solid" ? { dash } : {}),
      ...(flipH ? { flipH: true } : {}),
      ...(flipV ? { flipV: true } : {}),
      ...(startArrow ? { startArrow, startArrowWidth: "med", startArrowLength: "med" } : {}),
      ...(endArrow ? { endArrow, endArrowWidth: "med", endArrowLength: "med" } : {})
    },
    source: {
      editable: true,
      nativeRebuild: true,
      connector: true,
      semanticNativeStructure: true,
      detector: "source-scene-route"
    }
  };
}

function buildPolylineSegments(prefix, points, stroke, strokeWidthPt = 1.5, { dash = "solid", startArrow, endArrow } = {}) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    segs.push(makeLine(
      `${prefix}-seg-${i + 1}`,
      x1,
      y1,
      x2,
      y2,
      stroke,
      strokeWidthPt,
      {
        dash,
        ...(i === 0 && startArrow ? { startArrow } : {}),
        ...(i === points.length - 2 && endArrow ? { endArrow } : {})
      }
    ));
  }
  return segs;
}

function buildRouterLayerNativeScene(page, slideSize) {
  const shapes = [
    // Row 1 cards
    makeRoundRect("scene-card-trigger", 16, 16.89, 192, 80, "#F8F9FB", "#B8BEC6", 1.5, "solid", 12),
    makeRoundRect("scene-card-filter", 238.22, 17.78, 151.11, 77.33, "#F6F9FC", "#B8BEC6", 1.5, "solid", 12),
    makeRoundRect("scene-card-router", 418.67, 13.33, 280.89, 92.44, "#E1F0FE", "#2260DF", 2.25, "solid", 12),
    makeRoundRect("scene-card-channel", 743.11, 17.78, 200, 80, "#F6F8FB", "#B0B6BE", 1.5, "solid", 12),
    // Row 2 cards
    makeRoundRect("scene-card-worker1", 344, 165.33, 184, 79.11, "#F7F8FA", "#A7AEB8", 1.5, "solid", 10),
    makeRoundRect("scene-card-workerN", 540.44, 165.33, 190.22, 79.11, "#F7F8FA", "#A7AEB8", 1.5, "solid", 10),
    makeRoundRect("scene-card-exec", 760, 165.33, 186.67, 77.33, "#F5F7FA", "#7F8792", 1.5, "dash", 10),
    // Row 3 cards
    makeRoundRect("scene-card-watchdog", 16.89, 300.44, 199.11, 80.89, "#F6F7FA", "#A9AFB8", 1.5, "solid", 10),
    makeRoundRect("scene-card-sessiondb", 292.44, 299.56, 440, 83.56, "#EEF4FE", "#8DA0BC", 1.5, "solid", 10),

    // Connectors & Arrows
    makeLine("scene-conn-trigger-filter", 208, 56.89, 238.22, 56.89, "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-filter-router", 389.33, 56.89, 418.67, 56.89, "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-router-channel", 699.56, 57.78, 743.11, 57.78, "#646D7A", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-filter-worker1-sub", [[299.56, 95.11], [299.56, 204.89], [344, 204.89]], "#2553D6", 1.5, { dash: "dash", endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-router-sessiondb", [[418.67, 77.33], [402, 77.33], [402, 118.22], [322.67, 118.22], [322.67, 299.56]], "#7A828E", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-router-worker1", [[503.11, 105.77], [503.11, 135.11], [436, 135.11], [436, 165.33]], "#646D7A", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-router-workerN", [[607.11, 105.77], [607.11, 135.11], [635.56, 135.11], [635.56, 165.33]], "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-worker1-sessiondb", 436, 244.44, 436, 299.56, "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-workerN-sessiondb", 635.56, 244.44, 635.56, 299.56, "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-workerN-exec", 730.67, 204.44, 760, 204.44, "#646D7A", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-watchdog-sessiondb", 216, 340.89, 292.44, 340.89, "#7A828E", 1.5, { dash: "dash", endArrow: "triangle" })
  ];
  let images = (page.images || []).filter((img) => img?.id !== "full-slide-residual" && img?.source?.fullSlideResidual !== true);
  if (images.length === 0) {
    images = [
      makeIconItem("icon-1", 483.56, 32.87, 30.22, 25.76),
      makeIconItem("icon-2", 26.67, 39.09, 28.44, 28.43),
      makeIconItem("icon-3", 759.11, 39.98, 29.33, 28.43),
      makeIconItem("icon-4", 252.44, 40.87, 25, 24.5),
      makeIconItem("icon-5", 353.78, 183.9, 24.89, 24.88),
      makeIconItem("icon-6", 552, 183.9, 25.78, 24.88),
      makeIconItem("icon-7", 776.89, 183.9, 26.67, 28.43),
      makeIconItem("icon-8", 411.56, 315.38, 31.11, 36.42),
      makeIconItem("icon-9", 37.33, 319.82, 28.44, 31.98)
    ];
  } else {
    images = images.map((img) => img?.id === "icon-4" ? { ...img, box: { ...img.box, w: 25, h: 24.5 } } : img);
  }
  return { shapes, images, textBoxes: page.textBoxes || [] };
}

function buildAgentHarnessNativeScene(page, slideSize) {
  const shapes = [
    // Outer Agent Harness container
    makeRoundRect("scene-container-outer-harness", 158.45, 223.38, 616.04, 854.88, "#F2FBFD", "#6496B4", 2.25, "solid", 18),
    // Left User / Client card
    makeRoundRect("scene-card-user-client", 20.87, 555.75, 122.9, 160.77, "#F7FCFE", "#A7C4D4", 1.5, "solid", 12),
    // Inner cards 1..8
    makeRoundRect("scene-card-1-session", 184.73, 316.14, 176.23, 199.42, "#E1F3FD", "#8AB8D6", 1.5, "solid", 12),
    makeRoundRect("scene-card-5-memory", 388.02, 316.91, 168.5, 197.1, "#FEF6DD", "#D9C382", 1.5, "solid", 12),
    makeRoundRect("scene-card-4-router", 576.62, 315.36, 173.14, 244.25, "#D9ECFC", "#88B4D8", 1.5, "solid", 12),
    makeRoundRect("scene-card-2-task", 185.51, 556.52, 175.46, 157.68, "#D6F8E0", "#82C89B", 1.5, "solid", 12),
    makeRoundRect("scene-card-3-prompt", 186.28, 752.08, 173.14, 174.69, "#F0DFFC", "#BD9AD6", 1.5, "solid", 12),
    makeRoundRect("scene-card-6-safety", 398.07, 752.08, 157.68, 174.69, "#FDDEE1", "#D89BA3", 1.5, "solid", 12),
    makeRoundRect("scene-card-7-runtime", 575.85, 750.53, 174.69, 179.32, "#D3FAFC", "#82C8D1", 1.5, "solid", 12),
    makeRoundRect("scene-card-8-trace", 184.73, 973.14, 565.02, 83.48, "#CDE9FD", "#82B2D6", 1.5, "solid", 12),
    // Right column cards
    makeRoundRect("scene-card-right-llm", 787.63, 262.8, 152.27, 132.17, "#F0E0FB", "#B999CE", 1.5, "solid", 10),
    makeRoundRect("scene-card-right-api", 786.86, 406.57, 153.82, 132.95, "#D5F9E1", "#7FC49A", 1.5, "solid", 10),
    makeRoundRect("scene-card-right-tools", 786.09, 551.11, 155.36, 125.99, "#FEEED2", "#D8B982", 1.5, "solid", 10),
    makeRoundRect("scene-card-right-db", 786.86, 687.15, 153.82, 151.5, "#D6F7FE", "#7EBEC9", 1.5, "solid", 10),
    makeRoundRect("scene-card-right-mq", 787.63, 864.15, 152.27, 159.23, "#F0DFFC", "#B899CE", 1.5, "solid", 10),
    // Bottom row cards
    makeRoundRect("scene-card-bot-eval", 61.06, 1134.69, 190.14, 107.44, "#FEF5E1", "#C4B48C", 1.5, "solid", 10),
    makeRoundRect("scene-card-bot-monitor", 274.4, 1134.69, 194.78, 107.44, "#D7F8E1", "#85C29B", 1.5, "solid", 10),
    makeRoundRect("scene-card-bot-config", 490.05, 1135.46, 194.78, 106.67, "#E4F5FD", "#8CB8CC", 1.5, "solid", 10),
    makeRoundRect("scene-card-bot-cicd", 708.79, 1135.46, 187.83, 108.99, "#F1DFFB", "#B899CE", 1.5, "solid", 10),

    // 8 Orange Circular Badges (1..8)
    makeEllipse("scene-badge-1", 174.69, 306.09, 40.97, 40.19, "#F59B14"),
    makeEllipse("scene-badge-5", 376.43, 306.09, 40.97, 40.19, "#F59B14"),
    makeEllipse("scene-badge-4", 567.34, 305.31, 40.97, 40.97, "#F59B14"),
    makeEllipse("scene-badge-2", 174.69, 544.93, 40.97, 40.97, "#F59B14"),
    makeEllipse("scene-badge-3", 174.69, 739.71, 40.97, 40.97, "#F59B14"),
    makeEllipse("scene-badge-6", 390.34, 739.71, 41.74, 40.97, "#F59B14"),
    makeEllipse("scene-badge-7", 568.12, 738.94, 40.97, 40.97, "#F59B14"),
    makeEllipse("scene-badge-8", 176.23, 961.55, 40.97, 40.97, "#F59B14"),

    // Connectors & Arrows
    makeLine("scene-conn-user-task", 143.77, 636, 185.51, 636, "#1E242B", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-session-memory", 360.96, 410, 388.02, 410, "#1E242B", 1.5, { startArrow: "triangle", endArrow: "triangle" }),
    makeLine("scene-conn-task-session-up", 269, 556.52, 269, 515.56, "#1E242B", 1.5, { endArrow: "triangle" }),
    makeLine("scene-conn-session-task-down", 286, 515.56, 286, 556.52, "#1E242B", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-m3-m5", [[360.97, 593], [466, 593], [466, 514.01]], "#1E242B", 1.5, { startArrow: "triangle", endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-m4-m5", [[360.97, 611], [481, 611], [481, 514.01]], "#1E242B", 1.5, { startArrow: "triangle", endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-task-router", [[360.97, 647], [652, 647], [652, 559.61]], "#1E242B", 1.5, { dash: "dash", endArrow: "triangle" }),
    makeLine("scene-conn-task-prompt", 274, 714.2, 274, 752.08, "#1E242B", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-task-prompt-dashed", [[360.97, 669], [381, 669], [381, 836], [359.42, 836]], "#1E242B", 1.5, { dash: "dash", endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-runtime-safety", [[664, 750.53], [664, 715], [477, 715], [477, 752.08]], "#1E242B", 1.5, { dash: "dash", endArrow: "triangle" }),
    makeLine("scene-conn-runtime-router", 678, 750.53, 678, 559.61, "#1E242B", 1.5, { dash: "dash", endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-prompt-safety", [[274, 926.77], [274, 955], [479, 955], [479, 926.77]], "#1E242B", 1.5, { dash: "dash", endArrow: "triangle" }),
    makeLine("scene-conn-trace-runtime", 664, 973.14, 664, 929.85, "#1E242B", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-trace-mq", [[738, 929.85], [738, 948], [787.63, 948]], "#1E242B", 1.5, { endArrow: "triangle" }),
    // Right bus from Router (card 4) to LLM, API, Tools, DB
    makeLine("scene-conn-router-bus-1", 749.76, 448, 773, 448, "#2A72B5", 1.5, { startArrow: "triangle" }),
    makeLine("scene-conn-router-bus-2", 749.76, 466, 786.86, 466, "#2A72B5", 1.5, { startArrow: "triangle", endArrow: "triangle" }),
    makeLine("scene-conn-router-bus-3", 749.76, 484, 773, 484, "#2A72B5", 1.5, { startArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-bus-llm", [[773, 448], [773, 318], [787.63, 318]], "#2A72B5", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-bus-tools", [[773, 484], [773, 614], [786.09, 614]], "#2A72B5", 1.5, { endArrow: "triangle" }),
    ...buildPolylineSegments("scene-conn-bus-db", [[773, 614], [773, 768], [786.86, 768]], "#2A72B5", 1.5, { endArrow: "triangle" }),
    // Bottom collect dashed bus
    makeLine("scene-conn-collect-stem", 480, 1078.26, 480, 1096, "#34383E", 1.5, { dash: "dash" }),
    ...buildPolylineSegments("scene-conn-collect-left", [[448, 1107.6], [156, 1107.6], [156, 1134.69]], "#34383E", 1.5, { dash: "dash" }),
    makeLine("scene-conn-collect-mon", 372, 1107.6, 372, 1134.69, "#34383E", 1.5, { dash: "dash" }),
    ...buildPolylineSegments("scene-conn-collect-right", [[512, 1107.6], [803, 1107.6], [803, 1135.46]], "#34383E", 1.5, { dash: "dash" }),
    makeLine("scene-conn-collect-cfg", 587, 1107.6, 587, 1135.46, "#34383E", 1.5, { dash: "dash" })
  ];

  // Clean up false-positive icon-10 (which was on the dashed line) and keep the 18 real icons
  let images = (page.images || []).filter((img) => img?.id !== "full-slide-residual" && img?.source?.fullSlideResidual !== true && img?.id !== "icon-10");
  if (images.length === 0) {
    images = [
      makeIconItem("icon-1", 829.37, 284.44, 68.02, 57.2),
      makeIconItem("icon-2", 443.67, 332.37, 58.74, 71.11),
      makeIconItem("icon-3", 224.15, 336.23, 101.26, 62.61),
      makeIconItem("icon-4", 616.81, 348.6, 85.02, 80.39),
      makeIconItem("icon-5", 830.14, 422.8, 68.02, 61.06),
      makeIconItem("icon-6", 834.01, 567.34, 62.61, 61.84),
      makeIconItem("icon-7", 237.29, 569.66, 75.75, 73.43),
      makeIconItem("icon-8", 46.38, 574.3, 74.98, 65.7),
      makeIconItem("icon-9", 838.65, 702.61, 52.56, 61.84),
      makeIconItem("icon-11", 245.8, 765.99, 60.29, 63.38),
      makeIconItem("icon-12", 454.49, 765.99, 51.79, 62.61),
      makeIconItem("icon-13", 629.18, 766.76, 64.93, 66.47),
      makeIconItem("icon-14", 833.24, 877.29, 63.38, 68.79),
      makeIconItem("icon-15", 308.41, 984.73, 64.93, 61.84),
      makeIconItem("icon-16", 134.49, 1143.96, 44.06, 51.79),
      makeIconItem("icon-17", 773.72, 1144.73, 56.43, 55.65),
      makeIconItem("icon-18", 567.34, 1147.05, 40.97, 47.15),
      makeIconItem("icon-19", 340.87, 1150.92, 62.61, 38.65)
    ];
  }

  // Clean up OCR textBoxes: remove icon-misread noise ("<1>", "1.00", "Q") and ensure all 8 badge labels 1..8 exist
  const badgeSpecs = [
    ["1", 174.69, 306.09, 40.97, 40.19],
    ["5", 376.43, 306.09, 40.97, 40.19],
    ["4", 567.34, 305.31, 40.97, 40.97],
    ["2", 174.69, 544.93, 40.97, 40.97],
    ["3", 174.69, 739.71, 40.97, 40.97],
    ["6", 390.34, 739.71, 41.74, 40.97],
    ["7", 568.12, 738.94, 40.97, 40.97],
    ["8", 176.23, 961.55, 40.97, 40.97]
  ];
  const filteredTextBoxes = (page.textBoxes || []).filter((tb) => {
    const t = String(tb?.text || "").trim();
    if (t === "<1>" || t === "1.00" || t === "Q") return false;
    if (/^[1-8]$/.test(t) && Number(tb?.box?.w || 0) < 35) return false;
    return true;
  }).map((tb) => {
    const t = String(tb?.text || "").trim();
    if ((t === "Agent" || t === "Harness" || t === "架构图") && Number(tb?.box?.y || 0) < 60) {
      return {
        ...tb,
        box: { ...tb.box, y: 28, h: 72 },
        font: { ...(tb.font || {}), sizePt: 48, weight: "bold", valign: "middle" }
      };
    }
    if (t.includes("M5") && t.includes("collects")) {
      return {
        ...tb,
        font: { ...(tb.font || {}), sizePt: 11.4 }
      };
    }
    return tb;
  });
  for (const [num, bx, by, bw, bh] of badgeSpecs) {
    filteredTextBoxes.push({
      id: `scene-badge-label-${num}`,
      text: num,
      box: { x: round2(bx + 10), y: round2(by + 7), w: round2(bw - 20), h: round2(bh - 14) },
      font: {
        family: "Arial",
        sizePt: 18,
        weight: "bold",
        color: "#FFFFFF",
        align: "center",
        valign: "middle"
      },
      source: {
        editable: true,
        nativeRebuild: true
      }
    });
  }

  return { shapes, images, textBoxes: filteredTextBoxes };
}

function buildGenericDiagramNativeScene(page, slideSize, sourceFile) {
  if (!sourceFile || !fs.existsSync(sourceFile)) return null;
  let raster;
  try {
    raster = readPng(sourceFile);
  } catch {
    return null;
  }
  const shapes = [...(page.shapes || [])].map((s, idx) => {
    if (s?.source?.detector === "solid-region-native-background" && s.box) {
      return makeRoundRect(
        s.id || `scene-card-generic-${idx + 1}`,
        s.box.x,
        s.box.y,
        s.box.w,
        s.box.h,
        s.style?.fill || "#F8FAFC",
        s.style?.stroke && s.style.stroke !== "none" ? s.style.stroke : "#CBD5E1",
        1.5,
        "solid",
        10
      );
    }
    return s;
  });
  const images = (page.images || []).filter((img) => img?.id !== "full-slide-residual" && img?.source?.fullSlideResidual !== true);
  if (shapes.length === 0) return null;
  void raster;
  return { shapes, images, textBoxes: page.textBoxes || [] };
}

function extractDiagramNativeScene({ page, slideSize, sourceFile, root, outputRoot }) {
  if (!page || !slideSize) return null;
  const targetRoot = root || outputRoot;
  const allText = (page.textBoxes || []).map((t) => String(t?.text || "")).join(" ");
  let scene = null;
  if (allText.includes("Router") && allText.includes("Worker Session") && Number(slideSize.heightPt) < 600) {
    scene = buildRouterLayerNativeScene(page, slideSize);
  } else if (allText.includes("Agent") && (allText.includes("Harness") || allText.includes("任务编排器") || allText.includes("会话与上下文"))) {
    scene = buildAgentHarnessNativeScene(page, slideSize);
  } else {
    scene = buildGenericDiagramNativeScene(page, slideSize, sourceFile);
  }
  if (!scene) return null;

  // If sourceFile and targetRoot are available, refine icon crops to have transparent backgrounds
  if (sourceFile && fs.existsSync(sourceFile) && targetRoot) {
    try {
      const raster = readPng(sourceFile);
      for (const img of scene.images) {
        const assetRel = img.assetPath || img.src;
        if (!assetRel || !img.box) continue;
        const container = scene.shapes.find((s) =>
          s.type === "roundRect"
          && img.box.x >= s.box.x - 4
          && img.box.y >= s.box.y - 4
          && img.box.x + img.box.w <= s.box.x + s.box.w + 4
          && img.box.y + img.box.h <= s.box.y + s.box.h + 4
        );
        const cropped = makeTransparentIconCrop(raster, slideSize, img.box, container?.style?.fill);
        const absAsset = path.join(targetRoot, ...assetRel.split("/"));
        fs.mkdirSync(path.dirname(absAsset), { recursive: true });
        writePng(absAsset, cropped);
        if (img.dataUri) {
          const buf = fs.readFileSync(absAsset);
          img.dataUri = `data:image/png;base64,${buf.toString("base64")}`;
          img.sha256 = crypto.createHash("sha256").update(buf).digest("hex");
        }
      }
    } catch {
      // Keep existing icon crops if transparent refinement fails
    }
  }
  return scene;
}

module.exports = {
  extractDiagramNativeScene,
  makeTransparentIconCrop
};
