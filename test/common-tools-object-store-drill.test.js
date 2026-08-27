"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { copySource, runObjectStoreRestoreDrill } = require("../packages/team-runtime/object-store-drill");

test("object-store restore drill copies through a separate bucket, verifies bytes, and cleans up", async () => {
  const commands = [];
  const content = Buffer.from("restore-check");
  const client = { send: async (command) => {
    commands.push(command);
    if (command.constructor.name === "GetObjectCommand") return { Body: (async function* () { yield content; })() };
    return {};
  } };
  const result = await runObjectStoreRestoreDrill({ client, sourceBucket: "ct-dr-source-00000000000000000000000000000000", backupBucket: "ct-dr-backup-00000000000000000000000000000000", content });
  assert.match(result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(commands.filter((command) => command.constructor.name === "CreateBucketCommand").length, 2);
  assert.equal(commands.filter((command) => command.constructor.name === "CopyObjectCommand").length, 2);
  assert.equal(commands.filter((command) => command.constructor.name === "DeleteBucketCommand").length, 2);
  assert.equal(copySource("ct-dr-source-00000000000000000000000000000000", "nested/a b.bin"), "/ct-dr-source-00000000000000000000000000000000/nested/a%20b.bin");
});

test("object-store restore drill rejects unsafe bucket names before making calls", async () => {
  const client = { send: async () => assert.fail("must not call object storage") };
  await assert.rejects(() => runObjectStoreRestoreDrill({ client, sourceBucket: "bad_bucket", backupBucket: "ct-dr-backup-00000000000000000000000000000000", content: Buffer.from("x") }), /source bucket/);
});

test("object-store restore drill fails closed when an isolated cleanup action fails", async () => {
  const content = Buffer.from("restore-check");
  const client = { send: async (command) => {
    if (command.constructor.name === "GetObjectCommand") return { Body: (async function* () { yield content; })() };
    if (command.constructor.name === "DeleteBucketCommand") throw new Error("cleanup failed");
    return {};
  } };
  await assert.rejects(
    () => runObjectStoreRestoreDrill({ client, sourceBucket: "ct-dr-source-00000000000000000000000000000000", backupBucket: "ct-dr-backup-00000000000000000000000000000000", content }),
    /cleanup failed/
  );
});
