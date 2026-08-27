"use strict";

function nativeTypeForTemplateStyle(style = {}, fallbackType = "rect") {
  if (sanitizeTemplateFreeform(style?.freeform)) return "freeform";
  const shapeType = String(style?.shapeType || "").toLowerCase();
  if (shapeType === "ellipse" || shapeType === "oval") return "ellipse";
  if (shapeType === "roundrect") return "roundRect";
  if (["rect", "line"].includes(shapeType)) return shapeType;
  if ([
    "triangle", "righttriangle", "diamond", "hexagon", "chevron", "parallelogram",
    "arc", "blockarc", "circulararrow", "bentarrow", "leftarrow", "rightarrow",
    "uparrow", "downarrow", "leftrightarrow", "updownarrow", "curvedleftarrow",
    "curvedrightarrow", "uturnarrow", "donut", "cloud", "document", "screen", "phone",
    "wedgerectcallout"
  ].includes(shapeType)) return shapeType;
  return safeFallbackType(fallbackType);
}

function mergeTemplateStyle(templateStyle = {}, fallbackStyle = {}) {
  const template = plainObject(templateStyle) ? templateStyle : {};
  const out = plainObject(fallbackStyle) ? { ...fallbackStyle } : {};
  const fill = safeColorOrNone(template.fill);
  const stroke = safeColorOrNone(template.stroke);
  if (fill) out.fill = fill;
  if (stroke) out.stroke = stroke;
  if (Number.isFinite(Number(template.strokeWidthPt))) out.strokeWidthPt = clampNumber(template.strokeWidthPt, 0, 12, out.strokeWidthPt || 0);
  if (Number.isFinite(Number(template.radiusRatio))) out.radiusRatio = clampNumber(template.radiusRatio, 0, 1, out.radiusRatio || 0);
  if (Number.isFinite(Number(template.opacity))) out.opacity = clampNumber(template.opacity, 0, 1, out.opacity ?? 1);
  if (Number.isFinite(Number(template.rotation))) out.rotation = clampNumber(template.rotation, -360, 360, 0);
  if (template.flipH === true) out.flipH = true;
  if (template.flipV === true) out.flipV = true;
  assign(out, "shadow", sanitizeTemplateShadow(template.shadow));
  assign(out, "connectorType", safeConnectorType(template.connectorType));
  assign(out, "startArrow", safeArrowType(template.startArrow));
  assign(out, "endArrow", safeArrowType(template.endArrow));
  assign(out, "dash", safeDashType(template.dash));
  assign(out, "gradient", sanitizeTemplateGradient(template.gradient));
  const adjustments = sanitizeTemplateAdjustments(template.adjustments, template.shapeType);
  if (adjustments.length > 0) out.adjustments = adjustments;
  assign(out, "freeform", sanitizeTemplateFreeform(template.freeform));
  assign(out, "text", sanitizeTemplateText(template.text));
  const picture = sanitizeTemplatePicture(template.picture);
  assign(out, "picture", picture);
  if (picture && Number.isFinite(Number(picture.opacity))) out.opacity = picture.opacity;
  if (String(template.shapeType || "").toLowerCase() === "roundrect" && out.radiusRatio === undefined) out.radiusRatio = 0.18;
  return out;
}

function firstTemplateConnectorStyle(match = {}) {
  const children = Array.isArray(match?.childLayout?.children) ? match.childLayout.children : [];
  const connector = children.find((child) => String(child?.kind || "") === "connector" && plainObject(child.style));
  return connector?.style || {};
}

function sanitizeTemplateShadow(shadow = {}) {
  if (!plainObject(shadow) || !Object.values(shadow).some((value) => value !== undefined && value !== null && value !== "")) return null;
  return {
    color: safeColor(shadow.color) || "#000000",
    alpha: clampNumber(shadow.alpha, 0, 1, 0.18),
    blurPt: clampNumber(shadow.blurPt, 0, 40, 4),
    distancePt: clampNumber(shadow.distancePt, 0, 40, 1),
    angleDeg: clampNumber(shadow.angleDeg, 0, 360, 90)
  };
}

