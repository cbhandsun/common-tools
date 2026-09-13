#!/usr/bin/env node
"use strict";

const harvestActive = require("../../../packages/slideclone-native-engine/scripts/harvest-active-powerpoint-component");

if (require.main === module) {
  harvestActive.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = harvestActive;
