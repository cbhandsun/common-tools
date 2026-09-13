// @ts-check
"use strict";

/**
 * @typedef {Object} BrandPalette
 * @property {string} primary
 * @property {string} secondary
 * @property {string} accent
 * @property {string} background
 * @property {string} surface
 * @property {string} textPrimary
 * @property {string} textMuted
 */

/**
 * @typedef {Object} BrandTypography
 * @property {string} headingFont
 * @property {string} bodyFont
 */

/**
 * @typedef {Object} BrandKit
 * @property {string} id
 * @property {string} name
 * @property {BrandPalette} palette
 * @property {BrandTypography} typography
 */

const DEFAULT_BRAND_ID = "default_brand";
const DEFAULT_BRAND_NAME = "Default Brand";
const DEFAULT_FONT_FAMILY = "Microsoft YaHei";
const MAX_BRAND_TEXT_LENGTH = 120;
const MAX_FONT_FAMILY_LENGTH = 180;
const HEX_COLOR_RE = /^#?(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

const DEFAULT_PALETTE = Object.freeze({
  primary: "#0969DA",
  secondary: "#1F2328",
  accent: "#2DA44E",
  background: "#FFFFFF",
  surface: "#F6F8FA",
  textPrimary: "#1F2328",
  textMuted: "#656D76"
});

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function hasLineBreakOrNul(value) {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === 0 || code === 10 || code === 13) return true;
  }
  return false;
}

/**
 * @param {unknown} value
 * @param {string} label
 * @param {{ defaultValue?: string, maxLength?: number }} [options]
 * @returns {string}
 */
function normalizeBoundedSingleLineString(value, label, options = {}) {
  if (value === undefined || value === null) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    throw new TypeError(`${label} must be a string`);
  }
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value.trim();
  if (!text) {
    if (options.defaultValue !== undefined) return options.defaultValue;
    throw new TypeError(`${label} must not be empty`);
  }
  if (hasLineBreakOrNul(text)) throw new TypeError(`${label} must be a single-line string`);
  const maxLength = options.maxLength ?? MAX_BRAND_TEXT_LENGTH;
  if (text.length > maxLength) throw new TypeError(`${label} must be at most ${maxLength} characters`);
  return text;
}

/**
 * Normalize hex color to #RRGGBB.
 * @param {unknown} value
 * @param {string} label
 * @returns {string}
 */
function normalizeHexColor(value, label) {
  if (typeof value !== "string") throw new TypeError(`${label} must be a hex color`);
  const trimmed = value.trim();
  if (!HEX_COLOR_RE.test(trimmed)) throw new TypeError(`${label} must be a #RGB or #RRGGBB hex color`);
  const cleaned = trimmed.replace(/^#/, "");
  const expanded = cleaned.length === 3
    ? `${cleaned[0]}${cleaned[0]}${cleaned[1]}${cleaned[1]}${cleaned[2]}${cleaned[2]}`
    : cleaned;
  return `#${expanded.toUpperCase()}`;
}

/**
 * Parse hex color (#RRGGBB or #RGB) into RGB triplet.
 * @param {unknown} value
 * @returns {{ r: number, g: number, b: number } | null}
 */
function parseHexColor(value) {
  if (typeof value !== "string") return null;
  if (!HEX_COLOR_RE.test(value.trim())) return null;
  const cleaned = normalizeHexColor(value, "color").slice(1);
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b };
}

/**
 * Calculate perceptual luminance of an sRGB color (0.0 to 1.0).
 * @param {{ r: number, g: number, b: number }} rgb
 * @returns {number}
 */
