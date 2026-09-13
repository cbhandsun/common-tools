#!/usr/bin/env node
"use strict";

const pluginComponentInventory = require("../../../packages/slideclone-native-engine/scripts/plugin-component-inventory");

if (require.main === module) {
  pluginComponentInventory.main();
}

module.exports = pluginComponentInventory;
