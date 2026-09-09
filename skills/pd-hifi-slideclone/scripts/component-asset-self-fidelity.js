#!/usr/bin/env node
"use strict";

const fidelity = require("../../../packages/slideclone-native-engine/scripts/component-asset-self-fidelity");

if (require.main === module) {
  fidelity.main();
}

module.exports = fidelity;
