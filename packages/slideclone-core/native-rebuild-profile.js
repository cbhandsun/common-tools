"use strict";

const PRODUCTION_PROFILE_NAME = "local-production-parity-v1";

const PRODUCTION_NATIVE_REBUILD_OPTIONS = Object.freeze({
  preserveGraphics: true,
  vectorizeStatusIcons: false,
  objectifyLayerText: true,
  objectifyStructuredVisualAtomText: true,
  objectifyLayerContainers: true,
  objectifyLayerConnectors: true,
  eraseObjectifiedLayerPrimitives: true,
  splitErasedResidualCrops: true,
  objectifyTableGrid: true,
  objectifyValueBanners: true,
  objectifyAssetHubInputIcons: false,
  objectifyComponentGroupMatches: true,
  componentGroupMatchMinScore: 58,
  replaceSafeComponentTemplateCrops: false,
  hybridComponentTemplateResiduals: true,
  eraseSpecializedHybridResidualText: true,
  reconstructionProfile: PRODUCTION_PROFILE_NAME
});

function createProductionNativeRebuildOptions() {
  return { ...PRODUCTION_NATIVE_REBUILD_OPTIONS };
}

module.exports = {
  PRODUCTION_NATIVE_REBUILD_OPTIONS,
  PRODUCTION_PROFILE_NAME,
  createProductionNativeRebuildOptions
};
