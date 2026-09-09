#!/usr/bin/env node
"use strict";

const componentLibraryStorageAudit = require("../../../packages/slideclone-native-engine/scripts/component-library-storage-audit");

if (require.main === module) {
  componentLibraryStorageAudit.main();
}

module.exports = componentLibraryStorageAudit;
