"use strict";

function loadNativeImageEngine() {
  return require("./scripts/rebuild-real-pptx-native");
}

function loadNativeImageRebuilder() {
  const implementation = loadNativeImageEngine();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") {
    throw new Error("native image rebuild implementation is unavailable");
  }
  return implementation;
}

module.exports = { loadNativeImageEngine, loadNativeImageRebuilder };
