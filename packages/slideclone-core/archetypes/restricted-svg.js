"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_SVG_BYTES = 1024 * 1024;
const MAX_ELEMENTS = 512;
const MAX_PATH_SEGMENTS = 2048;
const SOURCE_GRAPHIC_TYPES = new Set(["source_graphic", "source-graphic", "restricted-svg"]);
const ELEMENT_ATTRIBUTES = Object.freeze({
  path: new Set(["id", "d", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  rect: new Set(["id", "x", "y", "width", "height", "rx", "ry", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  circle: new Set(["id", "cx", "cy", "r", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  ellipse: new Set(["id", "cx", "cy", "rx", "ry", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  polygon: new Set(["id", "points", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  polyline: new Set(["id", "points", "fill", "stroke", "stroke-width", "opacity", "fill-opacity", "stroke-opacity"]),
  line: new Set(["id", "x1", "y1", "x2", "y2", "fill", "stroke", "stroke-width", "opacity", "stroke-opacity"])
});

function expandRestrictedSvgGraphics(ir, options = {}) {
  const baseDir = path.resolve(options.baseDir || process.cwd());
  const next = cloneJson(ir);
  for (const [pageIndex, page] of (Array.isArray(next?.pages) ? next.pages : []).entries()) {
    const usedIds = new Set(["textBoxes", "shapes", "images", "tables", "charts", "icons"]
      .flatMap((name) => Array.isArray(page?.[name]) ? page[name] : [])
      .filter((item) => !SOURCE_GRAPHIC_TYPES.has(String(item?.type || "").toLowerCase()))
      .map((item) => item?.id)
      .filter((id) => typeof id === "string" && id.length > 0));
    for (const collection of ["shapes", "icons"]) {
      const expanded = [];
      for (const [itemIndex, item] of (Array.isArray(page?.[collection]) ? page[collection] : []).entries()) {
        if (!SOURCE_GRAPHIC_TYPES.has(String(item?.type || "").toLowerCase())) {
          expanded.push(item);
          continue;
        }
        const label = `page ${pageIndex + 1} ${collection}[${itemIndex}]`;
        const file = resolveSvgFile(item?.assetPath, baseDir, label, options.allowExternal === true);
        const buffer = fs.readFileSync(file);
        if (buffer.length === 0 || buffer.length > MAX_SVG_BYTES) throw new RestrictedSvgError(`${label} SVG exceeds the ${MAX_SVG_BYTES} byte limit`);
        const parsed = parseRestrictedSvg(buffer.toString("utf8"), { idPrefix: safeId(item.id) || `svg-${pageIndex + 1}-${itemIndex + 1}` });
        const realized = realizeSvgElements(item, parsed, file);
        for (const element of realized) {
          if (usedIds.has(element.id)) throw new RestrictedSvgError(`${label} introduces duplicate element id ${element.id}`);
          usedIds.add(element.id);
          expanded.push(element);
        }
      }
      page[collection] = expanded;
    }
  }
  return next;
}

function parseRestrictedSvg(source, options = {}) {
  if (typeof source !== "string" || source.length === 0 || Buffer.byteLength(source, "utf8") > MAX_SVG_BYTES) throw new RestrictedSvgError("SVG source is empty or too large");
  const text = source.replace(/^\uFEFF/, "").trim();
  if (/<!|<\?|&[A-Za-z#]/.test(text)) throw new RestrictedSvgError("SVG declarations, entities, and processing instructions are forbidden");
  const root = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i.exec(text);
  if (!root) throw new RestrictedSvgError("SVG must contain exactly one explicit svg root");
  const rootAttributes = parseAttributes(root[1], "svg");
  rejectUnknownAttributes(rootAttributes, new Set(["xmlns", "viewBox", "width", "height"]), "svg");
  if (rootAttributes.xmlns !== undefined && rootAttributes.xmlns !== "http://www.w3.org/2000/svg") throw new RestrictedSvgError("SVG xmlns is invalid");
  const viewBox = parseViewBox(rootAttributes.viewBox);
  const children = parseChildren(root[2]);
  const idPrefix = safeId(options.idPrefix) || "svg";
  const elements = children.map((child, index) => realizeElement(child, viewBox, `${idPrefix}-${index + 1}`));
  const ids = new Set();
  for (const element of elements) {
    if (ids.has(element.id)) throw new RestrictedSvgError(`SVG element id ${element.id} is duplicated`);
    ids.add(element.id);
  }
  return {
    viewBox,
    elements
  };
}

function parseChildren(content) {
  const children = [];
  let offset = 0;
  while (offset < content.length) {
    const whitespace = /^\s*/.exec(content.slice(offset))[0].length;
    offset += whitespace;
    if (offset >= content.length) break;
    const match = /^<([A-Za-z][A-Za-z0-9:-]*)([\s\S]*?)\/>/.exec(content.slice(offset));
    if (!match) throw new RestrictedSvgError("SVG children must be supported self-closing elements");
    const name = match[1].toLowerCase();
    if (!Object.hasOwn(ELEMENT_ATTRIBUTES, name)) throw new RestrictedSvgError(`SVG element ${name} is not supported`);
    const attributes = parseAttributes(match[2], name);
    rejectUnknownAttributes(attributes, ELEMENT_ATTRIBUTES[name], name);
    children.push({ name, attributes });
    if (children.length > MAX_ELEMENTS) throw new RestrictedSvgError(`SVG exceeds the ${MAX_ELEMENTS} element limit`);
    offset += match[0].length;
  }
  if (children.length === 0) throw new RestrictedSvgError("SVG contains no supported graphic elements");
  return children;
}

function parseAttributes(source, label) {
  if (source.includes("&")) throw new RestrictedSvgError(`${label} attributes must not contain entities`);
  const attributes = Object.create(null);
  let offset = 0;
  while (offset < source.length) {
    offset += /^\s*/.exec(source.slice(offset))[0].length;
    if (offset >= source.length) break;
    const match = /^([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])([\s\S]*?)\2/.exec(source.slice(offset));
    if (!match) throw new RestrictedSvgError(`${label} contains a malformed or valueless attribute`);
    const key = match[1];
    if (Object.hasOwn(attributes, key)) throw new RestrictedSvgError(`${label}.${key} is duplicated`);
    if (/^on/i.test(key) || /href$/i.test(key) || ["style", "class", "transform"].includes(key)) throw new RestrictedSvgError(`${label}.${key} is forbidden`);
    attributes[key] = match[3];
    offset += match[0].length;
  }
  return attributes;
}

function realizeElement(child, viewBox, generatedId) {
  const { name, attributes } = child;
  const id = safeId(attributes.id) || generatedId;
  const style = parsePresentationStyle(attributes);
  if (name === "path") return { id, type: "freeform", boxMode: "container", style: { ...style, closePath: false, freeformSegments: parsePath(attributes.d, viewBox) } };
  if (name === "polygon" || name === "polyline") {
    const points = parsePoints(attributes.points, viewBox);
    const segments = [{ type: "moveTo", points: [points[0]] }, ...points.slice(1).map((point) => ({ type: "lnTo", points: [point] }))];
    if (name === "polygon") segments.push({ type: "close", points: [] });
    return { id, type: "freeform", boxMode: "container", style: { ...style, closePath: name === "polygon", freeformSegments: segments } };
  }
  if (name === "line") {
    const first = normalizePoint(numberAttribute(attributes, "x1", 0), numberAttribute(attributes, "y1", 0), viewBox);
    const second = normalizePoint(numberAttribute(attributes, "x2", 0), numberAttribute(attributes, "y2", 0), viewBox);
    return { id, type: "freeform", boxMode: "container", style: { ...style, fill: "none", closePath: false, freeformSegments: [{ type: "moveTo", points: [first] }, { type: "lnTo", points: [second] }] } };
  }
  const geometry = primitiveGeometry(name, attributes, viewBox);
  return { id, type: geometry.type, boxMode: "primitive", normalizedBox: geometry.box, style: { ...style, ...geometry.style } };
}

function primitiveGeometry(name, attributes, viewBox) {
  if (name === "rect") {
    const x = numberAttribute(attributes, "x", 0); const y = numberAttribute(attributes, "y", 0);
    const width = positiveAttribute(attributes, "width"); const height = positiveAttribute(attributes, "height");
    const box = normalizeBox(x, y, width, height, viewBox);
    const rx = nonNegativeAttribute(attributes, "rx", 0); const ry = nonNegativeAttribute(attributes, "ry", rx);
    const rounded = rx > 0 || ry > 0;
    return { type: rounded ? "roundrect" : "rect", box, style: rounded ? { radiusRatio: Math.min(0.5, Math.max(rx / width, ry / height)) } : {} };
  }
  const cx = numberAttribute(attributes, "cx", 0); const cy = numberAttribute(attributes, "cy", 0);
  const rx = name === "circle" ? positiveAttribute(attributes, "r") : positiveAttribute(attributes, "rx");
  const ry = name === "circle" ? rx : positiveAttribute(attributes, "ry");
  return { type: "ellipse", box: normalizeBox(cx - rx, cy - ry, rx * 2, ry * 2, viewBox), style: {} };
}

function parsePath(value, viewBox) {
  if (typeof value !== "string" || value.length === 0 || value.length > 200000) throw new RestrictedSvgError("path.d is missing or too large");
  const tokens = [];
  const matcher = /([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let last = 0;
  for (let match; (match = matcher.exec(value));) {
    if (!/^[\s,]*$/.test(value.slice(last, match.index))) throw new RestrictedSvgError("path.d contains unsupported syntax");
    tokens.push(match[1] ? { command: match[1] } : { number: Number(match[2]) });
    last = matcher.lastIndex;
  }
  if (!/^[\s,]*$/.test(value.slice(last)) || tokens.length === 0) throw new RestrictedSvgError("path.d contains unsupported syntax");
  const supported = new Set(["M", "m", "L", "l", "H", "h", "V", "v", "C", "c", "Q", "q", "Z", "z"]);
  const segments = [];
  let index = 0; let command = ""; let x = 0; let y = 0; let startX = 0; let startY = 0; let hasMove = false;
  while (index < tokens.length) {
    if (tokens[index].command) {
      command = tokens[index++].command;
      if (!supported.has(command)) throw new RestrictedSvgError(`path command ${command} is not supported`);
      if (command === "Z" || command === "z") {
        if (!hasMove) throw new RestrictedSvgError("path close appears before move");
        segments.push({ type: "close", points: [] }); x = startX; y = startY; command = ""; continue;
      }
    } else if (!command) throw new RestrictedSvgError("path must begin each subpath with a command");
    const upper = command.toUpperCase(); const relative = command !== upper;
    const count = ({ M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4 })[upper];
    const numbers = takeNumbers(tokens, index, count, command); index += count;
    const point = (px, py) => ({ x: relative ? x + px : px, y: relative ? y + py : py });
    if (upper === "M" || upper === "L") {
      const next = point(numbers[0], numbers[1]); x = next.x; y = next.y;
      if (upper === "M") { startX = x; startY = y; hasMove = true; segments.push({ type: "moveTo", points: [normalizePoint(x, y, viewBox)] }); command = relative ? "l" : "L"; }
      else { requireMove(hasMove); segments.push({ type: "lnTo", points: [normalizePoint(x, y, viewBox)] }); }
    } else if (upper === "H") {
      requireMove(hasMove); x = relative ? x + numbers[0] : numbers[0]; segments.push({ type: "lnTo", points: [normalizePoint(x, y, viewBox)] });
    } else if (upper === "V") {
      requireMove(hasMove); y = relative ? y + numbers[0] : numbers[0]; segments.push({ type: "lnTo", points: [normalizePoint(x, y, viewBox)] });
    } else if (upper === "C") {
      requireMove(hasMove); const p1 = point(numbers[0], numbers[1]); const p2 = point(numbers[2], numbers[3]); const end = point(numbers[4], numbers[5]);
      segments.push({ type: "cubicBezTo", points: [normalizePoint(p1.x, p1.y, viewBox), normalizePoint(p2.x, p2.y, viewBox), normalizePoint(end.x, end.y, viewBox)] }); x = end.x; y = end.y;
    } else if (upper === "Q") {
      requireMove(hasMove); const control = point(numbers[0], numbers[1]); const end = point(numbers[2], numbers[3]);
      segments.push({ type: "quadBezTo", points: [normalizePoint(control.x, control.y, viewBox), normalizePoint(end.x, end.y, viewBox)] }); x = end.x; y = end.y;
    }
    if (segments.length > MAX_PATH_SEGMENTS) throw new RestrictedSvgError(`path exceeds the ${MAX_PATH_SEGMENTS} segment limit`);
  }
  if (!hasMove) throw new RestrictedSvgError("path has no move command");
  return segments;
}

function parsePoints(value, viewBox) {
  if (typeof value !== "string" || value.length === 0) throw new RestrictedSvgError("points are required");
  const parts = value.trim().split(/[\s,]+/).filter(Boolean).map(Number);
  if (parts.length < 4 || parts.length % 2 !== 0 || parts.length > MAX_PATH_SEGMENTS * 2 || parts.some((number) => !Number.isFinite(number))) throw new RestrictedSvgError("points are invalid or unbounded");
  return Array.from({ length: parts.length / 2 }, (_, index) => normalizePoint(parts[index * 2], parts[index * 2 + 1], viewBox));
}

function parsePresentationStyle(attributes) {
  const fill = parseColor(attributes.fill, "none", "fill");
  const stroke = parseColor(attributes.stroke, "none", "stroke");
  const strokeUser = nonNegativeAttribute(attributes, "stroke-width", 1);
  const opacity = opacityAttribute(attributes, "opacity", 1);
  const fillOpacity = opacityAttribute(attributes, "fill-opacity", opacity);
  const strokeOpacity = opacityAttribute(attributes, "stroke-opacity", opacity);
  return { fill, stroke, strokeWidthSvg: stroke === "none" ? 0 : strokeUser, opacity: Math.min(fillOpacity, strokeOpacity) };
}

function realizeSvgElements(parent, parsed, file) {
  if (!isBox(parent?.box)) throw new RestrictedSvgError(`source graphic ${parent?.id || "unknown"} requires a finite positive box`);
  const digest = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  return parsed.elements.map((element, index) => {
    const box = element.boxMode === "primitive" ? mapNormalizedBox(parent.box, element.normalizedBox) : { ...parent.box };
    const source = {
      ...(isPlainObject(parent.source) ? parent.source : {}),
      sourceGraphicId: parent.id,
      sourceGraphicElementIndex: index,
      svgSha256: digest,
      reconstruction: {
        ...(isPlainObject(parent.source?.reconstruction) ? parent.source.reconstruction : {}),
        realization: "native_shape",
        family: "geometry",
        reconstructedPixels: false
      }
    };
    const elementStyle = { ...element.style };
    const strokeWidthSvg = elementStyle.strokeWidthSvg;
    delete elementStyle.strokeWidthSvg;
    elementStyle.strokeWidthPt = Number(strokeWidthSvg) * ((parent.box.w / parsed.viewBox.width + parent.box.h / parsed.viewBox.height) / 2);
    return { id: element.id, type: element.type, box, style: { ...(isPlainObject(parent.style) ? parent.style : {}), ...elementStyle }, source };
  });
}

function resolveSvgFile(value, baseDir, label, allowExternal) {
  if (typeof value !== "string" || value.length === 0 || value.length > 32768 || value.includes("\0") || path.extname(value).toLowerCase() !== ".svg") throw new RestrictedSvgError(`${label}.assetPath must be a valid .svg path`);
  const resolved = path.isAbsolute(value) ? path.resolve(value) : path.resolve(baseDir, value);
  if (!allowExternal) {
    const relative = path.relative(baseDir, resolved);
    if (relative.startsWith("..") || path.isAbsolute(relative)) throw new RestrictedSvgError(`${label}.assetPath must stay within the IR directory`);
  }
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat?.isFile()) throw new RestrictedSvgError(`${label}.assetPath does not exist`);
  return resolved;
}

function parseViewBox(value) {
  if (typeof value !== "string") throw new RestrictedSvgError("svg.viewBox is required");
  const values = value.trim().split(/[\s,]+/).map(Number);
  if (values.length !== 4 || values.some((number) => !Number.isFinite(number)) || values[2] <= 0 || values[3] <= 0 || values[2] > 1e9 || values[3] > 1e9) throw new RestrictedSvgError("svg.viewBox must contain four bounded finite numbers with positive dimensions");
  return { x: values[0], y: values[1], width: values[2], height: values[3] };
}

function normalizePoint(x, y, viewBox) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RestrictedSvgError("SVG coordinates must be finite");
  const nx = (x - viewBox.x) / viewBox.width; const ny = (y - viewBox.y) / viewBox.height;
  if (nx < -1e-9 || nx > 1 + 1e-9 || ny < -1e-9 || ny > 1 + 1e-9) throw new RestrictedSvgError("SVG coordinate falls outside the declared viewBox");
  return { x: clamp01(nx), y: clamp01(ny) };
}

function normalizeBox(x, y, width, height, viewBox) {
  const topLeft = normalizePoint(x, y, viewBox); const bottomRight = normalizePoint(x + width, y + height, viewBox);
  return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
}
function mapNormalizedBox(parent, box) { return { x: parent.x + parent.w * box.x, y: parent.y + parent.h * box.y, w: parent.w * box.w, h: parent.h * box.h }; }
function takeNumbers(tokens, index, count, command) {
  if (index + count > tokens.length || tokens.slice(index, index + count).some((token) => token.command || !Number.isFinite(token.number))) throw new RestrictedSvgError(`path command ${command} has incomplete coordinates`);
  return tokens.slice(index, index + count).map((token) => token.number);
}
function requireMove(value) { if (!value) throw new RestrictedSvgError("path drawing command appears before move"); }
function rejectUnknownAttributes(attributes, allowed, label) { for (const key of Object.keys(attributes)) if (!allowed.has(key)) throw new RestrictedSvgError(`${label}.${key} is not supported`); }
function numberAttribute(attributes, key, fallback) { if (attributes[key] === undefined) return fallback; const value = Number(attributes[key]); if (!Number.isFinite(value)) throw new RestrictedSvgError(`${key} must be finite`); return value; }
function positiveAttribute(attributes, key) { const value = numberAttribute(attributes, key, NaN); if (!(value > 0)) throw new RestrictedSvgError(`${key} must be positive`); return value; }
function nonNegativeAttribute(attributes, key, fallback) { const value = numberAttribute(attributes, key, fallback); if (value < 0) throw new RestrictedSvgError(`${key} must be non-negative`); return value; }
function opacityAttribute(attributes, key, fallback) { const value = numberAttribute(attributes, key, fallback); if (value < 0 || value > 1) throw new RestrictedSvgError(`${key} must be between 0 and 1`); return value; }
function parseColor(value, fallback, label) { if (value === undefined) return fallback; if (value === "none") return "none"; if (!/^#[0-9A-Fa-f]{6}$/.test(value)) throw new RestrictedSvgError(`${label} must be none or #RRGGBB`); return value.toUpperCase(); }
function isBox(box) { return box && ["x", "y", "w", "h"].every((key) => Number.isFinite(box[key])) && box.w > 0 && box.h > 0; }
function safeId(value) { return typeof value === "string" && /^[A-Za-z0-9._:-]{1,160}$/.test(value) ? value : ""; }
function isPlainObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }
function clamp01(value) { return Math.min(1, Math.max(0, value)); }

class RestrictedSvgError extends Error { constructor(message) { super(message); this.name = "RestrictedSvgError"; } }

module.exports = { MAX_ELEMENTS, MAX_PATH_SEGMENTS, MAX_SVG_BYTES, RestrictedSvgError, expandRestrictedSvgGraphics, parseRestrictedSvg };
