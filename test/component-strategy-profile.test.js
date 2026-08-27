"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  summarizeComponentStrategyProfile
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-strategy-profile");

test("component strategy profile summarizes plugin and fidelity strategy coverage", () => {
  const profile = summarizeComponentStrategyProfile({
    pages: [
      {
        images: [
          {
            id: "component-preserved",
            source: {
              componentRenderStrategy: {
                mode: "plugin-component-template",
                implementationMode: "auth-or-download-required",
                bestCandidate: { sourceProvider: "officeplus", kind: "component" },
                applicationPlan: {
                  currentStep: "preserve-source-crop-and-record-component-replacement",
                  sourceProvider: "officeplus",
                  componentKind: "component",
                  requiresDownload: true,
                  preservesFidelityNow: true
                }
              },
              componentLocalAssets: [{
                provider: "officeplus",
                recommendedComponentGroups: [
                  { id: "slide5-group2", score: 76, reuseReadiness: { level: "high", score: 84 } },
                  { id: "slide4-group4", score: 61, reuseReadiness: { level: "medium", score: 58 } }
                ]
              }],
              componentTemplateGroupApplied: true,
              componentTemplateFamilyApplied: "process-chain",
              componentTemplateGroupId: "slide5-group2",
              componentTemplateAssetMotifReady: true,
              componentTemplateTargetMotifs: ["arc-arrow", "whole-process-template"],
              componentTemplateWholeProcessApplied: true,
              componentTemplateNativeShapes: 7,
              componentTemplateCropReplacedByNative: false,
              componentTemplateCropReplacementReason: "component-template-contains-picture-children"
            }
          },
          {
            source: {
              layer: {
                componentRenderStrategy: {
                  mode: "preserve-crop-with-component-reference",
                  implementationMode: "guide-only",
                  bestCandidate: { sourceProvider: "islide", kind: "diagram" },
                  applicationPlan: {
                    currentStep: "preserve-source-crop-with-plugin-style-reference",
                    sourceProvider: "islide",
                    componentKind: "diagram",
                    requiresDownload: false,
                    preservesFidelityNow: true
                  }
                }
              }
            }
          },
          {
            source: {
              componentRenderStrategy: {
                mode: "native-rebuild-with-component-style-guide",
                implementationMode: "style-guide",
                bestCandidate: { sourceProvider: "islide", kind: "smartdiagram" },
                applicationPlan: {
                  currentStep: "rebuild-native-primitives-guided-by-component-style",
                  sourceProvider: "islide",
                  componentKind: "smartdiagram",
                  requiresDownload: false,
                  preservesFidelityNow: false
                }
              }
            }
          },
          {
            source: {
              componentRenderStrategy: {
                mode: "preserve-local-crop",
                implementationMode: "native-generator-safe-fallback",
                editableExpectation: "raster-preserved-because-component-template-is-not-layer-eligible",
                bestCandidate: { sourceProvider: "officeplus", kind: "component" },
                applicationPlan: {
                  currentStep: "preserve-source-crop",
                  sourceProvider: "officeplus",
                  componentKind: "component",
                  requiresDownload: false,
                  preservesFidelityNow: true
                }
              }
            }
          },
          {
            id: "component-split-picture-residual",
            source: {
              detector: "component-template-picture-residual-crop",
              layerSourceId: "component-split",
              componentTemplateCropSplitIntoResiduals: true
            }
          },
          {
            id: "component-picture",
            type: "plugin-component-picture",
            source: {
              detector: "plugin-component-template-native-picture",
              layerSourceId: "component-preserved",
              matchedComponentAssetMotifReady: true,
              matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
              matchedComponentWholeProcessTemplate: true,
              matchedComponentStructureFitScore: 12,
              matchedComponentStructureFitReasons: ["native-group-node-count-close"],
              matchedComponentGroupId: "slide5-group2",
              nativeComponentArchetype: "process-chain",
              nativeComponentRole: "process-applied-picture-shell",
              appliedPluginStructureRole: "picture"
            }
          }
        ],
        shapes: [
          {
            source: {
              componentTemplateGroupApplied: true,
              componentTemplatePart: "process-node",
              layerSourceId: "component-preserved",
              matchedComponentAssetMotifReady: true,
              matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
              matchedComponentWholeProcessTemplate: true,
              matchedComponentStructureFitScore: 12,
              matchedComponentStructureFitReasons: ["native-group-node-count-close", "native-group-connector-count-close"],
              matchedComponentGroupId: "slide5-group2",
              nativeComponentArchetype: "process-chain",
              nativeComponentRole: "process-applied-node",
              appliedPluginStructureRole: "node"
            }
          },
          {
            source: {
              componentTemplateGroupApplied: true,
              componentTemplatePart: "process-connector",
              layerSourceId: "component-preserved",
              matchedComponentAssetMotifReady: true,
              matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
              matchedComponentWholeProcessTemplate: true,
              matchedComponentStructureFitScore: 12,
              matchedComponentStructureFitReasons: ["native-group-node-count-close", "native-group-connector-count-close"],
              matchedComponentGroupId: "slide5-group2",
              nativeComponentArchetype: "process-chain",
              nativeComponentRole: "process-applied-connector",
              appliedPluginStructureRole: "connector"
            }
          },
          {
            source: {
              componentTemplateGroupApplied: true,
              componentTemplatePart: "process-node",
              layerSourceId: "component-replaced",
              nativeComponentRole: "process-node",
              appliedPluginStructureRole: "node",
              componentTemplateCropReplacedByNative: true
            }
          },
          {
            source: {
              componentTemplateGroupApplied: true,
              componentTemplatePart: "process-node",
              layerSourceId: "component-split",
              nativeComponentRole: "process-node",
              appliedPluginStructureRole: "node",
              componentTemplateCropReplacedByNative: true,
              componentTemplateCropSplitIntoResiduals: true
            }
          },
          {
            source: {
              detector: "visual-atom-native-rect",
              atomId: "container-1",
              topologyRole: "container",
              containedAtomIds: ["node-1", "node-2"]
            }
          },
          {
            source: {
              detector: "visual-atom-native-rect",
              atomId: "node-1",
              containerAtomId: "container-1"
            }
          },
          {
            source: {
              detector: "visual-atom-native-connector",
              fromAtomId: "node-1",
              toAtomId: "node-2"
            }
          }
        ],
        textBoxes: [
          {
            source: {
              componentTemplateGroupApplied: true,
              layerSourceId: "component-preserved",
              matchedComponentAssetMotifReady: true,
              matchedComponentTargetMotifs: ["arc-arrow", "whole-process-template"],
              matchedComponentWholeProcessTemplate: true,
              matchedComponentStructureFitScore: 12,
              matchedComponentStructureFitReasons: ["native-group-node-count-close"],
              matchedComponentGroupId: "slide5-group2",
              nativeComponentArchetype: "process-chain",
              nativeComponentRole: "process-applied-text-slot",
              appliedPluginStructureRole: "text-slot"
            }
          }
        ]
      }
    ]
  });

  assert.equal(profile.componentStrategyImages, 4);
  assert.equal(profile.pluginReferencedImages, 3);
  assert.equal(profile.pluginComponentTemplateImages, 1);
  assert.equal(profile.preserveCropWithComponentReferenceImages, 1);
  assert.equal(profile.nativeRebuildWithComponentStyleGuideImages, 1);
  assert.equal(profile.preserveLocalCropImages, 1);
  assert.equal(profile.componentTemplateRejectedByLayerEligibilityImages, 1);
  assert.equal(profile.downloadRequiredImages, 1);
  assert.equal(profile.fidelityPreservedImages, 3);
  assert.equal(profile.componentLocalAssetImages, 1);
  assert.equal(profile.componentLocalAssetMatches, 1);
  assert.equal(profile.componentRecommendedGroupImages, 1);
  assert.equal(profile.componentRecommendedGroupMatches, 2);
  assert.equal(profile.componentHighReusableGroupMatches, 1);
  assert.deepEqual(profile.componentReuseReadinessCounts, { high: 1, medium: 1 });
  assert.equal(profile.componentTemplateAppliedImages, 3);
  assert.equal(profile.componentTemplateNativeShapes, 7);
  assert.equal(profile.componentTemplateAppliedShapes, 4);
  assert.equal(profile.componentTemplateAppliedTextBoxes, 1);
  assert.equal(profile.componentTemplateAppliedPictures, 1);
  assert.equal(profile.componentTemplateMotifReadyImages, 1);
  assert.equal(profile.componentTemplateMotifReadyShapes, 2);
  assert.equal(profile.componentTemplateMotifReadyTextBoxes, 1);
  assert.equal(profile.componentTemplateMotifReadyPictures, 1);
  assert.equal(profile.componentTemplateWholeProcessImages, 1);
  assert.equal(profile.componentTemplateWholeProcessShapes, 2);
  assert.equal(profile.componentTemplateWholeProcessTextBoxes, 1);
  assert.equal(profile.componentTemplateWholeProcessPictures, 1);
  assert.equal(profile.componentTemplateCropReplacedImages, 2);
  assert.equal(profile.componentTemplateCropSplitImages, 1);
  assert.equal(profile.componentTemplatePictureResidualImages, 1);
  assert.equal(profile.componentTemplateCropPreservedImages, 1);
  assert.equal(profile.visualAtomTopologyConnectors, 1);
  assert.equal(profile.visualAtomContainerNodes, 1);
  assert.equal(profile.visualAtomContainedNodes, 1);
  assert.deepEqual(profile.componentTemplateCropPreservedReasonCounts, {
    "component-template-contains-picture-children": 1
  });
  assert.deepEqual(profile.componentAssetProviderCounts, { officeplus: 1 });
  assert.deepEqual(profile.componentTemplateFamilyCounts, { "process-chain": 1 });
  assert.deepEqual(profile.componentTemplateMotifReadyFamilyCounts, { "process-chain": 5 });
  assert.deepEqual(profile.componentTemplateMotifReadyGroupCounts, { "slide5-group2": 5 });
  assert.deepEqual(profile.componentTemplateMotifReadyTargetCounts, { "arc-arrow": 5, "whole-process-template": 5 });
  assert.deepEqual(profile.componentTemplateShapePartCounts, { "process-node": 3, "process-connector": 1 });
  assert.equal(profile.componentTemplateStructureFitShapes, 2);
  assert.equal(profile.componentTemplateStructureFitTextBoxes, 1);
  assert.equal(profile.componentTemplateStructureFitPictures, 1);
  assert.deepEqual(profile.componentTemplateStructureFitReasonCounts, {
    "native-group-connector-count-close": 2,
    "native-group-node-count-close": 4
  });
  assert.deepEqual(profile.componentTemplateStructureRoleCounts, {
    connector: 1,
    node: 3,
    picture: 1,
    "text-slot": 1
  });
  assert.deepEqual(profile.componentTemplateNativeRoleCounts, {
    "process-applied-connector": 1,
    "process-applied-node": 1,
    "process-applied-picture-shell": 1,
    "process-applied-text-slot": 1,
    "process-node": 2
  });
  assert.deepEqual(profile.sourceProviderCounts, { officeplus: 2, islide: 2 });
  assert.deepEqual(profile.expectationCounts, {
    unknown: 3,
    "raster-preserved-because-component-template-is-not-layer-eligible": 1
  });
  assert.deepEqual(profile.modeCounts, {
    "plugin-component-template": 1,
    "preserve-crop-with-component-reference": 1,
    "native-rebuild-with-component-style-guide": 1,
    "preserve-local-crop": 1
  });
});

test("component strategy profile tolerates empty and malformed image input", () => {
  const profile = summarizeComponentStrategyProfile({
    pages: [
      { images: [{ source: {} }, null] },
      { images: "not-an-array" }
    ]
  });

  assert.equal(profile.componentStrategyImages, 0);
  assert.deepEqual(profile.modeCounts, {});
});
