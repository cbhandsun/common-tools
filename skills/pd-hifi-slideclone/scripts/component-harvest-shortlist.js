#!/usr/bin/env node
"use strict";

const shortlist = require("../../../packages/slideclone-native-engine/scripts/component-harvest-shortlist");

if (require.main === module) {
  shortlist.main();
}

module.exports = shortlist;
