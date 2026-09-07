"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { collectRetentionOutputKeys } = require("../packages/team-runtime/retention-output-keys");
const { createObjectStore } = require("../packages/remote-mcp-server/team-providers");
const { runTeamRetention } = require("../packages/team-runtime");
const crypto = require("node:crypto");
const owner = "retention-fixture";
const root = `owners/${crypto.createHash("sha256").update(owner).digest("hex")}/`;
const prefix = `${root}jobs/job/`;

test("retention listing walks pages, deduplicates keys and permits an empty result", async () => {
  const calls = [];
  const result = await collectRetentionOutputKeys({ prefix, listPage: async (input) => {
    calls.push(input);
    return input.continuationToken ? { keys: [`${prefix}attempts/1/a`, `${prefix}attempts/2/b`], nextToken: null } : { keys: [`${prefix}attempts/1/a`], nextToken: "next" };
  } });
  assert.deepEqual(result, [`${prefix}attempts/1/a`, `${prefix}attempts/2/b`]);
  assert.equal(calls[1].continuationToken, "next");
  assert.deepEqual(await collectRetentionOutputKeys({ prefix, listPage: async () => ({ keys: [], nextToken: null }) }), []);
});

test("listing rejects unsafe keys, malformed pages, repeated cursors and excessive pagination", async () => {
  for (const response of [null, {}, { keys: new Array(1001), nextToken: null }, ...[null, "private", `${root}jobs/other/file`, `${prefix}../file`, `${prefix}a\0`, `${prefix}a\\b`].map((key) => ({ keys: [key], nextToken: null }))]) {
    await assert.rejects(collectRetentionOutputKeys({ prefix, listPage: async () => response }), (error) => /retention/.test(error.message) && !error.message.includes("private"));
  }
  await assert.rejects(collectRetentionOutputKeys({ prefix, listPage: async () => ({ keys: [], nextToken: "same" }) }), /cursor/);
  let page = 0;
  await assert.rejects(collectRetentionOutputKeys({ prefix, listPage: async () => ({ keys: [], nextToken: String(++page) }) }), /page limit/);
  assert.equal(page, 10);
  await assert.rejects(collectRetentionOutputKeys({ prefix: `${root}jobs/`, listPage: async () => { throw new Error("must not list"); } }), /prefix/);
});

test("S3 adapter uses a job prefix and bounded continuation, rejecting invalid transport results", async () => {
  const calls = [];
  const store = createObjectStore({ send: async (command) => { calls.push(command); return { Contents: [{ Key: `${prefix}a` }], IsTruncated: true, NextContinuationToken: "next" }; } }, "fixture");
  assert.deepEqual(await store.listObjects({ prefix, continuationToken: "previous" }), { keys: [`${prefix}a`], nextToken: "next" });
  assert.equal(calls[0].constructor.name, "ListObjectsV2Command");
  assert.deepEqual(calls[0].input, { Bucket: "fixture", Prefix: prefix, MaxKeys: 1000, ContinuationToken: "previous" });
  await assert.rejects(store.listObjects({ prefix: "owners/" }), /prefix/);
  const broken = createObjectStore({ send: async () => ({ Contents: "invalid" }) }, "fixture");
  await assert.rejects(broken.listObjects({ prefix }), /response/);
});

test("retention never deletes on incomplete listing and never marks a failed delete as cleaned", async () => {
  const job = { id: "job", ownerId: owner, inputObjectKey: `${root}inputs/source`, outputPrefix: prefix, artifacts: [] };
  for (const failure of ["listing", "foreign-key", "delete", "wrong-job"]) {
    let deleted = 0, marked = 0;
    const repository = { async expireDueJobs() { return []; }, async listRetentionCandidates() { return [{ ...job, ...(failure === "wrong-job" ? { outputPrefix: `${root}jobs/other/` } : {}) }]; }, async markRetentionCleaned() { marked++; } };
    const objectStore = { async listObjects() {
      if (failure === "listing") throw new Error("listing failed");
      return { keys: [failure === "foreign-key" ? `${root}jobs/other/a` : `${prefix}orphan`], nextToken: null };
    }, async deleteObject() { deleted++; throw new Error("delete failed"); } };
    await assert.rejects(runTeamRetention({ repository, objectStore, actorId: "fixture", retentionDays: 1 }));
    assert.equal(marked, 0);
    assert.equal(deleted, failure === "delete" ? 1 : 0);
  }
});