function calculateLuminance(rgb) {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/**
 * Calculate Euclidean color distance between two RGB colors.
 * @param {{ r: number, g: number, b: number }} c1
 * @param {{ r: number, g: number, b: number }} c2
 * @returns {number}
 */
function colorDistance(c1, c2) {
  return Math.hypot(c1.r - c2.r, c1.g - c2.g, c1.b - c2.b);
}

/**
 * Validate and normalize a BrandKit specification.
 * @param {unknown} value
 * @param {string} [label]
 * @returns {BrandKit}
 */
function assertBrandKit(value, label = "brand kit") {
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const raw = /** @type {Record<string, unknown>} */ (value);
  const id = normalizeBoundedSingleLineString(raw.id, `${label}.id`, { defaultValue: DEFAULT_BRAND_ID });
  const name = normalizeBoundedSingleLineString(raw.name, `${label}.name`, { defaultValue: DEFAULT_BRAND_NAME });

  if (!isPlainObject(raw.palette)) {
    throw new TypeError(`${label}.palette must be an object`);
  }
  const p = /** @type {Record<string, unknown>} */ (raw.palette);
  /**
   * @param {keyof BrandPalette} key
   * @returns {string}
   */
  const normalizePaletteField = (key) => (
    p[key] === undefined || p[key] === null
      ? DEFAULT_PALETTE[key]
      : normalizeHexColor(p[key], `${label}.palette.${key}`)
  );
  const primary = normalizePaletteField("primary");
  const secondary = normalizePaletteField("secondary");
  const accent = normalizePaletteField("accent");
  const background = normalizePaletteField("background");
  const surface = normalizePaletteField("surface");
  const textPrimary = normalizePaletteField("textPrimary");
  const textMuted = normalizePaletteField("textMuted");

  if (raw.typography !== undefined && raw.typography !== null && !isPlainObject(raw.typography)) {
    throw new TypeError(`${label}.typography must be an object`);
  }
  const t = isPlainObject(raw.typography) ? raw.typography : {};
  const headingFont = normalizeBoundedSingleLineString(t.headingFont, `${label}.typography.headingFont`, {
    defaultValue: DEFAULT_FONT_FAMILY,
    maxLength: MAX_FONT_FAMILY_LENGTH
  });
  const bodyFont = normalizeBoundedSingleLineString(t.bodyFont, `${label}.typography.bodyFont`, {
    defaultValue: DEFAULT_FONT_FAMILY,
    maxLength: MAX_FONT_FAMILY_LENGTH
  });

  return Object.freeze({
    id,
    name,
    palette: Object.freeze({
      primary,
      secondary,
      accent,
      background,
      surface,
      textPrimary,
      textMuted
    }),
    typography: Object.freeze({
      headingFont,
      bodyFont
    })
  });
}

/**
 * Remap a source color to the most harmonized color in the target brand palette.
 * @param {string} sourceColor
 * @param {BrandPalette} palette
 * @param {boolean} [isText]
 * @returns {string}
 */
function retargetColor(sourceColor, palette, isText = false) {
  const rgb = parseHexColor(sourceColor);
  if (!rgb) return sourceColor;

  const lum = calculateLuminance(rgb);

  // For text, preserve high contrast readability
  if (isText) {
    if (lum < 0.4) {
      return palette.textPrimary;
    } else if (lum < 0.7) {
      return palette.textMuted;
    } else {
      return "#FFFFFF";
    }
  }

  // Very light colors -> surface or background
  if (lum > 0.92) {
    return palette.background;
  }
  if (lum > 0.8) {
    return palette.surface;
  }

  // Dark or colored elements -> match closest brand primary, secondary, or accent
  const candidateFills = [palette.primary, palette.secondary, palette.accent];
  let closest = palette.primary;
  let minDistance = Infinity;

  for (const cand of candidateFills) {
    const candRgb = parseHexColor(cand);
    if (!candRgb) continue;
    const dist = colorDistance(rgb, candRgb);
    if (dist < minDistance) {
      minDistance = dist;
      closest = cand;
    }
  }

  return closest;
}

/**
 * Apply BrandKit styling and theme retargeting across a collection of shapes and textBoxes.
 * @param {readonly unknown[]} shapes
 * @param {readonly unknown[]} textBoxes
 * @param {unknown} brandKit
 * @returns {Readonly<{ shapes: readonly Record<string, unknown>[], textBoxes: readonly Record<string, unknown>[] }>}
 */
function applyBrandKitStyling(shapes, textBoxes, brandKit) {
  const kit = assertBrandKit(brandKit);

  const retargetedShapes = (Array.isArray(shapes) ? shapes : []).map((s) => {
    if (!s || typeof s !== "object" || Array.isArray(s)) return s;
    const raw = { .../** @type {Record<string, unknown>} */ (s) };
    if (typeof raw.fill === "string") {
      raw.fill = retargetColor(raw.fill, kit.palette, false);
    }
    if (typeof raw.stroke === "string") {
      raw.stroke = retargetColor(raw.stroke, kit.palette, false);
    }
    return Object.freeze(raw);
  });

  const retargetedTextBoxes = (Array.isArray(textBoxes) ? textBoxes : []).map((t) => {
    if (!t || typeof t !== "object" || Array.isArray(t)) return t;
    const raw = { .../** @type {Record<string, unknown>} */ (t) };
    const role = typeof raw.role === "string" ? raw.role : "body";
    const isHeading = role === "title" || role === "header" || role === "section";

    const currentFont = raw.font && typeof raw.font === "object" ? /** @type {Record<string, unknown>} */ (raw.font) : {};
    const currentColor = typeof currentFont.color === "string" ? currentFont.color : "#1F2328";

    raw.font = {
      ...currentFont,
      fontFamily: isHeading ? kit.typography.headingFont : kit.typography.bodyFont,
      color: retargetColor(currentColor, kit.palette, true)
    };
    return Object.freeze(raw);
  });

  return Object.freeze({
    shapes: Object.freeze(retargetedShapes),
    textBoxes: Object.freeze(retargetedTextBoxes)
  });
}

module.exports = {
  applyBrandKitStyling,
  assertBrandKit,
  calculateLuminance,
  colorDistance,
  parseHexColor,
  retargetColor
};
