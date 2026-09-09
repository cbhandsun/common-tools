#!/usr/bin/env node
"use strict";

const session = require("../../../packages/slideclone-native-engine/scripts/component-isolated-collection-session");

if (require.main === module) {
  session.main();
}

module.exports = session;
