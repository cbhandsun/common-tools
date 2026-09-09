#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/review-studio");

if (require.main === module) {
  try {
    mod.main();
  } catch (error) {
    process.stderr.write(`Review Studio failed: ${String(error?.message || error).slice(0, 500)}\n`);
    process.exitCode = 1;
  }
}

module.exports = mod;
