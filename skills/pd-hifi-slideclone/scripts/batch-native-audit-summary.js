#!/usr/bin/env node
"use strict";

const summary = require("../../../packages/slideclone-native-engine/scripts/batch-native-audit-summary");

if (require.main === module) {
  summary.main();
}

module.exports = summary;
