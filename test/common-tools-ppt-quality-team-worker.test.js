"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { crc32 } = require("../packages/ppt-quality-core");
const { createPptQualityHandler } = require("../packages/ppt-quality-core/team-worker");
const { workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-ppt-quality-worker");

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

function fixture() {
  return storedZip([
    ["[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'],
    ["ppt/presentation.xml", '<p:presentation xmlns:p="urn:p"/>'],
    ["ppt/slides/slide1.xml", '<p:sld xmlns:p="urn:p"><p:sp/></p:sld>'],
    ["ppt/media/orphan.png", "not-used"]
  ]);
}

test("team PPT quality worker audits a bounded PPTX and uploads only report artifacts", async () => {
  const writes = [];
  const handler = createPptQualityHandler({ objectStore: { async readObject({ maxBytes }) { assert.equal(maxBytes, 100 * 1024 * 1024); return fixture(); }, async putObject(value) { writes.push(value); } } });
  const result = await handler({ job: { capability: "ppt-quality", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false });
  assert.deepEqual(result.artifacts.map((artifact) => artifact.name), ["ppt-quality-report.json", "ppt-quality-report.md"]);
  assert.equal(result.quality.metrics["unused-media-count"], 1);
  assert.deepEqual(writes.map((item) => item.objectKey), ["owners/hash/jobs/job/ppt-quality-report.json", "owners/hash/jobs/job/ppt-quality-report.md"]);
  const report = JSON.parse(writes[0].body.toString("utf8"));
  assert.equal(report.source.path, undefined);
  assert.equal(report.summary.unusedMediaCount, 1);
});

test("team PPT quality worker rejects malformed input and restrictive worker settings", async () => {
  const handler = createPptQualityHandler({ objectStore: { async readObject() { return Buffer.from("not-a-pptx"); }, async putObject() { throw new Error("must not upload"); } } });
  await assert.rejects(() => handler({ job: { capability: "ppt-quality", inputObjectKey: "owners/hash/inputs/deck.pptx", outputPrefix: "owners/hash/jobs/job/" }, isCancellationRequested: async () => false }), /PPT quality input/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "project-audit" }), /only ppt-quality/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_POLL_SECONDS: "0" }), /POLL_SECONDS/);
  assert.equal(workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "ppt-quality", COMMON_TOOLS_WORKER_ID: "ppt-worker-1" }).workerId, "ppt-worker-1");
});
