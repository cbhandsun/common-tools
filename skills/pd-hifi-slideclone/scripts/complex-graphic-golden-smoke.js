#!/usr/bin/env node
"use strict";

const smoke = require("../../../packages/slideclone-native-engine/scripts/complex-graphic-golden-smoke");

if (require.main === module) {
  smoke.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = smoke;
