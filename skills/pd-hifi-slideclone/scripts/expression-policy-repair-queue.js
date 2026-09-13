#!/usr/bin/env node
"use strict";

const queue = require("../../../packages/slideclone-native-engine/scripts/expression-policy-repair-queue");

if (require.main === module) {
  queue.main();
}

module.exports = queue;
