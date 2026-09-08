#!/usr/bin/env node
"use strict";

const qualityGate = require("../../../packages/slideclone-native-engine/scripts/quality-gate-real-pptx");

if (require.main === module) {
  qualityGate.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = qualityGate;
