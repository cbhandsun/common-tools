#!/usr/bin/env node
"use strict";

const watcher = require("../../../packages/slideclone-native-engine/scripts/watch-plugin-component-downloads");

if (require.main === module) {
  watcher.main().catch((error) => {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  });
}

module.exports = watcher;
