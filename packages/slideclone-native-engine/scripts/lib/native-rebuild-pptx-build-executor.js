"use strict";
const core = require("node:module").createRequire(require.resolve("../../../slideclone-core/package.json"));

const path = require("path");
const {
  createPptxBuildExecutor,
  normalizePptxBuildJobs,
  shouldRunPowerPointOpenGate,
  resolvePython,
  isFlagDisabled
} = core("@common-tools/slideclone-core/pptx-build-execution");

function createNativeRebuildPptxBuildExecutor(options = {}) {
  const scriptDir = options.scriptDir || path.resolve(__dirname, "..");
  return createPptxBuildExecutor({
    skillRoot: path.resolve(scriptDir, ".."),
    projectRoot: path.resolve(scriptDir, "..", "..", ".."),
    openXmlBuilderRoot: path.resolve(scriptDir, "..", "dotnet", "OpenXmlDeckBuilder"),
    buildOpenXmlDecksSync: (...args) => core("@common-tools/slideclone-core/pptx-openxml-dotnet").buildOpenXmlDecksSync(...args)
  });
}

module.exports = {
  createNativeRebuildPptxBuildExecutor,
  normalizePptxBuildJobs,
  shouldRunPowerPointOpenGate,
  resolvePython,
  isFlagDisabled
};
