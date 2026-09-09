#!/usr/bin/env node
"use strict";

const componentAssetManifest = require("../../../packages/slideclone-native-engine/scripts/component-asset-manifest");

if (require.main === module) {
  componentAssetManifest.main();
}

module.exports = componentAssetManifest;
