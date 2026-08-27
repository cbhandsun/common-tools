"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  shouldPreferAppliedPluginComponent
} = require("../skills/pd-hifi-slideclone/scripts/lib/component-rebuild-precedence");

function componentImage(group = {}, overrides = {}) {
  return {
    box: { x: 40, y: 140, w: 870, h: 360 },
    source: {
      componentAssetReadiness: { status: "applied-plugin-motif-ready" },
      componentTemplateVisualVerified: true,
      componentLocalAssets: [{
        roleTags: ["applied-component"],
        recommendedComponentGroups: [{
          reuseReadiness: { level: "high", score: 100 },
          matchScore: 120,
          shapeCount: 42,
          connectorCount: 6,
          pictureCount: 0,
          ...group
        }]
      }]
    },
    ...overrides
  };
}

const sourceImages = [{ box: { x: 46, y: 149, w: 867, h: 361 } }];

test("high-reuse applied plugin component wins over overlapping specialized approximation", () => {
  assert.equal(shouldPreferAppliedPluginComponent({ componentImages: [componentImage()], sourceImages }), true);
  const annotatedSourceImage = componentImage();
  assert.equal(shouldPreferAppliedPluginComponent({
    componentImages: [annotatedSourceImage],
    sourceImages: [annotatedSourceImage]
  }), true);
});

test("unverified applied plugin component cannot suppress a specialized rebuild outside prototype mode", () => {
  const unverified = componentImage();
  unverified.source.componentTemplateVisualVerified = false;
  assert.equal(shouldPreferAppliedPluginComponent({ componentImages: [unverified], sourceImages }), false);
  assert.equal(shouldPreferAppliedPluginComponent({
    componentImages: [unverified],
    sourceImages,
    allowUnverifiedPrototypeReplay: true
  }), true);
});

test("low quality, picture-heavy, and non-applied templates do not suppress specialized rebuilds", () => {
  assert.equal(shouldPreferAppliedPluginComponent({
    componentImages: [componentImage({ reuseReadiness: { level: "medium" } })], sourceImages
  }), false);
  assert.equal(shouldPreferAppliedPluginComponent({
    componentImages: [componentImage({ pictureCount: 1 })], sourceImages
  }), false);
  const notApplied = componentImage();
  notApplied.source.componentLocalAssets[0].roleTags = ["template-layout"];
  assert.equal(shouldPreferAppliedPluginComponent({ componentImages: [notApplied], sourceImages }), false);
});

test("component must substantially overlap the specialized source region", () => {
  assert.equal(shouldPreferAppliedPluginComponent({
    componentImages: [componentImage({}, { box: { x: 720, y: 20, w: 180, h: 80 } })], sourceImages
  }), false);
  assert.equal(shouldPreferAppliedPluginComponent({ componentImages: "bad", sourceImages }), false);
});
