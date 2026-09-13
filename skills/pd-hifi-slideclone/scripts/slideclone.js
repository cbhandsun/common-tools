#!/usr/bin/env node
"use strict";

const slideclone = require("../../../packages/slideclone-native-engine/scripts/slideclone");

if (require.main === module) {
  slideclone.main().catch((error) => {
    process.stderr.write(`${error?.stack || error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = slideclone;
