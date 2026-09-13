#!/usr/bin/env node
"use strict";

const officeplusComponentSearch = require("../../../packages/slideclone-native-engine/scripts/officeplus-component-search");

if (require.main === module) {
  officeplusComponentSearch.main();
}

module.exports = officeplusComponentSearch;
