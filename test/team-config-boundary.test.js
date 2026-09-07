"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { loadTeamConfig, parseEnabledCapabilities, teamDeploymentPlan } = require("../packages/team-runtime");

const base = {
  COMMON_TOOLS_DATABASE_URL: "postgresql://database.internal/common_tools?sslmode=verify-full",
  COMMON_TOOLS_REDIS_URL: "rediss://redis.internal:6380",
  COMMON_TOOLS_OBJECT_STORE_ENDPOINT: "https://objects.internal",
  COMMON_TOOLS_OBJECT_STORE_BUCKET: "common-tools-artifacts"
};
const fields = ["TEAM_MODE", "DATABASE_URL", "REDIS_URL", "OBJECT_STORE_ENDPOINT", "OBJECT_STORE_PUBLIC_ENDPOINT", "OBJECT_STORE_BUCKET", "WORKER_LEASE_SECONDS", "ARTIFACT_RETENTION_DAYS", "RETENTION_INTERVAL_SECONDS", "PROJECT_ACTIVE_JOB_LIMIT", "TEAM_CAPABILITIES"].map((name) => `COMMON_TOOLS_${name}`);

test("team config rejects non-string fields without invoking coercion or leaking errors", () => {
  let calls = 0;
  const hostile = { [Symbol.toPrimitive]() { calls++; throw new Error("secret-marker"); } };
  for (const field of fields) {
    for (const value of [null, false, 60, 60n, [], {}, hostile, Symbol("secret-marker")]) {
      assert.throws(() => loadTeamConfig({ ...base, [field]: value }), { message: `${field} must be a string` });
    }
    const input = { ...base };
    Object.defineProperty(input, field, { get() { throw new Error("secret-marker"); } });
    assert.throws(() => loadTeamConfig(input), { message: "team environment is invalid" });
  }
  assert.equal(calls, 0);
  for (const value of [null, [], false, "secret-marker", 1]) {
    assert.throws(() => loadTeamConfig(value), { message: "team environment is invalid" });
  }
});

test("team config snapshots only known fields once and preserves empty defaults", () => {
  const input = { ...base, COMMON_TOOLS_TEAM_MODE: "", COMMON_TOOLS_WORKER_LEASE_SECONDS: "", COMMON_TOOLS_OBJECT_STORE_PUBLIC_ENDPOINT: "  " };
  Object.defineProperty(input, "UNRELATED_SECRET", { get() { throw new Error("secret-marker"); } });
  let reads = 0;
  Object.defineProperty(input, "COMMON_TOOLS_DATABASE_URL", { get() { reads++; return base.COMMON_TOOLS_DATABASE_URL; } });
  const config = loadTeamConfig(input);
  assert.equal(reads, 1);
  assert.equal(config.mode, "production");
  assert.equal(config.workerLeaseSeconds, 60);
  assert.equal(config.objectStorePublicEndpoint, undefined);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.enabledCapabilities));
});

test("team numeric boundaries accept endpoints and reject malformed or extreme values", () => {
  for (const [field, key, min, max] of [
    ["WORKER_LEASE_SECONDS", "workerLeaseSeconds", 30, 600],
    ["ARTIFACT_RETENTION_DAYS", "artifactRetentionDays", 1, 3650],
    ["RETENTION_INTERVAL_SECONDS", "retentionIntervalSeconds", 300, 604800],
    ["PROJECT_ACTIVE_JOB_LIMIT", "projectActiveJobLimit", 1, 10000]
  ]) {
    const name = `COMMON_TOOLS_${field}`;
    for (const value of [min, max]) assert.equal(loadTeamConfig({ ...base, [name]: String(value) })[key], value);
    for (const value of [String(min - 1), String(max + 1), "NaN", "Infinity", "1.5", "9007199254740992", " "]) {
      assert.throws(() => loadTeamConfig({ ...base, [name]: value }), new RegExp(name));
    }
  }
});

test("team URL failures are safe and capability planning preserves direct capabilities", () => {
  for (const value of ["", "secret-marker", "postgresql://user:secret-marker@db/app?sslmode=verify-full"]) {
    assert.throws(() => loadTeamConfig({ ...base, COMMON_TOOLS_DATABASE_URL: value }), (error) => !error.message.includes("secret-marker"));
  }
  for (const value of ["", "project-audit,project-audit", "unknown", [], null]) assert.throws(() => parseEnabledCapabilities(value));
  const plan = teamDeploymentPlan("siyuan-note,project-audit");
  assert.deepEqual(plan.capabilities, ["project-audit", "siyuan-note"]);
  assert.equal(plan.workerServices.length, 1);
  assert.ok(Object.isFrozen(plan.workerProfiles));
});
