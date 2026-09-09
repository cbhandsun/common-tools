#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/expression-policy-repair-queue-coverage");

if (require.main === module) {
  try {
    process.exitCode = mod.main();
  } catch (error) {
    process.stderr.write(`${mod.safeString(error?.message || error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = mod;
