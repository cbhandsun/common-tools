"use strict";

const fs = require("node:fs");
const path = require("node:path");

function loadTrustedAdapter({ configDir, skillRoot, adapterPath, allowExternal = false }) {
  if (typeof adapterPath !== "string" || !adapterPath.trim()) {
    throw new Error("Adapter path must be a non-empty string");
  }
  const resolved = resolveAdapterPath(configDir, skillRoot, adapterPath);
  const canonical = fs.realpathSync(resolved);
  const extension = path.extname(canonical).toLowerCase();
  if (![".js", ".cjs"].includes(extension)) {
    throw new Error(`Adapter must be a JavaScript module: ${adapterPath}`);
  }
  if (!allowExternal && !isWithin(skillRoot, canonical)) {
    const error = new Error(`External adapter is not allowed: ${adapterPath}`);
    error.code = "ERR_EXTERNAL_ADAPTER";
    throw error;
  }
  const adapter = require(canonical);
  if (typeof adapter !== "function") throw new Error(`Adapter must export a function: ${adapterPath}`);
  return adapter;
}

function resolveAdapterPath(configDir, skillRoot, adapterPath) {
  if (path.isAbsolute(adapterPath)) return path.resolve(adapterPath);
  const fromConfig = path.resolve(configDir, adapterPath);
  if (fs.existsSync(fromConfig)) return fromConfig;
  return path.resolve(skillRoot, adapterPath);
}

function isWithin(root, candidate) {
  const canonicalRoot = fs.realpathSync(root);
  const relative = path.relative(canonicalRoot, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

module.exports = {
  isWithin,
  loadTrustedAdapter,
  resolveAdapterPath
};
