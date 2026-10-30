"use strict";
const { createRawImageNativeRebuilder } = require("../slideclone-core/team-native-rebuild");
const { loadNativeImageRebuilder } = require("../slideclone-native-engine");
const { createPinnedPaddleImageNormalizer } = require("../slideclone-core/ocr/team-paddleocr-profile");
const { admitImageSemanticShapes } = require("./image-semantic-admission");
const { createSourceSceneRuntime } = require("./source-scene-runtime");
const { parseConnectorCornerMode } = require("../slideclone-core/routing/source-route-corner-mode");
const { parseNativeOutputPolicy } = require("../slideclone-core/quality/native-output-policy");
function createNativeRebuilder(settings, { loadImplementation = loadNativeImageRebuilder, componentCatalogRoot, rawImageOcr, normalizeImageFile, environment = process.env, sceneReviewBatches, sceneVision, connectorCornerMode, applyApprovedFrames, outputPolicy } = {}) {
  outputPolicy = parseNativeOutputPolicy(outputPolicy === undefined ? settings.outputPolicy : outputPolicy);
  connectorCornerMode = parseConnectorCornerMode(connectorCornerMode === undefined ? settings.connectorCornerMode : connectorCornerMode);
  const { reviewSourceScene, compileSourceScene, preflightSourceScene } = createSourceSceneRuntime({ environment, sceneReviewBatches, sceneVision });
  const implementation = loadImplementation();
  if (typeof implementation?.rebuildDeckFromWorkDir !== "function") throw new Error("native image rebuild implementation is unavailable");
  const { createImageComponentResolver } = require("./image-component-analysis");
  const resolveComponentIndexes = createImageComponentResolver({ root: componentCatalogRoot, implementation });
  const { readPng, writePng } = require("../slideclone-core/png");
  const { eraseMasks } = require("../slideclone-core/scene-plan/residual-primitive-erasure");
  const { createFullSlideResidualBuilder } = require("../slideclone-core/archetypes/full-slide-native-residual");
  const { refineKnowledgeGraphIconCrops } = require("../slideclone-core/archetypes/knowledge-graph-icon-crops");
  const { restoreOcrGlyphResiduals } = require("../slideclone-core/ocr/ocr-glyph-residual");
  const { refineGrayBorderResiduals } = require("../slideclone-core/archetypes/gray-border-residual");
  const imageNormalizer = normalizeImageFile === undefined && settings.rawImageOcrProfile.kind === "paddleocr"
    ? createPinnedPaddleImageNormalizer(settings.rawImageOcrProfile) : normalizeImageFile;
  const { createSourceOcrRefiner } = require("../slideclone-core/ocr/ocr-source-refinement");
  const refineSourceOcr = rawImageOcr === undefined ? undefined : createSourceOcrRefiner({ recognize: rawImageOcr, provider: settings.rawImageOcrProfile.name || "raw-image-ocr" });
  const createFullSlideResidual = createFullSlideResidualBuilder({ eraseMasks, readPng, writePng });
  return createRawImageNativeRebuilder({ rebuildDeckFromWorkDir: implementation.rebuildDeckFromWorkDir, resolveComponentIndexes, normalizeImageFile: imageNormalizer, refineSourceOcr, reviewSourceScene, compileSourceScene, preflightSourceScene, createFullSlideResidual, refineSemanticImages: refineKnowledgeGraphIconCrops, admitSemanticShapes: admitImageSemanticShapes, restoreOcrGlyphs: restoreOcrGlyphResiduals, refineGrayBorders: refineGrayBorderResiduals, preserveLocalFidelityImages: true, connectorCornerMode, applyApprovedFrames, outputPolicy });
}

module.exports = { createNativeRebuilder };
