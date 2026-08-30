#!/usr/bin/env node
"use strict";

const { canaryOptions, runRemoteAccessCanary } = require("../packages/cli/remote-access-canary");

runRemoteAccessCanary(canaryOptions()).then((report) => {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.passed) process.exitCode = 1;
}).catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "remote access canary failed"}\n`);
  process.exitCode = 1;
});
