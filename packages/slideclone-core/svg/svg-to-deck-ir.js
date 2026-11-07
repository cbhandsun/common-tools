"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MAX_SVG_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_SVG_PAGES = 20;
const MAX_SVG_NODES = 4096;
const MAX_PATH_SEGMENTS = 2048;
const DEFAULT_SLIDE_WIDTH_PT = 960;
const DEFAULT_SLIDE_HEIGHT_PT = 540;

const NAMED_COLORS = Object.freeze({
  black: "#000000",
  white: "#FFFFFF",
  red: "#EF4444",
  green: "#22C55E",
  blue: "#3B82F6",
  yellow: "#EAB308",
  orange: "#F97316",
  purple: "#A855F7",
  pink: "#EC4899",
  gray: "#6B7280",
  grey: "#6B7280",
  slate: "#64748B",
  cyan: "#06B6D4",
  teal: "#14B8A6",
  indigo: "#6366F1",
  transparent: "none",
  none: "none"
});

class SvgCompileError extends Error {
  constructor(message) {
    super(message);
    this.name = "SvgCompileError";
  }
}

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function round3(value) {
  return Math.round(Number(value) * 1000) / 1000;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function decodeXmlEntities(text) {
  if (typeof text !== "string" || !text.includes("&")) return String(text || "");
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&amp;/g, "&");
}

function safeId(value, fallback) {
  if (typeof value === "string") {
    const cleaned = value.trim().replace(/[^A-Za-z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
    if (cleaned.length > 0 && cleaned.length <= 120 && /^[A-Za-z0-9]/.test(cleaned)) return cleaned;
  }
  return fallback;
}

function normalizeColor(raw, fallback = "none") {
  if (raw === undefined || raw === null) return fallback;
  const value = String(raw).trim();
  if (!value) return fallback;
  const lower = value.toLowerCase();
  if (Object.hasOwn(NAMED_COLORS, lower)) return NAMED_COLORS[lower];
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toUpperCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const r = value[1];
    const g = value[2];
    const b = value[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  const rgbMatch = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9.]+))?\s*\)$/i.exec(value);
  if (rgbMatch) {
    if (rgbMatch[4] !== undefined && Number(rgbMatch[4]) <= 0) return "none";
    const toHex = (n) => clamp(Number(n), 0, 255).toString(16).padStart(2, "0").toUpperCase();
    return `#${toHex(rgbMatch[1])}${toHex(rgbMatch[2])}${toHex(rgbMatch[3])}`;
  }
  return fallback;
}

function parseStyleAttribute(styleText) {
  const result = Object.create(null);
  if (typeof styleText !== "string" || !styleText.trim()) return result;
  for (const part of styleText.split(";")) {
    const colon = part.indexOf(":");
    if (colon <= 0) continue;
    const key = part.slice(0, colon).trim().toLowerCase();
    const val = part.slice(colon + 1).trim();
    if (key && val) result[key] = val;
  }
  return result;
}

