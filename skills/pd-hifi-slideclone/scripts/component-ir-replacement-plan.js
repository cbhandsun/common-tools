#!/usr/bin/env node
"use strict";

const plan = require("../../../packages/slideclone-native-engine/scripts/component-ir-replacement-plan");

if (require.main === module) {
  plan.main();
}

module.exports = plan;
