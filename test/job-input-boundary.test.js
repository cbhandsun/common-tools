"use strict";

const {validateArtifacts} = require("../packages/team-runtime/job-row-reader");
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { ownerPrefix } = require("../packages/team-runtime/job-input");
const { createTeamJob, normalizeTeamJobOptions } = require("../packages/team-runtime");
function input(overrides = {}) {
  return { capability: "project-audit", ownerId: "fixture-owner", idempotencyKey: "fixture:key-1",
    inputObjectKey: `owners/${crypto.createHash("sha256").update("fixture-owner").digest("hex")}/inputs/source`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), ...overrides };
}

test("Job idempotency keys enforce the public contract after whitespace normalization", () => {
  assert.equal(createTeamJob(input({ idempotencyKey: "  key-1  " })).idempotencyKey, "key-1");
  assert.equal(createTeamJob(input({ idempotencyKey: "x".repeat(128) })).idempotencyKey.length, 128);
  for (const idempotencyKey of ["", " ", "x".repeat(129), "x".repeat(100000), "key/content", "a\nb", "a b", "a\0b", {}, null]) {
    assert.throws(() => createTeamJob(input({ idempotencyKey })), /idempotencyKey/);
  }
});

test("Job expiry avoids object coercion and preserves supported date forms", () => {
  const future = Date.now() + 3600000;
  for (const expiresAt of [future, new Date(future), new Date(future).toISOString()]) assert.equal(createTeamJob(input({ expiresAt })).expiresAt, new Date(future).toISOString());
  let coerced = false;
  const hostile = { [Symbol.toPrimitive]() { coerced = true; throw new Error("private-token"); } };
  for (const expiresAt of [hostile, {}, [], null, false, Infinity, NaN, 0, new Date(NaN), "not-a-date", 1n]) {
    assert.throws(() => createTeamJob(input({ expiresAt })), { message: "expiresAt must be in the future" });
  }
  assert.equal(coerced, false);
});

test("Job getters fail safely, read once, and ignore unrelated properties", () => {
  for (const field of ["capability", "ownerId", "projectId", "idempotencyKey", "inputObjectKey", "expiresAt", "maxAttempts", "traceParent", "options"]) {
    const value = input();
    Object.defineProperty(value, field, { get() { throw new Error("private-token"); } });
    assert.throws(() => createTeamJob(value), { message: "team Job input is invalid" });
  }
  const value = input(); let count = 0;
  Object.defineProperty(value, "ownerId", { get() { count++; return "fixture-owner"; } });
  Object.defineProperty(value, "ignored", { get() { throw new Error("private-token"); } });
  assert.equal(createTeamJob(value).ownerId, "fixture-owner");
  assert.equal(count, 1);
  for (const invalid of [null, [], 0, "", undefined]) assert.throws(() => createTeamJob(invalid), /team Job input/);
});

test("Job attempts, ownership, trace privacy and option validation remain enforced", () => {
  const traceParent = `00-${"a".repeat(32)}-${"b".repeat(16)}-01`;
  const job = createTeamJob(input({ maxAttempts: 5, traceParent }));
  assert.ok(Object.isFrozen(job)); assert.equal(job.maxAttempts, 5); assert.equal(job.traceParent, traceParent);
  assert.equal(JSON.stringify(job).includes(traceParent), false);
  for (const maxAttempts of [0, 6, 1.5, Infinity, "2", {}, null]) assert.throws(() => createTeamJob(input({ maxAttempts })), /maxAttempts/);
  assert.throws(() => createTeamJob(input({ inputObjectKey: "owners/other/inputs/file" })), /owner input prefix/);
  assert.throws(() => createTeamJob(input({ capability: "siyuan-note" })), /unsupported capability/);
  const options = {}; Object.defineProperty(options, "repairProfile", { enumerable: true, get() { throw new Error("private-token"); } });
  assert.throws(() => normalizeTeamJobOptions("ppt-improve", options), { message: "team Job input is invalid" });
  assert.deepEqual(normalizeTeamJobOptions("ppt-improve", { repairProfile: "safe-package" }), { repairProfile: "safe-package" });
});


