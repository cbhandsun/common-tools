#!/usr/bin/env node
"use strict";

const refresh = require("../../../packages/slideclone-native-engine/scripts/component-library-refresh");

if (require.main === module) {
  refresh.main();
}

module.exports = refresh;
