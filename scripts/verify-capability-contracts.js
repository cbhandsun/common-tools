"use strict";

const api = require("../packages/cli/verification/verify-capability-contracts");
const { verifyCapabilityToolContracts } = api;

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyCapabilityToolContracts(), null, 2)}\n`);

module.exports = api;
