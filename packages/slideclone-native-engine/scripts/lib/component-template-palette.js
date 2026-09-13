"use strict";

function paletteFromMatch(match = {}, fallback = {}) {
  const colors = sanitizedPaletteColors(match.topColors);
  const neutrals = colors.filter((color) => isNearGray(color) && !isNearWhite(color) && !isNearBlack(color));
  const accents = colors.filter((color) => !isNearWhite(color) && !isNearBlack(color) && !isNearGray(color)).slice(0, 4);
  const fallbackAccents = Array.isArray(fallback.accents) ? fallback.accents : ["#2F80ED"];
  const safeAccents = accents.length ? accents : fallbackAccents;
  return {
    accents: safeAccents,
    neutral: neutrals[0] || fallback.neutral || safeAccents[0],
    softFills: deriveSoftFills(safeAccents, fallback.softFills)
  };
}

function sanitizedPaletteColors(topColors = []) {
  return (Array.isArray(topColors) ? topColors : [])
    .map((entry) => safeColor(entry?.value))
    .filter(Boolean)
    .slice(0, 8);
}

function deriveSoftFills(accents = [], fallbackFills = []) {
  const fills = accents.map((color) => mixColor(color, "#FFFFFF", 0.86)).filter(Boolean);
  const fallback = Array.isArray(fallbackFills) && fallbackFills.length ? fallbackFills : ["#F8FAFC"];
  return fills.length ? fills : fallback;
}

function paletteSummary(match = {}) {
  const colors = sanitizedPaletteColors(match.topColors);
  return colors.length ? colors : null;
}

function mixColor(color, other, otherWeight) {
  const a = hexToRgb(color);
  const b = hexToRgb(other);
  if (!a || !b) return "";
  const weight = clampNumber(otherWeight, 0, 1, 0.5);
  return rgbToHex({
    r: a.r * (1 - weight) + b.r * weight,
    g: a.g * (1 - weight) + b.g * weight,
    b: a.b * (1 - weight) + b.b * weight
  });
}

function isNearWhite(color) {
  const rgb = hexToRgb(color);
  return rgb ? rgb.r >= 238 && rgb.g >= 238 && rgb.b >= 238 : false;
}

function isNearBlack(color) {
  const rgb = hexToRgb(color);
  return rgb ? rgb.r <= 32 && rgb.g <= 32 && rgb.b <= 32 : false;
}

function isNearGray(color) {
  const rgb = hexToRgb(color);
  if (!rgb) return false;
  return Math.max(rgb.r, rgb.g, rgb.b) - Math.min(rgb.r, rgb.g, rgb.b) <= 18;
}

function hexToRgb(color) {
  const text = safeColor(color).slice(1);
  if (!text) return null;
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  };
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((value) => {
    const number = clampInteger(Math.round(value), 0, 255);
    return number.toString(16).toUpperCase().padStart(2, "0");
  }).join("")}`;
}

function clampInteger(value, min, max) {
  return Math.round(clampNumber(value, min, max, min));
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function safeColor(value) {
  const text = safeText(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : "";
}

function safeText(value) {
  let result = "";
  for (const character of String(value ?? "")) {
    const code = character.codePointAt(0);
    if (code > 0x1f && code !== 0x7f) result += character;
  }
  return result.trim().slice(0, 120);
}

module.exports = {
  deriveSoftFills,
  hexToRgb,
  isNearBlack,
  isNearGray,
  isNearWhite,
  mixColor,
  paletteFromMatch,
  paletteSummary,
  rgbToHex,
  sanitizedPaletteColors
};
