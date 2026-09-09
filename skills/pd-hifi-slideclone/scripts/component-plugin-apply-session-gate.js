#!/usr/bin/env node
"use strict";

const gate = require("../../../packages/slideclone-native-engine/scripts/component-plugin-apply-session-gate");

if (require.main === module) {
  process.exitCode = gate.main();
}

module.exports = gate;
