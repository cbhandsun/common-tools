"use strict";

const api = require("../packages/cli/verification/verify-plugins");
const { verifyPluginPackaging } = api;

if (require.main === module) process.stdout.write(`${JSON.stringify(verifyPluginPackaging(), null, 2)}\n`);

module.exports = api;
