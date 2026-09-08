"use strict";

const path = require("node:path");

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

function resolveRepositoryRoot() {
  return path.resolve(__dirname, "../..");
}

function resolveSlidecloneRuntimeRoot(repositoryRoot = resolveRepositoryRoot()) {
  return path.join(repositoryRoot, "skills", "pd-hifi-slideclone");
}

function resolveOpenXmlBuilderRoot(repositoryRoot = resolveRepositoryRoot()) {
  return path.join(resolveSlidecloneRuntimeRoot(repositoryRoot), "dotnet", "OpenXmlDeckBuilder");
}

module.exports = { loadNativeImageEngine, loadNativeImageRebuilder, resolveOpenXmlBuilderRoot, resolveSlidecloneRuntimeRoot };
