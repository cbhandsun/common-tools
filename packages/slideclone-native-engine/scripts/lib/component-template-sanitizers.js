"use strict";

const fs = require("node:fs");
const path = require("node:path");

function safeText(value) {
  return String(value ?? "")
    .split("")
    .filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code !== 127) || code > 127;
    })
    .join("")
    .trim()
    .slice(0, 120);
}

function safeRelationshipId(value) {
  const text = safeText(value);
  return /^[A-Za-z_][A-Za-z0-9_.-]{0,80}$/.test(text) ? text : "";
}

function safeMediaTarget(value) {
  const text = safeText(value).replace(/\\/g, "/");
  if (!/^ppt\/media\/[^/?#]+\.(?:png|jpe?g|gif|emf|wmf|svg)$/i.test(text)) return "";
  if (text.includes("..")) return "";
  return text;
}

function safeLocalPptxPath(value) {
  const text = safeText(value);
  if (!path.isAbsolute(text)) return "";
  if (!/\.(?:pptx|potx)$/i.test(text)) return "";
  try {
    const stat = fs.statSync(text);
    return stat.isFile() ? text : "";
  } catch {
    return "";
  }
}

function safeOutputAssetDir(value) {
  const text = safeText(value);
  if (!text) return "";
  const resolved = path.resolve(text);
  try {
    fs.mkdirSync(resolved, { recursive: true });
    return resolved;
  } catch {
    return "";
  }
}

function safeComponentToken(value) {
  const token = safeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return token || "component";
}

function safeColor(value) {
  const text = safeText(value).toUpperCase();
  return /^#[0-9A-F]{6}$/.test(text) ? text : "";
}

function safeColorOrNone(value) {
  const text = safeText(value);
  if (text.toLowerCase() === "none") return "none";
  return safeColor(text);
}

module.exports = {
  safeColor,
  safeColorOrNone,
  safeComponentToken,
  safeLocalPptxPath,
  safeMediaTarget,
  safeOutputAssetDir,
  safeRelationshipId,
  safeText
};