function parseAttributes(attrString) {
  const attrs = Object.create(null);
  if (!attrString) return attrs;
  const regex = /([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    const key = match[1];
    const value = match[2] !== undefined ? match[2] : match[3];
    if (/^on/i.test(key)) throw new SvgCompileError(`Event attribute ${key} is forbidden in SVG`);
    attrs[key] = value;
  }
  if (attrs.style) {
    const inlineStyle = parseStyleAttribute(attrs.style);
    for (const [k, v] of Object.entries(inlineStyle)) {
      if (attrs[k] === undefined) attrs[k] = v;
    }
  }
  return attrs;
}

function parseXmlTree(svgSource) {
  if (typeof svgSource !== "string") throw new SvgCompileError("SVG source must be a string");
  const byteLength = Buffer.byteLength(svgSource, "utf8");
  if (byteLength < 10 || byteLength > MAX_SVG_INPUT_BYTES) {
    throw new SvgCompileError(`SVG source size must be between 10 bytes and ${MAX_SVG_INPUT_BYTES} bytes`);
  }
  if (/<!ENTITY/i.test(svgSource) || /<script\b/i.test(svgSource) || /<foreignObject\b/i.test(svgSource)) {
    throw new SvgCompileError("SVG contains forbidden script, entity, or foreignObject elements");
  }
  const cleaned = svgSource
    .replace(/^\uFEFF/, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?xml[\s\S]*?\?>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .trim();

  const tokenRegex = /<\/?([A-Za-z][A-Za-z0-9:_-]*)([^>]*?)\/?>|([^<]+)/g;
  const rootHolder = { name: "#document", attributes: Object.create(null), children: [], text: "" };
  const stack = [rootHolder];
  let nodeCount = 0;
  let match;
  while ((match = tokenRegex.exec(cleaned)) !== null) {
    const full = match[0];
    const tagName = match[1];
    const attrPart = match[2];
    const textNode = match[3];
    const current = stack[stack.length - 1];
    if (textNode !== undefined) {
      if (current.name === "text" || current.name === "tspan") {
        current.children.push({ name: "#text", text: decodeXmlEntities(textNode) });
      }
      continue;
    }
    const lowerTag = tagName.includes(":") ? tagName.split(":").pop().toLowerCase() : tagName.toLowerCase();
    if (full.startsWith("</")) {
      if (stack.length <= 1 || stack[stack.length - 1].name !== lowerTag) {
        throw new SvgCompileError(`Mismatched closing tag </${tagName}>`);
      }
      stack.pop();
      continue;
    }
    nodeCount += 1;
    if (nodeCount > MAX_SVG_NODES) throw new SvgCompileError(`SVG exceeds maximum node count (${MAX_SVG_NODES})`);
    const selfClosing = full.endsWith("/>");
    const node = {
      name: lowerTag,
      attributes: parseAttributes(attrPart),
      children: []
    };
    current.children.push(node);
    if (!selfClosing) stack.push(node);
  }
  if (stack.length !== 1) throw new SvgCompileError("SVG contains unclosed tags");
  const svgRoots = rootHolder.children.filter((child) => child.name === "svg");
  if (svgRoots.length !== 1) throw new SvgCompileError("SVG must contain exactly one <svg> root element");
  return svgRoots[0];
}

function parseNumber(value, fallback = 0) {
  if (value === undefined || value === null || value === "") return fallback;
  const cleaned = String(value).trim().replace(/(?:px|pt)$/i, "");
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : fallback;
}

function parseViewBox(svgNode) {
  const attrs = svgNode.attributes;
  if (typeof attrs.viewBox === "string" && attrs.viewBox.trim()) {
    const parts = attrs.viewBox.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every(Number.isFinite) && parts[2] > 0 && parts[3] > 0) {
      return { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
    }
  }
  const width = parseNumber(attrs.width, DEFAULT_SLIDE_WIDTH_PT);
  const height = parseNumber(attrs.height, DEFAULT_SLIDE_HEIGHT_PT);
  if (width <= 0 || height <= 0) throw new SvgCompileError("SVG viewBox or positive width/height is required");
  return { x: 0, y: 0, width, height };
}

function parseTransform(transformStr) {
  let tx = 0;
  let ty = 0;
  let sx = 1;
  let sy = 1;
  let rot = 0;
  if (typeof transformStr !== "string" || !transformStr.trim()) {
    return { tx, ty, sx, sy, rot };
  }
  const callRegex = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  let match;
  while ((match = callRegex.exec(transformStr)) !== null) {
    const fn = match[1].toLowerCase();
    const nums = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    if (nums.some((n) => !Number.isFinite(n))) continue;
    if (fn === "translate") {
      tx += nums[0] || 0;
      ty += nums[1] || 0;
    } else if (fn === "scale") {
      const factorX = nums[0] ?? 1;
      const factorY = nums[1] ?? factorX;
      sx *= factorX;
      sy *= factorY;
    } else if (fn === "rotate") {
      rot += nums[0] || 0;
    }
  }
  return { tx, ty, sx, sy, rot };
}

function composeContext(parentCtx, nodeAttrs) {
  const local = parseTransform(nodeAttrs.transform);
  const sx = parentCtx.sx * local.sx;
  const sy = parentCtx.sy * local.sy;
  const tx = parentCtx.tx + local.tx * parentCtx.sx;
  const ty = parentCtx.ty + local.ty * parentCtx.sy;
  const rot = parentCtx.rot + local.rot;
  const opacity = clamp(parentCtx.opacity * parseNumber(nodeAttrs.opacity, 1), 0, 1);
  return {
    tx,
    ty,
    sx,
    sy,
    rot,
    opacity,
    fill: nodeAttrs.fill !== undefined ? nodeAttrs.fill : parentCtx.fill,
    stroke: nodeAttrs.stroke !== undefined ? nodeAttrs.stroke : parentCtx.stroke,
    strokeWidth: nodeAttrs["stroke-width"] !== undefined ? nodeAttrs["stroke-width"] : parentCtx.strokeWidth,
    strokeDasharray: nodeAttrs["stroke-dasharray"] !== undefined ? nodeAttrs["stroke-dasharray"] : parentCtx.strokeDasharray,
    fontFamily: nodeAttrs["font-family"] !== undefined ? nodeAttrs["font-family"] : parentCtx.fontFamily,
    fontSize: nodeAttrs["font-size"] !== undefined ? nodeAttrs["font-size"] : parentCtx.fontSize,
    fontWeight: nodeAttrs["font-weight"] !== undefined ? nodeAttrs["font-weight"] : parentCtx.fontWeight,
    textAnchor: nodeAttrs["text-anchor"] !== undefined ? nodeAttrs["text-anchor"] : parentCtx.textAnchor,
    groupId: parentCtx.groupId
  };
}

function collectDefs(svgNode) {
  const gradients = new Map();
  const markers = new Map();
  function walk(node) {
    if (node.name === "lineargradient" && node.attributes.id) {
      const id = node.attributes.id.trim();
      const x1 = parseNumber(String(node.attributes.x1 || "0").replace("%", ""), 0);
      const y1 = parseNumber(String(node.attributes.y1 || "0").replace("%", ""), 0);
      const x2 = parseNumber(String(node.attributes.x2 || "100").replace("%", ""), 100);
      const y2 = parseNumber(String(node.attributes.y2 || "0").replace("%", ""), 0);
      const angleRad = Math.atan2(y2 - y1, x2 - x1);
      const angleDeg = round3(((angleRad * 180) / Math.PI + 360) % 360);
      const stops = [];
      for (const child of node.children || []) {
        if (child.name !== "stop") continue;
        const rawOffset = String(child.attributes.offset ?? "0").trim();
        const position = rawOffset.endsWith("%")
          ? clamp(parseNumber(rawOffset.slice(0, -1), 0) / 100, 0, 1)
          : clamp(parseNumber(rawOffset, 0), 0, 1);
        const stopColor = normalizeColor(child.attributes["stop-color"] || child.attributes.color, "#FFFFFF");
        if (stopColor !== "none") {
          stops.push({ position: round3(position), color: stopColor });
        }
      }
      if (stops.length >= 2) {
        gradients.set(id, { type: "linear", angleDeg, stops: stops.slice(0, 8) });
      }
    } else if (node.name === "marker" && node.attributes.id) {
      markers.set(node.attributes.id.trim(), { kind: "triangle" });
    }
    for (const child of node.children || []) {
      if (child.name !== "#text") walk(child);
    }
  }
  walk(svgNode);
  return { gradients, markers };
}

function arcToCubicCurves(x1, y1, rxInput, ryInput, angleDeg, largeArcFlag, sweepFlag, x2, y2) {
  if (Math.hypot(x2 - x1, y2 - y1) < 1e-7) return [];
  let rx = Math.abs(rxInput);
  let ry = Math.abs(ryInput);
  if (rx < 1e-7 || ry < 1e-7) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (angleDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx2 = (x1 - x2) / 2;
  const dy2 = (y1 - y2) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const rxSq = rx * rx;
  const rySq = ry * ry;
  const x1pSq = x1p * x1p;
  const y1pSq = y1p * y1p;
  let radicand = Math.max(0, (rxSq * rySq - rxSq * y1pSq - rySq * x1pSq) / (rxSq * y1pSq + rySq * x1pSq));
  let coef = Math.sqrt(radicand) * (largeArcFlag === sweepFlag ? -1 : 1);
  const cxp = coef * ((rx * y1p) / ry);
  const cyp = coef * (-(ry * x1p) / rx);
  const cx = cosPhi * cxp - sinPhi * cyp + (x1 + x2) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y1 + y2) / 2;

  const angleBetween = (ux, uy, vx, vy) => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    const cos = clamp(dot / (len || 1), -1, 1);
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    return sign * Math.acos(cos);
  };

  const theta1 = angleBetween(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dTheta = angleBetween((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweepFlag && dTheta > 0) dTheta -= 2 * Math.PI;
  else if (sweepFlag && dTheta < 0) dTheta += 2 * Math.PI;

  const segments = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
  const delta = dTheta / segments;
  const alpha = (4 / 3) * Math.tan(delta / 4);
  const curves = [];
  for (let i = 0; i < segments; i += 1) {
    const t1 = theta1 + i * delta;
    const t2 = t1 + delta;
    const cos1 = Math.cos(t1);
    const sin1 = Math.sin(t1);
    const cos2 = Math.cos(t2);
    const sin2 = Math.sin(t2);
    const p1x = cos1 - alpha * sin1;
    const p1y = sin1 + alpha * cos1;
    const p2x = cos2 + alpha * sin2;
    const p2y = sin2 - alpha * cos2;
    const ex = cos2;
    const ey = sin2;
    const mapPt = (px, py) => [
      cosPhi * rx * px - sinPhi * ry * py + cx,
      sinPhi * rx * px + cosPhi * ry * py + cy
    ];
    const [c1x, c1y] = mapPt(p1x, p1y);
    const [c2x, c2y] = mapPt(p2x, p2y);
    const [endX, endY] = mapPt(ex, ey);
    curves.push([c1x, c1y, c2x, c2y, endX, endY]);
  }
  return curves;
}

function parseSvgPathToAbsoluteCommands(d) {
  if (typeof d !== "string" || !d.trim()) throw new SvgCompileError("SVG path d attribute is empty");
  const tokens = [];
  const matcher = /([A-Za-z])|([-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)/g;
  let match;
  while ((match = matcher.exec(d)) !== null) {
    tokens.push(match[1] ? { command: match[1] } : { number: Number(match[2]) });
  }
  const commands = [];
  let idx = 0;
  let cmd = "";
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let lastCubicCtrlX = null;
  let lastCubicCtrlY = null;
  let lastQuadCtrlX = null;
  let lastQuadCtrlY = null;

  const take = (count) => {
    if (idx + count > tokens.length) throw new SvgCompileError(`Incomplete coordinates for path command ${cmd}`);
    const nums = [];
    for (let i = 0; i < count; i += 1) {
      const tok = tokens[idx++];
      if (!tok || tok.command !== undefined || !Number.isFinite(tok.number)) {
        throw new SvgCompileError(`Invalid coordinate in path command ${cmd}`);
      }
      nums.push(tok.number);
    }
    return nums;
  };

  while (idx < tokens.length) {
    if (tokens[idx].command) {
      cmd = tokens[idx++].command;
    } else if (!cmd) {
      throw new SvgCompileError("SVG path must start with a command");
    }
    const upper = cmd.toUpperCase();
    const rel = cmd !== upper;
    if (upper === "Z") {
      commands.push({ type: "close", points: [] });
      x = startX;
      y = startY;
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
      cmd = "";
      continue;
    }
    if (upper === "M") {
      const [dx, dy] = take(2);
      x = rel ? x + dx : dx;
      y = rel ? y + dy : dy;
      startX = x;
      startY = y;
      commands.push({ type: "moveTo", points: [{ x, y }] });
      cmd = rel ? "l" : "L";
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
    } else if (upper === "L") {
      const [dx, dy] = take(2);
      x = rel ? x + dx : dx;
      y = rel ? y + dy : dy;
      commands.push({ type: "lnTo", points: [{ x, y }] });
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
    } else if (upper === "H") {
      const [dx] = take(1);
      x = rel ? x + dx : dx;
      commands.push({ type: "lnTo", points: [{ x, y }] });
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
    } else if (upper === "V") {
      const [dy] = take(1);
      y = rel ? y + dy : dy;
      commands.push({ type: "lnTo", points: [{ x, y }] });
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
    } else if (upper === "C") {
      const [x1, y1, x2, y2, ex, ey] = take(6);
      const p1 = { x: rel ? x + x1 : x1, y: rel ? y + y1 : y1 };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const end = { x: rel ? x + ex : ex, y: rel ? y + ey : ey };
      commands.push({ type: "cubicBezTo", points: [p1, p2, end] });
      lastCubicCtrlX = p2.x;
      lastCubicCtrlY = p2.y;
      lastQuadCtrlX = null;
      x = end.x;
      y = end.y;
    } else if (upper === "S") {
      const [x2, y2, ex, ey] = take(4);
      const p1 = {
        x: lastCubicCtrlX !== null ? 2 * x - lastCubicCtrlX : x,
        y: lastCubicCtrlY !== null ? 2 * y - lastCubicCtrlY : y
      };
      const p2 = { x: rel ? x + x2 : x2, y: rel ? y + y2 : y2 };
      const end = { x: rel ? x + ex : ex, y: rel ? y + ey : ey };
      commands.push({ type: "cubicBezTo", points: [p1, p2, end] });
      lastCubicCtrlX = p2.x;
      lastCubicCtrlY = p2.y;
      lastQuadCtrlX = null;
      x = end.x;
      y = end.y;
    } else if (upper === "Q") {
      const [cx, cy, ex, ey] = take(4);
      const ctrl = { x: rel ? x + cx : cx, y: rel ? y + cy : cy };
      const end = { x: rel ? x + ex : ex, y: rel ? y + ey : ey };
      commands.push({ type: "quadBezTo", points: [ctrl, end] });
      lastQuadCtrlX = ctrl.x;
      lastQuadCtrlY = ctrl.y;
      lastCubicCtrlX = null;
      x = end.x;
      y = end.y;
    } else if (upper === "T") {
      const [ex, ey] = take(2);
      const ctrl = {
        x: lastQuadCtrlX !== null ? 2 * x - lastQuadCtrlX : x,
        y: lastQuadCtrlY !== null ? 2 * y - lastQuadCtrlY : y
      };
      const end = { x: rel ? x + ex : ex, y: rel ? y + ey : ey };
      commands.push({ type: "quadBezTo", points: [ctrl, end] });
      lastQuadCtrlX = ctrl.x;
      lastQuadCtrlY = ctrl.y;
      lastCubicCtrlX = null;
      x = end.x;
      y = end.y;
    } else if (upper === "A") {
      const [rx, ry, axisRot, largeArc, sweep, ex, ey] = take(7);
      const endX = rel ? x + ex : ex;
      const endY = rel ? y + ey : ey;
      const curves = arcToCubicCurves(x, y, rx, ry, axisRot, largeArc !== 0 ? 1 : 0, sweep !== 0 ? 1 : 0, endX, endY);
      for (const [c1x, c1y, c2x, c2y, tx, ty] of curves) {
        commands.push({
          type: "cubicBezTo",
          points: [{ x: c1x, y: c1y }, { x: c2x, y: c2y }, { x: tx, y: ty }]
        });
      }
      x = endX;
      y = endY;
      lastCubicCtrlX = null;
      lastQuadCtrlX = null;
    } else {
      throw new SvgCompileError(`Unsupported SVG path command: ${cmd}`);
    }
    if (commands.length > MAX_PATH_SEGMENTS) {
      throw new SvgCompileError(`SVG path exceeds ${MAX_PATH_SEGMENTS} segments`);
    }
  }
  return commands;
}

function resolveFillAndGradient(rawFill, gradients) {
  if (typeof rawFill === "string") {
    const urlMatch = /^url\(\s*#([^)\s]+)\s*\)$/i.exec(rawFill.trim());
    if (urlMatch && gradients.has(urlMatch[1])) {
      const gradient = gradients.get(urlMatch[1]);
      return { fill: gradient.stops[0].color, gradient };
    }
  }
  return { fill: normalizeColor(rawFill, "#000000"), gradient: null };
}

function hasArrowMarker(attrValue, markers) {
  if (typeof attrValue !== "string" || !attrValue.trim()) return false;
  if (attrValue === "triangle" || attrValue === "arrow") return true;
  const urlMatch = /^url\(\s*#([^)\s]+)\s*\)$/i.exec(attrValue.trim());
  return Boolean(urlMatch && (markers.has(urlMatch[1]) || /arrow|triangle/i.test(urlMatch[1])));
}

function shapeReconstructionContract(svgDigest, zOrderRole = "foreground") {
  return {
    contractVersion: "1.0",
    family: "geometry",
    realization: "native_shape",
    sourceSufficiency: "sufficient",
    boundaryState: "complete",
    zOrderRole,
    reconstructedPixels: false,
    svgSha256: svgDigest
  };
}

function textReconstructionContract(svgDigest) {
  return {
    contractVersion: "1.0",
    family: "text",
    realization: "native_text",
    sourceSufficiency: "sufficient",
    boundaryState: "complete",
    zOrderRole: "foreground",
    reconstructedPixels: false,
    svgSha256: svgDigest
  };
}

function estimateTextWidthPt(text, fontSizePt) {
  let units = 0;
  for (const ch of String(text || "")) {
    const code = ch.codePointAt(0) || 0;
    units += code > 0x2E80 ? 1.04 : /[A-Z0-9]/.test(ch) ? 0.68 : 0.56;
  }
  return Math.max(fontSizePt * 1.2, units * fontSizePt + 8);
}

function compileSvgToPageIr(svgSource, options = {}) {
  const pageIndex = Number.isInteger(options.pageIndex) && options.pageIndex >= 0 ? options.pageIndex : 0;
  const svgDigest = sha256(Buffer.from(String(svgSource), "utf8"));
  const svgRoot = parseXmlTree(svgSource);
  const viewBox = parseViewBox(svgRoot);
  const slideWidthPt = options.slideSize?.widthPt || DEFAULT_SLIDE_WIDTH_PT;
  const slideHeightPt = options.slideSize?.heightPt || DEFAULT_SLIDE_HEIGHT_PT;
  const scaleX = slideWidthPt / viewBox.width;
  const scaleY = slideHeightPt / viewBox.height;
  const scaleAvg = (scaleX + scaleY) / 2;

  const { gradients, markers } = collectDefs(svgRoot);
  const shapes = [];
  const textBoxes = [];
  const editGroups = new Map();
  const usedIds = new Set();

  let backgroundFill = "#FFFFFF";
  let itemCounter = 0;

  function uniqueId(candidate, prefix) {
    itemCounter += 1;
    let id = safeId(candidate, `${prefix}-${pageIndex + 1}-${itemCounter}`);
    while (usedIds.has(id)) {
      itemCounter += 1;
      id = `${prefix}-${pageIndex + 1}-${itemCounter}`;
    }
    usedIds.add(id);
    return id;
  }

  function registerInGroup(groupId, kind, elementId) {
    if (!groupId) return;
    if (!editGroups.has(groupId)) {
      editGroups.set(groupId, { id: groupId, shapeIds: [], textBoxIds: [], imageIds: [] });
    }
    const group = editGroups.get(groupId);
    if (kind === "shape") group.shapeIds.push(elementId);
    else if (kind === "text") group.textBoxIds.push(elementId);
  }

  function toSlideX(svgX, ctx) {
    return (svgX * ctx.sx + ctx.tx - viewBox.x) * scaleX;
  }
  function toSlideY(svgY, ctx) {
    return (svgY * ctx.sy + ctx.ty - viewBox.y) * scaleY;
  }
  function toSlideW(svgW, ctx) {
    return Math.abs(svgW * ctx.sx) * scaleX;
  }
  function toSlideH(svgH, ctx) {
    return Math.abs(svgH * ctx.sy) * scaleY;
  }

  function buildStrokeAndFillStyle(attrs, ctx, defaultFill = "#000000") {
    const rawFill = attrs.fill !== undefined ? attrs.fill : ctx.fill !== undefined ? ctx.fill : defaultFill;
    const rawStroke = attrs.stroke !== undefined ? attrs.stroke : ctx.stroke !== undefined ? ctx.stroke : "none";
    const { fill, gradient } = resolveFillAndGradient(rawFill, gradients);
    const stroke = normalizeColor(rawStroke, "none");
    const rawStrokeWidth = parseNumber(attrs["stroke-width"] ?? ctx.strokeWidth, stroke === "none" ? 0 : 1);
    const strokeWidthPt = stroke === "none" ? 0 : round3(Math.max(0, rawStrokeWidth * (( Math.abs(ctx.sx) + Math.abs(ctx.sy) ) / 2) * scaleAvg));
    const dashArray = attrs["stroke-dasharray"] ?? ctx.strokeDasharray;
    const isDashed = typeof dashArray === "string" && dashArray.trim() !== "" && dashArray.trim().toLowerCase() !== "none";
    const fillOpacity = clamp(parseNumber(attrs["fill-opacity"], 1), 0, 1);
    const strokeOpacity = clamp(parseNumber(attrs["stroke-opacity"], 1), 0, 1);
    const combinedOpacity = round3(clamp(ctx.opacity * Math.min(fillOpacity, strokeOpacity), 0, 1));
    const style = {
      fill: fillOpacity <= 0 ? "none" : fill,
      stroke: strokeOpacity <= 0 ? "none" : stroke,
      strokeWidthPt,
      ...(gradient ? { gradient } : {}),
      ...(isDashed ? { dash: "dash" } : {}),
      ...(combinedOpacity < 1 ? { opacity: combinedOpacity } : {}),
      ...(Math.abs(ctx.rot) > 0.001 ? { rotationDeg: round3(ctx.rot) } : {})
    };
    return style;
  }

  function walk(node, parentCtx, isFirstRootChild = false) {
    if (!node || node.name === "#text" || node.name === "defs" || node.name === "title" || node.name === "desc" || node.name === "metadata" || node.name === "style") {
      return;
    }
    const attrs = node.attributes || Object.create(null);
    if (attrs.display === "none" || attrs.visibility === "hidden") return;

    const ctx = composeContext(parentCtx, attrs);
    if (node.name === "svg") {
      const children = (node.children || []).filter((c) => c.name !== "#text" && c.name !== "defs");
      children.forEach((child, idx) => walk(child, ctx, idx === 0));
      return;
    }

    if (node.name === "g") {
      const rawGroupId = attrs.id || attrs["data-group-id"];
      const groupId = rawGroupId ? uniqueId(rawGroupId, "group") : ctx.groupId;
      const nextCtx = { ...ctx, groupId };
      for (const child of node.children || []) {
        walk(child, nextCtx, false);
      }
      return;
    }

    if (node.name === "rect") {
      const x = toSlideX(parseNumber(attrs.x, 0), ctx);
      const y = toSlideY(parseNumber(attrs.y, 0), ctx);
      const w = toSlideW(parseNumber(attrs.width, 0), ctx);
      const h = toSlideH(parseNumber(attrs.height, 0), ctx);
      if (w <= 0 || h <= 0) return;
      const rx = toSlideW(parseNumber(attrs.rx, 0), ctx);
      const ry = toSlideH(parseNumber(attrs.ry, parseNumber(attrs.rx, 0)), ctx);
      const radiusPt = round3(Math.max(rx, ry));
      const style = buildStrokeAndFillStyle(attrs, ctx, "#000000");

      // Recognize full-bleed background rectangle
      if (
        isFirstRootChild &&
        shapes.length === 0 &&
        textBoxes.length === 0 &&
        Math.abs(x) <= 2 &&
        Math.abs(y) <= 2 &&
        Math.abs(w - slideWidthPt) <= 4 &&
        Math.abs(h - slideHeightPt) <= 4 &&
        radiusPt <= 1 &&
        !style.gradient &&
        style.fill !== "none"
      ) {
        backgroundFill = style.fill;
        return;
      }

      const id = uniqueId(attrs.id, "rect");
      const type = radiusPt > 0.5 ? "roundRect" : "rect";
      if (type === "roundRect") style.radiusPt = radiusPt;
      shapes.push({
        id,
        type,
        box: { x: round3(x), y: round3(y), w: round3(w), h: round3(h) },
        style,
        source: {
          svgElement: "rect",
          ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
          reconstruction: shapeReconstructionContract(svgDigest, w * h > slideWidthPt * slideHeightPt * 0.15 ? "base" : "foreground")
        }
      });
      registerInGroup(ctx.groupId, "shape", id);
      return;
    }

    if (node.name === "circle" || node.name === "ellipse") {
      const cx = parseNumber(attrs.cx, 0);
      const cy = parseNumber(attrs.cy, 0);
      const rx = node.name === "circle" ? parseNumber(attrs.r, 0) : parseNumber(attrs.rx, 0);
      const ry = node.name === "circle" ? rx : parseNumber(attrs.ry, 0);
      if (rx <= 0 || ry <= 0) return;
      const x = toSlideX(cx - rx, ctx);
      const y = toSlideY(cy - ry, ctx);
      const w = toSlideW(rx * 2, ctx);
      const h = toSlideH(ry * 2, ctx);
      const id = uniqueId(attrs.id, "ellipse");
      const style = buildStrokeAndFillStyle(attrs, ctx, "#000000");
      shapes.push({
        id,
        type: "ellipse",
        box: { x: round3(x), y: round3(y), w: round3(w), h: round3(h) },
        style,
        source: {
          svgElement: node.name,
          ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
          reconstruction: shapeReconstructionContract(svgDigest)
        }
      });
      registerInGroup(ctx.groupId, "shape", id);
      return;
    }

    if (node.name === "line") {
      const x1 = toSlideX(parseNumber(attrs.x1, 0), ctx);
      const y1 = toSlideY(parseNumber(attrs.y1, 0), ctx);
      const x2 = toSlideX(parseNumber(attrs.x2, 0), ctx);
      const y2 = toSlideY(parseNumber(attrs.y2, 0), ctx);
      const style = buildStrokeAndFillStyle(attrs, ctx, "none");
      style.fill = "none";
      if (style.stroke === "none") style.stroke = "#64748B";
      if (!style.strokeWidthPt || style.strokeWidthPt <= 0) style.strokeWidthPt = 1.5;
      if (hasArrowMarker(attrs["marker-start"] || attrs["data-start-arrow"], markers)) style.startArrow = "triangle";
      if (hasArrowMarker(attrs["marker-end"] || attrs["data-end-arrow"], markers)) style.endArrow = "triangle";
      style.connectorType = "straight";
      if (x2 < x1) style.flipH = true;
      if (y2 < y1) style.flipV = true;

      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const w = Math.max(0.5, Math.abs(x2 - x1));
      const h = Math.max(0.5, Math.abs(y2 - y1));
      const id = uniqueId(attrs.id, "line");
      shapes.push({
        id,
        type: "line",
        box: { x: round3(left), y: round3(top), w: round3(w), h: round3(h) },
        style,
        source: {
          svgElement: "line",
          ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
          reconstruction: shapeReconstructionContract(svgDigest)
        }
      });
      registerInGroup(ctx.groupId, "shape", id);
      return;
    }

    if (node.name === "polygon" || node.name === "polyline" || node.name === "path") {
      let commands;
      if (node.name === "path") {
        if (!attrs.d) return;
        commands = parseSvgPathToAbsoluteCommands(attrs.d);
      } else {
        const rawPoints = String(attrs.points || "").trim().split(/[\s,]+/).filter(Boolean).map(Number);
        if (rawPoints.length < 4 || rawPoints.length % 2 !== 0 || rawPoints.some((n) => !Number.isFinite(n))) return;
        commands = [{ type: "moveTo", points: [{ x: rawPoints[0], y: rawPoints[1] }] }];
        for (let i = 2; i < rawPoints.length; i += 2) {
          commands.push({ type: "lnTo", points: [{ x: rawPoints[i], y: rawPoints[i + 1] }] });
        }
        if (node.name === "polygon") commands.push({ type: "close", points: [] });
      }

      const slideCommands = commands.map((cmd) => ({
        type: cmd.type,
        points: cmd.points.map((pt) => ({
          x: toSlideX(pt.x, ctx),
          y: toSlideY(pt.y, ctx)
        }))
      }));

      const allPts = slideCommands.flatMap((cmd) => cmd.points);
      if (allPts.length === 0) return;

      const defaultFill = node.name === "polyline" ? "none" : "#000000";
      const style = buildStrokeAndFillStyle(attrs, ctx, defaultFill);
      const startArrow = hasArrowMarker(attrs["marker-start"] || attrs["data-start-arrow"], markers);
      const endArrow = hasArrowMarker(attrs["marker-end"] || attrs["data-end-arrow"], markers);

      // If this is a simple 2-point straight open path with arrows/stroke, emit a native line connector
      if (
        slideCommands.length === 2 &&
        slideCommands[0].type === "moveTo" &&
        slideCommands[1].type === "lnTo" &&
        style.fill === "none"
      ) {
        const p1 = slideCommands[0].points[0];
        const p2 = slideCommands[1].points[0];
        if (startArrow) style.startArrow = "triangle";
        if (endArrow) style.endArrow = "triangle";
        style.connectorType = "straight";
        if (p2.x < p1.x) style.flipH = true;
        if (p2.y < p1.y) style.flipV = true;
        const id = uniqueId(attrs.id, "line");
        shapes.push({
          id,
          type: "line",
          box: {
            x: round3(Math.min(p1.x, p2.x)),
            y: round3(Math.min(p1.y, p2.y)),
            w: round3(Math.max(0.5, Math.abs(p2.x - p1.x))),
            h: round3(Math.max(0.5, Math.abs(p2.y - p1.y)))
          },
          style,
          source: {
            svgElement: node.name,
            ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
            reconstruction: shapeReconstructionContract(svgDigest)
          }
        });
        registerInGroup(ctx.groupId, "shape", id);
        return;
      }

      const minX = Math.min(...allPts.map((p) => p.x));
      const maxX = Math.max(...allPts.map((p) => p.x));
      const minY = Math.min(...allPts.map((p) => p.y));
      const maxY = Math.max(...allPts.map((p) => p.y));
      const w = Math.max(1, maxX - minX);
      const h = Math.max(1, maxY - minY);

      const freeformSegments = slideCommands.map((cmd) => ({
        type: cmd.type,
        points: cmd.points.map((pt) => ({
          x: round3(clamp((pt.x - minX) / w, 0, 1)),
          y: round3(clamp((pt.y - minY) / h, 0, 1))
        }))
      }));

      const isClosed = freeformSegments.some((s) => s.type === "close");
      style.closePath = isClosed;
      style.freeformSegments = freeformSegments;
      if (startArrow) style.startArrow = "triangle";
      if (endArrow) style.endArrow = "triangle";

      const id = uniqueId(attrs.id, "path");
      shapes.push({
        id,
        type: "freeform",
        box: { x: round3(minX), y: round3(minY), w: round3(w), h: round3(h) },
        style,
        source: {
          svgElement: node.name,
          ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
          reconstruction: shapeReconstructionContract(svgDigest)
        }
      });
      registerInGroup(ctx.groupId, "shape", id);
      return;
    }

    if (node.name === "text") {
      const baseX = parseNumber(attrs.x, 0);
      const baseY = parseNumber(attrs.y, 0);
      const rawFontSize = parseNumber(attrs["font-size"] ?? ctx.fontSize, 16);
      const fontSizePt = round3(clamp(rawFontSize * ((Math.abs(ctx.sx) + Math.abs(ctx.sy)) / 2) * scaleAvg, 6, 160));
      const rawFamily = String(attrs["font-family"] ?? ctx.fontFamily ?? "Microsoft YaHei")
        .split(",")[0]
        .replace(/["']/g, "")
        .trim() || "Microsoft YaHei";
      const rawWeight = String(attrs["font-weight"] ?? ctx.fontWeight ?? "normal").toLowerCase();
      const weight = rawWeight === "bold" || Number(rawWeight) >= 600 ? "bold" : "normal";
      const color = normalizeColor(attrs.fill ?? ctx.fill, "#111827");
      const anchorRaw = String(attrs["text-anchor"] ?? ctx.textAnchor ?? "start").toLowerCase();
      const align = anchorRaw === "middle" ? "center" : anchorRaw === "end" ? "right" : "left";

      const lines = [];
      let currentLine = [];
      for (const child of node.children || []) {
        if (child.name === "#text") {
          const t = child.text.replace(/\s+/g, " ");
          if (t.trim()) currentLine.push({ text: t.trim(), font: { family: rawFamily, sizePt: fontSizePt, weight, color } });
        } else if (child.name === "tspan") {
          const spanText = (child.children || [])
            .filter((c) => c.name === "#text")
            .map((c) => c.text)
            .join("")
            .trim();
          if (!spanText) continue;
          const dy = parseNumber(child.attributes.dy, 0);
          const hasNewY = child.attributes.y !== undefined && Math.abs(parseNumber(child.attributes.y, baseY) - baseY) > 1;
          if ((dy > 0 || hasNewY) && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [];
          }
          const spanSize = child.attributes["font-size"]
            ? round3(clamp(parseNumber(child.attributes["font-size"], rawFontSize) * scaleAvg, 6, 160))
            : fontSizePt;
          const spanWeightRaw = String(child.attributes["font-weight"] ?? rawWeight).toLowerCase();
          const spanWeight = spanWeightRaw === "bold" || Number(spanWeightRaw) >= 600 ? "bold" : "normal";
          const spanColor = normalizeColor(child.attributes.fill ?? color, color);
          currentLine.push({
            text: spanText,
            font: { family: rawFamily, sizePt: spanSize, weight: spanWeight, color: spanColor }
          });
        }
      }
      if (currentLine.length > 0) lines.push(currentLine);
      if (lines.length === 0) return;

      const fullText = lines.map((line) => line.map((r) => r.text).join("")).join("\n");
      const maxLineWidthPt = Math.max(
        ...lines.map((line) =>
          line.reduce((sum, r) => sum + estimateTextWidthPt(r.text, r.font.sizePt), 0)
        )
      );
      const boxW = round3(clamp( parseNumber(attrs.width, 0) * scaleX || maxLineWidthPt, 20, slideWidthPt ));
      const lineHeightPt = fontSizePt * 1.32;
      const boxH = round3(Math.max(fontSizePt * 1.4, lines.length * lineHeightPt + 4));

      const anchorX = toSlideX(baseX, ctx);
      const anchorY = toSlideY(baseY, ctx);
      const boxX = round3(
        clamp(
          align === "center" ? anchorX - boxW / 2 : align === "right" ? anchorX - boxW : anchorX,
          0,
          Math.max(0, slideWidthPt - boxW)
        )
      );
      const baselineOffset = fontSizePt * 0.85;
      const boxY = round3(clamp(anchorY - baselineOffset, 0, Math.max(0, slideHeightPt - boxH)));

      const id = uniqueId(attrs.id, "text");
      const flatRuns = [];
      lines.forEach((line, lineIdx) => {
        line.forEach((r, runIdx) => {
          flatRuns.push({
            text: lineIdx < lines.length - 1 && runIdx === line.length - 1 ? `${r.text}\n` : r.text,
            font: r.font
          });
        });
      });

      textBoxes.push({
        id,
        text: fullText,
        box: { x: boxX, y: boxY, w: boxW, h: boxH },
        font: {
          family: rawFamily,
          latinFamily: "Segoe UI",
          eastAsianFamily: rawFamily,
          sizePt: fontSizePt,
          weight,
          color: color === "none" ? "#111827" : color,
          align,
          valign: "middle"
        },
        ...(flatRuns.length > 1 ? { runs: flatRuns } : {}),
        ...(Math.abs(ctx.rot) > 0.001 ? { rotation: round3(ctx.rot) } : {}),
        style: {
          wrap: lines.length > 1,
          marginLeftPt: 2,
          marginRightPt: 2,
          marginTopPt: 1,
          marginBottomPt: 1
        },
        source: {
          svgElement: "text",
          ...(ctx.groupId ? { nativeComponentGroupId: ctx.groupId } : {}),
          reconstruction: textReconstructionContract(svgDigest)
        }
      });
      registerInGroup(ctx.groupId, "text", id);
    }
  }

  const initialCtx = {
    tx: 0,
    ty: 0,
    sx: 1,
    sy: 1,
    rot: 0,
    opacity: 1,
    fill: undefined,
    stroke: undefined,
    strokeWidth: undefined,
    strokeDasharray: undefined,
    fontFamily: undefined,
    fontSize: undefined,
    fontWeight: undefined,
    textAnchor: undefined,
    groupId: null
  };

  walk(svgRoot, initialCtx, false);

  if (shapes.length === 0 && textBoxes.length === 0) {
    throw new SvgCompileError("SVG did not produce any editable shapes or textBoxes");
  }

  const page = {
    pageIndex,
    ...(options.sourceImage ? { sourceImage: options.sourceImage } : {}),
    background: { fill: backgroundFill },
    shapes,
    textBoxes,
    images: [],
    tables: [],
    charts: [],
    icons: [],
    reconstruction: {
      contractVersion: "1.0",
      canonicalPageSha256: svgDigest,
      canonicalCanvas: {
        widthPx: clamp(Math.round(viewBox.width), 1, 16384),
        heightPx: clamp(Math.round(viewBox.height), 1, 16384),
        sha256: svgDigest,
        slideWidthPt,
        slideHeightPt
      },
      allowCanonicalMedia: false,
      qualityBudget: {
        contractVersion: "1.0",
        policy: "editable-first",
        passed: true,
        reasonCodes: ["quality.editable-budget-passed"],
        metrics: {
          residualCount: 0,
          residualAreaRatio: 0,
          largestResidualAreaRatio: 0,
          nativeObjectCount: shapes.length + textBoxes.length,
          imageCount: 0
        }
      }
    }
  };

  return {
    slideSize: { widthPt: slideWidthPt, heightPt: slideHeightPt },
    page,
    svgSha256: svgDigest
  };
}

function compileSvgToDeckIr(svgSources, options = {}) {
  const inputs = Array.isArray(svgSources) ? svgSources : [svgSources];
  if (inputs.length < 1 || inputs.length > MAX_SVG_PAGES) {
    throw new SvgCompileError(`SVG deck requires 1 to ${MAX_SVG_PAGES} pages`);
  }
  const slideSize = {
    widthPt: options.slideSize?.widthPt || DEFAULT_SLIDE_WIDTH_PT,
    heightPt: options.slideSize?.heightPt || DEFAULT_SLIDE_HEIGHT_PT
  };
  const pages = inputs.map((svg, index) => {
    const compiled = compileSvgToPageIr(svg, { ...options, pageIndex: index, slideSize });
    return compiled.page;
  });
  return {
    version: "1.0",
    meta: {
      source: "svg-to-editable",
      reconstructionMode: "native-only",
      svgPageCount: pages.length
    },
    slideSize,
    pages
  };
}

function compileSvgFilesToDeckIr(svgFiles, options = {}) {
  const files = Array.isArray(svgFiles) ? svgFiles : [svgFiles];
  if (files.length < 1 || files.length > MAX_SVG_PAGES) {
    throw new SvgCompileError(`SVG file batch requires 1 to ${MAX_SVG_PAGES} files`);
  }
  const sources = files.map((file) => {
    if (typeof file !== "string" || !path.isAbsolute(file) || path.extname(file).toLowerCase() !== ".svg") {
      throw new SvgCompileError("SVG input must be an absolute .svg file path");
    }
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size < 10 || stat.size > MAX_SVG_INPUT_BYTES) {
      throw new SvgCompileError("SVG input file is invalid or exceeds size limits");
    }
    return fs.readFileSync(file, "utf8");
  });
  return compileSvgToDeckIr(sources, options);
}

module.exports = {
  DEFAULT_SLIDE_HEIGHT_PT,
  DEFAULT_SLIDE_WIDTH_PT,
  MAX_SVG_INPUT_BYTES,
  MAX_SVG_PAGES,
  SvgCompileError,
  compileSvgFilesToDeckIr,
  compileSvgToDeckIr,
  compileSvgToPageIr,
  parseSvgPathToAbsoluteCommands
};
