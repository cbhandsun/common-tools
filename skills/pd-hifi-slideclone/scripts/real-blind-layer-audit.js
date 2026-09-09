#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/real-blind-layer-audit");

if (require.main === module) {
  try {
    process.exitCode = mod.main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}

module.exports = mod;
