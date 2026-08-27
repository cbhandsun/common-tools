"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");
const { createProjectAuditArchiveHandler, extractProjectArchive } = require("../packages/project-audit-core/team-worker");
const { workerSettings } = require("../packages/remote-mcp-server/bin/common-tools-team-worker");

function field(buffer, offset, length, value) { buffer.write(value.slice(0, length), offset, length, "utf8"); }
function tarEntry(name, content, type = "0") {
  const body = Buffer.from(content);
  const header = Buffer.alloc(512);
  field(header, 0, 100, name);
  field(header, 100, 8, "0000600\0");
  field(header, 124, 12, `${body.length.toString(8).padStart(11, "0")}\0`);
  field(header, 156, 1, type);
  field(header, 257, 6, "ustar\0");
  const padding = Buffer.alloc((512 - (body.length % 512)) % 512);
  return Buffer.concat([header, body, padding]);
}
function archive(entries) { return zlib.gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)])); }
function paxRecord(key, value) {
  let record = `0 ${key}=${value}\n`;
  while (true) {
    const next = `${Buffer.byteLength(record, "utf8")} ${key}=${value}\n`;
    if (next === record) return Buffer.from(record, "utf8");
    record = next;
  }
}
function paxEntry(records) { return tarEntry("PaxHeader", Buffer.concat(records.map(([key, value]) => paxRecord(key, value))), "x"); }

test("project audit worker safely extracts a tar.gz input and uploads redacted reports", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-audit-"));
  const input = archive([tarEntry("package.json", '{"name":"fixture"}'), tarEntry("test/sample.test.js", "test('ok', () => {})")]);
  const uploads = new Map();
  const handler = createProjectAuditArchiveHandler({
    temporaryRoot,
    objectStore: {
      readObject: async ({ maxBytes }) => { assert.equal(maxBytes, 100 * 1024 * 1024); return input; },
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "project-audit", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-1/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts.length, 2);
    const report = JSON.parse(uploads.get("owners/a/jobs/job-1/project-audit-report.json").body.toString("utf8"));
    assert.equal(report.root, "uploaded-project");
    assert.equal(report.summary.scannedFiles, 2);
    assert.equal(fs.readdirSync(temporaryRoot).length, 0);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("project audit archive extractor rejects traversal and link entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-audit-extract-"));
  try {
    assert.throws(() => extractProjectArchive(archive([tarEntry("../escape.txt", "no")]), root), /unsafe path/);
    assert.throws(() => extractProjectArchive(archive([tarEntry("link", "", "2")]), root), /unsupported entry type/);
    assert.equal(fs.existsSync(path.join(path.dirname(root), "escape.txt")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("project audit archive extractor accepts a bounded PAX path and still rejects unsafe PAX paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-audit-pax-"));
  try {
    const longPath = `${"nested/".repeat(24)}package.json`;
    const extracted = extractProjectArchive(archive([paxEntry([["path", longPath], ["mtime", "1700000000.123"]]), tarEntry("ignored", '{"name":"fixture"}')]), root);
    assert.equal(extracted.files, 1);
    assert.equal(fs.readFileSync(path.join(root, ...longPath.split("/")), "utf8"), '{"name":"fixture"}');
    assert.throws(() => extractProjectArchive(archive([paxEntry([["path", "../escape.txt"]]), tarEntry("ignored", "no")]), root), /unsafe path/);
    assert.equal(fs.existsSync(path.join(path.dirname(root), "escape.txt")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("project audit worker ignores nested local-agent worktrees before touching their long paths", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "common-tools-team-audit-ignore-"));
  const ignoredPath = `project/.claude/worktrees/${"x/".repeat(1300)}generated.txt`;
  const input = archive([paxEntry([["path", ignoredPath]]), tarEntry("ignored", "not-audited"), tarEntry("project/package.json", '{"name":"fixture"}')]);
  const uploads = new Map();
  const handler = createProjectAuditArchiveHandler({
    temporaryRoot,
    objectStore: {
      readObject: async () => input,
      putObject: async ({ objectKey, body, contentType }) => uploads.set(objectKey, { body, contentType })
    }
  });
  try {
    const output = await handler({ job: { capability: "project-audit", inputObjectKey: "owners/a/inputs/source.tar.gz", outputPrefix: "owners/a/jobs/job-2/" }, isCancellationRequested: async () => false });
    assert.equal(output.artifacts.length, 2);
    const report = JSON.parse(uploads.get("owners/a/jobs/job-2/project-audit-report.json").body.toString("utf8"));
    assert.equal(report.summary.scannedFiles, 1);
  } finally { fs.rmSync(temporaryRoot, { recursive: true, force: true }); }
});

test("team worker configuration restricts its enabled capability surface", () => {
  assert.equal(workerSettings({}).capabilities.has("project-audit"), true);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_CAPABILITIES: "image-to-editable" }), /only project-audit/);
  assert.throws(() => workerSettings({ COMMON_TOOLS_WORKER_POLL_SECONDS: "0" }), /between 1 and 60/);
});
