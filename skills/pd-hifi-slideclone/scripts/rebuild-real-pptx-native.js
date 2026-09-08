#!/usr/bin/env node
"use strict";

const nativeRebuild = require("../../../packages/slideclone-native-engine/scripts/rebuild-real-pptx-native");

if (require.main === module) {
  nativeRebuild.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = nativeRebuild;
