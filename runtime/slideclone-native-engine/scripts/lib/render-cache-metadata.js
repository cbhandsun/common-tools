"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { fingerprintOoxmlPackage } = require("./ooxml-package-fingerprint");
const RENDER_CACHE_METADATA = ".slideclone-render-cache.json";
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const ensureDir = (directory) => fs.mkdirSync(directory, { recursive: true });
function sameRenderCacheIdentity(left, right) {
  if (!left || !right) return false;
  return left.provider === right.provider
    && left.packageFingerprint === right.packageFingerprint
    && left.renderer === right.renderer
    && left.expectedPages === right.expectedPages
    && left.dpi === right.dpi;
}

function createRenderCacheIdentity({ pptxFile, renderer, expectedPages, dpi = 144 }) {
  return {
    provider: "slideclone-render-cache-v1",
    packageFingerprint: fingerprintOoxmlPackage(pptxFile),
    renderer: normalizeRenderer(renderer),
    expectedPages: positiveSafeInteger(expectedPages, 1),
    dpi: positiveSafeInteger(dpi, 144)
  };
}


function readRenderCacheMetadata(renderDir) {
  const file = path.join(renderDir, RENDER_CACHE_METADATA);
  try {
    const value = readJson(file);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

function writeRenderCacheMetadata(renderDir, identity) {
  ensureDir(renderDir);
  fs.writeFileSync(path.join(renderDir, RENDER_CACHE_METADATA), `${JSON.stringify(identity, null, 2)}\n`, "utf8");
}

function positiveSafeInteger(value, fallback) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : fallback;
}


function normalizeRenderer(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["powerpoint", "power-point", "powerpoint-com", "office"].includes(normalized)) return "powerpoint";
  if (["libreoffice", "libre-office", "lo", "headless", ""].includes(normalized)) return "libreoffice";
  throw new TypeError(`Unsupported renderer: ${normalized}`);
}


module.exports = { createRenderCacheIdentity, normalizeRenderer, readRenderCacheMetadata, sameRenderCacheIdentity, writeRenderCacheMetadata };
