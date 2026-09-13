#!/usr/bin/env node
"use strict";

const gate = require("../../../packages/slideclone-native-engine/scripts/minimum-unit-policy-gate");

if (require.main === module) {
  gate.main();
}

module.exports = gate;
