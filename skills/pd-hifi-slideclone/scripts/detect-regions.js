#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/detect-regions");

if (require.main === module) {
  process.exitCode = mod.main();
}

module.exports = mod;
