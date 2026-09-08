"use strict";

const api = require("../packages/cli/verification/verify-capability-catalogs");
const { verifyCapabilityCatalogs } = api;

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyCapabilityCatalogs(), null, 2)}\n`);

module.exports = api;
