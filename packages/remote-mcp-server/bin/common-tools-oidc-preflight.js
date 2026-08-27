#!/usr/bin/env node
"use strict";

const { loadRemoteConfig, verifyOidcDiscovery } = require("..");

async function main(environment = process.env) {
  await verifyOidcDiscovery(loadRemoteConfig(environment));
  process.stdout.write("OIDC discovery preflight passed\n");
}

if (require.main === module) main().catch(() => { process.stderr.write("OIDC discovery preflight failed\n"); process.exitCode = 1; });

module.exports = { main };
