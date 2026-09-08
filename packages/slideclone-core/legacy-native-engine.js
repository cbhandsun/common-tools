"use strict";

function loadLegacyNativeEngine() {
  return require("../../skills/pd-hifi-slideclone/scripts/rebuild-real-pptx-native");
}

function loadLegacyDeckRebuilder() {
  const implementation = loadLegacyNativeEngine();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") {
    throw new Error("native image rebuild implementation is unavailable");
  }
  return implementation;
}

module.exports = { loadLegacyDeckRebuilder, loadLegacyNativeEngine };