function sanitizeTemplateGradient(gradient = {}) {
  if (!plainObject(gradient) || safeText(gradient.type).toLowerCase() !== "linear") return null;
  const stops = (Array.isArray(gradient.stops) ? gradient.stops : [])
    .map((stop) => ({
      position: clampNumber(stop?.position, 0, 1, 0),
      color: safeColor(stop?.color),
      ...(stop?.alpha !== undefined ? { alpha: clampNumber(stop.alpha, 0, 1, 1) } : {})
    }))
    .filter((stop) => stop.color)
    .slice(0, 6)
    .sort((a, b) => a.position - b.position);
  return stops.length < 2 ? null : { type: "linear", angleDeg: clampNumber(gradient.angleDeg, -360, 360, 0), stops };
}

function sanitizeTemplateAdjustments(adjustments = [], shapeType = "") {
  const limit = safeText(shapeType).toLowerCase() === "arc" ? 360 : 10;
  return (Array.isArray(adjustments) ? adjustments : [])
    .map(Number).filter(Number.isFinite)
    .map((value) => Math.round(clampNumber(value, -limit, limit, 0) * 10000) / 10000)
    .slice(0, 4);
}

function sanitizeTemplateFreeform(freeform = {}) {
  if (!plainObject(freeform)) return null;
  const points = sanitizePoints(freeform.points, 80);
  if (points.length < 3) return null;
  const out = { points, closePath: freeform.closePath !== false };
  const segments = sanitizeTemplateFreeformSegments(freeform.segments);
  if (segments.length > 0) out.segments = segments;
  return out;
}

function sanitizeTemplateFreeformSegments(segments = []) {
  return (Array.isArray(segments) ? segments : []).map((segment) => ({
    type: sanitizeTemplateFreeformSegmentType(segment?.type),
    points: sanitizePoints(segment?.points, 3)
  })).filter((segment) => segment.type && (segment.type === "close" || segment.points.length > 0)).slice(0, 120);
}

function sanitizeTemplateFreeformSegmentType(value) {
  const type = safeText(value);
  return /^(moveTo|lnTo|cubicBezTo|quadBezTo|close)$/.test(type) ? type : "";
}

function sanitizeTemplateText(text = {}) {
  if (!plainObject(text)) return null;
  const placeholderText = safeText(text.placeholderText);
  if (!placeholderText && !Number.isFinite(Number(text.fontSizePt)) && !safeColor(text.color)) return null;
  const out = { placeholderText };
  if (Number.isFinite(Number(text.fontSizePt))) out.fontSizePt = clampNumber(text.fontSizePt, 4, 96, 12);
  assign(out, "color", safeColor(text.color));
  if (safeText(text.weight).toLowerCase() === "bold") out.weight = "bold";
  assign(out, "align", normalizeTextAlign(text.align));
  assign(out, "valign", normalizeTextValign(text.valign));
  assign(out, "vertical", normalizeTextVertical(text.vertical));
  for (const key of ["marginLeftPt", "marginRightPt", "marginTopPt", "marginBottomPt"]) {
    if (Number.isFinite(Number(text[key]))) out[key] = clampNumber(text[key], 0, 72, 0);
  }
  assign(out, "family", safeText(text.family));
  assign(out, "gradient", sanitizeTemplateGradient(text.gradient));
  assign(out, "reflection", sanitizeTemplateTextReflection(text.reflection));
  if (Number.isFinite(Number(text.lineHeightMultiple))) out.lineHeightMultiple = clampNumber(text.lineHeightMultiple, 0.5, 4, 1);
  return out;
}

