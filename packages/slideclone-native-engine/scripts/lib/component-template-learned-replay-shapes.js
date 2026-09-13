"use strict";

const { clampBox, scaleRelativeBox } = require("./component-template-geometry");
const { paletteFromMatch } = require("./component-template-palette");
const { safeText } = require("./component-template-sanitizers");

function learnedComponentReplayShapes(image = {}, match = {}, family = "component", slideSize, services = {}) {
  const box = services.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#F97316", "#22C55E", "#0EA5E9"],
    neutral: "#94A3B8",
    softFills: ["#DBEAFE", "#FFEDD5", "#DCFCE7", "#E0F2FE"]
  });
  const children = selectLearnedReplayChildren(match, box, family, slideSize, services);
  const minChildren = family === "venn-overlap" ? 2 : 3;
  if (children.length < minChildren) return [];
  return children.map((child, index) => {
    const type = learnedReplayNativeType(child, family, services);
    const part = learnedReplayPartForFamily(family, child, type);
    return services.nativeShape(
      image,
      match,
      part,
      index,
      type,
      child.box,
      services.mergeTemplateStyle(child.style, learnedReplayFallbackStyle(family, index, type, palette)),
      {
        ...services.templateGuidedChildSource(child, "component-learned-child-layout"),
        componentTemplateFamily: family,
        componentTemplateMotif: learnedReplayMotifForFamily(family),
        learnedComponentReplay: true,
        learnedComponentReplayKind: child.kind,
        learnedComponentReplaySource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectLearnedReplayChildren(match = {}, targetBox = {}, family = "component", slideSize, services = {}) {
  const children = Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  return children
    .map((child, index) => ({
      index,
      kind: safeText(child?.kind).toLowerCase(),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape" || child.kind === "connector" || child.kind === "text")
    .filter((child) => services.isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 3 && child.box.h > 3)
    .filter((child) => isLearnedReplayChildForFamily(child, family))
    .sort((a, b) => learnedReplayLayerOrder(a, b, family))
    .slice(0, 60);
}

function isLearnedReplayChildForFamily(child = {}, family = "component") {
  const relative = child.relativeBox || {};
  const w = Math.max(0, Number(relative.w || 0));
  const h = Math.max(0, Number(relative.h || 0));
  const area = w * h;
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  if (area <= 0.0008 || area >= 0.9) return false;
  if (family === "venn-overlap") {
    return child.kind === "shape" && (/ellipse|oval|freeform/.test(shapeType) || (area >= 0.08 && area <= 0.45));
  }
  if (family === "concentric-circles") {
    return child.kind === "shape" && (/donut|ellipse|oval|blockarc|arc|circulararrow/.test(shapeType) || (area >= 0.035 && area <= 0.65));
  }
  if (family === "fishbone-cause-effect") {
    return child.kind === "connector"
      || /line|arrow|connector|triangle|chevron/.test(shapeType)
      || (child.kind === "shape" && area >= 0.008 && area <= 0.22);
  }
  if (family === "sankey-flow-chart") {
    return /freeform|blockarc|arc|chevron|parallelogram|rect|roundrect|line/.test(shapeType) || child.kind === "connector";
  }
  if (family === "map-chart") {
    return child.kind === "shape" && (/freeform|rect|roundrect|parallelogram|hexagon|diamond/.test(shapeType) || area >= 0.01);
  }
  if (family === "word-cloud-chart") {
    return child.kind === "text"
      || Boolean(child.style?.text)
      || (child.kind === "shape" && area >= 0.002 && area <= 0.28);
  }
  if (family === "waterfall-chart") {
    return /rect|roundrect|line|connector/.test(shapeType) || child.kind === "connector";
  }
  if (family === "gauge-chart") {
    return /arc|blockarc|donut|circulararrow|line|triangle|ellipse|oval/.test(shapeType) || child.kind === "connector";
  }
  if (family === "radar-chart") {
    return /line|triangle|freeform|ellipse|oval|rect|diamond/.test(shapeType) || child.kind === "connector";
  }
  return false;
}

function learnedReplayLayerOrder(a = {}, b = {}, family = "component") {
  const layerA = learnedReplayRoleLayer(a, family);
  const layerB = learnedReplayRoleLayer(b, family);
  if (layerA !== layerB) return layerA - layerB;
  return Number(a.index || 0) - Number(b.index || 0);
}

function learnedReplayRoleLayer(child = {}, family = "component") {
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  if (family === "venn-overlap" || family === "concentric-circles") {
    if (/ellipse|oval|donut|blockarc|arc|circulararrow|freeform/.test(shapeType)) return 0;
    return 1;
  }
  if (child.kind === "connector" || /line|connector/.test(shapeType)) return 0;
  return 1;
}

function learnedReplayNativeType(child = {}, family = "component", services = {}) {
  if (child.kind === "connector") return "line";
  if (family === "venn-overlap") return services.nativeTypeForTemplateStyle(child.style, "ellipse");
  if (family === "concentric-circles") return services.nativeTypeForTemplateStyle(child.style, "donut");
  if (family === "fishbone-cause-effect") return services.nativeTypeForTemplateStyle(child.style, /line|connector/.test(safeText(child.style?.shapeType).toLowerCase()) ? "line" : "roundRect");
  if (family === "sankey-flow-chart") return services.nativeTypeForTemplateStyle(child.style, "freeform");
  if (family === "map-chart") return services.nativeTypeForTemplateStyle(child.style, "freeform");
  if (family === "word-cloud-chart") return services.nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "waterfall-chart") return services.nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "gauge-chart") return services.nativeTypeForTemplateStyle(child.style, "blockarc");
  if (family === "radar-chart") return services.nativeTypeForTemplateStyle(child.style, "line");
  return services.nativeTypeForTemplateStyle(child.style, "rect");
}

function learnedReplayPartForFamily(family = "component", _child = {}, type = "rect") {
  if (family === "venn-overlap") return "venn-lobe";
  if (family === "concentric-circles") return "concentric-ring";
  if (family === "fishbone-cause-effect") return type === "line" ? "fishbone-spine" : "fishbone-cause-node";
  if (family === "sankey-flow-chart") return type === "line" ? "sankey-link" : "sankey-flow-band";
  if (family === "map-chart") return "map-region";
  if (family === "word-cloud-chart") return "word-cloud-token";
  if (family === "waterfall-chart") return type === "line" ? "waterfall-connector" : "waterfall-bar";
  if (family === "gauge-chart") return /line|triangle/.test(type) ? "gauge-pointer" : "gauge-arc";
  if (family === "radar-chart") return type === "line" ? "radar-axis" : "radar-mark";
  return "component-child";
}

function learnedReplayMotifForFamily(family = "component") {
  if (family === "venn-overlap") return "venn-overlap";
  if (family === "concentric-circles") return "concentric-circles";
  if (family === "fishbone-cause-effect") return "fishbone-cause";
  if (family === "sankey-flow-chart") return "sankey-flow-chart";
  if (family === "map-chart") return "map-chart";
  if (family === "word-cloud-chart") return "word-cloud-chart";
  if (family === "waterfall-chart") return "waterfall-chart";
  if (family === "gauge-chart") return "gauge-chart";
  if (family === "radar-chart") return "radar-chart";
  return "";
}

function learnedReplayFallbackStyle(family = "component", index = 0, type = "rect", palette = {}) {
  const accent = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || accent;
  if (type === "line") return { fill: "none", stroke: accent, strokeWidthPt: 1.2, connectorType: "straight" };
  if (family === "venn-overlap") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.42 };
  if (family === "concentric-circles") return { fill: "none", stroke: accent, strokeWidthPt: 2.2, opacity: 0.9 };
  if (family === "fishbone-cause-effect") return { fill, stroke: accent, strokeWidthPt: 1, radiusRatio: 0.1 };
  if (family === "sankey-flow-chart") return { fill: accent, stroke: "none", strokeWidthPt: 0, opacity: 0.72 };
  if (family === "map-chart") return { fill, stroke: "#FFFFFF", strokeWidthPt: 0.75, opacity: 0.9 };
  if (family === "word-cloud-chart") return {
    fill: "none",
    stroke: "none",
    strokeWidthPt: 0,
    text: {
      placeholderText: "关键词",
      fontSizePt: 18,
      color: accent,
      family: "Microsoft YaHei",
      align: "center",
      valign: "middle"
    }
  };
  if (family === "waterfall-chart") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 0.8 };
  if (family === "gauge-chart") return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.9 };
  if (family === "radar-chart") return { fill: "none", stroke: accent, strokeWidthPt: 1 };
  return { fill, stroke: palette.neutral || "#94A3B8", strokeWidthPt: 0.9 };
}

module.exports = {
  isLearnedReplayChildForFamily,
  learnedComponentReplayShapes,
  learnedReplayFallbackStyle,
  learnedReplayLayerOrder,
  learnedReplayMotifForFamily,
  learnedReplayNativeType,
  learnedReplayPartForFamily,
  learnedReplayRoleLayer,
  selectLearnedReplayChildren
};
