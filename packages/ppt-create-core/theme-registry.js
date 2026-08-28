"use strict";

const REQUIRED_COLOR_KEYS = Object.freeze(["background", "surface", "primary", "accent", "text", "muted", "line", "inverse"]);
const COLOR_PATTERN = /^#[0-9A-F]{6}$/u;

function freezeTheme(id, name, tokens) {
  return Object.freeze({ id, name, tokens: Object.freeze({ ...tokens }) });
}

const THEME_REGISTRY = Object.freeze([
  freezeTheme("clean-light-v1", "Clean Light", { background: "#F7F9FC", surface: "#FFFFFF", primary: "#175CD3", accent: "#0E9384", text: "#101828", muted: "#475467", line: "#D0D5DD", inverse: "#FFFFFF", font: "Microsoft YaHei" }),
  freezeTheme("executive-dark-v1", "Executive Dark", { background: "#101828", surface: "#1D2939", primary: "#84ADFF", accent: "#5FE9D0", text: "#F9FAFB", muted: "#D0D5DD", line: "#344054", inverse: "#101828", font: "Microsoft YaHei" }),
  freezeTheme("editorial-warm-v1", "Editorial Warm", { background: "#FBF7F0", surface: "#FFFDFC", primary: "#9A3412", accent: "#B7791F", text: "#292524", muted: "#57534E", line: "#D6D3D1", inverse: "#FFFFFF", font: "Microsoft YaHei" }),
  freezeTheme("technical-blue-v1", "Technical Blue", { background: "#071A2B", surface: "#0E2A47", primary: "#38BDF8", accent: "#A3E635", text: "#F0F9FF", muted: "#BAD7E9", line: "#22577A", inverse: "#071A2B", font: "Microsoft YaHei" })
]);

function validateThemeRegistry(registry = THEME_REGISTRY) {
  if (!Array.isArray(registry) || registry.length < 1 || registry.length > 32) throw new TypeError("theme registry is invalid");
  const ids = new Set();
  for (const theme of registry) {
    if (!theme || typeof theme !== "object" || !/^[a-z][a-z0-9-]{2,63}$/u.test(theme.id || "") || ids.has(theme.id)) throw new TypeError("theme registry contains an invalid id");
    if (typeof theme.name !== "string" || theme.name.length < 1 || theme.name.length > 80) throw new TypeError("theme registry contains an invalid name");
    if (!theme.tokens || typeof theme.tokens !== "object" || Array.isArray(theme.tokens)) throw new TypeError("theme registry contains invalid tokens");
    for (const key of REQUIRED_COLOR_KEYS) if (!COLOR_PATTERN.test(theme.tokens[key] || "")) throw new TypeError("theme registry contains an invalid color");
    if (typeof theme.tokens.font !== "string" || theme.tokens.font.length < 1 || theme.tokens.font.length > 80) throw new TypeError("theme registry contains an invalid font");
    ids.add(theme.id);
  }
  return true;
}

function listThemes() { return Object.freeze(THEME_REGISTRY.map((theme) => Object.freeze({ id: theme.id, name: theme.name }))); }
function getTheme(id) {
  const theme = THEME_REGISTRY.find((candidate) => candidate.id === id);
  if (!theme) throw new TypeError("presentation theme is invalid");
  return theme.tokens;
}

validateThemeRegistry();

module.exports = { COLOR_PATTERN, REQUIRED_COLOR_KEYS, THEME_REGISTRY, getTheme, listThemes, validateThemeRegistry };
