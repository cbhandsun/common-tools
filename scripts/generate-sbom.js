#!/usr/bin/env node
"use strict";

const api = require("../packages/cli/verification/generate-sbom");
const { generateSbom, parseArguments } = api;

if (require.main === module) {
  try {
    const result = generateSbom(parseArguments(process.argv.slice(2)));
    process.stdout.write(`SPDX SBOM generated (${result.packageCount} packages)\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "SBOM generation failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = api;
