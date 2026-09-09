#!/usr/bin/env node
"use strict";

const batch = require("../../../packages/slideclone-native-engine/scripts/component-ir-replacement-apply-batch");

if (require.main === module) {
  batch.main();
}

module.exports = batch;
