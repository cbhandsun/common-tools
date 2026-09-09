#!/usr/bin/env node
"use strict";

const queue = require("../../../packages/slideclone-native-engine/scripts/component-replacement-harvest-queue");

if (require.main === module) {
  queue.main();
}

module.exports = queue;
