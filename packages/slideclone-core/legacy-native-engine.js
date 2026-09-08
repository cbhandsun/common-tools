"use strict";

function loadLegacyNativeEngine() {
  return require("../../runtime/slideclone-native-engine/scripts/rebuild-real-pptx-native");
}

function loadLegacyDeckRebuilder() {
  const implementation = loadLegacyNativeEngine();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") {
    throw new Error("native image rebuild implementation is unavailable");
  }
  return implementation;
}

module.exports = { loadLegacyDeckRebuilder, loadLegacyNativeEngine };
