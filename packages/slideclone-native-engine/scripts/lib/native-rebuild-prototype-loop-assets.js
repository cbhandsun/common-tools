"use strict";

const path = require("path");
const { DEFAULT_SLIDE } = require("@common-tools/slideclone-core/page-text-rule-helpers");
const { lineBox } = require("@common-tools/slideclone-core/workflow-shape-primitives");

function createPrototypeLoopAssetsFactory(dependencies = {}) {
  const {
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    ptToPxBox,
    reclassifyImageSource,
    safeIdentifier,
    writePng
  } = dependencies;
  const required = {
    clampPtBoxToSlide,
    cropPng,
    ensureDir,
    ptToPxBox,
    reclassifyImageSource,
    safeIdentifier,
    writePng
  };
  for (const [name, value] of Object.entries(required)) {
    if (typeof value !== "function") throw new TypeError(`prototype loop assets dependency ${name} must be a function`);
  }

  function createPrototypeGenerationLoopPictorialCrops({ sourceImage, regions = [], slideSize = DEFAULT_SLIDE, assetDir, irDir, deckName, pageIndex, source = {} } = {}) {
    if (!sourceImage || !assetDir || !Array.isArray(regions)) return [];
    ensureDir(assetDir);
    return regions.filter((region) => region?.box?.w >= 8 && region?.box?.h >= 8).map((region, index) => {
      const box = clampPtBoxToSlide(region.box, slideSize);
      const base = safeIdentifier(`${deckName || "deck"}-p${String(Number(pageIndex || 0) + 1).padStart(2, "0")}-prototype-loop-${region.key || index}`, "prototype-loop-atom");
      const file = path.join(assetDir, `${base}.png`);
      writePng(file, cropPng(sourceImage, ptToPxBox(box, sourceImage, slideSize, 0)));
      return {
        id: `prototype-generation-loop-pictorial-${region.key || index}-${pageIndex || 0}`,
        type: "fidelity-crop",
        assetPath: path.relative(irDir || assetDir, file).replace(/\\/g, "/"),
        box,
        source: reclassifyImageSource(source, box, {
          detector: "prototype-generation-loop-pictorial-atom-crop",
          layerType: "illustration-zone",
          expressionForm: "icon-or-illustration",
          expressionSubtype: region.key || "prototype-loop-pictorial-atom",
          recommendedAction: "keep-local-crop",
          intentionalMinimumUnitCrop: true,
          protectedMinimumUnit: true,
          skipVisualAtomRebuild: true,
          ...(region.component || {}),
          nonEditableReason: "pictorial icon preserved as the smallest faithful visual unit inside an editable prototype-generation loop"
        })
      };
    });
  }
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  
  function aiSkillsInputFragmentShapes(base, image, box, src, shape, _line) {
    const sx = (n) => Number(box.x || 0) + Number(box.w || 0) * n;
    const sy = (n) => Number(box.y || 0) + Number(box.h || 0) * n;
    const sw = (n) => Number(box.w || 0) * n;
    const sh = (n) => Number(box.h || 0) * n;
    const gray = "#9CA3AF";
    const light = "#D1D5DB";
    const region = { x: sx(-0.355), y: sy(0.250), w: sw(0.295), h: sh(0.420) };
    const inputLine = (suffix, from, to, color = gray, width = 1.3) => shape(suffix, "ai-skills-cycle-native-input-fragment", "line", lineBox(from, to), {
      stroke: color,
      strokeWidthPt: width,
      connectorType: "straight",
      lineCap: "round"
    });
    return [
      shape("input-doc", "ai-skills-cycle-native-input-fragment", "roundRect", { x: region.x + region.w * 0.12, y: region.y + region.h * 0.08, w: region.w * 0.28, h: region.h * 0.34 }, { fill: light, stroke: light, strokeWidthPt: 0.8, radiusRatio: 0.04 }),
      inputLine("input-doc-line-1", { x: region.x + region.w * 0.17, y: region.y + region.h * 0.17 }, { x: region.x + region.w * 0.34, y: region.y + region.h * 0.17 }, gray, 1.3),
      inputLine("input-doc-line-2", { x: region.x + region.w * 0.17, y: region.y + region.h * 0.25 }, { x: region.x + region.w * 0.34, y: region.y + region.h * 0.25 }, gray, 1.3),
      inputLine("input-doc-line-3", { x: region.x + region.w * 0.17, y: region.y + region.h * 0.33 }, { x: region.x + region.w * 0.30, y: region.y + region.h * 0.33 }, gray, 1.3),
      shape("input-chat-main", "ai-skills-cycle-native-input-fragment", "roundRect", { x: region.x + region.w * 0.40, y: region.y + region.h * 0.43, w: region.w * 0.34, h: region.h * 0.30 }, { fill: "#6B7280", stroke: "#6B7280", strokeWidthPt: 0.8, radiusRatio: 0.08 }),
      inputLine("input-chat-line-1", { x: region.x + region.w * 0.47, y: region.y + region.h * 0.535 }, { x: region.x + region.w * 0.67, y: region.y + region.h * 0.535 }, "#FFFFFF", 1.7),
      inputLine("input-chat-line-2", { x: region.x + region.w * 0.47, y: region.y + region.h * 0.615 }, { x: region.x + region.w * 0.64, y: region.y + region.h * 0.615 }, "#FFFFFF", 1.7),
      shape("input-chat-small", "ai-skills-cycle-native-input-fragment", "roundRect", { x: region.x + region.w * 0.67, y: region.y + region.h * 0.08, w: region.w * 0.22, h: region.h * 0.18 }, { fill: "#6B7280", stroke: "#6B7280", strokeWidthPt: 0.8, radiusRatio: 0.08 }),
      ...[0.72, 0.79, 0.86].map((x, index) => shape(`input-dot-${index}`, "ai-skills-cycle-native-input-fragment", "ellipse", { x: region.x + region.w * x, y: region.y + region.h * 0.155, w: region.w * 0.025, h: region.w * 0.025 }, { fill: "#FFFFFF", stroke: "#FFFFFF", strokeWidthPt: 0.3 })),
      shape("input-audio", "ai-skills-cycle-native-input-fragment", "ellipse", { x: region.x + region.w * 0.48, y: region.y + region.h * 0.24, w: region.w * 0.20, h: region.w * 0.20 }, { fill: "none", stroke: gray, strokeWidthPt: 2.0 }),
      ...[-0.06, 0.00, 0.06, 0.12].map((dx, index) => inputLine(`input-audio-wave-${index}`, { x: region.x + region.w * (0.54 + dx), y: region.y + region.h * 0.34 }, { x: region.x + region.w * (0.54 + dx), y: region.y + region.h * (0.48 - Math.abs(dx) * 0.8) }, gray, 1.5)),
      shape("input-image", "ai-skills-cycle-native-input-fragment", "rect", { x: region.x + region.w * 0.20, y: region.y + region.h * 0.68, w: region.w * 0.25, h: region.h * 0.22 }, { fill: "#FFFFFF", stroke: gray, strokeWidthPt: 1.6 }),
      shape("input-image-mountain", "ai-skills-cycle-native-input-fragment", "freeform", { x: region.x + region.w * 0.23, y: region.y + region.h * 0.785, w: region.w * 0.19, h: region.h * 0.09 }, { fill: gray, stroke: gray, strokeWidthPt: 0.5, points: [[0, 1], [0.34, 0.30], [0.55, 0.70], [0.78, 0.20], [1, 1]] }),
      shape("input-circle", "ai-skills-cycle-native-input-fragment", "ellipse", { x: region.x + region.w * 0.73, y: region.y + region.h * 0.35, w: region.w * 0.22, h: region.w * 0.22 }, { fill: light, stroke: light, strokeWidthPt: 0.8 }),
      shape("input-triangle", "ai-skills-cycle-native-input-fragment", "triangle", { x: region.x + region.w * 0.26, y: region.y + region.h * 0.43, w: region.w * 0.18, h: region.h * 0.19 }, { fill: gray, stroke: gray, strokeWidthPt: 0.8, rotation: -18 })
    ];
  }
  
  function aiSkillsOutputStackShapes(base, image, box, src, shape, line) {
    const sx = (n) => Number(box.x || 0) + Number(box.w || 0) * n;
    const sy = (n) => Number(box.y || 0) + Number(box.h || 0) * n;
    const sw = (n) => Number(box.w || 0) * n;
    const sh = (n) => Number(box.h || 0) * n;
    const region = { x: sx(1.445), y: sy(0.170), w: sw(0.285), h: sh(0.455) };
    const blue = "#2C74D8";
    const pale = "#EAF4FD";
    const shapes = [];
    for (const [index, offset] of [0.16, 0.11, 0.06].entries()) {
      shapes.push(shape(`output-stack-${index}`, "ai-skills-cycle-native-output-stack", "roundRect", {
        x: region.x + region.w * offset,
        y: region.y + region.h * (0.02 + index * 0.055),
        w: region.w * 0.78,
        h: region.h * 0.72
      }, { fill: pale, stroke: "#86A9C8", strokeWidthPt: 1.0, radiusRatio: 0.035 }));
    }
    const front = { x: region.x, y: region.y + region.h * 0.18, w: region.w * 0.78, h: region.h * 0.72 };
    shapes.push(shape("output-front", "ai-skills-cycle-native-output-stack", "roundRect", front, { fill: "#FFFFFF", stroke: "#7399B8", strokeWidthPt: 1.2, radiusRatio: 0.035 }));
    shapes.push(shape("output-flow-top", "ai-skills-cycle-native-output-stack", "rect", { x: front.x + front.w * 0.41, y: front.y + front.h * 0.12, w: front.w * 0.18, h: front.h * 0.10 }, { fill: pale, stroke: "#7399B8", strokeWidthPt: 0.8 }));
    shapes.push(shape("output-flow-center", "ai-skills-cycle-native-output-stack", "diamond", { x: front.x + front.w * 0.40, y: front.y + front.h * 0.31, w: front.w * 0.20, h: front.h * 0.15 }, { fill: blue, stroke: blue, strokeWidthPt: 0.8 }));
    for (const [index, x] of [0.16, 0.42, 0.67].entries()) {
      shapes.push(shape(`output-flow-node-${index}`, "ai-skills-cycle-native-output-stack", "roundRect", { x: front.x + front.w * x, y: front.y + front.h * 0.52, w: front.w * 0.19, h: front.h * 0.12 }, { fill: pale, stroke: "#7399B8", strokeWidthPt: 0.8, radiusRatio: 0.04 }));
    }
    shapes.push(
      line("output-flow-v", { x: front.x + front.w * 0.50, y: front.y + front.h * 0.22 }, { x: front.x + front.w * 0.50, y: front.y + front.h * 0.31 }, "#7399B8", 1.0),
      line("output-flow-h", { x: front.x + front.w * 0.25, y: front.y + front.h * 0.48 }, { x: front.x + front.w * 0.76, y: front.y + front.h * 0.48 }, "#7399B8", 1.0),
      line("output-flow-a", { x: front.x + front.w * 0.50, y: front.y + front.h * 0.46 }, { x: front.x + front.w * 0.25, y: front.y + front.h * 0.52 }, "#7399B8", 1.0),
      line("output-flow-b", { x: front.x + front.w * 0.50, y: front.y + front.h * 0.46 }, { x: front.x + front.w * 0.50, y: front.y + front.h * 0.52 }, "#7399B8", 1.0),
      line("output-flow-c", { x: front.x + front.w * 0.50, y: front.y + front.h * 0.46 }, { x: front.x + front.w * 0.76, y: front.y + front.h * 0.52 }, "#7399B8", 1.0)
    );
    shapes.push(shape("output-ui-card-a", "ai-skills-cycle-native-output-stack", "roundRect", { x: front.x + front.w * 0.12, y: front.y + front.h * 0.73, w: front.w * 0.26, h: front.h * 0.21 }, { fill: pale, stroke: "#7399B8", strokeWidthPt: 0.8, radiusRatio: 0.04 }));
    shapes.push(shape("output-ui-card-b", "ai-skills-cycle-native-output-stack", "roundRect", { x: front.x + front.w * 0.44, y: front.y + front.h * 0.73, w: front.w * 0.42, h: front.h * 0.21 }, { fill: pale, stroke: "#7399B8", strokeWidthPt: 0.8, radiusRatio: 0.04 }));
    return shapes;
  }

  return {
    aiSkillsInputFragmentShapes,
    aiSkillsOutputStackShapes,
    createPrototypeGenerationLoopPictorialCrops
  };
}

module.exports = {
  createPrototypeLoopAssetsFactory
};
