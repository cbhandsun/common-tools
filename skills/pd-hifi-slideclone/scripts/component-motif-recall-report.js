#!/usr/bin/env node
"use strict";

const report = require("../../../packages/slideclone-native-engine/scripts/component-motif-recall-report");

if (require.main === module) {
  report.main();
}

module.exports = report;
