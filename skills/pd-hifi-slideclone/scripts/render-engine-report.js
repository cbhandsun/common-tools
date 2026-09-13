#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/render-engine-report");

if (require.main === module) {
  mod.main();
}

module.exports = mod;
