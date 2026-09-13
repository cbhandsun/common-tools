#!/usr/bin/env node
"use strict";

const resolve = require("../../../packages/slideclone-native-engine/scripts/officeplus-component-resolve");

if (require.main === module) {
  resolve.main();
}

module.exports = resolve;
