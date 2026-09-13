#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/real-blind-layer-audit-parallel");

if (require.main === module) {
  mod.main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  });
}

module.exports = mod;
