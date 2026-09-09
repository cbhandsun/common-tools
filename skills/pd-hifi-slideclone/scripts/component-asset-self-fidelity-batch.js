#!/usr/bin/env node
"use strict";

const batch = require("../../../packages/slideclone-native-engine/scripts/component-asset-self-fidelity-batch");

if (require.main === module) {
  batch.main();
}

module.exports = batch;
