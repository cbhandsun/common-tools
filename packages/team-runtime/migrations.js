"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const MIGRATION_FILE = /^\d{3}_[a-z0-9_]+\.sql$/;
const ADVISORY_LOCK_ID = 64021101;

function migrationDirectory(directory = path.join(__dirname, "schema")) {
  if (typeof directory !== "string" || !path.isAbsolute(directory)) throw new TypeError("migration directory must be absolute");
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && MIGRATION_FILE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
  if (!entries.length) throw new Error("no migration files were found");
  return entries.map((name) => {
    const sql = fs.readFileSync(path.join(directory, name), "utf8");
    if (!sql.trim()) throw new Error(`migration ${name} is empty`);
    return Object.freeze({ name, sql, sha256: crypto.createHash("sha256").update(sql, "utf8").digest("hex") });
  });
}
function assertClient(client) {
  if (!client || typeof client.query !== "function") throw new TypeError("migration client is incomplete");
  return client;
}
async function runMigrations({ client, directory } = {}) {
  const database = assertClient(client);
  const migrations = migrationDirectory(directory);
  const applied = [];
  await database.query("SELECT pg_advisory_lock($1::bigint)", [ADVISORY_LOCK_ID]);
  try {
    await database.query("CREATE TABLE IF NOT EXISTS common_tools_schema_migrations (filename TEXT PRIMARY KEY, sha256 TEXT NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'), applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())");
    const known = await database.query("SELECT filename, sha256 FROM common_tools_schema_migrations");
    const checksums = new Map((known.rows || []).map((row) => [row.filename, row.sha256]));
    for (const migration of migrations) {
      const existing = checksums.get(migration.name);
      if (existing && existing !== migration.sha256) throw new Error(`migration checksum mismatch: ${migration.name}`);
      if (existing) continue;
      await database.query("BEGIN");
      try {
        await database.query(migration.sql);
        await database.query("INSERT INTO common_tools_schema_migrations (filename, sha256) VALUES ($1, $2)", [migration.name, migration.sha256]);
        await database.query("COMMIT");
        applied.push(migration.name);
      } catch (error) {
        await database.query("ROLLBACK");
        throw error;
      }
    }
    return Object.freeze(applied);
  } finally {
    await database.query("SELECT pg_advisory_unlock($1::bigint)", [ADVISORY_LOCK_ID]);
  }
}

module.exports = { migrationDirectory, runMigrations };
