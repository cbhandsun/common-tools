#!/usr/bin/env node
"use strict";

const matrix = require("../../../packages/slideclone-native-engine/scripts/component-coverage-matrix");

if (require.main === module) {
  matrix.main();
}

module.exports = matrix;
