#!/usr/bin/env node
"use strict";

const islideComponentSearch = require("../../../packages/slideclone-native-engine/scripts/islide-component-search");

if (require.main === module) {
  islideComponentSearch.main();
}

module.exports = islideComponentSearch;
