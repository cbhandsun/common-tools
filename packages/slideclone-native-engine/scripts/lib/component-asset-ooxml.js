"use strict";

const { readZipEntry } = require("./pptx-inventory");

function collectColors(xml, themeColors = {}) {
  const colors = {};
  for (const color of collectFillColors(xml, themeColors)) {
    colors[color] = (colors[color] || 0) + 1;
  }
  return colors;
}

function parseDirectChildBoxes(block, relationships = {}, options = {}) {
  const children = [];
  const childPattern = /<p:(sp|pic|cxnSp)\b[\s\S]*?<\/p:\1>|<p:(sp|pic|cxnSp)\b[^>]*\/>/g;
  for (const match of String(block || "").matchAll(childPattern)) {
    const childXml = match[0] || "";
    const kind = match[1] || match[2] || "";
    const isConnector = kind === "cxnSp";
    children.push({
      kind: isConnector ? "connector" : kind === "pic" ? "picture" : "shape",
      // DrawingML stores horizontal and vertical connectors with a zero-sized
      // minor axis. Keep them as thin editable line boxes instead of dropping
      // the connector during positive-area filtering.
      boxPt: isConnector ? normalizeConnectorBounds(parseFirstXfrmBounds(childXml)) : parseFirstXfrmBounds(childXml),
      style: summarizeChildStyle(childXml, kind, relationships, options)
    });
  }
  return children;
}

function parseNestedReplayChildBoxes(block, relationships = {}, options = {}) {
  const source = String(block || "");
  if (!/^\s*<p:grpSp\b/i.test(source)) return parseDirectChildBoxes(source, relationships, options);
  const result = [];
  walkNestedReplayGroup(source, identityMatrix(), { rotation: 0, flipH: false, flipV: false }, result, relationships, options, 0);
  return result.slice(0, 192);
}

function stripOuterGroupBlock(block) {
  const source = String(block || "");
  const openEnd = source.indexOf(">");
  const closeStart = source.lastIndexOf("</p:grpSp>");
  return openEnd >= 0 && closeStart > openEnd ? source.slice(openEnd + 1, closeStart) : "";
}

function walkNestedReplayGroup(groupXml, parentMatrix, parentState, result, relationships, options, depth) {
  if (depth > 12 || result.length >= 192) return;
  const groupTransform = parseGroupChildTransform(groupXml);
  const currentMatrix = multiplyMatrices(parentMatrix, groupTransform.matrix);
  const currentState = {
    rotation: normalizeRotation(parentState.rotation + groupTransform.rotation),
    flipH: Boolean(parentState.flipH) !== Boolean(groupTransform.flipH),
    flipV: Boolean(parentState.flipV) !== Boolean(groupTransform.flipV)
  };
  for (const child of extractTopLevelDrawingBlocks(stripOuterGroupBlock(groupXml))) {
    if (result.length >= 192) break;
    if (child.kind === "grpSp") {
      walkNestedReplayGroup(child.xml, currentMatrix, currentState, result, relationships, options, depth + 1);
      continue;
    }
    const rawBox = parseFirstXfrmBounds(child.xml);
    const boxPt = transformBounds(rawBox, currentMatrix);
    const isConnector = child.kind === "cxnSp";
    const style = applyInheritedGroupStyle(
      summarizeChildStyle(child.xml, child.kind, relationships, options),
      currentState
    );
    result.push({
      kind: isConnector ? "connector" : child.kind === "pic" ? "picture" : "shape",
      boxPt: isConnector ? normalizeConnectorBounds(boxPt) : boxPt,
      style
    });
  }
}

function extractTopLevelDrawingBlocks(xml) {
  const source = String(xml || "");
  const blocks = [];
  const stack = [];
  let start = -1;
  let rootKind = "";
  const tagPattern = /<\/?p:(grpSp|sp|pic|cxnSp)\b[^>]*>/gi;
  for (const match of source.matchAll(tagPattern)) {
    const tag = match[0] || "";
    const kind = match[1] || "";
    const closing = /^<\//.test(tag);
    const selfClosing = /\/\s*>$/.test(tag);
    if (!closing) {
      if (stack.length === 0) {
        start = Number(match.index);
        rootKind = kind;
      }
      if (selfClosing) {
        if (stack.length === 0 && blocks.length < 256) {
          blocks.push({ kind, xml: tag });
          start = -1;
          rootKind = "";
        }
      } else {
        stack.push(kind);
      }
      continue;
    }
    if (stack.length === 0 || stack[stack.length - 1] !== kind) continue;
    stack.pop();
    if (stack.length === 0 && start >= 0 && blocks.length < 256) {
      blocks.push({ kind: rootKind, xml: source.slice(start, Number(match.index) + tag.length) });
      start = -1;
      rootKind = "";
    }
  }
  return blocks;
}

