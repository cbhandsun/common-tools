"use strict";

const { clampBox, scaleRelativeBox } = require("./component-template-geometry");
const { paletteFromMatch } = require("./component-template-palette");
const { safeText } = require("./component-template-sanitizers");

function chartShapes(image = {}, match = {}, family = "chart", slideSize, services = {}) {
  const box = services.safeBox?.(image.box, slideSize);
  if (!box) return [];
  const palette = paletteFromMatch(match, {
    accents: ["#2563EB", "#F97316", "#22C55E", "#0EA5E9"],
    neutral: "#94A3B8",
    softFills: ["#DBEAFE", "#FFEDD5", "#DCFCE7", "#E0F2FE"]
  });
  const guided = templateGuidedChartShapes(image, match, box, family, palette, slideSize, services);
  if (guided.length > 0) return guided;
  return [];
}

function templateGuidedChartShapes(image = {}, match = {}, targetBox = {}, family = "chart", palette = {}, slideSize, services = {}) {
  const children = selectTemplateChartChildren(match, targetBox, family, slideSize, services);
  const minChildren = family === "pie-chart" ? 2 : 3;
  if (children.length < minChildren) return [];
  return children.map((child, index) => {
    const type = chartNativeTypeForChild(child, family, services);
    return services.nativeShape(
      image,
      match,
      chartPartForFamily(family),
      index,
      type,
      child.box,
      services.mergeTemplateStyle(child.style, chartFallbackStyle(family, index, type, palette)),
      {
        ...services.templateGuidedChildSource(child, "component-chart-child-layout"),
        chartTemplateFamily: family,
        chartTemplateMotif: chartMotifForFamily(family),
        chartSegmentIndex: index,
        chartTemplateSource: "plugin-child-layout"
      }
    );
  }).map((shape) => ({ ...shape, box: clampBox(shape.box, slideSize) }));
}

function selectTemplateChartChildren(match = {}, targetBox = {}, family = "chart", slideSize, services = {}) {
  const replayChildren = Array.isArray(match.replayChildLayout?.children) ? match.replayChildLayout.children : [];
  const children = replayChildren.length >= 4
    ? replayChildren
    : Array.isArray(match.childLayout?.children) ? match.childLayout.children : [];
  return children
    .map((child, index) => ({
      index,
      kind: safeText(child?.kind).toLowerCase(),
      relativeBox: child?.box,
      box: scaleRelativeBox(child?.box, targetBox, slideSize),
      style: child?.style || {}
    }))
    .filter((child) => child.kind === "shape")
    .filter((child) => services.isReusableAppliedChildBox(child.relativeBox))
    .filter((child) => child.box && child.box.w > 4 && child.box.h > 4)
    .filter((child) => isChartChildForFamily(child, family, targetBox))
    .sort((a, b) => a.index - b.index)
    .slice(0, 36);
}

function isChartChildForFamily(child = {}, family = "chart", targetBox = {}) {
  const relative = child.relativeBox || {};
  const w = Math.max(0, Number(relative.w || 0));
  const h = Math.max(0, Number(relative.h || 0));
  const area = w * h;
  const shapeType = safeText(child.style?.shapeType).toLowerCase();
  const aspect = Math.max(w, h) / Math.max(0.001, Math.min(w, h));
  if (area <= 0.002 || area >= 0.82) return false;
  if (/line|connector|brace|bracket/.test(shapeType)) return false;
  if (family === "treemap-chart") {
    if (/arrow|chevron|triangle|arc|circular/.test(shapeType)) return false;
    return area >= 0.015 && child.box.w >= targetBox.w * 0.035 && child.box.h >= targetBox.h * 0.035;
  }
  if (family === "scatter-chart") {
    return /ellipse|oval/.test(shapeType) || (aspect <= 1.45 && area <= 0.18);
  }
  if (family === "donut-chart") {
    return /donut|blockarc|arc|circulararrow|ellipse|oval/.test(shapeType) || (aspect <= 1.5 && area <= 0.42);
  }
  if (family === "pie-chart") {
    return /pie|blockarc|arc|donut|circulararrow/.test(shapeType) || (aspect <= 1.7 && area <= 0.5);
  }
  return false;
}

function chartNativeTypeForChild(child = {}, family = "chart", services = {}) {
  if (family === "treemap-chart") return services.nativeTypeForTemplateStyle(child.style, "rect");
  if (family === "scatter-chart") return services.nativeTypeForTemplateStyle(child.style, "ellipse");
  if (family === "donut-chart") return services.nativeTypeForTemplateStyle(child.style, "donut");
  if (family === "pie-chart") return services.nativeTypeForTemplateStyle(child.style, "blockarc");
  return services.nativeTypeForTemplateStyle(child.style, "rect");
}

function chartPartForFamily(family = "chart") {
  if (family === "treemap-chart") return "chart-treemap-tile";
  if (family === "scatter-chart") return "chart-bubble";
  if (family === "donut-chart") return "chart-donut-segment";
  if (family === "pie-chart") return "chart-pie-segment";
  return "chart-child";
}

function chartMotifForFamily(family = "chart") {
  if (family === "treemap-chart") return "treemap-chart";
  if (family === "scatter-chart") return "bubble-scatter-chart";
  if (family === "donut-chart") return "donut-segment-chart";
  if (family === "pie-chart") return "pie-share-chart";
  return "";
}

function chartFallbackStyle(family = "chart", index = 0, type = "rect", palette = {}) {
  const accent = palette.accents?.[index % Math.max(1, palette.accents.length)] || "#2563EB";
  const fill = palette.softFills?.[index % Math.max(1, palette.softFills.length)] || accent;
  if (family === "treemap-chart") {
    return { fill, stroke: "#FFFFFF", strokeWidthPt: 1.2, radiusRatio: type === "roundRect" ? 0.04 : 0 };
  }
  if (family === "scatter-chart") {
    return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, opacity: 0.88 };
  }
  if (family === "donut-chart" || family === "pie-chart") {
    return { fill: accent, stroke: "#FFFFFF", strokeWidthPt: 1, radiusRatio: 0 };
  }
  return { fill, stroke: palette.neutral || "#94A3B8", strokeWidthPt: 0.9 };
}

module.exports = {
  chartFallbackStyle,
  chartMotifForFamily,
  chartNativeTypeForChild,
  chartPartForFamily,
  chartShapes,
  isChartChildForFamily,
  selectTemplateChartChildren,
  templateGuidedChartShapes
};