test("database execution state rejects invalid fields without coercion and preserves historical dates", () => {
  const { readJobRowState } = require("../packages/team-runtime/job-row-state");
  const base = { status: "expired", attempt: 0, max_attempts: 1, created_at: new Date("2020-01-01T00:00:00Z"), updated_at: "2020-01-02T00:00:00Z", expires_at: "2020-01-03T00:00:00Z" };
  assert.equal(readJobRowState(base).expiresAt, "2020-01-03T00:00:00.000Z");
  assert.equal(readJobRowState(base).lease, undefined);
  assert.equal(Object.isFrozen(readJobRowState(base)), true);
  assert.deepEqual(readJobRowState({ ...base, lease_owner: "worker-1", lease_expires_at: base.expires_at }).lease, { workerId: "worker-1", expiresAt: "2020-01-03T00:00:00.000Z" });
  for (const patch of [{ status: "unknown" }, { status: "toString" }, { attempt: "1" }, { attempt: -1 }, { attempt: 0.5 }, { attempt: Infinity }, { max_attempts: 0 }, { max_attempts: 2147483648 }, { created_at: null }, { updated_at: "" }, { expires_at: new Date(NaN) }, { lease_owner: "worker" }, { lease_expires_at: base.expires_at }, { lease_owner: " ", lease_expires_at: base.expires_at }]) {
    assert.throws(() => readJobRowState({ ...base, ...patch }), (error) => error.message === "database job state is invalid");
  }
  for (const value of [null, [], {}, 1]) assert.throws(() => readJobRowState(value), /database job state is invalid/);
  let coerced = false;
  assert.throws(() => readJobRowState({ ...base, created_at: { valueOf() { coerced = true; throw new Error("secret"); } } }), /database job state is invalid/);
  assert.equal(coerced, false);
  assert.throws(() => readJobRowState({ ...base, get status() { throw new Error("secret"); } }), (error) => error.message === "database job state is invalid");
  const date = new Date("2020-01-01T00:00:00Z"); date.getTime = () => { throw new Error("must not call override"); };
  assert.equal(readJobRowState({ ...base, created_at: date }).createdAt, "2020-01-01T00:00:00.000Z");
});


test("database identity enforces the same ownership paths as job creation and retention", () => {
  const { readJobRowIdentity } = require("../packages/team-runtime/job-row-state");
  const job = createTeamJob(input());
  const row = { id: job.id, capability: job.capability, owner_id: job.ownerId, idempotency_key: job.idempotencyKey, input_object_key: job.inputObjectKey, output_prefix: job.outputPrefix };
  assert.equal(readJobRowIdentity(row, [job.capability]).outputPrefix, job.outputPrefix);
  for (const patch of [
    { owner_id: "another-owner" }, { id: "another-job" },
    { input_object_key: `${ownerPrefix("another-owner")}inputs/source` },
    { input_object_key: `${ownerPrefix(job.ownerId)}jobs/${job.id}/source` },
    { output_prefix: `${ownerPrefix("another-owner")}jobs/${job.id}/` },
    { output_prefix: `${ownerPrefix(job.ownerId)}jobs/another-job/` },
    { output_prefix: ownerPrefix(job.ownerId) },
    { output_prefix: `${job.outputPrefix}attempt-1/` }
  ]) assert.throws(() => readJobRowIdentity({ ...row, ...patch }, [job.capability]), error => error.message === "database job identity is invalid");
});

test("database identity checks scalar and path boundaries without coercing opaque IDs", () => {
  const { readJobRowIdentity } = require("../packages/team-runtime/job-row-state");
  const base = { id: "historic-id", capability: "project-audit", owner_id: "owner", idempotency_key: "historic key", input_object_key: `${ownerPrefix("owner")}inputs/data`, output_prefix: `${ownerPrefix("owner")}jobs/historic-id/` };
  const result = readJobRowIdentity(base, ["project-audit"]);
  assert.equal(result.id, base.id); assert.equal(result.projectId, undefined); assert.equal(Object.isFrozen(result), true);
  for (const field of ["id", "owner_id", "idempotency_key"]) {
    for (const value of [null, {}, "", "x".repeat(4097), String.fromCharCode(0)]) assert.throws(() => readJobRowIdentity({ ...base, [field]: value }, ["project-audit"]), /database job identity is invalid/);
  }
  assert.throws(() => readJobRowIdentity({ ...base, get owner_id() { throw new Error("private"); } }, ["project-audit"]), (error) => error.message === "database job identity is invalid");
  assert.equal(readJobRowIdentity({ ...base, project_id: "project-one" }, ["project-audit"]).projectId, "project-one");
});

test("artifact hash admission does not coerce objects or expose extra fields", () => {
  let calls=0;
  const artifact={name:"deck.pptx",objectKey:"owners/a/jobs/job/deck.pptx",mediaType:"application/octet-stream",sha256:"a".repeat(64),headers:"private"};
  assert.deepEqual(validateArtifacts({outputPrefix:"owners/a/jobs/job/"},[artifact]),[{name:artifact.name,objectKey:artifact.objectKey,mediaType:artifact.mediaType,sha256:artifact.sha256}]);
  const unsafe={...artifact,sha256:{toString(){calls++;return "a".repeat(64);}}};
  assert.throws(()=>validateArtifacts({outputPrefix:"owners/a/jobs/job/"},[unsafe]),/worker artifact is invalid/);
  assert.equal(calls,0);
});
