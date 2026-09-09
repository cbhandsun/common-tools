#!/usr/bin/env node
"use strict";

const rank = require("../../../packages/slideclone-native-engine/scripts/component-harvest-candidate-rank");

if (require.main === module) {
  rank.main();
}

module.exports = rank;
