#!/usr/bin/env node
"use strict";

const wave = require("../../../packages/slideclone-native-engine/scripts/component-learning-wave");

if (require.main === module) {
  wave.main();
}

module.exports = wave;
