#!/usr/bin/env node
"use strict";

const gate = require("../../../packages/slideclone-native-engine/scripts/component-replacement-apply-quality-gate");

if (require.main === module) {
  gate.main();
}

module.exports = gate;
