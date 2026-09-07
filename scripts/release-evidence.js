#!/usr/bin/env node
"use strict";

const api = require("../packages/cli/verification/release-evidence");
const { parseArguments, verifyReleaseEvidence, verifyReleaseEvidenceFile, writeReleaseEvidence } = api;

if (require.main === module) {
  try {
    const options = parseArguments(process.argv.slice(2));
    const result = options.verify ? (options.sbomPath ? verifyReleaseEvidence(options) : verifyReleaseEvidenceFile(options)) : writeReleaseEvidence(options);
    process.stdout.write(`release evidence ${options.verify ? "verified" : "generated"} (${result.deployable ? "deployable" : "source-only"})\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : "release evidence failed"}\n`);
    process.exitCode = 1;
  }
}

module.exports = api;
