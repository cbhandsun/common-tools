"use strict";

const matrix = require("../../../packages/slideclone-native-engine/scripts/real-pptx-quality-matrix");

if (require.main === module) {
  matrix.main();
}

module.exports = matrix;
