"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  SqliteJobRepository,
  assertJobRepository,
  isSqliteJobRepositoryAvailable
} = require("../packages/capability-runtime");

const sqliteAvailable = isSqliteJobRepositoryAvailable();

test("SqliteJobRepository satisfies JobRepository and persists jobs", { skip: sqliteAvailable ? false : "node:sqlite unavailable" }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-job-repo-"));
  try {
    const repo = new SqliteJobRepository({ root: tmpDir, ownerId: "user-123" });
    assert.doesNotThrow(() => assertJobRepository(repo));
    assert.equal(repo.asJobRepository(), repo);

    const created = repo.create({ id: "job-001", capability: "image-to-editable", idempotencyKey: "idem-1" });
    assert.equal(created.status, "queued");
    assert.equal(created.ownerId, "user-123");

    const duplicate = repo.create({ id: "job-duplicate", capability: "image-to-editable", idempotencyKey: "idem-1" });
    assert.equal(duplicate.id, "job-001");

    const running = repo.transition("job-001", "running", { progress: 0.5 });
    assert.equal(running.status, "running");
    assert.equal(running.progress, 0.5);

    repo.close();

    const reopened = new SqliteJobRepository({ root: tmpDir, ownerId: "user-123" });
    const loaded = reopened.get("job-001");
    assert.equal(loaded.status, "running");
    assert.equal(loaded.progress, 0.5);
    reopened.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteJobRepository filters, limits, and isolates owners", { skip: sqliteAvailable ? false : "node:sqlite unavailable" }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-job-repo-"));
  try {
    const repoA = new SqliteJobRepository({ root: tmpDir, ownerId: "owner-a" });
    const repoB = new SqliteJobRepository({ root: tmpDir, ownerId: "owner-b" });

    repoA.create({ id: "job-a1", capability: "image-to-editable", idempotencyKey: "a1" });
    repoA.create({ id: "job-a2", capability: "ppt-quality", idempotencyKey: "a2" });
    repoA.create({ id: "job-a3", capability: "image-to-editable", idempotencyKey: "a3" });
    repoB.create({ id: "job-b1", capability: "image-to-editable", idempotencyKey: "b1" });
    repoA.transition("job-a1", "running");

    assert.deepEqual(repoA.list().map((job) => job.id), ["job-a1", "job-a2", "job-a3"]);
    assert.deepEqual(repoA.list({ capability: "image-to-editable" }).map((job) => job.id), ["job-a1", "job-a3"]);
    assert.deepEqual(repoA.list({ status: "running" }).map((job) => job.id), ["job-a1"]);
    assert.deepEqual(repoA.list({ capability: "image-to-editable", status: "queued", limit: 1 }).map((job) => job.id), ["job-a3"]);
    assert.deepEqual(repoB.list().map((job) => job.id), ["job-b1"]);

    assert.throws(() => repoA.list({ limit: 0 }), /filter\.limit must be an integer/);
    assert.throws(() => repoA.write({ id: "foreign", ownerId: "owner-b", capability: "ppt-quality", idempotencyKey: "x", status: "queued", artifacts: [] }), /owner does not match/);

    repoA.close();
    repoB.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("SqliteJobRepository constrains database filenames to the runtime root", { skip: sqliteAvailable ? false : "node:sqlite unavailable" }, () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sqlite-job-repo-"));
  try {
    assert.throws(() => new SqliteJobRepository({ root: tmpDir, ownerId: "user", filename: "../jobs.sqlite" }), /simple \.sqlite filename/);
    assert.throws(() => new SqliteJobRepository({ root: tmpDir, ownerId: "user", filename: "jobs.db" }), /simple \.sqlite filename/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
