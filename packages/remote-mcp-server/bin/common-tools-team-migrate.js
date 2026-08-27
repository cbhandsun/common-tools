#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const { loadTeamConfig } = require("../../team-runtime");
const { runMigrations } = require("../../team-runtime/migrations");
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

async function main(environment = process.env) {
  const config = loadTeamConfig(environment);
  const secrets = loadTeamSecrets(environment);
  const url = new URL(config.databaseUrl);
  const pool = new Pool({ host: url.hostname, port: Number(url.port || 5432), database: url.pathname.slice(1), user: secrets.databaseUser, password: secrets.databasePassword, ssl: url.searchParams.get("sslmode") === "verify-full" ? { rejectUnauthorized: true } : undefined, max: 1 });
  try {
    const client = await pool.connect();
    try {
      const applied = await runMigrations({ client });
      process.stdout.write(applied.length ? `applied migrations: ${applied.join(", ")}\n` : "database schema is current\n");
    } finally { client.release(); }
  } finally { await pool.end(); }
}

if (require.main === module) main().catch((error) => { process.stderr.write(`team database migration failed: ${migrationFailureCode(error)}\n`); process.exitCode = 1; });

module.exports = { main, migrationFailureCode };
