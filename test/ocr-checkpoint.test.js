"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { ownerPrefix } = require("../packages/team-runtime/job-input");
const { attemptOutputPrefix } = require("../packages/team-runtime/worker-lease");
const modulePath = require.resolve("../packages/slideclone-core/ocr-checkpoint");
const { createOcrCheckpoint } = require(modulePath);

test("OCR checkpoint handles short filesystem reads within its fixed allocation", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore();
  const originalRead = fs.readSync;
  t.mock.method(fs, "readSync", (descriptor, buffer, offset, length, position) => originalRead(descriptor, buffer, offset, Math.min(length, 2), position));
  const result = await createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE })({ job, source, runOcr: async () => OCR, isCancellationRequested: async () => false });
  assert.deepEqual(result, OCR);
  assert.equal(store.writes.length, 1);
});

const PROFILE = "a".repeat(64);
const OCR = Object.freeze({ lines: Object.freeze([{ text: "Approved text", confidence: 0.9, box: Object.freeze({ x: 1, y: 2, w: 20, h: 12 }) }]) });

/** @returns {{objects: Map<string, Buffer>, reads: Array<{objectKey: string, maxBytes: number}>, writes: Array<{objectKey: string, body: Buffer, contentType: string}>, readObject: (input: {objectKey: string, maxBytes: number}) => Promise<Buffer>, putObject: (input: {objectKey: string, body: Buffer, contentType: string}) => Promise<void>}} */
function memoryStore() {
  const objects = new Map(); const reads = []; const writes = [];
  return {
    objects, reads, writes,
    async readObject(input) {
      reads.push(input);
      const body = objects.get(input.objectKey);
      if (!body) { const error = new Error("absent"); error.name = "NoSuchKey"; throw error; }
      return Buffer.from(body);
    },
    async putObject(input) { writes.push(input); objects.set(input.objectKey, Buffer.from(input.body)); }
  };
}

/** @param {import("node:test").TestContext} t */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-checkpoint-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const inputFile = path.join(root, "source.png");
  fs.writeFileSync(inputFile, "source-image-bytes", { mode: 0o600 });
  const ownerId = "fixture-owner";
  const id = "job-fixture";
  const prefix = ownerPrefix(ownerId);
  return {
    inputFile,
    source: { inputFile, assetPath: "assets/source.png", dimensions: { widthPx: 100, heightPx: 100 }, pageIndex: 0 },
    job: { ownerId, id, inputObjectKey: `${prefix}inputs/source.tar.gz`, outputPrefix: `${prefix}jobs/${id}/` }
  };
}

/** @param {readonly boolean[]} results */
function cancellation(results) {
  let index = 0;
  return async () => results[index++] === true;
}

test("OCR checkpoint persists a canonical bounded result across fresh module instances without changing the source", async (t) => {
  const { job, source, inputFile } = fixture(t); const store = memoryStore(); let runs = 0;
  const original = fs.readFileSync(inputFile);
  const first = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  assert.deepEqual(await first({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false }), OCR);
  assert.equal(runs, 1); assert.equal(store.writes.length, 1);
  const key = store.writes[0].objectKey;
  assert.match(key, new RegExp(`^${job.outputPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.internal/ocr/[a-f0-9]{64}\\.json$`));
  assert.equal(store.writes[0].contentType, "application/json");
  assert.equal(store.writes[0].body.length <= 1024 * 1024, true);
  assert.deepEqual(fs.readFileSync(inputFile), original);
  assert.equal(store.writes[0].body.toString("utf8").includes(job.ownerId), false);

  delete require.cache[modulePath];
  const freshModule = require(modulePath);
  assert.deepEqual(await freshModule.createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE })({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false }), OCR);
  assert.equal(runs, 1);
});

