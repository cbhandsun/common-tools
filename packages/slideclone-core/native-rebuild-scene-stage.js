"use strict";

const { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild } = require("./archetypes/knowledge-graph-native");
const { createDeclarativePipeline } = require("./archetypes/declarative-rebuilder-pipeline");
const { applySemanticFallbackPipeline } = require("./archetypes/declarative-fallback-projection");
const { semanticFallbackToPageContext } = require("./archetypes/semantic-fallback-adapter");
const { runSemanticRebuildTransaction } = require("./archetypes/semantic-rebuild-transaction");
const { mapReviewedSceneGraphics, withReviewedGraphicEvidence } = require("./scene-plan/source-scene-reviewed-graphics");
const { captureSourceCropRegistrations } = require("./scene-plan/source-crop-registration");
const {sealSceneInventoryRevisionDeck}=require('./scene-plan/source-inventory-revision-output');
const {sealSceneGlyphRecoveryDeck}=require('./scene-plan/source-glyph-recovery');

module.exports = { addKnowledgeGraphPictorialConnectors, applyKnowledgeGraphPanelNativeRebuild, createDeclarativePipeline, applySemanticFallbackPipeline, semanticFallbackToPageContext, runSemanticRebuildTransaction, mapReviewedSceneGraphics, withReviewedGraphicEvidence, captureSourceCropRegistrations, sealSceneInventoryRevisionDeck, sealSceneGlyphRecoveryDeck };
