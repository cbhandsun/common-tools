"use strict";

const { attemptSourceResidual } = require("./scene-plan/residual-branch-result");
const { assertUnverifiedRegionTextPreserved } = require("./typography/screenshot-texture-evidence");
const { canErasePreservedInteriorPath } = require("./scene-plan/residual-preserved-path");
const { refineSourceNativeEdges, reassignSourceNativeEdgeOwners } = require("./routing/source-native-edge-refinement");
const { refineGrayBorderResiduals } = require("./archetypes/gray-border-residual");
const { replaceResidualCropsWithNativeComponents } = require("./scene-plan/residual-crop-native-replacement");
const { finalizeSourceNativePage, ungroupSourceNativeOverlays } = require("./scene-plan/source-native-finalization");
const { finalizeWithApprovedFrames } = require("./scene-plan/approved-frame-application-lifecycle");
const { withApprovedBackdropBudget } = require("./scene-plan/approved-backdrop-budget");
const {finalizeNativeRouteRepresentations,commitNativeRouteMaterialization}=require('./routing/source-native-route-finalization');
const {parseNativeOutputPolicy,selectNativeOutputImages}=require('./quality/native-output-selection');
const {groupSemanticNodes}=require('./scene-plan/semantic-node-edit-groups');

module.exports = { attemptSourceResidual, assertUnverifiedRegionTextPreserved, canErasePreservedInteriorPath, refineSourceNativeEdges, reassignSourceNativeEdgeOwners, refineGrayBorderResiduals, replaceResidualCropsWithNativeComponents, finalizeSourceNativePage, ungroupSourceNativeOverlays, finalizeWithApprovedFrames, withApprovedBackdropBudget,finalizeNativeRouteRepresentations,commitNativeRouteMaterialization,parseNativeOutputPolicy,selectNativeOutputImages,groupSemanticNodes };
