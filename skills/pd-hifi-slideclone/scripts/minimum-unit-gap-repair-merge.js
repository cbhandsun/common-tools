#!/usr/bin/env node
"use strict";

const mod = require("../../../packages/slideclone-native-engine/scripts/minimum-unit-gap-repair-merge");

if (require.main === module) {
  try {
    const report = mod.mergeRepairRoot(mod.parseArgs(process.argv));
    process.stdout.write(`${JSON.stringify(report.summary, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = mod;
