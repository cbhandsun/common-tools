#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/component-assets-golden-gate");

if (require.main === module) {
  mod.main();
}

module.exports = mod;
