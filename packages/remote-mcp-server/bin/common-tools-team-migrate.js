#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const { loadTeamConfig } = require("../../team-runtime");
const { REQUIRED_PRODUCTION_MIGRATIONS, inspectMigrations, runMigrations } = require("../../team-runtime/migrations");
const { loadTeamSecrets } = require("../team-providers");

function migrationFailureCode(error) {
  const code = error && typeof error === "object" && typeof error.code === "string" ? error.code : "";
  if (code === "28P01") return "database_authentication_failed";
  if (code === "3D000") return "database_not_found";
  if (["ECONNREFUSED", "ENOTFOUND", "ETIMEDOUT"].includes(code)) return "database_unavailable";
  const message = error && typeof error === "object" && typeof error.message === "string" ? error.message : "";
  if (message.startsWith("migration checksum mismatch:")) return "migration_checksum_mismatch";
  return "migration_failed";
}

function createMigrationPool(config, secrets, PoolClass = Pool) {
  const url = new URL(config.databaseUrl);
  return new PoolClass({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: secrets.databaseUser, password: secrets.databasePassword, ssl: url.searchParams.get("sslmode") === "verify-full" ? { rejectUnauthorized: true } : undefined, max: 1 });
}

async function runMigrationCommand(environment = process.env, argv = process.argv.slice(2), { PoolClass = Pool, output = process.stdout } = {}) {
  if (!Array.isArray(argv) || argv.some((item) => item !== "--status")) throw new Error("team migration command accepts only --status");
  if (!output || typeof output.write !== "function") throw new TypeError("migration command output is invalid");
  const statusOnly = argv.includes("--status");
  const config = loadTeamConfig(environment);
  const secrets = loadTeamSecrets(environment);
  const pool = createMigrationPool(config, secrets, PoolClass);
  try {
    const client = await pool.connect();
    try {
      if (statusOnly) {
        const status = await inspectMigrations({ client, required: REQUIRED_PRODUCTION_MIGRATIONS });
        output.write(`${JSON.stringify(status)}\n`);
      } else {
        const applied = await runMigrations({ client });
        output.write(applied.length ? `applied migrations: ${applied.join(", ")}\n` : "database schema is current\n");
      }
    } finally { client.release(); }
  } finally { await pool.end(); }
}

async function main(environment = process.env, argv = process.argv.slice(2)) {
  return runMigrationCommand(environment, argv);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`team database migration failed: ${migrationFailureCode(error)}\n`); process.exitCode = 1; });

module.exports = { createMigrationPool, main, migrationFailureCode, runMigrationCommand };
