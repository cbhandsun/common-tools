#!/usr/bin/env node
"use strict";

const crypto = require("node:crypto");
const { S3Client } = require("@aws-sdk/client-s3");
const { loadTeamConfig } = require("../../team-runtime");
const { runObjectStoreRestoreDrill } = require("../../team-runtime/object-store-drill");
const { loadTeamSecrets } = require("../team-providers");

async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  const secrets = loadTeamSecrets(environment);
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const client = new S3Client({ endpoint: config.objectStoreEndpoint, forcePathStyle: true, region: "us-east-1", credentials: { accessKeyId: secrets.objectStoreAccessKeyId, secretAccessKey: secrets.objectStoreSecretAccessKey } });
  await runObjectStoreRestoreDrill({ client, sourceBucket: `ct-dr-source-${suffix}`, backupBucket: `ct-dr-backup-${suffix}` });
  process.stdout.write("team object-store restore drill passed\n");
}

if (require.main === module) main().catch(() => { process.stderr.write("team object-store restore drill failed\n"); process.exitCode = 1; });

module.exports = { main };
