"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { assertJobRepository, validateJobListFilter } = require("../packages/capability-contracts");
const { JobStore } = require("../packages/capability-runtime");

test("assertJobRepository validates repository contract", () => {
  assert.throws(() => assertJobRepository(null), /must be an object/);
  assert.throws(() => assertJobRepository(undefined), /must be an object/);
  assert.throws(() => assertJobRepository([]), /must be an object/);
  assert.throws(() => assertJobRepository("not a repo"), /must be an object/);
  assert.throws(() => assertJobRepository({}), /get must be a function/);
  assert.throws(() => assertJobRepository({ get: () => {} }), /create must be a function/);
  assert.throws(() => assertJobRepository({ get: () => {}, create: () => {} }), /findByIdempotency must be a function/);
  assert.throws(() => assertJobRepository({ get: () => {}, create: () => {}, findByIdempotency: () => {} }), /transition must be a function/);
  assert.throws(() => assertJobRepository({ get: () => {}, create: () => {}, findByIdempotency: () => {}, transition: () => {} }), /list must be a function/);

  const validRepo = {
    get: () => {},
    create: () => {},
    findByIdempotency: () => {},
    transition: () => {},
    list: () => []
  };
  assert.doesNotThrow(() => assertJobRepository(validRepo));
});

test("JobStore implements JobRepository interface via asJobRepository", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-repo-test-"));
  try {
    const store = new JobStore({ root: tmpDir, ownerId: "user-123" });
    assert.doesNotThrow(() => assertJobRepository(store));
    assert.equal(store.asJobRepository(), store);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("JobStore.list filters, paginates, and validates input", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-repo-test-"));
  try {
    const store = new JobStore({ root: tmpDir, ownerId: "user-123" });

    // Empty state
    assert.deepEqual(store.list(), []);

    // Create 3 test jobs
    const job1 = store.create({ id: "job-001", capability: "image-to-editable", idempotencyKey: "key-1" });
    const job2 = store.create({ id: "job-002", capability: "ppt-quality", idempotencyKey: "key-2" });
    const job3 = store.create({ id: "job-003", capability: "image-to-editable", idempotencyKey: "key-3" });

    // Verify all returned
    const all = store.list();
    assert.equal(all.length, 3);
    assert.equal(all[0].id, "job-001");
    assert.equal(all[1].id, "job-002");
    assert.equal(all[2].id, "job-003");

    // Filter by capability
    const editable = store.list({ capability: "image-to-editable" });
    assert.equal(editable.length, 2);
    assert.deepEqual(editable.map((j) => j.id), ["job-001", "job-003"]);

    // Transition a job and filter by status
    store.transition("job-001", "running");
    const running = store.list({ status: "running" });
    assert.equal(running.length, 1);
    assert.equal(running[0].id, "job-001");

    const queued = store.list({ status: "queued" });
    assert.equal(queued.length, 2);

    // Limit parameter
    const limited = store.list({ limit: 1 });
    assert.equal(limited.length, 1);
    assert.equal(limited[0].id, "job-001");

    // Combined filter
    const combined = store.list({ capability: "image-to-editable", status: "queued", limit: 10 });
    assert.equal(combined.length, 1);
    assert.equal(combined[0].id, "job-003");

    // Invalid filters
    assert.throws(() => store.list("invalid"), /filter must be an object/);
    assert.throws(() => store.list({ status: "not_a_status" }), /filter\.status is invalid/);
    assert.throws(() => store.list({ limit: 0 }), /filter\.limit must be an integer between 1 and 1000/);
    assert.throws(() => store.list({ limit: 1001 }), /filter\.limit must be an integer between 1 and 1000/);
    assert.throws(() => store.list({ limit: 3.5 }), /filter\.limit must be an integer between 1 and 1000/);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("JobStore isolates jobs by owner in reads, lists, idempotency, and writes", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "job-repo-owner-test-"));
  try {
    const ownerA = new JobStore({ root: tmpDir, ownerId: "owner-a" });
    const ownerB = new JobStore({ root: tmpDir, ownerId: "owner-b" });

    const created = ownerA.create({ id: "shared-id", capability: "image-to-editable", idempotencyKey: "same-key" });
    assert.equal(created.ownerId, "owner-a");

    assert.equal(ownerB.get("shared-id"), null);
    assert.equal(ownerB.findByIdempotency("image-to-editable", "same-key"), null);
    assert.deepEqual(ownerB.list(), []);
    assert.throws(() => ownerB.write({ ...created, ownerId: "owner-b" }), /owner does not match/);
    assert.throws(() => ownerB.create({ id: "shared-id", capability: "image-to-editable", idempotencyKey: "other-key" }), /owner does not match/);

    assert.equal(ownerA.get("shared-id").ownerId, "owner-a");
    assert.deepEqual(ownerA.list().map((job) => job.id), ["shared-id"]);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("validateJobListFilter normalizes shared repository filter semantics", () => {
  assert.deepEqual(validateJobListFilter(), { capability: null, status: null, limit: null });
  assert.deepEqual(validateJobListFilter(null, { defaultLimit: 100 }), { capability: null, status: null, limit: 100 });
  assert.deepEqual(validateJobListFilter({ capability: " ppt-quality ", status: "queued", limit: 2 }), { capability: "ppt-quality", status: "queued", limit: 2 });
  assert.throws(() => validateJobListFilter({ capability: "" }), /filter\.capability/);
  assert.throws(() => validateJobListFilter({ status: "bogus" }), /filter\.status is invalid/);
  assert.throws(() => validateJobListFilter({ limit: "10" }), /filter\.limit must be an integer/);
  assert.throws(() => validateJobListFilter({ limit: Number.NaN }), /filter\.limit must be an integer/);
  assert.throws(() => validateJobListFilter({}, { defaultLimit: 0 }), /filter default limit/);
});
