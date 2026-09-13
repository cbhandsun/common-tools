#!/usr/bin/env node
"use strict";

const loop = require("../../../packages/slideclone-native-engine/scripts/component-replacement-close-loop");

if (require.main === module) {
  loop.main();
}

module.exports = loop;
