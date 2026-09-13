#!/usr/bin/env node
"use strict";

const apply = require("../../../packages/slideclone-native-engine/scripts/component-replacement-apply");

if (require.main === module) {
  apply.main();
}

module.exports = apply;
