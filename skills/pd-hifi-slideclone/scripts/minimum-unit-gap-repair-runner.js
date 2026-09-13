#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/minimum-unit-gap-repair-runner");

if (require.main === module) {
  mod.main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = mod;
