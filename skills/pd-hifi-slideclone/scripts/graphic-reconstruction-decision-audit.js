#!/usr/bin/env node
"use strict";

const audit = require("../../../packages/slideclone-native-engine/scripts/graphic-reconstruction-decision-audit");

if (require.main === module) {
  audit.main();
}

module.exports = audit;
