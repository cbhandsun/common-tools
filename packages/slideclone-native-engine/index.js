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
  return resolveNativeEngineRuntimeRoot(repositoryRoot);
}

function resolveNativeEngineRuntimeRoot(repositoryRoot = resolveRepositoryRoot()) {
  return path.join(repositoryRoot, "packages", "slideclone-native-engine");
}

function resolveSlidecloneResourceRoot(repositoryRoot = resolveRepositoryRoot()) {
  return path.join(repositoryRoot, "skills", "pd-hifi-slideclone");
}

function resolveOpenXmlBuilderRoot(repositoryRoot = resolveRepositoryRoot()) {
  return path.join(resolveNativeEngineRuntimeRoot(repositoryRoot), "dotnet", "OpenXmlDeckBuilder");
}

function buildOpenXmlDecksSync(jobs, context = {}, options = {}) {
  const repositoryRoot = resolveRepositoryRoot();
  const skillRoot = resolveNativeEngineRuntimeRoot(repositoryRoot);
  const builderRoot = resolveOpenXmlBuilderRoot(repositoryRoot);
  const builder = require("../slideclone-core/pptx-openxml-dotnet");
  return builder.buildOpenXmlDecksSync(jobs, { ...context, skillRoot }, builderRoot, options);
}

module.exports = { buildOpenXmlDecksSync, loadNativeImageEngine, loadNativeImageRebuilder, resolveNativeEngineRuntimeRoot, resolveOpenXmlBuilderRoot, resolveRepositoryRoot, resolveSlidecloneResourceRoot, resolveSlidecloneRuntimeRoot };
