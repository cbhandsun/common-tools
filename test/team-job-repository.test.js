"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { assertJobRepository } = require("../packages/capability-contracts");
const { PostgresJobRepository } = require("../packages/team-runtime");

test("PostgresJobRepository satisfies assertJobRepository and asJobRepository", () => {
  const repo = new PostgresJobRepository({ query: async () => ({ rows: [] }) });
  assert.doesNotThrow(() => assertJobRepository(repo));
  assert.equal(repo.asJobRepository(), repo);
});

test("PostgresJobRepository.findByIdempotency queries by capability and key", async () => {
  let capturedSql = "";
  let capturedParams = [];
  const repo = new PostgresJobRepository({
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    }
  });

  const result = await repo.findByIdempotency("image-to-editable", "idemp-123");
  assert.equal(result, null);
  assert.match(capturedSql, /SELECT \* FROM capability_jobs WHERE capability = \$1 AND idempotency_key = \$2/);
  assert.deepEqual(capturedParams, ["image-to-editable", "idemp-123"]);

  await assert.rejects(() => repo.findByIdempotency("", "key"), /capability/);
  await assert.rejects(() => repo.findByIdempotency("image-to-editable", ""), /idempotencyKey/);
});

test("PostgresJobRepository.list queries with filters and limit", async () => {
  let capturedSql = "";
  let capturedParams = [];
  const repo = new PostgresJobRepository({
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    }
  });

  const result = await repo.list({ capability: "project-audit", status: "queued", limit: 10 });
  assert.deepEqual(result, []);
  assert.match(capturedSql, /capability = \$1 AND status = \$2/);
  assert.match(capturedSql, /LIMIT \$3/);
  assert.deepEqual(capturedParams, ["project-audit", "queued", 10]);

  // Invalid filters
  await assert.rejects(() => repo.list("invalid"), /filter must be an object/);
  await assert.rejects(() => repo.list({ status: "not_a_status" }), /filter\.status is invalid/);
  await assert.rejects(() => repo.list({ limit: 0 }), /filter\.limit must be an integer between 1 and 1000/);
  await assert.rejects(() => repo.list({ limit: 1001 }), /filter\.limit must be an integer between 1 and 1000/);
  await assert.rejects(() => repo.list({ limit: "10" }), /filter\.limit must be an integer between 1 and 1000/);
  await assert.rejects(() => repo.list({ limit: 3.5 }), /filter\.limit must be an integer between 1 and 1000/);
});

test("PostgresJobRepository.get supports single ID argument or with ownerId", async () => {
  let capturedSql = "";
  let capturedParams = [];
  const repo = new PostgresJobRepository({
    query: async (sql, params) => {
      capturedSql = sql;
      capturedParams = params;
      return { rows: [] };
    }
  });

  // Single argument
  await repo.get("job-456");
  assert.match(capturedSql, /SELECT \* FROM capability_jobs WHERE id = \$1/);
  assert.deepEqual(capturedParams, ["job-456"]);

  // Two arguments
  await repo.get("job-456", "user-789");
  assert.match(capturedSql, /SELECT \* FROM capability_jobs WHERE id = \$1 AND owner_id = \$2/);
  assert.deepEqual(capturedParams, ["job-456", "user-789"]);
});
