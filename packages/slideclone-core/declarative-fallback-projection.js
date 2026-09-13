"use strict";

function applySemanticFallbackPipeline(page, semanticFallbackContext, createSemanticFallbackPipeline) {
  if (!semanticFallbackContext) return;
  if (!page || typeof page !== "object" || Array.isArray(page)) throw new TypeError("native image rebuild page is invalid");
  if (typeof createSemanticFallbackPipeline !== "function") throw new TypeError("native image semantic fallback pipeline is invalid");
  const pipeline = createSemanticFallbackPipeline();
  if (!pipeline || typeof pipeline.run !== "function") throw new TypeError("native image semantic fallback pipeline is invalid");
  const result = pipeline.run(semanticFallbackContext, { enforceQualityGate: true });
  const evidence = {
    status: result.status,
    matchedPlugin: result.matchedPlugin || null,
    shapes: Array.isArray(result.shapes) ? result.shapes.length : 0,
    textBoxes: Array.isArray(result.textBoxes) ? result.textBoxes.length : 0,
    qualityPassed: result.qualityReport?.passed === true
  };
  page.source = { ...(page.source || {}), declarativeRebuild: evidence };
  if (result.status !== "matched") return;
  const shapes = projectDeclarativeShapes(result.shapes, result.matchedPlugin);
  const textBoxes = projectDeclarativeTextBoxes(result.textBoxes, result.matchedPlugin);
  if (shapes.length === 0 && textBoxes.length === 0) return;
  page.shapes = [...(Array.isArray(page.shapes) ? page.shapes : []), ...shapes];
  page.textBoxes = [...(Array.isArray(page.textBoxes) ? page.textBoxes : []), ...textBoxes];
}

function projectDeclarativeShapes(shapes, matchedPlugin) {
  return (Array.isArray(shapes) ? shapes : []).map((shape, index) => projectDeclarativeShape(shape, index, matchedPlugin)).filter(Boolean);
}

function projectDeclarativeShape(shape, index, matchedPlugin) {
  if (!shape || typeof shape !== "object" || Array.isArray(shape)) return null;
  const id = boundedIdentifier(shape.id, `declarative-shape-${index + 1}`);
  const source = { declarativeRebuilder: true, matchedPlugin };
  if (shape.type === "connector_line") {
    const x1 = finiteNumber(shape.x1);
    const y1 = finiteNumber(shape.y1);
    const x2 = finiteNumber(shape.x2);
    const y2 = finiteNumber(shape.y2);
    if ([x1, y1, x2, y2].some((value) => value === null)) return null;
    return {
      id,
      type: "line",
      box: { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) },
      style: { stroke: safeColor(shape.stroke) || "#0066CC" },
      source: { ...source, connector: true }
    };
  }
  const box = boxFromDeclarative(shape);
  if (!box) return null;
  return {
    id,
    type: declarativeShapeType(shape.type),
    box,
    ...(safeColor(shape.fill) ? { fill: safeColor(shape.fill) } : {}),
    ...(safeColor(shape.stroke) ? { stroke: safeColor(shape.stroke) } : {}),
    source
  };
}

function projectDeclarativeTextBoxes(textBoxes, matchedPlugin) {
  return (Array.isArray(textBoxes) ? textBoxes : []).map((textBox, index) => {
    if (!textBox || typeof textBox !== "object" || Array.isArray(textBox)) return null;
    const box = boxFromDeclarative(textBox.box);
    const text = typeof textBox.text === "string" ? textBox.text : "";
    if (!box || !text) return null;
    return {
      id: boundedIdentifier(textBox.id, `declarative-text-${index + 1}`),
      text,
      box,
      font: textBox.font && typeof textBox.font === "object" && !Array.isArray(textBox.font) ? { ...textBox.font } : {},
      style: { visibility: "visible", opacity: 1, wrap: true, fit: "shrink" },
      source: { declarativeRebuilder: true, matchedPlugin, role: typeof textBox.role === "string" ? textBox.role : undefined }
    };
  }).filter(Boolean);
}

function boxFromDeclarative(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const w = finiteNumber(value.w);
  const h = finiteNumber(value.h);
  if ([x, y, w, h].some((item) => item === null) || w <= 0 || h < 0) return null;
  return { x, y, w, h };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function boundedIdentifier(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9_.:-]{1,128}$/u.test(text) ? text : fallback;
}

function declarativeShapeType(value) {
  if (value === "round_rect") return "roundRect";
  if (value === "circle") return "ellipse";
  return typeof value === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value) ? value : "rect";
}

function safeColor(value) {
  return typeof value === "string" && /^#[0-9A-Fa-f]{6}$/u.test(value) ? value : "";
}

module.exports = {
  applySemanticFallbackPipeline,
  _private: {
    boundedIdentifier,
    boxFromDeclarative,
    declarativeShapeType,
    projectDeclarativeShape,
    projectDeclarativeShapes,
    projectDeclarativeTextBoxes,
    safeColor
  }
};
