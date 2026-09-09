"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { inspectMigrations, migrationDirectory, runMigrations } = require("../packages/team-runtime/migrations");
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

test("team schema migrates existing databases to the complete remote capability catalog", () => {
  const migration = fs.readFileSync(path.join(__dirname, "..", "packages", "team-runtime", "schema", "009_capability_job_catalog.sql"), "utf8");
  assert.match(migration, /DROP CONSTRAINT IF EXISTS capability_jobs_capability_check/u);
  assert.match(migration, /ADD CONSTRAINT capability_jobs_capability_check/u);
  assert.match(migration, /VALIDATE CONSTRAINT capability_jobs_capability_check/u);
  for (const capability of ["image-to-editable", "ppt-create", "ppt-improve", "ppt-quality", "project-audit", "siyuan-note"]) {
    assert.match(migration, new RegExp(`'${capability}'`, "u"));
  }
});

test("team migration status reports pending required delivery migrations without applying SQL", async () => {
  const directory = fixtureDirectory();
  try {
    const migrations = migrationDirectory(directory);
    const calls = [];
    const client = { query: async (sql) => {
      calls.push(sql);
      if (sql.startsWith("SELECT to_regclass")) return { rows: [{ name: "common_tools_schema_migrations" }] };
      if (sql.startsWith("SELECT filename")) return { rows: [{ filename: migrations[0].name, sha256: migrations[0].sha256 }] };
      throw new Error("unexpected write");
    } };
    const status = await inspectMigrations({ client, directory, required: [migrations[1].name] });
    assert.deepEqual(status, {
      schemaTableExists: true,
      current: false,
      applied: [migrations[0].name],
      pending: [migrations[1].name],
      checksumMismatches: [],
      unknownApplied: [],
      required: [migrations[1].name],
      missingRequired: [migrations[1].name]
    });
    assert.equal(calls.some((sql) => sql === "BEGIN" || sql.startsWith("INSERT ") || sql.startsWith("CREATE ")), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("team migration status flags checksum drift and absent migration table safely", async () => {
  const directory = fixtureDirectory();
  try {
    const migrations = migrationDirectory(directory);
    const missingTable = await inspectMigrations({ client: { query: async () => ({ rows: [{ name: null }] }) }, directory, required: [migrations[0].name] });
    assert.equal(missingTable.schemaTableExists, false);
    assert.deepEqual(missingTable.pending, migrations.map((migration) => migration.name));
    assert.deepEqual(missingTable.missingRequired, [migrations[0].name]);
    let selected = false;
    const drift = await inspectMigrations({ client: { query: async (sql) => {
      if (sql.startsWith("SELECT to_regclass")) return { rows: [{ name: "common_tools_schema_migrations" }] };
      if (sql.startsWith("SELECT filename")) { selected = true; return { rows: [{ filename: migrations[0].name, sha256: "0".repeat(64) }, { filename: "999_future.sql", sha256: "1".repeat(64) }] }; }
      throw new Error("unexpected SQL");
    } }, directory });
    assert.equal(selected, true);
    assert.deepEqual(drift.checksumMismatches, [migrations[0].name]);
    assert.deepEqual(drift.unknownApplied, ["999_future.sql"]);
    assert.equal(drift.current, false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
