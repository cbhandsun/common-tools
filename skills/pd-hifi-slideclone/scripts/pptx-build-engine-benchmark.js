#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/pptx-build-engine-benchmark");

if (require.main === module) {
  mod.main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = mod;