test("OCR checkpoint never crosses a job, source bytes, profile, dimensions, or page boundary", async (t) => {
  const { job, source, inputFile } = fixture(t); const store = memoryStore(); let runs = 0;
  const invoke = (checkpoint, currentJob = job, currentSource = source) => checkpoint({ job: currentJob, source: currentSource, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false });
  const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  await invoke(checkpoint);
  const otherId = "job-other"; const prefix = ownerPrefix(job.ownerId);
  await invoke(checkpoint, { ...job, id: otherId, outputPrefix: `${prefix}jobs/${otherId}/` });
  fs.writeFileSync(inputFile, "different-source-image-bytes", { mode: 0o600 });
  await invoke(checkpoint);
  await invoke(createOcrCheckpoint({ objectStore: store, profileFingerprint: "b".repeat(64) }));
  await invoke(checkpoint, job, { ...source, dimensions: { widthPx: 101, heightPx: 100 } });
  await invoke(checkpoint, job, { ...source, pageIndex: 1 });
  assert.equal(runs, 6);
  assert.equal(store.objects.size, 6);
});

test("OCR checkpoint uses the stable job root across verified worker attempts", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); let runs = 0;
  const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  const firstAttempt = { ...job, attempt: 1, outputPrefix: attemptOutputPrefix(job.outputPrefix, 1) };
  const secondAttempt = { ...job, attempt: 2, outputPrefix: attemptOutputPrefix(job.outputPrefix, 2) };
  await checkpoint({ job: firstAttempt, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false });
  await checkpoint({ job: secondAttempt, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false });
  assert.equal(runs, 1);
  assert.match(store.writes[0].objectKey, new RegExp(`^${job.outputPrefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.internal/ocr/`));
  await assert.rejects(checkpoint({ job: { ...job, attempt: 1, outputPrefix: `${job.outputPrefix}attempts/2/` }, source, runOcr: async () => OCR, isCancellationRequested: async () => false }), /ownership/);
});

test("OCR checkpoint treats only NoSuchKey as a cache miss and propagates object-store failures", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); let runs = 0;
  const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  await checkpoint({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false });
  assert.equal(runs, 1);
  const denied = { ...store, async readObject() { const error = new Error("PermissionDenied"); error.name = "PermissionDenied"; throw error; } };
  await assert.rejects(createOcrCheckpoint({ objectStore: denied, profileFingerprint: PROFILE })({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: async () => false }), /PermissionDenied/);
  const network = { ...store, async readObject() { throw new Error("network failure"); } };
  await assert.rejects(createOcrCheckpoint({ objectStore: network, profileFingerprint: PROFILE })({ job, source, runOcr: async () => OCR, isCancellationRequested: async () => false }), /network failure/);
  const notFound = { ...store, async readObject() { const error = new Error("not found"); error.name = "NotFound"; throw error; } };
  await assert.rejects(createOcrCheckpoint({ objectStore: notFound, profileFingerprint: PROFILE })({ job, source, runOcr: async () => OCR, isCancellationRequested: async () => false }), /not found/);
});

test("OCR checkpoint fails closed for corrupt, oversized, and incorrectly bound cache documents", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  await checkpoint({ job, source, runOcr: async () => OCR, isCancellationRequested: async () => false });
  const key = store.writes[0].objectKey;
  for (const body of [Buffer.from("private-user-content"), Buffer.alloc(1024 * 1024 + 1), Buffer.from(JSON.stringify({ ...JSON.parse(store.objects.get(key).toString("utf8")), binding: { ...JSON.parse(store.objects.get(key).toString("utf8")).binding, jobId: "job-other" } }))]) {
    store.objects.set(key, body); let calls = 0;
    await assert.rejects(checkpoint({ job, source, runOcr: async () => { calls++; return OCR; }, isCancellationRequested: async () => false }), (error) => error instanceof Error && /OCR checkpoint cache/.test(error.message) && !error.message.includes("private-user-content"));
    assert.equal(calls, 0);
  }
});

