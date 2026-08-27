#!/usr/bin/env node
"use strict";

const { schedulerMain } = require("./common-tools-team-retention");

if (require.main === module) schedulerMain().catch(() => {
  process.stderr.write("team retention scheduler failed\n");
  process.exitCode = 1;
});

module.exports = { main: schedulerMain };
