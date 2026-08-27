"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { migrationDirectory, runMigrations } = require("../packages/team-runtime/migrations");
const { migrationFailureCode } = require("../packages/remote-mcp-server/bin/common-tools-team-migrate");

function fixtureDirectory() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-migrations-"));
  fs.writeFileSync(path.join(directory, "001_first.sql"), "SELECT 1;\n", "utf8");
  fs.writeFileSync(path.join(directory, "002_second.sql"), "SELECT 2;\n", "utf8");
  return directory;
}
test("team migrations execute once under an advisory lock and record checksums", async () => {
  const directory = fixtureDirectory();
  const checksums = new Map();
  const calls = [];
  const client = { query: async (sql, values = []) => {
    calls.push([sql, values]);
    if (sql.startsWith("SELECT filename")) return { rows: [...checksums].map(([filename, sha256]) => ({ filename, sha256 })) };
    if (sql.startsWith("INSERT INTO common_tools_schema_migrations")) checksums.set(values[0], values[1]);
    return { rows: [] };
  } };
  try {
    assert.deepEqual(await runMigrations({ client, directory }), ["001_first.sql", "002_second.sql"]);
    assert.deepEqual(await runMigrations({ client, directory }), []);
    assert.equal(calls.filter(([sql]) => sql === "BEGIN").length, 2);
    assert.equal(calls.filter(([sql]) => sql.includes("pg_advisory_unlock")).length, 2);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
test("team migrations reject empty files and changed applied checksums", async () => {
  const directory = fixtureDirectory();
  try {
    fs.writeFileSync(path.join(directory, "003_empty.sql"), "\n", "utf8");
    assert.throws(() => migrationDirectory(directory), /empty/);
    fs.unlinkSync(path.join(directory, "003_empty.sql"));
    const migrations = migrationDirectory(directory);
    const client = { query: async (sql) => sql.startsWith("SELECT filename") ? { rows: [{ filename: migrations[0].name, sha256: "0".repeat(64) }] } : { rows: [] } };
    await assert.rejects(() => runMigrations({ client, directory }), /checksum mismatch/);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("team migration startup diagnostics expose only fixed failure classes", () => {
  assert.equal(migrationFailureCode({ code: "28P01", message: "password=do-not-return" }), "database_authentication_failed");
  assert.equal(migrationFailureCode({ code: "3D000" }), "database_not_found");
  assert.equal(migrationFailureCode({ code: "ECONNREFUSED" }), "database_unavailable");
  assert.equal(migrationFailureCode(new Error("migration checksum mismatch: 001_jobs.sql")), "migration_checksum_mismatch");
  assert.equal(migrationFailureCode(new Error("database=https://credential.example")), "migration_failed");
});