function parseGroupChildTransform(groupXml) {
  const properties = (String(groupXml || "").match(/<p:grpSpPr\b[^>]*>[\s\S]*?<\/p:grpSpPr>/i) || [])[0] || "";
  const xfrm = (properties.match(/<a:xfrm\b[^>]*>[\s\S]*?<\/a:xfrm>/i) || [])[0] || "";
  const off = parseCoordinatePair(xfrm, "off", "x", "y");
  const ext = parseCoordinatePair(xfrm, "ext", "cx", "cy");
  const childOff = parseCoordinatePair(xfrm, "chOff", "x", "y");
  const childExt = parseCoordinatePair(xfrm, "chExt", "cx", "cy");
  if (!off || !ext || !childOff || !childExt || ext.x <= 0 || ext.y <= 0 || childExt.x <= 0 || childExt.y <= 0) {
    return { matrix: identityMatrix(), rotation: 0, flipH: false, flipV: false };
  }
  const opening = (xfrm.match(/<a:xfrm\b[^>]*>/i) || [])[0] || "";
  const rotation = parseOpenXmlRotation(opening);
  const flipH = parseXmlBooleanAttribute(opening, "flipH");
  const flipV = parseXmlBooleanAttribute(opening, "flipV");
  const scaleX = ext.x / childExt.x;
  const scaleY = ext.y / childExt.y;
  const base = {
    a: scaleX,
    b: 0,
    c: 0,
    d: scaleY,
    e: off.x - childOff.x * scaleX,
    f: off.y - childOff.y * scaleY
  };
  const center = { x: off.x + ext.x / 2, y: off.y + ext.y / 2 };
  const orientation = matrixAroundCenter(rotation, flipH, flipV, center);
  return {
    matrix: multiplyMatrices(orientation, base),
    rotation,
    flipH,
    flipV
  };
}

function parseCoordinatePair(xml, tagName, firstAttribute, secondAttribute) {
  const tag = (String(xml || "").match(new RegExp(`<a:${tagName}\\b[^>]*>`, "i")) || [])[0]
    || (String(xml || "").match(new RegExp(`<a:${tagName}\\b[^>]*/>`, "i")) || [])[0]
    || "";
  const first = Number((tag.match(new RegExp(`\\b${firstAttribute}="(-?\\d+)"`, "i")) || [])[1]);
  const second = Number((tag.match(new RegExp(`\\b${secondAttribute}="(-?\\d+)"`, "i")) || [])[1]);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  return { x: emuToPt(first), y: emuToPt(second) };
}

function parseOpenXmlRotation(tag) {
  const raw = Number((String(tag || "").match(/\brot="(-?\d+)"/i) || [])[1]);
  return Number.isFinite(raw) ? normalizeRotation(raw / 60000) : 0;
}

function parseXmlBooleanAttribute(tag, name) {
  const value = safeString((String(tag || "").match(new RegExp(`\\b${name}="([^"]+)"`, "i")) || [])[1]).toLowerCase();
  return value === "1" || value === "true";
}

function identityMatrix() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function multiplyMatrices(parent, child) {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    e: parent.a * child.e + parent.c * child.f + parent.e,
    f: parent.b * child.e + parent.d * child.f + parent.f
  };
}

function matrixAroundCenter(rotationDeg, flipH, flipV, center) {
  const angle = rotationDeg * Math.PI / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const flipX = flipH ? -1 : 1;
  const flipY = flipV ? -1 : 1;
  const oriented = { a: cos * flipX, b: sin * flipX, c: -sin * flipY, d: cos * flipY, e: 0, f: 0 };
  return multiplyMatrices(
    { a: 1, b: 0, c: 0, d: 1, e: center.x, f: center.y },
    multiplyMatrices(oriented, { a: 1, b: 0, c: 0, d: 1, e: -center.x, f: -center.y })
  );
}

