#!/usr/bin/env node
"use strict";

const corpusRunner = require("../../../packages/slideclone-native-engine/scripts/real-pptx-corpus-runner");

if (require.main === module) {
  corpusRunner.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = corpusRunner;
