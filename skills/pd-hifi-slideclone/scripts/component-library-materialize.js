#!/usr/bin/env node
"use strict";

const componentLibraryMaterialize = require("../../../packages/slideclone-native-engine/scripts/component-library-materialize");

if (require.main === module) {
  componentLibraryMaterialize.main();
}

module.exports = componentLibraryMaterialize;
