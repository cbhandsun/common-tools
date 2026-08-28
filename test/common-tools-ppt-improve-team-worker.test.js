"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { crc32 } = require("../packages/ppt-quality-core");
const { createPptImproveHandler } = require("../packages/ppt-improve-core/team-worker");
const { workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-improve-worker");

function storedZip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const nameBytes = Buffer.from(name);
    const content = Buffer.from(text);
    const checksum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(content.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const localEntry = Buffer.concat([local, nameBytes, content]);
    locals.push(localEntry);
    const record = Buffer.alloc(46);
    record.writeUInt32LE(0x02014b50, 0);
    record.writeUInt16LE(20, 4);
    record.writeUInt16LE(20, 6);
    record.writeUInt32LE(checksum, 16);
    record.writeUInt32LE(content.length, 20);
    record.writeUInt32LE(content.length, 24);
    record.writeUInt16LE(nameBytes.length, 28);
    record.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([record, nameBytes]));
    offset += localEntry.length;
  }
  const directory = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, eocd]);
}

function fixture({ orphaned = true } = {}) {
  return storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:sp/></p:sld>'],
    ...(orphaned ? [["ppt/media/orphan.png", "not-used"]] : [])
  ]);
}

test("team PPT improvement produces an initial audit, a safe improved copy, and a post-audit", async () => {
  const writes = [];
  const handler = createPptImproveHandler({ objectStore: { async readObject({ maxBytes }) { assert.equal(maxBytes, 100 * 1024 * 1024); return fixture(); }, async putObject(value) { writes.push(value); } } });
  const result = await handler({ job: { capability: "ppt-improve", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false });
  assert.deepEqual(result.artifacts.map((artifact) => artifact.name), ["ppt-quality-report.json", "ppt-quality-report.md", "improved.pptx", "improved-ppt-quality-report.json", "improved-ppt-quality-report.md", "ppt-improve-report.json", "ppt-improve-report.md"]);
  assert.equal(result.quality.passed, true);
  assert.equal(result.quality.metrics["removed-media-count"], 1);
  assert.equal(result.quality.metrics.changed, 1);
  assert.deepEqual(writes.map((item) => item.objectKey), result.artifacts.map((item) => item.objectKey));
  const initial = JSON.parse(writes[0].body.toString("utf8"));
  const postAudit = JSON.parse(writes[3].body.toString("utf8"));
  const improvement = JSON.parse(writes[5].body.toString("utf8"));
  assert.equal(initial.summary.unusedMediaCount, 1);
  assert.equal(postAudit.summary.unusedMediaCount, 0);
  assert.deepEqual(improvement.result, { changed: true, eligibleUnusedMediaCount: 1, removedMediaCount: 1 }); assert.equal(improvement.repairProfile, "safe-package");
  assert.equal(improvement.source.path, undefined);
});

test("team PPT improvement audit-only profile reports eligible repairs without mutating", async () => {
  const writes = []; const handler = createPptImproveHandler({ objectStore: { async readObject() { return fixture(); }, async putObject(value) { writes.push(value); } } });
  const result = await handler({ job: { capability: "ppt-improve", options: { repairProfile: "audit-only" }, inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false });
  assert.equal(result.artifacts.some((artifact) => artifact.name === "improved.pptx"), false); const report = JSON.parse(writes.at(-2).body.toString("utf8")); assert.equal(report.repairProfile, "audit-only"); assert.deepEqual(report.result, { changed: false, eligibleUnusedMediaCount: 1, removedMediaCount: 0 });
});

test("team PPT improvement does not copy a clean source and rejects invalid inputs, cancellation, and settings", async () => {
  const writes = [];
  const handler = createPptImproveHandler({ objectStore: { async readObject() { return fixture({ orphaned: false }); }, async putObject(value) { writes.push(value); } } });
  const result = await handler({ job: { capability: "ppt-improve", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false });
  assert.deepEqual(result.artifacts.map((artifact) => artifact.name), ["ppt-quality-report.json", "ppt-quality-report.md", "ppt-improve-report.json", "ppt-improve-report.md"]);
  assert.equal(result.quality.metrics.changed, 0);
  assert.equal(writes.some((item) => item.objectKey.endsWith("improved.pptx")), false);
  const malformed = createPptImproveHandler({ objectStore: { async readObject() { return Buffer.from("not-a-pptx"); }, async putObject() { throw new Error("must not upload"); } } });
  await assert.rejects(() => malformed({ job: { capability: "ppt-improve", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false }), /PPT improvement input/);
  await assert.rejects(() => handler({ job: { capability: "ppt-improve", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => true }), /cancelled/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-quality" }), /only ppt-improve/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_POLL_SECONDS: "0" }), /POLL_SECONDS/);
  assert.equal(workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-improve", COMMON_TOOLS_WORKER_ID: "ppt-improve-1" }).workerId, "ppt-improve-1");
});