test("OCR checkpoint does not publish invalid OCR or cache-write failures", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  await assert.rejects(checkpoint({ job, source, runOcr: async () => ({ lines: [{ text: "bad", confidence: 2, box: { x: 0, y: 0, w: 1, h: 1 } }] }), isCancellationRequested: async () => false }), /OCR/);
  assert.equal(store.writes.length, 0);
  const writeFailure = { ...store, async putObject() { throw new Error("write failed"); } };
  await assert.rejects(createOcrCheckpoint({ objectStore: writeFailure, profileFingerprint: PROFILE })({ job, source, runOcr: async () => OCR, isCancellationRequested: async () => false }), /write failed/);
  assert.equal(store.objects.size, 0);
});

test("OCR checkpoint rejects a source that changes while OCR is running without publishing it", async (t) => {
  const { job, source, inputFile } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  await assert.rejects(checkpoint({
    job, source,
    runOcr: async () => { fs.writeFileSync(inputFile, "changed-during-ocr", { mode: 0o600 }); return OCR; },
    isCancellationRequested: async () => false
  }), /changed during recognition/);
  assert.equal(store.writes.length, 0);
});

test("OCR checkpoint canonicalizes an OCR confidence omitted by the production OCR validator", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  const result = await checkpoint({ job, source, runOcr: async () => ({ lines: [{ text: "default confidence", box: { x: 0, y: 0, w: 1, h: 1 } }] }), isCancellationRequested: async () => false });
  assert.deepEqual(result.lines[0], { text: "default confidence", confidence: 1, box: { x: 0, y: 0, w: 1, h: 1 } });
});

test("OCR checkpoint rejects cancellation before reading, after recognition, before writing, and after writing", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  let runs = 0;
  await assert.rejects(checkpoint({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: cancellation([true]) }), /cancelled/);
  assert.equal(store.reads.length, 0); assert.equal(runs, 0);
  await assert.rejects(checkpoint({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: cancellation([false, false, true]) }), /cancelled/);
  assert.equal(store.writes.length, 0);
  await assert.rejects(checkpoint({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: cancellation([false, false, false, true]) }), /cancelled/);
  assert.equal(store.writes.length, 0);
  await assert.rejects(checkpoint({ job, source, runOcr: async () => { runs++; return OCR; }, isCancellationRequested: cancellation([false, false, false, false, true]) }), /cancelled/);
  assert.equal(store.writes.length, 1); assert.equal(runs, 3);
});

test("OCR checkpoint bounds local source files and rejects unsafe job/source input without exposing it", async (t) => {
  const { job, source } = fixture(t); const store = memoryStore(); const checkpoint = createOcrCheckpoint({ objectStore: store, profileFingerprint: PROFILE });
  const directory = path.dirname(source.inputFile);
  await assert.rejects(checkpoint({ job, source: { ...source, inputFile: directory }, runOcr: async () => OCR, isCancellationRequested: async () => false }), /source file/);
  const tooLarge = path.join(directory, "oversized.png"); fs.writeFileSync(tooLarge, Buffer.alloc(1)); fs.truncateSync(tooLarge, 60 * 1024 * 1024 + 1);
  await assert.rejects(checkpoint({ job, source: { ...source, inputFile: tooLarge }, runOcr: async () => OCR, isCancellationRequested: async () => false }), /source file/);
  const secret = "private-owner-or-path";
  await assert.rejects(checkpoint({ job: { ...job, ownerId: secret }, source, runOcr: async () => OCR, isCancellationRequested: async () => false }), (error) => error instanceof Error && !error.message.includes(secret));
  await assert.rejects(checkpoint({ job, source: { ...source, inputFile: "relative/source.png" }, runOcr: async () => OCR, isCancellationRequested: async () => false }), /source is invalid/);
  await assert.rejects(checkpoint({ job, source: { ...source, assetPath: "../private-source.png" }, runOcr: async () => OCR, isCancellationRequested: async () => false }), /source is invalid/);
});

test("OCR checkpoint creation validates its immutable profile and object-store boundary", () => {
  assert.throws(() => createOcrCheckpoint({ objectStore: memoryStore(), profileFingerprint: "a".repeat(63) }), /profile/);
  assert.throws(() => createOcrCheckpoint({ objectStore: {}, profileFingerprint: PROFILE }), /object store/);
  assert.throws(() => createOcrCheckpoint(null), /input/);
});
