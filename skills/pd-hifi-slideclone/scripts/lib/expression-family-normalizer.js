"use strict";

function resolveImageExpressionFamily(image = {}) {
  const source = image?.source || {};
  const layer = source.layer || {};
  const understanding = layer.diagramUnderstanding || source.diagramUnderstanding || {};
  const explicit = clean(source.expressionFamily
    || layer.expressionFamily
    || understanding.expressionFamily
    || understanding.structureSignature?.expressionFamily);
  if (explicit) return explicit;

  const form = clean(source.expressionForm).toLowerCase();
  const text = [form, source.expressionSubtype, source.detector, layer.layerType, understanding.archetype]
    .map(clean)
    .join(" ")
    .toLowerCase();

  if (/screenshot-or-document|screen(?:shot|-capture)|ui-capture|document-crop|界面截图|产品截图|截图/.test(text)) {
    return "annotated-screenshot";
  }
  if (/icon-or-illustration|pictorial|icon|illustration|pictogram|clipart|sticker|badge|gem|shield|图标|插画|徽章|宝石/.test(text)) {
    return "pictorial-asset";
  }
  if (/table-or-matrix|table-grid|matrix|quadrant|heatmap|表格|矩阵|象限|网格/.test(text)) {
    return "layout-grid";
  }
  if (/data-chart|bar-chart|line-chart|scatter-chart|pie-chart|donut-chart|sankey|waterfall|gauge|radar|treemap|word-cloud|图表|柱状图|折线图|饼图|桑基图|瀑布图|雷达图/.test(text)) {
    return "data-chart";
  }
  if (/linear-process|process-flow|workflow|flowchart|timeline|roadmap|gantt|swimlane|fishbone|funnel|pyramid|layered-stack|流程|工作流|时间线|甘特|泳道|鱼骨|漏斗|金字塔/.test(text)) {
    return "structured-process";
  }
  if (/relationship-flow|hub-spoke|radial|cycle|closed-loop|topology|network|venn|overlap|concentric|关系|循环|闭环|拓扑|网络|同心圆/.test(text)) {
    return "relationship-diagram";
  }
  if (/complex-diagram|diagram-zone|graphic-zone/.test(text)
    && (Number(understanding.nodeCount || 0) >= 2 || Number(understanding.connectorCount || 0) >= 1)) {
    return "generic-structured-diagram";
  }
  return "unknown";
}

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim();
}

module.exports = { resolveImageExpressionFamily };
