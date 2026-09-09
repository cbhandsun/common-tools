#!/usr/bin/env node
"use strict";

const audit = require("../../../packages/slideclone-native-engine/scripts/rendered-preview-audit");

if (require.main === module) {
  audit.main();
}

module.exports = audit;