function transformBounds(box, matrix) {
  if (!box || ![box.x, box.y, box.w, box.h].every(Number.isFinite)) return null;
  const corners = [
    transformPoint(box.x, box.y, matrix),
    transformPoint(box.x + box.w, box.y, matrix),
    transformPoint(box.x, box.y + box.h, matrix),
    transformPoint(box.x + box.w, box.y + box.h, matrix)
  ];
  const minX = Math.min(...corners.map((point) => point.x));
  const minY = Math.min(...corners.map((point) => point.y));
  const maxX = Math.max(...corners.map((point) => point.x));
  const maxY = Math.max(...corners.map((point) => point.y));
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function transformPoint(x, y, matrix) {
  return { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f };
}

function applyInheritedGroupStyle(style = {}, state = {}) {
  const result = { ...(style || {}) };
  const ownRotation = Number(result.rotation || 0);
  const rotation = normalizeRotation((Number.isFinite(ownRotation) ? ownRotation : 0) + Number(state.rotation || 0));
  if (Math.abs(rotation) > 0.001) result.rotation = rotation;
  if (state.flipH === true) result.flipH = true;
  if (state.flipV === true) result.flipV = true;
  return result;
}

function normalizeRotation(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  let result = number % 360;
  if (result > 180) result -= 360;
  if (result <= -180) result += 360;
  return Math.round(result * 100) / 100;
}

function normalizeConnectorBounds(box = {}) {
  if (!box || !Number.isFinite(Number(box.x)) || !Number.isFinite(Number(box.y))) return null;
  const w = Number(box.w);
  const h = Number(box.h);
  if (!Number.isFinite(w) || !Number.isFinite(h) || (w <= 0 && h <= 0)) return null;
  const minorAxisPt = 0.75;
  return {
    ...box,
    w: w > 0 ? w : minorAxisPt,
    h: h > 0 ? h : minorAxisPt
  };
}

function summarizeChildStyle(xml, kind, relationships = {}, options = {}) {
  const style = {};
  const fill = kind === "cxnSp" ? "" : parseSolidFillColor(xml, options.themeColors);
  const stroke = parseLineColor(xml, options.themeColors);
  const strokeWidthPt = parseLineWidthPt(xml);
  const shapeType = parsePresetGeometry(xml);
  const freeform = shapeType ? null : parseCustomGeometryFreeform(xml);
  const adjustments = parsePresetGeometryAdjustments(xml, shapeType);
  const opacity = parseSolidFillOpacity(xml);
  const gradient = kind === "cxnSp" ? null : parseGradientFill(xml, options.themeColors);
  const shadow = parseOuterShadow(xml);
  const arrow = parseLineArrows(xml);
  const dash = parseLineDash(xml);
  const text = kind === "sp" ? parseShapeTextStyle(xml, options.themeColors, options.themeFonts) : null;
  const picture = kind === "pic" ? parsePictureStyle(xml, relationships) : null;
  const rotation = parseXfrmRotationDeg(xml);
  if (fill) style.fill = fill;
  if (kind !== "cxnSp" && hasShapeNoFill(xml)) style.fill = "none";
  if (stroke) style.stroke = stroke;
  if (hasLineNoFill(xml)) style.stroke = "none";
  if (strokeWidthPt !== null) style.strokeWidthPt = strokeWidthPt;
  if (shapeType) style.shapeType = shapeType;
  if (freeform) style.freeform = freeform;
  if (adjustments.length > 0) style.adjustments = adjustments;
  if (opacity !== null) style.opacity = opacity;
  if (gradient) style.gradient = gradient;
  if (shadow) style.shadow = shadow;
  if (arrow.startArrow) style.startArrow = arrow.startArrow;
  if (arrow.endArrow) style.endArrow = arrow.endArrow;
  if (dash) style.dash = dash;
  if (text) style.text = text;
  if (picture) style.picture = picture;
  if (rotation !== null) style.rotation = rotation;
  if (kind === "cxnSp") style.connectorType = "straight";
  return style;
}

function parsePictureStyle(xml, relationships = {}) {
  const relId = (String(xml || "").match(/<a:blip\b[^>]*(?:r:embed|embed)="([^"]+)"/i) || [])[1];
  const crop = parsePictureCrop(xml);
  const opacity = parsePictureOpacity(xml);
  if (!relId && !crop && opacity === null) return null;
  const picture = {};
  const safeRelId = relId ? safeRelationshipId(relId) : "";
  if (safeRelId) {
    picture.embedRelId = safeRelId;
    const mediaTarget = safeMediaTarget(relationships[safeRelId]);
    if (mediaTarget) picture.mediaTarget = mediaTarget;
  }
  if (crop) picture.crop = crop;
  if (opacity !== null) picture.opacity = opacity;
  return Object.keys(picture).length ? picture : null;
}

function parsePictureCrop(xml) {
  const srcRect = (String(xml || "").match(/<a:srcRect\b[^>]*\/?>/i) || [])[0] || "";
  if (!srcRect) return null;
  const crop = {};
  for (const [attr, key] of [["l", "left"], ["t", "top"], ["r", "right"], ["b", "bottom"]]) {
    const raw = (srcRect.match(new RegExp(`\\b${attr}="(-?\\d+)"`, "i")) || [])[1];
    if (!raw) continue;
    const value = Math.round(Math.max(0, Math.min(1, Number(raw) / 100000)) * 10000) / 10000;
    if (Number.isFinite(value) && value > 0) crop[key] = value;
  }
  return Object.keys(crop).length ? crop : null;
}

function parsePictureOpacity(xml) {
  const blip = (String(xml || "").match(/<a:blip\b[\s\S]*?<\/a:blip>|<a:blip\b[^>]*\/>/i) || [])[0] || "";
  const raw = (blip.match(/<a:alphaModFix\b[^>]*\bamt="(\d+)"/i) || [])[1]
    || (blip.match(/<a:alpha\b[^>]*\bval="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function parseShapeTextStyle(xml, themeColors = {}, themeFonts = {}) {
  const source = String(xml || "");
  const textValues = [];
  for (const match of source.matchAll(/<a:t>([\s\S]*?)<\/a:t>/gi)) {
    const value = decodeXmlText(match[1]);
    if (value) textValues.push(value);
  }
  if (textValues.length === 0) return null;
  const runBlock = firstXmlElement(source, "a:rPr");
  const run = openingTag(runBlock);
  const levelParagraphBlock = firstXmlElement(source, "a:lvl1pPr") || firstXmlElement(source, "a:defPPr");
  const levelParagraph = openingTag(levelParagraphBlock);
  const defaultRunBlock = firstXmlElement(levelParagraphBlock, "a:defRPr");
  const defaultRun = openingTag(defaultRunBlock);
  const paragraphBlock = firstXmlElement(source, "a:pPr");
  const paragraph = openingTag(paragraphBlock);
  const body = (source.match(/<a:bodyPr\b[^>]*>/i) || [])[0] || "";
  const fontSizePt = parseTextFontSizePt(run) ?? parseTextFontSizePt(defaultRun);
  const color = parseTextColor(runBlock, themeColors) || parseTextColor(defaultRunBlock, themeColors);
  const gradient = parseGradientFill(runBlock, themeColors) || parseGradientFill(defaultRunBlock, themeColors);
  const reflection = parseTextReflection(runBlock) || parseTextReflection(defaultRunBlock);
  const lineHeightMultiple = parseTextLineHeightMultiple(paragraphBlock);
  const align = normalizeTextAlign((paragraph.match(/\balgn="([^"]+)"/i) || [])[1]
    || (levelParagraph.match(/\balgn="([^"]+)"/i) || [])[1]);
  const valign = normalizeTextValign((body.match(/\banchor="([^"]+)"/i) || [])[1]);
  const vertical = normalizeTextVertical((body.match(/\bvert="([^"]+)"/i) || [])[1]);
  const typeface = parseTextTypeface(runBlock)
    || parseTextTypeface(defaultRunBlock)
    || parseTextTypeface(source);
  const text = {
    placeholderText: safeString(textValues.join("\n")).slice(0, 120)
  };
  const margins = parseTextBodyMargins(body);
  if (fontSizePt !== null) text.fontSizePt = fontSizePt;
  if (color) text.color = color;
  if (gradient) text.gradient = gradient;
  if (reflection) text.reflection = reflection;
  if (lineHeightMultiple !== null) text.lineHeightMultiple = lineHeightMultiple;
  if (/\bb="1"/i.test(run) || /\bb="1"/i.test(defaultRun)) text.weight = "bold";
  if (align) text.align = align;
  if (valign) text.valign = valign;
  if (vertical) text.vertical = vertical;
  if (margins) Object.assign(text, margins);
  if (typeface) text.family = resolveThemeTypeface(typeface, themeFonts).slice(0, 80);
  return text;
}

function parseTextBodyMargins(bodyPropertiesXml) {
  const body = String(bodyPropertiesXml || "");
  if (!body) return null;
  const toPoints = (attribute, fallback) => {
    const raw = (body.match(new RegExp(`\\b${attribute}="(-?\\d+)"`, "i")) || [])[1];
    const value = raw === undefined ? fallback : Number(raw) / 12700;
    return Number.isFinite(value) ? Math.round(Math.max(0, Math.min(72, value)) * 100) / 100 : fallback;
  };
  // These are DrawingML's text-body defaults when the inset attributes are absent.
  return {
    marginLeftPt: toPoints("lIns", 7.2),
    marginRightPt: toPoints("rIns", 7.2),
    marginTopPt: toPoints("tIns", 3.6),
    marginBottomPt: toPoints("bIns", 3.6)
  };
}

function firstXmlElement(xml, qualifiedName) {
  const source = String(xml || "");
  const escaped = String(qualifiedName || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!escaped) return "";
  const paired = source.match(new RegExp(`<${escaped}\\b[\\s\\S]*?<\\/${escaped}>`, "i"));
  if (paired) return paired[0];
  return (source.match(new RegExp(`<${escaped}\\b[^>]*/>`, "i")) || [])[0] || "";
}

function openingTag(xml) {
  return (String(xml || "").match(/^<[^>]+>/i) || [])[0] || "";
}

function parseTextTypeface(xml) {
  return (String(xml || "").match(/<a:latin\b[^>]*\btypeface="([^"]+)"/i) || [])[1]
    || (String(xml || "").match(/<a:ea\b[^>]*\btypeface="([^"]+)"/i) || [])[1]
    || "";
}

function parseTextLineHeightMultiple(paragraphXml) {
  const raw = (String(paragraphXml || "").match(/<a:lnSpc>\s*<a:spcPct\b[^>]*\bval="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  if (!Number.isFinite(value) || value < 0.5 || value > 4) return null;
  return Math.round(value * 1000) / 1000;
}

function parseTextReflection(xml) {
  const reflection = (String(xml || "").match(/<a:reflection\b[^>]*\/?>/i) || [])[0] || "";
  if (!reflection) return null;
  const out = {};
  addBoundedXmlNumber(out, "blurPt", reflection, "blurRad", 1 / 12700, 0, 40);
  addBoundedXmlNumber(out, "startAlpha", reflection, "stA", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "startPosition", reflection, "stPos", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "endAlpha", reflection, "endA", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "endPosition", reflection, "endPos", 1 / 100000, 0, 1);
  addBoundedXmlNumber(out, "distancePt", reflection, "dist", 1 / 12700, 0, 40);
  addBoundedXmlNumber(out, "directionDeg", reflection, "dir", 1 / 60000, -360, 360);
  addBoundedXmlNumber(out, "fadeDirectionDeg", reflection, "fadeDir", 1 / 60000, -360, 360);
  addBoundedXmlNumber(out, "scaleX", reflection, "sx", 1 / 100000, -2, 2);
  addBoundedXmlNumber(out, "scaleY", reflection, "sy", 1 / 100000, -2, 2);
  addBoundedXmlNumber(out, "skewXDeg", reflection, "kx", 1 / 60000, -90, 90);
  addBoundedXmlNumber(out, "skewYDeg", reflection, "ky", 1 / 60000, -90, 90);
  const alignment = safeString((reflection.match(/\balgn="([^"]+)"/i) || [])[1]).toLowerCase();
  if (/^(tl|t|tr|l|ctr|r|bl|b|br)$/.test(alignment)) out.alignment = alignment;
  const rotateWithShape = (reflection.match(/\brotWithShape="([^"]+)"/i) || [])[1];
  if (rotateWithShape !== undefined) out.rotateWithShape = /^(1|true)$/i.test(rotateWithShape);
  return Object.keys(out).length ? out : null;
}

function addBoundedXmlNumber(target, key, xml, attribute, scale, min, max) {
  const raw = (String(xml || "").match(new RegExp(`\\b${attribute}="(-?\\d+)"`, "i")) || [])[1];
  if (raw === undefined) return;
  const value = Number(raw) * scale;
  if (!Number.isFinite(value)) return;
  target[key] = Math.round(Math.max(min, Math.min(max, value)) * 10000) / 10000;
}

function normalizeTextVertical(value) {
  const normalized = safeString(value).toLowerCase();
  if (["vert", "vert270", "wordartvert", "eavert", "mongolianvert", "wordartvertrtl"].includes(normalized)) {
    return normalized;
  }
  return "";
}

function parseTextFontSizePt(runXml) {
  const raw = (String(runXml || "").match(/\bsz="(\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100;
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(Math.max(4, Math.min(96, value)) * 100) / 100;
}

function parseTextColor(xml, themeColors = {}) {
  return resolveColorInBlock(xml, themeColors);
}

function normalizeTextAlign(value) {
  const text = safeString(value).toLowerCase();
  if (text === "ctr" || text === "center") return "center";
  if (text === "r" || text === "right") return "right";
  if (text === "just" || text === "justify") return "justify";
  return text === "l" || text === "left" ? "left" : "";
}

function normalizeTextValign(value) {
  const text = safeString(value).toLowerCase();
  if (text === "ctr" || text === "mid" || text === "middle") return "middle";
  if (text === "b" || text === "bottom") return "bottom";
  return text === "t" || text === "top" ? "top" : "";
}

function decodeXmlText(value) {
  return safeString(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readThemeColors(file, entries = []) {
  const colors = {};
  const themeEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/theme\/(?:theme\d+|themeOverride\d+)\.xml$/i.test(name))
    .sort((a, b) => themePriority(a) - themePriority(b));
  for (const entry of themeEntries) {
    const xml = readZipEntry(file, entry, { maxBytes: 1024 * 1024 });
    if (!xml) continue;
    Object.assign(colors, parseThemeColorsXml(xml.toString("utf8")));
  }
  return colors;
}

function readThemeFonts(file, entries = []) {
  const fonts = {};
  const themeEntries = (Array.isArray(entries) ? entries : [])
    .map((entry) => entry.name)
    .filter((name) => /^ppt\/theme\/(?:theme\d+|themeOverride\d+)\.xml$/i.test(name))
    .sort((a, b) => themePriority(a) - themePriority(b));
  for (const entry of themeEntries) {
    const xml = readZipEntry(file, entry, { maxBytes: 1024 * 1024 });
    if (!xml) continue;
    Object.assign(fonts, parseThemeFontsXml(xml.toString("utf8")));
  }
  return fonts;
}

function parseThemeFontsXml(xml) {
  const source = String(xml || "");
  return {
    majorLatin: parseThemeFontFamily(source, "majorFont", "latin"),
    majorEastAsian: parseThemeFontFamily(source, "majorFont", "eastAsian"),
    minorLatin: parseThemeFontFamily(source, "minorFont", "latin"),
    minorEastAsian: parseThemeFontFamily(source, "minorFont", "eastAsian")
  };
}

function parseThemeFontFamily(xml, scheme, kind) {
  const block = firstXmlElement(String(xml || ""), `a:${scheme}`);
  if (!block) return "";
  const latin = safeString((block.match(/<a:latin\b[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  if (kind === "latin") return latin;
  const eastAsian = safeString((block.match(/<a:ea\b[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  const hans = safeString((block.match(/<a:font\b[^>]*\bscript="Hans"[^>]*\btypeface="([^"]*)"/i) || [])[1]);
  return eastAsian || hans || latin;
}

function resolveThemeTypeface(typeface, themeFonts = {}) {
  const raw = safeString(decodeXmlText(typeface));
  const key = raw.toLowerCase();
  const aliases = {
    "+mj-ea": themeFonts.majorEastAsian || themeFonts.majorLatin,
    "+mj-lt": themeFonts.majorLatin || themeFonts.majorEastAsian,
    "+mn-ea": themeFonts.minorEastAsian || themeFonts.minorLatin,
    "+mn-lt": themeFonts.minorLatin || themeFonts.minorEastAsian
  };
  return safeString(aliases[key] || raw);
}

function themePriority(name) {
  return /themeoverride/i.test(name) ? 1 : 0;
}

function parseThemeColorsXml(xml) {
  const colors = {};
  for (const match of String(xml || "").matchAll(/<a:(dk1|lt1|dk2|lt2|accent[1-6]|hlink|folHlink)\b[\s\S]*?<\/a:\1>/gi)) {
    const key = safeString(match[1]).toLowerCase();
    const color = resolveColorInBlock(match[0], colors);
    if (key && color) colors[key] = color;
  }
  if (colors.dk1) colors.tx1 = colors.dk1;
  if (colors.lt1) colors.bg1 = colors.lt1;
  if (colors.dk2) colors.tx2 = colors.dk2;
  if (colors.lt2) colors.bg2 = colors.lt2;
  return colors;
}

function parseSolidFillColor(xml, themeColors = {}) {
  const solidFill = String(xml || "").match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i);
  if (!solidFill) return "";
  return resolveColorInBlock(solidFill[0], themeColors);
}

function hasShapeNoFill(xml) {
  const beforeLine = String(xml || "").split(/<a:ln\b/i)[0] || "";
  return /<a:noFill\s*\/?>/i.test(beforeLine);
}

function hasLineNoFill(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  return Boolean(line && /<a:noFill\s*\/?>/i.test(line[0]));
}

function parseLineColor(xml, themeColors = {}) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return "";
  return resolveColorInBlock(line[0], themeColors);
}

function parseLineWidthPt(xml) {
  const line = String(xml || "").match(/<a:ln\b[^>]*\bw="(\d+)"/i);
  if (!line) return null;
  return Math.round((Number(line[1] || 0) / 12700) * 100) / 100;
}

function parseSolidFillOpacity(xml) {
  const solidFill = String(xml || "").match(/<a:solidFill\b[\s\S]*?<\/a:solidFill>/i);
  if (!solidFill) return null;
  const alpha = solidFill[0].match(/<a:alpha\b[^>]*\bval="(\d+)"/i);
  if (!alpha) return null;
  const value = Number(alpha[1]);
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(0, Math.min(1, value / 100000)) * 100) / 100;
}

function parseGradientFill(xml, themeColors = {}) {
  const gradFill = String(xml || "").match(/<a:gradFill\b[\s\S]*?<\/a:gradFill>/i);
  if (!gradFill) return null;
  const block = gradFill[0];
  const stops = [];
  for (const match of block.matchAll(/<a:gs\b[^>]*\bpos="(\d+)"[^>]*>([\s\S]*?)<\/a:gs>/gi)) {
    const pos = Number(match[1]);
    const stopXml = match[2];
    const color = resolveColorInBlock(stopXml, themeColors);
    if (!Number.isFinite(pos) || !color) continue;
    const alphaMatch = stopXml.match(/<a:alpha\b[^>]*\bval="(\d+)"/i);
    const alphaValue = Number(alphaMatch?.[1]);
    stops.push({
      position: Math.round(Math.max(0, Math.min(1, pos / 100000)) * 100) / 100,
      color,
      ...(Number.isFinite(alphaValue)
        ? { alpha: Math.round(Math.max(0, Math.min(1, alphaValue / 100000)) * 100) / 100 }
        : {})
    });
  }
  if (stops.length < 2) return null;
  const angle = (block.match(/<a:lin\b[^>]*\bang="(-?\d+)"/i) || [])[1];
  return {
    type: "linear",
    angleDeg: angle ? Math.round((Number(angle) / 60000) * 100) / 100 : 0,
    stops: stops
      .sort((a, b) => a.position - b.position)
      .slice(0, 6)
  };
}

function collectFillColors(xml, themeColors = {}) {
  const colors = [];
  for (const match of String(xml || "").matchAll(/<a:(?:solidFill|gradFill)\b[\s\S]*?<\/a:(?:solidFill|gradFill)>/gi)) {
    const color = resolveColorInBlock(match[0], themeColors);
    if (color) colors.push(color);
    for (const stop of match[0].matchAll(/<a:gs\b[^>]*>([\s\S]*?)<\/a:gs>/gi)) {
      const stopColor = resolveColorInBlock(stop[1], themeColors);
      if (stopColor) colors.push(stopColor);
    }
  }
  return colors;
}

function resolveColorInBlock(block, themeColors = {}) {
  const text = String(block || "");
  const srgb = text.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"[^>]*(?:\/>|>[\s\S]*?<\/a:srgbClr>)/i);
  if (srgb) return applyColorTransforms(`#${srgb[1].toUpperCase()}`, srgb[0]);
  const scheme = text.match(/<a:schemeClr\b[^>]*\bval="([A-Za-z0-9]+)"[^>]*(?:\/>|>[\s\S]*?<\/a:schemeClr>)/i);
  if (scheme) {
    const key = safeString(scheme[1]).toLowerCase();
    const base = themeColors[key] || defaultSchemeColor(key);
    return base ? applyColorTransforms(base, scheme[0]) : "";
  }
  return "";
}

function defaultSchemeColor(key) {
  const defaults = {
    tx1: "#000000",
    dk1: "#000000",
    bg1: "#FFFFFF",
    lt1: "#FFFFFF",
    accent1: "#4472C4",
    accent2: "#ED7D31",
    accent3: "#A5A5A5",
    accent4: "#FFC000",
    accent5: "#5B9BD5",
    accent6: "#70AD47"
  };
  return defaults[key] || "";
}

function applyColorTransforms(color, block = "") {
  const rgb = parseHexColor(color);
  if (!rgb) return "";
  let out = { ...rgb };
  const lumMod = firstTransformValue(block, "lumMod");
  const lumOff = firstTransformValue(block, "lumOff");
  const tint = firstTransformValue(block, "tint");
  const shade = firstTransformValue(block, "shade");
  if (lumMod !== null) out = mapRgb(out, (value) => value * lumMod);
  if (lumOff !== null) out = mapRgb(out, (value) => value + 255 * lumOff);
  if (tint !== null) out = mapRgb(out, (value) => value + (255 - value) * tint);
  if (shade !== null) out = mapRgb(out, (value) => value * shade);
  return rgbToHex(out);
}

function firstTransformValue(block, tag) {
  const raw = (String(block || "").match(new RegExp(`<a:${tag}\\b[^>]*\\bval="(\\d+)"`, "i")) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 100000;
  return Number.isFinite(value) ? Math.max(0, Math.min(2, value)) : null;
}

function parseHexColor(color) {
  const match = safeString(color).match(/^#?([0-9A-Fa-f]{6})$/);
  if (!match) return null;
  const value = match[1];
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16)
  };
}

function mapRgb(rgb, fn) {
  return {
    r: fn(rgb.r),
    g: fn(rgb.g),
    b: fn(rgb.b)
  };
}

function rgbToHex(rgb) {
  return `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

function parseOuterShadow(xml) {
  const shadow = String(xml || "").match(/<a:outerShdw\b[^>]*>[\s\S]*?<\/a:outerShdw>|<a:outerShdw\b[^>]*\/>/i);
  if (!shadow) return null;
  const block = shadow[0];
  const color = (block.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/i) || [])[1];
  const alpha = (block.match(/<a:alpha\b[^>]*\bval="(\d+)"/i) || [])[1];
  const blur = (block.match(/\bblurRad="(\d+)"/i) || [])[1];
  const distance = (block.match(/\bdist="(\d+)"/i) || [])[1];
  const direction = (block.match(/\bdir="(\d+)"/i) || [])[1];
  return {
    color: color ? `#${color.toUpperCase()}` : "#000000",
    alpha: alpha ? Math.round(Math.max(0, Math.min(1, Number(alpha) / 100000)) * 100) / 100 : 0.18,
    blurPt: blur ? Math.round((Number(blur) / 12700) * 100) / 100 : 4,
    distancePt: distance ? Math.round((Number(distance) / 12700) * 100) / 100 : 1,
    angleDeg: direction ? Math.round((Number(direction) / 60000) * 100) / 100 : 90
  };
}

function parseLineArrows(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return {};
  return {
    startArrow: normalizeArrowType((line[0].match(/<a:tailEnd\b[^>]*\btype="([a-zA-Z0-9_ -]+)"/i) || [])[1]),
    endArrow: normalizeArrowType((line[0].match(/<a:headEnd\b[^>]*\btype="([a-zA-Z0-9_ -]+)"/i) || [])[1])
  };
}

function parseLineDash(xml) {
  const line = String(xml || "").match(/<a:ln\b[\s\S]*?<\/a:ln>/i);
  if (!line) return "";
  const dash = (line[0].match(/<a:prstDash\b[^>]*\bval="([a-zA-Z0-9_ -]+)"/i) || [])[1];
  return normalizeDashType(dash);
}

function normalizeDashType(value) {
  const text = safeString(value).toLowerCase();
  // Preserve PowerPoint's compound presets instead of approximating all of
  // them as a generic dash. OfficePLUS uses these on visible card outlines.
  const presets = {
    dash: "dash",
    dashdot: "dashDot",
    dashdotdot: "dashDotDot",
    lgdash: "largeDash",
    lgdashdot: "largeDashDot",
    lgdashdotdot: "largeDashDotDot",
    sysdash: "systemDash",
    sysdashdot: "systemDashDot",
    sysdashdotdot: "systemDashDotDot"
  };
  if (presets[text]) return presets[text];
  if (text === "dot" || text === "sysdot") return "dot";
  return "";
}

function normalizeArrowType(value) {
  const text = safeString(value).toLowerCase();
  if (!text || text === "none") return "";
  if (text === "triangle" || text === "arrow" || text === "stealth") return "triangle";
  if (text === "oval") return "oval";
  if (text === "diamond") return "diamond";
  return "";
}

function parsePresetGeometry(xml) {
  const match = String(xml || "").match(/<a:prstGeom\b[^>]*\bprst="([a-zA-Z0-9_ -]+)"/i);
  return match ? safeString(match[1]).slice(0, 40) : "";
}

function parseCustomGeometryFreeform(xml) {
  const geometry = (String(xml || "").match(/<a:custGeom\b[\s\S]*?<\/a:custGeom>/i) || [])[0] || "";
  if (!geometry) return null;
  const pathBlock = (geometry.match(/<a:path\b[^>]*>[\s\S]*?<\/a:path>/i) || [])[0] || "";
  if (!pathBlock) return null;
  const segments = parseCustomGeometrySegments(pathBlock);
  const points = segments.flatMap((segment) => segment.points || []).slice(0, 80);
  if (points.length < 3) return null;
  const bounds = customGeometryPointBounds(points);
  const normalized = normalizeCustomGeometryPoints(points, bounds);
  if (normalized.length < 3) return null;
  return {
    points: normalized,
    segments: normalizeCustomGeometrySegments(segments, bounds),
    closePath: /<a:close\s*\/?>/i.test(pathBlock)
  };
}

function parseCustomGeometrySegments(pathBlock = "") {
  const segments = [];
  const commandPattern = /<a:(moveTo|lnTo|cubicBezTo|quadBezTo)\b[\s\S]*?<\/a:\1>|<a:close\s*\/?>/gi;
  for (const match of String(pathBlock || "").matchAll(commandPattern)) {
    const block = match[0] || "";
    const type = match[1] || "close";
    const points = [];
    for (const point of block.matchAll(/<a:pt\b[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"[^>]*\/>/gi)) {
      points.push({ x: Number(point[1]), y: Number(point[2]) });
    }
    if (type === "close" || points.length > 0) segments.push({ type, points });
    if (segments.length >= 120) break;
  }
  return segments;
}

function customGeometryPointBounds(points = []) {
  const numeric = points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (numeric.length === 0) return null;
  const minX = Math.min(...numeric.map((point) => point.x));
  const maxX = Math.max(...numeric.map((point) => point.x));
  const minY = Math.min(...numeric.map((point) => point.y));
  const maxY = Math.max(...numeric.map((point) => point.y));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

function normalizeCustomGeometryPoints(points = [], bounds = customGeometryPointBounds(points)) {
  if (!bounds) return [];
  const numeric = points
    .map((point) => ({ x: Number(point.x), y: Number(point.y) }))
    .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (numeric.length < 3) return [];
  return numeric.map((point) => ({
    x: roundRatio((point.x - bounds.minX) / bounds.width),
    y: roundRatio((point.y - bounds.minY) / bounds.height)
  }));
}

function normalizeCustomGeometrySegments(segments = [], bounds = null) {
  if (!bounds) return [];
  return segments
    .map((segment) => ({
      type: safeCustomGeometrySegmentType(segment.type),
      points: (segment.points || []).map((point) => ({
        x: roundRatio((Number(point.x) - bounds.minX) / bounds.width),
        y: roundRatio((Number(point.y) - bounds.minY) / bounds.height)
      })).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
    }))
    .filter((segment) => segment.type && (segment.type === "close" || segment.points.length > 0))
    .slice(0, 120);
}

function safeCustomGeometrySegmentType(type) {
  const safe = safeString(type).toLowerCase();
  if (safe === "moveto") return "moveTo";
  if (safe === "lnto") return "lnTo";
  if (safe === "cubicbezto") return "cubicBezTo";
  if (safe === "quadbezto") return "quadBezTo";
  if (safe === "close") return "close";
  return "";
}

function roundRatio(value) {
  return Math.round(Number(value || 0) * 10000) / 10000;
}

function parsePresetGeometryAdjustments(xml, shapeType = "") {
  const geom = String(xml || "").match(/<a:prstGeom\b[\s\S]*?<\/a:prstGeom>/i);
  if (!geom) return [];
  // DrawingML stores arc start/end guides in 1/60000 degree units, while the
  // ordinary preset guides used by radius-style shapes are percentage values.
  const isArc = String(shapeType || "").trim().toLowerCase() === "arc";
  const divisor = isArc ? 60000 : 100000;
  const values = [];
  for (const match of geom[0].matchAll(/<a:gd\b[^>]*\bfmla="val\s+(-?\d+(?:\.\d+)?)"/gi)) {
    const raw = Number(match[1]);
    if (!Number.isFinite(raw)) continue;
    values.push(Math.round((raw / divisor) * 10000) / 10000);
    if (values.length >= 4) break;
  }
  return values;
}

function parseFirstXfrmBounds(xml) {
  const xfrm = (String(xml || "").match(/<a:xfrm[\s\S]*?<\/a:xfrm>/) || [])[0] || "";
  const off = xfrm.match(/<a:off[^>]*\bx="(-?\d+)"[^>]*\by="(-?\d+)"/);
  const ext = xfrm.match(/<a:ext[^>]*\bcx="(-?\d+)"[^>]*\bcy="(-?\d+)"/);
  if (!off || !ext) return null;
  return {
    x: emuToPt(off[1]),
    y: emuToPt(off[2]),
    w: emuToPt(ext[1]),
    h: emuToPt(ext[2])
  };
}

function parseXfrmRotationDeg(xml) {
  const xfrm = (String(xml || "").match(/<a:xfrm\b[^>]*>/i) || [])[0] || "";
  const raw = (xfrm.match(/\brot="(-?\d+)"/i) || [])[1];
  if (!raw) return null;
  const value = Number(raw) / 60000;
  if (!Number.isFinite(value)) return null;
  return Math.round(Math.max(-360, Math.min(360, value)) * 100) / 100;
}

function readSlideRelationships(file, slideEntryName) {
  const entry = String(slideEntryName || "").replace(/\\/g, "/");
  const fileName = entry.split("/").pop();
  if (!/^slide\d+\.xml$/i.test(fileName || "")) return {};
  const relsEntry = entry.replace(/\/([^/]+)$/i, "/_rels/$1.rels");
  const rels = readZipEntry(file, relsEntry, { maxBytes: 512 * 1024 });
  if (!rels) return {};
  return parseRelationshipsXml(rels.toString("utf8"), entry);
}

function parseRelationshipsXml(xml, baseEntryName = "") {
  const relationships = {};
  const baseDir = String(baseEntryName || "").replace(/\\/g, "/").replace(/\/[^/]*$/, "");
  for (const match of String(xml || "").matchAll(/<Relationship\b[^>]*>/gi)) {
    const tag = match[0] || "";
    const id = safeRelationshipId((tag.match(/\bId="([^"]+)"/i) || [])[1]);
    const target = (tag.match(/\bTarget="([^"]+)"/i) || [])[1];
    const mode = (tag.match(/\bTargetMode="([^"]+)"/i) || [])[1];
    if (!id || safeString(mode).toLowerCase() === "external") continue;
    const mediaTarget = resolveRelationshipTarget(baseDir, target);
    if (mediaTarget) relationships[id] = mediaTarget;
  }
  return relationships;
}

function resolveRelationshipTarget(baseDir, target) {
  const raw = safeString(target).replace(/\\/g, "/");
  if (!raw || /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) return "";
  const baseParts = String(baseDir || "").split("/").filter(Boolean);
  const targetParts = raw.startsWith("/") ? raw.slice(1).split("/") : [...baseParts, ...raw.split("/")];
  const out = [];
  for (const part of targetParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return "";
      out.pop();
      continue;
    }
    out.push(part);
  }
  return safeMediaTarget(out.join("/"));
}

function normalizeChildBox(box, reference) {
  return {
    x: roundRatio((box.x - reference.x) / reference.w),
    y: roundRatio((box.y - reference.y) / reference.h),
    w: roundRatio(box.w / reference.w),
    h: roundRatio(box.h / reference.h)
  };
}

function unionBounds(boxes = []) {
  const valid = boxes.filter(hasPositiveBounds);
  if (valid.length === 0) return null;
  const minX = Math.min(...valid.map((box) => box.x));
  const minY = Math.min(...valid.map((box) => box.y));
  const maxX = Math.max(...valid.map((box) => box.x + box.w));
  const maxY = Math.max(...valid.map((box) => box.y + box.h));
  return {
    x: minX,
    y: minY,
    w: maxX - minX,
    h: maxY - minY
  };
}

function hasPositiveBounds(box = {}) {
  return !!box
    && Number.isFinite(Number(box.x))
    && Number.isFinite(Number(box.y))
    && Number(box.w) > 0
    && Number(box.h) > 0;
}


function emuToPt(value) {
  return Math.round((Number(value || 0) / 12700) * 100) / 100;
}

function safeString(value) {
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result.trim();
}

function safeRelationshipId(value) {
  const text = safeString(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : "";
}

function safeMediaTarget(value) {
  const text = safeString(value).replace(/\\/g, "/");
  return /^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text) && !text.includes("..") ? text : "";
}


module.exports = {
  collectColors,
  collectFillColors,
  decodeXmlText,
  emuToPt,
  extractTopLevelDrawingBlocks,
  hasPositiveBounds,
  normalizeChildBox,
  parseDirectChildBoxes,
  parseGradientFill,
  parseLineDash,
  parseNestedReplayChildBoxes,
  parsePresetGeometryAdjustments,
  parseRelationshipsXml,
  parseSolidFillColor,
  parseThemeColorsXml,
  parseThemeFontsXml,
  readSlideRelationships,
  readThemeColors,
  readThemeFonts,
  resolveRelationshipTarget,
  resolveThemeTypeface,
  unionBounds
};