function sanitizeTemplateTextReflection(reflection = {}) {
  if (!plainObject(reflection)) return null;
  const out = {};
  for (const [key, minimum, maximum, fallback] of [
    ["blurPt", 0, 40, 0], ["startAlpha", 0, 1, 0.6], ["startPosition", 0, 1, 0],
    ["endAlpha", 0, 1, 0], ["endPosition", 0, 1, 1], ["distancePt", 0, 40, 0],
    ["directionDeg", -360, 360, 90], ["fadeDirectionDeg", -360, 360, 90],
    ["scaleX", -2, 2, 1], ["scaleY", -2, 2, -1], ["skewXDeg", -90, 90, 0], ["skewYDeg", -90, 90, 0]
  ]) if (Number.isFinite(Number(reflection[key]))) out[key] = clampNumber(reflection[key], minimum, maximum, fallback);
  const alignment = safeText(reflection.alignment).toLowerCase();
  if (/^(tl|t|tr|l|ctr|r|bl|b|br)$/.test(alignment)) out.alignment = alignment;
  if (typeof reflection.rotateWithShape === "boolean") out.rotateWithShape = reflection.rotateWithShape;
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeTextVertical(value) {
  const normalized = safeText(value).toLowerCase();
  return ["vert", "vert270", "wordartvert", "eavert", "mongolianvert", "wordartvertrtl"].includes(normalized) ? normalized : "";
}

function sanitizeTemplatePicture(picture = {}) {
  if (!plainObject(picture)) return null;
  const out = {};
  assign(out, "embedRelId", safeRelationshipId(picture.embedRelId));
  assign(out, "mediaTarget", safeMediaTarget(picture.mediaTarget));
  assign(out, "crop", sanitizePictureCrop(picture.crop));
  if (Number.isFinite(Number(picture.opacity))) out.opacity = clampNumber(picture.opacity, 0, 1, 1);
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizePictureCrop(crop = {}) {
  if (!plainObject(crop)) return null;
  const out = {};
  for (const key of ["left", "top", "right", "bottom"]) {
    if (!Number.isFinite(Number(crop[key]))) continue;
    const value = Math.round(clampNumber(crop[key], 0, 1, 0) * 10000) / 10000;
    if (value > 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

function sanitizePoints(value, maximum) {
  return (Array.isArray(value) ? value : []).map((point) => ({
    x: clampNumber(point?.x, -2, 3, 0), y: clampNumber(point?.y, -2, 3, 0)
  })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, maximum);
}

function safeFallbackType(value) {
  const type = String(value || "rect");
  return /^[A-Za-z][A-Za-z0-9-]{0,39}$/.test(type) ? type : "rect";
}

function normalizeTextAlign(value) {
  const text = safeText(value).toLowerCase();
  return ["left", "center", "right", "justify"].includes(text) ? text : "center";
}

function normalizeTextValign(value) {
  const text = safeText(value).toLowerCase();
  return ["top", "middle", "bottom"].includes(text) ? text : "top";
}

function safeText(value) { return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120); }
function safeColor(value) { const text = safeText(value).toUpperCase(); return /^#[0-9A-F]{6}$/.test(text) ? text : ""; }
function safeColorOrNone(value) { const text = safeText(value); return text.toLowerCase() === "none" ? "none" : safeColor(text); }
function safeConnectorType(value) { const text = safeText(value).toLowerCase(); return ["straight", "elbow", "curve"].includes(text) ? text : ""; }
function safeArrowType(value) { const text = safeText(value).toLowerCase(); return ["triangle", "oval", "diamond"].includes(text) ? text : ""; }
function safeDashType(value) { const text = safeText(value).toLowerCase(); return ["dash", "dot", "dashdot", "dashdotdot", "largedash", "largedashdot", "largedashdotdot", "systemdash", "systemdashdot", "systemdashdotdot"].includes(text) ? text : ""; }
function safeRelationshipId(value) { const text = safeText(value); return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : ""; }
function safeMediaTarget(value) { const text = safeText(value).replace(/\\/g, "/"); return /^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text) && !text.includes("..") ? text : ""; }
function clampNumber(value, minimum, maximum, fallback) { const number = Number(value); return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback; }
function plainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function assign(target, key, value) { if (value !== null && value !== undefined && value !== "") target[key] = value; }

module.exports = {
  firstTemplateConnectorStyle,
  mergeTemplateStyle,
  nativeTypeForTemplateStyle,
  normalizeTextVertical,
  sanitizePictureCrop,
  sanitizeTemplateAdjustments,
  sanitizeTemplateFreeform,
  sanitizeTemplateFreeformSegments,
  sanitizeTemplateGradient,
  sanitizeTemplatePicture,
  sanitizeTemplateShadow,
  sanitizeTemplateText,
  sanitizeTemplateTextReflection
};
