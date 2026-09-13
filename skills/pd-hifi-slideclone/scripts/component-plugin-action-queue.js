#!/usr/bin/env node
"use strict";

const actionQueue = require("../../../packages/slideclone-native-engine/scripts/component-plugin-action-queue");

if (require.main === module) {
  try {
    actionQueue.main();
  } catch (error) {
    process.stderr.write(`${error?.message || String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = actionQueue;
