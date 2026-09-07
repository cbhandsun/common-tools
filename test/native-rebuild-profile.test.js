"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { PRODUCTION_NATIVE_REBUILD_OPTIONS, PRODUCTION_PROFILE_NAME, createProductionNativeRebuildOptions } = require("../packages/slideclone-core/native-rebuild-profile");

test("production native rebuild profile preserves local fidelity while objectifying structure", () => {
  assert.equal(PRODUCTION_PROFILE_NAME, "local-production-parity-v1");
  assert.equal(Object.isFrozen(PRODUCTION_NATIVE_REBUILD_OPTIONS), true);
  const first = createProductionNativeRebuildOptions();
  assert.equal(first.reconstructionProfile, PRODUCTION_PROFILE_NAME);
  assert.equal(first.vectorizeStatusIcons, false);
  for (const key of ["preserveGraphics", "objectifyLayerText", "objectifyStructuredVisualAtomText", "objectifyLayerContainers", "objectifyLayerConnectors", "eraseObjectifiedLayerPrimitives", "splitErasedResidualCrops", "objectifyTableGrid", "objectifyValueBanners", "hybridComponentTemplateResiduals", "eraseSpecializedHybridResidualText"]) assert.equal(first[key], true, key);
  first.vectorizeStatusIcons = true;
  assert.equal(createProductionNativeRebuildOptions().vectorizeStatusIcons, false);
});

test("team worker passes the shared production profile into the local rebuild implementation", () => {
  const root = path.resolve(__dirname, "..");
  const nativeSource = fs.readFileSync(path.join(root, "packages", "slideclone-core", "team-native-rebuild.js"), "utf8");
  const remoteSource = fs.readFileSync(path.join(root, "packages", "remote-mcp-server", "bin", "common-tools-team-image-worker.js"), "utf8");
  assert.match(nativeSource, /\.\.\.createProductionNativeRebuildOptions\(\)/);
  assert.match(remoteSource, /requiredReconstructionProfile:\s*PRODUCTION_PROFILE_NAME/);
  assert.match(remoteSource, /preserveLocalFidelityImages:\s*true/);
});
