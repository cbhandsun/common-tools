#!/usr/bin/env node
"use strict";

const runner = require("../../../packages/slideclone-native-engine/scripts/golden-set-runner");

if (require.main === module) {
  runner.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = runner;
