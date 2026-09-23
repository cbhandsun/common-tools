"use strict";

const FAMILY_MOTIFS = Object.freeze({
  "cycle-loop": ["arc-arrow"],
  "fishbone-cause": ["fishbone-cause"],
  "funnel-flow": ["funnel-stack"],
  "hierarchy-tree": ["tree-link"],
  "layered-architecture": ["layered-stack"],
  "matrix-table": ["comparison-matrix"],
  "overlap-diagram": ["venn-overlap"],
  "process-flow": ["linear-arrow-chain"],
  "pyramid-stack": ["pyramid-stack"],
  "relationship-network": ["topology-network"],
  "specialty-chart": ["donut-segment-chart"],
  "timeline-roadmap": ["milestone-roadmap"]
});

module.exports = async function visionComponentRecallFixture(input, context = {}) {
  const components = sourceComponents(context.config?.componentRecallFixture?.sourceComponents);
  const slideWidth = input.slideSize?.widthPt || 960;
  const slideHeight = input.slideSize?.heightPt || 540;
  const boxes = componentBoxes(components.length, slideWidth, slideHeight);
  return {
    ok: true,
    provider: "vision-component-recall-fixture",
    data: {
      background: { fill: "#FFFFFF" },
      textBoxes: [],
      shapes: [],
      images: components.map((component, index) => componentImage(input, component, boxes[index], index)),
      tables: [],
      charts: [],
      icons: []
    }
  };
};

function sourceComponents(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const family = String(entry?.family || "").trim();
      return family ? { family } : null;
    })
    .filter(Boolean);
}

function componentImage(input, component, box, index) {
  const family = component.family;
  const motifs = FAMILY_MOTIFS[family] || [family];
  return {
    id: `p${input.pageIndex}-component-fixture-${index + 1}`,
    type: "component-recall-fixture",
    box,
    assetPath: input.sourceImage,
    style: { opacity: 1, assetPath: input.sourceImage },
    source: {
      pageImage: input.sourceImage,
      visionProvider: "vision-component-recall-fixture",
      confidence: 1,
      evidenceBox: box,
      editable: false,
      nonEditableReason: "Component recall fixture source layer retained for local component analysis and native replay.",
      layer: {
        layerType: "diagram-zone",
        detector: "image-to-editable-recall-fixture",
        areaRatio: round((box.w * box.h) / (960 * 540)),
        diagramUnderstanding: {
          provider: "diagram-understanding-v1",
          archetype: family,
          confidence: 0.92,
          nativeReadiness: "native-rebuild",
          componentStrategy: {
            provider: "component-strategy-v1",
            mode: "component-template",
            templateFamily: family,
            targetMotifs: motifs,
            sourcePreference: ["local-component-assets"],
            reason: "image-to-editable recall fixture component family"
          },
          targetMotifs: motifs
        }
      }
    }
  };
}

function componentBoxes(count, slideWidth, slideHeight) {
  if (count <= 1) return [{ x: 96, y: 86, w: slideWidth - 192, h: slideHeight - 172 }];
  const width = Math.round((slideWidth - 240) / 2);
  return Array.from({ length: count }, (_, index) => ({
    x: 80 + index * (width + 80),
    y: 90,
    w: width,
    h: slideHeight - 180
  }));
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

module.exports.maxConcurrency = 4;
